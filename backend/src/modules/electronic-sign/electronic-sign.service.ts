import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AgreementDocumentService } from './services/agreement-document.service';
import { PdfStampService } from './services/pdf-stamp.service';
import { SigningStorageService } from './services/signing-storage.service';
import { OtpSignService } from './services/otp-sign.service';
import { SigningEvidenceService } from './services/signing-evidence.service';
import { calculateSha256 } from './helpers/pdf-hash.helper';
import { generateStorageFilename } from './helpers/filename.helper';
import { PrepareElectronicSignInput, VerifyOtpAndAcceptInput } from './types/electronic-sign.types';
import { DEFAULT_CONSENT_TEXT, DEFAULT_CONSENT_VERSION } from './constants/electronic-sign.constants';
import { PlElectronicSignStatus, PlElectronicSignDocumentType } from '@prisma/client';

@Injectable()
export class ElectronicSignService {
  private readonly logger = new Logger(ElectronicSignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agreementDocumentService: AgreementDocumentService,
    private readonly pdfStampService: PdfStampService,
    private readonly signingStorageService: SigningStorageService,
    private readonly otpSignService: OtpSignService,
    private readonly signingEvidenceService: SigningEvidenceService,
  ) {}

  /**
   * 1. Prepare Document for Signing
   */
  async prepareDocument(input: PrepareElectronicSignInput) {
    const loan = await this.prisma.plLoan.findFirst({
      where: { id: input.loanId, customerId: input.customerId },
      include: { customer: true, bankVerification: true },
    });

    if (!loan) {
      throw new NotFoundException('Loan account not found or does not belong to customer.');
    }

    if (!loan.mandateCompleted) {
      throw new BadRequestException('Please complete e-Mandate authorization before eSign.');
    }

    // Check for existing transaction for this loan, documentType, and documentVersion
    const docTypeEnum = (input.documentType || 'LOAN_AGREEMENT') as PlElectronicSignDocumentType;
    const docVersion = input.documentVersion || 'v1';

    let existingTx = await this.prisma.plElectronicSignTransaction.findFirst({
      where: { loanId: loan.id, documentType: docTypeEnum, documentVersion: docVersion },
    });

    if (existingTx && existingTx.status === 'SIGNED') {
      return {
        status: existingTx.status,
        transactionReference: `ESIGN_${loan.lan}_${existingTx.id}`,
        documentType: existingTx.documentType,
        documentVersion: existingTx.documentVersion,
        signedAt: existingTx.signedAt,
        signedPageNumber: existingTx.signedPageNumber,
        acceptedDocumentAvailable: Boolean(existingTx.acceptedDocumentPath),
        auditCertificateAvailable: Boolean(existingTx.auditCertificatePath),
      };
    }

    // Generate or load PDF Buffer
    let sourcePdfBuffer = input.sourcePdfBuffer;
    if (!sourcePdfBuffer && input.sourceDocumentPath) {
      try {
        sourcePdfBuffer = this.signingStorageService.readBuffer(input.sourceDocumentPath);
      } catch {}
    }
    if (!sourcePdfBuffer && existingTx?.originalDocumentPath) {
      try {
        sourcePdfBuffer = this.signingStorageService.readBuffer(existingTx.originalDocumentPath);
      } catch {}
    }
    if (!sourcePdfBuffer) {
      sourcePdfBuffer = await this.agreementDocumentService.generateLoanAgreementPdf(loan);
    }

    const docHash = calculateSha256(sourcePdfBuffer);
    const docSize = BigInt(sourcePdfBuffer.length);

    // Save original PDF to protected storage if file is new or updated
    let originalPath = existingTx?.originalDocumentPath;
    if (!originalPath || !existingTx) {
      const filename = generateStorageFilename(loan.lan, docVersion, 'original');
      originalPath = this.signingStorageService.saveBuffer(filename, sourcePdfBuffer);
    } else {
      // Keep file on disk in sync with docHash
      this.signingStorageService.saveBuffer(path.basename(originalPath), sourcePdfBuffer);
    }

    const signerName = input.signerName || loan.customer?.fullName || 'Borrower';
    const mobile = input.verifiedMobileNumber || loan.customer?.mobileNumber || '9876543210';
    const maskedMobile = this.otpSignService.maskMobile(mobile);

    if (existingTx) {
      // Do not overwrite if OTP is already verified or signing in progress
      if (existingTx.status === 'OTP_VERIFIED' || existingTx.status === 'SIGNING') {
        throw new BadRequestException('Signing is in progress. Cannot modify agreement document.');
      }

      existingTx = await this.prisma.plElectronicSignTransaction.update({
        where: { id: existingTx.id },
        data: {
          originalDocumentPath: originalPath,
          originalDocumentHash: docHash,
          originalDocumentSize: docSize,
          signerName,
          verifiedMobileMasked: maskedMobile,
          status: 'DOCUMENT_READY',
          updatedAt: new Date(),
        },
      });
    } else {
      existingTx = await this.prisma.plElectronicSignTransaction.create({
        data: {
          loanId: loan.id,
          customerId: loan.customerId,
          applicationId: loan.applicationId,
          lan: loan.lan,
          documentType: docTypeEnum,
          documentVersion: docVersion,
          originalDocumentPath: originalPath,
          originalDocumentHash: docHash,
          originalDocumentSize: docSize,
          signerName,
          verifiedMobileMasked: maskedMobile,
          consentText: input.consentText || DEFAULT_CONSENT_TEXT,
          consentVersion: input.consentVersion || DEFAULT_CONSENT_VERSION,
          status: 'DOCUMENT_READY',
        },
      });
    }

    await this.signingEvidenceService.recordAuditEvent('ELECTRONIC_SIGN_DOCUMENT_GENERATED', loan.id, {
      lan: loan.lan,
      documentType: docTypeEnum,
      documentHash: docHash,
    });

    return {
      status: existingTx.status,
      transactionId: existingTx.id.toString(),
      lan: existingTx.lan,
      documentType: existingTx.documentType,
      documentVersion: existingTx.documentVersion,
      originalDocumentHash: existingTx.originalDocumentHash,
      signerName: existingTx.signerName,
      maskedMobile: existingTx.verifiedMobileMasked,
      consentText: existingTx.consentText,
      consentVersion: existingTx.consentVersion,
    };
  }

  /**
   * 2. Mark Document Viewed
   */
  async markDocumentViewed(lan: string, customerId: bigint) {
    const tx = await this.prisma.plElectronicSignTransaction.findFirst({
      where: { lan, customerId },
      orderBy: { createdAt: 'desc' },
    });

    if (!tx) {
      throw new NotFoundException('Electronic sign transaction not found.');
    }

    if (tx.status === 'SIGNED') {
      return { success: true, status: tx.status, documentViewedAt: tx.documentViewedAt };
    }

    const updated = await this.prisma.plElectronicSignTransaction.update({
      where: { id: tx.id },
      data: {
        documentViewedAt: tx.documentViewedAt || new Date(),
        status: tx.status === 'CREATED' || tx.status === 'DOCUMENT_READY' ? 'DOCUMENT_VIEWED' : tx.status,
      },
    });

    await this.signingEvidenceService.recordAuditEvent('ELECTRONIC_SIGN_DOCUMENT_VIEWED', tx.loanId, {
      lan,
      transactionId: tx.id.toString(),
    });

    return {
      success: true,
      status: updated.status,
      documentViewedAt: updated.documentViewedAt,
    };
  }

  /**
   * 3. Send Signing OTP
   */
  async sendSigningOtp(lan: string, customerId: bigint, consentAccepted: boolean) {
    if (!consentAccepted) {
      throw new BadRequestException('Please accept the electronic agreement consent before requesting OTP.');
    }

    const tx = await this.prisma.plElectronicSignTransaction.findFirst({
      where: { lan, customerId },
      orderBy: { createdAt: 'desc' },
      include: { loan: { include: { customer: true } } },
    });

    if (!tx) {
      throw new NotFoundException('Electronic sign transaction not initialized.');
    }

    if (tx.status === 'SIGNED') {
      throw new BadRequestException('Agreement has already been signed.');
    }

    if (!tx.documentViewedAt && tx.status !== 'OTP_SENT') {
      throw new BadRequestException('Please view the agreement document before requesting OTP.');
    }

    // Rate limiting / resend delay check (60s)
    if (tx.otpSentAt) {
      const elapsedMs = Date.now() - new Date(tx.otpSentAt).getTime();
      if (elapsedMs < 60000) {
        const remainingSec = Math.ceil((60000 - elapsedMs) / 1000);
        throw new BadRequestException(`Please wait ${remainingSec} seconds before requesting a new OTP.`);
      }
    }

    // Max resends check (3 max)
    if (tx.otpResendCount >= 3) {
      throw new BadRequestException('Maximum OTP resend attempts reached for this session.');
    }

    // Verify document hash integrity before sending OTP
    const currentBuffer = this.signingStorageService.readBuffer(tx.originalDocumentPath);
    const currentHash = calculateSha256(currentBuffer);
    if (currentHash !== tx.originalDocumentHash) {
      throw new BadRequestException('The agreement document has changed. Please regenerate the agreement.');
    }

    // Generate secure 6-digit OTP
    const rawOtp = this.otpSignService.generateOtp();
    const otpHash = this.otpSignService.hashOtp(rawOtp);
    const otpSessionId = this.otpSignService.generateOtpSessionId(lan);
    const otpExpiresAt = new Date(Date.now() + 300000); // 5 minutes

    // Deliver SMS OTP via project's SmsService
    const mobileToUse = tx.loan?.customer?.mobileNumber || tx.verifiedMobileMasked;
    await this.otpSignService.deliverOtp(mobileToUse, rawOtp);

    // In development mode, log OTP for verification ease
    this.logger.log(`[DEVELOPMENT ONLY] Electronic Sign OTP for ${lan} (${tx.verifiedMobileMasked}): ${rawOtp}`);

    await this.prisma.plElectronicSignTransaction.update({
      where: { id: tx.id },
      data: {
        otpSessionId,
        otpHash,
        otpSentAt: new Date(),
        otpExpiresAt,
        otpFailedAttempts: 0,
        otpResendCount: tx.otpSentAt ? tx.otpResendCount + 1 : tx.otpResendCount,
        consentedAt: tx.consentedAt || new Date(),
        status: 'OTP_SENT',
      },
    });

    await this.signingEvidenceService.recordAuditEvent('ELECTRONIC_SIGN_OTP_SENT', tx.loanId, {
      lan,
      otpSessionId,
      maskedMobile: tx.verifiedMobileMasked,
    });

    return {
      status: 'OTP_SENT',
      otpSessionId,
      maskedMobile: tx.verifiedMobileMasked,
      expiresInSeconds: 300,
      resendAfterSeconds: 60,
    };
  }

  /**
   * 4. Verify OTP and Execute Electronic Acceptance
   */
  async verifyOtpAndAccept(input: VerifyOtpAndAcceptInput) {
    const tx = await this.prisma.plElectronicSignTransaction.findFirst({
      where: { lan: input.lan, customerId: input.authenticatedCustomerId },
      orderBy: { createdAt: 'desc' },
      include: { loan: { include: { customer: true } } },
    });

    if (!tx) {
      throw new NotFoundException('Signing transaction not found for this loan.');
    }

    // Idempotent check: if already SIGNED, return existing result
    if (tx.status === 'SIGNED') {
      return {
        status: 'SIGNED',
        transactionReference: `ESIGN_${tx.lan}_${tx.id}`,
        documentType: tx.documentType,
        documentVersion: tx.documentVersion,
        documentViewedAt: tx.documentViewedAt,
        signedAt: tx.signedAt,
        signedPageNumber: tx.signedPageNumber,
        maskedMobile: tx.verifiedMobileMasked,
        acceptedDocumentAvailable: Boolean(tx.acceptedDocumentPath),
        auditCertificateAvailable: Boolean(tx.auditCertificatePath),
      };
    }

    if (!tx.otpSessionId || tx.otpSessionId !== input.otpSessionId) {
      throw new BadRequestException('Invalid OTP session ID.');
    }

    if (!tx.otpExpiresAt || new Date() > new Date(tx.otpExpiresAt)) {
      throw new BadRequestException('OTP has expired. Please request a new OTP.');
    }

    if (tx.otpFailedAttempts >= 5) {
      throw new BadRequestException('Maximum failed OTP attempts exceeded. Please request a new OTP.');
    }

    // Verify OTP Hash
    const isValidOtp = this.otpSignService.verifyOtpHash(input.otp, tx.otpHash || '');
    if (!isValidOtp) {
      await this.prisma.plElectronicSignTransaction.update({
        where: { id: tx.id },
        data: { otpFailedAttempts: tx.otpFailedAttempts + 1 },
      });

      await this.signingEvidenceService.recordAuditEvent('ELECTRONIC_SIGN_OTP_FAILED', tx.loanId, {
        lan: input.lan,
        attempts: tx.otpFailedAttempts + 1,
      });

      throw new BadRequestException(`Invalid OTP. Remaining attempts: ${4 - tx.otpFailedAttempts}`);
    }

    // Atomic Concurrency Lock: Transition OTP_SENT -> SIGNING
    const lockUpdate = await this.prisma.plElectronicSignTransaction.updateMany({
      where: { id: tx.id, status: 'OTP_SENT' },
      data: { status: 'SIGNING', otpVerifiedAt: new Date() },
    });

    if (lockUpdate.count === 0 && tx.status !== 'SIGNING') {
      throw new BadRequestException('Signing is already being processed or has completed.');
    }

    // Reload original PDF and verify document integrity hash
    const originalPdfBuffer = this.signingStorageService.readBuffer(tx.originalDocumentPath);
    const recalculatedHash = calculateSha256(originalPdfBuffer);

    if (recalculatedHash !== tx.originalDocumentHash) {
      await this.prisma.plElectronicSignTransaction.update({
        where: { id: tx.id },
        data: { status: 'FAILED', failureReason: 'Original document hash mismatch' },
      });
      throw new BadRequestException('The agreement document has changed. Please regenerate the agreement.');
    }

    const now = new Date();
    const transactionRef = `ESIGN_${tx.lan}_${tx.id}_${now.getTime().toString().slice(-6)}`;

    // Prepare Evidence Metadata
    const showEnvLabel = process.env.ELECTRONIC_SIGN_SHOW_ENVIRONMENT_LABEL === 'true';
    const evidenceData = {
      signerName: tx.signerName,
      verifiedMobileMasked: tx.verifiedMobileMasked,
      lan: tx.lan,
      applicationId: tx.applicationId.toString(),
      documentType: tx.documentType,
      documentVersion: tx.documentVersion,
      originalDocumentHash: tx.originalDocumentHash,
      transactionReference: transactionRef,
      consentVersion: tx.consentVersion,
      consentText: tx.consentText,
      documentViewedAt: tx.documentViewedAt?.toISOString() || null,
      otpSentAt: tx.otpSentAt?.toISOString() || null,
      otpVerifiedAt: now.toISOString(),
      signedAt: now.toISOString(),
      ipAddress: input.ipAddress || '127.0.0.1',
      forwardedFor: input.forwardedFor || '',
      socketIp: input.socketIp || '',
      xRealIp: input.xRealIp || '',
      proxyHopCount: input.proxyHopCount || 0,
      ipEnvironment: input.ipEnvironment || (showEnvLabel ? 'LOCAL DEVELOPMENT' : 'UAT/PRODUCTION'),
      isLoopback: input.isLoopback ?? true,
      isPrivate: input.isPrivateIp ?? true,
      isPublic: input.isPublicIp ?? false,
      userAgent: input.userAgent || '',
      requestId: input.requestId || '',
      authenticatedSessionId: input.authenticatedSessionId || '',
    };

    // Generate Stamped PDF & Append Evidence Page using PdfStampService
    const { acceptedPdfBuffer, signedPageNumber } = await this.pdfStampService.stampAndAppendEvidence(
      originalPdfBuffer,
      {
        signerName: tx.signerName,
        signedAt: now,
        ipAddress: input.ipAddress,
        lan: tx.lan,
        reference: transactionRef,
        environment: evidenceData.ipEnvironment,
        showEnvLabel,
      },
      evidenceData,
    );

    const acceptedDocHash = calculateSha256(acceptedPdfBuffer);
    const acceptedDocSize = BigInt(acceptedPdfBuffer.length);

    // Save Accepted PDF file
    const acceptedFilename = generateStorageFilename(tx.lan, tx.documentVersion, 'accepted');
    const acceptedDocPath = this.signingStorageService.saveBuffer(acceptedFilename, acceptedPdfBuffer);

    // Generate & Save Audit Certificate PDF
    const auditCertBuffer = await this.pdfStampService.generateAuditCertificate({
      ...evidenceData,
      acceptedDocumentHash: acceptedDocHash,
    });

    const auditCertHash = calculateSha256(auditCertBuffer);
    const auditCertFilename = generateStorageFilename(tx.lan, tx.documentVersion, 'audit');
    const auditCertPath = this.signingStorageService.saveBuffer(auditCertFilename, auditCertBuffer);

    const evidenceJson = this.signingEvidenceService.buildEvidenceJson({
      ...evidenceData,
      acceptedDocumentHash: acceptedDocHash,
      auditCertificateHash: auditCertHash,
      signedPageNumber,
    });

    // Database Atomic Commit (Prisma Transaction)
    await this.prisma.$transaction([
      this.prisma.plElectronicSignTransaction.update({
        where: { id: tx.id },
        data: {
          acceptedDocumentPath: acceptedDocPath,
          acceptedDocumentHash: acceptedDocHash,
          acceptedDocumentSize: acceptedDocSize,
          auditCertificatePath: auditCertPath,
          auditCertificateHash: auditCertHash,
          ipAddress: input.ipAddress,
          forwardedFor: input.forwardedFor,
          userAgent: input.userAgent,
          requestId: input.requestId,
          authenticatedSessionId: input.authenticatedSessionId,
          signedPageNumber,
          signedAt: now,
          status: 'SIGNED',
          evidenceJson,
        },
      }),
      this.prisma.plLoan.update({
        where: { id: tx.loanId },
        data: {
          esignCompleted: true,
          esignCompletedAt: now,
          esignStatus: 'SIGNED',
          electronicSignStatus: 'SIGNED',
          electronicSignReference: transactionRef,
          electronicSignedAt: now,
          currentStep: 'READY_FOR_DISBURSAL',
        },
      }),
    ]);

    await this.signingEvidenceService.recordAuditEvent('ELECTRONIC_SIGN_COMPLETED', tx.loanId, {
      lan: tx.lan,
      transactionRef,
      acceptedDocumentHash: acceptedDocHash,
      signedPageNumber,
    });

    return {
      status: 'SIGNED',
      transactionReference: transactionRef,
      documentType: tx.documentType,
      documentVersion: tx.documentVersion,
      documentViewedAt: tx.documentViewedAt,
      signedAt: now,
      signedPageNumber,
      maskedMobile: tx.verifiedMobileMasked,
      acceptedDocumentAvailable: true,
      auditCertificateAvailable: true,
    };
  }

  /**
   * 5. Get Signing Status
   */
  async getSigningStatus(lan: string, customerId: bigint) {
    const tx = await this.prisma.plElectronicSignTransaction.findFirst({
      where: { lan, customerId },
      orderBy: { createdAt: 'desc' },
    });

    if (!tx) {
      return { status: 'NOT_STARTED', lan };
    }

    return {
      status: tx.status,
      transactionReference: tx.signedAt ? `ESIGN_${tx.lan}_${tx.id}` : null,
      documentType: tx.documentType,
      documentVersion: tx.documentVersion,
      documentViewedAt: tx.documentViewedAt,
      signedAt: tx.signedAt,
      signedPageNumber: tx.signedPageNumber,
      maskedMobile: tx.verifiedMobileMasked,
      acceptedDocumentAvailable: Boolean(tx.acceptedDocumentPath),
      auditCertificateAvailable: Boolean(tx.auditCertificatePath),
    };
  }

  /**
   * 6. Get Original Document Buffer
   */
  async getOriginalDocument(lan: string, customerId: bigint): Promise<{ buffer: Buffer; filename: string }> {
    const tx = await this.prisma.plElectronicSignTransaction.findFirst({
      where: { lan, customerId },
      orderBy: { createdAt: 'desc' },
    });

    if (!tx || !tx.originalDocumentPath) {
      throw new NotFoundException('Original agreement document not found.');
    }

    const buffer = this.signingStorageService.readBuffer(tx.originalDocumentPath);
    return { buffer, filename: `Agreement_${lan}_Original.pdf` };
  }

  /**
   * 7. Get Accepted Document Buffer
   */
  async getAcceptedDocument(lan: string, customerId: bigint): Promise<{ buffer: Buffer; filename: string }> {
    const tx = await this.prisma.plElectronicSignTransaction.findFirst({
      where: { lan, customerId },
      orderBy: { createdAt: 'desc' },
    });

    if (!tx || !tx.acceptedDocumentPath || tx.status !== 'SIGNED') {
      throw new NotFoundException('Accepted agreement document not found or signing not complete.');
    }

    const buffer = this.signingStorageService.readBuffer(tx.acceptedDocumentPath);
    return { buffer, filename: `Agreement_${lan}_Accepted.pdf` };
  }

  /**
   * 8. Get Audit Certificate Buffer
   */
  async getAuditCertificate(lan: string, customerId: bigint): Promise<{ buffer: Buffer; filename: string }> {
    const tx = await this.prisma.plElectronicSignTransaction.findFirst({
      where: { lan, customerId },
      orderBy: { createdAt: 'desc' },
    });

    if (!tx || !tx.auditCertificatePath || tx.status !== 'SIGNED') {
      throw new NotFoundException('Audit certificate document not found or signing not complete.');
    }

    const buffer = this.signingStorageService.readBuffer(tx.auditCertificatePath);
    return { buffer, filename: `Audit_Certificate_${lan}.pdf` };
  }
}
