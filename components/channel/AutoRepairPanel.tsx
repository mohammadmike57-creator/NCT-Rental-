import React, { useState } from 'react';
import { Aggregator } from '../../types';
import { suggestFixes } from '../../services/channelRepair';
import { ShieldCheckIcon, ChevronRightIcon, CheckCircleIcon } from '../icons';
import { displayStamp } from '../../services/displayDate';

/**
 * Auto-repair for one broker: what OTA XML fixed on its own (with the time) and, for problems that need a
 * decision, the exact change one button makes. Nothing here changes a price without a click.
 */
const AutoRepairPanel: React.FC<{ aggregator: Aggregator; onUpdate: (a: Aggregator) => void; notify?: (m: string) => void; compact?: boolean }> = ({ aggregator, onUpdate, notify, compact }) => {
  const [showLog, setShowLog] = useState(false);
  const fixes = suggestFixes(aggregator);
  const log = aggregator.repairLog || [];
  if (compact && !fixes.length) return null;
  const applyAll = () => { onUpdate(fixes.reduce((a, f) => f.apply(a), aggregator)); notify?.(`${fixes.length} fix${fixes.length === 1 ? '' : 'es'} applied to ${aggregator.name}. Review the rates, then publish.`); };
  return (
    <section className="ota-pop rounded-2xl bg-white border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden" aria-label="Auto-repair">
      <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-3">
        <span className={`w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0 ${fixes.length ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}><ShieldCheckIcon className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-slate-900">Auto-repair</h3>
          <p className="text-[12px] text-slate-500">
            {fixes.length ? `Errors are fixed on their own. ${fixes.length === 1 ? 'One gap needs' : `${fixes.length} gaps need`} your decision: the button shows exactly what it changes.`
              : 'Errors in codes, rental lengths and periods are fixed on their own the moment they appear. Prices are never changed.'}
          </p>
        </div>
        {fixes.length > 1 && <button type="button" onClick={applyAll} className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[12.5px] font-semibold">Fix all {fixes.length}</button>}
        {log.length > 0 && (
          <button type="button" onClick={() => setShowLog(o => !o)} aria-expanded={showLog} className="h-8 px-3 rounded-lg ring-1 ring-inset ring-slate-200 hover:bg-slate-50 text-[12.5px] font-semibold text-slate-700 inline-flex items-center gap-1.5">
            <CheckCircleIcon className="w-4 h-4 text-emerald-600" />Fixed automatically · {log.length}
            <ChevronRightIcon className={`w-3.5 h-3.5 transition-transform duration-300 ${showLog ? 'rotate-90' : ''}`} />
          </button>
        )}
      </div>
      {fixes.length > 0 && (
        <ul className="border-t border-slate-100 divide-y divide-slate-100">
          {fixes.map((f, i) => (
            <li key={f.id} className="ota-row px-4 sm:px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2" style={{ animationDelay: `${80 + i * 50}ms` }}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <p className="text-[12.5px] text-slate-700 flex-1 min-w-[200px]">{f.problem}</p>
              <button type="button" onClick={() => { onUpdate(f.apply(aggregator)); notify?.(`Fixed: ${f.action}.`); }}
                className="h-8 px-3 rounded-lg bg-white ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50 text-[12.5px] font-semibold text-indigo-700 whitespace-nowrap">{f.action}</button>
            </li>
          ))}
        </ul>
      )}
      {showLog && log.length > 0 && (
        <ul className="border-t border-slate-100 bg-slate-50/60 px-4 sm:px-5 py-2.5 space-y-1 max-h-56 overflow-y-auto">
          {log.map((l, i) => (
            <li key={i} className="flex gap-3 text-[12px]"><span className="text-slate-400 tabular-nums whitespace-nowrap">{displayStamp(l.at)}</span><span className="text-slate-700">{l.text}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default AutoRepairPanel;
