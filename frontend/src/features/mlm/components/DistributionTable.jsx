import ReadinessBadge from './ReadinessBadge';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Badge, EmptyState, TableShell } from '../../../components/ui';

const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
};

export default function DistributionTable({ distribution }) {
  if (!distribution || distribution.length === 0) {
    return <EmptyState title="No distribution routes found" description="No routes match the selected criteria." />;
  }

  return (
    <TableShell>
      <thead className="border-b border-neutral-200 bg-neutral-50">
        <tr>
          <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-neutral-500">Lender</th>
          <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-neutral-500">Product</th>
          <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-neutral-500">Readiness</th>
          <th className="px-5 py-3 text-center text-xs font-bold uppercase tracking-wide text-neutral-500">Active</th>
          <th className="bg-info-50/50 px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-neutral-500">Target %</th>
          <th className="bg-brand-50/50 px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-neutral-500">Actual %</th>
          <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-neutral-500">Variance</th>
          <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-neutral-500">Current weight</th>
          <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-neutral-500">Allocated apps</th>
          <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-neutral-500">Total amount</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100">
        {distribution.map((route) => {
          const isVariancePositive = route.variancePercentage > 0;
          const isVarianceNegative = route.variancePercentage < 0;

          return (
            <tr key={route.routeId} className="hover:bg-neutral-50/70">
              <td className="whitespace-nowrap px-5 py-3.5">
                <div className="font-semibold text-ink">{route.lenderName}</div>
                <div className="font-numeric text-xs text-neutral-500">{route.lenderId}</div>
              </td>
              <td className="whitespace-nowrap px-5 py-3.5 text-ink">
                {route.productName}
              </td>
              <td className="whitespace-nowrap px-5 py-3.5">
                <ReadinessBadge status={route.readiness} />
              </td>
              <td className="whitespace-nowrap px-5 py-3.5 text-center">
                <Badge tone={route.isActive ? 'brand' : 'neutral'}>{route.isActive ? 'Active' : 'Inactive'}</Badge>
              </td>
              <td className="font-numeric whitespace-nowrap bg-info-50/30 px-5 py-3.5 text-right font-semibold text-info-700">
                {route.targetPercentage}%
              </td>
              <td className="font-numeric whitespace-nowrap bg-brand-50/30 px-5 py-3.5 text-right font-semibold text-brand-700">
                {route.actualApplicationPercentage.toFixed(2)}%
              </td>
              <td className="font-numeric whitespace-nowrap px-5 py-3.5 text-right">
                <div className="flex items-center justify-end gap-1">
                  {isVariancePositive && <ArrowUp size={14} className="text-caution-500" />}
                  {isVarianceNegative && <ArrowDown size={14} className="text-accent-500" />}
                  {!isVariancePositive && !isVarianceNegative && <Minus size={14} className="text-neutral-400" />}
                  <span className={`font-semibold ${isVariancePositive ? 'text-caution-600' : isVarianceNegative ? 'text-accent-600' : 'text-neutral-500'}`}>
                    {Math.abs(route.variancePercentage).toFixed(2)}%
                  </span>
                </div>
              </td>
              <td className="font-numeric whitespace-nowrap px-5 py-3.5 text-right text-neutral-600">
                {route.currentWeight.toFixed(4)}
              </td>
              <td className="font-numeric whitespace-nowrap px-5 py-3.5 text-right font-semibold text-ink">
                {route.allocatedApplicationCount}
              </td>
              <td className="font-numeric whitespace-nowrap px-5 py-3.5 text-right font-semibold text-ink">
                {formatCurrency(route.allocatedAmount)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </TableShell>
  );
}
