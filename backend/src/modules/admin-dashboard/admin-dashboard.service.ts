import { Injectable } from '@nestjs/common';
import { PlApplicationStatus, PlLoanStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

// PlApplicationStatus values that represent the application having reached a final,
// lender-side outcome — used for the approval-rate calculation. LOAN_CLOSED is
// excluded on purpose: it means the application was *already* approved (a loan was
// created and later fully repaid), not that it was decided just now.
const APPROVED_APPLICATION_STATUSES: PlApplicationStatus[] = [
  PlApplicationStatus.LENDER_APPROVED,
  PlApplicationStatus.ASSESSMENT_FEE_PAID,
  PlApplicationStatus.LOAN_CLOSED,
];
const REJECTED_APPLICATION_STATUSES: PlApplicationStatus[] = [
  PlApplicationStatus.PLATFORM_REJECTED,
  PlApplicationStatus.LENDER_REJECTED,
];

// PlLoan.status values that mean a loan actually reached disbursal at some point —
// FULLY_PAID loans were disbursed too, they've just since been repaid in full.
const DISBURSED_LOAN_STATUSES: PlLoanStatus[] = [PlLoanStatus.DISBURSED, PlLoanStatus.FULLY_PAID];

const DPD_BUCKET_DEFS = [
  { bucket: 'CURRENT', label: 'Current (not yet due)' },
  { bucket: 'DPD_1_30', label: '1–30 DPD' },
  { bucket: 'DPD_31_60', label: '31–60 DPD' },
  { bucket: 'DPD_61_90', label: '61–90 DPD' },
  { bucket: 'DPD_90_PLUS', label: '90+ DPD (NPA)' },
];

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function monthStart(monthsAgo = 0): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
}

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics() {
    const [
      applicationsByStatus,
      applicationsTotal,
      applicationsThisMonth,
      disbursalAllTime,
      disbursalThisMonth,
      outstandingAgg,
      collectionsAllTime,
      collectionsThisMonth,
      dueThisMonthAgg,
      dpdBucketsRaw,
      trendDisbursalRaw,
      trendCollectionRaw,
      lenderBreakdownRaw,
    ] = await Promise.all([
      this.prisma.plApplication.groupBy({ by: ['status'], _count: { _all: true } }),

      this.prisma.plApplication.count(),

      this.prisma.plApplication.count({
        where: { submittedAt: { gte: monthStart(0) } },
      }),

      this.prisma.plLoan.aggregate({
        where: { status: { in: DISBURSED_LOAN_STATUSES } },
        _count: true,
        _sum: { disbursalAmount: true },
      }),

      this.prisma.plLoan.aggregate({
        where: {
          status: { in: DISBURSED_LOAN_STATUSES },
          disbursalCompletedAt: { gte: monthStart(0) },
        },
        _count: true,
        _sum: { disbursalAmount: true },
      }),

      // Portfolio outstanding — both the pure principal figure (POS, the standard NBFC
      // term) and the full receivable (principal + interest still owed) across every
      // installment that hasn't been fully paid yet, for currently-disbursed loans only.
      this.prisma.plRepaymentSchedule.aggregate({
        where: { paymentStatus: { not: 'PAID' }, loan: { status: { in: DISBURSED_LOAN_STATUSES } } },
        _sum: { outstandingPrincipal: true, remainingAmount: true },
        _count: true,
      }),

      this.prisma.plRepayment.aggregate({
        where: { status: 'SUCCESS' },
        _sum: { amountReceived: true },
        _count: true,
      }),

      this.prisma.plRepayment.aggregate({
        where: { status: 'SUCCESS', paymentDate: { gte: monthStart(0) } },
        _sum: { amountReceived: true },
        _count: true,
      }),

      // What was actually due this month (by original due date), and how much of that
      // specific due amount has been collected — a cleaner "collection efficiency"
      // signal than matching by payment date, since a late payment still counts against
      // the month it was originally due.
      this.prisma.plRepaymentSchedule.aggregate({
        where: { dueDate: { gte: monthStart(0) } },
        _sum: { emi: true, paidAmount: true },
        _count: true,
      }),

      // Raw SQL: bucketing by days-past-due needs a computed expression Prisma's query
      // builder can't express directly. The `dpd` column on this table is never
      // actually updated by any cron (confirmed — grep found no writer for it besides
      // the initial `0` at row creation), so it can't be trusted; DPD is computed live
      // here from due_date instead.
      this.prisma.$queryRaw<Array<{ bucket: string; count: bigint; amount: string | null }>>`
        SELECT
          CASE
            WHEN DATEDIFF(CURDATE(), rps.due_date) <= 0 THEN 'CURRENT'
            WHEN DATEDIFF(CURDATE(), rps.due_date) BETWEEN 1 AND 30 THEN 'DPD_1_30'
            WHEN DATEDIFF(CURDATE(), rps.due_date) BETWEEN 31 AND 60 THEN 'DPD_31_60'
            WHEN DATEDIFF(CURDATE(), rps.due_date) BETWEEN 61 AND 90 THEN 'DPD_61_90'
            ELSE 'DPD_90_PLUS'
          END AS bucket,
          COUNT(*) AS count,
          SUM(rps.remaining_amount) AS amount
        FROM pl_repayment_schedules rps
        INNER JOIN pl_loans l ON l.id = rps.loan_id
        WHERE rps.payment_status != 'PAID'
          AND l.status IN ('DISBURSED', 'FULLY_PAID')
        GROUP BY bucket
      `,

      this.prisma.$queryRaw<Array<{ month: string; count: bigint; amount: string | null }>>`
        SELECT DATE_FORMAT(disbursal_completed_at, '%Y-%m') AS month, COUNT(*) AS count, SUM(disbursal_amount) AS amount
        FROM pl_loans
        WHERE status IN ('DISBURSED', 'FULLY_PAID')
          AND disbursal_completed_at >= ${monthStart(11)}
        GROUP BY month
        ORDER BY month ASC
      `,

      this.prisma.$queryRaw<Array<{ month: string; amount: string | null }>>`
        SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, SUM(amount_received) AS amount
        FROM pl_repayments
        WHERE status = 'SUCCESS'
          AND payment_date >= ${monthStart(11)}
        GROUP BY month
        ORDER BY month ASC
      `,

      // Outstanding is pre-aggregated per loan_id in a subquery first, then joined 1:1
      // onto pl_loans — joining pl_repayment_schedules directly would multiply
      // disbursal_amount by however many unpaid installment rows each loan has.
      this.prisma.$queryRaw<Array<{ lenderCode: string; count: bigint; amount: string | null; outstanding: string | null }>>`
        SELECT
          l.lender_code AS lenderCode,
          COUNT(*) AS count,
          SUM(l.disbursal_amount) AS amount,
          COALESCE(SUM(loan_outstanding.outstanding), 0) AS outstanding
        FROM pl_loans l
        LEFT JOIN (
          SELECT loan_id, SUM(remaining_amount) AS outstanding
          FROM pl_repayment_schedules
          WHERE payment_status != 'PAID'
          GROUP BY loan_id
        ) AS loan_outstanding ON loan_outstanding.loan_id = l.id
        WHERE l.status IN ('DISBURSED', 'FULLY_PAID')
        GROUP BY l.lender_code
        ORDER BY amount DESC
      `,
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of applicationsByStatus) {
      statusCounts[row.status] = row._count._all;
    }

    const approvedCount = APPROVED_APPLICATION_STATUSES.reduce((sum, status) => sum + (statusCounts[status] || 0), 0);
    const rejectedCount = REJECTED_APPLICATION_STATUSES.reduce((sum, status) => sum + (statusCounts[status] || 0), 0);
    const decidedCount = approvedCount + rejectedCount;

    const dpdBucketMap = new Map(dpdBucketsRaw.map((row) => [row.bucket, row]));
    const dpdBuckets = DPD_BUCKET_DEFS.map((def) => {
      const row = dpdBucketMap.get(def.bucket);
      return {
        bucket: def.bucket,
        label: def.label,
        count: row ? Number(row.count) : 0,
        amount: row ? toNumber(row.amount) : 0,
      };
    });

    const totalUnpaidAmount = dpdBuckets.reduce((sum, b) => sum + b.amount, 0);
    const npaAmount = dpdBuckets.find((b) => b.bucket === 'DPD_90_PLUS')?.amount || 0;

    // Merge the two independent monthly trend series (disbursal, collection) into one
    // aligned array so the frontend doesn't have to.
    const trendMap = new Map<string, { month: string; disbursedCount: number; disbursedAmount: number; collectedAmount: number }>();
    for (let i = 11; i >= 0; i -= 1) {
      const d = monthStart(i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      trendMap.set(key, { month: key, disbursedCount: 0, disbursedAmount: 0, collectedAmount: 0 });
    }
    for (const row of trendDisbursalRaw) {
      const entry = trendMap.get(row.month);
      if (entry) {
        entry.disbursedCount = Number(row.count);
        entry.disbursedAmount = toNumber(row.amount);
      }
    }
    for (const row of trendCollectionRaw) {
      const entry = trendMap.get(row.month);
      if (entry) entry.collectedAmount = toNumber(row.amount);
    }

    const dueThisMonthAmount = toNumber(dueThisMonthAgg._sum.emi);
    const collectedOfDueThisMonth = toNumber(dueThisMonthAgg._sum.paidAmount);

    return {
      generatedAt: new Date().toISOString(),

      applications: {
        total: applicationsTotal,
        submittedThisMonth: applicationsThisMonth,
        byStatus: statusCounts,
        approvedCount,
        rejectedCount,
        approvalRate: decidedCount > 0 ? approvedCount / decidedCount : null,
      },

      disbursal: {
        totalCount: disbursalAllTime._count,
        totalAmount: toNumber(disbursalAllTime._sum.disbursalAmount),
        thisMonthCount: disbursalThisMonth._count,
        thisMonthAmount: toNumber(disbursalThisMonth._sum.disbursalAmount),
        avgTicketSize: disbursalAllTime._count > 0
          ? toNumber(disbursalAllTime._sum.disbursalAmount) / disbursalAllTime._count
          : 0,
      },

      portfolio: {
        // "POS" — Principal Outstanding, the standard NBFC/lending term. Distinct from
        // the full receivable below, which also includes unpaid interest.
        outstandingPrincipal: toNumber(outstandingAgg._sum.outstandingPrincipal),
        totalReceivable: toNumber(outstandingAgg._sum.remainingAmount),
        openInstallmentCount: outstandingAgg._count,
      },

      collections: {
        totalCollected: toNumber(collectionsAllTime._sum.amountReceived),
        totalCollectionCount: collectionsAllTime._count,
        collectedThisMonth: toNumber(collectionsThisMonth._sum.amountReceived),
        dueThisMonth: dueThisMonthAmount,
        collectedOfDueThisMonth,
        collectionEfficiencyThisMonth: dueThisMonthAmount > 0 ? collectedOfDueThisMonth / dueThisMonthAmount : null,
      },

      dpdBuckets,

      npa: {
        amount: npaAmount,
        percentOfOutstanding: totalUnpaidAmount > 0 ? npaAmount / totalUnpaidAmount : null,
      },

      trend: Array.from(trendMap.values()),

      lenderBreakdown: lenderBreakdownRaw.map((row) => ({
        lenderCode: row.lenderCode,
        disbursedCount: Number(row.count),
        disbursedAmount: toNumber(row.amount),
        outstandingAmount: toNumber(row.outstanding),
      })),
    };
  }
}
