jest.mock('../../services/ReservationSyncService', () => ({ ReservationSyncService: { saveToBackend: jest.fn(async () => true) } }));
jest.mock('../../services/ExcelImportService', () => ({ ExcelImportService: {} }));
jest.mock('../../services/ReservationRepository', () => ({
  ReservationRepository: class { data: any; constructor(d?: any) { this.data = d || {}; } getData() { return this.data; } },
}));

import { ReservationService } from '../../services/reservationService';
import { bookingKey, duplicateKeys, findBooking, describeBooking } from '../../services/duplicates';

const res = (id: string, bookingId: string, extra: any = {}) =>
  ({ id, bookingId, personName: 'John Doe', startDate: '2026-10-05T10:00', endDate: '2026-10-08T10:00', storageYear: 2026, storageMonth: 'October', amount: 100, ...extra }) as any;

describe('one booking number = one booking', () => {
  it('compares booking numbers ignoring case and spaces', () => {
    expect(bookingKey({ bookingId: ' bk-1001 ' })).toBe('BK-1001');
    expect(bookingKey({ bookingId: 'BK - 1001' })).toBe(bookingKey({ bookingId: 'bk-1001' }));
    expect(duplicateKeys([res('a', 'BK-1'), res('b', 'bk-1 '), res('c', 'BK-2'), res('d', '')])).toEqual(new Set(['BK-1']));
  });

  it('finds the most advanced record for a booking number', () => {
    const data: any = { 2026: { October: [res('a', 'BK-1', { status: 'CANCELLED' }), res('b', 'bk-1', { voucherSubmitted: true, dropOffCompleted: true })] } };
    expect(findBooking(data, 'BK-1')?.id).toBe('b');
    expect(findBooking(data, 'BK-1', 'b')?.id).toBe('a');
    expect(findBooking(data, 'BK-9')).toBeUndefined();
    expect(describeBooking(findBooking(data, 'BK-1')!)).toBe('closed agreement');
  });

  it('an import of a booking already closed at the counter updates it, it does not add a second one', async () => {
    // Opened as an unlisted agreement (no invoice field) and closed; the partner file later lists it.
    const closed = res('agr', 'NCT-77', { voucherSubmitted: true, dropOffCompleted: true, licensePlate: '12-34567', carModel: 'Kia Pegas' });
    const data: any = { 2026: { October: [closed] } };
    const incoming = res('new-id', 'nct-77', { invoice: 'nct-77', carModel: 'Hyundai Accent', amount: 180 });
    const report = { imported: 1, skipped: 0, duplicates: 0, invalidRows: 0, warnings: [], errors: [] };
    const { data: out, report: r } = await new ReservationService().importReservations([incoming], report, { year: 2026, month: 'October' }, data);
    expect(r).toMatchObject({ imported: 0, duplicates: 1 });
    expect(out[2026].October).toHaveLength(1);
    expect(out[2026].October[0]).toMatchObject({ id: 'agr', dropOffCompleted: true, licensePlate: '12-34567', carModel: 'Kia Pegas', amount: 180 });
  });
});
