import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Invitation, inviteSupplierUser, newPasswordLink, openSupportAccess, PlanId, problem, setSupplierStatus, setSupplierUserActive,
  SupplierDetail, supplierDetail, SupplierForm, SupplierStatus, updateSupplier,
} from '../../services/platformApi';
import { showActionFeedback } from '../ui/ActionFeedback';
import { PlanCards, PLAN_FEATURES } from './PlanCards';
import { SignInAddressField, SignInAddressLine } from './SignInAddress';
import { Btn, Card, copyText, cx, date, ErrorNote, Field, Icon, input, Modal, Monogram, num, PlanPill, Stat, StatusPill, textarea, Toggle, when } from './ui';

type Tab = 'overview' | 'package' | 'people' | 'history';

/** One supplier: figures, profile, package, people, and the platform's history with it. */
const SupplierPage: React.FC<{ id: string; onBack: () => void }> = ({ id, onBack }) => {
  const [s, setS] = useState<SupplierDetail | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [dialog, setDialog] = useState<null | 'edit' | 'status' | 'invite' | 'support' | 'address'>(null);
  const [nextStatus, setNextStatus] = useState<SupplierStatus>('PAUSED');
  const [link, setLink] = useState<{ who: string; inv: Invitation } | null>(null);

  const load = useCallback(() => supplierDetail(id).then(setS).catch(e => setError(problem(e, 'The supplier could not be loaded.'))), [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="max-w-3xl"><ErrorNote text={error} /></div>;
  if (!s) return <div className="h-40 rounded-2xl bg-white border border-slate-200 animate-pulse" />;

  const quick = async (f: SupplierForm, done: string) => {
    try { await updateSupplier(s.id, f); showActionFeedback({ tone: 'success', title: 'Changes saved', detail: done }); load(); }
    catch (e) { showActionFeedback({ tone: 'error', title: 'Not saved', detail: problem(e, 'The change could not be saved.') }); }
  };
  const status = (to: SupplierStatus) => { setNextStatus(to); setDialog('status'); };

  return (
    <div className="space-y-5" data-testid="supplier-page">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-900">{Icon.back('w-3.5 h-3.5')}Suppliers</button>

      {/* Header */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-6 py-5">
        <div className="flex flex-wrap items-start gap-4">
          <Monogram name={s.name} plan={s.plan} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold text-slate-900 truncate">{s.name}</h1>
              <span className="font-mono text-[12px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">{s.code}</span>
              <PlanPill plan={s.plan} />
              <StatusPill status={s.status} />
              {s.primary && <span className="text-[11px] font-semibold text-slate-500">Primary supplier</span>}
            </div>
            <p className="mt-1.5 text-[13px] text-slate-500 truncate">
              {[s.legalName, s.country, s.currency, s.timeZone, `Created ${date(s.createdAt)}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!s.primary && s.status === 'ACTIVE' && <Btn icon={Icon.shield()} onClick={() => setDialog('support')}>Support access</Btn>}
            <Btn icon={Icon.edit()} onClick={() => setDialog('edit')}>Edit</Btn>
            {!s.primary && (s.status === 'ACTIVE'
              ? <Btn kind="warning" icon={Icon.pause()} onClick={() => status('PAUSED')}>Pause</Btn>
              : <Btn kind="primary" icon={Icon.play()} onClick={() => status('ACTIVE')}>Reactivate</Btn>)}
          </div>
        </div>
        <nav className="mt-5 -mb-5 flex gap-1 border-b-0 overflow-x-auto" role="tablist">
          {([['overview', 'Overview'], ['package', 'Package'], ['people', `People · ${s.staff.length}`], ['history', 'History']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cx('px-3.5 h-10 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap', tab === k ? 'border-teal-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800')}>{l}</button>
          ))}
        </nav>
      </section>

      {tab === 'overview' && (
        <div className="space-y-5">
          <Card title="Sign-in address" subtitle={s.primary ? 'The primary supplier signs in at the main address.' : "This supplier's own link: its staff open it to sign in and see its logo and colours."}
            actions={!s.primary && <Btn small icon={Icon.edit('w-3.5 h-3.5')} onClick={() => setDialog('address')}>Change address</Btn>}>
            {s.primary ? <p className="font-mono text-[13px] text-slate-700">{window.location.origin}/</p> : s.slug && <SignInAddressLine slug={s.slug} />}
            {!s.primary && <p className="mt-2 text-[12px] text-slate-500">The short link <span className="font-mono">{window.location.host}/s/{s.code}</span> also works.</p>}
          </Card>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="People" value={num(s.staff.length)} sub={`${s.staff.filter(x => x.active).length} active`} icon={Icon.users()} />
            <Stat label="Broker channels" value={num(s.channels)} sub={s.plan === 'CRM' ? 'Not in this package' : 'Connected brokers'} icon={Icon.signal()} />
            <Stat label="Broker calls" value={num(s.brokerCalls7d)} sub="Live, last 7 days" icon={Icon.activity()} />
            <Stat label="Broker bookings" value={num(s.brokerBookings30d)} sub={`Last 30 days · active ${when(s.lastActivity)}`} icon={Icon.car()} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
            <Card title="Company" className="xl:col-span-1">
              <Detail rows={[['Legal name', s.legalName], ['Supplier code', <span className="font-mono">{s.code}</span>],
                ['Country', s.country], ['Currency', s.currency],
                ['Time zone', s.timeZone], ['Website', s.website], ['Address', s.address]]} />
            </Card>
            <Card title="Contacts">
              <Detail rows={[['Contact person', s.contactName], ['Contact email', s.contactEmail], ['Contact phone', s.contactPhone],
                ['Support email', s.supportEmail], ['Support phone', s.supportPhone], ['Owner', s.owner]]} />
            </Card>
            <Card title="Broker access" subtitle={s.plan === 'CRM' ? 'A CRM-only package has no broker connections.' : 'Applies to every broker of this supplier at once.'}>
              <div className="space-y-4 pt-1">
                <Toggle id="sp-test" checked={s.testAccess} disabled={s.plan === 'CRM'} label="Test access" hint="Test keys and sandbox calls"
                  onChange={v => quick({ testAccess: v }, `Test access ${v ? 'switched on' : 'switched off'} for ${s.name}.`)} />
                <Toggle id="sp-live" checked={s.liveAccess} disabled={s.plan === 'CRM'} label="Live access" hint="Real bookings from brokers"
                  onChange={v => quick({ liveAccess: v }, `Live access ${v ? 'switched on' : 'switched off'} for ${s.name}.`)} />
              </div>
              {s.notes && <div className="mt-5 pt-4 border-t border-slate-100"><p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-400">Internal notes</p><p className="mt-1 text-[13px] text-slate-700 whitespace-pre-wrap">{s.notes}</p></div>}
            </Card>
          </div>
        </div>
      )}

      {tab === 'package' && <PackageTab s={s} onSaved={load} />}

      {tab === 'people' && (
        <Card title="People" subtitle="Administrators added here can add the rest of their staff themselves." padded={false}
          actions={s.status === 'ACTIVE' && <Btn kind="primary" small icon={Icon.plus('w-3.5 h-3.5')} onClick={() => setDialog('invite')}>Invite administrator</Btn>}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-[0.06em] text-slate-500 bg-slate-50/80 border-y border-slate-100">
                <th className="px-5 py-2.5 font-semibold">Person</th><th className="px-3 py-2.5 font-semibold">Role</th><th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Last seen</th><th className="px-5 py-2.5" /></tr></thead>
              <tbody>
                {s.staff.map(p => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-3"><p className="font-medium text-slate-900">{p.name}</p><p className="text-[12px] text-slate-500">{p.email}</p></td>
                    <td className="px-3 py-3 text-slate-700">{p.position || (p.admin ? 'Administrator' : 'Staff')}{p.admin && <span className="ml-1.5 text-[11px] text-slate-400">admin</span>}</td>
                    <td className="px-3 py-3">{p.active
                      ? <span className="inline-flex items-center gap-1.5 text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Active</span>
                      : <span className="inline-flex items-center gap-1.5 text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Switched off</span>}</td>
                    <td className="px-3 py-3 text-slate-600">{p.presence === 'online' ? <span className="text-emerald-700">Online now</span> : when(p.lastSeen)}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <Btn kind="ghost" small icon={Icon.link('w-3.5 h-3.5')} onClick={async () => {
                        try { setLink({ who: p.email, inv: await newPasswordLink(s.id, p.id) }); } catch (e) { showActionFeedback({ tone: 'error', title: 'Not completed', detail: problem(e, 'No link was made.') }); }
                      }}>Password link</Btn>
                      <Btn kind="ghost" small onClick={async () => {
                        try { await setSupplierUserActive(s.id, p.id, !p.active); showActionFeedback({ tone: 'success', title: p.active ? 'Switched off' : 'Switched on', detail: `${p.name} ${p.active ? 'can no longer sign in' : 'can sign in again'}.` }); load(); }
                        catch (e) { showActionFeedback({ tone: 'error', title: 'Not completed', detail: problem(e, 'The account was not changed.') }); }
                      }}>{p.active ? 'Switch off' : 'Switch on'}</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'history' && (
        <Card title="History" subtitle="What the platform did with this supplier (newest first).">
          <Timeline rows={s.history} empty="No platform actions yet." />
        </Card>
      )}

      {dialog === 'edit' && <EditDialog s={s} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />}
      {dialog === 'status' && <StatusDialog s={s} to={nextStatus} onClose={() => setDialog(null)} onDone={() => { setDialog(null); load(); }} />}
      {dialog === 'invite' && <InviteDialog s={s} onClose={() => setDialog(null)} onDone={(who, inv) => { setDialog(null); setLink({ who, inv }); load(); }} />}
      {dialog === 'support' && <SupportDialog s={s} onClose={() => setDialog(null)} />}
      {dialog === 'address' && <AddressDialog s={s} onClose={() => setDialog(null)} onDone={() => { setDialog(null); load(); }} />}
      {link && <LinkDialog who={link.who} inv={link.inv} onClose={() => setLink(null)} />}

      {!s.primary && s.status !== 'CLOSED' && tab === 'overview' && (
        <Card title="Close supplier" subtitle="Ends the supplier's access for good: nobody can sign in and no broker is answered. Their data is kept.">
          <Btn kind="danger" small onClick={() => status('CLOSED')}>Close {s.name}…</Btn>
        </Card>
      )}
    </div>
  );
};

const Detail: React.FC<{ rows: [string, React.ReactNode][] }> = ({ rows }) => (
  <dl className="divide-y divide-slate-100">
    {rows.map(([k, v]) => (
      <div key={k} className="grid grid-cols-[120px_1fr] gap-3 py-2 text-[13px]">
        <dt className="text-slate-500">{k}</dt><dd className="text-slate-900 min-w-0 break-words">{v || <span className="text-slate-300">—</span>}</dd>
      </div>
    ))}
  </dl>
);

export const Timeline: React.FC<{ rows: { at: string; by: string; action: string; summary: string }[]; empty: string }> = ({ rows, empty }) =>
  rows.length === 0 ? <p className="text-[13px] text-slate-500 py-6 text-center">{empty}</p> : (
    <ol className="relative">
      {rows.map((r, i) => (
        <li key={i} className="relative pl-6 pb-4 last:pb-0">
          {i < rows.length - 1 && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-slate-200" />}
          <span className={cx('absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full ring-2 ring-white',
            r.action.includes('SUPPORT') ? 'bg-amber-500' : r.action.includes('PAUSED') || r.action.includes('CLOSED') || r.action.includes('DISABLED') ? 'bg-rose-500' : r.action.includes('CREATED') ? 'bg-teal-600' : 'bg-slate-400')} />
          <p className="text-[13px] text-slate-800">{r.summary}</p>
          <p className="text-[12px] text-slate-500 mt-0.5">{when(r.at)} · {r.by}</p>
        </li>
      ))}
    </ol>
  );

const PackageTab: React.FC<{ s: SupplierDetail; onSaved: () => void }> = ({ s, onSaved }) => {
  const [plan, setPlan] = useState<PlanId>(s.plan);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await updateSupplier(s.id, { plan });
      showActionFeedback({ tone: 'success', title: 'Package changed', detail: `${s.name} now has ${PLAN_FEATURES[plan].title}. It applies from their next action.` });
      onSaved();
    } catch (e) { showActionFeedback({ tone: 'error', title: 'Not saved', detail: problem(e, 'The package was not changed.') }); }
    finally { setBusy(false); }
  };
  return (
    <Card title="Package" subtitle={s.primary ? 'The primary supplier always has the full system.' : 'Changing the package takes effect on the supplier\'s next action. Nothing is deleted: screens outside the package are hidden and their data kept.'}>
      <PlanCards value={plan} onChange={setPlan} current={s.plan} disabled={s.primary} />
      {!s.primary && plan !== s.plan && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 ring-1 ring-inset ring-amber-200 px-4 py-3">
          <span className="text-[13px] text-amber-900">{Icon.alert('w-4 h-4 inline -mt-0.5 mr-1.5')}
            Change {s.name} from <b>{PLAN_FEATURES[s.plan].title}</b> to <b>{PLAN_FEATURES[plan].title}</b>?
            {plan === 'CRM' && ' Brokers will no longer be answered.'}{plan === 'XML' && ' Reservations, finance and reports screens will be hidden.'}</span>
          <div className="ml-auto flex gap-2"><Btn small kind="ghost" onClick={() => setPlan(s.plan)}>Cancel</Btn><Btn small kind="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Change package'}</Btn></div>
        </div>
      )}
    </Card>
  );
};

const EditDialog: React.FC<{ s: SupplierDetail; onClose: () => void; onSaved: () => void }> = ({ s, onClose, onSaved }) => {
  const [f, setF] = useState<SupplierForm>({ name: s.name, legalName: s.legalName || '', country: s.country || '', currency: s.currency || '', timeZone: s.timeZone || '',
    website: s.website || '', address: s.address || '', contactName: s.contactName || '', contactEmail: s.contactEmail || '', contactPhone: s.contactPhone || '',
    supportEmail: s.supportEmail || '', supportPhone: s.supportPhone || '', notes: s.notes || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof SupplierForm, v: string) => setF(p => ({ ...p, [k]: v }));
  const save = async () => {
    setBusy(true); setError('');
    try { await updateSupplier(s.id, f); showActionFeedback({ tone: 'success', title: 'Changes saved', detail: `${f.name} is up to date.` }); onSaved(); }
    catch (e) { setError(problem(e, 'The changes could not be saved.')); }
    finally { setBusy(false); }
  };
  const fields: [keyof SupplierForm, string, string?][] = [['name', 'Company name'], ['legalName', 'Legal name'], ['country', 'Country'], ['currency', 'Currency'],
    ['timeZone', 'Time zone'], ['website', 'Website'], ['contactName', 'Contact person'], ['contactEmail', 'Contact email'], ['contactPhone', 'Contact phone'],
    ['supportEmail', 'Support email'], ['supportPhone', 'Support phone'], ['address', 'Address', 'wide']];
  return (
    <Modal open wide title={`Edit ${s.name}`} subtitle={`Supplier code ${s.code} cannot be changed.`} onClose={onClose}
      footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Btn></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map(([k, l, w]) => (
          <Field key={k} label={l} className={w ? 'sm:col-span-2' : ''} htmlFor={`ed-${k}`}>
            <input id={`ed-${k}`} className={input} value={(f[k] as string) || ''} onChange={e => set(k, e.target.value)} />
          </Field>
        ))}
        <Field label="Internal notes" className="sm:col-span-2" htmlFor="ed-notes"><textarea id="ed-notes" rows={3} className={textarea} value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
      </div>
      <div className="mt-4"><ErrorNote text={error} /></div>
    </Modal>
  );
};

const StatusDialog: React.FC<{ s: SupplierDetail; to: SupplierStatus; onClose: () => void; onDone: () => void }> = ({ s, to, onClose, onDone }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const text = {
    PAUSED: { title: `Pause ${s.name}?`, body: 'Their people are signed out and cannot sign in, and brokers get no answers, until you reactivate them. Nothing is deleted.', btn: 'Pause supplier' },
    CLOSED: { title: `Close ${s.name}?`, body: 'Ends their access: nobody can sign in and no broker is answered. Their data is kept, and a platform admin can reactivate them later if needed.', btn: 'Close supplier' },
    ACTIVE: { title: `Reactivate ${s.name}?`, body: 'Their people can sign in again and brokers are answered again, with the same package and settings as before.', btn: 'Reactivate' },
  }[to];
  const go = async () => {
    setBusy(true); setError('');
    try {
      await setSupplierStatus(s.id, to, reason);
      showActionFeedback({ tone: to === 'ACTIVE' ? 'success' : 'warning', title: to === 'ACTIVE' ? 'Reactivated' : to === 'PAUSED' ? 'Supplier paused' : 'Supplier closed', detail: s.name });
      onDone();
    } catch (e) { setError(problem(e, 'The status was not changed.')); }
    finally { setBusy(false); }
  };
  return (
    <Modal open title={text.title} subtitle={text.body} onClose={onClose}
      footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind={to === 'ACTIVE' ? 'primary' : 'danger'} onClick={go} disabled={busy || (to !== 'ACTIVE' && !reason.trim())}>{busy ? 'Working…' : text.btn}</Btn></>}>
      {to !== 'ACTIVE' && <Field label="Reason" required hint="Kept in the platform log." htmlFor="st-reason">
        <textarea id="st-reason" rows={3} autoFocus className={textarea} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Unpaid invoice INV-2026-014" />
      </Field>}
      <div className="mt-3"><ErrorNote text={error} /></div>
    </Modal>
  );
};

const InviteDialog: React.FC<{ s: SupplierDetail; onClose: () => void; onDone: (who: string, inv: Invitation) => void }> = ({ s, onClose, onDone }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setError('');
    try { const r = await inviteSupplierUser(s.id, name, email); showActionFeedback({ tone: 'success', title: 'Invitation created', detail: `${name} · ${email}` }); onDone(email, r.invitation); }
    catch (e) { setError(problem(e, 'The person could not be invited.')); }
    finally { setBusy(false); }
  };
  return (
    <Modal open title={`Invite an administrator to ${s.name}`} subtitle={`They get everything the ${PLAN_FEATURES[s.plan].title} package allows, and can add the rest of the staff themselves.`} onClose={onClose}
      footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={go} disabled={busy || !name.trim() || !email.trim()}>{busy ? 'Inviting…' : 'Send invitation'}</Btn></>}>
      <div className="space-y-4">
        <Field label="Full name" required htmlFor="iv-name"><input id="iv-name" autoFocus className={input} value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Email" required hint="Their sign-in. They choose their own password through the link." htmlFor="iv-email"><input id="iv-email" type="email" className={input} value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <ErrorNote text={error} />
      </div>
    </Modal>
  );
};

const LinkDialog: React.FC<{ who: string; inv: Invitation; onClose: () => void }> = ({ who, inv, onClose }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  return (
    <Modal open title={inv.emailSent ? `Email sent to ${who}` : 'Copy the link and send it'} onClose={onClose}
      subtitle={inv.emailSent ? 'The email has a button to choose a password. The same link is below.' : `Outgoing email is not set up, so nothing was emailed. Send this link to ${who}.`}
      footer={<Btn kind="primary" onClick={onClose}>Done</Btn>}>
      <div className="flex gap-2">
        <input ref={ref} readOnly value={inv.link} className={cx(input, 'font-mono text-[12px]')} aria-label="Password link" onFocus={e => e.currentTarget.select()} />
        <Btn kind={copied ? 'secondary' : 'primary'} icon={copied ? Icon.check() : Icon.copy()} onClick={async () => { if (await copyText(inv.link, ref.current)) setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</Btn>
      </div>
      <p className="mt-2 text-[12px] text-slate-500">Works once, until {new Date(inv.expiresAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Earlier links for this person no longer work.</p>
    </Modal>
  );
};

const AddressDialog: React.FC<{ s: SupplierDetail; onClose: () => void; onDone: () => void }> = ({ s, onClose, onDone }) => {
  const [slug, setSlug] = useState(s.slug || '');
  const [ok, setOk] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const same = slug === s.slug;
  const save = async () => {
    setBusy(true); setError('');
    try {
      await updateSupplier(s.id, { slug });
      showActionFeedback({ tone: 'success', title: 'Address changed', detail: `${window.location.host}/s/${slug}` });
      onDone();
    } catch (e) { setError(problem(e, 'The address was not changed.')); }
    finally { setBusy(false); }
  };
  return (
    <Modal open wide title={`Sign-in address of ${s.name}`} subtitle="Choose the link this supplier's staff use to sign in." onClose={onClose}
      footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} disabled={busy || same || !ok}>{busy ? 'Saving…' : 'Save address'}</Btn></>}>
      <SignInAddressField id="ad-slug" value={slug} onChange={setSlug} onState={setOk} supplierId={s.id} />
      {!same && <p className="mt-4 flex items-start gap-2 text-[12.5px] text-amber-900 bg-amber-50 ring-1 ring-inset ring-amber-200 rounded-lg px-3 py-2.5">
        {Icon.alert('w-4 h-4 mt-0.5 shrink-0')}<span>The old address <span className="font-mono">/s/{s.slug}</span> stops working; tell the supplier's staff the new one. The short link <span className="font-mono">/s/{s.code}</span> keeps working.</span></p>}
      <div className="mt-3"><ErrorNote text={error} /></div>
    </Modal>
  );
};

const SupportDialog: React.FC<{ s: SupplierDetail; onClose: () => void }> = ({ s, onClose }) => {
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState(30);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setError('');
    // Opened first, so the browser does not block it as a pop-up; filled in once the server agrees.
    const tab = window.open('about:blank', '_blank');
    try {
      const r = await openSupportAccess(s.id, reason, minutes);
      const url = `/?support=${encodeURIComponent(r.token)}&until=${encodeURIComponent(r.until)}&name=${encodeURIComponent(r.supplier)}`;
      if (tab) tab.location.href = url; else window.location.href = url;
      showActionFeedback({ tone: 'success', title: 'Support view opened', detail: `${s.name}, read-only for ${r.minutes} minutes. Logged on both sides.` });
      onClose();
    } catch (e) {
      tab?.close();
      setError(problem(e, 'Support access was not opened.'));
    } finally { setBusy(false); }
  };
  return (
    <Modal open title={`Support access to ${s.name}`} subtitle="Opens their workspace in a new tab so you can see what they see." onClose={onClose}
      footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind="primary" icon={Icon.external()} onClick={go} disabled={busy || reason.trim().length < 5}>{busy ? 'Opening…' : 'Open support view'}</Btn></>}>
      <ul className="mb-5 space-y-2 text-[13px] text-slate-700">
        {['Read-only: nothing can be changed, saved or sent.', `Written in ${s.name}'s own activity log, with your reason, and in the platform log.`, 'Ends by itself when the time is up. Your own sign-in is not affected.'].map(t =>
          <li key={t} className="flex items-start gap-2">{Icon.check('w-4 h-4 mt-0.5 text-teal-600 shrink-0')}{t}</li>)}
      </ul>
      <div className="space-y-4">
        <Field label="Reason" required hint="The supplier sees this reason." htmlFor="su-reason">
          <textarea id="su-reason" rows={3} autoFocus className={textarea} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Broker reports missing cars for 12 May (ticket 4821)" />
        </Field>
        <Field label="For how long">
          <div className="inline-flex rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Duration">
            {[15, 30, 60, 120].map(m => (
              <button key={m} type="button" role="radio" aria-checked={minutes === m} onClick={() => setMinutes(m)}
                className={cx('px-3.5 h-8 rounded-md text-[12.5px] font-medium', minutes === m ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900')}>{m < 60 ? `${m} min` : `${m / 60} h`}</button>
            ))}
          </div>
        </Field>
        <ErrorNote text={error} />
      </div>
    </Modal>
  );
};

export default SupplierPage;
