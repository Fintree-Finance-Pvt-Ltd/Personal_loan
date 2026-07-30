import { Test, TestingModule } from '@nestjs/testing';
import { CustomerService } from './customer.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PolicyEvaluationService } from '../platform-policies/policy-evaluation.service';
import { PlatformPoliciesService } from '../platform-policies/platform-policies.service';
import { LoanService } from '../loan/loan.service';
import { MlmAllocationEngineService } from '../mlm/services/mlm-allocation-engine/mlm-allocation-engine.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('CustomerService Integration', () => {
  let service: CustomerService;
  let prisma: PrismaService;
  let policyEvalService: PolicyEvaluationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(async (cb) => cb(prisma)),
            customer: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
            plApplication: { findUnique: jest.fn(), create: jest.fn(), count: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
            platformProduct: { findFirst: jest.fn() },
            platformPolicy: { findMany: jest.fn() },
            plLoan: { count: jest.fn() },
            kycVerificationStatus: { upsert: jest.fn(), findFirst: jest.fn() },
          },
        },
        { provide: LoanService, useValue: {} },
        { provide: PlatformPoliciesService, useValue: {} },
        { provide: MlmAllocationEngineService, useValue: {} },
        {
          provide: PolicyEvaluationService,
          useValue: { evaluate: jest.fn() },
        },
        { provide: 'AuditLogsService', useValue: { record: jest.fn() } },
        { provide: 'FilesService', useValue: {} },
        { provide: 'DigilockerService', useValue: {} },
        { provide: 'PanService', useValue: {} },
        { provide: 'BankVerificationService', useValue: {} },
        { provide: 'AddressConfirmationService', useValue: {} },
      ],
    }).compile();

    service = module.get<CustomerService>(CustomerService);
    prisma = module.get<PrismaService>(PrismaService);
    policyEvalService = module.get<PolicyEvaluationService>(PolicyEvaluationService);
  });

  describe('runEligibility', () => {
    it('should throw ForbiddenException if customerId does not match application', async () => {
      jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue({ id: 1n, applications: [] } as any);
      jest.spyOn(prisma.plApplication, 'findUnique').mockResolvedValue({ id: 100n, customerId: 2n } as any);

      await expect(service.runEligibility(1n, { applicationId: '100' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('should query exactly one scoped policy and evaluate only active inputs', async () => {
      const customerMock = { id: 1n, applications: [{ id: 10n, status: 'DRAFT', customerId: 1n }], dateOfBirth: new Date() };
      jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue(customerMock as any);
      jest.spyOn(prisma.platformProduct, 'findFirst').mockResolvedValue({ id: 'PROD_1', status: 'ACTIVE' } as any);
      
      const mockPolicy = {
        id: 'pol-1', code: 'PROD_1', operationalStatus: 'ACTIVE',
        versions: [{ 
          id: 'v1', status: 'ACTIVE', 
          rules: [
            { ruleCode: 'MINIMUM_AGE', inputKey: 'dateOfBirth', isActive: true },
            { ruleCode: 'NO_FRAUD_FLAG', inputKey: 'hasFraudFlag', isActive: true } // unavailable source
          ] 
        }]
      };
      
      jest.spyOn(prisma.platformPolicy, 'findMany').mockResolvedValue([mockPolicy] as any);
      jest.spyOn(policyEvalService, 'evaluate').mockReturnValue({ finalOutcome: 'POLICY_INPUT_MISSING', ruleResults: [{ outcome: 'POLICY_INPUT_MISSING', ruleCode: 'NO_FRAUD_FLAG' }] } as any);

      // Missing fraud flag results in POLICY_INPUT_MISSING error
      await expect(service.runEligibility(1n, {}))
        .rejects.toThrow(/Missing required inputs for eligibility check/);

      expect(prisma.platformPolicy.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ platformProductId: 'PROD_1', scopeCode: 'PLATFORM_DEFAULT' }),
        include: expect.anything()
      });
    });
  });
});
