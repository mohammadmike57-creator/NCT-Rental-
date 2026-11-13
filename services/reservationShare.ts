import { Reservation } from '../types';

/** The internal message that shares a reservation with a colleague (Internal Messages → compose). */
export const reservationShareMessage = (reservation: Reservation, senderName?: string): { subject: string; body: string } => {
  const subject = `Reservation Details: ${reservation.personName} (${reservation.bookingId})`;
  const body = `
Hi,

Please see the details for the following reservation:

Renter: ${reservation.personName}
Booking ID: ${reservation.bookingId}
Source: ${reservation.source}
Vehicle: ${reservation.carModel}
Location: ${reservation.locationName || 'N/A'}
Pickup: ${reservation.startDate}
Return: ${reservation.endDate}
Status: ${reservation.status}
Total Amount: $${(reservation.amount || 0).toFixed(2)}

Notes: ${reservation.notes || 'N/A'}

Thanks,
${senderName ?? ''}
      `.trim();
  return { subject, body };
};
