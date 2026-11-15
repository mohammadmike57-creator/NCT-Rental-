/** @jest-environment node */
import ExcelJS from 'exceljs';
import { buildReservationWorkbook, excelDate } from '../services/reservationExcel';
import { Reservation, ReservationStatus } from '../types';

const sampleBooking = (): Reservation => ({
  id: 'r1', bookingId: 'BK-2041', personName: 'John Doe', source: 'direct', carModel: 'Hyundai Tucson', sippCode: 'IFAR', licensePlate: '20-1234',
  startDate: '2026-12-01T10:00', endDate: '2026-12-08T10:00', bookingDate: '2026-11-20', status: ReservationStatus.CONFIRMED,
  amount: 335, locationName: 'Airport Office', contactNumber: '+962790000000', notes: '',
  extras: [{ id: 'x1', name: 'GPS', dailyPrice: 5, isComplementary: false }],
  priceChanges: [{ at: '2026-11-25T09:00', by: 'Sara', kind: 'extras', amount: 35, fromTotal: 240, toTotal: 275, detail: 'Added GPS', added: ['GPS'] }],
  upgradeHistory: [{ date: '2026-12-01T10:05', fromCar: 'Kia Pegas', toCar: 'Hyundai Tucson', fee: 30, pricing: 'flat', by: 'Omar' }],
  extensionHistory: [{ extensionDate: '2026-12-06T12:00', newEndDate: '2026-12-08T10:00', days: 2, dailyRate: 15, extras: [], cost: 30, paymentMethod: 'payNow' }],
} as unknown as Reservation);

export const list = (): Reservation[] => [
  sampleBooking(),
  { ...sampleBooking(), id: 'r2', bookingId: 'BK-2042', personName: 'Sara Haddad', carModel: 'Kia Pegas', amount: 120, priceChanges: [], upgradeHistory: [], extensionHistory: [], extras: [], startDate: '2026-12-03T09:00', endDate: '2026-12-06T09:00' },
  { ...sampleBooking(), id: 'r3', bookingId: 'BK-2043', personName: 'Omar Nasser', carModel: 'Toyota Corolla', amount: 0, status: ReservationStatus.CANCELLED, priceChanges: [], upgradeHistory: [], extensionHistory: [], extras: [] },
];

describe('reservations Excel', () => {
  it('builds a styled sheet: title, frozen header, filters, money and dates, totals with formulas', async () => {
    const wb = await buildReservationWorkbook(list(), { companyName: 'UR-Drive Jordan', scope: 'December 2026', sourceName: () => 'Direct', now: new Date(Date.UTC(2026, 10, 15, 10, 0)) });
    const ws = wb.getWorksheet('Reservations')!;
    expect(String(ws.getCell('A1').value)).toBe('UR-Drive Jordan · Reservations');
    expect(String(ws.getCell('A2').value)).toContain('3 reservations');
    expect(ws.getCell('A4').value).toBe('Booking ID');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 4 });
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.getCell('J5').value).toBe(335);
    expect(ws.getCell('J5').numFmt).toContain('#,##0.00');
    expect(ws.getCell('F5').value).toEqual(excelDate('2026-12-01T10:00'));
    expect(String(ws.getCell('M5').value)).toContain('Upgrade: Kia Pegas → Hyundai Tucson (+30.00)');
    expect(ws.getCell('I7').value).toBe('Cancelled');
    expect(ws.getCell('A8').value).toBe('Total');
    expect(ws.getCell('J8').value).toEqual({ formula: 'SUM(J5:J7)' });
    // Search box: label, input cell, a live count and a highlight rule on every booking row.
    expect(ws.getCell('I2').value).toBe('Search:');
    expect(String((ws.getCell('M2').value as { formula: string }).formula)).toContain('SEARCH($J$2');
    const cf = (ws as unknown as { conditionalFormattings: { ref: string; rules: { formulae: string[] }[] }[] }).conditionalFormattings;
    expect(cf[0].ref).toBe('A5:P7');
    expect(cf[0].rules[0].formulae[0]).toContain('ISNUMBER(SEARCH($J$2,$A5');
    // It opens again as a valid workbook.
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(await wb.xlsx.writeBuffer());
    expect(back.getWorksheet('Reservations')!.getCell('B6').value).toBe('Sara Haddad');
  });
});
