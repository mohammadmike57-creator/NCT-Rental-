import React, { useMemo, useState } from 'react';
import CarPicture from './CarPicture';
import { ChevronRightIcon, PlusIcon, DocumentTextIcon, ClockIcon, ShieldExclamationIcon, CurrencyDollarIcon, CalendarIcon, CarIcon } from './icons';
import { VehicleArt, vehicleKind, vehicleKindLabel, VehicleKind } from './VehicleGraphics';
import { Reservation } from '../types';
import { Page, PageHeader, StatGrid, Panel, Tabs, Button, Badge, Plate, EmptyState, table } from './ui/Crm';

interface HomePageProps {
  currentUser: any;
  allData: any;
  onNavigate: (view: string, filters?: any) => void;
  onOpenAgreement?: (reservation: Reservation, year: number, month: string) => void;
  onOpenUnlistedAgreement?: () => void;
}

type Located = { res: Reservation; year: number; month: string };

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const timeOf = (iso?: string) => (iso && iso.includes('T') ? iso.split('T')[1].slice(0, 5) : '—');
const shortDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};
const money = (n: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const num = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : 0; };

const HomePage: React.FC<HomePageProps> = ({ currentUser, allData, onNavigate, onOpenAgreement, onOpenUnlistedAgreement }) => {
  const reservations = allData.reservations || {};
  const fleet = allData.fleet || [];
  const sources: { id: string; name: string }[] = allData.sources || [];
  const [scheduleTab, setScheduleTab] = useState<'pickups' | 'returns'>('pickups');

  // Keep the storage year/month with each booking so actions update the right record.
  const all: Located[] = useMemo(() => {
    const flat: Located[] = [];
    Object.keys(reservations).forEach(year => {
      const yearData = reservations[year] || {};
      Object.keys(yearData).forEach(month => {
        (Array.isArray(yearData[month]) ? yearData[month] : []).forEach((res: Reservation) => flat.push({ res, year: Number(year), month }));
      });
    });
    return flat;
  }, [reservations]);

  const now = new Date();
  const today = dayKey(now);
  const thisMonth = today.slice(0, 7);
  const active = all.filter(({ res }) => res.status === 'CONFIRMED');

  const pickupsToday = active
    .filter(({ res }) => !res.voucherSubmitted && (res.startDate || '').slice(0, 10) <= today && (res.endDate || '').slice(0, 10) >= today)
    .sort((a, b) => (a.res.startDate || '').localeCompare(b.res.startDate || ''));
  const onRent = active.filter(({ res }) => res.voucherSubmitted && !res.dropOffCompleted);
  const returnsDue = onRent
    .filter(({ res }) => (res.endDate || '').slice(0, 10) <= today)
    .sort((a, b) => (a.res.endDate || '').localeCompare(b.res.endDate || ''));
  const overdueReturns = returnsDue.filter(({ res }) => res.endDate && new Date(res.endDate).getTime() < now.getTime());
  const latePickups = pickupsToday.filter(({ res }) => (res.startDate || '').slice(0, 10) < today);
  const awaitingConfirmation = all.filter(({ res }) => res.awaitingConfirmation && res.status !== 'CANCELLED');
  const unpaidExtensions = all.filter(({ res }) => num(res.unpaidExtensionAmount) > 0);
  const paymentApprovals = all.filter(({ res }) => res.paymentConfirmationPending);
  const tickets: any[] = allData.trafficTickets || [];
  const damages: any[] = allData.vehicleDamages || [];
  const openTickets = tickets.filter(t => t.status === 'NOT_COLLECTED');
  const openDamages = damages.filter(d => d.status === 'NOT_COLLECTED');

  const monthBookings = all.filter(({ res }) => (res.startDate || '').slice(0, 7) === thisMonth && res.status !== 'CANCELLED');
  const closedThisMonth = all.filter(({ res }) => res.dropOffCompleted && (res.endDate || '').slice(0, 7) === thisMonth).length;

  const bySource = useMemo(() => {
    const map = new Map<string, { count: number }>();
    monthBookings.forEach(({ res }) => {
      const key = res.source || 'unknown';
      const cur = map.get(key) || { count: 0 };
      cur.count++;
      map.set(key, cur);
    });
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, name: sources.find(s => s.id === id)?.name || (id === 'unknown' ? 'No source' : id), ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, sources]);
  const maxSource = Math.max(1, ...bySource.map(s => s.count));

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
  const maxDay = Math.max(1, ...next7.map(d => Math.max(d.pickups, d.returns)));

  const totalCars = fleet.length;
  const inUse = Math.min(onRent.length, totalCars || onRent.length);
  const available = Math.max(0, totalCars - inUse);
  const utilisation = totalCars ? Math.round((inUse / totalCars) * 100) : 0;
  const fleetByKind = useMemo(() => {
    const total = new Map<VehicleKind, number>();
    fleet.forEach((v: any) => { const k = vehicleKind(v.modelName, fleet); total.set(k, (total.get(k) || 0) + 1); });
    const out = new Map<VehicleKind, number>();
    onRent.forEach(({ res }) => { const k = vehicleKind(res.carModel, fleet); out.set(k, (out.get(k) || 0) + 1); });
    return Array.from(total.entries()).map(([k, n]) => ({ kind: k, total: n, out: Math.min(n, out.get(k) || 0) })).sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleet, onRent.length]);

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (currentUser?.fullName || currentUser?.username || '').split(' ')[0];

  const attention = [
    { key: 'od', label: 'Overdue returns', count: overdueReturns.length, tone: 'danger' as const, icon: <ClockIcon className="w-4 h-4" />, go: () => onNavigate('Agreement', { voucherSubmitted: true, dropOffCompleted: false }) },
    { key: 'lp', label: 'Late pickups', count: latePickups.length, tone: 'warning' as const, icon: <CalendarIcon className="w-4 h-4" />, go: () => onNavigate('Agreement', { voucherSubmitted: false, dropOffCompleted: false }) },
    { key: 'ac', label: 'Unlisted agreements to list', count: awaitingConfirmation.length, tone: 'warning' as const, icon: <DocumentTextIcon className="w-4 h-4" />, go: () => onNavigate('Unlisted Agreements') },
    { key: 'pa', label: 'Payment approvals', count: paymentApprovals.length, tone: 'info' as const, icon: <CurrencyDollarIcon className="w-4 h-4" />, go: () => onNavigate('Payment Approvals') },
    { key: 'ue', label: 'Unpaid extensions', count: unpaidExtensions.length, tone: 'warning' as const, icon: <CurrencyDollarIcon className="w-4 h-4" />, go: () => onNavigate('Deferred Payments') },
    { key: 'tt', label: 'Traffic tickets to collect', count: openTickets.length, tone: 'danger' as const, icon: <ShieldExclamationIcon className="w-4 h-4" />, go: () => onNavigate('Traffic Tickets') },
    { key: 'vd', label: 'Damages to collect', count: openDamages.length, tone: 'danger' as const, icon: <CarIcon className="w-4 h-4" />, go: () => onNavigate('Vehicle Damages') },
  ];
  const attentionOpen = attention.filter(a => a.count > 0);

  const schedule = scheduleTab === 'pickups' ? pickupsToday : returnsDue;
  const Row: React.FC<{ item: Located }> = ({ item }) => {
    const { res } = item;
    const isPickup = scheduleTab === 'pickups';
    const when = isPickup ? res.startDate : res.endDate;
    const late = isPickup ? (res.startDate || '').slice(0, 10) < today : !!res.endDate && new Date(res.endDate).getTime() < now.getTime();
    const action = onOpenAgreement && (
      <Button size="sm" variant={isPickup ? 'primary' : 'success'} icon={<DocumentTextIcon className="w-3.5 h-3.5" />} onClick={() => onOpenAgreement(res, item.year, item.month)}>
        {isPickup ? 'Check out' : 'Check in'}
      </Button>
    );
    return (
      <>
        <tr className={`hidden md:table-row ${table.row}`}>
          <td className={table.td}>
            <p className={`font-semibold tabular-nums ${late ? 'text-rose-600' : 'text-slate-900'}`}>{timeOf(when)}</p>
            <p className="text-[11px] text-slate-500">{late ? (isPickup ? 'Late' : 'Overdue') : shortDate(when)}</p>
          </td>
          <td className={`${table.td} font-mono font-semibold text-slate-900 whitespace-nowrap`}>{res.bookingId}</td>
          <td className={table.td}>
            <p className="font-medium text-slate-900 truncate max-w-[12rem]">{res.personName}</p>
            <p className="text-[11px] text-slate-500 truncate max-w-[12rem]">{res.contactNumber || '—'}</p>
          </td>
          <td className={table.td}>
            <div className="flex items-center gap-2.5">
              <CarPicture fleet={fleet} plate={res.licensePlate} model={res.carModel} className="w-14 h-9" artClassName="w-14 h-9 p-1 rounded-md bg-slate-50 ring-1 ring-inset ring-slate-200" />
              <div className="min-w-0">
                <p className="text-slate-800 truncate max-w-[10rem]">{res.carModel || '—'}</p>
                <Plate value={res.licensePlate} />
              </div>
            </div>
          </td>
          <td className={`${table.td} text-slate-600 truncate max-w-[9rem]`}>{res.locationName || '—'}</td>
          <td className={`${table.td} text-right`}>{action}</td>
        </tr>
        <tr className="md:hidden">
          <td colSpan={6} className="px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="w-12 shrink-0">
                <p className={`text-sm font-semibold tabular-nums ${late ? 'text-rose-600' : 'text-slate-900'}`}>{timeOf(when)}</p>
                {late && <p className="text-[10px] font-semibold text-rose-600">{isPickup ? 'Late' : 'Overdue'}</p>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">{res.personName}</p>
                <p className="text-xs text-slate-500 truncate"><span className="font-mono">{res.bookingId}</span> · {res.carModel} {res.licensePlate ? `· ${res.licensePlate}` : ''}</p>
              </div>
              <div className="shrink-0">{action}</div>
            </div>
          </td>
        </tr>
      </>
    );
  };

  return (
    <Page>
      <PageHeader
        section="Core Operations"
        title="Dashboard"
        subtitle={<>{greeting}{firstName ? `, ${firstName}` : ''} · {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</>}
        actions={<>
          {onOpenUnlistedAgreement && <Button icon={<DocumentTextIcon className="w-4 h-4 text-amber-600" />} onClick={onOpenUnlistedAgreement}>Agreement for Unlisted Reservation</Button>}
          <Button variant="primary" icon={<PlusIcon className="w-4 h-4" />} onClick={() => onNavigate('Reservations')}>New reservation</Button>
        </>}
      />

      <StatGrid items={[
        { label: 'Pickups today', value: pickupsToday.length, sub: latePickups.length ? `${latePickups.length} late` : 'cars to hand over', tone: 'info', onClick: () => onNavigate('Agreement', { voucherSubmitted: false, dropOffCompleted: false }) },
        { label: 'Returns due', value: returnsDue.length, sub: overdueReturns.length ? `${overdueReturns.length} overdue` : 'due back today', tone: overdueReturns.length ? 'danger' : 'success', onClick: () => onNavigate('Agreement', { voucherSubmitted: true, dropOffCompleted: false }) },
        { label: 'On rent', value: onRent.length, sub: `${closedThisMonth} closed this month`, onClick: () => onNavigate('Agreement', { voucherSubmitted: true, dropOffCompleted: false }) },
        { label: 'Fleet available', value: `${available}/${totalCars}`, sub: `${utilisation}% utilisation`, onClick: () => onNavigate('Fleet Availability') },
        { label: 'Bookings this month', value: monthBookings.length, sub: now.toLocaleDateString('en-GB', { month: 'long' }), onClick: () => onNavigate('Reservations') },
        { label: 'Unlisted agreements', value: awaitingConfirmation.length, sub: 'waiting to be listed', tone: awaitingConfirmation.length ? 'warning' : undefined, onClick: () => onNavigate('Unlisted Agreements') },
      ]} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel className="xl:col-span-2" title="Today's schedule" subtitle="Handovers and returns planned for today"
          actions={<button onClick={() => onNavigate("Today's Reservations")} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-0.5">Open schedule <ChevronRightIcon className="w-3.5 h-3.5" /></button>}>
          <Tabs value={scheduleTab} onChange={k => setScheduleTab(k as 'pickups' | 'returns')}
            tabs={[{ key: 'pickups', label: 'Pickups', count: pickupsToday.length }, { key: 'returns', label: 'Returns', count: returnsDue.length }]} />
          {schedule.length === 0 ? (
            <EmptyState icon={<CalendarIcon />} title={scheduleTab === 'pickups' ? 'No pickups today' : 'No returns due'} hint={scheduleTab === 'pickups' ? 'There are no cars to hand over today.' : 'Nothing is due back today.'} />
          ) : (
            <table className={`${table.wrap} table-fixed md:table-auto`}>
              <thead className="hidden md:table-header-group">
                <tr className={table.head}>
                  <th className={table.th}>Time</th><th className={table.th}>Res. no.</th><th className={table.th}>Customer</th>
                  <th className={table.th}>Vehicle</th><th className={table.th}>Branch</th><th className={table.th}><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {schedule.slice(0, 8).map(item => <Row key={item.res.id} item={item} />)}
              </tbody>
            </table>
          )}
          {schedule.length > 8 && (
            <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-500">
              Showing 8 of {schedule.length}. <button onClick={() => onNavigate("Today's Reservations")} className="font-semibold text-indigo-600 hover:text-indigo-800">See all</button>
            </div>
          )}
        </Panel>

        <Panel title="Needs attention" subtitle={(() => { const n = attentionOpen.reduce((s, a) => s + a.count, 0); return n ? `${n} open item${n === 1 ? '' : 's'}` : 'Nothing waiting'; })()}>
          {attentionOpen.length === 0 ? (
            <EmptyState title="All clear" hint="No overdue rentals, approvals or uncollected charges." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {attentionOpen.map(a => (
                <li key={a.key}>
                  <button onClick={a.go} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${a.tone === 'danger' ? 'bg-rose-50 text-rose-600' : a.tone === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'}`}>{a.icon}</span>
                    <span className="flex-1 min-w-0 text-[13px] font-medium text-slate-800 truncate">{a.label}</span>
                    <Badge tone={a.tone} dot={false}>{a.count}</Badge>
                    <ChevronRightIcon className="w-4 h-4 text-slate-300" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Next 7 days" subtitle="Planned pickups and returns" padded
          actions={<div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />Pickups</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />Returns</span>
          </div>}>
          <div className="grid grid-cols-7 gap-1.5 items-end h-40">
            {next7.map(d => (
              <div key={d.key} className="flex flex-col items-center h-full justify-end min-w-0">
                <div className="flex-1 w-full flex items-end justify-center gap-0.5">
                  <div className="w-2.5 sm:w-3 rounded-t-sm bg-indigo-500" style={{ height: `${(d.pickups / maxDay) * 100}%`, minHeight: d.pickups ? 3 : 0 }} title={`${d.pickups} pickups`} />
                  <div className="w-2.5 sm:w-3 rounded-t-sm bg-emerald-500" style={{ height: `${(d.returns / maxDay) * 100}%`, minHeight: d.returns ? 3 : 0 }} title={`${d.returns} returns`} />
                </div>
                <span className={`mt-1.5 text-[11px] font-semibold ${d.label === 'Today' ? 'text-indigo-600' : 'text-slate-600'}`}>{d.label}</span>
                <span className="text-[10px] text-slate-400 tabular-nums">{d.pickups}/{d.returns}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Fleet status" subtitle={`${utilisation}% of ${totalCars} vehicles on rent`}
          actions={<button onClick={() => onNavigate('Fleet Availability')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Availability</button>}>
          <div className="px-4 pt-3 pb-1">
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${utilisation}%` }} /></div>
            <div className="mt-1.5 flex justify-between text-[11px] text-slate-500"><span>{inUse} on rent</span><span>{available} available</span></div>
          </div>
          {fleetByKind.length === 0 ? <EmptyState icon={<CarIcon />} title="No vehicles yet" hint="Add cars in Fleet Management." /> : (
            <ul className="divide-y divide-slate-100">
              {fleetByKind.map(f => (
                <li key={f.kind} className="flex items-center gap-3 px-4 py-2">
                  <VehicleArt kind={f.kind} className="w-12 h-7 shrink-0" />
                  <span className="text-[13px] font-medium text-slate-700 flex-1">{vehicleKindLabel[f.kind]}</span>
                  <span className="text-[11px] text-slate-500 tabular-nums">{f.out} out</span>
                  <span className="w-10 text-right text-[13px] font-semibold text-slate-900 tabular-nums">{f.total - f.out}<span className="text-slate-400 font-normal">/{f.total}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Bookings by source" subtitle={now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          actions={<button onClick={() => onNavigate('Source Performance')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Report</button>}>
          {bySource.length === 0 ? <EmptyState title="No bookings this month" /> : (
            <ul className="px-4 py-2 space-y-2.5">
              {bySource.map(s => (
                <li key={s.id}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="font-medium text-slate-800 truncate">{s.name}</span>
                    <span className="font-semibold text-slate-900 tabular-nums">{s.count} <span className="text-[11px] font-normal text-slate-400">booking{s.count === 1 ? '' : 's'}</span></span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${(s.count / maxSource) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </Page>
  );
};

export default HomePage;
