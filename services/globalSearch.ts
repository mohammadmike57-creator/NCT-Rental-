import { AppData, Reservation } from '../types';

/**
 * The month of the best booking match for the header search: exact booking number first, then part of a booking
 * number or plate, then customer name or phone. Null when nothing matches.
 */
export function findBookingMonth(reservations: AppData | null | undefined, query: string): { year: number; month: string } | null {
  const t = query.trim().toLowerCase();
  if (!t) return null;
  let best: { year: number; month: string; score: number } | null = null;
  Object.entries(reservations || {}).forEach(([y, months]) => Object.entries((months || {}) as Record<string, unknown>).forEach(([m, list]) => {
    (Array.isArray(list) ? list as Reservation[] : []).forEach(r => {
      const score = (r.bookingId || '').toLowerCase() === t ? 3
        : (r.bookingId || '').toLowerCase().includes(t) || (r.licensePlate || '').toLowerCase().includes(t) ? 2
        : (r.personName || '').toLowerCase().includes(t) || (r.contactNumber || '').toLowerCase().includes(t) ? 1 : 0;
      if (score && (!best || score > best.score)) best = { year: Number(y), month: m, score };
    });
  }));
  const hit = best as { year: number; month: string; score: number } | null;
  return hit ? { year: hit.year, month: hit.month } : null;
}
