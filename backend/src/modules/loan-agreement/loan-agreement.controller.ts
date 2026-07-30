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
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LoanAgreementService } from './services/loan-agreement.service';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Public()
@Controller('customer/loans/:lan/agreement')
export class LoanAgreementController {
  constructor(
    private readonly loanAgreementService: LoanAgreementService,
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

    const loan = await this.prisma.plLoan.findFirst({
      where: { lan },
      select: { customerId: true },
    });

    if (!loan) {
      throw new NotFoundException(`Loan account ${lan} not found.`);
    }

    return loan.customerId;
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generateAgreement(
    @Param('lan') lan: string,
    @Query('customerId') queryCustId: string,
    @Req() req: Request,
  ) {
    const customerId = await this.resolveCustomerId(lan, req, queryCustId);
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
    @Query('customerId') queryCustId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const customerId = await this.resolveCustomerId(lan, req, queryCustId);
    const pdfBuffer = await this.loanAgreementService.generateAgreementPdf(lan, customerId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Agreement_${lan}_v1.pdf"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.send(pdfBuffer);
  }

  @Get('download')
  async downloadAgreement(
    @Param('lan') lan: string,
    @Query('customerId') queryCustId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const customerId = await this.resolveCustomerId(lan, req, queryCustId);
    const pdfBuffer = await this.loanAgreementService.generateAgreementPdf(lan, customerId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Agreement_${lan}_v1.pdf"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.send(pdfBuffer);
  }

  @Get('status')
  async getAgreementStatus(
    @Param('lan') lan: string,
    @Query('customerId') queryCustId: string,
    @Req() req: Request,
  ) {
    const customerId = await this.resolveCustomerId(lan, req, queryCustId);
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
