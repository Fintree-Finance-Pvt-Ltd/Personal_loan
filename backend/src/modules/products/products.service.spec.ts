import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ProductCalculationService } from './product-calculation.service';
import { BadRequestException } from '@nestjs/common';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: any;
  let auditLogs: any;
  let calc: any;

  beforeEach(async () => {
    prisma = {
      lenderProduct: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      lenderProductVersion: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      lenderOfferTier: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    auditLogs = {
      logEvent: jest.fn(),
    };

    calc = {
      validateTiers: jest.fn(),
      simulate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogs },
        { provide: ProductCalculationService, useValue: calc },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createProduct', () => {
    it('should create product, version, tiers and log audit event', async () => {
      prisma.lenderProduct.findUnique.mockResolvedValueOnce({ id: 'lender-id' });
      prisma.lenderProduct.findUnique.mockResolvedValueOnce(null); // uniqueness check
      prisma.lenderProduct.create.mockResolvedValueOnce({ id: 'prod-id' });
      
      const payload = {
        name: 'Product 1', code: 'P1', lenderId: 'l1',
        strategy: {
          minimumAmount: '1', firstLoanBaseAmount: '2', maximumAmountCap: '3',
          repeatTierScope: 'SAME_LENDER', roundingMethod: 'NONE', roundingUnit: null, effectiveFrom: null,
          tiers: [{ completedLoansFrom: 0, completedLoansTo: 0, multiplier: '1', tierCap: null }]
        }
      } as any;
      
      await service.createProduct(payload, { actorUserId: 'u1' } as any);
      
      expect(prisma.lenderProduct.create).toHaveBeenCalled();
      expect(auditLogs.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PRODUCT_CREATED', outcome: 'SUCCESS' })
      );
    });
  });

  describe('submitVersion', () => {
    it('should throw if not draft', async () => {
      prisma.lenderProductVersion.findFirst.mockResolvedValueOnce({ id: 'v1', status: 'SUBMITTED' });
      await expect(service.submitVersion('v1', { actorUserId: 'u1' } as any)).rejects.toThrow(BadRequestException);
    });
    
    it('should update status to SUBMITTED', async () => {
      prisma.lenderProductVersion.findFirst.mockResolvedValueOnce({ id: 'v1', status: 'DRAFT', productId: 'p1', version: 1 });
      await service.submitVersion('v1', { actorUserId: 'u1' } as any);
      expect(prisma.lenderProductVersion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id_version: { id: 'v1', version: 1 } },
          data: expect.objectContaining({ status: 'SUBMITTED' })
        })
      );
    });
  });

  describe('approveVersion', () => {
    it('should throw if maker is the same as checker', async () => {
      prisma.lenderProductVersion.findFirst.mockResolvedValueOnce({
        id: 'v1', status: 'SUBMITTED', submittedById: 'maker1'
      });
      await expect(service.approveVersion('v1', { actorUserId: 'maker1' } as any)).rejects.toThrow(BadRequestException);
    });
  });
});
