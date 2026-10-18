import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User, UserPermission, UserStatus } from '../types';
import { PlusIcon, SearchIcon, CloseIcon, ShieldCheckIcon, KeyIcon, UsersIcon, AlertIcon, CheckCircleIcon } from './icons';
import {
  listStaffAccounts, createStaffAccount, updateStaffAccount, resetStaffPassword, deleteStaffAccount,
} from '../firebase/api';
import {
  PERMISSION_AREAS, ALL_PERMISSIONS, ROLE_TEMPLATES, SENSITIVE_PERMISSIONS, matchRole, generatePassword, passwordProblems, RoleTemplate, PermissionArea, PermissionSection,
} from '../services/permissionCatalog';
import { Page, PageHeader, StatGrid, Panel, Toolbar, Tabs, Badge, Button, Field, SectionLabel, EmptyState, inputCls, table } from './ui/Crm';

interface UserManagementProps {
  users: User[];
  onUpdateUsers: (users: User[]) => void;
  currentUser: User | null;
}

type Account = User & { hasLogin: boolean };
type DrawerMode = { kind: 'create'; prefill?: Partial<User> } | { kind: 'edit'; account: Account };

const initials = (name?: string) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
const AVATAR_COLORS = ['bg-indigo-50 text-indigo-700', 'bg-sky-50 text-sky-700', 'bg-emerald-50 text-emerald-700', 'bg-amber-50 text-amber-700', 'bg-slate-100 text-slate-700'];
const avatarColor = (s: string) => AVATAR_COLORS[Math.abs([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % AVATAR_COLORS.length];
const isAdmin = (u: Partial<User>) => (u.permissions || []).includes(UserPermission.ACTION_ADMIN_MANAGE_USERS);
const isActive = (u: Partial<User>) => (u.status || UserStatus.ACTIVE) === UserStatus.ACTIVE && u.webAppAccess !== false;

const Avatar: React.FC<{ name?: string; email?: string; size?: string }> = ({ name, email, size = 'w-8 h-8 text-[11px]' }) => (
  <div className={`${size} rounded-full ${avatarColor(email || name || '?')} font-semibold flex items-center justify-center shrink-0`}>{initials(name)}</div>
);

const RoleBadge: React.FC<{ perms: string[] }> = ({ perms }) => {
  const role = matchRole(perms);
  if (role) return <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-700"><span className={`w-1.5 h-1.5 rounded-full ${role.color}`} />{role.name}</span>;
  return <span className="text-[13px] font-medium text-slate-600">Custom · {perms.length} permission{perms.length === 1 ? '' : 's'}</span>;
};

const StatusChip: React.FC<{ account: Account }> = ({ account }) => {
  if (!account.hasLogin) return <Badge tone="warning">No login</Badge>;
  if (!isActive(account)) return <Badge tone="muted">Disabled</Badge>;
  return <Badge tone="success">Active</Badge>;
};

// ---------------------------------------------------------------------------
// Permission editor
// ---------------------------------------------------------------------------

const Switch: React.FC<{ on: boolean; disabled?: boolean; onClick: () => void; label: string }> = ({ on, disabled, onClick, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}
    className={`relative inline-flex w-10 h-6 rounded-full transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${on ? 'bg-indigo-600' : 'bg-slate-300'} disabled:opacity-50`}>
    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-4' : ''}`} />
  </button>
);

const PermissionEditor: React.FC<{ value: UserPermission[]; onChange: (v: UserPermission[]) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const set = new Set(value);
  const q = query.trim().toLowerCase();
  const role = matchRole(value);
  const allSections = PERMISSION_AREAS.flatMap(a => a.sections);
  const openSections = allSections.filter(x => set.has(x.access.key)).length;
  const known = new Set<string>(ALL_PERMISSIONS);
  const selected = value.filter(k => known.has(k)).length;

  const commit = (next: Set<UserPermission>) => !disabled && onChange(Array.from(next));
  const applyRole = (r: RoleTemplate) => !disabled && onChange([...r.permissions]);
  const sectionKeys = (x: PermissionSection) => [x.access.key, ...x.actions.map(a => a.key)];
  const toggleSection = (x: PermissionSection) => {
    const next = new Set(set);
    // Closing a screen also removes what could be done inside it.
    if (next.has(x.access.key)) sectionKeys(x).forEach(k => next.delete(k)); else next.add(x.access.key);
    commit(next);
  };
  const toggleAction = (x: PermissionSection, k: UserPermission) => {
    const next = new Set(set);
    if (next.has(k)) next.delete(k); else { next.add(k); next.add(x.access.key); }
    commit(next);
  };
  const setArea = (a: PermissionArea, mode: 'full' | 'view' | 'none') => {
    const next = new Set(set);
    a.sections.forEach(x => {
      sectionKeys(x).forEach(k => next.delete(k));
      if (mode !== 'none') next.add(x.access.key);
      if (mode === 'full') x.actions.forEach(y => next.add(y.key));
    });
    commit(next);
  };
  const matches = (x: PermissionSection) => !q || [x.name, x.description, ...x.actions.flatMap(a => [a.label, a.description])].some(t => t.toLowerCase().includes(q));

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel className="mb-2">Start from a role</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ROLE_TEMPLATES.map(r => {
            const active = role?.id === r.id;
            return (
              <button key={r.id} type="button" disabled={disabled} onClick={() => applyRole(r)}
                className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${active ? 'border-indigo-500 ring-2 ring-indigo-500/15 bg-indigo-50/40' : 'border-slate-200 hover:border-slate-300'} disabled:opacity-60`}>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${r.color}`} />
                  <span className="text-[13px] font-semibold text-slate-900">{r.name}</span>
                  {active && <CheckCircleIcon className="w-4 h-4 text-indigo-600 ml-auto" />}
                </div>
                <p className="text-xs text-slate-500 mt-1">{r.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-3">
          <div>
            <SectionLabel>Access by section</SectionLabel>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="font-semibold text-slate-700 tabular-nums">{openSections}</span> of {allSections.length} screens · {selected} permission{selected === 1 ? '' : 's'}{role ? ` · ${role.name}` : ' · custom'}
            </p>
          </div>
          <div className="relative w-full sm:w-56">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a screen or action" className={`${inputCls} !h-9 pl-8`} />
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-4">
          <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${allSections.length ? (openSections / allSections.length) * 100 : 0}%` }} />
        </div>

        <div className="space-y-3">
          {PERMISSION_AREAS.map(a => {
            const sections = a.sections.filter(matches);
            if (sections.length === 0) return null;
            const on = a.sections.filter(x => set.has(x.access.key)).length;
            const full = a.sections.every(x => sectionKeys(x).every(k => set.has(k)));
            const isOpen = !collapsed[a.id] || !!q;
            const state = full ? 'Full access' : on === 0 ? 'No access' : `${on} of ${a.sections.length} screens`;
            return (
              <section key={a.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <header className="flex items-center gap-3 px-3.5 py-2.5 bg-slate-50/80 border-b border-slate-200">
                  <button type="button" onClick={() => setCollapsed(c => ({ ...c, [a.id]: isOpen }))} className="flex-1 min-w-0 text-left flex items-center gap-2.5">
                    <svg className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${isOpen ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">{a.title}
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${full ? 'bg-indigo-50 text-indigo-700' : on ? 'bg-slate-100 text-slate-600' : 'bg-white text-slate-400 ring-1 ring-inset ring-slate-200'}`}>{state}</span>
                      </span>
                      <span className="block text-xs text-slate-500 truncate">{a.description}</span>
                    </span>
                  </button>
                  <div className="hidden sm:flex rounded-lg bg-white ring-1 ring-slate-200 p-0.5 shrink-0">
                    {(['full', 'view', 'none'] as const).map(m => (
                      <button key={m} type="button" disabled={disabled} onClick={() => setArea(a, m)}
                        className="h-7 px-2.5 rounded-md text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                        {m === 'full' ? 'Full' : m === 'view' ? 'View only' : 'None'}
                      </button>
                    ))}
                  </div>
                </header>
                {isOpen && (
                  <>
                    <div className="sm:hidden flex gap-1.5 px-3.5 pt-2.5">
                      {(['full', 'view', 'none'] as const).map(m => (
                        <button key={m} type="button" disabled={disabled} onClick={() => setArea(a, m)}
                          className="flex-1 h-8 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 active:bg-slate-100">
                          {m === 'full' ? 'Full' : m === 'view' ? 'View only' : 'None'}
                        </button>
                      ))}
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {sections.map(x => {
                        const open = set.has(x.access.key);
                        const sensitive = SENSITIVE_PERMISSIONS.has(x.access.key);
                        return (
                          <li key={x.id} className={`px-3.5 py-3 ${open ? '' : 'bg-slate-50/40'}`}>
                            <div className="flex items-center gap-3">
                              <div className="min-w-0 flex-1">
                                <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold ${open ? 'text-slate-900' : 'text-slate-500'}`}>
                                  {x.name}
                                  {sensitive && <Badge tone="danger" dot={false} className="!text-[10px] uppercase tracking-wide">Sensitive</Badge>}
                                </p>
                                <p className="text-xs text-slate-500">{x.description}</p>
                              </div>
                              <span className={`hidden sm:inline text-[11px] font-semibold ${open ? 'text-indigo-700' : 'text-slate-400'}`}>{open ? 'Access' : 'No access'}</span>
                              <Switch on={open} disabled={disabled} onClick={() => toggleSection(x)} label={`Access to ${x.name}`} />
                            </div>
                            {x.actions.length > 0 && (
                              <div className="mt-2.5 flex flex-wrap gap-1.5">
                                {x.actions.map(y => {
                                  const yes = set.has(y.key);
                                  return (
                                    <button key={y.key} type="button" disabled={disabled || !open} title={y.description} onClick={() => toggleAction(x, y.key)}
                                      aria-pressed={yes}
                                      className={`inline-flex items-center gap-1.5 h-8 pl-2 pr-3 rounded-full border text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                                        !open ? 'border-slate-200 bg-white text-slate-300'
                                          : yes ? (SENSITIVE_PERMISSIONS.has(y.key) ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-indigo-200 bg-indigo-50 text-indigo-700')
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                                      <span className={`w-4 h-4 rounded flex items-center justify-center ${yes && open ? (SENSITIVE_PERMISSIONS.has(y.key) ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white') : 'border border-slate-300 bg-white'}`}>
                                        {yes && open && <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" /></svg>}
                                      </span>
                                      {y.label}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Create / edit drawer
// ---------------------------------------------------------------------------

const PasswordField: React.FC<{ value: string; onChange: (v: string) => void; label: string }> = ({ value, onChange, label }) => {
  const [show, setShow] = useState(true);
  const [copied, setCopied] = useState(false);
  const problems = passwordProblems(value);
  return (
    <div>
      <span className="block text-[13px] font-medium text-slate-700 mb-1">{label}</span>
      <div className="flex flex-wrap sm:flex-nowrap gap-2">
        <div className="relative flex-1 min-w-full sm:min-w-0">
          <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} className={`${inputCls} font-mono pr-14`} autoComplete="new-password" />
          <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-800">{show ? 'Hide' : 'Show'}</button>
        </div>
        <Button onClick={() => onChange(generatePassword())} className="flex-1 sm:flex-none">Generate</Button>
        <Button disabled={!value} onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ } }} className="flex-1 sm:flex-none">{copied ? 'Copied' : 'Copy'}</Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {['At least 8 characters', 'A letter', 'A number'].map(rule => {
          const ok = value.length > 0 && !problems.includes(rule);
          return <Badge key={rule} tone={ok ? 'success' : 'muted'} dot={ok}>{rule}</Badge>;
        })}
      </div>
    </div>
  );
};

const StaffDrawer: React.FC<{
  mode: DrawerMode;
  currentUser: User | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}> = ({ mode, currentUser, onClose, onSaved }) => {
  const editing = mode.kind === 'edit' ? mode.account : null;
  const isSelf = !!editing && editing.email?.toLowerCase() === currentUser?.email?.toLowerCase();
  const base: Partial<User> = editing || (mode.kind === 'create' ? mode.prefill : undefined) || {};
  const [tab, setTab] = useState<'profile' | 'access' | 'security'>('profile');
  const [form, setForm] = useState({
    fullName: base.fullName || '',
    email: base.email || '',
    username: base.username || '',
    position: base.position || '',
    nationalId: base.nationalId || '',
    sscNumber: base.sscNumber || '',
    hireDate: base.hireDate || '',
    baseSalaryJOD: base.baseSalaryJOD ? String(base.baseSalaryJOD) : '',
  });
  const [permissions, setPermissions] = useState<UserPermission[]>(
    (base.permissions as UserPermission[])?.length ? [...(base.permissions as UserPermission[])] : [...ROLE_TEMPLATES.find(r => r.id === 'agent')!.permissions],
  );
  const [status, setStatus] = useState<UserStatus>(editing?.status || UserStatus.ACTIVE);
  const [webAccess, setWebAccess] = useState(editing?.webAppAccess !== false);
  const [password, setPassword] = useState(() => (editing?.hasLogin ? '' : generatePassword()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState('');

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const createProblems = [
    !form.fullName.trim() && 'Full name',
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && 'A valid email',
    ...(editing?.hasLogin ? [] : passwordProblems(password).map(p => `Password: ${p.toLowerCase()}`)),
  ].filter(Boolean) as string[];

  const payload = () => ({
    fullName: form.fullName.trim(),
    email: form.email.trim(),
    username: form.username.trim() || undefined,
    position: form.position.trim(),
    nationalId: form.nationalId.trim(),
    sscNumber: form.sscNumber.trim(),
    hireDate: form.hireDate,
    baseSalaryJOD: form.baseSalaryJOD ? Number(form.baseSalaryJOD) : 0,
    permissions,
  });

  const save = async () => {
    setError(null);
    if (createProblems.length) { setError(`Missing: ${createProblems.join(', ')}`); return; }
    setBusy(true);
    try {
      if (editing && editing.hasLogin) {
        await updateStaffAccount(editing.id, { ...payload(), status, webAppAccess: webAccess });
        onSaved(`${form.fullName} updated.`);
      } else {
        await createStaffAccount({ ...payload(), password });
        onSaved(`Login created for ${form.fullName}. Share the password securely — it is not shown again.`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    if (!editing) return;
    const pw = generatePassword();
    setBusy(true); setError(null);
    try {
      await resetStaffPassword(editing.id, pw);
      setResetResult(pw);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!editing) return;
    setBusy(true); setError(null);
    try {
      await deleteStaffAccount(editing.id);
      onSaved(`${editing.fullName}'s account was deleted.`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const needsLogin = !editing || !editing.hasLogin;
  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'profile', label: 'Profile' },
    { key: 'access', label: `Access · ${permissions.filter(k => (ALL_PERMISSIONS as string[]).includes(k)).length}` },
    { key: 'security', label: needsLogin ? 'Password' : 'Security' },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside className="relative w-full sm:max-w-2xl h-full bg-white shadow-2xl flex flex-col">
        <header className="px-5 py-4 border-b border-slate-200 flex items-start gap-3">
          <Avatar name={form.fullName || 'New'} email={form.email} size="w-10 h-10 text-xs" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500">{editing ? (editing.hasLogin ? 'Edit staff member' : 'Create login') : 'New staff member'}</p>
            <p className="text-lg font-semibold text-slate-900 truncate">{form.fullName || 'Unnamed'}{isSelf && <Badge tone="info" dot={false} className="ml-2 align-middle">You</Badge>}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100"><CloseIcon className="w-5 h-5" /></button>
        </header>
        <Tabs tabs={tabs} value={tab} onChange={k => setTab(k as typeof tab)} />

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-[13px] text-rose-800"><AlertIcon className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}

          {tab === 'profile' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Full name" required className="sm:col-span-2"><input value={form.fullName} onChange={e => set('fullName', e.target.value)} className={inputCls} placeholder="e.g. Sara Haddad" /></Field>
              <Field label="Email (used to sign in)" required><input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} disabled={isSelf} placeholder="name@company.com" /></Field>
              <Field label={<>Username <span className="text-slate-400 font-normal">(optional)</span></>}><input value={form.username} onChange={e => set('username', e.target.value)} className={inputCls} placeholder="defaults to email name" /></Field>
              <Field label="Job title"><input value={form.position} onChange={e => set('position', e.target.value)} className={inputCls} placeholder="e.g. Reservations agent" /></Field>
              <Field label="Hire date"><input type="date" value={form.hireDate} onChange={e => set('hireDate', e.target.value)} className={inputCls} /></Field>
              <Field label="National ID"><input value={form.nationalId} onChange={e => set('nationalId', e.target.value)} className={inputCls} /></Field>
              <Field label="Social security no."><input value={form.sscNumber} onChange={e => set('sscNumber', e.target.value)} className={inputCls} /></Field>
              <Field label="Base salary (JOD / month)"><input type="number" min={0} value={form.baseSalaryJOD} onChange={e => set('baseSalaryJOD', e.target.value)} className={`${inputCls} tabular-nums`} /></Field>
            </div>
          )}

          {tab === 'access' && (
            <>
              {isSelf && <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">You can't remove your own access to staff management — another administrator has to do that.</p>}
              <PermissionEditor value={permissions} onChange={setPermissions} />
            </>
          )}

          {tab === 'security' && (
            <div className="space-y-4">
              {needsLogin ? (
                <div className="space-y-3">
                  <p className="text-[13px] text-slate-600">{editing ? `${editing.fullName} is listed as staff but has no account to sign in with. Set a starting password to create one.` : 'Set a starting password. Share it with the staff member securely; they can change it later.'}</p>
                  <PasswordField label="Starting password" value={password} onChange={setPassword} />
                </div>
              ) : (
                <>
                  <section className="rounded-lg border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">Account status</h3>
                    <p className="text-xs text-slate-500 mb-3">Disabled accounts are signed out and can't sign in until re-enabled.</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[{ v: true, label: 'Active', d: 'Can sign in and work' }, { v: false, label: 'Disabled', d: 'Blocked from signing in' }].map(o => {
                        const on = (status === UserStatus.ACTIVE && webAccess) === o.v;
                        return (
                          <button key={o.label} type="button" disabled={isSelf}
                            onClick={() => { setStatus(o.v ? UserStatus.ACTIVE : UserStatus.INACTIVE); setWebAccess(o.v); }}
                            className={`text-left px-3 py-2.5 rounded-lg border ${on ? 'border-indigo-500 ring-2 ring-indigo-500/15 bg-indigo-50/40' : 'border-slate-200 hover:border-slate-300'} disabled:opacity-50`}>
                            <p className="text-[13px] font-semibold text-slate-900">{o.label}</p><p className="text-xs text-slate-500">{o.d}</p>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  <section className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><KeyIcon className="w-4 h-4 text-slate-400" /> Password</h3>
                        <p className="text-xs text-slate-500">Last changed {editing?.passwordLastChanged ? new Date(editing.passwordLastChanged).toLocaleDateString() : 'unknown'}.</p>
                      </div>
                      <Button disabled={busy} onClick={doReset}>Reset password</Button>
                    </div>
                    {resetResult && (
                      <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <p className="text-xs font-semibold text-amber-900">New password — copy it now, it won't be shown again:</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <code className="flex-1 min-w-0 break-all px-2 py-1.5 bg-white border border-amber-200 rounded-md font-mono text-[13px]">{resetResult}</code>
                          <Button size="sm" onClick={() => navigator.clipboard?.writeText(resetResult).catch(() => {})}>Copy</Button>
                        </div>
                      </div>
                    )}
                  </section>
                  {!isSelf && (
                    <section className="rounded-lg border border-rose-200 p-4">
                      <h3 className="text-sm font-semibold text-rose-700">Delete account</h3>
                      <p className="text-xs text-slate-500 mb-3">Removes the login permanently. Prefer “Disabled” if they may return. Type <strong>{editing?.email}</strong> to confirm.</p>
                      <div className="flex gap-2">
                        <input value={confirmDelete} onChange={e => setConfirmDelete(e.target.value)} className={inputCls} placeholder={editing?.email} />
                        <Button variant="danger" disabled={busy || confirmDelete.trim().toLowerCase() !== editing?.email?.toLowerCase()} onClick={doDelete}>Delete</Button>
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
          <p className="text-xs text-slate-500 hidden sm:block min-w-0">{createProblems.length ? `Still needed: ${createProblems.join(', ')}` : 'Changes apply the next time the staff member opens the app.'}</p>
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : needsLogin ? 'Create account' : 'Save changes'}
            </Button>
          </div>
        </footer>
      </aside>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

const UserManagement: React.FC<UserManagementProps> = ({ users, onUpdateUsers, currentUser }) => {
  const [serverAccounts, setServerAccounts] = useState<User[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<DrawerMode | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'disabled' | 'nologin' | 'admins'>('all');
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setServerAccounts(await listStaffAccounts());
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Server accounts are the source of truth; staff records in the app without a login are listed too.
  const accounts: Account[] = useMemo(() => {
    const server = (serverAccounts || []).map(u => ({ ...u, hasLogin: true }));
    const emails = new Set(server.map(u => u.email?.toLowerCase()));
    const legacy = (users || []).filter(u => u.email && !emails.has(u.email.toLowerCase())).map(u => ({ ...u, hasLogin: false }));
    return serverAccounts ? [...server, ...legacy] : (users || []).map(u => ({ ...u, hasLogin: true }));
  }, [serverAccounts, users]);

  // Keep the app's staff list (used for HR, payroll and presence) in step, without passwords.
  const syncAppUsers = (fresh: User[]) => {
    const byEmail = new Map((users || []).map(u => [u.email?.toLowerCase(), u]));
    const freshEmails = new Set(fresh.map(u => u.email?.toLowerCase()));
    const merged: User[] = fresh.map(u => {
      const prev = byEmail.get(u.email?.toLowerCase());
      const { password: _p, ...clean } = u as User;
      return { ...(prev || {}), ...clean, password: undefined, isOnline: prev?.isOnline, lastSeen: prev?.lastSeen, deviceType: prev?.deviceType } as User;
    });
    const legacy = (users || []).filter(u => !freshEmails.has(u.email?.toLowerCase())).map(u => ({ ...u, password: undefined }));
    onUpdateUsers([...merged, ...legacy]);
  };

  const handleSaved = async (message: string) => {
    setDrawer(null);
    setNotice(message);
    try {
      const fresh = await listStaffAccounts();
      setServerAccounts(fresh);
      syncAppUsers(fresh);
    } catch { /* list refresh failed; banner will show on next load */ }
    setTimeout(() => setNotice(null), 6000);
  };

  const q = query.trim().toLowerCase();
  const visible = accounts.filter(a => {
    if (q && !`${a.fullName} ${a.email} ${a.username} ${a.position}`.toLowerCase().includes(q)) return false;
    switch (filter) {
      case 'active': return a.hasLogin && isActive(a);
      case 'disabled': return a.hasLogin && !isActive(a);
      case 'nologin': return !a.hasLogin;
      case 'admins': return isAdmin(a);
      default: return true;
    }
  });

  const counts = {
    all: accounts.length,
    active: accounts.filter(a => a.hasLogin && isActive(a)).length,
    disabled: accounts.filter(a => a.hasLogin && !isActive(a)).length,
    nologin: accounts.filter(a => !a.hasLogin).length,
    admins: accounts.filter(isAdmin).length,
  };

  const filterTabs = ([['all', 'All'], ['active', 'Active'], ['admins', 'Administrators'], ['disabled', 'Disabled'], ['nologin', 'Without login']] as const)
    .map(([k, label]) => ({ key: k, label, count: counts[k] }));
  const openAccount = (a: Account) => !loadError && setDrawer({ kind: 'edit', account: a });
  const lastSeen = (a: Account) => a.isOnline ? <span className="text-emerald-700 font-medium">Online now</span> : a.lastSeen ? new Date(a.lastSeen).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <Page>
      <PageHeader
        section="Administration"
        title="User & Staff Management"
        subtitle="Who can sign in, and what each person can see and do."
        actions={
          <Button variant="primary" icon={<PlusIcon className="w-4 h-4" />} onClick={() => setDrawer({ kind: 'create' })} disabled={!!loadError}>
            Add staff member
          </Button>
        }
      />

      <StatGrid items={[
        { label: 'Staff', value: counts.all, sub: `${counts.active} can sign in`, active: filter === 'all', onClick: () => setFilter('all') },
        { label: 'Administrators', value: counts.admins, sub: 'can manage staff', active: filter === 'admins', onClick: () => setFilter('admins') },
        { label: 'Disabled', value: counts.disabled, sub: 'blocked from signing in', active: filter === 'disabled', onClick: () => setFilter('disabled') },
        { label: 'Without login', value: counts.nologin, sub: counts.nologin ? 'need an account' : 'everyone has one', tone: counts.nologin > 0 ? 'warning' : 'default', active: filter === 'nologin', onClick: () => setFilter('nologin') },
      ]} />

      {notice && <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[13px] text-emerald-900"><CheckCircleIcon className="w-4 h-4 mt-0.5 shrink-0" />{notice}</div>}
      {loadError && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-[13px] text-amber-900">
          <AlertIcon className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0"><p className="font-semibold">Staff accounts could not be loaded from the server</p><p className="text-xs">{loadError} Showing the app's staff list read-only.</p></div>
          <Button size="sm" onClick={load}>Retry</Button>
        </div>
      )}
      {counts.nologin > 0 && !loadError && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white border border-amber-200 text-[13px]">
          <ShieldCheckIcon className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
          <p className="text-slate-700"><strong>{counts.nologin}</strong> staff record{counts.nologin === 1 ? ' has' : 's have'} no sign-in account, so {counts.nologin === 1 ? 'this person' : 'these people'} cannot log in. Open them and choose <strong>Create account</strong>.</p>
        </div>
      )}

      <Panel footer={<span className="tabular-nums">{visible.length} of {accounts.length} staff shown</span>}>
        <Tabs tabs={filterTabs} value={filter} onChange={k => setFilter(k as typeof filter)} />
        <Toolbar>
          <div className="relative w-full md:w-80">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, email or job title" className={`${inputCls} pl-9`} />
          </div>
          {loading && serverAccounts && <span className="text-xs text-slate-400 md:ml-auto">Refreshing…</span>}
        </Toolbar>
        {loading && !serverAccounts ? (
          <p className="py-14 text-center text-[13px] text-slate-500">Loading staff…</p>
        ) : visible.length === 0 ? (
          <EmptyState icon={<UsersIcon />} title="No staff match this view." hint="Try another tab or clear the search." />
        ) : (
          <>
            <table className={`hidden md:table ${table.wrap}`}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Staff member</th>
                  <th className={table.th}>Role</th>
                  <th className={table.th}>Job title</th>
                  <th className={table.th}>Status</th>
                  <th className={table.th}>Last seen</th>
                  <th className={table.th} />
                </tr>
              </thead>
              <tbody className={table.body}>
                {visible.map(a => {
                  const self = a.email?.toLowerCase() === currentUser?.email?.toLowerCase();
                  return (
                    <tr key={a.id || a.email} className={`${table.row} cursor-pointer`} onClick={() => openAccount(a)}>
                      <td className={table.td}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative">
                            <Avatar name={a.fullName} email={a.email} />
                            {a.isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">{a.fullName || a.username}{self && <Badge tone="info" dot={false} className="ml-2 !text-[10px]">You</Badge>}</p>
                            <p className="text-xs text-slate-500 truncate">{a.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className={table.td}><RoleBadge perms={a.permissions || []} /></td>
                      <td className={`${table.td} text-slate-600`}>{a.position || '—'}</td>
                      <td className={table.td}><StatusChip account={a} /></td>
                      <td className={`${table.td} text-xs text-slate-500 tabular-nums whitespace-nowrap`}>{lastSeen(a)}</td>
                      <td className={`${table.td} text-right`}>
                        <Button size="sm" variant={a.hasLogin ? 'ghost' : 'secondary'} className={a.hasLogin ? '' : '!text-amber-700'} onClick={e => { e.stopPropagation(); openAccount(a); }}>{a.hasLogin ? 'Manage' : 'Create login'}</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <ul className="md:hidden divide-y divide-slate-100">
              {visible.map(a => {
                const self = a.email?.toLowerCase() === currentUser?.email?.toLowerCase();
                return (
                  <li key={a.id || a.email}>
                    <button type="button" onClick={() => openAccount(a)} className="w-full px-4 py-3 flex items-start gap-3 text-left active:bg-slate-50">
                      <div className="relative">
                        <Avatar name={a.fullName} email={a.email} />
                        {a.isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[13px] font-semibold text-slate-900 truncate">{a.fullName || a.username}{self && <Badge tone="info" dot={false} className="ml-2 !text-[10px]">You</Badge>}</p>
                          <StatusChip account={a} />
                        </div>
                        <p className="text-xs text-slate-500 truncate">{a.email}{a.position ? ` · ${a.position}` : ''}</p>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <RoleBadge perms={a.permissions || []} />
                          <span className={`text-xs font-semibold ${a.hasLogin ? 'text-indigo-600' : 'text-amber-700'}`}>{a.hasLogin ? 'Manage' : 'Create login'}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-400 tabular-nums">Last seen {lastSeen(a)}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>

      {drawer && <StaffDrawer key={drawer.kind === 'edit' ? drawer.account.id : 'new'} mode={drawer} currentUser={currentUser} onClose={() => setDrawer(null)} onSaved={handleSaved} />}
    </Page>
  );
};

export default UserManagement;
