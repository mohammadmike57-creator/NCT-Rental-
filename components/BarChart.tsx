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

interface TooltipData {
  visible: boolean;
  content: string;
  x: number;
  y: number;
}

const BarChart: React.FC<BarChartProps> = ({ data, title, unit = '', unitPosition = 'before' }) => {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const maxValue = Math.max(1, ...data.datasets.flatMap(d => d.data));
  
  const getYAxisLabels = () => {
    if (maxValue <= 1) return [1, 0.5, 0];
    
    const niceMaxValue = Math.ceil(maxValue / 4) * 4;
    return [niceMaxValue, niceMaxValue * 0.75, niceMaxValue * 0.5, niceMaxValue * 0.25, 0];
  };

  const yAxisLabels = getYAxisLabels();
  const topYValue = yAxisLabels[0];
  const formatValue = (value: number) => {
    const formattedValue = value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    if (!unit) return formattedValue;
    return unitPosition === 'before' ? `${unit} ${formattedValue}` : `${formattedValue} ${unit}`;
  };
  
  const handleMouseOver = (e: React.MouseEvent, content: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const container = e.currentTarget.closest('.bar-chart-container')?.getBoundingClientRect();
    if (!container) return;
    
    setTooltip({
        visible: true,
        content,
        x: rect.left + rect.width / 2 - container.left,
        y: rect.top - container.top - 8
    });
  };
  
  const handleMouseOut = () => {
    setTooltip(null);
  };
  

  const compact = (value: number) =>
    value >= 1000 ? `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : value.toLocaleString();

  return (
    <div className="p-5 bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col bar-chart-container relative">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <div className="flex items-center gap-4 text-xs text-slate-600">
          {data.datasets.map(dataset => (
            <span key={dataset.label} className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: dataset.color }} />
              {dataset.label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex-grow flex min-h-[220px]">
        {/* Y axis: one label per gridline, positioned on the same scale as the bars */}
        <div className="relative w-12 flex-shrink-0 mr-2 mb-6">
          {yAxisLabels.map((label, i) => (
            <span key={i} className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-slate-500" style={{ top: `${100 - (label / topYValue) * 100}%` }}>
              {compact(label)}
            </span>
          ))}
        </div>
        <div className="relative flex-1 flex flex-col min-w-0">
          <div className="relative flex-1">
            {yAxisLabels.map((label, i) => (
              <div key={i} className="absolute inset-x-0 border-t border-slate-100" style={{ top: `${100 - (label / topYValue) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end">
              {data.labels.map((label, index) => (
                <div key={label + index} className="flex-1 min-w-0 h-full flex items-end justify-center gap-0.5">
                  {data.datasets.map((dataset, dIndex) => {
                    const value = dataset.data[index] || 0;
                    const tooltipContent = `${label} · ${dataset.label}: ${formatValue(value)}`;
                    return (
                      <div
                        key={dIndex}
                        className="rounded-t-sm origin-bottom hover:opacity-80"
                        style={{ width: `${Math.min(38, 76 / data.datasets.length)}%`, maxWidth: 28, height: `${(value / topYValue) * 100}%`, backgroundColor: dataset.color, minHeight: value > 0 ? 2 : 0, animation: `grow 0.5s ${index * 0.04}s ease-out both` }}
                        onMouseOver={(e) => handleMouseOver(e, tooltipContent)}
                        onMouseOut={handleMouseOut}
                        aria-label={tooltipContent}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="flex h-6 items-end">
            {data.labels.map((label, i) => (
              <span key={label + i} className="flex-1 text-center text-[11px] text-slate-500 truncate">{label}</span>
            ))}
          </div>
        </div>
      </div>
      {tooltip && tooltip.visible && (
         <div
            className="absolute bg-slate-900 text-white text-xs rounded-md py-1 px-2 pointer-events-none whitespace-nowrap"
            style={{ top: `${tooltip.y}px`, left: `${tooltip.x}px`, transform: 'translate(-50%, -100%)' }}
         >
            {tooltip.content}
         </div>
      )}
      <style>{`
        @keyframes grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @media (prefers-reduced-motion: reduce) { .bar-chart-container [style*="grow"] { animation: none !important; } }
      `}</style>
    </div>
  );
};

export default BarChart;