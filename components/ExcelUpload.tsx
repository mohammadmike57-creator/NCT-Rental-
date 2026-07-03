import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Reservation, ImportReport } from '../types';
import { MONTHS, INITIAL_YEARS } from '../constants';
import { reservationService } from '../services/reservationService';

interface ExcelUploadProps {
  onReservationsImported: (data: any, report: ImportReport) => void;
  years?: number[];
  focusYear?: number;
  focusMonth?: string;
}

const ExcelUpload: React.FC<ExcelUploadProps> = ({ onReservationsImported, years = INITIAL_YEARS, focusYear, focusMonth }) => {
  const [uploading, setUploading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(focusMonth || MONTHS[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState<number>(focusYear || new Date().getFullYear());
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setReport(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: true });

      const result = await reservationService.importFromExcel(
        rows,
        selectedYear,
        selectedMonth,
        file.name
      );

      setReport(result.report);
      onReservationsImported(result.data, result.report);
      
      console.log(`[IMPORT LOG] Excel upload complete. Imported: ${result.report.imported}`);
    } catch (err: any) {
      console.error('[IMPORT LOG] Upload failed', err);
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Target Storage Year</label>
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary bg-gray-50"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target Storage Month</label>
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary bg-gray-50"
          >
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
          Reservations will be permanently stored in <strong>{selectedMonth} {selectedYear}</strong>
        </p>
      </div>

      {error && <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md whitespace-pre-wrap">{error}</div>}
      
      {report && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="font-semibold text-gray-800 mb-2">Import Report</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-2 bg-green-50 rounded">
              <span className="block text-green-700 font-bold">{report.imported}</span>
              <span className="text-gray-600">Imported</span>
            </div>
            <div className="p-2 bg-blue-50 rounded">
              <span className="block text-blue-700 font-bold">{report.duplicates}</span>
              <span className="text-gray-600">Updated</span>
            </div>
            <div className="p-2 bg-yellow-50 rounded">
              <span className="block text-yellow-700 font-bold">{report.invalidRows}</span>
              <span className="text-gray-600">Invalid</span>
            </div>
            <div className="p-2 bg-gray-100 rounded">
              <span className="block text-gray-700 font-bold">{report.skipped}</span>
              <span className="text-gray-600">Skipped</span>
            </div>
          </div>
          
          {report.errors.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-red-700 mb-1">Validation Errors:</h4>
              <ul className="text-xs text-red-600 list-disc list-inside max-h-40 overflow-y-auto">
                {report.errors.map((err, i) => (
                  <li key={i}>Row {err.row}: {err.details}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExcelUpload;
