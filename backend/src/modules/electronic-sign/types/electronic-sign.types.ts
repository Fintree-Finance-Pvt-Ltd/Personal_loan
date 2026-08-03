export interface PrepareElectronicSignInput {
  loanId: bigint;
  customerId: bigint;
  applicationId: bigint;
  lan: string;
  documentType: 'LOAN_AGREEMENT' | 'SANCTION_LETTER' | 'KFS_ACKNOWLEDGEMENT' | 'OTHER';
  documentVersion: string;
  sourcePdfBuffer?: Buffer;
  sourceDocumentPath?: string;
  signerName: string;
  verifiedMobileNumber: string;
  consentText: string;
  consentVersion: string;
  metadata?: Record<string, unknown>;
}

export interface VerifyOtpAndAcceptInput {
  lan: string;
  otpSessionId: string;
  otp: string;
  authenticatedCustomerId: bigint;
  ipAddress?: string;
  forwardedFor?: string;
  userAgent?: string;
  requestId?: string;
  authenticatedSessionId?: string;
  socketIp?: string;
  xRealIp?: string;
  proxyHopCount?: number;
  ipEnvironment?: string;
  isLoopback?: boolean;
  isPrivateIp?: boolean;
  isPublicIp?: boolean;
}

export interface StampOptions {
  signerName: string;
  signedAt: Date;
  ipAddress?: string;
  lan: string;
  reference: string;
  environment?: string;
  showEnvLabel?: boolean;
  drawOverlay?: boolean;
}
