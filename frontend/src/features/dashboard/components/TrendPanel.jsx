import { Panel } from '../../../components/ui';
import { formatCurrencyFull, formatMonthLabel } from '../utils/format';

const CHART_HEIGHT = 180;

// A lightweight CSS bar chart — no charting library in this project, and pulling one in
// for a single dual-series monthly chart isn't worth the dependency. Bar heights are
// scaled against the max value seen across both series so the two are comparable.
export function TrendPanel({ trend }) {
  const maxValue = Math.max(...trend.map((t) => Math.max(t.disbursedAmount, t.collectedAmount)), 1);

  return (
    <Panel
      title="12-month trend — disbursal vs. collections"
      description="Monthly disbursed amount against amount actually collected, over the trailing year."
      actions={
        <div className="flex items-center gap-4 text-xs font-semibold text-neutral-500">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-info-500" /> Disbursed</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> Collected</span>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <div className="flex min-w-[640px] items-end gap-3" style={{ height: CHART_HEIGHT + 40 }}>
          {trend.map((month) => {
            const disbursedH = Math.max((month.disbursedAmount / maxValue) * CHART_HEIGHT, month.disbursedAmount > 0 ? 3 : 0);
            const collectedH = Math.max((month.collectedAmount / maxValue) * CHART_HEIGHT, month.collectedAmount > 0 ? 3 : 0);
            return (
              <div key={month.month} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex items-end gap-1" style={{ height: CHART_HEIGHT }}>
                  <div
                    className="w-3.5 rounded-t-sm bg-info-500"
                    style={{ height: disbursedH }}
                    title={`Disbursed ${formatMonthLabel(month.month)}: ${formatCurrencyFull(month.disbursedAmount)}`}
                  />
                  <div
                    className="w-3.5 rounded-t-sm bg-brand-500"
                    style={{ height: collectedH }}
                    title={`Collected ${formatMonthLabel(month.month)}: ${formatCurrencyFull(month.collectedAmount)}`}
                  />
                </div>
                <span className="whitespace-nowrap text-[11px] font-semibold text-neutral-500">{formatMonthLabel(month.month)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
