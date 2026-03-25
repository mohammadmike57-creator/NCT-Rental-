
import React, { useMemo, useState, useEffect } from 'react';
import { Fleet, YearData, ReservationStatus, Reservation } from '../types';
import { MONTHS, CAR_CATEGORIES, INITIAL_YEARS } from '../constants';
import Tabs from './Tabs';
import DailyAvailabilityModal from './DailyAvailabilityModal';
import FleetCalendarView from './FleetCalendarView';
import FleetTimelineView from './FleetTimelineView';
import FleetStatusTracker from './FleetStatusTracker';
import { ChartPieIcon, CarIcon, CheckCircleIcon, ClockIcon, ChevronDownIcon } from './icons';

interface FleetAvailabilityProps {
  fleet: Fleet;
  yearData: YearData;
  year: number;
  currentMonth: string; 
  onMonthChange: (month: string) => void;
  onYearChange: (year: number) => void;
}

export interface DailyUsage {
    [model: string]: number;
}
export interface DailyAssignments {
    [licensePlate: string]: Reservation | null;
}

const StatCard: React.FC<{ title: string; value: string | number; subtitle: string; color: string; icon: React.ReactNode }> = ({ title, value, subtitle, color, icon }) => (
    <div className={`bg-white p-5 rounded-xl shadow-sm border-l-4 ${color} flex items-center justify-between transition-all hover:shadow-md hover:-translate-y-0.5`}>
        <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{title}</p>
            <p className="text-3xl font-extrabold text-gray-800 tracking-tight">{value}</p>
            <p className="text-xs font-medium text-gray-500 mt-1">{subtitle}</p>
        </div>
        <div className={`p-3 rounded-lg bg-gray-50 text-gray-400 border border-gray-100`}>
            {icon}
        </div>
    </div>
);

const FleetAvailability: React.FC<FleetAvailabilityProps> = ({ fleet, yearData, year, currentMonth, onMonthChange, onYearChange }) => {
  const [activeView, setActiveView] = useState<'calendar' | 'timeline' | 'tracker'>('calendar');
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [trackerDate, setTrackerDate] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  const filteredFleet = useMemo(() => {
    if (!categoryFilter) {
      return fleet;
    }
    return fleet.filter(v => v.category === categoryFilter);
  }, [fleet, categoryFilter]);

  // Update tracker date default when month changes
  useEffect(() => {
    const today = new Date();
    const currentMonthIndex = today.getMonth();
    const currentYear = today.getFullYear();
    const selectedMonthIndex = MONTHS.indexOf(currentMonth);

    let defaultDate: Date;
    if (year === currentYear && selectedMonthIndex === currentMonthIndex) {
        // If viewing current month, default to today
        defaultDate = today;
    } else {
        // Otherwise, default to the first day of the selected month
        defaultDate = new Date(year, selectedMonthIndex, 1);
    }
    // Important: use local date string to avoid timezone shifts
    // Format YYYY-MM-DD manually to avoid locale issues
    const yearStr = defaultDate.getFullYear();
    const monthStr = String(defaultDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(defaultDate.getDate()).padStart(2, '0');
    setTrackerDate(`${yearStr}-${monthStr}-${dayStr}`);
  }, [year, currentMonth]);

  const monthIndex = useMemo(() => MONTHS.indexOf(currentMonth), [currentMonth]);
  const daysInMonth = useMemo(() => new Date(year, monthIndex + 1, 0).getDate(), [year, monthIndex]);

  const reservationsForMonth = useMemo(() => {
    // yearData can be undefined if the selected year doesn't have data yet
    const safeYearData = yearData || {};
    const monthData = safeYearData[currentMonth] || [];
    const nextMonth = MONTHS[(monthIndex + 1) % 12];
    const prevMonth = MONTHS[(monthIndex + 11) % 12];
    
    // Include reservations from previous/next months that might overlap into the current month
    const prevMonthData = (safeYearData[prevMonth] || []).filter(r => {
        if (!r.endDate) return false;
        const endDate = new Date(r.endDate);
        return endDate.getFullYear() === year && endDate.getMonth() === monthIndex;
    });
     const nextMonthData = (safeYearData[nextMonth] || []).filter(r => {
        if (!r.startDate) return false;
        const startDate = new Date(r.startDate);
        return startDate.getFullYear() === year && startDate.getMonth() === monthIndex;
    });
      
    return [...monthData, ...prevMonthData, ...nextMonthData]
        .filter(r => r.status === ReservationStatus.CONFIRMED && r.carModel && r.startDate && r.endDate);
  }, [yearData, currentMonth, monthIndex, year]);
  
  const dailyAssignments = useMemo(() => {
    const assignmentsByDate = new Map<string, DailyAssignments>();

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthIndex, day);
        
        // Manual YYYY-MM-DD string construction for consistency
        const yStr = date.getFullYear();
        const mStr = String(date.getMonth() + 1).padStart(2, '0');
        const dStr = String(date.getDate()).padStart(2, '0');
        const dateString = `${yStr}-${mStr}-${dStr}`;

        // Define the day range (00:00:00 to 23:59:59)
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        const reservationsForDay = reservationsForMonth.filter(r => {
            const rStart = new Date(r.startDate);
            const rEnd = new Date(r.endDate);
            
            // Check for overlap: Reservation starts before day ends AND Reservation ends after day starts
            return rStart <= dayEnd && rEnd >= dayStart;
        });

        const availableFleet = [...filteredFleet];
        const daily: DailyAssignments = {};

        // Initialize all as available
        filteredFleet.forEach(v => daily[v.licensePlate] = null);

        for (const res of reservationsForDay) {
            const vehicleIndex = availableFleet.findIndex(v => v.modelName === res.carModel && !daily[v.licensePlate]);
            if (vehicleIndex !== -1) {
                const assignedVehicle = availableFleet[vehicleIndex];
                daily[assignedVehicle.licensePlate] = res;
                availableFleet.splice(vehicleIndex, 1); // Remove from available pool for this day
            }
        }
        assignmentsByDate.set(dateString, daily);
    }
    return assignmentsByDate;
  }, [reservationsForMonth, filteredFleet, year, monthIndex, daysInMonth]);

  // Calculate Dashboard Stats based on Tracker Date (default today or selected)
  const stats = useMemo(() => {
      const assignments = dailyAssignments.get(trackerDate) || {};
      const total = filteredFleet.length;
      const rented = Object.values(assignments).filter(r => r !== null).length;
      const available = total - rented;
      const utilization = total > 0 ? Math.round((rented / total) * 100) : 0;
      
      return { total, rented, available, utilization };
  }, [dailyAssignments, trackerDate, filteredFleet]);

  const handleDayClick = (dateString: string) => {
    setModalDate(dateString);
  };
  
  const handleCloseModal = () => {
    setModalDate(null);
  };
  
  return (
    <div className="p-4 sm:p-6 bg-gray-50/50 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b pb-4">
          <div>
              <h3 className="text-2xl font-bold text-gray-800">Fleet Dashboard</h3>
              <p className="text-sm text-gray-500 mt-1">Real-time inventory tracking for {currentMonth} {year}</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 bg-white p-1.5 rounded-lg shadow-sm border border-gray-200">
               <div className="relative">
                   <select 
                    value={currentMonth}
                    onChange={e => onMonthChange(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2 border-none rounded-md text-sm focus:ring-0 bg-transparent font-medium text-gray-700 cursor-pointer hover:bg-gray-50 transition-colors"
                   >
                     {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                   </select>
                   <ChevronDownIcon className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
               </div>
               <div className="h-6 w-px bg-gray-300"></div>
               <div className="relative">
                   <select 
                    value={year}
                    onChange={e => onYearChange(parseInt(e.target.value))}
                    className="appearance-none pl-3 pr-8 py-2 border-none rounded-md text-sm focus:ring-0 bg-transparent font-medium text-gray-700 cursor-pointer hover:bg-gray-50 transition-colors"
                   >
                     {INITIAL_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                   </select>
                   <ChevronDownIcon className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
               </div>
               <div className="h-6 w-px bg-gray-300"></div>
               <div className="relative">
                   <select 
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2 border-none rounded-md text-sm focus:ring-0 bg-transparent font-medium text-gray-700 cursor-pointer hover:bg-gray-50 transition-colors"
                   >
                     <option value="">All Categories</option>
                     {CAR_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                   </select>
                   <ChevronDownIcon className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
               </div>
          </div>
      </div>
      
      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard 
            title="Total Fleet" 
            value={stats.total} 
            subtitle={categoryFilter ? `${categoryFilter} Vehicles` : "Active Inventory"}
            color="border-blue-500" 
            icon={<CarIcon className="w-6 h-6"/>} 
          />
          <StatCard 
            title="Rented on Selected Date" 
            value={stats.rented} 
            subtitle={`${stats.utilization}% Utilization`}
            color="border-orange-500" 
            icon={<ClockIcon className="w-6 h-6"/>} 
          />
          <StatCard 
            title="Available on Selected Date" 
            value={stats.available} 
            subtitle="Ready for booking"
            color="border-green-500" 
            icon={<CheckCircleIcon className="w-6 h-6"/>} 
          />
          <StatCard 
            title="Utilization Rate" 
            value={`${stats.utilization}%`} 
            subtitle="Fleet efficiency"
            color={stats.utilization > 80 ? "border-indigo-500" : "border-gray-400"} 
            icon={<ChartPieIcon className="w-6 h-6"/>} 
          />
      </div>

      <div className="mb-6">
        <Tabs 
          tabs={['Calendar View', 'Timeline View', 'Car Tracker']}
          selectedTab={
            activeView === 'calendar' ? 'Calendar View' :
            activeView === 'timeline' ? 'Timeline View' : 'Car Tracker'
          }
          onSelectTab={(tab) => {
            if (tab === 'Calendar View') setActiveView('calendar');
            else if (tab === 'Timeline View') setActiveView('timeline');
            else setActiveView('tracker');
          }}
          variant="underline"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
        {activeView === 'calendar' && (
            <FleetCalendarView 
            year={year}
            month={currentMonth}
            fleet={filteredFleet}
            dailyAssignments={dailyAssignments}
            onDayClick={handleDayClick}
            />
        )}
        {activeView === 'timeline' && (
            <FleetTimelineView
            year={year}
            month={currentMonth}
            fleet={filteredFleet}
            reservations={reservationsForMonth}
            />
        )}
        {activeView === 'tracker' && (
            <div className="p-6">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100 bg-slate-50 p-4 rounded-lg">
                    <div className="flex items-center gap-4">
                         <label htmlFor="tracker-date" className="text-sm font-bold text-gray-700">Check Status For:</label>
                         <input
                            type="date"
                            id="tracker-date"
                            value={trackerDate}
                            onChange={(e) => setTrackerDate(e.target.value)}
                            className="p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary shadow-sm font-medium text-gray-700"
                        />
                    </div>
                    <div className="text-sm text-gray-500">
                        Showing fleet status for specific day
                    </div>
                </div>
                
                {trackerDate && (
                    <FleetStatusTracker
                        fleet={filteredFleet}
                        assignments={dailyAssignments.get(trackerDate) || {}}
                        selectedDate={trackerDate}
                    />
                )}
            </div>
        )}
      </div>
      
      {modalDate && (
        <DailyAvailabilityModal 
          date={modalDate}
          assignments={dailyAssignments.get(modalDate) || {}}
          fleet={filteredFleet}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
};

export default FleetAvailability;
