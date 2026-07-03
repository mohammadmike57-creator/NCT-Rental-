import { Reservation, ReservationStatus } from '../types';
import { DateUtils } from './DateUtils';

export class ReservationValidator {
  static validateRow(row: any, rowIndex: number): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    const bookingId = DateUtils.getRowValue(row, [
      'bookingId', 'Reservation Number', 'Booking ID', 'Booking Id', 'Reservation No', 
      'Reservation No.', 'Reservation', 'ID', 'Ref', 'Reference', 'Res No', 'Res #',
      'Booking No', 'Order ID', 'Invoice', 'Invoice #', 'No', 'Number', '#', 
      'Reference No', 'Reference Number', 'Ref No', 'Ref Number', 'Booking', 'Serial'
    ]);
    
    // If absolutely no booking ID is found, we'll allow it but maybe warn later.
    // For now, let's keep it required but expand the list of headers even more.
    if (!bookingId) {
      // Check if the row is even worth processing (has at least some data)
      const hasAnyData = Object.values(row).some(v => v !== null && v !== undefined && v !== '');
      if (!hasAnyData) return { isValid: true, errors: [] }; // Silent skip for empty rows
    }

    const customerName = DateUtils.getRowValue(row, [
      'personName', 'Customer Name', 'Customer', 'Name', 'Renter Name', 'Renter', 
      'Client Name', 'Client', 'Guest', 'Driver', 'FullName', 'Full Name'
    ]);
    
    if (!customerName) {
      const hasAnyData = Object.values(row).some(v => v !== null && v !== undefined && v !== '');
      if (hasAnyData) {
        errors.push(`Row ${rowIndex}: Missing Customer Name (e.g. Name, Client)`);
      }
    }

    const pickupDate = DateUtils.getRowValue(row, [
      'startDate', 'Pickup Date', 'Start Date', 'Pick-up Date', 'From Date', 
      'Date From', 'Pickup', 'Month', 'Day', 'Year', 'month', 'day', 'year', 'Start',
      'From', 'Date', 'Pick up'
    ]);
    
    const hasMDY = (
      DateUtils.getRowValue(row, ['Month', 'month', 'M', 'm']) && 
      DateUtils.getRowValue(row, ['Day', 'day', 'D', 'd']) && 
      DateUtils.getRowValue(row, ['Year', 'year', 'Y', 'y'])
    );

    if (!pickupDate && !hasMDY) {
      errors.push(`Row ${rowIndex}: Missing Pickup Date (e.g. Start Date, From Date)`);
    }

    const dropoffDate = DateUtils.getRowValue(row, [
      'endDate', 'Dropoff Date', 'End Date', 'Drop-off Date', 'To Date', 
      'Date To', 'Dropoff', 'Return Date', 'End Month', 'End Day', 'End Year', 
      'Return Month', 'Return Day', 'Return Year', 'End', 'To', 'Drop off', 'Return'
    ]);
    
    const hasEndMDY = (
      DateUtils.getRowValue(row, ['End Month', 'Return Month', 'EndMonth', 'ReturnMonth', 'End M', 'Return M']) && 
      DateUtils.getRowValue(row, ['End Day', 'Return Day', 'EndDay', 'ReturnDay', 'End D', 'Return D']) && 
      DateUtils.getRowValue(row, ['End Year', 'Return Year', 'EndYear', 'ReturnYear', 'End Y', 'Return Y'])
    );

    if (!dropoffDate && !hasEndMDY) {
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
