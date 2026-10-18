import React from 'react';
import { Bi } from '../ui/Bi';
import { arOf } from '../../services/uiArabic';

export type StepStatus = 'done' | 'incomplete' | 'pending';

export interface WorkflowStep {
  key: string;
  label: string;
  hint?: string;
  status: StepStatus;
  /** When false the step cannot be opened yet (e.g. second leg of an exchange). */
  enabled?: boolean;
}

const CHECK = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
);

const marker = (s: WorkflowStep, i: number, active: boolean) => {
  if (s.status === 'done') return <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">{CHECK}</span>;
  if (active) return <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-semibold tabular-nums flex items-center justify-center shrink-0">{i + 1}</span>;
  if (s.status === 'incomplete') return <span className="w-5 h-5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-300 text-[11px] font-semibold tabular-nums flex items-center justify-center shrink-0">{i + 1}</span>;
  return <span className="w-5 h-5 rounded-full bg-white text-slate-500 ring-1 ring-inset ring-slate-300 text-[11px] font-semibold tabular-nums flex items-center justify-center shrink-0">{i + 1}</span>;
};

/** Vertical step rail for the desktop counter layout. */
export const StepRail: React.FC<{ title: string; steps: WorkflowStep[]; active: number; onSelect: (index: number) => void; footer?: React.ReactNode }> = ({ title, steps, active, onSelect, footer }) => {
  const done = steps.filter(s => s.status === 'done').length;
  return (
    <nav aria-label={`${title} steps`} className="p-3">
      <div className="px-2 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500"><Bi en={title} className="!text-[12px]" /></p>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${steps.length ? (done / steps.length) * 100 : 0}%` }} /></div>
          <span className="text-[11px] text-slate-500 tabular-nums">{done}/{steps.length}</span>
        </div>
      </div>
      <ol className="space-y-0.5">
        {steps.map((s, i) => {
          const isActive = i === active;
          const enabled = s.enabled !== false;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => enabled && onSelect(i)}
                disabled={!enabled}
                aria-current={isActive ? 'step' : undefined}
                className={`w-full flex items-start gap-2.5 px-2 py-2 rounded-lg text-left transition-colors ${isActive ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : enabled ? 'hover:bg-slate-50' : 'opacity-50 cursor-not-allowed'}`}
              >
                {marker(s, i, isActive)}
                <span className="min-w-0 flex-1">
                  <span className={`flex items-baseline justify-between gap-2 text-[13px] font-medium leading-5 ${isActive ? 'text-indigo-800' : 'text-slate-800'}`}><span className="truncate">{s.label}</span>{arOf(s.label) && <span lang="ar" dir="rtl" className="ar-ui !text-[12px] shrink-0">{arOf(s.label)}</span>}</span>
                  <span className={`block text-[11px] leading-4 truncate ${s.status === 'incomplete' && !isActive ? 'text-amber-700' : 'text-slate-500'}`}>
                    {s.status === 'done' ? 'Complete' : s.hint || (s.status === 'incomplete' ? 'Needs attention' : 'Not started')}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {footer && <div className="mt-4 px-2">{footer}</div>}
    </nav>
  );
};

/** Compact "Step 3 of 7 · Inspection" bar with prev/next for phones and tablets. */
export const MobileStepBar: React.FC<{ steps: WorkflowStep[]; active: number; onSelect: (index: number) => void }> = ({ steps, active, onSelect }) => {
  const s = steps[active];
  if (!s) return null;
  const canPrev = active > 0;
  const canNext = active < steps.length - 1 && steps[active + 1].enabled !== false;
  const arrowCls = 'w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div className="px-3 sm:px-4 py-2 bg-white border-b border-slate-200">
      <div className="flex items-center gap-2">
        <button type="button" className={arrowCls} disabled={!canPrev} onClick={() => onSelect(active - 1)} aria-label="Previous step">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 tabular-nums">Step {active + 1} of {steps.length}</p>
          <p className="text-[13px] font-semibold text-slate-900 truncate flex items-center justify-center gap-1.5">
            <Bi en={s.label} />
            {s.status === 'done' && <span className="text-emerald-600">{CHECK}</span>}
          </p>
        </div>
        <button type="button" className={arrowCls} disabled={!canNext} onClick={() => onSelect(active + 1)} aria-label="Next step">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>
      </div>
      <div className="mt-2 flex gap-1">
        {steps.map((st, i) => (
          <button key={st.key} type="button" aria-label={`Go to ${st.label}`} disabled={st.enabled === false} onClick={() => onSelect(i)}
            className={`flex-1 h-1.5 rounded-full ${i === active ? 'bg-indigo-600' : st.status === 'done' ? 'bg-emerald-500' : st.status === 'incomplete' ? 'bg-amber-300' : 'bg-slate-200'}`} />
        ))}
      </div>
    </div>
  );
};
