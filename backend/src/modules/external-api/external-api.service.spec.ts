import { BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
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
      plApplication: { update: jest.fn() },
      customer: { update: jest.fn() },
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
    const mockLosRejectionWebhookService: any = {
      sendRejectionWebhook: jest.fn().mockResolvedValue(true),
    };

    service = new ExternalApiService(
      {} as any,
      configService,
      prisma,
      digioBankService,
      lenderIntegrationOutbox,
      mockLosRejectionWebhookService,
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

  it('rejects application, cancels loan and sends rejection webhook to LMS when fuzzy match score is low (NAME_MISMATCH)', async () => {
    digioBankService.verifyBankAccount.mockResolvedValueOnce({
      verified: true,
      beneficiaryNameWithBank: 'DIFFERENT PERSON NAME',
      bankName: 'HDFC Bank',
      branchName: 'Andheri',
      providerReference: 'DIGIO-MISMATCH-1',
      verifiedAt: new Date('2026-08-18T00:00:00Z'),
      fuzzyMatchScore: 40,
      rawResponse: {},
    });

    const mockWebhook = { sendRejectionWebhook: jest.fn().mockResolvedValue(true) };
    const svc = new ExternalApiService(
      {} as any,
      configService,
      prisma,
      digioBankService,
      lenderIntegrationOutbox,
      mockWebhook as any,
    );

    const manualPayload = {
      accountHolderName: 'Lalit Amulakh Shah',
      accountNumber: '999888777666',
      confirmAccountNumber: '999888777666',
      ifscCode: 'HDFC0000123',
      bankName: 'HDFC Bank',
      branchName: 'Andheri',
      accountType: 'SAVINGS',
    };

    const res = await svc.verifyCustomerBankAccount('FTPL00000005', manualPayload, { customerId: '3' });

    expect(res.success).toBe(false);
    expect(res.data.status).toBe('REJECTED');

    // Verify LOS DB updates
    expect(prisma.plApplication.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 5n },
      data: expect.objectContaining({
        status: 'LENDER_REJECTED',
        lenderDecisionReason: expect.stringContaining('Bank verification rejected'),
      }),
    }));
    expect(prisma.customer.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 3n },
      data: expect.objectContaining({
        onboardingStatus: 'LENDER_REJECTED',
      }),
    }));
    expect(prisma.plLoan.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 20n },
      data: expect.objectContaining({
        bankVerified: false,
        status: 'CANCELLED',
      }),
    }));

    // Verify Webhook triggered
    expect(mockWebhook.sendRejectionWebhook).toHaveBeenCalledWith(expect.objectContaining({
      lan: 'FTPL00000005',
      reason: expect.stringContaining('Fuzzy match score: 40'),
      applicationId: 5n,
    }));
  });
});

describe('ExternalApiService.verifyPan (Finanalyz primary with Zoop fallback)', () => {
  let service: ExternalApiService;
  let httpService: any;
  let prisma: any;
  let configService: any;

  const configValues: Record<string, string> = {
    PAN_API_URL: 'https://aasandbox.finanalyz.com/eKyc/pan-Details',
    PAN_API_KEY: 'test-finanalyz-key',
    PAN_API_TIMEOUT_MS: '15000',
    ZOOP_PAN_API_URL: 'https://test.zoop.one/api/v1/in/identity/pan/advance',
    ZOOP_API_KEY: 'test-zoop-key',
    ZOOP_APP_ID: 'test-zoop-app',
    FACE_LIVENESS_API_URL: 'https://liveness.example.test',
    FACE_LIVENESS_CLIENT_ID: 'client-id',
    FACE_LIVENESS_CLIENT_SECRET: 'client-secret',
  };

  const customerRecord = {
    id: 10n,
    customerCode: 'CUST-001',
    mobileVerified: true,
    accountStatus: 'ACTIVE',
    panNumber: null,
    panVerified: false,
    fullName: 'Rahul Sharma',
  };

  beforeEach(() => {
    configService = {
      getOrThrow: jest.fn((key: string) => configValues[key]),
      get: jest.fn((key: string, fallback?: any) => configValues[key] ?? fallback),
    };

    prisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue(customerRecord),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          ...customerRecord,
          ...data,
        })),
      },
      kycVerificationStatus: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 1 }),
        update: jest.fn().mockResolvedValue({ id: 1 }),
      },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };

    httpService = {
      post: jest.fn(),
    };

    service = new ExternalApiService(
      httpService,
      configService,
      prisma,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('successfully verifies PAN via Finanalyz primary provider without calling Zoop', async () => {
    httpService.post.mockReturnValueOnce(
      of({
        status: 200,
        data: {
          data: {
            applicationId: 'FIN-12345',
            status: { statusCode: 200, statusMessage: 'SUCCESS' },
            response: {
              code: 200,
              pan: 'ABCDE1234F',
              name: 'Rahul Sharma',
              gender: 'MALE',
              dob: '15/08/1992',
              isValid: true,
            },
          },
        },
      }),
    );

    const result = await service.verifyPan({
      customerId: '10',
      panNumber: 'ABCDE1234F',
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('FINANALYZ');
    expect(result.data.panNumber).toBe('ABCDE1234F');
    expect(result.data.panVerified).toBe(true);
    expect(httpService.post).toHaveBeenCalledTimes(1);
    expect(httpService.post).toHaveBeenCalledWith(
      configValues.PAN_API_URL,
      { panNumber: 'ABCDE1234F', pan_number: 'ABCDE1234F', id_number: 'ABCDE1234F' },
      expect.anything(),
    );
  });

  it('successfully verifies PAN via Finanalyz V5 endpoint and parses pan_details', async () => {
    (service as any).panApiUrl = 'https://aasandbox.finanalyz.com/eKyc/PanDetailed/V5';
    httpService.post.mockReturnValueOnce(
      of({
        status: 200,
        data: {
          data: {
            client_id: 'pan_comprehensive_plus_SiCaniPfvZzkbsJgUwfn',
            pan_number: 'AVVPA1234L',
            pan_details: {
              full_name: 'KARAN ARORA',
              full_name_split: ['KARAN', '', 'ARORA'],
              masked_aadhaar: 'XXXXXXXX1234',
              address: {
                line_1: '',
                line_2: '',
                street_name: '',
                zip: '',
                city: '',
                state: '',
                country: '',
                full: '',
              },
              email: null,
              phone_number: null,
              gender: 'M',
              dob: '1992-09-30',
              input_dob: null,
              aadhaar_linked: true,
              dob_verified: false,
              dob_check: false,
              category: 'person',
              father_name: 'RAMESH',
            },
            less_info: false,
          },
          status_code: 200,
          success: true,
          message: 'Success',
          message_code: 'success',
        },
      }),
    );

    const result = await service.verifyPan({
      customerId: '10',
      panNumber: 'AVVPA1234L',
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('FINANALYZ');
    expect(result.data.panNumber).toBe('AVVPA1234L');
    expect(result.data.panVerified).toBe(true);
    const verification = result.data.verification!;
    expect(verification.fullName).toBe('KARAN ARORA');
    expect(verification.firstName).toBe('KARAN');
    expect(verification.lastName).toBe('ARORA');
    expect(verification.gender).toBe('MALE');
    expect(verification.dateOfBirth).toBe('1992-09-30');
    expect(verification.fatherName).toBe('RAMESH');
    expect(verification.maskedAadhaar).toBe('XXXXXXXX1234');
    expect(verification.aadhaarSeedingStatus).toBe(true);
    expect(httpService.post).toHaveBeenCalledTimes(1);
    expect(httpService.post).toHaveBeenCalledWith(
      'https://aasandbox.finanalyz.com/eKyc/PanDetailed/V5',
      { id_number: 'AVVPA1234L' },
      expect.anything(),
    );
  });

  it('successfully verifies PAN via Finanalyz V5 with double-nested gateway envelope (DBMPB3177H)', async () => {
    (service as any).panApiUrl = 'https://aasandbox.finanalyz.com/eKyc/PanDetailed/V5';
    httpService.post.mockReturnValueOnce(
      of({
        status: 200,
        data: {
          message: 'Request processed successfully',
          data: {
            data: {
              client_id: 'pan_comprehensive_plus_UtrrkMwRclwmnnlfFoDh',
              pan_number: 'DBMPB3177H',
              pan_details: {
                full_name: 'NIKITA BANSAL',
                full_name_split: ['NIKITA', '', 'BANSAL'],
                masked_aadhaar: 'XXXXXXXX6364',
                address: {
                  line_1: '',
                  line_2: '',
                  street_name: '',
                  zip: '',
                  city: '',
                  state: '',
                  country: '',
                  full: '',
                },
                email: null,
                phone_number: null,
                gender: 'F',
                dob: '1998-11-07',
                input_dob: null,
                aadhaar_linked: true,
                dob_verified: false,
                dob_check: false,
                category: 'person',
                status: 'valid',
                less_info: false,
                father_name: 'MANOJ KUMAR BANSAL',
              },
              less_info: false,
            },
            status_code: 200,
            success: true,
            message: 'Success',
            message_code: 'success',
          },
        },
      }),
    );

    const result = await service.verifyPan({
      customerId: '10',
      panNumber: 'DBMPB3177H',
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('FINANALYZ');
    expect(result.data.panNumber).toBe('DBMPB3177H');
    expect(result.data.panVerified).toBe(true);
    const verification = result.data.verification!;
    expect(verification.fullName).toBe('NIKITA BANSAL');
    expect(verification.firstName).toBe('NIKITA');
    expect(verification.lastName).toBe('BANSAL');
    expect(verification.gender).toBe('FEMALE');
    expect(verification.dateOfBirth).toBe('1998-11-07');
    expect(verification.fatherName).toBe('MANOJ KUMAR BANSAL');
    expect(verification.maskedAadhaar).toBe('XXXXXXXX6364');
    expect(verification.aadhaarSeedingStatus).toBe(true);
    expect(httpService.post).toHaveBeenCalledTimes(1);
    expect(httpService.post).toHaveBeenCalledWith(
      'https://aasandbox.finanalyz.com/eKyc/PanDetailed/V5',
      { id_number: 'DBMPB3177H' },
      expect.anything(),
    );
  });

  it('falls back to Zoop PAN verification when Finanalyz fails, using customer name', async () => {
    // 1st call (Finanalyz) fails with error
    httpService.post.mockReturnValueOnce(
      throwError(() => new Error('Finanalyz timeout')),
    );

    // 2nd call (Zoop fallback) succeeds
    httpService.post.mockReturnValueOnce(
      of({
        status: 200,
        data: {
          task_id: 'ZOOP-TASK-999',
          success: true,
          response_code: '100',
          response_message: 'SUCCESS',
          result: {
            pan_number: 'ABCDE1234F',
            user_full_name: 'Rahul Sharma',
            dob: '15/08/1992',
            gender: 'MALE',
            type_of_holder: 'Individual',
            extra_fields: {
              is_pan_verified: 'yes',
            },
          },
        },
      }),
    );

    const result = await service.verifyPan({
      customerId: '10',
      panNumber: 'ABCDE1234F',
      fullName: 'Rahul Sharma',
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('ZOOP');
    expect(result.data.panNumber).toBe('ABCDE1234F');
    expect(result.data.panVerified).toBe(true);
    expect(httpService.post).toHaveBeenCalledTimes(2);

    // Verify Zoop was called with customer_pan_number and pan_holder_name
    expect(httpService.post).toHaveBeenNthCalledWith(
      2,
      configValues.ZOOP_PAN_API_URL,
      expect.objectContaining({
        mode: 'sync',
        data: expect.objectContaining({
          customer_pan_number: 'ABCDE1234F',
          pan_holder_name: 'RAHUL SHARMA',
        }),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'api-key': configValues.ZOOP_API_KEY,
          'app-id': configValues.ZOOP_APP_ID,
        }),
      }),
    );
  });
});

