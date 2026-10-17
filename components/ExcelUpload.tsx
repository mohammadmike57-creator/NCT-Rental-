import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Reservation, ImportReport } from '../types';
import { MONTHS, INITIAL_YEARS } from '../constants';
import { reservationService } from '../services/reservationService';
import { UploadIcon, DocumentTextIcon, CheckCircleIcon, AlertIcon } from './icons';

interface ExcelUploadProps {
  onReservationsImported: (data: any, report: ImportReport) => void;
  years?: number[];
  focusYear?: number;
  focusMonth?: string;
}

const selectCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none';

const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const ExcelUpload: React.FC<ExcelUploadProps> = ({ onReservationsImported, years = INITIAL_YEARS, focusYear, focusMonth }) => {
  const [uploading, setUploading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(focusMonth || MONTHS[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState<number>(focusYear || new Date().getFullYear());
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number; target: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const processFile = async (file: File) => {
    setUploading(true);
    setError(null);
    setReport(null);
    setFileInfo({ name: file.name, size: file.size, target: `${selectedMonth} ${selectedYear}` });

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: true });

      if (rows.length > 0) {
        console.log('[IMPORT LOG] Found headers:', Object.keys(rows[0]));
      }

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
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await processFile(file);
    } finally {
      event.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file && /\.(xlsx|xls|csv)$/i.test(file.name)) processFile(file);
    else if (file) setError('Unsupported file type. Please choose an .xlsx, .xls or .csv file.');
  };

  const steps = [
    { n: 1, title: 'Choose where to store', text: 'Pick the year and month the reservations belong to.' },
    { n: 2, title: 'Upload the sheet', text: 'Excel (.xlsx, .xls) or CSV. The first sheet is read.' },
    { n: 3, title: 'Review the report', text: 'Existing bookings are updated; invalid rows are listed.' },
  ];

  const stats = report ? [
    { label: 'Imported', value: report.imported, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
    { label: 'Updated', value: report.duplicates, cls: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
    { label: 'Invalid', value: report.invalidRows, cls: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
    { label: 'Skipped', value: report.skipped, cls: 'bg-slate-50 text-slate-700 ring-slate-500/20' },
  ] : [];

  return (
    <div className="space-y-5 mb-10 max-w-4xl">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <UploadIcon className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Import reservations</h2>
          <p className="text-sm text-slate-500">Bring bookings in from an Excel or CSV export and store them in a chosen month.</p>
        </div>
      </div>

      {/* Steps */}
      <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {steps.map(s => (
          <li key={s.n} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex gap-3">
            <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 ring-1 ring-inset ring-indigo-600/20">{s.n}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{s.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Storage period</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-sm font-medium text-slate-700 mb-1">Year</span>
              <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} disabled={uploading} className={selectCls}>
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-slate-700 mb-1">Month</span>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} disabled={uploading} className={selectCls}>
                {MONTHS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">File</h3>
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
            onDragOver={e => { e.preventDefault(); if (!uploading) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`block border-2 border-dashed rounded-2xl px-4 py-10 sm:py-12 text-center transition-colors ${uploading ? 'cursor-not-allowed border-slate-200 bg-slate-50' : dragOver ? 'cursor-pointer border-indigo-400 bg-indigo-50/60' : 'cursor-pointer border-slate-300 hover:border-indigo-400 hover:bg-slate-50'}`}
          >
            <div className={`mx-auto w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${uploading ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-600'}`}>
              {uploading
                ? <span className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                : <UploadIcon className="w-6 h-6" />}
            </div>
            <p className="text-sm font-semibold text-slate-900">{uploading ? 'Importing reservations...' : 'Drop your file here, or click to browse'}</p>
            <p className="text-xs text-slate-500 mt-1">.xlsx, .xls or .csv</p>
            <span className={`mt-4 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl ${uploading ? 'opacity-50' : 'hover:bg-indigo-700'}`}>
              {uploading ? 'Uploading...' : 'Choose Excel file'}
            </span>
            <p className="mt-4 text-sm text-slate-500">
              Reservations will be permanently stored in <strong className="text-slate-900">{selectedMonth} {selectedYear}</strong>
            </p>
          </label>
        </div>

        {fileInfo && (
          <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 text-slate-500 flex items-center justify-center shrink-0">
              <DocumentTextIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">{fileInfo.name}</p>
              <p className="text-xs text-slate-500">{formatSize(fileInfo.size)} · into {fileInfo.target}</p>
            </div>
            {uploading
              ? <span className="text-xs font-semibold text-indigo-600 shrink-0">Processing</span>
              : error
                ? <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset bg-rose-50 text-rose-700 ring-rose-600/20 shrink-0">Failed</span>
                : report && <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset bg-emerald-50 text-emerald-700 ring-emerald-600/20 shrink-0">Done</span>}
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 flex gap-3 text-sm text-rose-700">
          <AlertIcon className="w-5 h-5 shrink-0" />
          <p className="whitespace-pre-wrap break-words min-w-0">{error}</p>
        </div>
      )}

      {report && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Import report</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.map(s => (
              <div key={s.label} className={`rounded-xl p-3 ring-1 ring-inset ${s.cls}`}>
                <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                <p className="text-xs font-medium opacity-80">{s.label}</p>
              </div>
            ))}
          </div>

          {report.errors.length > 0 && (
            <div className="rounded-xl border border-rose-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-200 flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-rose-700">Validation errors</h4>
                <span className="text-xs font-semibold text-rose-600">{report.errors.length}</span>
              </div>
              <ul className="max-h-60 overflow-y-auto divide-y divide-rose-100 text-xs">
                {report.errors.map((err, i) => (
                  <li key={i} className="px-4 py-2 flex gap-3">
                    <span className="font-semibold text-rose-700 shrink-0 tabular-nums">Row {err.row}</span>
                    <span className="text-slate-600 break-words min-w-0">{err.details}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default ExcelUpload;
