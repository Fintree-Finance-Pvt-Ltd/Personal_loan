import { Controller, Get, Post, Patch, Body, Param, Query, Req } from '@nestjs/common';
import { LoanService } from './loan.service';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Customer-facing loan journey endpoints.
 * These routes are @Public() because the customer portal uses OTP-based
 * session storage (not admin JWT). The customerId is passed via query param
 * from the frontend session.
 */
@Controller('customer/loans')
export class LoanController {
  constructor(private readonly loanService: LoanService) {}

  @Public()
  @Get(':lan/post-approval')
  getPostApprovalJourney(
    @Param('lan') lan: string,
    @Query('customerId') customerId: string,
  ) {
    return this.loanService.getPostApprovalJourney(lan, BigInt(customerId || '0'));
  }

  @Public()
  @Get(':lan/offer')
  async getOffer(
    @Param('lan') lan: string,
    @Query('customerId') customerId: string,
  ) {
    const journey = await this.loanService.getPostApprovalJourney(lan, BigInt(customerId || '0'));
    return journey.offer;
  }

  @Public()
  @Post(':lan/offer/accept')
  acceptOffer(
    @Param('lan') lan: string,
    @Body() body: { customerId: string; tenureDays: number },
  ) {
    return this.loanService.acceptOffer(lan, BigInt(body.customerId), body.tenureDays);
  }

  @Public()
  @Post(':lan/digilocker/initiate')
  initiateDigilocker(
    @Param('lan') lan: string,
    @Body() body: { customerId: string },
  ) {
    return this.loanService.initiateDigilocker(lan, BigInt(body.customerId));
  }

  @Public()
  @Get(':lan/digilocker/status')
  getDigilockerStatus(
    @Param('lan') lan: string,
    @Query('customerId') customerId: string,
  ) {
    return this.loanService.getDigilockerStatus(lan, BigInt(customerId));
  }

  @Public()
  @Post(':lan/digilocker/fetch-details')
  fetchDigilockerDetails(
    @Param('lan') lan: string,
    @Body() body: { customerId: string },
  ) {
    return this.loanService.fetchDigilockerDetails(lan, BigInt(body.customerId));
  }

  @Public()
  @Patch(':lan/address')
  saveAddress(
    @Param('lan') lan: string,
    @Body() body: { customerId: string; [key: string]: any },
  ) {
    const { customerId, ...rest } = body;
    return this.loanService.saveAddress(lan, BigInt(customerId), rest);
  }

  @Public()
  @Post(':lan/bank-accounts/verify')
  verifyBankAccount(
    @Param('lan') lan: string,
    @Body() body: { customerId: string; [key: string]: any },
    @Req() req: any,
  ) {
    const { customerId, ...rest } = body;
    return this.loanService.verifyBankAccount(lan, BigInt(customerId || '0'), body, {
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
    });
  }

  @Public()
  @Post(':lan/kfs/generate')
  generateKfs(
    @Param('lan') lan: string,
    @Body() body: { customerId: string },
  ) {
    return this.loanService.generateKfs(lan, BigInt(body?.customerId || '0'));
  }

  @Public()
  @Get(':lan/kfs')
  getKfs(@Param('lan') lan: string) {
    return { success: true };
  }

  @Public()
  @Post(':lan/kfs/accept')
  acceptKfs(
    @Param('lan') lan: string,
    @Body() body: { customerId: string; [key: string]: any },
  ) {
    const { customerId, ...rest } = body || {};
    return this.loanService.acceptKfs(lan, BigInt(customerId || '0'), rest);
  }

  @Public()
  @Post(':lan/mandate/initiate')
  initiateMandate(
    @Param('lan') lan: string,
    @Body() body: { customerId?: string; forceNew?: boolean },
  ) {
    return this.loanService.initiateMandate(lan, BigInt(body?.customerId || '0'), Boolean(body?.forceNew));
  }

  @Public()
  @Get(':lan/mandate/status')
  getMandateStatus(
    @Param('lan') lan: string,
    @Query('customerId') customerId: string,
  ) {
    return this.loanService.getMandateStatus(lan, BigInt(customerId || '0'));
  }

  @Public()
  @Post(':lan/mandate/refresh-status')
  refreshMandateStatus(
    @Param('lan') lan: string,
    @Body() body: { customerId: string },
  ) {
    return this.loanService.refreshMandateStatus(lan, BigInt(body?.customerId || '0'));
  }

  @Public()
  @Post(':lan/esign/initiate')
  initiateEsign(
    @Param('lan') lan: string,
    @Body() body: { customerId: string },
  ) {
    return this.loanService.initiateEsign(lan, BigInt(body?.customerId || '0'));
  }

  @Public()
  @Get(':lan/esign/status')
  getEsignStatus(@Param('lan') lan: string) {
    return { status: 'NOT_STARTED' };
  }

  @Public()
  @Post(':lan/disbursal/request')
  requestDisbursal(
    @Param('lan') lan: string,
    @Body() body: { customerId: string },
  ) {
    return this.loanService.requestDisbursal(lan, BigInt(body?.customerId || '0'));
  }

  @Public()
  @Get(':lan/disbursal/status')
  getDisbursalStatus(@Param('lan') lan: string) {
    return { status: 'NOT_STARTED' };
  }
}
