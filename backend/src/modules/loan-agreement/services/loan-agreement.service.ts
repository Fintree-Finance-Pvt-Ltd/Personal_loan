import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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

    const pdfBufferBytes = await sharedPdfRenderer.render(html, {
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
    });

    // Stamp bottom footer: Borrower (left) and For Fintree Finance Pvt Ltd (right)
    const pdfDoc = await PDFDocument.load(pdfBufferBytes);
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const pages = pdfDoc.getPages();

    for (const p of pages) {
      const { width } = p.getSize();
      // Thin horizontal rule above footer text
      p.drawLine({
        start: { x: 38, y: 26 },
        end: { x: width - 38, y: 26 },
        thickness: 0.5,
        color: rgb(0.65, 0.65, 0.65),
      });
      // Left footer: Borrower
      p.drawText('Borrower', {
        x: 38,
        y: 14,
        size: 8,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
      // Right footer: For Fintree Finance Pvt Ltd
      const rightText = 'For Fintree Finance Pvt Ltd';
      const textWidth = font.widthOfTextAtSize(rightText, 8);
      p.drawText(rightText, {
        x: width - 38 - textWidth,
        y: 14,
        size: 8,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
    }

    const stampedBytes = await pdfDoc.save();
    return Buffer.from(stampedBytes);
  }
}
