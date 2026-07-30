import { Injectable } from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

@Injectable()
export class AgreementDocumentService {
  /**
   * Generates authoritative loan agreement PDF buffer from backend loan & customer data
   */
  async generateLoanAgreementPdf(loan: any): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    // Header
    page.drawRectangle({
      x: 30,
      y: height - 70,
      width: width - 60,
      height: 40,
      color: rgb(0.08, 0.2, 0.45),
    });

    page.drawText('PERSONAL LOAN AGREEMENT', {
      x: 45,
      y: height - 52,
      size: 14,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    let y = height - 100;

    const addSection = (title: string) => {
      page.drawText(title, { x: 35, y, size: 10, font: fontBold, color: rgb(0.08, 0.2, 0.45) });
      y -= 15;
    };

    const addField = (lbl: string, val: string) => {
      page.drawText(`${lbl}:`, { x: 45, y, size: 8.5, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
      page.drawText(String(val || '—'), { x: 200, y, size: 8.5, font, color: rgb(0.1, 0.1, 0.15) });
      y -= 13;
    };

    addSection('1. PARTIES TO THE AGREEMENT');
    addField('Lender Name', 'Fintree Finance Pvt Ltd');
    addField('Borrower Full Name', loan.customer?.fullName || loan.bankAccountHolderName || 'Borrower');
    addField('Customer Mobile', loan.customer?.mobileNumber || '—');
    addField('Customer Email', loan.customer?.email || '—');
    addField('PAN Number', loan.customer?.panNumber || '—');
    y -= 10;

    addSection('2. LOAN TERMS & SANCTION DETAILS');
    addField('Loan Account No (LAN)', loan.lan);
    addField('Approved Loan Amount', `INR ${Number(loan.approvedAmount || 0).toLocaleString('en-IN')}`);
    addField('Tenure (Months / Days)', `${loan.acceptedTenureDays || 365} Days`);
    addField('Interest Rate (p.a.)', `${loan.acceptedInterestRate || 18}%`);
    addField('Monthly EMI Amount', `INR ${Number(loan.acceptedEmiAmount || 0).toLocaleString('en-IN')}`);
    addField('Total Repayment Amount', `INR ${Number(loan.acceptedTotalRepayment || 0).toLocaleString('en-IN')}`);
    y -= 10;

    addSection('3. REPAYMENT & BANK DETAILS');
    addField('Disbursal & Auto-Debit Bank', loan.bankName || loan.bankVerification?.bankName || 'Verified Bank');
    addField('Bank Account Number', loan.bankAccountMasked || '—');
    addField('Bank IFSC Code', loan.bankIfsc || '—');
    addField('Auto-Debit Mandate Status', loan.mandateCompleted ? 'AUTHORIZED' : 'PENDING');
    y -= 10;

    addSection('4. GENERAL TERMS & ACKNOWLEDGMENT');
    const terms = [
      '1. The Borrower agrees to repay the loan in accordance with the specified EMI schedule.',
      '2. Interest shall be calculated on daily reducing balance method as per agreed interest rate.',
      '3. Penal charges of 2% per month will be applicable on overdue EMI repayments.',
      '4. The Borrower confirms that all information provided during application is accurate.',
      '5. This agreement is executed electronically upon OTP verification by the Borrower.',
    ];

    for (const term of terms) {
      page.drawText(term, { x: 45, y, size: 8, font, color: rgb(0.15, 0.15, 0.2) });
      y -= 12;
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}
