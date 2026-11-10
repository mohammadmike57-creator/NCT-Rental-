import { addedAt, allRevenueEvents, applyMonthOverrides, bookingTotal, eventsTotal, monthlyBreakdown, revenueEvents } from '../../services/revenueByMonth';
import { indexRegisters } from '../../services/revenue';

const OCT = 9, NOV = 10;
const booking = (extra: any = {}) => ({
  id: 'r1', bookingId: 'BK-1', personName: 'John Doe', startDate: '2026-10-05T10:00', endDate: '2026-10-08T10:00',
  amount: 300, carModel: 'Kia Pegas', status: 'CONFIRMED', extras: [], ...extra,
}) as any;
const novTicket = { id: `tt-${new Date('2026-11-12T09:00:00').getTime()}`, bookingId: 'BK-1', ticketDate: '2026-10-06', amount: 71, details: 'Speeding', status: 'Not Collected' } as any;

describe('revenue by the month it was earned', () => {
  it('counts a ticket added in November for an October rental in November', () => {
    const idx = indexRegisters({ trafficTickets: [novTicket] });
    const ev = revenueEvents(booking(), 2026, OCT, idx);
    expect(ev).toEqual(expect.arrayContaining([
      expect.objectContaining({ month: OCT, kind: 'rental', amountUSD: 300 }),
      expect.objectContaining({ month: NOV, kind: 'tickets', amountUSD: 100 }),        // 71 JOD = 100 USD
    ]));
    const months = monthlyBreakdown(ev, 2026);
    expect(months[OCT].total).toBe(300);
    expect(months[NOV].total).toBe(100);
    expect(months[NOV].tickets).toBe(100);
    expect(months[NOV].lateFromEarlier).toBe(100);
    // 7.5 % commission follows the month: 22.50 in October, 7.50 in November.
    expect(months[OCT].total * 0.075).toBeCloseTo(22.5);
    expect(months[NOV].total * 0.075).toBeCloseTo(7.5);
  });

  it('puts upgrades, extensions and extras added later in their own month, the original price in the booking month', () => {
    const r = booking({
      amount: 466,
      priceChanges: [{ at: '2026-10-05T10:05:00Z', kind: 'extras', amount: 21, fromTotal: 300, toTotal: 321 }],
      upgradeHistory: [{ date: '2026-11-02T10:10:00Z', toCar: 'Jeep Wrangler', fee: 45 }],
      extensionHistory: [{ extensionDate: '2026-12-01', newEndDate: '2026-12-03T10:00', days: 2, dailyRate: 50, extras: [], cost: 100, paymentMethod: 'payLater' }],
    });
    const months = monthlyBreakdown(revenueEvents(r, 2026, OCT, indexRegisters({})), 2026);
    expect(months[OCT]).toEqual(expect.objectContaining({ rental: 300, addons: 21, total: 321 }));
    expect(months[NOV]).toEqual(expect.objectContaining({ addons: 45, total: 45 }));
    expect(months[11]).toEqual(expect.objectContaining({ addons: 100, total: 100 }));
  });

  it('never loses or doubles money: per booking the months add up to the booking total', () => {
    const r = booking({
      id: 'r2', bookingId: 'BK-2', amount: 410,
      upgradeHistory: [{ date: '2026-11-02T10:10:00Z', toCar: 'Jeep', fee: 60 }],
      returnCharges: { currency: 'JOD', settlement: 'claim', issuedAt: '2026-11-20T10:00:00Z', items: [
        { id: 'a', kind: 'damage', description: 'Scratch', amount: 85 }, { id: 'b', kind: 'fuel', description: 'Fuel', amount: 14.2 },
        { id: 'c', kind: 'ticket', description: 'Speeding', amount: 45, ticketId: 'tt-1767225600000' }] },
    });
    const regs = { trafficTickets: [{ id: 'tt-1767225600000', bookingId: 'BK-2', ticketDate: '2026-10-07', amount: 45, details: 'x', status: 'Not Collected' } as any],
      vehicleDamages: [{ id: 'vd-r2-a', bookingId: 'BK-2', amount: 85, details: 'Scratch', status: 'Not Collected' } as any] };
    const idx = indexRegisters(regs);
    expect(eventsTotal(r, 2026, OCT, idx)).toBe(bookingTotal(r, idx));
    // The damage billed at the return counts when the return charges were issued (November); the ticket entry was added on 1 Jan 2026,
    // before the booking, so it stays in the booking month.
    const months = monthlyBreakdown(revenueEvents(r, 2026, OCT, idx), 2026);
    expect(months[NOV].damages).toBeCloseTo(119.72);
    expect(months[OCT].tickets).toBeCloseTo(63.38);
  });

  it('reads the added date from createdAt, else from the id; a history that does not fit the amount stays as before', () => {
    expect(addedAt({ id: 'tt-1767225600000' })).toBe(new Date(1767225600000).toISOString());
    expect(addedAt({ id: 'tt-x', createdAt: '2026-11-03T08:00:00Z' })).toBe('2026-11-03T08:00:00Z');
    expect(addedAt({ id: 'tt-r1-a' })).toBeUndefined();
    const odd = booking({ amount: 50, upgradeHistory: [{ date: '2026-11-02', toCar: 'Jeep', fee: 80 }] });
    const ev = revenueEvents(odd, 2026, OCT, indexRegisters({}));
    expect(ev).toEqual([expect.objectContaining({ month: OCT, kind: 'rental', amountUSD: 50 })]);
  });

  it('a December booking with a January charge counts the charge in next year', () => {
    const data: any = { 2026: { December: [booking({ id: 'r3', bookingId: 'BK-3' })] } };
    const t = { ...novTicket, id: `tt-${new Date('2027-01-04T09:00:00').getTime()}`, bookingId: 'BK-3' };
    const ev = allRevenueEvents(data, { trafficTickets: [t] });
    expect(monthlyBreakdown(ev, 2026)[11].total).toBe(300);
    expect(monthlyBreakdown(ev, 2027)[0].tickets).toBe(100);
  });

  it('skips cancelled and no-show bookings, as the summary always did', () => {
    const data: any = { 2026: { October: [booking({ status: 'CANCELLED' })] } };
    expect(allRevenueEvents(data, { trafficTickets: [novTicket] })).toEqual([]);
  });
});

describe('add-ons: 7.5% commission and the month they count in', () => {
  const r = () => booking({
    amount: 420,
    upgradeHistory: [{ date: '2026-11-03T09:30:00', toCar: 'Jeep Wrangler', fee: 60 }],
    extensionHistory: [{ extensionDate: '2026-11-03', newEndDate: '2026-11-05T10:00', days: 2, dailyRate: 30, extras: [], cost: 60, paymentMethod: 'payLater' }],
  });

  it('counts an add-on added on the 3rd of the next month in that next month, not in the booking month', () => {
    const ev = revenueEvents(r(), 2026, OCT, indexRegisters({}));
    const months = monthlyBreakdown(ev, 2026);
    expect(months[OCT].total).toBe(300);
    expect(months[NOV].addons).toBe(120);
    expect(months[NOV].total * 0.075).toBeCloseTo(9);          // 7.5% of the add-ons is November commission
    const up = ev.find(e => e.label.startsWith('Upgrade'))!;
    expect(up).toEqual(expect.objectContaining({ id: 'BK-1:up0', month: NOV, autoMonth: NOV, bookingMonth: OCT, at: '2026-11-03T09:30:00' }));
  });

  it('moves one add-on to the month a person chose; amounts, and so commission, are unchanged', () => {
    const ev = revenueEvents(r(), 2026, OCT, indexRegisters({}));
    const moved = applyMonthOverrides(ev, { 'BK-1:up0': { year: 2026, month: OCT, by: 'Admin' }, 'BK-1:rental': { year: 2026, month: 11 } });
    const months = monthlyBreakdown(moved, 2026);
    expect(months[OCT].total).toBe(360);                       // rental 300 + upgrade 60 moved back to October
    expect(months[NOV].total).toBe(60);                        // the extension stays in November
    expect(months[11].total).toBe(0);                          // the rental price itself is never moved
    expect(moved.find(e => e.id === 'BK-1:up0')!.moved).toEqual({ by: 'Admin', at: undefined });
    const sum = (xs: typeof ev) => xs.reduce((s, e) => s + e.amountUSD, 0);
    expect(sum(moved)).toBe(sum(ev));
  });

  it('a choice equal to the automatic month changes nothing', () => {
    const ev = revenueEvents(r(), 2026, OCT, indexRegisters({}));
    expect(applyMonthOverrides(ev, { 'BK-1:up0': { year: 2026, month: NOV } })).toEqual(ev);
  });
});
