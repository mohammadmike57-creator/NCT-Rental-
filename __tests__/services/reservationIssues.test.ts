import { PaymentType, Reservation, ReservationStatus } from '../../types';
import { attentionCount, findIssues } from '../../services/reservationIssues';
import { amountOf, bookingRevenue, countsInSummary, indexRegisters } from '../../services/revenue';

const base = (o: Partial<Reservation>): Reservation => ({
  id: o.bookingId || 'x', bookingId: 'BK-1', personName: 'John Doe', source: 'Website', status: ReservationStatus.CONFIRMED,
  startDate: '2026-11-05T10:00', endDate: '2026-11-08T10:00', amount: 120, carModel: 'Kia Picanto',
  ...o,
} as Reservation);

const codesOf = (list: Reservation[], sources: any[] = []) =>
  Object.fromEntries(findIssues({ 2026: { November: list } } as any, sources).map(x => [x.r.bookingId, x.issues]));

describe('Needs Attention', () => {
  it('a complete confirmed booking is not listed', () => {
    expect(findIssues({ 2026: { November: [base({})] } } as any)).toEqual([]);
  });

  it('lists pending, cancelled and no-show bookings', () => {
    const c = codesOf([
      base({ bookingId: 'P', status: ReservationStatus.PENDING }),
      base({ bookingId: 'U', awaitingConfirmation: true, status: ReservationStatus.PENDING }),
      base({ bookingId: 'S', status: '' as any }),
      base({ bookingId: 'C', status: ReservationStatus.CANCELLED, amount: undefined as any }),
      base({ bookingId: 'N', status: ReservationStatus.NO_SHOW }),
    ]);
    expect(c.P).toEqual(['PENDING']);
    expect(c.U).toEqual(['AWAITING_CONFIRMATION']);
    expect(c.S).toEqual(['NO_STATUS']);
    expect(c.C).toEqual(['CANCELLED']);
    expect(c.N).toEqual(['NO_SHOW']);
  });

  it('lists incomplete bookings with what is missing', () => {
    const sources = [{ id: 's', name: 'Broker', paymentType: PaymentType.BOTH }];
    const c = codesOf([
      base({ bookingId: 'A', amount: undefined as any }),
      base({ bookingId: 'T', amount: '' as any }),
      base({ bookingId: 'Z', amount: 0 }),
      base({ bookingId: 'X', personName: '', source: '', carModel: '', startDate: '2026-11-08T10:00', endDate: '2026-11-05T10:00' }),
      base({ bookingId: 'R', voucherSubmitted: true }),
      base({ bookingId: 'B', source: 'Broker' }),
      base({ bookingId: 'PZ', status: ReservationStatus.PENDING, amount: 0 }),
    ], sources);
    expect(c.A).toEqual(['NO_AMOUNT']);
    expect(c.T).toEqual(['NO_AMOUNT']);
    expect(c.Z).toEqual(['ZERO_AMOUNT']);
    expect(c.X).toEqual(['NO_NAME', 'BAD_DATES', 'NO_SOURCE', 'NO_CAR']);
    expect(c.R).toEqual(['NO_PLATE']);
    expect(c.B).toEqual(['PAYMENT_TYPE_UNSET']);
    expect(c.PZ).toEqual(['PENDING', 'ZERO_AMOUNT']);
  });

  it('the badge counts incomplete and pending bookings, not cancelled ones', () => {
    const list = findIssues({ 2026: { November: [
      base({ bookingId: 'P', status: ReservationStatus.PENDING }),
      base({ bookingId: 'Z', amount: 0 }),
      base({ bookingId: 'C', status: ReservationStatus.CANCELLED }),
    ] } } as any);
    expect(list).toHaveLength(3);
    expect(attentionCount(list)).toBe(2);
  });
});

describe('what the summary counts', () => {
  it('everything except cancelled and no-show', () => {
    expect(countsInSummary(base({}))).toBe(true);
    expect(countsInSummary(base({ status: ReservationStatus.PENDING }))).toBe(true);
    expect(countsInSummary(base({ status: '' as any }))).toBe(true);
    expect(countsInSummary(base({ status: ReservationStatus.CANCELLED }))).toBe(false);
    expect(countsInSummary(base({ status: ReservationStatus.NO_SHOW }))).toBe(false);
  });

  it('an amount saved as text is added as a number, an empty one as 0', () => {
    expect(amountOf(base({ amount: '120.5' as any }))).toBe(120.5);
    expect(amountOf(base({ amount: undefined as any }))).toBe(0);
    expect(bookingRevenue(base({ amount: '120' as any }), indexRegisters({})).total).toBe(120);
  });
});
