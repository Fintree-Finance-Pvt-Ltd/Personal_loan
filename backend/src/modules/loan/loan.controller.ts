import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { CustomerProtected } from '../auth/decorators/customer-protected.decorator';
import { LoanService } from './loan.service';

@Controller('customer/loans')
@CustomerProtected()
export class LoanController {
  constructor(private readonly loanService: LoanService) {}

  private customerId(customer: any): bigint {
    return BigInt(customer.customerId);
  }

  @Get(':lan/post-approval')
  getPostApprovalJourney(@Param('lan') lan: string, @CurrentCustomer() customer: any) {
    return this.loanService.getPostApprovalJourney(lan, this.customerId(customer));
  }

  @Get(':lan/offer')
  async getOffer(@Param('lan') lan: string, @CurrentCustomer() customer: any) {
    const journey = await this.loanService.getPostApprovalJourney(lan, this.customerId(customer));
    return journey.offer;
  }

  @Post(':lan/offer/accept')
  acceptOffer(@Param('lan') lan: string, @CurrentCustomer() customer: any, @Body() body: { tenureDays: number }) {
    return this.loanService.acceptOffer(lan, this.customerId(customer), body.tenureDays);
  }

  @Post(':lan/digilocker/initiate')
  initiateDigilocker(@Param('lan') lan: string, @CurrentCustomer() customer: any) {
    return this.loanService.initiateDigilocker(lan, this.customerId(customer));
  }

  @Get(':lan/digilocker/status')
  getDigilockerStatus(@Param('lan') lan: string, @CurrentCustomer() customer: any) {
    return this.loanService.getDigilockerStatus(lan, this.customerId(customer));
  }

  @Post(':lan/digilocker/fetch-details')
  fetchDigilockerDetails(@Param('lan') lan: string, @CurrentCustomer() customer: any) {
    return this.loanService.fetchDigilockerDetails(lan, this.customerId(customer));
  }

  @Patch(':lan/address')
  saveAddress(@Param('lan') lan: string, @CurrentCustomer() customer: any, @Body() body: Record<string, any>) {
    return this.loanService.saveAddress(lan, this.customerId(customer), body);
  }

  @Post(':lan/bank-accounts/verify')
  verifyBankAccount(@Param('lan') lan: string, @CurrentCustomer() customer: any, @Body() body: Record<string, any>, @Req() req: any) {
    return this.loanService.verifyBankAccount(lan, this.customerId(customer), body, {
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
    });
  }

  @Post(':lan/kfs/generate')
  generateKfs(@Param('lan') lan: string, @CurrentCustomer() customer: any) {
    return this.loanService.generateKfs(lan, this.customerId(customer));
  }

  @Get(':lan/kfs')
  async getKfs(@Param('lan') lan: string, @CurrentCustomer() customer: any) {
    const journey = await this.loanService.getPostApprovalJourney(lan, this.customerId(customer));
    return { success: true, data: journey.kfs };
  }

  @Post(':lan/kfs/accept')
  acceptKfs(@Param('lan') lan: string, @CurrentCustomer() customer: any, @Body() body: Record<string, any>) {
    return this.loanService.acceptKfs(lan, this.customerId(customer), body);
  }

  @Post(':lan/mandate/initiate')
  initiateMandate(@Param('lan') lan: string, @CurrentCustomer() customer: any, @Body() body: { forceNew?: boolean; mandateType?: string }) {
    return this.loanService.initiateMandate(lan, this.customerId(customer), Boolean(body?.forceNew), body?.mandateType);
  }

  @Get(':lan/mandate/status')
  getMandateStatus(@Param('lan') lan: string, @CurrentCustomer() customer: any) {
    return this.loanService.getMandateStatus(lan, this.customerId(customer));
  }

  @Post(':lan/mandate/refresh-status')
  refreshMandateStatus(@Param('lan') lan: string, @CurrentCustomer() customer: any) {
    return this.loanService.refreshMandateStatus(lan, this.customerId(customer));
  }

  @Post(':lan/esign/initiate')
  initiateEsign(@Param('lan') lan: string, @CurrentCustomer() customer: any) {
    return this.loanService.initiateEsign(lan, this.customerId(customer));
  }

  @Get(':lan/esign/status')
  async getEsignStatus(@Param('lan') lan: string, @CurrentCustomer() customer: any) {
    const journey = await this.loanService.getPostApprovalJourney(lan, this.customerId(customer));
    return journey.esign;
  }

  @Post(':lan/disbursal/request')
  requestDisbursal(@Param('lan') lan: string, @CurrentCustomer() customer: any) {
    return this.loanService.requestDisbursal(lan, this.customerId(customer));
  }

  @Get(':lan/disbursal/status')
  async getDisbursalStatus(@Param('lan') lan: string, @CurrentCustomer() customer: any) {
    const journey = await this.loanService.getPostApprovalJourney(lan, this.customerId(customer));
    return { status: journey.workflow?.disbursalStatus ?? 'NOT_STARTED' };
  }

  @Get(':lan/details')
  async getLoanDetails(@Param('lan') lan: string, @CurrentCustomer() customer: any) {
    return this.loanService.getLoanDetails(lan, this.customerId(customer));
  }

  @Post(':lan/repay/initiate')
  async initiateRepaymentPayment(
    @Param('lan') lan: string,
    @CurrentCustomer() customer: any,
    @Body() body: any,
  ) {
    return this.loanService.initiateRepaymentPayment(
      lan,
      this.customerId(customer),
      body?.installmentNumber,
      body?.amount,
    );
  }

  @Post(':lan/repay/confirm')
  async processRepayment(
    @Param('lan') lan: string,
    @Body() body: any,
  ) {
    return this.loanService.processRepayment(lan, body);
  }

  @Post(':lan/reset-rps')
  resetRps(@Param('lan') lan: string, @CurrentCustomer() customer: any) {
    return this.loanService.resetLoanRpsAndDisbursal(lan, this.customerId(customer));
  }
}
