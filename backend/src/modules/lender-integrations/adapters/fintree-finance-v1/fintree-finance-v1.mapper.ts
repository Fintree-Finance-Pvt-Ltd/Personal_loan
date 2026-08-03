import {
  LenderCreateApplicationContext,
  LenderConsentContext,
  LenderUpdateApplicationContext,
  LenderDecisionContext,
} from '../../lender-integration.types';

export function mapFintreeCreatePayload(context: LenderCreateApplicationContext) {
  return {
    applicationReference: context.application.applicationReference,
    productCode: context.allocation.externalProductCode,
    pan: context.customer.panNumber,
    assessmentFeePaid: true, // As per requirement, Fintree demands this true if outbox fires
  };
}

export function mapFintreeConsentPayload(context: LenderConsentContext) {
  return {
    consentTemplateId: context.consentTemplateId,
    consentVersion: context.consentVersion,
    consentTextHash: context.consentTextHash,
    acceptedAt: context.acceptedAt,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  };
}

export function mapFintreeProfilePayload(context: LenderUpdateApplicationContext) {
  return {
    employment: context.employment,
    verification: context.verification,
    address: context.address,
  };
}

export function mapFintreePreApprovalPayload(context: LenderDecisionContext) {
  return {
    // Missing upstream fields mapping (No explicit mapped fields right now based on context provided, 
    // we may need fields from context that aren't mapped yet).
    // Note: If any Fintree required field is missing, it should be documented.
    // Based on the user requirements, the PRE_APPROVAL payload is currently empty.
  };
}
