import { applyDraft, draftFrom, emptyDraft, mergePeriods, stopSalesForChannels, BulkOptions } from '../../services/channelBulk';
import { stopSalesFor } from '../../services/channelManager';

const plan = (id: string, name: string, start: string, end: string, price: number) => ({
  id, name, startDate: start, endDate: end,
  sippRates: [{ id: `${id}-r`, sippCode: 'CDAR', tiers: [{ id: `${id}-t`, fromDay: 1, toDay: null, dailyPrice: price }] }],
}) as any;

const channel = (extra: any = {}) => ({
  id: 'agg-1', name: 'Booking.com Cars', connectionDetails: { apiUrl: '', username: '', apiKey: '' }, ratePlanHistory: [],
  currentRatePlans: [plan('p-low', 'Low season', '2026-10-01', '2026-12-14', 35), plan('p-win', 'Winter', '2027-01-06', '2027-03-31', 33)],
  extras: [{ id: 'x1', name: 'Child Seat', price: 7 }], termsAndConditions: 'Old terms',
  bookingRules: { freeCancellationHours: 48, minLeadHours: 2, webhookUrl: 'https://keep.me' }, ...extra,
}) as any;

const all: BulkOptions = { modules: ['rates', 'extras', 'terms', 'policies', 'pricing', 'allotments', 'currencies', 'stopSales'], ratesMode: 'merge', extrasMode: 'merge', allotmentsMode: 'merge' };

describe('multi-channel editor', () => {
  it('a draft period with the same name or dates updates the channel period and keeps its id', () => {
    const current = channel().currentRatePlans;
    const draft = [plan('d1', 'low season ', '2026-10-01', '2026-12-10', 39), plan('d2', 'Christmas', '2026-12-15', '2027-01-05', 52)];
    const merged = mergePeriods(current, draft, 'merge', 7);
    expect(merged.map(p => p.id)).toEqual(['p-win', 'p-low', 'plan-7-1']);
    expect(mergePeriods(current, draft, 'replace', 7).map(p => p.id)).toEqual(['p-low', 'plan-7-1']);
  });

  it('applies only the chosen modules and says what changed', () => {
    const draft = { ...emptyDraft(), ratePlans: [plan('d1', 'Low season', '2026-10-01', '2026-12-14', 39)], terms: 'New terms',
      extras: [{ id: 'x1', name: 'Child Seat', price: 8 }, { id: 'x2', name: 'GPS', price: 6 }], policies: { freeCancellationHours: 24 } };
    const { next, changes } = applyDraft(channel(), draft, { ...all, modules: ['rates', 'extras', 'policies'] }, 7);
    expect(next.termsAndConditions).toBe('Old terms');
    expect(next.currentRatePlans).toHaveLength(2);
    expect(next.extras.map((e: any) => `${e.id}:${e.price}`)).toEqual(['x1:8', 'x2:6']);
    expect(next.bookingRules).toMatchObject({ freeCancellationHours: 24, minLeadHours: 2, webhookUrl: 'https://keep.me' });
    expect(changes).toEqual(['Rates: 2 → 2 periods · prices: 1 up', 'Extras: 1 added, 1 repriced', 'Policies: free cancellation 48 h → 24 h']);
  });

  it('a cancellation schedule replaces the free-cancellation window and is not reported twice', () => {
    const draft = { ...emptyDraft(), policies: { freeCancellationHours: 48, cancellationTiers: [{ hoursBefore: 24, feePercent: 100 }] } };
    const { next, changes } = applyDraft(channel(), draft, all);
    expect(next.bookingRules.freeCancellationHours).toBeUndefined();
    expect(changes).toEqual(['Policies: cancellation schedule — → <24h 100%']);
    expect(applyDraft(next, draft, all).changes).toEqual([]);
  });

  it('nothing to change gives no change lines', () => {
    const agg = channel();
    expect(applyDraft(agg, draftFrom(agg), all).changes).toEqual([]);
  });

  it('stop sales from the editor apply only to the chosen channels', () => {
    const draft = { ...emptyDraft(), stopSales: [{ id: 'tmp', type: 'category', target: 'SUV', startDate: '2026-12-20', endDate: '2026-12-31', reason: 'Peak' }] } as any;
    const made = stopSalesForChannels(draft, ['agg-1', 'agg-2'], 5);
    expect(made).toEqual([expect.objectContaining({ id: 'ss-5-0', channelIds: ['agg-1', 'agg-2'] })]);
    const global = { id: 'g', type: 'category', target: 'Van', startDate: '2026-12-01', endDate: '2026-12-02', reason: '' } as any;
    expect(stopSalesFor([global, ...made], 'agg-2').map(s => s.id)).toEqual(['g', 'ss-5-0']);
    expect(stopSalesFor([global, ...made], 'agg-3').map(s => s.id)).toEqual(['g']);
  });
});
