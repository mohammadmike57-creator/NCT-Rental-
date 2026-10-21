import { Reservation, TrafficTicket, VehicleDamage } from '../types';
import { USD_TO_JOD_RATE } from '../constants';

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

const toUSD = (amount: number, currency: 'JOD' | 'USD') => (currency === 'JOD' ? amount / USD_TO_JOD_RATE : amount) || 0;
const round = (n: number) => Math.round(n * 100) / 100;

/** Groups the damage and ticket registers (amounts in JOD) by booking number. */
export function indexRegisters({ trafficTickets = [], vehicleDamages = [] }: ChargeRegisters) {
  const tickets = new Map<string, TrafficTicket[]>();
  const damages = new Map<string, VehicleDamage[]>();
  trafficTickets.forEach(t => { if (t.bookingId) tickets.set(t.bookingId, [...(tickets.get(t.bookingId) || []), t]); });
  vehicleDamages.forEach(d => { if (d.bookingId) damages.set(d.bookingId, [...(damages.get(d.bookingId) || []), d]); });
  return { tickets, damages };
}

/**
 * Everything a booking brought in, in USD. Damages and tickets come from their registers;
 * return charges that never reached a register are added from the booking itself, so nothing
 * is counted twice.
 */
export function bookingRevenue(r: Reservation, idx: ReturnType<typeof indexRegisters>): BookingRevenue {
  const late = r.lateReturnFee && r.lateReturnFee.status === 'APPLIED' && !r.lateReturnFee.isWaived ? r.lateReturnFee.amount : 0;
  const rental = (r.amount || 0) + late;

  const regDamages = idx.damages.get(r.bookingId) || [];
  const regTickets = idx.tickets.get(r.bookingId) || [];
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
