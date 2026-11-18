import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Aggregator, Fleet, StopSale } from '../../types';
import { fetchChannelBookings, fetchChannelTrafficStats, fetchChannelWebhooks, ChannelBookingRow, ChannelTrafficStats, ChannelWebhookRow } from '../../services/api';
import { Badge, Plate, table } from '../ui/Crm';
import { CountUp, SlidingPill, GrowBar, Ring, useInView, useSpotlight } from './otaMotion';
import { ArrowPathIcon, CalendarCheckIcon, CurrencyDollarIcon, ShieldCheckIcon, SearchIcon, CheckCircleIcon, AlertIcon, ChevronRightIcon, StopIcon, ServerIcon } from '../icons';
import { connectionStateOf } from './ConnectionProfileView';
import { validateChannel, hasUnpublishedChanges, todayIso, channelStatus } from '../../services/channelManager';
import type { ChannelTab } from '../AggregatorSetupView';

type Row = {
  a: Aggregator;
  stats: ChannelTrafficStats | null;
  /** Live bookings of this period. */
  bookings: ChannelBookingRow[];
  /** Live bookings of the period before, for "up / down" next to the figures. */
  before: ChannelBookingRow[];
  failedHooks: ChannelWebhookRow[];
  ok: boolean;
};

export interface ChannelAlert { channelId: string; channel: string; tone: 'danger' | 'warning'; text: string; tab: ChannelTab }

const PERIODS: [number, string][] = [[24, 'Today'], [24 * 7, '7 days'], [24 * 30, '30 days']];
const PERIOD_TEXT: Record<number, string> = { 24: 'the last 24 hours', [24 * 7]: 'the last 7 days', [24 * 30]: 'the last 30 days' };
const BAR = ['bg-indigo-500', 'bg-sky-400', 'bg-amber-400', 'bg-violet-400', 'bg-rose-400', 'bg-emerald-400', 'bg-orange-400', 'bg-fuchsia-400'];
const AVATAR = ['bg-indigo-600', 'bg-sky-600', 'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-violet-600', 'bg-teal-600', 'bg-fuchsia-600'];
const pct = (n: number) => `${(n * 100).toFixed(n > 0 && n < 0.1 ? 1 : 0)}%`;
/** Share of failed requests, 0–1 (the server's errorRate field is already a percentage). */
const failRate = (s: ChannelTrafficStats) => (s.calls ? s.errors / s.calls : 0);
const isLive = (b: ChannelBookingRow) => b.status !== 'CANCELLED' && b.status !== 'NO_SHOW';
/** Dinar is pegged to the dollar (same rate the broker searches use); other currencies are listed apart. */
const USD_PER: Record<string, number> = { USD: 1, JOD: 1.4104 };
const usd = (n: number) => `${Math.round(n).toLocaleString('en-US')} USD`;

/** Problems staff should act on: failed status updates to a broker, many errors, a live broker that stopped calling. */
export function channelAlerts(rows: Pick<Row, 'a' | 'stats' | 'failedHooks' | 'ok'>[]): ChannelAlert[] {
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

/** A smooth line through the points (Catmull-Rom as cubic curves), so charts do not look jagged. */
const smooth = (pts: [number, number][]) => {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
};

/** Small trend line inside a figure card. */
const Spark: React.FC<{ values: number[]; color: string; id: string }> = ({ values, color, id }) => {
  const W = 120, H = 34;
  if (values.length < 2) return <span className="block h-[34px]" />;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - (v / max) * (H - 8)] as [number, number]);
  const line = smooth(pts);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[34px] ota-reveal" preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id={`sp-${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.22" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#sp-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

/** "▲ 12%" against the period before; nothing when there is nothing to compare. */
const Delta: React.FC<{ now: number; before: number }> = ({ now, before }) => {
  if (!before && !now) return <span className="text-[11px] text-slate-400 whitespace-nowrap">no change</span>;
  if (!before) return <span className="inline-flex items-center h-5 px-1.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold">New</span>;
  const d = (now - before) / before;
  const up = d >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full text-[11px] font-semibold tabular-nums whitespace-nowrap ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
      title={`Period before: ${Math.round(before).toLocaleString()}`}>
      {up ? '▲' : '▼'} {Math.abs(Math.round(d * 100))}%
    </span>
  );
};

/** Requests and errors over the period, every broker together, with a readout on hover. */
const ActivityChart: React.FC<{ series: { at: string; calls: number; errors: number }[]; hours: number }> = ({ series, hours }) => {
  const [hover, setHover] = useState<number | null>(null);
  const W = 960, H = 230, L = 40, R = 12, T = 14, B = 28;
  if (series.length < 2) return (
    <div className="h-[230px] flex flex-col items-center justify-center text-center gap-2">
      <span className="w-11 h-11 rounded-full bg-slate-100 text-slate-400 inline-flex items-center justify-center"><ArrowPathIcon className="w-5 h-5" /></span>
      <p className="text-[13px] font-medium text-slate-700">No broker activity yet</p>
      <p className="text-[12px] text-slate-500 max-w-xs">The chart fills in as soon as a broker starts searching your cars.</p>
    </div>
  );
  const max = Math.max(1, ...series.map(p => p.calls));
  const nice = (() => { const m = Math.pow(10, Math.floor(Math.log10(max))); const f = max / m; return (f <= 2 ? 2 : f <= 5 ? 5 : 10) * m; })();
  const x = (i: number) => L + (i / (series.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / nice) * (H - T - B);
  const pts = (k: 'calls' | 'errors') => series.map((p, i) => [x(i), y(p[k])] as [number, number]);
  const calls = smooth(pts('calls')), errs = smooth(pts('errors'));
  const label = (iso: string) => {
    const d = new Date(iso);
    return hours <= 24 ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };
  const ticks = Array.from(new Set([0, Math.round((series.length - 1) / 4), Math.round((series.length - 1) / 2), Math.round(((series.length - 1) * 3) / 4), series.length - 1]));
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(series.length - 1, Math.round(((px - L) / (W - L - R)) * (series.length - 1)))));
  };
  const h = hover != null ? series[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[230px] ota-reveal" preserveAspectRatio="none" role="img" aria-label="Requests and errors over time">
        <defs>
          <linearGradient id="ota-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" /><stop offset="100%" stopColor="#6366f1" stopOpacity="0" /></linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(nice * f)} y2={y(nice * f)} stroke="#eef2f7" strokeWidth={1} strokeDasharray={f ? '4 4' : undefined} vectorEffect="non-scaling-stroke" />
            <text x={L - 8} y={y(nice * f) + 4} textAnchor="end" fontSize={11} fill="#94a3b8">{(nice * f).toLocaleString()}</text>
          </g>
        ))}
        {ticks.map(i => <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'} fontSize={11} fill="#94a3b8">{label(series[i].at)}</text>)}
        <path d={`${calls} L${x(series.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`} fill="url(#ota-area)" />
        <path d={calls} fill="none" stroke="#4f46e5" strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={errs} fill="none" stroke="#f43f5e" strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#c7d2fe" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
        <rect x={L} y={0} width={W - L - R} height={H} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {h && (
        <>
          <span className="pointer-events-none absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full bg-white ring-[3px] ring-indigo-600 shadow transition-[left,top] duration-150"
            style={{ left: `${(x(hover!) / W) * 100}%`, top: (y(h.calls) / H) * 230 }} />
          <div className="pointer-events-none absolute top-1 rounded-xl border border-slate-200 bg-white/95 backdrop-blur shadow-lg px-3 py-2 text-[12px] transition-[left] duration-150"
            style={{ left: `calc(${(x(hover!) / W) * 100}% ${hover! > series.length / 2 ? '- 170px' : '+ 14px'})` }}>
            <p className="text-slate-500 font-medium">{new Date(h.at).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            <p className="mt-1 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-600" /><b className="tabular-nums text-slate-900">{h.calls.toLocaleString()}</b><span className="text-slate-500">requests</span></p>
            <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-rose-500" /><b className="tabular-nums text-slate-900">{h.errors.toLocaleString()}</b><span className="text-slate-500">errors</span></p>
          </div>
        </>
      )}
    </div>
  );
};

/**
 * A dashboard card: rises in out of a soft blur when it scrolls into view (staggered on the first screen,
 * quick further down) and carries the mouse-following light.
 */
const Card: React.FC<{ children: React.ReactNode; className?: string; delay?: number }> = ({ children, className = '', delay = 0 }) => {
  const [ref, seen] = useInView<HTMLElement>();
  const born = useRef(Date.now());
  const [late] = useState(() => ({ v: false }));
  if (seen && !late.v && Date.now() - born.current > 900) late.v = true;
  return (
    <section ref={ref} className={`ota-spot rounded-2xl bg-white border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-20px_rgba(15,23,42,0.25)] ${seen ? 'ota-pop' : 'ota-pending'} ${className}`}
      style={{ animationDelay: `${late.v ? delay % 160 : delay}ms` }}>{children}</section>
  );
};
const CardHead: React.FC<{ title: string; hint?: string; right?: React.ReactNode }> = ({ title, hint, right }) => (
  <div className="px-5 pt-4 pb-3 flex items-start gap-3">
    <div className="min-w-0 flex-1">
      <h3 className="text-[14.5px] font-semibold text-slate-900 tracking-[-0.01em]">{title}</h3>
      {hint && <p className="text-[12px] text-slate-500 mt-0.5">{hint}</p>}
    </div>
    {right}
  </div>
);
const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => <span className={`block rounded-lg ota-shimmer ${className}`} />;

const AREA_TAB: Record<string, ChannelTab> = { Connection: 'Connection', Rates: 'Rates', Fleet: 'Rates', Extras: 'Extras', Terms: 'Terms & Conditions' };
const STATUS_DOT: Record<string, { dot: string; label: string }> = {
  CONFIRMED: { dot: 'bg-emerald-500', label: 'Confirmed' }, MODIFIED: { dot: 'bg-sky-500', label: 'Changed' },
  CANCELLED: { dot: 'bg-rose-500', label: 'Cancelled' }, NO_SHOW: { dot: 'bg-amber-500', label: 'No-show' },
  COMPLETED: { dot: 'bg-slate-400', label: 'Completed' }, PENDING: { dot: 'bg-violet-500', label: 'Pending' },
};
const avatarBg = (a: Aggregator) => { const key = a.channelCode || a.name; let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVATAR[h % AVATAR.length]; };
const initials = (a: Aggregator) => (a.channelCode || a.name).replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const greeting = () => { const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Amman' })); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

/**
 * The OTA XML home: a plain summary first, then what needs doing, the figures with their trend,
 * every broker as a card, the latest bookings and the full numbers for those who want them.
 */
const ChannelDashboardView: React.FC<{
  aggregators: Aggregator[];
  onOpenChannel: (id: string, tab: ChannelTab) => void;
  fleet?: Fleet;
  stopSales?: StopSale[];
  userName?: string;
  onOpenModule?: (m: 'stopsale' | 'reservations' | 'keys') => void;
}> = ({ aggregators, onOpenChannel, fleet, stopSales = [], userName, onOpenModule }) => {
  const [hours, setHours] = useState(24 * 7);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const spot = useSpotlight<HTMLDivElement>();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRows(null);
    setBusy(true);
    const now = Date.now(), since = now - hours * 3600000, prev = since - hours * 3600000;
    const out = await Promise.all(aggregators.map(async a => {
      try {
        const [stats, bookings, hooks] = await Promise.all([
          fetchChannelTrafficStats(a.id, hours).catch(() => null),
          fetchChannelBookings(a.id).catch(() => [] as ChannelBookingRow[]),
          fetchChannelWebhooks(a.id).catch(() => ({ deliveries: [] as ChannelWebhookRow[] })),
        ]);
        const real = (Array.isArray(bookings) ? bookings : []).filter(b => !b.sandbox);
        const at = (b: ChannelBookingRow) => new Date(b.createdAt || 0).getTime();
        return {
          a, stats: stats && typeof stats.calls === 'number' ? stats : null,
          bookings: real.filter(b => at(b) >= since), before: real.filter(b => at(b) >= prev && at(b) < since),
          failedHooks: (hooks?.deliveries || []).filter(d => d.status === 'FAILED'), ok: true,
        };
      } catch {
        return { a, stats: null, bookings: [], before: [], failedHooks: [], ok: false };
      }
    }));
    setRows(out); setLoadedAt(new Date()); setBusy(false);
  }, [aggregators, hours]);
  useEffect(() => { void load(); }, [load]);

  const t = useMemo(() => {
    const all = rows || [];
    const bookings = all.flatMap(r => r.bookings), before = all.flatMap(r => r.before);
    const calls = all.reduce((n, r) => n + (r.stats?.calls || 0), 0);
    const errors = all.reduce((n, r) => n + (r.stats?.errors || 0), 0);
    const searches = all.reduce((n, r) => n + (r.stats?.searches || 0), 0);
    const val = valueOf(bookings), valBefore = valueOf(before);
    // Buckets for the small trend lines: hours for "Today", days otherwise.
    const n = hours <= 24 ? 24 : hours / 24, size = hours <= 24 ? 3600000 : 86400000, start = Date.now() - n * size;
    const bucket = (list: ChannelBookingRow[], f: (b: ChannelBookingRow) => number) => {
      const out = new Array(n).fill(0);
      list.forEach(b => { const i = Math.floor((new Date(b.createdAt).getTime() - start) / size); if (i >= 0 && i < n) out[i] += f(b); });
      return out;
    };
    const traffic = new Map<string, { at: string; calls: number; errors: number }>();
    all.forEach(r => (r.stats?.series || []).forEach(p => {
      const key = (p.at || '').slice(0, 13);
      const e = traffic.get(key) || { at: p.at, calls: 0, errors: 0 };
      e.calls += p.calls; e.errors += p.errors; traffic.set(key, e);
    }));
    const series = Array.from(traffic.values()).sort((a, b) => a.at.localeCompare(b.at));
    return {
      bookings, before, calls, errors, searches, val, valBefore, series,
      cancelled: bookings.filter(b => !isLive(b)).length,
      sparkBookings: bucket(bookings, () => 1),
      sparkValue: bucket(bookings.filter(isLive), b => (b.total || 0) * (USD_PER[(b.currency || 'USD').toUpperCase()] || 0)),
      sparkCalls: series.map(p => p.calls), sparkOk: series.map(p => (p.calls ? (p.calls - p.errors) / p.calls : 1)),
    };
  }, [rows, hours]);

  const alerts = useMemo(() => channelAlerts(rows || []), [rows]);
  /** Everything that needs a person, most urgent first, each with the one button that fixes it. */
  const todo = useMemo(() => {
    const out: { key: string; tone: 'danger' | 'warning' | 'info'; title: string; text: string; action: string; run: () => void }[] = [];
    alerts.forEach((al, i) => out.push({ key: `al${i}`, tone: al.tone, title: al.channel, text: al.text, action: `Open ${al.tab}`, run: () => onOpenChannel(al.channelId, al.tab) }));
    if (fleet) aggregators.forEach(a => {
      const v = validateChannel(a, fleet);
      const first = v.issues.find(i => i.level === 'error');
      if (first) out.push({ key: `v${a.id}`, tone: 'danger', title: a.name, text: v.errors > 1 ? `${first.message} (+${v.errors - 1} more to fix)` : first.message, action: 'Fix it', run: () => onOpenChannel(a.id, AREA_TAB[first.area] || 'Overview') });
    });
    aggregators.filter(hasUnpublishedChanges).forEach(a => out.push({ key: `u${a.id}`, tone: 'warning', title: a.name, text: 'Rate changes are saved but not published, so the broker still gets the old rates.', action: 'Publish rates', run: () => onOpenChannel(a.id, 'Rates') }));
    const today = todayIso();
    const stops = stopSales.filter(s => s.startDate <= today && today <= s.endDate).length;
    if (stops) out.push({ key: 'stops', tone: 'info', title: 'Stop sales', text: `${stops} stop sale${stops === 1 ? ' is' : 's are'} closing cars to brokers today.`, action: 'Review', run: () => onOpenModule?.('stopsale') });
    const rank = { danger: 0, warning: 1, info: 2 } as const;
    return out.sort((x, y) => rank[x.tone] - rank[y.tone]);
  }, [alerts, aggregators, fleet, stopSales, onOpenChannel, onOpenModule]);

  const latest = useMemo(() => (rows || []).flatMap(r => r.bookings.map(b => ({ b, a: r.a })))
    .sort((x, y) => (y.b.createdAt || '').localeCompare(x.b.createdAt || '')).slice(0, 7), [rows]);
  const perBroker = (rows || []).map(r => ({ r, value: valueOf(r.bookings).v }));
  const maxBookings = Math.max(1, ...perBroker.map(p => p.r.bookings.length));
  const allValue = perBroker.reduce((n, p) => n + p.value, 0);
  const health = t.calls ? (t.calls - t.errors) / t.calls : 1;
  const urgent = todo.filter(x => x.tone !== 'info').length;
  const firstName = (userName || '').trim().split(/\s+/)[0];
  const otherMoney = Object.entries(t.val.other).map(([c, v]) => `+ ${Math.round(v).toLocaleString('en-US')} ${c}`).join(' · ');

  const kpis = [
    { key: 'b', label: 'Bookings', value: String(t.bookings.length), icon: CalendarCheckIcon, pastel: 'bg-emerald-100 text-emerald-600', color: '#10b981', spark: t.sparkBookings,
      foot: <><Delta now={t.bookings.length} before={t.before.length} /><span className="text-[11px] text-slate-400 truncate">{t.cancelled} cancelled / no-show</span></> },
    { key: 'v', label: 'Booked value', value: usd(t.val.v), icon: CurrencyDollarIcon, pastel: 'bg-orange-100 text-orange-600', color: '#f97316', spark: t.sparkValue,
      foot: <><Delta now={t.val.v} before={t.valBefore.v} /><span className="text-[11px] text-slate-400 truncate">{otherMoney || 'JOD counted at the fixed rate'}</span></> },
    { key: 's', label: 'Searches', value: t.searches.toLocaleString('en-US'), icon: SearchIcon, pastel: 'bg-sky-100 text-sky-600', color: '#0ea5e9', spark: t.sparkCalls,
      foot: <span className="text-[11px] text-slate-500 truncate"><b className="text-slate-700 tabular-nums">{t.searches ? `${((t.bookings.length / t.searches) * 100).toFixed(2)}%` : '—'}</b> become a booking</span> },
    { key: 'h', label: 'Connection health', value: t.calls ? pct(health) : 'No calls', icon: ShieldCheckIcon, pastel: health >= 0.95 ? 'bg-violet-100 text-violet-600' : 'bg-rose-100 text-rose-600', color: '#8b5cf6', spark: t.sparkOk,
      foot: <span className="text-[11px] text-slate-500 truncate">{t.calls ? <><b className="text-slate-700 tabular-nums">{t.calls.toLocaleString('en-US')}</b> requests · {t.errors.toLocaleString('en-US')} failed</> : 'no requests in this period'}</span> },
  ];

  return (
    <div ref={spot} className="space-y-4">
      {/* 1. Plain summary */}
      <Card className="relative overflow-hidden">
        <span aria-hidden className="absolute inset-0 -z-[1] overflow-hidden rounded-2xl">
          <span className="ota-aurora absolute -right-24 -top-28 w-[420px] h-[300px] rounded-full bg-indigo-300/25 blur-3xl" />
          <span className="ota-aurora ota-aurora-2 absolute right-48 -bottom-32 w-[320px] h-[220px] rounded-full bg-sky-300/20 blur-3xl" />
          <span className="ota-aurora ota-aurora-3 absolute -left-20 -bottom-24 w-[260px] h-[200px] rounded-full bg-violet-300/15 blur-3xl" />
        </span>
        <div className="relative px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-slate-500">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Amman' })}</p>
            <h2 className="mt-0.5 text-[20px] sm:text-[22px] font-semibold text-slate-900 tracking-[-0.015em]">{greeting()}{firstName ? `, ${firstName}` : ''}</h2>
            <p className="mt-1 text-[13.5px] text-slate-600">
              {rows === null ? 'Checking every broker…' : <>
                <b className="text-slate-900">{t.bookings.length} booking{t.bookings.length === 1 ? '' : 's'}</b> worth <b className="text-slate-900">{usd(t.val.v)}</b> in {PERIOD_TEXT[hours]} from {aggregators.length} broker{aggregators.length === 1 ? '' : 's'}.{' '}
                {urgent ? <span className="text-rose-600 font-medium">{urgent} thing{urgent === 1 ? ' needs' : 's need'} you below.</span> : <span className="text-emerald-600 font-medium">Everything is running.</span>}
              </>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative inline-flex rounded-xl bg-slate-100/90 p-1" role="group" aria-label="Period">
              <SlidingPill active={String(hours)} className="rounded-lg bg-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_4px_10px_-6px_rgba(15,23,42,0.25)]" />
              {PERIODS.map(([h, l]) => (
                <button key={h} data-pill={String(h)} type="button" onClick={() => setHours(h)} aria-pressed={hours === h}
                  className={`relative z-[1] px-3.5 h-8 rounded-lg text-[12.5px] font-semibold transition-colors duration-300 ${hours === h ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>{l}</button>
              ))}
            </div>
            <button type="button" onClick={() => void load(true)} disabled={busy} aria-label="Refresh"
              className="h-10 pl-3 pr-3.5 rounded-xl bg-white ring-1 ring-inset ring-slate-200 hover:bg-slate-50 text-[12.5px] font-semibold text-slate-700 inline-flex items-center gap-2 disabled:opacity-70">
              {busy ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-70 motion-reduce:hidden" /><span className="relative w-2 h-2 rounded-full bg-emerald-500" /></span>}
              <span className="hidden sm:inline">{loadedAt ? `Updated ${loadedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </Card>

      {/* 2. Figures with trend */}
      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.map((k, i) => { const I = k.icon; return (
          <Card key={k.key} delay={60 + i * 70} className="ota-card px-4 pt-4 pb-3 flex flex-col">
            <div className="flex items-center gap-3">
              <span className={`w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0 ${k.pastel}`}><I className="w-5 h-5" /></span>
              <p className="text-[12.5px] font-semibold text-slate-600">{k.label}</p>
            </div>
            {rows === null ? <><Skeleton className="mt-3 h-7 w-28" /><Skeleton className="mt-3 h-[34px] w-full" /><Skeleton className="mt-2 h-4 w-32" /></> : <>
              {k.key === 'h' ? (
                <div className="mt-2 flex items-center gap-3">
                  <Ring value={t.calls ? health : 0} size={70} color={health >= 0.95 ? '#8b5cf6' : health >= 0.8 ? '#f59e0b' : '#f43f5e'}>
                    <span className="text-[15px] font-semibold tabular-nums text-slate-900"><CountUp value={t.calls ? pct(health) : '—'} /></span>
                  </Ring>
                  <div className="min-w-0 text-[11.5px] leading-snug text-slate-500">
                    <p className="font-semibold text-slate-700">{!t.calls ? 'No calls yet' : health >= 0.98 ? 'Excellent' : health >= 0.95 ? 'Good' : health >= 0.8 ? 'Needs a look' : 'Poor'}</p>
                    <p>of broker requests answered without an error</p>
                  </div>
                </div>
              ) : <>
                <p className="mt-2.5 text-[26px] leading-none font-semibold tracking-[-0.02em] tabular-nums text-slate-900"><CountUp value={k.value} /></p>
                <div className="mt-2"><Spark key={hours} values={k.spark} color={k.color} id={k.key} /></div>
              </>}
              <div className="mt-1.5 flex items-center gap-2 min-w-0">{k.foot}</div>
            </>}
          </Card>
        ); })}
      </div>

      {/* 3. Activity and to-do */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
        <Card delay={200}>
          <CardHead title="Broker activity" hint={`Requests and errors from every broker in ${PERIOD_TEXT[hours]}`}
            right={<div className="flex items-center gap-3 text-[11.5px] text-slate-500 pt-1">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />Requests</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" />Errors</span>
            </div>} />
          <div className="px-3 pb-3">{rows === null ? <Skeleton className="h-[230px] mx-2" /> : <ActivityChart key={hours} series={t.series} hours={hours} />}</div>
        </Card>

        <Card delay={260} className="overflow-hidden">
          <CardHead title="Needs your attention" hint={todo.length ? 'Most urgent first. One click takes you to the fix.' : undefined}
            right={todo.length ? <span className="h-6 min-w-[24px] px-2 rounded-full bg-rose-50 text-rose-700 text-[12px] font-bold tabular-nums inline-flex items-center justify-center">{todo.length}</span> : undefined} />
          {rows === null ? <div className="px-5 pb-5 space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12" />)}</div> : todo.length === 0 ? (
            <div className="px-5 pb-6 pt-2 text-center">
              <span className="ota-pop mx-auto w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 inline-flex items-center justify-center"><CheckCircleIcon className="w-8 h-8" /></span>
              <p className="mt-3 text-[14px] font-semibold text-slate-900">All good</p>
              <p className="text-[12.5px] text-slate-500">Nothing needs you right now. Every broker is set up and answering.</p>
            </div>
          ) : (
            <ul className="max-h-[262px] overflow-y-auto px-2 pb-2">
              {todo.map((x, i) => (
                <li key={x.key} className="ota-pop" style={{ animationDelay: `${300 + i * 40}ms` }}>
                  <button type="button" onClick={x.run} className="group w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 flex items-start gap-3">
                    <span className={`mt-0.5 w-8 h-8 rounded-lg inline-flex items-center justify-center shrink-0 ${x.tone === 'danger' ? 'bg-rose-50 text-rose-600' : x.tone === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'}`}>
                      {x.key === 'stops' ? <StopIcon className="w-4 h-4" /> : <AlertIcon className="w-4 h-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold text-slate-900">{x.title}</span>
                      <span className="block text-[12px] text-slate-600 leading-snug">{x.text}</span>
                      <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-600 group-hover:gap-1.5 transition-all">{x.action}<ChevronRightIcon className="w-3.5 h-3.5" /></span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 4. Every broker as a card */}
      <div>
        <div className="px-1 pb-2 flex items-baseline gap-2">
          <h3 className="text-[14.5px] font-semibold text-slate-900">Your brokers</h3>
          <p className="text-[12px] text-slate-500">Click a broker to open it.</p>
        </div>
        {aggregators.length === 0 ? (
          <Card className="px-5 py-10 text-center"><ServerIcon className="w-8 h-8 mx-auto text-slate-300" /><p className="mt-2 text-[13px] font-medium text-slate-700">No brokers yet</p><p className="text-[12px] text-slate-500">Add a channel to start selling through brokers.</p></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
            {(rows || aggregators.map(a => ({ a, stats: null, bookings: [], before: [], failedHooks: [], ok: true } as Row))).map((r, i) => {
              const st = channelStatus(r.a);
              const cs = connectionStateOf(r.a);
              const ok = r.stats && r.stats.calls ? 1 - failRate(r.stats) : null;
              const v = valueOf(r.bookings).v;
              return (
                <Card key={r.a.id} delay={320 + i * 50} className="ota-card group flex flex-col">
                  <div role="button" tabIndex={0} onClick={() => onOpenChannel(r.a.id, 'Overview')} onKeyDown={e => e.key === 'Enter' && onOpenChannel(r.a.id, 'Overview')} className="flex-1 p-4 cursor-pointer outline-none">
                    <div className="flex items-center gap-3">
                      <span className={`relative w-11 h-11 rounded-xl ${avatarBg(r.a)} text-white font-bold text-[13px] inline-flex items-center justify-center shrink-0`}>
                        {initials(r.a)}
                        {st === 'active' && <span className="absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full bg-emerald-400 animate-ping opacity-60 motion-reduce:hidden" />}
                        <span className={`absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full ring-2 ring-white ${st === 'active' ? 'bg-emerald-500' : st === 'testing' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-[14px] font-semibold text-slate-900 truncate">{r.a.name}<Plate value={r.a.channelCode || r.a.id} /></p>
                        <p className="text-[11.5px] text-slate-500 truncate">{st === 'active' ? 'Live' : st === 'testing' ? 'Testing' : 'Paused'} · {cs.label}</p>
                      </div>
                      <ChevronRightIcon className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    {rows === null ? <Skeleton className="mt-4 h-14" /> : (
                      <>
                        <dl className="mt-4 grid grid-cols-3 gap-2">
                          {[['Bookings', String(r.bookings.length)], ['Value', usd(v)], ['Conversion', r.stats?.searches ? `${((r.bookings.length / r.stats.searches) * 100).toFixed(1)}%` : '—']].map(([l, val]) => (
                            <div key={l} className="rounded-xl bg-slate-50 px-2.5 py-2 min-w-0">
                              <dt className="text-[10.5px] font-semibold text-slate-500">{l}</dt>
                              <dd className="text-[14px] font-semibold tabular-nums text-slate-900 truncate"><CountUp value={val} /></dd>
                            </div>
                          ))}
                        </dl>
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[11.5px] mb-1">
                            <span className="text-slate-500">Connection health</span>
                            <span className="font-semibold tabular-nums text-slate-700">{ok === null ? 'no calls yet' : `${pct(ok)} · ${r.stats!.avgMs} ms`}</span>
                          </div>
                          <GrowBar value={ok ?? 0} delay={380 + i * 50} className={ok === null ? 'bg-slate-200' : ok >= 0.95 ? 'bg-emerald-500' : ok >= 0.8 ? 'bg-amber-500' : 'bg-rose-500'} />
                        </div>
                        {r.failedHooks.length > 0 && <p className="mt-2"><Badge tone="danger">{r.failedHooks.length} status update{r.failedHooks.length === 1 ? '' : 's'} failed</Badge></p>}
                      </>
                    )}
                  </div>
                  <div className="px-4 pb-3 -mt-1 flex gap-1.5">
                    {(['Rates', 'Bookings', 'Test console'] as ChannelTab[]).map(tab => (
                      <button key={tab} type="button" onClick={() => onOpenChannel(r.a.id, tab)}
                        className="h-8 px-3 rounded-lg bg-white ring-1 ring-inset ring-slate-200 hover:ring-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 text-[12px] font-semibold text-slate-600">{tab === 'Test console' ? 'Test' : tab}</button>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Latest bookings and share */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
        <Card delay={380} className="overflow-hidden">
          <CardHead title="Latest bookings" hint={`Newest first, from every broker, ${PERIOD_TEXT[hours]}`}
            right={onOpenModule ? <button type="button" onClick={() => onOpenModule('reservations')} className="text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 pt-1">See all<ChevronRightIcon className="w-3.5 h-3.5" /></button> : undefined} />
          {rows === null ? <div className="px-5 pb-5 space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-9" />)}</div> : latest.length === 0 ? (
            <div className="px-5 pb-8 pt-2 text-center">
              <span className="mx-auto w-12 h-12 rounded-full bg-slate-100 text-slate-400 inline-flex items-center justify-center"><CalendarCheckIcon className="w-6 h-6" /></span>
              <p className="mt-2 text-[13px] font-medium text-slate-700">No bookings in this period</p>
              <p className="text-[12px] text-slate-500">New broker bookings appear here the moment they arrive.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className={`${table.wrap} min-w-[640px]`}>
                <thead className={table.head}><tr>{['Booking', 'Broker', 'Customer', 'Car', 'Pick-up', 'Status', 'Amount', ''].map(h => <th key={h} className={`${table.th} ${h === 'Amount' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                <tbody className={table.body}>
                  {latest.map(({ b, a }, i) => { const s = STATUS_DOT[b.status] || { dot: 'bg-slate-400', label: b.status }; return (
                    <tr key={`${a.id}-${b.reservationNumber}`} className={`${table.row} ota-row`} style={{ animationDelay: `${120 + i * 45}ms` }}>
                      <td className={`${table.td} font-mono text-[12px] font-semibold text-slate-900`}>{b.reservationNumber}</td>
                      <td className={table.td}><span className="inline-flex items-center gap-1.5"><span className={`w-5 h-5 rounded-md ${avatarBg(a)} text-white text-[8.5px] font-bold inline-flex items-center justify-center`}>{initials(a)}</span>{a.name}</span></td>
                      <td className={`${table.td} truncate max-w-[160px]`}>{b.customerName || '—'}</td>
                      <td className={table.td}><span className="font-mono text-[12px]">{b.vehicleGroup}</span></td>
                      <td className={`${table.td} whitespace-nowrap`}>{when(b.pickupAt)}</td>
                      <td className={table.td}><span className="inline-flex items-center gap-1.5 text-[12.5px]"><span className={`w-2 h-2 rounded-full ${s.dot}`} />{s.label}</span></td>
                      <td className={`${table.td} text-right tabular-nums font-semibold whitespace-nowrap`}>{(b.total || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} {b.currency}</td>
                      <td className={`${table.td} text-right`}>
                        <button type="button" onClick={() => onOpenChannel(a.id, 'Bookings')} className="h-7 px-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-[11.5px] font-semibold">Details</button>
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card delay={440}>
          <CardHead title="Bookings by broker" hint="Bars show bookings; the list shows each broker's share of the money" />
          {rows === null ? <div className="px-5 pb-5"><Skeleton className="h-36" /></div> : (
            <div className="px-5 pb-5">
              <div className="h-32 flex items-end gap-2.5 border-b border-slate-100">
                {perBroker.map(({ r }, i) => (
                  <button key={r.a.id} type="button" onClick={() => onOpenChannel(r.a.id, 'Bookings')} title={`${r.a.name}: ${r.bookings.length} booking${r.bookings.length === 1 ? '' : 's'}`}
                    className="group flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1">
                    <span className="text-[11px] font-semibold tabular-nums text-slate-700"><CountUp value={String(r.bookings.length)} /></span>
                    <span className={`ota-rise w-full max-w-[30px] rounded-t-lg ${BAR[i % BAR.length]} group-hover:brightness-110 transition-[filter]`}
                      style={{ height: `${Math.max(4, (r.bookings.length / maxBookings) * 100)}%`, animationDelay: `${480 + i * 70}ms` }} />
                  </button>
                ))}
              </div>
              <div className="flex gap-2.5 pt-1.5">
                {perBroker.map(({ r }) => <span key={r.a.id} className="flex-1 min-w-0 text-center text-[10.5px] text-slate-500 truncate">{r.a.channelCode || r.a.name}</span>)}
              </div>
              <ul className="mt-4 space-y-2.5">
                {perBroker.map(({ r, value }, i) => (
                  <li key={r.a.id}>
                    <div className="flex items-center justify-between text-[12px] gap-2">
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 truncate"><span className={`w-2 h-2 rounded-full ${BAR[i % BAR.length]}`} />{r.a.name}</span>
                      <span className="tabular-nums text-slate-500 whitespace-nowrap">{allValue ? `${Math.round((value / allValue) * 100)}%` : '0%'} · {usd(value)}</span>
                    </div>
                    <div className="mt-1"><GrowBar value={allValue ? value / allValue : 0} className={BAR[i % BAR.length]} delay={520 + i * 80} /></div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* 6. The full numbers, for those who want every figure */}
      {rows !== null && rows.length > 0 && (
        <details className="group ota-pop rounded-2xl bg-white border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden" style={{ animationDelay: '500ms' }}>
          <summary className="list-none cursor-pointer px-5 py-3.5 flex items-center gap-2 text-[13.5px] font-semibold text-slate-900 hover:bg-slate-50">
            <ChevronRightIcon className="w-4 h-4 text-slate-400 transition-transform duration-300 group-open:rotate-90" />Full numbers per broker
            <span className="text-[12px] font-normal text-slate-500">requests, searches, errors and speed</span>
          </summary>
          <div className="overflow-x-auto border-t border-slate-100">
            <table className={`${table.wrap} min-w-[900px]`}>
              <thead className={table.head}><tr>
                {['Broker', 'Status', 'Requests', 'Searches', 'Bookings', 'Conversion', 'Booked value', 'Errors', 'Speed (avg / 95%)', 'Updates'].map(h => <th key={h} className={`${table.th} ${h === 'Broker' || h === 'Status' ? '' : 'text-right'}`}>{h}</th>)}
              </tr></thead>
              <tbody className={table.body}>
                {rows.map(({ a, stats, bookings, failedHooks }) => (
                  <tr key={a.id} className={`${table.row} cursor-pointer`} onClick={() => onOpenChannel(a.id, 'Overview')}>
                    <td className={table.td}><span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">{a.name}<Plate value={a.channelCode || a.id} /></span></td>
                    <td className={table.td}><Badge tone={a.status === 'active' ? 'success' : a.status === 'paused' ? 'muted' : 'warning'}>{a.status === 'active' ? 'Live' : a.status === 'paused' ? 'Paused' : 'Testing'}</Badge></td>
                    <td className={`${table.td} text-right tabular-nums`}>{stats ? stats.calls.toLocaleString() : '—'}</td>
                    <td className={`${table.td} text-right tabular-nums`}>{stats ? stats.searches.toLocaleString() : '—'}</td>
                    <td className={`${table.td} text-right tabular-nums font-semibold`}>{bookings.length}</td>
                    <td className={`${table.td} text-right tabular-nums`}>{stats?.searches ? `${((bookings.length / stats.searches) * 100).toFixed(2)}%` : '—'}</td>
                    <td className={`${table.td} text-right tabular-nums whitespace-nowrap`}>{usd(valueOf(bookings).v)}</td>
                    <td className={`${table.td} text-right tabular-nums ${stats && failRate(stats) > 0.1 ? 'text-rose-600 font-semibold' : ''}`}>{stats ? `${stats.errors} (${pct(failRate(stats))})` : '—'}</td>
                    <td className={`${table.td} text-right tabular-nums whitespace-nowrap ${stats && stats.p95Ms > 3000 ? 'text-amber-600' : ''}`}>{stats && stats.calls ? `${stats.avgMs} / ${stats.p95Ms} ms` : '—'}</td>
                    <td className={`${table.td} text-right`}>{failedHooks.length ? <Badge tone="danger">{failedHooks.length} failed</Badge> : <span className="text-xs text-slate-400">OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <p className="px-1 text-[11.5px] text-slate-400">Live bookings only; sandbox tests are left out. Dinar amounts are shown in USD at the fixed rate of 1 JOD = 1.4104 USD.</p>
    </div>
  );
};

/** Money of a list of bookings in USD (dinar at the fixed rate); other currencies are counted apart. */
function valueOf(list: ChannelBookingRow[]) {
  let v = 0; const other: Record<string, number> = {};
  list.filter(isLive).forEach(b => { const c = (b.currency || 'USD').toUpperCase(); if (USD_PER[c]) v += (b.total || 0) * USD_PER[c]; else other[c] = (other[c] || 0) + (b.total || 0); });
  return { v, other };
}

export default ChannelDashboardView;
