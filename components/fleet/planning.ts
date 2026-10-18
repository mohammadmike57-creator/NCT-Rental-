import { Reservation, ReservationStatus } from '../../types';

/* Pure helpers for the fleet planning board (dates, stages, lane packing). */

export const DAY_MS = 86400000;

export type Zoom = 'week' | '2w' | 'month';
export const ZOOM_OPTIONS: { key: Zoom; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: '2w', label: '2 weeks' },
  { key: 'month', label: 'Month' },
];

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Whole days between two local midnights (DST safe). */
export const dayDiff = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
export const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
export const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Normalise any seed date to the first day of the range for a zoom level. */
export const rangeStartFor = (seed: Date, zoom: Zoom) =>
  zoom === 'month' ? new Date(seed.getFullYear(), seed.getMonth(), 1) : mondayOf(seed);

export const rangeLength = (start: Date, zoom: Zoom) =>
  zoom === 'week' ? 7 : zoom === '2w' ? 14 : new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();

export const shiftRange = (start: Date, zoom: Zoom, dir: -1 | 1) =>
  zoom === 'month' ? new Date(start.getFullYear(), start.getMonth() + dir, 1) : addDays(start, dir * (zoom === 'week' ? 7 : 14));

/** The date that decides which month the rest of the page follows. */
export const rangeReference = (start: Date, zoom: Zoom) => addDays(start, Math.floor(rangeLength(start, zoom) / 2));

/** Seed used when the page month is changed from outside the board. */
export const seedForMonth = (year: number, monthIndex: number, zoom: Zoom) => {
  const today = new Date();
  if (today.getFullYear() === year && today.getMonth() === monthIndex) return today;
  return new Date(year, monthIndex, zoom === 'week' ? 4 : 1);
};

export interface ParsedDT { day: Date; hour: number | null; ts: number }

/** Parses 'YYYY-MM-DD', 'YYYY-MM-DDTHH:mm', 'YYYY-MM-DD HH:mm' as local time. */
export const parseDT = (s?: string): ParsedDT | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(s.trim());
  if (m) {
    const day = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(day.getTime())) return null;
    const hour = m[4] !== undefined ? +m[4] + (+m[5] || 0) / 60 : null;
    return { day, hour, ts: day.getTime() + (hour ?? 12) * 3600000 };
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const day = startOfDay(d);
  const hour = d.getHours() + d.getMinutes() / 60;
  return { day, hour, ts: d.getTime() };
};

export type Stage = 'ready' | 'onrent' | 'overdue' | 'closed' | 'past' | 'pending';

export const STAGE_META: Record<Stage, { label: string; bar: string; swatch: string; tone: 'info' | 'success' | 'danger' | 'muted' | 'warning' }> = {
  ready: { label: 'Awaiting pickup', bar: 'bg-sky-500 hover:bg-sky-600 text-white', swatch: 'bg-sky-500', tone: 'info' },
  onrent: { label: 'On rent', bar: 'bg-emerald-600 hover:bg-emerald-700 text-white', swatch: 'bg-emerald-600', tone: 'success' },
  overdue: { label: 'Overdue', bar: 'bg-rose-600 hover:bg-rose-700 text-white', swatch: 'bg-rose-600', tone: 'danger' },
  closed: { label: 'Returned', bar: 'bg-slate-300 hover:bg-slate-400 text-slate-700', swatch: 'bg-slate-300', tone: 'muted' },
  past: { label: 'Past, not checked out', bar: 'bg-slate-100 hover:bg-slate-200 text-slate-500 border border-dashed border-slate-300', swatch: 'bg-slate-100 border border-dashed border-slate-300', tone: 'muted' },
  pending: { label: 'Pending / unlisted', bar: 'bg-amber-400 hover:bg-amber-500 text-amber-950', swatch: 'bg-amber-400', tone: 'warning' },
};

export const LEGEND_STAGES: Stage[] = ['ready', 'onrent', 'overdue', 'pending', 'closed', 'past'];

export interface BoardBooking {
  res: Reservation;
  start: ParsedDT;
  end: ParsedDT;
  stage: Stage;
  stageLabel: string;
}

export const toBoardBooking = (res: Reservation, now: number): BoardBooking | null => {
  const start = parseDT(res.startDate);
  const endRaw = parseDT(res.endDate);
  if (!start || !endRaw) return null;
  const end = endRaw.ts < start.ts ? start : endRaw;
  const todayStart = startOfDay(new Date(now)).getTime();
  let stage: Stage;
  let stageLabel: string;
  if (res.dropOffCompleted) { stage = 'closed'; stageLabel = 'Returned'; }
  else if (res.status === ReservationStatus.PENDING || res.awaitingConfirmation) {
    stage = 'pending';
    stageLabel = res.awaitingConfirmation ? 'Unlisted, awaiting confirmation' : 'Pending';
  }
  else if (res.voucherSubmitted) {
    if (end.ts < now) { stage = 'overdue'; stageLabel = 'Return overdue'; }
    else { stage = 'onrent'; stageLabel = 'On rent'; }
  }
  else if (end.day.getTime() < todayStart) { stage = 'past'; stageLabel = 'Past, not checked out'; }
  else if (start.day.getTime() < todayStart) { stage = 'overdue'; stageLabel = 'Pickup overdue'; }
  else { stage = 'ready'; stageLabel = 'Awaiting pickup'; }
  return { res, start, end, stage, stageLabel };
};

/** Half-day precision offsets (in days) relative to the range start. */
export const barOffsets = (b: BoardBooking, rangeStart: Date) => {
  const sh = b.start.hour ?? 12;
  const eh = b.end.hour ?? 12;
  const s = dayDiff(rangeStart, b.start.day) + (sh < 12 ? 0 : 0.5);
  let e = dayDiff(rangeStart, b.end.day) + (eh <= 12 ? 0.5 : 1);
  if (e - s < 0.5) e = s + 0.5;
  return { s, e };
};

/** Greedy lane packing so overlapping bars stack instead of hiding each other. */
export const packLanes = <T,>(items: T[], range: (t: T) => { s: number; e: number }) => {
  const sorted = [...items].sort((a, b) => range(a).s - range(b).s);
  const ends: number[] = [];
  const placed: { item: T; lane: number; s: number; e: number }[] = [];
  sorted.forEach(item => {
    const { s, e } = range(item);
    let lane = ends.findIndex(end => end <= s);
    if (lane === -1) { lane = ends.length; ends.push(e); } else ends[lane] = e;
    placed.push({ item, lane, s, e });
  });
  return { placed, lanes: Math.max(1, ends.length) };
};

export const fmtDT = (p: ParsedDT) =>
  p.day.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) +
  (p.hour !== null ? ` ${String(Math.floor(p.hour)).padStart(2, '0')}:${String(Math.round((p.hour % 1) * 60)).padStart(2, '0')}` : '');

export const fmtShort = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
