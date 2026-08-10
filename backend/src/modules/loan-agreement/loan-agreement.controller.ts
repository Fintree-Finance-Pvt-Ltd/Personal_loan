import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { LoanAgreementService } from './services/loan-agreement.service';
import { CustomerProtected } from '../auth/decorators/customer-protected.decorator';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@CustomerProtected()
@Controller('customer/loans/:lan/agreement')
export class LoanAgreementController {
  constructor(
    private readonly loanAgreementService: LoanAgreementService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generateAgreement(
    @Param('lan') lan: string,
    @CurrentCustomer() customer: any,
  ) {
    const customerId = BigInt(customer.customerId);
    const html = await this.loanAgreementService.generateAgreementHtml(lan, customerId);
    return {
      success: true,
      lan,
      templateVersion: '1.0',
      htmlLength: html.length,
    };
  }

  @Get('preview')
  async previewAgreement(
    @Param('lan') lan: string,
    @CurrentCustomer() customer: any,
    @Res() res: Response,
  ) {
    const customerId = BigInt(customer.customerId);
    const pdfBuffer = await this.loanAgreementService.generateAgreementPdf(lan, customerId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Agreement_${lan}_v1.pdf"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.send(pdfBuffer);
  }

  @Get('download')
  async downloadAgreement(
    @Param('lan') lan: string,
    @CurrentCustomer() customer: any,
    @Res() res: Response,
  ) {
    const customerId = BigInt(customer.customerId);
    const pdfBuffer = await this.loanAgreementService.generateAgreementPdf(lan, customerId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Agreement_${lan}_v1.pdf"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.send(pdfBuffer);
  }

  @Get('status')
  async getAgreementStatus(
    @Param('lan') lan: string,
    @CurrentCustomer() customer: any,
  ) {
    const customerId = BigInt(customer.customerId);
    const loan = await this.prisma.plLoan.findFirst({
      where: { lan, customerId },
      include: { electronicSignTransactions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!loan) {
      throw new NotFoundException(`Loan ${lan} not found.`);
    }

    const esignTx = loan.electronicSignTransactions?.[0];

    return {
      success: true,
      lan,
      templateCode: 'BORROWER_AGREEMENT_EN',
      templateVersion: '1.0',
      status: esignTx?.status || 'NOT_STARTED',
      originalDocumentHash: esignTx?.originalDocumentHash || null,
      acceptedDocumentHash: esignTx?.acceptedDocumentHash || null,
    };
  }
}
