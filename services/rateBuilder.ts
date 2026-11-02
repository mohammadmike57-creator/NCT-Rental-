import { RatePlan, RateTier } from '../types';
import { findTier, tierInversions } from './channelManager';

/** A season of the rate card: its dates and how far its prices sit above (+) or below (−) the base price. */
export interface SeasonInput { name: string; startDate: string; endDate: string; adjustPercent: number }

/** A length-of-rental band and its discount on the daily price; toDay null = and longer. */
export interface BandInput { fromDay: number; toDay: number | null; discountPercent: number }

export type Rounding = 'cents' | 'half' | 'whole';

export interface BuildInput {
  seasons: SeasonInput[];
  bands: BandInput[];
  /** Daily price of a short rental (first band) at base level, per SIPP group. */
  basePrices: Record<string, number>;
  rounding: Rounding;
}

export const DEFAULT_BANDS: BandInput[] = [
  { fromDay: 1, toDay: 2, discountPercent: 0 },
  { fromDay: 3, toDay: 6, discountPercent: 5 },
  { fromDay: 7, toDay: 13, discountPercent: 10 },
  { fromDay: 14, toDay: 29, discountPercent: 15 },
  { fromDay: 30, toDay: null, discountPercent: 17 },
];

const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Jordan's usual demand pattern: busy spring and autumn, summer with the diaspora, quiet mid-winter. */
export const jordanSeasons = (year: number): SeasonInput[] => [
  { name: `Low season ${year}`, startDate: `${year}-01-01`, endDate: `${year}-02-${leap(year) ? 29 : 28}`, adjustPercent: -10 },
  { name: `Spring high ${year}`, startDate: `${year}-03-01`, endDate: `${year}-05-31`, adjustPercent: 15 },
  { name: `Summer ${year}`, startDate: `${year}-06-01`, endDate: `${year}-08-31`, adjustPercent: 10 },
  { name: `Autumn high ${year}`, startDate: `${year}-09-01`, endDate: `${year}-11-30`, adjustPercent: 15 },
  { name: `Winter ${year}`, startDate: `${year}-12-01`, endDate: `${year}-12-31`, adjustPercent: 0 },
];

export const allYearSeason = (year: number): SeasonInput[] => [
  { name: `All year ${year}`, startDate: `${year}-01-01`, endDate: `${year}-12-31`, adjustPercent: 0 },
];

export const roundPrice = (n: number, r: Rounding): number => {
  if (!(n > 0)) return 0;
  if (r === 'whole') return Math.max(1, Math.round(n));
  if (r === 'half') return Math.max(0.5, Math.round(n * 2) / 2);
  return Math.round(n * 100) / 100;
};

export const dailyPrice = (base: number, season: SeasonInput, band: BandInput, r: Rounding) =>
  roundPrice(base * (1 + (season.adjustPercent || 0) / 100) * (1 - (band.discountPercent || 0) / 100), r);

const addDay = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Problems that would make the built rate card wrong; empty when it can be applied. */
export const checkInput = (input: BuildInput): string[] => {
  const out: string[] = [];
  const seasons = [...input.seasons].sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (seasons.length === 0) out.push('Add at least one season.');
  seasons.forEach(s => {
    if (!s.name.trim()) out.push('Every season needs a name.');
    if (!s.startDate || !s.endDate) out.push(`${s.name || 'A season'}: start and end dates are required.`);
    else if (s.startDate > s.endDate) out.push(`${s.name}: starts after it ends.`);
    if (!(s.adjustPercent > -100)) out.push(`${s.name}: the adjustment must be above −100%.`);
  });
  for (let i = 1; i < seasons.length; i++) {
    const a = seasons[i - 1], b = seasons[i];
    if (b.startDate <= a.endDate) out.push(`${a.name} and ${b.name} overlap.`);
    else if (b.startDate !== addDay(a.endDate, 1)) out.push(`No season from ${addDay(a.endDate, 1)} to ${addDay(b.startDate, -1)}: nothing can be sold then.`);
  }
  const bands = [...input.bands].sort((a, b) => a.fromDay - b.fromDay);
  if (bands.length === 0) out.push('Add at least one rental-length band.');
  else {
    if (bands[0].fromDay !== 1) out.push('The first band must start at day 1.');
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i], next = bands[i + 1];
      if (b.toDay != null && b.toDay < b.fromDay) out.push(`Band ${b.fromDay}–${b.toDay} ends before it starts.`);
      if (!(b.discountPercent >= 0 && b.discountPercent < 100)) out.push(`Band from day ${b.fromDay}: the discount must be 0–99%.`);
      if (next) {
        if (b.toDay == null) out.push(`Band from day ${b.fromDay} is open-ended but is not the last one.`);
        else if (next.fromDay !== b.toDay + 1) out.push(`Bands must follow on: day ${b.toDay + 1} is ${next.fromDay <= b.toDay ? 'in two bands' : 'in no band'}.`);
      } else if (b.toDay != null) out.push(`The last band must be open-ended ("and longer"), or rentals over ${b.toDay} days cannot be booked.`);
    }
  }
  const groups = Object.entries(input.basePrices);
  if (groups.length === 0) out.push('Choose at least one vehicle group.');
  groups.forEach(([code, p]) => { if (!(p > 0)) out.push(`${code}: enter a base daily price.`); });
  return out;
};

/** The rate periods the input describes, one per season, every group with every band. */
export const buildRatePlans = (input: BuildInput, stamp: number = Date.now()): RatePlan[] => {
  const bands = [...input.bands].sort((a, b) => a.fromDay - b.fromDay);
  return [...input.seasons].sort((a, b) => a.startDate.localeCompare(b.startDate)).map((s, si) => ({
    id: `plan-${stamp}-${si}`,
    name: s.name.trim(),
    startDate: s.startDate,
    endDate: s.endDate,
    sippRates: Object.entries(input.basePrices).map(([code, base], gi) => ({
      id: `sipp-${stamp}-${si}-${gi}`,
      sippCode: code,
      tiers: bands.map((b, bi): RateTier => ({
        id: `tier-${stamp}-${si}-${gi}-${bi}`,
        fromDay: b.fromDay,
        toDay: b.toDay,
        dailyPrice: dailyPrice(base, s, b, input.rounding),
      })),
    })),
  }));
};

export interface AdjustInput {
  percent: number;
  amount: number;
  planIds: string[];
  sippCodes: string[];
  rounding: Rounding;
}

/** Raises or lowers prices of the chosen periods and groups by a percentage and/or a fixed amount per day. */
export const adjustRatePlans = (plans: RatePlan[], a: AdjustInput): RatePlan[] => plans.map(p => !a.planIds.includes(p.id) ? p : {
  ...p,
  sippRates: p.sippRates.map(r => !a.sippCodes.includes(r.sippCode) ? r : {
    ...r,
    tiers: r.tiers.map(t => t.dailyPrice == null ? t : {
      ...t,
      dailyPrice: roundPrice(t.dailyPrice * (1 + (a.percent || 0) / 100) + (a.amount || 0), a.rounding),
    }),
  }),
});

/** Base prices read back from an existing rate card: the first band of the first period that prices each group. */
export const basePricesFrom = (plans: RatePlan[]): Record<string, number> => {
  const out: Record<string, number> = {};
  [...plans].sort((a, b) => a.startDate.localeCompare(b.startDate)).forEach(p => (p.sippRates || []).forEach(r => {
    if (out[r.sippCode] != null) return;
    const first = [...(r.tiers || [])].sort((x, y) => (x.fromDay ?? 0) - (y.fromDay ?? 0))[0];
    if (first?.dailyPrice) out[r.sippCode] = first.dailyPrice;
  }));
  return out;
};

/** Total price of a rental of `days` days for a group in a period, or null when it cannot be priced. */
export const rentalTotal = (plan: RatePlan, sippCode: string, days: number): { daily: number; total: number } | null => {
  const rate = (plan.sippRates || []).find(r => r.sippCode === sippCode);
  const tier = rate && findTier(rate, days);
  if (!tier || !(Number(tier.dailyPrice) > 0)) return null;
  const daily = Number(tier.dailyPrice);
  return { daily, total: Math.round(daily * days * 100) / 100 };
};

/** Places where a longer rental costs less in total than a shorter one (customers would book extra days). */
export const priceInversions = (plan: RatePlan): string[] =>
  (plan.sippRates || []).flatMap(r => tierInversions(r).map(m => `${plan.name} / ${r.sippCode}: ${m}`));

// ===================================================================== period matrix

/** A rental-length band shared by every car group of a period (toDay null = and longer). */
export interface Band { fromDay: number; toDay: number | null }

/** Daily price per car group per band (null = not sold for that rental length). */
export type PriceMatrix = Record<string, (number | null)[]>;

const isOpen = (t: RateTier['toDay']) => t === null || t === undefined || t === Infinity || typeof t !== 'number';

/**
 * The period's bands, shared by all its groups: every place a band starts in any group becomes a column,
 * so a period whose groups were priced with different bands still shows every price without losing any.
 */
export function bandsOf(plan: RatePlan): Band[] {
  const starts = new Set<number>();
  let maxEnd = 0, open = false;
  (plan.sippRates || []).forEach(r => (r.tiers || []).forEach(t => {
    if (t.fromDay == null) return;
    starts.add(t.fromDay);
    if (isOpen(t.toDay)) open = true;
    else { starts.add((t.toDay as number) + 1); maxEnd = Math.max(maxEnd, t.toDay as number); }
  }));
  const list = [...starts].filter(n => n >= 1).sort((a, b) => a - b);
  if (!list.length) return [{ fromDay: 1, toDay: 2 }, { fromDay: 3, toDay: 6 }, { fromDay: 7, toDay: 13 }, { fromDay: 14, toDay: 29 }, { fromDay: 30, toDay: null }];
  if (list[0] !== 1) list.unshift(1);
  const bands: Band[] = [];
  for (let i = 0; i < list.length; i++) {
    const next = list[i + 1];
    if (next != null) bands.push({ fromDay: list[i], toDay: next - 1 });
    else if (open) bands.push({ fromDay: list[i], toDay: null });
    else if (list[i] <= maxEnd) bands.push({ fromDay: list[i], toDay: maxEnd });
  }
  return bands;
}

/** Prices of the period as a matrix over the given bands (the price of the tier covering each band's first day). */
export function matrixOf(plan: RatePlan, bands: Band[]): PriceMatrix {
  const m: PriceMatrix = {};
  (plan.sippRates || []).forEach(r => {
    m[r.sippCode] = bands.map(b => {
      const t = findTier(r, b.fromDay);
      return t && t.dailyPrice != null && Number(t.dailyPrice) > 0 ? Number(t.dailyPrice) : null;
    });
  });
  return m;
}

/** The period with every group priced over the same bands; groups keep their order, unpriced bands are left out. */
export function withMatrix(plan: RatePlan, bands: Band[], groups: string[], prices: PriceMatrix, stamp: number = Date.now()): RatePlan {
  return {
    ...plan,
    sippRates: groups.map((code, gi) => ({
      id: plan.sippRates.find(r => r.sippCode === code)?.id || `sipp-${stamp}-${gi}`,
      sippCode: code,
      tiers: bands.map((b, bi) => ({ id: `tier-${stamp}-${gi}-${bi}`, fromDay: b.fromDay, toDay: b.toDay, dailyPrice: prices[code]?.[bi] ?? null }))
        .filter(t => t.dailyPrice != null),
    })),
  };
}

/** Problems with a band layout: gaps, overlaps, or no open-ended last band. */
export function checkBands(bands: Band[]): string[] {
  const out: string[] = [];
  if (!bands.length) return ['Add at least one rental-length band.'];
  if (bands[0].fromDay !== 1) out.push('The first band must start at day 1.');
  bands.forEach((b, i) => {
    if (b.toDay != null && b.toDay < b.fromDay) out.push(`Band ${b.fromDay}–${b.toDay} ends before it starts.`);
    const n = bands[i + 1];
    if (n && b.toDay == null) out.push(`Only the last band can be open-ended.`);
    if (n && b.toDay != null && n.fromDay !== b.toDay + 1) out.push(`Day ${b.toDay + 1} is ${n.fromDay <= b.toDay ? 'in two bands' : 'in no band'}.`);
  });
  if (bands[bands.length - 1].toDay != null) out.push(`Rentals longer than ${bands[bands.length - 1].toDay} days cannot be booked: make the last band open-ended.`);
  return out;
}

export const bandLabel = (b: Band) => (b.toDay == null ? `${b.fromDay}+ days` : b.fromDay === b.toDay ? `${b.fromDay} day${b.fromDay === 1 ? '' : 's'}` : `${b.fromDay}–${b.toDay} days`);
