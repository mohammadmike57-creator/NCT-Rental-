import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Fleet, RatePlan } from '../../types';
import { Badge, Button, Dialog, Field, inputCls, selectCls, table } from '../ui/Crm';
import { formatMoney, tierLabel } from '../../services/channelManager';
import {
  BandInput, DEFAULT_BANDS, Rounding, SeasonInput, adjustRatePlans, allYearSeason, basePricesFrom, buildRatePlans,
  checkInput, dailyPrice, jordanSeasons, priceInversions, rentalTotal,
} from '../../services/rateBuilder';

const ROUNDING: { key: Rounding; label: string }[] = [
  { key: 'cents', label: 'To the cent (32.78)' },
  { key: 'half', label: 'To 0.50 (33.00 / 32.50)' },
  { key: 'whole', label: 'Whole number (33)' },
];

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
const smCls = `${inputCls} !h-8 !px-2 tabular-nums`;

/** Fleet groups with their example model and number of cars, for labelling rows. */
const fleetGroups = (fleet: Fleet) => {
  const m = new Map<string, { model: string; cars: number }>();
  fleet.forEach(v => {
    const c = (v.sippCode || '').toUpperCase();
    if (!c) return;
    const g = m.get(c);
    if (g) g.cars++; else m.set(c, { model: v.modelName || c, cars: 1 });
  });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
};

const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => createPortal(<div className="relative z-[100]">{children}</div>, document.body);

// ===================================================================== builder

export const RateBuilderDialog: React.FC<{
  fleet: Fleet;
  currency: string;
  existing: RatePlan[];
  /** The whole new draft, and how many periods were built. */
  onApply: (plans: RatePlan[], built: number) => void;
  onClose: () => void;
}> = ({ fleet, currency, existing, onApply, onClose }) => {
  const nextYear = new Date().getFullYear() + 1;
  const [year, setYear] = useState(nextYear);
  const [seasons, setSeasons] = useState<SeasonInput[]>(() => jordanSeasons(nextYear));
  const [bands, setBands] = useState<BandInput[]>(DEFAULT_BANDS);
  const groups = useMemo(() => fleetGroups(fleet), [fleet]);
  const known = useMemo(() => basePricesFrom(existing), [existing]);
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.map(([c]) => [c, known[c] != null ? String(known[c]) : ''])));
  const [included, setIncluded] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.map(([c]) => [c, true])));
  const [rounding, setRounding] = useState<Rounding>('cents');
  const [preview, setPreview] = useState(0);
  const [mode, setMode] = useState<'replace' | 'add'>(existing.length ? 'replace' : 'add');

  const input = {
    seasons, bands, rounding,
    basePrices: Object.fromEntries(groups.filter(([c]) => included[c]).map(([c]) => [c, num(prices[c] || '')])),
  };
  const problems = checkInput(input);
  const sortedBands = [...bands].sort((a, b) => a.fromDay - b.fromDay);
  const built = problems.length ? [] : buildRatePlans(input);
  const inversions = built.flatMap(priceInversions);
  const overlapsExisting = mode === 'add' && existing.some(e => seasons.some(s => s.startDate <= e.endDate && e.startDate <= s.endDate));
  // Replace only what falls inside the new dates: seasons still on sale before (or after) them are kept
  const from = built.length ? built[0].startDate : '', to = built.length ? built[built.length - 1].endDate : '';
  const replaced = mode === 'replace' ? existing.filter(e => e.startDate <= to && from <= e.endDate) : [];
  const kept = existing.filter(e => !replaced.includes(e));
  const shown = seasons[Math.min(preview, seasons.length - 1)];

  const setSeason = (i: number, k: keyof SeasonInput, v: string) =>
    setSeasons(prev => prev.map((s, j) => (j !== i ? s : { ...s, [k]: k === 'adjustPercent' ? (num(v) as number) : v })));
  const setBand = (i: number, k: keyof BandInput, v: string) => setBands(prev => {
    const next = prev.map((b, j) => (j !== i ? b : { ...b, [k]: k === 'toDay' && v.trim() === '' ? null : num(v) }));
    // keep bands following on: the next band starts the day after this one ends
    if (k === 'toDay' && next[i + 1] && next[i].toDay != null) next[i + 1] = { ...next[i + 1], fromDay: (next[i].toDay as number) + 1 };
    return next;
  });
  const addBand = () => setBands(prev => {
    const last = prev[prev.length - 1];
    if (!last) return [{ fromDay: 1, toDay: null, discountPercent: 0 }];
    const lastTo = last.toDay ?? last.fromDay + 6;
    return [...prev.slice(0, -1), { ...last, toDay: lastTo }, { fromDay: lastTo + 1, toDay: null, discountPercent: Math.min(99, last.discountPercent + 5) }];
  });
  const removeBand = (i: number) => setBands(prev => {
    const next = prev.filter((_, j) => j !== i);
    if (next.length) next[next.length - 1] = { ...next[next.length - 1], toDay: null };
    return next;
  });
  const usePreset = (k: 'jordan' | 'year') => setSeasons(k === 'jordan' ? jordanSeasons(year) : allYearSeason(year));
  const addSeason = () => setSeasons(prev => {
    const last = [...prev].sort((a, b) => a.endDate.localeCompare(b.endDate)).pop();
    const start = last ? new Date(new Date(`${last.endDate}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10) : `${year}-01-01`;
    const end = new Date(`${start}T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(end.getUTCDate() - 1);
    return [...prev, { name: 'New season', startDate: start, endDate: end.toISOString().slice(0, 10), adjustPercent: 0 }];
  });

  const apply = () => {
    if (problems.length || overlapsExisting) return;
    if (replaced.length && !window.confirm(`Replace ${replaced.map(r => `"${r.name}"`).join(', ')} with ${built.length} new period${built.length === 1 ? '' : 's'}?${kept.length ? `\n\nKept as they are: ${kept.map(k => `"${k.name}"`).join(', ')}.` : ''}\n\nNothing changes for the broker until you publish.`)) return;
    onApply([...kept, ...built].sort((a, b) => a.startDate.localeCompare(b.startDate)), built.length);
  };

  return (
    <Portal>
      <Dialog open onClose={onClose} size="xl" title="Build rates"
        subtitle={`Seasons × rental length × vehicle group, in ${currency}. The result goes into the draft; the broker sees it after you publish.`}
        footer={<>
          <span className="mr-auto self-center text-xs text-slate-500 tabular-nums">{built.length ? `${built.length} period${built.length === 1 ? '' : 's'} · ${Object.keys(input.basePrices).length} groups · ${sortedBands.length} bands` : ''}</span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={apply} disabled={!!problems.length || overlapsExisting}>{replaced.length ? 'Replace in draft' : 'Add to draft'}</Button>
        </>}>
        <div className="space-y-5">
          {/* 1. Base prices */}
          <section>
            <h4 className="text-[13px] font-semibold text-slate-900">1. Base daily price per vehicle group</h4>
            <p className="text-xs text-slate-500 mb-2">The price per day of a short rental (first band) before the season adjustment.{Object.keys(known).length ? ' Filled from your current rates.' : ''}</p>
            {groups.length === 0 ? <p className="text-[13px] text-rose-600">No vehicle in the fleet has a SIPP code yet (Fleet).</p> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {groups.map(([code, g]) => (
                  <label key={code} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${included[code] ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50 opacity-70'}`}>
                    <input type="checkbox" checked={!!included[code]} onChange={e => setIncluded(p => ({ ...p, [code]: e.target.checked }))} aria-label={`Sell ${code}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs font-semibold text-slate-900">{code}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{g.model} · {g.cars} car{g.cars === 1 ? '' : 's'}</span>
                    </span>
                    <span className="relative w-28 shrink-0">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-[10px] font-semibold text-slate-500">{currency}</span>
                      <input type="number" min={0} step="0.01" value={prices[code] ?? ''} disabled={!included[code]} aria-label={`${code} base daily price`}
                        onChange={e => setPrices(p => ({ ...p, [code]: e.target.value }))} className={`${smCls} pl-9 text-right`} />
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>

          {/* 2. Seasons */}
          <section>
            <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
              <div>
                <h4 className="text-[13px] font-semibold text-slate-900">2. Seasons</h4>
                <p className="text-xs text-slate-500">A rental is priced by the season of its pick-up date, for the whole rental.</p>
              </div>
              <div className="flex items-center gap-2">
                <select className={`${selectCls} !h-8`} value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Year">
                  {[nextYear - 1, nextYear, nextYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <Button size="sm" onClick={() => usePreset('jordan')}>Jordan seasons</Button>
                <Button size="sm" onClick={() => usePreset('year')}>One price all year</Button>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 overflow-x-auto">
              <table className={`${table.wrap} min-w-[560px]`}>
                <thead className={table.head}><tr><th className={table.th}>Season</th><th className={table.th}>From</th><th className={table.th}>To</th><th className={table.th}>Price vs base</th><th className={table.th} /></tr></thead>
                <tbody className={table.body}>
                  {seasons.map((s, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 pl-4"><input className={smCls} value={s.name} onChange={e => setSeason(i, 'name', e.target.value)} aria-label="Season name" /></td>
                      <td className="px-3 py-1.5"><input type="date" className={smCls} value={s.startDate} onChange={e => setSeason(i, 'startDate', e.target.value)} aria-label="Season start" /></td>
                      <td className="px-3 py-1.5"><input type="date" className={smCls} value={s.endDate} onChange={e => setSeason(i, 'endDate', e.target.value)} aria-label="Season end" /></td>
                      <td className="px-3 py-1.5">
                        <span className="relative block w-28">
                          <input type="number" step="1" className={`${smCls} pr-6 text-right`} value={Number.isNaN(s.adjustPercent) ? '' : s.adjustPercent} onChange={e => setSeason(i, 'adjustPercent', e.target.value)} aria-label="Season adjustment percent" />
                          <span className="absolute inset-y-0 right-2 flex items-center text-[11px] text-slate-500">%</span>
                        </span>
                      </td>
                      <td className="px-3 py-1.5 pr-4 text-right"><Button size="sm" variant="ghost" onClick={() => setSeasons(p => p.filter((_, j) => j !== i))} aria-label="Remove season">Remove</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button size="sm" variant="ghost" className="mt-1 !text-indigo-600" onClick={addSeason}>+ Add season</Button>
          </section>

          {/* 3. Bands */}
          <section>
            <h4 className="text-[13px] font-semibold text-slate-900">3. Rental length discounts</h4>
            <p className="text-xs text-slate-500 mb-2">Longer rentals pay less per day. The last band has no end ("and longer").</p>
            <div className="flex flex-wrap gap-2">
              {bands.map((b, i) => {
                const last = i === bands.length - 1;
                return (
                  <div key={i} className="rounded-lg border border-slate-200 bg-white p-2 w-[12.5rem]">
                    <div className="flex items-center gap-1 text-xs text-slate-600">
                      <input type="number" min={1} className={`${smCls} !w-14 text-center`} value={b.fromDay} disabled={i > 0} onChange={e => setBand(i, 'fromDay', e.target.value)} aria-label="Band from day" />
                      <span>–</span>
                      {last ? <span className="w-14 text-center text-slate-500">longer</span>
                        : <input type="number" min={b.fromDay} className={`${smCls} !w-14 text-center`} value={b.toDay ?? ''} onChange={e => setBand(i, 'toDay', e.target.value)} aria-label="Band to day" />}
                      <span>days</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1">
                      <span className="relative block w-20">
                        <input type="number" min={0} max={99} className={`${smCls} pr-6 text-right`} value={Number.isNaN(b.discountPercent) ? '' : b.discountPercent} onChange={e => setBand(i, 'discountPercent', e.target.value)} aria-label="Band discount percent" />
                        <span className="absolute inset-y-0 right-2 flex items-center text-[11px] text-slate-500">%</span>
                      </span>
                      <span className="text-[11px] text-slate-500">off</span>
                      {bands.length > 1 && <button type="button" className="ml-auto text-[11px] text-slate-400 hover:text-rose-600" onClick={() => removeBand(i)}>Remove</button>}
                    </div>
                  </div>
                );
              })}
              <button type="button" onClick={addBand} className="rounded-lg border border-dashed border-slate-300 w-24 text-xs text-indigo-600 hover:bg-indigo-50">+ Band</button>
            </div>
          </section>

          {/* 4. Rounding + mode */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Rounding">
              <select className={`${selectCls} w-full`} value={rounding} onChange={e => setRounding(e.target.value as Rounding)}>
                {ROUNDING.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Draft rates" hint={overlapsExisting ? <span className="text-rose-600">The new seasons overlap periods already in the draft. Choose Replace, or change the dates.</span> : undefined}>
              <select className={`${selectCls} w-full`} value={mode} onChange={e => setMode(e.target.value as 'replace' | 'add')}>
                <option value="replace">Replace the periods in these dates{replaced.length ? ` (${replaced.length})` : ''}, keep the others{kept.length ? ` (${kept.length})` : ''}</option>
                <option value="add">Add next to the existing periods</option>
              </select>
            </Field>
          </section>

          {problems.length > 0 && (
            <ul className="space-y-1">{problems.map((p, i) => <li key={i} className="text-xs px-3 py-1.5 rounded-md border bg-rose-50 border-rose-200 text-rose-800">{p}</li>)}</ul>
          )}
          {inversions.length > 0 && (
            <div className="text-xs px-3 py-2 rounded-md border bg-amber-50 border-amber-200 text-amber-900">
              <p className="font-semibold">Longer rentals that cost less in total ({inversions.length}). Lower the next band's discount:</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">{inversions.slice(0, 5).map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}

          {/* Preview */}
          {built.length > 0 && shown && (
            <section>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h4 className="text-[13px] font-semibold text-slate-900">Preview: daily price</h4>
                <div className="flex flex-wrap gap-1" role="group" aria-label="Preview season">
                  {seasons.map((s, i) => (
                    <button key={i} type="button" onClick={() => setPreview(i)} aria-pressed={preview === i}
                      className={`px-2.5 h-7 rounded-md text-xs font-medium border ${preview === i ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                      {s.name} <span className="opacity-70">{s.adjustPercent > 0 ? '+' : ''}{s.adjustPercent}%</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 overflow-x-auto">
                <table className={`${table.wrap} min-w-[560px]`}>
                  <thead className={table.head}><tr>
                    <th className={table.th}>Group</th>
                    {sortedBands.map(b => <th key={b.fromDay} className={`${table.th} text-right`}>{b.toDay == null ? `${b.fromDay}+ days` : `${b.fromDay}–${b.toDay} days`}</th>)}
                    <th className={`${table.th} text-right`}>7-day total</th>
                  </tr></thead>
                  <tbody className={table.body}>
                    {Object.entries(input.basePrices).map(([code, base]) => (
                      <tr key={code}>
                        <td className="px-3 py-2 pl-4 font-mono text-xs font-semibold text-slate-900">{code}</td>
                        {sortedBands.map(b => <td key={b.fromDay} className="px-3 py-2 text-right tabular-nums">{formatMoney(dailyPrice(base, shown, b, rounding), currency)}</td>)}
                        <td className="px-3 py-2 pr-4 text-right tabular-nums font-semibold text-slate-900">
                          {(() => { const p = built.find(x => x.startDate === shown.startDate); const t = p && rentalTotal(p, code, 7); return t ? formatMoney(t.total, currency) : '—'; })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </Dialog>
    </Portal>
  );
};

// ===================================================================== bulk change

export const AdjustRatesDialog: React.FC<{
  plans: RatePlan[];
  currency: string;
  onApply: (plans: RatePlan[], summary: string) => void;
  onClose: () => void;
}> = ({ plans, currency, onApply, onClose }) => {
  const codes = useMemo(() => [...new Set(plans.flatMap(p => (p.sippRates || []).map(r => r.sippCode)))].sort(), [plans]);
  const [percent, setPercent] = useState('');
  const [amount, setAmount] = useState('');
  const [planIds, setPlanIds] = useState<string[]>(() => plans.map(p => p.id));
  const [sipps, setSipps] = useState<string[]>(codes);
  const [rounding, setRounding] = useState<Rounding>('cents');
  const pc = Number(percent) || 0, am = Number(amount) || 0;
  const next = adjustRatePlans(plans, { percent: pc, amount: am, planIds, sippCodes: sipps, rounding });
  const changed = next.reduce((n, p, i) => n + p.sippRates.reduce((m, r, j) => m + r.tiers.filter((t, k) => t.dailyPrice !== plans[i].sippRates[j].tiers[k].dailyPrice).length, 0), 0);
  const tooLow = next.some(p => p.sippRates.some(r => r.tiers.some(t => t.dailyPrice != null && !(t.dailyPrice > 0))));
  const sample = next.find(p => planIds.includes(p.id) && p.sippRates.some(r => sipps.includes(r.sippCode)));
  const sampleRate = sample?.sippRates.find(r => sipps.includes(r.sippCode));
  const before = sampleRate && plans.find(p => p.id === sample!.id)!.sippRates.find(r => r.id === sampleRate.id);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const describe = [pc ? `${pc > 0 ? '+' : ''}${pc}%` : '', am ? `${am > 0 ? '+' : ''}${am} ${currency}/day` : ''].filter(Boolean).join(' and ');

  return (
    <Portal>
      <Dialog open onClose={onClose} size="lg" title="Change prices" subtitle="Raise or lower many prices at once. The result goes into the draft."
        footer={<>
          <span className="mr-auto self-center text-xs text-slate-500 tabular-nums">{changed} price{changed === 1 ? '' : 's'} change</span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!changed || tooLow} onClick={() => onApply(next, `${describe} on ${changed} price${changed === 1 ? '' : 's'}`)}>Apply to draft</Button>
        </>}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Change by %" hint="e.g. 8 or −5"><input type="number" step="0.5" className={inputCls} value={percent} onChange={e => setPercent(e.target.value)} aria-label="Percent change" /></Field>
            <Field label={`and / or by ${currency} per day`} hint="e.g. 2 or −1.5"><input type="number" step="0.5" className={inputCls} value={amount} onChange={e => setAmount(e.target.value)} aria-label="Amount change" /></Field>
            <Field label="Rounding">
              <select className={`${selectCls} w-full`} value={rounding} onChange={e => setRounding(e.target.value as Rounding)}>{ROUNDING.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
            </Field>
          </div>
          <Field label="Periods">
            <div className="flex flex-wrap gap-1.5">
              {plans.map(p => (
                <label key={p.id} className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border text-xs cursor-pointer ${planIds.includes(p.id) ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600'}`}>
                  <input type="checkbox" checked={planIds.includes(p.id)} onChange={() => setPlanIds(l => toggle(l, p.id))} /> {p.name}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Vehicle groups">
            <div className="flex flex-wrap gap-1.5">
              {codes.map(c => (
                <label key={c} className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border text-xs font-mono cursor-pointer ${sipps.includes(c) ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600'}`}>
                  <input type="checkbox" checked={sipps.includes(c)} onChange={() => setSipps(l => toggle(l, c))} /> {c}
                </label>
              ))}
            </div>
          </Field>
          {tooLow && <p className="text-xs px-3 py-1.5 rounded-md border bg-rose-50 border-rose-200 text-rose-800">Some prices would be zero or below.</p>}
          {sampleRate && before && changed > 0 && (
            <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
              <p className="text-slate-500 mb-1">Example: {sample!.name} / <span className="font-mono">{sampleRate.sippCode}</span></p>
              <div className="flex flex-wrap gap-1.5">
                {sampleRate.tiers.map((t, i) => (
                  <span key={t.id} className="inline-flex border border-slate-200 rounded-md overflow-hidden">
                    <span className="px-1.5 py-0.5 bg-slate-50 text-slate-500">{tierLabel(t)}</span>
                    <span className="px-1.5 py-0.5 tabular-nums text-slate-400 line-through">{before.tiers[i].dailyPrice?.toFixed(2)}</span>
                    <span className="px-1.5 py-0.5 tabular-nums font-semibold text-slate-900">{t.dailyPrice?.toFixed(2)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </Portal>
  );
};

// ===================================================================== grid

const LENGTHS = [1, 3, 5, 7, 14, 30];

/** Every group against every period for one rental length, so gaps and odd prices stand out. */
export const RateGrid: React.FC<{ plans: RatePlan[]; currency: string; today: string }> = ({ plans, currency, today }) => {
  const [days, setDays] = useState(7);
  const sorted = useMemo(() => [...plans].sort((a, b) => a.startDate.localeCompare(b.startDate)), [plans]);
  const codes = useMemo(() => [...new Set(sorted.flatMap(p => (p.sippRates || []).map(r => r.sippCode)))].sort(), [sorted]);
  if (!sorted.length) return null;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
        <span className="text-xs text-slate-500">Rental of</span>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50" role="group" aria-label="Rental length">
          {LENGTHS.map(d => (
            <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d}
              className={`px-2.5 h-7 rounded-md text-xs font-semibold tabular-nums ${days === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{d} day{d === 1 ? '' : 's'}</button>
          ))}
        </div>
        <span className="text-xs text-slate-500 ml-auto">Total for the rental · per day below</span>
      </div>
      <div className="overflow-x-auto">
        <table className={`${table.wrap} min-w-[640px]`}>
          <thead className={table.head}><tr>
            <th className={table.th}>Group</th>
            {sorted.map(p => (
              <th key={p.id} className={`${table.th} text-right`}>
                <span className="block normal-case text-[12px] text-slate-700">{p.name}</span>
                <span className="block font-mono font-normal normal-case">{p.startDate.slice(5)} → {p.endDate.slice(5)}{p.endDate < today ? ' · expired' : ''}</span>
              </th>
            ))}
          </tr></thead>
          <tbody className={table.body}>
            {codes.map(code => (
              <tr key={code} className={table.row}>
                <td className="px-3 py-2 pl-4 font-mono text-xs font-semibold text-slate-900">{code}</td>
                {sorted.map(p => {
                  const t = rentalTotal(p, code, days);
                  return (
                    <td key={p.id} className={`px-3 py-2 text-right tabular-nums ${p.endDate < today ? 'opacity-50' : ''}`}>
                      {t ? <>
                        <span className="block font-semibold text-slate-900">{formatMoney(t.total, currency)}</span>
                        <span className="block text-[11px] text-slate-500">{formatMoney(t.daily, currency)} / day</span>
                      </> : <Badge tone="danger">Not sold</Badge>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
