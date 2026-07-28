import { Test, TestingModule } from '@nestjs/testing';
import { MlmService } from './mlm.service';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { AuditLogsService } from '../../../audit-logs/audit-logs.service';
import { MlmAllocationEngineService } from '../mlm-allocation-engine/mlm-allocation-engine.service';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

describe('MlmService', () => {
  let service: MlmService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (cb) => cb(prisma)),
      mlmPolicyVersion: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      mlmPolicy: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      mlmAllocationRoute: {
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      mlmAllocationRouteState: {
        create: jest.fn(),
      },
      lenderProduct: {
        findMany: jest.fn(),
      }
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MlmService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: { record: jest.fn() } },
        { provide: MlmAllocationEngineService, useValue: {} },
      ],
    }).compile();

    service = module.get<MlmService>(MlmService);
  });

  describe('updatePolicyVersionRoutes', () => {
    it('should reject draft total greater than 100', async () => {
      prisma.mlmPolicyVersion.findUnique.mockResolvedValue({
        id: 'v1', status: 'DRAFT', policy: { platformProductId: 'plat-1' }
      });
      prisma.lenderProduct.findMany.mockResolvedValue([]);

      const dto = {
        routes: [
          { lenderId: 'L1', productId: 'P1', allocationPercentage: 60, sortOrder: 1, isActive: true },
          { lenderId: 'L2', productId: 'P2', allocationPercentage: 50, sortOrder: 2, isActive: true }
        ]
      };

      await expect(service.updatePolicyVersionRoutes('v1', dto as any, 'user1'))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject if lender product does not match policy platformProductId', async () => {
      prisma.mlmPolicyVersion.findUnique.mockResolvedValue({
        id: 'v1', status: 'DRAFT', policy: { platformProductId: 'plat-1' }
      });
      prisma.lenderProduct.findMany.mockResolvedValue([
        { id: 'P1', platformProductId: 'plat-2' } // Mismatch
      ]);

      const dto = {
        routes: [
          { lenderId: 'L1', productId: 'P1', allocationPercentage: 100, sortOrder: 1, isActive: true }
        ]
      };

      await expect(service.updatePolicyVersionRoutes('v1', dto as any, 'user1'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('activateVersion', () => {
    it('should isolate active policies by platformProductId', async () => {
      prisma.mlmPolicyVersion.findUnique.mockResolvedValue({
        id: 'v1', status: 'APPROVED', 
        policyId: 'pol-new',
        policy: { scopeCode: 'DEFAULT', platformProductId: 'plat-1' },
        routes: []
      });

      // Conflicting policies on the same platform product
      prisma.mlmPolicy.findMany.mockResolvedValue([
        { id: 'pol-old' }
      ]);

      await service.activateVersion('v1', 'user1');

      expect(prisma.mlmPolicyVersion.updateMany).toHaveBeenCalledWith({
        where: { policyId: { in: ['pol-old'] }, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED', updatedById: 'user1' }
      });
      
      expect(prisma.mlmPolicy.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['pol-old'], not: 'pol-new' } },
        data: { operationalStatus: 'INACTIVE', updatedById: 'user1' }
      });
    });
  });
});
