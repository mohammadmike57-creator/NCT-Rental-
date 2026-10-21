import { AvailableExtra, ReservationExtra } from '../types';

/** Daily price of a configured extra (older records store it as pricePerDay). */
export const extraDailyPrice = (x?: AvailableExtra) => {
  if (!x) return 0;
  const v = Number(x.defaultDailyPrice ?? (x as any).pricePerDay);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** Total of the selected extras for the given number of rental days. */
export const selectedExtrasTotal = (ids: string[] = [], available: AvailableExtra[] = [], days: number) =>
  ids.reduce((s, id) => s + extraDailyPrice(available.find(e => e.id === id)) * days, 0);

/**
 * The booking's extras list with the extras chosen in the reservation form merged in
 * (replacing any entry with the same name), so documents itemise them.
 */
export const mergeSelectedExtras = (current: ReservationExtra[] = [], ids: string[] = [], available: AvailableExtra[] = []): ReservationExtra[] => {
  const chosen = ids.map(id => available.find(e => e.id === id)).filter((x): x is AvailableExtra => !!x)
    .map(x => ({ name: x.name, dailyPrice: extraDailyPrice(x), isComplementary: false }));
  return [...current.filter(e => !chosen.some(c => c.name === e.name)), ...chosen];
};
