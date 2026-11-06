import { brokerDaily, cleanTerms, describeTerms } from '../../components/channel/PriceRulesView';

// Same cases as ChannelGatewayIntegrationTest.commercialTermsAddUpByDayAndBookingWindow (server side).
describe('broker price rules', () => {
  const terms = { markupPercent: 10, roundTo: 1 as const, pickupDayPercent: { fri: 15 }, earlyBooking: { days: 60, percent: -8 }, lastMinute: { hours: 48, percent: 5 } };
  const friday = new Date(2027, 2, 12, 10);

  it('adds every rule that applies', () => {
    expect(brokerDaily(terms, 'CDAR', 40, friday, new Date(2027, 2, 2, 10)).pct).toBe(25);
    expect(brokerDaily(terms, 'CDAR', 40, friday, new Date(2026, 11, 12, 10)).pct).toBe(17);
    const sat = new Date(2027, 2, 13, 10);
    expect(brokerDaily(terms, 'CDAR', 40, sat, friday).pct).toBe(15);
  });

  it('rounds like the server and never goes below a cent', () => {
    expect(brokerDaily({ markupPercent: 10, roundTo: 1 }, 'CDAR', 39.9, friday, friday).daily).toBe(44);
    expect(brokerDaily({ markupPercent: -90, markupPerDay: -100 }, 'CDAR', 40, friday, friday).daily).toBe(0.01);
  });

  it('a group markup replaces the channel markup', () => {
    expect(brokerDaily({ markupPercent: 10, groups: { SDAR: { markupPercent: -5 } } }, 'SDAR', 40, friday, friday).daily).toBe(38);
  });

  it('empty terms are no terms', () => {
    expect(cleanTerms({ markupPercent: 0, groups: { CDAR: {} }, minRentalDays: 1, earlyBooking: { days: 30 } })).toEqual({});
    expect(describeTerms({}, 'JOD')).toEqual([]);
    expect(describeTerms({ markupPercent: -5, blackouts: [{ from: '2027-05-03', to: '' }] }, 'JOD'))
      .toEqual(['Discount 5 % on every car group', 'Stop sale 2027-05-03 (all groups)']);
  });
});
