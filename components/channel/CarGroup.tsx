import React, { useState } from 'react';
import { Aggregator, Fleet } from '../../types';
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
    const c = (v.sippCode || '').toUpperCase();
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
      <CarThumb code={code} image={info?.image} alt={info?.model} className={size === 'md' ? 'w-20 h-12' : 'w-14 h-9'} />
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
 * The fleet's car groups as cards on a broker's Rates page: picture, SIPP code, model, the code in words and
 * the price this broker gets today (from the period that applies today, or the next one), with the price of
 * each rental length as bars; the cheapest length is highlighted. A click opens that period's prices.
 */
export const CarRateCards: React.FC<{
  groups: Map<string, CarGroupInfo>;
  plans: import('../../types').RatePlan[];
  currency: string;
  today: string;
  onOpen: (planId: string) => void;
}> = ({ groups, plans, currency, today, onOpen }) => {
  const sorted = [...plans].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const plan = sorted.find(p => p.startDate <= today && today <= p.endDate) || sorted.find(p => p.startDate > today) || sorted[sorted.length - 1];
  const codes = [...new Set([...groups.keys(), ...(plan?.sippRates || []).map(r => (r.sippCode || "").toUpperCase()).filter(Boolean)])].sort();
  if (!codes.length) return null;
  const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(2));
  return (
    <section aria-label="Car groups and today's prices">
      <div className="px-1 pb-2 flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-[14px] font-semibold text-slate-900">Car groups</h3>
        <p className="text-[12px] text-slate-500">{plan ? <>Daily price in <b className="text-slate-700">{plan.name}</b> ({plan.startDate} → {plan.endDate}). Click a car to change its prices.</> : 'No rate period yet.'}</p>
      </div>
      <div className="grid grid-cols-1 min-[520px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
        {codes.map((code, i) => {
          const info = groups.get(code);
          const rate = (plan?.sippRates || []).find(r => (r.sippCode || "").toUpperCase() === code);
          const tiers = (rate?.tiers || []).filter(t => Number(t.dailyPrice) > 0);
          const prices = tiers.map(t => Number(t.dailyPrice));
          const max = Math.max(1, ...prices), min = prices.length ? Math.min(...prices) : 0;
          return (
            <button key={code} type="button" disabled={!plan} onClick={() => plan && onOpen(plan.id)}
              className="ota-car-card ota-card ota-spot ota-pop group text-left rounded-2xl bg-white border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-20px_rgba(15,23,42,0.3)] overflow-hidden disabled:cursor-default"
              style={{ animationDelay: `${i * 55}ms` }}>
              <div className="relative h-32 bg-gradient-to-b from-slate-50 to-slate-100/60 flex items-center justify-center overflow-hidden">
                <CarThumb code={code} image={info?.image} alt={info?.model} className="w-full h-full !rounded-none !ring-0 !bg-transparent" />
                <span className="absolute left-3 top-3 font-mono text-[11.5px] font-bold text-slate-900 px-2 py-0.5 rounded-md bg-white/90 backdrop-blur ring-1 ring-slate-200 shadow-sm">{code}</span>
                <span className={`absolute right-3 top-3 h-6 px-2 rounded-full text-[10.5px] font-semibold inline-flex items-center gap-1 backdrop-blur ${prices.length ? 'bg-emerald-50/90 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50/90 text-amber-700 ring-1 ring-amber-200'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${prices.length ? 'bg-emerald-500' : 'bg-amber-500'}`} />{prices.length ? 'Priced' : 'No rate'}
                </span>
              </div>
              <div className="px-4 pt-3 pb-4">
                <p className="text-[14px] font-semibold text-slate-900 truncate">{info ? info.model : 'Not in the fleet'}{info && info.models.length > 1 ? <span className="text-slate-400 font-medium"> +{info.models.length - 1} more</span> : null}</p>
                <p className="text-[11.5px] text-slate-500 truncate" title={describeSipp(code)}>{describeSipp(code) || 'Unknown SIPP code'}{info ? ` · ${info.cars} car${info.cars === 1 ? '' : 's'}` : ''}</p>
                {prices.length ? (
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">From</p>
                      <p className="text-[22px] leading-none font-semibold tracking-[-0.02em] tabular-nums text-slate-900">{fmt(min)} <span className="text-[12px] font-medium text-slate-500">{currency}/day</span></p>
                    </div>
                    <div className="flex items-end gap-1 h-12" aria-label="Daily price by rental length">
                      {tiers.map((t, k) => {
                        const v = Number(t.dailyPrice);
                        const label = t.toDay == null ? `${t.fromDay}+ days` : t.fromDay === t.toDay ? `${t.fromDay} day${t.fromDay === 1 ? '' : 's'}` : `${t.fromDay}–${t.toDay} days`;
                        return <span key={k} title={`${label}: ${fmt(v)} ${currency}/day`}
                          className={`ota-rise w-2.5 rounded-t-[4px] ${v === min ? 'bg-indigo-500' : 'bg-slate-200 group-hover:bg-slate-300'} transition-colors`}
                          style={{ height: `${Math.max(14, (v / max) * 100)}%`, animationDelay: `${200 + i * 55 + k * 60}ms` }} />;
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-[12px] text-amber-700">{plan ? 'Not sold in this period: brokers get no price for it.' : 'Add a rate period first.'}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
