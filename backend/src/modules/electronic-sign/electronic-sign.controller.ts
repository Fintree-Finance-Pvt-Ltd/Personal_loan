import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ElectronicSignService } from './electronic-sign.service';
import { extractClientIp } from './helpers/ip-address.helper';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Public()
@Controller('customer/loans/:lan/electronic-sign')
export class ElectronicSignController {
  constructor(
    private readonly electronicSignService: ElectronicSignService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveCustomerId(lan: string, req: Request, providedCustomerId?: string): Promise<bigint> {
    if (providedCustomerId && providedCustomerId !== '0') {
      return BigInt(providedCustomerId);
    }
    const user = (req as any).user;
    const userCustId = user?.customerId || user?.id || user?.sub;
    if (userCustId) {
      return BigInt(userCustId);
    }
    const headerCustId = req.headers['x-customer-id'] as string;
    if (headerCustId) {
      return BigInt(headerCustId);
    }

    // Fallback: Resolve customerId directly from loan LAN
    const loan = await this.prisma.plLoan.findFirst({
      where: { lan },
      select: { customerId: true, id: true },
    });

    if (!loan) {
      throw new NotFoundException(`Loan account ${lan} not found.`);
    }

    return loan.customerId;
  }

  @Post('prepare')
  @HttpCode(HttpStatus.OK)
  async prepareAgreement(
    @Param('lan') lan: string,
    @Body('customerId') bodyCustId: string,
    @Query('customerId') queryCustId: string,
    @Req() req: Request,
  ) {
    const customerId = await this.resolveCustomerId(lan, req, bodyCustId || queryCustId);

    const loan = await this.prisma.plLoan.findFirst({
      where: { lan, customerId },
      include: { customer: true },
    });

    if (!loan) {
      throw new NotFoundException(`Loan account ${lan} not found for customer.`);
    }

    return this.electronicSignService.prepareDocument({
      loanId: loan.id,
      customerId,
      applicationId: loan.applicationId,
      lan: loan.lan,
      documentType: 'LOAN_AGREEMENT',
      documentVersion: 'v1',
      signerName: loan.customer?.fullName || 'Borrower',
      verifiedMobileNumber: loan.customer?.mobileNumber || '9876543210',
      consentText: '',
      consentVersion: '1.0',
    });
  }

  @Get('document')
  async previewDocument(
    @Param('lan') lan: string,
    @Query('customerId') queryCustId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const customerId = await this.resolveCustomerId(lan, req, queryCustId);

    // Auto-prepare document if not initialized yet
    const loan = await this.prisma.plLoan.findFirst({ where: { lan, customerId } });
    if (loan) {
      await this.electronicSignService.prepareDocument({
        loanId: loan.id,
        customerId,
        applicationId: loan.applicationId,
        lan: loan.lan,
        documentType: 'LOAN_AGREEMENT',
        documentVersion: 'v1',
        signerName: 'Borrower',
        verifiedMobileNumber: '9876543210',
        consentText: '',
        consentVersion: '1.0',
      });
    }

    const { buffer, filename } = await this.electronicSignService.getOriginalDocument(lan, customerId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.send(buffer);
  }

  @Post('document/viewed')
  @HttpCode(HttpStatus.OK)
  async markViewed(
    @Param('lan') lan: string,
    @Body('customerId') bodyCustId: string,
    @Query('customerId') queryCustId: string,
    @Req() req: Request,
  ) {
    const customerId = await this.resolveCustomerId(lan, req, bodyCustId || queryCustId);
    return this.electronicSignService.markDocumentViewed(lan, customerId);
  }

  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  async sendOtp(
    @Param('lan') lan: string,
    @Body() body: any,
    @Query('customerId') queryCustId: string,
    @Req() req: Request,
  ) {
    const customerId = await this.resolveCustomerId(lan, req, body?.customerId || queryCustId);
    const consentAccepted = Boolean(body?.consentAccepted);
    return this.electronicSignService.sendSigningOtp(lan, customerId, consentAccepted);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Param('lan') lan: string,
    @Body() body: any,
    @Query('customerId') queryCustId: string,
    @Req() req: Request,
  ) {
    const customerId = await this.resolveCustomerId(lan, req, body?.customerId || queryCustId);
    const { ipAddress, forwardedFor } = extractClientIp(req);
    const userAgent = req.headers['user-agent'] || '';
    const requestId = (req.headers['x-request-id'] as string) || '';
    const authenticatedSessionId = (req.headers['x-session-id'] as string) || '';

    return this.electronicSignService.verifyOtpAndAccept({
      lan,
      otpSessionId: body?.otpSessionId,
      otp: body?.otp,
      authenticatedCustomerId: customerId,
      ipAddress,
      forwardedFor,
      userAgent,
      requestId,
      authenticatedSessionId,
    });
  }

  @Get('status')
  async getStatus(
    @Param('lan') lan: string,
    @Query('customerId') queryCustId: string,
    @Req() req: Request,
  ) {
    const customerId = await this.resolveCustomerId(lan, req, queryCustId);
    return this.electronicSignService.getSigningStatus(lan, customerId);
  }

  @Get('accepted-document')
  async downloadAcceptedDocument(
    @Param('lan') lan: string,
    @Query('customerId') queryCustId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const customerId = await this.resolveCustomerId(lan, req, queryCustId);
    const { buffer, filename } = await this.electronicSignService.getAcceptedDocument(lan, customerId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.send(buffer);
  }

  @Get('audit-certificate')
  async downloadAuditCertificate(
    @Param('lan') lan: string,
    @Query('customerId') queryCustId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const customerId = await this.resolveCustomerId(lan, req, queryCustId);
    const { buffer, filename } = await this.electronicSignService.getAuditCertificate(lan, customerId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.send(buffer);
  }
}
