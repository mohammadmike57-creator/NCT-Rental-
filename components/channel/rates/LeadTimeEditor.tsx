import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../../ui/Crm';
import { LengthBand, lengthLabel, DynamicPricingConfig, LeadTier, PRICE_CHANNELS, PriceAdjust, PriceChannelType } from '../../../services/dynamicPricing';
import { Icons, Popover, Seg, Stepper, Toggle, signed, toneOf, toneText } from '../pricingKit';
import { Chips, exRate, money, r2, uid } from './rateRulesKit';

/** Rate rules → Last minute: booking-window price grid and booking curve. */
// ---------------------------------------------------------------- last minute

export const DEFAULT_BANDS: LengthBand[] = [{ fromDay: 1, toDay: 2 }, { fromDay: 3, toDay: 6 }, { fromDay: 7, toDay: null }];

/** Booking windows staff add with one click. */
export const WINDOW_PRESETS: { label: string; fromHours: number; toHours: number | null }[] = [
  { label: 'Less than 24 hours', fromHours: 0, toHours: 24 },
  { label: '24–48 hours', fromHours: 24, toHours: 48 },
  { label: '2–7 days', fromHours: 48, toHours: 168 },
  { label: '7–30 days', fromHours: 168, toHours: 720 },
  { label: 'More than 30 days', fromHours: 720, toHours: null },
];
export const inDays = (h: number) => h > 48 && h % 24 === 0;
export const hoursText = (h: number) => (inDays(h) ? `${h / 24} days` : `${h} hours`);
export const windowShort = (t: { fromHours: number; toHours: number | null }) => {
  if (t.toHours == null) return `More than ${hoursText(t.fromHours)}`;
  if (t.fromHours === 0) return `Less than ${hoursText(t.toHours)}`;
  if (inDays(t.toHours) && (t.fromHours % 24 === 0)) return `${t.fromHours / 24}–${t.toHours / 24} days`;
  return `${t.fromHours}–${t.toHours} hours`;
};

/** Edits one cell: direction, unit, amount, with the result on the base rate. */
export type Unit = 'none' | 'pct' | 'amt' | 'fixed';
export const unitOf = (a: PriceAdjust): Unit => (a.type === 'percent' ? 'pct' : a.type === 'amount' ? 'amt' : a.type === 'fixed' ? 'fixed' : 'none');
export const makeAdjust = (u: Unit, sign: 1 | -1, n: number): PriceAdjust => {
  const v = Math.abs(Number.isFinite(n) ? n : 0);
  return u === 'none' ? { type: 'none', value: 0 } : u === 'fixed' ? { type: 'fixed', value: v } : { type: u === 'pct' ? 'percent' : 'amount', value: sign * v };
};
export const adjustShort = (a: PriceAdjust) => (a.type === 'percent' ? signed(a.value) : a.type === 'amount' ? `${signed(a.value, '')}/day`.replace(' /', '/') : a.type === 'fixed' ? `= ${money(a.value)}` : 'Normal');

export const CellEditor: React.FC<{ value: PriceAdjust; onChange: (a: PriceAdjust) => void; base: number; label: string; onRow?: () => void; onClose: () => void }> = ({ value, onChange, base, label, onRow, onClose }) => {
  const u = unitOf(value);
  const dir: 'up' | 'down' | 'none' = u === 'none' ? 'none' : u === 'fixed' ? (value.value >= base ? 'up' : 'down') : value.value < 0 ? 'down' : 'up';
  const n = Math.abs(value.value || 0);
  const result = exRate(base, value), diff = r2(result - base);
  return (
    <Popover onClose={onClose} className="w-[320px]">
      <div className="px-4 pt-3.5 pb-3 border-b border-slate-100">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Edit price</p>
        <p className="text-[13px] font-semibold text-slate-900">{label}</p>
      </div>
      <div className="px-4 py-3.5 space-y-3">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Rate</p>
          <Seg label={`${label}: direction`} value={u === 'fixed' ? 'fixed' : dir} onChange={d => {
            if (d === 'none') onChange(makeAdjust('none', 1, 0));
            else if (d === 'fixed') onChange(makeAdjust('fixed', 1, u === 'fixed' ? n : base));
            else onChange(makeAdjust(u === 'none' || u === 'fixed' ? 'pct' : u, d === 'up' ? 1 : -1, u === 'none' || u === 'fixed' ? 10 : n || 10));
          }} options={[['up', 'Increase'], ['down', 'Decrease'], ['fixed', 'Fixed'], ['none', 'Normal']]} size="sm" />
        </div>
        {u !== 'none' && (
          <div className="flex items-end gap-3">
            {u !== 'fixed' && (
              <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">By</p>
                <Seg label={`${label}: unit`} value={u} size="sm" onChange={nu => onChange(makeAdjust(nu, dir === 'down' ? -1 : 1, n))} options={[['pct', '%'], ['amt', 'Amount']]} /></div>
            )}
            <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{u === 'fixed' ? 'Daily rate' : 'Value'}</p>
              <Stepper size="sm" label={`${label}: value`} unit={u === 'pct' ? '%' : u === 'amt' ? '/day' : ''} min={0} max={u === 'pct' ? (dir === 'down' ? 90 : 500) : 100000} step={u === 'pct' ? 1 : 0.5}
                signedTone={false} value={n || undefined} onChange={v => onChange(makeAdjust(u, dir === 'down' ? -1 : 1, v || 0))} /></div>
          </div>
        )}
        <div className="flex items-center justify-between rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200 px-3 py-2.5">
          <span className="text-[12px] text-slate-500 tabular-nums">{money(base)} <span className="text-slate-300">→</span></span>
          <span className="flex items-center gap-2"><span className="text-[17px] font-bold tabular-nums text-slate-900">{money(result)}</span>
            {diff !== 0 && <span className={`text-[12px] font-semibold tabular-nums ${toneText[toneOf(diff)]}`}>{diff > 0 ? '+' : '−'}{money(Math.abs(diff))}</span>}</span>
        </div>
      </div>
      <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-b-xl">
        {onRow ? <button type="button" onClick={onRow} className="text-[12px] font-semibold text-indigo-600 hover:text-indigo-800">Copy to the whole row</button> : <span />}
        <Button size="sm" variant="primary" onClick={onClose}>Done</Button>
      </div>
    </Popover>
  );
};

/** The booking windows on a time axis: pick-up on the left. */
export const BookingCurve: React.FC<{ tiers: LeadTier[]; pick: (t: LeadTier) => PriceAdjust; base: number; enabled: boolean }> = ({ tiers, pick, base, enabled }) => {
  const sorted = [...tiers].sort((a, b) => a.fromHours - b.fromHours);
  const finite = sorted.flatMap(t => [t.fromHours, t.toHours ?? t.fromHours]);
  const maxH = Math.max(72, ...finite) * 1.6;
  const x = (h: number | null) => (h == null ? 100 : Math.min(100, (Math.log1p(h) / Math.log1p(maxH)) * 100));
  const ticks = Array.from(new Set([0, ...finite])).sort((a, b) => a - b);
  return (
    <div className={enabled ? '' : 'opacity-50 grayscale'}>
      <div className="relative h-14 rounded-lg bg-[repeating-linear-gradient(135deg,#f8fafc_0,#f8fafc_6px,#f1f5f9_6px,#f1f5f9_7px)] ring-1 ring-inset ring-slate-200 overflow-hidden">
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11.5px] font-medium text-slate-400">Normal rate</span>
        {sorted.map(t => {
          const a = pick(t), r = exRate(base, a), d = r2(r - base), tone = toneOf(d);
          const l = x(t.fromHours), w = x(t.toHours) - l;
          return (
            <div key={t.id} className={`absolute inset-y-1.5 rounded-md px-2.5 flex flex-col justify-center overflow-hidden ring-1 ring-inset ${tone === 'up' ? 'bg-amber-100 ring-amber-300 text-amber-900' : tone === 'down' ? 'bg-emerald-100 ring-emerald-300 text-emerald-900' : 'bg-white ring-slate-200 text-slate-500'}`}
              style={{ left: `calc(${l}% + 2px)`, width: `calc(${w}% - 4px)` }} title={`${windowShort(t)}: ${adjustShort(a)}`}>
              <span className="text-[11.5px] font-semibold truncate">{windowShort(t)}</span>
              <span className="text-[11px] tabular-nums truncate opacity-80">{adjustShort(a)} · {money(r)}</span>
            </div>
          );
        })}
      </div>
      <div className="relative h-5 mt-1">
        {ticks.map(h => <span key={h} className="absolute -translate-x-1/2 text-[10.5px] font-mono text-slate-400 whitespace-nowrap first:translate-x-0" style={{ left: `${x(h)}%` }}>{h === 0 ? 'pick-up' : inDays(h) ? `${h / 24}d` : `${h}h`}</span>)}
        <span className="hidden md:inline absolute right-0 text-[10.5px] font-mono text-slate-400">earlier bookings →</span>
      </div>
    </div>
  );
};

export const LeadTimeEditor: React.FC<{ base: number; setBase: (n: number) => void; cfg: DynamicPricingConfig; rateBands: LengthBand[]; onSave: (c: DynamicPricingConfig, what: string) => void }> = ({ base, setBase, cfg, rateBands, onSave }) => {
  const [lt, setLt] = useState(cfg.leadTime);
  const [edit, setEdit] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => setLt(cfg.leadTime), [cfg.leadTime]);
  const closeEdit = useCallback(() => setEdit(null), []);
  const closeAdd = useCallback(() => setAdding(false), []);
  const dirty = JSON.stringify(lt) !== JSON.stringify(cfg.leadTime);
  const bands = lt.lengthBands || [];
  const byLength = bands.length > 0;
  const none: PriceAdjust = { type: 'none', value: 0 };
  const setTier = (i: number, p: Partial<LeadTier>) => setLt(x => ({ ...x, tiers: x.tiers.map((t, j) => (j === i ? { ...t, ...p } : t)) }));
  const setCell = (i: number, k: number, a: PriceAdjust) => setLt(x => ({ ...x, tiers: x.tiers.map((t, j) => (j === i ? { ...t, byLength: bands.map((_, m) => (m === k ? a : (t.byLength?.[m] || t.adjust))) } : t)) }));
  const applyBands = (next: LengthBand[]) => setLt(x => ({
    ...x, lengthBands: next.length ? next : undefined,
    tiers: x.tiers.map(t => (next.length ? { ...t, byLength: next.map((_, m) => t.byLength?.[m] || t.adjust) } : { ...t, byLength: undefined })),
  }));
  const addWindow = (w: { fromHours: number; toHours: number | null }) => setLt(x => ({
    ...x, tiers: [...x.tiers, { id: uid('lt'), fromHours: w.fromHours, toHours: w.toHours, adjust: none, ...(bands.length ? { byLength: bands.map(() => none) } : {}) }]
      .sort((a, b) => a.fromHours - b.fromHours),
  }));
  const has = (w: { fromHours: number; toHours: number | null }) => lt.tiers.some(t => t.fromHours === w.fromHours && t.toHours === w.toHours);
  const sorted = [...lt.tiers].sort((a, b) => a.fromHours - b.fromHours);
  const overlaps = sorted.some((t, i) => i > 0 && sorted[i - 1].toHours != null && sorted[i - 1].toHours! > t.fromHours);
  const cellOf = (t: LeadTier, k: number) => t.byLength?.[k] || t.adjust;
  const cols = byLength ? bands : [null];
  const bandsChanged = byLength && rateBands.length > 0 && JSON.stringify(bands) !== JSON.stringify(rateBands);
  const lastEnd = sorted.length ? (sorted[sorted.length - 1].toHours ?? sorted[sorted.length - 1].fromHours) : 0;
  const save = () => onSave({ ...cfg, leadTime: lt }, `${lt.tiers.length} window(s)${byLength ? ` × ${bands.length} rental length(s)` : ''}`);
  const channelText = lt.channels.length ? lt.channels.map(c => PRICE_CHANNELS.find(p => p[0] === c)?.[1] || c).join(', ') : 'All channel types';

  return (
    <div className="space-y-5">
      {/* Command bar */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-clip">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100 [&>svg]:w-5 [&>svg]:h-5"><Icons.bolt /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-600">Rate rules</p>
            <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-slate-900">Last-minute pricing</h2>
            <p className="text-[12.5px] text-slate-500">Raise or lower your published rate by how close to pick-up the customer books. Uses your existing periods and rate bands; never creates a new period.</p>
          </div>
          <dl className="flex items-stretch divide-x divide-slate-200 text-[12px]">
            <div className="pr-5"><dt className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Status</dt>
              <dd className="mt-1 flex items-center gap-2 font-semibold text-slate-900"><Toggle on={lt.enabled} onChange={b => setLt(x => ({ ...x, enabled: b }))} label="Last-minute pricing" />{lt.enabled ? 'On' : 'Off'}</dd></div>
            <div className="px-5"><dt className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Grid</dt>
              <dd className="mt-1 font-semibold text-slate-900 tabular-nums">{lt.tiers.length} window{lt.tiers.length === 1 ? '' : 's'} × {byLength ? bands.length : 1} band{byLength && bands.length !== 1 ? 's' : ''}</dd></div>
            <div className="pl-5"><dt className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Changes</dt>
              <dd className="mt-1">{dirty
                ? <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Not saved</span>
                : <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Saved to draft</span>}</dd></div>
          </dl>
          <div className="flex items-center gap-2">
            {dirty && <Button variant="ghost" size="sm" onClick={() => setLt(cfg.leadTime)}>Discard</Button>}
            <Button variant="primary" size="sm" disabled={!dirty} onClick={save}>Save to draft</Button>
          </div>
        </div>
        {!lt.enabled && <div className="px-5 py-2 border-t border-slate-100 bg-slate-50/70 text-[12px] text-slate-500">Off: every booking gets your normal rates. Your grid is kept; switch it on to use it.</div>}
      </section>

      {/* Booking curve */}
      {lt.tiers.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <div><h3 className="text-[13.5px] font-semibold text-slate-900">Booking curve</h3>
              <p className="text-[12px] text-slate-500">Time between booking and pick-up{byLength ? `, shown for the ${lengthLabel(bands[0])} band` : ''}, on a base rate of {money(base)}.</p></div>
            <span className="flex items-center gap-3 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-200 ring-1 ring-amber-300" />Higher</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-200 ring-1 ring-emerald-300" />Lower</span></span>
          </div>
          <BookingCurve tiers={lt.tiers} base={base} enabled={lt.enabled} pick={t => (byLength ? cellOf(t, 0) : t.adjust)} />
        </section>
      )}

      {/* Price matrix */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-x-5 gap-y-2.5">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Rental length</span>
            <Seg label="Rental length" size="sm" value={byLength ? 'bands' : 'all'} onChange={v => applyBands(v === 'bands' ? (bands.length ? bands : (rateBands.length ? rateBands : DEFAULT_BANDS)) : [])}
              options={[['all', 'Same for all'], ['bands', 'By rate band']]} />
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Preview base</span>
            <Stepper size="sm" label="Preview base rate" unit="/day" min={1} max={100000} step={1} signedTone={false} width="w-12" value={base} onChange={v => setBase(Math.max(1, v || 1))} />
          </div>
          <div className="relative ml-auto">
            <Button size="sm" icon={<span className="[&>svg]:w-3.5 [&>svg]:h-3.5"><Icons.plus /></span>} onClick={() => setAdding(a => !a)}>Add booking window</Button>
            {adding && (
              <Popover onClose={closeAdd} className="w-[260px] p-1.5">
                <p className="px-2.5 pt-1.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Booked before pick-up</p>
                {WINDOW_PRESETS.map(w => (
                  <button key={w.label} type="button" disabled={has(w)} onClick={() => { addWindow(w); setAdding(false); }}
                    className="w-full flex items-center justify-between px-2.5 h-9 rounded-lg text-[13px] text-slate-700 hover:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-transparent">
                    {w.label}<span className="text-[11px] font-mono text-slate-400">{has(w) ? 'added' : `${w.fromHours}–${w.toHours ?? '∞'} h`}</span>
                  </button>
                ))}
                <div className="my-1 h-px bg-slate-100" />
                <button type="button" onClick={() => { addWindow({ fromHours: lastEnd, toHours: null }); setAdding(false); }}
                  className="w-full flex items-center px-2.5 h-9 rounded-lg text-[13px] font-medium text-indigo-600 hover:bg-indigo-50">Custom window…</button>
              </Popover>
            )}
          </div>
        </div>
        {bandsChanged && (
          <div className="px-5 py-2 border-b border-amber-200 bg-amber-50 flex items-center justify-between gap-3 text-[12px] text-amber-900">
            Your rate bands on the Rates tab changed ({rateBands.map(lengthLabel).join(', ')}).
            <button type="button" onClick={() => applyBands(rateBands)} className="font-semibold underline underline-offset-2">Update columns</button>
          </div>
        )}

        {lt.tiers.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <span className="mx-auto grid place-items-center w-11 h-11 rounded-full bg-slate-100 text-slate-400 [&>svg]:w-5 [&>svg]:h-5"><Icons.clock /></span>
            <p className="mt-3 text-[14px] font-semibold text-slate-800">No booking windows yet</p>
            <p className="text-[13px] text-slate-500 mt-1">Start with a common window. You can change the hours and prices after.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {WINDOW_PRESETS.slice(0, 3).map(w => <Button key={w.label} size="sm" onClick={() => addWindow(w)}>＋ {w.label}</Button>)}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto lg:overflow-visible">
            <table className="w-full text-[13px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-[1] bg-slate-50 text-left px-5 py-2.5 border-b border-slate-200 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 min-w-[150px] md:min-w-[230px]">Booked before pick-up</th>
                  {cols.map((b, k) => (
                    <th key={k} className="bg-slate-50 px-3 py-2.5 border-b border-l border-slate-200 text-center min-w-[120px] md:min-w-[150px]">
                      {b ? <><p className="text-[13px] font-semibold text-slate-900">{lengthLabel(b)}</p><p className="text-[10.5px] font-medium text-slate-400">rate band</p></>
                        : <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Every rental length</p>}
                    </th>
                  ))}
                  <th className="bg-slate-50 border-b border-slate-200 w-12" />
                </tr>
              </thead>
              <tbody>
                {lt.tiers.map((t, i) => (
                  <tr key={t.id} className="group">
                    <td className="sticky left-0 z-[1] bg-white group-hover:bg-slate-50/60 px-3 md:px-5 py-3 border-b border-slate-100">
                      <p className="text-[13.5px] font-semibold text-slate-900">{windowShort(t)}</p>
                      <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-slate-50 ring-1 ring-inset ring-slate-200 px-1.5 h-6 text-[11px] font-mono text-slate-500">
                        <input type="number" min={0} value={t.fromHours} onChange={e => setTier(i, { fromHours: Math.max(0, Number(e.target.value) || 0) })} aria-label="From hours" className="w-9 bg-transparent text-right outline-none focus:text-slate-900" />
                        <span>–</span>
                        <input type="number" min={0} value={t.toHours ?? ''} placeholder="∞" onChange={e => setTier(i, { toHours: e.target.value === '' ? null : Number(e.target.value) })} aria-label="To hours" className="w-9 bg-transparent text-right outline-none focus:text-slate-900" />
                        <span>h</span>
                      </div>
                    </td>
                    {cols.map((b, k) => {
                      const a = b ? cellOf(t, k) : t.adjust, r = exRate(base, a), d = r2(r - base), tone = toneOf(d);
                      const key = `${i}:${k}`, label = `${windowShort(t)}${b ? ` · ${lengthLabel(b)}` : ''}`;
                      return (
                        <td key={k} className="relative px-2 py-2 border-b border-l border-slate-100 group-hover:bg-slate-50/60">
                          <button type="button" onClick={() => setEdit(edit === key ? null : key)} aria-label={`Edit ${label}`} aria-expanded={edit === key}
                            className={`w-full rounded-lg px-3 py-2 text-center ring-1 ring-inset transition-all hover:shadow-sm ${edit === key ? 'ring-2 ring-indigo-500' : ''} ${tone === 'up' ? 'bg-amber-50 ring-amber-200 hover:ring-amber-300' : tone === 'down' ? 'bg-emerald-50 ring-emerald-200 hover:ring-emerald-300' : 'bg-white ring-slate-200 hover:ring-slate-300'}`}>
                            <p className={`text-[15px] font-bold tabular-nums ${a.type === 'none' ? 'text-slate-400' : 'text-slate-900'}`}>{money(r)}</p>
                            <p className={`text-[11px] font-semibold tabular-nums ${toneText[tone]}`}>{a.type === 'none' ? 'Normal rate' : `${adjustShort(a)}${a.type !== 'percent' && d ? '' : ''}`}{d !== 0 && a.type !== 'percent' ? ` (${d > 0 ? '+' : '−'}${money(Math.abs(d))})` : ''}</p>
                          </button>
                          {edit === key && (
                            <CellEditor base={base} value={a} label={label} onClose={closeEdit}
                              onChange={v => (b ? setCell(i, k, v) : setTier(i, { adjust: v }))}
                              onRow={b && bands.length > 1 ? () => setLt(x => ({ ...x, tiers: x.tiers.map((tt, j) => (j === i ? { ...tt, byLength: bands.map(() => a) } : tt)) })) : undefined} />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 border-b border-slate-100 text-center group-hover:bg-slate-50/60">
                      <button type="button" onClick={() => setLt(x => ({ ...x, tiers: x.tiers.filter((_, j) => j !== i) }))} title="Remove window" aria-label={`Remove ${windowShort(t)}`}
                        className="grid place-items-center w-8 h-8 mx-auto rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 [&>svg]:w-4 [&>svg]:h-4"><Icons.x /></button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="sticky left-0 z-[1] bg-slate-50/80 px-5 py-3">
                    <p className="text-[13px] font-semibold text-slate-600">Any other time</p>
                    <p className="text-[11px] text-slate-400">Outside the windows above</p>
                  </td>
                  {cols.map((_, k) => (
                    <td key={k} className="bg-slate-50/80 px-3 py-3 border-l border-slate-100 text-center">
                      <p className="text-[14px] font-semibold tabular-nums text-slate-500">{money(base)}</p><p className="text-[11px] text-slate-400">Normal rate</p>
                    </td>
                  ))}
                  <td className="bg-slate-50/80" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {overlaps && <p className="px-5 py-2 border-t border-amber-200 bg-amber-50 text-[12px] text-amber-900">Two windows overlap. The window that starts first is used for the overlapping hours.</p>}
        <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-b-xl bg-slate-50/40">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Applies to</span>
          <Chips options={PRICE_CHANNELS} value={lt.channels} onChange={v => setLt(x => ({ ...x, channels: v as PriceChannelType[] }))} allLabel="All channel types" />
          <span className="ml-auto text-[11.5px] text-slate-400">Click a price to change it · {channelText}</span>
        </div>
      </section>
    </div>
  );
};
