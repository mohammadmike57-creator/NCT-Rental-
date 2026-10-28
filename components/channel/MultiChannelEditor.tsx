import React, { useEffect, useMemo, useState } from 'react';
import { Aggregator, AvailableExtra, ChannelBookingRules, Fleet, RatePlan, RatePlanSubmission, StopSale } from '../../types';
import { Badge, Button, Dialog, EmptyState, Panel, Plate, Segmented, inputCls, labelCls, selectCls, table, textareaCls } from '../ui/Crm';
import { CheckCircleIcon, GlobeAltIcon, PlusIcon, TrashIcon } from '../icons';
import ManagePeriodModal from '../ManagePeriodModal';
import ManageAggregatorExtrasView from '../ManageAggregatorExtrasView';
import ManageTermsView from '../ManageTermsView';
import ManageStopSaleView from '../ManageStopSaleView';
import { AllotmentsSection, CancellationSchedule, PricingSection } from './CommercialRules';
import { Section } from './BookingApiView';
import {
  applyDraft, BulkDraft, BulkMode, BulkModule, BulkOptions, draftFrom, emptyDraft, MODULE_LABEL, PolicyKey, stopSalesForChannels,
} from '../../services/channelBulk';
import {
  channelCurrency, channelStatus, fingerprint, fromPrice, generateRateSheetXml, nextVersion, submissionVersion, validateChannel,
} from '../../services/channelManager';

export interface BulkResult { id: string; name: string; ok: boolean; message: string }

interface Props {
  aggregators: Aggregator[];
  fleet: Fleet;
  availableExtras: AvailableExtra[];
  stopSales: StopSale[];
  currentUserName?: string;
  /** Saves the changed channels and new stop sales, then delivers the ids given; returns one line per channel. */
  onApply: (updated: Aggregator[], newStopSales: StopSale[], deliverIds: string[], summary: string) => Promise<BulkResult[]>;
}

/** The modules this editor offers, in order (sell currencies stay per channel: each has its own base currency). */
const MODULES: BulkModule[] = ['rates', 'extras', 'terms', 'policies', 'pricing', 'allotments', 'stopSales'];
const MODULE_HINT: Record<BulkModule, string> = {
  rates: 'Seasons, SIPP groups and length-of-rental prices',
  extras: 'Equipment and add-ons with broker prices',
  terms: 'Rental terms sent with the rate sheet',
  policies: 'Payment model, cancellation, cut-off, rental length, driver ages, no-shows',
  pricing: 'Tax, included km, insurance covers, promotions, young/senior driver fees',
  allotments: 'Cars reserved per group and period, stop-sell by group',
  currencies: 'Currencies brokers may book in',
  stopSales: 'Close a car or a category for some dates, on the channels you choose',
};

const STORE_KEY = 'nct.channelEditor.v1';
type Stored = { draft: BulkDraft; touched: Partial<Record<BulkModule, boolean>>; source?: string; savedAt?: string };
const load = (): Stored | null => { try { const s = localStorage.getItem(STORE_KEY); return s ? JSON.parse(s) : null; } catch { return null; } };
const store = (v: Stored) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* private window: the draft lives for this visit */ } };

/** A number that may be left empty (= each channel keeps its own value). */
const OptNumber: React.FC<{ label: string; hint?: string; value?: number; onChange: (n?: number) => void; suffix?: string; step?: number }> =
  ({ label, hint, value, onChange, suffix, step = 1 }) => (
    <label className="block">
      <span className={labelCls}>{label}{hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}</span>
      <div className="relative">
        <input type="number" min={0} step={step} value={value ?? ''} placeholder="Unchanged"
          onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className={`${inputCls} tabular-nums ${suffix ? 'pr-16' : ''}`} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
      </div>
    </label>
  );

const MultiChannelEditor: React.FC<Props> = ({ aggregators, fleet, availableExtras, stopSales, currentUserName, onApply }) => {
  const initial = useMemo(load, []);
  const [draft, setDraft] = useState<BulkDraft>(() => ({ ...emptyDraft(), ...(initial?.draft || {}) }));
  const [touched, setTouched] = useState<Partial<Record<BulkModule, boolean>>>(initial?.touched || {});
  const [source, setSource] = useState<string | undefined>(initial?.source);
  const [savedAt, setSavedAt] = useState<string | undefined>(initial?.savedAt);
  const [view, setView] = useState<BulkModule | 'apply'>('rates');
  const [loadFrom, setLoadFrom] = useState('');
  const [editing, setEditing] = useState<RatePlan | null>(null);

  // Apply step
  const [selected, setSelected] = useState<string[]>([]);
  const [modules, setModules] = useState<BulkModule[]>([]);
  const [modes, setModes] = useState<Pick<BulkOptions, 'ratesMode' | 'extrasMode' | 'allotmentsMode'>>({ ratesMode: 'merge', extrasMode: 'merge', allotmentsMode: 'merge' });
  const [publish, setPublish] = useState(true);
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<BulkResult[] | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => { const at = new Date().toISOString(); store({ draft, touched, source, savedAt: at }); setSavedAt(at); }, 400);
    return () => window.clearTimeout(t);
  }, [draft, touched, source]);

  const edit = <K extends keyof BulkDraft>(module: BulkModule, key: K, value: BulkDraft[K]) => {
    setDraft(d => ({ ...d, [key]: value }));
    setTouched(t => ({ ...t, [module]: true }));
  };
  const setPolicy = <K extends PolicyKey>(k: K, v: ChannelBookingRules[K] | undefined) => {
    const next = { ...draft.policies } as Record<string, unknown>;
    if (v === undefined) delete next[k]; else next[k] = v;
    edit('policies', 'policies', next as BulkDraft['policies']);
  };

  const groups = useMemo(() => Array.from(new Set(fleet.map(v => v.sippCode).filter((c): c is string => !!c))).sort(), [fleet]);
  const counts: Record<BulkModule, string> = {
    rates: `${draft.ratePlans.length} period${draft.ratePlans.length === 1 ? '' : 's'}`,
    extras: `${draft.extras.length} extra${draft.extras.length === 1 ? '' : 's'}`,
    terms: draft.terms.trim() ? `${draft.terms.trim().split(/\s+/).length} words` : 'empty',
    policies: `${Object.keys(draft.policies).length} rule${Object.keys(draft.policies).length === 1 ? '' : 's'} set`,
    pricing: `${(draft.pricing.coverages || []).length} covers · ${(draft.pricing.promotions || []).length} promotions`,
    allotments: `${draft.allotments.length} allotment${draft.allotments.length === 1 ? '' : 's'}`,
    currencies: `${Object.keys(draft.currencies).length}`,
    stopSales: `${draft.stopSales.length} block${draft.stopSales.length === 1 ? '' : 's'}`,
  };
  const editedModules = MODULES.filter(m => touched[m]);

  const startFrom = () => {
    const agg = aggregators.find(a => a.id === loadFrom);
    if (!agg) return;
    if ((editedModules.length || draft.ratePlans.length) && !window.confirm(`Replace the editor's content with the current settings of ${agg.name}?`)) return;
    setDraft(draftFrom(agg));
    setTouched({});
    setSource(agg.name);
    setResults(null);
  };
  const clear = () => {
    if (!window.confirm('Clear the editor? Channels are not changed.')) return;
    setDraft(emptyDraft()); setTouched({}); setSource(undefined); setResults(null);
  };
  const openApply = () => {
    setModules(m => (m.length ? m.filter(x => MODULES.includes(x)) : editedModules));
    setResults(null);
    setView('apply');
  };

  // ---- Rates ---------------------------------------------------------------
  const plans = [...draft.ratePlans].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const addPeriod = () => {
    const lastEnd = plans.reduce((m, p) => (p.endDate > m ? p.endDate : m), '');
    const start = lastEnd ? new Date(new Date(`${lastEnd}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const end = new Date(`${start}T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 3); end.setUTCDate(end.getUTCDate() - 1);
    const p: RatePlan = { id: `draft-${Date.now()}`, name: 'New season', startDate: start, endDate: end.toISOString().slice(0, 10), sippRates: [] };
    edit('rates', 'ratePlans', [...draft.ratePlans, p]);
    setEditing(p);
  };
  const duplicate = (plan: RatePlan) => {
    const s = Date.now();
    const c: RatePlan = JSON.parse(JSON.stringify(plan));
    c.id = `draft-${s}`; c.name = `${plan.name} (copy)`;
    c.sippRates = c.sippRates.map((r, i) => ({ ...r, id: `sipp-${s}-${i}`, tiers: r.tiers.map((t, j) => ({ ...t, id: `tier-${s}-${i}-${j}` })) }));
    edit('rates', 'ratePlans', [...draft.ratePlans, c]);
  };

  // ---- Apply ---------------------------------------------------------------
  const opts: BulkOptions = { modules, ...modes };
  const preview = useMemo(() => {
    const stamp = Date.now();
    return aggregators.filter(a => selected.includes(a.id)).map(a => {
      const { next, changes } = applyDraft(a, draft, opts, stamp);
      const ratesChanged = modules.includes('rates') && changes.some(c => c.startsWith('Rates'));
      const v = validateChannel(next, fleet);
      const deliverable = !!next.connectionDetails?.apiUrl && channelStatus(next) !== 'paused';
      return { agg: a, next, changes, ratesChanged, canPublish: v.canPublish, errors: v.issues.filter(i => i.level === 'error').map(i => i.message), deliverable };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aggregators, selected, draft, modules, modes, fleet]);
  const withChanges = preview.filter(p => p.changes.length);
  const currencies = Array.from(new Set(preview.map(p => channelCurrency(p.agg))));

  const run = async () => {
    setConfirm(false);
    setBusy(true);
    const stamp = Date.now();
    const deliver: string[] = [];
    const updated = withChanges.map(p => {
      if (!(publish && p.ratesChanged && p.canPublish)) return p.next;
      const version = nextVersion(p.next);
      const xml = generateRateSheetXml(p.next, stopSales, fleet, { version });
      const sub: RatePlanSubmission = {
        id: `sub-${stamp}-${p.agg.id}`, submittedAt: new Date().toISOString(), ratePlans: JSON.parse(JSON.stringify(p.next.currentRatePlans || [])),
        version, publishedBy: currentUserName, note: note.trim() || 'Multi-channel update', currency: channelCurrency(p.next), checksum: fingerprint(xml),
        warningCount: validateChannel(p.next, fleet).warnings,
      };
      if (p.deliverable) deliver.push(p.agg.id);
      return { ...p.next, ratePlanHistory: [sub, ...(p.next.ratePlanHistory || [])] };
    });
    const newStops = modules.includes('stopSales') ? stopSalesForChannels(draft, selected, stamp) : [];
    const names = preview.map(p => p.agg.name).join(', ');
    const summary = `Multi-channel update (${modules.map(m => MODULE_LABEL[m].toLowerCase()).join(', ')}) applied to ${names}`;
    const out = await onApply(updated, newStops, deliver, summary);
    const untouched = preview.filter(p => !p.changes.length).map(p => ({ id: p.agg.id, name: p.agg.name, ok: true, message: 'Already up to date: nothing changed' }));
    setResults([...out, ...untouched]);
    // The blocks now exist on the channels: applying again must not add them twice. The rest stays for reuse.
    if (newStops.length) setDraft(d => ({ ...d, stopSales: [] }));
    setTouched({});
    setModules(m => m.filter(x => x !== 'stopSales'));
    setBusy(false);
  };

  const chip = (on: boolean) => `h-8 px-3 rounded-lg border text-xs font-semibold transition-colors ${on ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`;
  const pol = draft.policies;
  const virtual: Aggregator = { id: 'multi-channel', name: 'the selected channels', connectionDetails: { apiUrl: '', username: '', apiKey: '' }, currentRatePlans: [], ratePlanHistory: [], extras: draft.extras, termsAndConditions: draft.terms };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-white px-4 py-3.5 sm:px-5 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className="w-10 h-10 shrink-0 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-sm"><GlobeAltIcon className="w-5 h-5" /></span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-slate-900">Multi-channel editor</p>
            <p className="text-xs text-slate-600 mt-0.5">
              Prepare rates, periods, extras, terms, policies, pricing, allotments and stop sales once, then apply them to one, several or all channels.
              {source ? <> Started from <b>{source}</b>.</> : ''}{savedAt ? <span className="text-slate-400"> Draft kept in this browser.</span> : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={loadFrom} onChange={e => setLoadFrom(e.target.value)} className={`${selectCls} min-w-[12rem]`} aria-label="Start from a channel">
            <option value="">Start from a channel…</option>
            {aggregators.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <Button size="sm" onClick={startFrom} disabled={!loadFrom}>Load</Button>
          <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[272px_minmax(0,1fr)] gap-4 items-start">
        <Panel title="Sections" subtitle={editedModules.length ? `${editedModules.length} edited` : 'Nothing edited yet'} className="lg:sticky lg:top-4">
          <ul className="divide-y divide-slate-100">
            {MODULES.map(m => (
              <li key={m} onClick={() => setView(m)}
                className={`px-4 py-2.5 cursor-pointer border-l-2 transition-colors ${view === m ? 'bg-indigo-50/60 border-indigo-600' : 'border-transparent hover:bg-slate-50'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-slate-900 truncate">{MODULE_LABEL[m]}</span>
                  {touched[m] && <Badge tone="info" dot={false} className="ml-auto !px-1.5 !py-0 !text-[10px]">edited</Badge>}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500 truncate">{counts[m]}</p>
              </li>
            ))}
          </ul>
          <div className="p-3 border-t border-slate-100">
            <Button variant={view === 'apply' ? 'primary' : 'secondary'} className="w-full" icon={<CheckCircleIcon className="w-4 h-4" />} onClick={openApply}>Review & apply to channels</Button>
          </div>
        </Panel>

        <div className="space-y-4 min-w-0">
          {view === 'rates' && (
            <Panel title="Rates & periods" subtitle="Prices are applied as numbers in each channel's own currency. A period with the same name or dates as a channel's period updates it."
              actions={<Button size="sm" variant="primary" icon={<PlusIcon className="w-4 h-4" />} onClick={addPeriod}>Add period</Button>}>
              {plans.length === 0 ? (
                <EmptyState title="No periods yet" hint="Add a period, or start from a channel to copy its periods." />
              ) : (
                <table className={table.wrap}>
                  <thead><tr className={table.head}>
                    <th className={table.th}>Period</th><th className={table.th}>Dates</th><th className={table.th}>Groups</th>
                    {groups.slice(0, 4).map(g => <th key={g} className={`${table.th} text-right font-mono`}>{g}</th>)}
                    <th className={table.th}><span className="sr-only">Actions</span></th>
                  </tr></thead>
                  <tbody className={table.body}>
                    {plans.map(p => (
                      <tr key={p.id} className={table.row}>
                        <td className={`${table.td} font-medium text-slate-900`}>{p.name}</td>
                        <td className={`${table.td} whitespace-nowrap font-mono text-xs text-slate-600`}>{p.startDate} → {p.endDate}</td>
                        <td className={`${table.td} text-slate-600`}>{p.sippRates.length}</td>
                        {groups.slice(0, 4).map(g => { const v = fromPrice(p, g); return <td key={g} className={`${table.td} text-right tabular-nums`}>{v == null ? <span className="text-slate-300">—</span> : `from ${v.toFixed(2)}`}</td>; })}
                        <td className={`${table.td} text-right whitespace-nowrap`}>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => duplicate(p)}>Duplicate</Button>
                          <Button size="sm" variant="ghost" className="hover:!text-rose-600" icon={<TrashIcon className="w-3.5 h-3.5" />}
                            onClick={() => window.confirm(`Remove "${p.name}" from the editor?`) && edit('rates', 'ratePlans', draft.ratePlans.filter(x => x.id !== p.id))}>Remove</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          )}

          {view === 'extras' && (
            <Panel padded title="Extras" subtitle="Each channel gets these extras and prices (merge keeps the channel's other extras).">
              <ManageAggregatorExtrasView aggregator={virtual} globalExtras={availableExtras} onUpdate={a => edit('extras', 'extras', a.extras)} />
            </Panel>
          )}

          {view === 'terms' && (
            <Panel padded title="Terms & conditions" subtitle="Replaces each channel's terms.">
              <ManageTermsView terms={draft.terms} onUpdate={t => edit('terms', 'terms', t)} />
            </Panel>
          )}

          {view === 'policies' && (
            <div className="grid gap-4 xl:grid-cols-2">
              <Section title="Payment & cancellation" subtitle="Leave a field empty to keep each channel's own value.">
                <label className="block">
                  <span className={labelCls}>Payment model</span>
                  <select value={pol.paymentModel || ''} onChange={e => setPolicy('paymentModel', (e.target.value || undefined) as ChannelBookingRules['paymentModel'])} className={`${selectCls} w-full`}>
                    <option value="">Keep each channel's</option>
                    <option value="PAY_AT_COUNTER">Pay at the counter — the customer pays us at pick-up</option>
                    <option value="BROKER_PREPAID">Broker prepaid — the broker collects and settles with us</option>
                  </select>
                </label>
                {pol.cancellationTiers ? (
                  <>
                    <CancellationSchedule rules={pol as ChannelBookingRules} set={(k, v) => setPolicy(k as PolicyKey, v as never)} />
                    <button type="button" onClick={() => setPolicy('cancellationTiers', undefined)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Keep each channel's cancellation schedule</button>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2.5 flex items-center justify-between gap-3">
                    <span className="text-[13px] text-slate-600">Cancellation schedule: each channel keeps its own.</span>
                    <Button size="sm" onClick={() => setPolicy('cancellationTiers', [{ hoursBefore: 48, feePercent: 100 }])}>Set one for all</Button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <OptNumber label="Modification fee" value={pol.modificationFee} onChange={v => setPolicy('modificationFee', v)} step={0.5} suffix="per change" />
                  <OptNumber label="One-way fee" value={pol.oneWayFee} onChange={v => setPolicy('oneWayFee', v)} step={0.5} suffix="per rental" />
                </div>
              </Section>
              <Section title="Booking limits & no-shows" subtitle="Requests outside these limits are refused.">
                <div className="grid grid-cols-2 gap-3">
                  <OptNumber label="Booking cut-off" value={pol.minLeadHours} onChange={v => setPolicy('minLeadHours', v)} suffix="h before" />
                  <OptNumber label="Book up to" value={pol.maxHorizonDays} onChange={v => setPolicy('maxHorizonDays', v)} suffix="days ahead" />
                  <OptNumber label="Longest rental" value={pol.maxRentalDays} onChange={v => setPolicy('maxRentalDays', v)} suffix="days" />
                  <OptNumber label="Minimum driver age" value={pol.minDriverAge} onChange={v => setPolicy('minDriverAge', v)} suffix="years" />
                  <OptNumber label="Maximum driver age" hint="0 = none" value={pol.maxDriverAge} onChange={v => setPolicy('maxDriverAge', v)} suffix="years" />
                  <OptNumber label="No-show after" value={pol.noShowAfterHours} onChange={v => setPolicy('noShowAfterHours', v)} suffix="h late" />
                  <OptNumber label="No-show fee" value={pol.noShowFeePercent} onChange={v => setPolicy('noShowFeePercent', v)} suffix="% of rental" />
                </div>
              </Section>
            </div>
          )}

          {view === 'pricing' && (
            <PricingSection pricing={draft.pricing} currency="channel currency" groups={groups} onChange={p => edit('pricing', 'pricing', p)} />
          )}

          {view === 'allotments' && (
            <AllotmentsSection allotments={draft.allotments} groups={groups} onChange={a => edit('allotments', 'allotments', a)} />
          )}

          {view === 'stopSales' && (
            <ManageStopSaleView stopSales={draft.stopSales} fleet={fleet} listTitle="Blocks to add" onUpdate={l => edit('stopSales', 'stopSales', l)}
              intro={<div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-[13px] text-amber-800">
                These blocks are added when you apply, and close the car or category on the channels you choose there only. Blocks for every channel stay under <b>Global Stop Sale</b>.
              </div>} />
          )}

          {view === 'apply' && (
            <>
              <Panel title="1. Channels" subtitle={`${selected.length} of ${aggregators.length} selected`}
                actions={<div className="flex gap-1.5">
                  <Button size="sm" onClick={() => setSelected(aggregators.map(a => a.id))}>All</Button>
                  <Button size="sm" onClick={() => setSelected(aggregators.filter(a => channelStatus(a) === 'active').map(a => a.id))}>Live only</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected([])}>None</Button>
                </div>}>
                <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2 p-3">
                  {aggregators.map(a => {
                    const on = selected.includes(a.id);
                    const st = channelStatus(a);
                    const latest = (a.ratePlanHistory || [])[0];
                    return (
                      <li key={a.id}>
                        <label className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${on ? 'border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-500/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                          <input type="checkbox" className="mt-1" checked={on} onChange={() => setSelected(s => (on ? s.filter(x => x !== a.id) : [...s, a.id]))} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2"><span className="text-[13px] font-semibold text-slate-900 truncate">{a.name}</span>{a.channelCode && <Plate value={a.channelCode} />}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                              <Badge tone={st === 'active' ? 'success' : st === 'testing' ? 'warning' : 'muted'}>{st === 'active' ? 'Live' : st === 'testing' ? 'Testing' : 'Paused'}</Badge>
                              <span>{channelCurrency(a)}</span>
                              <span>· {latest ? `v${submissionVersion(a, 0)}` : 'never published'}</span>
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </Panel>

              <Panel title="2. What to apply" subtitle="Edited sections are ticked; tick any other section to apply it as it is in the editor.">
                <ul className="divide-y divide-slate-100">
                  {MODULES.map(m => {
                    const on = modules.includes(m);
                    const modeKey = m === 'rates' ? 'ratesMode' : m === 'extras' ? 'extrasMode' : m === 'allotments' ? 'allotmentsMode' : null;
                    return (
                      <li key={m} className="px-4 py-2.5 flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2.5 flex-1 min-w-[14rem] cursor-pointer">
                          <input type="checkbox" checked={on} onChange={() => setModules(l => (on ? l.filter(x => x !== m) : [...l, m]))} />
                          <span><span className="block text-[13px] font-semibold text-slate-900">{MODULE_LABEL[m]}{touched[m] && <span className="ml-1.5 text-[11px] font-semibold text-indigo-600">edited</span>}</span>
                            <span className="block text-xs text-slate-500">{counts[m]} · {MODULE_HINT[m]}</span></span>
                        </label>
                        {modeKey && on && (
                          <Segmented value={modes[modeKey]} onChange={k => setModes(x => ({ ...x, [modeKey]: k as BulkMode }))}
                            options={[{ key: 'merge', label: m === 'allotments' ? 'Add to existing' : 'Update & add' }, { key: 'replace', label: 'Replace all' }]} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Panel>

              <Panel title="3. Publishing" bodyClassName="p-4 space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={publish} onChange={e => setPublish(e.target.checked)} />
                  <span><span className="block text-[13px] font-semibold text-slate-900">Publish a new rate version where rates change</span>
                    <span className="block text-xs text-slate-500">Channels with a delivery endpoint (and not paused) receive it at once. Untick to save the rates as unpublished changes and publish each channel later.</span></span>
                </label>
                {publish && <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Note for the version history (optional), e.g. Winter 2027 rates" className={textareaCls} />}
              </Panel>

              <Panel title="4. Preview" subtitle={selected.length ? `${withChanges.length} of ${preview.length} selected channel${preview.length === 1 ? '' : 's'} will change` : 'Choose channels above'}>
                {currencies.length > 1 && (
                  <p className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    The selected channels use different currencies ({currencies.join(', ')}). Prices and fees are applied as the same numbers in each channel's currency.
                  </p>
                )}
                {!preview.length ? <EmptyState title="No channels selected" hint="Tick one or more channels in step 1." /> : (
                  <ul className="divide-y divide-slate-100">
                    {preview.map(p => (
                      <li key={p.agg.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold text-slate-900">{p.agg.name}</span>
                          <span className="text-[11px] text-slate-500">{channelCurrency(p.agg)}</span>
                          {!p.changes.length ? <Badge tone="muted">No change</Badge>
                            : p.ratesChanged && publish ? (p.canPublish ? <Badge tone="success">{p.deliverable ? `v${nextVersion(p.next)} published & sent` : `v${nextVersion(p.next)} published`}</Badge> : <Badge tone="danger">Saved, not published</Badge>)
                            : <Badge tone="info">Saved</Badge>}
                        </div>
                        {p.changes.length > 0 && <ul className="mt-1.5 space-y-0.5">{p.changes.map((c, i) => <li key={i} className="text-xs text-slate-600">• {c}</li>)}</ul>}
                        {p.ratesChanged && publish && !p.canPublish && <p className="mt-1 text-xs text-rose-700">Cannot publish yet: {p.errors.slice(0, 2).join('; ')}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
                  {!modules.length && <span className="text-xs text-slate-500 mr-auto">Tick at least one section in step 2.</span>}
                  <Button variant="primary" disabled={busy || !withChanges.length} onClick={() => setConfirm(true)} icon={<CheckCircleIcon className="w-4 h-4" />}>
                    {busy ? 'Applying…' : `Apply to ${withChanges.length} channel${withChanges.length === 1 ? '' : 's'}`}
                  </Button>
                </div>
              </Panel>

              {results && (
                <Panel title="Result" subtitle={new Date().toLocaleString('en-GB')}>
                  <ul className="divide-y divide-slate-100">
                    {results.map(r => (
                      <li key={r.id} className="px-4 py-2.5 flex items-center gap-3">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${r.ok ? 'bg-emerald-500' : 'bg-rose-500'}`}>{r.ok ? '✓' : '!'}</span>
                        <span className="text-[13px] font-semibold text-slate-900">{r.name}</span>
                        <span className={`ml-auto text-xs ${r.ok ? 'text-slate-600' : 'text-rose-700'}`}>{r.message}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </>
          )}
        </div>
      </div>

      {editing && (
        <ManagePeriodModal plan={editing} fleet={fleet} currency="¤" onClose={() => setEditing(null)}
          onSave={p => { edit('rates', 'ratePlans', draft.ratePlans.map(x => (x.id === p.id ? p : x))); setEditing(null); }} />
      )}

      <Dialog open={confirm} onClose={() => setConfirm(false)} size="md" title={`Apply to ${withChanges.length} channel${withChanges.length === 1 ? '' : 's'}?`}
        subtitle={modules.map(m => MODULE_LABEL[m]).join(' · ')}
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" onClick={run}>Apply now</Button></>}>
        <ul className="space-y-1 text-[13px] text-slate-700">
          {withChanges.map(p => <li key={p.agg.id}><b>{p.agg.name}</b>: {p.changes.length} change{p.changes.length === 1 ? '' : 's'}{p.ratesChanged && publish && p.canPublish ? `, rate version ${nextVersion(p.next)}` : ''}</li>)}
        </ul>
        <p className="mt-3 text-xs text-slate-500">Each channel's previous rate versions stay in its Publish History.</p>
      </Dialog>
    </div>
  );
};

export default MultiChannelEditor;
