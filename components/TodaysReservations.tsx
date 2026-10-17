import React, { useMemo, useState } from 'react';
import { AppData, Reservation, ReservationStatus, RentalSource } from '../types';
import { DocumentTextIcon, ClockIcon } from './icons';
import { Page, PageHeader, StatGrid, Panel, Tabs, Badge, Plate, Button, EmptyState, table } from './ui/Crm';

interface TodaysReservationsProps {
  allData: AppData;
  rentalSources: RentalSource[];
  onShowVoucher: (reservation: Reservation, year: number, month: string) => void;
}

type Kind = 'pickup' | 'return' | 'ongoing';

const KIND_META: Record<Kind, { label: string; tone: 'success' | 'danger' | 'info' }> = {
  pickup: { label: 'Pickup', tone: 'success' },
  return: { label: 'Return', tone: 'danger' },
  ongoing: { label: 'On rent', tone: 'info' },
};

const splitDate = (value?: string) => ({
  date: value?.split('T')[0] || '\u2014',
  time: value?.split('T')[1]?.substring(0, 5) || '',
});

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

    const [tab, setTab] = useState<'all' | Kind>('all');
    const getSourceName = (sourceId: string) => rentalSources.find(s => s.id === sourceId)?.name || sourceId;

    const total = pickups.length + returns.length + ongoing.length;

    const rows = useMemo(() => {
        const all: { kind: Kind; res: Reservation; year: number; month: string }[] = [
            ...pickups.map(i => ({ kind: 'pickup' as Kind, ...i })),
            ...returns.map(i => ({ kind: 'return' as Kind, ...i })),
            ...ongoing.map(i => ({ kind: 'ongoing' as Kind, ...i })),
        ];
        return tab === 'all' ? all : all.filter(r => r.kind === tab);
    }, [pickups, returns, ongoing, tab]);

    const emptyCopy: Record<'all' | Kind, { title: string; hint: string }> = {
        all: { title: 'Nothing scheduled today', hint: 'Confirmed bookings starting, ending or running through today will appear here.' },
        pickup: { title: 'No pickups today', hint: 'Bookings starting today will appear here.' },
        return: { title: 'No returns today', hint: 'Rentals ending today will appear here.' },
        ongoing: { title: 'No other ongoing rentals', hint: 'Multi-day rentals in progress will appear here.' },
    };

    return (
        <Page>
            <PageHeader
                section="Core Operations"
                title="Today's activity"
                subtitle={today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            />

            <StatGrid items={[
                { label: 'Pickups', value: pickups.length, sub: 'starting today', tone: pickups.length ? 'success' : 'default', active: tab === 'pickup', onClick: () => setTab(tab === 'pickup' ? 'all' : 'pickup') },
                { label: 'Returns', value: returns.length, sub: 'due back today', tone: returns.length ? 'danger' : 'default', active: tab === 'return', onClick: () => setTab(tab === 'return' ? 'all' : 'return') },
                { label: 'Ongoing', value: ongoing.length, sub: 'on rent', tone: ongoing.length ? 'info' : 'default', active: tab === 'ongoing', onClick: () => setTab(tab === 'ongoing' ? 'all' : 'ongoing') },
                { label: 'Total active', value: total, sub: 'confirmed bookings', active: tab === 'all', onClick: () => setTab('all') },
            ]} />

            <Panel>
                <Tabs
                    value={tab}
                    onChange={k => setTab(k as 'all' | Kind)}
                    tabs={[
                        { key: 'all', label: 'All', count: total },
                        { key: 'pickup', label: 'Pickups', count: pickups.length },
                        { key: 'return', label: 'Returns', count: returns.length },
                        { key: 'ongoing', label: 'Ongoing', count: ongoing.length },
                    ]}
                />
                {rows.length === 0 ? (
                    <EmptyState icon={<ClockIcon />} title={emptyCopy[tab].title} hint={emptyCopy[tab].hint} />
                ) : (
                    <>
                        <table className={`hidden md:table ${table.wrap}`}>
                            <thead className={table.head}>
                                <tr>
                                    <th className={table.th}>Type</th>
                                    <th className={table.th}>Booking</th>
                                    <th className={table.th}>Customer</th>
                                    <th className={table.th}>Vehicle</th>
                                    <th className={table.th}>Pickup</th>
                                    <th className={table.th}>Return</th>
                                    <th className={table.th}><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className={table.body}>
                                {rows.map(({ kind, res, year, month }) => {
                                    const pickup = splitDate(res.startDate);
                                    const ret = splitDate(res.endDate);
                                    return (
                                        <tr key={`${kind}-${res.id}`} className={table.row}>
                                            <td className={table.td}><Badge tone={KIND_META[kind].tone}>{KIND_META[kind].label}</Badge></td>
                                            <td className={`${table.td} whitespace-nowrap`}>
                                                <p className="font-mono font-semibold text-slate-900">{res.bookingId || 'N/A'}</p>
                                                <p className="text-[11px] text-slate-500 truncate max-w-[9rem]">{getSourceName(res.source || 'Direct')}</p>
                                            </td>
                                            <td className={table.td}><p className="font-medium text-slate-900 truncate max-w-[12rem]">{res.personName}</p></td>
                                            <td className={table.td}>
                                                <p className="text-slate-800 truncate max-w-[11rem]">{res.carModel}</p>
                                                <p className="mt-0.5">{res.licensePlate ? <Plate value={res.licensePlate} /> : <span className="text-[11px] text-slate-400">TBD</span>}</p>
                                            </td>
                                            <td className={`${table.td} whitespace-nowrap tabular-nums`}>
                                                <p className="text-slate-800">{pickup.date}</p>
                                                {pickup.time && <p className="text-[11px] text-slate-500">{pickup.time}</p>}
                                            </td>
                                            <td className={`${table.td} whitespace-nowrap tabular-nums`}>
                                                <p className="text-slate-800">{ret.date}</p>
                                                {ret.time && <p className="text-[11px] text-slate-500">{ret.time}</p>}
                                            </td>
                                            <td className={`${table.td} text-right`}>
                                                <Button size="sm" icon={<DocumentTextIcon className="w-3.5 h-3.5" />} onClick={() => onShowVoucher(res, year, month)} title="View Agreement" aria-label="View agreement">Agreement</Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        <ul className="md:hidden divide-y divide-slate-100">
                            {rows.map(({ kind, res, year, month }) => {
                                const pickup = splitDate(res.startDate);
                                const ret = splitDate(res.endDate);
                                return (
                                    <li key={`${kind}-${res.id}`} className="px-4 py-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="flex items-center gap-2 min-w-0"><span className="font-mono text-[13px] font-semibold text-slate-900">{res.bookingId || 'N/A'}</span><span className="text-[11px] text-slate-400 truncate">{getSourceName(res.source || 'Direct')}</span></p>
                                                <p className="text-sm font-medium text-slate-900 truncate">{res.personName}</p>
                                            </div>
                                            <Badge tone={KIND_META[kind].tone}>{KIND_META[kind].label}</Badge>
                                        </div>
                                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 min-w-0">
                                            <span className="truncate">{res.carModel}</span>
                                            {res.licensePlate ? <Plate value={res.licensePlate} /> : <span className="text-slate-400">TBD</span>}
                                        </div>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="text-xs text-slate-800 tabular-nums">{pickup.date} {pickup.time}<span className="text-slate-300 mx-1.5">&rarr;</span>{ret.date} {ret.time}</span>
                                            <Button size="sm" className="ml-auto" icon={<DocumentTextIcon className="w-3.5 h-3.5" />} onClick={() => onShowVoucher(res, year, month)} aria-label="View agreement">Agreement</Button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </Panel>
        </Page>
    );
};

export default TodaysReservations;
