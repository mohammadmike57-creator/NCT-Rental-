import React, { useMemo, useState } from 'react';
import { Aggregator, Fleet, StopSale } from '../types';
import { AlertIcon, CheckCircleIcon, CodeBracketIcon, ServerIcon } from './icons';
import {
  ValidationResult, IssueArea, channelCurrency, channelEnvironment, channelLocationCode, channelVendorCode,
  formatMoney, fromPrice, hasUnpublishedChanges, submissionVersion, fleetSippCodes, todayIso,
} from '../services/channelManager';
import type { ChannelTab } from './AggregatorSetupView';
import { Panel, Badge, Button, EmptyState, table } from './ui/Crm';

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
  error: 'bg-rose-50 border-rose-200 text-rose-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-slate-50 border-slate-200 text-slate-600',
};

const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = score >= 85 ? '#10b981' : score >= 60 ? '#f59e0b' : '#e11d48';
  return (
    <svg width="64" height="64" viewBox="0 0 88 88" className="shrink-0" role="img" aria-label={`Health score ${score} of 100`}>
      <circle cx="44" cy="44" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (score / 100) * c} transform="rotate(-90 44 44)" />
      <text x="44" y="51" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 22, fontWeight: 600 }}>{score}</text>
    </svg>
  );
};

const Field: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="min-w-0">
    <dt className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">{label}</dt>
    <dd className={`text-[13px] text-slate-900 truncate ${mono ? 'font-mono' : 'font-medium'}`}>{value}</dd>
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
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Health */}
        <Panel className="xl:col-span-2">
          <div className="px-4 py-3 flex items-center gap-4 border-b border-slate-200">
            <ScoreRing score={validation.score} />
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-slate-900">Distribution health</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {validation.errors === 0 && validation.warnings === 0
                  ? 'Everything checks out — this channel is ready to publish.'
                  : `${validation.errors} blocking error${validation.errors === 1 ? '' : 's'} · ${validation.warnings} warning${validation.warnings === 1 ? '' : 's'}`}
              </p>
              <Badge tone={validation.canPublish ? 'success' : 'danger'} dot={false} className="mt-1.5 whitespace-normal">
                {validation.canPublish ? <CheckCircleIcon className="w-3.5 h-3.5 shrink-0" /> : <AlertIcon className="w-3.5 h-3.5 shrink-0" />}
                {validation.canPublish ? 'Publishing allowed' : 'Publishing blocked until errors are fixed'}
              </Badge>
            </div>
          </div>
          <ul className="p-3 space-y-1.5 max-h-80 overflow-y-auto">
            {validation.errors + validation.warnings === 0 && (
              <li className="text-[13px] text-slate-500 text-center py-4">No errors or warnings.</li>
            )}
            {visibleIssues.map((issue, i) => (
              <li key={i} className={`flex items-start gap-3 px-3 py-2 rounded-lg border text-[13px] ${LEVEL_STYLE[issue.level]}`}>
                <span className="text-[10px] font-semibold uppercase tracking-wider mt-0.5 w-14 shrink-0">{issue.level}</span>
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
        </Panel>

        {/* Channel profile */}
        <Panel
          title={<span className="flex items-center gap-2"><ServerIcon className="w-4 h-4 text-slate-400" /> Channel profile</span>}
          actions={<Button size="sm" variant="ghost" onClick={() => onNavigate('Connection')}>Edit</Button>}
          bodyClassName="p-4 space-y-4"
        >
          <dl className="grid grid-cols-2 gap-3">
            <Field label="Environment" value={channelEnvironment(aggregator) === 'production' ? 'Production' : 'Test'} />
            <Field label="Currency" value={currency} mono />
            <Field label="Supplier code" value={channelVendorCode(aggregator)} mono />
            <Field label="Location" value={channelLocationCode(aggregator)} mono />
            <Field label="Channel code" value={aggregator.channelCode || '—'} mono />
            <Field label="Commission" value={aggregator.commissionPercent != null ? `${aggregator.commissionPercent}%` : '—'} />
          </dl>
          <div className="pt-3 border-t border-slate-100 space-y-2 text-[13px] [&>div]:gap-3 [&>div>span:last-child]:text-right [&>div>span:last-child]:tabular-nums">
            <div className="flex justify-between"><span className="text-slate-500">Published version</span><span className="font-semibold text-slate-800">{latest ? `v${submissionVersion(aggregator, 0)}` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Published</span><span className="font-medium text-slate-800">{latest ? new Date(latest.submittedAt).toLocaleString() : 'Never'}</span></div>
            {latest?.publishedBy && <div className="flex justify-between"><span className="text-slate-500">By</span><span className="font-medium text-slate-800">{latest.publishedBy}</span></div>}
            <div className="flex justify-between"><span className="text-slate-500">Rate state</span>
              <span className={`font-semibold ${pending ? 'text-amber-600' : 'text-emerald-700'}`}>{pending ? 'Unpublished changes' : 'In sync'}</span>
            </div>
            <div className="flex justify-between"><span className="text-slate-500">Stop sales (current & future)</span><span className="font-medium text-slate-800">{upcomingStops}</span></div>
          </div>
          <Button className="w-full" onClick={() => onNavigate('XML Feed')} icon={<CodeBracketIcon className="w-4 h-4" />}>Open XML feed</Button>
        </Panel>
      </div>

      {/* Rate matrix */}
      <Panel
        title="Rate matrix"
        subtitle={`Lowest daily price ("from") per vehicle group and season, in ${currency}.`}
        actions={<Button size="sm" onClick={() => onNavigate('Rates')}>Manage rates</Button>}
      >
        {plans.length === 0 || sippCodes.length === 0 ? (
          <EmptyState title="No rates loaded yet." hint="Add rate periods on the Rates tab." />
        ) : (
          <div className="overflow-x-auto">
            <table className={table.wrap}>
              <thead className={table.head}>
                <tr>
                  <th className={`${table.th} sticky left-0 bg-slate-50`}>SIPP</th>
                  {plans.map(p => {
                    const current = p.startDate <= today && today <= p.endDate;
                    return (
                      <th key={p.id} className={`${table.th} text-right ${current ? 'text-slate-800' : ''}`}>
                        <div>{p.name}{current && <span className="ml-1 text-emerald-600">●</span>}</div>
                        <div className="font-mono normal-case tracking-normal text-[10px] text-slate-400">{p.startDate} → {p.endDate}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className={table.body}>
                {sippCodes.map(code => {
                  const model = fleet.find(v => (v.sippCode || '').toUpperCase() === code)?.modelName;
                  return (
                    <tr key={code} className={table.row}>
                      <td className={`${table.td} sticky left-0 bg-white`}>
                        <div className="font-mono font-semibold text-slate-800">{code}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[10rem]">{model || 'not in fleet'}</div>
                      </td>
                      {plans.map(p => {
                        const price = fromPrice(p, code);
                        return (
                          <td key={p.id} className={`${table.td} text-right tabular-nums whitespace-nowrap`}>
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
      </Panel>
    </div>
  );
};

export default ChannelOverviewView;
