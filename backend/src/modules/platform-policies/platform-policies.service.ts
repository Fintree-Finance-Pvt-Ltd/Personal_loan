import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { POLICY_RULE_CATALOG } from './policy-rule-catalog';
import { PlatformPolicyVersionStatus, PlatformPolicyOperationalStatus } from '@prisma/client';

const PRODUCTION_RESOLVERS = [
  'PAN_VERIFIED',
  'MINIMUM_AGE',
  'MAXIMUM_AGE',
  'PIN_SERVICEABLE',
  'MINIMUM_MONTHLY_INCOME',
  'NO_ACTIVE_APPLICATION'
];

@Injectable()
export class PlatformPoliciesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogsService,
  ) {}

  async getRuleCatalog() {
    return Object.values(POLICY_RULE_CATALOG);
  }

  async findAll(skip?: number, take?: number) {
    return this.prisma.platformPolicy.findMany({
      skip,
      take,
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async findOne(policyId: string) {
    const policy = await this.prisma.platformPolicy.findUnique({
      where: { id: policyId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            rules: {
              orderBy: { sortOrder: 'asc' }
            }
          }
        }
      }
    });

    if (!policy) {
      throw new NotFoundException(`Policy ${policyId} not found`);
    }

    return policy;
  }

  private enforceMandatoryRules(rules: any[]) {
    const mandatoryCodes = Object.values(POLICY_RULE_CATALOG)
      .filter(r => r.isMandatory)
      .map(r => r.ruleCode);
      
    const allRuleCodes = rules.map(r => r.ruleCode);

    const missing = mandatoryCodes.filter(code => !allRuleCodes.includes(code));
    if (missing.length > 0) {
      throw new BadRequestException(`Missing mandatory rules: ${missing.join(', ')}`);
    }
  }

  private enforceProductionResolvers(rules: any[]) {
    const activeRules = rules.filter(r => r.isActive);
    const unsupported = activeRules.filter(r => !PRODUCTION_RESOLVERS.includes(r.ruleCode));
    if (unsupported.length > 0) {
      const codes = unsupported.map(r => r.ruleCode).join(', ');
      throw new BadRequestException(`Cannot submit/approve/activate with active rules lacking production resolvers: ${codes}`);
    }
  }

  private enforceNoReferRules(rules: any[]) {
    const referRules = rules.filter(r => r.failureOutcome === 'REFER' || r.outcome === 'REFER');
    if (referRules.length > 0) {
      throw new BadRequestException('PLATFORM_POLICY_REFER_NOT_ALLOWED');
    }
  }

  async createPolicy(userId: string, data: { name: string, code: string, description?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.platformPolicy.findUnique({ where: { code: data.code } });
      if (existing) {
        throw new ConflictException(`Policy code ${data.code} already exists`);
      }

      const policy = await tx.platformPolicy.create({
        data: {
          name: data.name,
          code: data.code,
          description: data.description,
          createdById: userId,
          updatedById: userId,
          versions: {
            create: {
              versionNumber: 1,
              createdById: userId,
              updatedById: userId,
            }
          }
        },
        include: { versions: true }
      });

      await this.audit.record({
        actorUserId: userId,
        module: 'POLICY',
        action: 'POLICY_CREATE',
        entityType: 'PlatformPolicy',
        entityId: policy.id,
        outcome: 'SUCCESS',
        newValue: { created: true },
        requestId: 'internal'
      });
      return policy;
    });
  }

  async updatePolicy(userId: string, policyId: string, data: { name?: string, description?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.platformPolicy.update({
        where: { id: policyId },
        data: {
          name: data.name,
          description: data.description,
          updatedById: userId
        }
      });
      await this.audit.record({
        actorUserId: userId,
        module: 'POLICY',
        action: 'POLICY_UPDATE',
        entityType: 'PlatformPolicy',
        entityId: policy.id,
        outcome: 'SUCCESS',
        newValue: data,
        requestId: 'internal'
      });
      return policy;
    });
  }

  async createNewVersion(userId: string, policyId: string) {
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.platformPolicy.findUnique({
        where: { id: policyId },
        include: { versions: { orderBy: { versionNumber: 'desc' }, include: { rules: true } } }
      });

      if (!policy) throw new NotFoundException('Policy not found');

      const latestVersion = policy.versions[0];
      
      const candidateExists = policy.versions.some(v => v.status === 'DRAFT' || v.status === 'SUBMITTED');
      if (candidateExists) {
        throw new ConflictException('A DRAFT or SUBMITTED version already exists for this policy');
      }

      const nextNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

      const newVersion = await tx.platformPolicyVersion.create({
        data: {
          policyId,
          versionNumber: nextNumber,
          createdById: userId,
          updatedById: userId,
        }
      });

      if (latestVersion && latestVersion.rules.length > 0) {
        const rulesToCreate = latestVersion.rules.map(oldRule => {
          const catDef = POLICY_RULE_CATALOG[oldRule.ruleCode];
          if (!catDef) throw new BadRequestException(`Unknown rule code: ${oldRule.ruleCode}`);
          
          return {
            policyVersionId: newVersion.id,
            ruleCode: catDef.ruleCode,
            ruleName: catDef.ruleName,
            category: catDef.category,
            inputKey: catDef.inputKey,
            valueType: catDef.valueType,
            operator: oldRule.operator,
            expectedValue: oldRule.expectedValue ? JSON.parse(JSON.stringify(oldRule.expectedValue)) : null,
            failureOutcome: oldRule.failureOutcome,
            reasonCode: oldRule.reasonCode,
            customerMessage: oldRule.customerMessage,
            internalMessage: oldRule.internalMessage,
            priority: oldRule.priority,
            isActive: oldRule.isActive,
            sortOrder: oldRule.sortOrder
          };
        });

        await tx.platformPolicyRule.createMany({ data: rulesToCreate });
      }

      await this.audit.record({
        actorUserId: userId,
        module: 'POLICY',
        action: 'POLICY_VERSION_CREATE',
        entityType: 'PlatformPolicyVersion',
        entityId: newVersion.id,
        outcome: 'SUCCESS',
        newValue: { versionNumber: nextNumber },
        requestId: 'internal'
      });
      
      return tx.platformPolicyVersion.findUnique({
        where: { id: newVersion.id },
        include: { rules: true }
      });
    });
  }

  async updateVersionRules(userId: string, versionId: string, expectedVersion: number, rulesPayload: any[]) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.platformPolicyVersion.findUnique({ where: { id: versionId } });
      if (!version) throw new NotFoundException('Version not found');
      
      if (version.status !== 'DRAFT' && version.status !== 'REJECTED') {
        throw new ConflictException('Can only update rules for DRAFT or REJECTED versions');
      }

      if (version.version !== expectedVersion) {
        throw new ConflictException('POLICY_VERSION_CONFLICT');
      }

      // Format and generate sort order deterministically based on priority
      const formattedRules = rulesPayload.map((r) => {
        const catDef = POLICY_RULE_CATALOG[r.ruleCode];
        if (!catDef) throw new BadRequestException(`Unknown rule code: ${r.ruleCode}`);
        if (!catDef.canBeDisabled && !r.isActive) {
          throw new BadRequestException(`Rule ${r.ruleCode} cannot be disabled`);
        }
        return {
          ...r,
          ruleName: catDef.ruleName,
          category: catDef.category,
          inputKey: catDef.inputKey,
          valueType: catDef.valueType,
          // Generate priority based on category if needed, but we'll use array index as base logic for sortOrder
        };
      });

      this.enforceMandatoryRules(formattedRules);

      await tx.platformPolicyRule.deleteMany({ where: { policyVersionId: versionId } });

      const rulesToCreate = formattedRules.map((r, i) => ({
        policyVersionId: versionId,
        ruleCode: r.ruleCode,
        ruleName: r.ruleName,
        category: r.category,
        inputKey: r.inputKey,
        valueType: r.valueType,
        operator: r.operator,
        expectedValue: r.expectedValue ? JSON.parse(JSON.stringify(r.expectedValue)) : null,
        failureOutcome: r.failureOutcome,
        reasonCode: r.reasonCode,
        customerMessage: r.customerMessage,
        internalMessage: r.internalMessage,
        priority: r.sortOrder ?? i, // fallback to index
        isActive: r.isActive,
        sortOrder: i // backend generated sortOrder
      }));

      await tx.platformPolicyRule.createMany({ data: rulesToCreate });

      const updated = await tx.platformPolicyVersion.update({
        where: { id: versionId, version: expectedVersion },
        data: {
          version: { increment: 1 },
          updatedById: userId,
          status: 'DRAFT', // resets to draft if it was rejected
        },
        include: { rules: { orderBy: { sortOrder: 'asc' } } }
      });

      await this.audit.record({
        actorUserId: userId,
        module: 'POLICY',
        action: 'POLICY_UPDATE',
        entityType: 'PlatformPolicyVersion',
        entityId: versionId,
        outcome: 'SUCCESS',
        newValue: { rulesUpdated: true },
        requestId: 'internal'
      });
      return updated;
    });
  }

  async submitVersion(userId: string, versionId: string, expectedVersion: number) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.platformPolicyVersion.findUnique({
        where: { id: versionId },
        include: { rules: true }
      });
      if (!version) throw new NotFoundException('Version not found');
      if (version.version !== expectedVersion) throw new ConflictException('POLICY_VERSION_CONFLICT');
      if (version.status !== 'DRAFT') throw new ConflictException('Only DRAFT versions can be submitted');

      this.enforceMandatoryRules(version.rules);
      this.enforceNoReferRules(version.rules);
      this.enforceProductionResolvers(version.rules);

      const updated = await tx.platformPolicyVersion.update({
        where: { id: versionId, version: expectedVersion },
        data: {
          status: 'SUBMITTED',
          submittedById: userId,
          submittedAt: new Date(),
          updatedById: userId,
          version: { increment: 1 }
        }
      });
      await this.audit.record({
        actorUserId: userId,
        module: 'POLICY',
        action: 'POLICY_SUBMIT',
        entityType: 'PlatformPolicyVersion',
        entityId: versionId,
        outcome: 'SUCCESS',
        newValue: {},
        requestId: 'internal'
      });
      return updated;
    });
  }

  async approveVersion(userId: string, versionId: string, expectedVersion: number) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.platformPolicyVersion.findUnique({ where: { id: versionId } });
      if (!version) throw new NotFoundException('Version not found');
      if (version.version !== expectedVersion) throw new ConflictException('POLICY_VERSION_CONFLICT');
      if (version.status !== 'SUBMITTED') throw new ConflictException('Only SUBMITTED versions can be approved');

      const fullVersion = await tx.platformPolicyVersion.findUnique({ where: { id: versionId }, include: { rules: true } });
      if (fullVersion && fullVersion.rules) {
        this.enforceNoReferRules(fullVersion.rules);
        this.enforceProductionResolvers(fullVersion.rules);
      }

      const makerId = version.submittedById || version.createdById;
      if (userId === makerId) {
        throw new ForbiddenException('Maker and Checker cannot be the same user');
      }

      const updated = await tx.platformPolicyVersion.update({
        where: { id: versionId, version: expectedVersion },
        data: {
          status: 'APPROVED',
          approvedById: userId,
          approvedAt: new Date(),
          updatedById: userId,
          version: { increment: 1 }
        }
      });
      await this.audit.record({
        actorUserId: userId,
        module: 'POLICY',
        action: 'POLICY_APPROVE',
        entityType: 'PlatformPolicyVersion',
        entityId: versionId,
        outcome: 'SUCCESS',
        newValue: {},
        requestId: 'internal'
      });
      return updated;
    });
  }

  async rejectVersion(userId: string, versionId: string, expectedVersion: number, rejectionReason: string) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.platformPolicyVersion.findUnique({ where: { id: versionId } });
      if (!version) throw new NotFoundException('Version not found');
      if (version.version !== expectedVersion) throw new ConflictException('POLICY_VERSION_CONFLICT');
      if (version.status !== 'SUBMITTED') throw new ConflictException('Only SUBMITTED versions can be rejected');

      const makerId = version.submittedById || version.createdById;
      if (userId === makerId) {
        throw new ForbiddenException('Maker and Checker cannot be the same user');
      }

      const updated = await tx.platformPolicyVersion.update({
        where: { id: versionId, version: expectedVersion },
        data: {
          status: 'REJECTED',
          rejectedById: userId,
          rejectedAt: new Date(),
          rejectionReason,
          updatedById: userId,
          version: { increment: 1 }
        }
      });
      await this.audit.record({
        actorUserId: userId,
        module: 'POLICY',
        action: 'POLICY_REJECT',
        entityType: 'PlatformPolicyVersion',
        entityId: versionId,
        outcome: 'SUCCESS',
        newValue: { rejectionReason },
        requestId: 'internal'
      });
      return updated;
    });
  }

  async activateVersion(userId: string, versionId: string, expectedVersion: number, effectiveFromStr?: string) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.platformPolicyVersion.findUnique({ where: { id: versionId } });
      if (!version) throw new NotFoundException('Version not found');
      if (version.version !== expectedVersion) throw new ConflictException('POLICY_VERSION_CONFLICT');
      if (version.status !== 'APPROVED') throw new ConflictException('Only APPROVED versions can be activated');

      const fullVersion = await tx.platformPolicyVersion.findUnique({ where: { id: versionId }, include: { rules: true } });
      if (fullVersion && fullVersion.rules) {
        this.enforceNoReferRules(fullVersion.rules);
        this.enforceProductionResolvers(fullVersion.rules);
      }

      const effectiveFrom = effectiveFromStr ? new Date(effectiveFromStr) : new Date();
      if (effectiveFrom > new Date()) {
        throw new BadRequestException('Cannot activate a version before its future effectiveFrom date');
      }

      // Supersede current active
      await tx.platformPolicyVersion.updateMany({
        where: { policyId: version.policyId, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED', updatedById: userId }
      });

      const updated = await tx.platformPolicyVersion.update({
        where: { id: versionId, version: expectedVersion },
        data: {
          status: 'ACTIVE',
          effectiveFrom,
          activatedById: userId,
          activatedAt: new Date(),
          updatedById: userId,
          version: { increment: 1 }
        }
      });

      await tx.platformPolicy.update({
        where: { id: version.policyId },
        data: {
          operationalStatus: 'ACTIVE',
          updatedById: userId
        }
      });

      await this.audit.record({
        actorUserId: userId,
        module: 'POLICY',
        action: 'POLICY_ACTIVATE',
        entityType: 'PlatformPolicyVersion',
        entityId: versionId,
        outcome: 'SUCCESS',
        newValue: { effectiveFrom },
        requestId: 'internal'
      });
      return updated;
    });
  }
}
