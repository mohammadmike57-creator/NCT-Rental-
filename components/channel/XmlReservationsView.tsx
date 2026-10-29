import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Aggregator } from '../../types';
import { fetchChannelBookings, ChannelBookingRow } from '../../firebase/api';
import { Panel, Badge, Button, StatGrid, EmptyState, Tabs, Plate, table, inputCls, selectCls } from '../ui/Crm';

const TONE: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'muted'> = {
  CONFIRMED: 'info', PENDING: 'warning', IN_PROGRESS: 'success', COMPLETED: 'muted', CANCELLED: 'danger', NO_SHOW: 'danger',
};
const LABEL: Record<string, string> = {
  CONFIRMED: 'Confirmed', PENDING: 'Pending', IN_PROGRESS: 'On rent', COMPLETED: 'Completed', CANCELLED: 'Cancelled', NO_SHOW: 'No-show',
};
const fmt = (s?: string) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const money = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Row = ChannelBookingRow & { channelId: string; channelName: string; channelCode?: string };
type StatusTab = 'all' | 'upcoming' | 'onrent' | 'completed' | 'cancelled';
const IN_TAB: Record<StatusTab, (s: string) => boolean> = {
  all: () => true,
  upcoming: s => s === 'CONFIRMED' || s === 'PENDING',
  onrent: s => s === 'IN_PROGRESS',
  completed: s => s === 'COMPLETED',
  cancelled: s => s === 'CANCELLED' || s === 'NO_SHOW',
};

/** Every booking made through the XML / API connections, from all brokers in one list. */
const XmlReservationsView: React.FC<{ aggregators: Aggregator[] }> = ({ aggregators }) => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [env, setEnv] = useState<'live' | 'sandbox'>('live');
  const [tab, setTab] = useState<StatusTab>('all');
  const [broker, setBroker] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setRows(null);
    const results = await Promise.all(aggregators.map(a => fetchChannelBookings(a.id)
      .then(list => ({ a, list, ok: true }))
      .catch(() => ({ a, list: [] as ChannelBookingRow[], ok: false }))));
    setFailed(results.filter(r => !r.ok).map(r => r.a.name));
    setRows(results.flatMap(({ a, list }) => list.map(b => ({ ...b, channelId: a.id, channelName: a.name, channelCode: a.channelCode })))
      .sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || '')));
  }, [aggregators]);
  useEffect(() => { void load(); }, [load]);

  const inEnv = (rows || []).filter(r => (env === 'sandbox') === !!r.sandbox);
  const live = (rows || []).filter(r => !r.sandbox);
  const byBroker = inEnv.filter(r => !broker || r.channelId === broker);
  const term = q.trim().toLowerCase();
  const shown = byBroker.filter(r => IN_TAB[tab](r.status)
    && (!term || [r.reservationNumber, r.brokerReference, r.customerName, r.vehicleGroup, r.channelName].some(v => (v || '').toLowerCase().includes(term))));

  const stats = useMemo(() => {
    const open = live.filter(r => r.status !== 'CANCELLED' && r.status !== 'NO_SHOW');
    const value: Record<string, number> = {};
    open.forEach(r => { value[r.currency || 'USD'] = (value[r.currency || 'USD'] || 0) + (r.total || 0); });
    const cancelled = live.length - open.length;
    const today = new Date().toISOString().slice(0, 10);
    return [
      { label: 'XML bookings', value: live.length, sub: `from ${new Set(live.map(r => r.channelId)).size} broker${new Set(live.map(r => r.channelId)).size === 1 ? '' : 's'}` },
      { label: 'Booked value', value: Object.entries(value).map(([c, v]) => `${v.toLocaleString('en-GB', { maximumFractionDigits: 0 })} ${c}`).join(' · ') || '—', sub: 'excluding cancelled' },
      { label: 'Upcoming pick-ups', value: live.filter(r => IN_TAB.upcoming(r.status) && r.pickupAt.slice(0, 10) >= today).length, sub: `${live.filter(r => r.status === 'IN_PROGRESS').length} on rent now`, tone: 'success' as const },
      { label: 'Cancelled / no-show', value: cancelled, sub: live.length ? `${Math.round((cancelled / live.length) * 100)}% of bookings` : 'none yet', tone: cancelled ? 'warning' as const : 'default' as const },
    ];
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const csv = () => {
    const head = ['Reservation', 'Broker reference', 'Broker', 'Customer', 'Group', 'Pick-up', 'Return', 'Total', 'Currency', 'Status', 'Booked at', 'Environment'];
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head, ...shown.map(r => [r.reservationNumber, r.brokerReference, r.channelName, r.customerName, r.vehicleGroup,
      r.pickupAt.slice(0, 16).replace('T', ' '), r.returnAt.slice(0, 16).replace('T', ' '), r.total, r.currency, LABEL[r.status] || r.status,
      (r.createdAt || '').slice(0, 16).replace('T', ' '), r.sandbox ? 'Sandbox' : 'Live'])].map(l => l.map(cell).join(','));
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `xml-reservations-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const count = (t: StatusTab) => byBroker.filter(r => IN_TAB[t](r.status)).length;

  return (
    <div className="space-y-4">
      <StatGrid items={stats} />
      <Panel title="XML reservations" subtitle="Bookings received from the brokers through OTA XML, SOAP, native XML or REST. Each one is also in Reservations under its pick-up month, with the broker as its source."
        actions={<div className="flex items-center gap-2">
          <Button size="sm" onClick={csv} disabled={!shown.length}>CSV</Button>
          <Button size="sm" onClick={() => void load()}>Refresh</Button>
        </div>}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
          <input className={`${inputCls} !w-72 max-w-full`} placeholder="Search reservation, broker ref, customer…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
          <select className={selectCls} value={broker} onChange={e => setBroker(e.target.value)} aria-label="Broker">
            <option value="">All brokers</option>
            {aggregators.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div className="ml-auto inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50" role="group" aria-label="Environment">
            {(['live', 'sandbox'] as const).map(k => (
              <button key={k} type="button" onClick={() => setEnv(k)} aria-pressed={env === k}
                className={`px-3 h-7 rounded-md text-xs font-semibold ${env === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {k === 'live' ? 'Live' : 'Sandbox (tests)'}
              </button>
            ))}
          </div>
        </div>
        <Tabs value={tab} onChange={k => setTab(k as StatusTab)} tabs={[
          { key: 'all', label: 'All', count: count('all') }, { key: 'upcoming', label: 'Upcoming', count: count('upcoming') },
          { key: 'onrent', label: 'On rent', count: count('onrent') }, { key: 'completed', label: 'Completed', count: count('completed') },
          { key: 'cancelled', label: 'Cancelled / no-show', count: count('cancelled') },
        ]} />
        {failed.length > 0 && <p className="px-4 py-2 text-xs text-rose-600 border-b border-slate-100">Could not load the bookings of {failed.join(', ')} from the server.</p>}
        {rows === null ? <p className="px-4 py-10 text-center text-[13px] text-slate-500">Loading…</p> : aggregators.length === 0 ? (
          <EmptyState title="No channels yet" hint="Add a broker channel first; its XML bookings appear here." />
        ) : shown.length === 0 ? (
          <EmptyState title={term || broker || tab !== 'all' ? 'No bookings match' : env === 'live' ? 'No XML bookings yet' : 'No sandbox bookings'}
            hint={term || broker || tab !== 'all' ? 'Change the search or filters.' : env === 'live' ? 'Bookings appear here as soon as a broker books through the API.' : 'Bookings made while a channel is in testing appear here. They are never added to Reservations.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className={`${table.wrap} min-w-[900px]`}>
              <thead className={table.head}><tr>{['Reservation', 'Broker', 'Customer', 'Group', 'Rental', 'Total', 'Status'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
              <tbody className={table.body}>
                {shown.map(r => (
                  <tr key={`${r.channelId}-${r.reservationNumber}`} className={table.row}>
                    <td className={`${table.td} whitespace-nowrap`}>
                      <p className="font-mono text-xs font-semibold text-slate-900">{r.reservationNumber}</p>
                      <p className="font-mono text-[11px] text-slate-500" title="Broker reference">{r.brokerReference || '—'}</p>
                    </td>
                    <td className={table.td}>
                      <span className="inline-flex items-center gap-1.5 text-slate-900">{r.channelName}{r.channelCode && <Plate value={r.channelCode} />}</span>
                    </td>
                    <td className={table.td}>
                      <p className="text-slate-900">{r.customerName || '—'}</p>
                      <p className="text-[11px] text-slate-400">Booked {fmt(r.createdAt)}</p>
                    </td>
                    <td className={`${table.td} font-mono text-xs`}>{r.vehicleGroup}</td>
                    <td className={`${table.td} whitespace-nowrap tabular-nums text-xs`}>
                      <p className="text-slate-800">{fmt(r.pickupAt)}</p>
                      <p className="text-slate-500">→ {fmt(r.returnAt)}</p>
                    </td>
                    <td className={`${table.td} text-right tabular-nums whitespace-nowrap`}>{money(r.total ?? 0)} {r.currency}</td>
                    <td className={table.td}><Badge tone={TONE[r.status] || 'muted'}>{LABEL[r.status] || r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
};

export default XmlReservationsView;
