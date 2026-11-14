import React, { useEffect, useRef, useState } from 'react';
import { checkSlug, problem, signInUrl, SlugCheck } from '../../services/platformApi';
import { Btn, copyText, cx, Icon } from './ui';

/** Lower-case letters, digits and single hyphens, as the address allows. */
export const cleanSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+/, '').slice(0, 40);

/**
 * The supplier's own sign-in address: www.nctrental.com/s/{address}. Typed or suggested from the name, and checked
 * on the server as it changes (free, valid, not reserved). {@code onState} reports whether it can be used.
 */
export const SignInAddressField: React.FC<{
  value: string; onChange: (v: string) => void; onState: (ok: boolean) => void; supplierId?: string; id?: string;
}> = ({ value, onChange, onState, supplierId, id }) => {
  const [check, setCheck] = useState<SlugCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const v = value.replace(/-+$/, '');
    if (!v) { setCheck(null); onState(false); return; }
    const n = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      checkSlug({ slug: v, id: supplierId })
        .then(c => { if (n === seq.current) { setCheck(c); onState(c.available); } })
        .catch(e => { if (n === seq.current) { setCheck({ slug: v, available: false, problem: problem(e, 'Could not check the address.'), url: '' }); onState(false); } })
        .finally(() => { if (n === seq.current) setBusy(false); });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, supplierId]);

  const host = window.location.host;
  return (
    <div>
      <div className={cx('flex items-stretch rounded-lg border bg-white overflow-hidden focus-within:ring-2',
        check && !busy ? (check.available ? 'border-emerald-400 focus-within:ring-emerald-500/20' : 'border-rose-300 focus-within:ring-rose-500/20') : 'border-slate-300 focus-within:ring-teal-600/20')}>
        <span className="hidden sm:inline-flex items-center px-3 bg-slate-50 border-r border-slate-200 text-[13px] text-slate-500 whitespace-nowrap font-mono">{host}/s/</span>
        <input id={id} value={value} onChange={e => onChange(cleanSlug(e.target.value))} spellCheck={false} autoCapitalize="none"
          className="flex-1 min-w-0 h-10 px-3 text-[13.5px] font-mono text-slate-900 outline-none" placeholder="desert-drive-rentals" aria-label="Sign-in address" data-testid="slug-input" />
        <span className="inline-flex items-center pr-3 pl-1" aria-live="polite">
          {busy ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-teal-600 animate-spin" />
            : check ? (check.available ? <span className="text-emerald-600" title="Available">{Icon.check('w-4 h-4')}</span> : <span className="text-rose-500" title="Not available">{Icon.x('w-4 h-4')}</span>) : null}
        </span>
      </div>
      <p className={cx('mt-1.5 text-[12px]', check && !busy && !check.available ? 'text-rose-600' : 'text-slate-500')} data-testid="slug-status">
        {busy ? 'Checking…' : check ? (check.available ? <>Available · <span className="font-mono">{signInUrl(check.slug)}</span></> : check.problem) : 'Small letters, digits and hyphens. Staff open this address to sign in.'}
      </p>
    </div>
  );
};

/** The address shown with Copy and Open, for a supplier that has one. */
export const SignInAddressLine: React.FC<{ slug: string; compact?: boolean }> = ({ slug, compact }) => {
  const [copied, setCopied] = useState(false);
  const url = signInUrl(slug);
  return (
    <div className={cx('flex items-center gap-2 min-w-0', compact ? '' : 'rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200 px-3 py-2')}>
      <span className="text-slate-400 shrink-0">{Icon.link('w-4 h-4')}</span>
      <a href={url} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-slate-900 hover:text-teal-800 truncate" data-testid="signin-url">{url}</a>
      <div className="ml-auto flex items-center gap-1 shrink-0">
        <Btn small kind="ghost" icon={copied ? Icon.check('w-3.5 h-3.5') : Icon.copy('w-3.5 h-3.5')} onClick={async () => { if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 1600); } }}>{copied ? 'Copied' : 'Copy'}</Btn>
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[12.5px] font-medium text-slate-600 hover:bg-slate-100">{Icon.external('w-3.5 h-3.5')}Open</a>
      </div>
    </div>
  );
};
