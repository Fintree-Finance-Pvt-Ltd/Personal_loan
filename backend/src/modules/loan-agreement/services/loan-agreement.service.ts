import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { sharedPdfRenderer } from '../../../common/pdf/pdf-renderer';
import { LoanAgreementDataBuilder } from '../builders/loan-agreement-data.builder';
import { registerHandlebarsHelpers } from '../helpers/handlebars-helpers';

@Injectable()
export class LoanAgreementService implements OnModuleDestroy {
  private readonly logger = new Logger(LoanAgreementService.name);
  private compiledTemplate: Handlebars.TemplateDelegate | null = null;

  // PDF rendering (one shared, bounded Chromium) lives in common/pdf/pdf-renderer.ts.

  constructor(private readonly dataBuilder: LoanAgreementDataBuilder) {
    registerHandlebarsHelpers();
  }

  async onModuleDestroy() {
    await sharedPdfRenderer.close();
  }

  private getTemplate(): Handlebars.TemplateDelegate {
    if (!this.compiledTemplate || process.env.NODE_ENV !== 'production') {
      const templatePath = path.resolve(__dirname, '..', 'templates', 'borrower-agreement-en.hbs');
      let templateSource: string;

      if (fs.existsSync(templatePath)) {
        templateSource = fs.readFileSync(templatePath, 'utf8');
      } else {
        // Fallback for src / build directory resolution
        const fallbackPath = path.resolve(
          process.cwd(),
          'src',
          'modules',
          'loan-agreement',
          'templates',
          'borrower-agreement-en.hbs',
        );
        templateSource = fs.readFileSync(fallbackPath, 'utf8');
      }

      this.compiledTemplate = Handlebars.compile(templateSource);
    }
    return this.compiledTemplate;
  }

  async generateAgreementHtml(lan: string, customerId?: bigint): Promise<string> {
    const data = await this.dataBuilder.buildForLoan({ lan, authenticatedCustomerId: customerId });
    const template = this.getTemplate();
    return template(data);
  }

  async generateAgreementPdf(lan: string, customerId?: bigint): Promise<Buffer> {
    const html = await this.generateAgreementHtml(lan, customerId);
    return sharedPdfRenderer.render(html, {
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '14mm',
        right: '13mm',
        bottom: '16mm',
        left: '13mm',
      },
    });
  }
}
