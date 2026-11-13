import React from 'react';
import { Aggregator } from '../../../types';
import { Button } from '../../ui/Crm';
import { DynamicPricingConfig, PriceAdjust, describeAdjust } from '../../../services/dynamicPricing';
import { BuildStep, BuildUp, Card, Icons2, StateChip, Toggle } from '../pricingKit';
import { BaseInput, Chain, Explainer, Tab, exRate, r2 } from './rateRulesKit';

/** Rate rules → Overview: what is switched on and one example day. */
// ---------------------------------------------------------------- overview

export const Overview: React.FC<{ cfg: DynamicPricingConfig; base: number; setBase: (n: number) => void; published: boolean; aggregators: Aggregator[]; onToggle: (k: 'seasonal' | 'leadTime' | 'stack', on: boolean) => void; onGo: (t: Tab) => void }> = ({ cfg, base, setBase, published, aggregators, onToggle, onGo }) => {
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
