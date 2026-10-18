
import React, { useMemo, useState, useEffect } from 'react';
import { Fleet, YearData, ReservationStatus, Reservation, RentalSource } from '../types';
import { MONTHS, CAR_CATEGORIES, INITIAL_YEARS } from '../constants';
import DailyAvailabilityModal from './DailyAvailabilityModal';
import FleetCalendarView from './FleetCalendarView';
import FleetTimelineView from './FleetTimelineView';
import FleetStatusTracker from './FleetStatusTracker';
import { ClockIcon } from './icons';
import { Page, PageHeader, StatGrid, Panel, Segmented, EmptyState, selectCls, inputCls } from './ui/Crm';

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
  { key: 'timeline', label: 'Planning board', short: 'Planning' },
  { key: 'calendar', label: 'Calendar view', short: 'Calendar' },
  { key: 'tracker', label: 'Car tracker', short: 'Tracker' },
];

const LEGEND = [
  { dot: 'bg-emerald-500', label: 'Over 70% free' },
  { dot: 'bg-amber-400', label: '30 to 70% free' },
  { dot: 'bg-orange-500', label: 'Under 30% free' },
  { dot: 'bg-rose-500', label: 'Sold out' },
];

const FleetAvailability: React.FC<FleetAvailabilityProps> = ({ fleet, yearData, year, currentMonth, onMonthChange, onYearChange, rentalSources }) => {
  const [activeView, setActiveView] = useState<ViewKey>('timeline');
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
  
  // Planning board: every live booking of the loaded year, any stage (pending,
  // on rent, returned...), so bars can be coloured by where the rental is.
  const boardReservations = useMemo(() => {
    const all: Reservation[] = [];
    Object.values(yearData || {}).forEach(list => { if (Array.isArray(list)) all.push(...list); });
    return all.filter(r => r && r.startDate && r.endDate && r.status !== ReservationStatus.CANCELLED && r.status !== ReservationStatus.NO_SHOW);
  }, [yearData]);

  const handleBoardMonth = (y: number, m: string) => {
    if (y !== year) onYearChange(y);
    if (m !== currentMonth) onMonthChange(m);
  };

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
    <Page>
      <PageHeader
        section="Core Operations"
        title="Fleet availability"
        subtitle={`Inventory for ${currentMonth} ${year}${categoryFilter ? ` \u00b7 ${categoryFilter}` : ''}`}
        actions={
          <>
            <select value={currentMonth} onChange={e => onMonthChange(e.target.value)} aria-label="Month" className={`${selectCls} sm:w-36`}>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={year} onChange={e => onYearChange(parseInt(e.target.value))} aria-label="Year" className={`${selectCls} sm:w-24`}>
              {INITIAL_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {activeView !== 'timeline' && (
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} aria-label="Category" className={`${selectCls} sm:w-44`}>
                <option value="">All categories</option>
                {CAR_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            )}
          </>
        }
      />

      <StatGrid items={[
        { label: 'Total fleet', value: stats.total, sub: categoryFilter ? `${categoryFilter} vehicles` : 'active inventory' },
        { label: 'Rented', value: stats.rented, sub: selectedDateLabel ? `on ${selectedDateLabel}` : 'on selected date', tone: stats.rented > 0 ? 'warning' : 'default' },
        { label: 'Available', value: stats.available, sub: 'ready for booking', tone: stats.available > 0 ? 'success' : 'danger' },
        {
          label: 'Utilization',
          value: `${stats.utilization}%`,
          tone: 'default',
          sub: (
            <span className="block mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
              <span className={`block h-full rounded-full ${stats.utilization > 80 ? 'bg-indigo-500' : 'bg-slate-400'}`} style={{ width: `${Math.min(100, stats.utilization)}%` }} />
            </span>
          ),
        },
      ]} />

      <Panel
        title={VIEWS.find(v => v.key === activeView)?.label}
        subtitle={activeView === 'tracker' ? 'Where every car is on the chosen day' : activeView === 'timeline' ? `${filteredFleet.length} vehicles \u00b7 every booking by stage` : `${filteredFleet.length} vehicles \u00b7 ${currentMonth} ${year}`}
        actions={
          <Segmented
            className="w-full sm:w-auto"
            value={activeView}
            onChange={k => setActiveView(k as ViewKey)}
            options={VIEWS.map(v => ({ key: v.key, label: v.short }))}
          />
        }
      >
        {activeView === 'calendar' && (
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
            {LEGEND.map(l => (
              <span key={l.label} className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className={`w-2 h-2 rounded-full ${l.dot}`} />{l.label}</span>
            ))}
            <span className="md:hidden w-full text-slate-400">Swipe sideways to see the whole month.</span>
          </div>
        )}
        {activeView === 'tracker' && (
          <div className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 border-b border-slate-100 bg-slate-50/50">
            <label htmlFor="tracker-date" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Check status for</label>
            <input
              type="date"
              id="tracker-date"
              value={trackerDate}
              onChange={(e) => setTrackerDate(e.target.value)}
              className={`${inputCls} sm:w-auto`}
            />
          </div>
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
                fleet={fleet}
                reservations={boardReservations}
                categoryFilter={categoryFilter}
                onCategoryChange={setCategoryFilter}
                onRangeMonthChange={handleBoardMonth}
              />
            </div>
          )}
          {activeView === 'tracker' && (
            <div className="p-3 sm:p-4 min-w-0">
              {trackerDate ? (
                <FleetStatusTracker
                  fleet={filteredFleet}
                  assignments={dailyAssignments.get(trackerDate) || {}}
                  selectedDate={trackerDate}
                  rentalSources={rentalSources}
                />
              ) : (
                <EmptyState icon={<ClockIcon />} title="Pick a date" hint="Choose a day above to see where every car is." />
              )}
            </div>
          )}
        </div>
      </Panel>

      {modalDate && (
        <DailyAvailabilityModal
          date={modalDate}
          assignments={dailyAssignments.get(modalDate) || {}}
          fleet={filteredFleet}
          onClose={handleCloseModal}
        />
      )}
    </Page>
  );
};

export default FleetAvailability;
