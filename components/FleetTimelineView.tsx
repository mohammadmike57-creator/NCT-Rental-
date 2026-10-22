import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Fleet, Reservation, ReservationStatus, Vehicle } from '../types';
import { MONTHS, CAR_CATEGORIES } from '../constants';
import { SearchIcon } from './icons';
import { Badge, Button, DetailList, Drawer, EmptyState, Plate, Segmented, Toolbar, inputCls, selectCls } from './ui/Crm';
import {
  BoardBooking, LEGEND_STAGES, STAGE_META, ZOOM_OPTIONS, Zoom,
  addDays, barOffsets, dateKey, dayDiff, fmtDT, fmtShort, packLanes,
  rangeLength, rangeReference, rangeStartFor, seedForMonth, shiftRange, startOfDay, toBoardBooking,
} from './fleet/planning';

/*
 * Planning board (RentWay / Wheelsys style): one row per vehicle grouped by
 * model, days as columns, bookings as bars coloured by rental stage.
 */

interface FleetTimelineViewProps {
  year: number;
  month: string;
  /** Whole fleet. When `categoryFilter` is given the board narrows it itself. */
  fleet: Fleet;
  /** Every non-cancelled booking the board may need (any stage). */
  reservations: Reservation[];
  categoryFilter?: string;
  onCategoryChange?: (category: string) => void;
  /** Called when board navigation moves into another month, so the page can follow. */
  onRangeMonthChange?: (year: number, month: string) => void;
}

type VehicleStatus = 'onrent' | 'later' | 'due' | 'available';
const VEHICLE_STATUS: Record<VehicleStatus, { label: string; dot: string }> = {
  onrent: { label: 'On rent now', dot: 'bg-indigo-500' },
  later: { label: 'Booked later today', dot: 'bg-amber-500' },
  due: { label: 'Reserved, pickup due', dot: 'bg-amber-500' },
  available: { label: 'Available', dot: 'bg-emerald-500' },
};

const OTHER_GROUP = '__other__';
const ROW_PAD = 6;
const LANE_H = 26;
const BAR_H = 22;

const norm = (s?: string) => (s || '').trim().toUpperCase();
/** Row key for a car: its plate, or its id when it has no plate yet. */
const vkey = (v: Vehicle) => norm(v.licensePlate) || `id:${v.id}`;
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const useNarrow = () => {
  const q = '(max-width: 639px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(q);
    const fn = () => setNarrow(mq.matches);
    fn();
    mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', fn) : mq.removeListener(fn); };
  }, []);
  return narrow;
};

const Chevron: React.FC<{ dir: 'left' | 'right' | 'down'; className?: string }> = ({ dir, className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={dir === 'left' ? 'M15 19l-7-7 7-7' : dir === 'right' ? 'M9 5l7 7-7 7' : 'M19 9l-7 7-7-7'} />
  </svg>
);

interface Group {
  key: string;
  model: string;
  category: string;
  vehicles: Vehicle[];
  byPlate: Map<string, BoardBooking[]>;
  unassigned: BoardBooking[];
}

const FleetTimelineView: React.FC<FleetTimelineViewProps> = ({ year, month, fleet, reservations, categoryFilter = '', onCategoryChange, onRangeMonthChange }) => {
  const monthIndex = useMemo(() => Math.max(0, MONTHS.indexOf(month)), [month]);
  const narrow = useNarrow();

  const [zoom, setZoom] = useState<Zoom>('2w');
  const [rangeStart, setRangeStart] = useState<Date>(() => rangeStartFor(seedForMonth(year, monthIndex, '2w'), '2w'));
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<BoardBooking | null>(null);
  const [showAllFree, setShowAllFree] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastSynced = useRef<{ y: number; m: number } | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(t);
  }, []);

  const days = rangeLength(rangeStart, zoom);
  const dayW = narrow ? (zoom === 'week' ? 84 : zoom === '2w' ? 60 : 40) : (zoom === 'week' ? 128 : zoom === '2w' ? 76 : 44);
  const leftW = narrow ? 136 : 216;
  const trackW = days * dayW;
  const rangeEnd = addDays(rangeStart, days - 1);

  // Follow month/year changes made from the page header.
  useEffect(() => {
    if (lastSynced.current && lastSynced.current.y === year && lastSynced.current.m === monthIndex) return;
    const ref = rangeReference(rangeStart, zoom);
    if (ref.getFullYear() === year && ref.getMonth() === monthIndex) return;
    lastSynced.current = null;
    setRangeStart(rangeStartFor(seedForMonth(year, monthIndex, zoom), zoom));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, monthIndex]);

  const navigate = (start: Date, z: Zoom = zoom) => {
    setRangeStart(start);
    const ref = rangeReference(start, z);
    const y = ref.getFullYear();
    const m = ref.getMonth();
    lastSynced.current = { y, m };
    if (onRangeMonthChange && (y !== year || m !== monthIndex)) onRangeMonthChange(y, MONTHS[m]);
  };
  const goPrev = () => navigate(shiftRange(rangeStart, zoom, -1));
  const goNext = () => navigate(shiftRange(rangeStart, zoom, 1));
  const goToday = () => navigate(rangeStartFor(new Date(), zoom));
  const changeZoom = (z: Zoom) => {
    setZoom(z);
    const today = new Date();
    const inRange = today >= rangeStart && today < addDays(rangeStart, days);
    navigate(rangeStartFor(inRange ? today : rangeReference(rangeStart, zoom), z), z);
  };

  const today = startOfDay(new Date(now));
  const todayIdx = dayDiff(rangeStart, today);
  const todayInRange = todayIdx >= 0 && todayIdx < days;
  const nowFrac = (now - today.getTime()) / 86400000;

  // Bring today into view when the range changes.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollLeft = todayInRange ? Math.max(0, (todayIdx - 1) * dayW) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart.getTime(), zoom, dayW]);

  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => addDays(rangeStart, i)), [rangeStart, days]);

  // ---- Data --------------------------------------------------------------
  const bookings = useMemo(() => {
    const seen = new Set<string>();
    const list: BoardBooking[] = [];
    reservations.forEach(r => {
      if (!r || seen.has(r.id)) return;
      if (r.status === ReservationStatus.CANCELLED || r.status === ReservationStatus.NO_SHOW) return;
      seen.add(r.id);
      const b = toBoardBooking(r, now);
      if (b) list.push(b);
    });
    return list;
  }, [reservations, now]);

  const visibleFleet = useMemo(
    () => (categoryFilter ? fleet.filter(v => v.category === categoryFilter) : fleet),
    [fleet, categoryFilter],
  );

  const groups = useMemo(() => {
    const plateMap = new Map<string, Vehicle>();
    fleet.forEach(v => plateMap.set(vkey(v), v));
    const visiblePlates = new Set(visibleFleet.map(v => vkey(v)));
    const map = new Map<string, Group>();
    [...visibleFleet]
      .sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.modelName.localeCompare(b.modelName) || (a.licensePlate || '').localeCompare(b.licensePlate || ''))
      .forEach(v => {
        const key = norm(v.modelName);
        if (!map.has(key)) map.set(key, { key, model: v.modelName, category: v.category, vehicles: [], byPlate: new Map(), unassigned: [] });
        const g = map.get(key)!;
        g.vehicles.push(v);
        g.byPlate.set(vkey(v), []);
      });
    bookings.forEach(b => {
      const plate = norm(b.res.licensePlate);
      const v = plate ? plateMap.get(plate) : undefined;
      if (v) {
        if (!visiblePlates.has(plate)) return;
        map.get(norm(v.modelName))?.byPlate.get(plate)?.push(b);
        return;
      }
      const g = map.get(norm(b.res.carModel));
      if (g) { g.unassigned.push(b); return; }
      if (categoryFilter) return;
      if (!map.has(OTHER_GROUP)) map.set(OTHER_GROUP, { key: OTHER_GROUP, model: 'Models not in fleet', category: 'Unmatched', vehicles: [], byPlate: new Map(), unassigned: [] });
      map.get(OTHER_GROUP)!.unassigned.push(b);
    });
    return [...map.values()];
  }, [fleet, visibleFleet, bookings, categoryFilter]);

  const vehicleStatus = useMemo(() => {
    const out = new Map<string, { status: VehicleStatus; next?: BoardBooking }>();
    const todayStart = startOfDay(new Date(now)).getTime();
    groups.forEach(g => g.byPlate.forEach((list, plate) => {
      const live = list.filter(b => b.stage !== 'closed' && b.stage !== 'past');
      const next = live.filter(b => b.start.ts > now).sort((a, b) => a.start.ts - b.start.ts)[0];
      let status: VehicleStatus = 'available';
      if (live.some(b => b.res.voucherSubmitted)) status = 'onrent';
      else if (live.some(b => b.start.day.getTime() === todayStart && b.start.ts > now)) status = 'later';
      else if (live.some(b => b.start.ts <= now && b.end.ts > now)) status = 'due';
      out.set(plate, { status, next });
    }));
    return out;
  }, [groups, now]);

  const q = query.trim().toLowerCase();
  const bookingMatches = (b: BoardBooking) => !q || [b.res.personName, b.res.bookingId, b.res.licensePlate, b.res.customer].some(s => (s || '').toLowerCase().includes(q));
  const vehicleMatches = (v: Vehicle) => !q || v.licensePlate.toLowerCase().includes(q) || v.modelName.toLowerCase().includes(q);
  const inRange = (b: BoardBooking) => { const { s, e } = barOffsets(b, rangeStart); return e > 0 && s < days; };

  const rangeBookings = useMemo(() => bookings.filter(inRange).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, rangeStart.getTime(), days]);
  const unassignedCount = groups.reduce((n, g) => n + g.unassigned.filter(inRange).length, 0);

  const availableNow = useMemo(() => visibleFleet
    .map(v => ({ v, info: vehicleStatus.get(vkey(v)) }))
    .filter(x => (x.info?.status ?? 'available') === 'available')
    .sort((a, b) => a.v.modelName.localeCompare(b.v.modelName) || a.v.licensePlate.localeCompare(b.v.licensePlate)),
  [visibleFleet, vehicleStatus]);

  const rangeLabel = zoom === 'month'
    ? rangeStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : `${fmtShort(rangeStart)} – ${fmtShort(rangeEnd)} ${rangeEnd.getFullYear()}`;

  const toggleGroup = (key: string) => setCollapsed(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  // ---- Rendering helpers ---------------------------------------------------
  const gridBg: React.CSSProperties = {
    backgroundImage: 'linear-gradient(to right, rgb(241 245 249) 1px, transparent 1px)',
    backgroundSize: `${dayW}px 100%`,
  };

  const trackDecor = () => (
    <>
      {dayList.map((d, i) => (d.getDay() === 0 || d.getDay() === 6) && (
        <div key={i} className="absolute inset-y-0 bg-slate-50" style={{ left: i * dayW, width: dayW }} />
      ))}
      {todayInRange && <div className="absolute inset-y-0 bg-indigo-50/50" style={{ left: todayIdx * dayW, width: dayW }} />}
      {todayInRange && <div className="absolute inset-y-0 w-px bg-rose-500 z-[6] pointer-events-none" style={{ left: (todayIdx + nowFrac) * dayW }} />}
    </>
  );

  const renderBars = (list: BoardBooking[], dimAll: boolean) => {
    const visible = list.filter(inRange);
    const { placed, lanes } = packLanes(visible, b => barOffsets(b, rangeStart));
    return {
      lanes,
      bars: placed.map(({ item: b, lane, s, e }) => {
        const cs = Math.max(0, s);
        const ce = Math.min(days, e);
        const meta = STAGE_META[b.stage];
        const dim = q && dimAll && !bookingMatches(b);
        const label = `${b.res.personName || b.res.customer || 'Unnamed'}${b.res.bookingId ? ` · ${b.res.bookingId}` : ''}`;
        return (
          <button
            key={b.res.id}
            type="button"
            onClick={() => setSelected(b)}
            title={`${label}\n${b.stageLabel}\nPickup: ${fmtDT(b.start)}\nReturn: ${fmtDT(b.end)}${b.res.carModel ? `\nModel: ${b.res.carModel}` : ''}`}
            className={cx('absolute z-[5] flex items-center gap-1 px-1.5 text-[11px] font-medium text-left overflow-hidden transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40',
              meta.bar, s < 0 ? 'rounded-l-none' : 'rounded-l-md', e > days ? 'rounded-r-none' : 'rounded-r-md', dim && 'opacity-30',
              selected?.res.id === b.res.id && 'ring-2 ring-offset-1 ring-indigo-500')}
            style={{ left: cs * dayW + 1, width: Math.max(10, (ce - cs) * dayW - 2), top: ROW_PAD + lane * LANE_H, height: BAR_H }}
          >
            {s < 0 && <Chevron dir="left" className="w-3 h-3 shrink-0 opacity-80" />}
            <span className="truncate">{label}</span>
            {e > days && <Chevron dir="right" className="w-3 h-3 shrink-0 ml-auto opacity-80" />}
          </button>
        );
      }),
    };
  };

  const rowHeight = (lanes: number) => Math.max(44, ROW_PAD * 2 + lanes * LANE_H - (LANE_H - BAR_H));

  const renderGroup = (g: Group) => {
    const groupBookings = [...g.unassigned, ...[...g.byPlate.values()].flat()];
    const vehicleRows = g.vehicles.filter(v => {
      if (vehicleMatches(v)) return true;
      return (g.byPlate.get(vkey(v)) || []).some(b => inRange(b) && bookingMatches(b));
    });
    const unassignedInRange = g.unassigned.filter(inRange);
    const showUnassigned = unassignedInRange.length > 0 && (!q || unassignedInRange.some(bookingMatches));
    if (q && vehicleRows.length === 0 && !showUnassigned) return null;
    if (!q && g.vehicles.length === 0 && !showUnassigned) return null;

    // Utilisation of assigned + unassigned demand over the visible range.
    let bookedDays = 0;
    const perDay = new Array(days).fill(0);
    groupBookings.forEach(b => {
      const { s, e } = barOffsets(b, rangeStart);
      if (e <= 0 || s >= days) return;
      bookedDays += Math.min(days, e) - Math.max(0, s);
      for (let i = Math.max(0, Math.floor(s)); i < Math.min(days, Math.ceil(e)); i++) {
        if (s <= i + 0.5 && e > i + 0.5) perDay[i] += 1;
      }
    });
    const capacity = g.vehicles.length * days;
    const util = capacity > 0 ? Math.min(100, Math.round((bookedDays / capacity) * 100)) : null;
    const isCollapsed = collapsed.has(g.key) && !q;
    const onRentNow = g.vehicles.filter(v => vehicleStatus.get(vkey(v))?.status === 'onrent').length;

    return (
      <div key={g.key} role="rowgroup">
        {/* Group header */}
        <div className="flex border-b border-slate-200 bg-slate-50" style={{ height: 36 }}>
          <div className="sticky left-0 z-20 shrink-0 bg-slate-50 border-r border-slate-200 flex items-center" style={{ width: leftW }}>
            <button type="button" onClick={() => toggleGroup(g.key)} aria-expanded={!isCollapsed}
              className="w-full h-full flex items-center gap-1.5 pl-2 pr-2 text-left hover:bg-slate-100 transition-colors min-w-0">
              <Chevron dir={isCollapsed ? 'right' : 'down'} className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-slate-800 truncate" title={g.model}>{g.model}</span>
                <span className="block text-[10.5px] text-slate-500 truncate tabular-nums">
                  {g.category} · {g.vehicles.length} car{g.vehicles.length === 1 ? '' : 's'}{!narrow && g.vehicles.length > 0 ? ` · ${onRentNow} out` : ''}
                </span>
              </span>
              {util !== null && (
                <span className="shrink-0 text-right" title={`Utilisation over the visible range: ${util}%`}>
                  <span className={cx('block text-[11px] font-semibold tabular-nums', util >= 85 ? 'text-rose-600' : util >= 60 ? 'text-amber-600' : 'text-slate-600')}>{util}%</span>
                  <span className="block w-9 h-1 rounded-full bg-slate-200 overflow-hidden">
                    <span className={cx('block h-full', util >= 85 ? 'bg-rose-500' : util >= 60 ? 'bg-amber-500' : 'bg-indigo-500')} style={{ width: `${util}%` }} />
                  </span>
                </span>
              )}
            </button>
          </div>
          <div className="relative shrink-0" style={{ width: trackW, ...gridBg }}>
            {g.vehicles.length > 0 && perDay.map((count, i) => {
              const free = g.vehicles.length - count;
              return (
                <div key={i} className="absolute inset-y-0 flex items-center justify-center" style={{ left: i * dayW, width: dayW }}
                  title={`${dateKey(dayList[i])}: ${Math.max(0, free)} of ${g.vehicles.length} free${free < 0 ? ` (overbooked by ${-free})` : ''}`}>
                  <span className={cx('text-[10.5px] font-semibold tabular-nums px-1 rounded',
                    free <= 0 ? 'text-rose-700 bg-rose-50' : free === 1 ? 'text-amber-700' : 'text-slate-400')}>
                    {free}
                  </span>
                </div>
              );
            })}
            {todayInRange && <div className="absolute inset-y-0 w-px bg-rose-500 z-[6] pointer-events-none" style={{ left: (todayIdx + nowFrac) * dayW }} />}
          </div>
        </div>

        {!isCollapsed && (
          <>
            {showUnassigned && (() => {
              const { bars, lanes } = renderBars(g.unassigned, true);
              return (
                <div className="flex border-b border-slate-100" style={{ height: rowHeight(lanes) }}>
                  <div className="sticky left-0 z-20 shrink-0 bg-amber-50 border-r border-slate-200 px-3 flex flex-col justify-center min-w-0" style={{ width: leftW }}>
                    <div>
                      <p className="text-[12px] font-semibold text-amber-800 truncate">Unassigned</p>
                      <p className="text-[10.5px] text-amber-700/80 tabular-nums truncate">{unassignedInRange.length} booking{unassignedInRange.length === 1 ? '' : 's'} · no plate</p>
                    </div>
                  </div>
                  <div className="relative shrink-0 bg-white" style={{ width: trackW, ...gridBg }}>
                    {trackDecor()}
                    {bars}
                  </div>
                </div>
              );
            })()}
            {vehicleRows.map(v => {
              const plate = vkey(v);
              const vMatch = vehicleMatches(v);
              const { bars, lanes } = renderBars(g.byPlate.get(plate) || [], !vMatch);
              const st = VEHICLE_STATUS[vehicleStatus.get(plate)?.status ?? 'available'];
              return (
                <div key={v.id || plate} className="flex border-b border-slate-100 group" style={{ height: rowHeight(lanes) }}>
                  <div className="sticky left-0 z-20 shrink-0 bg-white group-hover:bg-slate-50 border-r border-slate-200 pl-3 pr-2 flex items-center gap-2 min-w-0 transition-colors" style={{ width: leftW }}>
                    <span className={cx('w-2 h-2 rounded-full shrink-0', st.dot)} title={st.label} aria-label={st.label} />
                    <span className="min-w-0 flex-1">
                      {!narrow && <span className="block text-[12.5px] font-medium text-slate-900 truncate" title={v.modelName}>{v.modelName}</span>}
                      <span className="block mt-0.5"><Plate value={v.licensePlate} /></span>
                      {narrow && <span className="block text-[10px] text-slate-400 truncate mt-0.5">{st.label}</span>}
                    </span>
                  </div>
                  <div className="relative shrink-0 bg-white" style={{ width: trackW, ...gridBg }}>
                    {trackDecor()}
                    {bars}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  };

  const renderedGroups = groups.map(renderGroup).filter(Boolean);

  // ---- Detail drawer -------------------------------------------------------
  const detail = selected && (() => {
    const r = selected.res;
    const nights = Math.max(1, dayDiff(selected.start.day, selected.end.day));
    const meta = STAGE_META[selected.stage];
    const plateKnown = !!fleet.find(v => vkey(v) === norm(r.licensePlate));
    return (
      <Drawer
        open
        onClose={() => setSelected(null)}
        title={r.personName || r.customer || 'Booking'}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2">{r.bookingId && <span className="font-mono text-[12px]">{r.bookingId}</span>}<Badge tone={meta.tone}>{selected.stageLabel}</Badge></span>}
        footer={<Button onClick={() => setSelected(null)}>Close</Button>}
      >
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pickup</p>
              <p className="mt-0.5 text-[13px] font-medium text-slate-900 tabular-nums">{fmtDT(selected.start)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Return</p>
              <p className="mt-0.5 text-[13px] font-medium text-slate-900 tabular-nums">{fmtDT(selected.end)}</p>
            </div>
          </div>
          <DetailList rows={[
            { label: 'Customer', value: r.personName || r.customer || '—' },
            ...(r.contactNumber ? [{ label: 'Contact', value: r.contactNumber }] : []),
            ...(r.customerEmail ? [{ label: 'Email', value: r.customerEmail }] : []),
            { label: 'Booking ID', value: r.bookingId || '—' },
            { label: 'Status', value: <Badge tone={meta.tone}>{selected.stageLabel}</Badge> },
            { label: 'Reservation', value: r.status === ReservationStatus.PENDING ? 'Pending' : r.status === ReservationStatus.CONFIRMED ? 'Confirmed' : String(r.status) },
            { label: 'Car model', value: r.carModel || '—' },
            { label: 'Vehicle', value: r.licensePlate ? <span className="inline-flex items-center gap-1.5"><Plate value={r.licensePlate} />{!plateKnown && <span className="text-[11px] text-amber-600">not in fleet</span>}</span> : <span className="text-amber-700">Unassigned</span> },
            { label: 'Duration', value: <span className="tabular-nums">{nights} day{nights === 1 ? '' : 's'}</span> },
            ...(r.source ? [{ label: 'Source', value: r.source }] : []),
            ...(r.locationName ? [{ label: 'Location', value: r.locationName }] : []),
          ]} />
          {r.notes && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Notes</p>
              <p className="mt-1 text-[13px] text-slate-700 whitespace-pre-wrap">{r.notes}</p>
            </div>
          )}
        </div>
      </Drawer>
    );
  })();

  const freeShown = showAllFree ? availableNow : availableNow.slice(0, 6);

  return (
    <div className="min-w-0">
      <Toolbar>
        <div className="flex items-center gap-2 min-w-0">
          <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
            <button type="button" onClick={goPrev} aria-label="Previous range" className="h-9 w-9 inline-flex items-center justify-center text-slate-600 hover:bg-slate-50"><Chevron dir="left" /></button>
            <button type="button" onClick={goToday} className="h-9 px-3 text-[13px] font-semibold text-slate-700 border-x border-slate-200 hover:bg-slate-50">Today</button>
            <button type="button" onClick={goNext} aria-label="Next range" className="h-9 w-9 inline-flex items-center justify-center text-slate-600 hover:bg-slate-50"><Chevron dir="right" /></button>
          </div>
          <span className="text-[13px] font-semibold text-slate-800 tabular-nums truncate">{rangeLabel}</span>
        </div>
        <Segmented className="w-full md:w-auto" value={zoom} onChange={k => changeZoom(k as Zoom)} options={ZOOM_OPTIONS} />
        <div className="md:ml-auto flex flex-col sm:flex-row gap-2 min-w-0">
          {onCategoryChange && (
            <select value={categoryFilter} onChange={e => onCategoryChange(e.target.value)} aria-label="Category" className={`${selectCls} w-full sm:w-44`}>
              <option value="">All categories</option>
              {CAR_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          )}
          <div className="relative w-full sm:w-56">
            <SearchIcon className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Plate, customer, booking" aria-label="Search plate or customer" className={`${inputCls} pl-8`} />
          </div>
        </div>
      </Toolbar>

      {/* Legend */}
      <div className="px-4 py-2 border-b border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-slate-500">
        {LEGEND_STAGES.map(s => (
          <span key={s} className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className={cx('w-3 h-2.5 rounded-sm', STAGE_META[s].swatch)} />{STAGE_META[s].label}</span>
        ))}
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="w-0.5 h-3 bg-rose-500" />Now</span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="w-3 h-2.5 rounded-sm bg-slate-100 border border-slate-200" />Weekend</span>
        <span className="w-full lg:w-auto lg:ml-auto tabular-nums text-slate-400">
          {rangeBookings} booking{rangeBookings === 1 ? '' : 's'} in range{unassignedCount > 0 && <> · <span className="text-amber-700 font-medium">{unassignedCount} unassigned</span></>} · numbers on group rows are cars free per day
        </span>
      </div>

      {/* Phones: who can go out right now */}
      <div className="md:hidden border-b border-slate-200">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Available now <span className="ml-1 px-1.5 py-px rounded bg-emerald-50 text-emerald-700 tabular-nums">{availableNow.length}</span></p>
          {availableNow.length > 6 && (
            <button type="button" onClick={() => setShowAllFree(v => !v)} className="text-xs font-semibold text-indigo-600">{showAllFree ? 'Show less' : `Show all ${availableNow.length}`}</button>
          )}
        </div>
        {availableNow.length === 0 ? (
          <p className="px-4 pb-3 text-[13px] text-slate-500">Every car is out or reserved right now.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {freeShown.map(({ v, info }) => (
              <li key={v.id || v.licensePlate} className="px-4 py-2 flex items-center gap-3 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-slate-900 truncate">{v.modelName}</span>
                  <span className="block text-[11px] text-slate-500 truncate">{v.category}</span>
                </span>
                <span className="text-right shrink-0">
                  <Plate value={v.licensePlate} />
                  <span className="block text-[10.5px] text-slate-400 mt-0.5 tabular-nums">{info?.next ? `Next ${fmtShort(info.next.start.day)}` : 'No upcoming'}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {groups.length === 0 ? (
        <EmptyState title="No vehicles to show" hint="Add vehicles to the fleet or clear the category filter." />
      ) : renderedGroups.length === 0 ? (
        <EmptyState title="Nothing matches your search" hint="Try another plate, customer name or booking ID." action={<Button size="sm" onClick={() => setQuery('')}>Clear search</Button>} />
      ) : (
        <div ref={scrollerRef} className="relative overflow-auto max-h-[72vh] overscroll-x-contain" role="grid" aria-label="Fleet planning board">
          <div style={{ width: leftW + trackW }}>
            {/* Day header */}
            <div className="flex sticky top-0 z-30 bg-white border-b border-slate-200">
              <div className="sticky left-0 z-40 shrink-0 bg-slate-50 border-r border-slate-200 px-3 flex items-end pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ width: leftW, height: 44 }}>
                Vehicle
              </div>
              {dayList.map((d, i) => {
                const isToday = i === todayIdx;
                const weekend = d.getDay() === 0 || d.getDay() === 6;
                const firstOfMonth = d.getDate() === 1 && i > 0;
                return (
                  <div key={i}
                    className={cx('shrink-0 flex flex-col items-center justify-center border-r border-slate-100 tabular-nums',
                      isToday ? 'bg-indigo-50 text-indigo-700' : weekend ? 'bg-slate-100/70 text-slate-600' : 'bg-slate-50 text-slate-600',
                      firstOfMonth && 'border-l-2 border-l-slate-300')}
                    style={{ width: dayW, height: 44 }}
                    title={d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}>
                    <span className={cx('text-[10px] font-medium uppercase tracking-wide', isToday ? 'text-indigo-600' : 'text-slate-400')}>
                      {d.toLocaleDateString('en-GB', { weekday: dayW >= 60 ? 'short' : 'narrow' })}
                    </span>
                    <span className={cx('text-[12px] font-semibold leading-tight', isToday && 'px-1.5 rounded bg-indigo-600 text-white')}>
                      {dayW >= 76 || d.getDate() === 1 || i === 0 ? `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}` : d.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
            {renderedGroups}
          </div>
        </div>
      )}

      {detail}
    </div>
  );
};

export default FleetTimelineView;
