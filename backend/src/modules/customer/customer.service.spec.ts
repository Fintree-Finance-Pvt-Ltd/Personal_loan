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
import { ProductCalculationService } from '../products/product-calculation.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('CustomerService Integration', () => {
  let service: CustomerService;
  let prisma: PrismaService;
  let policyEvalService: PolicyEvaluationService;
  let mlmService: MlmAllocationEngineService;
  let outboxService: LenderIntegrationOutboxService;

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
            plLoan: { count: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
            kycVerificationStatus: { upsert: jest.fn(), findFirst: jest.fn() },
            applicationStageConsent: { findMany: jest.fn().mockResolvedValue([]) },
            customerAccountAggregatorRequest: { findFirst: jest.fn().mockResolvedValue(null) },
            applicationAddress: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), upsert: jest.fn() },
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
        { provide: ProductCalculationService, useValue: new ProductCalculationService() },
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
    outboxService = module.get<LenderIntegrationOutboxService>(LenderIntegrationOutboxService);
    jest.spyOn(outboxService, 'enqueueUpdateWhenReady').mockResolvedValue({ readiness: { ready: true, reasons: [] } } as any);
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
        minimumAmount: 1000, firstLoanBaseAmount: 5000, maximumAmountCap: 50000,
        roundingMethod: 'NONE', roundingUnit: null,
        interestMethod: 'FLAT_RATE', annualRoiPercent: 18, processingFeePercent: 2, processingFeeGstPercent: 18,
        penalChargeAmount: 0, bounceChargeAmount: 0, emiDueDay: 5, includeAssessmentFeeInApr: false, tenureType: 'DAYS',
        multipliers: [{ minimumCompletedLoans: 0, multiplier: '1.0000' }],
        tenures: [{ tenure: 90, sortOrder: 0 }],
      });
      (prisma as any).lender.findUnique.mockResolvedValue({ id: 'LENDER-1', code: 'L1' });
      (prisma as any).plLoan.count.mockResolvedValue(0);

      await service.runEligibility(1n, {});

      expect((prisma as any).lenderProductVersion.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'HISTORICAL-PV-7' } }));
      expect((prisma as any).lenderProductVersion.findFirst).not.toHaveBeenCalled();
      expect(prisma.plApplication.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ productStrategyVersionId: 'HISTORICAL-PV-7' }),
      }));
    });

    const setUpBaseEligibility = () => {
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
        minimumAmount: 1000, firstLoanBaseAmount: 5000, maximumAmountCap: 50000,
        roundingMethod: 'NONE', roundingUnit: null,
        interestMethod: 'FLAT_RATE', annualRoiPercent: 18, processingFeePercent: 2, processingFeeGstPercent: 18,
        penalChargeAmount: 0, bounceChargeAmount: 0, emiDueDay: 5, includeAssessmentFeeInApr: false, tenureType: 'DAYS',
        multipliers: [{ minimumCompletedLoans: 0, multiplier: '1.0000' }],
        tenures: [{ tenure: 90, sortOrder: 0 }],
      });
      (prisma as any).lender.findUnique.mockResolvedValue({ id: 'LENDER-1', code: 'L1' });
      (prisma as any).plLoan.count.mockResolvedValue(0);
    };

    it('flags a repeat customer and passes a stickyRouteHint pointing at their previous lender/product', async () => {
      setUpBaseEligibility();
      (prisma as any).plLoan.findFirst.mockResolvedValue({
        id: 99n, customerId: 1n, status: 'FULLY_PAID',
        application: { lenderId: 'PREVIOUS-LENDER', lenderProductId: 'PREVIOUS-PRODUCT' },
      });

      await service.runEligibility(1n, {});

      expect((prisma as any).plLoan.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { customerId: 1n, status: { in: ['DISBURSED', 'FULLY_PAID'] } },
        orderBy: { id: 'desc' },
      }));
      expect(mlmService.executeWithTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          customerSegment: 'REPEAT',
          stickyRouteHint: { lenderId: 'PREVIOUS-LENDER', productId: 'PREVIOUS-PRODUCT' },
        }),
        expect.anything(),
      );
    });

    it('treats a customer with no prior completed loan as NEW with no sticky hint', async () => {
      setUpBaseEligibility();
      (prisma as any).plLoan.findFirst.mockResolvedValue(null);

      await service.runEligibility(1n, {});

      expect(mlmService.executeWithTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          customerSegment: 'NEW',
          stickyRouteHint: null,
        }),
        expect.anything(),
      );
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

  it('scopes the Account Aggregator success check to the current application, not just the customer', async () => {
    const application: any = {
      id: 20n, applicationNumber: 'APP-20', status: 'LENDER_ALLOCATED', platformDecisionOutcome: 'PASS',
      lenderId: null, loans: [], lenderApplicationLink: null, lenderIntegrationOutbox: [],
      employmentSnapshot: null, kycSnapshot: null, addresses: [], liveness: null,
    };
    jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue({ id: 1n, applications: [application] } as any);
    (prisma as any).plPaymentLink.findFirst.mockResolvedValue(null);

    await service.findById(1n);

    expect((prisma as any).customerAccountAggregatorRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { customerId: 1n, applicationId: 20n, status: 'SUCCESS' },
    }));
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

  describe('saveApplicationAddress', () => {
    const priorPermanent = {
      id: 'addr-old', applicationId: 10n, addressType: 'PERMANENT', source: 'DIGILOCKER',
      addressLine1: '1 MG Road', addressLine2: null, landmark: null, locality: null, district: null,
      city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400001', sourceVerifiedAt: new Date('2026-01-01'),
    };

    beforeEach(() => {
      jest.spyOn(prisma.plApplication, 'findFirst').mockResolvedValue({ id: 20n, customerId: 1n } as any);
      (prisma as any).applicationAddress.upsert.mockResolvedValue({ id: 'addr-current' });
    });

    it('backfills this application\'s PERMANENT address from a prior application when saving CURRENT as same-as-permanent', async () => {
      (prisma as any).applicationAddress.findUnique.mockResolvedValue(null);
      (prisma as any).applicationAddress.findFirst.mockResolvedValue(priorPermanent);
      (prisma as any).applicationAddress.create.mockResolvedValue({ ...priorPermanent, id: 'addr-new', applicationId: 20n });

      await service.saveApplicationAddress(1n, { addressType: 'CURRENT', sameAsPermanent: true });

      expect((prisma as any).applicationAddress.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { addressType: 'PERMANENT', application: { customerId: 1n } },
      }));
      expect((prisma as any).applicationAddress.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ applicationId: 20n, addressType: 'PERMANENT', city: 'Mumbai', pincode: '400001' }),
      }));
      expect((prisma as any).applicationAddress.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ applicationId: 20n, addressType: 'CURRENT', city: 'Mumbai', pincode: '400001', sameAsPermanent: true }),
      }));
    });

    it('throws when saving CURRENT as same-as-permanent and the customer has no PERMANENT address anywhere', async () => {
      (prisma as any).applicationAddress.findUnique.mockResolvedValue(null);
      (prisma as any).applicationAddress.findFirst.mockResolvedValue(null);

      await expect(service.saveApplicationAddress(1n, { addressType: 'CURRENT', sameAsPermanent: true }))
        .rejects.toThrow('Permanent address must be saved first.');
      expect((prisma as any).applicationAddress.create).not.toHaveBeenCalled();
    });

    it('backfills the missing PERMANENT row even when the customer enters a different CURRENT address', async () => {
      (prisma as any).applicationAddress.findUnique.mockResolvedValue(null);
      (prisma as any).applicationAddress.findFirst.mockResolvedValue(priorPermanent);
      (prisma as any).applicationAddress.create.mockResolvedValue({ ...priorPermanent, id: 'addr-new', applicationId: 20n });

      await service.saveApplicationAddress(1n, {
        addressType: 'CURRENT', sameAsPermanent: false,
        addressLine1: '99 New Street', city: 'Pune', state: 'Maharashtra', pincode: '411001',
      });

      expect((prisma as any).applicationAddress.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ applicationId: 20n, addressType: 'PERMANENT' }),
      }));
      expect((prisma as any).applicationAddress.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ city: 'Pune', pincode: '411001', sameAsPermanent: false }),
      }));
    });

    it('does not backfill when this application already has its own PERMANENT address', async () => {
      (prisma as any).applicationAddress.findUnique.mockResolvedValue({ ...priorPermanent, id: 'addr-own', applicationId: 20n });

      await service.saveApplicationAddress(1n, { addressType: 'CURRENT', sameAsPermanent: true });

      expect((prisma as any).applicationAddress.findFirst).not.toHaveBeenCalled();
      expect((prisma as any).applicationAddress.create).not.toHaveBeenCalled();
    });
  });
});
