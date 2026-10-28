import { Aggregator, AggregatorExtra, ChannelAllotment, ChannelBookingRules, ChannelPricingRules, RatePlan, StopSale } from '../types';
import { diffPlans } from './channelManager';

/**
 * Multi-channel editor: one draft of rates, periods, extras, terms, policies, pricing, allotments,
 * currencies and stop sales, applied to any set of channels (brokers).
 */

export type BulkModule = 'rates' | 'extras' | 'terms' | 'policies' | 'pricing' | 'allotments' | 'currencies' | 'stopSales';
export type BulkMode = 'replace' | 'merge';

export const MODULE_LABEL: Record<BulkModule, string> = {
  rates: 'Rates & periods', extras: 'Extras', terms: 'Terms & conditions', policies: 'Cancellation & booking policies',
  pricing: 'Tax, mileage, covers & promotions', allotments: 'Allotments', currencies: 'Sell currencies', stopSales: 'Stop sales',
};

/** Booking rules the "policies" module carries (the rest of the booking rules stay per channel). */
export const POLICY_KEYS = [
  'paymentModel', 'freeCancellationHours', 'lateCancellationFeePercent', 'cancellationTiers', 'modificationFee', 'oneWayFee',
  'minLeadHours', 'maxHorizonDays', 'maxRentalDays', 'minDriverAge', 'maxDriverAge', 'noShowAfterHours', 'noShowFeePercent',
] as const satisfies readonly (keyof ChannelBookingRules)[];
export type PolicyKey = typeof POLICY_KEYS[number];

const POLICY_LABEL: Record<PolicyKey, string> = {
  paymentModel: 'payment model', freeCancellationHours: 'free cancellation', lateCancellationFeePercent: 'late cancellation fee',
  cancellationTiers: 'cancellation schedule', modificationFee: 'modification fee', oneWayFee: 'one-way fee', minLeadHours: 'booking cut-off',
  maxHorizonDays: 'booking horizon', maxRentalDays: 'longest rental', minDriverAge: 'minimum driver age', maxDriverAge: 'maximum driver age',
  noShowAfterHours: 'no-show after', noShowFeePercent: 'no-show fee',
};

export interface BulkDraft {
  ratePlans: RatePlan[];
  extras: AggregatorExtra[];
  terms: string;
  policies: Partial<Pick<ChannelBookingRules, PolicyKey>>;
  pricing: ChannelPricingRules;
  allotments: ChannelAllotment[];
  currencies: Record<string, number>;
  /** Blocks to add; each gets the chosen channels when applied. */
  stopSales: StopSale[];
}

export const emptyDraft = (): BulkDraft => ({ ratePlans: [], extras: [], terms: '', policies: {}, pricing: {}, allotments: [], currencies: {}, stopSales: [] });

/** A draft that starts from one channel's current settings (stop sales start empty). */
export const draftFrom = (agg: Aggregator): BulkDraft => {
  const r = agg.bookingRules || {};
  const policies: BulkDraft['policies'] = {};
  POLICY_KEYS.forEach(k => { if (r[k] !== undefined) (policies as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(r[k])); });
  // A cancellation schedule replaces the single free-cancellation window.
  if (policies.cancellationTiers?.length) { delete policies.freeCancellationHours; delete policies.lateCancellationFeePercent; }
  const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  return {
    ratePlans: copy(agg.currentRatePlans || []), extras: copy(agg.extras || []), terms: agg.termsAndConditions || '', policies,
    pricing: copy(r.pricing || {}), allotments: copy(r.allotments || []), currencies: copy(r.currencies || {}), stopSales: [],
  };
};

export interface BulkOptions {
  modules: BulkModule[];
  ratesMode: BulkMode;
  extrasMode: BulkMode;
  allotmentsMode: BulkMode;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const norm = (s?: string) => (s || '').trim().toLowerCase();

/** The channel's period a draft period updates: same name, or same dates. */
const matchPeriod = (plans: RatePlan[], p: RatePlan) =>
  plans.find(x => norm(x.name) === norm(p.name)) || plans.find(x => x.startDate === p.startDate && x.endDate === p.endDate);

/** Draft periods for a channel: matched ones keep the channel's id (so history compares them), new ones get fresh ids. */
export const mergePeriods = (current: RatePlan[], draft: RatePlan[], mode: BulkMode, stamp = Date.now()): RatePlan[] => {
  const used = new Set<string>();
  const mapped = draft.map((p, i) => {
    const hit = matchPeriod(current.filter(x => !used.has(x.id)), p);
    if (hit) used.add(hit.id);
    const copy: RatePlan = JSON.parse(JSON.stringify(p));
    copy.id = hit ? hit.id : `plan-${stamp}-${i}`;
    return copy;
  });
  return mode === 'replace' ? mapped : [...current.filter(x => !used.has(x.id)), ...mapped];
};

const fmtPolicy = (k: PolicyKey, v: unknown) => {
  if (v === undefined || v === null) return '—';
  if (k === 'cancellationTiers') return (v as { hoursBefore: number; feePercent: number }[]).map(t => `<${t.hoursBefore}h ${t.feePercent}%`).join(', ') || 'free';
  if (k === 'paymentModel') return v === 'BROKER_PREPAID' ? 'broker prepaid' : 'pay at counter';
  if (/Hours$/.test(k)) return `${v} h`;
  if (/Percent$/.test(k)) return `${v}%`;
  if (/Days$/.test(k)) return `${v} days`;
  return String(v);
};

/** One channel with the chosen modules of the draft applied, and what changed, in plain words. */
export function applyDraft(agg: Aggregator, draft: BulkDraft, opts: BulkOptions, stamp = Date.now()): { next: Aggregator; changes: string[] } {
  const on = (m: BulkModule) => opts.modules.includes(m);
  const rules: ChannelBookingRules = { ...(agg.bookingRules || {}) };
  let next: Aggregator = { ...agg };
  const changes: string[] = [];

  if (on('rates')) {
    const before = agg.currentRatePlans || [];
    const plans = mergePeriods(before, draft.ratePlans, opts.ratesMode, stamp);
    const d = diffPlans(before, plans);
    next.currentRatePlans = plans;
    if (d.total || before.length !== plans.length) {
      changes.push(`Rates: ${before.length} → ${plans.length} period${plans.length === 1 ? '' : 's'}${d.total ? ` · prices: ${[
        d.increased && `${d.increased} up`, d.decreased && `${d.decreased} down`, d.added && `${d.added} new`, d.removed && `${d.removed} removed`,
      ].filter(Boolean).join(', ')}` : ''}`);
    }
  }
  if (on('extras')) {
    const before = agg.extras || [];
    const list = opts.extrasMode === 'replace' ? draft.extras : [...before.filter(e => !draft.extras.some(x => x.id === e.id)), ...draft.extras];
    const added = list.filter(e => !before.some(x => x.id === e.id)).length;
    const removed = before.filter(e => !list.some(x => x.id === e.id)).length;
    const updated = list.filter(e => { const b = before.find(x => x.id === e.id); return b && !same(b, e); }).length;
    next.extras = JSON.parse(JSON.stringify(list));
    if (added || removed || updated) changes.push(`Extras: ${[added && `${added} added`, updated && `${updated} repriced`, removed && `${removed} removed`].filter(Boolean).join(', ')}`);
  }
  if (on('terms') && draft.terms.trim() && draft.terms !== (agg.termsAndConditions || '')) {
    next.termsAndConditions = draft.terms;
    changes.push('Terms & conditions replaced');
  }
  if (on('policies')) {
    const diffs: string[] = [];
    const schedule = !!draft.policies.cancellationTiers?.length;
    POLICY_KEYS.forEach(k => {
      const v = draft.policies[k];
      if (schedule && (k === 'freeCancellationHours' || k === 'lateCancellationFeePercent')) return;
      if (v === undefined || same(v, rules[k])) return;
      diffs.push(`${POLICY_LABEL[k]} ${fmtPolicy(k, rules[k])} → ${fmtPolicy(k, v)}`);
      (rules as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(v));
    });
    if (schedule) { delete rules.freeCancellationHours; delete rules.lateCancellationFeePercent; }
    if (diffs.length) changes.push(`Policies: ${diffs.join('; ')}`);
  }
  if (on('pricing') && !same(draft.pricing, rules.pricing || {})) {
    rules.pricing = JSON.parse(JSON.stringify(draft.pricing));
    changes.push('Tax, mileage, covers & promotions updated');
  }
  if (on('allotments')) {
    const before = rules.allotments || [];
    const list = opts.allotmentsMode === 'replace' ? draft.allotments : [...before, ...draft.allotments.filter(a => !before.some(b => same(a, b)))];
    if (!same(list, before)) { rules.allotments = JSON.parse(JSON.stringify(list)); changes.push(`Allotments: ${before.length} → ${list.length}`); }
  }
  if (on('currencies') && !same(draft.currencies, rules.currencies || {})) {
    rules.currencies = { ...draft.currencies };
    changes.push(`Sell currencies: ${Object.keys(draft.currencies).join(', ') || 'none'}`);
  }
  if (on('stopSales') && draft.stopSales.length) changes.push(`${draft.stopSales.length} stop sale${draft.stopSales.length === 1 ? '' : 's'} added`);

  if (on('policies') || on('pricing') || on('allotments') || on('currencies')) next = { ...next, bookingRules: rules };
  return { next, changes };
}

/** The draft's stop sales as new blocks limited to the chosen channels. */
export const stopSalesForChannels = (draft: BulkDraft, channelIds: string[], stamp = Date.now()): StopSale[] =>
  draft.stopSales.map((s, i) => ({ ...s, id: `ss-${stamp}-${i}`, channelIds: [...channelIds] }));
