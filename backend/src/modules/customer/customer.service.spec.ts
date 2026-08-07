import { Test, TestingModule } from '@nestjs/testing';
import { CustomerService } from './customer.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PolicyEvaluationService } from '../platform-policies/policy-evaluation.service';
import { PlatformPoliciesService } from '../platform-policies/platform-policies.service';
import { LoanService } from '../loan/loan.service';
import { MlmAllocationEngineService } from '../mlm/services/mlm-allocation-engine/mlm-allocation-engine.service';
import { PlPaymentsService } from '../external-api/pl-payments.service';
import { ApplicationTransitionService } from '../loan/services/application-transition.service';
import { LenderIntegrationOutboxService } from '../lender-integrations/lender-integration-outbox.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('CustomerService Integration', () => {
  let service: CustomerService;
  let prisma: PrismaService;
  let policyEvalService: PolicyEvaluationService;
  let mlmService: MlmAllocationEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(async (cb) => cb(prisma)),
            $executeRaw: jest.fn().mockResolvedValue(0),
            customer: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
            plApplication: { findUnique: jest.fn(), create: jest.fn(), count: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
            plPaymentLink: { findFirst: jest.fn() },
            lender: { findUnique: jest.fn() },
            lenderProductVersion: { findUnique: jest.fn(), findFirst: jest.fn() },
            mlmPolicy: { findMany: jest.fn() },
            platformProduct: { findFirst: jest.fn() },
            platformPolicy: { findMany: jest.fn() },
            plLoan: { count: jest.fn() },
            kycVerificationStatus: { upsert: jest.fn(), findFirst: jest.fn() },
            applicationStageConsent: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        { provide: LoanService, useValue: {} },
        { provide: PlatformPoliciesService, useValue: {} },
        {
          provide: MlmAllocationEngineService,
          useValue: { allocateLender: jest.fn(), executeWithTx: jest.fn() },
        },

        {
          provide: PlPaymentsService,
          useValue: { getPaymentStatus: jest.fn() },
        },
        {
          provide: ApplicationTransitionService,
          useValue: { createOrResumeApplication: jest.fn() },
        },
        {
          provide: LenderIntegrationOutboxService,
          useValue: {
            enqueueUpdateWhenReady: jest.fn(),
            recordDecisionConsents: jest.fn(),
            getUpdateReadiness: jest.fn().mockResolvedValue({ ready: false, reasons: ['CREATE_NOT_ACKNOWLEDGED'] }),
          },
        },
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
    mlmService = module.get<MlmAllocationEngineService>(MlmAllocationEngineService);
  });

  describe('runEligibility', () => {
    it('should throw ForbiddenException if customerId does not match application', async () => {
      jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue({ id: 1n, applications: [] } as any);
      jest.spyOn(prisma.plApplication, 'findUnique').mockResolvedValue({ id: 100n, customerId: 2n } as any);

      await expect(service.runEligibility(1n, { applicationId: '100' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('should query exactly one scoped policy and evaluate only active inputs', async () => {
      const customerMock = { id: 1n, dateOfBirth: new Date() };
      jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue(customerMock as any);
      jest.spyOn(prisma.plApplication, 'findFirst').mockResolvedValue({ id: 10n, status: 'DRAFT', customerId: 1n, platformProductId: 'PROD_1', scopeCode: 'PLATFORM_DEFAULT', requestedAmount: 50000 } as any);
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
      const mockPolicyVersion = mockPolicy.versions[0];
      
      (service as any).platformPoliciesService.resolveActivePolicyVersion = jest.fn().mockResolvedValue(mockPolicyVersion);
      
      jest.spyOn(policyEvalService, 'evaluate').mockReturnValue({ finalOutcome: 'POLICY_INPUT_MISSING', ruleResults: [{ outcome: 'POLICY_INPUT_MISSING', ruleCode: 'NO_FRAUD_FLAG' }] } as any);

      // Missing fraud flag results in POLICY_INPUT_MISSING error
      await expect(service.runEligibility(1n, {}))
        .rejects.toThrow(/Missing required inputs for eligibility check/);

      expect((service as any).platformPoliciesService.resolveActivePolicyVersion).toHaveBeenCalledWith(
        'PROD_1',
        'PLATFORM_DEFAULT',
        expect.anything()
      );
    });

    it('persists the exact MLM decision product version without active-version re-resolution', async () => {
      const application = {
        id: 10n, customerId: 1n, applicationNumber: 'APP-10', status: 'DRAFT',
        platformProductId: 'PLATFORM-1', scopeCode: 'PLATFORM_DEFAULT', requestedAmount: null,
      };
      jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue({ id: 1n, dateOfBirth: new Date('1990-01-01'), applications: [application] } as any);
      jest.spyOn(prisma.plApplication, 'findFirst').mockResolvedValue(application as any);
      jest.spyOn(prisma.plApplication, 'update').mockResolvedValue(application as any);
      jest.spyOn(prisma.customer, 'update').mockResolvedValue({ id: 1n } as any);
      (service as any).platformPoliciesService.resolveActivePolicyVersion = jest.fn().mockResolvedValue({ id: 'BRE-V1', rules: [] });
      jest.spyOn(policyEvalService, 'evaluate').mockReturnValue({ finalOutcome: 'PASS', ruleResults: [] } as any);
      (prisma as any).mlmPolicy.findMany.mockResolvedValue([{ versions: [{ id: 'MLM-V1', routes: [] }] }]);
      jest.spyOn(mlmService, 'executeWithTx').mockResolvedValue({
        id: 'DEC-1', status: 'ASSIGNED', policyId: 'MLM-1', policyVersionId: 'MLM-V1',
        lenderId: 'LENDER-1', productId: 'PRODUCT-1', productVersionId: 'HISTORICAL-PV-7',
      } as any);
      (prisma as any).lenderProductVersion.findUnique.mockResolvedValue({
        id: 'HISTORICAL-PV-7', productId: 'PRODUCT-1', assessmentFeeAmount: 500, assessmentFeeGstPercent: 18,
      });
      (prisma as any).lender.findUnique.mockResolvedValue({ id: 'LENDER-1', code: 'L1' });

      await service.runEligibility(1n, {});

      expect((prisma as any).lenderProductVersion.findUnique).toHaveBeenCalledWith({ where: { id: 'HISTORICAL-PV-7' } });
      expect((prisma as any).lenderProductVersion.findFirst).not.toHaveBeenCalled();
      expect(prisma.plApplication.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ productStrategyVersionId: 'HISTORICAL-PV-7' }),
      }));
    });
  });

  it('uses only this application assessment-fee payment when building resume state', async () => {
    const application: any = {
      id: 20n, applicationNumber: 'APP-20', status: 'LENDER_ALLOCATED', platformDecisionOutcome: 'PASS',
      lenderId: null, loans: [], lenderApplicationLink: null, lenderIntegrationOutbox: [],
      employmentSnapshot: null, kycSnapshot: null, addresses: [], liveness: null,
    };
    jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue({ id: 1n, applications: [application] } as any);
    (prisma as any).plPaymentLink.findFirst.mockResolvedValue(null);

    const result: any = await service.findById(1n);

    expect((prisma as any).plPaymentLink.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { customerId: 1n, applicationId: 20n, purpose: 'ASSESSMENT_FEE', status: 'SUCCESS' },
    }));
    expect(result.data.assessmentFeePaid).toBe(false);
    expect(result.data.journey.assessmentFee.paid).toBe(false);
  });

  it('disables simulated lender approval in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(service.simulateLenderApproval(1n, { approved: true })).rejects.toThrow(NotFoundException);
      expect(prisma.customer.findUnique).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
