import { PolicyRuleCategory, PolicyRuleValueType, PolicyRuleOperator } from '@prisma/client';

export interface CatalogRuleDef {
  ruleCode: string;
  ruleName: string;
  category: PolicyRuleCategory;
  inputKey: string;
  valueType: PolicyRuleValueType;
  supportedOperators: PolicyRuleOperator[];
  isMandatory: boolean;
  description: string;
}

export const POLICY_RULE_CATALOG: Record<string, CatalogRuleDef> = {
  PAN_VERIFIED: {
    ruleCode: 'PAN_VERIFIED',
    ruleName: 'PAN Verification Status',
    category: 'IDENTITY',
    inputKey: 'isPanVerified',
    valueType: 'BOOLEAN',
    supportedOperators: ['IS_TRUE', 'EQUALS'],
    isMandatory: true,
    description: 'Ensures the borrower PAN is verified.',
  },
  MINIMUM_AGE: {
    ruleCode: 'MINIMUM_AGE',
    ruleName: 'Minimum Age',
    category: 'DEMOGRAPHIC',
    inputKey: 'dateOfBirth',
    valueType: 'INTEGER',
    supportedOperators: ['GREATER_THAN_OR_EQUAL', 'GREATER_THAN'],
    isMandatory: true,
    description: 'Minimum age of the applicant in completed calendar years.',
  },
  MAXIMUM_AGE: {
    ruleCode: 'MAXIMUM_AGE',
    ruleName: 'Maximum Age',
    category: 'DEMOGRAPHIC',
    inputKey: 'dateOfBirth',
    valueType: 'INTEGER',
    supportedOperators: ['LESS_THAN_OR_EQUAL', 'LESS_THAN'],
    isMandatory: true,
    description: 'Maximum age of the applicant in completed calendar years.',
  },
  PIN_SERVICEABLE: {
    ruleCode: 'PIN_SERVICEABLE',
    ruleName: 'Pincode Serviceable',
    category: 'GEOGRAPHY',
    inputKey: 'residentialPincode',
    valueType: 'STRING_ARRAY', 
    supportedOperators: ['IN'],
    isMandatory: true,
    description: 'Checks if the residential pincode is serviceable.',
  },
  MINIMUM_MONTHLY_INCOME: {
    ruleCode: 'MINIMUM_MONTHLY_INCOME',
    ruleName: 'Minimum Monthly Income',
    category: 'INCOME',
    inputKey: 'declaredMonthlyIncome',
    valueType: 'DECIMAL',
    supportedOperators: ['GREATER_THAN_OR_EQUAL'],
    isMandatory: false,
    description: 'Minimum declared monthly income of the applicant.',
  },
  MINIMUM_EMPLOYMENT_MONTHS: {
    ruleCode: 'MINIMUM_EMPLOYMENT_MONTHS',
    ruleName: 'Minimum Employment Vintage (Months)',
    category: 'EMPLOYMENT',
    inputKey: 'employmentVintageMonths',
    valueType: 'INTEGER',
    supportedOperators: ['GREATER_THAN_OR_EQUAL'],
    isMandatory: false,
    description: 'Minimum number of months the applicant has been employed.',
  },
  NO_ACTIVE_APPLICATION: {
    ruleCode: 'NO_ACTIVE_APPLICATION',
    ruleName: 'No Active Loan Application',
    category: 'EXPOSURE',
    inputKey: 'hasActiveApplication',
    valueType: 'BOOLEAN',
    supportedOperators: ['IS_FALSE', 'EQUALS'],
    isMandatory: true,
    description: 'Ensures the applicant does not have an active platform application.',
  },
  NO_FRAUD_FLAG: {
    ruleCode: 'NO_FRAUD_FLAG',
    ruleName: 'No Fraud Flags',
    category: 'FRAUD',
    inputKey: 'hasFraudFlag',
    valueType: 'BOOLEAN',
    supportedOperators: ['IS_FALSE', 'EQUALS'],
    isMandatory: true,
    description: 'Ensures the applicant is not flagged for fraud on the platform.',
  },
  MAXIMUM_ACTIVE_LOANS: {
    ruleCode: 'MAXIMUM_ACTIVE_LOANS',
    ruleName: 'Maximum Active Loans',
    category: 'EXPOSURE',
    inputKey: 'activeLoanCount',
    valueType: 'INTEGER',
    supportedOperators: ['LESS_THAN_OR_EQUAL'],
    isMandatory: false,
    description: 'Maximum number of active loans allowed for the applicant.',
  },
  MAXIMUM_OVERDUE_AMOUNT: {
    ruleCode: 'MAXIMUM_OVERDUE_AMOUNT',
    ruleName: 'Maximum Internal Overdue Amount',
    category: 'PERFORMANCE',
    inputKey: 'internalOverdueAmount',
    valueType: 'DECIMAL',
    supportedOperators: ['LESS_THAN_OR_EQUAL'],
    isMandatory: false,
    description: 'Maximum permitted overdue amount on platform loans.',
  },
  COOLING_OFF_DAYS: {
    ruleCode: 'COOLING_OFF_DAYS',
    ruleName: 'Application Cooldown Period (Days)',
    category: 'COOLDOWN',
    inputKey: 'daysSinceLastRejection',
    valueType: 'INTEGER',
    supportedOperators: ['GREATER_THAN_OR_EQUAL'],
    isMandatory: false,
    description: 'Days since last application rejection.',
  }
};
