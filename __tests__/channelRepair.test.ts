import { autoRepair, suggestFixes } from '../services/channelRepair';
import { validateChannel } from '../services/channelManager';
import { Aggregator, RatePlan } from '../types';

const tier = (id: string, fromDay: number | null, toDay: number | null, dailyPrice: number | null) => ({ id, fromDay, toDay, dailyPrice });
const agg = (plans: RatePlan[]): Aggregator => ({
  id: 'a1', name: 'Hogicar', channelCode: 'HOG', currency: 'USD', status: 'active',
  connectionDetails: { apiUrl: '', username: '', apiKey: '' }, currentRatePlans: plans, ratePlanHistory: [], extras: [], termsAndConditions: 'Terms and conditions text.',
} as unknown as Aggregator);

describe('OTA XML auto-repair', () => {
  test('cleans SIPP codes, orders and closes bands, drops unpriced bands and exact duplicates; never changes a price', () => {
    const plan: RatePlan = { id: 'p1', name: 'Low Season', startDate: '2026-11-18', endDate: '2026-11-30', sippRates: [
      { id: 'r1', sippCode: 'IDAR ', tiers: [tier('t2', 3, null, 14), tier('t1', 1, 2, 70)] },
      { id: 'r2', sippCode: 'cdar', tiers: [tier('t1', 1, null, 40), tier('t2', 7, null, 30), tier('t3', 14, null, null)] },
      { id: 'r3', sippCode: 'CDAR', tiers: [tier('t1', 1, 6, 40), tier('t2', 7, null, 30)] },
      { id: 'r4', sippCode: 'ECMR', tiers: [tier('t1', 1, 5, 30), tier('t2', 4, null, 25)] },
    ] };
    const { agg: fixed, fixes } = autoRepair(agg([plan]));
    const rates = fixed.currentRatePlans[0].sippRates;
    expect(rates.map(r => r.sippCode)).toEqual(['IDAR', 'CDAR', 'ECMR']);   // CDAR twice, same prices → once
    expect(rates[0].tiers.map(t => [t.fromDay, t.toDay, t.dailyPrice])).toEqual([[1, 2, 70], [3, null, 14]]);
    expect(rates[1].tiers.map(t => [t.fromDay, t.toDay, t.dailyPrice])).toEqual([[1, 6, 40], [7, null, 30]]);
    expect(rates[2].tiers.map(t => [t.fromDay, t.toDay])).toEqual([[1, 5], [6, null]]);
    expect(fixes.length).toBeGreaterThanOrEqual(5);
    expect(fixed.repairLog?.length).toBe(fixes.length);
    // prices untouched
    expect(rates.flatMap(r => r.tiers.map(t => t.dailyPrice))).toEqual([70, 14, 40, 30, 30, 25]);
    // the blocking SIPP and band errors are gone
    expect(validateChannel(fixed, []).issues.filter(i => i.level === 'error' && /SIPP|overlap|open-ended|priced more than once/.test(i.message))).toEqual([]);
    // a second run finds nothing
    expect(autoRepair(fixed).fixes).toEqual([]);
  });

  test('a clean channel is returned as it is', () => {
    const a = agg([{ id: 'p1', name: 'Winter', startDate: '2026-12-01', endDate: '2027-02-28', sippRates: [{ id: 'r1', sippCode: 'CDAR', tiers: [tier('t1', 1, null, 40)] }] }]);
    const r = autoRepair(a);
    expect(r.fixes).toEqual([]);
    expect(r.agg).toBe(a);
  });

  test('blocking errors are fixed on their own; a gap between periods is left to a person', () => {
    const a = agg([
      { id: 'p1', name: 'Winter', startDate: '2026-12-01', endDate: '2027-01-15', sippRates: [
        { id: 'r1', sippCode: 'CDAR', tiers: [tier('t1', 1, null, 40)] }, { id: 'r2', sippCode: 'CDAR', tiers: [tier('t1', 1, null, 45)] }] },
      { id: 'p2', name: 'Spring', startDate: '2027-01-10', endDate: '2027-03-31', sippRates: [{ id: 'r1', sippCode: 'CDAR', tiers: [tier('t1', 1, null, 50)] }] },
      { id: 'p3', name: 'Summer', startDate: '2027-06-30', endDate: '2027-04-10', sippRates: [{ id: 'r1', sippCode: 'CDAR', tiers: [tier('t1', 1, null, 60)] }] },
    ]);
    const { agg: fixed, fixes } = autoRepair(a);
    const byId = (id: string) => fixed.currentRatePlans.find(p => p.id === id)!;
    expect(byId('p1').endDate).toBe('2027-01-09');                                // overlap: Winter ends before Spring
    expect(byId('p1').sippRates.map(r => r.tiers[0].dailyPrice)).toEqual([40]);   // priced twice: first prices kept
    expect([byId('p3').startDate, byId('p3').endDate]).toEqual(['2027-04-10', '2027-06-30']);   // dates swapped
    expect(fixes.length).toBe(3);
    expect(validateChannel(fixed, []).errors).toBe(0);
    expect(autoRepair(fixed).fixes).toEqual([]);
    // what is left is the gap between Spring and Summer, as a button
    expect(suggestFixes(fixed).map(f => f.action)).toEqual(['Extend "Spring" to 2027-04-09']);
  });
});
