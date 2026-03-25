
import React, { useMemo } from 'react';
import { Fleet, Reservation } from '../types';
import { DailyAssignments } from './FleetAvailability';
import { MONTHS } from '../constants';

interface FleetCalendarViewProps {
    year: number;
    month: string;
    fleet: Fleet;
    dailyAssignments: Map<string, DailyAssignments>;
    onDayClick: (dateString: string) => void;
}

const FleetCalendarView: React.FC<FleetCalendarViewProps> = ({ year, month, fleet, dailyAssignments, onDayClick }) => {
  const monthIndex = useMemo(() => MONTHS.indexOf(month), [month]);
  const totalFleetSize = fleet.length;

  const calendarGrid = useMemo(() => {
    const firstDayOfMonth = new Date(year, monthIndex, 1).getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    
    const grid: { 
        day: number | null; 
        dateString?: string; 
        availableCount: number;
        bookedCount: number;
        overallAvailability: number; // 0 to 1
        categoriesAvailable: { [cat: string]: number };
    }[] = [];
    
    for (let i = 0; i < firstDayOfMonth; i++) {
      grid.push({ day: null, availableCount: 0, bookedCount: 0, overallAvailability: 0, categoriesAvailable: {} });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(Date.UTC(year, monthIndex, day));
      const dateString = date.toISOString().split('T')[0];
      const assignmentsForDay = dailyAssignments.get(dateString) || {};
      
      const bookedCount = Object.values(assignmentsForDay).filter(r => r !== null).length;
      const availableCount = totalFleetSize - bookedCount;
      const overallAvailability = totalFleetSize > 0 ? availableCount / totalFleetSize : 0;

      const categoriesAvailable: { [cat: string]: number } = {};
      fleet.forEach(v => {
          const isBooked = !!assignmentsForDay[v.licensePlate];
          if (!isBooked) {
              categoriesAvailable[v.category] = (categoriesAvailable[v.category] || 0) + 1;
          }
      });
      
      grid.push({ day, dateString, availableCount, bookedCount, overallAvailability, categoriesAvailable });
    }
    return grid;
  }, [fleet, dailyAssignments, year, monthIndex, totalFleetSize]);

  const getCellStyles = (availability: number | undefined) => {
    if (typeof availability === 'undefined') return 'bg-gray-50';
    if (availability <= 0) return 'bg-red-50 border-red-300 hover:border-red-500 ring-1 ring-red-100';
    if (availability <= 0.3) return 'bg-orange-50 border-orange-200 hover:border-orange-400 hover:bg-orange-100';
    if (availability <= 0.7) return 'bg-yellow-50 border-yellow-200 hover:border-yellow-400 hover:bg-yellow-100';
    return 'bg-white border-gray-200 hover:border-green-400 hover:bg-green-50 hover:shadow-md';
  }
  
  const getIndicatorColor = (availability: number) => {
      if (availability <= 0) return 'bg-red-500';
      if (availability <= 0.3) return 'bg-orange-500';
      if (availability <= 0.7) return 'bg-yellow-500';
      return 'bg-green-500';
  }

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="p-6">
      <div className="grid grid-cols-7 gap-4 mb-2">
        {weekDays.map(day => (
          <div key={day} className="text-center font-bold text-gray-400 text-xs uppercase tracking-widest">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-3">
        {calendarGrid.map((cell, index) => (
          <button 
            key={index} 
            onClick={() => cell.dateString && onDayClick(cell.dateString)}
            disabled={!cell.day}
            className={`relative p-3 h-36 rounded-xl border transition-all duration-200 flex flex-col items-start justify-between ${getCellStyles(cell.day ? cell.overallAvailability : undefined)} ${cell.day ? 'cursor-pointer' : 'cursor-default border-transparent opacity-0'}`}
          >
            {cell.day && (
              <>
                <div className="w-full flex justify-between items-start">
                    <span className="font-bold text-lg text-gray-700 font-sans-ui">{cell.day}</span>
                    <div className={`w-2.5 h-2.5 rounded-full ${getIndicatorColor(cell.overallAvailability)} shadow-sm`} title="Availability Status"></div>
                </div>
                
                <div className="self-center text-center my-2 w-full">
                    {cell.availableCount === 0 ? (
                        <div className="flex flex-col items-center">
                            <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded uppercase tracking-wide">Sold Out</span>
                        </div>
                    ) : (
                        <>
                            <span className="text-3xl font-extrabold text-gray-800 block leading-none">
                                {cell.availableCount}
                            </span>
                            <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Cars Free</span>
                        </>
                    )}
                </div>

                <div className="w-full flex flex-wrap gap-1 overflow-hidden h-5 content-end">
                    {Object.entries(cell.categoriesAvailable).slice(0, 3).map(([cat, count]) => (
                        <span key={cat} className="text-xs bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded text-gray-600 font-medium truncate max-w-[100%]">
                            {cat}: {count}
                        </span>
                    ))}
                     {Object.keys(cell.categoriesAvailable).length > 3 && (
                         <span className="text-xs text-gray-400 font-medium pl-1">...</span>
                     )}
                </div>
              </>
            )}
          </button>
        ))}
      </div>
       <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-gray-500 font-medium">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500 shadow-sm"></span> High Availability {'>'}70%</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-500 shadow-sm"></span> Good Availability (30-70%)</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-orange-500 shadow-sm"></span> Low Availability (&lt;30%)</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 shadow-sm"></span> Sold Out</div>
      </div>
    </div>
  );
};

export default FleetCalendarView;
