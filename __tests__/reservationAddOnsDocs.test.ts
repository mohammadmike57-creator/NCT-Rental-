import * as XLSX from 'xlsx';
import { buildAgreementHtml } from '../services/agreementDoc';
import { exportRows } from '../components/reservation/reservationList';
import { CompanyDetails, Reservation, ReservationStatus } from '../types';

/** A booking with an extension, an upgrade and an extras change after it was made. */
export const sampleBooking = (): Reservation => ({
  id: 'r1', bookingId: 'BK-2041', personName: 'John Doe', source: 'direct', carModel: 'Hyundai Tucson', sippCode: 'IFAR', licensePlate: '20-1234',
  startDate: '2026-12-01T10:00', endDate: '2026-12-08T10:00', bookingDate: '2026-11-20', status: ReservationStatus.CONFIRMED,
  amount: 335, locationName: 'Airport Office', contactNumber: '+962790000000', notes: '',
  extras: [{ id: 'x1', name: 'GPS', dailyPrice: 5, isComplementary: false }],
  priceChanges: [{ at: '2026-11-25T09:00', by: 'Sara', kind: 'extras', amount: 35, fromTotal: 240, toTotal: 275, detail: 'Added GPS', added: ['GPS'] }],
  upgradeHistory: [{ date: '2026-12-01T10:05', fromCar: 'Kia Pegas', toCar: 'Hyundai Tucson', fee: 30, pricing: 'flat', by: 'Omar' }],
  extensionHistory: [{ extensionDate: '2026-12-06T12:00', newEndDate: '2026-12-08T10:00', days: 2, dailyRate: 15, extras: [], cost: 30, paymentMethod: 'payNow' }],
} as unknown as Reservation);

const company = { name: 'UR-Drive Jordan', subName: '', address: 'Amman', phone: '+962', email: 'info@example.com', taxNumber: '' } as CompanyDetails;

describe('add-ons on the agreement and in the reservations Excel', () => {
  it('the agreement lists every add-on made after the booking', () => {
    const html = buildAgreementHtml({ reservation: sampleBooking(), company, checklistItems: ['Spare tyre'], rentalDays: 7, baseRentalFee: 305 });
    expect(html).toContain('data-addons="3"');
    expect(html).toContain('Add-ons since booking');
    expect(html).toContain('Kia Pegas → Hyundai Tucson');
    expect(html).toContain('Extended 2 days');
    expect(html).toContain('Extras changed');
  });
  it('the Excel export has the reservation amount and the add-ons', () => {
    const [row] = exportRows([sampleBooking()], () => 'Direct');
    expect(row['Amount (USD)']).toBe(335);
    expect(row['Add-ons (USD)']).toBe(95);
    expect(row['Original amount (USD)']).toBe(240);
    expect(String(row['Add-ons'])).toContain('Upgrade: Kia Pegas → Hyundai Tucson +30.00');
    expect(String(row['Add-ons'])).toContain('Extension: Extended 2 days');
    const sheet = XLSX.utils.json_to_sheet([row]);
    expect(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)[0]['Amount (USD)']).toBe(335);
  });
});
