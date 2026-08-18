import { Test, TestingModule } from '@nestjs/testing';
import { MlmAllocationEngineService } from './mlm-allocation-engine.service';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { SmoothWeightedRoundRobinService } from '../smooth-weighted-round-robin.service';
import { Prisma } from '@prisma/client';

describe('MlmAllocationEngineService - Readiness Checks', () => {
  let service: MlmAllocationEngineService;

  // Mock Prisma transaction client
  const createMockTx = (overrides: any = {}) => ({
    lender: {
      findUnique: jest.fn().mockResolvedValue(overrides.lender ?? { id: 'L1', operationalStatus: 'ACTIVE', approvalStatus: 'APPROVED' }),
    },
    lenderProduct: {
      findUnique: jest.fn().mockResolvedValue(overrides.lenderProduct ?? { id: 'P1', operationalStatus: 'ACTIVE', platformProductId: 'PLAT1' }),
    },
    lenderProductVersion: {
      findMany: jest.fn().mockResolvedValue(overrides.lenderProductVersions ?? [{ id: 'PSV1', status: 'ACTIVE', effectiveFrom: null }]),
    },
    mlmAllocationDecision: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({ ...data, id: 'DEC1', attempts: [] })),
      update: jest.fn().mockImplementation(({ data }) => ({ ...data, id: 'DEC1', attempts: [] })),
    },
    mlmAllocationRouteState: {
      update: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  });

  const basePolicyVersion = {
    id: 'PV1',
    policyId: 'POL1',
    routes: [
      {
        id: 'R1',
        isActive: true,
        lenderId: 'L1',
        productId: 'P1',
        allocationWeightPercent: new Prisma.Decimal(100),
        sortOrder: 1,
        minimumTicketAmount: null,
        maximumTicketAmount: null,
        routeState: { currentWeight: new Prisma.Decimal(0) },
      },
    ],
  };

  const baseDto = {
    applicationReference: 'APP-TEST-001',
    requestedAmount: 50000,
    platformDecisionOutcome: 'PASS',
    platformProductId: 'PLAT1',
    customerSegment: 'NEW',
    platformEvaluationReference: 'EVAL-001',
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MlmAllocationEngineService,
        { provide: PrismaService, useValue: {} },
        SmoothWeightedRoundRobinService,
      ],
    }).compile();
    service = module.get<MlmAllocationEngineService>(MlmAllocationEngineService);
  });

  it('should reject route when lender is not APPROVED', async () => {
    const tx = createMockTx({
      lender: { id: 'L1', operationalStatus: 'ACTIVE', approvalStatus: 'PENDING' },
    });
    const result = await service.executeWithTx(tx as any, baseDto as any, basePolicyVersion as any);
    // All routes rejected → NO_ELIGIBLE_ROUTE
    expect(result!.status).toBe('NO_ELIGIBLE_ROUTE');
    expect(result!.decisionReasonCode).toBe('NO_ELIGIBLE_ROUTE');
  });

  it('should reject route when lender is inactive', async () => {
    const tx = createMockTx({
      lender: { id: 'L1', operationalStatus: 'INACTIVE', approvalStatus: 'APPROVED' },
    });
    const result = await service.executeWithTx(tx as any, baseDto as any, basePolicyVersion as any);
    expect(result!.status).toBe('NO_ELIGIBLE_ROUTE');
  });

  it('should reject route when product platformProductId does not match', async () => {
    const tx = createMockTx({
      lenderProduct: { id: 'P1', operationalStatus: 'ACTIVE', platformProductId: 'PLAT_WRONG' },
    });
    const result = await service.executeWithTx(tx as any, baseDto as any, basePolicyVersion as any);
    expect(result!.status).toBe('NO_ELIGIBLE_ROUTE');
  });

  it('should reject route when there are zero active product versions', async () => {
    const tx = createMockTx({ lenderProductVersions: [] });
    const result = await service.executeWithTx(tx as any, baseDto as any, basePolicyVersion as any);
    expect(result!.status).toBe('NO_ELIGIBLE_ROUTE');
  });

  it('should reject route when there are two active product versions', async () => {
    const tx = createMockTx({
      lenderProductVersions: [
        { id: 'PSV1', status: 'ACTIVE', effectiveFrom: null },
        { id: 'PSV2', status: 'ACTIVE', effectiveFrom: null },
      ],
    });
    const result = await service.executeWithTx(tx as any, baseDto as any, basePolicyVersion as any);
    expect(result!.status).toBe('NO_ELIGIBLE_ROUTE');
  });

  it('should reject route when PSV effectiveFrom is in the future', async () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const tx = createMockTx({
      lenderProductVersions: [{ id: 'PSV1', status: 'ACTIVE', effectiveFrom: futureDate }],
    });
    const result = await service.executeWithTx(tx as any, baseDto as any, basePolicyVersion as any);
    expect(result!.status).toBe('NO_ELIGIBLE_ROUTE');
  });

  it('should reject route when amount is below minimum', async () => {
    const pv = {
      ...basePolicyVersion,
      routes: [{
        ...basePolicyVersion.routes[0],
        minimumTicketAmount: new Prisma.Decimal(100000),
      }],
    };
    const tx = createMockTx();
    const result = await service.executeWithTx(tx as any, baseDto as any, pv as any);
    expect(result!.status).toBe('NO_ELIGIBLE_ROUTE');
  });

  it('should reject route when amount is above maximum', async () => {
    const pv = {
      ...basePolicyVersion,
      routes: [{
        ...basePolicyVersion.routes[0],
        maximumTicketAmount: new Prisma.Decimal(10000),
      }],
    };
    const tx = createMockTx();
    const result = await service.executeWithTx(tx as any, baseDto as any, pv as any);
    expect(result!.status).toBe('NO_ELIGIBLE_ROUTE');
  });

  it('should allocate with requestedAmount null and skip amount limits', async () => {
    const pv = {
      ...basePolicyVersion,
      routes: [{
        ...basePolicyVersion.routes[0],
        minimumTicketAmount: new Prisma.Decimal(100000),
        maximumTicketAmount: new Prisma.Decimal(200000),
      }],
    };
    const tx = createMockTx();
    const result = await service.executeWithTx(
      tx as any,
      { ...baseDto, requestedAmount: null } as any,
      pv as any,
    );

    expect(result!.status).toBe('ASSIGNED');
    expect(tx.mlmAllocationDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestedAmount: null,
          attempts: expect.objectContaining({
            create: [expect.objectContaining({ requestedAmount: null })],
          }),
        }),
      }),
    );
  });

  it('should allocate successfully and persist correct productVersionId', async () => {
    const tx = createMockTx();
    const result = await service.executeWithTx(tx as any, baseDto as any, basePolicyVersion as any);
    expect(result!.status).toBe('ASSIGNED');
    // The decision should have the PSV id, not the product id
    expect(tx.mlmAllocationDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productVersionId: 'PSV1',  // Must be PSV id, not route.productId
        }),
      }),
    );
  });

  it('should create NO_ELIGIBLE_ROUTE decision with PLATFORM_POLICY_NOT_PASSED when BRE fails', async () => {
    const tx = createMockTx();
    const failDto = { ...baseDto, platformDecisionOutcome: 'FAIL' };
    const result = await service.executeWithTx(tx as any, failDto as any, basePolicyVersion as any);
    expect(result!.status).toBe('NO_ELIGIBLE_ROUTE');
    expect(result!.decisionReasonCode).toBe('PLATFORM_POLICY_NOT_PASSED');
  });

  it('persists customerSegment from the dto instead of the previously hardcoded ALL', async () => {
    const tx = createMockTx();
    const repeatDto = { ...baseDto, customerSegment: 'REPEAT' };
    await service.executeWithTx(tx as any, repeatDto as any, basePolicyVersion as any);
    expect(tx.mlmAllocationDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ customerSegment: 'REPEAT' }) }),
    );
  });

  describe('repeat-customer sticky lender allocation', () => {
    // Route-aware mock tx: unlike createMockTx (fixed return regardless of which route
    // is being checked), this resolves lender/product/PSV per the specific id queried,
    // so two routes in the same policyVersion can have different eligibility outcomes.
    const createRouteAwareMockTx = (lenders: Record<string, any>, products: Record<string, any>) => ({
      lender: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(lenders[where.id] ?? null)),
      },
      lenderProduct: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(products[where.id] ?? null)),
      },
      lenderProductVersion: {
        findMany: jest.fn().mockResolvedValue([{ id: 'PSV1', status: 'ACTIVE', effectiveFrom: null }]),
      },
      mlmAllocationDecision: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => ({ ...data, id: 'DEC1', attempts: [] })),
        update: jest.fn().mockImplementation(({ data }: any) => ({ ...data, id: 'DEC1', attempts: [] })),
      },
      mlmAllocationRouteState: {
        update: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    });

    const twoRoutePolicyVersion = {
      id: 'PV1',
      policyId: 'POL1',
      routes: [
        {
          id: 'R1', isActive: true, lenderId: 'L1', productId: 'P1',
          allocationWeightPercent: new Prisma.Decimal(50), sortOrder: 1,
          minimumTicketAmount: null, maximumTicketAmount: null,
          routeState: { currentWeight: new Prisma.Decimal(0) },
        },
        {
          id: 'R2', isActive: true, lenderId: 'L2', productId: 'P2',
          allocationWeightPercent: new Prisma.Decimal(50), sortOrder: 2,
          minimumTicketAmount: null, maximumTicketAmount: null,
          routeState: { currentWeight: new Prisma.Decimal(0) },
        },
      ],
    };

    it('assigns the hinted route directly and skips SWRR weight updates', async () => {
      const tx = createMockTx(); // single eligible route R1 / L1 / P1
      const stickyDto = { ...baseDto, customerSegment: 'REPEAT', stickyRouteHint: { lenderId: 'L1', productId: 'P1' } };

      const result = await service.executeWithTx(tx as any, stickyDto as any, basePolicyVersion as any);

      expect(result!.status).toBe('ASSIGNED');
      expect(result!.routeId).toBe('R1');
      expect(result!.decisionReasonCode).toBe('REPEAT_CUSTOMER_STICKY_LENDER');
      expect(tx.mlmAllocationRouteState.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { routeId: 'R1' },
        data: expect.objectContaining({ allocatedApplicationCount: { increment: 1 } }),
      }));
      // currentWeight must never be touched for a sticky assignment — it must not
      // participate in round-robin weighting.
      const call = tx.mlmAllocationRouteState.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('currentWeight');
    });

    it('falls back to normal SWRR allocation when the hinted route is no longer eligible', async () => {
      const tx = createRouteAwareMockTx(
        {
          L1: { id: 'L1', operationalStatus: 'INACTIVE', approvalStatus: 'APPROVED' }, // hinted lender, now inactive
          L2: { id: 'L2', operationalStatus: 'ACTIVE', approvalStatus: 'APPROVED' },
        },
        {
          P1: { id: 'P1', operationalStatus: 'ACTIVE', platformProductId: 'PLAT1' },
          P2: { id: 'P2', operationalStatus: 'ACTIVE', platformProductId: 'PLAT1' },
        },
      );
      const stickyDto = { ...baseDto, customerSegment: 'REPEAT', stickyRouteHint: { lenderId: 'L1', productId: 'P1' } };

      const result = await service.executeWithTx(tx as any, stickyDto as any, twoRoutePolicyVersion as any);

      expect(result!.status).toBe('ASSIGNED');
      expect(result!.routeId).toBe('R2');
      expect(result!.decisionReasonCode).toBe('ASSIGNED');
      // Normal SWRR path was used, not the sticky counter-only path — currentWeight IS updated.
      expect(tx.mlmAllocationRouteState.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ currentWeight: expect.anything() }),
      }));
    });

    it('falls back to normal SWRR allocation when the sticky hint matches no route at all', async () => {
      const tx = createMockTx(); // single eligible route R1 / L1 / P1
      const stickyDto = {
        ...baseDto,
        customerSegment: 'REPEAT',
        stickyRouteHint: { lenderId: 'LENDER-THAT-NO-LONGER-HAS-A-ROUTE', productId: 'GONE' },
      };

      const result = await service.executeWithTx(tx as any, stickyDto as any, basePolicyVersion as any);

      expect(result!.status).toBe('ASSIGNED');
      expect(result!.routeId).toBe('R1');
      expect(result!.decisionReasonCode).toBe('ASSIGNED');
      expect(tx.mlmAllocationRouteState.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ currentWeight: expect.anything() }),
      }));
    });
  });
});
