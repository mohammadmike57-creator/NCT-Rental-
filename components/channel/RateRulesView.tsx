import React, { useCallback, useMemo, useState } from 'react';
import { Aggregator, Fleet } from '../../types';
import { Button, EmptyState } from '../ui/Crm';
import { saveAllData, loadedSection } from '../../services/api';
import { LengthBand, DynamicPricingConfig, DynamicPricingState, PRICE_CHANNELS, SeasonKind, SeasonRule, describeAdjust, emptyPricingState } from '../../services/dynamicPricing';
import { Card, Delta, Icons, Icons2, Popover, SectionHead, Stepper, Toggle, toneOf, toneText } from './pricingKit';
import { fleetSippCodes } from '../../services/channelManager';
import { LeadTimeEditor } from './rates/LeadTimeEditor';
import { ChannelsEditor, LimitsEditor } from './rates/LimitsAndChannels';
import { HistoryPanel, PreviewPanel } from './rates/PreviewAndHistory';
import { Overview } from './rates/RateRulesOverview';
import { RuleDialog, SeasonExplainer, SeasonTimeline } from './rates/SeasonPanels';
import { PRESETS, TABS, TAB_ICONS, Tab, clone, exRate, fmtDate, kindLabel, kindTone, money, newRule, r2, uid } from './rates/rateRulesKit';

/**
 * OTA XML → Rate rules: seasonal / event rates and last-minute pricing for the XML channels (prices never depend on cars left),
 * edited as a draft, tested in the preview and published. Only channels switched to "Dynamic" or
 * "Restricted" (Channels tab) are priced with the published rules; every other channel keeps its net rates.
 */

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


export default RateRulesView;
