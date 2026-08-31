// ──────────────────────────────────────────────────────────────────────────
// Admin Loan Servicing — add/waive extra charges on a disbursed loan.
// The write here is the trigger for the outbound Fintree charge/waiver
// notification (see LoanService.addLoanCharge/waiveLoanCharge) — there was
// no existing admin surface for this at all before.
// ──────────────────────────────────────────────────────────────────────────
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { IsISO8601, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../../common/types/auth-user.type';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { EasebuzzAutocollectService } from '../../integrations/easebuzz-autocollect.service';
import { LoanService } from './loan.service';
import { EasebuzzCollectionCronService } from './services/easebuzz-collection-cron.service';

export class AddLoanChargeDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  chargeType: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'amount must be a decimal with up to 2 decimal places.' })
  amount: string;

  @IsISO8601({ strict: true })
  dueDate: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  remarks?: string | null;
}

export class WaiveLoanChargeDto {
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'waiverAmount must be a decimal with up to 2 decimal places.' })
  waiverAmount: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  remarks?: string | null;
}

@Controller('admin/loans')
export class AdminLoanServicingController {
  constructor(
    private readonly loanService: LoanService,
    private readonly easebuzzCollectionCronService: EasebuzzCollectionCronService,
    private readonly easebuzzAutocollectService: EasebuzzAutocollectService,
    private readonly prisma: PrismaService,
  ) { }

  private parseChargeId(chargeId: string): bigint {
    if (!/^[1-9][0-9]*$/.test(chargeId)) {
      throw new BadRequestException('Invalid charge ID.');
    }
    return BigInt(chargeId);
  }

  @Permissions('LOAN_CHARGE_MANAGE')
  @Post(':lan/charges')
  @HttpCode(HttpStatus.CREATED)
  addCharge(
    @Param('lan') lan: string,
    @Body() dto: AddLoanChargeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loanService.addLoanCharge(
      lan,
      {
        chargeType: dto.chargeType,
        amount: Number(dto.amount),
        dueDate: new Date(dto.dueDate),
        remarks: dto.remarks ?? undefined,
      },
      user.userId,
    );
  }

  @Permissions('LOAN_CHARGE_MANAGE')
  @Post(':lan/charges/:chargeId/waiver')
  @HttpCode(HttpStatus.OK)
  waiveCharge(
    @Param('lan') lan: string,
    @Param('chargeId') chargeId: string,
    @Body() dto: WaiveLoanChargeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loanService.waiveLoanCharge(
      lan,
      this.parseChargeId(chargeId),
      {
        waiverAmount: Number(dto.waiverAmount),
        remarks: dto.remarks ?? undefined,
      },
      user.userId,
    );
  }

  @Permissions('LOAN_MANAGE')
  @Post('repayment-schedule/:rpsId/retry-debit')
  @HttpCode(HttpStatus.OK)
  retryDebit(@Param('rpsId') rpsId: string) {
    if (!/^[1-9][0-9]*$/.test(rpsId)) {
      throw new BadRequestException('Invalid repayment schedule ID.');
    }
    return this.easebuzzCollectionCronService.retryDebit(rpsId, 'MANUAL');
  }

  @Permissions('LOAN_MANAGE')
  @Post(':lan/welcome-letter/resend')
  @HttpCode(HttpStatus.OK)
  resendWelcomeLetter(@Param('lan') lan: string) {
    return this.loanService.resendWelcomeLetter(lan);
  }

  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Get('debit-requests')
  @HttpCode(HttpStatus.OK)
  async getDebitRequests(
    @Query('created_at') createdAt?: string,
    @Query('created_at_start') createdAtStart?: string,
    @Query('created_at_end') createdAtEnd?: string,
    @Query('status') status?: string,
    @Query('mandate_type') mandateType?: string,
    @Query('merchant_request_number') merchantRequestNumber?: string,
    @Query('mandate_transaction_id') mandateTransactionId?: string,
    @Query('mandate_id') mandateId?: string,
    @Query('notification_request_number') notificationRequestNumber?: string,
    @Query('notification_id') notificationId?: string,
    @Query('scheduler_merchant_request_number') schedulerMerchantRequestNumber?: string,
    @Query('scheduler_request_id') schedulerRequestId?: string,
    @Query('umrn') umrn?: string,
    @Query('pageSize') pageSizeStr?: string,
    @Query('current') currentStr?: string,
    @Query('source') source?: 'live' | 'db',
  ) {
    const pageSize = pageSizeStr ? Math.min(100, Math.max(1, parseInt(pageSizeStr, 10) || 15)) : 15;
    const current = currentStr ? Math.max(1, parseInt(currentStr, 10) || 1) : 1;

    // 1. Live Query from Easebuzz API (unless explicitly requested from local DB)
    if (source !== 'db') {
      try {
        const liveRes = await this.easebuzzAutocollectService.getDebitRequests({
          createdAt: createdAt?.trim() || undefined,
          createdAtStart: createdAtStart?.trim() || undefined,
          createdAtEnd: createdAtEnd?.trim() || undefined,
          status: status?.trim() || undefined,
          mandateType: mandateType?.trim() || undefined,
          merchantRequestNumber: merchantRequestNumber?.trim() || undefined,
          mandateTransactionId: mandateTransactionId?.trim() || undefined,
          mandateId: mandateId?.trim() || undefined,
          notificationRequestNumber: notificationRequestNumber?.trim() || undefined,
          notificationId: notificationId?.trim() || undefined,
          schedulerMerchantRequestNumber: schedulerMerchantRequestNumber?.trim() || undefined,
          schedulerRequestId: schedulerRequestId?.trim() || undefined,
          umrn: umrn?.trim() || undefined,
          pageSize,
          current,
        });

        if (liveRes.success) {
          const resData = liveRes.data || {};
          const resultsList = Array.isArray(resData?.results)
            ? resData.results
            : Array.isArray(resData?.data)
              ? resData.data
              : Array.isArray(resData)
                ? resData
                : [];

          return {
            success: true,
            source: 'live',
            results: resultsList,
            pagination: resData?.pagination || {
              hasNext: false,
              showing: {
                total_records: resultsList.length,
                current_page: current,
                records_per_page: pageSize,
              },
            },
          };
        }
      } catch (err: any) {
        // Fallback to local DB if Easebuzz query encounters an error
      }
    }

    // 2. Query Local Database
    const where: any = {};
    if (merchantRequestNumber) where.merchantRequestNumber = { contains: merchantRequestNumber.trim() };
    if (mandateTransactionId) where.mandateTransactionId = { contains: mandateTransactionId.trim() };
    if (mandateType) where.mandateType = mandateType.trim() as any;
    if (status) where.status = { equals: status.trim() };
    if (createdAtStart || createdAtEnd) {
      where.createdAt = {};
      if (createdAtStart) where.createdAt.gte = new Date(createdAtStart);
      if (createdAtEnd) where.createdAt.lte = new Date(createdAtEnd);
    } else if (createdAt) {
      const dStart = new Date(createdAt);
      const dEnd = new Date(createdAt);
      dEnd.setDate(dEnd.getDate() + 1);
      where.createdAt = { gte: dStart, lt: dEnd };
    }

    const [total, dbRecords] = await Promise.all([
      this.prisma.easebuzzDebitRequest.count({ where }),
      this.prisma.easebuzzDebitRequest.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (current - 1) * pageSize,
        take: pageSize,
        include: {
          loan: { select: { lan: true, applicationId: true } },
          rps: { select: { installmentNumber: true, dueDate: true, emi: true } },
          mandate: { select: { mandateType: true, umrn: true, status: true } },
        },
      }),
    ]);

    const formatted = dbRecords.map((r: any) => ({
      id: r.id.toString(),
      merchant_request_number: r.merchantRequestNumber,
      amount: Number(r.amount),
      status: r.status,
      presentment_date: r.presentmentDate ? r.presentmentDate.toISOString().slice(0, 10) : null,
      created_at: r.createdAt.toISOString(),
      mandate_transaction_id: r.mandateTransactionId,
      umrn: r.mandate?.umrn || null,
      status_at_bank: r.statusAtBank || null,
      bank_reference_number: r.bankReferenceNumber || null,
      pg_transaction_id: r.pgTransactionId || null,
      failure_reason: r.failureReason || null,
      udf1: r.lan,
      udf2: r.rpsId?.toString() || '',
      udf3: r.installmentNumber?.toString() || '',
      mandate: {
        mandate_type: r.mandateType,
        umrn: r.mandate?.umrn || null,
      },
    }));

    return {
      success: true,
      source: 'db',
      results: formatted,
      pagination: {
        hasNext: current * pageSize < total,
        showing: {
          total_records: total,
          current_page: current,
          records_per_page: pageSize,
        },
      },
    };
  }
}

