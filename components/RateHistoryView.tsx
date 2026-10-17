import React, { useState } from 'react';
import { Aggregator } from '../types';
import { ChevronRightIcon, ClockIcon } from './icons';
import { channelCurrency, diffPlans, formatMoney, submissionVersion, tierLabel } from '../services/channelManager';
import { Badge, EmptyState } from './ui/Crm';

interface RateHistoryViewProps {
  aggregator: Aggregator;
}

const RateHistoryView: React.FC<RateHistoryViewProps> = ({ aggregator }) => {
  const history = aggregator.ratePlanHistory || [];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (history.length === 0) {
    return (
      <EmptyState icon={<ClockIcon />} title="Nothing published yet." hint="Every publish is versioned and archived here." />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end gap-3 border-b border-slate-100 pb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">Publish history</h3>
          <p className="text-xs text-slate-500">Versioned audit trail of every rate sheet sent to {aggregator.name}.</p>
        </div>
        <Badge tone="muted" dot={false} className="tabular-nums">{history.length} version{history.length === 1 ? '' : 's'}</Badge>
      </div>

      <div className="relative border-l border-slate-200 ml-2 pb-2">
        {history.map((submission, index) => {
          const isExpanded = expandedId === submission.id;
          const date = new Date(submission.submittedAt);
          const currency = submission.currency || channelCurrency(aggregator);
          const previous = history[index + 1];
          const diff = previous ? diffPlans(previous.ratePlans || [], submission.ratePlans || []) : null;
          const version = submissionVersion(aggregator, index);

          return (
            <div key={submission.id} className="relative pl-5 sm:pl-6 pb-3 last:pb-0 group">
              <div className={`absolute -left-[5px] top-4 w-2.5 h-2.5 rounded-full border-2 ${index === 0 ? 'bg-emerald-500 border-white ring-1 ring-emerald-300' : 'bg-white border-slate-300 group-hover:border-indigo-400'}`}></div>
              <div className={`bg-white rounded-lg border overflow-hidden ${isExpanded ? 'border-indigo-300 ring-2 ring-indigo-500/10' : 'border-slate-200 hover:border-slate-300'}`}>
                <button onClick={() => setExpandedId(isExpanded ? null : submission.id)} className="w-full flex justify-between items-center gap-3 px-3 py-2.5 sm:px-4 text-left hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
                      Version {version}
                      {index === 0 && <Badge tone="success">Live</Badge>}
                      {submission.checksum && <span className="font-mono text-[10px] text-slate-400 font-normal">#{submission.checksum}</span>}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      {date.toLocaleDateString()} {date.toLocaleTimeString()}
                      {submission.publishedBy && <> · {submission.publishedBy}</>}
                      {' · '}{(submission.ratePlans || []).length} period{(submission.ratePlans || []).length === 1 ? '' : 's'} · {currency}
                    </p>
                    {submission.note && <p className="text-xs text-slate-700 mt-1.5 italic truncate">“{submission.note}”</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {diff && (
                      <div className="hidden sm:flex gap-1 text-[11px] font-semibold">
                        {diff.increased > 0 && <Badge tone="danger" dot={false} className="tabular-nums">▲ {diff.increased}</Badge>}
                        {diff.decreased > 0 && <Badge tone="success" dot={false} className="tabular-nums">▼ {diff.decreased}</Badge>}
                        {diff.added > 0 && <Badge tone="info" dot={false} className="tabular-nums">+ {diff.added}</Badge>}
                        {diff.removed > 0 && <Badge tone="muted" dot={false} className="tabular-nums">− {diff.removed}</Badge>}
                        {diff.total === 0 && <Badge tone="muted" dot={false}>no price changes</Badge>}
                      </div>
                    )}
                    <ChevronRightIcon className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="bg-slate-50 border-t border-slate-100 p-3 sm:p-4 space-y-3">
                    {(submission.ratePlans || []).map(plan => (
                      <div key={plan.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
                          <span className="font-semibold text-slate-800 text-[13px]">{plan.name}</span>
                          <span className="text-[11px] font-mono text-slate-500 bg-white px-1.5 py-px rounded border border-slate-200">{plan.startDate} → {plan.endDate}</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-[13px]">
                            <tbody className="divide-y divide-slate-100">
                              {(plan.sippRates || []).map(rate => (
                                <tr key={rate.id}>
                                  <td className="px-3 py-2 font-mono font-semibold text-slate-700 w-20 border-r border-slate-100 align-top">{rate.sippCode}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap gap-1.5">
                                      {(rate.tiers || []).map(tier => (
                                        <span key={tier.id} className="inline-flex border border-slate-200 rounded-md text-xs overflow-hidden">
                                          <span className="px-1.5 py-0.5 bg-slate-50 text-slate-500">{tierLabel(tier)}</span>
                                          <span className="px-1.5 py-0.5 font-semibold text-slate-800 tabular-nums">{tier.dailyPrice !== null ? formatMoney(tier.dailyPrice, currency) : 'N/A'}</span>
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
