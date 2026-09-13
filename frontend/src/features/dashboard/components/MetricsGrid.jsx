import { AlertTriangle, Banknote, FileStack, Percent, PiggyBank, Receipt, Wallet, TrendingUp } from 'lucide-react';
import { StatCard } from '../../../components/ui';
import { formatCurrency, formatCurrencyFull, formatNumber, formatPercent } from '../utils/format';

// Primary + secondary KPI rows for the management dashboard. Kept as one grid rather
// than two separate components since every tile reads from the same `metrics` payload
// and there's no independent loading/error state per row.
export function MetricsGrid({ metrics }) {
  const { applications, disbursal, portfolio, collections, npa } = metrics;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={FileStack}
          label="Total applications"
          value={formatNumber(applications.total)}
          helper={`${formatNumber(applications.submittedThisMonth)} submitted this month`}
          tone="brand"
        />
        <StatCard
          icon={Banknote}
          label="Total disbursed"
          value={formatCurrency(disbursal.totalAmount)}
          helper={`${formatNumber(disbursal.totalCount)} loans · ${formatCurrency(disbursal.thisMonthAmount)} this month`}
          tone="info"
        />
        <StatCard
          icon={Wallet}
          label="Portfolio outstanding (POS)"
          value={formatCurrency(portfolio.outstandingPrincipal)}
          helper={`Total receivable ${formatCurrency(portfolio.totalReceivable)}`}
          tone="accent"
        />
        <StatCard
          icon={PiggyBank}
          label="Total collected"
          value={formatCurrency(collections.totalCollected)}
          helper={`${formatCurrency(collections.collectedThisMonth)} collected this month`}
          tone="brand"
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Percent}
          label="Approval rate"
          value={formatPercent(applications.approvalRate)}
          helper={`${formatNumber(applications.approvedCount)} approved · ${formatNumber(applications.rejectedCount)} rejected`}
          tone="brand"
        />
        <StatCard
          icon={Receipt}
          label="Average ticket size"
          value={formatCurrency(disbursal.avgTicketSize)}
          helper="Across all disbursed loans"
          tone="info"
        />
        <StatCard
          icon={TrendingUp}
          label="Collection efficiency (MTD)"
          value={formatPercent(collections.collectionEfficiencyThisMonth)}
          helper={`${formatCurrency(collections.collectedOfDueThisMonth)} of ${formatCurrency(collections.dueThisMonth)} due`}
          tone="caution"
        />
        <StatCard
          icon={AlertTriangle}
          label="NPA (90+ DPD)"
          value={formatCurrency(npa.amount)}
          helper={
            npa.percentOfOutstanding !== null
              ? `${formatPercent(npa.percentOfOutstanding)} of unpaid book — ${formatCurrencyFull(npa.amount)}`
              : 'No overdue book yet'
          }
          tone="danger"
        />
      </div>
    </>
  );
}
