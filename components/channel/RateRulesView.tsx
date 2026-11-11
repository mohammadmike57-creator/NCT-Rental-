import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Aggregator, Fleet, RatePlan } from '../../types';
import { Badge, Button, EmptyState, Dialog, Field, inputCls, selectCls, textareaCls } from '../ui/Crm';
import { saveAllData, loadedSection } from '../../firebase/api';
import {
  AdjustType, ChannelRateMode, LengthBand, lengthLabel, DynamicPricingConfig, DynamicPricingState,
  LeadTier, PRICE_CHANNELS, PriceAdjust, PriceChannelType, PriceResult, SEASON_KINDS, SeasonKind, SeasonRule,
  applyAdjust, describeAdjust, emptyPricingState, priceRental, rentalDayCount, summarise,
} from '../../services/dynamicPricing';
import { BuildStep, BuildUp, Card, Delta, FieldLabel, Icons, Icons2, Popover, SectionHead, Seg, StateChip, Stepper, Toggle, signed, toneOf, toneText } from './pricingKit';
import { findPlanForDate, findTier, fleetSippCodes, tierLabel, vehiclesForSipp } from '../../services/channelManager';

/**
 * OTA XML → Rate rules: seasonal / event rates and last-minute pricing for the XML channels (prices never depend on cars left),
 * edited as a draft, tested in the preview and published. Only channels switched to "Dynamic" or
 * "Restricted" (Channels tab) are priced with the published rules; every other channel keeps its net rates.
 */

type Tab = 'overview' | 'seasons' | 'lead' | 'limits' | 'channels' | 'preview' | 'history';
const TAB_ICONS: Record<Tab, () => JSX.Element> = {
  overview: Icons2.layers, seasons: Icons2.sun, lead: Icons.bolt, limits: Icons2.shield, channels: Icons2.signal, preview: Icons2.beaker, history: Icons.history,
};
const TABS: [Tab, string][] = [
  ['overview', 'Overview'], ['seasons', 'Seasons & events'], ['lead', 'Last minute'],
  ['limits', 'Price limits'], ['channels', 'Channels'], ['preview', 'Try a price'], ['history', 'History'],
];
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const fieldCls = inputCls.replace('w-full ', '');
const nowLocal = () => { const d = new Date(); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const addDays = (s: string, n: number) => { const d = new Date(s); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const kindLabel = (k: SeasonKind) => SEASON_KINDS.find(x => x[0] === k)?.[1] || k;
const EVENT: SeasonKind[] = ['eid_fitr', 'eid_adha', 'ramadan', 'christmas', 'new_year', 'national', 'custom'];
const kindTone = (k: SeasonKind) => (EVENT.includes(k) ? 'bg-violet-500' : k === 'peak' ? 'bg-rose-500' : k === 'high' ? 'bg-amber-500' : k === 'low' ? 'bg-sky-500' : 'bg-slate-400');
const money = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string) => new Date(`${s}T12:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const newRule = (p: Partial<SeasonRule> = {}): SeasonRule => {
  const y = new Date().getFullYear() + 1;
  return { id: uid('sr'), name: '', kind: 'custom', from: `${y}-01-01`, to: `${y}-01-07`, priority: 5, active: true, groups: [], locations: [], channels: [], adjust: { type: 'percent', value: 10 }, blackout: [], ...p };
};

/** Starting points staff can adjust: the dates of Islamic holidays move every year, so they are always reviewed. */
const PRESETS: { label: string; rule: Partial<SeasonRule> }[] = [
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

const AdjustInput: React.FC<{ value: PriceAdjust; onChange: (a: PriceAdjust) => void; allowNone?: boolean; label?: string }> = ({ value, onChange, allowNone = true, label = 'Adjustment' }) => (
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

const Chips: React.FC<{ options: [string, string][]; value: string[]; onChange: (v: string[]) => void; allLabel: string }> = ({ options, value, onChange, allLabel }) => (
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

const Switch: React.FC<{ on: boolean; onChange: (b: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
);

const NumOpt: React.FC<{ value?: number | null; onChange: (n?: number) => void; placeholder?: string; label: string; w?: string }> = ({ value, onChange, placeholder, label, w = 'w-20' }) => (
  <input type="number" value={value ?? ''} placeholder={placeholder} aria-label={label} onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    className={`${fieldCls} h-8 ${w} tabular-nums text-[12px]`} />
);

// ---------------------------------------------------------------- explainers and examples

const r2 = (n: number) => Math.round(n * 100) / 100;
/** One rate after one change, for the examples. */
const exRate = (base: number, a: PriceAdjust) => Math.max(0, r2(applyAdjust(base, a)));

/** "How it works" box: plain words on the left, a worked example on the right. Can be folded away. */
const Explainer: React.FC<{ title: string; children: React.ReactNode; example?: React.ReactNode; exampleTitle?: string }> = ({ title, children, example, exampleTitle = 'Example' }) => (
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
const Chain: React.FC<{ steps: { label: string; value: number | null; note?: string; tone?: 'base' | 'season' | 'lead' | 'avail' | 'limit' | 'final' }[] }> = ({ steps }) => {
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

const BaseInput: React.FC<{ value: number; onChange: (n: number) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-2.5 pt-1">
    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Example base rate</span>
    <Stepper size="sm" label="Example base rate" unit="/day" min={1} max={100000} step={1} signedTone={false} width="w-12" value={value} onChange={v => onChange(Math.max(1, v || 1))} />
  </div>
);

/** Twelve example days, with the days a rule covers highlighted. */
const DayStrip: React.FC<{ days: { label: string; rate: number; hit: boolean }[] }> = ({ days }) => (
  <div className="grid grid-cols-6 gap-1">
    {days.map((d, i) => (
      <div key={i} className={`rounded-md px-1 py-1.5 text-center ring-1 ring-inset ${d.hit ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-600 ring-slate-200'}`}>
        <p className="text-[9px] opacity-80">{d.label}</p>
        <p className="text-[11.5px] font-semibold tabular-nums">{d.rate % 1 ? d.rate.toFixed(2) : d.rate}</p>
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------- the view

const RateRulesView: React.FC<{
  aggregators: Aggregator[];
  fleet: Fleet;
  currentUserName?: string;
  onUpdateAggregator: (a: Aggregator) => void;
  showConfirmation: (m: string) => void;
}> = ({ aggregators, fleet, currentUserName, onUpdateAggregator, showConfirmation }) => {
  const [state, setState] = useState<DynamicPricingState>(() => loadedSection<DynamicPricingState>('channelPricing') || emptyPricingState());
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState<SeasonRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [base, setBase] = useState(30);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const closePresets = useCallback(() => setPresetsOpen(false), []);
  const cfg = state.draft;
  const user = currentUserName || 'Staff';

  const groups = useMemo(() => {
    const set = new Set(fleetSippCodes(fleet));
    aggregators.forEach(a => (a.ratePlanHistory?.[0]?.ratePlans || a.currentRatePlans || []).forEach(p => p.sippRates.forEach(r => r.sippCode && set.add(r.sippCode.toUpperCase()))));
    return Array.from(set).sort();
  }, [fleet, aggregators]);
  /** Rental-length bands of the published rates (1–2, 3–6, 7+ days…), offered as last-minute columns. */
  const rateBands = useMemo(() => {
    const seen = new Map<string, LengthBand>();
    aggregators.forEach(a => (a.ratePlanHistory?.[0]?.ratePlans || []).forEach(p => p.sippRates.slice(0, 1).forEach(r => r.tiers.forEach(t => {
      if (t.fromDay == null) return;
      const to = t.toDay == null || !Number.isFinite(Number(t.toDay)) ? null : Number(t.toDay);
      seen.set(`${t.fromDay}-${to}`, { fromDay: Number(t.fromDay), toDay: to });
    }))));
    return Array.from(seen.values()).sort((x, y) => x.fromDay - y.fromDay);
  }, [aggregators]);
  const locations = useMemo(() => Array.from(new Set(aggregators.flatMap(a => (a.bookingRules?.locations || []).map(l => (l.code || '').toUpperCase())).filter(Boolean))).sort(), [aggregators]);
  const unpublished = JSON.stringify(state.draft) !== JSON.stringify(state.published ?? null);
  const dynamicChannels = aggregators.filter(a => (a.pricingMode || 'net') !== 'net');

  /** Saves the draft with a history line (who, when, what, old → new). */
  const commit = useCallback(async (next: DynamicPricingState, action: string, detail: string, before?: string, after?: string) => {
    const entry = { at: new Date().toISOString(), by: user, action, detail, ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}) };
    const withLog = { ...next, history: [entry, ...(next.history || [])].slice(0, 500) };
    setState(withLog);
    setSaving(true);
    try { await saveAllData({ channelPricing: withLog } as never); }
    catch { showConfirmation('Saved in this browser; the server could not be reached yet. It will be sent with the next change.'); }
    finally { setSaving(false); }
  }, [user, showConfirmation]);
  const setDraft = (draft: DynamicPricingConfig, action: string, detail: string, before?: string, after?: string) => commit({ ...state, draft }, action, detail, before, after);

  const publish = async () => {
    const version = (state.version || 0) + 1;
    await commit({ ...state, published: clone(state.draft), version, publishedAt: new Date().toISOString(), publishedBy: user },
      'Published', `Version ${version} published: ${cfg.seasonal.rules.length} seasonal rule(s), ${cfg.leadTime.tiers.length} last-minute tier(s)`);
    showConfirmation(`Rate rules version ${version} published. ${dynamicChannels.length ? `${dynamicChannels.length} channel(s) now price with them.` : 'No channel uses them yet: switch a channel to Dynamic in the Channels tab.'}`);
  };
  const discard = () => {
    if (!state.published || !window.confirm('Discard every change since the last publish?')) return;
    void commit({ ...state, draft: clone(state.published) }, 'Draft discarded', `Back to version ${state.version}`);
  };

  const ruleText = (r: SeasonRule) => `${r.name} · ${r.from} → ${r.to} · ${describeAdjust(r.adjust)} · priority ${r.priority}${r.active ? '' : ' · paused'}`;
  const saveRule = (r: SeasonRule) => {
    const old = cfg.seasonal.rules.find(x => x.id === r.id);
    const rules = old ? cfg.seasonal.rules.map(x => (x.id === r.id ? r : x)) : [...cfg.seasonal.rules, r];
    void setDraft({ ...cfg, seasonal: { ...cfg.seasonal, rules } }, old ? 'Rule changed' : 'Rule added', r.name, old ? ruleText(old) : undefined, ruleText(r));
    setEditing(null);
  };
  const ruleAction = (r: SeasonRule, act: 'duplicate' | 'toggle' | 'delete' | 'up' | 'down') => {
    let rules = [...cfg.seasonal.rules];
    if (act === 'duplicate') rules.push({ ...clone(r), id: uid('sr'), name: `${r.name} (copy)`, active: false });
    if (act === 'toggle') rules = rules.map(x => (x.id === r.id ? { ...x, active: !x.active } : x));
    if (act === 'delete') { if (!window.confirm(`Delete the rule "${r.name}"?`)) return; rules = rules.filter(x => x.id !== r.id); }
    if (act === 'up' || act === 'down') rules = rules.map(x => (x.id === r.id ? { ...x, priority: Math.max(1, x.priority + (act === 'up' ? -1 : 1)) } : x));
    const label = { duplicate: 'Rule duplicated', toggle: r.active ? 'Rule paused' : 'Rule resumed', delete: 'Rule deleted', up: 'Priority raised', down: 'Priority lowered' }[act];
    const after = rules.find(x => x.id === r.id);
    void setDraft({ ...cfg, seasonal: { ...cfg.seasonal, rules } }, label, r.name, ruleText(r), after ? ruleText(after) : undefined);
  };

  // ---------------------------------------------------------------- render

  return (
    <div className="space-y-5">
      {/* Workspace header: what is live, the draft, publish, and the sections */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-clip">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <span className="grid place-items-center w-11 h-11 rounded-xl bg-slate-900 text-white [&>svg]:w-5 [&>svg]:h-5"><Icons2.dollar /></span>
          <div className="min-w-[240px] flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-600">OTA XML · Pricing engine</p>
            <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-slate-900">Rate rules</h2>
            <p className="text-[12.5px] text-slate-500">Seasons, events, last minute and price limits on top of your published rates. Every change is a draft until you publish.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {saving ? <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-slate-50 ring-1 ring-inset ring-slate-200 text-[12px] font-semibold text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />Saving…</span>
              : unpublished ? <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-amber-50 ring-1 ring-inset ring-amber-200 text-[12px] font-semibold text-amber-800"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Draft has changes</span>
              : <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-emerald-50 ring-1 ring-inset ring-emerald-200 text-[12px] font-semibold text-emerald-800"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Draft = live</span>}
            {unpublished && state.published && <Button size="sm" variant="ghost" onClick={discard}>Discard draft</Button>}
            <Button size="sm" variant="primary" disabled={!unpublished || saving} onClick={() => void publish()}>Publish{state.version ? ` v${state.version + 1}` : ''}</Button>
          </div>
        </div>
        <dl className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-100 divide-x divide-slate-100 bg-slate-50/50">
          {([
            ['Live version', state.version ? `v${state.version}` : 'Not published', state.publishedAt ? new Date(state.publishedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Brokers get your fixed rates', !!state.version],
            ['Published by', state.publishedBy || '—', state.publishedBy ? 'Last publish' : 'Nobody yet', !!state.publishedBy],
            ['Channels using it', `${dynamicChannels.length} of ${aggregators.length}`, dynamicChannels.length ? 'Smart pricing or seasons only' : 'All on fixed rates', dynamicChannels.length > 0],
            ['Rules in the draft', `${cfg.seasonal.rules.filter(r => r.active).length + (cfg.leadTime.enabled ? cfg.leadTime.tiers.length : 0)}`, `${cfg.seasonal.rules.filter(r => r.active).length} season${cfg.seasonal.rules.filter(r => r.active).length === 1 ? '' : 's'} · last minute ${cfg.leadTime.enabled ? 'on' : 'off'}`, true],
          ] as [string, string, string, boolean][]).map(([k, v, sub, on]) => (
            <div key={k} className="px-5 py-3 min-w-0">
              <dt className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400"><span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-indigo-500' : 'bg-slate-300'}`} />{k}</dt>
              <dd className="mt-0.5 text-[17px] font-semibold tabular-nums text-slate-900 leading-6 truncate">{v}</dd>
              <dd className="text-[11.5px] text-slate-500 truncate">{sub}</dd>
            </div>
          ))}
        </dl>
        <nav className="flex flex-wrap md:flex-nowrap gap-1 md:overflow-x-auto no-scrollbar px-3 py-2 border-t border-slate-100" aria-label="Rate rules sections">
          {TABS.map(([k, l]) => {
            const Icon = TAB_ICONS[k];
            const count = k === 'seasons' ? cfg.seasonal.rules.length : k === 'lead' ? cfg.leadTime.tiers.length : k === 'history' ? (state.history || []).length : 0;
            return (
              <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}
                className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors [&>svg]:w-4 [&>svg]:h-4 ${tab === k ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                <Icon />{l}
                {count > 0 && <span className={`px-1.5 rounded-md text-[10.5px] font-semibold tabular-nums ${tab === k ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>{count}</span>}
              </button>
            );
          })}
        </nav>
      </section>

      {tab === 'overview' && (
        <Overview cfg={cfg} base={base} setBase={setBase} published={!!state.published} aggregators={aggregators} onToggle={(k, on) => {
          const next = clone(cfg);
          if (k === 'stack') next.seasonal.stack = on; else next[k].enabled = on;
          const names = { seasonal: 'Seasonal & event rates', leadTime: 'Last-minute pricing', stack: 'Stack seasonal rules' } as const;
          void setDraft(next, on ? 'Switched on' : 'Switched off', names[k], on ? 'off' : 'on', on ? 'on' : 'off');
        }} onGo={setTab} />
      )}

      {tab === 'seasons' && (<div className="space-y-5">
        <SectionHead icon={<Icons2.sun />} eyebrow="Rate rules" title="Seasons & events"
          description="A different price on special dates: low, high and peak seasons, Eid, Ramadan, Christmas, New Year or your own events. Priority 1 wins when two rules cover the same day."
          actions={<>
            <span className="relative">
              <Button size="sm" onClick={() => setPresetsOpen(o => !o)}>Start from a template</Button>
              {presetsOpen && (
                <Popover onClose={closePresets} className="w-[260px] p-1.5">
                  <p className="px-2.5 pt-1.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Templates</p>
                  {PRESETS.map(p => (
                    <button key={p.label} type="button" onClick={() => { setPresetsOpen(false); setEditing(newRule(clone(p.rule))); }}
                      className="w-full flex items-center justify-between gap-3 px-2.5 h-9 rounded-lg text-[13px] text-slate-700 hover:bg-slate-50">
                      <span className="flex items-center gap-2"><span className={`w-2 h-2 rounded-sm ${kindTone((p.rule.kind || 'custom') as SeasonKind)}`} />{p.label}</span>
                    </button>
                  ))}
                </Popover>
              )}
            </span>
            <Button size="sm" variant="primary" icon={<span className="[&>svg]:w-3.5 [&>svg]:h-3.5"><Icons.plus /></span>} onClick={() => setEditing(newRule({ priority: (Math.max(0, ...cfg.seasonal.rules.map(r => r.priority)) || 4) + 1 }))}>Add rule</Button>
          </>}>
          <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-100 divide-x divide-slate-100 bg-slate-50/50">
            {([
              ['Status', cfg.seasonal.enabled ? 'On' : 'Off', cfg.seasonal.enabled ? 'Used for Smart pricing and Seasons only' : 'Switch on in Overview', cfg.seasonal.enabled],
              ['Active rules', `${cfg.seasonal.rules.filter(r => r.active).length} of ${cfg.seasonal.rules.length}`, `${cfg.seasonal.rules.filter(r => !r.active).length} paused`, cfg.seasonal.rules.some(r => r.active)],
              ['Next', (() => { const today = new Date().toISOString().slice(0, 10); const n = [...cfg.seasonal.rules].filter(r => r.active && r.to >= today).sort((a, b) => a.from.localeCompare(b.from))[0]; return n ? n.name : 'None'; })(),
                (() => { const today = new Date().toISOString().slice(0, 10); const n = [...cfg.seasonal.rules].filter(r => r.active && r.to >= today).sort((a, b) => a.from.localeCompare(b.from))[0]; return n ? `${n.from <= today ? 'Running now' : `From ${fmtDate(n.from)}`} · ${describeAdjust(n.adjust)}` : 'No upcoming dates'; })(), true],
              ['Overlaps', cfg.seasonal.stack ? 'Stacked' : 'Priority wins', cfg.seasonal.stack ? 'Every matching rule is applied' : 'Only the top rule counts on a day', true],
            ] as [string, string, string, boolean][]).map(([k, v, sub, on]) => (
              <div key={k} className="px-5 py-3 min-w-0">
                <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400"><span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-indigo-500' : 'bg-slate-300'}`} />{k}</p>
                <p className="mt-0.5 text-[16px] font-semibold text-slate-900 leading-6 truncate">{v}</p>
                <p className="text-[11.5px] text-slate-500 truncate">{sub}</p>
              </div>
            ))}
          </div>
        </SectionHead>

        {cfg.seasonal.rules.length === 0 ? (
          <Card><EmptyState title="No seasonal rules yet" hint="Add Eid, high season or any event with its dates; the rate applies only on those days." action={<Button variant="primary" size="sm" onClick={() => setEditing(newRule(clone(PRESETS[0].rule)))}>Add your first rule</Button>} /></Card>
        ) : (<>
          <Card title="Calendar" subtitle="Your rules on a timeline, highest priority on top. Paused rules are faded.">
            <SeasonTimeline rules={cfg.seasonal.rules} />
          </Card>
          <Card title="Rules" subtitle={`Prices shown on a base rate of ${money(base)} a day.`}
            actions={<div className="flex items-center gap-2.5"><span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Base</span>
              <Stepper size="sm" label="Example base rate" unit="/day" min={1} max={100000} step={1} signedTone={false} width="w-12" value={base} onChange={v => setBase(Math.max(1, v || 1))} /></div>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-[13px]">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                    {['Priority', 'Rule', 'Dates', 'Applies to', 'Change', 'Daily price', 'Rental length', 'Active', ''].map((h, i) => <th key={i} className={`px-3 py-2.5 first:pl-5 last:pr-5 whitespace-nowrap ${h === 'Daily price' ? 'text-right' : ''}`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...cfg.seasonal.rules].sort((a, b) => a.priority - b.priority).map(r => {
                    const len = Math.round((new Date(`${r.to}T12:00`).getTime() - new Date(`${r.from}T12:00`).getTime()) / 86400000) + 1;
                    const price = exRate(base, r.adjust), d = r2(price - base);
                    return (
                      <tr key={r.id} className={`group hover:bg-slate-50/60 ${r.active ? '' : 'opacity-55'}`}>
                        <td className="px-3 py-3 pl-5">
                          <span className="inline-flex items-center rounded-lg ring-1 ring-inset ring-slate-200 bg-white overflow-hidden">
                            <span className="w-8 text-center text-[13px] font-bold tabular-nums text-slate-900">{r.priority}</span>
                            <span className="flex flex-col border-l border-slate-200">
                              <button type="button" className="px-1.5 h-4 text-[9px] text-slate-400 hover:text-slate-800 hover:bg-slate-50" onClick={() => ruleAction(r, 'up')} aria-label={`Raise priority of ${r.name}`}>▲</button>
                              <button type="button" className="px-1.5 h-4 text-[9px] text-slate-400 hover:text-slate-800 hover:bg-slate-50 border-t border-slate-200" onClick={() => ruleAction(r, 'down')} aria-label={`Lower priority of ${r.name}`}>▼</button>
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-slate-900 flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-sm ${kindTone(r.kind)}`} />{r.name || '(no name)'}</p>
                          <p className="text-[11.5px] text-slate-500 pl-[18px]">{kindLabel(r.kind)}{r.notes ? ` · ${r.notes}` : ''}</p>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <p className="tabular-nums text-slate-800">{fmtDate(r.from)} <span className="text-slate-300">→</span> {fmtDate(r.to)}</p>
                          <p className="text-[11.5px] text-slate-500">{len} day{len === 1 ? '' : 's'}{r.blackout.length ? ` · ${r.blackout.length} blackout` : ''}</p>
                        </td>
                        <td className="px-3 py-3 text-[12px]">
                          <p className="text-slate-700">{r.groups.length ? r.groups.join(', ') : 'All car groups'}</p>
                          <p className="text-slate-400">{r.locations.length ? r.locations.join(', ') : 'All locations'} · {r.channels.length ? r.channels.map(c => PRICE_CHANNELS.find(x => x[0] === c)?.[1]).join(', ') : 'All channels'}</p>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">{r.adjust.type === 'percent' ? <Delta value={r.adjust.value} size="md" /> : <span className={`inline-flex items-center px-2 py-0.5 rounded-md ring-1 ring-inset text-[12px] font-semibold ${toneOf(d) === 'up' ? 'bg-amber-50 text-amber-800 ring-amber-200' : toneOf(d) === 'down' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-slate-50 text-slate-500 ring-slate-200'}`}>{describeAdjust(r.adjust)}</span>}</td>
                        <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums"><span className="text-[11.5px] text-slate-400">{money(base)} → </span><b className="text-[14px] text-slate-900">{money(price)}</b>
                          {d !== 0 && <p className={`text-[11px] font-semibold ${toneText[toneOf(d)]}`}>{d > 0 ? '+' : '−'}{money(Math.abs(d))}</p>}</td>
                        <td className="px-3 py-3 text-[12px] text-slate-600 whitespace-nowrap">{r.minDays || r.maxDays ? `${r.minDays || 1}–${r.maxDays || '∞'} days` : 'Any length'}</td>
                        <td className="px-3 py-3"><Toggle on={r.active} onChange={() => ruleAction(r, 'toggle')} label={`${r.name} active`} /></td>
                        <td className="px-3 py-3 pr-5 whitespace-nowrap text-right">
                          <span className="inline-flex items-center gap-1">
                            <Button size="sm" onClick={() => setEditing(clone(r))}>Edit</Button>
                            <button type="button" title="Duplicate" aria-label={`Duplicate ${r.name}`} onClick={() => ruleAction(r, 'duplicate')} className="grid place-items-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 [&>svg]:w-4 [&>svg]:h-4"><Icons2.copy /></button>
                            <button type="button" title="Delete" aria-label={`Delete ${r.name}`} onClick={() => ruleAction(r, 'delete')} className="grid place-items-center w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 [&>svg]:w-4 [&>svg]:h-4"><Icons2.trash /></button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>)}
        <SeasonExplainer rules={cfg.seasonal.rules} base={base} setBase={setBase} />
      </div>)}

      {tab === 'lead' && <LeadTimeEditor base={base} setBase={setBase} cfg={cfg} rateBands={rateBands} onSave={(next, what) => void setDraft(next, 'Last-minute rules changed', what)} />}
      {tab === 'limits' && <LimitsEditor base={base} cfg={cfg} groups={groups} onSave={(next, what, b, a) => void setDraft(next, 'Limits changed', what, b, a)} />}
      {tab === 'channels' && <ChannelsEditor aggregators={aggregators} published={!!state.published} onUpdate={(a, before, after) => {
        onUpdateAggregator(a);
        void commit(state, 'Channel rate mode changed', a.name, before, after);
      }} />}
      {tab === 'preview' && <PreviewPanel state={state} aggregators={aggregators} fleet={fleet} groups={groups} />}
      {tab === 'history' && <HistoryPanel state={state} />}

      {editing && <RuleDialog base={base} rule={editing} groups={groups} locations={locations} onClose={() => setEditing(null)} onSave={saveRule} />}
    </div>
  );
};

// ---------------------------------------------------------------- overview

const Overview: React.FC<{ cfg: DynamicPricingConfig; base: number; setBase: (n: number) => void; published: boolean; aggregators: Aggregator[]; onToggle: (k: 'seasonal' | 'leadTime' | 'stack', on: boolean) => void; onGo: (t: Tab) => void }> = ({ cfg, base, setBase, published, aggregators, onToggle, onGo }) => {
  // One example day: the user's own rules when there are any, otherwise sample rules (clearly marked).
  const rule = [...cfg.seasonal.rules].filter(r => r.active).sort((a, b) => a.priority - b.priority)[0];
  const lead = cfg.leadTime.tiers.find(t => 12 >= t.fromHours && (t.toHours == null || 12 < t.toHours));
  const sample = !rule && !lead;
  const sRule = rule?.adjust || (sample ? { type: 'percent', value: 50 } as PriceAdjust : undefined);
  const sLead = lead?.adjust.type !== 'none' && lead ? lead.adjust : (sample ? { type: 'percent', value: 20 } as PriceAdjust : undefined);
  const a1 = sRule ? exRate(base, sRule) : base;
  const a3 = sLead ? exRate(a1, sLead) : a1;
  const max = cfg.limits.maxDaily, min = cfg.limits.minDaily;
  const a4 = max != null && a3 > max ? max : min != null && a3 < min ? min : a3;
  const steps = [
    { label: 'Base rate', value: base, note: 'from the Rates tab', tone: 'base' as const },
    ...(sRule ? [{ label: rule ? rule.name : 'Eid (example)', value: a1, note: describeAdjust(sRule), tone: 'season' as const }] : []),
    ...(sLead ? [{ label: 'Last minute', value: a3, note: `${describeAdjust(sLead)} · booked 12 h ahead`, tone: 'lead' as const }] : []),
    ...(a4 !== a3 ? [{ label: 'Price limit', value: a4, note: max != null && a3 > max ? `max ${max}` : `min ${min}`, tone: 'limit' as const }] : []),
    { label: 'Daily price', value: a4, tone: 'final' as const },
  ];
  const started = [
    { done: cfg.seasonal.rules.length > 0 || cfg.leadTime.tiers.length > 0, text: 'Add the rules you want (seasons, events, last minute)', tab: 'seasons' as Tab },
    { done: published, text: 'Try a price, then press Publish', tab: 'preview' as Tab },
    { done: aggregators.some(a => (a.pricingMode || 'net') !== 'net'), text: 'Choose which channels use smart pricing', tab: 'channels' as Tab },
  ];
  const rows: { key: 'seasonal' | 'leadTime'; step: number; title: string; text: string; count: string; tab: Tab }[] = [
    { key: 'seasonal', step: 2, title: 'Seasonal & event rates', text: 'Low, high and peak seasons, Eid Al-Fitr, Eid Al-Adha, Ramadan, Christmas, New Year and your own events. The rule of each rental day replaces that day\'s rate.', count: `${cfg.seasonal.rules.filter(r => r.active).length} active of ${cfg.seasonal.rules.length}`, tab: 'seasons' },
    { key: 'leadTime', step: 3, title: 'Last-minute pricing', text: 'Changes the rate by how long before pick-up the customer books.', count: `${cfg.leadTime.tiers.length} tier${cfg.leadTime.tiers.length === 1 ? '' : 's'}`, tab: 'lead' },
  ];
  const modes = { net: 0, dynamic: 0, restricted: 0 };
  aggregators.forEach(a => { modes[a.pricingMode || 'net']++; });
  const doneCount = started.filter(s => s.done).length;
  const build: BuildStep[] = steps.map((st, i) => ({
    label: st.label, detail: st.note, amount: st.value, kind: st.tone === 'final' ? 'final' : i === 0 ? 'base' : 'step',
    delta: i === 0 || st.tone === 'final' ? undefined : r2(st.value - steps[i - 1].value),
  }));
  const pipeline: { n: number; title: string; text: string; chip: React.ReactNode; on: boolean | null; key?: 'seasonal' | 'leadTime'; tab?: Tab }[] = [
    { n: 1, title: 'Base daily rate', text: "The channel's published rate (Rates tab) of each day's period, for the length of the whole rental.", chip: <StateChip on>Always on</StateChip>, on: null },
    ...rows.map(r => ({ n: r.step, title: r.title, text: r.text, chip: <StateChip on={cfg[r.key].enabled}>{r.count}</StateChip>, on: cfg[r.key].enabled, key: r.key, tab: r.tab })),
    { n: 4, title: 'Minimum and maximum daily price', text: cfg.limits.minDaily != null || cfg.limits.maxDaily != null ? `${cfg.limits.minDaily ?? '—'} to ${cfg.limits.maxDaily ?? '—'} a day${Object.keys(cfg.limits.groups || {}).length ? `, ${Object.keys(cfg.limits.groups).length} group limit(s)` : ''}` : 'No limit set. The price can go as high or low as the rules make it.',
      chip: <StateChip on={cfg.limits.minDaily != null || cfg.limits.maxDaily != null}>{cfg.limits.minDaily != null || cfg.limits.maxDaily != null ? 'Set' : 'Not set'}</StateChip>, on: null, tab: 'limits' },
  ];
  const total = Math.max(1, aggregators.length);
  return (
    <div className="space-y-5">
      {/* Getting started */}
      <Card>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <div className="min-w-[180px]">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Set-up</p>
            <p className="text-[15px] font-semibold text-slate-900">{doneCount} of {started.length} done</p>
            <div className="mt-1.5 h-1.5 w-40 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(doneCount / started.length) * 100}%` }} /></div>
          </div>
          <ol className="flex-1 grid gap-2 md:grid-cols-3">
            {started.map((st, i) => (
              <li key={i}>
                <button type="button" onClick={() => onGo(st.tab)} className={`w-full h-full text-left flex items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ring-inset transition-colors ${st.done ? 'bg-emerald-50/60 ring-emerald-200' : 'bg-white ring-slate-200 hover:ring-indigo-300 hover:bg-indigo-50/30'}`}>
                  <span className={`grid place-items-center w-6 h-6 rounded-full text-[11px] font-bold shrink-0 ${st.done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>{st.done ? '✓' : i + 1}</span>
                  <span className={`text-[12.5px] font-medium ${st.done ? 'text-emerald-900' : 'text-slate-700'}`}>{st.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
        {/* The pricing pipeline */}
        <Card title="Pricing pipeline" subtitle="Each rental day passes these steps in order. Each step is optional; changes stay in the draft until you publish."
          footer={<>After these steps the booking engine adds, as before: the broker's own terms (Price rules), promotions, extras, covers, one-way / airport / after-hours / driver fees and tax. When last minute prices a channel, that broker's own early-booking and last-minute percent is not added again.</>}>
          <ol className="relative px-5 py-2">
            {pipeline.map((p, i) => (
              <li key={p.n} className="relative flex gap-4 py-3">
                {i < pipeline.length - 1 && <span className="absolute left-[15px] top-[46px] bottom-[-10px] w-px bg-slate-200" />}
                <span className={`relative z-[1] grid place-items-center w-8 h-8 rounded-full text-[12px] font-bold ring-4 ring-white shrink-0 ${p.on === false ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white'}`}>{p.n}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-[13.5px] font-semibold text-slate-900">{p.title}</p>{p.chip}</div>
                  <p className="mt-0.5 text-[12.5px] leading-5 text-slate-500">{p.text}</p>
                </div>
                <div className="flex items-start gap-3 pt-0.5">
                  {p.tab && <Button size="sm" onClick={() => onGo(p.tab!)}>Edit</Button>}
                  {p.key && <span className="pt-1.5"><Toggle on={cfg[p.key].enabled} onChange={b => onToggle(p.key!, b)} label={p.title} /></span>}
                </div>
              </li>
            ))}
            <li className="relative flex gap-4 py-3 mt-1 rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200 px-3 -mx-3">
              <span className="w-8 shrink-0 grid place-items-center text-slate-400 [&>svg]:w-4 [&>svg]:h-4"><Icons2.layers /></span>
              <div className="flex-1 min-w-0"><p className="text-[13px] font-semibold text-slate-900">Stack seasonal rules</p>
                <p className="mt-0.5 text-[12px] leading-5 text-slate-500">Off (recommended): the highest-priority rule replaces the rate, so Eid inside high season is charged at the Eid rate, never both. On: every matching rule is applied in priority order.</p></div>
              <span className="pt-1"><Toggle on={cfg.seasonal.stack} onChange={b => onToggle('stack', b)} label="Stack seasonal rules" /></span>
            </li>
          </ol>
        </Card>

        <div className="space-y-5">
          <Card title="Example daily price" subtitle={sample ? 'With sample rules: add your own to see them here' : 'With your rules, booked 12 h before pick-up'}>
            <div className="p-2"><BuildUp steps={build} currency="/ day" /></div>
            <div className="px-5 pb-4"><BaseInput value={base} onChange={setBase} /></div>
          </Card>
          <Card title="Channels" subtitle="Only channels on Smart pricing or Seasons only use these rules."
            footer={<Button size="sm" onClick={() => onGo('channels')}>Choose channels</Button>}>
            <div className="px-5 py-4">
              <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
                <div className="bg-slate-400" style={{ width: `${(modes.net / total) * 100}%` }} />
                <div className="bg-indigo-600" style={{ width: `${(modes.dynamic / total) * 100}%` }} />
                <div className="bg-violet-400" style={{ width: `${(modes.restricted / total) * 100}%` }} />
              </div>
              <ul className="mt-3 space-y-2 text-[13px]">
                {([['net', 'Fixed rates (as today)', 'bg-slate-400'], ['dynamic', 'Smart pricing (all rules)', 'bg-indigo-600'], ['restricted', 'Seasons only', 'bg-violet-400']] as const).map(([k, l, c]) => (
                  <li key={k} className="flex items-center gap-2.5"><span className={`w-2.5 h-2.5 rounded-sm ${c}`} /><span className="flex-1 text-slate-600">{l}</span><span className="font-semibold tabular-nums text-slate-900">{modes[k]}</span></li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </div>

      <Explainer title="How a daily price is built" exampleTitle={sample ? 'Example with sample rules — add your own' : 'Example with your rules'}
        example={<div className="space-y-2"><Chain steps={steps} /></div>}>
        <p>Every day of a rental is priced on its own. The system starts from your <b>base rate</b>, then applies only the rules you switched on, in this order:</p>
        <ol className="list-decimal pl-5 space-y-0.5">
          <li><b>Season or event</b> of that day (Eid, high season…). If two rules cover the same day, only the one with priority 1 counts.</li>
          <li><b>Last minute</b>: how long before pick-up the customer books.</li>
          <li><b>Price limits</b>: never below your minimum or above your maximum.</li>
        </ol>
        <p className="text-slate-500">Each step changes the price once. Nothing is counted twice.</p>
      </Explainer>
    </div>
  );
};

// ---------------------------------------------------------------- seasons explainer

const SeasonExplainer: React.FC<{ rules: SeasonRule[]; base: number; setBase: (n: number) => void }> = ({ rules, base, setBase }) => {
  const own = [...rules].filter(r => r.active && r.adjust.type !== 'none').sort((a, b) => a.priority - b.priority)[0];
  const rule = own || ({ name: 'Eid', adjust: { type: 'percent', value: 50 } } as SeasonRule);
  const seasonRate = exRate(base, rule.adjust);
  const days = Array.from({ length: 12 }, (_, i) => ({ label: `Day ${i + 1}`, rate: i >= 9 ? seasonRate : base, hit: i >= 9 }));
  const total = r2(9 * base + 3 * seasonRate);
  const high = exRate(base, { type: 'percent', value: 40 }), eid = exRate(base, { type: 'percent', value: 50 }), both = exRate(base, { type: 'percent', value: 90 });
  return (
    <Explainer title="Seasons & events: a different price on special dates" exampleTitle={own ? `Example with "${own.name}"` : 'Example'}
      example={<div className="space-y-2">
        <p className="text-[12px] text-slate-600">A 12-day rental. {rule.name} ({describeAdjust(rule.adjust)}) covers the last 3 days:</p>
        <DayStrip days={days} />
        <p className="text-[12px] text-slate-700 tabular-nums">9 days × {money(base)} + 3 days × {money(seasonRate)} = <b>{money(total)}</b></p>
        <BaseInput value={base} onChange={setBase} />
      </div>}>
      <p>Give a season or an event its dates and a change, for example <b>Eid Al-Fitr +50%</b>, <b>High season +40%</b> or <b>Low season −20%</b>. Only the rental days inside those dates change: <b>daily price = base rate × (1 + %)</b>.</p>
      <p>When two rules cover the same day, only the one with <b>priority 1</b> counts. Eid inside high season is charged at the Eid rate ({money(eid)}), never both together ({money(both)}). Days in high season only keep {money(high)}.</p>
      <p className="text-slate-500">Each rule can be limited to some car groups, branches or channels, a minimum or maximum rental length, and can skip blackout dates. Paused rules are kept but not used.</p>
    </Explainer>
  );
};

// ---------------------------------------------------------------- seasonal timeline

const SeasonTimeline: React.FC<{ rules: SeasonRule[] }> = ({ rules }) => {
  const dates = rules.flatMap(r => [r.from, r.to]).sort();
  const start = new Date(`${dates[0].slice(0, 7)}-01T00:00`);
  const endD = new Date(`${dates[dates.length - 1]}T00:00`);
  const end = new Date(endD.getFullYear(), endD.getMonth() + 1, 1);
  const span = Math.max(1, end.getTime() - start.getTime());
  const pos = (s: string, plus = 0) => ((new Date(`${s}T00:00`).getTime() + plus - start.getTime()) / span) * 100;
  const months: Date[] = [];
  for (let d = new Date(start); d < end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);
  const sorted = [...rules].sort((a, b) => a.priority - b.priority || a.from.localeCompare(b.from));
  return (
    <div className="px-5 py-4">
      <div className="relative h-5 text-[10px] text-slate-400">
        {months.map(m => <span key={m.toISOString()} className="absolute top-0" style={{ left: `${pos(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`)}%` }}>{m.toLocaleDateString('en-GB', { month: 'short' })}{m.getMonth() === 0 || m === months[0] ? ` ${m.getFullYear()}` : ''}</span>)}
      </div>
      <div className="relative space-y-1">
        {months.map(m => <span key={m.toISOString()} className="absolute top-0 bottom-0 border-l border-slate-100" style={{ left: `${pos(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`)}%` }} />)}
        {sorted.map(r => {
          const left = pos(r.from), width = Math.max(1.2, pos(r.to, 86400000) - pos(r.from));
          const label = `${r.priority} · ${r.name}`;
          const inside = width >= 12;
          const flip = left + width > 70;   // near the right edge: put the name on the left of the bar
          return (
            <div key={r.id} className="relative h-5">
              <span title={`${r.name}: ${r.from} → ${r.to}, ${describeAdjust(r.adjust)}, priority ${r.priority}`}
                className={`absolute top-0 h-5 rounded ${kindTone(r.kind)} ${r.active ? '' : 'opacity-40'} text-white text-[10px] font-semibold px-1.5 leading-5 truncate`}
                style={{ left: `${left}%`, width: `${width}%` }}>
                {inside ? label : ''}
              </span>
              {!inside && (
                <span className={`absolute top-0 h-5 leading-5 text-[10px] font-semibold whitespace-nowrap ${r.active ? 'text-slate-700' : 'text-slate-400'}`}
                  style={flip ? { right: `${100 - left + 0.5}%` } : { left: `${left + width + 0.5}%` }}>{label}{r.active ? '' : ' (paused)'}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- rule dialog

const RuleDialog: React.FC<{ base: number; rule: SeasonRule; groups: string[]; locations: string[]; onClose: () => void; onSave: (r: SeasonRule) => void }> = ({ base, rule, groups, locations, onClose, onSave }) => {
  const [r, setR] = useState<SeasonRule>(rule);
  const [blackout, setBlackout] = useState('');
  const set = (p: Partial<SeasonRule>) => setR(x => ({ ...x, ...p }));
  const invalid = !r.name.trim() ? 'Give the rule a name.' : !r.from || !r.to ? 'Set both dates.' : r.to < r.from ? 'The end date is before the start date.'
    : r.adjust.type === 'none' ? 'Choose how the rate changes.' : r.adjust.type === 'percent' && r.adjust.value <= -100 ? 'A decrease must be less than 100%.' : r.minDays && r.maxDays && r.maxDays < r.minDays ? 'Maximum days is below minimum days.' : '';
  return (
    <Dialog open onClose={onClose} title={rule.name ? `Edit ${rule.name}` : 'New seasonal rule'} subtitle="Dates are inclusive. The rule changes only the rental days that fall inside them." size="xl"
      footer={<><span className="mr-auto text-[12px] text-rose-600">{invalid}</span><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!!invalid} onClick={() => onSave({ ...r, name: r.name.trim() })}>Save rule</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Rule name" required><input value={r.name} onChange={e => set({ name: e.target.value })} placeholder="Eid Al-Fitr 2027" className={inputCls} autoFocus /></Field>
        <Field label="Type">
          <select value={r.kind} onChange={e => set({ kind: e.target.value as SeasonKind })} className={`${selectCls} w-full`}>
            {SEASON_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Start date" required><input type="date" value={r.from} onChange={e => set({ from: e.target.value })} className={inputCls} /></Field>
        <Field label="End date" required hint="inclusive"><input type="date" value={r.to} onChange={e => set({ to: e.target.value })} className={inputCls} /></Field>
        <Field label="Rate" hint="± percent of the base rate: daily price = base × (1 + %). Or a fixed daily rate, or ± amount a day (in each channel's currency)">
          <AdjustInput value={r.adjust} onChange={adjust => set({ adjust })} allowNone={false} label="Rate" />
        </Field>
        <div className="sm:col-span-2 rounded-md bg-violet-50 border border-violet-100 px-3 py-2 text-[13px] text-violet-900">
          <b>Example:</b> a car at <b>{base}</b> a day costs <b>{money(exRate(base, r.adjust))}</b> a day
          {r.from && r.to && r.to >= r.from ? <> from {fmtDate(r.from)} to {fmtDate(r.to)} ({Math.round((new Date(`${r.to}T12:00`).getTime() - new Date(`${r.from}T12:00`).getTime()) / 86400000) + 1} days)</> : ''}.
          Days outside these dates keep their normal rate.
        </div>
        <Field label="Priority" hint="1 = highest; it wins over every other rule on the same day">
          <input type="number" min={1} value={r.priority} onChange={e => set({ priority: Math.max(1, Number(e.target.value) || 1) })} className={`${inputCls} tabular-nums`} />
        </Field>
        <Field label="Minimum rental days" hint="optional"><NumOpt value={r.minDays} onChange={n => set({ minDays: n })} label="Minimum rental days" w="w-full" /></Field>
        <Field label="Maximum rental days" hint="optional"><NumOpt value={r.maxDays} onChange={n => set({ maxDays: n })} label="Maximum rental days" w="w-full" /></Field>
        <div className="sm:col-span-2"><Field label="Car groups"><Chips options={groups.map(g => [g, g])} value={r.groups} onChange={v => set({ groups: v })} allLabel="All groups" /></Field></div>
        <div className="sm:col-span-2"><Field label="Pick-up locations"><Chips options={locations.map(l => [l, l])} value={r.locations} onChange={v => set({ locations: v })} allLabel="All locations" /></Field></div>
        <div className="sm:col-span-2"><Field label="Sales channels"><Chips options={PRICE_CHANNELS} value={r.channels} onChange={v => set({ channels: v as PriceChannelType[] })} allLabel="All channels" /></Field></div>
        <div className="sm:col-span-2">
          <Field label="Blackout dates" hint="days inside the period the rule does not apply on">
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={blackout} onChange={e => setBlackout(e.target.value)} className={`${fieldCls} h-8 text-[12px]`} aria-label="Blackout date" />
              <Button size="sm" disabled={!blackout || r.blackout.includes(blackout)} onClick={() => { set({ blackout: [...r.blackout, blackout].sort() }); setBlackout(''); }}>Add</Button>
              {r.blackout.map(d => (
                <span key={d} className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-slate-100 text-[12px] tabular-nums">{d}
                  <button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => set({ blackout: r.blackout.filter(x => x !== d) })} aria-label={`Remove ${d}`}>×</button></span>
              ))}
            </div>
          </Field>
        </div>
        <div className="sm:col-span-2"><Field label="Notes" hint="optional"><textarea value={r.notes || ''} onChange={e => set({ notes: e.target.value || undefined })} rows={2} className={textareaCls} /></Field></div>
        <label className="sm:col-span-2 inline-flex items-center gap-2 text-[13px] text-slate-700"><Switch on={r.active} onChange={b => set({ active: b })} label="Active" /> Active</label>
      </div>
    </Dialog>
  );
};

// ---------------------------------------------------------------- last minute

const DEFAULT_BANDS: LengthBand[] = [{ fromDay: 1, toDay: 2 }, { fromDay: 3, toDay: 6 }, { fromDay: 7, toDay: null }];

/** Booking windows staff add with one click. */
const WINDOW_PRESETS: { label: string; fromHours: number; toHours: number | null }[] = [
  { label: 'Less than 24 hours', fromHours: 0, toHours: 24 },
  { label: '24–48 hours', fromHours: 24, toHours: 48 },
  { label: '2–7 days', fromHours: 48, toHours: 168 },
  { label: '7–30 days', fromHours: 168, toHours: 720 },
  { label: 'More than 30 days', fromHours: 720, toHours: null },
];
const inDays = (h: number) => h > 48 && h % 24 === 0;
const hoursText = (h: number) => (inDays(h) ? `${h / 24} days` : `${h} hours`);
const windowShort = (t: { fromHours: number; toHours: number | null }) => {
  if (t.toHours == null) return `More than ${hoursText(t.fromHours)}`;
  if (t.fromHours === 0) return `Less than ${hoursText(t.toHours)}`;
  if (inDays(t.toHours) && (t.fromHours % 24 === 0)) return `${t.fromHours / 24}–${t.toHours / 24} days`;
  return `${t.fromHours}–${t.toHours} hours`;
};

/** Edits one cell: direction, unit, amount, with the result on the base rate. */
type Unit = 'none' | 'pct' | 'amt' | 'fixed';
const unitOf = (a: PriceAdjust): Unit => (a.type === 'percent' ? 'pct' : a.type === 'amount' ? 'amt' : a.type === 'fixed' ? 'fixed' : 'none');
const makeAdjust = (u: Unit, sign: 1 | -1, n: number): PriceAdjust => {
  const v = Math.abs(Number.isFinite(n) ? n : 0);
  return u === 'none' ? { type: 'none', value: 0 } : u === 'fixed' ? { type: 'fixed', value: v } : { type: u === 'pct' ? 'percent' : 'amount', value: sign * v };
};
const adjustShort = (a: PriceAdjust) => (a.type === 'percent' ? signed(a.value) : a.type === 'amount' ? `${signed(a.value, '')}/day`.replace(' /', '/') : a.type === 'fixed' ? `= ${money(a.value)}` : 'Normal');

const CellEditor: React.FC<{ value: PriceAdjust; onChange: (a: PriceAdjust) => void; base: number; label: string; onRow?: () => void; onClose: () => void }> = ({ value, onChange, base, label, onRow, onClose }) => {
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
const BookingCurve: React.FC<{ tiers: LeadTier[]; pick: (t: LeadTier) => PriceAdjust; base: number; enabled: boolean }> = ({ tiers, pick, base, enabled }) => {
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

const LeadTimeEditor: React.FC<{ base: number; setBase: (n: number) => void; cfg: DynamicPricingConfig; rateBands: LengthBand[]; onSave: (c: DynamicPricingConfig, what: string) => void }> = ({ base, setBase, cfg, rateBands, onSave }) => {
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

// ---------------------------------------------------------------- limits

const LimitsEditor: React.FC<{ base: number; cfg: DynamicPricingConfig; groups: string[]; onSave: (c: DynamicPricingConfig, what: string, before: string, after: string) => void }> = ({ base, cfg, groups, onSave }) => {
  const [l, setL] = useState({ limits: cfg.limits });
  useEffect(() => setL({ limits: cfg.limits }), [cfg.limits]);
  const text = (x: typeof l) => `${x.limits.minDaily ?? '—'}–${x.limits.maxDaily ?? '—'}${Object.entries(x.limits.groups || {}).map(([g, v]) => `; ${g} ${v.minDaily ?? '—'}–${v.maxDaily ?? '—'}`).join('')}`;
  const dirty = JSON.stringify(l.limits) !== JSON.stringify(cfg.limits);
  const setG = (g: string, p: { minDaily?: number; maxDaily?: number }) => setL(x => {
    const next = { ...(x.limits.groups || {}), [g]: { ...(x.limits.groups?.[g] || {}), ...p } };
    if (next[g].minDaily == null && next[g].maxDaily == null) delete next[g];
    return { ...x, limits: { ...x.limits, groups: next } };
  });
  const hi = r2(base * 1.5 * 1.4), max = l.limits.maxDaily ?? r2(base * 2);
  const lo = r2(base * 0.6), min = l.limits.minDaily ?? r2(base * 0.7);
  return (
    <div className="space-y-5">
      <SectionHead icon={<Icons2.shield />} eyebrow="Rate rules" title="Price limits"
        description="A safety net for every rule: whatever seasons, events and last minute do, the daily price never goes below your minimum or above your maximum. Amounts are in each channel's currency."
        actions={<>
          {dirty && <Button size="sm" variant="ghost" onClick={() => setL({ limits: cfg.limits })}>Discard</Button>}
          <Button size="sm" variant="primary" disabled={!dirty} onClick={() => onSave({ ...cfg, limits: l.limits }, 'Daily price limits', text({ limits: cfg.limits }), text(l))}>Save to draft</Button>
        </>} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
        <div className="space-y-5 min-w-0">
          <Card title="Every car group" subtitle="Leave a box empty for no limit.">
            <div className="px-5 py-4 flex flex-wrap items-end gap-x-8 gap-y-4">
              <div><FieldLabel>Minimum a day</FieldLabel>
                <Stepper label="Minimum daily price" min={0} max={100000} step={1} signedTone={false} width="w-16" placeholder="None" value={l.limits.minDaily ?? undefined} onChange={n => setL(x => ({ ...x, limits: { ...x.limits, minDaily: n } }))} /></div>
              <div><FieldLabel>Maximum a day</FieldLabel>
                <Stepper label="Maximum daily price" min={0} max={100000} step={1} signedTone={false} width="w-16" placeholder="None" value={l.limits.maxDaily ?? undefined} onChange={n => setL(x => ({ ...x, limits: { ...x.limits, maxDaily: n } }))} /></div>
              <div className="flex-1 min-w-[220px]">
                <FieldLabel>Allowed range</FieldLabel>
                <div className="relative h-9 rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200 overflow-hidden">
                  <div className="absolute inset-y-1.5 rounded-md bg-indigo-100 ring-1 ring-inset ring-indigo-200" style={{ left: l.limits.minDaily != null ? '18%' : '1%', right: l.limits.maxDaily != null ? '18%' : '1%' }} />
                  <span className="absolute inset-y-0 left-3 flex items-center text-[11px] font-mono text-slate-500">{l.limits.minDaily != null ? money(l.limits.minDaily) : 'no minimum'}</span>
                  <span className="absolute inset-y-0 right-3 flex items-center text-[11px] font-mono text-slate-500">{l.limits.maxDaily != null ? money(l.limits.maxDaily) : 'no maximum'}</span>
                </div>
              </div>
            </div>
          </Card>
          <Card title="By car group" subtitle="Optional: a different limit for some groups, for example a higher maximum for luxury cars. Empty uses the limit above.">
            {groups.length === 0 ? <EmptyState title="No car groups" hint="Car groups come from your fleet and published rates." /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[13px]">
                  <thead><tr className="bg-slate-50/70 border-b border-slate-200 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-2.5">Group</th><th className="px-3 py-2.5">Minimum a day</th><th className="px-3 py-2.5">Maximum a day</th><th className="px-5 py-2.5 text-right">Uses</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {groups.map(g => {
                      const own = l.limits.groups?.[g];
                      return (
                        <tr key={g} className="hover:bg-slate-50/60">
                          <td className="px-5 py-2.5"><span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-900 text-white font-mono text-[11px] font-semibold tracking-wide">{g}</span></td>
                          <td className="px-3 py-2.5"><Stepper size="sm" label={`${g} minimum`} min={0} max={100000} signedTone={false} width="w-14" placeholder={l.limits.minDaily != null ? String(l.limits.minDaily) : '—'} value={own?.minDaily ?? undefined} onChange={n => setG(g, { minDaily: n })} /></td>
                          <td className="px-3 py-2.5"><Stepper size="sm" label={`${g} maximum`} min={0} max={100000} signedTone={false} width="w-14" placeholder={l.limits.maxDaily != null ? String(l.limits.maxDaily) : '—'} value={own?.maxDaily ?? undefined} onChange={n => setG(g, { maxDaily: n })} /></td>
                          <td className="px-5 py-2.5 text-right">{own ? <StateChip on>Own limit</StateChip> : <span className="text-[12px] text-slate-400">Every group</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <Card title="What the limits do" subtitle={l.limits.maxDaily != null || l.limits.minDaily != null ? 'With your limits' : 'With example limits'}>
          <div className="px-5 py-4 space-y-4 text-[12px]">
            <div><p className="text-slate-500 mb-1.5">Eid +50% and last minute +40% would give {money(hi)}:</p><Chain steps={[{ label: 'Rules give', value: hi, tone: 'lead' }, { label: 'Maximum', value: Math.min(hi, max), note: `max ${max}`, tone: 'final' }]} /></div>
            <div><p className="text-slate-500 mb-1.5">Low season −40% would give {money(lo)}:</p><Chain steps={[{ label: 'Rules give', value: lo, tone: 'season' }, { label: 'Minimum', value: Math.max(lo, min), note: `min ${min}`, tone: 'final' }]} /></div>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- channels

const ChannelsEditor: React.FC<{ aggregators: Aggregator[]; published: boolean; onUpdate: (a: Aggregator, before: string, after: string) => void }> = ({ aggregators, published, onUpdate }) => {
  const MODES: [ChannelRateMode, string, string][] = [
    ['net', 'Fixed rates (as today)', 'Your published rates exactly as today, plus the broker\'s own terms. The rules here are not used.'],
    ['dynamic', 'Smart pricing', 'Every rule you switched on, day by day: seasons and events, last minute and price limits.'],
    ['restricted', 'Seasons only', 'Only seasons and events, day by day. No last-minute changes, so the broker sees steadier prices.'],
  ];
  const describe = (a: Aggregator) => `${MODES.find(m => m[0] === (a.pricingMode || 'net'))![1]} · ${PRICE_CHANNELS.find(c => c[0] === (a.channelType || 'broker'))![1]}`;
  const counts = { net: 0, dynamic: 0, restricted: 0 } as Record<ChannelRateMode, number>;
  aggregators.forEach(a => { counts[a.pricingMode || 'net']++; });
  const change = (a: Aggregator, next: ChannelRateMode) => {
    if (next === (a.pricingMode || 'net')) return;
    if (next !== 'net' && !published && !window.confirm('No rate rules are published yet, so this channel keeps its net rates until you publish. Continue?')) return;
    if (!window.confirm(`${a.name}: change the rate mode to ${MODES.find(m => m[0] === next)![1]}? Its next search is priced this way.`)) return;
    const updated = { ...a, pricingMode: next };
    onUpdate(updated, describe(a), describe(updated));
  };
  const tone: Record<ChannelRateMode, string> = { net: 'bg-slate-400', dynamic: 'bg-indigo-600', restricted: 'bg-violet-400' };
  return (
    <div className="space-y-5">
      <SectionHead icon={<Icons2.signal />} eyebrow="Rate rules" title="Channels"
        description="Choose how each XML channel is priced. Every channel starts on fixed rates, so nothing changes until you decide. A change is live at once for that channel's next search; bookings already made keep their price." />
      <div className="grid gap-4 md:grid-cols-3">
        {MODES.map(([k, l, d]) => (
          <div key={k} className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900"><span className={`w-2.5 h-2.5 rounded-sm ${tone[k]}`} />{l}</p>
              <span className="text-[20px] font-semibold tabular-nums text-slate-900">{counts[k]}</span>
            </div>
            <p className="mt-1 text-[12px] leading-5 text-slate-500">{d}</p>
          </div>
        ))}
      </div>
      <Card title="Your channels" subtitle="Rate mode and channel type for each broker connection."
        footer="The broker always sees one net amount per offer; the customer price is the broker's own. Fixed amounts and limits in the rules are read in each channel's currency.">
        {aggregators.length === 0 ? <EmptyState title="No channels yet" hint="Add a channel first." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead><tr className="bg-slate-50/70 border-b border-slate-200 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-2.5">Channel</th><th className="px-3 py-2.5">Rate mode</th><th className="px-3 py-2.5">Channel type</th><th className="px-5 py-2.5">What the broker gets</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {aggregators.map(a => {
                  const mode = a.pricingMode || 'net';
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="grid place-items-center w-9 h-9 rounded-lg bg-slate-900 text-white text-[11px] font-bold tracking-wide">{(a.channelCode || a.name).slice(0, 3).toUpperCase()}</span>
                          <div><p className="font-semibold text-slate-900">{a.name}</p><p className="text-[11px] text-slate-500 font-mono">{a.channelCode} · {a.currency || 'USD'}</p></div>
                        </div>
                      </td>
                      <td className="px-3 py-3"><Seg size="sm" label={`${a.name} rate mode`} value={mode} onChange={v => change(a, v)} options={[['net', 'Fixed'], ['dynamic', 'Smart'], ['restricted', 'Seasons only']]} /></td>
                      <td className="px-3 py-3">
                        <select value={a.channelType || 'broker'} aria-label={`${a.name} channel type`} className={`${selectCls} h-8 text-[12px]`}
                          onChange={e => { const updated = { ...a, channelType: e.target.value as PriceChannelType }; onUpdate(updated, describe(a), describe(updated)); }}>
                          {PRICE_CHANNELS.map(([k, l]) => <option key={k} value={k}>{l.replace(/s$/, '').replace('accounts', 'account')}</option>)}
                        </select>
                      </td>
                      <td className="px-5 py-3 text-[12px] text-slate-600 max-w-[340px]">{MODES.find(m => m[0] === mode)![2]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Explainer title="Rate modes and channel types"
        example={<div className="space-y-2 text-[12px]">{MODES.map(([k, l, d]) => <div key={k}><p className="font-semibold text-slate-800">{l}</p><p className="text-slate-500">{d}</p></div>)}</div>} exampleTitle="The three options">
        <p>Every channel starts on <b>Fixed rates</b>, so nothing changes until you decide. Switch a channel to <b>Smart pricing</b> to use all your rules, or to <b>Seasons only</b> for steadier prices.</p>
        <p>The <b>type</b> (website, app, walk-in, broker, OTA, corporate, travel agent) lets a rule apply to some channels only, for example a website-only discount.</p>
      </Explainer>
    </div>
  );
};

// ---------------------------------------------------------------- preview

/** A labelled field (defined outside the panel so inputs keep focus while typing). */
const F: React.FC<{ label: string; hint?: string; children: React.ReactNode; className?: string }> = ({ label, hint, children, className }) => <label className={`block min-w-0 ${className || ''}`}><FieldLabel hint={hint}>{label}</FieldLabel>{children}</label>;

const PreviewPanel: React.FC<{ state: DynamicPricingState; aggregators: Aggregator[]; fleet: Fleet; groups: string[] }> = ({ state, aggregators, fleet, groups }) => {
  const [aggId, setAggId] = useState(aggregators[0]?.id || '');
  const agg = aggregators.find(a => a.id === aggId) || aggregators[0];
  const plans: RatePlan[] = agg?.ratePlanHistory?.[0]?.ratePlans || [];
  const aggGroups = useMemo(() => Array.from(new Set(plans.flatMap(p => p.sippRates.map(r => (r.sippCode || '').toUpperCase())).filter(Boolean))).sort(), [plans]);
  const locs = agg?.bookingRules?.locations || [];
  const [group, setGroup] = useState('');
  const [loc, setLoc] = useState('');
  const [ret, setRet] = useState('');
  const [pickup, setPickup] = useState(() => addDays(nowLocal(), 1).slice(0, 11) + '10:00');
  const [dropOff, setDropOff] = useState(() => addDays(nowLocal(), 4).slice(0, 11) + '10:00');
  const [bookedAt, setBookedAt] = useState(nowLocal());
  const [which, setWhich] = useState<'draft' | 'published'>('draft');
  const [modeOverride, setModeOverride] = useState<'' | ChannelRateMode>('');
  const [extras, setExtras] = useState<string[]>([]);
  const [promo, setPromo] = useState('');
  const g = group || aggGroups[0] || groups[0] || '';
  const l = loc || locs[0]?.code || agg?.locationCode || 'AMM';
  const r = ret || l;
  const mode: ChannelRateMode = modeOverride || (agg?.pricingMode && agg.pricingMode !== 'net' ? agg.pricingMode : 'dynamic');
  const cfg = which === 'draft' ? state.draft : state.published;


  const result: PriceResult | null = useMemo(() => {
    if (!agg || !cfg || !g || dropOff <= pickup) return null;
    return priceRental(cfg, {
      group: g, location: l, channel: (agg.channelType || 'broker') as PriceChannelType, pickup, dropOff, now: bookedAt, mode,
      graceMinutes: agg.bookingRules?.graceMinutes,
      baseDaily: (date, n) => {
        const plan = findPlanForDate(plans, date) || findPlanForDate(plans, pickup.slice(0, 10));
        const rate = plan?.sippRates.find(x => (x.sippCode || '').toUpperCase() === g);
        const tier = rate ? findTier(rate, n) : undefined;
        return tier?.dailyPrice ? Number(tier.dailyPrice) : null;
      },
    });
  }, [agg, cfg, g, l, pickup, dropOff, bookedAt, mode, plans]);

  const cur = agg?.currency || 'USD';
  const br = agg?.bookingRules || {};
  const pr = br.pricing || {};
  const days = result?.days ?? rentalDayCount(pickup, dropOff, br.graceMinutes);
  const bandTier = (() => { const plan = findPlanForDate(plans, pickup.slice(0, 10)); const rate = plan?.sippRates.find(x => (x.sippCode || '').toUpperCase() === g); return rate ? findTier(rate, days) : undefined; })();
  const bandText = bandTier ? tierLabel(bandTier) : `${days} days`;
  const car = vehiclesForSipp(fleet, g)[0];
  // The booking engine's order after the rate rules: promotion, extras, fees, tax.
  const quote = useMemo(() => {
    if (!result?.bookable) return null;
    const lines: { label: string; amount: number; kind: 'rental' | 'discount' | 'extra' | 'fee' | 'tax' }[] = [{ label: `Rental, ${days} day${days === 1 ? '' : 's'}`, amount: result.total, kind: 'rental' }];
    let total = result.total;
    const p = (pr.promotions || []).find(x => x.code === promo);
    if (p && p.percentOff) { const off = Math.round(result.total * p.percentOff) / 100; lines.push({ label: `Promotion ${p.code} (${p.percentOff}% off)`, amount: -off, kind: 'discount' }); total -= off; }
    (agg?.extras || []).filter(x => extras.includes(x.id)).forEach(x => {
      let a = (x.price || 0) * days; if (x.maxPerRental && a > x.maxPerRental) a = x.maxPerRental;
      lines.push({ label: x.name, amount: a, kind: 'extra' }); total += a;
    });
    if (l !== r) {
      const route = (br.oneWayRoutes || []).find(x => (x.from === l && x.to === r) || (x.bothWays !== false && x.from === r && x.to === l));
      const fee = route ? route.fee : br.oneWayFee || 0;
      if (fee) { lines.push({ label: `One-way fee ${l} → ${r}`, amount: fee, kind: 'fee' }); total += fee; }
    }
    const fees = [l, r].map(code => locs.find(x => x.code === code)).filter(x => x && x.type === 'AIRPORT' && x.airportFeeCharged !== false).map(x => x!.stationFee || 0);
    const airport = Math.max(0, ...fees);
    if (airport) { lines.push({ label: 'Airport fee', amount: airport, kind: 'fee' }); total += airport; }
    let tax = 0;
    if (pr.taxPercent) {
      tax = pr.taxIncluded === false ? Math.round(total * pr.taxPercent) / 100 : Math.round((total * pr.taxPercent / (100 + pr.taxPercent)) * 100) / 100;
      if (pr.taxIncluded === false) { lines.push({ label: `${pr.taxName || 'Tax'} ${pr.taxPercent}%`, amount: tax, kind: 'tax' }); total += tax; }
    }
    return { lines, total: Math.round(total * 100) / 100, tax };
  }, [result, promo, extras, days, agg, l, r, br, pr, locs]);

  if (!agg) return <Card><EmptyState title="No channels yet" hint="Add a channel and publish its rates to preview prices." /></Card>;
  return (
    <div className="space-y-5">
      <SectionHead icon={<Icons2.beaker />} eyebrow="Rate rules" title="Try a price"
        description="Pick a channel, a car group and the dates. The price is worked out day by day, exactly as a broker will see it, and updates as soon as you change anything. Use Draft to test changes you have not published yet."
        actions={<Seg label="Rules to test" size="sm" value={which} onChange={v => (v === 'published' && !state.published ? undefined : setWhich(v))}
          options={[['draft', 'Draft'], ['published', state.published ? `Published v${state.version}` : 'Published (none)']]} />} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Booking" subtitle="What the broker asks for">
          <div className="px-5 py-4 grid gap-4 sm:grid-cols-2">
            <F label="Channel"><select value={agg.id} onChange={e => { setAggId(e.target.value); setGroup(''); setLoc(''); setRet(''); }} className={`${selectCls} w-full`}>{aggregators.map(a => <option key={a.id} value={a.id}>{a.name} ({a.channelCode})</option>)}</select></F>
            <F label="Car group"><select value={g} onChange={e => setGroup(e.target.value)} className={`${selectCls} w-full font-mono`}>{(aggGroups.length ? aggGroups : groups).map(x => <option key={x}>{x}</option>)}</select></F>
            <F label="Pick-up location"><select value={l} onChange={e => setLoc(e.target.value)} className={`${selectCls} w-full`}>{(locs.length ? locs.map(x => x.code) : [l]).map(x => <option key={x}>{x}</option>)}</select></F>
            <F label="Return location"><select value={r} onChange={e => setRet(e.target.value)} className={`${selectCls} w-full`}>{(locs.length ? locs.map(x => x.code) : [l]).map(x => <option key={x}>{x}</option>)}</select></F>
            <F label="Pick-up"><input type="datetime-local" value={pickup} onChange={e => setPickup(e.target.value)} className={inputCls} /></F>
            <F label="Return"><input type="datetime-local" value={dropOff} onChange={e => setDropOff(e.target.value)} className={inputCls} /></F>
          </div>
        </Card>
        <Card title="Conditions" subtitle="When it is booked, and what is added">
          <div className="px-5 py-4 grid gap-4 sm:grid-cols-2">
            <F label="Booked at" hint="for last minute"><input type="datetime-local" value={bookedAt} onChange={e => setBookedAt(e.target.value)} className={inputCls} /></F>
            <F label="Rate mode"><select value={modeOverride} onChange={e => setModeOverride(e.target.value as '' | ChannelRateMode)} className={`${selectCls} w-full`}>
              <option value="">{agg.pricingMode && agg.pricingMode !== 'net' ? `As the channel (${agg.pricingMode})` : 'Dynamic (channel is on net rates)'}</option>
              <option value="dynamic">Dynamic</option><option value="restricted">Restricted</option><option value="net">Net rates</option></select></F>
            <F label="Promotion code"><select value={promo} onChange={e => setPromo(e.target.value)} className={`${selectCls} w-full`}><option value="">None</option>{(pr.promotions || []).map(p => <option key={p.code}>{p.code}</option>)}</select></F>
            <div className="min-w-0"><FieldLabel>Extras</FieldLabel>
              <div className="flex flex-wrap gap-1.5">{(agg.extras || []).length === 0 ? <span className="inline-flex items-center h-9 text-[12px] text-slate-400">None on this channel</span> : (agg.extras || []).map(x => (
                <button key={x.id} type="button" aria-pressed={extras.includes(x.id)} onClick={() => setExtras(v => (v.includes(x.id) ? v.filter(y => y !== x.id) : [...v, x.id]))}
                  className={`h-8 px-2.5 rounded-md text-[12px] font-medium ring-1 ring-inset ${extras.includes(x.id) ? 'bg-indigo-50 text-indigo-700 ring-indigo-300' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}>{x.name}</button>))}</div>
            </div>
          </div>
        </Card>
      </div>

      {!cfg ? <Card><EmptyState title="Nothing published yet" hint="Choose the draft, or publish the rules first." /></Card>
        : !result ? <Card><EmptyState title="Check the dates" hint="The return must be after the pick-up." /></Card>
        : !result.bookable ? <Card><div className="px-5 py-4 flex items-center gap-3"><Badge tone="danger">Not offered</Badge><p className="text-[13px] text-slate-700">{result.reason}</p></div></Card>
        : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
            <Card title="Day by day" subtitle={`${result.days} rental day${result.days === 1 ? '' : 's'} · rate band ${bandText} · booked ${result.leadHours.toFixed(0)} h before pick-up · ${mode} mode`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead><tr className="bg-slate-50/70 border-b border-slate-200 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-2.5">Day</th><th className="px-3 py-2.5 text-right">Base</th><th className="px-3 py-2.5">Rules applied</th><th className="px-5 py-2.5 text-right">Rate</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.perDay.map(d => {
                      const diff = r2(d.rate - d.base);
                      return (
                        <tr key={d.date} className="hover:bg-slate-50/60 align-top">
                          <td className="px-5 py-2.5 whitespace-nowrap tabular-nums font-medium text-slate-800">{new Date(`${d.date}T12:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{money(d.base)}</td>
                          <td className="px-3 py-2.5 text-[12px]">
                            {d.steps.length === 0 ? <span className="text-slate-400">Base rate</span> : (
                              <ol className="space-y-1">{d.steps.map((s, i) => (
                                <li key={i} className="flex flex-wrap items-center gap-1.5">
                                  <span className={`px-1.5 py-px rounded text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${s.stage === 'season' ? 'bg-violet-50 text-violet-700 ring-violet-200' : s.stage === 'lead' ? 'bg-sky-50 text-sky-700 ring-sky-200' : 'bg-slate-50 text-slate-600 ring-slate-200'}`}>{s.stage === 'lead' ? 'last minute' : s.stage}</span>
                                  <span className="text-slate-700">{s.label}</span>
                                  <span className="text-slate-400 tabular-nums">{money(s.from)} → {money(s.to)}</span>
                                </li>))}</ol>
                            )}
                          </td>
                          <td className="px-5 py-2.5 text-right tabular-nums"><b className="text-slate-900">{money(d.rate)}</b>{diff !== 0 && <p className={`text-[11px] font-semibold ${toneText[toneOf(diff)]}`}>{diff > 0 ? '+' : '−'}{money(Math.abs(diff))}</p>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr className="border-t border-slate-200 bg-slate-50">
                    <td className="px-5 py-3 text-[12px] font-medium text-slate-600" colSpan={3}>{summarise(result.perDay).map(x => `${x.count} × ${money(x.rate)}${x.rule ? ` (${x.rule})` : ''}`).join(' + ')}</td>
                    <td className="px-5 py-3 text-right font-bold tabular-nums text-slate-900">{money(result.total)}</td>
                  </tr></tfoot>
                </table>
              </div>
              {result.notes.length > 0 && <ul className="px-5 py-2.5 border-t border-slate-100 text-[12px] text-slate-500 list-disc pl-9">{result.notes.map(n => <li key={n}>{n}</li>)}</ul>}
            </Card>

            <Card title="Price shown to the broker" subtitle={`${agg.name} · ${cur}`}>
              {quote && (
                <div className="p-2 text-[13px]">
                  <div className="flex items-baseline justify-between px-3 py-2"><span className="text-slate-500">Average daily rate</span><span className="font-semibold tabular-nums text-slate-900">{money(result.total / result.days)}</span></div>
                  <ul className="px-3 py-2 space-y-1.5 border-t border-slate-100">
                    {quote.lines.map((x, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3"><span className={x.kind === 'discount' ? 'text-emerald-700' : 'text-slate-600'}>{x.label}</span><span className="tabular-nums text-slate-800">{x.amount < 0 ? '−' : ''}{money(Math.abs(x.amount))}</span></li>
                    ))}
                  </ul>
                  <div className="flex items-baseline justify-between rounded-lg bg-slate-900 text-white px-3 py-3 mt-1"><span className="font-semibold">Total</span><span className="text-[20px] font-bold tabular-nums">{money(quote.total)} <span className="text-[12px] font-medium text-slate-300">{cur}</span></span></div>
                  {pr.taxPercent ? <p className="px-3 pt-2 text-[11px] text-slate-500">{pr.taxIncluded === false ? 'Tax added above.' : `Includes ${pr.taxName || 'tax'} ${pr.taxPercent}%: ${money(quote.tax)}.`}</p> : null}
                  <dl className="mx-3 mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-[12px]">
                    <div className="flex justify-between"><dt className="text-slate-500">Deposit</dt><dd className="tabular-nums">{car ? money(car.securityDeposit || 0) : '—'}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Excess</dt><dd className="tabular-nums">{car ? money(car.excess || 0) : '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Payment</dt><dd className="text-right">{br.paymentModel === 'BROKER_PREPAID' ? 'Prepaid to the broker' : 'Pay at the counter'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Cancellation</dt><dd className="text-right">{(br.cancellationTiers || []).length
                      ? br.cancellationTiers!.map(t => `<${t.hoursBefore} h: ${t.feePercent}%`).join(', ')
                      : `Free until ${br.freeCancellationHours ?? 48} h before, then ${br.lateCancellationFeePercent ?? 100}%`}</dd></div>
                  </dl>
                  <p className="px-3 pt-3 pb-1 text-[11px] text-slate-400">The broker's own terms (Price rules) are applied by the server on top of this net rental.</p>
                </div>
              )}
            </Card>
          </div>
        )}
    </div>
  );
};

// ---------------------------------------------------------------- history

const HistoryPanel: React.FC<{ state: DynamicPricingState }> = ({ state }) => {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'published' | 'rules' | 'channels'>('all');
  const all = state.history || [];
  const list = all.filter(h => (kind === 'all' || (kind === 'published' ? h.action === 'Published' : kind === 'channels' ? /channel/i.test(h.action) : h.action !== 'Published' && !/channel/i.test(h.action)))
    && (!q.trim() || `${h.action} ${h.detail} ${h.by} ${h.before || ''} ${h.after || ''}`.toLowerCase().includes(q.trim().toLowerCase())));
  const tone = (a: string) => (a === 'Published' ? 'bg-emerald-500' : /deleted|off|discarded/i.test(a) ? 'bg-rose-500' : /channel/i.test(a) ? 'bg-sky-500' : 'bg-indigo-500');
  return (
    <div className="space-y-5">
      <SectionHead icon={<Icons.history />} eyebrow="Rate rules" title="Change history"
        description="Every change to the rules, who made it and when, with the old and new values. The last 500 changes are kept."
        actions={<span className="inline-flex items-center h-7 px-2.5 rounded-full bg-slate-50 ring-1 ring-inset ring-slate-200 text-[12px] font-semibold text-slate-600 tabular-nums">{all.length} change{all.length === 1 ? '' : 's'}</span>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-100">
          <Seg label="Filter changes" size="sm" value={kind} onChange={v => setKind(v)} options={[['all', 'All'], ['published', 'Publishes'], ['rules', 'Rules'], ['channels', 'Channels']]} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search changes, people or values" aria-label="Search history" className={`${inputCls} h-8 max-w-xs ml-auto`} />
        </div>
        {list.length === 0 ? <EmptyState title={all.length ? 'No changes match' : 'No changes yet'} hint={all.length ? 'Try another filter or search.' : 'Changes appear here as soon as you edit a rule.'} /> : (
          <ol className="px-5 py-4">
            {list.map((h, i) => (
              <li key={i} className="relative grid grid-cols-[150px_1fr] gap-5 pb-5 last:pb-0">
                <div className="text-right pt-0.5">
                  <p className="text-[12px] font-semibold text-slate-800 tabular-nums">{new Date(h.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  <p className="text-[11px] text-slate-500 tabular-nums">{new Date(h.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {h.by}</p>
                </div>
                <div className="relative pl-6 min-w-0">
                  {i < list.length - 1 && <span className="absolute left-[5px] top-4 bottom-[-20px] w-px bg-slate-200" />}
                  <span className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full ring-4 ring-white ${tone(h.action)}`} />
                  <p className="text-[13px]"><span className="font-semibold text-slate-900">{h.action}</span><span className="text-slate-500"> · {h.detail}</span></p>
                  {(h.before != null || h.after != null) && (
                    <div className="mt-1.5 grid gap-1.5 md:grid-cols-2 text-[12px]">
                      <div className="rounded-md bg-rose-50/60 ring-1 ring-inset ring-rose-100 px-2.5 py-1.5 min-w-0"><span className="text-[10px] font-semibold uppercase tracking-wider text-rose-600">Before</span><p className="text-slate-600 break-words">{h.before ?? '—'}</p></div>
                      <div className="rounded-md bg-emerald-50/60 ring-1 ring-inset ring-emerald-100 px-2.5 py-1.5 min-w-0"><span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">After</span><p className="text-slate-800 break-words">{h.after ?? '—'}</p></div>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
};

export default RateRulesView;
