import { PlApplicationStatus } from '@prisma/client';
import { AdminDashboardService } from './admin-dashboard.service';

// The "current month" trend bucket has to line up with whenever this test actually
// runs, not a hardcoded month — otherwise the test flakes at every month boundary.
const now = new Date();
const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

function buildPrisma(overrides: Partial<Record<string, any>> = {}) {
  const defaults = {
    plApplication: {
      groupBy: jest.fn().mockResolvedValue([
        { status: PlApplicationStatus.LENDER_APPROVED, _count: { _all: 3 } },
        { status: PlApplicationStatus.PLATFORM_REJECTED, _count: { _all: 1 } },
        { status: PlApplicationStatus.SUBMITTED, _count: { _all: 2 } },
      ]),
      count: jest.fn().mockResolvedValueOnce(6).mockResolvedValueOnce(2),
    },
    plLoan: {
      aggregate: jest.fn()
        .mockResolvedValueOnce({ _count: 2, _sum: { disbursalAmount: 200000 } })
        .mockResolvedValueOnce({ _count: 1, _sum: { disbursalAmount: 100000 } }),
    },
    plRepaymentSchedule: {
      aggregate: jest.fn()
        .mockResolvedValueOnce({ _sum: { outstandingPrincipal: 150000, remainingAmount: 160000 }, _count: 10 })
        .mockResolvedValueOnce({ _sum: { emi: 5000, paidAmount: 3000 }, _count: 1 }),
    },
    plRepayment: {
      aggregate: jest.fn()
        .mockResolvedValueOnce({ _sum: { amountReceived: 50000 }, _count: 5 })
        .mockResolvedValueOnce({ _sum: { amountReceived: 10000 }, _count: 1 }),
    },
    $queryRaw: jest.fn()
      .mockResolvedValueOnce([
        { bucket: 'CURRENT', count: 5n, amount: '100000' },
        { bucket: 'DPD_90_PLUS', count: 2n, amount: '20000' },
      ])
      .mockResolvedValueOnce([{ month: currentMonthKey, count: 1n, amount: '100000' }])
      .mockResolvedValueOnce([{ month: currentMonthKey, amount: '10000' }])
      .mockResolvedValueOnce([{ lenderCode: 'FFPL2026', count: 2n, amount: '200000', outstanding: '160000' }]),
  };
  return { ...defaults, ...overrides };
}

describe('AdminDashboardService', () => {
  describe('getMetrics', () => {
    it('assembles applications, disbursal, portfolio, collections, DPD buckets, trend and lender breakdown', async () => {
      const prisma = buildPrisma();
      const service = new AdminDashboardService(prisma as any);
      const result = await service.getMetrics();

      expect(result.applications).toEqual({
        total: 6,
        submittedThisMonth: 2,
        byStatus: {
          [PlApplicationStatus.LENDER_APPROVED]: 3,
          [PlApplicationStatus.PLATFORM_REJECTED]: 1,
          [PlApplicationStatus.SUBMITTED]: 2,
        },
        approvedCount: 3,
        rejectedCount: 1,
        approvalRate: 3 / 4,
      });

      expect(result.disbursal).toEqual({
        totalCount: 2,
        totalAmount: 200000,
        thisMonthCount: 1,
        thisMonthAmount: 100000,
        avgTicketSize: 100000,
      });

      expect(result.portfolio).toEqual({
        outstandingPrincipal: 150000,
        totalReceivable: 160000,
        openInstallmentCount: 10,
      });

      expect(result.collections).toEqual({
        totalCollected: 50000,
        totalCollectionCount: 5,
        collectedThisMonth: 10000,
        dueThisMonth: 5000,
        collectedOfDueThisMonth: 3000,
        collectionEfficiencyThisMonth: 3000 / 5000,
      });

      // All 5 defined buckets are always present, defaulting the ones the raw query
      // didn't return (no rows in that bucket) to zero rather than omitting them.
      expect(result.dpdBuckets).toEqual([
        { bucket: 'CURRENT', label: 'Current (not yet due)', count: 5, amount: 100000 },
        { bucket: 'DPD_1_30', label: '1–30 DPD', count: 0, amount: 0 },
        { bucket: 'DPD_31_60', label: '31–60 DPD', count: 0, amount: 0 },
        { bucket: 'DPD_61_90', label: '61–90 DPD', count: 0, amount: 0 },
        { bucket: 'DPD_90_PLUS', label: '90+ DPD (NPA)', count: 2, amount: 20000 },
      ]);

      expect(result.npa).toEqual({ amount: 20000, percentOfOutstanding: 20000 / 120000 });

      // 12 fixed monthly slots, oldest first — only the current (last) month has data here.
      expect(result.trend).toHaveLength(12);
      expect(result.trend[11]).toEqual({
        month: currentMonthKey,
        disbursedCount: 1,
        disbursedAmount: 100000,
        collectedAmount: 10000,
      });
      expect(result.trend[0].disbursedAmount).toBe(0);

      expect(result.lenderBreakdown).toEqual([
        { lenderCode: 'FFPL2026', disbursedCount: 2, disbursedAmount: 200000, outstandingAmount: 160000 },
      ]);
    });

    it('returns null rates instead of dividing by zero when there is no data yet', async () => {
      const prisma = buildPrisma({
        plApplication: {
          groupBy: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0),
        },
        plLoan: {
          aggregate: jest.fn()
            .mockResolvedValueOnce({ _count: 0, _sum: { disbursalAmount: null } })
            .mockResolvedValueOnce({ _count: 0, _sum: { disbursalAmount: null } }),
        },
        plRepaymentSchedule: {
          aggregate: jest.fn()
            .mockResolvedValueOnce({ _sum: { outstandingPrincipal: null, remainingAmount: null }, _count: 0 })
            .mockResolvedValueOnce({ _sum: { emi: null, paidAmount: null }, _count: 0 }),
        },
        plRepayment: {
          aggregate: jest.fn()
            .mockResolvedValueOnce({ _sum: { amountReceived: null }, _count: 0 })
            .mockResolvedValueOnce({ _sum: { amountReceived: null }, _count: 0 }),
        },
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      });
      const service = new AdminDashboardService(prisma as any);
      const result = await service.getMetrics();

      expect(result.applications.approvalRate).toBeNull();
      expect(result.disbursal.avgTicketSize).toBe(0);
      expect(result.collections.collectionEfficiencyThisMonth).toBeNull();
      expect(result.npa.percentOfOutstanding).toBeNull();
      expect(result.dpdBuckets.every((b) => b.count === 0 && b.amount === 0)).toBe(true);
      expect(result.lenderBreakdown).toEqual([]);
    });
  });
});
