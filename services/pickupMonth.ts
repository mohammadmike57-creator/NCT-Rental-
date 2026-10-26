import { Reservation } from '../types';
import { MONTHS } from '../constants';

/** The year and month a booking picks up, read from its date text (no time-zone shift). */
export const pickupMonthOf = (r: Pick<Reservation, 'startDate' | 'pickupDate'>): { y: number; m: string } | null => {
  const s = String(r.startDate || r.pickupDate || '');
  const iso = s.match(/^(\d{4})-(\d{2})/);
  if (!iso || +iso[2] < 1 || +iso[2] > 12) return null;
  return { y: +iso[1], m: MONTHS[+iso[2] - 1] };
};
