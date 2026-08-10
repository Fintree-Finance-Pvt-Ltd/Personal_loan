import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { StampOptions } from '../types/electronic-sign.types';
import { ELECTRONIC_SIGN_LEGAL_STATEMENT } from '../constants/electronic-sign.constants';

export const IP_DISCLAIMER_STATEMENT =
  'IP Address represents the public network address observed by the server during OTP verification. It may represent a mobile carrier, broadband connection, VPN, proxy or shared NAT gateway.';

@Injectable()
export class PdfStampService {
  private readonly logger = new Logger(PdfStampService.name);

  /**
   * Stamps visible electronic acceptance block on the last page and appends evidence page
   */
  async stampAndAppendEvidence(
    sourcePdfBuffer: Buffer,
    options: StampOptions,
    evidenceData: Record<string, any>,
  ): Promise<{ acceptedPdfBuffer: Buffer; signedPageNumber: number }> {
    const pdfDoc = await PDFDocument.load(sourcePdfBuffer);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pages = pdfDoc.getPages();
    const lastPageNumber = pages.length;
    const lastPage = pages[lastPageNumber - 1];
    const { width: pageWidth } = lastPage.getSize();

    // 1. Draw Visible Stamp on Last Page (if requested/needed)
    if (options.drawOverlay !== false) {
      const showEnvLabel =
        options.showEnvLabel ??
        (process.env.ELECTRONIC_SIGN_SHOW_ENVIRONMENT_LABEL === 'true' ||
          process.env.NODE_ENV !== 'production');

      const dateFormatted = new Intl.DateTimeFormat('en-IN', {
        timeZone: process.env.ELECTRONIC_SIGN_TIMEZONE || 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(options.signedAt);

      const lines = [
        `By: ${options.signerName.slice(0, 26)}`,
        `Date: ${dateFormatted} IST`,
        `IP: ${options.ipAddress || '127.0.0.1'}`,
      ];

      if (showEnvLabel) {
        lines.push('Environment: LOCAL DEVELOPMENT');
      }

      lines.push(`Ref: ${options.reference.slice(0, 24)}`);

      const stampWidth = 230;
      const stampHeight = showEnvLabel ? 95 : 85;
      const marginX = 28;
      const marginY = 28;
      const xPos = Math.max(10, pageWidth - stampWidth - marginX);
      const yPos = marginY;

      // Stamp Background Card
      lastPage.drawRectangle({
        x: xPos,
        y: yPos,
        width: stampWidth,
        height: stampHeight,
        color: rgb(0.95, 0.97, 1.0),
        borderColor: rgb(0.1, 0.35, 0.75),
        borderWidth: 1.5,
      });

      // Stamp Header
      lastPage.drawText('ELECTRONICALLY ACCEPTED', {
        x: xPos + 10,
        y: yPos + stampHeight - 16,
        size: 9,
        font: helveticaBold,
        color: rgb(0.05, 0.25, 0.65),
      });

      let currentY = yPos + stampHeight - 28;
      for (const line of lines) {
        lastPage.drawText(line, {
          x: xPos + 10,
          y: currentY,
          size: 7,
          font: helveticaFont,
          color: rgb(0.1, 0.15, 0.3),
        });
        currentY -= 10;
      }

      // Stamp Footer Text
      lastPage.drawText('OTP verified electronic acceptance', {
        x: xPos + 10,
        y: yPos + 6,
        size: 6.5,
        font: helveticaBold,
        color: rgb(0.75, 0.1, 0.1),
      });
    }

    // 2. Append Evidence Page
    const evidencePage = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width: evWidth, height: evHeight } = evidencePage.getSize();

    // Evidence Header
    evidencePage.drawRectangle({
      x: 30,
      y: evHeight - 75,
      width: evWidth - 60,
      height: 45,
      color: rgb(0.08, 0.22, 0.45),
    });

    evidencePage.drawText('ELECTRONIC ACCEPTANCE CERTIFICATE', {
      x: 45,
      y: evHeight - 55,
      size: 14,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });

    let evY = evHeight - 100;
    const drawSectionHeader = (title: string) => {
      evidencePage.drawText(title, {
        x: 35,
        y: evY,
        size: 10,
        font: helveticaBold,
        color: rgb(0.08, 0.22, 0.45),
      });
      evY -= 14;
    };

    const drawField = (label: string, val: string) => {
      evidencePage.drawText(`${label}:`, {
        x: 45,
        y: evY,
        size: 8,
        font: helveticaBold,
        color: rgb(0.2, 0.25, 0.35),
      });
      evidencePage.drawText(String(val || '—').slice(0, 75), {
        x: 185,
        y: evY,
        size: 8,
        font: helveticaFont,
        color: rgb(0.1, 0.1, 0.15),
      });
      evY -= 12;
    };

    drawSectionHeader('1. SIGNER & LOAN DETAILS');
    drawField('Signer Name', evidenceData.signerName);
    drawField('Masked Mobile', evidenceData.verifiedMobileMasked);
    drawField('Loan Account No (LAN)', evidenceData.lan);
    drawField('Application Ref', String(evidenceData.applicationId));
    drawField('Document Type', evidenceData.documentType);
    drawField('Document Version', evidenceData.documentVersion);
    evY -= 6;

    drawSectionHeader('2. ACCEPTANCE EVIDENCE & NETWORK METADATA');
    drawField('Signing Transaction Ref', evidenceData.transactionReference);
    drawField('Original Document SHA-256', evidenceData.originalDocumentHash);
    drawField('Consent Version', evidenceData.consentVersion);
    drawField('Document Viewed At', evidenceData.documentViewedAt || '—');
    drawField('OTP Sent At', evidenceData.otpSentAt || '—');
    drawField('OTP Verified At', evidenceData.otpVerifiedAt || '—');
    drawField('Accepted Timestamp', evidenceData.signedAt);
    drawField('Environment', evidenceData.ipEnvironment || (process.env.ELECTRONIC_SIGN_SHOW_ENVIRONMENT_LABEL === 'true' ? 'LOCAL DEVELOPMENT' : 'UAT/PRODUCTION'));
    drawField('IP Address (Resolved Client IP)', evidenceData.ipAddress);
    drawField('Forwarded IP Chain', evidenceData.forwardedFor || 'None');
    drawField('User Agent', evidenceData.userAgent);
    drawField('Request ID', evidenceData.requestId || '—');
    drawField('Authenticated Session ID', evidenceData.authenticatedSessionId || '—');
    drawField('Stamp Placement', `Page ${lastPageNumber} of ${lastPageNumber + 1}`);
    evY -= 6;

    drawSectionHeader('3. NETWORK IP DISCLAIMER');
    const ipDiscLines = this.wrapText(IP_DISCLAIMER_STATEMENT, 92);
    for (const ipLine of ipDiscLines) {
      evidencePage.drawText(ipLine, {
        x: 45,
        y: evY,
        size: 7.5,
        font: helveticaFont,
        color: rgb(0.2, 0.25, 0.35),
      });
      evY -= 10;
    }
    evY -= 6;

    drawSectionHeader('4. CONSENT STATEMENT');
    const consentLines = this.wrapText(evidenceData.consentText, 92);
    for (const cLine of consentLines) {
      evidencePage.drawText(cLine, {
        x: 45,
        y: evY,
        size: 7.5,
        font: helveticaFont,
        color: rgb(0.15, 0.15, 0.2),
      });
      evY -= 10;
    }
    evY -= 6;

    drawSectionHeader('5. LEGAL & COMPLIANCE STATEMENT');
    const legalLines = this.wrapText(ELECTRONIC_SIGN_LEGAL_STATEMENT, 92);
    for (const lLine of legalLines) {
      evidencePage.drawText(lLine, {
        x: 45,
        y: evY,
        size: 7.5,
        font: helveticaFont,
        color: rgb(0.3, 0.3, 0.35),
      });
      evY -= 10;
    }

    const modifiedPdfBytes = await pdfDoc.save();
    return {
      acceptedPdfBuffer: Buffer.from(modifiedPdfBytes),
      signedPageNumber: lastPageNumber,
    };
  }

  /**
   * Generates separate Audit Certificate PDF document
   */
  async generateAuditCertificate(evidenceData: Record<string, any>): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();

    page.drawRectangle({
      x: 30,
      y: height - 80,
      width: width - 60,
      height: 50,
      color: rgb(0.05, 0.2, 0.5),
    });

    page.drawText('ELECTRONIC ACCEPTANCE AUDIT CERTIFICATE', {
      x: 45,
      y: height - 58,
      size: 13,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    let y = height - 110;
    const addLine = (lbl: string, val: string) => {
      page.drawText(`${lbl}:`, { x: 45, y, size: 8.5, font: fontBold, color: rgb(0.1, 0.2, 0.4) });
      page.drawText(String(val || '—').slice(0, 75), { x: 180, y, size: 8.5, font, color: rgb(0.1, 0.1, 0.1) });
      y -= 14;
    };

    addLine('Transaction Reference', evidenceData.transactionReference);
    addLine('Loan Account No (LAN)', evidenceData.lan);
    addLine('Signer Name', evidenceData.signerName);
    addLine('Masked Mobile', evidenceData.verifiedMobileMasked);
    addLine('Document Type', evidenceData.documentType);
    addLine('Document Version', evidenceData.documentVersion);
    addLine('Original PDF Hash', evidenceData.originalDocumentHash);
    addLine('Accepted PDF Hash', evidenceData.acceptedDocumentHash);
    addLine('Environment', evidenceData.ipEnvironment || 'LOCAL DEVELOPMENT');
    addLine('IP Address (Resolved Client IP)', evidenceData.ipAddress);
    addLine('Forwarded IPs', evidenceData.forwardedFor || 'None');
    addLine('User Agent', evidenceData.userAgent);
    addLine('Session ID', evidenceData.authenticatedSessionId || '—');
    addLine('Request ID', evidenceData.requestId || '—');
    addLine('Document Viewed At', evidenceData.documentViewedAt || '—');
    addLine('OTP Sent At', evidenceData.otpSentAt || '—');
    addLine('OTP Verified At', evidenceData.otpVerifiedAt || '—');
    addLine('Signed Timestamp', evidenceData.signedAt);
    y -= 10;

    page.drawText('IP Network Disclaimer:', { x: 45, y, size: 9, font: fontBold, color: rgb(0.05, 0.2, 0.5) });
    y -= 13;
    const discLines = this.wrapText(IP_DISCLAIMER_STATEMENT, 90);
    for (const dLine of discLines) {
      page.drawText(dLine, { x: 45, y, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
      y -= 11;
    }
    y -= 8;

    page.drawText('Legal Statement:', { x: 45, y, size: 9, font: fontBold, color: rgb(0.05, 0.2, 0.5) });
    y -= 13;

    const legalLines = this.wrapText(ELECTRONIC_SIGN_LEGAL_STATEMENT, 90);
    for (const line of legalLines) {
      page.drawText(line, { x: 45, y, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
      y -= 11;
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  private wrapText(text: string, maxCharsPerLine: number): string[] {
    const words = String(text || '').split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }
}
