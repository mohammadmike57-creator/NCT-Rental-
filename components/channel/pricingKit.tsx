import React, { useEffect, useRef } from 'react';

/**
 * Shared building blocks for the pricing screens (Price rules, Last minute). Display only: they hold
 * no pricing logic, so the numbers on screen always come from the same calculation the server uses.
 */

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export const money2 = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const signed = (v: number, unit = '%') => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-GB', { maximumFractionDigits: 2 })}${unit === '%' ? '%' : ` ${unit}`}`;

/** Up = the rate rises, down = it falls. One colour language on every pricing screen. */
export const toneOf = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat') as 'up' | 'down' | 'flat';
export const toneText = { up: 'text-amber-700', down: 'text-emerald-700', flat: 'text-slate-400' };
export const toneSoft = { up: 'bg-amber-50 text-amber-800 ring-amber-200', down: 'bg-emerald-50 text-emerald-800 ring-emerald-200', flat: 'bg-slate-50 text-slate-500 ring-slate-200' };

/** A rounded value chip: +10% / −8% / 0%. */
export const Delta: React.FC<{ value: number; unit?: string; size?: 'sm' | 'md'; className?: string }> = ({ value, unit = '%', size = 'sm', className }) => (
  <span className={cx('inline-flex items-center gap-0.5 rounded-md ring-1 ring-inset font-semibold tabular-nums whitespace-nowrap',
    size === 'sm' ? 'px-1.5 py-px text-[11px]' : 'px-2 py-0.5 text-[12px]', toneSoft[toneOf(value)], className)}>
    {value > 0 ? '▲' : value < 0 ? '▼' : '•'}<span>{value === 0 ? (unit === '%' ? '0%' : `0 ${unit}`) : signed(value, unit).replace(/^[+−]/, '')}</span>
  </span>
);

/** − value + with a unit. Signed values allowed (a minus is a discount). */
export const Stepper: React.FC<{
  value?: number; onChange: (v?: number) => void; step?: number; min?: number; max?: number; unit?: string; label: string;
  placeholder?: string; width?: string; signedTone?: boolean; size?: 'sm' | 'md';
}> = ({ value, onChange, step = 1, min = -90, max = 500, unit, label, placeholder = '0', width = 'w-14', signedTone = true, size = 'md' }) => {
  const v = value ?? 0;
  const clamp = (x: number) => Math.max(min, Math.min(max, Math.round(x * 100) / 100));
  const tone = signedTone ? toneOf(v) : 'flat';
  const h = size === 'sm' ? 'h-8' : 'h-9';
  return (
    <span className={cx('inline-flex items-stretch rounded-lg border bg-white shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500', h,
      tone === 'up' ? 'border-amber-300' : tone === 'down' ? 'border-emerald-300' : 'border-slate-300')}>
      <button type="button" aria-label={`${label}: less`} onClick={() => onChange(clamp(v - step) || undefined)}
        className="w-8 text-slate-500 hover:bg-slate-50 hover:text-slate-900 border-r border-slate-200 text-[15px] leading-none">−</button>
      <input type="number" step={step} min={min} max={max} value={value ?? ''} placeholder={placeholder} aria-label={label}
        onChange={e => onChange(e.target.value === '' || e.target.value === '-' ? undefined : clamp(Number(e.target.value)))}
        className={cx(width, 'px-1.5 text-center text-[13px] font-semibold tabular-nums outline-none bg-transparent', signedTone ? toneText[tone].replace('text-slate-400', 'text-slate-800') : 'text-slate-800')} />
      {unit && <span className="inline-flex items-center pr-2 text-[12px] font-medium text-slate-400">{unit}</span>}
      <button type="button" aria-label={`${label}: more`} onClick={() => onChange(clamp(v + step) || undefined)}
        className="w-8 text-slate-500 hover:bg-slate-50 hover:text-slate-900 border-l border-slate-200 text-[15px] leading-none">+</button>
    </span>
  );
};

/** Segmented control. */
export function Seg<T extends string | number>({ options, value, onChange, size = 'md', label }: { options: [T, React.ReactNode][]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md'; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-0.5 rounded-lg bg-slate-100 ring-1 ring-inset ring-slate-200">
      {options.map(([k, l]) => (
        <button key={String(k)} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={cx('rounded-md font-medium transition-all whitespace-nowrap', size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]',
            value === k ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800')}>{l}</button>
      ))}
    </div>
  );
}

export const Toggle: React.FC<{ on: boolean; onChange: (b: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
    className={cx('relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40', on ? 'bg-indigo-600' : 'bg-slate-300')}>
    <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', on ? 'translate-x-4' : 'translate-x-0.5')} />
  </button>
);

/** A numbered rule card: icon tile, title, one-line summary of what is set, optional on/off. */
export const RuleCard: React.FC<{
  id?: string; step?: number | string; icon: React.ReactNode; title: string; description: string; summary?: React.ReactNode;
  active?: boolean; onToggle?: (b: boolean) => void; actions?: React.ReactNode; children?: React.ReactNode; flush?: boolean;
}> = ({ id, step, icon, title, description, summary, active, onToggle, actions, children, flush }) => (
  <section id={id} className={cx('scroll-mt-28 bg-white rounded-xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)] min-w-0 overflow-clip transition-colors',
    active ? 'border-slate-200' : 'border-slate-200')}>
    <header className="flex flex-wrap items-start gap-3 px-5 py-4">
      <span className={cx('relative mt-0.5 grid place-items-center w-9 h-9 rounded-lg ring-1 ring-inset [&>svg]:w-[18px] [&>svg]:h-[18px]',
        active ? 'bg-indigo-50 text-indigo-600 ring-indigo-100' : 'bg-slate-50 text-slate-400 ring-slate-200')}>
        {icon}
        {step != null && <span className="absolute -top-1.5 -left-1.5 grid place-items-center w-4 h-4 rounded-full bg-slate-900 text-white text-[9px] font-bold">{step}</span>}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[14px] font-semibold text-slate-900 tracking-[-0.005em]">{title}</h3>
          {summary}
        </div>
        <p className="mt-0.5 text-[12.5px] leading-5 text-slate-500 max-w-[68ch]">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {onToggle && <span className="inline-flex items-center gap-2 text-[12px] font-medium text-slate-600"><Toggle on={!!active} onChange={onToggle} label={title} />{active ? 'On' : 'Off'}</span>}
      </div>
    </header>
    {children && <div className={cx('border-t border-slate-100', !flush && 'px-5 py-4')}>{children}</div>}
  </section>
);

/** Summary chip used in card headers: "Active · +10%" or "Not set". */
export const StateChip: React.FC<{ on: boolean; children?: React.ReactNode }> = ({ on, children }) => (
  <span className={cx('inline-flex items-center gap-1.5 h-5 px-2 rounded-full text-[11px] font-semibold ring-1 ring-inset',
    on ? 'bg-indigo-50 text-indigo-700 ring-indigo-200' : 'bg-slate-50 text-slate-500 ring-slate-200')}>
    <span className={cx('w-1.5 h-1.5 rounded-full', on ? 'bg-indigo-500' : 'bg-slate-300')} />{children ?? (on ? 'Active' : 'Not set')}
  </span>
);

/** One line of a price build-up: label, change, running amount, with a bar. */
export interface BuildStep { label: string; detail?: string; delta?: number; amount: number; kind?: 'base' | 'step' | 'final' | 'muted' }
export const BuildUp: React.FC<{ steps: BuildStep[]; currency: string }> = ({ steps, currency }) => {
  const max = Math.max(1, ...steps.map(s => s.amount));
  return (
    <ol className="space-y-0.5">
      {steps.map((s, i) => {
        const final = s.kind === 'final', base = s.kind === 'base', muted = s.kind === 'muted';
        const tone = toneOf(s.delta ?? 0);
        return (
          <li key={i} className={cx('relative grid grid-cols-[1fr_auto] items-center gap-x-3 rounded-lg px-3 py-2', final ? 'bg-slate-900 text-white mt-2' : muted ? 'opacity-55' : 'hover:bg-slate-50')}>
            <div className="min-w-0">
              <p className={cx('text-[12.5px] font-medium truncate', final ? 'text-white' : 'text-slate-800')}>{s.label}</p>
              {s.detail && <p className={cx('text-[11px] truncate', final ? 'text-slate-300' : 'text-slate-500')}>{s.detail}</p>}
              {!final && (
                <div className="mt-1.5 h-1 rounded-full bg-slate-100 overflow-hidden">
                  <div className={cx('h-full rounded-full', base ? 'bg-slate-400' : tone === 'up' ? 'bg-amber-400' : tone === 'down' ? 'bg-emerald-500' : 'bg-slate-300')}
                    style={{ width: `${Math.max(2, (s.amount / max) * 100)}%` }} />
                </div>
              )}
            </div>
            <div className="text-right">
              {s.delta != null && !base && !final && <p className={cx('text-[11px] font-semibold tabular-nums', toneText[tone])}>{s.delta === 0 ? '—' : `${s.delta > 0 ? '+' : '−'}${money2(Math.abs(s.delta))}`}</p>}
              <p className={cx('tabular-nums', final ? 'text-[18px] font-bold' : 'text-[13px] font-semibold text-slate-900')}>{money2(s.amount)}{final && <span className="ml-1 text-[11px] font-medium text-slate-300">{currency}</span>}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
};

/** Closes on outside click or Escape. */
export const Popover: React.FC<{ onClose: () => void; children: React.ReactNode; className?: string; align?: 'left' | 'right' }> = ({ onClose, children, className, align = 'right' }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', down), 0);
    document.addEventListener('keydown', key);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [onClose]);
  return (
    <div ref={ref} role="dialog" className={cx('absolute z-30 top-full mt-2 w-[300px] rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 ring-1 ring-black/5 text-left',
      align === 'right' ? 'right-0' : 'left-0', className)}>
      {children}
    </div>
  );
};

/** Icons, 24px outline. */
const I = (d: string) => () => <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>;
export const Icons = {
  percent: I('M8.25 15.75l7.5-7.5M9 9.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm7.5 4.5a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12 21a9 9 0 100-18 9 9 0 000 18z'),
  cars: I('M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12'),
  calendar: I('M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5'),
  clock: I('M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z'),
  lock: I('M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z'),
  stop: I('M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636'),
  bolt: I('M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z'),
  history: I('M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z'),
  calc: I('M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z'),
  plus: I('M12 4.5v15m7.5-7.5h-15'),
  x: I('M6 18L18 6M6 6l12 12'),
  check: I('M4.5 12.75l6 6 9-13.5'),
};
