import React, { useMemo, useState } from 'react';
import { AppData, Fleet, ImportReport, PaymentType, RentalSource, Reservation } from '../types';
import { MONTHS, INITIAL_YEARS } from '../constants';
import { reservationService, ReservationService, pickupMonthOf } from '../services/reservationService';
import {
  FIELDS, FieldKey, ColumnMap, DateOrder, SheetTable, PreparedRow,
  readTables, detectColumns, detectDateOrder, prepareRows, matchSource, matchCar, toReservations,
} from '../services/smartImport';
import BookingEditDrawer, { BookingEdit, editProblems } from './import/BookingEditDrawer';
import { UploadIcon, DocumentTextIcon, AlertIcon, CheckCircleIcon } from './icons';
import { Page, PageHeader, StatGrid, Panel, Badge, Button, Segmented, Tabs, Field, EmptyState, selectCls as crmSelectCls, table } from './ui/Crm';

interface ExcelUploadProps {
  /** years: every year the imported bookings touch, so the app can list them. */
  onReservationsImported: (data: any, report: ImportReport, years?: number[]) => void;
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
  /** Bookings were moved to their pick-up month (tidy-up). */
  onReservationsMoved?: (data: AppData, moved: number) => void;
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

type RowStatus = 'new' | 'update' | 'problem' | 'ignored' | 'excluded';
type Row = PreparedRow & { edited?: boolean };

/** A booking already in the system, as the edit panel shows it. */
const editOf = (r: Reservation): BookingEdit => ({
  bookingId: r.bookingId || r.invoice || '', customer: r.personName || r.customer || '',
  pickup: String(r.startDate || r.pickupDate || '').slice(0, 16), dropoff: String(r.endDate || r.dropoffDate || '').slice(0, 16),
  car: r.carModel || r.reservationVehicle || r.vehicle || '', source: r.source || '', amount: r.amount || 0,
  phone: r.contactNumber || '', email: r.customerEmail || '', notes: r.notes || '',
});
/** The reservation fields an edit changes (both the old and the new names are kept in step). */
const reservationPatch = (e: BookingEdit): Partial<Reservation> => ({
  bookingId: e.bookingId, invoice: e.bookingId, personName: e.customer, customer: e.customer,
  startDate: e.pickup, pickupDate: e.pickup, endDate: e.dropoff, dropoffDate: e.dropoff,
  carModel: e.car, reservationVehicle: e.car, vehicle: e.car, source: e.source,
  amount: e.amount, baseAmount: e.amount, contactNumber: e.phone, customerEmail: e.email, notes: e.notes,
});

const ExcelUpload: React.FC<ExcelUploadProps> = ({ onReservationsImported, years = INITIAL_YEARS, focusYear, focusMonth, allData, sources = [], fleet = [], onAddSources, onOpenReservations, onReservationsMoved }) => {
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
  // Only used for a booking without a readable pick-up date (such rows are skipped anyway).
  const month = focusMonth || MONTHS[new Date().getMonth()];
  const year = focusYear || new Date().getFullYear();
  const [tidyOpen, setTidyOpen] = useState(false);
  const [tidyDone, setTidyDone] = useState<number | null>(null);
  const [tidyEdited, setTidyEdited] = useState(0);
  const [view, setView] = useState<'all' | 'new' | 'update' | 'problem' | 'excluded'>('all');
  // Hand edits on the review list (by spreadsheet row) and rows left out of the import.
  const [rowEdits, setRowEdits] = useState<Record<number, BookingEdit>>({});
  const [excluded, setExcluded] = useState<Record<number, boolean>>({});
  const [editing, setEditing] = useState<{ kind: 'row'; row: number } | { kind: 'tidy'; id: string } | null>(null);
  // Hand edits and the selection on the wrong-month list (by reservation id).
  const [tidyEdits, setTidyEdits] = useState<Record<string, BookingEdit>>({});
  const [tidySkip, setTidySkip] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<{ report: ImportReport; added: string[]; skipped: { row: number; details: string }[] } | null>(null);

  const t = tables[sheetIdx];
  const baseRows: PreparedRow[] = useMemo(() => (t ? prepareRows(t, columns, order) : []), [t, columns, order]);
  // Rows as staff corrected them: an edited row carries its exact car and source.
  const rows: Row[] = useMemo(() => baseRows.map(r => {
    const e = rowEdits[r.row];
    if (!e) return r;
    return { ...r, bookingId: e.bookingId, customer: e.customer, pickup: e.pickup, dropoff: e.dropoff, amount: e.amount, phone: e.phone, email: e.email, notes: e.notes, car: e.car, source: e.source, problems: editProblems(e), fixes: [], edited: true };
  }), [baseRows, rowEdits]);

  // Booking number → the month it is listed under now.
  const existingIds = useMemo(() => {
    const ids = new Map<string, string>();
    const data = allData || reservationService.getData() || {};
    Object.keys(data).forEach(y => Object.keys(data[+y] || {}).forEach(m => (data[+y][m] || []).forEach((r: Reservation) => { const k = r.invoice || r.bookingId; if (k) ids.set(k, `${m} ${y}`); })));
    return ids;
  }, [allData, done]);
  const pickupMonthLabel = (pickup: string) => `${MONTHS[+pickup.slice(5, 7) - 1]} ${pickup.slice(0, 4)}`;

  const statusOf = (r: PreparedRow): RowStatus => {
    if (!r.bookingId && !r.customer && !r.pickup && !r.dropoff) return 'ignored'; // blank or totals row
    if (excluded[r.row]) return 'excluded';
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
  const willMove = rows.filter(r => statusOf(r) === 'update' && r.pickup && existingIds.get(r.bookingId) !== pickupMonthLabel(r.pickup)).length;
  const counts = useMemo(() => {
    const c = { new: 0, update: 0, problem: 0, ignored: 0, excluded: 0 };
    rows.forEach(r => { c[statusOf(r)]++; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, existingIds, excluded]);
  const carOf = (r: Row) => r.car ?? (r.carRaw ? carName(r.carRaw) : '');
  const sourceOf = (r: Row) => r.source ?? sourceName(r.sourceRaw);
  const rowEdit = (r: Row): BookingEdit => rowEdits[r.row] || { bookingId: r.bookingId, customer: r.customer, pickup: r.pickup, dropoff: r.dropoff, car: carOf(r), source: sourceOf(r), amount: r.amount, phone: r.phone, email: r.email, notes: r.notes };
  const editedCount = rows.filter(r => r.edited && statusOf(r) !== 'ignored').length;
  // Bookings anywhere in the system listed under a month other than their pick-up month.
  const misfiled = useMemo(() => ReservationService.misfiled(allData || reservationService.getData() || {}), [allData, done, tidyDone]);
  const newSourceNames = Array.from(new Set(distinctSources.filter(s => sourceValue(s.raw) === NEW).map(s => s.m.suggested).filter(Boolean)))
    .filter(n => !sources.some(s => s.name.toLowerCase() === n.toLowerCase()));

  const reset = () => {
    setFile(null); setTables([]); setColumns({}); setSourceChoice({}); setCarChoice({}); setError(null); setDone(null); setView('all');
    setRowEdits({}); setExcluded({});
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
    setRowEdits({});
    setExcluded({});
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
      const reservations = toReservations(ready, { year, month, byPickupMonth: true, fileName: file.name, sourceFor: sourceName, carFor: carName });
      const skipped = rows.filter(r => statusOf(r) === 'problem' || statusOf(r) === 'excluded')
        .map(r => ({ row: r.row, details: statusOf(r) === 'excluded' ? 'Left out by you' : r.problems.join(' · ') }));
      const report: ImportReport = { imported: reservations.length, skipped: counts.ignored, duplicates: 0, invalidRows: skipped.length, warnings: [], errors: skipped };
      const result = await reservationService.importReservations(reservations, report, { year, month }, allData);
      onReservationsImported(result.data, result.report, fileYears);
      setDone({ report: result.report, added: added.map(a => a.name), skipped });
    } catch (e: any) {
      setError(`The import could not be saved: ${e?.message || e}. Nothing was changed.`);
    } finally {
      setBusy(false);
    }
  };

  const runTidy = async () => {
    setBusy(true);
    setError(null);
    try {
      const ids = misfiled.map(x => x.reservation.id).filter(id => !tidySkip[id]);
      const edits = Object.fromEntries(Object.entries(tidyEdits).filter(([id]) => ids.includes(id)).map(([id, e]) => [id, reservationPatch(e)]));
      const { data, moved, edited } = await reservationService.moveToPickupMonths(allData, { ids, edits });
      onReservationsMoved?.(data, moved);
      setTidyDone(moved);
      setTidyEdited(edited);
      setTidyEdits({});
      setTidySkip({});
      setTidyOpen(false);
    } catch (e: any) {
      setError(`The bookings could not be moved: ${e?.message || e}. Nothing was changed.`);
    } finally {
      setBusy(false);
    }
  };

  const step: 1 | 2 | 3 = done ? 3 : t ? 2 : 1;
  const visibleRows = rows.filter(r => { const s = statusOf(r); return s !== 'ignored' && (view === 'all' || s === view); });
  const sample = (c?: number) => (c === undefined || !t ? '' : String(t.rows.find(r => r[c] !== '' && r[c] !== undefined)?.[c] ?? ''));
  const firstDate = rows.find(r => r.pickup);
  // Years the bookings in this file touch (pick-up or drop-off), e.g. a December rental returning in 2027.
  const fileYears = Array.from(new Set(rows.filter(r => statusOf(r) !== 'ignored').flatMap(r => [r.pickup, r.dropoff]).filter(Boolean).map(d => +d.slice(0, 4)))).sort();
  const crossYear = rows.filter(r => r.pickup && r.dropoff && r.pickup.slice(0, 4) !== r.dropoff.slice(0, 4) && statusOf(r) !== 'ignored').length;
  const fixedRows = rows.filter(r => r.fixes.length && statusOf(r) !== 'ignored').length;
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

      {tidyDone !== null && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex gap-3 text-[13px] text-emerald-800">
          <CheckCircleIcon className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            {tidyDone} booking{tidyDone === 1 ? ' was' : 's were'} moved to {tidyDone === 1 ? 'its' : 'their'} pick-up month
            {tidyEdited ? `, ${tidyEdited} with your corrections saved` : ''}.
            {!misfiled.length && ' Every booking is now listed in the month it is picked up.'}
          </p>
        </div>
      )}
      {misfiled.length > 0 && step !== 2 && (() => {
        const items = misfiled.map(x => {
          const e = tidyEdits[x.reservation.id];
          const to = e?.pickup ? { y: +e.pickup.slice(0, 4), m: MONTHS[+e.pickup.slice(5, 7) - 1] } : x.to;
          const problems = e ? editProblems(e) : [];
          return { ...x, e, to, problems, stays: to.y === x.from.y && to.m === x.from.m };
        });
        const chosen = items.filter(i => !tidySkip[i.reservation.id]);
        const blocked = chosen.filter(i => i.problems.length).length;
        const allOn = chosen.length === items.length;
        return (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70">
            <div className="px-4 py-3 flex flex-wrap items-start gap-3">
              <AlertIcon className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
              <div className="flex-1 min-w-[220px] text-[13px] text-amber-900">
                <p className="font-semibold">{misfiled.length} booking{misfiled.length === 1 ? ' is' : 's are'} listed under the wrong month</p>
                <p className="text-xs text-amber-800 mt-0.5">They are filed under a month other than their pick-up month (for example from an earlier import). Check or correct them, then move them so each month's list and totals are right.</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setTidyOpen(o => !o)}>{tidyOpen ? 'Hide list' : 'Review & edit'}</Button>
                <Button size="sm" variant="primary" onClick={runTidy} disabled={busy || !chosen.length || blocked > 0}>
                  {busy ? 'Saving…' : `${chosen.some(i => i.e) ? 'Save & move' : 'Move'} ${chosen.length === items.length ? 'all' : chosen.length} to pick-up month`}
                </Button>
              </div>
            </div>
            {tidyOpen && (
              <div className="border-t border-amber-200 bg-white rounded-b-xl">
                <div className="max-h-96 overflow-auto">
                  <table className={`${table.wrap} min-w-[820px]`}>
                    <thead className={`${table.head} sticky top-0 z-10`}>
                      <tr>
                        <th className={`${table.th} w-10`}><input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => setTidySkip(allOn ? Object.fromEntries(items.map(i => [i.reservation.id, true])) : {})} /></th>
                        {['Booking', 'Customer', 'Pick-up', 'Drop-off', 'Listed in now', 'Moves to', ''].map(h => <th key={h} className={table.th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody className={table.body}>
                      {items.slice(0, 300).map(({ reservation: r, from, to, e, problems, stays }) => {
                        const on = !tidySkip[r.id];
                        const v = e || editOf(r);
                        return (
                          <tr key={r.id} className={on ? table.row : 'opacity-50'}>
                            <td className={table.td}><input type="checkbox" aria-label={`Include ${v.bookingId}`} checked={on} onChange={() => setTidySkip(p => ({ ...p, [r.id]: on }))} /></td>
                            <td className={`${table.td} font-mono text-xs whitespace-nowrap`}>{v.bookingId}</td>
                            <td className={table.td}>
                              <span className="font-medium text-slate-900">{v.customer || '—'}</span>
                              {e && <Badge tone="info" dot={false} className="ml-2 !text-[10px]">Edited</Badge>}
                            </td>
                            <td className={`${table.td} whitespace-nowrap tabular-nums`}>{showDate(v.pickup) || '—'}</td>
                            <td className={`${table.td} whitespace-nowrap tabular-nums`}>{showDate(v.dropoff) || '—'}</td>
                            <td className={`${table.td} whitespace-nowrap text-slate-500`}>{from.m} {from.y}</td>
                            <td className={`${table.td} whitespace-nowrap`}>
                              {problems.length ? <span className="text-xs text-rose-600">{problems[0]}</span>
                                : stays ? <span className="text-xs text-slate-500">Stays · corrections saved</span>
                                : <span className="font-semibold text-slate-900">{to.m} {to.y}</span>}
                            </td>
                            <td className={`${table.td} text-right`}><Button size="sm" variant="ghost" onClick={() => setEditing({ kind: 'tidy', id: r.id })}>Edit</Button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-500">
                  {chosen.length} of {items.length} selected{Object.keys(tidyEdits).length ? ` · ${Object.keys(tidyEdits).length} edited` : ''} · nothing changes until you press Move.
                  {blocked > 0 && <span className="text-rose-600"> {blocked} selected booking{blocked === 1 ? ' needs' : 's need'} a correction first.</span>}
                </p>
              </div>
            )}
          </div>
        );
      })()}

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
                  {fileYears.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                      <span>Years in this file:</span>
                      {fileYears.map(y => <Badge key={y} tone={years.includes(y) ? 'muted' : 'info'} dot={false}>{y}{years.includes(y) ? '' : ' · will be added'}</Badge>)}
                    </div>
                  )}
                  {(crossYear > 0 || fixedRows > 0) && (
                    <ul className="text-xs text-slate-600 space-y-1">
                      {crossYear > 0 && <li>• {crossYear} rental{crossYear === 1 ? ' runs' : 's run'} into the next year; each is stored by its pick-up date.</li>}
                      {fixedRows > 0 && <li>• {fixedRows} row{fixedRows === 1 ? ' was' : 's were'} corrected automatically (marked in the list below).</li>}
                    </ul>
                  )}
                </div>
              </Panel>

              <Panel title="Listed in the pick-up month">
                <div className="p-4 space-y-2 text-[13px] text-slate-700">
                  <p>Every booking is listed and counted in the month it is <strong>picked up</strong>, never the drop-off month.</p>
                  <p className="text-xs text-slate-500">Example: picked up 29 Dec 2026, returned 03 Jan 2027 → listed in <strong className="text-slate-700">December 2026</strong> only.</p>
                  {willMove > 0 && <p className="text-xs text-sky-700">{willMove} booking{willMove === 1 ? ' already in the system is' : 's already in the system are'} listed under another month and will move to {willMove === 1 ? 'its' : 'their'} pick-up month.</p>}
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
            subtitle={`Exactly what will be saved. Click Edit to correct any booking by hand${editedCount ? ` · ${editedCount} edited` : ''}.`}
            footer={<span className="tabular-nums">{visibleRows.length} shown</span>}
          >
            <Tabs value={view} onChange={k => setView(k as typeof view)} tabs={[
              { key: 'all', label: 'All', count: counts.new + counts.update + counts.problem + counts.excluded },
              { key: 'new', label: 'New', count: counts.new },
              { key: 'update', label: 'Updates', count: counts.update },
              { key: 'problem', label: 'Need attention', count: counts.problem },
              ...(counts.excluded ? [{ key: 'excluded', label: 'Left out', count: counts.excluded }] : []),
            ]} />
            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className={`${table.wrap} min-w-[1080px]`}>
                <thead className={`${table.head} sticky top-0 z-10`}>
                  <tr>{['Row', 'Booking', 'Customer', 'Pick-up', 'Drop-off', 'Days', 'Car', 'Source', 'Amount', 'Status', ''].map(h => <th key={h} className={table.th}>{h}</th>)}</tr>
                </thead>
                <tbody className={table.body}>
                  {visibleRows.slice(0, 500).map(r => {
                    const s = statusOf(r);
                    return (
                      <tr key={r.row} className={s === 'problem' ? 'bg-amber-50/50' : s === 'excluded' ? 'bg-slate-50 text-slate-400' : table.row}>
                        <td className={`${table.td} text-xs text-slate-400 tabular-nums`}>{r.row}</td>
                        <td className={`${table.td} font-mono text-xs whitespace-nowrap ${s === 'excluded' ? '' : 'text-slate-700'}`}>{r.bookingId || <span className="text-slate-400 font-sans">auto</span>}</td>
                        <td className={`${table.td} ${s === 'excluded' ? 'line-through' : 'font-medium text-slate-900'}`}>
                          {r.customer || '—'}
                          {r.edited && <Badge tone="info" dot={false} className="ml-2 !text-[10px] no-underline">Edited</Badge>}
                        </td>
                        <td className={`${table.td} whitespace-nowrap tabular-nums`}>{showDate(r.pickup) || <span className="text-rose-600">—</span>}</td>
                        <td className={`${table.td} whitespace-nowrap tabular-nums`}>{showDate(r.dropoff) || <span className="text-rose-600">—</span>}</td>
                        <td className={`${table.td} tabular-nums text-slate-500`}>{daysBetween(r.pickup, r.dropoff) || ''}</td>
                        <td className={`${table.td} whitespace-nowrap`}>{carOf(r) || '—'}</td>
                        <td className={`${table.td} whitespace-nowrap`}>{sourceOf(r) || '—'}</td>
                        <td className={`${table.td} tabular-nums text-right`}>{r.amount ? r.amount.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : '—'}</td>
                        <td className={table.td}>
                          {s === 'new' && <Badge tone="success">New</Badge>}
                          {s === 'update' && <Badge tone="info">Update</Badge>}
                          {s === 'excluded' && <Badge tone="muted">Left out</Badge>}
                          {s === 'problem' && <span className="text-xs text-amber-800">{r.problems.join(' · ')}</span>}
                          {(s === 'new' || s === 'update') && r.fixes.map(f => <p key={f} className="mt-1 text-[11px] leading-snug text-sky-700">{f}</p>)}
                        </td>
                        <td className={`${table.td} text-right whitespace-nowrap`}>
                          {s !== 'excluded' && <Button size="sm" variant={s === 'problem' ? 'secondary' : 'ghost'} onClick={() => setEditing({ kind: 'row', row: r.row })}>{s === 'problem' ? 'Fix' : 'Edit'}</Button>}
                          <Button size="sm" variant="ghost" className="!text-slate-500" onClick={() => setExcluded(p => ({ ...p, [r.row]: !p[r.row] }))}>{s === 'excluded' ? 'Include' : 'Leave out'}</Button>
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
              {counts.problem + counts.excluded ? <>, <strong className="text-amber-700">{counts.problem + counts.excluded}</strong> skipped</> : null}
              {editedCount ? <> · <strong className="text-slate-900">{editedCount}</strong> edited by hand</> : null}
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
      {editing?.kind === 'row' && (() => {
        const r = rows.find(x => x.row === editing.row);
        if (!r) return null;
        return (
          <BookingEditDrawer
            title={`Edit row ${r.row}${r.bookingId ? ` · ${r.bookingId}` : ''}`}
            subtitle="Your corrections are used for this import only; the Excel file is not changed."
            value={rowEdit(r)}
            fleetModels={fleetModels}
            sourceNames={Array.from(new Set([...sources.map(x => x.name), ...newSourceNames]))}
            takenIds={rows.filter(x => x.row !== r.row && statusOf(x) !== 'ignored' && statusOf(x) !== 'excluded').map(x => x.bookingId).filter(Boolean)}
            onSave={v => { setRowEdits(p => ({ ...p, [r.row]: v })); setEditing(null); }}
            onClose={() => setEditing(null)}
          />
        );
      })()}
      {editing?.kind === 'tidy' && (() => {
        const item = misfiled.find(x => x.reservation.id === editing.id);
        if (!item) return null;
        return (
          <BookingEditDrawer
            title={`Edit booking ${item.reservation.bookingId || item.reservation.invoice || ''}`}
            subtitle={`Listed in ${item.from.m} ${item.from.y} now. Corrections are saved when you press Move.`}
            value={tidyEdits[item.reservation.id] || editOf(item.reservation)}
            fleetModels={fleetModels}
            sourceNames={sources.map(x => x.name)}
            onSave={v => { setTidyEdits(p => ({ ...p, [item.reservation.id]: v })); setTidySkip(p => ({ ...p, [item.reservation.id]: false })); setEditing(null); }}
            onClose={() => setEditing(null)}
          />
        );
      })()}
    </Page>
  );
};

export default ExcelUpload;
