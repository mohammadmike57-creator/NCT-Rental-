import { removeBrokerStopSale } from '../services/channelManager';
import { Aggregator } from '../types';

const stop = { from: '2027-01-01', to: '2027-02-28', note: 'Sold out' };
const other = { from: '2027-03-01', to: '2027-03-05', groups: ['CCAR'] };
const agg = (): Aggregator => ({
  id: 'a', name: 'Hogicar', connectionDetails: { apiUrl: '', username: '', apiKey: '' }, currentRatePlans: [], ratePlanHistory: [], extras: [], termsAndConditions: '',
  bookingRules: { commercial: { markupPercent: 5, blackouts: [stop, other], version: 3 } },
  commercialDraft: { markupPercent: 5, blackouts: [stop, other] },
} as unknown as Aggregator);

describe('removeBrokerStopSale', () => {
  it('removes the stop sale from the live rules and the draft at once, as a new version', () => {
    const out = removeBrokerStopSale(agg(), stop, 'Admin');
    expect(out.bookingRules?.commercial?.blackouts).toEqual([other]);
    expect(out.commercialDraft?.blackouts).toEqual([other]);
    expect(out.bookingRules?.commercial?.version).toBe(4);
    expect(out.bookingRules?.commercial?.markupPercent).toBe(5);
    expect(out.commercialHistory?.[0].note).toBe('Stop sale 2027-01-01 → 2027-02-28 removed');
  });
  it('leaves the live rules alone when the stop sale is only in the draft', () => {
    const a = agg();
    a.bookingRules!.commercial!.blackouts = [other];
    const out = removeBrokerStopSale(a, stop);
    expect(out.bookingRules?.commercial?.version).toBe(3);
    expect(out.commercialDraft?.blackouts).toEqual([other]);
  });
});
