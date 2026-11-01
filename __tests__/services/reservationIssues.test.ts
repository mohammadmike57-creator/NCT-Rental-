import { PaymentType, Reservation, ReservationStatus } from '../../types';
import { findIssues } from '../../services/reservationIssues';

const NOW = new Date('2026-11-01T12:00:00');
const base = (o: Partial<Reservation>): Reservation => ({
  id: o.bookingId || 'x', bookingId: 'BK-1', personName: 'John Doe', source: 'Website', status: ReservationStatus.CONFIRMED,
  startDate: '2026-11-05T10:00', endDate: '2026-11-08T10:00', amount: 120, carModel: 'Kia Picanto',
  ...o,
} as Reservation);

const codesOf = (list: Reservation[], month = 'November', year = 2026, sources: any[] = []) =>
  Object.fromEntries(findIssues({ [year]: { [month]: list } } as any, sources, NOW).map(x => [x.r.bookingId, x.issues]));

describe('Needs Attention checks', () => {
  it('a confirmed, priced, future booking in its own month is fine', () => {
    expect(findIssues({ 2026: { November: [base({})] } } as any, [], NOW)).toEqual([]);
  });

  it('finds what the summary does not count, or counts wrongly', () => {
    const c = codesOf([
      base({ bookingId: 'P', status: ReservationStatus.PENDING }),
      base({ bookingId: 'S', status: '' as any }),
      base({ bookingId: 'A', amount: undefined as any }),
      base({ bookingId: 'T', amount: '120' as any }),
      base({ bookingId: 'N', amount: -5 }),
      base({ bookingId: 'Z', amount: 0 }),
      base({ bookingId: 'M', startDate: '2026-12-02T10:00', endDate: '2026-12-04T10:00' }),
      base({ bookingId: 'U', awaitingConfirmation: true, status: ReservationStatus.PENDING }),
    ]);
    expect(c.P).toEqual(['PENDING']);
    expect(c.S).toEqual(['NO_STATUS']);
    expect(c.A).toEqual(['NO_AMOUNT']);
    expect(c.T).toEqual(['NO_AMOUNT']);
    expect(c.N).toEqual(['NEGATIVE_AMOUNT']);
    expect(c.Z).toEqual(['ZERO_AMOUNT']);
    expect(c.M).toEqual(['WRONG_MONTH']);
    expect(c.U).toEqual(['AWAITING_CONFIRMATION']);
  });

  it('finds missed check-outs and overdue returns, but not today\'s pick-ups', () => {
    const c = codesOf([
      base({ bookingId: 'OUT', startDate: '2026-10-30T10:00', endDate: '2026-11-03T10:00' }),
      base({ bookingId: 'TODAY', startDate: '2026-11-01T09:00', endDate: '2026-11-03T10:00' }),
      base({ bookingId: 'OLD', startDate: '2026-08-01T10:00', endDate: '2026-08-03T10:00' }),
      base({ bookingId: 'NOPLATE', startDate: '2026-10-30T10:00', endDate: '2026-11-04T10:00', voucherSubmitted: true }),
      base({ bookingId: 'CLOSEDNOPLATE', startDate: '2026-10-20T10:00', endDate: '2026-10-22T10:00', voucherSubmitted: true, dropOffCompleted: true }),
      base({ bookingId: 'LATE', startDate: '2026-10-25T10:00', endDate: '2026-10-31T10:00', voucherSubmitted: true, licensePlate: 'AB-1' }),
      base({ bookingId: 'DONE', startDate: '2026-10-25T10:00', endDate: '2026-10-31T10:00', voucherSubmitted: true, dropOffCompleted: true, licensePlate: 'AB-2' }),
    ], 'October');
    expect(c.OUT).toEqual(['NOT_CHECKED_OUT']);
    expect(c.TODAY).toEqual(['WRONG_MONTH']);
    expect(c.LATE).toEqual(['RETURN_OVERDUE']);
    expect(c.DONE).toBeUndefined();
    expect(c.OLD).toEqual(['WRONG_MONTH']);
    expect(c.NOPLATE).toEqual(['NO_PLATE']);
    expect(c.CLOSEDNOPLATE).toBeUndefined();
  });

  it('finds missing details, duplicates and an unset payment type; ignores cancelled bookings', () => {
    const sources = [{ id: 's', name: 'Broker', paymentType: PaymentType.BOTH }];
    const c = codesOf([
      base({ bookingId: 'D1', id: 'd1' }), base({ bookingId: 'd 1', id: 'd2' }),
      base({ bookingId: 'X', personName: '', source: '', startDate: '2026-11-08T10:00', endDate: '2026-11-05T10:00' }),
      base({ bookingId: 'B', source: 'Broker' }),
      base({ bookingId: 'C', status: ReservationStatus.CANCELLED, amount: undefined as any }),
    ], 'November', 2026, sources);
    expect(c.D1).toEqual(['DUPLICATE']);
    expect(c.X).toEqual(['BAD_DATES', 'NO_NAME', 'NO_SOURCE']);
    expect(c.B).toEqual(['PAYMENT_TYPE_UNSET']);
    expect(c.C).toBeUndefined();
  });
});
