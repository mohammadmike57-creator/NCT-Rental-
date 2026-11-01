import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Aggregator } from '../../types';
import { fetchChannelBookings, fetchChannelTrafficStats, fetchChannelWebhooks, ChannelBookingRow, ChannelTrafficStats, ChannelWebhookRow } from '../../firebase/api';
import { Panel, Badge, Button, StatGrid, EmptyState, Plate, table } from '../ui/Crm';
import { connectionStateOf } from './ConnectionProfileView';
import type { ChannelTab } from '../AggregatorSetupView';

type Row = {
  a: Aggregator;
  stats: ChannelTrafficStats | null;
  bookings: ChannelBookingRow[];
  failedHooks: ChannelWebhookRow[];
  ok: boolean;
};

export interface ChannelAlert { channelId: string; channel: string; tone: 'danger' | 'warning'; text: string; tab: ChannelTab }

const PERIODS: [number, string][] = [[24, '24 hours'], [24 * 7, '7 days'], [24 * 30, '30 days']];
const money = (v: Record<string, number>) => Object.entries(v).map(([c, n]) => `${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })} ${c}`).join(' · ') || '—';
const pct = (n: number) => `${(n * 100).toFixed(n > 0 && n < 0.1 ? 1 : 0)}%`;
/** Share of failed requests, 0–1 (the server's errorRate field is already a percentage). */
const failRate = (s: ChannelTrafficStats) => (s.calls ? s.errors / s.calls : 0);

/** Problems staff should act on: failed status updates to a broker, many errors, a live broker that stopped calling. */
export function channelAlerts(rows: Row[]): ChannelAlert[] {
  const out: ChannelAlert[] = [];
  rows.forEach(({ a, stats, failedHooks, ok }) => {
    if (!ok) return;
    if (failedHooks.length) out.push({ channelId: a.id, channel: a.name, tone: 'danger', tab: 'Booking API',
      text: `${failedHooks.length} status update${failedHooks.length === 1 ? '' : 's'} could not be delivered to ${a.name} (last: ${failedHooks[0].lastError || `HTTP ${failedHooks[0].lastHttpStatus ?? '?'}`}). Fix the webhook address or replay them.` });
    if (stats && stats.calls >= 20 && failRate(stats) > 0.1) out.push({ channelId: a.id, channel: a.name, tone: 'warning', tab: 'Traffic',
      text: `${pct(failRate(stats))} of ${a.name}'s requests failed${stats.errorCodes[0] ? `, mostly ${stats.errorCodes[0].code}` : ''}. Check the Traffic tab.` });
    if (stats && a.status === 'active' && stats.calls === 0) out.push({ channelId: a.id, channel: a.name, tone: 'warning', tab: 'Traffic',
      text: `${a.name} is live but sent no requests in this period. Check with the broker that the connection is running.` });
    if (stats && stats.p95Ms > 3000) out.push({ channelId: a.id, channel: a.name, tone: 'warning', tab: 'Traffic',
      text: `Slow answers to ${a.name}: 95% within ${(stats.p95Ms / 1000).toFixed(1)} s. Brokers usually expect under 3 s.` });
  });
  return out;
}

/** Every broker at a glance: requests, bookings, conversion, revenue, errors, speed and alerts. */
const ChannelDashboardView: React.FC<{ aggregators: Aggregator[]; onOpenChannel: (id: string, tab: ChannelTab) => void }> = ({ aggregators, onOpenChannel }) => {
  const [hours, setHours] = useState(24 * 7);
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const since = Date.now() - hours * 3600000;
    setRows(await Promise.all(aggregators.map(async a => {
      try {
        const [stats, bookings, hooks] = await Promise.all([
          fetchChannelTrafficStats(a.id, hours).catch(() => null),
          fetchChannelBookings(a.id).catch(() => [] as ChannelBookingRow[]),
          fetchChannelWebhooks(a.id).catch(() => ({ deliveries: [] as ChannelWebhookRow[] })),
        ]);
        return {
          a, stats: stats && typeof stats.calls === 'number' ? stats : null,
          bookings: (Array.isArray(bookings) ? bookings : []).filter(b => !b.sandbox && new Date(b.createdAt || 0).getTime() >= since),
          failedHooks: (hooks?.deliveries || []).filter(d => d.status === 'FAILED'),
          ok: true,
        };
      } catch {
        return { a, stats: null, bookings: [], failedHooks: [], ok: false };
      }
    })));
  }, [aggregators, hours]);
  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const t = { calls: 0, errors: 0, searches: 0, bookings: 0, cancelled: 0, value: {} as Record<string, number>, slowest: 0 };
    (rows || []).forEach(r => {
      if (r.stats) { t.calls += r.stats.calls; t.errors += r.stats.errors; t.searches += r.stats.searches; t.slowest = Math.max(t.slowest, r.stats.p95Ms); }
      r.bookings.forEach(b => {
        t.bookings++;
        if (b.status === 'CANCELLED' || b.status === 'NO_SHOW') t.cancelled++;
        else t.value[b.currency || 'USD'] = (t.value[b.currency || 'USD'] || 0) + (b.total || 0);
      });
    });
    return t;
  }, [rows]);
  const alerts = useMemo(() => channelAlerts(rows || []), [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white" role="group" aria-label="Period">
          {PERIODS.map(([h, l]) => (
            <button key={h} type="button" onClick={() => setHours(h)} aria-pressed={hours === h}
              className={`px-3 h-7 rounded-md text-xs font-semibold ${hours === h ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>{l}</button>
          ))}
        </div>
        <Button size="sm" onClick={() => void load()}>Refresh</Button>
        <span className="text-xs text-slate-500 ml-auto">Live bookings only; sandbox tests are left out.</span>
      </div>

      <StatGrid items={[
        { label: 'Requests', value: rows ? totals.calls.toLocaleString() : '…', sub: `${totals.searches.toLocaleString()} searches` },
        { label: 'Bookings', value: rows ? totals.bookings : '…', sub: totals.searches ? `${((totals.bookings / totals.searches) * 100).toFixed(2)}% of searches` : 'no searches', tone: totals.bookings ? 'success' : 'default' },
        { label: 'Booked value', value: rows ? money(totals.value) : '…', sub: `${totals.cancelled} cancelled / no-show` },
        { label: 'Errors', value: rows ? totals.errors.toLocaleString() : '…', sub: totals.calls ? `${pct(totals.errors / totals.calls)} of requests` : '—', tone: totals.calls && totals.errors / totals.calls > 0.05 ? 'warning' : 'default' },
        { label: 'Alerts', value: rows ? alerts.length : '…', sub: alerts.length ? 'need attention' : 'all clear', tone: alerts.length ? 'danger' : 'success' },
      ]} />

      {alerts.length > 0 && (
        <Panel title="Alerts" subtitle="Problems with a broker connection to look at now.">
          <ul className="divide-y divide-slate-100">
            {alerts.map((al, i) => (
              <li key={i} className="px-4 py-2.5 flex items-start gap-3">
                <Badge tone={al.tone}>{al.tone === 'danger' ? 'Action' : 'Check'}</Badge>
                <p className="text-[13px] text-slate-700 flex-1 min-w-0">{al.text}</p>
                <Button size="sm" onClick={() => onOpenChannel(al.channelId, al.tab)}>Open {al.tab}</Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Brokers" subtitle={`Last ${PERIODS.find(p => p[0] === hours)?.[1]}`}>
        {aggregators.length === 0 ? <EmptyState title="No brokers yet" hint="Add a channel to start." /> : rows === null ? (
          <p className="px-4 py-10 text-center text-[13px] text-slate-500">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={`${table.wrap} min-w-[980px]`}>
              <thead className={table.head}><tr>
                {['Broker', 'Status', 'Requests', 'Searches', 'Bookings', 'Conversion', 'Booked value', 'Errors', 'Speed (avg / 95%)', 'Updates'].map(h => <th key={h} className={`${table.th} ${h === 'Broker' || h === 'Status' ? '' : 'text-right'}`}>{h}</th>)}
              </tr></thead>
              <tbody className={table.body}>
                {rows.map(({ a, stats, bookings, failedHooks }) => {
                  const live = bookings.filter(b => b.status !== 'CANCELLED' && b.status !== 'NO_SHOW');
                  const value: Record<string, number> = {};
                  live.forEach(b => { value[b.currency || 'USD'] = (value[b.currency || 'USD'] || 0) + (b.total || 0); });
                  const cs = connectionStateOf(a);
                  return (
                    <tr key={a.id} className={`${table.row} cursor-pointer`} onClick={() => onOpenChannel(a.id, 'Overview')}>
                      <td className={table.td}><span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">{a.name}<Plate value={a.channelCode || a.id} /></span></td>
                      <td className={table.td}>
                        <Badge tone={a.status === 'active' ? 'success' : a.status === 'paused' ? 'muted' : 'warning'}>{a.status === 'active' ? 'Live' : a.status === 'paused' ? 'Paused' : 'Testing'}</Badge>
                        <p className="text-[11px] text-slate-400 mt-0.5">{cs.label}</p>
                      </td>
                      <td className={`${table.td} text-right tabular-nums`}>{stats ? stats.calls.toLocaleString() : '—'}</td>
                      <td className={`${table.td} text-right tabular-nums`}>{stats ? stats.searches.toLocaleString() : '—'}</td>
                      <td className={`${table.td} text-right tabular-nums font-semibold`}>{bookings.length}</td>
                      <td className={`${table.td} text-right tabular-nums`}>{stats?.searches ? `${((bookings.length / stats.searches) * 100).toFixed(2)}%` : '—'}</td>
                      <td className={`${table.td} text-right tabular-nums whitespace-nowrap`}>{money(value)}</td>
                      <td className={`${table.td} text-right tabular-nums ${stats && failRate(stats) > 0.1 ? 'text-rose-600 font-semibold' : ''}`}>{stats ? `${stats.errors} (${pct(failRate(stats))})` : '—'}</td>
                      <td className={`${table.td} text-right tabular-nums whitespace-nowrap ${stats && stats.p95Ms > 3000 ? 'text-amber-600' : ''}`}>{stats && stats.calls ? `${stats.avgMs} / ${stats.p95Ms} ms` : '—'}</td>
                      <td className={`${table.td} text-right`}>{failedHooks.length ? <Badge tone="danger">{failedHooks.length} failed</Badge> : <span className="text-xs text-slate-400">OK</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
};

export default ChannelDashboardView;
