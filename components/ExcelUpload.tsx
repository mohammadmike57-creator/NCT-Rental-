import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Reservation, ReservationStatus } from '../types';
import { MONTHS, INITIAL_YEARS } from '../constants';

interface ExcelUploadProps {
  onReservationsImported: (reservations: Reservation[]) => void;
  years?: number[];
}

const ExcelUpload: React.FC<ExcelUploadProps> = ({ onReservationsImported, years = INITIAL_YEARS }) => {
  const [uploading, setUploading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>('All');
  const [selectedYear, setSelectedYear] = useState<number | 'All'>('All');
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
      const cleaned = dateValue.trim().replace(/\s+/g, ' ');
      if (!cleaned) return null;

      // Handle "June 10, 2026" or "10 June 2026"
      const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
      const shortMonthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      
      const lowerCleaned = cleaned.toLowerCase();
      let foundMonth = -1;
      monthNames.forEach((m, i) => { if (lowerCleaned.includes(m)) foundMonth = i; });
      if (foundMonth === -1) {
        shortMonthNames.forEach((m, i) => { if (lowerCleaned.includes(m)) foundMonth = i; });
      }

      if (foundMonth !== -1) {
        const yearMatch = cleaned.match(/\b(20\d{2})\b/);
        const dayMatch = cleaned.match(/\b(\d{1,2})\b/);
        
        if (yearMatch) year = parseInt(yearMatch[1]);
        else year = typeof selectedYear === 'number' ? selectedYear : new Date().getFullYear();
        
        if (dayMatch) day = parseInt(dayMatch[1]);
        else day = 1;
        
        month = foundMonth;
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
          const personName = getRowValueByHeaders(row, personNameCandidateHeaders)?.toString().trim();
          if (!personName) throw new Error('Client Name missing');

          // Skip summary rows
          const lowerName = personName.toLowerCase();
          if (lowerName === 'total' || lowerName === 'grand total' || lowerName === 'subtotal' || lowerName.includes('total:')) {
            throw new Error('Skipping summary row');
          }

          const pickupDateCandidates = ['Pick-up Date', 'Pickup Date', 'Start Date', 'Date From', 'Collection Date', 'Pickup', 'From Date', 'Pick up', 'Out Date'];
          const dropoffDateCandidates = ['Drop-off Date', 'Dropoff Date', 'End Date', 'Date To', 'Return Date', 'Dropoff', 'To Date', 'Drop off', 'In Date'];
          
          const startDateRaw = getRowValueByHeaders(row, pickupDateCandidates);
          const endDateRaw = getRowValueByHeaders(row, dropoffDateCandidates);
          if (!startDateRaw) throw new Error('Pick-up Date missing');
          if (!endDateRaw) throw new Error('Drop-off Date missing');

          const startDate = parseFlexibleDate(startDateRaw);
          const endDate = parseFlexibleDate(endDateRaw);
          if (!startDate || !endDate) throw new Error('Invalid date format');

          // Optional: Force to selected year/month if requested by user's specific context
          // But usually better to let them be imported as parsed.
          // The user said: "uploude all to the selected month perfectlly"
          // We will remove the skip filters below.

          /* Remove strict month/year filtering as requested by user to "upload all" */
          // const startD = new Date(startDate);
          // const rYear = startD.getFullYear();
          // const rMonth = MONTHS[startD.getMonth()];
          // if (selectedYear !== 'All' && rYear !== selectedYear) ...
          // if (selectedMonth !== 'All' && rMonth !== selectedMonth) ...

          if (new Date(endDate) <= new Date(startDate)) {
            throw new Error('Drop-off date must be after pick-up date');
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
          } as Reservation);
        } catch (err: any) {
          errors.push(`Row ${rowNum}: ${err.message}`);
        }
      });

      if (reservations.length === 0) {
        setError('No valid reservations found.');
        return;
      }

      onReservationsImported(reservations);
      setSuccess(`Imported ${reservations.length} reservations. ${errors.length} rows skipped.`);
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Focus Year (for view)</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Focus Month (for view)</label>
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
