import {
  buildQuote, checkWellFormed, diffPlans, escapeXml, generateRateSheetXml, generateVehAvailRateXml,
  hasUnpublishedChanges, isAcrissCode, nextVersion, rentalDays, validateChannel,
} from '../../services/channelManager';
import { Aggregator, Fleet, StopSale, TransmissionType } from '../../types';

const fleet: Fleet = [
  { id: 'v1', modelName: 'Toyota Corolla', licensePlate: '1', registrationExpiry: '2027-01-01', category: 'Standard', securityDeposit: 0, excess: 0, sippCode: 'SDAR', transmission: TransmissionType.AUTOMATIC },
  { id: 'v2', modelName: 'Kia Sportage', licensePlate: '2', registrationExpiry: '2027-01-01', category: 'SUV', securityDeposit: 0, excess: 0, sippCode: 'IFAR', transmission: TransmissionType.AUTOMATIC },
];

const makeAgg = (over: Partial<Aggregator> = {}): Aggregator => ({
  id: 'agg-1',
  name: 'Booking & Co <Test>',
  connectionDetails: { apiUrl: 'https://xml.partner.com/ota', username: 'nct', apiKey: 'k', environment: 'production' },
  vendorCode: 'NCT',
  locationCode: 'AMM',
  currency: 'USD',
  termsAndConditions: 'Valid passport and credit card required at pick-up.',
  extras: [{ id: 'gps', name: 'GPS "Nav"', price: 10, otaEquipType: '13', maxPerRental: 25 }],
  ratePlanHistory: [],
  currentRatePlans: [
    {
      id: 'low', name: 'Low', startDate: '2026-01-01', endDate: '2026-12-31',
      sippRates: [
        { id: 'r1', sippCode: 'SDAR', tiers: [
          { id: 't1', fromDay: 1, toDay: 3, dailyPrice: 50 },
          { id: 't2', fromDay: 4, toDay: null, dailyPrice: 40 },
        ] },
        { id: 'r2', sippCode: 'IFAR', tiers: [{ id: 't3', fromDay: 1, toDay: null, dailyPrice: 70 }] },
      ],
    },
  ],
  ...over,
});

describe('channelManager', () => {
  it('escapes XML special characters', () => {
    expect(escapeXml(`a&b<c>"d"'e`)).toBe('a&amp;b&lt;c&gt;&quot;d&quot;&apos;e');
  });

  it('validates ACRISS codes', () => {
    expect(isAcrissCode('SDAR')).toBe(true);
    expect(isAcrissCode('ZZZZ')).toBe(false);
  });

  it('counts started 24h blocks as rental days', () => {
    expect(rentalDays('2026-03-01T10:00:00', '2026-03-04T10:00:00')).toBe(3);
    expect(rentalDays('2026-03-01T10:00:00', '2026-03-04T11:00:00')).toBe(4);
    expect(rentalDays('2026-03-01T10:00:00', '2026-03-01T09:00:00')).toBe(1);
  });

  it('a well configured channel has no errors', () => {
    const r = validateChannel(makeAgg(), fleet, '2026-03-01');
    expect(r.errors).toBe(0);
    expect(r.canPublish).toBe(true);
  });

  it('detects overlapping periods, tier gaps and missing prices', () => {
    const agg = makeAgg({
      currentRatePlans: [
        { id: 'a', name: 'A', startDate: '2026-01-01', endDate: '2026-06-30', sippRates: [
          { id: 'r', sippCode: 'SDAR', tiers: [
            { id: 't1', fromDay: 1, toDay: 3, dailyPrice: 50 },
            { id: 't2', fromDay: 6, toDay: null, dailyPrice: null },
          ] },
        ] },
        { id: 'b', name: 'B', startDate: '2026-06-01', endDate: '2026-12-31', sippRates: [] },
      ],
    });
    const msgs = validateChannel(agg, fleet, '2026-03-01').issues.map(i => `${i.level}:${i.message}`);
    expect(msgs.some(m => m.startsWith('error:') && m.includes('overlap'))).toBe(true);
    expect(msgs.some(m => m.includes('no price for 4–5 day'))).toBe(true);
    expect(msgs.some(m => m.startsWith('error:') && m.includes('no valid daily price'))).toBe(true);
  });

  it('rejects plain HTTP endpoints in production', () => {
    const agg = makeAgg({ connectionDetails: { apiUrl: 'http://x.com', username: 'u', apiKey: 'k', environment: 'production' } });
    expect(validateChannel(agg, fleet, '2026-03-01').canPublish).toBe(false);
  });

  it('prices a quote with length-of-rental tiers and capped extras', () => {
    const q = buildQuote(makeAgg(), fleet, [], { pickUp: '2026-03-01T10:00:00', dropOff: '2026-03-06T10:00:00', extraIds: ['gps'] });
    const sdar = q.find(l => l.sippCode === 'SDAR')!;
    expect(sdar.days).toBe(5);
    expect(sdar.dailyRate).toBe(40);
    expect(sdar.baseTotal).toBe(200);
    expect(sdar.extras[0].total).toBe(25); // 5 x 10 capped at 25
    expect(sdar.total).toBe(225);
    expect(sdar.status).toBe('Available');
  });

  it('closes vehicle groups under a stop sale', () => {
    const stops: StopSale[] = [{ id: 's', type: 'category', target: 'SUV', startDate: '2026-03-02', endDate: '2026-03-03', reason: 'Maintenance' }];
    const q = buildQuote(makeAgg(), fleet, stops, { pickUp: '2026-03-01T10:00:00', dropOff: '2026-03-04T10:00:00' });
    expect(q.find(l => l.sippCode === 'IFAR')!.status).toBe('Closed');
    expect(q.find(l => l.sippCode === 'SDAR')!.status).toBe('Available');
  });

  it('generates well-formed OTA and rate sheet XML with escaped content', () => {
    const agg = makeAgg({ termsAndConditions: 'Terms with ]]> and <b>tags</b> & more' });
    const ota = generateVehAvailRateXml(agg, fleet, [], { pickUp: '2026-03-01T10:00:00', dropOff: '2026-03-04T10:00:00', extraIds: ['gps'] });
    const sheet = generateRateSheetXml(agg, [], fleet, { version: 3 });
    expect(checkWellFormed(ota)).toBeNull();
    expect(checkWellFormed(sheet)).toBeNull();
    expect(ota).toContain('<OTA_VehAvailRateRS xmlns="http://www.opentravel.org/OTA/2003/05"');
    expect(ota).toContain('Code="SDAR" CodeContext="SIPP"');
    expect(ota).toContain('<Equipment EquipType="13" Quantity="1">');
    expect(ota).toContain('<Description>GPS &quot;Nav&quot;</Description>');
    expect(sheet).toContain('Channel="Booking &amp; Co &lt;Test&gt;"');
    expect(sheet).toContain('<Rate MinDays="4" OpenEnded="true" DailyAmount="40.00"/>');
    const doc = new DOMParser().parseFromString(sheet, 'application/xml');
    expect(doc.getElementsByTagName('Terms')[0].textContent).toBe('Terms with ]]> and <b>tags</b> & more');
  });

  it('tracks unpublished changes, versions and diffs', () => {
    const agg = makeAgg();
    expect(hasUnpublishedChanges(agg)).toBe(true);
    expect(nextVersion(agg)).toBe(1);
    const published = makeAgg({ ratePlanHistory: [{ id: 's1', submittedAt: '2026-01-01T00:00:00Z', ratePlans: JSON.parse(JSON.stringify(agg.currentRatePlans)), version: 4 }] });
    expect(hasUnpublishedChanges(published)).toBe(false);
    expect(nextVersion(published)).toBe(5);
    const changed = JSON.parse(JSON.stringify(agg.currentRatePlans));
    changed[0].sippRates[0].tiers[0].dailyPrice = 55;
    const d = diffPlans(agg.currentRatePlans, changed);
    expect(d).toMatchObject({ increased: 1, decreased: 0, added: 0, removed: 0 });
  });
});
