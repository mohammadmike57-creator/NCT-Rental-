import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { RatePlan, Fleet, Aggregator, RatePlanSubmission, StopSale } from '../types';
import { PlusIcon, TrashIcon, EditIcon, SaveIcon, AlertIcon, CheckCircleIcon, ChevronRightIcon } from './icons';
import { Panel, Badge, Button, Field, EmptyState, Dialog, textareaCls } from './ui/Crm';
import ManagePeriodModal from './ManagePeriodModal';
import { AdjustRatesDialog, RateBuilderDialog, RateGrid } from './channel/RateTools';
import {
  channelCurrency, diffPlans, fingerprint, formatMoney, generateRateSheetXml, hasUnpublishedChanges,
  nextVersion, tierLabel, todayIso, validateChannel,
} from '../services/channelManager';

interface ManageRatePlansViewProps {
  aggregator: Aggregator;
  onUpdateAggregator: (updatedAggregator: Aggregator) => void;
  fleet: Fleet;
  stopSales?: StopSale[];
  showConfirmation: (message: string) => void;
  currentUserName?: string;
  /** Called instead of onUpdateAggregator when a version is published, so the parent can save and deliver it. */
  onPublished?: (updatedAggregator: Aggregator) => void | Promise<void>;
}

const periodState = (plan: RatePlan, today: string) => {
  if (plan.endDate < today) return { label: 'Expired', tone: 'muted' as const };
  if (plan.startDate <= today) return { label: 'Current', tone: 'success' as const };
  return { label: 'Upcoming', tone: 'info' as const };
};

const ManageRatePlansView: React.FC<ManageRatePlansViewProps> = ({
  aggregator, onUpdateAggregator, fleet, stopSales = [], showConfirmation, currentUserName, onPublished,
}) => {
  const [editingPlan, setEditingPlan] = useState<RatePlan | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tool, setTool] = useState<'build' | 'adjust' | null>(null);
  const [view, setView] = useState<'periods' | 'grid'>('periods');

  const currency = channelCurrency(aggregator);
  const today = todayIso();
  const ratePlans = useMemo(
    () => [...(aggregator.currentRatePlans || [])].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [aggregator.currentRatePlans],
  );
  const validation = useMemo(() => validateChannel(aggregator, fleet), [aggregator, fleet]);
  const rateIssues = validation.issues.filter(i => (i.area === 'Rates' || i.area === 'Fleet') && i.level !== 'info');
  const pending = hasUnpublishedChanges(aggregator);
  const latest = (aggregator.ratePlanHistory || [])[0];
  const diff = useMemo(() => diffPlans(latest?.ratePlans || [], aggregator.currentRatePlans || []), [latest, aggregator.currentRatePlans]);

  const handleUpdate = (newPlans: RatePlan[]) => onUpdateAggregator({ ...aggregator, currentRatePlans: newPlans });

  const handleAddPeriod = () => {
    // Start the new period the day after the last one ends, so seasons stay contiguous.
    const lastEnd = ratePlans.reduce((max, p) => (p.endDate > max ? p.endDate : max), '');
    const start = lastEnd && lastEnd >= today
      ? new Date(new Date(`${lastEnd}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10)
      : today;
    const endDate = new Date(`${start}T00:00:00Z`);
    endDate.setUTCMonth(endDate.getUTCMonth() + 3);
    endDate.setUTCDate(endDate.getUTCDate() - 1);
    const newPlan: RatePlan = { id: `plan-${Date.now()}`, name: 'New Season', startDate: start, endDate: endDate.toISOString().slice(0, 10), sippRates: [] };
    handleUpdate([...(aggregator.currentRatePlans || []), newPlan]);
    setEditingPlan(newPlan);
  };

  const handleDuplicate = (plan: RatePlan) => {
    const stamp = Date.now();
    const copy: RatePlan = JSON.parse(JSON.stringify(plan));
    copy.id = `plan-${stamp}`;
    copy.name = `${plan.name} (copy)`;
    copy.sippRates = copy.sippRates.map((r, i) => ({ ...r, id: `sipp-${stamp}-${i}`, tiers: r.tiers.map((t, j) => ({ ...t, id: `tier-${stamp}-${i}-${j}` })) }));
    handleUpdate([...(aggregator.currentRatePlans || []), copy]);
    setEditingPlan(copy);
  };

  const handleDeletePlan = (plan: RatePlan) => {
    if (window.confirm(`Delete the "${plan.name}" rate period?`)) {
      handleUpdate((aggregator.currentRatePlans || []).filter(p => p.id !== plan.id));
    }
  };

  const handleSavePlan = (updatedPlan: RatePlan) => {
    handleUpdate((aggregator.currentRatePlans || []).map(p => (p.id === updatedPlan.id ? updatedPlan : p)));
    setEditingPlan(null);
  };

  const handlePublish = () => {
    if (!validation.canPublish) return;
    const version = nextVersion(aggregator);
    const xml = generateRateSheetXml(aggregator, stopSales, fleet, { version });
    const submission: RatePlanSubmission = {
      id: `sub-${Date.now()}`,
      submittedAt: new Date().toISOString(),
      ratePlans: JSON.parse(JSON.stringify(aggregator.currentRatePlans || [])),
      version,
      publishedBy: currentUserName,
      note: note.trim() || undefined,
      currency,
      checksum: fingerprint(xml),
      warningCount: validation.warnings,
    };
    const updated = { ...aggregator, ratePlanHistory: [submission, ...(aggregator.ratePlanHistory || [])] };
    setPublishOpen(false);
    setNote('');
    if (onPublished) {
      showConfirmation(`Version ${version} published for ${aggregator.name}.`);
      onPublished(updated);
    } else {
      onUpdateAggregator(updated);
      showConfirmation(`Version ${version} published for ${aggregator.name}.`);
    }
  };

  const issueCls = (level: string) => (level === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-amber-50 border-amber-200 text-amber-800');

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">Rate periods</h3>
          <p className="text-xs text-slate-500">Seasonal pricing by SIPP group and length of rental for {aggregator.name}, in {currency}.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto shrink-0 [&>*]:max-sm:flex-1">
          <Button onClick={() => setTool('build')}>Build rates</Button>
          <Button onClick={() => setTool('adjust')} disabled={ratePlans.length === 0}>Change prices</Button>
          <Button onClick={handleAddPeriod} icon={<PlusIcon className="w-4 h-4" />}>Add period</Button>
          <Button variant={pending ? 'success' : 'primary'} onClick={() => setPublishOpen(true)} disabled={ratePlans.length === 0} icon={<SaveIcon className="w-4 h-4" />}>
            {pending ? 'Review & publish' : 'Re-publish'}
          </Button>
        </div>
      </div>

      {/* Publish status strip */}
      <div className={`rounded-xl border px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] ${pending ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
        <Badge tone={pending ? 'warning' : 'success'}>{pending ? 'Unpublished changes' : 'Rates in sync with last publish'}</Badge>
        {pending && latest && <span className="text-amber-800 tabular-nums">{diff.increased} up · {diff.decreased} down · {diff.added} added · {diff.removed} removed</span>}
        <span className="text-slate-500 tabular-nums">{latest ? `Last published ${new Date(latest.submittedAt).toLocaleString()}` : 'Never published'}</span>
        {rateIssues.length > 0 && <span className="sm:ml-auto text-rose-700 font-semibold tabular-nums">{validation.errors} error{validation.errors === 1 ? '' : 's'} · {validation.warnings} warning{validation.warnings === 1 ? '' : 's'}</span>}
      </div>

      <Panel>
        {ratePlans.length > 0 && (
          <div className="flex items-center gap-1 px-4 pt-3" role="group" aria-label="Rates view">
            {([['periods', 'Periods'], ['grid', 'Price grid']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setView(k)} aria-pressed={view === k}
                className={`px-3 h-7 rounded-md text-xs font-semibold ${view === k ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{l}</button>
            ))}
          </div>
        )}
        {ratePlans.length === 0 ? (
          <EmptyState
            title="No rate periods defined yet."
            hint="Build a full rate card from base prices, seasons and rental-length discounts, or add one season by hand."
            action={<div className="flex gap-2">
              <Button variant="primary" onClick={() => setTool('build')}>Build rates</Button>
              <Button onClick={handleAddPeriod} icon={<PlusIcon className="w-4 h-4" />}>Add one season</Button>
            </div>}
          />
        ) : view === 'grid' ? (
          <RateGrid plans={ratePlans} currency={currency} today={today} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {ratePlans.map(plan => {
              const st = periodState(plan, today);
              const isOpen = expanded === plan.id;
              const planIssues = rateIssues.filter(i => i.message.startsWith(`${plan.name}:`) || i.message.startsWith(`${plan.name} /`));
              const hasError = planIssues.some(i => i.level === 'error');
              return (
                <li key={plan.id} className={hasError ? 'border-l-2 border-rose-400' : 'border-l-2 border-transparent'}>
                  <div className="px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <button onClick={() => setExpanded(isOpen ? null : plan.id)} className="flex items-start gap-2 min-w-0 text-left flex-1" aria-expanded={isOpen}>
                      <ChevronRightIcon className={`w-4 h-4 mt-0.5 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-[13px] font-semibold text-slate-900 truncate">{plan.name}</h4>
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                          <span className="font-mono text-[11px] px-1.5 py-px bg-slate-50 rounded border border-slate-200">{plan.startDate} → {plan.endDate}</span>
                          <span className="tabular-nums">{plan.sippRates?.length ?? 0} vehicle group{plan.sippRates?.length === 1 ? '' : 's'}</span>
                          {planIssues.length > 0 && <span className="text-rose-600 font-semibold">{planIssues.length} issue{planIssues.length > 1 ? 's' : ''}</span>}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 w-full sm:w-auto justify-end shrink-0">
                      <Button size="sm" onClick={() => setEditingPlan(plan)} icon={<EditIcon className="w-3.5 h-3.5" />}>Edit rates</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDuplicate(plan)}>Duplicate</Button>
                      <button onClick={() => handleDeletePlan(plan)} className="w-8 h-8 inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md" title="Delete period" aria-label="Delete period">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 space-y-3">
                      {planIssues.length > 0 && (
                        <ul className="space-y-1">
                          {planIssues.map((i, k) => (
                            <li key={k} className={`text-xs px-3 py-1.5 rounded-md border ${issueCls(i.level)}`}>{i.message}</li>
                          ))}
                        </ul>
                      )}
                      {(plan.sippRates || []).length === 0 ? (
                        <p className="text-[13px] text-slate-500">No vehicle groups priced yet.</p>
                      ) : (
                        <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
                          <table className="w-full text-[13px]">
                            <tbody className="divide-y divide-slate-100">
                              {plan.sippRates.map(rate => (
                                <tr key={rate.id}>
                                  <td className="px-3 py-2 font-mono font-semibold text-slate-800 w-20 align-top">{rate.sippCode}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap gap-1.5">
                                      {[...(rate.tiers || [])].sort((a, b) => (a.fromDay ?? 0) - (b.fromDay ?? 0)).map(t => (
                                        <span key={t.id} className="inline-flex text-xs border border-slate-200 rounded-md overflow-hidden">
                                          <span className="px-1.5 py-0.5 bg-slate-50 text-slate-500">{tierLabel(t)}</span>
                                          <span className="px-1.5 py-0.5 font-semibold text-slate-800 tabular-nums">{t.dailyPrice != null ? formatMoney(t.dailyPrice, currency) : '—'}</span>
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {tool === 'build' && (
        <RateBuilderDialog fleet={fleet} currency={currency} existing={aggregator.currentRatePlans || []} onClose={() => setTool(null)}
          onApply={(plans, built) => {
            handleUpdate(plans);
            setTool(null);
            showConfirmation(`${built} rate period${built === 1 ? '' : 's'} built for ${aggregator.name}. Review them, then publish.`);
          }} />
      )}
      {tool === 'adjust' && (
        <AdjustRatesDialog plans={ratePlans} currency={currency} onClose={() => setTool(null)}
          onApply={(plans, summary) => {
            handleUpdate(plans);
            setTool(null);
            showConfirmation(`Prices changed: ${summary}. Review them, then publish.`);
          }} />
      )}

      {editingPlan && (
        <ManagePeriodModal plan={editingPlan} onSave={handleSavePlan} onClose={() => setEditingPlan(null)} fleet={fleet} currency={currency} />
      )}

      {publishOpen && createPortal(
        <div className="relative z-[100]">
          <Dialog
            open={publishOpen}
            onClose={() => setPublishOpen(false)}
            size="md"
            title={`Publish rates to ${aggregator.name}`}
            subtitle={`Version ${nextVersion(aggregator)} · ${currency} · ${ratePlans.length} period${ratePlans.length === 1 ? '' : 's'}`}
            footer={
              <>
                <Button variant="ghost" onClick={() => setPublishOpen(false)}>Cancel</Button>
                <Button variant="success" onClick={handlePublish} disabled={!validation.canPublish}>Publish version {nextVersion(aggregator)}</Button>
              </>
            }
          >
            <div className="space-y-4">
              {latest && (
                <div className="grid grid-cols-4 gap-2">
                  {([['Up', diff.increased, 'text-rose-600'], ['Down', diff.decreased, 'text-emerald-700'], ['Added', diff.added, 'text-sky-700'], ['Removed', diff.removed, 'text-slate-600']] as [string, number, string][]).map(([l, n, c]) => (
                    <div key={l} className="rounded-lg border border-slate-200 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{l}</p>
                      <p className={`text-base font-semibold tabular-nums ${c}`}>{n}</p>
                    </div>
                  ))}
                </div>
              )}
              {validation.canPublish ? (
                <p className="flex items-center gap-2 text-[13px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <CheckCircleIcon className="w-4 h-4 shrink-0" /> Validation passed{validation.warnings ? ` with ${validation.warnings} warning${validation.warnings === 1 ? '' : 's'}` : ''}.
                </p>
              ) : (
                <p className="flex items-center gap-2 text-[13px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  <AlertIcon className="w-4 h-4 shrink-0" /> {validation.errors} blocking error{validation.errors === 1 ? '' : 's'} must be fixed before publishing.
                </p>
              )}
              {validation.issues.filter(i => i.level !== 'info').length > 0 && (
                <ul className="space-y-1 text-xs">
                  {validation.issues.filter(i => i.level !== 'info').map((i, k) => (
                    <li key={k} className={`px-3 py-1.5 rounded-md border ${issueCls(i.level)}`}>
                      <span className="font-semibold">{i.area}:</span> {i.message}
                    </li>
                  ))}
                </ul>
              )}
              <Field label={<>Change note <span className="text-slate-400 font-normal">(optional)</span></>}>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={280} className={textareaCls} placeholder="e.g. Summer prices +8% for SUVs" />
              </Field>
            </div>
          </Dialog>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default ManageRatePlansView;
