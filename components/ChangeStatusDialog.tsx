import React, { useState } from 'react';
import { Reservation, ReservationStatus } from '../types';
import { Button, inputCls, labelCls } from './ui/Crm';

const OPTIONS: { value: ReservationStatus; label: string; detail: string; dot: string }[] = [
  { value: ReservationStatus.CONFIRMED, label: 'Confirmed', detail: 'Active booking, waiting for pick-up', dot: 'bg-sky-500' },
  { value: ReservationStatus.PENDING, label: 'Pending', detail: 'Not confirmed yet', dot: 'bg-amber-500' },
  { value: ReservationStatus.CANCELLED, label: 'Cancelled', detail: 'Cancelled by the customer, the broker or us', dot: 'bg-rose-500' },
  { value: ReservationStatus.NO_SHOW, label: 'No-show', detail: 'The customer did not come to collect the car', dot: 'bg-rose-700' },
];

const REASONS: Record<string, string[]> = {
  [ReservationStatus.CANCELLED]: ['Cancelled by the customer', 'Cancelled by the broker / website', 'Duplicate booking', 'Payment not received', 'No car available', 'Other'],
  [ReservationStatus.NO_SHOW]: ['Customer did not arrive', 'Customer could not be reached', 'Missing driving licence or documents', 'Flight cancelled or delayed', 'Other'],
  [ReservationStatus.CONFIRMED]: ['Customer re-booked', 'Cancelled by mistake', 'Confirmed by the broker', 'Other'],
  [ReservationStatus.PENDING]: ['Waiting for the broker', 'Waiting for payment', 'Other'],
};

export const statusLabel = (s?: ReservationStatus) => OPTIONS.find(o => o.value === s)?.label || 'Confirmed';

interface Props {
  reservation: Reservation;
  /** Preselected status, e.g. from "Mark as no-show". */
  initial?: ReservationStatus;
  currentUserName?: string;
  onClose: () => void;
  onSave: (updated: Reservation) => void;
}

/** Changes a booking's status by hand, with a reason, an optional fee and a history entry. */
const ChangeStatusDialog: React.FC<Props> = ({ reservation: r, initial, currentUserName, onClose, onSave }) => {
  const current = r.status || ReservationStatus.CONFIRMED;
  const [to, setTo] = useState<ReservationStatus>(initial && initial !== current ? initial : current === ReservationStatus.CONFIRMED ? ReservationStatus.CANCELLED : ReservationStatus.CONFIRMED);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [fee, setFee] = useState<string>('');
  const lost = to === ReservationStatus.CANCELLED || to === ReservationStatus.NO_SHOW;
  const reasons = REASONS[to] || ['Other'];
  const chosenReason = reason && reasons.includes(reason) ? reason : '';
  const finalReason = [chosenReason === 'Other' ? '' : chosenReason, note.trim()].filter(Boolean).join(' — ');
  const feeValue = fee.trim() === '' ? undefined : Math.max(0, Number(fee));
  const valid = to !== current && (!lost || !!chosenReason) && (chosenReason !== 'Other' || !!note.trim()) && (feeValue === undefined || Number.isFinite(feeValue));

  const save = () => {
    if (!valid) return;
    const at = new Date().toISOString();
    onSave({
      ...r,
      status: to,
      awaitingConfirmation: false,
      statusReason: finalReason || undefined,
      statusChangedBy: currentUserName,
      statusChangedAt: at,
      statusFee: lost ? feeValue : undefined,
      statusHistory: [...(r.statusHistory || []), { from: current, to, at, by: currentUserName, reason: finalReason || undefined, fee: lost ? feeValue : undefined }],
      updatedAt: at,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-white sm:rounded-xl shadow-2xl overflow-hidden max-h-[100dvh] flex flex-col" role="dialog" aria-modal="true" aria-labelledby="status-title" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 id="status-title" className="text-[15px] font-semibold text-slate-900">Change reservation status</h2>
          <p className="text-xs text-slate-500 mt-0.5">#{r.bookingId} · {r.personName} · now <span className="font-semibold text-slate-700">{statusLabel(current)}</span></p>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {OPTIONS.map(o => {
              const isCurrent = o.value === current;
              const on = o.value === to;
              return (
                <button key={o.value} type="button" disabled={isCurrent} onClick={() => { setTo(o.value); setReason(''); }}
                  className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${on ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300' : 'border-slate-200 hover:bg-slate-50'} disabled:opacity-50 disabled:cursor-not-allowed`}>
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-900"><span className={`w-2 h-2 rounded-full ${o.dot}`} />{o.label}{isCurrent && <span className="text-[10px] font-medium text-slate-400">current</span>}</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">{o.detail}</span>
                </button>
              );
            })}
          </div>
          <label className="block">
            <span className={labelCls}>Reason{lost && <span className="text-rose-500"> *</span>}</span>
            <select value={chosenReason} onChange={e => setReason(e.target.value)} className={inputCls}>
              <option value="">{lost ? 'Choose a reason' : 'No reason (optional)'}</option>
              {reasons.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Note{chosenReason === 'Other' && <span className="text-rose-500"> *</span>}</span>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputCls} h-auto py-2`} placeholder="Details for the team (who asked, reference, call made…)" />
          </label>
          {lost && (
            <label className="block">
              <span className={labelCls}>{to === ReservationStatus.NO_SHOW ? 'No-show fee' : 'Cancellation fee'} <span className="font-normal text-slate-400">optional</span></span>
              <div className="relative">
                <input type="number" min={0} step="0.01" value={fee} onChange={e => setFee(e.target.value)} className={`${inputCls} pr-12 tabular-nums`} placeholder="0.00" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">USD</span>
              </div>
              <span className="block text-xs text-slate-500 mt-1">Recorded on the booking. The car is released for other bookings straight away.</span>
            </label>
          )}
          {(r.statusHistory || []).length > 0 && (
            <div>
              <span className={labelCls}>History</span>
              <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100 text-xs">
                {[...(r.statusHistory || [])].reverse().slice(0, 5).map((h, i) => (
                  <li key={i} className="px-3 py-2 text-slate-600">
                    <span className="font-semibold text-slate-800">{statusLabel(h.from)} → {statusLabel(h.to)}</span>
                    {' · '}{new Date(h.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{h.by ? ` · ${h.by}` : ''}
                    {h.reason && <span className="block text-slate-500">{h.reason}{h.fee ? ` · fee ${h.fee.toFixed(2)} USD` : ''}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={lost ? 'danger' : 'primary'} onClick={save} disabled={!valid}>
            {to === ReservationStatus.CANCELLED ? 'Cancel reservation' : to === ReservationStatus.NO_SHOW ? 'Mark as no-show' : `Set to ${statusLabel(to).toLowerCase()}`}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChangeStatusDialog;
