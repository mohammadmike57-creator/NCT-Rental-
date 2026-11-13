import React, { useEffect, useState } from 'react';
import { Aggregator } from '../../../types';
import { Button, EmptyState, selectCls } from '../../ui/Crm';
import { ChannelRateMode, DynamicPricingConfig, PRICE_CHANNELS, PriceChannelType } from '../../../services/dynamicPricing';
import { Card, FieldLabel, Icons2, SectionHead, Seg, StateChip, Stepper } from '../pricingKit';
import { Chain, Explainer, money, r2 } from './rateRulesKit';

/** Rate rules → Limits and Channels. */
// ---------------------------------------------------------------- limits

export const LimitsEditor: React.FC<{ base: number; cfg: DynamicPricingConfig; groups: string[]; onSave: (c: DynamicPricingConfig, what: string, before: string, after: string) => void }> = ({ base, cfg, groups, onSave }) => {
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

export const ChannelsEditor: React.FC<{ aggregators: Aggregator[]; published: boolean; onUpdate: (a: Aggregator, before: string, after: string) => void }> = ({ aggregators, published, onUpdate }) => {
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
