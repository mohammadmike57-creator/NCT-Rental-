import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { FleetVehicle } from '../types';
import { DateUtils } from '../services/DateUtils';

interface FleetExcelUploadProps {
  onFleetImported: (vehicles: FleetVehicle[]) => void;
}

const FleetExcelUpload: React.FC<FleetExcelUploadProps> = ({ onFleetImported }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);


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

      const vehicles: FleetVehicle[] = [];
      const errors: string[] = [];

      rows.forEach((row, idx) => {
        const rowNum = idx + 2; // 1‑based, header row is row 1
        try {
          const modelName = DateUtils.getRowValue(row, ['Model', 'Vehicle Model', 'Car Model', 'Vehicle', 'Car'])?.toString().trim();
          const licensePlate = DateUtils.getRowValue(row, ['License Plate', 'Plate', 'Plate Number', 'Reg Number', 'License'])?.toString().trim() || '';
          const rawExpiry = DateUtils.getRowValue(row, ['Registration Expiry', 'Expiry', 'Reg Expiry', 'Expiry Date', 'Registration Expiry Date']);
          const registrationExpiry = DateUtils.parseExcelDate(rawExpiry, row, 'Registration') || DateUtils.parseExcelDate(rawExpiry, row, '') || '';
          const category = DateUtils.getRowValue(row, ['Category', 'Type', 'Group', 'Class'])?.toString().trim() || '';
          
          const securityDepositRaw = DateUtils.getRowValue(row, ['Security Deposit', 'Deposit', 'Sec Deposit']);
          const excessRaw = DateUtils.getRowValue(row, ['Excess', 'Insurance Excess', 'Excess Amount']);
          
          const securityDeposit = DateUtils.parseNumeric(securityDepositRaw);
          const excess = DateUtils.parseNumeric(excessRaw);
          
          const sippCode = DateUtils.getRowValue(row, ['SIPP Code', 'SIPP', 'ACRISS'])?.toString().trim() || '';
          const transmission = DateUtils.getRowValue(row, ['Transmission', 'Gearbox', 'Gear'])?.toString().trim() || '';

          if (!modelName) throw new Error('Model missing');
          if (isNaN(securityDeposit)) throw new Error('Invalid Security Deposit');
          if (isNaN(excess)) throw new Error('Invalid Excess');

          vehicles.push({
            id: `vehicle-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 9)}`,
            modelName,
            licensePlate,
            registrationExpiry,
            category,
            securityDeposit,
            excess,
            sippCode,
            transmission,
          });
        } catch (err: any) {
          errors.push(`Row ${rowNum}: ${err.message}`);
        }
      });

      if (vehicles.length === 0) {
        setError('No valid vehicles found. Please check the file format.');
        return;
      }

      onFleetImported(vehicles);
      setSuccess(`Successfully imported ${vehicles.length} vehicles. ${errors.length} rows skipped.`);
      if (errors.length > 0) {
        setError(`Some rows were skipped:\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? `\n... and ${errors.length - 10} more` : ''}`);
      }
    } catch (err: any) {
      console.error('Excel upload error:', err);
      setError('Failed to read file: ' + err.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <div className="border border-dashed border-slate-300 rounded-lg bg-slate-50/50 px-4 py-6 text-center">
        <input
          type="file"
          accept=".xlsx, .xls"
          onChange={handleFileUpload}
          disabled={uploading}
          className="hidden"
          id="fleet-excel-upload-input"
        />
        <label
          htmlFor="fleet-excel-upload-input"
          className={`inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-[13px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm ${uploading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {uploading && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          {uploading ? 'Uploading...' : 'Choose Excel File'}
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Required columns: <span className="font-medium text-slate-700">Model, Security Deposit, Excess</span> (License Plate is optional)<br />
          Optional: Registration Expiry, Category, SIPP Code, Transmission
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700 whitespace-pre-wrap break-words">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-800">
          {success}
        </div>
      )}
    </div>
  );
};

export default FleetExcelUpload;
