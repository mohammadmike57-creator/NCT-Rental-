
import React, { useMemo, useState, useEffect } from 'react';
import { Fleet, YearData, ReservationStatus, Reservation, RentalSource } from '../types';
import { MONTHS, CAR_CATEGORIES, INITIAL_YEARS } from '../constants';
import DailyAvailabilityModal from './DailyAvailabilityModal';
import FleetCalendarView from './FleetCalendarView';
import FleetTimelineView from './FleetTimelineView';
import FleetStatusTracker from './FleetStatusTracker';
import { CarIcon, ClockIcon, ChevronDownIcon } from './icons';

interface FleetAvailabilityProps {
  fleet: Fleet;
  yearData: YearData;
  year: number;
  currentMonth: string; 
  onMonthChange: (month: string) => void;
  onYearChange: (year: number) => void;
  rentalSources: RentalSource[];
}

export interface DailyUsage {
    [model: string]: number;
}
export interface DailyAssignments {
    [licensePlate: string]: Reservation | null;
}

type ViewKey = 'calendar' | 'timeline' | 'tracker';

const VIEWS: { key: ViewKey; label: string; short: string }[] = [
  { key: 'calendar', label: 'Calendar view', short: 'Calendar' },
  { key: 'timeline', label: 'Timeline view', short: 'Timeline' },
  { key: 'tracker', label: 'Car tracker', short: 'Tracker' },
];

const LEGEND = [
  { dot: 'bg-green-500', label: 'Over 70% free' },
  { dot: 'bg-yellow-500', label: '30 to 70% free' },
  { dot: 'bg-orange-500', label: 'Under 30% free' },
  { dot: 'bg-red-500', label: 'Sold out' },
];

const selectClass = 'w-full appearance-none pl-3 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 cursor-pointer focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none';

const FleetAvailability: React.FC<FleetAvailabilityProps> = ({ fleet, yearData, year, currentMonth, onMonthChange, onYearChange, rentalSources }) => {
  const [activeView, setActiveView] = useState<ViewKey>('calendar');
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
  
  const selectedDateLabel = useMemo(() => {
    if (!trackerDate) return '';
    const [y, m, d] = trackerDate.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return isNaN(dt.getTime()) ? trackerDate : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }, [trackerDate]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-5 sm:p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <CarIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Fleet availability</h2>
              <p className="text-sm text-slate-500">Inventory for {currentMonth} {year}{categoryFilter ? ` · ${categoryFilter}` : ''}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full xl:w-auto">
            <div className="relative sm:w-40">
              <select value={currentMonth} onChange={e => onMonthChange(e.target.value)} aria-label="Month" className={selectClass}>
                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
            <div className="relative sm:w-28">
              <select value={year} onChange={e => onYearChange(parseInt(e.target.value))} aria-label="Year" className={selectClass}>
                {INITIAL_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
            <div className="relative col-span-2 sm:w-48">
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} aria-label="Category" className={selectClass}>
                <option value="">All categories</option>
                {CAR_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-100 divide-x divide-y lg:divide-y-0 divide-slate-100">
          {[
            { label: 'Total fleet', value: stats.total, sub: categoryFilter ? `${categoryFilter} vehicles` : 'active inventory', tone: 'text-slate-900' },
            { label: 'Rented', value: stats.rented, sub: selectedDateLabel ? `on ${selectedDateLabel}` : 'on selected date', tone: stats.rented > 0 ? 'text-amber-600' : 'text-slate-900' },
            { label: 'Available', value: stats.available, sub: 'ready for booking', tone: stats.available > 0 ? 'text-emerald-600' : 'text-rose-600' },
            { label: 'Utilization', value: `${stats.utilization}%`, sub: 'of fleet on rent', tone: stats.utilization > 80 ? 'text-indigo-600' : 'text-slate-900', bar: true },
          ].map(k => (
            <div key={k.label} className="px-5 py-4 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${k.tone}`}>{k.value}</p>
              {k.bar ? (
                <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${stats.utilization > 80 ? 'bg-indigo-500' : 'bg-slate-400'}`} style={{ width: `${Math.min(100, stats.utilization)}%` }} />
                </div>
              ) : (
                <p className="text-xs text-slate-400 truncate">{k.sub}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* View */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-0">
        <div className="px-3 sm:px-5 py-3 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="inline-flex p-1 bg-slate-100 rounded-xl w-full md:w-auto" role="tablist">
            {VIEWS.map(v => (
              <button
                key={v.key}
                role="tab"
                aria-selected={activeView === v.key}
                onClick={() => setActiveView(v.key)}
                className={`flex-1 md:flex-none px-3 py-1.5 text-sm font-semibold rounded-lg whitespace-nowrap ${activeView === v.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <span className="sm:hidden">{v.short}</span>
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>

          {activeView === 'calendar' && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
              {LEGEND.map(l => (
                <span key={l.label} className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className={`w-2.5 h-2.5 rounded-full ${l.dot}`} />{l.label}</span>
              ))}
            </div>
          )}
          {activeView === 'tracker' && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <label htmlFor="tracker-date" className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Check status for</label>
              <input
                type="date"
                id="tracker-date"
                value={trackerDate}
                onChange={(e) => setTrackerDate(e.target.value)}
                className="w-full sm:w-auto px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              />
            </div>
          )}
        </div>

        {activeView !== 'tracker' && (
          <p className="md:hidden px-4 py-2 text-xs text-slate-400 bg-slate-50 border-b border-slate-100">Swipe sideways to see the whole month.</p>
        )}

        <div className="min-h-[500px]">
          {activeView === 'calendar' && (
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <FleetCalendarView
                  year={year}
                  month={currentMonth}
                  fleet={filteredFleet}
                  dailyAssignments={dailyAssignments}
                  onDayClick={handleDayClick}
                />
              </div>
            </div>
          )}
          {activeView === 'timeline' && (
            <div className="min-w-0 max-w-full">
              <FleetTimelineView
                year={year}
                month={currentMonth}
                fleet={filteredFleet}
                reservations={reservationsForMonth}
              />
            </div>
          )}
          {activeView === 'tracker' && (
            <div className="p-3 sm:p-6 min-w-0">
              {trackerDate ? (
                <FleetStatusTracker
                  fleet={filteredFleet}
                  assignments={dailyAssignments.get(trackerDate) || {}}
                  selectedDate={trackerDate}
                  rentalSources={rentalSources}
                />
              ) : (
                <div className="py-16 text-center">
                  <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center"><ClockIcon className="w-6 h-6" /></div>
                  <p className="mt-4 font-semibold text-slate-800">Pick a date</p>
                  <p className="text-sm text-slate-500">Choose a day above to see where every car is.</p>
                </div>
              )}
            </div>
          )}
        </div>
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
