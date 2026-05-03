import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Reservation, ReservationStatus } from '../types';

interface ExcelUploadProps {
  onReservationsImported: (reservations: Reservation[]) => void;
}

const ExcelUpload: React.FC<ExcelUploadProps> = ({ onReservationsImported }) => {
  const [uploading, setUploading] = useState(false);
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

  // Parse US date format: MM/DD/YYYY or MM/DD/YYYY HH:MM
  const parseUSDate = (dateValue: any): string | null => {
    if (!dateValue) return null;
    let year: number, month: number, day: number, hour = 12, minute = 0;

    if (typeof dateValue === 'number') {
      // Excel serial date
      const date = XLSX.SSF.parse_date_code(dateValue);
      year = date.y;
      month = date.m - 1;
      day = date.d;
      hour = date.H || 12;
      minute = date.M || 0;
    } else if (typeof dateValue === 'string') {
      // Clean the string
      const cleaned = dateValue.trim();
      // Match MM/DD/YYYY or MM/DD/YYYY HH:MM
      const match = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
      if (match) {
        month = parseInt(match[1]) - 1;
        day = parseInt(match[2]);
        year = parseInt(match[3]);
        hour = match[4] ? parseInt(match[4]) : 12;
        minute = match[5] ? parseInt(match[5]) : 0;
      } else {
        // Try standard JS parsing as fallback
        const d = new Date(cleaned);
        if (!isNaN(d.getTime())) {
          year = d.getFullYear();
          month = d.getMonth();
          day = d.getDate();
          hour = d.getHours();
          minute = d.getMinutes();
        } else {
          return null;
        }
      }
    } else if (dateValue instanceof Date) {
      year = dateValue.getFullYear();
      month = dateValue.getMonth();
      day = dateValue.getDate();
      hour = dateValue.getHours();
      minute = dateValue.getMinutes();
    } else {
      return null;
    }

    // Validate ranges
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;

    const localDate = new Date(year, month, day, hour, minute);
    if (isNaN(localDate.getTime())) return null;

    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
  };

  const mapStatus = (status: string): ReservationStatus => {
    const s = (status || '').toLowerCase().trim();
    if (s === 'confirm' || s === 'confirmed') return ReservationStatus.CONFIRMED;
    if (s === 'cancel' || s === 'cancelled') return ReservationStatus.CANCELLED;
    if (s === 'no show') return 'NO_SHOW' as ReservationStatus;
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
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      const reservations: Reservation[] = [];
      const errors: string[] = [];

      rows.forEach((row, idx) => {
        const rowNum = idx + 2;
        try {
          const personName = row['Client Name']?.toString().trim();
          if (!personName) throw new Error('Client Name missing');

          const startDateRaw = row['Pick-up Date'];
          const endDateRaw = row['Drop-off Date'];
          if (!startDateRaw) throw new Error('Pick-up Date missing');
          if (!endDateRaw) throw new Error('Drop-off Date missing');

          const startDate = parseUSDate(startDateRaw);
          const endDate = parseUSDate(endDateRaw);
          if (!startDate || !endDate) throw new Error('Invalid date format');

          if (new Date(endDate) <= new Date(startDate)) {
            throw new Error('Drop-off date must be after pick-up date');
          }

          const bookingId = row['Reference Number']?.toString().trim() || `import-${Date.now()}-${idx}`;
          const sourceName = row['Broker Name']?.toString().trim() || 'Website';
          const bookingDateRaw = row['Booked on Date'];
          const bookingDate = bookingDateRaw ? parseUSDate(bookingDateRaw)?.split('T')[0] : new Date().toISOString().split('T')[0];
          const locationName = row['Branch']?.toString().trim() || '';
          const carModel = row['Car Type']?.toString().trim() || '';
          const amount = parseAmount(getRowValueByHeaders(row, [
            'Total Amount $',
            'Total Amount',
            'Amount',
            'Reservation Amount',
            'Grand Total',
            'Total',
          ]));
          const status = mapStatus(row['Reservation Status']);
          const contactNumber = row['Contact']?.toString().trim() || '';
          const notes = row['Note']?.toString().trim() || '';

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
          Dates must be in <strong>month/day/year</strong> format (e.g., 02/01/2026 for February 1, 2026).
        </p>
      </div>
      {error && <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md whitespace-pre-wrap">{error}</div>}
      {success && <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-md">{success}</div>}
    </div>
  );
};

export default ExcelUpload;
