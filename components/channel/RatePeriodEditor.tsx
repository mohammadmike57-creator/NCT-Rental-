import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Fleet, RatePlan } from '../../types';
import { Button, Dialog, inputCls, selectCls } from '../ui/Crm';
import { formatMoney, tierInversions } from '../../services/channelManager';
import { Band, PriceMatrix, bandLabel, bandsOf, checkBands, matrixOf, roundPrice, withMatrix } from '../../services/rateBuilder';

const cellCls = 'w-full h-9 px-2 text-right tabular-nums text-[13px] border rounded-md outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500';
const dayMs = 86400000;
const days = (a: string, b: string) => (a && b ? Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / dayMs) + 1 : 0);

/** Fleet groups with an example model and their number of cars. */
const groupInfo = (fleet: Fleet) => {
  const m = new Map<string, { model: string; category: string; cars: number }>();
  fleet.forEach(v => {
    const c = (v.sippCode || '').toUpperCase();
    if (!c) return;
    const g = m.get(c);
    if (g) g.cars++; else m.set(c, { model: v.modelName || c, category: (v as { category?: string }).category || '', cars: 1 });
  });
  return m;
};

/**
 * One rate period as a grid: the period's dates on top, its rental-length bands as columns and every car group
 * as a row with a daily price per band, as in the big rental systems.
 */
const RatePeriodEditor: React.FC<{
  plan: RatePlan;
  otherPlans?: RatePlan[];
  fleet: Fleet;
  currency: string;
  onSave: (p: RatePlan) => void;
  onClose: () => void;
}> = ({ plan, otherPlans = [], fleet, currency, onSave, onClose }) => {
  const info = useMemo(() => groupInfo(fleet), [fleet]);
  const [name, setName] = useState(plan.name);
  const [start, setStart] = useState(plan.startDate);
  const [end, setEnd] = useState(plan.endDate);
  const [bands, setBands] = useState<Band[]>(() => bandsOf(plan));
  const [groups, setGroups] = useState<string[]>(() => (plan.sippRates || []).map(r => r.sippCode));
  const [prices, setPrices] = useState<PriceMatrix>(() => matrixOf(plan, bandsOf(plan)));
  const [pct, setPct] = useState('');
  const [copyFrom, setCopyFrom] = useState('');

  const fleetGroups = [...info.keys()].sort();
  const missing = fleetGroups.filter(g => !groups.includes(g));

  // ---- bands
  const setTo = (i: number, v: string) => setBands(prev => {
    const n = v.trim() === '' ? null : Math.max(prev[i].fromDay, Math.floor(Number(v)));
    const next = prev.map((b, j) => (j === i ? { ...b, toDay: n } : b));
    if (n != null && next[i + 1]) next[i + 1] = { ...next[i + 1], fromDay: n + 1 };
    return next;
  });
  const addBand = () => {
    setBands(prev => {
      const last = prev[prev.length - 1];
      const end = last.toDay ?? last.fromDay + Math.max(2, last.fromDay);
      return [...prev.slice(0, -1), { ...last, toDay: end }, { fromDay: end + 1, toDay: null }];
    });
    setPrices(p => Object.fromEntries(Object.entries(p).map(([g, row]) => [g, [...row, row[row.length - 1] ?? null]])));
  };
  const removeBand = (i: number) => {
    if (bands.length <= 1) return;
    setBands(prev => {
      const next = prev.filter((_, j) => j !== i);
      if (i > 0 && i < prev.length) next[i - 1] = { ...next[i - 1], toDay: prev[i].toDay };   // the band before takes its days
      if (i === 0) next[0] = { ...next[0], fromDay: 1 };
      return next;
    });
    setPrices(p => Object.fromEntries(Object.entries(p).map(([g, row]) => [g, row.filter((_, j) => j !== i)])));
  };

  // ---- groups and prices
  const setPrice = (g: string, i: number, v: string) => setPrices(p => {
    const row = [...(p[g] || bands.map(() => null))];
    const n = v.trim() === '' ? null : Number(v);
    row[i] = n != null && Number.isFinite(n) && n > 0 ? n : null;
    return { ...p, [g]: row };
  });
  const addGroup = (g: string) => { if (!g || groups.includes(g)) return; setGroups(x => [...x, g]); setPrices(p => ({ ...p, [g]: bands.map(() => null) })); };
  const addAllGroups = () => missing.forEach(addGroup);
  const removeGroup = (g: string) => { setGroups(x => x.filter(y => y !== g)); setPrices(p => { const n = { ...p }; delete n[g]; return n; }); };
  /** Fills a group's empty bands from its first price with the usual length discounts. */
  const autoFill = (g: string) => setPrices(p => {
    const row = [...(p[g] || [])];
    const first = row.find(v => v != null);
    if (first == null) return p;
    const off = [0, 0.05, 0.10, 0.15, 0.17, 0.20, 0.22];
    return { ...p, [g]: bands.map((_, i) => row[i] ?? roundPrice(first * (1 - (off[i] ?? 0.22)), 'cents')) };
  });
  const adjustAll = () => {
    const n = Number(pct);
    if (!Number.isFinite(n) || n === 0) return;
    setPrices(p => Object.fromEntries(Object.entries(p).map(([g, row]) => [g, row.map(v => (v == null ? v : roundPrice(v * (1 + n / 100), 'cents')))])));
    setPct('');
  };
  const copyPrices = (id: string) => {
    const src = otherPlans.find(p => p.id === id);
    if (!src) return;
    const m = matrixOf(src, bands);
    setGroups(g => [...new Set([...g, ...Object.keys(m)])]);
    setPrices(p => ({ ...p, ...m }));
    setCopyFrom('');
  };

  // ---- checks
  const draft = withMatrix(plan, bands, groups, prices);
  const bandIssues = checkBands(bands);
  const empty = groups.reduce((n, g) => n + bands.filter((_, i) => prices[g]?.[i] == null).length, 0);
  const inversions = draft.sippRates.flatMap(r => tierInversions(r).map(m => `${r.sippCode}: ${m}`));
  const dateIssue = !start || !end ? 'Enter the start and end dates.' : start > end ? 'The period ends before it starts.' : '';
  const overlap = otherPlans.find(p => p.id !== plan.id && start && end && p.startDate <= end && start <= p.endDate);
  const blocking = [...bandIssues, ...(dateIssue ? [dateIssue] : []), ...(!name.trim() ? ['Give the period a name.'] : []), ...(groups.length ? [] : ['Add at least one car group.'])];
  const sevenDay = (g: string) => {
    const i = bands.findIndex(b => b.fromDay <= 7 && (b.toDay == null || b.toDay >= 7));
    const v = i >= 0 ? prices[g]?.[i] : null;
    return v == null ? '—' : formatMoney(v * 7, currency);
  };
  const invertedCell = (g: string, i: number) => {
    if (i === 0) return false;
    const a = prices[g]?.[i - 1], b = prices[g]?.[i], prevTo = bands[i - 1].toDay;
    return a != null && b != null && prevTo != null && bands[i].fromDay * b < prevTo * a - 0.005;
  };

  const save = () => { if (!blocking.length) onSave({ ...draft, name: name.trim(), startDate: start, endDate: end }); };

  return createPortal(
    <div className="relative z-[100]">
      <Dialog open onClose={onClose} size="wide" title="Rate period"
        subtitle={`Daily prices in ${currency} for each car group and rental length. The broker is charged the price of the band the rental length falls in, for every day.`}
        footer={<>
          <span className="mr-auto self-center text-xs tabular-nums text-slate-500">{groups.length} group{groups.length === 1 ? '' : 's'} · {bands.length} bands{empty ? ` · ${empty} empty` : ''}</span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={blocking.length > 0}>Save period</Button>
        </>}>
        <div className="space-y-4">
          {/* Period */}
          <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-3 items-end">
            <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">Period name</span>
              <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Summer 2027" /></label>
            <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">From (pick-up date)</span>
              <input type="date" className={inputCls} value={start} onChange={e => setStart(e.target.value)} /></label>
            <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">To (pick-up date)</span>
              <input type="date" className={inputCls} value={end} onChange={e => setEnd(e.target.value)} /></label>
            <div className="h-9 px-3 inline-flex items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600 tabular-nums">{days(start, end) > 0 ? `${days(start, end)} days` : '—'}</div>
          </div>
          {overlap && <p className="text-xs text-amber-700">Overlaps "{overlap.name}" ({overlap.startDate} → {overlap.endDate}). Publishing is blocked until periods do not overlap.</p>}

          {/* Tools */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <span className="text-xs font-semibold text-slate-600">Change all prices</span>
            <span className="relative w-24"><input type="number" step="0.5" className={`${inputCls} !h-8 pr-6 text-right`} value={pct} onChange={e => setPct(e.target.value)} placeholder="+5" aria-label="Change all prices by percent" />
              <span className="absolute inset-y-0 right-2 flex items-center text-[11px] text-slate-500">%</span></span>
            <Button size="sm" onClick={adjustAll} disabled={!pct}>Apply</Button>
            {otherPlans.filter(p => p.id !== plan.id).length > 0 && <>
              <span className="mx-1 h-5 w-px bg-slate-200" />
              <span className="text-xs font-semibold text-slate-600">Copy prices from</span>
              <select className={`${selectCls} !h-8`} value={copyFrom} onChange={e => copyPrices(e.target.value)} aria-label="Copy prices from period">
                <option value="">another period…</option>
                {otherPlans.filter(p => p.id !== plan.id).map(p => <option key={p.id} value={p.id}>{p.name} ({p.startDate.slice(5)} → {p.endDate.slice(5)})</option>)}
              </select>
            </>}
          </div>

          {/* Matrix */}
          <div className="rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px] border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="text-left px-3 py-2 font-semibold w-36 sm:w-56 sticky left-0 bg-slate-900">Car group</th>
                  {bands.map((b, i) => (
                    <th key={i} className="px-2 py-1.5 font-semibold min-w-[118px] border-l border-slate-700">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[12px]">{bandLabel(b)}</span>
                        {bands.length > 1 && <button type="button" onClick={() => removeBand(i)} className="text-slate-400 hover:text-white text-xs" aria-label={`Remove band ${bandLabel(b)}`} title="Remove band">×</button>}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[10px] font-normal text-slate-300">
                        <span>day {b.fromDay} to</span>
                        {i === bands.length - 1
                          ? <span className="italic">longer</span>
                          : <input type="number" min={b.fromDay} value={b.toDay ?? ''} onChange={e => setTo(i, e.target.value)} aria-label={`Band ${i + 1} last day`}
                              className="w-12 h-6 px-1 rounded bg-slate-800 border border-slate-600 text-white text-[11px] text-center" />}
                      </div>
                    </th>
                  ))}
                  <th className="px-2 py-1.5 font-semibold border-l border-slate-700 w-24 text-right">7-day total</th>
                  <th className="w-24 border-l border-slate-700"><button type="button" onClick={addBand} className="text-[11px] font-semibold text-indigo-200 hover:text-white">+ Band</button></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groups.map(g => {
                  const gi = info.get(g);
                  return (
                    <tr key={g} className="hover:bg-slate-50/70">
                      <td className="px-3 py-1.5 sticky left-0 bg-white">
                        <p className="font-mono text-[12px] font-bold text-slate-900">{g}</p>
                        <p className="text-[11px] text-slate-500 truncate max-w-[8rem] sm:max-w-[13rem]">{gi ? `${gi.model}${gi.category ? ` · ${gi.category}` : ''} · ${gi.cars} car${gi.cars === 1 ? '' : 's'}` : 'No car in the fleet with this code'}</p>
                      </td>
                      {bands.map((_, i) => (
                        <td key={i} className="px-1.5 py-1.5 border-l border-slate-100">
                          <input type="number" min={0} step="0.01" value={prices[g]?.[i] ?? ''} onChange={e => setPrice(g, i, e.target.value)} placeholder="—"
                            aria-label={`${g} ${bandLabel(bands[i])} daily price`} title={invertedCell(g, i) ? 'Longer rental costs less in total than the band before' : undefined}
                            className={`${cellCls} ${prices[g]?.[i] == null ? 'bg-white border-dashed border-slate-300' : invertedCell(g, i) ? 'border-amber-400 bg-amber-50 text-amber-900' : 'bg-white border-slate-200'}`} />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 border-l border-slate-100 text-right tabular-nums font-semibold text-slate-800 whitespace-nowrap">{sevenDay(g)}</td>
                      <td className="px-2 py-1.5 border-l border-slate-100 whitespace-nowrap text-right">
                        <button type="button" onClick={() => autoFill(g)} className="text-[11px] font-semibold text-indigo-600 hover:underline mr-2" title="Fill empty bands from the first price with the usual length discounts">Auto</button>
                        <button type="button" onClick={() => removeGroup(g)} className="text-[11px] text-slate-400 hover:text-rose-600" aria-label={`Remove ${g}`}>Remove</button>
                      </td>
                    </tr>
                  );
                })}
                {groups.length === 0 && <tr><td colSpan={bands.length + 3} className="px-3 py-6 text-center text-slate-500">No car groups yet: add them below.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${selectCls} !h-8`} value="" onChange={e => addGroup(e.target.value)} disabled={!missing.length} aria-label="Add car group">
              <option value="">{missing.length ? '+ Add car group…' : 'All fleet groups added'}</option>
              {missing.map(g => <option key={g} value={g}>{g} · {info.get(g)?.model}</option>)}
            </select>
            {missing.length > 1 && <Button size="sm" variant="ghost" onClick={addAllGroups}>Add all {missing.length} groups</Button>}
            <span className="ml-auto text-[11px] text-slate-400">Empty cell = that rental length is not sold for that group.</span>
          </div>

          {(blocking.length > 0 || inversions.length > 0 || empty > 0) && (
            <ul className="space-y-1 text-xs">
              {blocking.map((m, i) => <li key={`b${i}`} className="px-3 py-1.5 rounded-md border bg-rose-50 border-rose-200 text-rose-800">{m}</li>)}
              {empty > 0 && <li className="px-3 py-1.5 rounded-md border bg-amber-50 border-amber-200 text-amber-900">{empty} empty price{empty === 1 ? '' : 's'}: those rental lengths cannot be booked for that group. Use <b>Auto</b> to fill a row.</li>}
              {inversions.slice(0, 4).map((m, i) => <li key={`i${i}`} className="px-3 py-1.5 rounded-md border bg-amber-50 border-amber-200 text-amber-900">{m}</li>)}
            </ul>
          )}
        </div>
      </Dialog>
    </div>,
    document.body,
  );
};

/** Read-only grid of one period: car groups down, rental bands across. */
export const RateMatrixView: React.FC<{ plan: RatePlan; currency: string }> = ({ plan, currency }) => {
  const bands = bandsOf(plan);
  const m = matrixOf(plan, bands);
  const rows = (plan.sippRates || []).map(r => r.sippCode);
  return (
    <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
      <table className="w-full min-w-[560px] text-[13px] border-collapse">
        <thead>
          <tr className="bg-slate-100 text-slate-600">
            <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide">Car group</th>
            {bands.map((b, i) => <th key={i} className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide border-l border-slate-200 whitespace-nowrap">{bandLabel(b)}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(g => (
            <tr key={g}>
              <td className="px-3 py-2 font-mono font-semibold text-slate-800">{g}</td>
              {bands.map((_, i) => <td key={i} className="px-3 py-2 text-right tabular-nums border-l border-slate-100 text-slate-800">{m[g]?.[i] != null ? formatMoney(m[g][i] as number, currency) : <span className="text-slate-300">—</span>}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-1.5 text-[11px] text-slate-400 border-t border-slate-100">Daily price per car group and rental length.</p>
    </div>
  );
};

export default RatePeriodEditor;
