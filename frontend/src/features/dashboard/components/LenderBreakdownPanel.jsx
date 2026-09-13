import { Landmark } from 'lucide-react';
import { Badge, EmptyState, Panel, TableShell } from '../../../components/ui';
import { formatCurrency, formatCurrencyFull, formatNumber, formatPercent } from '../utils/format';

export function LenderBreakdownPanel({ lenderBreakdown, totalDisbursedAmount }) {
  return (
    <Panel
      title={<span className="flex items-center gap-2"><Landmark size={16} className="text-neutral-400" /> Lender-wise book</span>}
      description="Disbursal and outstanding split across lending partners."
    >
      {lenderBreakdown.length === 0 ? (
        <EmptyState icon={Landmark} title="No disbursed loans yet" description="Lender-wise figures will appear once the first loan is disbursed." />
      ) : (
        <TableShell>
          <thead className="border-b border-neutral-200 bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Lender</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Loans</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Disbursed</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Outstanding</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Share of book</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lenderBreakdown.map((row) => (
              <tr key={row.lenderCode} className="hover:bg-neutral-50/70">
                <td className="px-4 py-3">
                  <Badge tone="info">{row.lenderCode}</Badge>
                </td>
                <td className="font-numeric px-4 py-3 font-semibold text-ink">{formatNumber(row.disbursedCount)}</td>
                <td className="font-numeric px-4 py-3 font-semibold text-ink" title={formatCurrencyFull(row.disbursedAmount)}>
                  {formatCurrency(row.disbursedAmount)}
                </td>
                <td className="font-numeric px-4 py-3 text-neutral-700" title={formatCurrencyFull(row.outstandingAmount)}>
                  {formatCurrency(row.outstandingAmount)}
                </td>
                <td className="px-4 py-3">
                  {totalDisbursedAmount > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className="h-full rounded-full bg-info-500"
                          style={{ width: `${Math.max((row.disbursedAmount / totalDisbursedAmount) * 100, 2)}%` }}
                        />
                      </div>
                      <span className="font-numeric text-neutral-700">{formatPercent(row.disbursedAmount / totalDisbursedAmount)}</span>
                    </div>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Panel>
  );
}
