import React, { useMemo } from 'react';
import { CalendarIcon, DocumentTextIcon, ClockIcon, CarIcon, PlusCircleIcon, ChevronRightIcon } from './icons';
import { VehicleArt, vehicleKind, vehicleKindLabel, VehicleKind } from './VehicleGraphics';
import { Reservation } from '../types';

interface HomePageProps {
  currentUser: any;
  allData: any;
  onNavigate: (view: string, filters?: any) => void;
  onOpenAgreement?: (reservation: Reservation, year: number, month: string) => void;
}

type Located = { res: Reservation; year: number; month: string };

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const timeOf = (iso?: string) => (iso && iso.includes('T') ? iso.split('T')[1].slice(0, 5) : '—');
const initials = (name?: string) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');

const HomePage: React.FC<HomePageProps> = ({ currentUser, allData, onNavigate, onOpenAgreement }) => {
  const reservations = allData.reservations || {};
  const fleet = allData.fleet || [];

  // Keep the storage year/month with each booking so actions update the right record.
  const all: Located[] = useMemo(() => {
    const flat: Located[] = [];
    Object.keys(reservations).forEach(year => {
      const yearData = reservations[year] || {};
      Object.keys(yearData).forEach(month => {
        (yearData[month] || []).forEach((res: Reservation) => flat.push({ res, year: Number(year), month }));
      });
    });
    return flat;
  }, [reservations]);

  const now = new Date();
  const today = dayKey(now);
  const active = all.filter(({ res }) => res.status === 'CONFIRMED');

  const pickupsToday = active
    .filter(({ res }) => !res.voucherSubmitted && (res.startDate || '').slice(0, 10) <= today && (res.endDate || '').slice(0, 10) >= today)
    .sort((a, b) => (a.res.startDate || '').localeCompare(b.res.startDate || ''));
  const onRent = active.filter(({ res }) => res.voucherSubmitted && !res.dropOffCompleted);
  const returnsDue = onRent
    .filter(({ res }) => (res.endDate || '').slice(0, 10) <= today)
    .sort((a, b) => (a.res.endDate || '').localeCompare(b.res.endDate || ''));
  const overdueReturns = returnsDue.filter(({ res }) => res.endDate && new Date(res.endDate).getTime() < now.getTime()).length;
  const closedThisMonth = all.filter(({ res }) => res.dropOffCompleted && (res.endDate || '').slice(0, 7) === today.slice(0, 7)).length;

  const next7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const key = dayKey(d);
    return {
      key,
      label: i === 0 ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short' }),
      date: d.getDate(),
      pickups: active.filter(({ res }) => (res.startDate || '').slice(0, 10) === key && !res.voucherSubmitted).length,
      returns: onRent.filter(({ res }) => (res.endDate || '').slice(0, 10) === key).length,
    };
  });
  const maxDay = Math.max(1, ...next7.map(d => d.pickups + d.returns));

  const totalCars = fleet.length;
  const inUse = Math.min(onRent.length, totalCars || onRent.length);
  const utilisation = totalCars ? Math.round((inUse / totalCars) * 100) : 0;
  const fleetByKind = useMemo(() => {
    const map = new Map<VehicleKind, number>();
    fleet.forEach((v: any) => {
      const k = vehicleKind(v.modelName, fleet);
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [fleet]);

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (currentUser?.fullName || currentUser?.username || '').split(' ')[0];

  const Kpi: React.FC<{ label: string; value: React.ReactNode; hint: string; tone: string; icon: React.ReactNode; onClick?: () => void }> = ({ label, value, hint, tone, icon, onClick }) => (
    <button onClick={onClick} disabled={!onClick}
      className="text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 hover:shadow-sm transition-all disabled:cursor-default group">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${tone}`}>{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-bold text-slate-900 tabular-nums">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
    </button>
  );

  const BookingRow: React.FC<{ item: Located; kind: 'pickup' | 'return' }> = ({ item, kind }) => {
    const { res } = item;
    const car = vehicleKind(res.carModel, fleet);
    const late = kind === 'return' && res.endDate && new Date(res.endDate).getTime() < now.getTime();
    const latePickup = kind === 'pickup' && (res.startDate || '').slice(0, 10) < today;
    return (
      <li className="flex items-center gap-3 py-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-xs font-bold flex items-center justify-center shrink-0">{initials(res.personName)}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 truncate">{res.personName}</p>
          <p className="text-xs text-slate-500 truncate">
            <span className="font-mono">{res.bookingId}</span> · {res.locationName || 'No location'}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 w-40 min-w-0">
          <VehicleArt kind={car} className="w-12 h-7 shrink-0" />
          <span className="text-xs text-slate-600 truncate">{res.carModel}</span>
        </div>
        <div className="text-right w-16 shrink-0">
          <p className={`text-sm font-semibold tabular-nums ${late || latePickup ? 'text-rose-600' : 'text-slate-900'}`}>{timeOf(kind === 'pickup' ? res.startDate : res.endDate)}</p>
          {(late || latePickup) && <p className="text-[10px] font-bold uppercase text-rose-600">{late ? 'Overdue' : 'Late'}</p>}
        </div>
        {onOpenAgreement && (
          <button onClick={() => onOpenAgreement(res, item.year, item.month)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold ${kind === 'pickup' ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
            {kind === 'pickup' ? 'Check out' : 'Check in'}
          </button>
        )}
      </li>
    );
  };

  const Panel: React.FC<{ title: string; count: number; empty: string; action: () => void; children: React.ReactNode; accent: string }> = ({ title, count, empty, action, children, accent }) => (
    <section className="bg-white rounded-2xl border border-slate-200 flex flex-col">
      <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${accent}`} />
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold tabular-nums">{count}</span>
        </div>
        <button onClick={action} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-0.5">View all <ChevronRightIcon className="w-3.5 h-3.5" /></button>
      </header>
      <div className="px-5 flex-1">
        {count === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-slate-700">All clear</p>
            <p className="text-xs text-slate-500">{empty}</p>
          </div>
        ) : <ul className="divide-y divide-slate-100">{children}</ul>}
      </div>
    </section>
  );

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-white">
        <div className="absolute -right-6 -bottom-6 opacity-90 hidden md:block">
          <VehicleArt kind="suv" className="w-72 h-40" color="#6366f1" />
        </div>
        <div className="absolute right-56 bottom-2 opacity-60 hidden lg:block">
          <VehicleArt kind="sedan" className="w-44 h-24" color="#0ea5e9" />
        </div>
        <div className="relative p-6 sm:p-8 max-w-2xl">
          <p className="text-sm text-indigo-200">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
          <p className="mt-2 text-slate-300 text-sm">
            {pickupsToday.length} pickup{pickupsToday.length === 1 ? '' : 's'} and {returnsDue.length} return{returnsDue.length === 1 ? '' : 's'} on the schedule today
            {overdueReturns > 0 ? ` · ${overdueReturns} overdue` : ''}.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={() => onNavigate('Reservations')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-slate-900 text-sm font-semibold hover:bg-indigo-50">
              <PlusCircleIcon className="w-4 h-4" /> New reservation
            </button>
            <button onClick={() => onNavigate('Agreement')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 ring-1 ring-white/20">
              <DocumentTextIcon className="w-4 h-4" /> Agreements
            </button>
            <button onClick={() => onNavigate('Fleet Availability')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 ring-1 ring-white/20">
              <CarIcon className="w-4 h-4" /> Fleet
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Pickups today" value={pickupsToday.length} hint="cars to hand over" tone="bg-sky-50 text-sky-600" icon={<CalendarIcon className="w-5 h-5" />} onClick={() => onNavigate('Agreement', { voucherSubmitted: false, dropOffCompleted: false })} />
        <Kpi label="Returns due" value={returnsDue.length} hint={overdueReturns ? `${overdueReturns} overdue` : 'due back today'} tone={overdueReturns ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'} icon={<ClockIcon className="w-5 h-5" />} onClick={() => onNavigate('Agreement', { voucherSubmitted: true, dropOffCompleted: false })} />
        <Kpi label="On rent" value={onRent.length} hint={`${closedThisMonth} closed this month`} tone="bg-indigo-50 text-indigo-600" icon={<DocumentTextIcon className="w-5 h-5" />} onClick={() => onNavigate('Agreement', { voucherSubmitted: true, dropOffCompleted: false })} />
        <Kpi label="Fleet in use" value={`${utilisation}%`} hint={`${Math.max(0, totalCars - inUse)} of ${totalCars} cars available`} tone="bg-amber-50 text-amber-600" icon={<CarIcon className="w-5 h-5" />} onClick={() => onNavigate('Fleet Availability')} />
      </div>

      {/* Today */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel title="Pickups today" count={pickupsToday.length} empty="No cars to hand over today." action={() => onNavigate('Agreement', { voucherSubmitted: false, dropOffCompleted: false })} accent="bg-sky-500">
          {pickupsToday.slice(0, 6).map(item => <BookingRow key={item.res.id} item={item} kind="pickup" />)}
        </Panel>
        <Panel title="Returns due" count={returnsDue.length} empty="Nothing due back today." action={() => onNavigate('Agreement', { voucherSubmitted: true, dropOffCompleted: false })} accent="bg-emerald-500">
          {returnsDue.slice(0, 6).map(item => <BookingRow key={item.res.id} item={item} kind="return" />)}
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Next 7 days */}
        <section className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Next 7 days</h2>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500" />Pickups</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />Returns</span>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2 items-end h-44">
            {next7.map(d => (
              <div key={d.key} className="flex flex-col items-center gap-1 h-full justify-end">
                <span className="text-xs font-semibold text-slate-700 tabular-nums">{d.pickups + d.returns || ''}</span>
                <div className="w-full max-w-[44px] flex flex-col justify-end rounded-lg overflow-hidden bg-slate-50" style={{ height: '100%' }}>
                  <div className="bg-emerald-500" style={{ height: `${(d.returns / maxDay) * 100}%` }} title={`${d.returns} returns`} />
                  <div className="bg-sky-500" style={{ height: `${(d.pickups / maxDay) * 100}%` }} title={`${d.pickups} pickups`} />
                </div>
                <span className={`text-[11px] font-semibold ${d.label === 'Today' ? 'text-indigo-600' : 'text-slate-500'}`}>{d.label}</span>
                <span className="text-[10px] text-slate-400 -mt-1">{d.date}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Fleet */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Fleet</h2>
            <button onClick={() => onNavigate('Fleet Availability')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Availability</button>
          </div>
          <div className="mb-4">
            <div className="flex items-baseline justify-between">
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{Math.max(0, totalCars - inUse)}<span className="text-sm font-medium text-slate-400"> / {totalCars} available</span></p>
              <p className="text-xs font-semibold text-slate-500">{utilisation}% in use</p>
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${utilisation}%` }} /></div>
          </div>
          <ul className="space-y-2">
            {fleetByKind.map(([k, n]) => (
              <li key={k} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                <VehicleArt kind={k} className="w-14 h-8 shrink-0" />
                <span className="text-sm font-medium text-slate-700 flex-1">{vehicleKindLabel[k]}</span>
                <span className="text-sm font-semibold text-slate-900 tabular-nums">{n}</span>
              </li>
            ))}
            {fleetByKind.length === 0 && <li className="text-sm text-slate-500">No vehicles in the fleet yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default HomePage;
