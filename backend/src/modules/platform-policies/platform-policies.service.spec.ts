import { Test, TestingModule } from '@nestjs/testing';
import { PlatformPoliciesService } from './platform-policies.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { POLICY_RULE_CATALOG } from './policy-rule-catalog';

describe('PlatformPoliciesService', () => {
  let service: PlatformPoliciesService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformPoliciesService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(cb => cb(prisma)),
            platformPolicy: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            platformPolicyVersion: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
            platformPolicyRule: {
              createMany: jest.fn(),
              deleteMany: jest.fn(),
            },
          },
        },
        {
          provide: AuditLogsService,
          useValue: {
            record: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PlatformPoliciesService>(PlatformPoliciesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('Lifecycle Race (Expected Version)', () => {
    it('should throw ConflictException if expectedVersion does not match', async () => {
      jest.spyOn(prisma.platformPolicyVersion, 'findUnique').mockResolvedValue({
        id: 'v1', version: 2, status: 'DRAFT', policyId: 'p1'
      } as any);

      await expect(service.updateVersionRules('user1', 'v1', 1, []))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('Candidate Version Constraints', () => {
    it('should prevent creating a new version if a DRAFT or SUBMITTED exists', async () => {
      jest.spyOn(prisma.platformPolicy, 'findUnique').mockResolvedValue({
        id: 'p1',
        versions: [
          { status: 'SUBMITTED', versionNumber: 2 }
        ]
      } as any);

      await expect(service.createNewVersion('user1', 'p1'))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('Maker-Checker Verification', () => {
    it('should throw ForbiddenException if maker tries to approve their own submission', async () => {
      jest.spyOn(prisma.platformPolicyVersion, 'findUnique').mockResolvedValue({
        id: 'v1', status: 'SUBMITTED', version: 1, submittedById: 'user1'
      } as any);

      await expect(service.approveVersion('user1', 'v1', 1))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if maker tries to reject their own submission', async () => {
      jest.spyOn(prisma.platformPolicyVersion, 'findUnique').mockResolvedValue({
        id: 'v1', status: 'SUBMITTED', version: 1, submittedById: 'user1'
      } as any);

      await expect(service.rejectVersion('user1', 'v1', 1, 'reason'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('Future Effective Date', () => {
    it('should reject activation before a future effective date', async () => {
      jest.spyOn(prisma.platformPolicyVersion, 'findUnique').mockResolvedValue({
        id: 'v1', status: 'APPROVED', version: 1
      } as any);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      await expect(service.activateVersion('user2', 'v1', 1, futureDate.toISOString()))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('Transaction Rollback Support', () => {
    it('should ensure updateVersionRules enforces mandatory rules within transaction', async () => {
      jest.spyOn(prisma.platformPolicyVersion, 'findUnique').mockResolvedValue({
        id: 'v1', status: 'DRAFT', version: 1
      } as any);

      // We omit PAN_VERIFIED and MINIMUM_AGE to trigger the error before Prisma update is called
      await expect(service.updateVersionRules('user1', 'v1', 1, [
        { ruleCode: 'PIN_SERVICEABLE', isActive: true, operator: 'IN' }
      ])).rejects.toThrow(BadRequestException);
      
      expect(prisma.platformPolicyRule.deleteMany).not.toHaveBeenCalled();
    });
  });
});
