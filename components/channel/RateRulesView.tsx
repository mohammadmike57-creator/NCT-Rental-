import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Aggregator, Fleet, RatePlan } from '../../types';
import { Panel, Badge, Button, EmptyState, Dialog, Field, inputCls, selectCls, textareaCls, table } from '../ui/Crm';
import { saveAllData, loadedSection } from '../../firebase/api';
import {
  AdjustType, ChannelRateMode, LengthBand, lengthLabel, DynamicPricingConfig, DynamicPricingState,
  LeadTier, PRICE_CHANNELS, PriceAdjust, PriceChannelType, PriceResult, SEASON_KINDS, SeasonKind, SeasonRule,
  applyAdjust, describeAdjust, emptyPricingState, priceRental, rentalDayCount, summarise,
} from '../../services/dynamicPricing';
import { findPlanForDate, findTier, fleetSippCodes, tierLabel, vehiclesForSipp } from '../../services/channelManager';

/**
 * OTA XML → Rate rules: seasonal / event rates and last-minute pricing for the XML channels (prices never depend on cars left),
 * edited as a draft, tested in the preview and published. Only channels switched to "Dynamic" or
 * "Restricted" (Channels tab) are priced with the published rules; every other channel keeps its net rates.
 */

type Tab = 'overview' | 'seasons' | 'lead' | 'limits' | 'channels' | 'preview' | 'history';
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

const EXAMPLE_LEAD: LeadTier[] = [
  { id: 'lt-24', fromHours: 0, toHours: 24, adjust: { type: 'percent', value: 20 } },
  { id: 'lt-48', fromHours: 24, toHours: 48, adjust: { type: 'percent', value: 10 } },
  { id: 'lt-7d', fromHours: 48, toHours: 168, adjust: { type: 'none', value: 0 } },
  { id: 'lt-30d', fromHours: 168, toHours: 720, adjust: { type: 'none', value: 0 } },
  { id: 'lt-early', fromHours: 720, toHours: null, adjust: { type: 'percent', value: -5 } },
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
const leadText = (t: { fromHours: number; toHours: number | null }) => {
  const h = (n: number) => (n % 24 === 0 && n >= 48 ? `${n / 24} days` : `${n} hours`);
  return t.toHours == null ? `Booked more than ${h(t.fromHours)} before pick-up` : t.fromHours === 0 ? `Booked less than ${h(t.toHours)} before pick-up` : `Booked ${h(t.fromHours)} – ${h(t.toHours)} before pick-up`;
};

/** "How it works" box: plain words on the left, a worked example on the right. */
const Explainer: React.FC<{ title: string; children: React.ReactNode; example?: React.ReactNode; exampleTitle?: string }> = ({ title, children, example, exampleTitle = 'Example' }) => (
  <section className="rounded-lg border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white p-4 flex flex-col lg:flex-row gap-4">
    <div className="flex-1 min-w-0">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-indigo-900">
        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold inline-flex items-center justify-center">i</span>{title}
      </p>
      <div className="mt-1.5 text-[13px] leading-relaxed text-slate-600 space-y-1.5">{children}</div>
    </div>
    {example && (
      <div className="lg:w-[400px] shrink-0 rounded-md bg-white border border-indigo-100 shadow-sm p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500 mb-2">{exampleTitle}</p>
        {example}
      </div>
    )}
  </section>
);

/** A price built step by step: 30 → 45 → 54. */
const Chain: React.FC<{ steps: { label: string; value: number | null; note?: string; tone?: 'base' | 'season' | 'lead' | 'avail' | 'limit' | 'final' }[] }> = ({ steps }) => {
  const tone = { base: 'bg-slate-100 text-slate-700', season: 'bg-violet-50 text-violet-700 ring-violet-200', lead: 'bg-sky-50 text-sky-700 ring-sky-200', avail: 'bg-amber-50 text-amber-700 ring-amber-200', limit: 'bg-slate-50 text-slate-600 ring-slate-200', final: 'bg-emerald-600 text-white ring-emerald-600' };
  return (
    <div className="flex flex-wrap items-stretch gap-1.5">
      {steps.map((st, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="self-center text-slate-300 text-lg leading-none">→</span>}
          <div className={`rounded-md ring-1 ring-inset px-2.5 py-1.5 min-w-[78px] ${tone[st.tone || 'base']}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{st.label}</p>
            <p className="text-[15px] font-semibold tabular-nums leading-tight">{st.value == null ? '—' : money(st.value)}</p>
            {st.note && <p className="text-[10px] opacity-80 whitespace-nowrap">{st.note}</p>}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

const BaseInput: React.FC<{ value: number; onChange: (n: number) => void }> = ({ value, onChange }) => (
  <label className="inline-flex items-center gap-2 text-[12px] text-slate-500">Example base rate
    <input type="number" min={1} value={value} onChange={e => onChange(Math.max(1, Number(e.target.value) || 1))} aria-label="Example base rate"
      className={`${fieldCls} h-7 w-20 text-[12px] tabular-nums`} /> a day
  </label>
);

/** Twelve example days, with the days a rule covers highlighted. */
const DayStrip: React.FC<{ days: { label: string; rate: number; hit: boolean }[] }> = ({ days }) => (
  <div className="grid grid-cols-6 gap-1">
    {days.map((d, i) => (
      <div key={i} className={`rounded px-1 py-1 text-center ${d.hit ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
        <p className="text-[9px] opacity-80">{d.label}</p>
        <p className="text-[11px] font-semibold tabular-nums">{d.rate % 1 ? d.rate.toFixed(2) : d.rate}</p>
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
    <div className="space-y-4">
      {/* Status / publish bar */}
      <section className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-900">Draft &amp; publish</h3>
          <p className="text-[12px] text-slate-500">Every change is saved as a draft. Brokers see it only after you press Publish.</p>
        </div>
        <dl className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px]">
          {[
            ['Published', state.version ? `v${state.version} · ${state.publishedAt ? new Date(state.publishedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}` : 'never'],
            ['By', state.publishedBy || '—'],
            ['Channels using it', `${dynamicChannels.length} of ${aggregators.length}`],
          ].map(([k, v]) => <div key={k}><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{k}</dt><dd className="font-medium text-slate-700 whitespace-nowrap">{v}</dd></div>)}
          <div className="flex items-center gap-2">
            {saving ? <Badge tone="muted">Saving…</Badge> : unpublished ? <Badge tone="warning">Draft not published</Badge> : <Badge tone="success">Published = draft</Badge>}
            {unpublished && state.published && <Button size="sm" variant="ghost" onClick={discard}>Discard</Button>}
            <Button size="sm" variant="primary" disabled={!unpublished || saving} onClick={() => void publish()}>Publish</Button>
          </div>
        </dl>
      </section>

      <nav className="flex gap-0.5 overflow-x-auto no-scrollbar border-b border-slate-200" aria-label="Rate rules sections">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}
            className={`px-3 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {l}{k === 'seasons' && cfg.seasonal.rules.length ? <span className="ml-1.5 px-1.5 py-px rounded bg-slate-100 text-slate-500 text-[10px] tabular-nums">{cfg.seasonal.rules.length}</span> : null}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <Overview cfg={cfg} base={base} setBase={setBase} published={!!state.published} aggregators={aggregators} onToggle={(k, on) => {
          const next = clone(cfg);
          if (k === 'stack') next.seasonal.stack = on; else next[k].enabled = on;
          const names = { seasonal: 'Seasonal & event rates', leadTime: 'Last-minute pricing', stack: 'Stack seasonal rules' } as const;
          void setDraft(next, on ? 'Switched on' : 'Switched off', names[k], on ? 'off' : 'on', on ? 'on' : 'off');
        }} onGo={setTab} />
      )}

      {tab === 'seasons' && (<div className="space-y-4">
        <SeasonExplainer rules={cfg.seasonal.rules} base={base} setBase={setBase} />
        <Panel title="Your seasons & events" subtitle="Add, edit, pause or delete. Priority 1 wins when two rules cover the same day."
          actions={<Button size="sm" variant="primary" onClick={() => setEditing(newRule({ priority: (Math.max(0, ...cfg.seasonal.rules.map(r => r.priority)) || 4) + 1 }))}>Add rule</Button>}>
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-slate-500">Start from:</span>
            {PRESETS.map(p => <Button key={p.label} size="sm" onClick={() => setEditing(newRule(clone(p.rule)))}>{p.label}</Button>)}
          </div>
          {cfg.seasonal.rules.length === 0 ? (
            <EmptyState title="No seasonal rules yet" hint="Add Eid, high season or any event with its dates; the rate applies only on those days." />
          ) : (
            <>
              <SeasonTimeline rules={cfg.seasonal.rules} />
              <div className="overflow-x-auto">
                <table className={`${table.wrap} min-w-[980px]`}>
                  <thead className={table.head}><tr>{['Priority', 'Rule', 'Dates', 'Applies to', 'Change', `Example (${base} a day)`, 'Rental length', 'On', ''].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
                  <tbody className={table.body}>
                    {[...cfg.seasonal.rules].sort((a, b) => a.priority - b.priority).map(r => (
                      <tr key={r.id} className={`${table.row} ${r.active ? '' : 'opacity-60'}`}>
                        <td className={table.td}>
                          <span className="inline-flex items-center gap-1">
                            <span className="w-7 text-center font-semibold tabular-nums">{r.priority}</span>
                            <button type="button" className="text-slate-400 hover:text-slate-700 px-1" onClick={() => ruleAction(r, 'up')} aria-label={`Raise priority of ${r.name}`}>▲</button>
                            <button type="button" className="text-slate-400 hover:text-slate-700 px-1" onClick={() => ruleAction(r, 'down')} aria-label={`Lower priority of ${r.name}`}>▼</button>
                          </span>
                        </td>
                        <td className={table.td}>
                          <p className="font-semibold text-slate-900 flex items-center gap-2"><span className={`w-2 h-2 rounded-sm ${kindTone(r.kind)}`} />{r.name || '(no name)'}</p>
                          <p className="text-[11px] text-slate-500">{kindLabel(r.kind)}{r.notes ? ` · ${r.notes}` : ''}</p>
                        </td>
                        <td className={`${table.td} whitespace-nowrap tabular-nums`}>{fmtDate(r.from)} → {fmtDate(r.to)}
                          {r.blackout.length > 0 && <p className="text-[11px] text-slate-500">{r.blackout.length} blackout date{r.blackout.length === 1 ? '' : 's'}</p>}</td>
                        <td className={`${table.td} text-[12px] text-slate-600`}>
                          <p>{r.groups.length ? r.groups.join(', ') : 'All car groups'}</p>
                          <p className="text-slate-400">{r.locations.length ? r.locations.join(', ') : 'All locations'} · {r.channels.length ? r.channels.map(c => PRICE_CHANNELS.find(x => x[0] === c)?.[1]).join(', ') : 'All channels'}</p>
                        </td>
                        <td className={`${table.td} font-semibold tabular-nums whitespace-nowrap`}>{describeAdjust(r.adjust)}</td>
                        <td className={`${table.td} tabular-nums whitespace-nowrap text-[12px]`}><span className="text-slate-400">{base} →</span> <b className="text-slate-900">{money(exRate(base, r.adjust))}</b></td>
                        <td className={`${table.td} text-[12px] text-slate-600 whitespace-nowrap`}>{r.minDays || r.maxDays ? `${r.minDays || 1}–${r.maxDays || '∞'} days` : 'Any'}</td>
                        <td className={table.td}><Switch on={r.active} onChange={() => ruleAction(r, 'toggle')} label={`${r.name} active`} /></td>
                        <td className={`${table.td} whitespace-nowrap text-right`}>
                          <Button size="sm" onClick={() => setEditing(clone(r))}>Edit</Button>{' '}
                          <Button size="sm" variant="ghost" onClick={() => ruleAction(r, 'duplicate')}>Duplicate</Button>
                          <Button size="sm" variant="ghost" className="!text-rose-600" onClick={() => ruleAction(r, 'delete')}>Delete</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
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
  return (
    <div className="space-y-4">
    <Explainer title="How a daily price is built" exampleTitle={sample ? 'Example with sample rules — add your own' : 'Example with your rules'}
      example={<div className="space-y-2"><Chain steps={steps} /><BaseInput value={base} onChange={setBase} /></div>}>
      <p>Every day of a rental is priced on its own. The system starts from your <b>base rate</b>, then applies only the rules you switched on, in this order:</p>
      <ol className="list-decimal pl-5 space-y-0.5">
        <li><b>Season or event</b> of that day (Eid, high season…). If two rules cover the same day, only the one with priority 1 counts.</li>
        <li><b>Last minute</b>: how long before pick-up the customer books.</li>
        <li><b>Price limits</b>: never below your minimum or above your maximum.</li>
      </ol>
      <p className="text-slate-500">Each step changes the price once. Nothing is counted twice.</p>
    </Explainer>
    <section className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <p className="text-[13px] font-semibold text-slate-900">Getting started</p>
      {started.map((st, i) => (
        <button key={i} type="button" onClick={() => onGo(st.tab)} className="inline-flex items-center gap-2 text-[13px] text-slate-600 hover:text-indigo-700">
          <span className={`w-5 h-5 rounded-full text-[11px] font-bold inline-flex items-center justify-center ${st.done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>{st.done ? '✓' : i + 1}</span>{st.text}
        </button>
      ))}
    </section>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel title="Rules" subtitle="Each rule is optional and switched on or off on its own. Changes stay in the draft until you publish.">
        <ul className="divide-y divide-slate-100">
          <li className="px-4 py-3 flex items-center gap-4">
            <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-[12px] font-semibold inline-flex items-center justify-center shrink-0">1</span>
            <div className="flex-1 min-w-0"><p className="text-[13px] font-semibold text-slate-900">Base daily rate</p>
              <p className="text-[12px] text-slate-500">The channel's published rate (Rates tab) of each day's period, for the length of the whole rental.</p></div>
            <Badge tone="success">Always on</Badge>
          </li>
          {rows.map(r => (
            <li key={r.key} className="px-4 py-3 flex items-center gap-4">
              <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 text-[12px] font-semibold inline-flex items-center justify-center shrink-0">{r.step}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-slate-900">{r.title} <span className="ml-1 font-normal text-slate-400">{r.count}</span></p>
                <p className="text-[12px] text-slate-500">{r.text}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => onGo(r.tab)}>Edit</Button>
              <Switch on={cfg[r.key].enabled} onChange={b => onToggle(r.key, b)} label={r.title} />
            </li>
          ))}
          <li className="px-4 py-3 flex items-center gap-4">
            <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-[12px] font-semibold inline-flex items-center justify-center shrink-0">4</span>
            <div className="flex-1 min-w-0"><p className="text-[13px] font-semibold text-slate-900">Minimum and maximum daily price</p>
              <p className="text-[12px] text-slate-500">{cfg.limits.minDaily != null || cfg.limits.maxDaily != null ? `${cfg.limits.minDaily ?? '—'} to ${cfg.limits.maxDaily ?? '—'} a day` : 'No limit set'}{Object.keys(cfg.limits.groups || {}).length ? `, ${Object.keys(cfg.limits.groups).length} group limit(s)` : ''}</p></div>
            <Button size="sm" variant="ghost" onClick={() => onGo('limits')}>Edit</Button>
          </li>
          <li className="px-4 py-3 flex items-center gap-4 bg-slate-50/60">
            <span className="w-7" />
            <div className="flex-1 min-w-0"><p className="text-[13px] font-semibold text-slate-900">Stack seasonal rules</p>
              <p className="text-[12px] text-slate-500">Off (recommended): the highest-priority rule replaces the rate, so Eid inside high season is charged at the Eid rate, never both. On: every matching rule is applied in priority order and the preview shows each step.</p></div>
            <Switch on={cfg.seasonal.stack} onChange={b => onToggle('stack', b)} label="Stack seasonal rules" />
          </li>
        </ul>
        <p className="px-4 py-3 border-t border-slate-100 text-[12px] text-slate-500">
          After these steps the booking engine adds, as before: the broker's own terms (Price rules tab), promotions, extras, covers, one-way / airport / after-hours / driver fees and tax.
          When the last-minute rule prices a channel, that broker's own early-booking and last-minute percent is not added again.
        </p>
      </Panel>
      <Panel title="Channels" subtitle="Only channels set to Smart pricing or Seasons only use these rules.">
        <ul className="divide-y divide-slate-100 text-[13px]">
          {([['net', 'Fixed rates (as today)'], ['dynamic', 'Smart pricing (all rules)'], ['restricted', 'Seasons only']] as const).map(([k, l]) => (
            <li key={k} className="px-4 py-2.5 flex items-center justify-between"><span className="text-slate-600">{l}</span><span className="font-semibold tabular-nums">{modes[k]}</span></li>
          ))}
        </ul>
        <div className="px-4 py-3 border-t border-slate-100"><Button size="sm" onClick={() => onGo('channels')}>Choose channels</Button></div>
      </Panel>
    </div>
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
    <div className="px-4 py-3 border-b border-slate-100">
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

/** Compact cell: [− | +] value [% | per day | fixed]  →  preview. */
type Unit = 'none' | 'pct' | 'amt' | 'fixed';
const unitOf = (a: PriceAdjust): Unit => (a.type === 'percent' ? 'pct' : a.type === 'amount' ? 'amt' : a.type === 'fixed' ? 'fixed' : 'none');
const makeAdjust = (u: Unit, sign: 1 | -1, n: number): PriceAdjust => {
  const v = Math.abs(Number.isFinite(n) ? n : 0);
  return u === 'none' ? { type: 'none', value: 0 } : u === 'fixed' ? { type: 'fixed', value: v } : { type: u === 'pct' ? 'percent' : 'amount', value: sign * v };
};

const CellEditor: React.FC<{ value: PriceAdjust; onChange: (a: PriceAdjust) => void; base: number; label: string }> = ({ value, onChange, base, label }) => {
  const u = unitOf(value);
  const sign: 1 | -1 = value.value < 0 ? -1 : 1;
  const n = Math.abs(value.value || 0);
  const result = exRate(base, value);
  const diff = r2(result - base);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className={`inline-flex items-stretch h-8 rounded-md border bg-white overflow-hidden ${u === 'none' ? 'border-slate-200' : diff > 0 ? 'border-amber-300' : diff < 0 ? 'border-emerald-300' : 'border-slate-300'}`}>
        {(u === 'pct' || u === 'amt') && (
          <span className="inline-flex border-r border-slate-200">
            {([-1, 1] as const).map(sg => (
              <button key={sg} type="button" aria-pressed={sign === sg} aria-label={`${label}: ${sg > 0 ? 'increase' : 'decrease'}`} onClick={() => onChange(makeAdjust(u, sg, n))}
                className={`w-7 text-[14px] font-semibold ${sign === sg ? (sg > 0 ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white') : 'text-slate-400 hover:bg-slate-50'}`}>{sg > 0 ? '+' : '−'}</button>
            ))}
          </span>
        )}
        {u !== 'none' && (
          <input type="number" min={0} step={u === 'pct' ? 1 : 0.5} value={n === 0 ? '' : n} placeholder="0" aria-label={`${label}: value`}
            onChange={e => onChange(makeAdjust(u, sign, Number(e.target.value)))} className="w-16 px-2 text-right text-[13px] font-semibold tabular-nums outline-none" />
        )}
        <select value={u} aria-label={`${label}: unit`} onChange={e => { const nu = e.target.value as Unit; onChange(makeAdjust(nu, sign, n || (nu === 'fixed' ? base : nu === 'none' ? 0 : 10))); }}
          className={`text-[12px] pl-2 pr-1 outline-none bg-slate-50 border-l border-slate-200 ${u === 'none' ? 'w-[104px] text-slate-500 border-l-0 bg-white' : 'w-[84px] text-slate-700'}`}>
          <option value="none">No change</option>
          <option value="pct">%</option>
          <option value="amt">per day</option>
          <option value="fixed">fixed rate</option>
        </select>
      </div>
      <span className={`text-[11px] font-mono tabular-nums ${diff > 0 ? 'text-amber-700' : diff < 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
        {money(base)} → {money(result)}{diff ? ` (${diff > 0 ? '+' : '−'}${money(Math.abs(diff))})` : ''}
      </span>
    </div>
  );
};

const LeadTimeEditor: React.FC<{ base: number; setBase: (n: number) => void; cfg: DynamicPricingConfig; rateBands: LengthBand[]; onSave: (c: DynamicPricingConfig, what: string) => void }> = ({ base, setBase, cfg, rateBands, onSave }) => {
  const [lt, setLt] = useState(cfg.leadTime);
  useEffect(() => setLt(cfg.leadTime), [cfg.leadTime]);
  const dirty = JSON.stringify(lt) !== JSON.stringify(cfg.leadTime);
  const bands = lt.lengthBands || [];
  const byLength = bands.length > 0;
  const none: PriceAdjust = { type: 'none', value: 0 };
  const setTier = (i: number, p: Partial<LeadTier>) => setLt(x => ({ ...x, tiers: x.tiers.map((t, j) => (j === i ? { ...t, ...p } : t)) }));
  const setCell = (i: number, k: number, a: PriceAdjust) => setLt(x => ({ ...x, tiers: x.tiers.map((t, j) => (j === i ? { ...t, byLength: bands.map((_, m) => (m === k ? a : (t.byLength?.[m] || t.adjust))) } : t)) }));
  const useBands = (next: LengthBand[]) => setLt(x => ({
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
  const rateText = rateBands.length ? rateBands.map(lengthLabel).join(', ') : '';
  const mono = (t: { fromHours: number; toHours: number | null }) => `${t.fromHours} – ${t.toHours == null ? '∞' : t.toHours} h`;
  return (
    <div className="space-y-4">
      {/* Header, like Rates → Rate periods */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-slate-900">Last-minute pricing</h3>
          <p className="text-[13px] text-slate-500">Raise or lower your published rate by how long before pick-up the customer books, optionally per rate band.</p>
        </div>
        <span className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700">
          <Switch on={lt.enabled} onChange={b => setLt(x => ({ ...x, enabled: b }))} label="Last-minute pricing" />{lt.enabled ? 'On' : 'Off'}
        </span>
        <select value="" aria-label="Add booking window" onChange={e => {
          const v = e.target.value; if (!v) return;
          if (v === 'custom') addWindow({ fromHours: sorted.length ? (sorted[sorted.length - 1].toHours ?? sorted[sorted.length - 1].fromHours) : 0, toHours: null });
          else { const w = WINDOW_PRESETS[Number(v)]; addWindow(w); }
        }} className={`${selectCls} h-9 font-medium`}>
          <option value="">＋ Add window</option>
          {WINDOW_PRESETS.map((w, k) => <option key={w.label} value={k} disabled={has(w)}>{w.label}{has(w) ? ' (added)' : ''}</option>)}
          <option value="custom">Custom window…</option>
        </select>
        <Button variant="primary" disabled={!dirty} onClick={() => onSave({ ...cfg, leadTime: lt }, `${lt.tiers.length} window(s)${byLength ? ` × ${bands.length} rental length(s)` : ''}`)}>Save</Button>
      </div>

      {/* Status line, like "Rates in sync with last publish" */}
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
        {lt.enabled
          ? <Badge tone="success">On · {lt.tiers.length} window{lt.tiers.length === 1 ? '' : 's'}{byLength ? ` × ${bands.length} rental lengths` : ''}</Badge>
          : <Badge tone="muted">Off · brokers get your normal rates</Badge>}
        {dirty && <Badge tone="warning">Unsaved changes</Badge>}
        <span className="text-slate-500">Works on your existing rates, periods and bands: it never creates a new period. Bookings outside these windows keep your normal rates.</span>
      </div>

      {/* The grid, like Rates → Price grid */}
      <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-slate-500">Rental length</span>
          <div className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200">
            {([[false, 'Same for all'], [true, 'By rate band']] as const).map(([v, l]) => (
              <button key={String(v)} type="button" aria-pressed={byLength === v} onClick={() => useBands(v ? (bands.length ? bands : (rateBands.length ? rateBands : DEFAULT_BANDS)) : [])}
                className={`h-7 px-3 rounded-md text-[13px] font-medium ${byLength === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{l}</button>
            ))}
          </div>
          {byLength && <span className="text-[12px] text-slate-500">Columns are your rate bands from the Rates tab{rateText ? ` (${rateText})` : ''}.</span>}
          {byLength && rateBands.length > 0 && JSON.stringify(bands) !== JSON.stringify(rateBands) && (
            <button type="button" onClick={() => useBands(rateBands)} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-amber-50 border border-amber-200 text-[12px] font-medium text-amber-800">Your rate bands changed · Update columns</button>
          )}
          <span className="ml-auto inline-flex items-center gap-2 text-[12px] text-slate-500">Preview on a base rate of
            <input type="number" min={1} value={base} onChange={e => setBase(Math.max(1, Number(e.target.value) || 1))} aria-label="Preview base rate"
              className="w-16 h-7 px-2 rounded-md border border-slate-200 text-right text-[12px] font-mono tabular-nums" /> / day</span>
        </div>

        {lt.tiers.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-[14px] font-semibold text-slate-800">No booking windows yet</p>
            <p className="text-[13px] text-slate-500 mt-1">Use <b>＋ Add window</b> above, for example “Less than 24 hours”.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {WINDOW_PRESETS.slice(0, 3).map(w => <Button key={w.label} size="sm" onClick={() => addWindow(w)}>＋ {w.label}</Button>)}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Booked before pick-up</th>
                  {cols.map((b, k) => (
                    <th key={k} className="text-right px-4 py-2 align-bottom">
                      {b ? (
                        <span className="inline-flex flex-col items-end">
                          <span className="text-[13px] font-semibold text-slate-900">{lengthLabel(b)}</span>
                          <span className="text-[11px] font-mono text-slate-400">rate band</span>
                        </span>
                      ) : <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Every rental length</span>}
                    </th>
                  ))}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lt.tiers.map((t, i) => (
                  <tr key={t.id} className="group align-top hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="text-[14px] font-semibold text-slate-900">{windowShort(t)}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-mono text-slate-400">
                        <input type="number" min={0} value={t.fromHours} onChange={e => setTier(i, { fromHours: Math.max(0, Number(e.target.value) || 0) })} aria-label="From hours" className="w-12 h-5 px-1 rounded border border-transparent group-hover:border-slate-200 text-right bg-transparent" />–
                        <input type="number" min={0} value={t.toHours ?? ''} placeholder="∞" onChange={e => setTier(i, { toHours: e.target.value === '' ? null : Number(e.target.value) })} aria-label="To hours" className="w-12 h-5 px-1 rounded border border-transparent group-hover:border-slate-200 text-right bg-transparent" /> h before pick-up
                      </p>
                    </td>
                    {cols.map((b, k) => (
                      <td key={k} className="px-4 py-3 text-right">
                        <CellEditor base={base} value={b ? cellOf(t, k) : t.adjust} label={`${windowShort(t)}${b ? `, ${lengthLabel(b)}` : ''}`}
                          onChange={v => (b ? setCell(i, k, v) : setTier(i, { adjust: v }))} />
                      </td>
                    ))}
                    <td className="px-2 py-3 text-right">
                      <button type="button" onClick={() => setLt(x => ({ ...x, tiers: x.tiers.filter((_, j) => j !== i) }))} title="Remove window" aria-label={`Remove ${windowShort(t)}`}
                        className="w-7 h-7 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 focus:opacity-100">✕</button>
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50/70">
                  <td className="px-4 py-3"><p className="text-[13px] font-semibold text-slate-600">Any other time</p><p className="text-[11px] font-mono text-slate-400">{sorted.length ? `outside ${sorted.map(mono).join(', ')}` : ''}</p></td>
                  {cols.map((_, k) => <td key={k} className="px-4 py-3 text-right"><span className="text-[13px] font-semibold text-slate-500">Normal rate</span><p className="text-[11px] font-mono text-slate-400">{money(base)} / day</p></td>)}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {overlaps && <p className="px-4 py-2 border-t border-slate-100 text-[12px] text-amber-700">Two windows overlap. The window that starts first is used for the overlapping hours.</p>}
        <div className="px-4 py-2.5 border-t border-slate-100 flex flex-wrap items-center gap-3 bg-slate-50/40">
          <span className="text-[12px] text-slate-500">Applies to</span>
          <Chips options={PRICE_CHANNELS} value={lt.channels} onChange={v => setLt(x => ({ ...x, channels: v as PriceChannelType[] }))} allLabel="All channel types" />
          <span className="ml-auto text-[11px] text-slate-400"><span className="text-amber-600 font-semibold">+</span> raises the rate · <span className="text-emerald-600 font-semibold">−</span> lowers it</span>
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
    <div className="space-y-4">
    <Explainer title="Price limits: a safety net for every rule" exampleTitle={l.limits.maxDaily != null || l.limits.minDaily != null ? 'With your limits' : 'Example limits'}
      example={<div className="space-y-2 text-[12px]">
        <div><p className="text-slate-500 mb-1">Eid +50% and last minute +40% would give {money(hi)}:</p><Chain steps={[{ label: 'Rules give', value: hi, tone: 'lead' }, { label: 'Maximum', value: Math.min(hi, max), note: `max ${max}`, tone: 'final' }]} /></div>
        <div><p className="text-slate-500 mb-1">Low season −40% would give {money(lo)}:</p><Chain steps={[{ label: 'Rules give', value: lo, tone: 'season' }, { label: 'Minimum', value: Math.max(lo, min), note: `min ${min}`, tone: 'final' }]} /></div>
      </div>}>
      <p>Whatever the seasons, events and last-minute rules do, the daily price never goes <b>below your minimum</b> or <b>above your maximum</b>.</p>
      <p>Set one limit for every car group, and a different one for some groups if you like (for example a higher maximum for luxury cars). Leave a box empty for no limit.</p>
    </Explainer>
    <Panel title="Your price limits" subtitle="Amounts are in each channel's currency. Leave a box empty for no limit."
      actions={<Button size="sm" variant="primary" disabled={!dirty} onClick={() => onSave({ ...cfg, limits: l.limits }, 'Daily price limits', text({ limits: cfg.limits }), text(l))}>Save</Button>}>
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-slate-700">
          <span className="font-semibold">Every group:</span>
          minimum <NumOpt value={l.limits.minDaily} onChange={n => setL(x => ({ ...x, limits: { ...x.limits, minDaily: n } }))} label="Minimum daily price" />
          maximum <NumOpt value={l.limits.maxDaily} onChange={n => setL(x => ({ ...x, limits: { ...x.limits, maxDaily: n } }))} label="Maximum daily price" /> a day
        </div>
        <div className="overflow-x-auto">
          <table className={`${table.wrap} max-w-xl`}>
            <thead className={table.head}><tr>{['Group', 'Minimum a day', 'Maximum a day'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
            <tbody className={table.body}>
              {groups.map(g => (
                <tr key={g} className={table.row}>
                  <td className={`${table.td} font-mono text-[12px] font-semibold`}>{g}</td>
                  <td className={table.td}><NumOpt value={l.limits.groups?.[g]?.minDaily} placeholder={l.limits.minDaily != null ? String(l.limits.minDaily) : '—'} onChange={n => setG(g, { minDaily: n })} label={`${g} minimum`} /></td>
                  <td className={table.td}><NumOpt value={l.limits.groups?.[g]?.maxDaily} placeholder={l.limits.maxDaily != null ? String(l.limits.maxDaily) : '—'} onChange={n => setG(g, { maxDaily: n })} label={`${g} maximum`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
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
  return (
    <div className="space-y-4">
    <Explainer title="Choose how each channel is priced"
      example={<div className="space-y-2 text-[12px]">{MODES.map(([k, l, d]) => <div key={k}><p className="font-semibold text-slate-800">{l}</p><p className="text-slate-500">{d}</p></div>)}</div>} exampleTitle="The three options">
      <p>Every channel starts on <b>Fixed rates</b>, so nothing changes until you decide. Switch a channel to <b>Smart pricing</b> to use all your rules, or to <b>Seasons only</b> for steadier prices.</p>
      <p>The <b>type</b> (website, app, walk-in, broker, OTA, corporate, travel agent) lets a rule apply to some channels only, for example a website-only discount.</p>
      <p className="text-slate-500">A change is live at once for that channel's next search. Bookings already made keep their price.</p>
    </Explainer>
    <Panel title="Channels" subtitle="How each XML channel is priced. A change here is live at once for that channel's next search; bookings already made keep their price.">
      {aggregators.length === 0 ? <EmptyState title="No channels yet" hint="Add a channel first." /> : (
        <div className="overflow-x-auto">
          <table className={`${table.wrap} min-w-[860px]`}>
            <thead className={table.head}><tr>{['Channel', 'Rate mode', 'Channel type', 'What the broker gets'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
            <tbody className={table.body}>
              {aggregators.map(a => {
                const mode = a.pricingMode || 'net';
                return (
                  <tr key={a.id} className={table.row}>
                    <td className={table.td}><p className="font-semibold text-slate-900">{a.name}</p><p className="text-[11px] text-slate-500 font-mono">{a.channelCode} · {a.currency || 'USD'}</p></td>
                    <td className={table.td}>
                      <select value={mode} aria-label={`${a.name} rate mode`} className={`${selectCls} h-8 text-[12px]`} onChange={e => {
                        const next = e.target.value as ChannelRateMode;
                        if (next !== 'net' && !published && !window.confirm('No rate rules are published yet, so this channel keeps its net rates until you publish. Continue?')) return;
                        if (!window.confirm(`${a.name}: change the rate mode to ${MODES.find(m => m[0] === next)![1]}? Its next search is priced this way.`)) return;
                        const updated = { ...a, pricingMode: next };
                        onUpdate(updated, describe(a), describe(updated));
                      }}>
                        {MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </td>
                    <td className={table.td}>
                      <select value={a.channelType || 'broker'} aria-label={`${a.name} channel type`} className={`${selectCls} h-8 text-[12px]`}
                        onChange={e => { const updated = { ...a, channelType: e.target.value as PriceChannelType }; onUpdate(updated, describe(a), describe(updated)); }}>
                        {PRICE_CHANNELS.map(([k, l]) => <option key={k} value={k}>{l.replace(/s$/, '').replace('accounts', 'account')}</option>)}
                      </select>
                    </td>
                    <td className={`${table.td} text-[12px] text-slate-600`}>{MODES.find(m => m[0] === mode)![2]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-4 py-3 border-t border-slate-100 text-[12px] text-slate-500">The broker always sees one net amount per offer; the customer price is the broker's own. Fixed amounts and limits in the rules are read in each channel's currency.</p>
    </Panel>
    </div>
  );
};

// ---------------------------------------------------------------- preview

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

  if (!agg) return <Panel><EmptyState title="No channels yet" hint="Add a channel and publish its rates to preview prices." /></Panel>;
  return (
    <div className="space-y-4">
      <Explainer title="Try any booking before you publish">
        <p>Pick a channel, a car group and the dates. The price is worked out day by day, exactly as a broker will see it, and updates as soon as you change anything.</p>
        <p className="text-slate-500">Use <b>Draft</b> to test changes you have not published yet.</p>
      </Explainer>
      <Panel title="Try a price" subtitle="Day by day, with the rule that changed each day.">
        <div className="p-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Channel"><select value={agg.id} onChange={e => { setAggId(e.target.value); setGroup(''); setLoc(''); setRet(''); }} className={`${selectCls} w-full`}>{aggregators.map(a => <option key={a.id} value={a.id}>{a.name} ({a.channelCode})</option>)}</select></Field>
          <Field label="Car group"><select value={g} onChange={e => setGroup(e.target.value)} className={`${selectCls} w-full font-mono`}>{(aggGroups.length ? aggGroups : groups).map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Pick-up location"><select value={l} onChange={e => setLoc(e.target.value)} className={`${selectCls} w-full`}>{(locs.length ? locs.map(x => x.code) : [l]).map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Return location"><select value={r} onChange={e => setRet(e.target.value)} className={`${selectCls} w-full`}>{(locs.length ? locs.map(x => x.code) : [l]).map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Pick-up"><input type="datetime-local" value={pickup} onChange={e => setPickup(e.target.value)} className={inputCls} /></Field>
          <Field label="Return"><input type="datetime-local" value={dropOff} onChange={e => setDropOff(e.target.value)} className={inputCls} /></Field>
          <Field label="Booked at" hint="for the last-minute rule"><input type="datetime-local" value={bookedAt} onChange={e => setBookedAt(e.target.value)} className={inputCls} /></Field>
          <Field label="Rules"><select value={which} onChange={e => setWhich(e.target.value as 'draft' | 'published')} className={`${selectCls} w-full`}><option value="draft">Draft (not yet published)</option><option value="published" disabled={!state.published}>Published v{state.version}</option></select></Field>
          <Field label="Rate mode"><select value={modeOverride} onChange={e => setModeOverride(e.target.value as '' | ChannelRateMode)} className={`${selectCls} w-full`}>
            <option value="">{agg.pricingMode && agg.pricingMode !== 'net' ? `As the channel (${agg.pricingMode})` : 'Dynamic (channel is on net rates)'}</option>
            <option value="dynamic">Dynamic</option><option value="restricted">Restricted</option><option value="net">Net rates</option></select></Field>
          <Field label="Promotion code"><select value={promo} onChange={e => setPromo(e.target.value)} className={`${selectCls} w-full`}><option value="">None</option>{(pr.promotions || []).map(p => <option key={p.code}>{p.code}</option>)}</select></Field>
          <Field label="Extras">
            <div className="flex flex-wrap gap-1.5">{(agg.extras || []).length === 0 ? <span className="text-[12px] text-slate-400">None on this channel</span> : (agg.extras || []).map(x => (
              <button key={x.id} type="button" aria-pressed={extras.includes(x.id)} onClick={() => setExtras(v => (v.includes(x.id) ? v.filter(y => y !== x.id) : [...v, x.id]))}
                className={`h-7 px-2 rounded-md text-[12px] border ${extras.includes(x.id) ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'bg-white text-slate-600 border-slate-200'}`}>{x.name}</button>))}</div>
          </Field>
        </div>
      </Panel>

      {!cfg ? <Panel><EmptyState title="Nothing published yet" hint="Choose the draft, or publish the rules first." /></Panel>
        : !result ? <Panel><EmptyState title="Check the dates" hint="The return must be after the pick-up." /></Panel>
        : !result.bookable ? <Panel><div className="p-4 flex items-center gap-3"><Badge tone="danger">Not offered</Badge><p className="text-[13px] text-slate-700">{result.reason}</p></div></Panel>
        : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Panel title="Day by day" subtitle={`${result.days} rental day${result.days === 1 ? '' : 's'} (rate band ${bandText}) · ${result.leadHours.toFixed(0)} h between booking and pick-up · ${mode} mode`}>
              <div className="overflow-x-auto">
                <table className={`${table.wrap} min-w-[640px]`}>
                  <thead className={table.head}><tr>{['Day', 'Base', 'Rules applied', 'Rate'].map(h => <th key={h} className={`${table.th} ${h === 'Base' || h === 'Rate' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                  <tbody className={table.body}>
                    {result.perDay.map(d => (
                      <tr key={d.date} className={table.row}>
                        <td className={`${table.td} whitespace-nowrap tabular-nums`}>{new Date(`${d.date}T12:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}</td>
                        <td className={`${table.td} text-right tabular-nums text-slate-500`}>{money(d.base)}</td>
                        <td className={`${table.td} text-[12px]`}>
                          {d.steps.length === 0 ? <span className="text-slate-400">Base rate</span> : (
                            <ol className="space-y-0.5">{d.steps.map((s, i) => (
                              <li key={i} className="flex flex-wrap items-center gap-1.5">
                                <span className={`px-1.5 rounded text-[10px] font-semibold uppercase ${s.stage === 'season' ? 'bg-violet-50 text-violet-700' : s.stage === 'lead' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>{s.stage === 'lead' ? 'last minute' : s.stage}</span>
                                <span className="text-slate-700">{s.label}</span>
                                <span className="text-slate-400 tabular-nums">{money(s.from)} → {money(s.to)}</span>
                              </li>))}</ol>
                          )}
                        </td>
                        <td className={`${table.td} text-right font-semibold tabular-nums`}>{money(d.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t border-slate-200 bg-slate-50">
                    <td className={`${table.td} font-semibold`} colSpan={3}>{summarise(result.perDay).map(x => `${x.count} × ${money(x.rate)}${x.rule ? ` (${x.rule})` : ''}`).join(' + ')}</td>
                    <td className={`${table.td} text-right font-semibold tabular-nums`}>{money(result.total)}</td>
                  </tr></tfoot>
                </table>
              </div>
              {result.notes.length > 0 && <ul className="px-4 py-2 border-t border-slate-100 text-[12px] text-slate-500 list-disc pl-8">{result.notes.map(n => <li key={n}>{n}</li>)}</ul>}
            </Panel>

            <Panel title="Price shown" subtitle={`${agg.name} · ${cur}`}>
              {quote && (
                <div className="p-4 space-y-3 text-[13px]">
                  <div className="flex items-baseline justify-between"><span className="text-slate-500">Average daily rate</span><span className="font-semibold tabular-nums">{money(result.total / result.days)}</span></div>
                  <ul className="space-y-1.5 border-t border-slate-100 pt-3">
                    {quote.lines.map((x, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3"><span className={x.kind === 'discount' ? 'text-emerald-700' : 'text-slate-600'}>{x.label}</span><span className="tabular-nums">{x.amount < 0 ? '−' : ''}{money(Math.abs(x.amount))}</span></li>
                    ))}
                  </ul>
                  <div className="flex items-baseline justify-between border-t border-slate-200 pt-3"><span className="font-semibold text-slate-900">Total</span><span className="text-xl font-semibold tabular-nums">{money(quote.total)} <span className="text-[12px] font-medium text-slate-500">{cur}</span></span></div>
                  {pr.taxPercent ? <p className="text-[11px] text-slate-500">{pr.taxIncluded === false ? 'Tax added above.' : `Includes ${pr.taxName || 'tax'} ${pr.taxPercent}%: ${money(quote.tax)}.`}</p> : null}
                  <dl className="border-t border-slate-100 pt-3 space-y-1.5 text-[12px]">
                    <div className="flex justify-between"><dt className="text-slate-500">Deposit</dt><dd className="tabular-nums">{car ? money(car.securityDeposit || 0) : '—'}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Excess</dt><dd className="tabular-nums">{car ? money(car.excess || 0) : '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Payment</dt><dd className="text-right">{br.paymentModel === 'BROKER_PREPAID' ? 'Prepaid to the broker' : 'Pay at the counter'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Cancellation</dt><dd className="text-right">{(br.cancellationTiers || []).length
                      ? br.cancellationTiers!.map(t => `<${t.hoursBefore} h: ${t.feePercent}%`).join(', ')
                      : `Free until ${br.freeCancellationHours ?? 48} h before, then ${br.lateCancellationFeePercent ?? 100}%`}</dd></div>
                  </dl>
                  <p className="text-[11px] text-slate-400">The broker's own terms (Price rules tab) are applied by the server on top of this net rental.</p>
                </div>
              )}
            </Panel>
          </div>
        )}
    </div>
  );
};

// ---------------------------------------------------------------- history

const HistoryPanel: React.FC<{ state: DynamicPricingState }> = ({ state }) => (
  <Panel title="Change history" subtitle="Every change to the rules, who made it and when, with the old and new values. Kept for the last 500 changes.">
    {(state.history || []).length === 0 ? <EmptyState title="No changes yet" /> : (
      <div className="overflow-x-auto">
        <table className={`${table.wrap} min-w-[900px]`}>
          <thead className={table.head}><tr>{['When', 'Who', 'Change', 'What', 'Before', 'After'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
          <tbody className={table.body}>
            {state.history.map((h, i) => (
              <tr key={i} className={table.row}>
                <td className={`${table.td} whitespace-nowrap tabular-nums text-[12px]`}>{new Date(h.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                <td className={`${table.td} text-[12px]`}>{h.by}</td>
                <td className={table.td}><Badge tone={h.action === 'Published' ? 'success' : /deleted|off/i.test(h.action) ? 'warning' : 'default'} dot={false}>{h.action}</Badge></td>
                <td className={`${table.td} text-[12px] text-slate-700`}>{h.detail}</td>
                <td className={`${table.td} text-[12px] text-slate-500`}>{h.before ?? '—'}</td>
                <td className={`${table.td} text-[12px] text-slate-700`}>{h.after ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </Panel>
);

export default RateRulesView;
