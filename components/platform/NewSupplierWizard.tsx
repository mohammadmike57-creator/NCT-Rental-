import React, { useEffect, useMemo, useRef, useState } from 'react';
import { checkSlug, createSupplier, Invitation, PlanId, problem, SupplierForm } from '../../services/platformApi';
import { PlanCards, PLAN_FEATURES } from './PlanCards';
import { Btn, copyText, cx, ErrorNote, Field, Icon, input, PlanPill, textarea, Toggle } from './ui';
import { cleanSlug, SignInAddressField, SignInAddressLine } from './SignInAddress';

const STEPS = ['Company', 'Package', 'Contacts & access', 'Owner', 'Review'] as const;
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JOD', 'AED', 'SAR', 'QAR', 'KWD', 'EGP', 'TRY'];
const ZONES = ['Asia/Amman', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Africa/Cairo', 'Europe/Istanbul', 'Europe/London', 'Europe/Berlin', 'UTC'];

/** A short supplier code from the name: "Desert Drive Rentals" → DDR. */
const codeFrom = (name: string) => {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const c = words.length >= 2 ? words.map(w => w[0]).join('') : (words[0] || '').slice(0, 4);
  return c.slice(0, 6);
};

interface Done { id: string; name: string; plan: PlanId; owner: string; slug?: string | null; invitation?: Invitation }

/** Full-screen form that creates a supplier, its package and its owner, step by step. */
const NewSupplierWizard: React.FC<{ onClose: () => void; onCreated: (id: string) => void }> = ({ onClose, onCreated }) => {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<SupplierForm>({ plan: 'FULL', currency: 'USD', timeZone: 'Asia/Amman', country: 'JO', testAccess: true, liveAccess: false, ownerAccess: 'invite' });
  const [codeTouched, setCodeTouched] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugOk, setSlugOk] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof SupplierForm, v: string | boolean) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => { if (!codeTouched) setF(p => ({ ...p, code: codeFrom(p.name || '') })); }, [f.name, codeTouched]);
  // The sign-in address follows the name until it is typed by hand; the server suggests a free one ("…-2" when taken).
  useEffect(() => {
    if (slugTouched) return;
    const name = (f.name || '').trim();
    setF(p => ({ ...p, slug: cleanSlug(name).replace(/-+$/, '') }));
    if (name.length < 3) return;
    const t = setTimeout(() => { checkSlug({ name }).then(c => { if (!slugTouched) setF(p => ({ ...p, slug: c.slug })); }).catch(() => { /* keep the local suggestion */ }); }, 400);
    return () => clearTimeout(t);
  }, [f.name, slugTouched]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [busy, onClose]);

  const stepError = useMemo(() => {
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (step === 0) {
      if (!f.name?.trim()) return 'Enter the company name.';
      if (!/^[A-Za-z0-9]{2,12}$/.test(f.code || '')) return 'The supplier code needs 2 to 12 letters or digits.';
      if (!slugOk) return 'Choose a sign-in address that is available.';
    }
    if (step === 2) {
      if (f.contactEmail && !email.test(f.contactEmail)) return 'The contact email is not valid.';
      if (f.supportEmail && !email.test(f.supportEmail)) return 'The support email is not valid.';
    }
    if (step === 3) {
      if (!f.ownerName?.trim()) return "Enter the owner's name.";
      if (!email.test(f.ownerEmail || '')) return "Enter the owner's email address.";
      if (f.ownerAccess === 'password' && ((f.ownerPassword || '').length < 8 || !/[A-Za-z]/.test(f.ownerPassword || '') || !/\d/.test(f.ownerPassword || '')))
        return 'The first password needs at least 8 characters with letters and numbers.';
    }
    return '';
  }, [step, f, slugOk]);

  const next = () => {
    if (stepError) { setError(stepError); return; }
    setError('');
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await createSupplier({ ...f, code: (f.code || '').toUpperCase() });
      setDone({ id: r.id, name: r.name, plan: r.plan, owner: r.owner, slug: r.slug, invitation: r.invitation });
    } catch (e) {
      setError(problem(e, 'The supplier could not be created.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/50 backdrop-blur-[2px] flex items-stretch sm:items-center justify-center sm:p-6" data-testid="new-supplier">
      <div role="dialog" aria-modal="true" aria-label="New supplier" className="relative w-full max-w-5xl bg-white sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col sm:flex-row max-h-[100vh] sm:max-h-[92vh]">
        {/* Steps */}
        <aside className="sm:w-64 shrink-0 bg-slate-950 text-slate-300 px-6 py-6 sm:py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-300">New supplier</p>
          <h2 className="mt-2 text-[20px] font-semibold text-white leading-snug">{done ? 'Ready to go' : 'Set up a rental company'}</h2>
          <ol className="mt-8 hidden sm:block space-y-1">
            {STEPS.map((s, i) => {
              const state = done || i < step ? 'done' : i === step ? 'now' : 'next';
              return (
                <li key={s} className={cx('flex items-center gap-3 rounded-lg px-2 py-2 text-[13px]', state === 'now' && 'bg-white/10 text-white')}>
                  <span className={cx('w-6 h-6 rounded-full inline-flex items-center justify-center text-[11px] font-semibold shrink-0',
                    state === 'done' ? 'bg-teal-500 text-slate-950' : state === 'now' ? 'bg-white text-slate-950' : 'ring-1 ring-white/25 text-slate-400')}>
                    {state === 'done' ? Icon.check('w-3.5 h-3.5') : i + 1}
                  </span>
                  <span className={state === 'next' ? 'text-slate-400' : ''}>{s}</span>
                </li>
              );
            })}
          </ol>
          <p className="sm:hidden mt-3 text-[12px] text-slate-400">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
        </aside>

        {/* Form */}
        <div className="flex-1 min-w-0 flex flex-col">
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 z-10">{Icon.x()}</button>
          <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-7 sm:py-9">
            {done ? <Result done={done} copied={copied} linkRef={linkRef}
              onCopy={async () => { if (done.invitation && await copyText(done.invitation.link, linkRef.current)) setCopied(true); }} /> : (
              <>
                <h3 className="text-[18px] font-semibold text-slate-900">{STEPS[step]}</h3>
                <p className="mt-1 text-[13px] text-slate-500">{[
                  'Who the supplier is. The code is shown to brokers in every answer.',
                  'What this supplier can use. The server enforces it for every person and every broker call.',
                  'Who to reach, and whether brokers may use test and live keys.',
                  'The first person of the supplier. They add their own staff afterwards.',
                  'Check everything once more before creating the supplier.',
                ][step]}</p>
                <div className="mt-6">
                  {step === 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Company name" required className="sm:col-span-2" htmlFor="ns-name">
                        <input id="ns-name" autoFocus className={input} value={f.name || ''} onChange={e => set('name', e.target.value)} placeholder="Desert Drive Rentals" />
                      </Field>
                      <Field label="Sign-in address" required className="sm:col-span-2" htmlFor="ns-slug"
                        hint="The supplier's own link: its staff open it to sign in and see its logo and colours. Unique on the platform.">
                        <SignInAddressField id="ns-slug" value={f.slug || ''} onChange={v => { setSlugTouched(true); set('slug', v); }} onState={setSlugOk} />
                      </Field>
                      <Field label="Supplier code" required hint="2–12 letters or digits; cannot be changed later." htmlFor="ns-code">
                        <input id="ns-code" className={cx(input, 'font-mono uppercase tracking-wider')} value={f.code || ''} maxLength={12}
                          onChange={e => { setCodeTouched(true); set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); }} placeholder="DDR" />
                      </Field>
                      <Field label="Legal name" htmlFor="ns-legal">
                        <input id="ns-legal" className={input} value={f.legalName || ''} onChange={e => set('legalName', e.target.value)} placeholder="Desert Drive Car Rental LLC" />
                      </Field>
                      <Field label="Country" hint="Two-letter code, e.g. JO, AE" htmlFor="ns-country">
                        <input id="ns-country" className={cx(input, 'uppercase')} maxLength={2} value={f.country || ''} onChange={e => set('country', e.target.value.toUpperCase())} />
                      </Field>
                      <Field label="Currency" htmlFor="ns-cur">
                        <select id="ns-cur" className={input} value={f.currency} onChange={e => set('currency', e.target.value)}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>
                      </Field>
                      <Field label="Time zone" htmlFor="ns-tz">
                        <select id="ns-tz" className={input} value={f.timeZone} onChange={e => set('timeZone', e.target.value)}>{ZONES.map(z => <option key={z}>{z}</option>)}</select>
                      </Field>
                      <Field label="Website" htmlFor="ns-web">
                        <input id="ns-web" className={input} value={f.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://" />
                      </Field>
                      <Field label="Address" className="sm:col-span-2" htmlFor="ns-addr">
                        <input id="ns-addr" className={input} value={f.address || ''} onChange={e => set('address', e.target.value)} />
                      </Field>
                    </div>
                  )}
                  {step === 1 && <PlanCards value={f.plan as PlanId} onChange={p => set('plan', p)} />}
                  {step === 2 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Contact person" htmlFor="ns-cn"><input id="ns-cn" className={input} value={f.contactName || ''} onChange={e => set('contactName', e.target.value)} /></Field>
                      <Field label="Contact email" htmlFor="ns-ce"><input id="ns-ce" type="email" className={input} value={f.contactEmail || ''} onChange={e => set('contactEmail', e.target.value)} /></Field>
                      <Field label="Contact phone" htmlFor="ns-cp"><input id="ns-cp" className={input} value={f.contactPhone || ''} onChange={e => set('contactPhone', e.target.value)} /></Field>
                      <Field label="Customer support email" htmlFor="ns-se"><input id="ns-se" type="email" className={input} value={f.supportEmail || ''} onChange={e => set('supportEmail', e.target.value)} /></Field>
                      <Field label="Customer support phone" htmlFor="ns-sp"><input id="ns-sp" className={input} value={f.supportPhone || ''} onChange={e => set('supportPhone', e.target.value)} /></Field>
                      <div className="sm:col-span-2 rounded-2xl border border-slate-200 p-4 space-y-4">
                        <p className="text-[12.5px] font-semibold text-slate-700">Broker access {f.plan === 'CRM' && <span className="font-normal text-slate-400">· not used by a CRM-only package</span>}</p>
                        <Toggle id="ns-test" checked={!!f.testAccess} onChange={v => set('testAccess', v)} disabled={f.plan === 'CRM'} label="Test access" hint="Brokers can try the connection with a test key; nothing is booked for real." />
                        <Toggle id="ns-live" checked={!!f.liveAccess} onChange={v => set('liveAccess', v)} disabled={f.plan === 'CRM'} label="Live access" hint="Brokers can make real bookings. Usually switched on after the supplier passes testing." />
                      </div>
                      <Field label="Internal notes" className="sm:col-span-2" hint="Only platform admins see these." htmlFor="ns-notes">
                        <textarea id="ns-notes" rows={3} className={textarea} value={f.notes || ''} onChange={e => set('notes', e.target.value)} />
                      </Field>
                    </div>
                  )}
                  {step === 3 && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Owner's full name" required htmlFor="ns-on"><input id="ns-on" className={input} value={f.ownerName || ''} onChange={e => set('ownerName', e.target.value)} /></Field>
                        <Field label="Owner's email" required hint="This is their sign-in." htmlFor="ns-oe"><input id="ns-oe" type="email" className={input} value={f.ownerEmail || ''} onChange={e => set('ownerEmail', e.target.value)} /></Field>
                      </div>
                      <div role="radiogroup" aria-label="How the owner signs in" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {([['invite', 'Send an invitation', 'Recommended. They get a link to choose their own password (valid 72 hours).'],
                          ['password', 'Set a first password', 'You give them the password yourself; ask them to change it.']] as const).map(([k, t, d]) => (
                          <button key={k} type="button" role="radio" aria-checked={f.ownerAccess === k} onClick={() => set('ownerAccess', k)}
                            className={cx('text-left rounded-2xl border p-4 transition-all', f.ownerAccess === k ? 'border-teal-600 ring-1 ring-teal-600 bg-teal-50/40' : 'border-slate-200 hover:border-slate-300')}>
                            <span className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900">
                              <span className={cx('w-4 h-4 rounded-full border-2', f.ownerAccess === k ? 'border-teal-600 bg-teal-600 shadow-[inset_0_0_0_3px_white]' : 'border-slate-300')} />{t}
                            </span>
                            <span className="block mt-1.5 text-[12.5px] text-slate-600 pl-6">{d}</span>
                          </button>
                        ))}
                      </div>
                      {f.ownerAccess === 'password' && (
                        <Field label="First password" hint="At least 8 characters, with letters and numbers." htmlFor="ns-op">
                          <input id="ns-op" type="password" autoComplete="new-password" className={input} value={f.ownerPassword || ''} onChange={e => set('ownerPassword', e.target.value)} />
                        </Field>
                      )}
                    </div>
                  )}
                  {step === 4 && <Review f={f} />}
                </div>
              </>
            )}
          </div>
          <footer className="px-6 sm:px-10 py-4 border-t border-slate-100 bg-slate-50/70 flex flex-wrap items-center gap-3">
            {!done && <div className="w-full"><ErrorNote text={error} /></div>}
            {done ? (
              <>
                <Btn kind="secondary" onClick={() => { setDone(null); setStep(0); setCopied(false); setCodeTouched(false);
                  setSlugTouched(false);
                  setF({ plan: 'FULL', currency: 'USD', timeZone: 'Asia/Amman', country: 'JO', testAccess: true, liveAccess: false, ownerAccess: 'invite' }); }}>Create another</Btn>
                <Btn kind="primary" className="ml-auto" onClick={() => onCreated(done.id)}>Open {done.name}</Btn>
              </>
            ) : (
              <>
                {step > 0 && <Btn kind="ghost" icon={Icon.back()} onClick={() => { setError(''); setStep(s => s - 1); }} disabled={busy}>Back</Btn>}
                <span className="text-[12px] text-slate-400 hidden sm:inline">Step {step + 1} of {STEPS.length}</span>
                {step < STEPS.length - 1
                  ? <Btn kind="primary" className="ml-auto" onClick={next}>Continue</Btn>
                  : <Btn kind="primary" className="ml-auto" onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create supplier'}</Btn>}
              </>
            )}
          </footer>
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div className="grid grid-cols-[140px_1fr] gap-3 py-2 text-[13px] border-b border-slate-100 last:border-0">
    <span className="text-slate-500">{label}</span><span className="text-slate-900 min-w-0 break-words">{value || <span className="text-slate-400">—</span>}</span>
  </div>
);

const Review: React.FC<{ f: SupplierForm }> = ({ f }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <div className="rounded-2xl border border-slate-200 px-4 py-2">
      <Row label="Company" value={<><b>{f.name}</b> <span className="ml-1 font-mono text-[12px] text-slate-500">{(f.code || '').toUpperCase()}</span></>} />
      <Row label="Sign-in address" value={<span className="font-mono text-[12.5px]">{`${window.location.host}/s/${f.slug || ''}`}</span>} />
      <Row label="Legal name" value={f.legalName} />
      <Row label="Country · currency" value={[f.country, f.currency].filter(Boolean).join(' · ')} />
      <Row label="Time zone" value={f.timeZone} />
      <Row label="Website" value={f.website} />
      <Row label="Contact" value={[f.contactName, f.contactEmail, f.contactPhone].filter(Boolean).join(' · ')} />
      <Row label="Support" value={[f.supportEmail, f.supportPhone].filter(Boolean).join(' · ')} />
    </div>
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center gap-2"><PlanPill plan={f.plan as PlanId} /><span className="text-[12.5px] text-slate-500">{PLAN_FEATURES[f.plan as PlanId].lead}</span></div>
        {f.plan !== 'CRM' && <p className="mt-3 text-[12.5px] text-slate-600">Brokers: test access <b>{f.testAccess ? 'on' : 'off'}</b> · live access <b>{f.liveAccess ? 'on' : 'off'}</b></p>}
      </div>
      <div className="rounded-2xl border border-slate-200 p-4">
        <p className="text-[12.5px] text-slate-500">Owner</p>
        <p className="text-[14px] font-semibold text-slate-900">{f.ownerName}</p>
        <p className="text-[13px] text-slate-600">{f.ownerEmail}</p>
        <p className="mt-2 text-[12.5px] text-slate-600">{f.ownerAccess === 'invite' ? 'Gets an invitation link to choose a password.' : 'Signs in with the first password you set.'}</p>
      </div>
    </div>
  </div>
);

const Result: React.FC<{ done: Done; copied: boolean; onCopy: () => void; linkRef: React.RefObject<HTMLInputElement> }> = ({ done, copied, onCopy, linkRef }) => (
  <div className="max-w-xl" data-testid="supplier-created">
    <span className="w-12 h-12 rounded-full bg-emerald-500 text-white inline-flex items-center justify-center shadow-lg shadow-emerald-500/30">{Icon.check('w-6 h-6')}</span>
    <h3 className="mt-5 text-[22px] font-semibold text-slate-900">{done.name} is ready</h3>
    <p className="mt-1.5 text-[13.5px] text-slate-600">Created with the <PlanPill plan={done.plan} className="mx-0.5 align-middle" /> package. Its workspace is empty and only its own people can see it.</p>
    {done.slug && <div className="mt-5"><p className="text-[12.5px] font-medium text-slate-700 mb-1.5">Its sign-in address</p><SignInAddressLine slug={done.slug} /></div>}
    {done.invitation ? (
      <div className="mt-6 rounded-2xl border border-slate-200 p-5">
        <p className="text-[13.5px] font-semibold text-slate-900">{done.invitation.emailSent ? `Invitation sent to ${done.owner}` : 'Send the owner their invitation link'}</p>
        <p className="mt-1 text-[12.5px] text-slate-600">{done.invitation.emailSent
          ? 'The email has a button to choose a password. You can also copy the link below.'
          : `Outgoing email is not set up, so no email was sent. Copy this link and send it to ${done.owner}.`}</p>
        <div className="mt-3 flex gap-2">
          <input ref={linkRef} readOnly value={done.invitation.link} className={cx(input, 'font-mono text-[12px]')} aria-label="Invitation link" data-testid="invitation-link" onFocus={e => e.currentTarget.select()} />
          <Btn kind={copied ? 'secondary' : 'primary'} icon={copied ? Icon.check() : Icon.copy()} onClick={onCopy}>{copied ? 'Copied' : 'Copy'}</Btn>
        </div>
        <p className="mt-2 text-[12px] text-slate-500">Works once, until {new Date(done.invitation.expiresAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.</p>
      </div>
    ) : (
      <p className="mt-6 text-[13px] text-slate-600">{done.owner} can sign in now with the password you set.</p>
    )}
  </div>
);

export default NewSupplierWizard;
