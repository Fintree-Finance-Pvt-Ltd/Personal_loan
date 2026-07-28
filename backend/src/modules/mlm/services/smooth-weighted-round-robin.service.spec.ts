import { SmoothWeightedRoundRobinService, SwrrRoute } from './smooth-weighted-round-robin.service';
import { Prisma } from '@prisma/client';

describe('SmoothWeightedRoundRobinService', () => {
  let service: SmoothWeightedRoundRobinService;

  beforeEach(() => {
    service = new SmoothWeightedRoundRobinService();
  });

  it('should be fair over 10 iterations for 60/20/20 weights', () => {
    const routes: SwrrRoute[] = [
      { id: '1', allocationPercentage: new Prisma.Decimal(60), currentWeight: new Prisma.Decimal(0), isEligible: true },
      { id: '2', allocationPercentage: new Prisma.Decimal(20), currentWeight: new Prisma.Decimal(0), isEligible: true },
      { id: '3', allocationPercentage: new Prisma.Decimal(20), currentWeight: new Prisma.Decimal(0), isEligible: true },
    ];

    const counts = { '1': 0, '2': 0, '3': 0 };

    for (let i = 0; i < 10; i++) {
      const res = service.selectNext(routes);
      if (res.selectedRouteId) counts[res.selectedRouteId as keyof typeof counts]++;
      // Update routes with new weights
      for (let j = 0; j < routes.length; j++) {
        const up = res.updatedRoutes.find(r => r.id === routes[j].id);
        if (up) routes[j].currentWeight = up.currentWeight;
      }
    }

    expect(counts['1']).toBe(6);
    expect(counts['2']).toBe(2);
    expect(counts['3']).toBe(2);
  });

  it('should handle unavailable route normalization', () => {
    // Constraint [7]: Unavailable routes keep their stored currentWeight unchanged and do not accumulate weight while excluded.
    const routes: SwrrRoute[] = [
      { id: '1', allocationPercentage: new Prisma.Decimal(60), currentWeight: new Prisma.Decimal(0), isEligible: true },
      { id: '2', allocationPercentage: new Prisma.Decimal(40), currentWeight: new Prisma.Decimal(10), isEligible: false }, // Route 2 is unavailable but has saved weight
    ];

    const res = service.selectNext(routes);
    
    expect(res.selectedRouteId).toBe('1');
    const r1 = res.updatedRoutes.find(r => r.id === '1');
    const r2 = res.updatedRoutes.find(r => r.id === '2');

    // Route 1 accumulated 60 weight, then subtracted eligibleTotalWeight (60), so it should be 0.
    expect(r1?.currentWeight.toNumber()).toBe(0);

    // Route 2 should be totally untouched because it wasn't eligible.
    expect(r2?.currentWeight.toNumber()).toBe(10);
  });
});
