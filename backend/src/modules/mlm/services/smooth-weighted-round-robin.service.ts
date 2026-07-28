import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface SwrrRoute {
  id: string;
  allocationPercentage: Prisma.Decimal;
  currentWeight: Prisma.Decimal;
  isEligible: boolean;
}

export interface SwrrResult {
  selectedRouteId: string | null;
  updatedRoutes: {
    id: string;
    currentWeight: Prisma.Decimal;
  }[];
}

@Injectable()
export class SmoothWeightedRoundRobinService {
  /**
   * Executes one step of the SWRR algorithm.
   * Modifies currentWeight of eligible routes and returns the selected route and all updated states.
   * This is a pure function. It does not write to the database.
   */
  selectNext(routes: SwrrRoute[]): SwrrResult {
    let eligibleTotalWeight = new Prisma.Decimal(0);
    let bestRoute: SwrrRoute | null = null;

    // Deep copy to avoid mutating the input array's objects directly
    const workingRoutes = routes.map(r => ({
      ...r,
      allocationPercentage: new Prisma.Decimal(r.allocationPercentage),
      currentWeight: new Prisma.Decimal(r.currentWeight),
    }));

    // Phase 1: Accumulate total weight and update current weights for ELIGIBLE routes
    for (const route of workingRoutes) {
      if (route.isEligible) {
        // current_weight += effective_weight
        route.currentWeight = route.currentWeight.add(route.allocationPercentage);
        eligibleTotalWeight = eligibleTotalWeight.add(route.allocationPercentage);

        if (!bestRoute || route.currentWeight.greaterThan(bestRoute.currentWeight)) {
          bestRoute = route;
        }
      }
    }

    if (!bestRoute) {
      return {
        selectedRouteId: null,
        updatedRoutes: workingRoutes.map((r) => ({ id: r.id, currentWeight: r.currentWeight })),
      };
    }

    // Phase 2: Deduct total eligible weight from the selected route
    bestRoute.currentWeight = bestRoute.currentWeight.sub(eligibleTotalWeight);

    return {
      selectedRouteId: bestRoute.id,
      updatedRoutes: workingRoutes.map((r) => ({ id: r.id, currentWeight: r.currentWeight })),
    };
  }
}
