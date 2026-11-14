import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * A short, centred confirmation after an action ("Published", "Channel created", "Changes saved"…):
 * a spinner saying what is happening, then the result mark, a title and one line of detail. It never blocks the screen: there is no backdrop,
 * clicks pass through it to what is underneath, it closes by itself (or with × / Esc), and a new action
 * replaces the previous message.
 */

export type FeedbackTone = 'success' | 'warning' | 'error';
export interface Feedback { id: number; tone: FeedbackTone; title: string; detail?: string }

let current: Feedback | null = null;
let counter = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Reads a plain message and gives it a title and a tone, so existing messages keep working unchanged. */
export const classify = (message: string): Omit<Feedback, 'id'> => {
  const m = message.trim();
  const bad = /\b(failed|could not|cannot|can't|not attempted|error)\b/i.test(m);
  const partly = bad && /\b(saved|stored|kept|will sync|locally)\b/i.test(m);
  if (bad) return { tone: partly ? 'warning' : 'error', title: partly ? 'Saved, with a warning' : 'Not completed', detail: m };
  const rules: [RegExp, string][] = [
    [/^channel\b.*\bcreated\b/i, 'Channel created'],
    [/\bkey\b.*\bcreated\b|\bnew\b.*\bkey\b/i, 'API key created'],
    [/^rate rules\b.*\bpublished\b/i, 'Rate rules published'],
    [/\brates?\b.*\bpublished\b|\bversion \d+ published\b/i, 'Rates published'],
    [/\bpublished\b/i, 'Published'],
    [/\b(delivered|sent)\b/i, 'Sent'],
    [/\brevoked\b/i, 'Revoked'],
    [/\b(deleted)\b/i, 'Deleted'],
    [/\bremoved\b/i, 'Removed'],
    [/\bunlocked\b/i, 'Unlocked'],
    [/\b(created|added)\b/i, 'Created'],
    [/\bapplied\b/i, 'Applied'],
    [/\b(built|loaded|changed)\b/i, 'Updated'],
    [/\bapproved\b/i, 'Approved'],
    [/\bcopied\b/i, 'Copied'],
  ];
  const hit = rules.find(([re]) => re.test(m));
  return { tone: 'success', title: hit ? hit[1] : 'Saved', detail: m };
};

/** Shows the confirmation: a plain message (titled automatically) or an explicit title, detail and tone. */
export const showActionFeedback = (input: string | Omit<Feedback, 'id'>) => {
  const f = typeof input === 'string' ? classify(input) : input;
  current = { ...f, id: ++counter };
  emit();
};
export const dismissActionFeedback = () => { current = null; emit(); };
const useFeedback = () => useSyncExternalStore(subscribe, () => current);

/** What the spinner says for a moment before the result: "Publishing…", "Saving…"… */
export const workingLabel = (title: string, tone: FeedbackTone): string => {
  if (tone === 'error') return 'Working…';
  const t = title.toLowerCase();
  const map: [RegExp, string][] = [
    [/publish/, 'Publishing…'], [/sent/, 'Sending…'], [/creat/, 'Creating…'], [/revok/, 'Revoking…'],
    [/delet|remov/, 'Removing…'], [/unlock/, 'Unlocking…'], [/appl/, 'Applying…'], [/approv/, 'Approving…'],
    [/stop sale added/, 'Adding…'], [/updat/, 'Updating…'], [/cop/, 'Copying…'],
  ];
  return (map.find(([re]) => re.test(t)) || [null, 'Saving…'])[1];
};

const TONE = {
  success: { dot: 'bg-emerald-500', spin: 'border-t-emerald-500', label: 'Success' },
  warning: { dot: 'bg-amber-500', spin: 'border-t-amber-500', label: 'Warning' },
  error: { dot: 'bg-rose-500', spin: 'border-t-rose-500', label: 'Error' },
} as const;
const DURATION: Record<FeedbackTone, number> = { success: 2600, warning: 5200, error: 6000 };
const WORKING_MS = 650;

const Mark: React.FC<{ tone: FeedbackTone }> = ({ tone }) => (
  <svg viewBox="0 0 52 52" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {tone === 'success' && <path className="nct-fb-draw" d="M14 27.5l8.5 8.5L38.5 18" />}
    {tone === 'warning' && <><path className="nct-fb-draw" d="M26 14v15" /><path d="M26 37.5v.5" /></>}
    {tone === 'error' && <path className="nct-fb-draw" d="M17 17l18 18M35 17L17 35" />}
  </svg>
);

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * "Progress to success": a spinner with what is happening ("Publishing…") for a moment, then it turns
 * into the result mark and opens into the message.
 */
const ActionFeedback: React.FC = () => {
  const f = useFeedback();
  const [done, setDone] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (!f) return;
    const working = reducedMotion() ? 0 : WORKING_MS;
    setDone(working === 0);
    if (working) timers.current.push(setTimeout(() => setDone(true), working));
    timers.current.push(setTimeout(dismissActionFeedback, working + DURATION[f.tone]));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissActionFeedback(); };
    window.addEventListener('keydown', onKey);
    return () => { timers.current.forEach(clearTimeout); window.removeEventListener('keydown', onKey); };
  }, [f]);

  if (!f) return null;
  const t = TONE[f.tone];
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center pointer-events-none px-4" aria-live={f.tone === 'success' ? 'polite' : 'assertive'}>
      <style>{`
        @keyframes nct-fb-in { from { opacity: 0; transform: translateY(8px) scale(.9) } to { opacity: 1; transform: none } }
        @keyframes nct-fb-spin { to { transform: rotate(360deg) } }
        @keyframes nct-fb-pop { 0% { transform: scale(.7) } 60% { transform: scale(1.12) } 100% { transform: scale(1) } }
        @keyframes nct-fb-draw { from { stroke-dashoffset: 40 } to { stroke-dashoffset: 0 } }
        @keyframes nct-fb-grow { from { max-width: 64px } to { max-width: 560px } }
        @keyframes nct-fb-text { from { opacity: 0; transform: translateX(-6px) } to { opacity: 1; transform: none } }
        .nct-fb-in { animation: nct-fb-in .3s cubic-bezier(.2,.9,.25,1.15) both }
        .nct-fb-spin { animation: nct-fb-spin .8s linear infinite }
        .nct-fb-pop { animation: nct-fb-pop .4s cubic-bezier(.2,.9,.3,1.3) both }
        .nct-fb-draw { stroke-dasharray: 40; animation: nct-fb-draw .4s ease-out .1s both }
        .nct-fb-grow { animation: nct-fb-grow .5s cubic-bezier(.2,.9,.25,1.05) both }
        .nct-fb-text { animation: nct-fb-text .3s ease-out .3s both }
        @media (prefers-reduced-motion: reduce) { .nct-fb-in, .nct-fb-pop, .nct-fb-draw, .nct-fb-grow, .nct-fb-text { animation: none } }
      `}</style>
      <div key={f.id} className="nct-fb-in flex flex-col items-center">
        <div role="status" data-testid="action-feedback" data-tone={f.tone} data-state={done ? 'done' : 'working'}
          className={`relative flex items-center gap-3.5 bg-white shadow-[0_22px_60px_-16px_rgba(15,23,42,0.45)] ring-1 ring-slate-200 overflow-hidden
            ${done ? 'nct-fb-grow rounded-[28px] py-2.5 pl-2.5 pr-11' : 'rounded-full p-2.5 max-w-[64px]'}`}>
          <span className={`relative shrink-0 w-11 h-11 rounded-full inline-flex items-center justify-center text-white transition-colors duration-200 ${done ? `${t.dot} nct-fb-pop` : 'bg-slate-100'}`}>
            {!done && <span className={`nct-fb-spin absolute -inset-[3px] rounded-full border-[3px] border-transparent ${t.spin}`} />}
            {done && <Mark tone={f.tone} />}
          </span>
          {done && (
            <span className="nct-fb-text min-w-0 py-0.5">
              <span className="sr-only">{t.label}: </span>
              <span className="block text-[15px] font-semibold leading-snug text-slate-900">{f.title}</span>
              {f.detail && <span className="block mt-0.5 text-[13px] leading-snug text-slate-500">{f.detail}</span>}
            </span>
          )}
          {done && (
            <button type="button" onClick={dismissActionFeedback} aria-label="Close" title="Close (Esc)"
              className="pointer-events-auto absolute top-1/2 -translate-y-1/2 right-2.5 w-7 h-7 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100">
              <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
            </button>
          )}
        </div>
        {!done && <p className="mt-3 text-[13px] font-medium text-slate-600 bg-white/80 backdrop-blur px-3 py-1 rounded-full shadow-sm">{workingLabel(f.title, f.tone)}</p>}
      </div>
    </div>
  );
};

export default ActionFeedback;
