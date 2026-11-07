/**
 * Rate & price rules for the OTA XML channels: seasonal and event rates, last-minute (lead-time)
 * pricing, calculated day by day. Prices never depend on how many cars are free.
 *
 * Order for every rental day:
 *   1. base daily rate (the channel's published rate for that day's period and the rental length)
 *   2. seasonal / event rule (highest priority wins; all matching rules only when stacking is on)
 *   3. last-minute rule (lead time between booking and pick-up)
 *   4. minimum / maximum daily price
 * Fees, extras, tax and promotions are added afterwards by the booking engine, as before.
 *
 * The server runs the same calculation (ota/ChannelDynamicPricing.java); the tests of both use
 * the same cases, so the preview here always matches what a broker is quoted.
 */

/** Sales channels a rule can be limited to. Every channel connects through OTA XML / REST; website and app booking engines connect the same way. */
export type PriceChannelType = 'website' | 'app' | 'walk_in' | 'broker' | 'ota' | 'corporate' | 'travel_agent';
export const PRICE_CHANNELS: [PriceChannelType, string][] = [
  ['website', 'Direct website'], ['app', 'Mobile app'], ['walk_in', 'Walk-in / counter'], ['broker', 'Brokers'], ['ota', 'OTAs'],
  ['corporate', 'Corporate accounts'], ['travel_agent', 'Travel agents'],
];

export type AdjustType = 'none' | 'percent' | 'amount' | 'fixed';
/** percent: +20 / -10 (% of the rate) · amount: +10 / -5 a day · fixed: the daily rate itself. */
export interface PriceAdjust { type: AdjustType; value: number }

export type SeasonKind = 'low' | 'normal' | 'shoulder' | 'high' | 'peak' | 'eid_fitr' | 'eid_adha' | 'ramadan'
  | 'christmas' | 'new_year' | 'national' | 'custom';
export const SEASON_KINDS: [SeasonKind, string][] = [
  ['low', 'Low season'], ['normal', 'Normal season'], ['shoulder', 'Shoulder season'], ['high', 'High season'], ['peak', 'Peak season'],
  ['eid_fitr', 'Eid Al-Fitr'], ['eid_adha', 'Eid Al-Adha'], ['ramadan', 'Ramadan'], ['christmas', 'Christmas'], ['new_year', 'New Year'],
  ['national', 'National holiday'], ['custom', 'Custom event'],
];

export interface SeasonRule {
  id: string;
  name: string;
  kind: SeasonKind;
  from: string;              // YYYY-MM-DD, inclusive
  to: string;                // YYYY-MM-DD, inclusive
  priority: number;          // 1 = highest
  active: boolean;
  groups: string[];          // SIPP codes; empty = every car group
  locations: string[];       // pick-up location codes; empty = every location
  channels: PriceChannelType[]; // empty = every channel type
  adjust: PriceAdjust;
  minDays?: number;
  maxDays?: number;
  blackout: string[];        // dates the rule does not apply on
  notes?: string;
}

export interface LeadTier {
  id: string;
  fromHours: number;         // inclusive
  toHours: number | null;    // exclusive; null = no upper limit
  /** The change for every rental length (used when no length columns are set). */
  adjust: PriceAdjust;
  /** One change per rental-length column (leadTime.lengthBands), same order. */
  byLength?: PriceAdjust[];
}

/** A rental-length column, like the rate bands: 1–2 days, 3–6 days, 7+ days. */
export interface LengthBand { fromDay: number; toDay: number | null }
export const lengthLabel = (b: LengthBand) => (b.toDay == null ? `${b.fromDay}+ days` : b.fromDay === b.toDay ? `${b.fromDay} day${b.fromDay === 1 ? '' : 's'}` : `${b.fromDay}–${b.toDay} days`);

/** The last-minute change for one booking window and rental length. */
export function leadAdjustFor(cfg: DynamicPricingConfig, tier: LeadTier, rentalDays: number): { adjust: PriceAdjust; band?: LengthBand } {
  const bands = cfg.leadTime.lengthBands || [];
  if (bands.length && tier.byLength?.length) {
    const i = bands.findIndex(b => rentalDays >= b.fromDay && (b.toDay == null || rentalDays <= b.toDay));
    if (i >= 0 && tier.byLength[i]) return { adjust: tier.byLength[i], band: bands[i] };
  }
  return { adjust: tier.adjust };
}

export interface PriceLimits { minDaily?: number; maxDaily?: number }

export interface DynamicPricingConfig {
  seasonal: { enabled: boolean; stack: boolean; rules: SeasonRule[] };
  /** lengthBands: optional rental-length columns; empty = one change for every length. */
  leadTime: { enabled: boolean; channels: PriceChannelType[]; tiers: LeadTier[]; lengthBands?: LengthBand[] };
  limits: PriceLimits & { groups: Record<string, PriceLimits> };
}

export interface PricingChange { at: string; by: string; action: string; detail: string; before?: string; after?: string }

/** What is stored under "channelPricing": a draft being edited and the version brokers are quoted. */
export interface DynamicPricingState {
  draft: DynamicPricingConfig;
  published?: DynamicPricingConfig;
  version: number;
  publishedAt?: string;
  publishedBy?: string;
  history: PricingChange[];
}

export const emptyPricingConfig = (): DynamicPricingConfig => ({
  seasonal: { enabled: false, stack: false, rules: [] },
  leadTime: { enabled: false, channels: [], tiers: [] },
  limits: { groups: {} },
});

export const emptyPricingState = (): DynamicPricingState => ({ draft: emptyPricingConfig(), version: 0, history: [] });

/** How a broker is priced: today's published net rates, the full rules, or the seasonal rules only. */
export type ChannelRateMode = 'net' | 'dynamic' | 'restricted';

// ---------------------------------------------------------------- calculation

export interface PriceRequest {
  group: string;
  location: string;
  channel: PriceChannelType;
  pickup: string;            // YYYY-MM-DDTHH:mm, branch local time
  dropOff: string;
  now: string;               // when the booking is made, branch local time
  /** The published daily rate for one rental day (its period, the whole rental's length); null when no period covers it. */
  baseDaily: (date: string, rentalDays: number) => number | null;
  graceMinutes?: number;
  mode?: ChannelRateMode;
}

export interface PriceStep { stage: 'season' | 'lead' | 'limit'; label: string; from: number; to: number }
export interface PricedDay { date: string; base: number; rate: number; rule?: string; ruleKind?: SeasonKind; steps: PriceStep[] }
export interface PriceResult {
  bookable: boolean;
  reason?: string;
  days: number;
  leadHours: number;
  perDay: PricedDay[];
  total: number;
  notes: string[];
}

const round = (n: number) => Math.round(n * 100) / 100;
const parse = (s: string) => new Date(s.length === 10 ? `${s}T00:00` : s);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Every started 24 hours is a day, except up to graceMinutes past a full day (as the booking engine counts). */
export function rentalDayCount(pickup: string, dropOff: string, graceMinutes = 0): number {
  const minutes = Math.floor((parse(dropOff).getTime() - parse(pickup).getTime()) / 60000);
  if (minutes <= 0) return 1;
  let full = Math.floor(minutes / 1440);
  const over = minutes % 1440;
  if (over > 0 && (full === 0 || over > Math.max(0, graceMinutes))) full++;
  return Math.max(1, full);
}

export function applyAdjust(rate: number, a: PriceAdjust): number {
  switch (a.type) {
    case 'percent': return rate * (1 + (a.value || 0) / 100);
    case 'amount': return rate + (a.value || 0);
    case 'fixed': return a.value || 0;
    default: return rate;
  }
}

export function describeAdjust(a: PriceAdjust, currency = ''): string {
  const c = currency ? ` ${currency}` : '';
  switch (a.type) {
    case 'percent': return `${a.value >= 0 ? '+' : ''}${a.value}%`;
    case 'amount': return `${a.value >= 0 ? '+' : ''}${a.value}${c} a day`;
    case 'fixed': return `${a.value}${c} a day`;
    default: return 'no change';
  }
}

const listHas = <T,>(list: T[] | undefined, v: T) => !list || list.length === 0 || list.includes(v);
const upper = (s: string) => (s || '').trim().toUpperCase();

/** Seasonal rules that apply to one day, highest priority first. */
export function seasonRulesFor(cfg: DynamicPricingConfig, day: string, req: Pick<PriceRequest, 'group' | 'location' | 'channel'>, rentalDays: number): SeasonRule[] {
  return cfg.seasonal.rules
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.active && r.from <= day && day <= r.to
      && listHas(r.groups.map(upper), upper(req.group))
      && listHas(r.locations.map(upper), upper(req.location))
      && listHas(r.channels, req.channel)
      && !(r.blackout || []).includes(day)
      && (!r.minDays || rentalDays >= r.minDays)
      && (!r.maxDays || rentalDays <= r.maxDays))
    .sort((a, b) => (a.r.priority - b.r.priority) || (a.i - b.i))
    .map(({ r }) => r);
}


export function priceRental(cfg: DynamicPricingConfig, req: PriceRequest): PriceResult {
  const mode = req.mode || 'dynamic';
  const days = rentalDayCount(req.pickup, req.dropOff, req.graceMinutes);
  const leadHours = (parse(req.pickup).getTime() - parse(req.now).getTime()) / 3600000;
  const notes: string[] = [];

  const full = mode === 'dynamic';
  const leadOn = full && cfg.leadTime.enabled && listHas(cfg.leadTime.channels, req.channel);
  const lead = leadOn ? cfg.leadTime.tiers.find(t => leadHours >= t.fromHours && (t.toHours == null || leadHours < t.toHours)) : undefined;
  const limits = { ...cfg.limits, ...(cfg.limits.groups?.[upper(req.group)] || {}) };

  const perDay: PricedDay[] = [];
  const start = parse(req.pickup);
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const date = iso(d);
    const base = req.baseDaily(date, days);
    if (base == null) return { bookable: false, reason: `No published rate covers ${date}`, days, leadHours, perDay, total: 0, notes };
    let rate = base;
    const steps: PriceStep[] = [];
    const step = (stage: PriceStep['stage'], label: string, to: number) => { if (round(to) !== round(rate) || stage === 'season') steps.push({ stage, label, from: round(rate), to: round(to) }); rate = to; };

    // 2. Seasonal / event: the highest-priority rule replaces the rate; stacking only when switched on.
    let rule: SeasonRule | undefined;
    if (cfg.seasonal.enabled && mode !== 'net') {
      const rules = seasonRulesFor(cfg, date, req, days);
      rule = rules[0];
      (cfg.seasonal.stack ? rules : rules.slice(0, 1)).forEach(r => step('season', `${r.name} (${describeAdjust(r.adjust)})`, applyAdjust(rate, r.adjust)));
    }

    // 3. Last-minute.
    if (lead) {
      const { adjust, band } = leadAdjustFor(cfg, lead, days);
      const span = `${lead.fromHours}–${lead.toHours == null ? '∞' : lead.toHours} h before pick-up`;
      if (adjust.type !== 'none') step('lead', `Last minute ${span}${band ? `, ${lengthLabel(band)}` : ''} (${describeAdjust(adjust)})`, applyAdjust(rate, adjust));
    }

    // 4. Minimum / maximum daily price.
    if (limits.minDaily != null && rate < limits.minDaily) step('limit', `Minimum daily price ${limits.minDaily}`, limits.minDaily);
    if (limits.maxDaily != null && rate > limits.maxDaily) step('limit', `Maximum daily price ${limits.maxDaily}`, limits.maxDaily);
    rate = Math.max(0, round(rate));
    perDay.push({ date, base: round(base), rate, rule: rule?.name, ruleKind: rule?.kind, steps });
  }
  if (cfg.seasonal.enabled && cfg.seasonal.stack) notes.push('Stacking is on: every matching seasonal rule is applied, in priority order.');
  return { bookable: true, days, leadHours, perDay, total: round(perDay.reduce((s, d) => s + d.rate, 0)), notes };
}

/** Days grouped by rate and rule for a short summary, e.g. "9 × 30.00 + 3 × 45.00 (Eid Al-Fitr)". */
export function summarise(perDay: PricedDay[]): { count: number; rate: number; rule?: string }[] {
  const out: { count: number; rate: number; rule?: string }[] = [];
  perDay.forEach(d => {
    const last = out[out.length - 1];
    if (last && last.rate === d.rate && last.rule === d.rule) last.count++;
    else out.push({ count: 1, rate: d.rate, rule: d.rule });
  });
  return out;
}
