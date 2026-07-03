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
        report.invalidRows++;
        report.errors.push({ row: rowIndex, details: validation.errors.join(', ') });
        return;
      }

      const bookingId = ReservationValidator.normalizeText(row.bookingId || row['Reservation Number'] || row['Booking ID']);
      
      const reservation: Reservation = {
        id: uuidv4(),
        uploadBatchId: batchId,
        createdAt: timestamp,
        updatedAt: timestamp,
        storageYear: targetYear,
        storageMonth: targetMonth,
        pickupDate: ReservationValidator.normalizeText(row.startDate || row['Pickup Date'] || row['Start Date']),
        dropoffDate: ReservationValidator.normalizeText(row.endDate || row['Dropoff Date'] || row['End Date']),
        customer: ReservationValidator.normalizeText(row.personName || row['Customer Name'] || row['Customer']),
        vehicle: ReservationValidator.normalizeText(row.reservationVehicle || row['Vehicle'] || row['Car Model']),
        invoice: bookingId,
        status: ReservationStatus.CONFIRMED,
        notes: ReservationValidator.normalizeText(row.notes || ''),
        originalRowNumber: rowIndex,
        originalFileName: fileName,

        // Aliases for compatibility
        personName: ReservationValidator.normalizeText(row.personName || row['Customer Name'] || row['Customer']),
        bookingId: bookingId,
        startDate: ReservationValidator.normalizeText(row.startDate || row['Pickup Date'] || row['Start Date']),
        endDate: ReservationValidator.normalizeText(row.endDate || row['Dropoff Date'] || row['End Date']),
        reservationVehicle: ReservationValidator.normalizeText(row.reservationVehicle || row['Vehicle'] || row['Car Model']),
        
        source: ReservationValidator.normalizeText(row.source || 'Direct'),
        bookingDate: ReservationValidator.normalizeText(row.bookingDate || ''),
        carModel: ReservationValidator.normalizeText(row.carModel || row.reservationVehicle || row['Vehicle'] || row['Car Model']),
        amount: parseFloat(row.amount) || 0,
      };

      reservations.push(reservation);
      report.imported++;
    });

    console.log(`[IMPORT LOG] Processed ${reservations.length} reservations for ${targetMonth} ${targetYear}`);
    return { reservations, report };
  }
}
