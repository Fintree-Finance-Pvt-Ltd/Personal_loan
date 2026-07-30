import { Test, TestingModule } from '@nestjs/testing';
import { CustomerAadhaarKycService } from './customer-aadhaar-kyc.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DigitapDigilockerService } from '../external-api/digitap-digilocker.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';

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

  it('should throw BadRequestException if customer identity cannot be resolved', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.initiate(null, { customerId: 999 })).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException if mobile is unverified', async () => {
    prisma.customer.findUnique.mockResolvedValue({
      ...mockCustomer,
      mobileVerified: false,
    });
    await expect(service.initiate(null, { customerId: 1 })).rejects.toThrow(BadRequestException);
  });

  it('should return VERIFIED if customer is already verified', async () => {
    prisma.customer.findUnique.mockResolvedValue({
      ...mockCustomer,
      aadhaarVerified: true,
    });

    const result = await service.initiate(null, { customerId: 1 });
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

    const result = await service.initiate(null, { customerCode: 'FFPL000001', consentGiven: true });
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('INITIATED');
    expect(result.data.transactionId).toBe('TXN12345');
    expect(digitapService.generateDigitapDigilockerUrl).toHaveBeenCalled();
  });
});
