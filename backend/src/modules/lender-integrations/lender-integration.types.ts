export type LenderAdapterErrorClassification =
  | 'TEMPORARY'
  | 'PERMANENT_VALIDATION'
  | 'AUTHENTICATION_CONFIGURATION'
  | 'BUSINESS_REJECTION'
  | 'UNKNOWN';

export interface LenderIntegrationTransportConfig {
  lenderId: string;
  baseUrl: string | null;
  authType: 'NONE' | 'API_KEY' | 'BEARER_TOKEN' | 'BASIC' | 'CUSTOM';
  credentialSecretReference: string | null;
  createApplicationPath: string | null;
  updateApplicationPath: string | null;
  decisionPath: string | null;
  statusPath: string | null;
  connectTimeoutMs: number;
  requestTimeoutMs: number;
}

export interface LenderCreateApplicationContext {
  idempotencyKey: string;
  correlationId: string;
  payloadVersion: number;
  transport: LenderIntegrationTransportConfig;
  application: {
    applicationId: string;
    applicationReference: string;
    platformProductId: string;
    requestedAmount: string | null;
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
    mobileNumber: string;
    email: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    panNumber: string | null;
    panVerified: boolean;
  };
  assessmentFee: {
    baseAmount: string;
    gstRate: string;
    gstAmount: string;
    totalAmount: string;
    currency: string;
    providerTransactionId: string;
    paymentReference: string | null;
    paidAt: string;
  };
  consent: {
    consentVersion: string;
    consentTextHash: string;
    consentReference: string | null;
    acceptedAt: string;
    ipAddress: string | null;
    userAgent: string | null;
    allocatedLenderId: string;
  };
}

export interface LenderUpdateApplicationContext {
  idempotencyKey: string;
  correlationId: string;
  payloadVersion: number;
  transport: LenderIntegrationTransportConfig;
  partnerApplicationId: string;
  applicationReference: string;
  employment: {
    employmentType: string | null;
    companyName: string | null;
    designation: string | null;
    businessName: string | null;
    businessConstitution: string | null;
    monthlyIncome: string | null;
    employmentVintage: string | null;
    businessVintage: string | null;
    salaryMode: string | null;
  };
  verification: {
    photoDocumentReference: string;
    livenessReference: string;
    livenessStatus: string;
    digilockerReference: string;
    digilockerStatus: string;
    verifiedKycName: string | null;
  };
  address: {
    permanent: LenderCanonicalAddress;
    current: LenderCanonicalAddress;
    currentAddressSameAsPermanent: boolean;
  };
  consent: {
    consentTemplateId: string;
    consentVersion: string;
    consentTextHash: string;
    acceptedAt: string;
  };
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

export interface LenderWebhookVerificationInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
}

export interface VerifiedLenderWebhookResult {
  verified: boolean;
  providerEventId: string;
  partnerApplicationId: string;
  eventType: string;
  normalizedDecision?: LenderDecisionResult['decision'];
}

export interface LenderCreateApplicationResult {
  acknowledged: boolean;
  providerStatus: string;
  partnerLeadId?: string | null;
  partnerApplicationId?: string | null;
  partnerReference?: string | null;
}

export interface LenderUpdateApplicationResult {
  acknowledged: boolean;
  providerStatus: string;
  partnerReference?: string | null;
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

export type LenderStatusResult = LenderDecisionResult;

export interface LenderAdapter {
  readonly adapterKey: string;
  readonly adapterVersion: string;
  createApplication(context: LenderCreateApplicationContext): Promise<LenderCreateApplicationResult>;
  updateApplication(context: LenderUpdateApplicationContext): Promise<LenderUpdateApplicationResult>;
  requestDecision(context: LenderDecisionContext): Promise<LenderDecisionResult>;
  getStatus?(context: LenderStatusContext): Promise<LenderStatusResult>;
  verifyWebhook?(input: LenderWebhookVerificationInput): Promise<VerifiedLenderWebhookResult>;
}
