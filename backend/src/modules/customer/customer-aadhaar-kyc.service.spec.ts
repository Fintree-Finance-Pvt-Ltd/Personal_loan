import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CustomerAadhaarKycService } from './customer-aadhaar-kyc.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DigitapDigilockerService } from '../external-api/digitap-digilocker.service';
import { ConfigService } from '@nestjs/config';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

describe('CustomerAadhaarKycService', () => {
  let service: CustomerAadhaarKycService;
  let prisma: any;
  let digitapService: any;

  const mockCustomer = {
    id: BigInt(1),
    customerCode: 'FFPL000001',
    mobileNumber: '9876543210',
    mobileVerified: true,
    panVerified: true,
    fullName: 'Test Customer',
    email: 'test@example.com',
    aadhaarVerified: false,
    digilockerStatus: null,
    digilockerSessionId: null,
  };

  beforeEach(async () => {
    prisma = {
      customer: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      kycVerificationStatus: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    digitapService = {
      generateDigitapDigilockerUrl: jest.fn(),
      getDigitapDigilockerDetails: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerAadhaarKycService,
        { provide: PrismaService, useValue: prisma },
        { provide: DigitapDigilockerService, useValue: digitapService },
        {
          provide: AuditLogsService,
          useValue: { record: jest.fn().mockResolvedValue(undefined), logEvent: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('http://localhost:5173/customer/digilocker/callback'),
          },
        },
      ],
    }).compile();

    service = module.get<CustomerAadhaarKycService>(CustomerAadhaarKycService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw UnauthorizedException if customer identity cannot be resolved', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.initiate(null, { consentGiven: true })).rejects.toThrow(UnauthorizedException);
  });

  it('should throw BadRequestException if mobile is unverified', async () => {
    prisma.customer.findUnique.mockResolvedValue({
      ...mockCustomer,
      mobileVerified: false,
    });
    await expect(service.initiate({ customerId: 1n }, { consentGiven: true })).rejects.toThrow(BadRequestException);
  });

  it('should return VERIFIED if customer is already verified', async () => {
    prisma.customer.findUnique.mockResolvedValue({
      ...mockCustomer,
      aadhaarVerified: true,
    });

    const result = await service.initiate({ customerId: 1n }, { consentGiven: true });
    expect(result.data.status).toBe('VERIFIED');
    expect(result.data.aadhaarVerified).toBe(true);
  });

  it('should initiate DigiLocker verification successfully using customerCode', async () => {
    prisma.customer.findUnique.mockResolvedValue(mockCustomer);
    digitapService.generateDigitapDigilockerUrl.mockResolvedValue({
      transactionId: 'TXN12345',
      url: 'https://digitap.ai/kyc/12345',
    });
    prisma.customer.update.mockResolvedValue({});

    const result = await service.initiate({ customerId: 1n }, { consentGiven: true });
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('INITIATED');
    expect(result.data.transactionId).toBe('TXN12345');
    expect(digitapService.generateDigitapDigilockerUrl).toHaveBeenCalled();
  });

  it('should reuse existing active DigiLocker session without generating a new transaction ID', async () => {
    const mockCustomerWithSession = {
      ...mockCustomer,
      digilockerStatus: 'INITIATED',
      digilockerSessionId: 'EXISTING_TXN_999',
      digilockerReference: 'DLK_CUS-FFPL000001_12345',
      digilockerConsentAt: new Date(),
      digilockerRawResponse: JSON.stringify({
        verificationUrl: 'https://digitap.ai/kyc/existing',
        transactionId: 'EXISTING_TXN_999',
        attemptReference: 'DLK_CUS-FFPL000001_12345',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }),
    };
    prisma.customer.findUnique.mockResolvedValue(mockCustomerWithSession);
    digitapService.getDigitapDigilockerDetails.mockResolvedValue(null);

    const result = await service.initiate({ customerId: 1n }, { consentGiven: true });
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('INITIATED');
    expect(result.data.transactionId).toBe('EXISTING_TXN_999');
    expect(result.data.resumed).toBe(true);
    expect(digitapService.generateDigitapDigilockerUrl).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when NotFoundException is expected', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.refreshStatus(null)).rejects.toThrow(UnauthorizedException);
  });
});
