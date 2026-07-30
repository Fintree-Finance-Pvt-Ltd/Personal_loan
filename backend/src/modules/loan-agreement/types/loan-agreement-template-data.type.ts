export interface DocumentDetails {
  agreementNumber: string;
  agreementVersion: string;
  language: 'EN';
  generatedAt: Date;
  generatedDateFormatted: string;
  originalDocumentHash?: string;
  pageFooterText?: string;
  confidentialityText?: string;
}

export interface AuthorizedSignatoryDetails {
  name?: string;
  designation?: string;
  signatureImagePath?: string;
  imageUrl?: string;
}

export interface GrievanceOfficerDetails {
  name: string;
  designation: string;
  address: string;
  contactNumber: string;
  email: string;
  availableFrom: string;
  availableTo: string;
}

export interface PrincipalNodalOfficerDetails {
  name: string;
  designation: string;
  address: string;
  contactNumber: string;
  email: string;
}

export interface LenderDetails {
  legalName: string;
  shortName: string;
  registeredAddress: string;
  supportEmail: string;
  website: string;
  customerCareNumber: string;
  authorizedSignatory: AuthorizedSignatoryDetails;
  grievanceOfficer: GrievanceOfficerDetails;
  principalNodalOfficer: PrincipalNodalOfficerDetails;
}

export interface BorrowerAddressDetails {
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  district?: string;
  state: string;
  pincode: string;
  country: string;
  formatted: string;
}

export interface BorrowerDetails {
  customerId: string;
  fullName: string;
  salutation?: string;
  fatherName?: string;
  dateOfBirth?: Date;
  panMasked?: string;
  mobile: string;
  maskedMobile: string;
  email: string;
  address: BorrowerAddressDetails;
  annualHouseholdIncome?: number;
  loanPurpose?: string;
}

export interface ApplicationDetails {
  applicationId: string;
  applicationNumber: string;
  applicationDate: Date;
  applicationDateFormatted: string;
  loanAccountNumber: string;
  proposalNumber?: string;
}

export interface LoanDetails {
  loanId: string;
  lan: string;
  loanType: string;
  productName: string;

  sanctionedAmount: number;
  sanctionedAmountFormatted: string;
  sanctionedAmountWords: string;

  tenureValue: number;
  tenureUnit: 'DAYS' | 'MONTHS' | 'YEARS';
  tenureFormatted: string;

  numberOfInstallments: number;
  installmentType: string;
  installmentFrequency: string;

  installmentAmount: number;
  installmentAmountFormatted: string;

  totalInterestAmount: number;
  totalInterestAmountFormatted: string;

  totalRepaymentAmount: number;
  totalRepaymentAmountFormatted: string;

  netDisbursedAmount: number;
  netDisbursedAmountFormatted: string;

  disbursementDate?: Date;
  firstRepaymentDate?: Date;
  finalDueDate?: Date;

  repaymentCommencementText: string;
  disbursementScheduleText: string;

  bulletRepayment: boolean;
}

export interface PricingDetails {
  annualInterestRate: number;
  annualInterestRateFormatted: string;
  interestType: 'FIXED' | 'FLOATING' | 'HYBRID';
  interestMethod: string;
  apr: number;
  aprFormatted: string;

  benchmarkRate?: number;
  spreadRate?: number;
  finalRate?: number;

  processingFeeRate?: number;
  processingFeeAmount: number;
  processingFeeAmountFormatted: string;

  gstRate?: number;
  processingFeeTaxAmount?: number;

  stampDutyAmount?: number;
  verificationCharges?: number;
  otherCharges?: number;
}

export interface BankDetails {
  bankName: string;
  branchName?: string;
  accountHolderName: string;
  maskedAccountNumber: string;
  ifscCode: string;
  accountType: string;
}

export interface MandateDetails {
  status: string;
  provider?: string;
  mandateType?: string;
  mandateReference?: string;
  mandateAmount?: number;
  mandateAmountFormatted?: string;
  frequency?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface ProcessingFeeItem {
  rate?: number;
  amount?: number;
  taxAmount?: number;
  payableTo: string;
  frequency: string;
}

export interface ThirdPartyFeeItem {
  name: string;
  amount: number;
  taxAmount?: number;
  payableTo: string;
  frequency: string;
}

export interface FeeDetails {
  processingFee: ProcessingFeeItem;
  thirdPartyFees: Array<ThirdPartyFeeItem>;
}

export interface PenalChargeItem {
  description: string;
  maximumRate?: number;
  minimumAmount?: number;
  maximumAmount?: number;
  applicableTaxText: string;
}

export interface BounceChargeItem {
  minimumAmount?: number;
  maximumAmount?: number;
  displayRange: string;
  chargeAmount: number;
}

export interface ForeclosureItem {
  applicable: boolean;
  rate?: number;
  description: string;
}

export interface ChargeDetails {
  penalCharge: PenalChargeItem;
  bounceCharges: Array<BounceChargeItem>;
  foreclosure: ForeclosureItem;
}

export interface KfsInstallmentDetails {
  type: string;
  count: number;
  amount: number;
  commencement: string;
}

export interface KfsInterestDetails {
  rate: number;
  type: string;
  benchmarkApplicable: boolean;
  benchmarkRate?: number;
  spread?: number;
  resetPeriodicity?: string;
}

export interface KfsDetails {
  loanProposalNumber: string;
  loanType: string;
  sanctionedAmount: number;
  disbursementInStages: boolean;
  disbursementSchedule: string;
  loanTerm: string;
  installment: KfsInstallmentDetails;
  interest: KfsInterestDetails;
  annualPercentageRate: number;
  recoveryAgentClauseNumber: string;
  grievanceClauseNumber: string;
  transferableOrSecuritisable: boolean;
  collaborativeLendingApplicable: boolean;
  coolingOffPeriodDays: number;
}

export interface AprDetails {
  sanctionedAmount: number;
  term: string;
  principalInstallmentCount: number;
  epiType: string;
  epiAmount: number;
  epiCount: number;
  capitalizedInterestInstallments?: number;
  repaymentCommencement: string;
  interestRateType: string;
  interestRate: number;
  totalInterestAmount: number;
  feePayableToRe: number;
  thirdPartyFee: number;
  netDisbursedAmount: number;
  totalAmountPayable: number;
  annualPercentageRate: number;
  dueDate?: Date;
}

export interface RepaymentRow {
  installmentNumber: number;
  dueDate?: Date;
  dueDateFormatted?: string;
  openingPrincipal?: number;
  principal: number;
  interest: number;
  fees: number;
  installmentAmount: number;
  closingPrincipal?: number;
}

export interface IllustrativeAprRow {
  installmentNumber: number;
  outstandingPrincipal: number;
  principal: number;
  interest: number;
  installmentAmount: number;
}

export interface ScheduleDetails {
  repayments: Array<RepaymentRow>;
  illustrativeAprSchedule: Array<IllustrativeAprRow>;
}

export interface CoolingOffDetails {
  days: number;
  startEventText: string;
  cancellationEmail: string;
  penaltyFree: boolean;
  proportionateInterestPayable: boolean;
  policyText: string;
}

export interface GrievanceDetails {
  officerName: string;
  officerDesignation: string;
  officerAddress: string;
  officerContact: string;
  officerEmail: string;
  resolutionDays: number;
  principalNodalOfficerName: string;
  principalNodalOfficerAddress: string;
  principalNodalOfficerContact: string;
  principalNodalOfficerEmail: string;
  policyUrl: string;
}

export interface RecoveryDetails {
  methods: Array<string>;
  communicationStartTime: string;
  communicationEndTime: string;
  recoveryAgentClause: string;
  legalNoticeAllowed: boolean;
  arbitrationAllowed: boolean;
  civilActionAllowed: boolean;
  criminalActionAllowed: boolean;
}

export interface DeclarationDetails {
  householdIncomeConfirmed: boolean;
  annualHouseholdIncome: number;
  microfinanceExcluded: boolean;
  vernacularApplicable: boolean;
  vernacularLanguage?: string;
  explainedByEmployeeName?: string;
  employeeAddress?: string;
  endUsePurpose: string;
  endUseUndertakingApplicable: boolean;
  selfDeclarationAccepted: boolean;
}

export interface ElectronicAcceptanceDetails {
  completed: boolean;
  signerName: string;
  maskedMobile: string;
  acceptedAt?: Date;
  acceptedAtFormatted?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  sessionReference?: string;
  transactionReference?: string;
  originalDocumentHash?: string;
  acceptedDocumentHash?: string;
  consentText?: string;
  consentVersion?: string;
  signedPageNumber?: number;
  environmentLabel?: string;
  stampHeading: string;
  stampFooterText: string;
}

export interface BorrowerAgreementTemplateData {
  document: DocumentDetails;
  lender: LenderDetails;
  borrower: BorrowerDetails;
  application: ApplicationDetails;
  loan: LoanDetails;
  pricing: PricingDetails;
  bank: BankDetails;
  mandate: MandateDetails;
  kfs: KfsDetails;
  apr: AprDetails;
  fees: FeeDetails;
  charges: ChargeDetails;
  schedules: ScheduleDetails;
  coolingOff: CoolingOffDetails;
  grievance: GrievanceDetails;
  recovery: RecoveryDetails;
  declarations: DeclarationDetails;
  electronicAcceptance?: ElectronicAcceptanceDetails;
  authorizedSignatory: AuthorizedSignatoryDetails;
  authorizedSignatoryImage?: string;
}
