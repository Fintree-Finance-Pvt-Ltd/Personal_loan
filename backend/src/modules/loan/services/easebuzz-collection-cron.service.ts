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
   * Extracts Easebuzz AutoCollect transaction ID (autocollect_details[0].txn_id)
   * for UPI presentment/notification.
   */
  public extractAutocollectTxnId(mandate: any, mandateCheck?: any): string | null {
    if (mandateCheck?.autocollectTxnId) {
      return mandateCheck.autocollectTxnId;
    }
    const checkDetails =
      mandateCheck?.data?.autocollect_details ||
      mandateCheck?.raw?.autocollect_details;
    if (Array.isArray(checkDetails) && checkDetails.length > 0 && checkDetails[0]?.txn_id) {
      return checkDetails[0].txn_id;
    }
    const checkTxnId =
      mandateCheck?.data?.transaction_id ||
      mandateCheck?.data?.id ||
      mandateCheck?.raw?.transaction_id ||
      mandateCheck?.raw?.id;
    if (checkTxnId) {
      return String(checkTxnId);
    }
    for (const jsonStr of [mandate?.providerResponseJson, mandate?.webhookResponseJson]) {
      if (jsonStr) {
        try {
          const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
          const details = parsed?.autocollect_details || parsed?.data?.autocollect_details;
          if (Array.isArray(details) && details.length > 0 && details[0]?.txn_id) {
            return details[0].txn_id;
          }
          const parsedTxId =
            parsed?.data?.transaction_id ||
            parsed?.transaction_id ||
            parsed?.data?.id ||
            parsed?.id;
          if (parsedTxId) {
            return String(parsedTxId);
          }
        } catch {}
      }
    }
    return mandate?.merchantTransactionId || mandate?.providerMandateId || null;
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
        this.logger.log(`[Batch Collection] Checking mandate status for LAN ${rps.lan}, Mandate ID: ${mandate.id}, TxID: "${mandateTxId}", DB Status: ${mandate.status}`);
        const mandateCheck = await this.easebuzzAutocollectService.getMandateStatus(mandateTxId);
        if (!mandateCheck.isActive) {
          this.logger.warn(`[Batch Collection] Mandate ${mandateTxId} for LAN ${rps.lan} is not active (Live: ${mandateCheck.status}, DB: ${mandate.status}). Skipping debit.`);
          continue;
        }

        const merchantReqNumber = this.generateMerchantRequestNumber(rps.lan, rps.id, attemptNumber);

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = this.getIstDateString(tomorrow);
        const rpsDueDateStr = rps.dueDate ? this.getIstDateString(new Date(rps.dueDate)) : tomorrowStr;
        const effectivePresentmentDateStr = rpsDueDateStr > todayStr ? rpsDueDateStr : tomorrowStr;

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
              presentmentDate: new Date(effectivePresentmentDateStr),
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
          presentmentDate: effectivePresentmentDateStr,
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
        let upiTxId = this.extractAutocollectTxnId(mandate);
        if (!upiTxId && mandateTxId) {
          const mCheck = await this.easebuzzAutocollectService.getMandateStatus(mandateTxId);
          upiTxId = mCheck?.autocollectTxnId || this.extractAutocollectTxnId(mandate, mCheck);
        }
        const effectiveTxId = upiTxId || mandateTxId;
        const merchantReqNumber = this.generateMerchantRequestNumber(rps.lan, rps.id, 1);
        const debitAmount = Math.min(Number(rps.remainingAmount), Number(mandate.amount));

        this.logger.log(`[UPI PRESENTMENT] Sending pre-debit notification - LAN: ${rps.lan}, Mandate TxID: ${effectiveTxId}, Merchant Req: ${merchantReqNumber}`);
        this.logger.log(`[UPI PRESENTMENT] schedule_presentment=true`);

        processed++;
        const res = await this.easebuzzAutocollectService.sendUpiPreDebitNotification({
          transactionId: effectiveTxId,
          amount: debitAmount,
          merchantRequestNumber: merchantReqNumber,
          debitDate: tomorrowStr,
          udf1: rps.lan,
          udf2: rps.id.toString(),
          udf3: 'UPI_NOTIF',
        });

        if (res.success && res.notificationRequestNumber) {
          success++;
          this.logger.log(`[UPI PRESENTMENT] Pre-debit notification sent successfully - LAN: ${rps.lan}, Mandate TxID: ${effectiveTxId}, Notif Req: ${res.notificationRequestNumber}, Merchant Req: ${merchantReqNumber}`);
          this.logger.log(`[UPI PRESENTMENT] Presentment scheduled with Easebuzz; skipping immediate execute - LAN: ${rps.lan}, Mandate TxID: ${effectiveTxId}, Notif Req: ${res.notificationRequestNumber}`);
          await this.prisma.easebuzzDebitRequest.create({
            data: {
              loanId: rps.loanId,
              applicationId: rps.loan?.applicationId,
              lan: rps.lan,
              rpsId: rps.id,
              installmentNumber: rps.installmentNumber,
              mandateId: mandate.id,
              mandateTransactionId: effectiveTxId,
              mandateType: PlMandateType.UPI,
              merchantRequestNumber: merchantReqNumber,
              notificationRequestNumber: res.notificationRequestNumber,
              amount: new Prisma.Decimal(debitAmount),
              presentmentDate: tomorrowDate,
              status: 'IN_PROCESS',
              attemptNumber: 1,
              source: 'CRON',
              responseEncrypted: JSON.stringify(res.rawResponse || res.data || {}),
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
        const todayStr = new Date().toISOString().slice(0, 10);
        let reqDate = debitReq.createdAt
          ? new Date(debitReq.createdAt).toISOString().slice(0, 10)
          : todayStr;
        if (reqDate > todayStr) {
          reqDate = todayStr;
        }

        const extractList = (data: any): any[] => {
          if (!data) return [];
          if (Array.isArray(data)) return data;
          if (Array.isArray(data.results)) return data.results;
          if (Array.isArray(data.presentments)) return data.presentments;
          if (Array.isArray(data.data)) return data.data;
          return typeof data === 'object' && !data.request_id ? [data] : [];
        };

        let res = await this.easebuzzAutocollectService.getDebitRequests({
          merchantRequestNumber: debitReq.merchantRequestNumber,
          createdAt: reqDate,
        });

        let rawList = extractList(res?.data);

        // Fallback 1: Query by notificationRequestNumber if empty results (scheduled UPI notifications use NT_...)
        if (rawList.length === 0 && debitReq.notificationRequestNumber) {
          const fallbackNotifRes = await this.easebuzzAutocollectService.getDebitRequests({
            notificationRequestNumber: debitReq.notificationRequestNumber,
            createdAt: reqDate,
          });
          rawList = extractList(fallbackNotifRes?.data);
        }

        // Fallback 2: Query by mandateId if still empty
        if (rawList.length === 0 && (debitReq.mandateId || debitReq.mandateTransactionId)) {
          const mandate = await this.prisma.plLoanMandate.findFirst({
            where: {
              OR: [
                ...(debitReq.mandateId ? [{ id: debitReq.mandateId }] : []),
                ...(debitReq.mandateTransactionId ? [{ merchantTransactionId: debitReq.mandateTransactionId }] : []),
              ],
            },
            select: { providerMandateId: true, merchantTransactionId: true },
          });
          const mId = mandate?.providerMandateId || mandate?.merchantTransactionId;
          if (mId) {
            const fallbackMandateRes = await this.easebuzzAutocollectService.getDebitRequests({
              mandateId: mId,
              createdAtStart: reqDate,
              createdAtEnd: todayStr,
            });
            rawList = extractList(fallbackMandateRes?.data);
          }
        }

        if (rawList.length === 0) {
          remaining++;
          continue;
        }

        const matched = rawList.find(
          (item: any) => {
            const mReq = String(item.merchant_request_number || item.merchant_request_no || '').trim();
            const notifReq = String(item.notification?.notification_request_number || item.notification_request_number || '').trim();
            return (
              (debitReq.merchantRequestNumber && mReq === debitReq.merchantRequestNumber) ||
              (debitReq.notificationRequestNumber && (mReq === debitReq.notificationRequestNumber || notifReq === debitReq.notificationRequestNumber)) ||
              (debitReq.easebuzzRequestId && String(item.id || '').trim() === debitReq.easebuzzRequestId)
            );
          },
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
   * Reconcile a single debit request record against Easebuzz Live API
   */
  public async reconcileSingleDebitRequest(debitReq: any): Promise<{
    status: string;
    resolved: boolean;
    rawStatus?: string;
    message?: string;
  }> {
    if (!debitReq) {
      return { status: 'UNKNOWN', resolved: false, message: 'Debit request record not found.' };
    }

    const reqDate = debitReq.presentmentDate
      ? new Date(debitReq.presentmentDate).toISOString().slice(0, 10)
      : debitReq.createdAt
        ? new Date(debitReq.createdAt).toISOString().slice(0, 10)
        : undefined;

    // 1. Query Presentments from Easebuzz
    const res = await this.easebuzzAutocollectService.getDebitRequests({
      merchantRequestNumber: debitReq.merchantRequestNumber,
      createdAt: reqDate,
    });

    let rawList: any[] = [];
    if (res.success && res.data) {
      if (Array.isArray(res.data)) {
        rawList = res.data;
      } else if (Array.isArray(res.data.results)) {
        rawList = res.data.results;
      } else if (Array.isArray(res.data.presentments)) {
        rawList = res.data.presentments;
      } else if (Array.isArray(res.data.data)) {
        rawList = res.data.data;
      } else if (typeof res.data === 'object') {
        rawList = [res.data];
      }
    }

    const matched = rawList.find(
      (item: any) =>
        String(item.merchant_request_number || item.merchant_request_no || '').trim() === debitReq.merchantRequestNumber,
    ) || (rawList.length > 0 && (rawList[0]?.status || rawList[0]?.status_at_bank) ? rawList[0] : null);

    if (matched && typeof matched === 'object') {
      const rawStatus = String(
        matched.status || matched.status_at_bank || matched.transaction_status || '',
      ).toUpperCase();

      const pgTxId = matched.easebuzz_id || matched.easebuzz_request_id || matched.pg_transaction_id || matched.txnid || null;
      const bankRef = matched.bank_reference_number || matched.bank_ref_no || matched.umrn || null;

      if (['SUCCESS', 'PAID', 'SETTLED', 'COMPLETED'].includes(rawStatus)) {
        await this.prisma.easebuzzDebitRequest.update({
          where: { id: debitReq.id },
          data: {
            status: 'SUCCESS',
            statusAtBank: rawStatus,
            pgTransactionId: pgTxId ? String(pgTxId) : debitReq.pgTransactionId,
            bankReferenceNumber: bankRef ? String(bankRef) : debitReq.bankReferenceNumber,
            completedAt: new Date(),
          },
        });

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

        return { status: 'SUCCESS', resolved: true, rawStatus, message: 'Debit successfully confirmed and repayment allocated.' };
      } else if (['FAILURE', 'FAILED', 'REJECTED', 'BOUNCED', 'CANCELLED', 'DROPPED'].includes(rawStatus)) {
        const failReason = matched.failure_reason || matched.error_desc || rawStatus;
        await this.prisma.easebuzzDebitRequest.update({
          where: { id: debitReq.id },
          data: {
            status: 'FAILURE',
            statusAtBank: rawStatus,
            failureCode: matched.failure_code || matched.error_code || null,
            failureReason: String(failReason).slice(0, 500),
            completedAt: new Date(),
          },
        });

        return { status: 'FAILURE', resolved: true, rawStatus, message: `Debit rejected at bank: ${failReason}` };
      }
    }

    // 2. If no presentment recorded on Easebuzz yet, but notificationRequestNumber exists, check notification status
    if (debitReq.notificationRequestNumber) {
      try {
        const notifCheck = await this.easebuzzAutocollectService.retrieveNotification(debitReq.notificationRequestNumber);
        if (notifCheck.success) {
          return {
            status: debitReq.status,
            resolved: false,
            message: `Pre-debit notification is active (${notifCheck.status || 'notified'}). Ready for presentment execution.`,
          };
        }
      } catch {
        // Notification check fallback
      }
    }

    return { status: debitReq.status, resolved: false, message: `Status is ${debitReq.status}. Awaiting bank confirmation.` };
  }

  /**
   * On-demand reconciliation for a specific Repayment Schedule Installment
   */
  async reconcileRpsDebit(rpsIdInput: string | bigint) {
    const rpsId = BigInt(rpsIdInput);
    const rps: any = await this.prisma.plRepaymentSchedule.findUnique({
      where: { id: rpsId },
    });

    if (!rps) throw new NotFoundException(`Repayment schedule installment #${rpsId} not found.`);

    const latestDebit = await this.prisma.easebuzzDebitRequest.findFirst({
      where: { rpsId },
      orderBy: { attemptNumber: 'desc' },
    });

    if (!latestDebit) {
      return {
        success: true,
        reconciled: false,
        status: 'NONE',
        message: 'No debit attempts found for this installment.',
      };
    }

    const result = await this.reconcileSingleDebitRequest(latestDebit);
    return {
      success: true,
      reconciled: result.resolved,
      status: result.status,
      rawStatus: result.rawStatus,
      message: result.message,
    };
  }

  /**
   * Manual / Admin Retry Operation
   * Can be triggered by authorized internal admins for an outstanding installment
   */
  /**
   * Dispatches UPI Pre-debit Notification to customer for a specific repayment schedule installment.
   */
  async sendPreDebitNotification(rpsIdInput: string | bigint) {
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

    const mandate = rps.loan?.mandates?.[0];
    if (!mandate) throw new BadRequestException(`No active authorized mandate found for LAN ${rps.lan}.`);

    if (mandate.mandateType === PlMandateType.ENACH) {
      return {
        success: true,
        status: 'NOT_REQUIRED',
        message: 'eNACH mandate does not require UPI pre-debit notification. You can execute mandate directly.',
      };
    }

    const mandateTxId = mandate.merchantTransactionId || mandate.providerMandateId || '';
    const mandateCheck = await this.easebuzzAutocollectService.getMandateStatus(mandateTxId);
    if (!mandateCheck.isActive) {
      throw new BadRequestException(`Mandate ${mandateTxId} is not active (Status: ${mandateCheck.status}).`);
    }

    const upiAutoCollectTxnId = this.extractAutocollectTxnId(mandate, mandateCheck);
    const effectiveUpiTxId = upiAutoCollectTxnId || mandateTxId;

    const existingDebits = await this.prisma.easebuzzDebitRequest.findMany({
      where: { rpsId },
      orderBy: { attemptNumber: 'desc' },
    });
    const activeDebit = existingDebits.find((d) => ['IN_PROCESS', 'UNKNOWN', 'SUBMITTING'].includes(d.status));
    const attemptNumber = activeDebit ? activeDebit.attemptNumber : (existingDebits.length + 1);
    const notifMerchantReq = `NT_${rps.lan}_${rps.id}_${attemptNumber}`;

    const debitAmount = Math.min(Number(rps.remainingAmount), Number(mandate.amount));
    const todayStr = this.getIstDateString();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = this.getIstDateString(tomorrow);
    const rpsDueDateStr = rps.dueDate ? this.getIstDateString(new Date(rps.dueDate)) : tomorrowStr;
    const effectivePresentmentDateStr = rpsDueDateStr > todayStr ? rpsDueDateStr : tomorrowStr;

    this.logger.log(`[sendPreDebitNotification] Dispatching notification for LAN: ${rps.lan}, Mandate TxID: ${effectiveUpiTxId}, Merchant Req: ${notifMerchantReq}`);

    const notifRes = await this.easebuzzAutocollectService.sendUpiPreDebitNotification({
      transactionId: effectiveUpiTxId,
      amount: debitAmount,
      merchantRequestNumber: notifMerchantReq,
      debitDate: effectivePresentmentDateStr,
      udf1: rps.lan,
      udf2: rps.id.toString(),
      udf3: rps.installmentNumber.toString(),
      udf4: 'MANUAL_NOTIF',
    });

    if (notifRes.success && notifRes.notificationRequestNumber) {
      const notifRequestNum = notifRes.notificationRequestNumber;
      let targetDebitReq = activeDebit;
      if (!targetDebitReq) {
        targetDebitReq = await this.prisma.easebuzzDebitRequest.create({
          data: {
            loanId: rps.loanId,
            applicationId: rps.loan.applicationId,
            lan: rps.lan,
            rpsId: rps.id,
            installmentNumber: rps.installmentNumber,
            mandateId: mandate.id,
            mandateTransactionId: effectiveUpiTxId,
            mandateType: mandate.mandateType,
            merchantRequestNumber: this.generateMerchantRequestNumber(rps.lan, rps.id, attemptNumber),
            notificationRequestNumber: notifRequestNum,
            amount: new Prisma.Decimal(debitAmount),
            presentmentDate: new Date(effectivePresentmentDateStr),
            status: 'IN_PROCESS',
            attemptNumber,
            source: 'MANUAL',
            initiatedAt: new Date(),
            failureReason: `Pre-debit notification active: ${notifRequestNum}`,
            responseEncrypted: JSON.stringify(notifRes.rawResponse || notifRes.data || {}),
          },
        });
      } else {
        await this.prisma.easebuzzDebitRequest.update({
          where: { id: targetDebitReq.id },
          data: {
            status: 'IN_PROCESS',
            notificationRequestNumber: notifRequestNum,
            mandateTransactionId: effectiveUpiTxId,
            failureReason: `Pre-debit notification active: ${notifRequestNum}`,
            responseEncrypted: JSON.stringify(notifRes.rawResponse || notifRes.data || {}),
          },
        });
      }

      return {
        success: true,
        status: 'IN_PROCESS',
        notificationRequestNumber: notifRequestNum,
        message: `Pre-debit notification sent successfully to customer (${notifRequestNum}). Customer has been notified.`,
      };
    } else {
      const notifError = notifRes.error || 'Pre-debit notification failed';
      return {
        success: false,
        status: 'FAILURE',
        message: `Failed to send pre-debit notification: ${notifError}`,
      };
    }
  }

  /**
   * Executes AutoCollect mandate debit (presentment) for a specific installment.
   * Requires that the customer has already been notified if UPI mandate.
   */
  async executeMandate(rpsIdInput: string | bigint, source: 'MANUAL' | 'RETRY' = 'MANUAL') {
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

    const mandate = rps.loan?.mandates?.[0];
    if (!mandate) throw new BadRequestException(`No active authorized mandate found for LAN ${rps.lan}.`);

    let existingDebits = await this.prisma.easebuzzDebitRequest.findMany({
      where: { rpsId },
      orderBy: { attemptNumber: 'desc' },
    });

    let activeDebit = existingDebits.find((d) => ['IN_PROCESS', 'UNKNOWN', 'SUBMITTING'].includes(d.status));

    // Auto-reconcile active debit before deciding
    if (activeDebit) {
      const recResult = await this.reconcileSingleDebitRequest(activeDebit);
      if (recResult.resolved && recResult.status === 'SUCCESS') {
        return {
          success: true,
          status: 'SUCCESS',
          message: 'Debit was already confirmed SUCCESS at bank! Repayment has been recorded.',
        };
      }
      existingDebits = await this.prisma.easebuzzDebitRequest.findMany({
        where: { rpsId },
        orderBy: { attemptNumber: 'desc' },
      });
      activeDebit = existingDebits.find((d) => ['IN_PROCESS', 'UNKNOWN', 'SUBMITTING'].includes(d.status));
    }

    const mandateTxId = mandate.merchantTransactionId || mandate.providerMandateId || '';
    const mandateCheck = await this.easebuzzAutocollectService.getMandateStatus(mandateTxId);
    if (!mandateCheck.isActive) {
      throw new BadRequestException(`Mandate ${mandateTxId} is not active (Status: ${mandateCheck.status}). Cannot execute mandate.`);
    }

    const upiAutoCollectTxnId = this.extractAutocollectTxnId(mandate, mandateCheck);
    const effectiveUpiTxId = upiAutoCollectTxnId || mandateTxId;
    const debitMandateTxId = mandate.mandateType === PlMandateType.UPI ? effectiveUpiTxId : mandateTxId;

    const existingNotifDebit = existingDebits.find(
      (d: any) =>
        Boolean(d.notificationRequestNumber) &&
        (mandate.mandateType !== PlMandateType.UPI || d.mandateTransactionId === effectiveUpiTxId || d.mandateTransactionId === mandateTxId),
    );
    const notifRequestNum = activeDebit?.notificationRequestNumber || existingNotifDebit?.notificationRequestNumber;

    // Check if customer has been notified for UPI mandate
    if (mandate.mandateType === PlMandateType.UPI && !notifRequestNum) {
      throw new BadRequestException('Customer has not been notified yet. Please click "Send notification" first before executing mandate.');
    }

    let targetDebitReq = activeDebit;
    const attemptNumber = targetDebitReq ? targetDebitReq.attemptNumber : (existingDebits.length + 1);
    const merchantReqNumber = targetDebitReq ? targetDebitReq.merchantRequestNumber : this.generateMerchantRequestNumber(rps.lan, rps.id, attemptNumber);

    const debitAmount = Math.min(Number(rps.remainingAmount), Number(mandate.amount));
    const todayStr = this.getIstDateString();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = this.getIstDateString(tomorrow);
    const rpsDueDateStr = rps.dueDate ? this.getIstDateString(new Date(rps.dueDate)) : tomorrowStr;
    const effectivePresentmentDateStr = rpsDueDateStr > todayStr ? rpsDueDateStr : tomorrowStr;

    if (!targetDebitReq) {
      targetDebitReq = await this.prisma.easebuzzDebitRequest.create({
        data: {
          loanId: rps.loanId,
          applicationId: rps.loan.applicationId,
          lan: rps.lan,
          rpsId: rps.id,
          installmentNumber: rps.installmentNumber,
          mandateId: mandate.id,
          mandateTransactionId: debitMandateTxId,
          mandateType: mandate.mandateType,
          merchantRequestNumber: merchantReqNumber,
          notificationRequestNumber: notifRequestNum,
          amount: new Prisma.Decimal(debitAmount),
          presentmentDate: new Date(effectivePresentmentDateStr),
          status: 'SUBMITTING',
          attemptNumber,
          source,
          initiatedAt: new Date(),
        },
      });
    }

    let res: any = null;
    if (mandate.mandateType === PlMandateType.ENACH) {
      res = await this.easebuzzAutocollectService.initiateEnachPresentment({
        transactionId: mandateTxId,
        amount: debitAmount,
        merchantRequestNumber: merchantReqNumber,
        presentmentDate: effectivePresentmentDateStr,
        udf1: rps.lan,
        udf2: rps.id.toString(),
        udf3: rps.installmentNumber.toString(),
        udf4: source,
      });
    } else {
      // Execute UPI Mandate debit with notification reference
      res = await this.easebuzzAutocollectService.executeUpiOrSiDebit({
        transactionId: effectiveUpiTxId,
        amount: debitAmount,
        merchantRequestNumber: merchantReqNumber,
        notificationRequestNumber: notifRequestNum || undefined,
        udf1: rps.lan,
        udf2: rps.id.toString(),
        udf3: rps.installmentNumber.toString(),
        udf4: source,
      });
    }

    let finalStatus = 'IN_PROCESS';
    let responseMessage = 'Mandate debit request dispatched successfully to Easebuzz.';

    if (res?.success) {
      finalStatus = 'IN_PROCESS';
      responseMessage = 'Mandate debit request submitted successfully. Waiting for bank processing & reconciliation.';
    } else if (res?.isUnknown) {
      finalStatus = 'UNKNOWN';
      responseMessage = 'Debit request status is UNKNOWN (network timeout/provider 5xx). It will be resolved by reconciliation.';
    } else {
      finalStatus = 'FAILURE';
      responseMessage = `Debit request rejected: ${res?.error || 'Unknown error'}`;
    }

    await this.prisma.easebuzzDebitRequest.update({
      where: { id: targetDebitReq.id },
      data: {
        status: finalStatus,
        failureReason: finalStatus === 'FAILURE' ? (res?.error ? String(res.error).slice(0, 500) : null) : (notifRequestNum ? `Pre-debit notification active: ${notifRequestNum}` : null),
        completedAt: finalStatus === 'FAILURE' ? new Date() : null,
        responseEncrypted: JSON.stringify(res?.rawResponse || {}),
      },
    });

    return {
      success: finalStatus === 'IN_PROCESS' || res?.success || res?.isUnknown,
      status: finalStatus,
      merchantRequestNumber: merchantReqNumber,
      notificationRequestNumber: notifRequestNum,
      amount: debitAmount,
      attemptNumber,
      message: responseMessage,
    };
  }

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

    const mandate = rps.loan?.mandates?.[0];
    if (!mandate) throw new BadRequestException(`No active authorized mandate found for LAN ${rps.lan}.`);

    // Check existing debit requests
    let existingDebits = await this.prisma.easebuzzDebitRequest.findMany({
      where: { rpsId },
      orderBy: { attemptNumber: 'desc' },
    });

    let activeDebit = existingDebits.find((d) => ['IN_PROCESS', 'UNKNOWN', 'SUBMITTING'].includes(d.status));

    // Auto-reconcile active debit before deciding
    if (activeDebit) {
      this.logger.log(`[retryDebit] Auto-reconciling active debit ${activeDebit.merchantRequestNumber} for RPS #${rpsId}...`);
      const recResult = await this.reconcileSingleDebitRequest(activeDebit);

      if (recResult.resolved && recResult.status === 'SUCCESS') {
        return {
          success: true,
          status: 'SUCCESS',
          message: 'Debit was already confirmed SUCCESS at bank! Repayment has been recorded.',
        };
      }

      // Re-fetch existing debits after reconciliation
      existingDebits = await this.prisma.easebuzzDebitRequest.findMany({
        where: { rpsId },
        orderBy: { attemptNumber: 'desc' },
      });
      activeDebit = existingDebits.find((d) => ['IN_PROCESS', 'UNKNOWN', 'SUBMITTING'].includes(d.status));
    }

    const mandateTxId = mandate.merchantTransactionId || mandate.providerMandateId || '';
    const debitAmount = Math.min(Number(rps.remainingAmount), Number(mandate.amount));
    const todayStr = this.getIstDateString();

    // Easebuzz eNACH presentment requires a strictly FUTURE date (> today in IST).
    // Use the installment's dueDate if it is in the future (> today), otherwise use tomorrow.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = this.getIstDateString(tomorrow);
    const rpsDueDateStr = rps.dueDate ? this.getIstDateString(new Date(rps.dueDate)) : tomorrowStr;
    const effectivePresentmentDateStr = rpsDueDateStr > todayStr ? rpsDueDateStr : tomorrowStr;

    // Verify mandate status
    const mandateCheck = await this.easebuzzAutocollectService.getMandateStatus(mandateTxId);
    if (!mandateCheck.isActive) {
      this.logger.warn(`[retryDebit] Mandate ${mandateTxId} is not active (Status: ${mandateCheck.status}).`);
      throw new BadRequestException(`Mandate ${mandateTxId} is not active (Status: ${mandateCheck.status}). Cannot initiate debit.`);
    }

    // Resolve AutoCollect transaction ID for UPI presentment
    const upiAutoCollectTxnId = this.extractAutocollectTxnId(mandate, mandateCheck);
    const effectiveUpiTxId = upiAutoCollectTxnId || mandateTxId;

    if (mandate.mandateType === PlMandateType.UPI) {
      this.logger.log(`[UPI PRESENTMENT] Mandate status resolved for LAN ${rps.lan}: Live Status="${mandateCheck.status}", AutoCollect TxID="${effectiveUpiTxId}"`);
    }

    // Check if we have an existing pre-debit notification ready to be executed for UPI/SI
    const existingNotifDebit = existingDebits.find(
      (d: any) =>
        Boolean(d.notificationRequestNumber) &&
        (mandate.mandateType !== PlMandateType.UPI || d.mandateTransactionId === effectiveUpiTxId || d.mandateTransactionId === mandateTxId) &&
        ['CREATED', 'SUBMITTING', 'IN_PROCESS'].includes(d.status),
    );
    let notifRequestNum = activeDebit?.notificationRequestNumber || existingNotifDebit?.notificationRequestNumber;

    // If activeDebit exists with notificationRequestNumber and no presentment executed yet, execute it now!
    let targetDebitReq = activeDebit;
    let attemptNumber = targetDebitReq ? targetDebitReq.attemptNumber : (existingDebits.length + 1);
    let merchantReqNumber = targetDebitReq ? targetDebitReq.merchantRequestNumber : this.generateMerchantRequestNumber(rps.lan, rps.id, attemptNumber);

    const debitMandateTxId = mandate.mandateType === PlMandateType.UPI ? effectiveUpiTxId : mandateTxId;

    if (!targetDebitReq) {
      targetDebitReq = await this.prisma.easebuzzDebitRequest.create({
        data: {
          loanId: rps.loanId,
          applicationId: rps.loan.applicationId,
          lan: rps.lan,
          rpsId: rps.id,
          installmentNumber: rps.installmentNumber,
          mandateId: mandate.id,
          mandateTransactionId: debitMandateTxId,
          mandateType: mandate.mandateType,
          merchantRequestNumber: merchantReqNumber,
          notificationRequestNumber: notifRequestNum,
          amount: new Prisma.Decimal(debitAmount),
          presentmentDate: new Date(effectivePresentmentDateStr),
          status: 'SUBMITTING',
          attemptNumber,
          source,
          initiatedAt: new Date(),
        },
      });
    } else if (mandate.mandateType === PlMandateType.UPI && targetDebitReq.mandateTransactionId !== effectiveUpiTxId) {
      await this.prisma.easebuzzDebitRequest.update({
        where: { id: targetDebitReq.id },
        data: { mandateTransactionId: effectiveUpiTxId },
      });
      targetDebitReq.mandateTransactionId = effectiveUpiTxId;
    }

    let res: any = null;

    if (mandate.mandateType === PlMandateType.ENACH) {
      res = await this.easebuzzAutocollectService.initiateEnachPresentment({
        transactionId: mandateTxId,
        amount: debitAmount,
        merchantRequestNumber: merchantReqNumber,
        presentmentDate: effectivePresentmentDateStr,
        udf1: rps.lan,
        udf2: rps.id.toString(),
        udf3: rps.installmentNumber.toString(),
        udf4: source,
      });
    } else {
      // UPI Mandate Presentment Flow
      // 1. If no valid notification exists, send Pre-Debit Notification first with schedule_presentment=true
      if (!notifRequestNum) {
        const notifMerchantReq = `NT_${rps.lan}_${rps.id}_${attemptNumber}`;
        this.logger.log(`[UPI PRESENTMENT] Sending pre-debit notification - LAN: ${rps.lan}, Mandate TxID: ${effectiveUpiTxId}, Merchant Req: ${notifMerchantReq}`);
        this.logger.log(`[UPI PRESENTMENT] schedule_presentment=true`);

        const notifRes = await this.easebuzzAutocollectService.sendUpiPreDebitNotification({
          transactionId: effectiveUpiTxId,
          amount: debitAmount,
          merchantRequestNumber: notifMerchantReq,
          debitDate: effectivePresentmentDateStr,
          udf1: rps.lan,
          udf2: rps.id.toString(),
          udf3: rps.installmentNumber.toString(),
          udf4: source,
        });

        if (notifRes.success && notifRes.notificationRequestNumber) {
          notifRequestNum = notifRes.notificationRequestNumber;
          this.logger.log(`[UPI PRESENTMENT] Pre-debit notification sent successfully - LAN: ${rps.lan}, Mandate TxID: ${effectiveUpiTxId}, Notif Req: ${notifRequestNum}, Merchant Req: ${notifMerchantReq}`);
          this.logger.log(`[UPI PRESENTMENT] Presentment scheduled with Easebuzz; skipping immediate execute - LAN: ${rps.lan}, Mandate TxID: ${effectiveUpiTxId}, Notif Req: ${notifRequestNum}`);

          const updated = await this.prisma.easebuzzDebitRequest.update({
            where: { id: targetDebitReq.id },
            data: {
              status: 'IN_PROCESS',
              notificationRequestNumber: notifRequestNum,
              mandateTransactionId: effectiveUpiTxId,
              responseEncrypted: JSON.stringify(notifRes.rawResponse || notifRes.data || {}),
              failureReason: `Pre-debit notification active and scheduled: ${notifRequestNum}`,
            },
          });

          return {
            success: true,
            status: 'IN_PROCESS',
            merchantRequestNumber: merchantReqNumber,
            notificationRequestNumber: notifRequestNum,
            amount: debitAmount,
            attemptNumber,
            debitRequestId: updated.id.toString(),
            message: `Pre-debit notification sent and presentment scheduled with Easebuzz (${notifRequestNum}). Debit will be executed automatically by Easebuzz after notification period.`,
          };
        } else {
          // Pre-debit notification failed
          const notifError = notifRes.error || 'Pre-debit notification failed';
          this.logger.warn(`[UPI PRESENTMENT] Pre-debit notification failed - LAN: ${rps.lan}, Mandate TxID: ${effectiveUpiTxId}: ${notifError}`);
          const updated = await this.prisma.easebuzzDebitRequest.update({
            where: { id: targetDebitReq.id },
            data: {
              status: notifRes.isUnknown ? 'UNKNOWN' : 'FAILURE',
              failureReason: notifError.slice(0, 500),
              completedAt: notifRes.isUnknown ? null : new Date(),
              responseEncrypted: JSON.stringify(notifRes.rawResponse || {}),
            },
          });

          return {
            success: false,
            status: notifRes.isUnknown ? 'UNKNOWN' : 'FAILURE',
            merchantRequestNumber: merchantReqNumber,
            notificationRequestNumber: null,
            amount: debitAmount,
            attemptNumber,
            debitRequestId: updated.id.toString(),
            message: `Pre-debit notification failed: ${notifError}`,
          };
        }
      }

      // 2. If a valid notification already exists for this mandate transaction, it is already scheduled with Easebuzz
      this.logger.log(`[UPI PRESENTMENT] Existing valid notification found (${notifRequestNum}) for LAN: ${rps.lan}, Mandate TxID: ${effectiveUpiTxId}. Presentment is scheduled with Easebuzz; skipping immediate execute.`);

      const updated = await this.prisma.easebuzzDebitRequest.update({
        where: { id: targetDebitReq.id },
        data: {
          status: 'IN_PROCESS',
          notificationRequestNumber: notifRequestNum,
          mandateTransactionId: effectiveUpiTxId,
        },
      });

      return {
        success: true,
        status: 'IN_PROCESS',
        merchantRequestNumber: merchantReqNumber,
        notificationRequestNumber: notifRequestNum,
        amount: debitAmount,
        attemptNumber,
        debitRequestId: updated.id.toString(),
        message: `Pre-debit notification is active (${notifRequestNum}) and scheduled with Easebuzz. Presentment will execute after the notification window.`,
      };
    }

    let finalStatus = 'IN_PROCESS';
    let responseMessage = 'Debit presentment request dispatched successfully to Easebuzz.';

    if (res?.success) {
      finalStatus = 'IN_PROCESS';
      responseMessage = 'Debit request submitted successfully. Waiting for bank processing & reconciliation.';
    } else if (res?.isUnknown) {
      finalStatus = 'UNKNOWN';
      responseMessage = 'Debit request status is UNKNOWN (network timeout/provider 5xx). It will be resolved by reconciliation.';
    } else if (notifRequestNum && String(res?.error || '').toLowerCase().includes('notification')) {
      finalStatus = 'IN_PROCESS';
      responseMessage = `Pre-debit notification is active (${notifRequestNum}). Debit presentment will execute once the notification window completes.`;
    } else {
      finalStatus = 'FAILURE';
      responseMessage = `Debit request rejected: ${res?.error || 'Unknown error'}`;
    }

    const updated = await this.prisma.easebuzzDebitRequest.update({
      where: { id: targetDebitReq.id },
      data: {
        status: finalStatus,
        failureReason: finalStatus === 'FAILURE' ? (res?.error ? String(res.error).slice(0, 500) : null) : (notifRequestNum ? `Pre-debit notification active: ${notifRequestNum}` : null),
        completedAt: finalStatus === 'FAILURE' ? new Date() : null,
        responseEncrypted: JSON.stringify(res?.rawResponse || {}),
      },
    });

    return {
      success: finalStatus === 'IN_PROCESS' || res?.success || res?.isUnknown,
      status: finalStatus,
      merchantRequestNumber: merchantReqNumber,
      notificationRequestNumber: notifRequestNum,
      amount: debitAmount,
      attemptNumber,
      debitRequestId: updated.id.toString(),
      message: responseMessage,
    };
  }
}
