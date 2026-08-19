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
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { IsISO8601, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../../common/types/auth-user.type';
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
}

