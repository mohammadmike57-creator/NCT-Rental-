import { indexRegisters, bookingRevenue } from '../services/revenue';
import { revenueEvents } from '../services/revenueByMonth';
import { addOnsOf } from '../services/addOns';
import { COMMISSION_RATE, USD_TO_JOD_RATE } from '../constants';
import { Reservation, ReservationStatus, TrafficTicket } from '../types';

/** The Car Jet booking from the report: an 8-day Nissan Sunny, $128, with a 114 JOD traffic ticket. */
const booking = {
  id: 'r-cjt', bookingId: 'cjt-226505123', personName: 'rawad fadel', source: 'carjet', carModel: 'Nissan Sunny', sippCode: 'CDAR',
  startDate: '2026-11-10T10:00', endDate: '2026-11-18T10:00', bookingDate: '2026-11-01', status: ReservationStatus.CONFIRMED, amount: 128,
} as unknown as Reservation;
// Recorded in the Traffic Tickets register with the booking number in capitals and a stray space.
const ticket = { id: 'tt-1763700000000', bookingId: 'CJT-226505123 ', amount: 114, ticketDate: '2026-11-15', details: 'Traffic ticket', status: 'COLLECTED' } as unknown as TrafficTicket;

describe('traffic ticket commission', () => {
  test('a ticket recorded with the booking number in other letters still counts in revenue and commission', () => {
    const idx = indexRegisters({ trafficTickets: [ticket] });
    const ev = revenueEvents(booking, 2026, 10, idx).filter(e => e.kind === 'tickets');
    expect(ev).toHaveLength(1);
    const usd = 114 / USD_TO_JOD_RATE;
    expect(ev[0].amountUSD).toBeCloseTo(usd, 2);
    expect(ev[0].amountUSD * COMMISSION_RATE).toBeCloseTo(usd * 0.075, 2);   // about $12.04, not $0.00
    expect(bookingRevenue(booking, idx).tickets).toBeCloseTo(usd, 2);
    // and the add-ons list shows the same ticket, so the two now agree
    expect(addOnsOf(booking, [ticket]).entries.some(e => e.kind === 'ticket' && e.amount === 114)).toBe(true);
  });
});
