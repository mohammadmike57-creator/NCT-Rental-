import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Aggregator } from '../../types';
import { fetchChannelBookings, ChannelBookingRow } from '../../firebase/api';
import { Panel, Badge, Button, StatGrid, EmptyState, Tabs, table } from '../ui/Crm';

const TONE: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'muted'> = {
  CONFIRMED: 'info', PENDING: 'warning', IN_PROGRESS: 'success', COMPLETED: 'muted', CANCELLED: 'danger', NO_SHOW: 'danger',
};
const LABEL: Record<string, string> = {
  CONFIRMED: 'Confirmed', PENDING: 'Pending', IN_PROGRESS: 'On rent', COMPLETED: 'Completed', CANCELLED: 'Cancelled', NO_SHOW: 'No-show',
};
const fmt = (s?: string) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/** Every booking this broker made through the API, with both references. */
const ChannelBookingsView: React.FC<{ aggregator: Aggregator }> = ({ aggregator }) => {
  const [rows, setRows] = useState<ChannelBookingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'live' | 'sandbox'>('live');
  const load = useCallback(() => {
    setError(null);
    fetchChannelBookings(aggregator.id).then(setRows).catch(() => { setRows([]); setError('Could not load bookings from the server.'); });
  }, [aggregator.id]);
  useEffect(() => { load(); }, [load]);

  const live = (rows || []).filter(r => !r.sandbox);
  const sandbox = (rows || []).filter(r => r.sandbox);
  const shown = view === 'live' ? live : sandbox;
  const stats = useMemo(() => {
    const revenue = live.filter(r => r.status !== 'CANCELLED').reduce((s, r) => s + (r.total || 0), 0);
    const cancelled = live.filter(r => r.status === 'CANCELLED').length;
    return [
      { label: 'Bookings', value: live.length, sub: 'through the API' },
      { label: 'Booked value', value: `${revenue.toLocaleString('en-GB', { maximumFractionDigits: 0 })} ${aggregator.currency || 'USD'}`, sub: 'excluding cancelled' },
      { label: 'Cancellation rate', value: live.length ? `${Math.round((cancelled / live.length) * 100)}%` : '—', sub: `${cancelled} cancelled`, tone: cancelled ? 'warning' as const : 'default' as const },
      { label: 'Sandbox bookings', value: sandbox.length, sub: 'tests, not real', tone: 'muted' as const },
    ];
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <StatGrid items={stats} />
      <Panel title="Broker bookings" subtitle="Each one is also in Reservations under its pick-up month (search by the broker reference)."
        actions={<Button size="sm" onClick={load}>Refresh</Button>}>
        <Tabs value={view} onChange={k => setView(k as typeof view)} tabs={[{ key: 'live', label: 'Live', count: live.length }, { key: 'sandbox', label: 'Sandbox', count: sandbox.length }]} />
        {error && <p className="px-4 py-3 text-xs text-rose-600">{error}</p>}
        {rows === null ? <p className="px-4 py-10 text-center text-[13px] text-slate-500">Loading…</p> : shown.length === 0 ? (
          <EmptyState title={view === 'live' ? 'No bookings yet' : 'No sandbox bookings'} hint={view === 'live' ? 'Bookings appear here as soon as the broker books through the API.' : 'Certification runs and bookings made while testing appear here.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className={`${table.wrap} min-w-[760px]`}>
              <thead className={table.head}><tr>{['Reservation', 'Customer', 'Group', 'Rental', 'Total', 'Status'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
              <tbody className={table.body}>
                {shown.map(r => (
                  <tr key={r.reservationNumber} className={table.row}>
                    <td className={`${table.td} whitespace-nowrap`}>
                      <p className="font-mono text-xs font-semibold text-slate-900">{r.reservationNumber}</p>
                      <p className="font-mono text-[11px] text-slate-500">{r.brokerReference || '—'}</p>
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
                    <td className={`${table.td} text-right tabular-nums whitespace-nowrap`}>{(r.total ?? 0).toFixed(2)} {r.currency}</td>
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

export default ChannelBookingsView;
