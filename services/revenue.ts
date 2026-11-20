import { Reservation, ReservationStatus, TrafficTicket, VehicleDamage } from '../types';
import { bookingKey } from './duplicates';
import { USD_TO_JOD_RATE } from '../constants';
import { lateFeeOf } from './lateReturn';

export interface BookingRevenue {
  /** Booking amount: rental, extras, upgrades and extensions (plus an applied late fee). */
  rental: number;
  damages: number;
  tickets: number;
  /** Fuel, cleaning, late return and other charges raised at return. */
  other: number;
  total: number;
}

export interface ChargeRegisters { trafficTickets?: TrafficTicket[]; vehicleDamages?: VehicleDamage[] }

/** Every booking counts in the summaries except cancelled and no-show ones (pending included). */
export const countsInSummary = (r: Pick<Reservation, 'status'> | null | undefined): boolean =>
  !!r && r.status !== ReservationStatus.CANCELLED && r.status !== ReservationStatus.NO_SHOW;

/** The booking amount as a number (an empty or text amount counts as 0, never as text). */
export const amountOf = (r: Pick<Reservation, 'amount'> | null | undefined): number => {
  const n = Number(r?.amount);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const toUSD = (amount: number, currency: 'JOD' | 'USD') => (currency === 'JOD' ? amount / USD_TO_JOD_RATE : amount) || 0;
const round = (n: number) => Math.round(n * 100) / 100;

/** Groups the damage and ticket registers (amounts in JOD) by booking number. */
export function indexRegisters({ trafficTickets = [], vehicleDamages = [] }: ChargeRegisters) {
  const tickets = new Map<string, TrafficTicket[]>();
  const damages = new Map<string, VehicleDamage[]>();
  // Keyed by the booking number without case or spaces ("cjt-226505123" = "CJT-226505123"), the same way the
  // add-ons list matches them; an exact key left a ticket on the booking but out of its revenue and commission.
  trafficTickets.forEach(t => { const k = bookingKey(t); if (k) tickets.set(k, [...(tickets.get(k) || []), t]); });
  vehicleDamages.forEach(d => { const k = bookingKey(d); if (k) damages.set(k, [...(damages.get(k) || []), d]); });
  return { tickets, damages };
}

/**
 * Everything a booking brought in, in USD. Damages and tickets come from their registers;
 * return charges that never reached a register are added from the booking itself, so nothing
 * is counted twice.
 */
export function bookingRevenue(r: Reservation, idx: ReturnType<typeof indexRegisters>): BookingRevenue {
  const late = lateFeeOf(r)?.status === 'APPLIED' && !lateFeeOf(r)!.isWaived ? lateFeeOf(r)!.amount : 0;
  const rental = amountOf(r) + late;

  const regDamages = idx.damages.get(bookingKey(r)) || [];
  const regTickets = idx.tickets.get(bookingKey(r)) || [];
  let damages = regDamages.reduce((s, d) => s + toUSD(d.amount, 'JOD'), 0);
  let tickets = regTickets.reduce((s, t) => s + toUSD(t.amount, 'JOD'), 0);
  let other = 0;

  const rc = r.returnCharges;
  (rc?.items || []).forEach(it => {
    const v = toUSD(it.amount, rc!.currency);
    if (it.kind === 'damage') {
      if (!regDamages.some(d => d.id === `vd-${r.id}-${it.id}`)) damages += v;
    } else if (it.kind === 'ticket') {
      const inRegister = it.ticketId ? regTickets.some(t => t.id === it.ticketId) : regTickets.some(t => t.id === `tt-${r.id}-${it.id}`);
      if (!inRegister) tickets += v;
    } else {
      other += v;
    }
  });

  return { rental: round(rental), damages: round(damages), tickets: round(tickets), other: round(other), total: round(rental + damages + tickets + other) };
}
