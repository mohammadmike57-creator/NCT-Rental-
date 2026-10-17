import React, { useState } from 'react';
import { AvailableExtra, Reservation, ReservationExtra } from '../types';

interface Props {
  reservation: Reservation;
  availableExtras: AvailableExtra[];
  onCancel: () => void;
  onSave: (extras: ReservationExtra[], newAmount: number) => void;
}

const DAY = 86400000;
const GRACE = 2 * 3600000;
/** Same day count the agreement and receipt use (2-hour grace on the last day). */
export const rentalDaysFor = (start: string, end: string) => {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(diff) || diff <= DAY) return 1;
  const full = Math.floor(diff / DAY);
  return diff % DAY >= GRACE ? full + 1 : full;
};
const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const chargeable = (list: ReservationExtra[], days: number) => list.reduce((s, e) => (e.isComplementary ? s : s + (e.dailyPrice || 0) * days), 0);

const ExtrasManagerModal: React.FC<Props> = ({ reservation, availableExtras, onCancel, onSave }) => {
  const days = rentalDaysFor(reservation.startDate, reservation.endDate);
  const original = reservation.extras || [];
  const [extras, setExtras] = useState<ReservationExtra[]>(original.map(e => ({ ...e })));
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState(0);

  const has = (name: string) => extras.some(e => e.name.toLowerCase() === name.toLowerCase());
  const add = (name: string, dailyPrice: number) => {
    if (!name.trim() || has(name)) return;
    setExtras(prev => [...prev, { name: name.trim(), dailyPrice: Math.max(0, dailyPrice), isComplementary: false }]);
  };
  const update = (i: number, patch: Partial<ReservationExtra>) => setExtras(prev => prev.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const remove = (i: number) => setExtras(prev => prev.filter((_, j) => j !== i));

  const oldTotal = chargeable(original, days);
  const newExtrasTotal = chargeable(extras, days);
  const delta = Math.round((newExtrasTotal - oldTotal) * 100) / 100;
  const newAmount = Math.max(0, (reservation.amount || 0) + delta);
  const changed = JSON.stringify(original) !== JSON.stringify(extras);
  const catalogue = availableExtras.filter(a => !has(a.name));

  const inputCls = 'px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCancel}>
      <div className="bg-slate-50 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-3xl max-h-[94dvh] sm:max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 px-6 py-5 bg-white border-b border-slate-200">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Extras</h2>
              <p className="text-sm text-slate-500">#{reservation.bookingId} · {reservation.personName} · priced for {days} day{days === 1 ? '' : 's'}</p>
            </div>
          </div>
          <button onClick={onCancel} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <section className="bg-white rounded-2xl border border-slate-200">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">On this booking</h3>
              <span className="text-xs text-slate-400">{extras.length} item{extras.length === 1 ? '' : 's'}</span>
            </div>
            {extras.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">No extras yet — add one from the catalogue below.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {extras.map((ex, i) => (
                  <li key={ex.name} className="px-5 py-3 flex flex-wrap items-center gap-3">
                    <span className="flex-1 min-w-[140px] text-sm font-semibold text-slate-900">{ex.name}</span>
                    <div className="relative w-28">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                      <input type="number" min={0} step="0.01" disabled={ex.isComplementary} value={ex.dailyPrice || ''} placeholder="0.00"
                        onChange={e => update(i, { dailyPrice: parseFloat(e.target.value) || 0 })}
                        className={`${inputCls} w-full pl-6 tabular-nums disabled:bg-slate-50 disabled:text-slate-400`} aria-label={`${ex.name} price per day`} />
                    </div>
                    <span className="text-xs text-slate-400">/ day</span>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={ex.isComplementary} onChange={e => update(i, { isComplementary: e.target.checked })} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                      Complimentary
                    </label>
                    <span className={`w-24 text-right text-sm font-semibold tabular-nums ${ex.isComplementary ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {ex.isComplementary ? 'Free' : money(ex.dailyPrice * days)}
                    </span>
                    <button onClick={() => remove(i)} title="Remove" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Add</h3>
            {catalogue.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {catalogue.map(a => (
                  <button key={a.id} onClick={() => add(a.name, a.defaultDailyPrice)}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl ring-1 ring-slate-200 hover:ring-violet-300 hover:bg-violet-50/40 text-left">
                    <span className="text-sm font-medium text-slate-800">{a.name}</span>
                    <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">{money(a.defaultDailyPrice)} / day <span className="ml-1 text-violet-600 font-semibold">+ Add</span></span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Other extra (e.g. Cross-border permit)" className={`${inputCls} flex-1 min-w-[180px]`} />
              <div className="relative w-28">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                <input type="number" min={0} step="0.01" value={customPrice || ''} onChange={e => setCustomPrice(parseFloat(e.target.value) || 0)} placeholder="/ day" className={`${inputCls} w-full pl-6`} />
              </div>
              <button onClick={() => { add(customName, customPrice); setCustomName(''); setCustomPrice(0); }} disabled={!customName.trim() || has(customName)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40">Add</button>
            </div>
          </section>
        </div>

        <footer className="px-6 py-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
            <span className="text-slate-500">Extras <b className="text-slate-900 tabular-nums">{money(newExtrasTotal)}</b></span>
            <span className="text-slate-500">Change <b className={`tabular-nums ${delta > 0 ? 'text-amber-700' : delta < 0 ? 'text-emerald-700' : 'text-slate-900'}`}>{delta >= 0 ? '+' : '−'}{money(Math.abs(delta))}</b></span>
            <span className="text-slate-500">New total <b className="text-lg text-slate-900 tabular-nums">{money(newAmount)}</b></span>
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
            <button onClick={() => onSave(extras, newAmount)} disabled={!changed} className="px-5 py-2.5 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-40">Save extras</button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ExtrasManagerModal;
