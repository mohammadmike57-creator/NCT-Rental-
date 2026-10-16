import React, { useMemo } from 'react';
import { CalendarIcon, DocumentTextIcon, CheckCircleIcon, ClockIcon, TruckIcon } from './icons';

interface HomePageProps {
  currentUser: any;
  allData: any;
  onNavigate: (view: string, filters?: any) => void;
}

const HomePage: React.FC<HomePageProps> = ({ currentUser, allData, onNavigate }) => {
  const reservations = allData.reservations || {};
  const fleet = allData.fleet || [];

  const allReservationsFlat = useMemo(() => {
    const flat: any[] = [];
    Object.keys(reservations).forEach(year => {
      const yearData = reservations[year];
      Object.keys(yearData).forEach(month => {
        flat.push(...(yearData[month] || []));
      });
    });
    return flat;
  }, [reservations]);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  const todaysPickups = useMemo(() => {
    return allReservationsFlat.filter(res => {
      if (!res.startDate) return false;
      const pickupDate = res.startDate.split('T')[0];
      return pickupDate === todayStr && res.status === 'CONFIRMED';
    }).length;
  }, [allReservationsFlat, todayStr]);

  const openAgreements = useMemo(() => {
    return allReservationsFlat.filter(res => 
      res.voucherSubmitted === true && res.dropOffCompleted !== true
    ).length;
  }, [allReservationsFlat]);

  const closedAgreements = useMemo(() => {
    return allReservationsFlat.filter(res => res.dropOffCompleted === true).length;
  }, [allReservationsFlat]);

  const upcomingReservations = useMemo(() => {
    return allReservationsFlat.filter(res => {
      if (!res.startDate || res.voucherSubmitted) return false;
      const pickupDate = res.startDate.split('T')[0];
      return pickupDate >= todayStr && pickupDate <= nextWeekStr && res.status === 'CONFIRMED';
    }).length;
  }, [allReservationsFlat, todayStr, nextWeekStr]);

  const upcomingReturns = useMemo(() => {
    return allReservationsFlat.filter(res => {
      if (!res.endDate || !res.voucherSubmitted || res.dropOffCompleted) return false;
      const returnDate = res.endDate.split('T')[0];
      return returnDate >= todayStr && returnDate <= nextWeekStr && res.status === 'CONFIRMED';
    }).length;
  }, [allReservationsFlat, todayStr, nextWeekStr]);

  const totalCars = fleet.length;
  const carsInUse = allReservationsFlat.filter(res => 
    res.status === 'CONFIRMED' && res.voucherSubmitted && !res.dropOffCompleted
  ).length;
  const carsAvailable = totalCars - carsInUse;

  const Logo = () => (
    <svg width="220" height="44" viewBox="0 0 600 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="URDRIVE.JO">
      <style>
        {`.dark { fill: #1f2933; font-family: Arial, Helvetica, sans-serif; font-weight: 700; }
         .orange { fill: #ff6a00; font-family: Arial, Helvetica, sans-serif; font-weight: 700; }`}
      </style>
      <text x="20" y="80" fontSize="64" className="dark">
        URDRI<tspan className="orange">V</tspan>E.JO
      </text>
    </svg>
  );

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const tiles: { label: string, value: React.ReactNode, sub: string, icon: React.ReactNode, tone: string, onClick: () => void }[] = [
    { label: "Today's pickups", value: todaysPickups, sub: 'Cars going out today', icon: <CalendarIcon className="w-5 h-5" />, tone: 'bg-sky-50 text-sky-700', onClick: () => onNavigate('Reservations', { dateFilter: todayStr }) },
    { label: 'Open agreements', value: openAgreements, sub: 'Cars currently with customers', icon: <DocumentTextIcon className="w-5 h-5" />, tone: 'bg-emerald-50 text-emerald-700', onClick: () => onNavigate('Reservations', { voucherSubmitted: true, dropOffCompleted: false }) },
    { label: 'Closed agreements', value: closedAgreements, sub: 'Returned and completed', icon: <CheckCircleIcon className="w-5 h-5" />, tone: 'bg-slate-100 text-slate-600', onClick: () => onNavigate('Reservations', { dropOffCompleted: true }) },
    { label: 'Upcoming pickups', value: upcomingReservations, sub: 'In the next 7 days', icon: <ClockIcon className="w-5 h-5" />, tone: 'bg-amber-50 text-amber-700', onClick: () => onNavigate('Reservations', { upcomingReservations: true }) },
    { label: 'Upcoming returns', value: upcomingReturns, sub: 'In the next 7 days', icon: <ClockIcon className="w-5 h-5" />, tone: 'bg-amber-50 text-amber-700', onClick: () => onNavigate('Reservations', { upcomingReturns: true }) },
    { label: 'Fleet available', value: <>{carsAvailable}<span className="text-base font-medium text-slate-400"> / {totalCars}</span></>, sub: 'Cars free right now', icon: <TruckIcon className="w-5 h-5" />, tone: 'bg-emerald-50 text-emerald-700', onClick: () => onNavigate('Fleet Availability') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <h1 className="text-2xl font-semibold text-slate-900 mt-0.5">
            {greeting}, {currentUser?.fullName?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">Here is what is happening with your rentals today.</p>
        </div>
        <div className="hidden sm:block opacity-90"><Logo /></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map(t => (
          <button
            key={t.label}
            type="button"
            onClick={t.onClick}
            className="group text-left bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{t.label}</p>
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.tone}`}>{t.icon}</span>
            </div>
            <p className="mt-2 text-3xl font-semibold text-slate-900 tabular-nums">{t.value}</p>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-slate-500">{t.sub}</span>
              <span className="text-emerald-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity">View →</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default HomePage;
