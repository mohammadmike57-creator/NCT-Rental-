import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Reservation, ImportReport } from '../types';
import { MONTHS, INITIAL_YEARS } from '../constants';
import { reservationService } from '../services/reservationService';
import { UploadIcon, DocumentTextIcon, AlertIcon } from './icons';
import { Page, PageHeader, StatGrid, Panel, Badge, Field, selectCls as crmSelectCls } from './ui/Crm';

interface ExcelUploadProps {
  onReservationsImported: (data: any, report: ImportReport) => void;
  years?: number[];
  focusYear?: number;
  focusMonth?: string;
}

const selectCls = `${crmSelectCls} w-full`;

/** Settings row: short description column on the left (lg), content on the right. */
const SettingsSection: React.FC<{ title: string; description: React.ReactNode; children: React.ReactNode }> = ({ title, description, children }) => (
  <div className="lg:grid lg:grid-cols-3 lg:gap-6">
    <div className="mb-3 lg:mb-0 lg:pt-1">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-0.5 text-[13px] text-slate-500">{description}</div>
    </div>
    <div className="lg:col-span-2 min-w-0">{children}</div>
  </div>
);

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
    { label: 'Imported', value: report.imported, tone: 'success' as const },
    { label: 'Updated', value: report.duplicates, tone: 'info' as const },
    { label: 'Invalid', value: report.invalidRows, tone: 'warning' as const },
    { label: 'Skipped', value: report.skipped, tone: 'muted' as const },
  ] : [];

  return (
    <Page>
      <PageHeader
        section="Data Management"
        title="Import Reservations"
        subtitle="Bring bookings in from an Excel or CSV export and store them in a chosen month."
      />

      {/* Steps */}
      <ol className="bg-white rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        {steps.map(s => (
          <li key={s.n} className="px-4 py-3 flex gap-3 min-w-0">
            <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold flex items-center justify-center shrink-0 tabular-nums">{s.n}</span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-slate-900">{s.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <SettingsSection title="Storage period" description="The year and month the imported reservations are stored under.">
        <Panel footer={<span>Reservations will be permanently stored in <strong className="text-slate-900">{selectedMonth} {selectedYear}</strong>.</span>}>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Year">
              <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} disabled={uploading} className={selectCls}>
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </Field>
            <Field label="Month">
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} disabled={uploading} className={selectCls}>
                {MONTHS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>
          </div>
        </Panel>
      </SettingsSection>

      <SettingsSection title="File" description="Excel (.xlsx, .xls) or CSV. Only the first sheet is read; existing bookings are updated.">
        <Panel
          footer={fileInfo ? (
            <div className="flex items-center gap-3 min-w-0">
              <DocumentTextIcon className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-slate-900 truncate">{fileInfo.name}</p>
                <p className="text-xs text-slate-500">{formatSize(fileInfo.size)} · into {fileInfo.target}</p>
              </div>
              {uploading
                ? <Badge tone="info" className="shrink-0">Processing</Badge>
                : error
                  ? <Badge tone="danger" className="shrink-0">Failed</Badge>
                  : report && <Badge tone="success" className="shrink-0">Done</Badge>}
            </div>
          ) : undefined}
        >
          <div className="p-4">
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
              className={`block border border-dashed rounded-lg px-4 py-8 text-center transition-colors ${uploading ? 'cursor-not-allowed border-slate-200 bg-slate-50' : dragOver ? 'cursor-pointer border-indigo-400 bg-indigo-50/60' : 'cursor-pointer border-slate-300 hover:border-indigo-400 hover:bg-slate-50'}`}
            >
              <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
                {uploading
                  ? <span className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                  : <UploadIcon className="w-5 h-5" />}
              </div>
              <p className="text-[13px] font-semibold text-slate-900">{uploading ? 'Importing reservations...' : 'Drop your file here, or click to browse'}</p>
              <p className="text-xs text-slate-500 mt-0.5">.xlsx, .xls or .csv</p>
              <span className={`mt-3 inline-flex items-center justify-center gap-1.5 h-9 px-3.5 text-[13px] font-semibold text-white bg-indigo-600 rounded-lg shadow-sm ${uploading ? 'opacity-40' : 'hover:bg-indigo-700'}`}>
                {uploading ? 'Uploading...' : 'Choose Excel file'}
              </span>
            </label>
          </div>
        </Panel>
      </SettingsSection>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex gap-3 text-[13px] text-rose-700">
          <AlertIcon className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="whitespace-pre-wrap break-words min-w-0">{error}</p>
        </div>
      )}

      {report && (
        <SettingsSection title="Import report" description="Summary of the last import. Invalid rows are listed with the reason.">
          <div className="space-y-4">
            <StatGrid items={stats} />
            {report.errors.length > 0 && (
              <Panel title="Validation errors" actions={<Badge tone="danger">{report.errors.length}</Badge>}>
                <ul className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {report.errors.map((err, i) => (
                    <li key={i} className="px-4 py-2 flex gap-3">
                      <span className="font-semibold text-rose-700 shrink-0 tabular-nums">Row {err.row}</span>
                      <span className="text-slate-600 break-words min-w-0">{err.details}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </SettingsSection>
      )}
    </Page>
  );
};

export default ExcelUpload;
