import React, { useMemo, useState } from 'react';
import { AppData, CompanyDetails, RentalSource, Reservation, ReservationStatus, TrafficTicket, VehicleDamage } from '../types';
import { MONTHS } from '../constants';
import { addOnsOf, AddOn, AddOnKind, AddOnStatus, AddOnSummary, isOpen, KIND_LABEL, STATUS_LABEL } from '../services/addOns';
import { printHtml } from '../services/printDocs';
import { Badge, Button, Dialog, EmptyState, Page, PageHeader, Panel, Segmented, StatGrid, inputCls, selectCls, table } from './ui/Crm';
import { ChevronRightIcon, DocumentReportIcon, DownloadIcon, PdfIcon, ReceiptIcon, SearchIcon } from './icons';

interface Props {
  allData: AppData;
  tickets: TrafficTicket[];
  damages: VehicleDamage[];
  sources: RentalSource[];
  company?: CompanyDetails;
  /** Opens the booking's agreement (check-out / check-in screen). */
  onOpenBooking?: (r: Reservation, year: number, month: string) => void;
}

type Period = 'month' | 'quarter' | 'year' | 'all';
type TypeFilter = 'all' | 'extras' | 'upgrade' | 'extension' | 'manual' | 'late' | 'damage' | 'ticket' | 'return' | 'fee';
type StatusFilter = 'all' | 'open' | 'settled';

/** Filter groups: fuel, cleaning and other return charges share one, as do cancellation and no-show fees. */
const TYPE_OF: Record<AddOnKind, TypeFilter> = {
  extras: 'extras', upgrade: 'upgrade', extension: 'extension', manual: 'manual', late: 'late', damage: 'damage', ticket: 'ticket',
  fuel: 'return', cleaning: 'return', other: 'return', cancellation: 'fee', noshow: 'fee',
};
const TYPE_LABEL: Record<Exclude<TypeFilter, 'all'>, string> = {
  extras: 'Extras', upgrade: 'Upgrades', extension: 'Extensions', manual: 'Price edits', late: 'Late returns',
  damage: 'Damages', ticket: 'Traffic tickets', return: 'Fuel, cleaning & other', fee: 'Cancellation & no-show fees',
};
const KIND_TONE: Record<AddOnKind, string> = {
  extras: 'bg-violet-50 text-violet-700 ring-violet-200', upgrade: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  extension: 'bg-sky-50 text-sky-700 ring-sky-200', manual: 'bg-slate-100 text-slate-700 ring-slate-200',
  late: 'bg-amber-50 text-amber-700 ring-amber-200', damage: 'bg-rose-50 text-rose-700 ring-rose-200',
  ticket: 'bg-orange-50 text-orange-700 ring-orange-200', fuel: 'bg-teal-50 text-teal-700 ring-teal-200',
  cleaning: 'bg-teal-50 text-teal-700 ring-teal-200', other: 'bg-slate-100 text-slate-700 ring-slate-200',
  cancellation: 'bg-rose-50 text-rose-700 ring-rose-200', noshow: 'bg-rose-50 text-rose-700 ring-rose-200',
};
const STATUS_TONE: Record<AddOnStatus, 'default' | 'info' | 'success' | 'warning' | 'danger' | 'muted'> = {
  'in-price': 'info', paid: 'success', outstanding: 'danger', claim: 'warning', charged: 'default', pending: 'warning', waived: 'muted',
};

const usd = (n: number, signed = false) => `${signed && n > 0 ? '+' : n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const jod = (n: number, signed = false) => `${signed && n > 0 ? '+' : n < 0 ? '−' : ''}JOD ${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const money = (n: number, cur: 'USD' | 'JOD', signed = false) => (cur === 'JOD' ? jod(n, signed) : usd(n, signed));
const both = (m: Record<'USD' | 'JOD', number>) => [m.USD ? usd(m.USD) : '', m.JOD ? jod(m.JOD) : ''].filter(Boolean).join(' · ') || '—';
const fmtDate = (iso?: string, time = false) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00` : iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) });
};
/** Both currencies stacked, for the summary tiles. */
const Stack: React.FC<{ m: Record<'USD' | 'JOD', number> }> = ({ m }) => (!m.USD && !m.JOD ? <>—</> : (
  <>{m.USD ? <span className="block">{usd(m.USD)}</span> : null}{m.JOD ? <span className={m.USD ? 'block text-sm sm:text-base' : 'block'}>{jod(m.JOD)}</span> : null}</>
));
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const KindChip: React.FC<{ kind: AddOnKind; count?: number }> = ({ kind, count }) => (
  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap ${KIND_TONE[kind]}`}>
    {KIND_LABEL[kind]}{count && count > 1 ? <span className="opacity-70">×{count}</span> : null}
  </span>
);

/**
 * Reservation Add-ons: every booking whose cost changed after it was made, with the original
 * reservation next to what it is now and each change (who, when, how much, paid or not).
 */
const ReservationAddOnsView: React.FC<Props> = ({ allData, tickets, damages, sources, company, onOpenBooking }) => {
  const [period, setPeriod] = useState<Period>('year');
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [source, setSource] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<AddOnSummary | null>(null);

  const sourceName = (id?: string) => sources.find(s => s.id === id)?.name || id || '—';
  const now = new Date();
  const inPeriod = (r: Reservation) => {
    if (period === 'all') return true;
    const d = new Date(r.startDate || r.pickupDate || '');
    if (!Number.isFinite(d.getTime())) return false;
    if (period === 'year') return d.getFullYear() === now.getFullYear();
    const months = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
    return period === 'month' ? months === 0 : months >= 0 && months < 3;
  };

  // Every booking in the period, and those with at least one add-on.
  const { inScope, withAddOns } = useMemo(() => {
    const list: Reservation[] = [];
    Object.values(allData || {}).forEach(months => Object.values(months || {}).forEach(items => list.push(...((items as Reservation[]) || []))));
    const scoped = list.filter(inPeriod);
    return { inScope: scoped, withAddOns: scoped.map(r => addOnsOf(r, tickets, damages)).filter(s => s.entries.length > 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allData, tickets, damages, period]);

  const matches = (e: AddOn) => (type === 'all' || TYPE_OF[e.kind] === type)
    && (status === 'all' || (status === 'open' ? isOpen(e.status) : !isOpen(e.status)));
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return withAddOns
      .filter(s => s.entries.some(matches))
      .filter(s => !source || s.reservation.source === source)
      .filter(s => !t || [s.reservation.bookingId, s.reservation.personName, s.reservation.contactNumber, s.reservation.licensePlate, s.reservation.carModel].some(v => (v || '').toLowerCase().includes(t)))
      .sort((a, b) => (b.entries[b.entries.length - 1]?.at || b.reservation.startDate || '').localeCompare(a.entries[a.entries.length - 1]?.at || a.reservation.startDate || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withAddOns, type, status, source, q]);

  const kpi = useMemo(() => {
    const priceUp = { USD: 0, JOD: 0 }, charges = { USD: 0, JOD: 0 }, outstanding = { USD: 0, JOD: 0 }, waived = { USD: 0, JOD: 0 };
    let priceNet = 0;
    withAddOns.forEach(s => {
      priceNet += s.priceChange;
      s.entries.forEach(e => {
        if (e.group === 'price' && e.amount > 0) priceUp.USD += e.amount;
        if (e.group === 'charge' && e.status !== 'waived') charges[e.currency] += e.amount;
        if (isOpen(e.status)) outstanding[e.currency] += e.amount;
        if (e.status === 'waived') waived[e.currency] += e.amount;
      });
    });
    return { priceUp, priceNet, charges, outstanding, waived };
  }, [withAddOns]);

  const byType = useMemo(() => {
    const m = new Map<Exclude<TypeFilter, 'all'>, { count: number; bookings: Set<string>; USD: number; JOD: number }>();
    withAddOns.forEach(s => s.entries.forEach(e => {
      const k = TYPE_OF[e.kind] as Exclude<TypeFilter, 'all'>;
      const g = m.get(k) || { count: 0, bookings: new Set<string>(), USD: 0, JOD: 0 };
      g.count++; g.bookings.add(s.reservation.id);
      if (e.status !== 'waived') g[e.currency] += e.amount;
      m.set(k, g);
    }));
    return (Object.keys(TYPE_LABEL) as Exclude<TypeFilter, 'all'>[]).filter(k => m.has(k)).map(k => ({ key: k, ...m.get(k)! }));
  }, [withAddOns]);
  const maxType = Math.max(1, ...byType.map(t => t.USD + t.JOD * 1.41));

  const usedSources = useMemo(() => Array.from(new Set(withAddOns.map(s => s.reservation.source).filter(Boolean))), [withAddOns]);
  const filtersActive = type !== 'all' || status !== 'all' || !!source || !!q;
  const periodLabel = { month: now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), quarter: 'the last 3 months', year: String(now.getFullYear()), all: 'all time' }[period];

  const exportCsv = () => {
    const head = ['Booking', 'Customer', 'Source', 'Pick-up', 'Return', 'Original price (USD)', 'Price now (USD)', 'Date', 'Type', 'Description', 'Details', 'By', 'Reference', 'Status', 'Amount', 'Currency'];
    const lines = rows.flatMap(s => s.entries.filter(matches).map(e => [
      s.reservation.bookingId, s.reservation.personName, sourceName(s.reservation.source), s.reservation.startDate, s.reservation.endDate,
      s.originalPrice.toFixed(2), s.currentPrice.toFixed(2), e.at || '', KIND_LABEL[e.kind], e.title, e.detail || '', e.by || '', e.reference || '', STATUS_LABEL[e.status],
      e.amount.toFixed(e.currency === 'JOD' ? 3 : 2), e.currency,
    ]));
    const csv = [head, ...lines].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `reservation-add-ons-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openBooking = (r: Reservation) => {
    const d = new Date(r.startDate);
    onOpenBooking?.(r, r.storageYear || d.getFullYear(), r.storageMonth || MONTHS[d.getMonth()]);
  };

  return (
    <Page>
      <PageHeader section="Core Operations" title="Reservation Add-ons"
        subtitle={<>Bookings whose cost changed after they were made: extras, upgrades, extensions, damages, traffic tickets and fees, compared with the original reservation.</>}
        actions={<Button icon={<DownloadIcon className="w-4 h-4" />} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>} />

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
        <Segmented value={period} onChange={k => setPeriod(k as Period)} className="w-full sm:w-auto"
          options={[{ key: 'month', label: 'This month' }, { key: 'quarter', label: '3 months' }, { key: 'year', label: 'This year' }, { key: 'all', label: 'All time' }]} />
        <p className="text-xs text-slate-500">By pick-up date · {periodLabel}</p>
      </div>

      <StatGrid items={[
        { label: 'Bookings with add-ons', value: withAddOns.length, sub: `of ${inScope.length} booking${inScope.length === 1 ? '' : 's'} (${inScope.length ? Math.round((withAddOns.length / inScope.length) * 100) : 0}%)` },
        { label: 'Added to rental price', value: usd(kpi.priceNet, true), sub: kpi.priceUp.USD !== kpi.priceNet ? `${usd(kpi.priceUp.USD)} added, less reductions` : 'extras, upgrades, extensions', tone: kpi.priceNet > 0 ? 'success' : 'default' },
        { label: 'Charges raised', value: <Stack m={kpi.charges} />, sub: 'damages, tickets, fees' },
        { label: 'Outstanding', value: <Stack m={kpi.outstanding} />, sub: 'claims, tickets, extensions', tone: kpi.outstanding.USD || kpi.outstanding.JOD ? 'danger' : 'default', active: status === 'open', onClick: () => setStatus(s => (s === 'open' ? 'all' : 'open')) },
        { label: 'Waived', value: <Stack m={kpi.waived} />, sub: 'fees not charged', tone: 'muted' },
      ]} />

      {byType.length > 0 && (
        <Panel title="By type" subtitle="Click a type to show only those bookings">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1 p-1">
            {byType.map(t => (
              <button key={t.key} onClick={() => setType(x => (x === t.key ? 'all' : t.key))} aria-pressed={type === t.key}
                className={`text-left rounded-lg px-3 py-2 transition-colors ${type === t.key ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-slate-800">{TYPE_LABEL[t.key]}</span>
                  <span className="text-[13px] font-semibold text-slate-900 tabular-nums">{both({ USD: t.USD, JOD: t.JOD })}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(3, ((t.USD + t.JOD * 1.41) / maxType) * 100)}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{t.count} item{t.count === 1 ? '' : 's'} · {t.bookings.size} booking{t.bookings.size === 1 ? '' : 's'}</p>
              </button>
            ))}
          </div>
        </Panel>
      )}

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-clip">
        <div className="p-3 flex flex-col md:flex-row md:flex-wrap md:items-center gap-2 border-b border-slate-100 bg-slate-50/50">
          <div className="relative w-full md:w-72">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search booking no., customer, plate" className={`${inputCls} pl-9`} />
          </div>
          <div className="grid grid-cols-2 md:flex gap-2">
            <select value={type} onChange={e => setType(e.target.value as TypeFilter)} aria-label="Type" className={`${selectCls} min-w-0`}>
              <option value="all">All types</option>
              {(Object.keys(TYPE_LABEL) as Exclude<TypeFilter, 'all'>[]).map(k => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
            </select>
            <select value={status} onChange={e => setStatus(e.target.value as StatusFilter)} aria-label="Payment" className={`${selectCls} min-w-0`}>
              <option value="all">Paid and outstanding</option>
              <option value="open">Outstanding only</option>
              <option value="settled">Settled only</option>
            </select>
            <select value={source} onChange={e => setSource(e.target.value)} aria-label="Source" className={`${selectCls} min-w-0 col-span-2 md:col-span-1`}>
              <option value="">All sources</option>
              {usedSources.map(id => <option key={id} value={id}>{sourceName(id)}</option>)}
            </select>
          </div>
          {filtersActive && <button onClick={() => { setType('all'); setStatus('all'); setSource(''); setQ(''); }} className="text-xs font-semibold text-slate-500 hover:text-slate-900 w-fit">Clear filters</button>}
          <span className="md:ml-auto text-xs text-slate-500 tabular-nums">{rows.length} booking{rows.length === 1 ? '' : 's'}</span>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={<ReceiptIcon />} title={withAddOns.length ? 'No bookings match' : 'No add-ons in this period'}
            hint={withAddOns.length ? 'Change the filters to see more bookings.' : 'Bookings appear here as soon as their price changes or a charge is raised on them.'} />
        ) : (
          <>
            <table className={`hidden lg:table ${table.wrap}`}>
              <thead><tr className={table.head}>
                <th className={table.th}>Booking</th>
                <th className={table.th}>Rental</th>
                <th className={table.th}>Vehicle</th>
                <th className={`${table.th} text-right`}>Original</th>
                <th className={table.th}>Add-ons</th>
                <th className={`${table.th} text-right`}>Price now</th>
                <th className={`${table.th} text-right`}>Charges</th>
                <th className={`${table.th} text-right`}>Outstanding</th>
                <th className={table.th}><span className="sr-only">Open</span></th>
              </tr></thead>
              <tbody className={table.body}>
                {rows.map(s => {
                  const r = s.reservation;
                  const kinds = Array.from(s.entries.reduce((m, e) => m.set(e.kind, (m.get(e.kind) || 0) + 1), new Map<AddOnKind, number>()));
                  const owed = s.outstanding.USD > 0 || s.outstanding.JOD > 0;
                  return (
                    <tr key={r.id} onClick={() => setOpen(s)} className={`${table.row} cursor-pointer`}>
                      <td className={table.td}>
                        <p className="font-mono font-semibold text-slate-900">{r.bookingId || '—'}</p>
                        <p className="text-slate-800 truncate max-w-[11rem]">{r.personName}</p>
                        <p className="text-[11px] text-slate-500 truncate max-w-[11rem]">{sourceName(r.source)}</p>
                      </td>
                      <td className={`${table.td} whitespace-nowrap`}>
                        <p className="text-slate-800">{fmtDate(r.startDate)}</p>
                        <p className="text-[11px] text-slate-500">
                          {s.original.days !== s.now.days ? <>{s.original.days} → <b className="text-slate-700">{s.now.days} days</b></> : `${s.now.days} day${s.now.days === 1 ? '' : 's'}`}
                        </p>
                      </td>
                      <td className={table.td}>
                        {s.original.carModel && s.original.carModel !== s.now.carModel
                          ? <><p className="text-[11px] text-slate-400 line-through truncate max-w-[10rem]">{s.original.carModel}</p><p className="text-slate-800 truncate max-w-[10rem]">{s.now.carModel}</p></>
                          : <p className="text-slate-800 truncate max-w-[10rem]">{s.now.carModel || '—'}</p>}
                      </td>
                      <td className={`${table.td} text-right tabular-nums text-slate-600`}>{usd(s.originalPrice)}</td>
                      <td className={table.td}><div className="flex flex-wrap gap-1 max-w-[16rem]">{kinds.map(([k, n]) => <KindChip key={k} kind={k} count={n} />)}</div></td>
                      <td className={`${table.td} text-right whitespace-nowrap`}>
                        <p className="font-semibold text-slate-900 tabular-nums">{usd(s.currentPrice)}</p>
                        {s.priceChange !== 0 && <p className={`text-[11px] font-semibold tabular-nums ${s.priceChange > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{usd(s.priceChange, true)}</p>}
                      </td>
                      <td className={`${table.td} text-right whitespace-nowrap tabular-nums text-slate-800`}>{both(s.charges)}</td>
                      <td className={`${table.td} text-right whitespace-nowrap tabular-nums ${owed ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{owed ? both(s.outstanding) : 'Settled'}</td>
                      <td className={`${table.td} text-right`}><ChevronRightIcon className="w-4 h-4 text-slate-400 inline" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <ul className="lg:hidden divide-y divide-slate-100">
              {rows.map(s => {
                const r = s.reservation;
                const kinds = Array.from(s.entries.reduce((m, e) => m.set(e.kind, (m.get(e.kind) || 0) + 1), new Map<AddOnKind, number>()));
                const owed = s.outstanding.USD > 0 || s.outstanding.JOD > 0;
                return (
                  <li key={r.id}>
                    <button onClick={() => setOpen(s)} className="w-full text-left px-4 py-3 active:bg-slate-50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-[12.5px] font-semibold text-slate-900">{r.bookingId}</p>
                          <p className="text-[15px] font-semibold text-slate-900 truncate">{r.personName}</p>
                          <p className="text-xs text-slate-500 truncate">{fmtDate(r.startDate)} · {s.now.carModel} · {sourceName(r.source)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] text-slate-400 line-through tabular-nums">{s.priceChange !== 0 ? usd(s.originalPrice) : ''}</p>
                          <p className="font-semibold text-slate-900 tabular-nums">{usd(s.currentPrice)}</p>
                          {owed && <p className="text-[11px] font-semibold text-rose-600 tabular-nums">{both(s.outstanding)} due</p>}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">{kinds.map(([k, n]) => <KindChip key={k} kind={k} count={n} />)}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {open && <Statement summary={open} sourceName={sourceName} company={company} onClose={() => setOpen(null)}
        onOpenBooking={onOpenBooking ? () => { openBooking(open.reservation); setOpen(null); } : undefined} />}
    </Page>
  );
};

/** One booking: the original reservation next to what it is now, and every change with its status. */
const Statement: React.FC<{ summary: AddOnSummary; sourceName: (id?: string) => string; company?: CompanyDetails; onClose: () => void; onOpenBooking?: () => void }> = ({ summary: s, sourceName, company, onClose, onOpenBooking }) => {
  const r = s.reservation;
  const compare: { label: string; was: string; now: string; changed: boolean }[] = [
    { label: 'Pick-up', was: fmtDate(r.startDate, true), now: fmtDate(r.startDate, true), changed: false },
    { label: 'Return', was: fmtDate(s.original.endDate, true), now: fmtDate(s.now.endDate, true), changed: (s.original.endDate || '').slice(0, 16) !== (s.now.endDate || '').slice(0, 16) },
    { label: 'Rental days', was: String(s.original.days || '—'), now: String(s.now.days || '—'), changed: s.original.days !== s.now.days },
    { label: 'Vehicle', was: s.original.carModel || '—', now: `${s.now.carModel || '—'}${s.now.licensePlate ? ` · ${s.now.licensePlate}` : ''}`, changed: (s.original.carModel || '') !== (s.now.carModel || '') },
    { label: 'Extras', was: s.original.extras.join(', ') || 'None', now: s.now.extras.join(', ') || 'None', changed: s.original.extras.join() !== s.now.extras.join() },
    { label: 'Rental price', was: usd(s.originalPrice), now: usd(s.currentPrice), changed: s.priceChange !== 0 },
  ];
  const statusLabel = r.status === ReservationStatus.CANCELLED ? 'Cancelled' : r.status === ReservationStatus.NO_SHOW ? 'No-show' : r.dropOffCompleted ? 'Closed' : r.voucherSubmitted ? 'On rent' : 'Reserved';
  const priceEntries = s.entries.filter(e => e.group === 'price');
  const chargeEntries = s.entries.filter(e => e.group === 'charge');

  const print = () => {
    const rowsHtml = (list: AddOn[]) => list.map(e => `<tr><td>${esc(fmtDate(e.at))}</td><td>${esc(KIND_LABEL[e.kind])}</td><td><b>${esc(e.title)}</b>${e.detail ? `<div class="m">${esc(e.detail)}</div>` : ''}</td><td>${esc(e.by || '')}${e.reference ? `<div class="m">${esc(e.reference)}</div>` : ''}</td><td>${esc(STATUS_LABEL[e.status])}</td><td class="r">${esc(money(e.amount, e.currency, true))}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Add-ons ${esc(r.bookingId)}</title><style>
      body{font:12px/1.45 Inter,Arial,sans-serif;color:#0f172a;margin:28px}h1{font-size:18px;margin:0}h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:22px 0 6px}
      .top{display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:10px}.m{color:#64748b;font-size:11px}
      table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #cbd5e1;padding:6px 6px}td{border-bottom:1px solid #e2e8f0;padding:6px;vertical-align:top}
      .r{text-align:right;white-space:nowrap}.chg{background:#fef9c3}.tot td{font-weight:700;border-top:2px solid #0f172a}</style></head><body>
      <div class="top"><div><h1>Reservation add-ons statement</h1><div class="m">${esc(company?.name || '')}${company?.address ? ` · ${esc(company.address)}` : ''}</div></div>
      <div style="text-align:right"><b>${esc(r.bookingId)}</b><div class="m">${esc(r.personName)} · ${esc(sourceName(r.source))}</div><div class="m">Printed ${esc(fmtDate(new Date().toISOString(), true))}</div></div></div>
      <h2>Original reservation and now</h2><table><tr><th></th><th>Original reservation</th><th>Now</th></tr>
      ${compare.map(c => `<tr class="${c.changed ? 'chg' : ''}"><td>${esc(c.label)}</td><td>${esc(c.was)}</td><td>${esc(c.now)}</td></tr>`).join('')}</table>
      ${priceEntries.length ? `<h2>Rental price changes</h2><table><tr><th>Date</th><th>Type</th><th>Description</th><th>By / ref.</th><th>Status</th><th class="r">Amount</th></tr>${rowsHtml(priceEntries)}</table>` : ''}
      ${chargeEntries.length ? `<h2>Charges</h2><table><tr><th>Date</th><th>Type</th><th>Description</th><th>By / ref.</th><th>Status</th><th class="r">Amount</th></tr>${rowsHtml(chargeEntries)}</table>` : ''}
      <h2>Summary</h2><table>
        <tr><td>Original rental price</td><td class="r">${esc(usd(s.originalPrice))}</td></tr>
        <tr><td>Rental price changes</td><td class="r">${esc(usd(s.priceChange, true))}</td></tr>
        <tr class="tot"><td>Rental price now</td><td class="r">${esc(usd(s.currentPrice))}</td></tr>
        <tr><td>Charges</td><td class="r">${esc(both(s.charges))}</td></tr>
        <tr><td>Outstanding</td><td class="r">${esc(both(s.outstanding))}</td></tr></table></body></html>`;
    if (!printHtml(html)) alert('Allow pop-ups for this site to print the statement.');
  };

  const EntryTable: React.FC<{ list: AddOn[] }> = ({ list }) => (
    <>
      <table className={`hidden md:table ${table.wrap}`}>
        <thead><tr className={table.head}>
          <th className={table.th}>Date</th><th className={table.th}>Type</th><th className={table.th}>Description</th>
          <th className={table.th}>By</th><th className={table.th}>Status</th><th className={`${table.th} text-right`}>Amount</th>
        </tr></thead>
        <tbody className={table.body}>
          {list.map(e => (
            <tr key={e.id}>
              <td className={`${table.td} whitespace-nowrap text-slate-600`}>{fmtDate(e.at)}</td>
              <td className={table.td}><KindChip kind={e.kind} /></td>
              <td className={table.td}>
                <p className="font-medium text-slate-900">{e.title}</p>
                {(e.detail || e.reference) && <p className="text-[11px] text-slate-500">{[e.detail, e.reference].filter(Boolean).join(' · ')}</p>}
                {e.source === 'register' && <p className="text-[11px] text-slate-400">From the {e.kind === 'ticket' ? 'Traffic Tickets' : 'Vehicle Damages'} register</p>}
              </td>
              <td className={`${table.td} text-slate-600 whitespace-nowrap`}>{e.by || '—'}</td>
              <td className={table.td}><Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge></td>
              <td className={`${table.td} text-right font-semibold tabular-nums whitespace-nowrap ${e.status === 'waived' ? 'text-slate-400 line-through' : e.amount < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{money(e.amount, e.currency, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="md:hidden divide-y divide-slate-100">
        {list.map(e => (
          <li key={e.id} className="py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><KindChip kind={e.kind} /><p className="mt-1 text-[13px] font-medium text-slate-900">{e.title}</p>
                <p className="text-[11px] text-slate-500">{[fmtDate(e.at), e.by, e.detail, e.reference].filter(Boolean).join(' · ')}</p></div>
              <div className="text-right shrink-0"><p className={`text-[13px] font-semibold tabular-nums ${e.status === 'waived' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{money(e.amount, e.currency, true)}</p>
                <Badge tone={STATUS_TONE[e.status]} className="mt-1">{STATUS_LABEL[e.status]}</Badge></div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <Dialog open onClose={onClose} size="xl"
      title={<span className="flex items-center gap-2 flex-wrap"><span className="font-mono">{r.bookingId}</span><span className="text-slate-300">·</span>{r.personName}<Badge tone="muted">{statusLabel}</Badge></span>}
      subtitle={`${sourceName(r.source)} · booked ${fmtDate(r.bookingDate || r.createdAt)}${r.createdBy ? ` by ${r.createdBy}` : ''}`}
      footer={<>
        <Button icon={<PdfIcon className="w-4 h-4" />} onClick={print}>Print statement</Button>
        {onOpenBooking && <Button icon={<DocumentReportIcon className="w-4 h-4" />} onClick={onOpenBooking}>Open agreement</Button>}
        <Button variant="primary" onClick={onClose}>Close</Button>
      </>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: 'Original price', value: usd(s.originalPrice), cls: 'text-slate-900' },
            { label: 'Price changes', value: usd(s.priceChange, true), cls: s.priceChange > 0 ? 'text-emerald-600' : s.priceChange < 0 ? 'text-rose-600' : 'text-slate-900' },
            { label: 'Charges', value: both(s.charges), cls: 'text-slate-900' },
            { label: 'Outstanding', value: both(s.outstanding), cls: s.outstanding.USD || s.outstanding.JOD ? 'text-rose-600' : 'text-emerald-600' },
          ].map(k => (
            <div key={k.label} className="rounded-lg border border-slate-200 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k.label}</p>
              <p className={`mt-0.5 text-base font-semibold tabular-nums ${k.cls}`}>{k.value}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Original reservation and now</p>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-[7rem_1fr_1fr] sm:grid-cols-[9rem_1fr_1fr] bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <span className="px-3 py-2" /><span className="px-3 py-2">Original reservation</span><span className="px-3 py-2">Now</span>
            </div>
            {compare.map(c => (
              <div key={c.label} className={`grid grid-cols-[7rem_1fr_1fr] sm:grid-cols-[9rem_1fr_1fr] text-[13px] border-b border-slate-100 last:border-0 ${c.changed ? 'bg-amber-50/60' : ''}`}>
                <span className="px-3 py-2 text-slate-500">{c.label}</span>
                <span className={`px-3 py-2 ${c.changed ? 'text-slate-500' : 'text-slate-800'}`}>{c.was}</span>
                <span className={`px-3 py-2 ${c.changed ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>{c.now}{c.changed && <span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-700">changed</span>}</span>
              </div>
            ))}
          </div>
        </div>

        {priceEntries.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Rental price changes <span className="normal-case font-normal tracking-normal">· {usd(s.originalPrice)} → {usd(s.currentPrice)}</span></p>
            <EntryTable list={priceEntries} />
          </div>
        )}
        {chargeEntries.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Charges on top of the rental price</p>
            <EntryTable list={chargeEntries} />
          </div>
        )}
      </div>
    </Dialog>
  );
};

export default ReservationAddOnsView;
