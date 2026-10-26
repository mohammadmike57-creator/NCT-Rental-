import React, { useEffect, useState } from 'react';
import { Reservation } from '../types';
import { Button, inputCls } from './ui/Crm';

/**
 * Deleting a booking whose rental agreement is complete (checked out and checked in).
 * The person types the booking number to confirm, so it cannot happen by a stray click.
 */
const DeleteAgreementDialog: React.FC<{ reservation: Reservation; busy?: boolean; onCancel: () => void; onConfirm: (reason: string) => void }> = ({ reservation: r, busy, onCancel, onConfirm }) => {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const ref = (r.bookingId || r.invoice || '').trim();
  const ok = !!ref && typed.trim().toUpperCase() === ref.toUpperCase() && reason.trim().length >= 3;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const fmt = (s?: string) => { if (!s) return '—'; const d = new Date(s); return isNaN(d.getTime()) ? s : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="del-agr-title">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onCancel} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex gap-4">
          <div className="w-11 h-11 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
          </div>
          <div className="min-w-0">
            <h2 id="del-agr-title" className="text-base font-semibold text-slate-900">Delete completed agreement</h2>
            <p className="mt-1 text-[13px] text-slate-600">This rental is finished. Deleting it removes the booking and its signed agreement permanently.</p>
          </div>
        </div>

        <div className="mx-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          <span className="text-slate-500">Booking</span><span className="font-mono font-semibold text-slate-900">{ref || '—'}</span>
          <span className="text-slate-500">Customer</span><span className="font-medium text-slate-900">{r.personName || r.customer || '—'}</span>
          <span className="text-slate-500">Car</span><span className="text-slate-900">{r.carModel || '—'}{r.licensePlate ? ` · ${r.licensePlate}` : ''}</span>
          <span className="text-slate-500">Checked out</span><span className="text-slate-900 tabular-nums">{r.pickupDateTime || fmt(r.startDate)}</span>
          <span className="text-slate-500">Checked in</span><span className="text-slate-900 tabular-nums">{r.dropOffDateTime || fmt(r.endDate)}</span>
        </div>

        <ul className="mx-6 mt-3 text-xs text-slate-600 space-y-1 list-disc ps-4">
          <li>Removed: the booking, the check-out and check-in records, signatures and inspection photos.</li>
          <li>Kept: damages and traffic tickets already recorded in their registers, and the Activity Log entry.</li>
          <li>An administrator can still recover it from a data backup (Company Details → Danger zone).</li>
        </ul>

        <div className="px-6 pt-4 pb-5 space-y-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">Reason <span className="text-rose-600">*</span></span>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Duplicate agreement, test booking" className={inputCls} autoFocus />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">Type <span className="font-mono font-semibold text-slate-900">{ref}</span> to confirm</span>
            <input value={typed} onChange={e => setTyped(e.target.value)} className={`${inputCls} font-mono`} autoComplete="off" />
          </label>
        </div>

        <footer className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="danger" className="!bg-rose-600 !text-white !border-rose-600 hover:!bg-rose-700 disabled:opacity-40" onClick={() => onConfirm(reason.trim())} disabled={!ok || busy}>{busy ? 'Deleting…' : 'Delete agreement'}</Button>
        </footer>
      </div>
    </div>
  );
};

export default DeleteAgreementDialog;
