import React, { useEffect, useMemo, useState } from 'react';
import { MONTHS } from '../../constants';
import { Button, Field, inputCls, selectCls } from '../ui/Crm';

/** The booking details staff can correct by hand during an import or a month tidy-up. */
export interface BookingEdit {
  bookingId: string;
  customer: string;
  pickup: string;  // YYYY-MM-DDTHH:mm, or '' when unknown
  dropoff: string;
  car: string;
  source: string;
  amount: number;
  phone: string;
  email: string;
  notes: string;
}

interface Props {
  title: string;
  subtitle?: string;
  value: BookingEdit;
  fleetModels: string[];
  sourceNames: string[];
  /** Booking numbers already used by other rows, to warn about duplicates. */
  takenIds?: string[];
  onSave: (v: BookingEdit) => void;
  onClose: () => void;
}

const split = (dt: string) => ({ date: dt ? dt.slice(0, 10) : '', time: dt && dt.length >= 16 ? dt.slice(11, 16) : '12:00' });
const join = (date: string, time: string) => (date ? `${date}T${time || '12:00'}` : '');
const days = (a: string, b: string) => Math.max(1, Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000));
const longDate = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '');

/** Problems that stop a booking from being saved; empty when it is complete. */
export const editProblems = (v: BookingEdit): string[] => {
  const out: string[] = [];
  if (!v.customer.trim()) out.push('No customer name');
  if (!v.pickup) out.push('No pick-up date');
  if (!v.dropoff) out.push('No drop-off date');
  if (v.pickup && v.dropoff && v.dropoff < v.pickup) out.push('Drop-off is before pick-up');
  return out;
};

const BookingEditDrawer: React.FC<Props> = ({ title, subtitle, value, fleetModels, sourceNames, takenIds = [], onSave, onClose }) => {
  const [v, setV] = useState<BookingEdit>(value);
  const [tried, setTried] = useState(false);
  const p = split(v.pickup);
  const d = split(v.dropoff);
  const set = <K extends keyof BookingEdit>(k: K, val: BookingEdit[K]) => setV(prev => ({ ...prev, [k]: val }));
  const problems = useMemo(() => editProblems(v), [v]);
  const dupe = v.bookingId.trim() && takenIds.includes(v.bookingId.trim());
  const listedIn = v.pickup ? `${MONTHS[+v.pickup.slice(5, 7) - 1]} ${v.pickup.slice(0, 4)}` : '';
  const carOptions = Array.from(new Set([...(v.car ? [v.car] : []), ...fleetModels]));
  const sourceOptions = Array.from(new Set([...(v.source ? [v.source] : []), ...sourceNames]));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = () => {
    setTried(true);
    if (problems.length || dupe) return;
    onSave({ ...v, bookingId: v.bookingId.trim(), customer: v.customer.trim().replace(/\s+/g, ' ') });
  };
  const err = (show: boolean) => (tried && show ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : '');

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="booking-edit-title">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col">
        <header className="px-5 py-4 border-b border-slate-200 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="booking-edit-title" className="text-[15px] font-semibold text-slate-900 truncate">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Live summary of where the booking will be listed */}
          <div className={`rounded-xl border px-4 py-3 ${listedIn && !problems.length ? 'border-indigo-100 bg-indigo-50/60' : 'border-slate-200 bg-slate-50'}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Listed in</p>
            <p className="text-[15px] font-semibold text-slate-900">{listedIn || 'Set a pick-up date'}</p>
            {v.pickup && v.dropoff && v.dropoff >= v.pickup && (
              <p className="text-xs text-slate-600 mt-0.5">{longDate(p.date)} → {longDate(d.date)} · {days(v.pickup, v.dropoff)} day{days(v.pickup, v.dropoff) === 1 ? '' : 's'}</p>
            )}
          </div>

          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Booking</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Booking number" hint={dupe ? <span className="text-rose-600">Used by another booking in this file</span> : 'Leave empty to create one'}>
                <input value={v.bookingId} onChange={e => set('bookingId', e.target.value)} className={`${inputCls} font-mono ${dupe && tried ? err(true) : ''}`} />
              </Field>
              <Field label="Customer name" required>
                <input value={v.customer} onChange={e => set('customer', e.target.value)} className={`${inputCls} ${err(!v.customer.trim())}`} autoFocus />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Dates</p>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <Field label="Pick-up date" required><input type="date" value={p.date} onChange={e => set('pickup', join(e.target.value, p.time))} className={`${inputCls} ${err(!v.pickup)}`} /></Field>
              <Field label="Time"><input type="time" value={p.time} onChange={e => set('pickup', join(p.date, e.target.value))} disabled={!p.date} className={inputCls} /></Field>
              <Field label="Drop-off date" required><input type="date" value={d.date} min={p.date || undefined} onChange={e => set('dropoff', join(e.target.value, d.time))} className={`${inputCls} ${err(!v.dropoff || (!!v.pickup && v.dropoff < v.pickup))}`} /></Field>
              <Field label="Time"><input type="time" value={d.time} onChange={e => set('dropoff', join(d.date, e.target.value))} disabled={!d.date} className={inputCls} /></Field>
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Car, source and price</p>
            <Field label="Car">
              <input list="booking-edit-cars" value={v.car} onChange={e => set('car', e.target.value)} placeholder="Choose from the fleet or type a model" className={inputCls} />
              <datalist id="booking-edit-cars">{carOptions.map(c => <option key={c} value={c} />)}</datalist>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Source">
                <select value={v.source} onChange={e => set('source', e.target.value)} className={`${selectCls} w-full`}>
                  <option value="">— None —</option>
                  {sourceOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Amount">
                <input type="number" min={0} step="0.01" value={v.amount || ''} onChange={e => set('amount', e.target.value === '' ? 0 : Math.max(0, +e.target.value))} className={`${inputCls} text-right tabular-nums`} />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Contact and notes</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone"><input value={v.phone} onChange={e => set('phone', e.target.value)} className={inputCls} /></Field>
              <Field label="Email"><input type="email" value={v.email} onChange={e => set('email', e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label="Notes"><textarea value={v.notes} onChange={e => set('notes', e.target.value)} rows={3} className={`${inputCls} h-auto py-2`} /></Field>
          </section>
        </div>

        <footer className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/80 flex items-center gap-3">
          <p className="flex-1 text-xs text-rose-600 min-w-0">{tried && (problems[0] || (dupe ? 'Booking number already used in this file' : ''))}</p>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save changes</Button>
        </footer>
      </div>
    </div>
  );
};

export default BookingEditDrawer;
