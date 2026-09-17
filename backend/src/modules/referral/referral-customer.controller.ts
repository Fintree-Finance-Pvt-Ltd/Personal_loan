import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CustomerProtected } from '../auth/decorators/customer-protected.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { ReferralService } from './referral.service';

@Controller('referral')
export class ReferralCustomerController {
  constructor(private readonly referralService: ReferralService) {}

  private extractCustomerId(customer: any): bigint {
    const rawId = customer?.customerId || customer?.id || customer?.sub;
    if (!rawId) {
      throw new BadRequestException('Customer identity could not be determined.');
    }
    return BigInt(rawId);
  }

  @CustomerProtected()
  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  async getDashboard(@CurrentCustomer() customer: any) {
    const customerId = this.extractCustomerId(customer);
    return await this.referralService.getReferralDashboard(customerId);
  }

  @CustomerProtected()
  @Get('code')
  @HttpCode(HttpStatus.OK)
  async getCode(@CurrentCustomer() customer: any) {
    const customerId = this.extractCustomerId(customer);
    const referralCode = this.referralService.getReferralCode(customerId);
    const shareLink = this.referralService.getShareLink(referralCode);
    return {
      referralCode,
      shareLink,
    };
  }

  @Public()
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateCode(@Body() body: { referralCode?: string; code?: string }) {
    const referralCode = body.referralCode || body.code || '';
    return await this.referralService.validateReferralCode(referralCode);
  }

  @CustomerProtected()
  @Post('apply-benefit')
  @HttpCode(HttpStatus.OK)
  async applyBenefit(
    @CurrentCustomer() customer: any,
    @Body()
    body: {
      loanId?: string;
      applicationId?: string;
      baseProcessingFee: number;
      loanNumber?: number;
    },
  ) {
    const customerId = this.extractCustomerId(customer);
    const baseFee = Number(body.baseProcessingFee || 0);
    const loanNum = Number(body.loanNumber || 2);

    const calculation = await this.referralService.calculateDiscountedProcessingFee(
      customerId,
      baseFee,
      loanNum,
    );

    if (calculation.benefitApplied && calculation.benefitId && body.loanId) {
      await this.referralService.applyBenefitToLoan(
        customerId,
        BigInt(body.loanId),
        body.applicationId ? BigInt(body.applicationId) : null,
        calculation.originalProcessingFee,
        calculation.discountApplied,
        calculation.finalProcessingFee,
        BigInt(calculation.benefitId),
      );
    }

    return calculation;
  }
}
