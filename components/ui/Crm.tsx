import React from 'react';

/*
 * Shared building blocks for every screen, so the whole system has one
 * enterprise-CRM look (the reservations workspace is the reference).
 *
 *   <Page>
 *     <PageHeader section="Finance" title="Accounting" subtitle="…" actions={…} />
 *     <StatGrid items={[…]} />
 *     <Panel title="Expenses" actions={…}> <DataTable …/> </Panel>
 *   </Page>
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const Page: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cx('space-y-4 mb-10', className)}>{children}</div>
);

export const PageHeader: React.FC<{
  section?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ section, title, subtitle, actions }) => (
  <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
    <div className="min-w-0">
      {section && <p className="text-xs font-medium text-slate-500">{section} <span className="text-slate-300 mx-1">/</span> {typeof title === 'string' ? title : ''}</p>}
      <h2 className="mt-0.5 text-2xl font-semibold text-slate-900 tracking-tight">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 [&>*]:max-sm:flex-1">{actions}</div>}
  </div>
);

type Tone = 'default' | 'info' | 'success' | 'warning' | 'danger' | 'muted';
const toneText: Record<Tone, string> = {
  default: 'text-slate-900', info: 'text-sky-700', success: 'text-emerald-700', warning: 'text-amber-600', danger: 'text-rose-600', muted: 'text-slate-500',
};

export interface StatItem {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
}
export const StatGrid: React.FC<{ items: StatItem[]; className?: string }> = ({ items, className }) => {
  const cols = items.length >= 6 ? 'grid-cols-3 xl:grid-cols-6' : items.length === 5 ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5' : items.length === 3 ? 'grid-cols-3' : 'grid-cols-2 lg:grid-cols-4';
  return (
    <div className={cx('grid gap-2 sm:gap-3', cols, className)}>
      {items.map(t => {
        const inner = (
          <>
            <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">{t.label}</p>
            <p className={cx('mt-0.5 sm:mt-1 text-base sm:text-xl font-semibold tabular-nums truncate', toneText[t.tone || 'default'])}>{t.value}</p>
            {t.sub !== undefined && <p className="hidden sm:block text-[11px] text-slate-400 truncate">{t.sub}</p>}
          </>
        );
        const cls = cx('text-left min-w-0 bg-white rounded-xl border px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm transition-colors',
          t.active ? 'border-indigo-500 ring-2 ring-indigo-500/15' : 'border-slate-200', t.onClick && 'hover:border-slate-300');
        return t.onClick
          ? <button key={t.label} type="button" onClick={t.onClick} aria-pressed={!!t.active} className={cls}>{inner}</button>
          : <div key={t.label} className={cls}>{inner}</div>;
      })}
    </div>
  );
};

export const Panel: React.FC<{
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
  footer?: React.ReactNode;
}> = ({ title, subtitle, actions, children, className, bodyClassName, padded = false, footer }) => (
  <section className={cx('bg-white rounded-xl border border-slate-200 shadow-sm overflow-clip min-w-0', className)}>
    {(title || actions) && (
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    )}
    <div className={cx(padded && 'p-4', bodyClassName)}>{children}</div>
    {footer && <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-500">{footer}</div>}
  </section>
);

/** Sub-heading inside a panel or form. */
export const SectionLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <h4 className={cx('text-[11px] font-semibold uppercase tracking-wider text-slate-500', className)}>{children}</h4>
);

/** Filter / tool row that sits directly under a panel header or tab bar. */
export const Toolbar: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cx('p-3 flex flex-col md:flex-row md:flex-wrap md:items-center gap-2 border-b border-slate-100 bg-slate-50/50', className)}>{children}</div>
);

export const Tabs: React.FC<{
  tabs: { key: string; label: React.ReactNode; count?: number }[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}> = ({ tabs, value, onChange, className }) => (
  <div className={cx('px-2 sm:px-3 border-b border-slate-200 flex gap-0.5 overflow-x-auto no-scrollbar', className)} role="tablist">
    {tabs.map(t => (
      <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}
        className={cx('px-3 py-3 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
          value === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>
        {t.label}
        {t.count !== undefined && <span className={cx('ml-1.5 px-1.5 py-px rounded text-[11px] tabular-nums', value === t.key ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500')}>{t.count}</span>}
      </button>
    ))}
  </div>
);

/** Segmented control for small option sets (period, currency, view). */
export const Segmented: React.FC<{ options: { key: string; label: React.ReactNode }[]; value: string; onChange: (key: string) => void; className?: string }> = ({ options, value, onChange, className }) => (
  <div className={cx('inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200', className)}>
    {options.map(o => (
      <button key={o.key} type="button" onClick={() => onChange(o.key)} aria-pressed={value === o.key}
        className={cx('h-8 px-3 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors flex-1',
          value === o.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>{o.label}</button>
    ))}
  </div>
);

const badgeTone: Record<Tone, string> = {
  default: 'bg-slate-100 text-slate-700 ring-slate-200',
  muted: 'bg-slate-100 text-slate-600 ring-slate-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
};
const dotTone: Record<Tone, string> = { default: 'bg-slate-400', muted: 'bg-slate-400', info: 'bg-sky-500', success: 'bg-emerald-500', warning: 'bg-amber-500', danger: 'bg-rose-500' };
export const Badge: React.FC<{ tone?: Tone; dot?: boolean; children: React.ReactNode; className?: string }> = ({ tone = 'default', dot = true, children, className }) => (
  <span className={cx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap', badgeTone[tone], className)}>
    {dot && <span className={cx('w-1.5 h-1.5 rounded-full', dotTone[tone])} />}{children}
  </span>
);

export const Plate: React.FC<{ value?: string }> = ({ value }) => value
  ? <span className="inline-block px-1.5 py-px rounded border border-slate-300 bg-slate-50 font-mono text-[10.5px] font-semibold text-slate-700 tracking-wide">{value}</span>
  : null;

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const btnVariant: Record<BtnVariant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm',
  ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
  danger: 'bg-white text-rose-600 border border-rose-200 hover:bg-rose-50',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
};
export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; icon?: React.ReactNode }> = ({ variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest }) => (
  <button type={type} {...rest}
    className={cx('inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
      size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-[13px]', btnVariant[variant], className)}>
    {icon}{children}
  </button>
);

/** Standard form classes so inputs look the same on every screen. */
export const inputCls = 'w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-[13px] text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-500';
export const selectCls = 'h-9 pl-3 pr-8 bg-white border border-slate-300 rounded-lg text-[13px] text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none';
export const textareaCls = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-[13px] text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none';
export const labelCls = 'block text-[13px] font-medium text-slate-700 mb-1';

export const Field: React.FC<{ label: React.ReactNode; hint?: React.ReactNode; required?: boolean; children: React.ReactNode; className?: string }> = ({ label, hint, required, children, className }) => (
  <label className={cx('block min-w-0', className)}>
    <span className={labelCls}>{label}{required && <span className="text-rose-500"> *</span>}</span>
    {children}
    {hint && <span className="block mt-1 text-xs text-slate-500">{hint}</span>}
  </label>
);

/** Table classes: use with a plain <table> so pages keep full control of cells. */
export const table = {
  wrap: 'w-full text-[13px]',
  head: 'bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 text-left',
  th: 'font-semibold px-3 py-2.5 whitespace-nowrap first:pl-4 last:pr-4',
  body: 'divide-y divide-slate-100',
  row: 'hover:bg-slate-50 transition-colors',
  td: 'px-3 py-2.5 first:pl-4 last:pr-4 align-middle',
};

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; hint?: React.ReactNode; action?: React.ReactNode; className?: string }> = ({ icon, title, hint, action, className }) => (
  <div className={cx('py-14 px-4 text-center', className)}>
    <div className="w-11 h-11 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 [&>svg]:w-5 [&>svg]:h-5">
      {icon || <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>}
    </div>
    <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
    {hint && <p className="mt-0.5 text-sm text-slate-500 max-w-sm mx-auto">{hint}</p>}
    {action && <div className="mt-3 flex justify-center">{action}</div>}
  </div>
);

/** Label / value rows, as used in detail panels. */
export const DetailList: React.FC<{ rows: { label: React.ReactNode; value: React.ReactNode }[]; className?: string }> = ({ rows, className }) => (
  <dl className={cx('divide-y divide-slate-100 text-[13px]', className)}>
    {rows.map((r, i) => (
      <div key={i} className="flex items-start justify-between gap-4 py-2">
        <dt className="text-slate-500 shrink-0">{r.label}</dt>
        <dd className="text-right text-slate-900 font-medium min-w-0 break-words">{r.value}</dd>
      </div>
    ))}
  </dl>
);

/** Centered dialog on desktop, full-screen sheet on phones. */
export const Dialog: React.FC<{ open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: 'md' | 'lg' | 'xl' }> = ({ open, onClose, title, subtitle, children, footer, size = 'lg' }) => {
  if (!open) return null;
  const w = size === 'md' ? 'sm:max-w-lg' : size === 'xl' ? 'sm:max-w-4xl' : 'sm:max-w-2xl';
  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className={cx('relative bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-xl shadow-2xl flex flex-col overflow-hidden', w)}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};

/** Right-hand detail drawer (full width on phones). */
export const Drawer: React.FC<{ open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }> = ({ open, onClose, title, subtitle, children, footer }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 w-full sm:w-[480px] bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900 truncate">{title}</h3>
            {subtitle && <div className="text-[13px] text-slate-500 mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-200 flex flex-wrap items-center gap-2">{footer}</div>}
      </aside>
    </div>
  );
};
