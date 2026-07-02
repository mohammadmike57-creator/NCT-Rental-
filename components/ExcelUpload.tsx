import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Reservation, ReservationStatus } from '../types';
import { MONTHS, INITIAL_YEARS } from '../constants';

interface ExcelUploadProps {
  onReservationsImported: (reservations: Reservation[], target?: { year?: number; month?: string }) => void;
  years?: number[];
  focusYear?: number;
  focusMonth?: string;
}

const ExcelUpload: React.FC<ExcelUploadProps> = ({ onReservationsImported, years = INITIAL_YEARS, focusYear, focusMonth }) => {
  const [uploading, setUploading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(focusMonth || 'All');
  const [selectedYear, setSelectedYear] = useState<number | 'All'>(focusYear || 'All');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const normalizeHeader = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

  const getRowValueByHeaders = (row: Record<string, any>, candidateHeaders: string[]): any => {
    for (const header of candidateHeaders) {
      const value = row[header];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }

    const normalizedCandidates = new Set(candidateHeaders.map(normalizeHeader));
    for (const key of Object.keys(row)) {
      if (normalizedCandidates.has(normalizeHeader(key))) {
        const value = row[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          return value;
        }
      }
    }

    return undefined;
  };

  const parseAmount = (value: any): number => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string') {
      const cleaned = value.replace(/[^0-9.,-]/g, '').trim();
      if (!cleaned) return 0;

      const parsed = Number.parseFloat(cleaned.replace(/,/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  };

  const getFallbackDate = (offsetDays = 0): Date => {
    const fallbackYear = typeof selectedYear === 'number' ? selectedYear : new Date().getFullYear();
    const fallbackMonth = selectedMonth !== 'All' ? MONTHS.indexOf(selectedMonth) : new Date().getMonth();
    const date = new Date(fallbackYear, fallbackMonth >= 0 ? fallbackMonth : new Date().getMonth(), 1 + offsetDays, 12, 0);
    return date;
  };

  const formatDateTimeLocal = (date: Date): string => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const normalizeDateToSelectedPeriod = (dateString: string): string => {
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return dateString;

    const targetYear = typeof selectedYear === 'number' ? selectedYear : parsed.getFullYear();
    const selectedMonthIndex = selectedMonth !== 'All' ? MONTHS.indexOf(selectedMonth) : -1;
    const targetMonth = selectedMonthIndex >= 0 ? selectedMonthIndex : parsed.getMonth();
    const maxDay = new Date(targetYear, targetMonth + 1, 0).getDate();
    const targetDay = Math.min(parsed.getDate(), maxDay);

    return formatDateTimeLocal(new Date(
      targetYear,
      targetMonth,
      targetDay,
      parsed.getHours(),
      parsed.getMinutes()
    ));
  };

  const normalizeReservationDatesToSelectedPeriod = (startDate: string, endDate: string) => {
    if (selectedYear === 'All' && selectedMonth === 'All') {
      return { startDate, endDate };
    }

    const normalizedStart = normalizeDateToSelectedPeriod(startDate);
    let normalizedEnd = normalizeDateToSelectedPeriod(endDate);

    if (new Date(normalizedEnd) <= new Date(normalizedStart)) {
      normalizedEnd = formatDateTimeLocal(new Date(new Date(normalizedStart).getTime() + 24 * 60 * 60 * 1000));
    }

    return { startDate: normalizedStart, endDate: normalizedEnd };
  };

  const parseTime = (value: string): { hour: number; minute: number } => {
    const match = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) || value.match(/\b(\d{1,2}):(\d{2})\b/);
    if (!match) return { hour: 12, minute: 0 };

    let hour = parseInt(match[1], 10);
    const minute = match[2] ? parseInt(match[2], 10) : 0;
    const meridian = match[3]?.toLowerCase();
    if (meridian === 'pm' && hour < 12) hour += 12;
    if (meridian === 'am' && hour === 12) hour = 0;
    return { hour: Math.min(Math.max(hour, 0), 23), minute: Math.min(Math.max(minute, 0), 59) };
  };

  // Parse date from various formats
  const parseFlexibleDate = (dateValue: any): string | null => {
    if (!dateValue) return null;
    let year: number, month: number, day: number, hour = 12, minute = 0;

    if (dateValue instanceof Date) {
      year = dateValue.getFullYear();
      month = dateValue.getMonth();
      day = dateValue.getDate();
      hour = dateValue.getHours();
      minute = dateValue.getMinutes();
    } else if (typeof dateValue === 'number') {
      // Excel serial date
      const date = XLSX.SSF.parse_date_code(dateValue);
      year = date.y;
      month = date.m - 1;
      day = date.d;
      hour = date.H || 12;
      minute = date.M || 0;
    } else if (typeof dateValue === 'string') {
      const cleaned = dateValue.trim().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
      if (!cleaned) return null;
      const parsedTime = parseTime(cleaned);
      hour = parsedTime.hour;
      minute = parsedTime.minute;

      const monthNamePattern = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
      const monthLookup: Record<string, number> = {
        jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
        may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
        sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
      };
      const monthFirst = new RegExp(`\\b${monthNamePattern}\\b\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{2,4})?`, 'i');
      const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthNamePattern}\\b\\s*,?\\s*(\\d{2,4})?`, 'i');
      const monthFirstMatch = cleaned.match(monthFirst);
      const dayFirstMatch = cleaned.match(dayFirst);

      if (dayFirstMatch || monthFirstMatch) {
        if (dayFirstMatch) {
          day = parseInt(dayFirstMatch[1], 10);
          month = monthLookup[dayFirstMatch[2].toLowerCase()];
          year = dayFirstMatch[3] ? parseInt(dayFirstMatch[3], 10) : (typeof selectedYear === 'number' ? selectedYear : new Date().getFullYear());
        } else {
          month = monthLookup[monthFirstMatch![1].toLowerCase()];
          day = parseInt(monthFirstMatch![2], 10);
          year = monthFirstMatch![3] ? parseInt(monthFirstMatch![3], 10) : (typeof selectedYear === 'number' ? selectedYear : new Date().getFullYear());
        }
        if (year < 100) year += 2000;
      } else {
        // Try numeric formats with various separators (/, -, ., //, etc.)
        const normalized = cleaned.replace(/[./-]{1,2}/g, '/').replace(/\s+/g, ' ');
        const parts = normalized.split(/[\/\s,]+/);
        
        if (parts.length >= 3) {
          const p1 = parseInt(parts[0]);
          const p2 = parseInt(parts[1]);
          let p3 = parseInt(parts[2]);
          if (p3 < 100) p3 += 2000;

          if (p1 > 12) { // DD/MM/YYYY
            day = p1;
            month = p2 - 1;
            year = p3;
          } else if (p2 > 12) { // MM/DD/YYYY
            month = p1 - 1;
            day = p2;
            year = p3;
          } else {
            // Default to DD/MM/YYYY as per previous requirements
            day = p1;
            month = p2 - 1;
            year = p3;
          }
        } else {
          // Fallback to JS Date
          const d = new Date(cleaned);
          if (!isNaN(d.getTime())) {
            year = d.getFullYear();
            month = d.getMonth();
            day = d.getDate();
          } else {
            return null;
          }
        }
      }
    } else {
      return null;
    }

    // Use selected year/month as fallback if they are specific and parsing results are questionable
    if (selectedYear !== 'All' && isNaN(year)) year = selectedYear;
    if (selectedMonth !== 'All' && isNaN(month)) {
      const mIdx = MONTHS.indexOf(selectedMonth);
      if (mIdx !== -1) month = mIdx;
    }

    // Final validation
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;

    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
  };

  const mapStatus = (status: string): ReservationStatus => {
    const s = (status || '').toLowerCase().trim();
    if (s === 'pending') return ReservationStatus.PENDING;
    if (s === 'confirm' || s === 'confirmed' || s === 'ok') return ReservationStatus.CONFIRMED;
    if (s === 'cancel' || s === 'cancelled' || s === 'void') return ReservationStatus.CANCELLED;
    if (s === 'no show' || s === 'no-show' || s === 'noshow') return ReservationStatus.NO_SHOW;
    return ReservationStatus.CONFIRMED;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // CRITICAL: Require specific month selection for import
    if (selectedMonth === 'All' || selectedYear === 'All') {
      setError('⚠️ You must select a specific Year and Month before importing. Reservations will be locked to the selected month.');
      event.target.value = '';
      return;
    }

    console.log('📁 Excel Upload Started:', {
      file: file.name,
      targetYear: selectedYear,
      targetMonth: selectedMonth,
      timestamp: new Date().toISOString()
    });

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: true });

      const reservations: Reservation[] = [];
      const errors: string[] = [];

      rows.forEach((row, idx) => {
        const rowNum = idx + 2;
        try {
          const personNameCandidateHeaders = ['Client Name', 'Renter Name', 'Customer Name', 'Name', 'Driver Name', 'Renter', 'Client', 'Customer', 'Guest', 'Guest Name', 'Driver'];
          let personName = getRowValueByHeaders(row, personNameCandidateHeaders)?.toString().trim();
          let hasImportError = false;
          let importErrorDetail = '';

          if (!personName) {
            personName = 'UNKNOWN CLIENT';
            hasImportError = true;
            importErrorDetail = 'Client Name missing';
          }

          // Skip summary rows
          const lowerName = personName.toLowerCase();
          if (lowerName === 'total' || lowerName === 'grand total' || lowerName === 'subtotal' || lowerName.includes('total:')) {
            throw new Error('Skipping summary row');
          }

          const pickupDateCandidates = ['Pick-up Date', 'Pickup Date', 'Start Date', 'Date From', 'Collection Date', 'Pickup', 'From Date', 'Pick up', 'Out Date'];
          const dropoffDateCandidates = ['Drop-off Date', 'Dropoff Date', 'End Date', 'Date To', 'Return Date', 'Dropoff', 'To Date', 'Drop off', 'In Date'];
          
          const startDateRaw = getRowValueByHeaders(row, pickupDateCandidates);
          const endDateRaw = getRowValueByHeaders(row, dropoffDateCandidates);

          let startDate = parseFlexibleDate(startDateRaw);
          let endDate = parseFlexibleDate(endDateRaw);

          if (!startDate) {
            startDate = formatDateTimeLocal(getFallbackDate(idx));
            hasImportError = true;
            importErrorDetail = `${importErrorDetail ? `${importErrorDetail}. ` : ''}Invalid Pick-up Date: ${startDateRaw || 'missing'}`;
          }
          if (!endDate) {
            endDate = formatDateTimeLocal(new Date(new Date(startDate).getTime() + 24 * 60 * 60 * 1000));
            hasImportError = true;
            importErrorDetail = `${importErrorDetail ? `${importErrorDetail}. ` : ''}Invalid Drop-off Date: ${endDateRaw || 'missing'}`;
          }

          // IMPORTANT: Keep the original dates as-is, don't normalize them
          // The importLockedYear/Month fields will control where they're stored
          // This preserves the actual pickup/dropoff dates for the reservation

          if (new Date(endDate) <= new Date(startDate)) {
            hasImportError = true;
            importErrorDetail = `${importErrorDetail ? `${importErrorDetail}. ` : ''}Drop-off date must be after pick-up date`;
          }

          const bookingIdCandidates = ['Reference Number', 'Booking ID', 'Reservation Number', 'Order Number', 'Ref', 'ID', 'Reference', 'Booking #', 'Res #'];
          const bookingId = getRowValueByHeaders(row, bookingIdCandidates)?.toString().trim() || `import-${Date.now()}-${idx}`;
          
          const sourceCandidates = ['Broker Name', 'Source', 'Vendor', 'Agency', 'Company', 'Broker', 'Channel', 'Booked via'];
          const sourceName = getRowValueByHeaders(row, sourceCandidates)?.toString().trim() || 'Website';
          
          const bookingDateCandidates = ['Booked on Date', 'Booking Date', 'Reservation Date', 'Date Booked', 'Booked', 'Booked On'];
          const bookingDateRaw = getRowValueByHeaders(row, bookingDateCandidates);
          const bookingDate = bookingDateRaw ? parseFlexibleDate(bookingDateRaw)?.split('T')[0] : new Date().toISOString().split('T')[0];
          
          const locationCandidates = ['Branch', 'Location', 'Pickup Location', 'Pick-up Location', 'Office', 'Station'];
          const locationName = getRowValueByHeaders(row, locationCandidates)?.toString().trim() || '';
          
          const carModelCandidates = ['Car Type', 'Car Model', 'Vehicle Type', 'Vehicle', 'Group', 'Category', 'Car'];
          const carModel = getRowValueByHeaders(row, carModelCandidates)?.toString().trim() || '';
          
          const amountCandidates = [
            'Base Amount',
            'Amount',
            'Total Amount $',
            'Total Amount',
            'Reservation Amount',
            'Grand Total $',
            'Grand Total',
            'Total',
            'Total Paid',
            'Amount Paid',
            'Net Amount',
            'Net Price',
            'Price',
            'Voucher Value',
            'Cost',
            'Selling Price',
            'Total (USD)',
            'Amount (USD)',
            'Price (USD)',
            'Voucher Amount',
            'Total Price'
          ];
          
          let amount = 0;
          // Try to find a non-zero amount from candidates first
          for (const candidate of amountCandidates) {
            const rawVal = getRowValueByHeaders(row, [candidate]);
            if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
              const parsed = parseAmount(rawVal);
              if (parsed > 0) {
                amount = parsed;
                break;
              }
            }
          }
          
          // If still zero, just take whatever the first candidate provides
          if (amount === 0) {
            amount = parseAmount(getRowValueByHeaders(row, amountCandidates));
          }
          const status = mapStatus(getRowValueByHeaders(row, ['Reservation Status', 'Status', 'Booking Status']));
          const contactNumber = getRowValueByHeaders(row, ['Contact', 'Phone', 'Mobile', 'Telephone', 'Contact Number'])?.toString().trim() || '';
          const notes = getRowValueByHeaders(row, ['Note', 'Notes', 'Comments', 'Remarks'])?.toString().trim() || '';

          reservations.push({
            id: `import-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
            isNew: false,
            personName,
            contactNumber,
            bookingId,
            source: sourceName,
            bookingDate: bookingDate || '',
            startDate,
            endDate,
            carModel,
            notes,
            locationName,
            status,
            amount,
            hasDateError: hasImportError,
            dateErrorDetail: hasImportError ? importErrorDetail : undefined,
            importLockedYear: typeof selectedYear === 'number' ? selectedYear : undefined,
            importLockedMonth: selectedMonth !== 'All' ? selectedMonth : undefined,
          } as Reservation);
        } catch (err: any) {
          errors.push(`Row ${rowNum}: ${err.message}`);
        }
      });

      if (reservations.length === 0) {
        setError('No valid reservations found.');
        return;
      }

      // VALIDATION: Verify all reservations have locks set correctly
      const lockedCount = reservations.filter(r =>
        r.importLockedYear === selectedYear && r.importLockedMonth === selectedMonth
      ).length;

      console.log('✅ Excel Parsing Complete:', {
        totalReservations: reservations.length,
        lockedToTarget: lockedCount,
        targetLocation: `${selectedYear}/${selectedMonth}`,
        allLocksCorrect: lockedCount === reservations.length,
        sample: reservations.slice(0, 2).map(r => ({
          name: r.personName,
          locks: { year: r.importLockedYear, month: r.importLockedMonth }
        }))
      });

      if (lockedCount !== reservations.length) {
        console.error('❌ LOCK VALIDATION FAILED - Some reservations missing locks!');
        setError('Internal error: Failed to set month locks on reservations. Please try again.');
        return;
      }

      onReservationsImported(reservations, {
        year: typeof selectedYear === 'number' ? selectedYear : undefined,
        month: selectedMonth !== 'All' ? selectedMonth : undefined,
      });

      setSuccess(`✅ Imported ${reservations.length} reservations into ${selectedMonth} ${selectedYear}. ${errors.length} rows skipped.`);
      if (errors.length > 0) {
        setError(`Skipped rows:\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? `\n... and ${errors.length - 10} more` : ''}`);
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to read file: ' + err.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Import Reservations from Excel</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Import Year</label>
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(e.target.value === 'All' ? 'All' : parseInt(e.target.value))}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary bg-gray-50"
          >
            <option value="All">All Years</option>
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Import Month</label>
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary bg-gray-50"
          >
            <option value="All">All Year</option>
            {MONTHS.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <input
          type="file"
          accept=".xlsx, .xls, .csv"
          onChange={handleFileUpload}
          disabled={uploading}
          className="hidden"
          id="excel-upload-input"
        />
        <label
          htmlFor="excel-upload-input"
          className={`cursor-pointer inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {uploading ? 'Uploading...' : 'Choose Excel File'}
        </label>
        <p className="mt-2 text-sm text-gray-500">
          Required columns: <strong>Client Name, Pick-up Date, Drop-off Date</strong><br />
          Supports various date formats and flexible column names.
        </p>
      </div>
      {error && <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md whitespace-pre-wrap">{error}</div>}
      {success && <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-md">{success}</div>}
    </div>
  );
};

export default ExcelUpload;
