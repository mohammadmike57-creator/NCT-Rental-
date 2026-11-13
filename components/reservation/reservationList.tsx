import React from 'react';
import * as XLSX from 'xlsx';
import { Reservation, ReservationStatus } from '../../types';
import { ClockIcon } from '../icons';

/** Where a booking is in the rental: waiting for pickup, on rent, closed, pending or cancelled (no-shows count as cancelled). */
export type Stage = 'ready' | 'onrent' | 'closed' | 'pending' | 'cancelled';

export const stageOf = (res: Reservation): Stage => {
  if (res.status === ReservationStatus.CANCELLED || res.status === ('NO_SHOW' as ReservationStatus)) return 'cancelled';
  if (res.dropOffCompleted) return 'closed';
  if (res.voucherSubmitted) return 'onrent';
  if (res.status === ReservationStatus.PENDING) return 'pending';
  return 'ready';
};

export const STAGE_META: Record<Stage, { label: string; dot: string; chip: string }> = {
  ready: { label: 'Awaiting pickup', dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 ring-sky-200' },
  onrent: { label: 'On rent', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  closed: { label: 'Closed', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600 ring-slate-200' },
  pending: { label: 'Pending', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 ring-amber-200' },
  cancelled: { label: 'Cancelled', dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

/** Today's date as YYYY-MM-DD (UTC, as the reservations list has always compared it). */
export const todayIso = () => new Date().toISOString().slice(0, 10);

/** The one thing staff should notice about a booking today (pickup or return due or overdue), if any. */
export const alertOf = (res: Reservation, todayKey: string = todayIso()): { label: string; cls: string } | null => {
  const stage = stageOf(res);
  const pickupDay = (res.startDate || '').slice(0, 10);
  if (stage === 'ready' && pickupDay === todayKey) return { label: 'Pickup today', cls: 'bg-sky-600 text-white' };
  if (stage === 'ready' && pickupDay && pickupDay < todayKey) return { label: 'Pickup overdue', cls: 'bg-amber-500 text-white' };
  if (stage === 'onrent' && res.endDate && new Date(res.endDate).getTime() < Date.now()) return { label: 'Return overdue', cls: 'bg-rose-600 text-white' };
  if (stage === 'onrent' && (res.endDate || '').slice(0, 10) === todayKey) return { label: 'Returns today', cls: 'bg-emerald-600 text-white' };
  return null;
};

export const rentalDaysOf = (res: Reservation) => {
  if (!res.startDate || !res.endDate) return 0;
  return Math.max(1, Math.ceil((new Date(res.endDate).getTime() - new Date(res.startDate).getTime()) / 86400000));
};

export const timeOf = (iso?: string) => (iso && iso.includes('T') ? iso.split('T')[1].slice(0, 5) : '');
export const money = (n?: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const dayDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
};

const durationDays = (start: string, end: string) => {
  if (!start || !end) return '';
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return (diff / (1000 * 3600 * 24)).toFixed(1);
};

/** The rows of the reservations export (Excel and CSV share them). */
export const exportRows = (list: Reservation[], sourceName: (id: string) => string) => list.map(res => ({
  'Person Name': res.personName,
  'Booking ID': res.bookingId,
  'Source': sourceName(res.source || ''),
  'Car Model': res.carModel,
  'Booking Date': res.bookingDate || res.startDate?.split('T')[0],
  'Pickup Date': res.startDate,
  'Return Date': res.endDate,
  'Days': durationDays(res.startDate, res.endDate),
  'Status': res.status,
  'Location': res.locationName,
  'Contact': res.contactNumber,
  'Notes': res.notes,
}));

export const downloadExcel = (rows: Record<string, unknown>[], name: string) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Reservations');
  XLSX.writeFile(workbook, `${name}.xlsx`);
};

export const downloadCsv = (rows: Record<string, unknown>[], name: string) => {
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows));
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${name}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const PrinterGlyph = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>
);

/** A licence plate, styled like the real thing. */
export const Plate = ({ value }: { value?: string }) => value
  ? <span className="inline-block px-1.5 py-px rounded border border-slate-300 bg-slate-50 font-mono text-[10.5px] font-semibold text-slate-700 tracking-wide">{value}</span>
  : null;

/** The booking's stage, plus today's alert (pickup or return due or overdue). */
export const StatusBadge = ({ res, withAlert = true }: { res: Reservation; withAlert?: boolean }) => {
  const stage = stageOf(res);
  const alert = withAlert ? alertOf(res) : null;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap ${STAGE_META[stage].chip}`}
        title={stage === 'cancelled' && res.statusReason ? `${res.statusReason}${res.statusChangedBy ? ` · ${res.statusChangedBy}` : ''}` : undefined}>
        <span className={`w-1.5 h-1.5 rounded-full ${STAGE_META[stage].dot}`} />{stage === 'cancelled' && res.status === ReservationStatus.NO_SHOW ? 'No-show' : STAGE_META[stage].label}
      </span>
      {alert && (
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap ${/overdue/i.test(alert.label) ? 'text-rose-600' : 'text-sky-700'}`}>
          <ClockIcon className="w-3 h-3" />{alert.label}
        </span>
      )}
    </div>
  );
};

/** A sortable column heading for the reservations table. */
export const SortHeading = <K extends string>({ k, sortKey, sortDir, onSort, children, className = '' }: {
  k: K; sortKey: K; sortDir: 'asc' | 'desc'; onSort: (k: K) => void; children: React.ReactNode; className?: string;
}) => (
  <th className={`font-semibold px-3 py-2.5 whitespace-nowrap ${className}`} aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button onClick={() => onSort(k)} className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 ${sortKey === k ? 'text-slate-900' : ''}`}>
      {children}
      <svg className={`w-3 h-3 transition-transform ${sortKey === k ? 'opacity-100' : 'opacity-30'} ${sortKey === k && sortDir === 'desc' ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a.75.75 0 01.53.22l4 4a.75.75 0 11-1.06 1.06L10 6.81 6.53 10.28a.75.75 0 01-1.06-1.06l4-4A.75.75 0 0110 5z" clipRule="evenodd" /></svg>
    </button>
  </th>
);
