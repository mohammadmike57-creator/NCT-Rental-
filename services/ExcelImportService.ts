import { Reservation, ReservationStatus, ImportReport } from '../types';
import { ReservationValidator } from './ReservationValidator';
import { DateUtils } from './DateUtils';
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

      let bookingId = ReservationValidator.normalizeText(DateUtils.getRowValue(row, [
        'bookingId', 'Reservation Number', 'Booking ID', 'Booking Id', 'Reservation No', 
        'Reservation No.', 'Reservation', 'ID', 'Ref', 'Reference', 'Res No', 'Res #',
        'Booking No', 'Order ID', 'Invoice', 'Invoice #', 'No', 'Number', '#',
        'Reference No', 'Reference Number', 'Ref No', 'Ref Number', 'Booking', 'Serial'
      ]));

      // Fallback if no booking ID found but row is valid
      if (!bookingId) {
        bookingId = `TEMP-${targetYear}-${targetMonth}-${rowIndex}`;
      }
      
      const customer = ReservationValidator.normalizeText(DateUtils.getRowValue(row, [
        'personName', 'Customer Name', 'Customer', 'Name', 'Renter Name', 'Renter', 
        'Client Name', 'Client', 'Guest', 'Driver', 'FullName', 'Full Name'
      ]));
      
      const rawPickupDate = DateUtils.getRowValue(row, [
        'startDate', 'Pickup Date', 'Start Date', 'Pick-up Date', 'From Date', 
        'Date From', 'Pickup', 'Month', 'Day', 'Year', 'month', 'day', 'year', 'Start',
        'From', 'Date', 'Pick up'
      ]);
      const pickupDate = DateUtils.parseExcelDate(rawPickupDate, row, '');
      
      const rawDropoffDate = DateUtils.getRowValue(row, [
        'endDate', 'Dropoff Date', 'End Date', 'Drop-off Date', 'To Date', 
        'Date To', 'Dropoff', 'Return Date', 'End Month', 'End Day', 'End Year', 
        'Return Month', 'Return Day', 'Return Year', 'End', 'To', 'Drop off', 'Return'
      ]);
      const dropoffDate = DateUtils.parseExcelDate(rawDropoffDate, row, 'End');
      
      const vehicle = ReservationValidator.normalizeText(DateUtils.getRowValue(row, [
        'reservationVehicle', 'Vehicle', 'Car Model', 'Car', 'Category', 'Model', 'Vehicle Model', 'Group'
      ]));
      
      const sourceRaw = DateUtils.getRowValue(row, [
        'source', 'Source', 'Channel', 'Website', 'Site', 'Partner', 'Agent', 
        'Provider', 'Marketplace', 'Origin', 'Platform', 'Broker name', 'Broker',
        'BrokerName', 'Platform Name', 'Booking Source', 'Reservation Source', 'Company'
      ]);

      let sourceValue = ReservationValidator.normalizeText(sourceRaw);

      if (!sourceValue || sourceValue.toLowerCase() === 'direct') {
        // Try to find if any header or ANY cell value contains known aggregator names
        const aggregatorNames = [
          'Discover Cars', 'Discover', 'Car Jet', 'CarJet', 'Booking.com', 'Expedia', 
          'Rentalcars', 'Rental Cars', 'Zest', 'Auto Europe', 'Argus', 'Holiday Autos', 
          'QEEQ', 'Wisecars', 'Economy Booking', 'EconomyBookings', 'Local'
        ];
        
        const rowValues = Object.values(row).map(v => String(v).toLowerCase());
        const rowKeys = Object.keys(row).map(k => String(k).toLowerCase());

        for (const name of aggregatorNames) {
          const lowerName = name.toLowerCase();
          if (rowValues.some(v => v.includes(lowerName)) || rowKeys.some(k => k.includes(lowerName))) {
            sourceValue = name;
            break;
          }
        }
      }

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
        notes: ReservationValidator.normalizeText(DateUtils.getRowValue(row, ['notes', 'Notes', 'Comments', 'Remarks'])),
        originalRowNumber: rowIndex,
        originalFileName: fileName,

        // Aliases for compatibility
        personName: customer,
        bookingId: bookingId,
        startDate: pickupDate,
        endDate: dropoffDate,
        reservationVehicle: vehicle,
        
        source: sourceValue || 'Direct',
        bookingDate: DateUtils.parseExcelDate(DateUtils.getRowValue(row, ['bookingDate', 'Booking Date']), row, 'Booking'),
        carModel: ReservationValidator.normalizeText(DateUtils.getRowValue(row, ['carModel', 'Car Model', 'Vehicle Model']) || vehicle),
        amount: DateUtils.parseNumeric(DateUtils.getRowValue(row, [
          'amount', 'Amount', 'Price', 'Total', 'Cost', 'Grand Total', 'Total Amount', 
          'Net Amount', 'Rental Fee', 'Total Fee', 'Balance', 'Rate', 'Total Price',
          'Rental Price', 'Contract Amount', 'Booking Amount', 'Paid Amount', 'Payable',
          'Total Charge', 'Charges', 'Fee', 'Fees'
        ])),
        baseAmount: DateUtils.parseNumeric(DateUtils.getRowValue(row, [
          'baseAmount', 'Base Amount', 'Base Rate', 'Daily Rate', 'Subtotal', 'Sub Total'
        ])),
      };

      // If baseAmount is zero but amount is not, set baseAmount to amount
      if (reservation.baseAmount === 0 && reservation.amount > 0) {
        reservation.baseAmount = reservation.amount;
      }
      // Conversely, if amount is zero but baseAmount is not, set amount to baseAmount
      if (reservation.amount === 0 && reservation.baseAmount > 0) {
        reservation.amount = reservation.baseAmount;
      }

      reservations.push(reservation);
      report.imported++;
    });

    console.log(`[IMPORT LOG] Processed ${reservations.length} reservations for ${targetMonth} ${targetYear}`);
    return { reservations, report };
  }
}
