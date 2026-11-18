import React, { useMemo, useState } from 'react';
import { Aggregator, Fleet, RatePlan } from '../../types';
import { bandLabel, bandsOf, matrixOf } from '../../services/rateBuilder';
import { SlidingPill } from './otaMotion';
import { mediaUrl } from '../../services/api';
import { VehicleArt, VehicleKind } from '../VehicleGraphics';

/**
 * A car group as people recognise it: its picture, its SIPP code, the car model behind it and the SIPP code
 * spelled out ("Compact · 4–5 doors · Automatic · A/C"). Used wherever rates are listed per group.
 */

const CATEGORY: Record<string, string> = {
  M: 'Mini', N: 'Mini Elite', E: 'Economy', H: 'Economy Elite', C: 'Compact', D: 'Compact Elite', I: 'Intermediate', J: 'Intermediate Elite',
  S: 'Standard', R: 'Standard Elite', F: 'Fullsize', G: 'Fullsize Elite', P: 'Premium', U: 'Premium Elite', L: 'Luxury', W: 'Luxury Elite', O: 'Oversize', X: 'Special',
};
const TYPE: Record<string, string> = {
  B: '2–3 doors', C: '2/4 doors', D: '4–5 doors', W: 'Wagon', V: 'Passenger van', L: 'Limousine', S: 'Sport', T: 'Convertible', F: 'SUV', J: 'Open-air 4×4',
  X: 'Special', P: 'Pick-up', Q: 'Pick-up double cab', Z: 'Special offer', E: 'Coupé', M: 'Monospace', R: 'Recreational', H: 'Motor home', Y: 'Two-wheeler',
  N: 'Roadster', G: 'Crossover', K: 'Commercial van',
};
const GEAR: Record<string, string> = { M: 'Manual', N: 'Manual 4WD', C: 'Manual AWD', A: 'Automatic', B: 'Automatic 4WD', D: 'Automatic AWD' };
const FUEL: Record<string, string> = {
  R: 'A/C', N: 'No A/C', D: 'Diesel · A/C', Q: 'Diesel', H: 'Hybrid · A/C', I: 'Hybrid', E: 'Electric · A/C', C: 'Electric', L: 'LPG · A/C', S: 'LPG',
  A: 'Hydrogen · A/C', B: 'Hydrogen', M: 'Multi-fuel · A/C', F: 'Multi-fuel', V: 'Petrol · A/C', Z: 'Petrol', U: 'Ethanol · A/C', X: 'Ethanol',
};

/** The SIPP code in words, e.g. CDAR → "Compact · 4–5 doors · Automatic · A/C". */
export const describeSipp = (code: string) => {
  const c = (code || '').toUpperCase();
  if (!/^[A-Z]{4}$/.test(c)) return '';
  return [CATEGORY[c[0]], TYPE[c[1]], GEAR[c[2]], FUEL[c[3]]].filter(Boolean).join(' · ');
};

/** The drawing used when a group has no photo yet. */
const kindOf = (code: string): VehicleKind => {
  const c = (code || '').toUpperCase();
  if ('FGJ'.includes(c[1] || '')) return 'suv';
  if ('PQ'.includes(c[1] || '')) return 'truck';
  if ('STNE'.includes(c[1] || '')) return 'sports';
  if ('MNEH'.includes(c[0] || '')) return 'compact';
  return 'sedan';
};

export interface CarGroupInfo { code: string; model: string; models: string[]; category: string; cars: number; image?: string }

/**
 * Every SIPP group of the fleet: its models, number of cars and picture. A broker's own picture for the group
 * (Booking API → car details) wins over the fleet photo, as in what the broker receives.
 */
export const carGroups = (fleet: Fleet, aggregator?: Aggregator): Map<string, CarGroupInfo> => {
  const m = new Map<string, CarGroupInfo>();
  fleet.forEach(v => {
    const c = (v.sippCode || '').trim().toUpperCase();
    if (!c) return;
    const g = m.get(c) || { code: c, model: v.modelName || c, models: [], category: v.category || '', cars: 0 };
    g.cars++;
    if (v.modelName && !g.models.includes(v.modelName)) g.models.push(v.modelName);
    if (!g.image && v.imageUrl) g.image = v.imageUrl;
    m.set(c, g);
  });
  const details = aggregator?.bookingRules?.groupDetails || {};
  Object.entries(details).forEach(([c, d]) => {
    const g = m.get(c.toUpperCase());
    if (g && d?.pictureUrl) g.image = d.pictureUrl;
  });
  return m;
};

/** The group's photo, or a drawing of its body style when there is none (or it does not load). */
export const CarThumb: React.FC<{ code: string; image?: string; alt?: string; className?: string }> = ({ code, image, alt, className = 'w-16 h-10' }) => {
  const [broken, setBroken] = useState(false);
  const src = !broken ? mediaUrl(image) : undefined;
  return (
    <span className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 ring-1 ring-inset ring-slate-200/80 ${className}`}>
      {src
        ? <img src={src} alt={alt || code} loading="lazy" onError={() => setBroken(true)} className="w-full h-full object-cover ota-car-img" />
        : <VehicleArt kind={kindOf(code)} className="w-[86%] h-auto ota-car-img" />}
    </span>
  );
};

/** Picture, SIPP code, model and the code in words, in one line (tables) or stacked (cards). */
export const CarGroupLabel: React.FC<{ code: string; info?: CarGroupInfo; size?: 'sm' | 'md' }> = ({ code, info, size = 'sm' }) => {
  const more = info && info.models.length > 1 ? ` +${info.models.length - 1}` : '';
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <CarThumb code={code} image={info?.image} alt={info?.model} className={size === 'md' ? 'w-16 h-10' : 'w-12 h-8'} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-[11.5px] font-bold text-slate-900 px-1.5 py-px rounded-md bg-slate-100 ring-1 ring-inset ring-slate-200">{code}</span>
          <span className="text-[12.5px] font-semibold text-slate-800 truncate">{info ? `${info.model}${more}` : 'Not in the fleet'}</span>
        </span>
        <span className="block text-[11px] text-slate-500 truncate" title={describeSipp(code)}>{describeSipp(code) || 'Unknown SIPP code'}{info ? ` · ${info.cars} car${info.cars === 1 ? '' : 's'}` : ''}</span>
      </span>
    </span>
  );
};

/**
 * A broker's rate sheet: one row per car group (small picture, SIPP code, model and the code in words) and the
 * daily price for each rental length of the chosen period, as rental companies' extranets show it. The cheapest
 * length of each row is marked; a length without a price says "Not sold". A row opens that period's prices.
 */
export const RateSheet: React.FC<{
  groups: Map<string, CarGroupInfo>;
  plans: RatePlan[];
  currency: string;
  today: string;
  onOpen: (planId: string) => void;
}> = ({ groups, plans, currency, today, onOpen }) => {
  const sorted = useMemo(() => [...plans].sort((a, b) => a.startDate.localeCompare(b.startDate)), [plans]);
  const live = sorted.find(p => p.startDate <= today && today <= p.endDate) || sorted.find(p => p.startDate > today) || sorted[sorted.length - 1];
  const [pick, setPick] = useState<string | null>(null);
  const plan = sorted.find(p => p.id === pick) || live;
  if (!plan) return null;
  const bands = bandsOf(plan);
  const m = matrixOf(plan, bands);
  const codes = [...new Set([...groups.keys(), ...Object.keys(m)])].sort();
  const priced = codes.filter(c => (m[c] || []).some(v => v != null)).length;
  const all = codes.flatMap(c => (m[c] || []).filter((v): v is number => v != null));
  const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(2));
  const state = (p: RatePlan) => (p.endDate < today ? { l: 'Ended', dot: 'bg-slate-300' } : p.startDate <= today ? { l: 'Now', dot: 'bg-emerald-500' } : { l: 'Next', dot: 'bg-sky-500' });
  const week = bands.findIndex(b => b.fromDay <= 7 && (b.toDay == null || b.toDay >= 7));
  const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  return (
    <section className="ota-pop rounded-2xl bg-white border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_-22px_rgba(15,23,42,0.3)] overflow-hidden" aria-label="Rate sheet">
      <div className="px-4 sm:px-5 pt-4 pb-3 flex flex-wrap items-start gap-x-6 gap-y-3 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-semibold text-slate-900 tracking-[-0.01em]">Rate sheet</h3>
          <p className="text-[12px] text-slate-500">Daily price per car group and rental length, in {currency}. Click a row to change its prices.</p>
        </div>
        <dl className="flex items-center gap-2 text-[11.5px]">
          <div className="h-8 px-3 rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200 inline-flex items-center gap-1.5"><dt className="text-slate-500">Groups priced</dt><dd className="font-semibold tabular-nums text-slate-900">{priced} / {codes.length}</dd></div>
          {all.length > 0 && <div className="h-8 px-3 rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200 inline-flex items-center gap-1.5"><dt className="text-slate-500">Range</dt><dd className="font-semibold tabular-nums text-slate-900">{fmt(Math.min(...all))}–{fmt(Math.max(...all))}</dd></div>}
        </dl>
        {sorted.length > 1 && (
          <div className="basis-full relative flex flex-wrap gap-1 p-1 rounded-xl bg-slate-100/80" role="group" aria-label="Rate period">
            <SlidingPill active={plan.id} className="rounded-lg bg-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_4px_10px_-6px_rgba(15,23,42,0.25)]" />
            {sorted.map(p => { const st = state(p); return (
              <button key={p.id} type="button" data-pill={p.id} onClick={() => setPick(p.id)} aria-pressed={p.id === plan.id}
                className={`relative z-[1] h-9 px-3 rounded-lg inline-flex items-center gap-2 text-[12.5px] whitespace-nowrap transition-colors duration-300 ${p.id === plan.id ? 'text-slate-900 font-semibold' : 'text-slate-500 hover:text-slate-800'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{p.name}
                <span className="text-[11px] font-normal text-slate-400 tabular-nums">{short(p.startDate)} – {short(p.endDate)}</span>
              </button>
            ); })}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px] border-collapse">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-[0.06em] text-slate-500 bg-slate-50/80">
              <th className="text-left font-semibold px-4 sm:px-5 py-2.5 w-[38%]">Car group</th>
              {bands.map((b, i) => <th key={i} className="text-right font-semibold px-3 py-2.5 whitespace-nowrap">{bandLabel(b)}</th>)}
              {week >= 0 && <th className="text-right font-semibold px-3 py-2.5 whitespace-nowrap">7 days</th>}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody key={plan.id}>
            {codes.map((code, i) => {
              const row = m[code] || bands.map(() => null);
              const vals = row.filter((v): v is number => v != null);
              const low = vals.length ? Math.min(...vals) : null;
              const info = groups.get(code);
              return (
                <tr key={code} onClick={() => onOpen(plan.id)} className="ota-row group border-t border-slate-100 cursor-pointer hover:bg-indigo-50/40 transition-colors" style={{ animationDelay: `${80 + i * 45}ms` }}>
                  <td className="px-4 sm:px-5 py-2.5"><CarGroupLabel code={code} info={info} /></td>
                  {row.map((v, k) => (
                    <td key={k} className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {v == null ? <span className="text-[11.5px] text-amber-600">Not sold</span>
                        : <span className={`inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md ${v === low && vals.length > 1 ? 'bg-indigo-50 text-indigo-700 font-semibold ring-1 ring-inset ring-indigo-100' : 'text-slate-800'}`}>{fmt(v)}</span>}
                    </td>
                  ))}
                  {week >= 0 && <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap">{row[week] != null ? `${fmt((row[week] as number) * 7)}` : <span className="text-slate-300">—</span>}</td>}
                  <td className="pr-4 text-right"><ChevronRight /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 sm:px-5 py-2 text-[11px] text-slate-400 border-t border-slate-100">Prices per day in {currency}. <span className="inline-block px-1.5 rounded bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100">Marked</span> = the cheapest daily price of that car group.</p>
    </section>
  );
};

const ChevronRight: React.FC = () => (
  <svg viewBox="0 0 20 20" className="inline w-4 h-4 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" aria-hidden><path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
