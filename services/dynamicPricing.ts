/**
 * Rate & price rules for the OTA XML channels: seasonal and event rates, last-minute (lead-time)
 * pricing and availability pricing, calculated day by day.
 *
 * Order for every rental day:
 *   1. base daily rate (the channel's published rate for that day's period and the rental length)
 *   2. seasonal / event rule (highest priority wins; all matching rules only when stacking is on)
 *   3. last-minute rule (lead time between booking and pick-up; may be split by cars available)
 *   4. availability rule (skipped when the last-minute rule already priced availability)
 *   5. minimum / maximum daily price
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
const EVENT_KINDS: SeasonKind[] = ['eid_fitr', 'eid_adha', 'ramadan', 'christmas', 'new_year', 'national', 'custom'];
const HIGH_KINDS: SeasonKind[] = ['high', 'peak'];

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

export interface AvailabilityBand { minCars: number; maxCars: number | null; adjust: PriceAdjust }

export interface LeadTier {
  id: string;
  fromHours: number;         // inclusive
  toHours: number | null;    // exclusive; null = no upper limit
  adjust: PriceAdjust;
  /** Optional split by cars still available; when one matches it replaces `adjust` and the availability rule is not applied again. */
  byAvailability?: AvailabilityBand[];
}

export type AvailabilityWhen = 'all' | 'high' | 'event' | 'weekend';
export interface AvailabilityTier extends AvailabilityBand {
  id: string;
  minDaily?: number;
  maxDaily?: number;
  when: AvailabilityWhen;
  locations: string[];       // empty = every location
}

export interface PriceLimits { minDaily?: number; maxDaily?: number }

export interface DynamicPricingConfig {
  seasonal: { enabled: boolean; stack: boolean; rules: SeasonRule[] };
  leadTime: { enabled: boolean; channels: PriceChannelType[]; tiers: LeadTier[] };
  availability: { enabled: boolean; channels: PriceChannelType[]; tiers: AvailabilityTier[] };
  limits: PriceLimits & { groups: Record<string, PriceLimits> };
  /** 0 = Sunday … 6 = Saturday. Jordan's weekend is Friday and Saturday. */
  weekendDays: number[];
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
  availability: { enabled: false, channels: [], tiers: [] },
  limits: { groups: {} },
  weekendDays: [5, 6],
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
  availableCars: number;
  /** The published daily rate for one rental day (its period, the whole rental's length); null when no period covers it. */
  baseDaily: (date: string, rentalDays: number) => number | null;
  graceMinutes?: number;
  mode?: ChannelRateMode;
}

export interface PriceStep { stage: 'season' | 'lead' | 'availability' | 'limit'; label: string; from: number; to: number }
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

const inBand = (b: { minCars: number; maxCars: number | null }, n: number) => n >= b.minCars && (b.maxCars == null || n <= b.maxCars);

export function priceRental(cfg: DynamicPricingConfig, req: PriceRequest): PriceResult {
  const mode = req.mode || 'dynamic';
  const days = rentalDayCount(req.pickup, req.dropOff, req.graceMinutes);
  const leadHours = (parse(req.pickup).getTime() - parse(req.now).getTime()) / 3600000;
  const notes: string[] = [];
  if (req.availableCars <= 0) return { bookable: false, reason: 'No car of this group is free for these dates', days, leadHours, perDay: [], total: 0, notes };

  const full = mode === 'dynamic';
  const leadOn = full && cfg.leadTime.enabled && listHas(cfg.leadTime.channels, req.channel);
  const availOn = full && cfg.availability.enabled && listHas(cfg.availability.channels, req.channel);
  const lead = leadOn ? cfg.leadTime.tiers.find(t => leadHours >= t.fromHours && (t.toHours == null || leadHours < t.toHours)) : undefined;
  const leadBand = lead?.byAvailability?.find(b => inBand(b, req.availableCars));
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
      const a = leadBand ? leadBand.adjust : lead.adjust;
      const span = `${lead.fromHours}–${lead.toHours == null ? '∞' : lead.toHours} h before pick-up`;
      const label = leadBand ? `Last minute ${span}, ${bandLabel(leadBand)} (${describeAdjust(a)})` : `Last minute ${span} (${describeAdjust(a)})`;
      if (a.type !== 'none') step('lead', label, applyAdjust(rate, a));
    }

    // 4. Availability (not again when the last-minute rule already priced it).
    if (availOn && !leadBand) {
      const weekend = cfg.weekendDays.includes(d.getDay());
      const t = cfg.availability.tiers.find(x => inBand(x, req.availableCars) && listHas(x.locations.map(upper), upper(req.location))
        && (x.when === 'all' || (x.when === 'weekend' && weekend) || (x.when === 'event' && !!rule && EVENT_KINDS.includes(rule.kind))
          || (x.when === 'high' && !!rule && HIGH_KINDS.includes(rule.kind))));
      if (t) {
        if (t.adjust.type !== 'none') step('availability', `${bandLabel(t)} (${describeAdjust(t.adjust)})`, applyAdjust(rate, t.adjust));
        if (t.minDaily != null && rate < t.minDaily) step('limit', `Availability minimum ${t.minDaily}`, t.minDaily);
        if (t.maxDaily != null && rate > t.maxDaily) step('limit', `Availability maximum ${t.maxDaily}`, t.maxDaily);
      }
    }

    // 5. Minimum / maximum daily price.
    if (limits.minDaily != null && rate < limits.minDaily) step('limit', `Minimum daily price ${limits.minDaily}`, limits.minDaily);
    if (limits.maxDaily != null && rate > limits.maxDaily) step('limit', `Maximum daily price ${limits.maxDaily}`, limits.maxDaily);
    rate = Math.max(0, round(rate));
    perDay.push({ date, base: round(base), rate, rule: rule?.name, ruleKind: rule?.kind, steps });
  }
  if (leadBand) notes.push('Availability is priced inside the last-minute rule, so the availability rule is not applied again.');
  if (cfg.seasonal.enabled && cfg.seasonal.stack) notes.push('Stacking is on: every matching seasonal rule is applied, in priority order.');
  return { bookable: true, days, leadHours, perDay, total: round(perDay.reduce((s, d) => s + d.rate, 0)), notes };
}

export const bandLabel = (b: { minCars: number; maxCars: number | null }) =>
  b.maxCars == null ? `${b.minCars}+ cars available` : b.minCars === b.maxCars ? `${b.minCars} car${b.minCars === 1 ? '' : 's'} available` : `${b.minCars}–${b.maxCars} cars available`;

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
