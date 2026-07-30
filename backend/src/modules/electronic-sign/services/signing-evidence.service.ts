import { Injectable } from '@nestjs/common';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { randomBytes } from 'crypto';

@Injectable()
export class SigningEvidenceService {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  buildEvidenceJson(data: Record<string, any>): string {
    const sanitized = {
      signerName: data.signerName,
      verifiedMobileMasked: data.verifiedMobileMasked,
      lan: data.lan,
      applicationId: String(data.applicationId),
      documentType: data.documentType,
      documentVersion: data.documentVersion,
      originalDocumentHash: data.originalDocumentHash,
      acceptedDocumentHash: data.acceptedDocumentHash,
      auditCertificateHash: data.auditCertificateHash,
      transactionReference: data.transactionReference,
      consentVersion: data.consentVersion,
      consentText: data.consentText,
      documentViewedAt: data.documentViewedAt,
      otpSentAt: data.otpSentAt,
      otpVerifiedAt: data.otpVerifiedAt,
      signedAt: data.signedAt,
      ipAddress: data.ipAddress,
      forwardedFor: data.forwardedFor,
      userAgent: data.userAgent,
      requestId: data.requestId,
      authenticatedSessionId: data.authenticatedSessionId,
      signedPageNumber: data.signedPageNumber,
    };
    return JSON.stringify(sanitized);
  }

  async recordAuditEvent(action: string, loanId: bigint, details: Record<string, any>) {
    try {
      await this.auditLogsService.record({
        actorUserId: null,
        module: 'LOAN',
        action,
        entityType: 'PlElectronicSignTransaction',
        entityId: loanId.toString(),
        outcome: 'SUCCESS',
        newValue: details,
        requestId: details.requestId || randomBytes(16).toString('hex'),
      });
    } catch {
      // Non-blocking audit logging
    }
  }
}
