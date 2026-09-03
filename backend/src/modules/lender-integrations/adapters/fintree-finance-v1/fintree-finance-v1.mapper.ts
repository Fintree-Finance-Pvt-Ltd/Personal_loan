import { LenderIntegrationError } from '../../lender-integration.errors';
import {
  LenderChargeContext,
  LenderChargeWaiverContext,
  LenderConsentContext,
  LenderCreateApplicationContext,
  LenderDecisionContext,
  LenderDisburseContext,
  LenderDocumentCandidate,
  LenderDocumentSelection,
  LenderDocumentUploadContext,
  LenderRepaymentContext,
  LenderUpdateApplicationContext,
} from '../../lender-integration.types';

function requireString(
  value: string | null | undefined,
  fieldName: string,
): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new LenderIntegrationError(
      'FINTREE_REQUIRED_FIELD_MISSING',
      `Required Fintree field is missing: ${fieldName}`,
      'PERMANENT_VALIDATION',
    );
  }

  return normalized;
}

export function mapFintreeCreatePayload(
  context: LenderCreateApplicationContext,
) {
  if (!context.customer.panVerified) {
    throw new LenderIntegrationError(
      'FINTREE_PAN_NOT_VERIFIED',
      'Verified PAN is required before creating the Fintree application.',
      'PERMANENT_VALIDATION',
    );
  }

  const panNumber = requireString(
    context.customer.panNumber,
    'customer.panNumber',
  ).toUpperCase();

  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
    throw new LenderIntegrationError(
      'FINTREE_INVALID_PAN',
      'The verified PAN format is invalid.',
      'PERMANENT_VALIDATION',
    );
  }

  return {
    externalApplicationReference:
      requireString(
        context.application.applicationReference,
        'externalApplicationReference',
      ),

    lan:
      requireString(
        context.application.platformLan,
        'lan',
      ),

    sourceSystem: 'FINTREE_PLP',

    productCode:
      requireString(
        context.allocation.externalProductCode,
        'productCode',
      ),

    requestedAmount:
      requireString(
        context.application.requestedAmount,
        'requestedAmount',
      ),

    requestedTenure:
      context.application.requestedTenure,

    tenureType:
      context.application.tenureType,

    interestRate:
      context.application.interestRate,

    processingFeePercent:
      context.application.processingFeePercent,

    previousDisbursedApplicationCount:
      context.application.previousDisbursedApplicationCount,

    previousLoanAmount:
      context.application.previousLoanAmount,

    customer: {
      fullName:
        requireString(
          context.customer.fullName,
          'customer.fullName',
        ),

      firstName:
        requireString(
          context.customer.firstName,
          'customer.firstName',
        ),

      middleName:
        context.customer.middleName?.trim() || null,

      lastName:
        requireString(
          context.customer.lastName,
          'customer.lastName',
        ),

      fatherName:
        requireString(
          context.customer.fatherName,
          'customer.fatherName',
        ),

      panNumber,

      dateOfBirth:
        requireString(
          context.customer.dateOfBirth,
          'customer.dateOfBirth',
        ),

      gender:
        context.customer.gender,

      mobileNumber:
        context.customer.mobileNumber,

      email:
        context.customer.email,
    },

    panVerification: {
      verified: true,

      providerReference:
        context.customer.panProviderReference,

      verifiedAt:
        context.customer.panVerifiedAt,
    },
  };
}

export function mapFintreeConsentPayload(
  context: LenderConsentContext,
) {
  return {
    externalApplicationReference:
      requireString(
        context.applicationReference,
        'externalApplicationReference',
      ),

    lan:
      requireString(
        context.platformLan,
        'lan',
      ),

    // Was hardcoded to LENDER_DATA_SHARING, which was correct only while that was the
    // single consent ever sent. Every journey consent now has its own submission, so the
    // type must come from the context or they would all arrive indistinguishable.
    consentType:
      requireString(
        context.consentType,
        'consentType',
      ),

    consentId:
      requireString(
        context.consentId,
        'consentId',
      ),

    consentTemplateId:
      requireString(
        context.consentTemplateId,
        'consentTemplateId',
      ),

    consentVersion:
      requireString(
        context.consentVersion,
        'consentVersion',
      ),

    consentTextHash:
      requireString(
        context.consentTextHash,
        'consentTextHash',
      ),

    consentReference:
      context.consentReference,

    acceptedAt:
      requireString(
        context.acceptedAt,
        'acceptedAt',
      ),

    ipAddress:
      context.ipAddress,

    userAgentHash:
      context.userAgentHash,
  };
}

export function mapFintreeDetailsPayload(
  context: LenderUpdateApplicationContext,
) {
  return {
    externalApplicationReference:
      requireString(
        context.applicationReference,
        'externalApplicationReference',
      ),

    lan:
      requireString(
        context.platformLan,
        'lan',
      ),

    detailsVersion:
      context.payloadVersion,

    customer: {
      fullName:
        context.customer.fullName,

      firstName:
        context.customer.firstName,

      middleName:
        context.customer.middleName,

      lastName:
        context.customer.lastName,

      fatherName:
        context.customer.fatherName,

      panNumber:
        context.customer.panNumber,

      dateOfBirth:
        context.customer.dateOfBirth,

      gender:
        context.customer.gender,

      mobileNumber:
        context.customer.mobileNumber,

      email:
        context.customer.email,
    },

    employment: {
      employmentType:
        context.employment.employmentType,

      companyType:
        context.employment.companyType,

      companyName:
        context.employment.companyName,

      designation:
        context.employment.designation,

      businessName:
        context.employment.businessName,

      businessConstitution:
        context.employment.businessConstitution,

      monthlyIncome:
        context.employment.monthlyIncome,

      annualTurnover:
        context.employment.annualTurnover,

      employmentVintage:
        context.employment.employmentVintage,

      businessVintage:
        context.employment.businessVintage,

      salaryMode:
        context.employment.salaryMode,

      completedAt:
        context.employment.completedAt,
    },

    aadhaarKyc: {
      status: context.aadhaarKyc.status,

      maskedAadhaar:
        context.aadhaarKyc.maskedAadhaar,

      verifiedName:
        context.aadhaarKyc.verifiedName,

      dateOfBirth:
        context.aadhaarKyc.dateOfBirth,

      gender:
        context.aadhaarKyc.gender,

      provider:
        context.aadhaarKyc.provider,

      providerReference:
        context.aadhaarKyc.providerReference,

      verifiedAt:
        context.aadhaarKyc.verifiedAt,
    },

    permanentAddress: {
      addressLine1:
        context.address.permanent.addressLine1,

      addressLine2:
        context.address.permanent.addressLine2,

      landmark:
        context.address.permanent.landmark,

      locality:
        context.address.permanent.locality,

      district:
        context.address.permanent.district,

      city:
        context.address.permanent.city,

      state:
        context.address.permanent.state,

      country:
        context.address.permanent.country,

      pincode:
        context.address.permanent.pincode,

      source:
        context.address.permanent.source,
    },

    currentAddress: {
      sameAsPermanent:
        context.address
          .currentAddressSameAsPermanent,

      addressLine1:
        context.address.current.addressLine1,

      addressLine2:
        context.address.current.addressLine2,

      landmark:
        context.address.current.landmark,

      locality:
        context.address.current.locality,

      district:
        context.address.current.district,

      city:
        context.address.current.city,

      state:
        context.address.current.state,

      country:
        context.address.current.country,

      pincode:
        context.address.current.pincode,

      source:
        context.address.current.source,
    },

    currentAddressEvidence: {
      livePhotoDocumentReference:
        context.liveness.photoDocumentReference,

      livenessProvider:
        context.liveness.provider,

      livenessReference:
        context.liveness.providerTransactionId,

      livenessStatus:
        context.liveness.status,

      livenessScore:
        context.liveness.score,

      evidenceReference:
        context.liveness.evidenceReference,

      latitude:
        context.liveness.latitude,

      longitude:
        context.liveness.longitude,

      capturedAt:
        context.liveness.capturedAt,

      verifiedAt:
        context.liveness.verifiedAt,
    },

    selectedOffer: context.selectedOffer
      ? {
          amount: context.selectedOffer.amount,
          tenure: context.selectedOffer.tenure,
          selectedAt: context.selectedOffer.selectedAt,
        }
      : null,

    bankDetails: context.bankDetails
      ? {
          accountHolderName: context.bankDetails.accountHolderName,
          accountNumber: context.bankDetails.accountNumber,
          ifscCode: context.bankDetails.ifscCode,
          bankName: context.bankDetails.bankName,
          accountType: context.bankDetails.accountType,
          verifiedAt: context.bankDetails.verifiedAt,
        }
      : null,

    mandate: context.mandate
      ? {
          umrn: context.mandate.umrn,
          provider: context.mandate.provider,
          mandateType: context.mandate.mandateType,
          authorizedAt: context.mandate.authorizedAt,
        }
      : null,
  };
}

export function mapFintreeDecisionPayload(
  context: LenderDecisionContext,
) {
  return {
    externalApplicationReference:
      requireString(
        context.applicationReference,
        'externalApplicationReference',
      ),

    productCode:
      requireString(
        context.externalProductCode,
        'productCode',
      ),

    bureauConsent: {
      reference:
        requireString(
          context.bureauConsentReference,
          'bureauConsentReference',
        ),

      hash:
        requireString(
          context.bureauConsentHash,
          'bureauConsentHash',
        ),
    },

    decisionConsent: {
      reference:
        requireString(
          context.lenderDecisionConsentReference,
          'lenderDecisionConsentReference',
        ),

      hash:
        requireString(
          context.lenderDecisionConsentHash,
          'lenderDecisionConsentHash',
        ),
    },
  };
}

export function mapFintreeDisbursePayload(
  context: LenderDisburseContext,
) {
  return {
    externalApplicationReference:
      requireString(
        context.applicationReference,
        'externalApplicationReference',
      ),

    lan:
      requireString(
        context.platformLan,
        'lan',
      ),

    amount:
      requireString(
        context.amount,
        'amount',
      ),

    trigger_fund: context.triggerFund,
  };
}

export function mapFintreeRepaymentPayload(
  context: LenderRepaymentContext,
) {
  return {
    externalApplicationReference:
      requireString(
        context.applicationReference,
        'externalApplicationReference',
      ),

    lan:
      requireString(
        context.platformLan,
        'lan',
      ),

    amount:
      requireString(
        context.amount,
        'amount',
      ),

    paymentDate:
      requireString(
        context.paymentDate,
        'paymentDate',
      ),

    paymentId:
      requireString(
        context.paymentId,
        'paymentId',
      ),

    paymentMode:
      context.paymentMode,

    utr:
      context.utr,
  };
}

export function mapFintreeChargePayload(
  context: LenderChargeContext,
) {
  return {
    externalApplicationReference:
      requireString(
        context.applicationReference,
        'externalApplicationReference',
      ),

    lan:
      requireString(
        context.platformLan,
        'lan',
      ),

    chargeType:
      requireString(
        context.chargeType,
        'chargeType',
      ),

    amount:
      requireString(
        context.amount,
        'amount',
      ),

    dueDate:
      requireString(
        context.dueDate,
        'dueDate',
      ),

    remarks:
      context.remarks,
  };
}

export function mapFintreeChargeWaiverPayload(
  context: LenderChargeWaiverContext,
) {
  return {
    externalApplicationReference:
      requireString(
        context.applicationReference,
        'externalApplicationReference',
      ),

    lan:
      requireString(
        context.platformLan,
        'lan',
      ),

    chargeType:
      requireString(
        context.chargeType,
        'chargeType',
      ),

    waiverAmount:
      requireString(
        context.waiverAmount,
        'waiverAmount',
      ),
  };
}

export function selectFintreeDocuments(
  candidates: LenderDocumentCandidate[],
): LenderDocumentSelection[] {
  const selections: LenderDocumentSelection[] =
    [];

  for (const candidate of candidates) {
    if (candidate.status !== 'VERIFIED') {
      continue;
    }

    if (candidate.applicantType !== 'BORROWER') {
      continue;
    }

    if (
      candidate.sourceDocumentType !==
      'AADHAAR_CARD'
    ) {
      continue;
    }

    const mimeType =
      candidate.mimeType
        .trim()
        .toLowerCase();

    if (
      mimeType === 'application/xml' ||
      mimeType === 'text/xml'
    ) {
      selections.push({
        sourceDocumentId:
          candidate.sourceDocumentId,

        documentType:
          'AADHAAR_XML',
      });

      continue;
    }

    if (mimeType === 'application/pdf') {
      selections.push({
        sourceDocumentId:
          candidate.sourceDocumentId,

        documentType:
          'AADHAAR_PDF',
      });
    }
  }

  return selections;
}

export function mapFintreeDocumentPayload(
  context: LenderDocumentUploadContext,
) {
  return {
    externalApplicationReference:
      requireString(
        context.applicationReference,
        'externalApplicationReference',
      ),

    lan:
      requireString(
        context.platformLan,
        'lan',
      ),

    documentType:
      context.documentType,

    sourceDocumentId:
      context.sourceDocumentId,

    fileName:
      requireString(
        context.fileName,
        'fileName',
      ),

    mimeType:
      requireString(
        context.mimeType,
        'mimeType',
      ),

    fileSize:
      context.fileSize,

    fileSha256:
      requireString(
        context.fileSha256,
        'fileSha256',
      ),

    contentBase64:
      requireString(
        context.contentBase64,
        'contentBase64',
      ),

    source:
      requireString(
        context.source,
        'source',
      ),

    capturedAt:
      requireString(
        context.capturedAt,
        'capturedAt',
      ),
  };
}