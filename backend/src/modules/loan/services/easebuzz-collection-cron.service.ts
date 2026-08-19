import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { EasebuzzAutocollectService } from '../../../integrations/easebuzz-autocollect.service';
import { LoanService } from '../loan.service';
import { Prisma, PlMandateStatus, PlMandateType, PlLoanStatus } from '@prisma/client';

@Injectable()
export class EasebuzzCollectionCronService {
  private readonly logger = new Logger(EasebuzzCollectionCronService.name);
  private isEnachRunning = false;
  private isUpiRunning = false;
  private isReconciliationRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly easebuzzAutocollectService: EasebuzzAutocollectService,
    private readonly loanService: LoanService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Helper to format current IST date as YYYY-MM-DD
   */
  private getIstDateString(date: Date = new Date()): string {
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }

  /**
   * Generates unique merchant_request_number <= 40 chars
   * Pattern: EB_<LAN>_<RPSID>_<ATTEMPT>
   */
  public generateMerchantRequestNumber(lan: string, rpsId: bigint | number, attempt: number): string {
    const cleanLan = String(lan || '').replace(/[^a-zA-Z0-9]/g, '');
    const candidate = `EB_${cleanLan}_${rpsId}_${attempt}`;
    if (candidate.length <= 40) return candidate;
    
    // Truncate LAN if needed to fit 40 chars
    const maxLanLen = 40 - (3 + 1 + String(rpsId).length + 1 + String(attempt).length);
    const truncLan = cleanLan.slice(-Math.max(1, maxLanLen));
    return `EB_${truncLan}_${rpsId}_${attempt}`;
  }

  /**
   * eNACH Collection Cron
   * Scheduled at 06:00 AM IST (Same-day presentment before 07:00 AM cutoff)
   */
  @Cron('0 6 * * *', { timeZone: 'Asia/Kolkata' })
  async runDueEnachCollections(): Promise<{ processed: number; success: number; unknown: number; failed: number }> {
    const enabled = this.configService.get<string>('EASEBUZZ_COLLECTION_CRON_ENABLED') !== 'false';
    if (!enabled) {
      this.logger.log('Easebuzz collection cron is disabled by configuration.');
      return { processed: 0, success: 0, unknown: 0, failed: 0 };
    }

    if (this.isEnachRunning) {
      this.logger.warn('Previous runDueEnachCollections execution is still in progress. Skipping overlap.');
      return { processed: 0, success: 0, unknown: 0, failed: 0 };
    }

    this.isEnachRunning = true;
    let processed = 0;
    let success = 0;
    let unknown = 0;
    let failed = 0;

    try {
      const todayStr = this.getIstDateString();
      const todayDate = new Date(todayStr);

      this.logger.log(`Starting eNACH collection cron for due date <= ${todayStr}`);

      // Query eligible due installments
      const dueInstallments: any[] = await this.prisma.plRepaymentSchedule.findMany({
        where: {
          dueDate: { lte: todayDate },
          remainingAmount: { gt: new Prisma.Decimal(0) },
          paymentStatus: { not: 'PAID' },
          loan: {
            status: { in: [PlLoanStatus.DISBURSED] },
            disbursalStatus: 'DISBURSED',
          },
        },
        include: {
          loan: {
            include: {
              mandates: {
                where: {
                  status: { in: [PlMandateStatus.AUTHORIZED, PlMandateStatus.COMPLETED] },
                  mandateType: PlMandateType.ENACH,
                },
                orderBy: { id: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      });

      this.logger.log(`Found ${dueInstallments.length} candidate due installments for eNACH debit.`);

      const maxAttempts = Number(this.configService.get<string>('EASEBUZZ_MAX_DEBIT_ATTEMPTS') || '3');

      for (const rps of dueInstallments) {
        const mandate = rps.loan?.mandates?.[0];
        if (!mandate) {
          continue;
        }

        // Check existing debit requests for this installment
        const existingDebits = await this.prisma.easebuzzDebitRequest.findMany({
          where: { rpsId: rps.id },
          orderBy: { attemptNumber: 'desc' },
        });

        // Guard: Skip if already SUCCESS, IN_PROCESS, or UNKNOWN
        const activeOrSuccessDebit = existingDebits.find((d) =>
          ['SUCCESS', 'IN_PROCESS', 'UNKNOWN', 'SUBMITTING'].includes(d.status),
        );
        if (activeOrSuccessDebit) {
          this.logger.log(`RPS #${rps.id} (LAN ${rps.lan}) has active/unresolved debit [${activeOrSuccessDebit.merchantRequestNumber}, Status: ${activeOrSuccessDebit.status}]. Skipping.`);
          continue;
        }

        if (existingDebits.length >= maxAttempts) {
          this.logger.warn(`RPS #${rps.id} (LAN ${rps.lan}) reached max debit attempts (${existingDebits.length}/${maxAttempts}). Skipping.`);
          continue;
        }

        const attemptNumber = existingDebits.length + 1;
        const outstandingAmount = Number(rps.remainingAmount);
        const mandateLimit = Number(mandate.amount);
        const debitAmount = Math.min(outstandingAmount, mandateLimit);

        if (debitAmount <= 0) {
          continue;
        }

        // Verify mandate status before debit
        const mandateTxId = mandate.merchantTransactionId || mandate.providerMandateId || '';
        const mandateCheck = await this.easebuzzAutocollectService.getMandateStatus(mandateTxId);
        if (!mandateCheck.isActive) {
          this.logger.warn(`Mandate ${mandateTxId} for LAN ${rps.lan} is not active (${mandateCheck.status}). Skipping debit.`);
          continue;
        }

        const merchantReqNumber = this.generateMerchantRequestNumber(rps.lan, rps.id, attemptNumber);

        // Idempotent creation & atomic claim (CREATED -> SUBMITTING)
        const debitReq = await this.prisma.$transaction(async (tx) => {
          const existingMerchant = await tx.easebuzzDebitRequest.findUnique({
            where: { merchantRequestNumber: merchantReqNumber },
          });
          if (existingMerchant) return null;

          const created = await tx.easebuzzDebitRequest.create({
            data: {
              loanId: rps.loanId,
              applicationId: rps.loan.applicationId,
              lan: rps.lan,
              rpsId: rps.id,
              installmentNumber: rps.installmentNumber,
              mandateId: mandate.id,
              mandateTransactionId: mandateTxId,
              mandateType: PlMandateType.ENACH,
              merchantRequestNumber: merchantReqNumber,
              amount: new Prisma.Decimal(debitAmount),
              presentmentDate: new Date(todayStr),
              status: 'SUBMITTING',
              attemptNumber,
              source: 'CRON',
              initiatedAt: new Date(),
            },
          });
          return created;
        });

        if (!debitReq) {
          continue;
        }

        processed++;

        // Call Easebuzz eNACH Presentment API
        const res = await this.easebuzzAutocollectService.initiateEnachPresentment({
          transactionId: mandateTxId,
          amount: debitAmount,
          merchantRequestNumber: merchantReqNumber,
          presentmentDate: todayStr,
          udf1: rps.lan,
          udf2: rps.id.toString(),
          udf3: rps.installmentNumber.toString(),
          udf4: 'CRON',
        });

        if (res.success) {
          success++;
          await this.prisma.easebuzzDebitRequest.update({
            where: { id: debitReq.id },
            data: {
              status: 'IN_PROCESS',
              responseEncrypted: JSON.stringify(res.rawResponse || {}),
            },
          });
        } else if (res.isUnknown) {
          unknown++;
          await this.prisma.easebuzzDebitRequest.update({
            where: { id: debitReq.id },
            data: {
              status: 'UNKNOWN',
              failureReason: res.error || 'Network timeout or provider 5xx',
              responseEncrypted: JSON.stringify(res.rawResponse || {}),
            },
          });
        } else {
          failed++;
          await this.prisma.easebuzzDebitRequest.update({
            where: { id: debitReq.id },
            data: {
              status: 'FAILURE',
              failureReason: (res.error || 'Presentment rejected').slice(0, 500),
              completedAt: new Date(),
              responseEncrypted: JSON.stringify(res.rawResponse || {}),
            },
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`runDueEnachCollections exception: ${err?.message || err}`, err.stack);
    } finally {
      this.isEnachRunning = false;
    }

    return { processed, success, unknown, failed };
  }

  /**
   * UPI Pre-debit Notification Cron (D-1 at 01:00 AM IST)
   */
  @Cron('0 1 * * *', { timeZone: 'Asia/Kolkata' })
  async prepareDueUpiCollections(): Promise<{ processed: number; success: number }> {
    const enabled = this.configService.get<string>('EASEBUZZ_COLLECTION_CRON_ENABLED') !== 'false';
    if (!enabled) return { processed: 0, success: 0 };

    let processed = 0;
    let success = 0;

    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = this.getIstDateString(tomorrow);
      const tomorrowDate = new Date(tomorrowStr);

      const dueTomorrow: any[] = await this.prisma.plRepaymentSchedule.findMany({
        where: {
          dueDate: tomorrowDate,
          remainingAmount: { gt: new Prisma.Decimal(0) },
          paymentStatus: { not: 'PAID' },
          loan: { status: { in: [PlLoanStatus.DISBURSED] }, disbursalStatus: 'DISBURSED' },
        },
        include: {
          loan: {
            include: {
              mandates: {
                where: { status: { in: [PlMandateStatus.AUTHORIZED, PlMandateStatus.COMPLETED] }, mandateType: PlMandateType.UPI },
                orderBy: { id: 'desc' },
                take: 1,
              },
            },
          },
        },
      });

      for (const rps of dueTomorrow) {
        const mandate = rps.loan?.mandates?.[0];
        if (!mandate) continue;

        const mandateTxId = mandate.merchantTransactionId || mandate.providerMandateId || '';
        const merchantReqNumber = this.generateMerchantRequestNumber(rps.lan, rps.id, 1);
        const debitAmount = Math.min(Number(rps.remainingAmount), Number(mandate.amount));

        processed++;
        const res = await this.easebuzzAutocollectService.sendUpiPreDebitNotification({
          transactionId: mandateTxId,
          amount: debitAmount,
          merchantRequestNumber: merchantReqNumber,
          debitDate: tomorrowStr,
          udf1: rps.lan,
          udf2: rps.id.toString(),
          udf3: 'UPI_NOTIF',
        });

        if (res.success && res.notificationRequestNumber) {
          success++;
          await this.prisma.easebuzzDebitRequest.create({
            data: {
              loanId: rps.loanId,
              applicationId: rps.loan?.applicationId,
              lan: rps.lan,
              rpsId: rps.id,
              installmentNumber: rps.installmentNumber,
              mandateId: mandate.id,
              mandateTransactionId: mandateTxId,
              mandateType: PlMandateType.UPI,
              merchantRequestNumber: merchantReqNumber,
              notificationRequestNumber: res.notificationRequestNumber,
              amount: new Prisma.Decimal(debitAmount),
              presentmentDate: tomorrowDate,
              status: 'CREATED',
              attemptNumber: 1,
              source: 'CRON',
            },
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`prepareDueUpiCollections exception: ${err?.message || err}`);
    }

    return { processed, success };
  }

  /**
   * UPI / SI Debit Execution Cron (Run inside allowed NPCI hours e.g. 06:30 AM IST)
   */
  @Cron('30 6 * * *', { timeZone: 'Asia/Kolkata' })
  async runDueUpiOrSiExecutions(): Promise<{ processed: number; success: number; unknown: number; failed: number }> {
    const enabled = this.configService.get<string>('EASEBUZZ_COLLECTION_CRON_ENABLED') !== 'false';
    if (!enabled) return { processed: 0, success: 0, unknown: 0, failed: 0 };

    if (this.isUpiRunning) return { processed: 0, success: 0, unknown: 0, failed: 0 };
    this.isUpiRunning = true;

    let processed = 0;
    let success = 0;
    let unknown = 0;
    let failed = 0;

    try {
      const currentHour = new Date().getHours();
      // NPCI allowed hours check: 00:00-10:00, 13:00-17:00, 21:30-23:59
      const isAllowedWindow = (currentHour >= 0 && currentHour < 10) || (currentHour >= 13 && currentHour < 17) || (currentHour >= 21);
      if (!isAllowedWindow) {
        this.logger.log(`Current hour ${currentHour} is outside NPCI allowed UPI execution windows. Skipping.`);
        return { processed: 0, success: 0, unknown: 0, failed: 0 };
      }

      const todayStr = this.getIstDateString();
      const todayDate = new Date(todayStr);

      const pendingExecutions = await this.prisma.easebuzzDebitRequest.findMany({
        where: {
          presentmentDate: { lte: todayDate },
          status: 'CREATED',
          mandateType: { in: [PlMandateType.UPI, PlMandateType.SI] },
        },
        take: 50,
      });

      for (const req of pendingExecutions) {
        const claim = await this.prisma.easebuzzDebitRequest.updateMany({
          where: { id: req.id, status: 'CREATED' },
          data: { status: 'SUBMITTING', initiatedAt: new Date() },
        });

        if (claim.count === 0) continue;
        processed++;

        const res = await this.easebuzzAutocollectService.executeUpiOrSiDebit({
          transactionId: req.mandateTransactionId,
          amount: Number(req.amount),
          merchantRequestNumber: req.merchantRequestNumber,
          notificationRequestNumber: req.notificationRequestNumber || undefined,
          udf1: req.lan,
          udf2: req.rpsId.toString(),
        });

        if (res.success) {
          success++;
          await this.prisma.easebuzzDebitRequest.update({
            where: { id: req.id },
            data: { status: 'IN_PROCESS', responseEncrypted: JSON.stringify(res.rawResponse || {}) },
          });
        } else if (res.isUnknown) {
          unknown++;
          await this.prisma.easebuzzDebitRequest.update({
            where: { id: req.id },
            data: { status: 'UNKNOWN', failureReason: res.error || 'Network timeout or provider 5xx' },
          });
        } else {
          failed++;
          await this.prisma.easebuzzDebitRequest.update({
            where: { id: req.id },
            data: { status: 'FAILURE', failureReason: (res.error || 'Execute failed').slice(0, 500), completedAt: new Date() },
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`runDueUpiOrSiExecutions exception: ${err?.message || err}`);
    } finally {
      this.isUpiRunning = false;
    }

    return { processed, success, unknown, failed };
  }

  /**
   * Status Reconciliation Cron
   * Scheduled every 30 minutes to check pending IN_PROCESS and UNKNOWN debits
   */
  @Cron('*/30 * * * *', { timeZone: 'Asia/Kolkata' })
  async reconcilePendingDebits(): Promise<{ checked: number; resolvedSuccess: number; resolvedFailure: number; remaining: number }> {
    const enabled = this.configService.get<string>('EASEBUZZ_RECONCILIATION_CRON_ENABLED') !== 'false';
    if (!enabled) return { checked: 0, resolvedSuccess: 0, resolvedFailure: 0, remaining: 0 };

    if (this.isReconciliationRunning) return { checked: 0, resolvedSuccess: 0, resolvedFailure: 0, remaining: 0 };
    this.isReconciliationRunning = true;

    let checked = 0;
    let resolvedSuccess = 0;
    let resolvedFailure = 0;
    let remaining = 0;

    try {
      this.logger.log('Starting Easebuzz debit status reconciliation...');

      const pendingDebits = await this.prisma.easebuzzDebitRequest.findMany({
        where: { status: { in: ['IN_PROCESS', 'UNKNOWN'] } },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });

      checked = pendingDebits.length;

      for (const debitReq of pendingDebits) {
        const reqDate = debitReq.presentmentDate
          ? new Date(debitReq.presentmentDate).toISOString().slice(0, 10)
          : debitReq.createdAt
          ? new Date(debitReq.createdAt).toISOString().slice(0, 10)
          : undefined;

        const res = await this.easebuzzAutocollectService.getDebitRequests({
          merchantRequestNumber: debitReq.merchantRequestNumber,
          createdAt: reqDate,
        });

        if (!res.success || !res.data) {
          remaining++;
          continue;
        }

        const rawList = Array.isArray(res.data) ? res.data : (res.data.presentments || res.data.data || [res.data]);
        const matched = rawList.find(
          (item: any) =>
            String(item.merchant_request_number || item.merchant_request_no || '').trim() === debitReq.merchantRequestNumber,
        ) || rawList[0];

        if (!matched || typeof matched !== 'object') {
          remaining++;
          continue;
        }

        const rawStatus = String(
          matched.status || matched.status_at_bank || matched.transaction_status || '',
        ).toUpperCase();

        const pgTxId = matched.easebuzz_id || matched.easebuzz_request_id || matched.pg_transaction_id || matched.txnid || null;
        const bankRef = matched.bank_reference_number || matched.bank_ref_no || matched.umrn || null;

        if (['SUCCESS', 'PAID', 'SETTLED', 'COMPLETED'].includes(rawStatus)) {
          // Debit confirmed successful! Allocate repayment
          resolvedSuccess++;
          await this.prisma.$transaction(async (tx) => {
            await tx.easebuzzDebitRequest.update({
              where: { id: debitReq.id },
              data: {
                status: 'SUCCESS',
                statusAtBank: rawStatus,
                pgTransactionId: pgTxId ? String(pgTxId) : debitReq.pgTransactionId,
                bankReferenceNumber: bankRef ? String(bankRef) : debitReq.bankReferenceNumber,
                completedAt: new Date(),
              },
            });
          });

          // Trigger existing repayment allocation
          try {
            await this.loanService.processRepayment(debitReq.lan, {
              installmentNumber: debitReq.installmentNumber,
              amount: Number(debitReq.amount),
              paymentId: debitReq.merchantRequestNumber,
              paymentMode: 'EASEBUZZ',
              referenceNumber: bankRef ? String(bankRef) : (pgTxId ? String(pgTxId) : debitReq.merchantRequestNumber),
            });
            this.logger.log(`Successfully reconciled & allocated repayment for LAN ${debitReq.lan} RPS #${debitReq.installmentNumber}`);
          } catch (allocErr: any) {
            this.logger.error(`Repayment allocation error after SUCCESS reconciliation [LAN ${debitReq.lan}]: ${allocErr?.message || allocErr}`);
          }
        } else if (['FAILURE', 'FAILED', 'REJECTED', 'BOUNCED', 'CANCELLED', 'DROPPED'].includes(rawStatus)) {
          resolvedFailure++;
          await this.prisma.easebuzzDebitRequest.update({
            where: { id: debitReq.id },
            data: {
              status: 'FAILURE',
              statusAtBank: rawStatus,
              failureCode: matched.failure_code || matched.error_code || null,
              failureReason: (matched.failure_reason || matched.error_desc || rawStatus).slice(0, 500),
              completedAt: new Date(),
            },
          });
        } else {
          remaining++;
        }
      }
    } catch (err: any) {
      this.logger.error(`reconcilePendingDebits exception: ${err?.message || err}`);
    } finally {
      this.isReconciliationRunning = false;
    }

    return { checked, resolvedSuccess, resolvedFailure, remaining };
  }

  /**
   * Manual / Admin Retry Operation
   * Can be triggered by authorized internal admins for an outstanding installment
   */
  async retryDebit(rpsIdInput: string | bigint, source: 'MANUAL' | 'RETRY' = 'MANUAL') {
    const rpsId = BigInt(rpsIdInput);

    const rps: any = await this.prisma.plRepaymentSchedule.findUnique({
      where: { id: rpsId },
      include: {
        loan: {
          include: {
            mandates: {
              where: { status: { in: [PlMandateStatus.AUTHORIZED, PlMandateStatus.COMPLETED] } },
              orderBy: { id: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!rps) throw new NotFoundException(`Repayment schedule installment #${rpsId} not found.`);
    if (Number(rps.remainingAmount) <= 0 || rps.paymentStatus === 'PAID') {
      throw new BadRequestException(`Installment #${rps.installmentNumber} for LAN ${rps.lan} is already fully paid.`);
    }

    const mandate = rps.loan.mandates[0];
    if (!mandate) throw new BadRequestException(`No active authorized mandate found for LAN ${rps.lan}.`);

    // Check existing debit requests
    const existingDebits = await this.prisma.easebuzzDebitRequest.findMany({
      where: { rpsId },
      orderBy: { attemptNumber: 'desc' },
    });

    const activeDebit = existingDebits.find((d) => ['IN_PROCESS', 'UNKNOWN', 'SUBMITTING'].includes(d.status));
    if (activeDebit) {
      throw new BadRequestException(`Installment #${rps.installmentNumber} has an active/unresolved debit attempt (${activeDebit.merchantRequestNumber}, Status: ${activeDebit.status}). Reconcile status first.`);
    }

    const attemptNumber = existingDebits.length + 1;
    const debitAmount = Math.min(Number(rps.remainingAmount), Number(mandate.amount));
    const mandateTxId = mandate.merchantTransactionId || mandate.providerMandateId || '';

    // Verify mandate status
    const mandateCheck = await this.easebuzzAutocollectService.getMandateStatus(mandateTxId);
    if (!mandateCheck.isActive) {
      throw new BadRequestException(`Mandate ${mandateTxId} is not active (Status: ${mandateCheck.status}). Cannot initiate debit.`);
    }

    const merchantReqNumber = this.generateMerchantRequestNumber(rps.lan, rps.id, attemptNumber);
    const todayStr = this.getIstDateString();

    const debitReq = await this.prisma.easebuzzDebitRequest.create({
      data: {
        loanId: rps.loanId,
        applicationId: rps.loan.applicationId,
        lan: rps.lan,
        rpsId: rps.id,
        installmentNumber: rps.installmentNumber,
        mandateId: mandate.id,
        mandateTransactionId: mandateTxId,
        mandateType: mandate.mandateType,
        merchantRequestNumber: merchantReqNumber,
        amount: new Prisma.Decimal(debitAmount),
        presentmentDate: new Date(todayStr),
        status: 'SUBMITTING',
        attemptNumber,
        source,
        initiatedAt: new Date(),
      },
    });

    let res: any = null;
    if (mandate.mandateType === PlMandateType.ENACH) {
      res = await this.easebuzzAutocollectService.initiateEnachPresentment({
        transactionId: mandateTxId,
        amount: debitAmount,
        merchantRequestNumber: merchantReqNumber,
        presentmentDate: todayStr,
        udf1: rps.lan,
        udf2: rps.id.toString(),
        udf3: rps.installmentNumber.toString(),
        udf4: source,
      });
    } else {
      res = await this.easebuzzAutocollectService.executeUpiOrSiDebit({
        transactionId: mandateTxId,
        amount: debitAmount,
        merchantRequestNumber: merchantReqNumber,
        udf1: rps.lan,
        udf2: rps.id.toString(),
        udf3: rps.installmentNumber.toString(),
        udf4: source,
      });
    }

    let finalStatus = 'IN_PROCESS';
    if (res.success) {
      finalStatus = 'IN_PROCESS';
    } else if (res.isUnknown) {
      finalStatus = 'UNKNOWN';
    } else {
      finalStatus = 'FAILURE';
    }

    const updated = await this.prisma.easebuzzDebitRequest.update({
      where: { id: debitReq.id },
      data: {
        status: finalStatus,
        failureReason: res.error ? String(res.error).slice(0, 500) : null,
        completedAt: finalStatus === 'FAILURE' ? new Date() : null,
        responseEncrypted: JSON.stringify(res.rawResponse || {}),
      },
    });

    return {
      success: res.success || res.isUnknown,
      status: finalStatus,
      merchantRequestNumber: merchantReqNumber,
      amount: debitAmount,
      attemptNumber,
      debitRequestId: updated.id.toString(),
      message: res.success
        ? 'Debit request submitted successfully. Waiting for reconciliation.'
        : res.isUnknown
        ? 'Debit request status is UNKNOWN (network timeout/provider error). It will be resolved by reconciliation.'
        : `Debit request failed: ${res.error}`,
    };
  }
}
