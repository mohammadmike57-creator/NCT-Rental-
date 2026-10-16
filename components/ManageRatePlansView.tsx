import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { RatePlan, Fleet, Aggregator, RatePlanSubmission, StopSale } from '../types';
import { PlusIcon, TrashIcon, EditIcon, SaveIcon, AlertIcon, CheckCircleIcon, CloseIcon } from './icons';
import ManagePeriodModal from './ManagePeriodModal';
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
}

const periodState = (plan: RatePlan, today: string) => {
  if (plan.endDate < today) return { label: 'Expired', cls: 'bg-slate-100 text-slate-500 border-slate-200' };
  if (plan.startDate <= today) return { label: 'Current', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  return { label: 'Upcoming', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
};

const ManageRatePlansView: React.FC<ManageRatePlansViewProps> = ({
  aggregator, onUpdateAggregator, fleet, stopSales = [], showConfirmation, currentUserName,
}) => {
  const [editingPlan, setEditingPlan] = useState<RatePlan | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

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
    onUpdateAggregator({ ...aggregator, ratePlanHistory: [submission, ...(aggregator.ratePlanHistory || [])] });
    setPublishOpen(false);
    setNote('');
    showConfirmation(`Version ${version} published for ${aggregator.name}. The server will deliver it on the next sync.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-slate-800">Rate periods</h3>
          <p className="text-sm text-slate-500">Seasonal pricing by SIPP group and length of rental for {aggregator.name}, in {currency}.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          <button onClick={handleAddPeriod} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50">
            <PlusIcon className="w-4 h-4" /> Add period
          </button>
          <button
            onClick={() => setPublishOpen(true)}
            disabled={ratePlans.length === 0}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg shadow-sm transition-all disabled:bg-slate-300 disabled:cursor-not-allowed ${pending ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-700 hover:bg-slate-800 text-white'}`}
          >
            <SaveIcon className="w-4 h-4" /> {pending ? 'Review & publish' : 'Re-publish'}
          </button>
        </div>
      </div>

      {/* Publish status strip */}
      <div className={`rounded-xl border px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm ${pending ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
        <span className={`font-semibold ${pending ? 'text-amber-800' : 'text-emerald-700'}`}>{pending ? 'Unpublished changes' : 'Rates in sync with last publish'}</span>
        {pending && latest && <span className="text-amber-800">{diff.increased} up · {diff.decreased} down · {diff.added} added · {diff.removed} removed</span>}
        <span className="text-slate-500">{latest ? `Last published ${new Date(latest.submittedAt).toLocaleString()}` : 'Never published'}</span>
        {rateIssues.length > 0 && <span className="ml-auto text-red-700 font-semibold">{validation.errors} error{validation.errors === 1 ? '' : 's'} · {validation.warnings} warning{validation.warnings === 1 ? '' : 's'}</span>}
      </div>

      <div className="grid gap-4">
        {ratePlans.map(plan => {
          const st = periodState(plan, today);
          const isOpen = expanded === plan.id;
          const planIssues = rateIssues.filter(i => i.message.startsWith(`${plan.name}:`) || i.message.startsWith(`${plan.name} /`));
          return (
            <div key={plan.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${planIssues.some(i => i.level === 'error') ? 'border-red-200' : 'border-slate-200'}`}>
              <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <button onClick={() => setExpanded(isOpen ? null : plan.id)} className="flex items-center gap-4 min-w-0 text-left">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold shrink-0">
                    {(plan.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-800 truncate">{plan.name}</h4>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                      <span className="font-mono px-2 py-0.5 bg-slate-50 rounded border border-slate-200">{plan.startDate} → {plan.endDate}</span>
                      <span>{plan.sippRates?.length ?? 0} vehicle group{plan.sippRates?.length === 1 ? '' : 's'}</span>
                      {planIssues.length > 0 && <span className="text-red-600 font-semibold">{planIssues.length} issue{planIssues.length > 1 ? 's' : ''}</span>}
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-1 w-full sm:w-auto justify-end">
                  <button onClick={() => setEditingPlan(plan)} className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider rounded-md hover:bg-blue-100 flex items-center gap-1">
                    <EditIcon className="w-3 h-3" /> Edit rates
                  </button>
                  <button onClick={() => handleDuplicate(plan)} className="px-3 py-1.5 text-slate-600 text-xs font-bold uppercase tracking-wider rounded-md hover:bg-slate-100">Duplicate</button>
                  <button onClick={() => handleDeletePlan(plan)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md" title="Delete period">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {isOpen && (
                <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-3">
                  {planIssues.length > 0 && (
                    <ul className="space-y-1">
                      {planIssues.map((i, k) => (
                        <li key={k} className={`text-xs px-3 py-1.5 rounded border ${i.level === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>{i.message}</li>
                      ))}
                    </ul>
                  )}
                  {(plan.sippRates || []).length === 0 ? (
                    <p className="text-sm text-slate-500">No vehicle groups priced yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden">
                        <tbody className="divide-y divide-slate-100">
                          {plan.sippRates.map(rate => (
                            <tr key={rate.id}>
                              <td className="px-3 py-2 font-mono font-bold text-slate-800 w-20">{rate.sippCode}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-2">
                                  {[...(rate.tiers || [])].sort((a, b) => (a.fromDay ?? 0) - (b.fromDay ?? 0)).map(t => (
                                    <span key={t.id} className="inline-flex text-xs border border-slate-200 rounded overflow-hidden">
                                      <span className="px-2 py-1 bg-slate-50 text-slate-500">{tierLabel(t)}</span>
                                      <span className="px-2 py-1 font-semibold text-slate-800 tabular-nums">{t.dailyPrice != null ? formatMoney(t.dailyPrice, currency) : '—'}</span>
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
            </div>
          );
        })}

        {ratePlans.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border-2 border-dashed border-slate-200">
            <p className="text-slate-500 font-medium">No rate periods defined yet.</p>
            <button onClick={handleAddPeriod} className="mt-2 text-primary font-bold hover:underline">Create your first season</button>
          </div>
        )}
      </div>

      {editingPlan && (
        <ManagePeriodModal plan={editingPlan} onSave={handleSavePlan} onClose={() => setEditingPlan(null)} fleet={fleet} currency={currency} />
      )}

      {publishOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPublishOpen(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-800">Publish rates to {aggregator.name}</h4>
                <p className="text-xs text-slate-500">Version {nextVersion(aggregator)} · {currency} · {ratePlans.length} period{ratePlans.length === 1 ? '' : 's'}</p>
              </div>
              <button onClick={() => setPublishOpen(false)} className="p-1 text-slate-400 hover:text-slate-700"><CloseIcon /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {latest && (
                <div className="grid grid-cols-4 gap-2 text-center">
                  {([['Up', diff.increased, 'text-red-600'], ['Down', diff.decreased, 'text-emerald-600'], ['Added', diff.added, 'text-blue-600'], ['Removed', diff.removed, 'text-slate-600']] as [string, number, string][]).map(([l, n, c]) => (
                    <div key={l} className="rounded-lg border border-slate-200 py-2">
                      <p className={`text-lg font-bold ${c}`}>{n}</p>
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">{l}</p>
                    </div>
                  ))}
                </div>
              )}
              {validation.canPublish ? (
                <p className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <CheckCircleIcon className="w-4 h-4" /> Validation passed{validation.warnings ? ` with ${validation.warnings} warning${validation.warnings === 1 ? '' : 's'}` : ''}.
                </p>
              ) : (
                <p className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertIcon className="w-4 h-4" /> {validation.errors} blocking error{validation.errors === 1 ? '' : 's'} must be fixed before publishing.
                </p>
              )}
              {validation.issues.filter(i => i.level !== 'info').length > 0 && (
                <ul className="space-y-1 text-xs">
                  {validation.issues.filter(i => i.level !== 'info').map((i, k) => (
                    <li key={k} className={`px-3 py-1.5 rounded border ${i.level === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                      <span className="font-semibold">{i.area}:</span> {i.message}
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Change note <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={280} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="e.g. Summer prices +8% for SUVs" />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setPublishOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-100">Cancel</button>
              <button onClick={handlePublish} disabled={!validation.canPublish} className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed">
                Publish version {nextVersion(aggregator)}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default ManageRatePlansView;
