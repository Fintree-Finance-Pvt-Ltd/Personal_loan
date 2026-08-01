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
import { SigningIpService } from './services/signing-ip.service';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { UseGuards } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@UseGuards(CustomerAuthGuard)
@Controller('customer/loans/:lan/electronic-sign')
export class ElectronicSignController {
  constructor(
    private readonly electronicSignService: ElectronicSignService,
    private readonly signingIpService: SigningIpService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('prepare')
  @HttpCode(HttpStatus.OK)
  async prepareAgreement(
    @Param('lan') lan: string,
    @CurrentCustomer() customer: any,
  ) {
    const customerId = BigInt(customer.customerId);

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
    @CurrentCustomer() customer: any,
    @Res() res: Response,
  ) {
    const customerId = BigInt(customer.customerId);

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
    @CurrentCustomer() customer: any,
  ) {
    const customerId = BigInt(customer.customerId);
    return this.electronicSignService.markDocumentViewed(lan, customerId);
  }

  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  async sendOtp(
    @Param('lan') lan: string,
    @Body() body: any,
    @CurrentCustomer() customer: any,
  ) {
    const customerId = BigInt(customer.customerId);
    const consentAccepted = Boolean(body?.consentAccepted);
    return this.electronicSignService.sendSigningOtp(lan, customerId, consentAccepted);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Param('lan') lan: string,
    @Body() body: any,
    @CurrentCustomer() customer: any,
    @Req() req: Request,
  ) {
    const customerId = BigInt(customer.customerId);

    // Capture & validate signing IP from request BEFORE processing OTP
    const ipEvidence = this.signingIpService.capture(req);

    const userAgent = req.headers['user-agent'] || '';
    const requestId = (req.headers['x-request-id'] as string) || '';
    const authenticatedSessionId = (req.headers['x-session-id'] as string) || '';

    return this.electronicSignService.verifyOtpAndAccept({
      lan,
      otpSessionId: body?.otpSessionId,
      otp: body?.otp,
      authenticatedCustomerId: customerId,
      ipAddress: ipEvidence.clientIp,
      forwardedFor: ipEvidence.forwardedFor || '',
      socketIp: ipEvidence.socketIp || '',
      xRealIp: ipEvidence.xRealIp || '',
      proxyHopCount: ipEvidence.proxyHopCount,
      ipEnvironment: ipEvidence.environment,
      isLoopback: ipEvidence.isLoopback,
      isPrivateIp: ipEvidence.isPrivate,
      isPublicIp: ipEvidence.isPublic,
      userAgent,
      requestId,
      authenticatedSessionId,
    });
  }

  @Get('status')
  async getStatus(
    @Param('lan') lan: string,
    @CurrentCustomer() customer: any,
  ) {
    const customerId = BigInt(customer.customerId);
    return this.electronicSignService.getSigningStatus(lan, customerId);
  }

  @Get('accepted-document')
  async downloadAcceptedDocument(
    @Param('lan') lan: string,
    @CurrentCustomer() customer: any,
    @Res() res: Response,
  ) {
    const customerId = BigInt(customer.customerId);
    const { buffer, filename } = await this.electronicSignService.getAcceptedDocument(lan, customerId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.send(buffer);
  }

  @Get('audit-certificate')
  async downloadAuditCertificate(
    @Param('lan') lan: string,
    @CurrentCustomer() customer: any,
    @Res() res: Response,
  ) {
    const customerId = BigInt(customer.customerId);
    const { buffer, filename } = await this.electronicSignService.getAuditCertificate(lan, customerId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.send(buffer);
  }
}
