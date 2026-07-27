import { PolicyEvaluationService } from './policy-evaluation.service';
import { PlatformPolicyRule, PolicyDecisionOutcome } from '@prisma/client';
import { Prisma } from '@prisma/client';

describe('PolicyEvaluationService', () => {
  let service: PolicyEvaluationService;

  beforeEach(() => {
    service = new PolicyEvaluationService();
  });

  const createRule = (overrides: Partial<PlatformPolicyRule>): PlatformPolicyRule => ({
    id: 'test-id',
    policyVersionId: 'test-version',
    ruleCode: 'TEST',
    ruleName: 'Test Rule',
    category: 'IDENTITY',
    inputKey: 'testKey',
    valueType: 'BOOLEAN',
    operator: 'IS_TRUE',
    expectedValue: null,
    failureOutcome: 'FAIL',
    reasonCode: 'TEST_FAIL',
    customerMessage: 'Test failed',
    internalMessage: null,
    priority: 1,
    isActive: true,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  });

  it('should return PASS when rule condition succeeds', () => {
    const rules = [createRule({ inputKey: 'isValid', valueType: 'BOOLEAN', operator: 'IS_TRUE' })];
    const result = service.evaluate(rules, { isValid: true });
    
    expect(result.finalOutcome).toBe(PolicyDecisionOutcome.PASS);
    expect(result.ruleResults[0].outcome).toBe(PolicyDecisionOutcome.PASS);
  });

  it('should evaluate date-only age correctly across boundaries', () => {
    const rules = [
      createRule({ ruleCode: 'MINIMUM_AGE', inputKey: 'dob', valueType: 'INTEGER', operator: 'GREATER_THAN_OR_EQUAL', expectedValue: 18 })
    ];
    
    // Exact birthday today => 18
    let result = service.evaluate(rules, { dob: '2000-05-15' }, '2018-05-15');
    expect(result.finalOutcome).toBe(PolicyDecisionOutcome.PASS);

    // One day before birthday => 17
    result = service.evaluate(rules, { dob: '2000-05-15' }, '2018-05-14');
    expect(result.finalOutcome).toBe(PolicyDecisionOutcome.FAIL);
  });

  it('should use Prisma.Decimal for financial comparisons', () => {
    const rules = [
      createRule({
        ruleCode: 'MINIMUM_MONTHLY_INCOME',
        inputKey: 'income',
        valueType: 'DECIMAL',
        operator: 'GREATER_THAN_OR_EQUAL',
        expectedValue: "25000.50" // precision
      })
    ];
    
    // Exactly equal
    let result = service.evaluate(rules, { income: 25000.50 });
    expect(result.finalOutcome).toBe(PolicyDecisionOutcome.PASS);

    // Slightly less
    result = service.evaluate(rules, { income: 25000.49 });
    expect(result.finalOutcome).toBe(PolicyDecisionOutcome.FAIL);
  });

  it('should return POLICY_INPUT_MISSING if required data is missing', () => {
    const rules = [createRule({ inputKey: 'income', valueType: 'DECIMAL', operator: 'GREATER_THAN_OR_EQUAL', expectedValue: "25000" })];
    
    const result = service.evaluate(rules, {}); // Missing income
    
    expect(result.finalOutcome).toBe('POLICY_INPUT_MISSING');
    expect(result.ruleResults[0].outcome).toBe('POLICY_INPUT_MISSING');
  });

  it('should respect FAIL over REFER priority', () => {
    const rules = [
      createRule({ inputKey: 'val1', operator: 'IS_TRUE', failureOutcome: 'REFER', sortOrder: 1 }),
      createRule({ inputKey: 'val2', operator: 'IS_TRUE', failureOutcome: 'FAIL', sortOrder: 2 })
    ];
    
    // Both fail, one is REFER, one is FAIL
    const result = service.evaluate(rules, { val1: false, val2: false });
    expect(result.finalOutcome).toBe(PolicyDecisionOutcome.FAIL);
  });

  it('should return REFER if only REFER rule fails', () => {
    const rules = [
      createRule({ inputKey: 'val1', operator: 'IS_TRUE', failureOutcome: 'REFER', sortOrder: 1 }),
      createRule({ inputKey: 'val2', operator: 'IS_TRUE', failureOutcome: 'FAIL', sortOrder: 2 })
    ];
    
    const result = service.evaluate(rules, { val1: false, val2: true });
    expect(result.finalOutcome).toBe(PolicyDecisionOutcome.REFER);
  });
});
