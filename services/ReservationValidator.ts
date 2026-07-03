import { Reservation, ReservationStatus } from '../types';

export class ReservationValidator {
  static validateRow(row: any, rowIndex: number): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!row.bookingId && !row['Reservation Number'] && !row['Booking ID']) {
      errors.push(`Row ${rowIndex}: Missing Reservation Number (Booking ID)`);
    }

    if (!row.personName && !row['Customer Name'] && !row['Customer']) {
      errors.push(`Row ${rowIndex}: Missing Customer Name`);
    }

    if (!row.startDate && !row['Pickup Date'] && !row['Start Date']) {
      errors.push(`Row ${rowIndex}: Missing Pickup Date`);
    }

    if (!row.endDate && !row['Dropoff Date'] && !row['End Date']) {
      errors.push(`Row ${rowIndex}: Missing Dropoff Date`);
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
