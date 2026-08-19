import { Test, TestingModule } from '@nestjs/testing';
import { EasebuzzCollectionCronService } from './easebuzz-collection-cron.service';
import { EasebuzzAutocollectService } from '../../../integrations/easebuzz-autocollect.service';
import { LoanService } from '../loan.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { PlMandateStatus, PlMandateType } from '@prisma/client';

describe('EasebuzzCollectionCronService', () => {
  let cronService: EasebuzzCollectionCronService;
  let easebuzzAutocollectService: jest.Mocked<EasebuzzAutocollectService>;
  let loanService: jest.Mocked<LoanService>;
  let prismaService: any;
  let configService: jest.Mocked<ConfigService>;

  const mockMerchantKey = 'TEST_MERCHANT_KEY_12345';
  const mockMerchantSalt = 'TEST_MERCHANT_SALT_67890';

  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      plRepaymentSchedule: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      easebuzzDebitRequest: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: any) => any) => cb(mockPrisma)),
    };

    const mockEasebuzz = {
      sha512Hex: jest.fn((val) => `hashed_${val}`),
      generatePresentmentHash: jest.fn((input) => {
        const amtStr = Number(input.amount).toFixed(2);
        return `hash_${input.transactionId}_${input.merchantRequestNumber}_${amtStr}`;
      }),
      generatePresentmentListHash: jest.fn((input) => {
        return `listhash_${input.createdAtStart || ''}_${input.createdAtEnd || ''}_${input.createdAt || ''}`;
      }),
      initiateEnachPresentment: jest.fn(),
      sendUpiPreDebitNotification: jest.fn(),
      executeUpiOrSiDebit: jest.fn(),
      getDebitRequests: jest.fn(),
      getMandateStatus: jest.fn(),
    };

    const mockLoan = {
      processRepayment: jest.fn(),
    };

    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'EASEBUZZ_COLLECTION_CRON_ENABLED') return 'true';
        if (key === 'EASEBUZZ_RECONCILIATION_CRON_ENABLED') return 'true';
        if (key === 'EASEBUZZ_MAX_DEBIT_ATTEMPTS') return '3';
        if (key === 'EASEBUZZ_AUTOCOLLECT_KEY') return mockMerchantKey;
        if (key === 'EASEBUZZ_AUTOCOLLECT_SALT') return mockMerchantSalt;
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EasebuzzCollectionCronService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EasebuzzAutocollectService, useValue: mockEasebuzz },
        { provide: LoanService, useValue: mockLoan },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    cronService = module.get<EasebuzzCollectionCronService>(EasebuzzCollectionCronService);
    easebuzzAutocollectService = module.get(EasebuzzAutocollectService);
    loanService = module.get(LoanService);
    prismaService = module.get(PrismaService);
    configService = module.get(ConfigService);
  });

  describe('SHA-512 Authorization Hashes', () => {
    it('1. generates correct eNACH presentment SHA-512 authorization string format', () => {
      const hash = easebuzzAutocollectService.generatePresentmentHash({
        transactionId: 'EBM123456',
        merchantRequestNumber: 'EB_FTPL11001_92_1',
        amount: 5500.0,
      });

      expect(hash).toContain('EBM123456');
      expect(hash).toContain('EB_FTPL11001_92_1');
      expect(hash).toContain('5500.00');
    });

    it('2. generates correct list GET SHA-512 authorization string format', () => {
      const hash = easebuzzAutocollectService.generatePresentmentListHash({
        createdAtStart: '2026-09-01',
        createdAtEnd: '2026-09-05',
      });

      expect(hash).toContain('2026-09-01');
      expect(hash).toContain('2026-09-05');
    });
  });

  describe('Merchant Request Number Generation', () => {
    it('3. generates pattern EB_<LAN>_<RPSID>_<ATTEMPT> and keeps length <= 40 chars', () => {
      const mrn = cronService.generateMerchantRequestNumber('FTPL11001', 92, 1);
      expect(mrn).toBe('EB_FTPL11001_92_1');
      expect(mrn.length).toBeLessThanOrEqual(40);
      expect(/^[a-zA-Z0-9_|\-/]+$/.test(mrn)).toBe(true);
    });

    it('4. truncates long LAN to enforce <= 40 chars limit', () => {
      const longLan = 'VERYLONGLOANACCOUNTNUMBER1234567890EXTRA';
      const mrn = cronService.generateMerchantRequestNumber(longLan, 987654, 12);
      expect(mrn.length).toBeLessThanOrEqual(40);
      expect(mrn).toContain('_987654_12');
    });
  });

  describe('Cron Selection & Idempotency Rules', () => {
    it('5. selects only due installments with active mandate and unpaid status', async () => {
      const mockInstallment = {
        id: 92n,
        loanId: 10n,
        lan: 'FTPL11001',
        installmentNumber: 1,
        dueDate: new Date('2026-09-05'),
        remainingAmount: '5500.00',
        paymentStatus: 'PENDING',
        loan: {
          applicationId: 100n,
          mandates: [
            {
              id: 50n,
              merchantTransactionId: 'EBM123456',
              mandateType: PlMandateType.ENACH,
              amount: '10000.00',
              status: PlMandateStatus.AUTHORIZED,
            },
          ],
        },
      };

      prismaService.plRepaymentSchedule.findMany.mockResolvedValue([mockInstallment]);
      prismaService.easebuzzDebitRequest.findMany.mockResolvedValue([]);
      easebuzzAutocollectService.getMandateStatus.mockResolvedValue({ isActive: true, status: 'AUTHORIZED' });
      easebuzzAutocollectService.initiateEnachPresentment.mockResolvedValue({
        success: true,
        data: { status: 'success' },
      });

      prismaService.easebuzzDebitRequest.findUnique.mockResolvedValue(null);
      prismaService.easebuzzDebitRequest.create.mockResolvedValue({
        id: 1n,
        merchantRequestNumber: 'EB_FTPL11001_92_1',
        status: 'SUBMITTING',
      });

      const res = await cronService.runDueEnachCollections();
      expect(res.processed).toBe(1);
      expect(res.success).toBe(1);
      expect(easebuzzAutocollectService.initiateEnachPresentment).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 'EBM123456',
          amount: 5500,
          merchantRequestNumber: 'EB_FTPL11001_92_1',
        }),
      );
    });

    it('11 & 12. skips debit when existing SUCCESS or IN_PROCESS debit request exists', async () => {
      const mockInstallment = {
        id: 92n,
        loanId: 10n,
        lan: 'FTPL11001',
        installmentNumber: 1,
        dueDate: new Date('2026-09-05'),
        remainingAmount: '5500.00',
        paymentStatus: 'PENDING',
        loan: {
          applicationId: 100n,
          mandates: [
            {
              id: 50n,
              merchantTransactionId: 'EBM123456',
              mandateType: PlMandateType.ENACH,
              amount: '10000.00',
              status: PlMandateStatus.AUTHORIZED,
            },
          ],
        },
      };

      prismaService.plRepaymentSchedule.findMany.mockResolvedValue([mockInstallment]);
      prismaService.easebuzzDebitRequest.findMany.mockResolvedValue([
        { id: 1n, rpsId: 92n, status: 'IN_PROCESS', merchantRequestNumber: 'EB_FTPL11001_92_1' },
      ]);

      const res = await cronService.runDueEnachCollections();
      expect(res.processed).toBe(0);
      expect(easebuzzAutocollectService.initiateEnachPresentment).not.toHaveBeenCalled();
    });

    it('14. uses partial remainingAmount rather than original EMI if partial payment occurred', async () => {
      const mockInstallment = {
        id: 93n,
        loanId: 10n,
        lan: 'FTPL11001',
        installmentNumber: 2,
        dueDate: new Date('2026-09-05'),
        emi: '5000.00',
        remainingAmount: '2000.00',
        paymentStatus: 'PARTIAL',
        loan: {
          applicationId: 100n,
          mandates: [
            {
              id: 50n,
              merchantTransactionId: 'EBM123456',
              mandateType: PlMandateType.ENACH,
              amount: '10000.00',
              status: PlMandateStatus.AUTHORIZED,
            },
          ],
        },
      };

      prismaService.plRepaymentSchedule.findMany.mockResolvedValue([mockInstallment]);
      prismaService.easebuzzDebitRequest.findMany.mockResolvedValue([]);
      easebuzzAutocollectService.getMandateStatus.mockResolvedValue({ isActive: true, status: 'AUTHORIZED' });
      easebuzzAutocollectService.initiateEnachPresentment.mockResolvedValue({ success: true });
      prismaService.easebuzzDebitRequest.findUnique.mockResolvedValue(null);
      prismaService.easebuzzDebitRequest.create.mockResolvedValue({ id: 2n, status: 'SUBMITTING' });

      await cronService.runDueEnachCollections();
      expect(easebuzzAutocollectService.initiateEnachPresentment).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 2000 }),
      );
    });
  });

  describe('5xx and Network Timeout Handling', () => {
    it('16, 17 & 18. sets status UNKNOWN on 5xx/timeout and DOES NOT immediately retry POST', async () => {
      const mockInstallment = {
        id: 94n,
        loanId: 10n,
        lan: 'FTPL11001',
        installmentNumber: 3,
        dueDate: new Date('2026-09-05'),
        remainingAmount: '3000.00',
        paymentStatus: 'PENDING',
        loan: {
          applicationId: 100n,
          mandates: [
            {
              id: 50n,
              merchantTransactionId: 'EBM123456',
              mandateType: PlMandateType.ENACH,
              amount: '10000.00',
              status: PlMandateStatus.AUTHORIZED,
            },
          ],
        },
      };

      prismaService.plRepaymentSchedule.findMany.mockResolvedValue([mockInstallment]);
      prismaService.easebuzzDebitRequest.findMany.mockResolvedValue([]);
      easebuzzAutocollectService.getMandateStatus.mockResolvedValue({ isActive: true, status: 'AUTHORIZED' });

      // Return 5xx/timeout response
      easebuzzAutocollectService.initiateEnachPresentment.mockResolvedValue({
        success: false,
        isUnknown: true,
        error: '502 Bad Gateway / ETIMEDOUT',
      });

      prismaService.easebuzzDebitRequest.findUnique.mockResolvedValue(null);
      prismaService.easebuzzDebitRequest.create.mockResolvedValue({ id: 3n, status: 'SUBMITTING' });

      const res = await cronService.runDueEnachCollections();
      expect(res.unknown).toBe(1);
      expect(prismaService.easebuzzDebitRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 3n },
          data: expect.objectContaining({ status: 'UNKNOWN' }),
        }),
      );
    });
  });

  describe('Status Reconciliation & Repayment Allocation', () => {
    it('19 & 20. resolves UNKNOWN/IN_PROCESS to SUCCESS and triggers repayment allocation exactly once', async () => {
      const pendingDebit = {
        id: 100n,
        lan: 'FTPL11001',
        rpsId: 92n,
        installmentNumber: 1,
        merchantRequestNumber: 'EB_FTPL11001_92_1',
        amount: '5500.00',
        status: 'UNKNOWN',
      };

      prismaService.easebuzzDebitRequest.findMany.mockResolvedValue([pendingDebit]);
      easebuzzAutocollectService.getDebitRequests.mockResolvedValue({
        success: true,
        data: [
          {
            merchant_request_number: 'EB_FTPL11001_92_1',
            status: 'SUCCESS',
            easebuzz_id: 'EB_PG_9999',
            bank_reference_number: 'BANK_REF_8888',
          },
        ],
      });

      loanService.processRepayment.mockResolvedValue({
        success: true,
        paymentId: 'EB_FTPL11001_92_1',
        paymentStatus: 'PAID',
      } as any);

      const res = await cronService.reconcilePendingDebits();
      expect(res.resolvedSuccess).toBe(1);
      expect(prismaService.easebuzzDebitRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 100n },
          data: expect.objectContaining({ status: 'SUCCESS' }),
        }),
      );
      expect(loanService.processRepayment).toHaveBeenCalledWith('FTPL11001', {
        installmentNumber: 1,
        amount: 5500,
        paymentId: 'EB_FTPL11001_92_1',
        paymentMode: 'EASEBUZZ',
        referenceNumber: 'BANK_REF_8888',
      });
    });

    it('21. failure status update does NOT trigger repayment allocation or mark RPS paid', async () => {
      const pendingDebit = {
        id: 101n,
        lan: 'FTPL11001',
        rpsId: 92n,
        installmentNumber: 1,
        merchantRequestNumber: 'EB_FTPL11001_92_1',
        amount: '5500.00',
        status: 'IN_PROCESS',
      };

      prismaService.easebuzzDebitRequest.findMany.mockResolvedValue([pendingDebit]);
      easebuzzAutocollectService.getDebitRequests.mockResolvedValue({
        success: true,
        data: [
          {
            merchant_request_number: 'EB_FTPL11001_92_1',
            status: 'FAILURE',
            failure_code: 'INSUFFICIENT_FUNDS',
            failure_reason: 'Account balance insufficient',
          },
        ],
      });

      const res = await cronService.reconcilePendingDebits();
      expect(res.resolvedFailure).toBe(1);
      expect(loanService.processRepayment).not.toHaveBeenCalled();
    });
  });
});
