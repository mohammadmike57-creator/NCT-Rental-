import React, { useMemo } from 'react';
import { AppData, Reservation, ReservationStatus, RentalSource } from '../types';
import { DocumentTextIcon, CarIcon, ClockIcon, CalendarCheckIcon } from './icons';

const OutIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" /></svg>
);
const InIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 4.5l-15 15m0 0h11.25m-11.25 0V8.25" /></svg>
);

interface TodaysReservationsProps {
  allData: AppData;
  rentalSources: RentalSource[];
  onShowVoucher: (reservation: Reservation, year: number, month: string) => void;
}

type Tone = 'emerald' | 'rose' | 'sky';

const TONES: Record<Tone, { tile: string; pill: string; bar: string }> = {
  emerald: { tile: 'bg-emerald-50 text-emerald-600', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200', bar: 'bg-emerald-500' },
  rose: { tile: 'bg-rose-50 text-rose-600', pill: 'bg-rose-50 text-rose-700 ring-rose-200', bar: 'bg-rose-500' },
  sky: { tile: 'bg-sky-50 text-sky-600', pill: 'bg-sky-50 text-sky-700 ring-sky-200', bar: 'bg-sky-500' },
};

const splitDate = (value?: string) => ({
  date: value?.split('T')[0] || '—',
  time: value?.split('T')[1]?.substring(0, 5) || '',
});

const ReservationCard: React.FC<{
  reservation: Reservation;
  year: number;
  month: string;
  rentalSources: RentalSource[];
  onShowVoucher: (reservation: Reservation, year: number, month: string) => void;
}> = ({ reservation, year, month, rentalSources, onShowVoucher }) => {
    const getSourceName = (sourceId: string) => rentalSources.find(s => s.id === sourceId)?.name || sourceId;
    const pickup = splitDate(reservation.startDate);
    const ret = splitDate(reservation.endDate);
    return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all">
        <div className="p-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{reservation.personName}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[11px] text-slate-600">{reservation.bookingId || 'N/A'}</span>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset bg-indigo-50 text-indigo-700 ring-indigo-200 truncate max-w-[10rem]">{getSourceName(reservation.source || 'Direct')}</span>
                </div>
            </div>
            <button
                onClick={() => onShowVoucher(reservation, year, month)}
                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-sm font-semibold text-indigo-600 bg-white ring-1 ring-inset ring-slate-200 hover:bg-indigo-50 hover:ring-indigo-200"
                title="View Agreement"
                aria-label="View agreement"
            >
                <DocumentTextIcon className="w-4 h-4" />
                <span className="hidden sm:inline lg:hidden xl:inline">Agreement</span>
            </button>
        </div>
        <div className="px-4 pb-3 flex items-center gap-2 text-sm text-slate-600 min-w-0">
            <CarIcon className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="truncate">{reservation.carModel}</span>
            <span className="shrink-0 text-xs text-slate-400">{reservation.licensePlate || 'TBD'}</span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100">
            <div className="px-4 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pickup</p>
                <p className="text-sm font-semibold text-slate-800 tabular-nums">{pickup.date}</p>
                {pickup.time && <p className="text-xs text-slate-500 tabular-nums">{pickup.time}</p>}
            </div>
            <div className="px-4 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Return</p>
                <p className="text-sm font-semibold text-slate-800 tabular-nums">{ret.date}</p>
                {ret.time && <p className="text-xs text-slate-500 tabular-nums">{ret.time}</p>}
            </div>
        </div>
    </div>
);
};


const TodaysReservations: React.FC<TodaysReservationsProps> = ({ allData, rentalSources, onShowVoucher }) => {
    
    const today = new Date();

    const { pickups, returns, ongoing } = useMemo(() => {
        const todaysPickups: {res: Reservation, year: number, month: string}[] = [];
        const todaysReturns: {res: Reservation, year: number, month: string}[] = [];
        const currentlyOngoing: {res: Reservation, year: number, month: string}[] = [];
        
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        for (const yearStr in allData) {
            const year = parseInt(yearStr, 10);
            const yearData = allData[year];
            for (const month in yearData) {
                const monthReservations = yearData[month];
                monthReservations.forEach(res => {
                    if (res.status !== ReservationStatus.CONFIRMED || !res.startDate || !res.endDate) {
                        return;
                    }
                    
                    try {
                        const startDate = new Date(res.startDate);
                        const endDate = new Date(res.endDate);

                        const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                        const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
                        
                        if (isNaN(startDay.getTime()) || isNaN(endDay.getTime())) return;

                        const reservationData = { res, year, month };

                        if (todayStart >= startDay && todayStart <= endDay) {
                             if (startDay.getTime() === todayStart.getTime()) {
                                todaysPickups.push(reservationData);
                            } else if (endDay.getTime() === todayStart.getTime()) {
                                todaysReturns.push(reservationData);
                            } else {
                                currentlyOngoing.push(reservationData);
                            }
                        }
                    } catch (e) {
                         console.error('Error parsing date for reservation:', res.id, e);
                    }
                });
            }
        }
        return { pickups: todaysPickups, returns: todaysReturns, ongoing: currentlyOngoing };

    }, [allData]);

    const sections: { key: string; title: string; hint: string; empty: string; emptyHint: string; tone: Tone; icon: React.ReactNode; items: typeof pickups }[] = [
        { key: 'pickups', title: 'Pickups', hint: 'Starting today', empty: 'No pickups today', emptyHint: 'Bookings starting today will appear here.', tone: 'emerald', icon: <OutIcon />, items: pickups },
        { key: 'returns', title: 'Returns', hint: 'Due back today', empty: 'No returns today', emptyHint: 'Rentals ending today will appear here.', tone: 'rose', icon: <InIcon />, items: returns },
        { key: 'ongoing', title: 'Ongoing rentals', hint: 'On rent through today', empty: 'No other ongoing rentals', emptyHint: 'Multi-day rentals in progress will appear here.', tone: 'sky', icon: <ClockIcon className="w-4 h-4" />, items: ongoing },
    ];

    const total = pickups.length + returns.length + ongoing.length;

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div className="p-5 sm:p-6 flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                        <CalendarCheckIcon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Today's activity</h2>
                        <p className="text-sm text-slate-500">{today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-100 divide-x divide-y lg:divide-y-0 divide-slate-100">
                    {[
                        { label: 'Pickups', value: pickups.length, sub: 'starting today', tone: 'text-emerald-600' },
                        { label: 'Returns', value: returns.length, sub: 'due back today', tone: 'text-rose-600' },
                        { label: 'Ongoing', value: ongoing.length, sub: 'on rent', tone: 'text-sky-600' },
                        { label: 'Total active', value: total, sub: 'confirmed bookings', tone: 'text-slate-900' },
                    ].map(k => (
                        <div key={k.label} className="px-5 py-4">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</p>
                            <p className={`mt-1 text-2xl font-bold tabular-nums ${k.value > 0 ? k.tone : 'text-slate-900'}`}>{k.value}</p>
                            <p className="text-xs text-slate-400">{k.sub}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                {sections.map(s => {
                    const t = TONES[s.tone];
                    return (
                        <section key={s.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-0">
                            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${t.tile}`}>{s.icon}</span>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-sm font-bold text-slate-900">{s.title}</h3>
                                    <p className="text-xs text-slate-500">{s.hint}</p>
                                </div>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset tabular-nums ${t.pill}`}>{s.items.length}</span>
                            </div>
                            <div className="p-3 sm:p-4 space-y-3 bg-slate-50/50 lg:max-h-[calc(100vh-320px)] lg:overflow-y-auto">
                                {s.items.length > 0 ? (
                                    s.items.map(item => <ReservationCard key={item.res.id} reservation={item.res} year={item.year} month={item.month} rentalSources={rentalSources} onShowVoucher={onShowVoucher} />)
                                ) : (
                                    <div className="py-10 text-center">
                                        <div className={`mx-auto w-10 h-10 rounded-xl flex items-center justify-center ${t.tile}`}>{s.icon}</div>
                                        <p className="mt-3 text-sm font-semibold text-slate-700">{s.empty}</p>
                                        <p className="text-xs text-slate-500">{s.emptyHint}</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
};

export default TodaysReservations;
