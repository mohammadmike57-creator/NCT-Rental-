import { Aggregator, RatePlan, RateTier, SippRate } from '../types';
import { isOpenEnded } from './channelManager';

/**
 * OTA XML auto-repair.
 *
 * `autoRepair` fixes every blocking error on its own and never changes a price: stray spaces and lower case in
 * SIPP codes, a car group listed twice, rental-length bands out of order, overlapping or left open before
 * another band, a first band not starting on day 1, bands without a price (those lengths were not sold anyway),
 * dates the wrong way round, and overlapping periods (the earlier one ends the day before the next starts).
 * A group priced twice with different prices keeps its first prices. Running it twice changes nothing.
 *
 * `suggestFixes` lists those fixes plus the one left to a person, a gap between periods (filling it would sell
 * dates nobody priced), each with the exact change one button makes.
 */

const clean = (code: string) => (code || '').replace(/\s+/g, '').toUpperCase();
const price = (t: RateTier) => Number(t.dailyPrice);
const sameTiers = (a: SippRate, b: SippRate) => JSON.stringify(a.tiers.map(t => [t.fromDay, t.toDay, t.dailyPrice])) === JSON.stringify(b.tiers.map(t => [t.fromDay, t.toDay, t.dailyPrice]));
const day = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const label = (t: RateTier) => (isOpenEnded(t.toDay) ? `${t.fromDay}+ days` : `${t.fromDay}–${t.toDay} days`);

function repairTiers(where: string, tiers: RateTier[], fixes: string[]): RateTier[] {
  let out = tiers.map(t => ({ ...t }));
  // Bands without a price sell nothing; dropping them changes nothing for the broker but clears the error.
  const priced = out.filter(t => price(t) > 0);
  if (priced.length && priced.length < out.length) { fixes.push(`${where}: removed ${out.length - priced.length} rental length${out.length - priced.length === 1 ? '' : 's'} without a price (they were not sold).`); out = priced; }
  const sorted = [...out].sort((a, b) => (a.fromDay ?? 0) - (b.fromDay ?? 0));
  if (sorted.some((t, i) => t !== out[i])) { fixes.push(`${where}: put the rental lengths in order.`); out = sorted; }
  if (out[0] && (out[0].fromDay == null || out[0].fromDay < 1)) { fixes.push(`${where}: the first rental length now starts on day 1.`); out[0].fromDay = 1; }
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1], cur = out[i];
    if (isOpenEnded(prev.toDay) && cur.fromDay != null && cur.fromDay - 1 >= (prev.fromDay ?? 1)) {
      prev.toDay = cur.fromDay - 1;
      fixes.push(`${where}: ${prev.fromDay}+ days now ends at day ${prev.toDay}, where the next length starts.`);
    } else if (!isOpenEnded(prev.toDay) && cur.fromDay != null && cur.fromDay <= (prev.toDay as number)) {
      const start = (prev.toDay as number) + 1;
      if (isOpenEnded(cur.toDay) || (cur.toDay as number) >= start) {
        fixes.push(`${where}: ${label(cur)} overlapped ${label(prev)}; it now starts on day ${start}.`);
        cur.fromDay = start;
      }
    }
  }
  return out;
}

function repairPlan(p: RatePlan, fixes: string[]): RatePlan {
  const name = (p.name || '').trim() || `Period from ${p.startDate || 'start'}`;
  if (name !== p.name) fixes.push(`A period without a name is now called "${name}".`);
  const rows: SippRate[] = [];
  (p.sippRates || []).forEach(r => {
    const code = clean(r.sippCode);
    if (code !== r.sippCode) fixes.push(`${name}: SIPP code "${r.sippCode}" cleaned to ${code}.`);
    const row = { ...r, sippCode: code, tiers: repairTiers(`${name} / ${code}`, r.tiers || [], fixes) };
    const twin = rows.find(x => x.sippCode === code);
    if (twin && sameTiers(twin, row)) { fixes.push(`${name}: ${code} was listed twice with the same prices; one copy removed.`); return; }
    rows.push(row);
  });
  return { ...p, name, sippRates: rows };
}

/** Errors that are fixed on their own too: overlapping periods, dates the wrong way round, a group priced twice. */
const AUTO = /^(swap|dup|ovl)-/;

/** The channel with every automatic fix applied, and what was fixed (empty when nothing needed fixing). */
export function autoRepair(agg: Aggregator): { agg: Aggregator; fixes: string[] } {
  const fixes: string[] = [];
  let work: Aggregator = { ...agg, currentRatePlans: (agg.currentRatePlans || []).map(p => repairPlan(p, fixes)) };
  // Brokers never see the system's own name: supplier code NCT becomes URD (the server still accepts NCT from
  // brokers set up with it, so nothing breaks), and a supplier name with NCT in it falls back to the company name.
  if ((agg.vendorCode || '').trim().toUpperCase() === 'NCT') {
    work = { ...work, vendorCode: 'URD' };
    fixes.push('Supplier code NCT changed to URD, so brokers never see the system name. NCT is still accepted from brokers set up with it.');
  }
  if (/\bnct\b/i.test(agg.vendorName || '')) {
    work = { ...work, vendorName: 'UR-Drive Jordan' };
    fixes.push(`Supplier name "${agg.vendorName}" changed to UR-Drive Jordan, so brokers never see the system name.`);
  }
  // One error fix at a time, then look again (ending one period can settle the next overlap).
  for (let n = 0; n < 20; n++) {
    const f = suggestFixes(work).find(x => AUTO.test(x.id));
    if (!f) break;
    work = f.apply(work);
    fixes.push(`${f.problem} Fixed: ${f.action}.`);
  }
  if (!fixes.length) return { agg, fixes };
  const at = new Date().toISOString();
  const repairLog = [...fixes.map(text => ({ at, text })), ...(agg.repairLog || [])].slice(0, 30);
  return { agg: { ...work, repairLog }, fixes };
}

export interface SuggestedFix { id: string; problem: string; action: string; apply: (a: Aggregator) => Aggregator }

/** Problems that need a decision, each with the one change a button makes. */
export function suggestFixes(agg: Aggregator): SuggestedFix[] {
  const out: SuggestedFix[] = [];
  const setPlan = (id: string, f: (p: RatePlan) => RatePlan) => (a: Aggregator): Aggregator => ({ ...a, currentRatePlans: (a.currentRatePlans || []).map(p => (p.id === id ? f(p) : p)) });
  const plans = [...(agg.currentRatePlans || [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
  plans.forEach(p => {
    if (p.startDate && p.endDate && p.startDate > p.endDate) out.push({ id: `swap-${p.id}`, problem: `${p.name} starts (${p.startDate}) after it ends (${p.endDate}).`,
      action: `Swap the dates: ${p.endDate} → ${p.startDate}`, apply: setPlan(p.id, x => ({ ...x, startDate: x.endDate, endDate: x.startDate })) });
    const seen = new Map<string, SippRate>();
    (p.sippRates || []).forEach(r => {
      const code = clean(r.sippCode);
      const first = seen.get(code);
      if (first && !sameTiers(first, r)) out.push({ id: `dup-${p.id}-${r.id}`, problem: `${p.name}: ${code} is priced twice with different prices.`,
        action: `Keep the first ${code} prices`, apply: setPlan(p.id, x => ({ ...x, sippRates: x.sippRates.filter(y => y.id !== r.id) })) });
      else if (!first) seen.set(code, r);
    });
  });
  for (let i = 1; i < plans.length; i++) {
    const a = plans[i - 1], b = plans[i];
    if (!a.endDate || !b.startDate || a.startDate > a.endDate || b.startDate > b.endDate) continue;
    if (b.startDate <= a.endDate && day(b.startDate, -1) >= a.startDate) out.push({ id: `ovl-${a.id}-${b.id}`, problem: `"${a.name}" and "${b.name}" overlap, so prices are ambiguous.`,
      action: `End "${a.name}" on ${day(b.startDate, -1)}`, apply: setPlan(a.id, x => ({ ...x, endDate: day(b.startDate, -1) })) });
    else if (b.startDate > day(a.endDate, 1)) out.push({ id: `gap-${a.id}-${b.id}`, problem: `No rates from ${day(a.endDate, 1)} to ${day(b.startDate, -1)}: brokers get no car then.`,
      action: `Extend "${a.name}" to ${day(b.startDate, -1)}`, apply: setPlan(a.id, x => ({ ...x, endDate: day(b.startDate, -1) })) });
  }
  return out;
}
