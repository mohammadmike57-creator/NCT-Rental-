import React, { useState } from 'react';
import { AvailableExtra, Reservation, ReservationExtra } from '../types';
import { Panel, SectionLabel, Badge, Button, EmptyState, inputCls } from './ui/Crm';

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

  const fieldCls = inputCls.replace('w-full ', '');

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onCancel} />
      <div className="relative bg-slate-50 w-full sm:max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-3 px-5 py-4 bg-white border-b border-slate-200">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">Extras</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">#{reservation.bookingId} · {reservation.personName} · priced for {days} day{days === 1 ? '' : 's'}</p>
          </div>
          <button onClick={onCancel} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <Panel title="On this booking" actions={<span className="text-xs text-slate-500 tabular-nums">{extras.length} item{extras.length === 1 ? '' : 's'}</span>}>
            {extras.length === 0 ? (
              <EmptyState title="No extras yet" hint="Add one from the catalogue below." className="py-10" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {extras.map((ex, i) => (
                  <li key={ex.name} className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="flex-1 min-w-[140px] text-[13px] font-semibold text-slate-900">{ex.name}</span>
                    <div className="relative w-28">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                      <input type="number" min={0} step="0.01" disabled={ex.isComplementary} value={ex.dailyPrice || ''} placeholder="0.00"
                        onChange={e => update(i, { dailyPrice: parseFloat(e.target.value) || 0 })}
                        className={`${fieldCls} w-full pl-6 tabular-nums`} aria-label={`${ex.name} price per day`} />
                    </div>
                    <span className="text-xs text-slate-400">/ day</span>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={ex.isComplementary} onChange={e => update(i, { isComplementary: e.target.checked })} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      Complimentary
                    </label>
                    <span className="w-24 text-right">
                      {ex.isComplementary ? <Badge tone="success">Free</Badge> : <span className="text-[13px] font-semibold tabular-nums text-slate-900">{money(ex.dailyPrice * days)}</span>}
                    </span>
                    <button onClick={() => remove(i)} title="Remove" aria-label={`Remove ${ex.name}`} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Add" padded bodyClassName="space-y-3">
            {catalogue.length > 0 && (
              <>
                <SectionLabel>Catalogue</SectionLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {catalogue.map(a => (
                    <button key={a.id} onClick={() => add(a.name, a.defaultDailyPrice)}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 text-left">
                      <span className="text-[13px] font-medium text-slate-800 truncate">{a.name}</span>
                      <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">{money(a.defaultDailyPrice)} / day <span className="ml-1 text-indigo-600 font-semibold">+ Add</span></span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <SectionLabel>Custom extra</SectionLabel>
            <div className="flex flex-wrap gap-2">
              <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Other extra (e.g. Cross-border permit)" className={`${fieldCls} flex-1 min-w-[180px]`} />
              <div className="relative w-28">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                <input type="number" min={0} step="0.01" value={customPrice || ''} onChange={e => setCustomPrice(parseFloat(e.target.value) || 0)} placeholder="/ day" className={`${fieldCls} w-full pl-6`} />
              </div>
              <Button variant="secondary" onClick={() => { add(customName, customPrice); setCustomName(''); setCustomPrice(0); }} disabled={!customName.trim() || has(customName)}>Add</Button>
            </div>
          </Panel>
        </div>

        <footer className="px-5 py-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px]">
            <span className="text-slate-500">Extras <b className="text-slate-900 tabular-nums">{money(newExtrasTotal)}</b></span>
            <span className="text-slate-500">Change <b className={`tabular-nums ${delta > 0 ? 'text-amber-700' : delta < 0 ? 'text-emerald-700' : 'text-slate-900'}`}>{delta >= 0 ? '+' : '−'}{money(Math.abs(delta))}</b></span>
            <span className="text-slate-500">New total <b className="text-base text-slate-900 tabular-nums">{money(newAmount)}</b></span>
          </div>
          <div className="flex gap-2 [&>*]:max-sm:flex-1">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button variant="primary" onClick={() => onSave(extras, newAmount)} disabled={!changed}>Save extras</Button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ExtrasManagerModal;
