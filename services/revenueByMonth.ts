import { AppData, Reservation, TrafficTicket, VehicleDamage } from '../types';
import { MONTHS, USD_TO_JOD_RATE } from '../constants';
import { amountOf, bookingRevenue, countsInSummary, indexRegisters } from './revenue';
import { lateFeeOf } from './lateReturn';

/**
 * Revenue by the month it was earned. The booking's original price counts in the booking's month;
 * everything that changed it later counts in the month the change was made: extras added, price
 * edits, upgrades, extensions, late fees, return charges, traffic tickets and damages. A ticket added
 * in November for an October rental is November revenue (and November commission).
 *
 * Over all months the amounts add up to exactly what bookingRevenue gives per booking, so nothing is
 * counted twice or lost; only the month changes.
 */

export type RevenueKind = 'rental' | 'addons' | 'tickets' | 'damages' | 'other';

export interface RevenueEvent {
  year: number;
  /** 0 = January */
  month: number;
  kind: RevenueKind;
  amountUSD: number;
  bookingId: string;
  label: string;
  /** The booking's own month (for showing "from an October booking"). */
  bookingYear: number;
  bookingMonth: number;
}

export type MonthBreakdown = Record<RevenueKind, number> & { total: number; lateFromEarlier: number };

const round = (n: number) => Math.round(n * 100) / 100;
const jodToUsd = (n: number) => (n || 0) / USD_TO_JOD_RATE;

/** Time a register entry was added: new entries carry createdAt; older ones have it in their id (tt-<ms>, vd-<ms>). */
export function addedAt(entry: { id: string; createdAt?: string }): string | undefined {
  if (entry.createdAt) return entry.createdAt;
  const m = /^(?:tt|vd)-(\d{12,14})$/.exec(entry.id || '');
  return m ? new Date(Number(m[1])).toISOString() : undefined;
}

const monthOf = (iso: string | undefined): { year: number; month: number } | null => {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T12:00` : iso);
  return Number.isFinite(d.getTime()) ? { year: d.getFullYear(), month: d.getMonth() } : null;
};

/** Every revenue amount of one booking, each in its own month. */
export function revenueEvents(r: Reservation, bookingYear: number, bookingMonth: number,
                              idx: ReturnType<typeof indexRegisters>): RevenueEvent[] {
  const out: RevenueEvent[] = [];
  const own = { year: bookingYear, month: bookingMonth };
  // A change is never earlier than the booking's month (old data with odd dates stays in the booking month).
  const when = (iso?: string) => {
    const m = monthOf(iso);
    if (!m || m.year < own.year || (m.year === own.year && m.month < own.month)) return own;
    return m;
  };
  const add = (kind: RevenueKind, amountUSD: number, at: { year: number; month: number }, label: string) => {
    if (!amountUSD) return;
    out.push({ ...at, kind, amountUSD, bookingId: r.bookingId, label, bookingYear, bookingMonth });
  };

  // ---- Rental price: the original price in the booking's month, later changes in their own month.
  const changes: { at?: string; amount: number; label: string }[] = [];
  (r.priceChanges || []).forEach(c => changes.push({ at: c.at, amount: c.amount || 0, label: c.kind === 'extras' ? 'Extras changed' : 'Price edited' }));
  (r.upgradeHistory || []).forEach(u => changes.push({ at: u.date, amount: u.fee || 0, label: `Upgrade to ${u.toCar}` }));
  (r.extensionHistory || []).forEach(x => changes.push({ at: x.extensionDate, amount: x.cost || 0, label: `Extension ${x.days} day${x.days === 1 ? '' : 's'}` }));
  const amount = amountOf(r);
  const changed = changes.reduce((s, c) => s + c.amount, 0);
  if (changes.length && amount - changed >= 0) {
    add('rental', amount - changed, own, 'Rental');
    changes.forEach(c => add('addons', c.amount, when(c.at), c.label));
  } else {
    add('rental', amount, own, 'Rental');   // no history, or history that does not fit the amount: as before
  }

  // ---- Late return fee (applied, not waived), in the month it was applied.
  const lf = lateFeeOf(r);
  if (lf?.status === 'APPLIED' && !lf.isWaived && lf.amount) add('other', lf.amount, when(lf.feeAppliedDate || lf.resolvedDate), 'Late return');

  // ---- Damages and tickets from their registers, in the month they were added.
  const rc = r.returnCharges;
  const issued = rc?.issuedAt || r.dropOffDateTime;
  const regDamages = idx.damages.get(r.bookingId) || [];
  const regTickets = idx.tickets.get(r.bookingId) || [];
  regDamages.forEach(d => add('damages', jodToUsd(d.amount), when(d.id.startsWith(`vd-${r.id}-`) ? issued : addedAt(d)), d.details || 'Damage'));
  regTickets.forEach(t => add('tickets', jodToUsd(t.amount), when(t.id.startsWith(`tt-${r.id}-`) ? issued : addedAt(t) || t.ticketDate), t.details || 'Traffic ticket'));

  // ---- Return charges not already in a register, in the month they were issued.
  (rc?.items || []).forEach(it => {
    const v = rc!.currency === 'JOD' ? jodToUsd(it.amount) : it.amount || 0;
    if (it.kind === 'damage') {
      if (!regDamages.some(d => d.id === `vd-${r.id}-${it.id}`)) add('damages', v, when(issued), it.description || 'Damage');
    } else if (it.kind === 'ticket') {
      const inRegister = it.ticketId ? regTickets.some(t => t.id === it.ticketId) : regTickets.some(t => t.id === `tt-${r.id}-${it.id}`);
      if (!inRegister) add('tickets', v, when(issued), it.description || 'Traffic ticket');
    } else {
      add('other', v, when(issued), it.description || 'Return charge');
    }
  });
  return out;
}

/** All counted bookings of every year, as revenue events. */
export function allRevenueEvents(data: AppData, registers: { trafficTickets?: TrafficTicket[]; vehicleDamages?: VehicleDamage[] }): RevenueEvent[] {
  const idx = indexRegisters(registers);
  const out: RevenueEvent[] = [];
  Object.entries(data || {}).forEach(([y, yearData]) => {
    MONTHS.forEach((m, i) => {
      ((yearData as any)?.[m] || []).forEach((r: Reservation) => {
        if (countsInSummary(r)) out.push(...revenueEvents(r, Number(y), i, idx));
      });
    });
  });
  return out;
}

/** Twelve months of one year: revenue per kind, the total, and how much came from bookings of earlier months. */
export function monthlyBreakdown(events: RevenueEvent[], year: number): MonthBreakdown[] {
  const months: MonthBreakdown[] = MONTHS.map(() => ({ rental: 0, addons: 0, tickets: 0, damages: 0, other: 0, total: 0, lateFromEarlier: 0 }));
  events.forEach(e => {
    if (e.year !== year) return;
    const m = months[e.month];
    m[e.kind] += e.amountUSD;
    m.total += e.amountUSD;
    if (e.bookingYear !== e.year || e.bookingMonth !== e.month) m.lateFromEarlier += e.amountUSD;
  });
  return months.map(m => ({
    rental: round(m.rental), addons: round(m.addons), tickets: round(m.tickets), damages: round(m.damages), other: round(m.other),
    total: round(m.total), lateFromEarlier: round(m.lateFromEarlier),
  }));
}

/** Check used by the tests: per booking, the events add up to bookingRevenue's total. */
export const eventsTotal = (r: Reservation, y: number, m: number, idx: ReturnType<typeof indexRegisters>) =>
  round(revenueEvents(r, y, m, idx).reduce((s, e) => s + e.amountUSD, 0));
export const bookingTotal = (r: Reservation, idx: ReturnType<typeof indexRegisters>) => bookingRevenue(r, idx).total;
