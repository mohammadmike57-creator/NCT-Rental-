import { ReservationStore } from '../../services/ReservationStore';

const res = (id: string, start: string, y: number, m: string, extra: any = {}) =>
  ({ id, bookingId: id, personName: id, startDate: start, endDate: start, storageYear: y, storageMonth: m, amount: 100, ...extra }) as any;

describe('editing and deleting reservations', () => {
  it('moves a booking to October when its pick-up changes from 30 Sep to 1 Oct', () => {
    const store = new ReservationStore({ 2026: { September: [res('A', '2026-09-30T10:00', 2026, 'September')], October: [] } } as any);
    const out = store.updateReservation(res('A', '2026-10-01T10:00', 2026, 'September', { personName: 'Edited' }));
    expect(out[2026].September).toEqual([]);
    expect(out[2026].October).toHaveLength(1);
    expect(out[2026].October[0]).toMatchObject({ id: 'A', personName: 'Edited', storageYear: 2026, storageMonth: 'October' });
  });

  it('keeps an edit in the same month in place', () => {
    const store = new ReservationStore({ 2026: { October: [res('A', '2026-10-05T10:00', 2026, 'October'), res('B', '2026-10-06T10:00', 2026, 'October')] } } as any);
    const out = store.updateReservation(res('A', '2026-10-07T10:00', 2026, 'October', { amount: 250 }));
    expect(out[2026].October.map((r: any) => [r.id, r.amount])).toEqual([['A', 250], ['B', 100]]);
  });

  it('moves into a new year and removes stray copies', () => {
    const store = new ReservationStore({ 2026: { December: [res('C', '2026-12-30T10:00', 2026, 'December')], November: [res('C', '2026-12-30T10:00', 2026, 'November')] } } as any);
    const out = store.updateReservation(res('C', '2027-01-02T10:00', 2026, 'December'));
    expect(out[2026].December).toEqual([]);
    expect(out[2026].November).toEqual([]);
    expect(out[2027].January.map((r: any) => r.id)).toEqual(['C']);
  });

  it('deletes a booking even when asked with the wrong month', () => {
    // Listed by pick-up date (October) but filed under September: delete used to look in October and miss it.
    const store = new ReservationStore({ 2026: { September: [res('D', '2026-10-01T10:00', 2026, 'September'), res('E', '2026-09-20T10:00', 2026, 'September')] } } as any);
    const out = store.deleteReservation('D', 2026, 'October');
    expect(out[2026].September.map((r: any) => r.id)).toEqual(['E']);
  });

  it('adds a new booking to its pick-up month', () => {
    const out = new ReservationStore({} as any).updateReservation(res('N', '2026-11-03T09:00', 2026, 'October'));
    expect(out[2026].November.map((r: any) => r.id)).toEqual(['N']);
  });
});
