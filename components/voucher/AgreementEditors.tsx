import React, { useMemo } from 'react';
import { AppData, AvailableExtra, Fleet, Reservation, ReservationExtra, ReservationStatus, Vehicle } from '../../types';
import { Badge, Button, inputCls } from '../ui/Crm';
import { Bi } from '../ui/Bi';

/* Editors used on the rental agreement before the car is handed over:
   the pick-up / return time, the car from the fleet, and the extras. */

// ---------- time ----------

/** "HH:mm" of a booking date ("2026-10-16T09:00", or any date text the browser can read). */
export const timeOf = (s?: string): string => {
  if (!s) return '';
  const iso = s.match(/^\d{4}-\d{2}-\d{2}[T ](\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** The same day with another time; the date never changes. */
export const withTime = (s: string | undefined, time: string): string => {
  if (!s || !/^\d{2}:\d{2}$/.test(time)) return s || '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return `${s.slice(0, 10)}T${time}`;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${time}`;
};

const longDay = (s?: string) => {
  if (!s) return '—';
  const d = new Date(/^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(0, 10)}T00:00:00` : s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

/** Date (fixed) and time (editable) of the pick-up or the return. */
export const TimeEditRow: React.FC<{ label: string; value?: string; original?: string; onChange: (time: string) => void; error?: string }> = ({ label, value, original, onChange, error }) => {
  const t = timeOf(value);
  const was = timeOf(original);
  return (
    <div className="flex items-start justify-between gap-4">
      <p className="text-[13px] text-slate-500 shrink-0 pt-1.5"><Bi en={label} /></p>
      <div className="text-right min-w-0">
        <div className="flex items-center justify-end gap-2">
          <span className="text-[13px] font-medium text-slate-900 tabular-nums">{longDay(value)}</span>
          <input type="time" value={t} onChange={e => e.target.value && onChange(e.target.value)} aria-label={`${label} time`}
            className={`${inputCls} !w-[7.5rem] !h-8 tabular-nums ${error ? '!border-rose-400' : ''}`} />
        </div>
        {was && was !== t && <p className="mt-0.5 text-[11px] text-sky-700">Changed from {was}</p>}
        {error && <p className="mt-0.5 text-[11px] text-rose-600">{error}</p>}
      </div>
    </div>
  );
};

// ---------- vehicle ----------

const dayStart = (s?: string) => (s ? new Date(/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 16) : s).getTime() : NaN);
const shortDay = (s?: string) => (s ? new Date(dayStart(s)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '');

/** Why a fleet car cannot be given out for this rental (on rent, or booked for overlapping dates). */
export const carConflict = (car: Vehicle, booking: Reservation, allData?: AppData): string | null => {
  if (!car.licensePlate || !allData) return null;
  const from = dayStart(booking.startDate), to = dayStart(booking.endDate);
  for (const months of Object.values(allData)) for (const list of Object.values(months || {})) for (const r of (list as Reservation[]) || []) {
    if (r.id === booking.id || r.dropOffCompleted || r.status === ReservationStatus.CANCELLED) continue;
    if ((r.licensePlate || '').toUpperCase() !== car.licensePlate.toUpperCase()) continue;
    if (r.voucherSubmitted) return `On rent until ${shortDay(r.endDate)}`;
    const s = dayStart(r.startDate), e = dayStart(r.endDate);
    if (!isNaN(s) && !isNaN(e) && !isNaN(from) && !isNaN(to) && s < to && e > from) return `Booked ${shortDay(r.startDate)}–${shortDay(r.endDate)}`;
  }
  return null;
};

/** Every car in the fleet, grouped by category; cars already out or booked are shown but cannot be chosen. */
export const VehiclePicker: React.FC<{ fleet: Fleet; booking: Reservation; allData?: AppData; onPick: (car: Vehicle) => void }> = ({ fleet, booking, allData, onPick }) => {
  const groups = useMemo(() => {
    const byCat = new Map<string, Vehicle[]>();
    [...fleet].sort((a, b) => a.modelName.localeCompare(b.modelName) || (a.licensePlate || '').localeCompare(b.licensePlate || ''))
      .forEach(v => { const c = v.category || 'Other'; byCat.set(c, [...(byCat.get(c) || []), v]); });
    return Array.from(byCat.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [fleet]);
  const current = fleet.find(v => v.licensePlate && v.licensePlate.toUpperCase() === (booking.licensePlate || '').toUpperCase());
  const free = fleet.filter(v => !carConflict(v, booking, allData)).length;
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1"><Bi en="Car" /> <span className="text-slate-400 font-normal">· {free} of {fleet.length} available</span></label>
      <select value={current?.id || ''} onChange={e => { const v = fleet.find(x => x.id === e.target.value); if (v) onPick(v); }} className={`${inputCls} pr-8`}>
        {!current && <option value="">{booking.carModel ? `${booking.carModel}${booking.licensePlate ? ` · ${booking.licensePlate}` : ''} (not in fleet)` : 'Choose a car from the fleet'}</option>}
        {groups.map(([cat, cars]) => (
          <optgroup key={cat} label={cat}>
            {cars.map(v => {
              const busy = v.id === current?.id ? null : carConflict(v, booking, allData);
              return <option key={v.id} value={v.id} disabled={!!busy}>{v.modelName} · {v.licensePlate || 'no plate'}{v.transmission ? ` · ${v.transmission}` : ''}{busy ? ` — ${busy}` : ''}</option>;
            })}
          </optgroup>
        ))}
      </select>
    </div>
  );
};

// ---------- extras ----------

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Add, price, give free or remove extras on the agreement. Totals use the rental's day count. */
export const ExtrasEditor: React.FC<{ extras: ReservationExtra[]; catalogue: AvailableExtra[]; days: number; editable: boolean; onChange: (list: ReservationExtra[]) => void }> = ({ extras, catalogue, days, editable, onChange }) => {
  const add = (x: AvailableExtra) => !extras.some(e => same(e.name, x.name)) && onChange([...extras, { name: x.name, dailyPrice: x.defaultDailyPrice || 0, isComplementary: false }]);
  const update = (i: number, patch: Partial<ReservationExtra>) => onChange(extras.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const remove = (i: number) => onChange(extras.filter((_, j) => j !== i));
  const total = extras.reduce((s, e) => (e.isComplementary ? s : s + (e.dailyPrice || 0) * days), 0);
  const offer = catalogue.filter(x => !extras.some(e => same(e.name, x.name)));
  return (
    <div className="space-y-3">
      {extras.length ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {extras.map((e, i) => (
            <li key={e.name} className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-slate-900">{e.name}</p>
                <p className="text-xs text-slate-500 tabular-nums">{e.isComplementary ? 'Included free of charge' : `${money(e.dailyPrice)} × ${days} day${days === 1 ? '' : 's'} = ${money((e.dailyPrice || 0) * days)}`}</p>
              </div>
              {editable ? (
                <>
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                    <span>Per day</span>
                    <input type="number" min={0} step="0.5" value={e.dailyPrice} disabled={e.isComplementary} onChange={ev => update(i, { dailyPrice: Math.max(0, +ev.target.value || 0) })}
                      className={`${inputCls} !w-20 !h-8 text-right tabular-nums`} aria-label={`${e.name} price per day`} />
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={e.isComplementary} onChange={ev => update(i, { isComplementary: ev.target.checked })} />Free
                  </label>
                  <Button size="sm" variant="ghost" className="!text-rose-600" onClick={() => remove(i)}>Remove</Button>
                </>
              ) : e.isComplementary ? <Badge tone="success">Free</Badge> : null}
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-slate-500">No extras on this rental.</p>}

      {editable && offer.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Add an extra</p>
          <div className="flex flex-wrap gap-2">
            {offer.map(x => (
              <button key={x.id} type="button" onClick={() => add(x)}
                className="inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50">
                <span className="text-indigo-600 font-bold">+</span>{x.name}<span className="text-slate-400 tabular-nums">{money(x.defaultDailyPrice)}/day</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {editable && !catalogue.length && <p className="text-xs text-slate-500">No extras are set up yet. Add them in Administration → Manage Extras.</p>}

      <div className="flex items-center justify-between border-t border-slate-200 pt-2.5">
        <span className="text-[13px] text-slate-600">Extras total for {days} day{days === 1 ? '' : 's'}</span>
        <span className="text-[15px] font-semibold text-slate-900 tabular-nums">{money(total)}</span>
      </div>
    </div>
  );
};
