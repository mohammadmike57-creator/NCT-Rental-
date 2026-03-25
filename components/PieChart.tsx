import React, { useState } from 'react';

interface PieChartProps {
  data: {
    labels: string[];
    datasets: {
      data: number[];
      backgroundColor: string[];
    }[];
  };
  title: string;
}

const PieChart: React.FC<PieChartProps> = ({ data, title }) => {
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);
  
  const dataset = data.datasets[0];
  const hasData = dataset && dataset.data.length > 0;
  const total = hasData ? dataset.data.reduce((sum, value) => sum + value, 0) : 0;

  if (!hasData || total === 0) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-md border border-gray-200 h-full flex flex-col items-center justify-center">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">{title}</h3>
        <p className="text-gray-500">No data to display.</p>
      </div>
    );
  }

  const radius = 85;
  const circumference = 2 * Math.PI * radius;
  let cumulativePercent = 0;

  const slices = dataset.data.map((value, i) => {
    const percent = value / total;
    const angle = 360 * percent;
    const rotation = cumulativePercent * 360;
    cumulativePercent += percent;
    
    return {
      percent: percent,
      angle: angle,
      rotation: rotation,
      color: dataset.backgroundColor[i],
      label: data.labels[i],
      value: value,
    };
  });
  
  return (
    <div className="p-6 bg-white rounded-lg shadow-md border border-gray-200 h-full flex flex-col">
      <h3 className="text-lg font-semibold text-gray-700 mb-4">{title}</h3>
      <div className="flex-grow flex flex-col md:flex-row items-center justify-center gap-6">
        <div className="relative w-48 h-48 flex-shrink-0">
          <svg viewBox="0 0 200 200" className="transform -rotate-90">
            {slices.map((slice, i) => (
              <circle
                key={i}
                r={radius}
                cx="100"
                cy="100"
                fill="transparent"
                stroke={slice.color}
                strokeWidth="30"
                strokeDasharray={`${slice.percent * circumference} ${circumference}`}
                transform={`rotate(${slice.rotation}, 100, 100)`}
                onMouseEnter={() => setHoveredSlice(i)}
                onMouseLeave={() => setHoveredSlice(null)}
                className="transition-all duration-300 origin-center"
                style={{
                  transform: hoveredSlice === i ? 'scale(1.05)' : 'scale(1)',
                  animation: `pie-draw 0.8s ${i * 0.1}s ease-out forwards`,
                  opacity: 0,
                }}
              >
                  <title>{`${slice.label}: ${slice.value} (${(slice.percent * 100).toFixed(1)}%)`}</title>
              </circle>
            ))}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
                <p className="text-xs text-gray-500">Total</p>
                <p className="text-2xl font-bold text-gray-800">{total.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="w-full md:w-auto text-sm self-center">
          <ul className="space-y-2">
            {slices.map((slice, i) => (
              <li 
                key={i} 
                className={`flex items-center justify-between p-1 rounded-md transition-colors ${hoveredSlice === i ? 'bg-gray-100' : ''}`}
                onMouseEnter={() => setHoveredSlice(i)}
                onMouseLeave={() => setHoveredSlice(null)}
              >
                <div className="flex items-center">
                    <span className="w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: slice.color }}></span>
                    <span>{slice.label}</span>
                </div>
                <span className="font-semibold ml-4">{slice.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <style>{`
        @keyframes pie-draw {
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default PieChart;