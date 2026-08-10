import { Injectable, Logger } from '@nestjs/common';
import { LoanAgreementService } from '../../loan-agreement/services/loan-agreement.service';

@Injectable()
export class AgreementDocumentService {
  private readonly logger = new Logger(AgreementDocumentService.name);

  constructor(private readonly loanAgreementService: LoanAgreementService) {}

  /**
   * Generates authoritative loan agreement PDF buffer from backend loan & customer data
   * using Handlebars HTML template & Puppeteer A4 PDF rendering engine.
   */
  async generateLoanAgreementPdf(loan: any): Promise<Buffer> {
    try {
      if (loan?.lan) {
        return await this.loanAgreementService.generateAgreementPdf(
          loan.lan,
          loan.customerId ? BigInt(loan.customerId) : undefined,
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `Puppeteer agreement PDF generation fallback due to: ${err?.message}`,
      );
    }

    // Fallback if Puppeteer is unlaunchable on lightweight environment
    return this.loanAgreementService.generateAgreementPdf(loan.lan);
  }
}
