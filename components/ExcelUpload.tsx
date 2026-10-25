import React, { useMemo, useState } from 'react';
import { AppData, Fleet, ImportReport, PaymentType, RentalSource, Reservation } from '../types';
import { MONTHS, INITIAL_YEARS } from '../constants';
import { reservationService } from '../services/reservationService';
import {
  FIELDS, FieldKey, ColumnMap, DateOrder, SheetTable, PreparedRow,
  readTables, detectColumns, detectDateOrder, prepareRows, matchSource, matchCar, toReservations,
} from '../services/smartImport';
import { UploadIcon, DocumentTextIcon, AlertIcon, CheckCircleIcon } from './icons';
import { Page, PageHeader, StatGrid, Panel, Badge, Button, Segmented, Tabs, Field, EmptyState, selectCls as crmSelectCls, table } from './ui/Crm';

interface ExcelUploadProps {
  onReservationsImported: (data: any, report: ImportReport) => void;
  years?: number[];
  focusYear?: number;
  focusMonth?: string;
  /** The reservations on screen now (so the import merges into the latest data). */
  allData?: AppData;
  sources?: RentalSource[];
  fleet?: Fleet;
  /** Saves sources added during the import. */
  onAddSources?: (added: RentalSource[]) => Promise<void> | void;
  onOpenReservations?: () => void;
}

const selectCls = `${crmSelectCls} w-full`;
const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const NEW = '__new__';
const KEEP = '__keep__';

/** 2026-11-05T10:30 → "05 Nov 2026 · 10:30" */
const showDate = (s: string) => {
  if (!s) return '';
  const [d, t] = s.split('T');
  const [y, m, day] = d.split('-').map(Number);
  return `${String(day).padStart(2, '0')} ${MONTHS[m - 1]?.slice(0, 3)} ${y}${t && t !== '12:00' ? ` · ${t}` : ''}`;
};
const daysBetween = (a: string, b: string) => {
  if (!a || !b) return 0;
  const ms = new Date(`${b.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${a.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.max(1, Math.round(ms / 86400000));
};

const StepBar: React.FC<{ step: 1 | 2 | 3 }> = ({ step }) => (
  <ol className="bg-white rounded-xl border border-slate-200 shadow-sm grid grid-cols-3 divide-x divide-slate-200 overflow-hidden">
    {[['Upload', 'Excel or CSV file'], ['Review', 'Check what was read'], ['Done', 'Saved to reservations']].map(([t, s], i) => {
      const n = i + 1;
      const state = n < step ? 'done' : n === step ? 'now' : 'next';
      return (
        <li key={t} className={`px-3 sm:px-4 py-3 flex items-center gap-3 min-w-0 ${state === 'now' ? 'bg-indigo-50/60' : ''}`}>
          <span className={`w-7 h-7 rounded-full text-[12px] font-semibold flex items-center justify-center shrink-0 ${state === 'done' ? 'bg-emerald-500 text-white' : state === 'now' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
            {state === 'done' ? '✓' : n}
          </span>
          <div className="min-w-0">
            <p className={`text-[13px] font-semibold ${state === 'next' ? 'text-slate-500' : 'text-slate-900'}`}>{t}</p>
            <p className="hidden sm:block text-xs text-slate-500 truncate">{s}</p>
          </div>
        </li>
      );
    })}
  </ol>
);

type RowStatus = 'new' | 'update' | 'problem' | 'ignored';

const ExcelUpload: React.FC<ExcelUploadProps> = ({ onReservationsImported, years = INITIAL_YEARS, focusYear, focusMonth, allData, sources = [], fleet = [], onAddSources, onOpenReservations }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [tables, setTables] = useState<SheetTable[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [columns, setColumns] = useState<ColumnMap>({});
  const [order, setOrder] = useState<DateOrder>('DMY');
  const [orderAuto, setOrderAuto] = useState<DateOrder>('DMY');
  const [sourceChoice, setSourceChoice] = useState<Record<string, string>>({});
  const [carChoice, setCarChoice] = useState<Record<string, string>>({});
  const [defaultSource, setDefaultSource] = useState('');
  const [byPickupMonth, setByPickupMonth] = useState(true);
  const [month, setMonth] = useState<string>(focusMonth || MONTHS[new Date().getMonth()]);
  const [year, setYear] = useState<number>(focusYear || new Date().getFullYear());
  const [view, setView] = useState<'all' | 'new' | 'update' | 'problem'>('all');
  const [done, setDone] = useState<{ report: ImportReport; added: string[]; skipped: { row: number; details: string }[] } | null>(null);

  const t = tables[sheetIdx];
  const rows: PreparedRow[] = useMemo(() => (t ? prepareRows(t, columns, order) : []), [t, columns, order]);

  const existingIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(allData || reservationService.getData() || {}).forEach(y => Object.values(y || {}).forEach(list => (list as Reservation[]).forEach(r => { const k = r.invoice || r.bookingId; if (k) ids.add(k); })));
    return ids;
  }, [allData, done]);

  const statusOf = (r: PreparedRow): RowStatus => {
    if (!r.bookingId && !r.customer && !r.pickup && !r.dropoff) return 'ignored'; // blank or totals row
    if (r.problems.length) return 'problem';
    return r.bookingId && existingIds.has(r.bookingId) ? 'update' : 'new';
  };

  const distinctSources = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach(r => { if (r.sourceRaw && statusOf(r) !== 'ignored') m.set(r.sourceRaw, (m.get(r.sourceRaw) || 0) + 1); });
    return Array.from(m.entries()).map(([raw, n]) => ({ raw, n, m: matchSource(raw, sources) })).sort((a, b) => b.n - a.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sources, existingIds]);
  const distinctCars = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach(r => { if (r.carRaw && statusOf(r) !== 'ignored') m.set(r.carRaw, (m.get(r.carRaw) || 0) + 1); });
    return Array.from(m.entries()).map(([raw, n]) => ({ raw, n, m: matchCar(raw, fleet) })).sort((a, b) => b.n - a.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, fleet, existingIds]);
  const noSourceCount = rows.filter(r => !r.sourceRaw && (statusOf(r) === 'new' || statusOf(r) === 'update')).length;

  // Chosen values (defaults: the automatic match).
  const sourceValue = (raw: string) => sourceChoice[raw] ?? (distinctSources.find(s => s.raw === raw)?.m.match || NEW);
  const sourceName = (raw: string) => {
    if (!raw) return defaultSource;
    const v = sourceValue(raw);
    return v === NEW ? (distinctSources.find(s => s.raw === raw)?.m.suggested || raw) : v;
  };
  const carValue = (raw: string) => carChoice[raw] ?? (distinctCars.find(c => c.raw === raw)?.m.match || KEEP);
  const carName = (raw: string) => { const v = carValue(raw); return v === KEEP ? raw : v; };

  const fleetModels = useMemo(() => Array.from(new Set(fleet.map(v => v.modelName).filter(Boolean))).sort(), [fleet]);
  const counts = useMemo(() => {
    const c = { new: 0, update: 0, problem: 0, ignored: 0 };
    rows.forEach(r => { c[statusOf(r)]++; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, existingIds]);
  const outsideMonth = !byPickupMonth ? rows.filter(r => statusOf(r) === 'new' && r.pickup && (MONTHS[+r.pickup.slice(5, 7) - 1] !== month || +r.pickup.slice(0, 4) !== year)).length : 0;
  const newSourceNames = Array.from(new Set(distinctSources.filter(s => sourceValue(s.raw) === NEW).map(s => s.m.suggested).filter(Boolean)))
    .filter(n => !sources.some(s => s.name.toLowerCase() === n.toLowerCase()));

  const reset = () => {
    setFile(null); setTables([]); setColumns({}); setSourceChoice({}); setCarChoice({}); setError(null); setDone(null); setView('all');
  };

  const readFile = async (f: File) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const found = readTables(await f.arrayBuffer());
      if (!found.length || !found[0].rows.length) throw new Error('No rows were found in this file.');
      setFile({ name: f.name, size: f.size });
      setTables(found);
      pickSheet(found, 0);
      setSourceChoice({});
      setCarChoice({});
      setView('all');
    } catch (e: any) {
      setError(`This file could not be read: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const pickSheet = (list: SheetTable[], i: number) => {
    setSheetIdx(i);
    const map = detectColumns(list[i]);
    setColumns(map);
    const o = detectDateOrder(list[i], map);
    setOrder(o);
    setOrderAuto(o);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) await readFile(f);
  };
  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const f = e.dataTransfer.files?.[0];
    if (f && /\.(xlsx|xlsm|xls|csv)$/i.test(f.name)) readFile(f);
    else if (f) setError('Unsupported file type. Please choose an .xlsx, .xls or .csv file.');
  };

  const runImport = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      // Sources the review chose to add are created first, so bookings point at real sources.
      const added: RentalSource[] = newSourceNames.map(name => ({ id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, paymentType: PaymentType.PAY_ON_ARRIVAL }));
      if (added.length && onAddSources) await onAddSources(added);
      const ready = rows.filter(r => { const s = statusOf(r); return s === 'new' || s === 'update'; });
      const reservations = toReservations(ready, { year, month, byPickupMonth, fileName: file.name, sourceFor: sourceName, carFor: carName });
      const skipped = rows.filter(r => statusOf(r) === 'problem').map(r => ({ row: r.row, details: r.problems.join(' · ') }));
      const report: ImportReport = { imported: reservations.length, skipped: counts.ignored, duplicates: 0, invalidRows: skipped.length, warnings: [], errors: skipped };
      const result = await reservationService.importReservations(reservations, report, { year, month }, allData);
      onReservationsImported(result.data, result.report);
      setDone({ report: result.report, added: added.map(a => a.name), skipped });
    } catch (e: any) {
      setError(`The import could not be saved: ${e?.message || e}. Nothing was changed.`);
    } finally {
      setBusy(false);
    }
  };

  const step: 1 | 2 | 3 = done ? 3 : t ? 2 : 1;
  const visibleRows = rows.filter(r => { const s = statusOf(r); return s !== 'ignored' && (view === 'all' || s === view); });
  const sample = (c?: number) => (c === undefined || !t ? '' : String(t.rows.find(r => r[c] !== '' && r[c] !== undefined)?.[c] ?? ''));
  const firstDate = rows.find(r => r.pickup);
  const shownFields: FieldKey[] = ['bookingId', 'customer', 'pickupDate', 'pickupTime', 'dropoffDate', 'dropoffTime', 'vehicle', 'source', 'amount', 'phone', 'email', 'location', 'notes', 'bookingDate', 'firstName', 'lastName'];
  const required: FieldKey[] = ['customer', 'pickupDate', 'dropoffDate'];

  return (
    <Page>
      <PageHeader
        section="Data Management"
        title="Import Reservations"
        subtitle="Upload a booking sheet from any website or partner. The system reads it, matches sources and cars, and shows you everything before saving."
        actions={step === 2 ? <Button onClick={reset} disabled={busy}>Choose another file</Button> : undefined}
      />
      <StepBar step={step} />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex gap-3 text-[13px] text-rose-700">
          <AlertIcon className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="whitespace-pre-wrap break-words min-w-0">{error}</p>
        </div>
      )}

      {step === 1 && (
        <Panel>
          <div className="p-4 sm:p-6">
            <input type="file" accept=".xlsx,.xlsm,.xls,.csv" onChange={onPick} disabled={busy} className="hidden" id="excel-upload-input" />
            <label htmlFor="excel-upload-input"
              onDragOver={e => { e.preventDefault(); if (!busy) setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}
              className={`block border-2 border-dashed rounded-xl px-4 py-12 text-center transition-colors ${busy ? 'cursor-wait border-slate-200 bg-slate-50' : dragOver ? 'cursor-pointer border-indigo-400 bg-indigo-50/60' : 'cursor-pointer border-slate-300 hover:border-indigo-400 hover:bg-slate-50'}`}>
              <div className="mx-auto w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                {busy ? <span className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" /> : <UploadIcon className="w-6 h-6" />}
              </div>
              <p className="text-[15px] font-semibold text-slate-900">{busy ? 'Reading the file…' : 'Drop your booking sheet here, or click to browse'}</p>
              <p className="text-xs text-slate-500 mt-1">Excel (.xlsx, .xls) or CSV · nothing is saved until you confirm</p>
              <span className="mt-4 inline-flex items-center justify-center h-9 px-4 text-[13px] font-semibold text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700">Choose file</span>
            </label>
            <div className="mt-5 grid gap-3 sm:grid-cols-3 text-xs text-slate-600">
              {[
                ['Dates', 'Read as day / month / year: 05/11/2026, 5-11-26, 5 Nov 2026, Excel dates, with or without time.'],
                ['Sources', 'Matched to your existing sources: “website”, “Web” or “www.nctrental.com” all become Website.'],
                ['Cars', 'Matched to your fleet: “Pegas” → Kia Pegas, “Sunny” → Nissan Sunny, “or similar” ignored.'],
              ].map(([h, s]) => (
                <div key={h} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5"><p className="font-semibold text-slate-800">{h}</p><p className="mt-0.5">{s}</p></div>
              ))}
            </div>
          </div>
        </Panel>
      )}

      {step === 2 && t && file && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <DocumentTextIcon className="w-5 h-5 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-slate-900 truncate">{file.name}</p>
              <p className="text-xs text-slate-500">{formatSize(file.size)} · sheet “{t.sheet}” · headings on row {t.headerRow} · {counts.new + counts.update + counts.problem} booking rows</p>
            </div>
            {tables.length > 1 && (
              <select value={sheetIdx} onChange={e => pickSheet(tables, +e.target.value)} className={`${crmSelectCls} w-48`} aria-label="Sheet">
                {tables.map((x, i) => <option key={x.sheet} value={i}>{x.sheet}</option>)}
              </select>
            )}
          </div>

          <StatGrid items={[
            { label: 'New bookings', value: counts.new, sub: 'will be added', tone: 'success', active: view === 'new', onClick: () => setView(view === 'new' ? 'all' : 'new') },
            { label: 'Already in system', value: counts.update, sub: 'will be updated, not duplicated', tone: 'info', active: view === 'update', onClick: () => setView(view === 'update' ? 'all' : 'update') },
            { label: 'Need attention', value: counts.problem, sub: counts.problem ? 'will be skipped' : 'none', tone: counts.problem ? 'warning' : 'default', active: view === 'problem', onClick: () => setView(view === 'problem' ? 'all' : 'problem') },
            { label: 'Blank / total rows', value: counts.ignored, sub: 'ignored', tone: 'muted' },
          ]} />

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Columns" subtitle="Found automatically. Change any that are wrong.">
              <div className="p-4 grid gap-x-4 gap-y-3 sm:grid-cols-2">
                {shownFields.filter(k => !((k === 'firstName' || k === 'lastName') && columns[k] === undefined)).map(k => {
                  const def = FIELDS.find(f => f.key === k)!;
                  const c = columns[k];
                  return (
                    <Field key={k} label={<span className="flex items-center justify-between gap-2">{def.label}{c === undefined ? (required.includes(k) && !(k === 'customer' && columns.firstName !== undefined) ? <span className="text-rose-600 font-semibold normal-case">Missing</span> : <span className="text-slate-400 font-normal normal-case">not in file</span>) : <span className="text-slate-400 font-normal normal-case truncate max-w-[55%]">e.g. {sample(c) || '—'}</span>}</span>}>
                      <select value={c ?? ''} onChange={e => setColumns(prev => { const n = { ...prev }; if (e.target.value === '') delete n[k]; else n[k] = +e.target.value; return n; })} className={selectCls}>
                        <option value="">— Not in this file —</option>
                        {t.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                    </Field>
                  );
                })}
              </div>
            </Panel>

            <div className="space-y-4">
              <Panel title="Dates" subtitle={orderAuto === order ? 'Detected from the file.' : 'Changed by you.'}>
                <div className="p-4 space-y-3">
                  <Segmented value={order} onChange={k => setOrder(k as DateOrder)} options={[{ key: 'DMY', label: 'Day / Month / Year' }, { key: 'MDY', label: 'Month / Day / Year' }]} />
                  {firstDate && (
                    <p className="text-xs text-slate-600">
                      Row {firstDate.row}: <span className="font-mono text-slate-500">{sample(columns.pickupDate) && String(t.rows[firstDate.row - t.headerRow - 1]?.[columns.pickupDate!] ?? '')}</span> → <strong className="text-slate-900">{showDate(firstDate.pickup)}</strong>
                      {' '}until <strong className="text-slate-900">{showDate(firstDate.dropoff)}</strong> ({daysBetween(firstDate.pickup, firstDate.dropoff)} days)
                    </p>
                  )}
                </div>
              </Panel>

              <Panel title="Store bookings in">
                <div className="p-4 space-y-3 text-[13px]">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input type="radio" name="store" checked={byPickupMonth} onChange={() => setByPickupMonth(true)} className="mt-0.5" />
                    <span><span className="font-semibold text-slate-900">Each booking in its pick-up month</span> <Badge tone="success" dot={false} className="ml-1 !text-[10px]">Recommended</Badge><br /><span className="text-xs text-slate-500">A booking picking up on 05 Nov goes to November.</span></span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input type="radio" name="store" checked={!byPickupMonth} onChange={() => setByPickupMonth(false)} className="mt-0.5" />
                    <span className="flex-1"><span className="font-semibold text-slate-900">All in one month</span>
                      {!byPickupMonth && (
                        <span className="mt-2 grid grid-cols-2 gap-2">
                          <select value={month} onChange={e => setMonth(e.target.value)} className={selectCls}>{MONTHS.map(m => <option key={m}>{m}</option>)}</select>
                          <select value={year} onChange={e => setYear(+e.target.value)} className={selectCls}>{years.map(y => <option key={y}>{y}</option>)}</select>
                        </span>
                      )}
                      {outsideMonth > 0 && <span className="block mt-1.5 text-xs text-amber-700">{outsideMonth} booking{outsideMonth === 1 ? ' picks' : 's pick'} up outside {month} {year}.</span>}
                    </span>
                  </label>
                  <p className="text-xs text-slate-500">Bookings already in the system stay where they are and are updated.</p>
                </div>
              </Panel>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Sources" subtitle="Matched to the sources you already have, so none are listed twice.">
              {distinctSources.length || noSourceCount ? (
                <table className={table.wrap}>
                  <thead className={table.head}><tr><th className={table.th}>In the file</th><th className={table.th}>Bookings</th><th className={table.th}>Save as</th></tr></thead>
                  <tbody className={table.body}>
                    {distinctSources.map(s => {
                      const v = sourceValue(s.raw);
                      return (
                        <tr key={s.raw}>
                          <td className={table.td}><span className="font-medium text-slate-900">{s.raw}</span></td>
                          <td className={`${table.td} tabular-nums text-slate-500`}>{s.n}</td>
                          <td className={table.td}>
                            <div className="flex items-center gap-2">
                              <select value={v} onChange={e => setSourceChoice(p => ({ ...p, [s.raw]: e.target.value }))} className={selectCls}>
                                {sources.map(x => <option key={x.id} value={x.name}>{x.name}</option>)}
                                <option value={NEW}>+ Add new source “{s.m.suggested}”</option>
                              </select>
                              {v === NEW ? <Badge tone="warning" className="shrink-0">New</Badge> : <Badge tone="success" className="shrink-0">Matched</Badge>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {noSourceCount > 0 && (
                      <tr>
                        <td className={table.td}><span className="italic text-slate-500">No source given</span></td>
                        <td className={`${table.td} tabular-nums text-slate-500`}>{noSourceCount}</td>
                        <td className={table.td}>
                          <select value={defaultSource} onChange={e => setDefaultSource(e.target.value)} className={selectCls}>
                            <option value="">Leave empty</option>
                            {sources.map(x => <option key={x.id} value={x.name}>{x.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : <EmptyState title="No source column" hint="Choose the Source column above if the file has one." />}
            </Panel>

            <Panel title="Cars" subtitle="Matched to your fleet and to well-known models.">
              {distinctCars.length ? (
                <table className={table.wrap}>
                  <thead className={table.head}><tr><th className={table.th}>In the file</th><th className={table.th}>Bookings</th><th className={table.th}>Save as</th></tr></thead>
                  <tbody className={table.body}>
                    {distinctCars.map(c => {
                      const v = carValue(c.raw);
                      const opts = Array.from(new Set([...(c.m.match && !fleetModels.includes(c.m.match) ? [c.m.match] : []), ...fleetModels]));
                      return (
                        <tr key={c.raw}>
                          <td className={table.td}><span className="font-medium text-slate-900">{c.raw}</span></td>
                          <td className={`${table.td} tabular-nums text-slate-500`}>{c.n}</td>
                          <td className={table.td}>
                            <div className="flex items-center gap-2">
                              <select value={v} onChange={e => setCarChoice(p => ({ ...p, [c.raw]: e.target.value }))} className={selectCls}>
                                {opts.map(o => <option key={o} value={o}>{o}{fleetModels.includes(o) ? '' : ' (not in fleet)'}</option>)}
                                <option value={KEEP}>Keep as written: “{c.raw}”</option>
                              </select>
                              {v === KEEP ? <Badge tone="muted" className="shrink-0">As written</Badge> : fleetModels.includes(v) ? <Badge tone="success" className="shrink-0">Fleet</Badge> : <Badge tone="info" className="shrink-0">Model</Badge>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : <EmptyState title="No car column" hint="Choose the Car column above if the file has one." />}
            </Panel>
          </div>

          <Panel
            title="Bookings"
            subtitle="Exactly what will be saved."
            footer={<span className="tabular-nums">{visibleRows.length} shown</span>}
          >
            <Tabs value={view} onChange={k => setView(k as typeof view)} tabs={[
              { key: 'all', label: 'All', count: counts.new + counts.update + counts.problem },
              { key: 'new', label: 'New', count: counts.new },
              { key: 'update', label: 'Updates', count: counts.update },
              { key: 'problem', label: 'Need attention', count: counts.problem },
            ]} />
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className={`${table.wrap} min-w-[960px]`}>
                <thead className={`${table.head} sticky top-0 z-10`}>
                  <tr>{['Row', 'Booking', 'Customer', 'Pick-up', 'Drop-off', 'Days', 'Car', 'Source', 'Amount', 'Status'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr>
                </thead>
                <tbody className={table.body}>
                  {visibleRows.slice(0, 500).map(r => {
                    const s = statusOf(r);
                    return (
                      <tr key={r.row} className={s === 'problem' ? 'bg-amber-50/50' : table.row}>
                        <td className={`${table.td} text-xs text-slate-400 tabular-nums`}>{r.row}</td>
                        <td className={`${table.td} font-mono text-xs text-slate-700 whitespace-nowrap`}>{r.bookingId || <span className="text-slate-400 font-sans">auto</span>}</td>
                        <td className={`${table.td} font-medium text-slate-900`}>{r.customer || '—'}</td>
                        <td className={`${table.td} whitespace-nowrap tabular-nums`}>{showDate(r.pickup) || <span className="text-rose-600">—</span>}</td>
                        <td className={`${table.td} whitespace-nowrap tabular-nums`}>{showDate(r.dropoff) || <span className="text-rose-600">—</span>}</td>
                        <td className={`${table.td} tabular-nums text-slate-500`}>{daysBetween(r.pickup, r.dropoff) || ''}</td>
                        <td className={`${table.td} whitespace-nowrap`}>{r.carRaw ? carName(r.carRaw) : '—'}</td>
                        <td className={`${table.td} whitespace-nowrap`}>{sourceName(r.sourceRaw) || '—'}</td>
                        <td className={`${table.td} tabular-nums text-right`}>{r.amount ? r.amount.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : '—'}</td>
                        <td className={table.td}>
                          {s === 'new' && <Badge tone="success">New</Badge>}
                          {s === 'update' && <Badge tone="info">Update</Badge>}
                          {s === 'problem' && <span className="text-xs text-amber-800">{r.problems.join(' · ')}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!visibleRows.length && <EmptyState title="Nothing in this view" />}
            </div>
          </Panel>

          <div className="sticky bottom-0 z-20 -mx-4 sm:mx-0 px-4 py-3 bg-white/95 backdrop-blur border-t sm:border sm:rounded-xl border-slate-200 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] flex flex-wrap items-center gap-3">
            <p className="text-[13px] text-slate-600 flex-1 min-w-[200px]">
              <strong className="text-slate-900">{counts.new}</strong> new and <strong className="text-slate-900">{counts.update}</strong> updated
              {counts.problem ? <>, <strong className="text-amber-700">{counts.problem}</strong> skipped</> : null}
              {newSourceNames.length ? <> · adds source{newSourceNames.length === 1 ? '' : 's'} <strong className="text-slate-900">{newSourceNames.join(', ')}</strong></> : null}
            </p>
            <Button onClick={reset} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={runImport} disabled={busy || counts.new + counts.update === 0}>
              {busy ? 'Saving…' : `Import ${counts.new + counts.update} booking${counts.new + counts.update === 1 ? '' : 's'}`}
            </Button>
          </div>
        </>
      )}

      {step === 3 && done && (
        <Panel>
          <div className="p-6 sm:p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><CheckCircleIcon className="w-7 h-7" /></div>
            <h2 className="mt-3 text-lg font-semibold text-slate-900">Import complete</h2>
            <p className="text-[13px] text-slate-500">{file?.name}</p>
            <div className="mt-5 max-w-2xl mx-auto">
              <StatGrid items={[
                { label: 'Added', value: done.report.imported, tone: 'success' },
                { label: 'Updated', value: done.report.duplicates, tone: 'info' },
                { label: 'Skipped', value: done.skipped.length, tone: done.skipped.length ? 'warning' : 'muted' },
              ]} />
            </div>
            {done.added.length > 0 && <p className="mt-4 text-[13px] text-slate-600">New source{done.added.length === 1 ? '' : 's'} added: <strong>{done.added.join(', ')}</strong>. Set {done.added.length === 1 ? 'its' : 'their'} payment type in Website Sources.</p>}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {onOpenReservations && <Button variant="primary" onClick={onOpenReservations}>Open reservations</Button>}
              <Button onClick={reset}>Import another file</Button>
            </div>
          </div>
          {done.skipped.length > 0 && (
            <div className="border-t border-slate-100">
              <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Skipped rows</p>
              <ul className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
                {done.skipped.map(s => (
                  <li key={s.row} className="px-4 py-2 flex gap-3"><span className="font-semibold text-amber-700 tabular-nums shrink-0">Row {s.row}</span><span className="text-slate-600">{s.details}</span></li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}
    </Page>
  );
};

export default ExcelUpload;
