import React, { useState } from 'react';
import { Aggregator } from '../types';
import { ChevronRightIcon, ClockIcon } from './icons';
import { channelCurrency, diffPlans, formatMoney, submissionVersion, tierLabel } from '../services/channelManager';

interface RateHistoryViewProps {
  aggregator: Aggregator;
}

const RateHistoryView: React.FC<RateHistoryViewProps> = ({ aggregator }) => {
  const history = aggregator.ratePlanHistory || [];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
        <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
          <ClockIcon className="w-8 h-8 opacity-50" />
        </div>
        <p className="text-sm font-medium">Nothing published yet.</p>
        <p className="text-xs mt-1">Every publish is versioned and archived here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Publish history</h3>
          <p className="text-sm text-slate-500">Versioned audit trail of every rate sheet sent to {aggregator.name}.</p>
        </div>
        <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{history.length} version{history.length === 1 ? '' : 's'}</span>
      </div>

      <div className="relative border-l-2 border-slate-200 ml-3 pb-4">
        {history.map((submission, index) => {
          const isExpanded = expandedId === submission.id;
          const date = new Date(submission.submittedAt);
          const currency = submission.currency || channelCurrency(aggregator);
          const previous = history[index + 1];
          const diff = previous ? diffPlans(previous.ratePlans || [], submission.ratePlans || []) : null;
          const version = submissionVersion(aggregator, index);

          return (
            <div key={submission.id} className="relative pl-8 pb-6 last:pb-0 group">
              <div className={`absolute -left-[9px] top-4 w-4 h-4 rounded-full border-2 ${index === 0 ? 'bg-emerald-500 border-emerald-100 ring-4 ring-emerald-50' : 'bg-white border-slate-300 group-hover:border-primary'}`}></div>
              <div className={`bg-white rounded-lg border overflow-hidden ${isExpanded ? 'shadow-md border-primary/30' : 'border-slate-200 hover:border-slate-300'}`}>
                <button onClick={() => setExpandedId(isExpanded ? null : submission.id)} className="w-full flex justify-between items-center gap-4 p-4 text-left hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                      Version {version}
                      {index === 0 && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] uppercase tracking-wide rounded font-bold">Live</span>}
                      {submission.checksum && <span className="font-mono text-[10px] text-slate-400 font-normal">#{submission.checksum}</span>}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {date.toLocaleDateString()} {date.toLocaleTimeString()}
                      {submission.publishedBy && <> · {submission.publishedBy}</>}
                      {' · '}{(submission.ratePlans || []).length} period{(submission.ratePlans || []).length === 1 ? '' : 's'} · {currency}
                    </p>
                    {submission.note && <p className="text-xs text-slate-700 mt-1.5 italic truncate">“{submission.note}”</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {diff && (
                      <div className="hidden sm:flex gap-1 text-[11px] font-semibold">
                        {diff.increased > 0 && <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600">▲ {diff.increased}</span>}
                        {diff.decreased > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">▼ {diff.decreased}</span>}
                        {diff.added > 0 && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">+ {diff.added}</span>}
                        {diff.removed > 0 && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">− {diff.removed}</span>}
                        {diff.total === 0 && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">no price changes</span>}
                      </div>
                    )}
                    <ChevronRightIcon className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="bg-slate-50 border-t border-slate-100 p-4 space-y-4">
                    {(submission.ratePlans || []).map(plan => (
                      <div key={plan.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
                          <span className="font-bold text-slate-700 text-sm">{plan.name}</span>
                          <span className="text-xs font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">{plan.startDate} → {plan.endDate}</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <tbody className="divide-y divide-slate-100">
                              {(plan.sippRates || []).map(rate => (
                                <tr key={rate.id}>
                                  <td className="px-4 py-2.5 font-mono font-bold text-slate-700 w-20 border-r border-slate-100">{rate.sippCode}</td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex flex-wrap gap-2">
                                      {(rate.tiers || []).map(tier => (
                                        <span key={tier.id} className="inline-flex border border-slate-200 rounded text-xs overflow-hidden">
                                          <span className="px-2 py-1 bg-slate-50 text-slate-500">{tierLabel(tier)}</span>
                                          <span className="px-2 py-1 font-semibold text-slate-800 tabular-nums">{tier.dailyPrice !== null ? formatMoney(tier.dailyPrice, currency) : 'N/A'}</span>
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                              {(!plan.sippRates || plan.sippRates.length === 0) && (
                                <tr><td colSpan={2} className="px-4 py-3 text-center text-slate-400 italic text-xs">No vehicle groups in this period.</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RateHistoryView;
