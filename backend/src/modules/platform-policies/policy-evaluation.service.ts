import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformPolicyRule, PolicyRuleOperator, PolicyRuleValueType, PolicyDecisionOutcome } from '@prisma/client';

export type PolicyInputMap = Record<string, any>;

export interface RuleEvaluationResult {
  ruleCode: string;
  ruleName: string;
  outcome: PolicyDecisionOutcome | 'POLICY_INPUT_MISSING';
  message?: string;
  reasonCode?: string;
  inputValue?: any;
  expectedValue?: any;
}

export interface PolicyEvaluationResult {
  finalOutcome: PolicyDecisionOutcome | 'POLICY_INPUT_MISSING';
  evaluationDateUsed: string;
  ruleResults: RuleEvaluationResult[];
}

@Injectable()
export class PolicyEvaluationService {
  private readonly logger = new Logger(PolicyEvaluationService.name);

  public evaluate(
    rules: PlatformPolicyRule[],
    inputs: PolicyInputMap,
    evaluationDateInput?: string
  ): PolicyEvaluationResult {
    const activeRules = rules.filter(r => r.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

    // Use date-only for evaluation date to ensure stability across timezones
    const evalDateStr = evaluationDateInput
      ? new Date(evaluationDateInput).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const ruleResults: RuleEvaluationResult[] = [];
    let finalOutcome: PolicyDecisionOutcome | 'POLICY_INPUT_MISSING' = PolicyDecisionOutcome.PASS;

    for (const rule of activeRules) {
      const inputVal = inputs[rule.inputKey];

      // Calculate age if required
      let actualInputVal = inputVal;
      if (rule.ruleCode === 'MINIMUM_AGE' || rule.ruleCode === 'MAXIMUM_AGE') {
        if (inputVal === undefined || inputVal === null) {
          ruleResults.push(this.createMissingResult(rule));
          finalOutcome = 'POLICY_INPUT_MISSING';
          continue; // Stop on missing required data
        }
        actualInputVal = this.calculateCompletedYears(inputVal, evalDateStr);
      }

      if (actualInputVal === undefined || actualInputVal === null) {
        if (rule.ruleCode === 'COOLING_OFF_DAYS' && actualInputVal === null) {
          ruleResults.push({
            ruleCode: rule.ruleCode,
            ruleName: rule.ruleName,
            outcome: PolicyDecisionOutcome.PASS,
            message: undefined,
            reasonCode: undefined,
            inputValue: 'No Previous Rejection',
            expectedValue: rule.expectedValue,
          });
          continue;
        }

        ruleResults.push(this.createMissingResult(rule));
        finalOutcome = 'POLICY_INPUT_MISSING';
        continue; // Stop on missing required data
      }

      const passed = this.evaluateRuleCondition(rule, actualInputVal);

      let outcome = passed ? PolicyDecisionOutcome.PASS : rule.failureOutcome;

      if (outcome === 'REFER') {
        throw new Error(`PLATFORM_POLICY_REFER_NOT_ALLOWED: Rule ${rule.ruleCode} returned REFER which is no longer supported.`);
      }

      ruleResults.push({
        ruleCode: rule.ruleCode,
        ruleName: rule.ruleName,
        outcome,
        message: passed ? undefined : rule.customerMessage,
        reasonCode: passed ? undefined : rule.reasonCode,
        inputValue: actualInputVal,
        expectedValue: rule.expectedValue,
      });

      if (!passed) {
        finalOutcome = PolicyDecisionOutcome.FAIL;
      }
    }

    return {
      finalOutcome,
      evaluationDateUsed: evalDateStr,
      ruleResults
    };
  }

  private createMissingResult(rule: PlatformPolicyRule): RuleEvaluationResult {
    return {
      ruleCode: rule.ruleCode,
      ruleName: rule.ruleName,
      outcome: 'POLICY_INPUT_MISSING',
      message: `Missing required input for key: ${rule.inputKey}`,
      reasonCode: 'MISSING_DATA'
    };
  }

  private evaluateRuleCondition(rule: PlatformPolicyRule, actualInput: any): boolean {
    const { operator, expectedValue, valueType } = rule;

    // Type casting based on valueType for accurate comparison
    let parsedInput: any = actualInput;
    let parsedExpected: any = expectedValue;

    try {
      if (valueType === 'DECIMAL') {
        parsedInput = new Prisma.Decimal(actualInput.toString());
        parsedExpected = expectedValue !== null ? new Prisma.Decimal(expectedValue.toString()) : null;
      } else if (valueType === 'INTEGER') {
        parsedInput = parseInt(actualInput.toString(), 10);
        parsedExpected = expectedValue !== null ? parseInt(expectedValue.toString(), 10) : null;
      } else if (valueType === 'BOOLEAN') {
        // Ensure strictly boolean
        parsedInput = Boolean(actualInput);
        parsedExpected = expectedValue !== null ? Boolean(expectedValue) : null;
      }
    } catch (err) {
      this.logger.warn(`Failed to parse inputs for rule ${rule.ruleCode}`);
      return false;
    }

    switch (operator) {
      case 'EQUALS':
        if (valueType === 'DECIMAL') {
          return parsedInput.equals(parsedExpected);
        }
        return parsedInput === parsedExpected;
      case 'NOT_EQUALS':
        if (valueType === 'DECIMAL') {
          return !parsedInput.equals(parsedExpected);
        }
        return parsedInput !== parsedExpected;
      case 'GREATER_THAN':
        if (valueType === 'DECIMAL') {
          return parsedInput.greaterThan(parsedExpected);
        }
        return parsedInput > parsedExpected;
      case 'GREATER_THAN_OR_EQUAL':
        if (valueType === 'DECIMAL') {
          return parsedInput.greaterThanOrEqualTo(parsedExpected);
        }
        return parsedInput >= parsedExpected;
      case 'LESS_THAN':
        if (valueType === 'DECIMAL') {
          return parsedInput.lessThan(parsedExpected);
        }
        return parsedInput < parsedExpected;
      case 'LESS_THAN_OR_EQUAL':
        if (valueType === 'DECIMAL') {
          return parsedInput.lessThanOrEqualTo(parsedExpected);
        }
        return parsedInput <= parsedExpected;
      case 'IN':
        if (Array.isArray(parsedExpected)) {
          return parsedExpected.includes(parsedInput);
        }
        return false;
      case 'NOT_IN':
        if (Array.isArray(parsedExpected)) {
          return !parsedExpected.includes(parsedInput);
        }
        return false;
      case 'IS_TRUE':
        return parsedInput === true;
      case 'IS_FALSE':
        return parsedInput === false;
      default:
        return false;
    }
  }

  private calculateCompletedYears(dobStr: string, evalDateStr: string): number {
    // Both inputs expected in YYYY-MM-DD or parseable format
    const dob = new Date(dobStr);
    const evalDate = new Date(evalDateStr);

    let age = evalDate.getUTCFullYear() - dob.getUTCFullYear();

    const m = evalDate.getUTCMonth() - dob.getUTCMonth();
    if (m < 0 || (m === 0 && evalDate.getUTCDate() < dob.getUTCDate())) {
      age--;
    }

    return age;
  }
}
