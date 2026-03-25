import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { FleetVehicle } from '../types';

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
          const modelName = row['Model']?.toString().trim();
          const licensePlate = row['License Plate']?.toString().trim();
          const registrationExpiry = row['Registration Expiry']?.toString().trim() || '';
          const category = row['Category']?.toString().trim() || '';
          const securityDeposit = parseFloat(row['Security Deposit']);
          const excess = parseFloat(row['Excess']);
          const sippCode = row['SIPP Code']?.toString().trim() || '';
          const transmission = row['Transmission']?.toString().trim() || '';

          if (!modelName) throw new Error('Model missing');
          if (!licensePlate) throw new Error('License Plate missing');
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
    <div className="mt-4 p-4 border rounded-md bg-gray-50">
      <h3 className="text-md font-semibold mb-2">Import Fleet from Excel</h3>
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
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
          className={`cursor-pointer inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {uploading ? 'Uploading...' : 'Choose Excel File'}
        </label>
        <p className="mt-2 text-sm text-gray-500">
          Required columns: Model, License Plate, Security Deposit, Excess<br />
          Optional: Registration Expiry, Category, SIPP Code, Transmission
        </p>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md whitespace-pre-wrap">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-md">
          {success}
        </div>
      )}
    </div>
  );
};

export default FleetExcelUpload;
