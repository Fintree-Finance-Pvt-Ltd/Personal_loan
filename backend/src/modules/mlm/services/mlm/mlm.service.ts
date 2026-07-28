import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { MlmAllocationEngineService } from '../mlm-allocation-engine/mlm-allocation-engine.service';
import { AuditLogsService } from '../../../audit-logs/audit-logs.service';
import {
  CreateMlmPolicyDto,
  UpdateMlmPolicyDto,
  CreateMlmPolicyVersionDto,
  UpdateMlmAllocationRoutesDto,
  RejectMlmPolicyVersionDto,
  SimulateMlmPolicyVersionDto,
  ExecuteMlmAllocationDto,
} from '../../mlm.types';
import {
  MlmPolicyVersionStatus,
  MlmPolicyOperationalStatus,
  Prisma,
} from '@prisma/client';

@Injectable()
export class MlmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: MlmAllocationEngineService,
    private readonly audit: AuditLogsService,
  ) {}

  async listPolicies() {
    return this.prisma.mlmPolicy.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { versions: true } },
      },
    });
  }

  async getEligibleLenderProducts(platformProductId: string) {
    return this.prisma.lenderProduct.findMany({
      where: {
        platformProductId,
        operationalStatus: 'ACTIVE',
        lender: {
          operationalStatus: 'ACTIVE'
        },
        versions: {
          some: {
            status: 'ACTIVE'
          }
        }
      },
      include: {
        lender: { select: { id: true, displayName: true, legalName: true, code: true } }
      }
    });
  }

  async getPolicyDetails(policyId: string) {
    const policy = await this.prisma.mlmPolicy.findUnique({
      where: { id: policyId },
      include: {
        versions: {
          include: { routes: { include: { routeState: true } } },
          orderBy: { versionNumber: 'desc' },
        },
      },
    });
    if (!policy) {
      throw new NotFoundException('MLM Policy not found');
    }
    return policy;
  }

  async createPolicy(dto: CreateMlmPolicyDto, userId: string) {
    const policy = await this.prisma.mlmPolicy.create({
      data: {
        ...dto,
        createdById: userId,
        updatedById: userId,
      },
    });
    try {
      await this.audit.record({
         actorUserId: userId,
         module: 'MLM',
         action: 'CREATE_MLM_POLICY',
         entityType: 'MlmPolicy',
         entityId: policy.id,
         outcome: 'SUCCESS',
         requestId: 'INTERNAL'
      });
    } catch (e) {}
    return policy;
  }

  async updatePolicy(policyId: string, dto: UpdateMlmPolicyDto, userId: string) {
    const policy = await this.prisma.mlmPolicy.update({
      where: { id: policyId },
      data: {
        ...dto,
        updatedById: userId,
      },
    });
    try {
      await this.audit.record({
         actorUserId: userId,
         module: 'MLM',
         action: 'UPDATE_MLM_POLICY',
         entityType: 'MlmPolicy',
         entityId: policyId,
         outcome: 'SUCCESS',
         requestId: 'INTERNAL'
      });
    } catch (e) {}
    return policy;
  }

  async createPolicyVersion(policyId: string, dto: CreateMlmPolicyVersionDto, userId: string) {
    const policy = await this.prisma.mlmPolicy.findUnique({
      where: { id: policyId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!policy) throw new NotFoundException('Policy not found');

    const hasActiveDraft = policy.versions.some(
      (v: any) => v.status === MlmPolicyVersionStatus.DRAFT || v.status === MlmPolicyVersionStatus.SUBMITTED,
    );
    if (hasActiveDraft) {
      throw new ConflictException('An active draft or submitted version already exists');
    }

    const nextVersion = policy.versions.length ? policy.versions[0].versionNumber + 1 : 1;

    const version = await this.prisma.mlmPolicyVersion.create({
      data: {
        policyId,
        versionNumber: nextVersion,
        ...dto,
        createdById: userId,
        updatedById: userId,
      },
    });
    try {
      await this.audit.record({
         actorUserId: userId,
         module: 'MLM',
         action: 'CREATE_MLM_POLICY_VERSION',
         entityType: 'MlmPolicyVersion',
         entityId: version.id,
         outcome: 'SUCCESS',
         requestId: 'INTERNAL'
      });
    } catch (e) {}
    return version;
  }

  async updatePolicyVersionRoutes(
    versionId: string,
    dto: UpdateMlmAllocationRoutesDto,
    userId: string,
  ) {
    const version = await this.prisma.mlmPolicyVersion.findUnique({
      where: { id: versionId },
      include: { routes: true, policy: true },
    });

    if (!version) throw new NotFoundException('Policy version not found');
    if (version.status !== MlmPolicyVersionStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT versions can be modified');
    }

    const lenderMap = new Set<string>();
    const productMap = new Set<string>();

    for (const route of dto.routes) {
      if (lenderMap.has(route.lenderId)) {
         throw new BadRequestException(`Duplicate route for lender: ${route.lenderId}`);
      }
      lenderMap.add(route.lenderId);

      if (productMap.has(route.productId)) {
         throw new BadRequestException(`Duplicate route for product: ${route.productId}`);
      }
      productMap.add(route.productId);
    }

    let draftTotal = new Prisma.Decimal(0);
    for (const route of dto.routes) {
      if (route.isActive) {
        draftTotal = draftTotal.add(new Prisma.Decimal(route.allocationPercentage || 0));
      }
    }

    if (draftTotal.greaterThan(new Prisma.Decimal(100))) {
      throw new BadRequestException(`Draft total allocation exceeds 100.0000. Current total is ${draftTotal.toString()}`);
    }

    // Validate Platform Product matching
    const products = await this.prisma.lenderProduct.findMany({
      where: { id: { in: Array.from(productMap) } },
    });
    for (const p of products) {
      if (p.platformProductId !== version.policy.platformProductId) {
        throw new BadRequestException(`MLM_ROUTE_PRODUCT_MISMATCH: Lender Product ${p.name} does not match the Policy's Platform Product`);
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Delete existing routes
      await tx.mlmAllocationRoute.deleteMany({
        where: { mlmPolicyVersionId: versionId },
      });

      // Insert new routes
      const newRoutes = await Promise.all(
        dto.routes.map((route) =>
          tx.mlmAllocationRoute.create({
            data: {
              mlmPolicyVersionId: versionId,
              lenderId: route.lenderId,
              productId: route.productId,
              allocationWeightPercent: new Prisma.Decimal(route.allocationPercentage || 0),
              priority: route.sortOrder,
              capacityPeriod: 'MONTHLY',
              isActive: route.isActive ?? true,
              sortOrder: route.sortOrder,
            },
          }),
        ),
      );

      await tx.mlmPolicyVersion.update({
        where: { id: versionId },
        data: { updatedById: userId },
      });

      return newRoutes;
    });

    try {
      await this.audit.record({
         actorUserId: userId,
         module: 'MLM',
         action: 'UPDATE_MLM_POLICY_ROUTES',
         entityType: 'MlmPolicyVersion',
         entityId: versionId,
         outcome: 'SUCCESS',
         requestId: 'INTERNAL'
      });
    } catch (e) {}
    return result;
  }

  private async validateVersionConfiguration(versionId: string) {
     const version = await this.prisma.mlmPolicyVersion.findUnique({
        where: { id: versionId },
        include: { routes: { include: { product: true } }, policy: true }
     });
     if (!version) throw new NotFoundException('Version not found');

     for (const r of version.routes) {
        if (r.product.platformProductId !== version.policy.platformProductId) {
           throw new BadRequestException(`MLM_ROUTE_PRODUCT_MISMATCH: Lender Product ${r.product.name} does not match the Policy's Platform Product`);
        }
     }

     const activeRoutes = version.routes.filter(r => r.isActive);
     if (activeRoutes.length < 2) {
        throw new BadRequestException('At least two active routes are required to submit/approve/activate.');
     }

     let totalPercentage = new Prisma.Decimal(0);
     for (const r of activeRoutes) {
        totalPercentage = totalPercentage.add(r.allocationWeightPercent || new Prisma.Decimal(0));
     }

     if (!totalPercentage.equals(new Prisma.Decimal(100))) {
        throw new BadRequestException(`Total allocation percentage of active routes must be exactly 100.0000. Current total is ${totalPercentage.toString()}`);
     }
  }

  async simulate(policyVersionId: string, execDto: ExecuteMlmAllocationDto) {
    const version = await this.prisma.mlmPolicyVersion.findUnique({
      where: { id: policyVersionId },
      include: { routes: { include: { routeState: true } } },
    });
    if (!version) throw new NotFoundException('Version not found');

    return this.engine.simulate(execDto, version as any);
  }

  async submitVersion(versionId: string, userId: string) {
    const version = await this.prisma.mlmPolicyVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException('Version not found');
    if (version.status !== MlmPolicyVersionStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT versions can be submitted');
    }

    await this.validateVersionConfiguration(versionId);

    const updated = await this.prisma.mlmPolicyVersion.update({
      where: { id: versionId },
      data: {
        status: MlmPolicyVersionStatus.SUBMITTED,
        submittedById: userId,
        submittedAt: new Date(),
        updatedById: userId,
      },
    });
    try {
      await this.audit.record({
         actorUserId: userId,
         module: 'MLM',
         action: 'SUBMIT_MLM_POLICY_VERSION',
         entityType: 'MlmPolicyVersion',
         entityId: versionId,
         outcome: 'SUCCESS',
         requestId: 'INTERNAL'
      });
    } catch (e) {}
    return updated;
  }

  async approveVersion(versionId: string, userId: string) {
    const version = await this.prisma.mlmPolicyVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException('Version not found');
    if (version.status !== MlmPolicyVersionStatus.SUBMITTED) {
      throw new BadRequestException('Only SUBMITTED versions can be approved');
    }
    if (version.createdById === userId || version.submittedById === userId) {
      throw new ForbiddenException('Maker cannot be checker');
    }

    await this.validateVersionConfiguration(versionId);

    const updated = await this.prisma.mlmPolicyVersion.update({
      where: { id: versionId },
      data: {
        status: MlmPolicyVersionStatus.APPROVED,
        approvedById: userId,
        approvedAt: new Date(),
        updatedById: userId,
      },
    });
    try {
      await this.audit.record({
         actorUserId: userId,
         module: 'MLM',
         action: 'APPROVE_MLM_POLICY_VERSION',
         entityType: 'MlmPolicyVersion',
         entityId: versionId,
         outcome: 'SUCCESS',
         requestId: 'INTERNAL'
      });
    } catch (e) {}
    return updated;
  }

  async rejectVersion(versionId: string, dto: RejectMlmPolicyVersionDto, userId: string) {
    const version = await this.prisma.mlmPolicyVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException('Version not found');
    if (version.status !== MlmPolicyVersionStatus.SUBMITTED) {
      throw new BadRequestException('Only SUBMITTED versions can be rejected');
    }

    const updated = await this.prisma.mlmPolicyVersion.update({
      where: { id: versionId },
      data: {
        status: MlmPolicyVersionStatus.REJECTED,
        rejectedById: userId,
        rejectedAt: new Date(),
        rejectionReason: dto.rejectionReason,
        updatedById: userId,
      },
    });
    try {
      await this.audit.record({
         actorUserId: userId,
         module: 'MLM',
         action: 'REJECT_MLM_POLICY_VERSION',
         entityType: 'MlmPolicyVersion',
         entityId: versionId,
         outcome: 'SUCCESS',
         reason: dto.rejectionReason,
         requestId: 'INTERNAL'
      });
    } catch (e) {}
    return updated;
  }

  async activateVersion(versionId: string, userId: string) {
    const version = await this.prisma.mlmPolicyVersion.findUnique({
      where: { id: versionId },
      include: { policy: true, routes: true },
    });
    if (!version) throw new NotFoundException('Version not found');

    if (version.status === MlmPolicyVersionStatus.ACTIVE) {
       return version;
    }

    if (version.status !== MlmPolicyVersionStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED versions can be activated');
    }

    await this.validateVersionConfiguration(versionId);

    const activated = await this.prisma.$transaction(async (tx) => {
      // Deactivate any currently ACTIVE policies/versions for the same scope and platform product
      const conflictingPolicies = await tx.mlmPolicy.findMany({
        where: {
          scopeCode: version.policy.scopeCode,
          platformProductId: version.policy.platformProductId,
          operationalStatus: MlmPolicyOperationalStatus.ACTIVE,
        }
      });

      const conflictingPolicyIds = conflictingPolicies.map(p => p.id);

      if (conflictingPolicyIds.length > 0) {
        await tx.mlmPolicyVersion.updateMany({
          where: {
            policyId: { in: conflictingPolicyIds },
            status: MlmPolicyVersionStatus.ACTIVE,
          },
          data: {
            status: MlmPolicyVersionStatus.SUPERSEDED,
            updatedById: userId,
          },
        });

        // Ensure only the newly activated policy remains ACTIVE for this scope+product
        await tx.mlmPolicy.updateMany({
          where: {
            id: { in: conflictingPolicyIds, not: version.policyId },
          },
          data: {
            operationalStatus: MlmPolicyOperationalStatus.INACTIVE,
            updatedById: userId,
          },
        });
      }

      const activatedVersion = await tx.mlmPolicyVersion.update({
        where: { id: versionId },
        data: {
          status: MlmPolicyVersionStatus.ACTIVE,
          activatedById: userId,
          activatedAt: new Date(),
          updatedById: userId,
        },
      });

      for (const route of version.routes) {
         if (route.isActive) {
           await tx.mlmAllocationRouteState.create({
             data: {
                mlmPolicyVersionId: versionId,
                routeId: route.id,
                currentWeight: 0,
                allocatedApplicationCount: 0,
                allocatedAmount: 0
             }
           });
         }
      }

      return activatedVersion;
    });

    try {
      await this.audit.record({
         actorUserId: userId,
         module: 'MLM',
         action: 'ACTIVATE_MLM_POLICY_VERSION',
         entityType: 'MlmPolicyVersion',
         entityId: versionId,
         outcome: 'SUCCESS',
         requestId: 'INTERNAL'
      });
    } catch (e) {}
    return activated;
  }

  async simulateVersion(versionId: string, dto: SimulateMlmPolicyVersionDto) {
    const version = await this.prisma.mlmPolicyVersion.findUnique({
      where: { id: versionId },
      include: { routes: { include: { routeState: true } }, policy: true },
    });
    if (!version) throw new NotFoundException('Version not found');

    const execDto: ExecuteMlmAllocationDto = {
      applicationReference: 'SIMULATION_' + Date.now(),
      requestedAmount: dto.requestedAmount,
      platformDecisionOutcome: dto.platformDecisionOutcome || 'APPROVED',
      platformProductId: (version as any).policy?.platformProductId || 'UNKNOWN',
    };

    return this.engine.simulate(execDto, version);
  }

  async listDecisions(limit = 50, offset = 0) {
    return this.prisma.mlmAllocationDecision.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        attempts: true,
        route: {
           include: { lender: true, product: true }
        },
      },
    });
  }
  
  async getDistributionDashboard(versionId: string) {
     const version = await this.prisma.mlmPolicyVersion.findUnique({
        where: { id: versionId },
        include: { routes: { include: { routeState: true, lender: true, product: true } } }
     });
     if (!version) throw new NotFoundException('Version not found');
     return version.routes.map(r => ({
        routeId: r.id,
        lenderName: (r.lender as any)?.displayName || (r.lender as any)?.name,
        productName: r.product.name,
        isActive: r.isActive,
        allocationPercentage: r.allocationWeightPercent ? r.allocationWeightPercent.toNumber() : 0,
        currentWeight: r.routeState ? r.routeState.currentWeight.toNumber() : 0,
        allocatedAmount: r.routeState ? r.routeState.allocatedAmount.toNumber() : 0,
        allocatedApplicationCount: r.routeState ? r.routeState.allocatedApplicationCount : 0
     }));
  }

  async getActiveMlmPolicyVersion(scopeCode: string, platformProductId: string, asOf: Date = new Date()) {
     const policy = await this.prisma.mlmPolicy.findFirst({
        where: {
           scopeCode,
           platformProductId,
           operationalStatus: MlmPolicyOperationalStatus.ACTIVE,
        },
        include: {
           versions: {
              where: { status: MlmPolicyVersionStatus.ACTIVE },
              include: { routes: { include: { routeState: true } } },
           }
        }
     });

     if (!policy || policy.versions.length === 0) {
        throw new NotFoundException('MLM_ACTIVE_POLICY_NOT_FOUND');
     }
     
     if (policy.versions.length > 1) {
        throw new ConflictException('MLM_ACTIVE_POLICY_CONFLICT');
     }

     return policy.versions[0];
  }

  async executeAllocation(dto: ExecuteMlmAllocationDto) {
    const version = await this.getActiveMlmPolicyVersion('PLATFORM_DEFAULT', dto.platformProductId);
    return this.engine.execute(dto, version);
  }
}
