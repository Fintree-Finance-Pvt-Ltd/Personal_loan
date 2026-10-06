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

  it('should ignore inactive rules completely', () => {
    const rules = [
      createRule({ ruleCode: 'PAN_VERIFIED', inputKey: 'isPanVerified', operator: 'IS_TRUE', isActive: false }),
      createRule({ ruleCode: 'OTHER_RULE', inputKey: 'other', operator: 'IS_TRUE', isActive: true })
    ];
    
    // Even if isPanVerified is missing, the inactive rule is ignored
    const result = service.evaluate(rules, { other: true });
    
    expect(result.finalOutcome).toBe(PolicyDecisionOutcome.PASS);
    expect(result.ruleResults.length).toBe(1);
    expect(result.ruleResults[0].ruleCode).toBe('OTHER_RULE');
  });

  it('should fail if active PAN rule receives false status', () => {
    const rules = [
      createRule({ ruleCode: 'PAN_VERIFIED', inputKey: 'isPanVerified', operator: 'IS_TRUE', isActive: true })
    ];
    
    const result = service.evaluate(rules, { isPanVerified: false });
    
    expect(result.finalOutcome).toBe(PolicyDecisionOutcome.FAIL);
    expect(result.ruleResults[0].outcome).toBe(PolicyDecisionOutcome.FAIL);
  });

  it('should pass if active PAN rule receives true status', () => {
    const rules = [
      createRule({ ruleCode: 'PAN_VERIFIED', inputKey: 'isPanVerified', operator: 'IS_TRUE', isActive: true })
    ];
    
    const result = service.evaluate(rules, { isPanVerified: true });
    
    expect(result.finalOutcome).toBe(PolicyDecisionOutcome.PASS);
    expect(result.ruleResults[0].outcome).toBe(PolicyDecisionOutcome.PASS);
  });

  describe('SAME_IP_CUSTOMER_COUNT rule evaluation', () => {
    it('evaluates LESS_THAN_OR_EQUAL: allows <= expected and fails when exceeded', () => {
      const rules = [
        createRule({
          ruleCode: 'SAME_IP_CUSTOMER_COUNT',
          ruleName: 'Same IP Customer Count',
          inputKey: 'sameIpCustomerCount',
          valueType: 'INTEGER',
          operator: 'LESS_THAN_OR_EQUAL',
          expectedValue: 2,
          customerMessage: 'You are not eligible for this loan offer.',
          reasonCode: 'SAME_IP_LIMIT_EXCEEDED',
        }),
      ];

      // 1st customer -> PASS
      expect(service.evaluate(rules, { sameIpCustomerCount: 1 }).finalOutcome).toBe(PolicyDecisionOutcome.PASS);

      // 2nd customer -> PASS
      expect(service.evaluate(rules, { sameIpCustomerCount: 2 }).finalOutcome).toBe(PolicyDecisionOutcome.PASS);

      // 3rd customer -> FAIL with customer message
      const failResult = service.evaluate(rules, { sameIpCustomerCount: 3 });
      expect(failResult.finalOutcome).toBe(PolicyDecisionOutcome.FAIL);
      expect(failResult.ruleResults[0].message).toBe('You are not eligible for this loan offer.');
      expect(failResult.ruleResults[0].reasonCode).toBe('SAME_IP_LIMIT_EXCEEDED');
    });

    it('evaluates LESS_THAN: allows strictly less than expected', () => {
      const rules = [
        createRule({
          ruleCode: 'SAME_IP_CUSTOMER_COUNT',
          inputKey: 'sameIpCustomerCount',
          valueType: 'INTEGER',
          operator: 'LESS_THAN',
          expectedValue: 3,
        }),
      ];

      expect(service.evaluate(rules, { sameIpCustomerCount: 2 }).finalOutcome).toBe(PolicyDecisionOutcome.PASS);
      expect(service.evaluate(rules, { sameIpCustomerCount: 3 }).finalOutcome).toBe(PolicyDecisionOutcome.FAIL);
    });

    it('evaluates EQUALS: passes only when exactly equal to expected', () => {
      const rules = [
        createRule({
          ruleCode: 'SAME_IP_CUSTOMER_COUNT',
          inputKey: 'sameIpCustomerCount',
          valueType: 'INTEGER',
          operator: 'EQUALS',
          expectedValue: 1,
        }),
      ];

      expect(service.evaluate(rules, { sameIpCustomerCount: 1 }).finalOutcome).toBe(PolicyDecisionOutcome.PASS);
      expect(service.evaluate(rules, { sameIpCustomerCount: 2 }).finalOutcome).toBe(PolicyDecisionOutcome.FAIL);
    });
  });

  describe('MINIMUM_ABB rule evaluation', () => {
    const abbRule = createRule({
      ruleCode: 'MINIMUM_ABB',
      ruleName: 'Minimum Average Bank Balance (ABB)',
      category: 'INCOME',
      inputKey: 'averageBankBalance',
      valueType: 'DECIMAL',
      operator: 'GREATER_THAN_OR_EQUAL',
      expectedValue: '10000',
      customerMessage: 'Your average bank balance does not meet the minimum requirement.',
      reasonCode: 'ABB_BELOW_MINIMUM',
    });

    it('passes when actual ABB meets or exceeds configured minimum value and preserves AA source', () => {
      const result = service.evaluate([abbRule], {
        averageBankBalance: 24013.49,
        averageBankBalanceSource: 'AA',
      });

      expect(result.finalOutcome).toBe(PolicyDecisionOutcome.PASS);
      expect(result.ruleResults[0].outcome).toBe(PolicyDecisionOutcome.PASS);
      expect(result.ruleResults[0].inputValue).toBe(24013.49);
      expect(result.ruleResults[0].source).toBe('AA');
    });

    it('passes when actual ABB meets or exceeds configured minimum value and preserves MANUAL_BANK_STATEMENT source', () => {
      const result = service.evaluate([abbRule], {
        averageBankBalance: 15000,
        averageBankBalanceSource: 'MANUAL_BANK_STATEMENT',
      });

      expect(result.finalOutcome).toBe(PolicyDecisionOutcome.PASS);
      expect(result.ruleResults[0].outcome).toBe(PolicyDecisionOutcome.PASS);
      expect(result.ruleResults[0].source).toBe('MANUAL_BANK_STATEMENT');
    });

    it('fails with ABB_BELOW_MINIMUM when actual ABB is below configured minimum', () => {
      const result = service.evaluate([abbRule], {
        averageBankBalance: 4605.81,
        averageBankBalanceSource: 'AA',
      });

      expect(result.finalOutcome).toBe(PolicyDecisionOutcome.FAIL);
      expect(result.ruleResults[0].outcome).toBe(PolicyDecisionOutcome.FAIL);
      expect(result.ruleResults[0].reasonCode).toBe('ABB_BELOW_MINIMUM');
      expect(result.ruleResults[0].message).toBe('Your average bank balance does not meet the minimum requirement.');
      expect(result.ruleResults[0].source).toBe('AA');
    });

    it('returns POLICY_INPUT_MISSING if actual ABB is missing', () => {
      const result = service.evaluate([abbRule], {});

      expect(result.finalOutcome).toBe('POLICY_INPUT_MISSING');
      expect(result.ruleResults[0].outcome).toBe('POLICY_INPUT_MISSING');
      expect(result.ruleResults[0].ruleCode).toBe('MINIMUM_ABB');
    });
  });
});

