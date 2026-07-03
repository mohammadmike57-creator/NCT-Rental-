import { Reservation, ReservationStatus } from '../types';

export class ReservationValidator {
  static validateRow(row: any, rowIndex: number): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    const bookingId = row.bookingId || row['Reservation Number'] || row['Booking ID'] || row['Booking Id'] || row['Reservation No'] || row['Reservation No.'] || row['Reservation'] || row['ID'] || row['Ref'] || row['Reference'];
    if (!bookingId) {
      errors.push(`Row ${rowIndex}: Missing Reservation Number (e.g. Booking ID, Reservation No)`);
    }

    const customerName = row.personName || row['Customer Name'] || row['Customer'] || row['Name'] || row['Renter Name'] || row['Renter'] || row['Client Name'] || row['Client'];
    if (!customerName) {
      errors.push(`Row ${rowIndex}: Missing Customer Name (e.g. Name, Client)`);
    }

    const pickupDate = row.startDate || row['Pickup Date'] || row['Start Date'] || row['Pick-up Date'] || row['From Date'] || row['Date From'] || row['Pickup'];
    if (!pickupDate) {
      errors.push(`Row ${rowIndex}: Missing Pickup Date (e.g. Start Date, From Date)`);
    }

    const dropoffDate = row.endDate || row['Dropoff Date'] || row['End Date'] || row['Drop-off Date'] || row['To Date'] || row['Date To'] || row['Dropoff'] || row['Return Date'];
    if (!dropoffDate) {
      errors.push(`Row ${rowIndex}: Missing Dropoff Date (e.g. End Date, To Date)`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static normalizeText(text: any): string {
    if (text === null || text === undefined) return '';
    return String(text).trim();
  }
}
