// ──────────────────────────────────────────────────────────────────────────
// Partner API – DTOs (Data Transfer Objects)
// ──────────────────────────────────────────────────────────────────────────
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  IsArray,
  ValidateNested,
  IsIP,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── Create Application ────────────────────────────────────────────────────

export class CreatePartnerApplicationDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  externalApplicationReference: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  sourceSystem: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  productCode: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+91[6-9]\d{9}$/, { message: 'mobileNumber must be a valid Indian mobile number in E.164 format.' })
  mobileNumber: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  firstName?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  lastName?: string | null;
}

// ── Consent ───────────────────────────────────────────────────────────────

export class ConsentItemDto {
  @IsString()
  @IsNotEmpty()
  consentTemplateId: string;

  @IsString()
  @IsNotEmpty()
  consentVersion: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'consentTextHash must be a lowercase hex SHA-256 hash.' })
  consentTextHash: string;

  @IsString()
  @IsNotEmpty()
  consentType: string;

  @IsString()
  @IsNotEmpty()
  consentReference: string;

  @IsISO8601()
  acceptedAt: string;

  @IsIP()
  ipAddress: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'userAgentHash must be a lowercase hex SHA-256 hash.' })
  userAgentHash: string;
}

export class RecordConsentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsentItemDto)
  consents: ConsentItemDto[];
}

// ── Profile ───────────────────────────────────────────────────────────────

export class AddressDto {
  @IsString()
  @IsNotEmpty()
  addressLine1: string;

  @IsOptional()
  @IsString()
  addressLine2?: string | null;

  @IsOptional()
  @IsString()
  landmark?: string | null;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'pincode must be exactly 6 digits.' })
  pincode: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsEnum(['PERMANENT', 'CURRENT', 'CORRESPONDENCE'])
  addressType: string;
}

export class EmploymentDto {
  @IsEnum(['SALARIED', 'SELF_EMPLOYED_PROFESSIONAL', 'SELF_EMPLOYED_BUSINESS', 'OTHER'])
  employmentType: string;

  @IsOptional()
  @IsString()
  companyName?: string | null;

  @IsOptional()
  @IsString()
  designation?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'monthlyIncome must be a decimal number with up to 2 decimal places.' })
  monthlyIncome?: string | null;
}

export class VerificationDto {
  @IsString()
  @IsNotEmpty()
  panNumber: string;

  @IsBoolean()
  panVerified: boolean;

  @IsOptional()
  @IsString()
  aadhaarReference?: string | null;

  @IsOptional()
  @IsString()
  digilockerReference?: string | null;

  @IsOptional()
  @IsString()
  livenessReference?: string | null;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  firstName?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  lastName?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  dateOfBirth?: string | null;

  @IsOptional()
  @IsEnum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  gender?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddressDto)
  addresses?: AddressDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => EmploymentDto)
  employment?: EmploymentDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => VerificationDto)
  verification?: VerificationDto | null;
}

// ── Pre-Approval ──────────────────────────────────────────────────────────

export class RequestPreApprovalDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'requestedAmount must be a decimal with up to 2 decimal places.' })
  requestedAmount?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(360)
  requestedTenureMonths?: number | null;
}

// ── Onboarding ────────────────────────────────────────────────────────────

export class BankVerificationDto {
  @IsString()
  @IsNotEmpty()
  verificationReference: string;

  @IsString()
  @IsNotEmpty()
  bankName: string;

  @IsString()
  @IsNotEmpty()
  accountNumberMasked: string;

  @IsString()
  @IsNotEmpty()
  ifscCode: string;

  @IsEnum(['PENNY_DROP', 'BANK_STATEMENT', 'NET_BANKING'])
  verificationMethod: string;

  @IsISO8601()
  verifiedAt: string;
}

export class EsignVerificationDto {
  @IsString()
  @IsNotEmpty()
  signingReference: string;

  @IsEnum(['AADHAAR_ESIGN', 'DSC', 'CLICK_WRAP'])
  signingMethod: string;

  @IsISO8601()
  signedAt: string;
}

export class KfsAcknowledgementDto {
  @IsString()
  @IsNotEmpty()
  kfsReference: string;

  @IsString()
  @IsNotEmpty()
  kfsVersion: string;

  @IsISO8601()
  acknowledgedAt: string;
}

export class UpdateOnboardingDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => BankVerificationDto)
  bankVerification?: BankVerificationDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => EsignVerificationDto)
  esignVerification?: EsignVerificationDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => KfsAcknowledgementDto)
  kfsAcknowledgement?: KfsAcknowledgementDto | null;

  @IsBoolean()
  markComplete: boolean;
}

// ── Mandate ───────────────────────────────────────────────────────────────

export class AuthorizeMandateDto {
  @IsEnum(['EASEBUZZ', 'RAZORPAY', 'CASHFREE', 'DIGIO'])
  provider: string;

  @IsString()
  @IsNotEmpty()
  mandateReference: string;

  @IsString()
  @IsNotEmpty()
  umrn: string;

  @IsEnum(['AUTHORIZED', 'ACTIVE'])
  status: string;

  @IsISO8601()
  authorizedAt: string;
}

// ── Disbursement ──────────────────────────────────────────────────────────

export class RequestDisbursementDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  disbursementReference: string;
}
