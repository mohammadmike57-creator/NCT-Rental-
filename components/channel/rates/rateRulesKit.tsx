import React from 'react';
import { inputCls, selectCls } from '../../ui/Crm';
import { AdjustType, PriceAdjust, SEASON_KINDS, SeasonKind, SeasonRule, applyAdjust } from '../../../services/dynamicPricing';
import { Icons, Icons2, Stepper } from '../pricingKit';

/** Rate rules: tabs, small inputs, explainers and helpers shared by the rate rules panels. */
export type Tab = 'overview' | 'seasons' | 'lead' | 'limits' | 'channels' | 'preview' | 'history';
export const TAB_ICONS: Record<Tab, () => JSX.Element> = {
  overview: Icons2.layers, seasons: Icons2.sun, lead: Icons.bolt, limits: Icons2.shield, channels: Icons2.signal, preview: Icons2.beaker, history: Icons.history,
};
export const TABS: [Tab, string][] = [
  ['overview', 'Overview'], ['seasons', 'Seasons & events'], ['lead', 'Last minute'],
  ['limits', 'Price limits'], ['channels', 'Channels'], ['preview', 'Try a price'], ['history', 'History'],
];
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
export const fieldCls = inputCls.replace('w-full ', '');
export const nowLocal = () => { const d = new Date(); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const addDays = (s: string, n: number) => { const d = new Date(s); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const kindLabel = (k: SeasonKind) => SEASON_KINDS.find(x => x[0] === k)?.[1] || k;
export const EVENT: SeasonKind[] = ['eid_fitr', 'eid_adha', 'ramadan', 'christmas', 'new_year', 'national', 'custom'];
export const kindTone = (k: SeasonKind) => (EVENT.includes(k) ? 'bg-violet-500' : k === 'peak' ? 'bg-rose-500' : k === 'high' ? 'bg-amber-500' : k === 'low' ? 'bg-sky-500' : 'bg-slate-400');
export const money = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDate = (s: string) => new Date(`${s}T12:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export const newRule = (p: Partial<SeasonRule> = {}): SeasonRule => {
  const y = new Date().getFullYear() + 1;
  return { id: uid('sr'), name: '', kind: 'custom', from: `${y}-01-01`, to: `${y}-01-07`, priority: 5, active: true, groups: [], locations: [], channels: [], adjust: { type: 'percent', value: 10 }, blackout: [], ...p };
};

/** Starting points staff can adjust: the dates of Islamic holidays move every year, so they are always reviewed. */
export const PRESETS: { label: string; rule: Partial<SeasonRule> }[] = [
  { label: 'Low season −20%', rule: { name: 'Low season', kind: 'low', from: '2027-01-10', to: '2027-02-07', priority: 9, adjust: { type: 'percent', value: -20 } } },
  { label: 'Normal season 0%', rule: { name: 'Normal season', kind: 'normal', from: '2027-04-01', to: '2027-06-30', priority: 10, adjust: { type: 'percent', value: 0 } } },
  { label: 'Shoulder +15%', rule: { name: 'Shoulder season', kind: 'shoulder', from: '2027-09-01', to: '2027-10-31', priority: 8, adjust: { type: 'percent', value: 15 } } },
  { label: 'High season +40%', rule: { name: 'High season', kind: 'high', from: '2027-07-01', to: '2027-08-31', priority: 5, adjust: { type: 'percent', value: 40 } } },
  { label: 'Eid Al-Fitr +50%', rule: { name: 'Eid Al-Fitr 2027', kind: 'eid_fitr', from: '2027-03-09', to: '2027-03-12', priority: 1, adjust: { type: 'percent', value: 50 } } },
  { label: 'Eid Al-Adha +50%', rule: { name: 'Eid Al-Adha 2027', kind: 'eid_adha', from: '2027-05-15', to: '2027-05-19', priority: 1, adjust: { type: 'percent', value: 50 } } },
  { label: 'Ramadan', rule: { name: 'Ramadan 2027', kind: 'ramadan', from: '2027-02-08', to: '2027-03-08', priority: 3, adjust: { type: 'percent', value: -10 } } },
  { label: 'Christmas / New Year +35%', rule: { name: 'Christmas & New Year', kind: 'christmas', from: '2027-12-20', to: '2028-01-03', priority: 2, adjust: { type: 'percent', value: 35 } } },
  { label: 'Custom event +25%', rule: { name: '', kind: 'custom', priority: 2, adjust: { type: 'percent', value: 25 } } },
];

// ---------------------------------------------------------------- small inputs

export const AdjustInput: React.FC<{ value: PriceAdjust; onChange: (a: PriceAdjust) => void; allowNone?: boolean; label?: string }> = ({ value, onChange, allowNone = true, label = 'Adjustment' }) => (
  <span className="inline-flex items-center gap-1.5">
    <select value={value.type} onChange={e => onChange({ type: e.target.value as AdjustType, value: e.target.value === 'none' ? 0 : value.value })}
      className={`${selectCls} h-8 text-[12px]`} aria-label={`${label} type`}>
      {allowNone && <option value="none">No change</option>}
      <option value="percent">± percent</option>
      <option value="amount">± amount a day</option>
      <option value="fixed">Fixed daily rate</option>
    </select>
    {value.type !== 'none' && (
      <span className="relative">
        <input type="number" step={value.type === 'percent' ? 1 : 0.5} value={Number.isFinite(value.value) ? value.value : ''} aria-label={`${label} value`}
          onChange={e => onChange({ ...value, value: e.target.value === '' ? 0 : Number(e.target.value) })} className={`${fieldCls} h-8 w-24 pr-6 tabular-nums text-[12px]`} />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">{value.type === 'percent' ? '%' : ''}</span>
      </span>
    )}
  </span>
);

export const Chips: React.FC<{ options: [string, string][]; value: string[]; onChange: (v: string[]) => void; allLabel: string }> = ({ options, value, onChange, allLabel }) => (
  <div className="flex flex-wrap gap-1.5">
    <button type="button" onClick={() => onChange([])}
      className={`h-7 px-2.5 rounded-md text-[12px] font-medium border ${value.length === 0 ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>{allLabel}</button>
    {options.map(([k, l]) => {
      const on = value.includes(k);
      return (
        <button key={k} type="button" onClick={() => onChange(on ? value.filter(x => x !== k) : [...value, k])} aria-pressed={on}
          className={`h-7 px-2.5 rounded-md text-[12px] font-medium border ${on ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>{l}</button>
      );
    })}
  </div>
);

export const Switch: React.FC<{ on: boolean; onChange: (b: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
);

export const NumOpt: React.FC<{ value?: number | null; onChange: (n?: number) => void; placeholder?: string; label: string; w?: string }> = ({ value, onChange, placeholder, label, w = 'w-20' }) => (
  <input type="number" value={value ?? ''} placeholder={placeholder} aria-label={label} onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    className={`${fieldCls} h-8 ${w} tabular-nums text-[12px]`} />
);

// ---------------------------------------------------------------- explainers and examples

export const r2 = (n: number) => Math.round(n * 100) / 100;
/** One rate after one change, for the examples. */
export const exRate = (base: number, a: PriceAdjust) => Math.max(0, r2(applyAdjust(base, a)));

/** "How it works" box: plain words on the left, a worked example on the right. Can be folded away. */
export const Explainer: React.FC<{ title: string; children: React.ReactNode; example?: React.ReactNode; exampleTitle?: string }> = ({ title, children, example, exampleTitle = 'Example' }) => (
  <details open className="group rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-clip">
    <summary className="flex items-center gap-3 px-5 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden hover:bg-slate-50/60">
      <span className="grid place-items-center w-7 h-7 rounded-lg bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100 [&>svg]:w-4 [&>svg]:h-4"><Icons2.info /></span>
      <span className="flex-1 min-w-0"><span className="block text-[10.5px] font-semibold uppercase tracking-wider text-sky-700">How it works</span>
        <span className="block text-[13.5px] font-semibold text-slate-900 truncate">{title}</span></span>
      <span className="text-[12px] font-medium text-slate-500 group-open:hidden">Show</span>
      <span className="text-[12px] font-medium text-slate-500 hidden group-open:inline">Hide</span>
    </summary>
    <div className="flex flex-col lg:flex-row gap-5 px-5 pb-5 pt-1 border-t border-slate-100">
      <div className="flex-1 min-w-0 pt-3 text-[13px] leading-relaxed text-slate-600 space-y-1.5">{children}</div>
      {example && (
        <div className="lg:w-[420px] shrink-0 mt-3 rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200 p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-2.5">{exampleTitle}</p>
          {example}
        </div>
      )}
    </div>
  </details>
);

/** A price built step by step: 30 → 45 → 54. */
export const Chain: React.FC<{ steps: { label: string; value: number | null; note?: string; tone?: 'base' | 'season' | 'lead' | 'avail' | 'limit' | 'final' }[] }> = ({ steps }) => {
  const bar = { base: 'before:bg-slate-400', season: 'before:bg-violet-500', lead: 'before:bg-sky-500', avail: 'before:bg-amber-500', limit: 'before:bg-slate-400', final: '' };
  return (
    <div className="flex flex-wrap items-stretch gap-1.5">
      {steps.map((st, i) => {
        const final = st.tone === 'final';
        return (
          <React.Fragment key={i}>
            {i > 0 && <span className="self-center text-slate-300 [&>svg]:w-3.5 [&>svg]:h-3.5"><Icons2.arrowRight /></span>}
            <div className={`relative overflow-hidden rounded-lg px-3 py-2 min-w-[84px] ${final ? 'bg-slate-900 text-white' : `bg-white ring-1 ring-inset ring-slate-200 before:absolute before:inset-x-0 before:top-0 before:h-0.5 ${bar[st.tone || 'base']}`}`}>
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${final ? 'text-slate-300' : 'text-slate-500'}`}>{st.label}</p>
              <p className="text-[15px] font-bold tabular-nums leading-tight">{st.value == null ? '—' : money(st.value)}</p>
              {st.note && <p className={`text-[10.5px] whitespace-nowrap ${final ? 'text-slate-300' : 'text-slate-500'}`}>{st.note}</p>}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const BaseInput: React.FC<{ value: number; onChange: (n: number) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-2.5 pt-1">
    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Example base rate</span>
    <Stepper size="sm" label="Example base rate" unit="/day" min={1} max={100000} step={1} signedTone={false} width="w-12" value={value} onChange={v => onChange(Math.max(1, v || 1))} />
  </div>
);

/** Twelve example days, with the days a rule covers highlighted. */
export const DayStrip: React.FC<{ days: { label: string; rate: number; hit: boolean }[] }> = ({ days }) => (
  <div className="grid grid-cols-6 gap-1">
    {days.map((d, i) => (
      <div key={i} className={`rounded-md px-1 py-1.5 text-center ring-1 ring-inset ${d.hit ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-600 ring-slate-200'}`}>
        <p className="text-[9px] opacity-80">{d.label}</p>
        <p className="text-[11.5px] font-semibold tabular-nums">{d.rate % 1 ? d.rate.toFixed(2) : d.rate}</p>
      </div>
    ))}
  </div>
);
