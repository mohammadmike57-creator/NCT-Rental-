import React, { useEffect } from 'react';
import { PlanId, SupplierStatus } from '../../services/platformApi';

/** Building blocks of the admin portal: one quiet, consistent look, distinct from the suppliers' workspace. */

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const P = (d: string) => <path strokeLinecap="round" strokeLinejoin="round" d={d} />;
const svg = (children: React.ReactNode, className = 'w-4 h-4') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden="true">{children}</svg>
);
export const Icon = {
  overview: (c?: string) => svg(<>{P('M3.75 3.75h6.5v6.5h-6.5zM13.75 3.75h6.5v6.5h-6.5zM3.75 13.75h6.5v6.5h-6.5zM13.75 13.75h6.5v6.5h-6.5z')}</>, c),
  suppliers: (c?: string) => svg(<>{P('M3.75 21h16.5M4.5 21V7.5L12 3l7.5 4.5V21M9 21v-4.5h6V21M8.25 10.5h1.5M14.25 10.5h1.5M8.25 13.5h1.5M14.25 13.5h1.5')}</>, c),
  activity: (c?: string) => svg(<>{P('M3.75 12h3l2.25-6 4.5 12 2.25-6h4.5')}</>, c),
  plus: (c?: string) => svg(<>{P('M12 4.5v15m7.5-7.5h-15')}</>, c),
  search: (c?: string) => svg(<>{P('M21 21l-5.2-5.2M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z')}</>, c),
  back: (c?: string) => svg(<>{P('M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18')}</>, c),
  check: (c?: string) => svg(<>{P('M4.5 12.75l6 6 9-13.5')}</>, c),
  x: (c?: string) => svg(<>{P('M6 18L18 6M6 6l12 12')}</>, c),
  shield: (c?: string) => svg(<>{P('M12 3l7.5 3v5.25c0 4.6-3.2 8.6-7.5 9.75-4.3-1.15-7.5-5.15-7.5-9.75V6L12 3z')}{P('M9 12l2 2 4-4')}</>, c),
  edit: (c?: string) => svg(<>{P('M16.86 4.49l2.65 2.65M4.5 19.5l3.75-.75L19.06 7.94a1.87 1.87 0 00-2.65-2.65L5.6 16.1l-1.1 3.4z')}</>, c),
  pause: (c?: string) => svg(<>{P('M9 5.25v13.5M15 5.25v13.5')}</>, c),
  play: (c?: string) => svg(<>{P('M6.75 5.25v13.5L18.75 12 6.75 5.25z')}</>, c),
  users: (c?: string) => svg(<>{P('M15 19.13a9.4 9.4 0 003.5.67 4.1 4.1 0 00.4-4.95M15 19.13v-.13c0-1.1-.28-2.14-.78-3.04M15 19.13A11.9 11.9 0 019 20.25a11.9 11.9 0 01-6-1.62v-.13a6 6 0 0111.22-2.54M12 6.38a3 3 0 11-6 0 3 3 0 016 0zm8.25 2.25a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z')}</>, c),
  link: (c?: string) => svg(<>{P('M13.19 8.69a4.5 4.5 0 011.24 7.24l-4.5 4.5a4.5 4.5 0 01-6.36-6.37l1.75-1.75m13.35-.62l1.75-1.75a4.5 4.5 0 00-6.36-6.36l-4.5 4.5a4.5 4.5 0 001.24 7.24')}</>, c),
  copy: (c?: string) => svg(<>{P('M15.75 17.25v3a.75.75 0 01-.75.75H4.5a.75.75 0 01-.75-.75V8.25a.75.75 0 01.75-.75h3m8.25-3.75h3.75a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75V4.5a.75.75 0 01.75-.75h7.5z')}</>, c),
  signal: (c?: string) => svg(<>{P('M8.29 15.71a5.25 5.25 0 010-7.42m7.42 0a5.25 5.25 0 010 7.42M5.11 18.89a9.75 9.75 0 010-13.78m13.78 0a9.75 9.75 0 010 13.78M12 12h.01')}</>, c),
  logout: (c?: string) => svg(<>{P('M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75')}</>, c),
  external: (c?: string) => svg(<>{P('M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25')}</>, c),
  alert: (c?: string) => svg(<>{P('M12 9v3.75m0 3.75h.01M10.34 3.94L2.6 17.25A1.88 1.88 0 004.23 20h15.54a1.88 1.88 0 001.63-2.75L13.66 3.94a1.88 1.88 0 00-3.32 0z')}</>, c),
  car: (c?: string) => svg(<>{P('M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h7.5m-7.5 0H4.5V12l2.25-5.25h10.5L19.5 12v6.75h-.75m-3 0a1.5 1.5 0 003 0m-3 0a1.5 1.5 0 013 0M4.5 12h15')}</>, c),
  globe: (c?: string) => svg(<>{P('M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a13.5 13.5 0 010 18M12 3a13.5 13.5 0 000 18')}</>, c),
  layers: (c?: string) => svg(<>{P('M6.43 9.75L2.25 12l4.18 2.25m0-4.5l5.57 3 5.57-3m-11.14 0L2.25 7.5 12 2.25l9.75 5.25-4.18 2.25m0 0L21.75 12l-4.18 2.25m0 0l4.18 2.25L12 21.75 2.25 16.5l4.18-2.25m11.14 0l-5.57 3-5.57-3')}</>, c),
};

export const PLAN_STYLE: Record<PlanId, { pill: string; tile: string; dot: string; short: string }> = {
  FULL: { pill: 'bg-slate-900 text-white', tile: 'bg-slate-900', dot: 'bg-slate-900', short: 'Full system' },
  CRM: { pill: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200', tile: 'bg-sky-600', dot: 'bg-sky-500', short: 'CRM only' },
  XML: { pill: 'bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-200', tile: 'bg-teal-600', dot: 'bg-teal-500', short: 'OTA XML only' },
};

export const PlanPill: React.FC<{ plan: PlanId; className?: string }> = ({ plan, className }) => (
  <span className={cx('inline-flex items-center h-6 px-2.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap', PLAN_STYLE[plan].pill, className)}>{PLAN_STYLE[plan].short}</span>
);

const STATUS: Record<SupplierStatus, { label: string; cls: string; dot: string }> = {
  ACTIVE: { label: 'Active', cls: 'text-emerald-700 bg-emerald-50 ring-emerald-200', dot: 'bg-emerald-500' },
  PAUSED: { label: 'Paused', cls: 'text-amber-800 bg-amber-50 ring-amber-200', dot: 'bg-amber-500' },
  CLOSED: { label: 'Closed', cls: 'text-slate-600 bg-slate-100 ring-slate-200', dot: 'bg-slate-400' },
};
export const StatusPill: React.FC<{ status: SupplierStatus }> = ({ status }) => (
  <span className={cx('inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11.5px] font-semibold ring-1 ring-inset whitespace-nowrap', STATUS[status].cls)}>
    <span className={cx('w-1.5 h-1.5 rounded-full', STATUS[status].dot)} />{STATUS[status].label}
  </span>
);

export const Monogram: React.FC<{ name: string; plan: PlanId; size?: 'sm' | 'lg' }> = ({ name, plan, size = 'sm' }) => {
  const letters = name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  return <span className={cx('inline-flex items-center justify-center rounded-xl text-white font-semibold tracking-wide shrink-0', PLAN_STYLE[plan].tile,
    size === 'lg' ? 'w-14 h-14 text-[18px]' : 'w-9 h-9 text-[12px]')}>{letters}</span>;
};

export const Card: React.FC<{ title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; padded?: boolean }> =
  ({ title, subtitle, actions, children, className, padded = true }) => (
    <section className={cx('bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] min-w-0', className)}>
      {(title || actions) && (
        <header className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && <h3 className="text-[14px] font-semibold text-slate-900">{title}</h3>}
            {subtitle && <p className="text-[12.5px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="ml-auto flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'px-5 pb-5' : ''}>{children}</div>
    </section>
  );

export const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode }> = ({ label, value, sub, icon }) => (
  <div className="bg-white rounded-2xl border border-slate-200/80 px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] min-w-0">
    <div className="flex items-center gap-2 text-slate-500">
      {icon && <span className="text-slate-400">{icon}</span>}
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] truncate">{label}</p>
    </div>
    <p className="mt-2 text-[26px] leading-none font-semibold text-slate-900 tabular-nums">{value}</p>
    {sub && <p className="mt-1.5 text-[12px] text-slate-500 truncate">{sub}</p>}
  </div>
);

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning';
const BTN: Record<BtnKind, string> = {
  primary: 'bg-teal-700 text-white hover:bg-teal-800 shadow-sm',
  secondary: 'bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
  warning: 'bg-white text-amber-800 ring-1 ring-inset ring-amber-300 hover:bg-amber-50',
};
export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; icon?: React.ReactNode; small?: boolean }> =
  ({ kind = 'secondary', icon, small, className, children, type = 'button', ...rest }) => (
    <button type={type} {...rest}
      className={cx('inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40',
        small ? 'h-8 px-3 text-[12.5px]' : 'h-9 px-3.5 text-[13px]', BTN[kind], className)}>
      {icon}{children}
    </button>
  );

export const input = 'w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 outline-none disabled:bg-slate-50 disabled:text-slate-500';
export const textarea = 'w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 outline-none';

export const Field: React.FC<{ label: string; hint?: React.ReactNode; required?: boolean; children: React.ReactNode; className?: string; htmlFor?: string }> =
  ({ label, hint, required, children, className, htmlFor }) => (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-[12.5px] font-medium text-slate-700 mb-1.5">{label}{required && <span className="text-rose-500"> *</span>}</label>
      {children}
      {hint && <p className="mt-1.5 text-[12px] text-slate-500">{hint}</p>}
    </div>
  );

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean; id?: string }> =
  ({ checked, onChange, label, hint, disabled, id }) => (
    <label className={cx('flex items-start gap-3 cursor-pointer select-none', disabled && 'opacity-60 cursor-not-allowed')} htmlFor={id}>
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 w-9 h-5 rounded-full transition-colors shrink-0', checked ? 'bg-teal-600' : 'bg-slate-300')}>
        <span className={cx('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
      </button>
      <span>
        <span className="block text-[13px] font-medium text-slate-800">{label}</span>
        {hint && <span className="block text-[12px] text-slate-500">{hint}</span>}
      </span>
    </label>
  );

export const Modal: React.FC<{ open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }> =
  ({ open, onClose, title, subtitle, children, footer, wide }) => {
    useEffect(() => {
      if (!open) return;
      const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', k);
      return () => window.removeEventListener('keydown', k);
    }, [open, onClose]);
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-6">
        <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose} />
        <div role="dialog" aria-modal="true" aria-label={title}
          className={cx('relative w-full bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
          <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-slate-100">
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold text-slate-900">{title}</h2>
              {subtitle && <p className="text-[13px] text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="ml-auto -mr-1 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">{Icon.x()}</button>
          </header>
          <div className="px-6 py-5 overflow-y-auto">{children}</div>
          {footer && <footer className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/60 sm:rounded-b-2xl">{footer}</footer>}
        </div>
      </div>
    );
  };

export const ErrorNote: React.FC<{ text: string }> = ({ text }) => text
  ? <p role="alert" className="flex items-start gap-2 text-[13px] text-rose-700 bg-rose-50 ring-1 ring-inset ring-rose-200 rounded-lg px-3 py-2.5">{Icon.alert('w-4 h-4 mt-0.5 shrink-0')}<span>{text}</span></p>
  : null;

export const when = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
export const date = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const num = (n?: number | null) => (n ?? 0).toLocaleString('en-GB');

/** Copies text; returns false when the browser refuses (the text is then selected for Ctrl+C). */
export const copyText = async (text: string, select?: HTMLInputElement | null): Promise<boolean> => {
  try { await navigator.clipboard.writeText(text); return true; } catch { select?.select(); return false; }
};
