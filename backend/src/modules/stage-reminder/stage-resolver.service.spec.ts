import { Test, TestingModule } from '@nestjs/testing';
import { CustomerAccountStatus, PlApplicationStatus, PlLoanStatus } from '@prisma/client';
import { StageResolverService } from './stage-resolver.service';

describe('StageResolverService', () => {
  let service: StageResolverService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StageResolverService],
    }).compile();

    service = module.get<StageResolverService>(StageResolverService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Terminal Status Detection', () => {
    it('returns isTerminal: true when application is PLATFORM_REJECTED', () => {
      const res = service.resolveStage({
        id: 1n,
        status: PlApplicationStatus.PLATFORM_REJECTED,
        customer: { accountStatus: CustomerAccountStatus.ACTIVE },
      });
      expect(res.isTerminal).toBe(true);
      expect(res.stage).toBe('PLATFORM_REJECTED');
    });

    it('returns isTerminal: true when application is LENDER_REJECTED', () => {
      const res = service.resolveStage({
        id: 2n,
        status: PlApplicationStatus.LENDER_REJECTED,
        customer: { accountStatus: CustomerAccountStatus.ACTIVE },
      });
      expect(res.isTerminal).toBe(true);
      expect(res.stage).toBe('LENDER_REJECTED');
    });

    it('returns isTerminal: true when loan is DISBURSED', () => {
      const res = service.resolveStage({
        id: 3n,
        status: PlApplicationStatus.LENDER_APPROVED,
        customer: { accountStatus: CustomerAccountStatus.ACTIVE },
        loans: [{ status: PlLoanStatus.DISBURSED, disbursalStatus: 'DISBURSED' }],
      });
      expect(res.isTerminal).toBe(true);
      expect(res.stage).toBe('DISBURSED');
    });

    it('returns isTerminal: true when loan is FULLY_PAID / closed', () => {
      const res = service.resolveStage({
        id: 4n,
        status: PlApplicationStatus.LOAN_CLOSED,
        customer: { accountStatus: CustomerAccountStatus.ACTIVE },
        loans: [{ status: PlLoanStatus.FULLY_PAID }],
      });
      expect(res.isTerminal).toBe(true);
      expect(res.stage).toBe('LOAN_CLOSED');
    });

    it('returns isTerminal: true when customer account is INACTIVE', () => {
      const res = service.resolveStage({
        id: 5n,
        status: PlApplicationStatus.DRAFT,
        customer: { accountStatus: CustomerAccountStatus.INACTIVE },
      });
      expect(res.isTerminal).toBe(true);
      expect(res.stage).toBe('CUSTOMER_INACTIVE');
    });
  });

  describe('Post-Approval Stages', () => {
    it('resolves EMANDATE stage when KFS is accepted but mandate is pending', () => {
      const res = service.resolveStage({
        id: 10n,
        status: PlApplicationStatus.LENDER_APPROVED,
        customer: { accountStatus: CustomerAccountStatus.ACTIVE },
        loans: [
          {
            currentStep: 'EMANDATE',
            bankVerified: true,
            kfsAccepted: true,
            mandateCompleted: false,
          },
        ],
      });
      expect(res.isTerminal).toBe(false);
      expect(res.stage).toBe('EMANDATE');
      expect(res.stageDisplayName).toBe('e-Mandate Setup');
    });

    it('resolves ESIGN stage when mandate is completed but esign is pending', () => {
      const res = service.resolveStage({
        id: 11n,
        status: PlApplicationStatus.LENDER_APPROVED,
        customer: { accountStatus: CustomerAccountStatus.ACTIVE },
        loans: [
          {
            currentStep: 'ESIGN',
            bankVerified: true,
            kfsAccepted: true,
            mandateCompleted: true,
            esignCompleted: false,
          },
        ],
      });
      expect(res.isTerminal).toBe(false);
      expect(res.stage).toBe('ESIGN');
      expect(res.stageDisplayName).toBe('e-Sign Loan Agreement');
    });

    it('resolves APPROVAL_SUMMARY when loan offer has not been accepted yet', () => {
      const res = service.resolveStage({
        id: 12n,
        status: PlApplicationStatus.LENDER_APPROVED,
        customer: { accountStatus: CustomerAccountStatus.ACTIVE },
        loans: [
          {
            currentStep: 'APPROVAL_SUMMARY',
            acceptedTenureDays: null,
          },
        ],
      });
      expect(res.isTerminal).toBe(false);
      expect(res.stage).toBe('APPROVAL_SUMMARY');
    });
  });

  describe('Pre-Approval Stages', () => {
    it('resolves PAN_VERIFICATION if PAN is missing on draft', () => {
      const res = service.resolveStage({
        id: 20n,
        status: PlApplicationStatus.DRAFT,
        customer: {
          accountStatus: CustomerAccountStatus.ACTIVE,
          panNumber: null,
          panStatus: null,
        },
      });
      expect(res.isTerminal).toBe(false);
      expect(res.stage).toBe('PAN_VERIFICATION');
    });

    it('resolves LENDER_PRE_APPROVED stage', () => {
      const res = service.resolveStage({
        id: 21n,
        status: PlApplicationStatus.LENDER_PRE_APPROVED,
        customer: { accountStatus: CustomerAccountStatus.ACTIVE, panNumber: 'ABCDE1234F' },
      });
      expect(res.isTerminal).toBe(false);
      expect(res.stage).toBe('LENDER_PRE_APPROVED');
      expect(res.stageDisplayName).toBe('Pre-Approved Offer Selection');
    });
  });
});
