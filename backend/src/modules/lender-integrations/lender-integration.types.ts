export type LenderAdapterErrorClassification =
  | 'TEMPORARY'
  | 'PERMANENT_VALIDATION'
  | 'AUTHENTICATION_CONFIGURATION'
  | 'BUSINESS_REJECTION'
  | 'UNKNOWN';

export type LenderHttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH';

export interface LenderIntegrationTransportConfig {
  lenderId: string;
  baseUrl: string | null;

  authType:
    | 'NONE'
    | 'API_KEY'
    | 'BEARER_TOKEN'
    | 'BASIC'
    | 'CUSTOM';

  clientId: string | null;
  credentialSecretReference: string | null;

  createApplicationPath: string | null;
  consentPath: string | null;
  updateApplicationPath: string | null;
  decisionPath: string | null;
  statusPath: string | null;
  documentUploadPath: string | null;
  disbursePath: string | null;
  // Servicing (post-disbursal): repayment/charge/waiver, all many-per-application.
  repaymentPath: string | null;
  chargePath: string | null;
  chargeWaiverPath: string | null;

  connectTimeoutMs: number;
  requestTimeoutMs: number;
}

export interface LenderAdapterCapabilities {
  separateConsentSubmission: boolean;
  detailsUpdate: boolean;
  documentUpload: boolean;
  decisionRequest: boolean;
  statusPolling: boolean;
  disbursement: boolean;
  repaymentNotification: boolean;
  chargeNotification: boolean;
  chargeWaiverNotification: boolean;
}

export interface LenderCreateApplicationContext {
  idempotencyKey: string;
  correlationId: string;
  payloadVersion: number;
  transport: LenderIntegrationTransportConfig;

  application: {
    applicationId: string;
    applicationReference: string;
    platformLan: string;
    platformProductId: string;
    requestedAmount: string | null;
    requestedTenure: number | null;
    tenureType: string | null;
    interestRate: string | null;
    processingFeePercent: string | null;
    scopeCode: string | null;
  };

  allocation: {
    lenderId: string;
    lenderProductId: string;
    productStrategyVersionId: string;
    externalProductCode: string;
    allocatedAt: string;
  };

  customer: {
    fullName: string | null;
    firstName: string | null;
    middleName: string | null;
    lastName: string | null;
    fatherName: string | null;
    mobileNumber: string;
    email: string | null;
    dateOfBirth: string | null;
    gender: string | null;

    panNumber: string | null;
    panVerified: boolean;
    panVerifiedAt: string | null;
    panProviderReference: string | null;
  };
}

export interface LenderCreateApplicationResult {
  acknowledged: boolean;
  providerStatus: string;
  partnerLeadId?: string | null;
  partnerApplicationId: string;
  partnerReference?: string | null;
}

export interface LenderConsentContext {
  idempotencyKey: string;
  correlationId: string;
  payloadVersion: number;
  transport: LenderIntegrationTransportConfig;

  partnerApplicationId: string;
  applicationReference: string;
  platformLan: string;

  consentId: string;
  consentType: string;
  consentTemplateId: string;
  consentVersion: string;
  consentTextHash: string;
  consentReference: string | null;
  acceptedAt: string;
  ipAddress: string | null;
  userAgentHash: string | null;
}

export interface LenderConsentResult {
  acknowledged: boolean;
  providerStatus: string;
  consentReference: string;
  acknowledgedAt: string;
}

export interface LenderCanonicalAddress {
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  locality: string | null;
  district: string | null;
  city: string;
  state: string;
  country: string;
  pincode: string;
  source: string;
}

export interface LenderUpdateApplicationContext {
  idempotencyKey: string;
  correlationId: string;
  payloadVersion: number;
  transport: LenderIntegrationTransportConfig;

  partnerApplicationId: string;
  applicationReference: string;
  platformLan: string;

  customer: {
    fullName: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    fatherName: string;
    panNumber: string;
    dateOfBirth: string;
    gender: string | null;
    mobileNumber: string;
    email: string | null;
  };

  employment: {
    employmentType: string;
    companyType: string | null;
    companyName: string | null;
    designation: string | null;
    businessName: string | null;
    businessConstitution: string | null;
    monthlyIncome: string;
    annualTurnover: string | null;
    employmentVintage: string | null;
    businessVintage: string | null;
    salaryMode: string | null;
    completedAt: string;
  };

  aadhaarKyc: {
    status: 'VERIFIED';
    maskedAadhaar: string;
    verifiedName: string;
    dateOfBirth: string | null;
    gender: string | null;
    provider: string;
    providerReference: string;
    verifiedAt: string;
  };

  liveness: {
    provider: string;
    providerTransactionId: string;
    status: 'VERIFIED';
    score: string | null;
    photoDocumentReference: string;
    evidenceReference: string | null;
    latitude: string | null;
    longitude: string | null;
    capturedAt: string;
    verifiedAt: string;
  };

  address: {
    permanent: LenderCanonicalAddress;
    current: LenderCanonicalAddress;
    currentAddressSameAsPermanent: boolean;
  };

  // Populated only once the customer has selected an offer within the lender's
  // pre-approval credit limit (staged profile update ahead of the final decision call).
  selectedOffer: {
    amount: string;
    tenure: number;
    selectedAt: string;
  } | null;

  // Populated only after backend-verified bank details exist for this application
  // (never sourced from raw frontend input — see LoanService/ExternalApiService).
  // accountNumber is decrypted from the stored ciphertext only when this context is
  // built, immediately before being sent to the lender — it must never be logged.
  bankDetails: {
    accountHolderName: string;
    accountNumber: string;
    accountNumberMasked: string;
    ifscCode: string;
    bankName: string;
    accountType: string;
    verifiedAt: string;
  } | null;

  // Populated only after the eNACH/mandate webhook has authorized the mandate.
  mandate: {
    umrn: string;
    provider: string;
    mandateType: string;
    authorizedAt: string;
  } | null;
}

export interface LenderUpdateApplicationResult {
  acknowledged: boolean;
  providerStatus: string;
  detailsVersion: number;
  acknowledgedAt: string;
  partnerReference?: string | null;
}

export type LenderPartnerDocumentType =
  | 'AADHAAR_XML'
  | 'AADHAAR_PDF'
  | 'SIGNED_LOAN_AGREEMENT';

export interface LenderDocumentCandidate {
  sourceDocumentId: string;
  sourceDocumentType: string;
  status: string;
  applicantType: string;
  fileName: string;
  originalFileName: string | null;
  mimeType: string;
  fileSize: number;
  source: string;
  capturedAt: string;
}

export interface LenderDocumentSelection {
  sourceDocumentId: string;
  documentType: LenderPartnerDocumentType;
}

export interface LenderDocumentUploadContext {
  idempotencyKey: string;
  correlationId: string;
  payloadVersion: number;
  transport: LenderIntegrationTransportConfig;

  partnerApplicationId: string;
  applicationReference: string;
  platformLan: string;

  documentType: LenderPartnerDocumentType;
  sourceDocumentId: string;

  fileName: string;
  mimeType: string;
  fileSize: number;
  fileSha256: string;
  contentBase64: string;

  source: string;
  capturedAt: string;
}

export interface LenderDocumentUploadResult {
  acknowledged: boolean;
  providerStatus: string;
  partnerDocumentId: string;
  documentType: LenderPartnerDocumentType;
  fileSha256: string;
  acknowledgedAt: string;
}

export interface LenderDecisionContext {
  idempotencyKey: string;
  correlationId: string;
  payloadVersion: number;
  transport: LenderIntegrationTransportConfig;

  partnerApplicationId: string;
  applicationReference: string;
  externalProductCode: string;
  profileComplete: boolean;

  bureauConsentReference: string;
  bureauConsentHash: string;

  lenderDecisionConsentReference: string;
  lenderDecisionConsentHash: string;
}

export interface LenderStatusContext {
  idempotencyKey: string;
  correlationId: string;
  payloadVersion: number;
  transport: LenderIntegrationTransportConfig;
  partnerApplicationId: string;
  applicationReference: string;
}

export interface LenderDecisionResult {
  decision: 'APPROVED' | 'REJECTED' | 'PENDING';
  providerStatus: string;
  decisionReference: string;
  approvedAmount?: string | null;
  approvedTenure?: number | null;
  approvedRoi?: string | null;
  rejectionReasonCode?: string | null;
  coolingOffDays?: number | null;
  nextStatusCheckAt?: string | null;
}

export type LenderStatusResult =
  LenderDecisionResult;

export interface LenderDisburseContext {
  idempotencyKey: string;
  correlationId: string;
  payloadVersion: number;
  transport: LenderIntegrationTransportConfig;

  partnerApplicationId: string;
  applicationReference: string;
  platformLan: string;

  // The final accepted loan amount to disburse — never the pre-approval credit
  // limit or the initial requested amount.
  amount: string;
  triggerFund: true;
}

export interface LenderDisburseResult {
  acknowledged: boolean;
  providerStatus: string;
  disbursalReference?: string | null;
}

// ── Servicing (post-disbursal) ──────────────────────────────────────────────
// Unlike CREATE/UPDATE/DECISION/DISBURSE (one-shot per application), a loan can
// have many repayments, many charges, and a charge can be waived more than once.
// Each context below corresponds to exactly one such event, not "the application's
// current state" — see LenderIntegrationOutbox.repaymentId/chargeId/chargeWaiverId.

export interface LenderRepaymentContext {
  idempotencyKey: string;
  correlationId: string;
  payloadVersion: number;
  transport: LenderIntegrationTransportConfig;

  partnerApplicationId: string;
  applicationReference: string;
  platformLan: string;

  amount: string;
  // Strict YYYY-MM-DD, not a full ISO-8601 datetime.
  paymentDate: string;
  paymentId: string;
  paymentMode: string;
  utr: string;
}

export interface LenderChargeContext {
  idempotencyKey: string;
  correlationId: string;
  payloadVersion: number;
  transport: LenderIntegrationTransportConfig;

  partnerApplicationId: string;
  applicationReference: string;
  platformLan: string;

  chargeType: string;
  amount: string;
  // Strict YYYY-MM-DD, not a full ISO-8601 datetime.
  dueDate: string;
  remarks: string | null;
}

export interface LenderChargeWaiverContext {
  idempotencyKey: string;
  correlationId: string;
  payloadVersion: number;
  transport: LenderIntegrationTransportConfig;

  partnerApplicationId: string;
  applicationReference: string;
  platformLan: string;

  chargeType: string;
  waiverAmount: string;
}

export interface LenderServicingResult {
  acknowledged: boolean;
  providerStatus: string;
}

export interface LenderWebhookVerificationInput {
  headers: Record<
    string,
    string | string[] | undefined
  >;
  rawBody: Buffer;
}

export interface VerifiedLenderWebhookResult {
  verified: boolean;
  providerEventId: string;
  partnerApplicationId: string;
  eventType: string;
  normalizedDecision?:
    LenderDecisionResult['decision'];
}

export interface LenderAdapter {
  readonly adapterKey: string;
  readonly adapterVersion: string;
  readonly capabilities: LenderAdapterCapabilities;

  createApplication(
    context: LenderCreateApplicationContext,
  ): Promise<LenderCreateApplicationResult>;

  submitConsent?(
    context: LenderConsentContext,
  ): Promise<LenderConsentResult>;

  updateApplication(
    context: LenderUpdateApplicationContext,
  ): Promise<LenderUpdateApplicationResult>;

  selectDocuments?(
    candidates: LenderDocumentCandidate[],
  ): LenderDocumentSelection[];

  uploadDocument?(
    context: LenderDocumentUploadContext,
  ): Promise<LenderDocumentUploadResult>;

  requestDecision?(
    context: LenderDecisionContext,
  ): Promise<LenderDecisionResult>;

  getStatus?(
    context: LenderStatusContext,
  ): Promise<LenderStatusResult>;

  verifyWebhook?(
    input: LenderWebhookVerificationInput,
  ): Promise<VerifiedLenderWebhookResult>;

  requestDisbursal?(
    context: LenderDisburseContext,
  ): Promise<LenderDisburseResult>;

  recordRepayment?(
    context: LenderRepaymentContext,
  ): Promise<LenderServicingResult>;

  addCharge?(
    context: LenderChargeContext,
  ): Promise<LenderServicingResult>;

  waiveCharge?(
    context: LenderChargeWaiverContext,
  ): Promise<LenderServicingResult>;
}