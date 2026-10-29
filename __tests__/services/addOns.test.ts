import { addOnsOf, withPriceChange } from '../../services/addOns';

const base = (extra: any = {}) => ({
  id: 'r1', bookingId: 'BK-1', personName: 'John Doe', startDate: '2026-10-05T10:00', endDate: '2026-10-08T10:00',
  amount: 300, carModel: 'Kia Pegas', status: 'CONFIRMED', extras: [], ...extra,
}) as any;

describe('reservation add-ons', () => {
  it('logs an extras change with what was added and keeps the booked price', () => {
    const prev = base();
    const next = withPriceChange(prev, { ...prev, amount: 321, extras: [{ name: 'Child Seat', dailyPrice: 7, isComplementary: false }] }, 'Emily Davis', '2026-10-05T10:05:00Z');
    expect(next.originalAmount).toBe(300);
    expect(next.priceChanges).toEqual([expect.objectContaining({ kind: 'extras', amount: 21, fromTotal: 300, toTotal: 321, added: ['Child Seat'], by: 'Emily Davis' })]);
  });

  it('does not log what an upgrade or extension already records', () => {
    const prev = base();
    const up = withPriceChange(prev, { ...prev, amount: 345, upgradeHistory: [{ date: 'x', toCar: 'Jeep', fee: 45 }] });
    expect(up.priceChanges).toBeUndefined();
    const ext = withPriceChange(up, { ...up, amount: 445, extensionHistory: [{ extensionDate: '2026-10-08', newEndDate: '2026-10-10T10:00', days: 2, dailyRate: 50, extras: [], cost: 100, paymentMethod: 'payLater' }] });
    expect(ext.priceChanges).toBeUndefined();
    expect(ext.originalAmount).toBe(300);
    expect(withPriceChange(prev, { ...prev, notes: 'x' })).toEqual({ ...prev, notes: 'x' });
  });

  it('logs a price edited by hand', () => {
    const next = withPriceChange(base(), { ...base(), amount: 280 });
    expect(next.priceChanges).toEqual([expect.objectContaining({ kind: 'manual', amount: -20 })]);
  });

  it('puts the original booking next to the booking now, with every change and charge', () => {
    const res = base({
      amount: 466, carModel: 'Jeep Wrangler', endDate: '2026-10-10T10:00', unpaidExtensionAmount: 100,
      extras: [{ name: 'Child Seat', dailyPrice: 7, isComplementary: false }],
      priceChanges: [{ at: '2026-10-05T10:05:00Z', kind: 'extras', amount: 21, fromTotal: 300, toTotal: 321, detail: 'Added Child Seat', added: ['Child Seat'] }],
      upgradeHistory: [{ date: '2026-10-05T10:10:00Z', fromCar: 'Kia Pegas', toCar: 'Jeep Wrangler', fee: 45 }],
      extensionHistory: [{ extensionDate: '2026-10-08', newEndDate: '2026-10-10T10:00', days: 2, dailyRate: 50, extras: [], cost: 100, paymentMethod: 'payLater' }],
      lateReturnFee: { feeAppliedDate: '2026-10-10', hoursLate: 3, amount: 25, isWaived: true, status: 'WAIVED' },
      returnCharges: { currency: 'JOD', settlement: 'claim', documentNumber: 'CLM-1', items: [{ id: 'a', kind: 'damage', description: 'Scratch', amount: 85 }, { id: 'b', kind: 'ticket', description: 'Speeding', amount: 45, ticketId: 't1' }] },
    });
    const tickets: any[] = [{ id: 't1', bookingId: 'bk-1', amount: 45, status: 'NOT_COLLECTED' }, { id: 't2', bookingId: 'BK-1', amount: 20, status: 'COLLECTED', ticketDate: '2026-10-09' }];
    const s = addOnsOf(res, tickets, []);
    expect(s.originalPrice).toBe(300);
    expect(s.priceChange).toBe(166);
    expect(s.original).toMatchObject({ carModel: 'Kia Pegas', days: 3, extras: [] });
    expect(s.now).toMatchObject({ carModel: 'Jeep Wrangler', days: 5, extras: ['Child Seat'] });
    // Late-return fees are switched off, so the stored (waived) fee is not listed.
    expect(s.entries.map(e => e.kind).sort()).toEqual(['damage', 'extension', 'extras', 'ticket', 'ticket', 'upgrade']);
    expect(s.charges).toEqual({ USD: 0, JOD: 150 });          // waived late fee excluded; ticket t1 counted once
    expect(s.outstanding).toEqual({ USD: 100, JOD: 130 });   // unpaid extension, claim lines
  });
});
