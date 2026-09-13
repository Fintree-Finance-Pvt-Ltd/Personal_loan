import { LineChart } from 'lucide-react';
import { Panel } from '../../../components/ui';
import { formatCurrency, formatCurrencyFull, formatMonthLabel } from '../utils/format';

const CHART_HEIGHT = 200;
const GRID_LINES = 4; // horizontal reference lines, evenly spaced above the baseline

// A lightweight CSS bar chart with axis gridlines — no charting library in this project,
// and pulling one in for a single dual-series monthly chart isn't worth the dependency.
// Bar heights and gridline labels are scaled against the same max value so the two stay
// visually consistent (a bar reaching the top gridline really is at ~100% of the max).
export function TrendPanel({ trend }) {
  const rawMax = Math.max(...trend.map((t) => Math.max(t.disbursedAmount, t.collectedAmount)), 1);
  // Round the axis ceiling up to a "nice" number so gridline labels read cleanly
  // (₹5.0 L, ₹10.0 L, ...) instead of arbitrary fractions of whatever the max happened to be.
  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const niceMax = Math.ceil(rawMax / magnitude) * magnitude;

  const gridValues = Array.from({ length: GRID_LINES + 1 }, (_, i) => (niceMax / GRID_LINES) * i).reverse();

  return (
    <Panel
      title={<span className="flex items-center gap-2"><LineChart size={16} className="text-neutral-400" /> 12-month trend — disbursal vs. collections</span>}
      description="Monthly disbursed amount against amount actually collected, over the trailing year."
      actions={
        <div className="flex items-center gap-4 text-xs font-semibold text-neutral-500">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-info-500" /> Disbursed</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> Collected</span>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <div className="flex min-w-[720px] gap-3">
          <div className="relative shrink-0 text-right text-[11px] font-semibold text-neutral-400" style={{ height: CHART_HEIGHT, width: 52 }}>
            {gridValues.map((v) => (
              <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - v / niceMax) * 100}%` }}>
                {formatCurrency(v)}
              </span>
            ))}
          </div>

          <div className="relative flex-1">
            <div className="absolute inset-x-0" style={{ height: CHART_HEIGHT }}>
              {gridValues.map((v) => (
                <div
                  key={v}
                  className="absolute inset-x-0 border-t border-dashed border-neutral-200"
                  style={{ top: `${(1 - v / niceMax) * 100}%` }}
                />
              ))}
            </div>

            <div className="relative flex items-end gap-3" style={{ height: CHART_HEIGHT }}>
              {trend.map((month) => {
                const disbursedH = Math.max((month.disbursedAmount / niceMax) * CHART_HEIGHT, month.disbursedAmount > 0 ? 3 : 0);
                const collectedH = Math.max((month.collectedAmount / niceMax) * CHART_HEIGHT, month.collectedAmount > 0 ? 3 : 0);
                return (
                  <div key={month.month} className="group flex flex-1 items-end justify-center gap-1">
                    <div
                      className="w-4 rounded-t-sm bg-info-500 transition-colors group-hover:bg-info-600"
                      style={{ height: disbursedH }}
                      title={`Disbursed ${formatMonthLabel(month.month)}: ${formatCurrencyFull(month.disbursedAmount)}`}
                    />
                    <div
                      className="w-4 rounded-t-sm bg-brand-500 transition-colors group-hover:bg-brand-600"
                      style={{ height: collectedH }}
                      title={`Collected ${formatMonthLabel(month.month)}: ${formatCurrencyFull(month.collectedAmount)}`}
                    />
                  </div>
                );
              })}
            </div>

            <div className="mt-2 flex gap-3 border-t border-neutral-200 pt-2">
              {trend.map((month) => (
                <span key={month.month} className="flex-1 text-center text-[11px] font-semibold text-neutral-500">
                  {formatMonthLabel(month.month)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
