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
  

  return (
    <div className="p-6 bg-white rounded-lg shadow-md border border-gray-200 h-full flex flex-col bar-chart-container relative">
      <h3 className="text-lg font-semibold text-gray-700 mb-1">{title}</h3>
      <div className="flex justify-center items-center gap-4 text-xs text-gray-600 mb-4">
        {data.datasets.map(dataset => (
          <div key={dataset.label} className="flex items-center">
            <span className="w-2.5 h-2.5 mr-2 rounded-sm" style={{ backgroundColor: dataset.color }}></span>
            <span>{dataset.label}</span>
          </div>
        ))}
      </div>
      <div className="flex-grow flex items-end">
        <svg width="100%" height="100%" className="overflow-visible">
            <defs>
                <g id="y-axis">
                    {yAxisLabels.map((label, i) => (
                        <g key={i} transform={`translate(0, ${100 - (label / topYValue * 100)}%)`}>
                           <line x1="50" x2="100%" stroke="#e2e8f0" strokeWidth="1" />
                           <text x="45" y="3" textAnchor="end" className="text-xs fill-current text-gray-500">{label.toLocaleString()}</text>
                        </g>
                    ))}
                </g>
                 <g id="x-axis">
                     {data.labels.map((label, i) => (
                        <text key={i} x={`${(i + 0.5) / data.labels.length * 100}%`} y="100%" dy="15" textAnchor="middle" className="text-xs fill-current text-gray-600">
                            {label}
                        </text>
                    ))}
                </g>
            </defs>
            <use href="#y-axis" />
            <g transform="translate(50, 0)">
                <svg width="calc(100% - 50px)" height="100%">
                    <g className="chart-bars">
                        {data.labels.map((_, index) => (
                           <g key={index} transform={`translate(${(index / data.labels.length) * 100}%, 0)`}>
                               <svg width={`${(1 / data.labels.length) * 100}%`} height="100%">
                                    <g transform={`translate(${15}%, 0)`}>
                                        <svg width={`${70}%`} height="100%">
                                            {data.datasets.map((dataset, dIndex) => {
                                                const barHeight = (dataset.data[index] / topYValue) * 100;
                                                const tooltipContent = `${dataset.label}: ${formatValue(dataset.data[index])}`;
                                                return (
                                                    <rect
                                                        key={dIndex}
                                                        x={`${(dIndex / data.datasets.length) * 100}%`}
                                                        y={`${100 - barHeight}%`}
                                                        width={`${(1 / data.datasets.length) * 100 - (data.datasets.length > 1 ? 5 : 0)}%`}
                                                        height={`${barHeight}%`}
                                                        fill={dataset.color}
                                                        onMouseOver={(e) => handleMouseOver(e, tooltipContent)}
                                                        onMouseOut={handleMouseOut}
                                                        className="transition-all duration-300 ease-out origin-bottom hover:opacity-75"
                                                        style={{ animation: `grow 0.5s ${index * 0.05}s ease-out forwards`, transform: 'scaleY(0)' }}
                                                    />
                                                );
                                            })}
                                        </svg>
                                    </g>
                               </svg>
                           </g>
                        ))}
                    </g>
                    <use href="#x-axis" x="-50" />
                </svg>
            </g>
        </svg>
      </div>
      {tooltip && tooltip.visible && (
         <div 
            className="absolute bg-slate-800 text-white text-xs rounded-md py-1 px-2 pointer-events-none transition-opacity duration-200"
            style={{ 
                top: `${tooltip.y}px`, 
                left: `${tooltip.x}px`,
                transform: 'translate(-50%, -100%)',
            }}
         >
            {tooltip.content}
         </div>
      )}
      <style>{`
        @keyframes grow {
          to {
            transform: scaleY(1);
          }
        }
      `}</style>
    </div>
  );
};

export default BarChart;