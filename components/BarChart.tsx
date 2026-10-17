import React, { useState } from 'react';

interface BarChartProps {
  data: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      color: string;
    }[];
  };
  title: string;
  unit?: string;
  unitPosition?: 'before' | 'after';
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/** Rounds the axis maximum up to a readable step (1, 2, 2.5 or 5 × 10^n). */
const niceMax = (max: number) => {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const step = [1, 2, 2.5, 5, 10].find(s => s * pow >= max) || 10;
  return step * pow;
};

const compact = (v: number) =>
  v >= 1000 ? `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : v.toLocaleString(undefined, { maximumFractionDigits: 0 });

const BarChart: React.FC<BarChartProps> = ({ data, title, unit = '', unitPosition = 'before' }) => {
  const [active, setActive] = useState<number | null>(null);

  const top = niceMax(Math.max(0, ...data.datasets.flatMap(d => d.data.map(num))));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map(f => top * f);
  const formatValue = (value: number) => {
    const formatted = num(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    if (!unit) return formatted;
    return unitPosition === 'before' ? `${unit} ${formatted}` : `${formatted} ${unit}`;
  };

  return (
    <div className="p-5 sm:p-6 bg-white rounded-2xl border border-slate-200 shadow-sm h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          {data.datasets.map(d => (
            <span key={d.label} className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
              {d.label}
            </span>
          ))}
        </div>
      </div>

      <div className="h-6 mb-1 text-xs text-slate-600 truncate">
        {active !== null ? (
          <span>
            <b className="text-slate-900">{data.labels[active]}</b>
            {data.datasets.map(d => (
              <span key={d.label} className="ml-3 tabular-nums">{d.label}: <b className="text-slate-900">{formatValue(num(d.data[active]))}</b></span>
            ))}
          </span>
        ) : <span className="text-slate-400">Tap or hover a month for figures</span>}
      </div>

      <div className="flex gap-2 flex-1 min-h-[200px]">
        <div className="flex flex-col justify-between text-[10px] text-slate-400 tabular-nums text-right w-9 shrink-0 pb-5">
          {ticks.map((t, i) => <span key={i} className="leading-none">{compact(t)}</span>)}
        </div>
        <div className="relative flex-1 min-w-0">
          <div className="absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between pointer-events-none">
            {ticks.map((_, i) => <div key={i} className="border-t border-slate-100" />)}
          </div>
          <div className="absolute inset-x-0 top-0 bottom-0 flex">
            {data.labels.map((label, i) => (
              <button key={label + i} type="button"
                onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onClick={() => setActive(a => (a === i ? null : i))}
                className={`flex-1 min-w-0 flex flex-col items-stretch rounded-md ${active === i ? 'bg-slate-50' : ''}`}
                aria-label={`${label}: ${data.datasets.map(d => `${d.label} ${formatValue(num(d.data[i]))}`).join(', ')}`}>
                <div className="flex-1 flex items-end justify-center gap-px px-[15%]">
                  {data.datasets.map(d => (
                    <div key={d.label} className="flex-1 max-w-[14px] rounded-t-sm transition-all duration-500"
                      style={{ height: `${Math.min(100, (num(d.data[i]) / top) * 100)}%`, backgroundColor: d.color, minHeight: num(d.data[i]) > 0 ? 2 : 0 }} />
                  ))}
                </div>
                <span className="h-5 pt-1 text-[10px] text-slate-500 text-center truncate">
                  <span className="sm:hidden">{label.slice(0, 1)}</span>
                  <span className="hidden sm:inline">{label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarChart;
