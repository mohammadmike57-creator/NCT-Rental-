import { AppData, Reservation, ReservationStatus } from '../types';

/**
 * One booking = one record. Booking numbers are compared ignoring case and spaces
 * ("bk-1001", "BK-1001 " and "BK - 1001" are the same booking).
 */
export const bookingKey = (r: { bookingId?: string; invoice?: string }): string =>
  String(r.bookingId || r.invoice || '').trim().toUpperCase().replace(/\s+/g, '');

/** Every record in the data, in storage order. */
export const flatten = (data: AppData): Reservation[] =>
  Object.values(data || {}).flatMap(months => Object.values(months || {}).flat() as Reservation[]);

/** Booking numbers that more than one record uses. */
export function duplicateKeys(list: Reservation[]): Set<string> {
  const seen = new Set<string>();
  const dup = new Set<string>();
  list.forEach(r => {
    const k = bookingKey(r);
    if (!k) return;
    if (seen.has(k)) dup.add(k); else seen.add(k);
  });
  return dup;
}

/** The record already saved under this booking number, if any (the most advanced one when several). */
export function findBooking(data: AppData, bookingId: string | undefined, excludeId?: string): Reservation | undefined {
  const k = bookingKey({ bookingId });
  if (!k) return undefined;
  const hits = flatten(data).filter(r => r.id !== excludeId && bookingKey(r) === k);
  const rank = (r: Reservation) => (r.dropOffCompleted ? 3 : r.voucherSubmitted ? 2 : r.status === ReservationStatus.CANCELLED || r.status === ReservationStatus.NO_SHOW ? 0 : 1);
  return hits.sort((a, b) => rank(b) - rank(a))[0];
}

/** "closed agreement", "open agreement (car out)", "cancelled reservation"… for messages. */
export function describeBooking(r: Reservation): string {
  if (r.status === ReservationStatus.CANCELLED) return 'cancelled reservation';
  if (r.status === ReservationStatus.NO_SHOW) return 'no-show reservation';
  if (r.dropOffCompleted) return 'closed agreement';
  if (r.voucherSubmitted) return 'open agreement (the car is out)';
  if (r.awaitingConfirmation) return 'unlisted agreement';
  return 'reservation';
}
