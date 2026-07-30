import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { SmoothWeightedRoundRobinService, SwrrRoute } from '../smooth-weighted-round-robin.service';
import {
  Prisma,
  MlmPolicyVersion,
  MlmAllocationRoute,
  MlmAllocationDecisionStatus,
  MlmAllocationAttemptOutcome,
} from '@prisma/client';
import { ExecuteMlmAllocationDto, SimulationResult, CandidateResult, SimulateMlmPolicyVersionDto } from '../../mlm.types';

@Injectable()
export class MlmAllocationEngineService {
  private readonly logger = new Logger(MlmAllocationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly swrrService: SmoothWeightedRoundRobinService,
  ) {}

  async simulate(
    dto: SimulateMlmPolicyVersionDto,
    policyVersion: MlmPolicyVersion & { routes: (MlmAllocationRoute & { routeState: any })[] },
  ) {
    const amount = new Prisma.Decimal(dto.requestedAmount);
    
    // Set up initial state
    const swrrRoutes: SwrrRoute[] = [];
    const excludedRoutes = [];
    
    for (const route of policyVersion.routes) {
      if (!route.isActive) {
        excludedRoutes.push({
           routeId: route.id,
           lenderId: route.lenderId,
           productId: route.productId,
           reason: 'ROUTE_INACTIVE'
        });
        continue;
      }
      
      // Readiness check
      // Ideally we'd check lender active status here if we joined it, but simulation is purely algorithmic based on weights right now.

      swrrRoutes.push({
        id: route.id,
        allocationPercentage: route.allocationWeightPercent || new Prisma.Decimal(0),
        currentWeight: dto.startFromZero ? new Prisma.Decimal(0) : (route.routeState?.currentWeight || new Prisma.Decimal(0)),
        isEligible: true, // For simulation purposes, assume all active routes are eligible unless filters applied
      });
    }

    const sequence = [];
    const summaryMap = new Map<string, { count: number, totalAmount: Prisma.Decimal, targetPercentage: Prisma.Decimal }>();
    
    for (const r of swrrRoutes) {
      summaryMap.set(r.id, { count: 0, totalAmount: new Prisma.Decimal(0), targetPercentage: r.allocationPercentage });
    }

    for (let i = 0; i < dto.previewCount; i++) {
       const { selectedRouteId, updatedRoutes } = this.swrrService.selectNext(swrrRoutes);
       if (selectedRouteId) {
          sequence.push(selectedRouteId);
          // Update the swrrRoutes for the next iteration (this is in-memory only)
          for (let j = 0; j < swrrRoutes.length; j++) {
             const updated = updatedRoutes.find(ur => ur.id === swrrRoutes[j].id);
             if (updated) {
                 swrrRoutes[j].currentWeight = updated.currentWeight;
             }
          }
          
          const summary = summaryMap.get(selectedRouteId);
          if (summary) {
             summary.count++;
             summary.totalAmount = summary.totalAmount.add(amount);
          }
       } else {
          sequence.push(null);
       }
    }

    const projectedSummary = Array.from(summaryMap.entries()).map(([routeId, data]) => {
        const actualPercentage = dto.previewCount > 0 ? (data.count / dto.previewCount) * 100 : 0;
        return {
           routeId,
           count: data.count,
           totalAmount: data.totalAmount.toNumber(),
           targetPercentage: data.targetPercentage.toNumber(),
           actualPercentage: Number(actualPercentage.toFixed(2)),
           variancePercentage: Number((actualPercentage - data.targetPercentage.toNumber()).toFixed(2))
        };
    });

    return {
      sequence,
      projectedSummary,
      excludedRoutes
    };
  }

  async execute(
    dto: ExecuteMlmAllocationDto,
    policyVersion: MlmPolicyVersion & { routes: (MlmAllocationRoute & { routeState: any })[] },
    maxRetries = 3,
  ) {
    let attempts = 0;
    while (attempts < maxRetries) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            return await this.executeInternal(tx, dto, policyVersion);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
        );
      } catch (error) {
        attempts++;
        if (this.isRetryableError(error) && attempts < maxRetries) {
          this.logger.warn(`Transaction failed. Retrying... (${attempts}/${maxRetries})`, error);
          await new Promise((res) => setTimeout(res, 50 * attempts));
        } else {
          // Constraint [13]: Add bounded retry, maximum three attempts, only for deadlocks, serialization failures and transaction conflicts.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
             // Unique constraint violation (likely applicationReference race). We should retry.
             if (attempts < maxRetries) {
                 await new Promise((res) => setTimeout(res, 50 * attempts));
                 continue;
             }
          }
          this.logger.error(`Transaction failed after ${attempts} attempts`, error);
          throw error;
        }
      }
    }
  }

  private isRetryableError(error: any): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2034: Transaction failed due to a write conflict or a deadlock. Please retry your transaction
      if (error.code === 'P2034') return true;
    }
    if (error.code === 'ER_LOCK_DEADLOCK' || error.code === 'ER_LOCK_WAIT_TIMEOUT') return true;
    return false;
  }

  async executeWithTx(
    tx: Prisma.TransactionClient,
    dto: ExecuteMlmAllocationDto,
    policyVersion: MlmPolicyVersion & { routes: (MlmAllocationRoute & { routeState: any })[] },
  ) {
    return this.executeInternal(tx, dto, policyVersion);
  }

  private async executeInternal(
    tx: Prisma.TransactionClient,
    dto: ExecuteMlmAllocationDto,
    policyVersion: MlmPolicyVersion & { routes: (MlmAllocationRoute & { routeState: any })[] },
  ) {
    // Constraint [6]: Handle the concurrent initial decision-creation race caused by the unique applicationReference.
    // Read existing decision
    let decision = await tx.mlmAllocationDecision.findUnique({
      where: { applicationReference: dto.applicationReference },
      include: { attempts: true },
    });

    if (decision) {
      // Lock existing decision
      await tx.$queryRaw`SELECT id FROM MlmAllocationDecision WHERE applicationReference = ${dto.applicationReference} FOR UPDATE`;
      if (decision.status === MlmAllocationDecisionStatus.ASSIGNED) {
        // Idempotently return already assigned
        return decision;
      }
    }

    const amount = new Prisma.Decimal(dto.requestedAmount);
    
    // Constraint [14]: Require Platform BRE PASS. FAIL and REFER must not modify SWRR state.
    // Constraint [8]: BRE FAIL and REFER must create/reuse safe decision evidence and append a PLATFORM_POLICY_NOT_PASSED attempt, but must not change any SWRR state.
    const isPlatformPassed = dto.platformDecisionOutcome === 'PASS';

    // Constraint [7]: Lock route-state rows in deterministic sortOrder/routeId order.
    // Re-read weights and recompute eligibility and SWRR only after locking.
    const lockedStates: any[] = await tx.$queryRaw`
      SELECT s.* 
      FROM MlmAllocationRouteState s
      JOIN MlmAllocationRoute r ON s.routeId = r.id
      WHERE s.mlmPolicyVersionId = ${policyVersion.id}
      ORDER BY r.sortOrder ASC, r.id ASC
      FOR UPDATE
    `;

    const stateMap = new Map(lockedStates.map(s => [s.routeId, s]));
    
    const candidateResults: CandidateResult[] = [];
    const swrrRoutes: SwrrRoute[] = [];
    let eligibleRoutes: MlmAllocationRoute[] = [];

    for (const route of policyVersion.routes) {
      if (!route.isActive) continue;

      let isEligible = isPlatformPassed;
      let reason = isPlatformPassed ? '' : 'PLATFORM_POLICY_NOT_PASSED';

      if (isEligible) {
         // Placeholder for product/lender checks if joined
      }

      const lockedState = stateMap.get(route.id);
      const currentWeight = lockedState ? new Prisma.Decimal(lockedState.currentWeight) : new Prisma.Decimal(0);

      candidateResults.push({
        routeId: route.id,
        lenderId: route.lenderId,
        productId: route.productId,
        isEligible,
        rejectionReason: reason || undefined,
        allocationPercentage: route.allocationWeightPercent?.toString() || '0',
        currentWeight: currentWeight.toString(),
      });

      if (isPlatformPassed) {
        swrrRoutes.push({
          id: route.id,
          allocationPercentage: route.allocationWeightPercent || new Prisma.Decimal(0),
          currentWeight,
          isEligible,
        });
      }

      if (isEligible) {
        eligibleRoutes.push(route);
      }
    }

    let selectedRouteId: string | null = null;
    let selectedRoute: MlmAllocationRoute | null = null;
    let updatedRoutesStates: any[] = [];
    let reasonCode = isPlatformPassed ? 'NO_ELIGIBLE_ROUTE' : 'PLATFORM_POLICY_NOT_PASSED';

    if (isPlatformPassed) {
      const swrrResult = this.swrrService.selectNext(swrrRoutes);
      selectedRouteId = swrrResult.selectedRouteId;
      selectedRoute = policyVersion.routes.find(r => r.id === selectedRouteId) || null;
      updatedRoutesStates = swrrResult.updatedRoutes;
      if (selectedRouteId) reasonCode = 'ASSIGNED';
    }

    const nextAttemptNumber = decision ? decision.attemptCount + 1 : 1;

    // Determine status
    const status = selectedRouteId 
       ? MlmAllocationDecisionStatus.ASSIGNED 
       : MlmAllocationDecisionStatus.NO_ELIGIBLE_ROUTE;

    // Record decision and state updates atomically
    if (!decision) {
      decision = await tx.mlmAllocationDecision.create({
        data: {
          applicationReference: dto.applicationReference,
          policyId: policyVersion.policyId,
          policyVersionId: policyVersion.id,
          routeId: selectedRoute?.id,
          lenderId: selectedRoute?.lenderId,
          productId: selectedRoute?.productId,
          productVersionId: selectedRoute ? selectedRoute.productId : null,
          platformPolicyVersionId: dto.platformEvaluationReference,
          platformEvaluationReference: dto.platformEvaluationReference,
          requestedAmount: dto.requestedAmount,
          customerSegment: 'ALL',
          platformDecisionOutcome: (dto.platformDecisionOutcome || 'APPROVED') as any,
          platformProductId: (policyVersion as any).policy?.platformProductId || undefined,
          status,
          decisionReasonCode: reasonCode,
          attemptCount: 1,
          assignedAt: selectedRoute ? new Date() : null,
          attempts: {
            create: [
              {
                policyVersionId: policyVersion.id,
                attemptNumber: 1,
                outcome: status as any,
                requestedAmount: dto.requestedAmount,
                candidateResults: candidateResults as any,
                selectedRouteId: selectedRoute?.id,
                reasonCode: selectedRoute ? undefined : reasonCode,
              },
            ],
          },
        },
        include: { attempts: true },
      });
    } else {
      decision = await tx.mlmAllocationDecision.update({
        where: { id: decision.id },
        data: {
          attemptCount: nextAttemptNumber,
          routeId: selectedRoute?.id,
          lenderId: selectedRoute?.lenderId,
          productId: selectedRoute?.productId,
          productVersionId: selectedRoute ? selectedRoute.productId : null,
          status,
          decisionReasonCode: reasonCode,
          assignedAt: selectedRoute ? new Date() : null,
          attempts: {
            create: [
              {
                policyVersionId: policyVersion.id,
                attemptNumber: nextAttemptNumber,
                outcome: status as any,
                requestedAmount: dto.requestedAmount,
                candidateResults: candidateResults as any,
                selectedRouteId: selectedRoute?.id,
                reasonCode: selectedRoute ? undefined : reasonCode,
              },
            ],
          },
        },
        include: { attempts: true },
      });
    }

    if (selectedRouteId && isPlatformPassed) {
      // Update SWRR states
      for (const updatedState of updatedRoutesStates) {
         let deltaApp = 0;
         let deltaAmt = new Prisma.Decimal(0);
         if (updatedState.id === selectedRouteId) {
             deltaApp = 1;
             deltaAmt = amount;
         }
         await tx.mlmAllocationRouteState.update({
             where: { routeId: updatedState.id },
             data: {
                currentWeight: updatedState.currentWeight,
                allocatedApplicationCount: { increment: deltaApp },
                allocatedAmount: { increment: deltaAmt },
                lastAllocatedAt: deltaApp > 0 ? new Date() : undefined,
                version: { increment: 1 }
             }
         });
      }
    }

    return decision;
  }
}
