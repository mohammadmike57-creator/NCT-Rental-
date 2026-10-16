import React, { useMemo, useState } from 'react';
import { Aggregator, Fleet, StopSale } from '../types';
import { AlertIcon, CheckCircleIcon, CodeBracketIcon, ServerIcon } from './icons';
import {
  ValidationResult, IssueArea, channelCurrency, channelEnvironment, channelLocationCode, channelVendorCode,
  formatMoney, fromPrice, hasUnpublishedChanges, submissionVersion, fleetSippCodes, todayIso,
} from '../services/channelManager';
import type { ChannelTab } from './AggregatorSetupView';

interface ChannelOverviewViewProps {
  aggregator: Aggregator;
  fleet: Fleet;
  stopSales: StopSale[];
  validation: ValidationResult;
  onNavigate: (tab: ChannelTab) => void;
}

const AREA_TAB: Record<IssueArea, ChannelTab> = {
  Connection: 'Connection',
  Rates: 'Rates',
  Fleet: 'Rates',
  Extras: 'Extras',
  Terms: 'Terms & Conditions',
};

const LEVEL_STYLE = {
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-slate-50 border-slate-200 text-slate-600',
};

const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = score >= 85 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0" role="img" aria-label={`Health score ${score} of 100`}>
      <circle cx="44" cy="44" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (score / 100) * c} transform="rotate(-90 44 44)" />
      <text x="44" y="49" textAnchor="middle" className="fill-slate-800" style={{ fontSize: 20, fontWeight: 700 }}>{score}</text>
    </svg>
  );
};

const Field: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="min-w-0">
    <dt className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">{label}</dt>
    <dd className={`text-sm text-slate-800 truncate ${mono ? 'font-mono' : 'font-medium'}`}>{value}</dd>
  </div>
);

const ChannelOverviewView: React.FC<ChannelOverviewViewProps> = ({ aggregator, fleet, stopSales, validation, onNavigate }) => {
  const currency = channelCurrency(aggregator);
  const plans = useMemo(
    () => [...(aggregator.currentRatePlans || [])].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [aggregator.currentRatePlans],
  );
  const sippCodes = useMemo(() => {
    const codes = new Set<string>(fleetSippCodes(fleet));
    plans.forEach(p => (p.sippRates || []).forEach(r => r.sippCode && codes.add(r.sippCode.toUpperCase())));
    return Array.from(codes).sort();
  }, [plans, fleet]);
  const latest = (aggregator.ratePlanHistory || [])[0];
  const today = todayIso();
  const pending = hasUnpublishedChanges(aggregator);
  const upcomingStops = (stopSales || []).filter(s => s.endDate >= today).length;
  const [showNotes, setShowNotes] = useState(false);
  const notes = validation.issues.filter(i => i.level === 'info');
  const visibleIssues = validation.issues.filter(i => i.level !== 'info' || showNotes);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Health */}
        <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-5 flex items-center gap-5 border-b border-slate-100">
            <ScoreRing score={validation.score} />
            <div className="min-w-0">
              <h4 className="text-base font-bold text-slate-800">Distribution health</h4>
              <p className="text-sm text-slate-500 mt-0.5">
                {validation.errors === 0 && validation.warnings === 0
                  ? 'Everything checks out — this channel is ready to publish.'
                  : `${validation.errors} blocking error${validation.errors === 1 ? '' : 's'} · ${validation.warnings} warning${validation.warnings === 1 ? '' : 's'}`}
              </p>
              <p className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded ${validation.canPublish ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {validation.canPublish ? <CheckCircleIcon className="w-4 h-4" /> : <AlertIcon className="w-4 h-4" />}
                {validation.canPublish ? 'Publishing allowed' : 'Publishing blocked until errors are fixed'}
              </p>
            </div>
          </div>
          <ul className="p-4 space-y-2 max-h-80 overflow-y-auto">
            {validation.errors + validation.warnings === 0 && (
              <li className="text-sm text-slate-500 text-center py-4">No errors or warnings.</li>
            )}
            {visibleIssues.map((issue, i) => (
              <li key={i} className={`flex items-start gap-3 px-3 py-2 rounded-lg border text-sm ${LEVEL_STYLE[issue.level]}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider mt-0.5 w-16 shrink-0">{issue.level}</span>
                <span className="flex-1 min-w-0">{issue.message}</span>
                <button onClick={() => onNavigate(AREA_TAB[issue.area])} className="text-xs font-semibold underline underline-offset-2 shrink-0 opacity-80 hover:opacity-100">
                  {issue.area}
                </button>
              </li>
            ))}
            {notes.length > 0 && (
              <li className="text-center">
                <button onClick={() => setShowNotes(s => !s)} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
                  {showNotes ? 'Hide notes' : `Show ${notes.length} note${notes.length === 1 ? '' : 's'}`}
                </button>
              </li>
            )}
          </ul>
        </section>

        {/* Channel profile */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold text-slate-800 flex items-center gap-2"><ServerIcon className="w-5 h-5 text-slate-400" /> Channel profile</h4>
            <button onClick={() => onNavigate('Connection')} className="text-xs font-semibold text-primary hover:underline">Edit</button>
          </div>
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Environment" value={channelEnvironment(aggregator) === 'production' ? 'Production' : 'Test'} />
            <Field label="Currency" value={currency} mono />
            <Field label="Supplier code" value={channelVendorCode(aggregator)} mono />
            <Field label="Location" value={channelLocationCode(aggregator)} mono />
            <Field label="Channel code" value={aggregator.channelCode || '—'} mono />
            <Field label="Commission" value={aggregator.commissionPercent != null ? `${aggregator.commissionPercent}%` : '—'} />
          </dl>
          <div className="pt-4 border-t border-slate-100 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Published version</span><span className="font-semibold text-slate-800">{latest ? `v${submissionVersion(aggregator, 0)}` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Published</span><span className="font-medium text-slate-800">{latest ? new Date(latest.submittedAt).toLocaleString() : 'Never'}</span></div>
            {latest?.publishedBy && <div className="flex justify-between"><span className="text-slate-500">By</span><span className="font-medium text-slate-800">{latest.publishedBy}</span></div>}
            <div className="flex justify-between"><span className="text-slate-500">Rate state</span>
              <span className={`font-semibold ${pending ? 'text-amber-600' : 'text-emerald-600'}`}>{pending ? 'Unpublished changes' : 'In sync'}</span>
            </div>
            <div className="flex justify-between"><span className="text-slate-500">Stop sales (current & future)</span><span className="font-medium text-slate-800">{upcomingStops}</span></div>
          </div>
          <button onClick={() => onNavigate('XML Feed')} className="w-full flex items-center justify-center gap-2 py-2 text-sm font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">
            <CodeBracketIcon className="w-4 h-4" /> Open XML feed
          </button>
        </section>
      </div>

      {/* Rate matrix */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-base font-bold text-slate-800">Rate matrix</h4>
            <p className="text-xs text-slate-500">Lowest daily price ("from") per vehicle group and season, in {currency}.</p>
          </div>
          <button onClick={() => onNavigate('Rates')} className="text-xs font-semibold text-primary hover:underline">Manage rates</button>
        </div>
        {plans.length === 0 || sippCodes.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-10">No rates loaded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="text-left px-5 py-3 font-semibold sticky left-0 bg-slate-50">SIPP</th>
                  {plans.map(p => {
                    const current = p.startDate <= today && today <= p.endDate;
                    return (
                      <th key={p.id} className={`text-right px-4 py-3 font-semibold whitespace-nowrap ${current ? 'text-slate-800' : ''}`}>
                        <div>{p.name}{current && <span className="ml-1 text-emerald-600">●</span>}</div>
                        <div className="font-mono normal-case tracking-normal text-[10px] text-slate-400">{p.startDate} → {p.endDate}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sippCodes.map(code => {
                  const model = fleet.find(v => (v.sippCode || '').toUpperCase() === code)?.modelName;
                  return (
                    <tr key={code} className="hover:bg-slate-50/60">
                      <td className="px-5 py-2.5 sticky left-0 bg-white">
                        <div className="font-mono font-bold text-slate-800">{code}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[10rem]">{model || 'not in fleet'}</div>
                      </td>
                      {plans.map(p => {
                        const price = fromPrice(p, code);
                        return (
                          <td key={p.id} className="px-4 py-2.5 text-right tabular-nums">
                            {price === null ? <span className="text-slate-300">—</span> : <span className="font-semibold text-slate-800">{formatMoney(price, currency)}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default ChannelOverviewView;
