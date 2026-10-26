jest.mock('../../services/ReservationSyncService', () => ({ ReservationSyncService: { saveToBackend: jest.fn(async () => true) } }));
jest.mock('../../services/ExcelImportService', () => ({ ExcelImportService: {} }));
jest.mock('../../services/ReservationRepository', () => ({
  ReservationRepository: class { data: any; constructor(d?: any) { this.data = d || {}; } getData() { return this.data; } },
}));

import { ReservationService } from '../../services/reservationService';

const res = (id: string, start: string, end: string, y: number, m: string) =>
  ({ id, bookingId: id, invoice: id, personName: id, customer: id, startDate: start, endDate: end, storageYear: y, storageMonth: m, amount: 100 }) as any;

describe('bookings are listed in their pick-up month', () => {
  it('finds a 29 Dec – 3 Jan booking filed under January and moves it to December', async () => {
    const data: any = { 2026: { December: [] }, 2027: { January: [res('A1', '2026-12-29T10:00', '2027-01-03T10:00', 2027, 'January'), res('A2', '2027-01-10T10:00', '2027-01-12T10:00', 2027, 'January')] } };
    expect(ReservationService.misfiled(data).map(x => [x.reservation.id, `${x.to.m} ${x.to.y}`])).toEqual([['A1', 'December 2026']]);
    const svc = new ReservationService();
    const { data: out, moved } = await svc.moveToPickupMonths(data);
    expect(moved).toBe(1);
    expect(out[2026].December.map((r: any) => r.id)).toEqual(['A1']);
    expect(out[2027].January.map((r: any) => r.id)).toEqual(['A2']);
    expect(out[2026].December[0]).toMatchObject({ storageYear: 2026, storageMonth: 'December' });
  });

  it('re-importing a booking moves it to its pick-up month and keeps its details', async () => {
    const existing = { ...res('B1', '2026-12-29T10:00', '2027-01-03T10:00', 2027, 'January'), contactNumber: '+962700', status: 'Completed' };
    const data: any = { 2027: { January: [existing] } };
    const incoming = { ...res('B1', '2026-12-29T10:00', '2027-01-03T10:00', 2026, 'December'), id: 'new-id', contactNumber: '', status: 'Confirmed' };
    const report = { imported: 1, skipped: 0, duplicates: 0, invalidRows: 0, warnings: [], errors: [] };
    const { data: out, report: r } = await new ReservationService().importReservations([incoming], report, { year: 2026, month: 'December' }, data);
    expect(r).toMatchObject({ imported: 0, duplicates: 1 });
    expect(out[2027].January).toEqual([]);
    expect(out[2026].December).toHaveLength(1);
    expect(out[2026].December[0]).toMatchObject({ id: 'B1', contactNumber: '+962700', status: 'Completed', storageYear: 2026, storageMonth: 'December' });
  });

  it('applies hand corrections and moves only the selected bookings', async () => {
    const data: any = { 2027: { January: [
      res('C1', '2026-12-29T10:00', '2027-01-03T10:00', 2027, 'January'),
      res('C2', '2026-12-30T10:00', '2027-01-04T10:00', 2027, 'January'),
      res('C3', '2026-12-31T10:00', '2027-01-05T10:00', 2027, 'January'),
    ] } };
    // C1: pick-up was really 2 Jan → stays in January with the corrected dates. C2: moves. C3: not selected.
    const edits = { C1: { startDate: '2027-01-02T10:00', pickupDate: '2027-01-02T10:00', personName: 'Corrected Name' } };
    const { data: out, moved, edited } = await new ReservationService().moveToPickupMonths(data, { ids: ['C1', 'C2'], edits });
    expect({ moved, edited }).toEqual({ moved: 1, edited: 1 });
    expect(out[2027].January.map((r: any) => r.id).sort()).toEqual(['C1', 'C3']);
    expect(out[2027].January.find((r: any) => r.id === 'C1')).toMatchObject({ startDate: '2027-01-02T10:00', personName: 'Corrected Name' });
    expect(out[2026].December.map((r: any) => r.id)).toEqual(['C2']);
  });
});
