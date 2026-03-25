
import React, { useState } from 'react';
import { RatePlanSubmission } from '../types';
import { ChevronRightIcon, ClockIcon } from './icons';

interface RateHistoryViewProps {
    history: RatePlanSubmission[];
}

const RateHistoryView: React.FC<RateHistoryViewProps> = ({ history }) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    if (!history || history.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 h-full bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
                    <ClockIcon className="w-8 h-8 opacity-50" />
                </div>
                <p className="text-sm font-medium">No rate history available.</p>
                <p className="text-xs mt-1">Published rate snapshots will appear here.</p>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end border-b border-slate-100 pb-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">Transmission Log</h3>
                    <p className="text-sm text-slate-500">Audit trail of rate updates sent to this channel.</p>
                </div>
                <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{history.length} Records</span>
            </div>

            <div className="relative border-l-2 border-slate-200 ml-3 space-y-0 pb-10">
                {history.map((submission, index) => {
                    const isExpanded = expandedId === submission.id;
                    const date = new Date(submission.submittedAt);
                    
                    return (
                        <div key={submission.id} className="relative pl-8 pb-8 last:pb-0 group">
                            {/* Timeline Dot */}
                            <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 transition-all ${index === 0 ? 'bg-green-500 border-green-100 ring-4 ring-green-50' : 'bg-white border-slate-300 group-hover:border-primary'}`}></div>
                            
                            <div className={`bg-white rounded-lg border transition-all duration-200 overflow-hidden ${isExpanded ? 'shadow-md border-primary/30 ring-1 ring-primary/10' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}>
                                <button
                                    onClick={() => setExpandedId(isExpanded ? null : submission.id)}
                                    className="w-full flex justify-between items-center p-4 text-left bg-white hover:bg-slate-50 transition-colors"
                                >
                                    <div>
                                        <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                            {index === 0 ? 'Latest Publish' : 'Archived Update'}
                                            {index === 0 && <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] uppercase tracking-wide rounded font-bold">Live</span>}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-1 font-mono">{date.toLocaleDateString()} • {date.toLocaleTimeString()}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right hidden sm:block">
                                            <p className="text-xs font-medium text-slate-700">{(submission.ratePlans || []).length} Periods</p>
                                            <p className="text-[10px] text-slate-400">Click to view details</p>
                                        </div>
                                        <ChevronRightIcon className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                    </div>
                                </button>
                                
                                {isExpanded && (
                                    <div className="bg-slate-50 border-t border-slate-100 p-4 space-y-6">
                                        {(submission.ratePlans || []).map(plan => (
                                            <div key={plan.id} className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                                                {/* Plan Header */}
                                                <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
                                                    <span className="font-bold text-slate-700 text-sm">{plan.name}</span>
                                                    <span className="text-xs font-mono text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
                                                        {plan.startDate} &rarr; {plan.endDate}
                                                    </span>
                                                </div>

                                                {/* Detailed Rates Table */}
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left text-sm">
                                                        <thead>
                                                            <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase text-slate-500">
                                                                <th className="px-4 py-2 font-semibold w-24 border-r border-slate-100">SIPP</th>
                                                                <th className="px-4 py-2 font-semibold">Pricing Structure</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {(plan.sippRates || []).map(rate => (
                                                                <tr key={rate.id} className="hover:bg-slate-50/50">
                                                                    <td className="px-4 py-3 font-bold text-slate-700 bg-slate-50/30 border-r border-slate-100">
                                                                        {rate.sippCode}
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex flex-wrap gap-2">
                                                                            {(rate.tiers || []).map(tier => (
                                                                                <div key={tier.id} className="inline-flex items-center border border-slate-200 rounded bg-white text-xs shadow-sm overflow-hidden">
                                                                                    <span className="px-2 py-1 bg-slate-50 text-slate-500 font-medium border-r border-slate-100">
                                                                                        {tier.fromDay}
                                                                                        {tier.toDay === Infinity || tier.toDay === null ? '+' : `-${tier.toDay}`} days
                                                                                    </span>
                                                                                    <span className="px-2 py-1 font-bold text-green-700">
                                                                                        {tier.dailyPrice !== null ? `$${Number(tier.dailyPrice).toFixed(2)}` : 'N/A'}
                                                                                    </span>
                                                                                </div>
                                                                            ))}
                                                                            {(!rate.tiers || rate.tiers.length === 0) && (
                                                                                <span className="text-xs text-slate-400 italic">No tiers defined</span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                            {(!plan.sippRates || plan.sippRates.length === 0) && (
                                                                <tr>
                                                                    <td colSpan={2} className="px-4 py-4 text-center text-slate-400 italic text-xs">
                                                                        No SIPP codes associated with this plan.
                                                                    </td>
                                                                </tr>
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
