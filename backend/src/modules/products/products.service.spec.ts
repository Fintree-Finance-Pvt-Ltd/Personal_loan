import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ProductCalculationService } from './product-calculation.service';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: any;
  let auditLogs: any;
  let calc: any;

  beforeEach(async () => {
    prisma = {
      lender: {
        findUnique: jest.fn(),
      },
      lenderProduct: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      lenderProductVersion: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      lenderOfferMultiplier: {
        deleteMany: jest.fn(),
      },
      lenderProductTenure: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    auditLogs = {
      record: jest.fn(),
    };

    calc = {
      validateAmounts: jest.fn(),
      validateMultipliers: jest.fn(),
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

  describe('updateProductStrategy', () => {
    const ctx = { actorUserId: 'u1' } as any;
    
    it('should throw if expected version does not match', async () => {
      prisma.lenderProductVersion.findUnique.mockResolvedValueOnce({
        id: 'v1', status: 'DRAFT', version: 2
      });

      await expect(service.updateProductStrategy('v1', { expectedVersion: 1 } as any, ctx))
        .rejects.toThrow(ConflictException);
    });

    it('should perform transaction replacement and increment optimistic version', async () => {
      prisma.lenderProductVersion.findUnique.mockResolvedValueOnce({
        id: 'v1', status: 'DRAFT', version: 1, productId: 'p1'
      });

      const payload = {
        expectedVersion: 1,
        minimumAmount: '1',
        firstLoanBaseAmount: '2',
        maximumAmountCap: '3',
        repeatTierScope: 'SAME_LENDER',
        roundingMethod: 'NONE',
        roundingUnit: null,
        interestMethod: 'FLAT_RATE',
        annualRoiPercent: '12.0',
        processingFeePercent: '2',
        processingFeeGstPercent: '18',
        assessmentFeeAmount: '0',
        assessmentFeeGstPercent: '0',
        penalChargeAmount: '0',
        bounceChargeAmount: '0',
        emiDueDay: 5,
        includeAssessmentFeeInApr: false,
        effectiveFrom: null,
        multipliers: [{ minimumCompletedLoans: 0, multiplier: '1' }],
        tenures: [6, 12]
      };

      await service.updateProductStrategy('v1', payload as any, ctx);

      // Verify transaction deletes old data
      expect(prisma.lenderOfferMultiplier.deleteMany).toHaveBeenCalledWith({ where: { productVersionId: 'v1' } });
      expect(prisma.lenderProductTenure.deleteMany).toHaveBeenCalledWith({ where: { productVersionId: 'v1' } });

      // Verify optimistic locking update
      expect(prisma.lenderProductVersion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'v1', version: 1 },
          data: expect.objectContaining({
            version: { increment: 1 },
          })
        })
      );
    });
  });

  describe('submitVersion', () => {
    it('should throw if not draft', async () => {
      prisma.lenderProductVersion.findUnique.mockResolvedValueOnce({ id: 'v1', status: 'SUBMITTED' });
      await expect(service.submitVersion('v1', { actorUserId: 'u1' } as any)).rejects.toThrow(BadRequestException);
    });
  });
});
