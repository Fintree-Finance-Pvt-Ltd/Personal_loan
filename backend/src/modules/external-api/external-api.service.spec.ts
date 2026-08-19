import { BadRequestException } from '@nestjs/common';
import { ExternalApiService } from './external-api.service';
import { encryptBankAccountNumber } from '../../common/utils/bank-security.helper';

describe('ExternalApiService.verifyCustomerBankAccount', () => {
  let service: ExternalApiService;
  let prisma: any;
  let digioBankService: any;
  let lenderIntegrationOutbox: any;

  const configValues: Record<string, string> = {
    PAN_API_URL: 'https://pan.example.test',
    PAN_API_KEY: 'pan-key',
    FACE_LIVENESS_API_URL: 'https://liveness.example.test',
    FACE_LIVENESS_CLIENT_ID: 'client-id',
    FACE_LIVENESS_CLIENT_SECRET: 'client-secret',
  };

  const configService: any = {
    getOrThrow: jest.fn((key: string) => configValues[key]),
    get: jest.fn((key: string, fallback?: any) => configValues[key] ?? fallback),
  };

  const loanRecord = {
    id: 20n, lan: 'FTPL00000005', customerId: 3n, applicationId: 5n,
    customer: { fullName: 'Lalit Amulakh Shah' }, application: {}, bankVerification: null,
  };

  beforeEach(() => {
    prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
      plLoan: { findFirst: jest.fn().mockResolvedValue(loanRecord), update: jest.fn() },
      plBankVerification: { findFirst: jest.fn(), upsert: jest.fn().mockResolvedValue({ id: 'BV-NEW' }) },
      plLoanAuditEvent: { create: jest.fn() },
    };
    digioBankService = {
      verifyBankAccount: jest.fn().mockResolvedValue({
        verified: true, beneficiaryNameWithBank: 'LALIT AMULAKH SHAH', bankName: 'Yes Bank',
        branchName: 'Fort Branch', providerReference: 'DIGIO-REF-1', verifiedAt: new Date('2026-08-18T00:00:00Z'),
        fuzzyMatchScore: 92, rawResponse: {},
      }),
      fuzzyMatch: jest.fn(),
    };
    lenderIntegrationOutbox = { enqueueUpdateWhenReady: jest.fn().mockResolvedValue(undefined) };

    service = new ExternalApiService(
      {} as any,
      configService,
      prisma,
      digioBankService,
      lenderIntegrationOutbox,
    );
  });

  it('reuses the customer\'s most recent verified bank account when reuseFromPreviousLoan is set, without the customer re-entering anything', async () => {
    const previousAccountNumber = '123456789012';
    prisma.plBankVerification.findFirst.mockResolvedValue({
      id: 'BV-OLD',
      accountHolderName: 'Lalit Amulakh Shah',
      accountNumberEncrypted: encryptBankAccountNumber(previousAccountNumber),
      ifscCode: 'YESB0000001',
      bankName: 'Yes Bank',
      branchName: 'Fort Branch',
      accountType: 'SAVINGS',
    });

    await service.verifyCustomerBankAccount(
      'FTPL00000005',
      { reuseFromPreviousLoan: true },
      { customerId: '3' },
    );

    expect(prisma.plBankVerification.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { customerId: 3n, status: 'VERIFIED' },
    }));
    expect(digioBankService.verifyBankAccount).toHaveBeenCalledWith(expect.objectContaining({
      accountNo: previousAccountNumber,
      ifsc: 'YESB0000001',
      name: 'Lalit Amulakh Shah',
    }));
    expect(prisma.plBankVerification.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { loanId: 20n },
      create: expect.objectContaining({ ifscCode: 'YESB0000001', bankName: 'Yes Bank' }),
    }));
  });

  it('throws when reuseFromPreviousLoan is set but the customer has no previously verified account', async () => {
    prisma.plBankVerification.findFirst.mockResolvedValue(null);

    await expect(
      service.verifyCustomerBankAccount('FTPL00000005', { reuseFromPreviousLoan: true }, { customerId: '3' }),
    ).rejects.toThrow(BadRequestException);

    expect(digioBankService.verifyBankAccount).not.toHaveBeenCalled();
  });

  it('still validates and verifies manually-entered details when reuseFromPreviousLoan is not set', async () => {
    const manualPayload = {
      accountHolderName: 'Lalit Amulakh Shah',
      accountNumber: '999888777666',
      confirmAccountNumber: '999888777666',
      ifscCode: 'HDFC0000123',
      bankName: 'HDFC Bank',
      branchName: 'Andheri',
      accountType: 'SAVINGS',
    };

    await service.verifyCustomerBankAccount('FTPL00000005', manualPayload, { customerId: '3' });

    expect(prisma.plBankVerification.findFirst).not.toHaveBeenCalled();
    expect(digioBankService.verifyBankAccount).toHaveBeenCalledWith(expect.objectContaining({
      accountNo: '999888777666',
      ifsc: 'HDFC0000123',
    }));
  });
});
