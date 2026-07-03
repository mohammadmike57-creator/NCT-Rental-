import { Reservation, ReservationStatus, ImportReport } from '../types';
import { ReservationValidator } from './ReservationValidator';
import { v4 as uuidv4 } from 'uuid';

export class ExcelImportService {
  static processExcelData(
    data: any[],
    targetYear: number,
    targetMonth: string,
    fileName: string
  ): { reservations: Reservation[]; report: ImportReport } {
    const reservations: Reservation[] = [];
    const report: ImportReport = {
      imported: 0,
      skipped: 0,
      duplicates: 0,
      invalidRows: 0,
      warnings: [],
      errors: []
    };

    const batchId = uuidv4();
    const timestamp = new Date().toISOString();

    data.forEach((row, index) => {
      const rowIndex = index + 2; // Excel rows start at 1, header is 1
      const validation = ReservationValidator.validateRow(row, rowIndex);

      if (!validation.isValid) {
        console.warn(`[IMPORT LOG] Skipping row ${rowIndex}:`, validation.errors);
        report.invalidRows++;
        report.errors.push({ row: rowIndex, details: validation.errors.join(', ') });
        return;
      }

      const bookingId = ReservationValidator.normalizeText(row.bookingId || row['Reservation Number'] || row['Booking ID'] || row['Booking Id'] || row['Reservation No'] || row['Reservation No.'] || row['Reservation'] || row['ID'] || row['Ref'] || row['Reference']);
      const customer = ReservationValidator.normalizeText(row.personName || row['Customer Name'] || row['Customer'] || row['Name'] || row['Renter Name'] || row['Renter'] || row['Client Name'] || row['Client']);
      const pickupDate = ReservationValidator.normalizeText(row.startDate || row['Pickup Date'] || row['Start Date'] || row['Pick-up Date'] || row['From Date'] || row['Date From'] || row['Pickup']);
      const dropoffDate = ReservationValidator.normalizeText(row.endDate || row['Dropoff Date'] || row['End Date'] || row['Drop-off Date'] || row['To Date'] || row['Date To'] || row['Dropoff'] || row['Return Date']);
      const vehicle = ReservationValidator.normalizeText(row.reservationVehicle || row['Vehicle'] || row['Car Model'] || row['Car'] || row['Category'] || row['Model']);
      
      const reservation: Reservation = {
        id: uuidv4(),
        uploadBatchId: batchId,
        createdAt: timestamp,
        updatedAt: timestamp,
        storageYear: targetYear,
        storageMonth: targetMonth,
        pickupDate: pickupDate,
        dropoffDate: dropoffDate,
        customer: customer,
        vehicle: vehicle,
        invoice: bookingId,
        status: ReservationStatus.CONFIRMED,
        notes: ReservationValidator.normalizeText(row.notes || row['Notes'] || row['Comments'] || ''),
        originalRowNumber: rowIndex,
        originalFileName: fileName,

        // Aliases for compatibility
        personName: customer,
        bookingId: bookingId,
        startDate: pickupDate,
        endDate: dropoffDate,
        reservationVehicle: vehicle,
        
        source: ReservationValidator.normalizeText(row.source || row['Source'] || row['Channel'] || 'Direct'),
        bookingDate: ReservationValidator.normalizeText(row.bookingDate || row['Booking Date'] || ''),
        carModel: ReservationValidator.normalizeText(row.carModel || vehicle),
        amount: parseFloat(row.amount || row['Amount'] || row['Price'] || row['Total']) || 0,
      };

      reservations.push(reservation);
      report.imported++;
    });

    console.log(`[IMPORT LOG] Processed ${reservations.length} reservations for ${targetMonth} ${targetYear}`);
    return { reservations, report };
  }
}
