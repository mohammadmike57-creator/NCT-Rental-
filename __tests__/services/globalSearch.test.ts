import { findBookingMonth } from '../../services/globalSearch';
import { AppData, Reservation } from '../../types';

const r = (o: Partial<Reservation>) => o as Reservation;
const data = {
  2025: { December: [r({ bookingId: 'NCT-100', personName: 'Jane Roe', licensePlate: '10-2233' })] },
  2026: {
    January: [r({ bookingId: 'NCT-1001', personName: 'Omar Ali', contactNumber: '0790000000' })],
    March: [r({ bookingId: 'NCT-100X', personName: 'Sami' })],
  },
} as unknown as AppData;

describe('header booking search', () => {
  it('prefers the exact booking number', () => {
    expect(findBookingMonth(data, 'nct-100')).toEqual({ year: 2025, month: 'December' });
  });
  it('finds part of a booking number or a plate', () => {
    expect(findBookingMonth(data, '1001')).toEqual({ year: 2026, month: 'January' });
    expect(findBookingMonth(data, '2233')).toEqual({ year: 2025, month: 'December' });
  });
  it('finds a customer name or phone', () => {
    expect(findBookingMonth(data, 'omar')).toEqual({ year: 2026, month: 'January' });
    expect(findBookingMonth(data, '07900')).toEqual({ year: 2026, month: 'January' });
  });
  it('returns nothing for no match or an empty search', () => {
    expect(findBookingMonth(data, 'nobody')).toBeNull();
    expect(findBookingMonth(data, '  ')).toBeNull();
    expect(findBookingMonth(null, 'x')).toBeNull();
  });
});
