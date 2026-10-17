import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User, UserPermission, UserStatus } from '../types';
import { PlusIcon, SearchIcon, CloseIcon, ShieldCheckIcon, KeyIcon, UsersIcon, AlertIcon, CheckCircleIcon } from './icons';
import {
  listStaffAccounts, createStaffAccount, updateStaffAccount, resetStaffPassword, deleteStaffAccount,
} from '../firebase/api';
import {
  PERMISSION_GROUPS, ROLE_TEMPLATES, SENSITIVE_PERMISSIONS, matchRole, generatePassword, passwordProblems, RoleTemplate,
} from '../services/permissionCatalog';

interface UserManagementProps {
  users: User[];
  onUpdateUsers: (users: User[]) => void;
  currentUser: User | null;
}

type Account = User & { hasLogin: boolean };
type DrawerMode = { kind: 'create'; prefill?: Partial<User> } | { kind: 'edit'; account: Account };

const initials = (name?: string) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
const AVATAR_COLORS = ['from-indigo-500 to-violet-500', 'from-sky-500 to-cyan-500', 'from-emerald-500 to-teal-500', 'from-amber-500 to-orange-500', 'from-rose-500 to-pink-500'];
const avatarColor = (s: string) => AVATAR_COLORS[Math.abs([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % AVATAR_COLORS.length];
const isAdmin = (u: Partial<User>) => (u.permissions || []).includes(UserPermission.ACTION_ADMIN_MANAGE_USERS);
const isActive = (u: Partial<User>) => (u.status || UserStatus.ACTIVE) === UserStatus.ACTIVE && u.webAppAccess !== false;

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-500';

const Avatar: React.FC<{ name?: string; email?: string; size?: string }> = ({ name, email, size = 'w-10 h-10 text-sm' }) => (
  <div className={`${size} rounded-full bg-gradient-to-br ${avatarColor(email || name || '?')} text-white font-bold flex items-center justify-center shrink-0`}>{initials(name)}</div>
);

const RoleBadge: React.FC<{ perms: string[] }> = ({ perms }) => {
  const role = matchRole(perms);
  if (role) return <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700"><span className={`w-2 h-2 rounded-full ${role.color}`} />{role.name}</span>;
  return <span className="text-xs font-semibold text-slate-600">Custom · {perms.length} permission{perms.length === 1 ? '' : 's'}</span>;
};

const StatusChip: React.FC<{ account: Account }> = ({ account }) => {
  if (!account.hasLogin) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">No login</span>;
  if (!isActive(account)) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">Disabled</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">Active</span>;
};

// ---------------------------------------------------------------------------
// Permission editor
// ---------------------------------------------------------------------------

const PermissionEditor: React.FC<{ value: UserPermission[]; onChange: (v: UserPermission[]) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ core: true, reservations: true });
  const set = new Set(value);
  const q = query.trim().toLowerCase();
  const role = matchRole(value);

  const applyRole = (r: RoleTemplate) => !disabled && onChange([...r.permissions]);
  const toggle = (k: UserPermission) => {
    if (disabled) return;
    const next = new Set(set);
    next.has(k) ? next.delete(k) : next.add(k);
    onChange(Array.from(next));
  };
  const setGroup = (keys: UserPermission[], on: boolean) => {
    if (disabled) return;
    const next = new Set(set);
    keys.forEach(k => (on ? next.add(k) : next.delete(k)));
    onChange(Array.from(next));
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Start from a role</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ROLE_TEMPLATES.map(r => {
            const active = role?.id === r.id;
            return (
              <button key={r.id} type="button" disabled={disabled} onClick={() => applyRole(r)}
                className={`text-left p-3 rounded-xl border transition-all ${active ? 'border-indigo-500 ring-2 ring-indigo-500/15 bg-indigo-50/40' : 'border-slate-200 hover:border-slate-300'} disabled:opacity-60`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${r.color}`} />
                  <span className="text-sm font-semibold text-slate-900">{r.name}</span>
                  {active && <CheckCircleIcon className="w-4 h-4 text-indigo-600 ml-auto" />}
                </div>
                <p className="text-xs text-slate-500 mt-1">{r.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Permissions <span className="normal-case tracking-normal font-medium text-slate-400">· {value.length} selected{role ? '' : ' · custom'}</span></p>
          <div className="relative w-48">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a permission" className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-indigo-500" />
          </div>
        </div>
        <div className="space-y-2">
          {PERMISSION_GROUPS.map(g => {
            const items = g.permissions.filter(x => !q || x.label.toLowerCase().includes(q) || x.description.toLowerCase().includes(q));
            if (items.length === 0) return null;
            const keys = g.permissions.map(x => x.key);
            const count = keys.filter(k => set.has(k)).length;
            const isOpen = open[g.id] || !!q;
            return (
              <div key={g.id} className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50/70">
                  <button type="button" onClick={() => setOpen(o => ({ ...o, [g.id]: !isOpen }))} className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{g.title} <span className="ml-1 text-xs font-medium text-slate-400">{count}/{keys.length}</span></p>
                    <p className="text-xs text-slate-500 truncate">{g.description}</p>
                  </button>
                  <button type="button" disabled={disabled} onClick={() => setGroup(keys, count < keys.length)}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:text-slate-400 whitespace-nowrap">
                    {count < keys.length ? 'Select all' : 'Clear'}
                  </button>
                  <span className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                </div>
                {isOpen && (
                  <ul className="divide-y divide-slate-100">
                    {items.map(x => {
                      const on = set.has(x.key);
                      return (
                        <li key={x.key}>
                          <label className={`flex items-center gap-3 px-3 py-2.5 ${disabled ? '' : 'cursor-pointer hover:bg-slate-50'}`}>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                                {x.label}
                                {SENSITIVE_PERMISSIONS.has(x.key) && <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-bold uppercase tracking-wide">Sensitive</span>}
                              </span>
                              <span className="block text-xs text-slate-500">{x.description}</span>
                            </span>
                            <span className={`relative inline-flex w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-indigo-600' : 'bg-slate-300'} ${disabled ? 'opacity-60' : ''}`}>
                              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
                            </span>
                            <input type="checkbox" className="sr-only" checked={on} disabled={disabled} onChange={() => toggle(x.key)} />
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
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
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} className={`${inputCls} font-mono pr-14`} autoComplete="new-password" />
          <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-800">{show ? 'Hide' : 'Show'}</button>
        </div>
        <button type="button" onClick={() => onChange(generatePassword())} className="px-3 py-2 text-sm font-semibold border border-slate-200 rounded-xl hover:bg-slate-50 whitespace-nowrap">Generate</button>
        <button type="button" disabled={!value} onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ } }}
          className="px-3 py-2 text-sm font-semibold border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40">{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {['At least 8 characters', 'A letter', 'A number'].map(rule => {
          const ok = value.length > 0 && !problems.includes(rule);
          return <span key={rule} className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{ok ? '✓ ' : ''}{rule}</span>;
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
    { key: 'access', label: `Access · ${permissions.length}` },
    { key: 'security', label: needsLogin ? 'Password' : 'Security' },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col">
        <header className="px-6 py-4 border-b border-slate-200 flex items-center gap-4">
          <Avatar name={form.fullName || 'New'} email={form.email} size="w-11 h-11 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{editing ? (editing.hasLogin ? 'Edit staff member' : 'Create login') : 'New staff member'}</p>
            <p className="text-lg font-bold text-slate-900 truncate">{form.fullName || 'Unnamed'}{isSelf && <span className="ml-2 text-xs font-semibold text-indigo-600">You</span>}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><CloseIcon className="w-5 h-5" /></button>
        </header>
        <nav className="px-6 border-b border-slate-200 flex gap-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-3 text-sm font-semibold border-b-2 -mb-px ${tab === t.key ? 'border-indigo-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{t.label}</button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800"><AlertIcon className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}

          {tab === 'profile' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1">Full name *</label><input value={form.fullName} onChange={e => set('fullName', e.target.value)} className={inputCls} placeholder="e.g. Sara Haddad" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Email (used to sign in) *</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} disabled={isSelf} placeholder="name@company.com" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Username <span className="text-slate-400">(optional)</span></label><input value={form.username} onChange={e => set('username', e.target.value)} className={inputCls} placeholder="defaults to email name" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Job title</label><input value={form.position} onChange={e => set('position', e.target.value)} className={inputCls} placeholder="e.g. Reservations agent" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Hire date</label><input type="date" value={form.hireDate} onChange={e => set('hireDate', e.target.value)} className={inputCls} /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">National ID</label><input value={form.nationalId} onChange={e => set('nationalId', e.target.value)} className={inputCls} /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Social security no.</label><input value={form.sscNumber} onChange={e => set('sscNumber', e.target.value)} className={inputCls} /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Base salary (JOD / month)</label><input type="number" min={0} value={form.baseSalaryJOD} onChange={e => set('baseSalaryJOD', e.target.value)} className={inputCls} /></div>
            </div>
          )}

          {tab === 'access' && (
            <>
              {isSelf && <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">You can't remove your own access to staff management — another administrator has to do that.</p>}
              <PermissionEditor value={permissions} onChange={setPermissions} />
            </>
          )}

          {tab === 'security' && (
            <div className="space-y-6">
              {needsLogin ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">{editing ? `${editing.fullName} is listed as staff but has no account to sign in with. Set a starting password to create one.` : 'Set a starting password. Share it with the staff member securely; they can change it later.'}</p>
                  <PasswordField label="Starting password" value={password} onChange={setPassword} />
                </div>
              ) : (
                <>
                  <section className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">Account status</h3>
                    <p className="text-xs text-slate-500 mb-3">Disabled accounts are signed out and can't sign in until re-enabled.</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[{ v: true, label: 'Active', d: 'Can sign in and work' }, { v: false, label: 'Disabled', d: 'Blocked from signing in' }].map(o => {
                        const on = (status === UserStatus.ACTIVE && webAccess) === o.v;
                        return (
                          <button key={o.label} type="button" disabled={isSelf}
                            onClick={() => { setStatus(o.v ? UserStatus.ACTIVE : UserStatus.INACTIVE); setWebAccess(o.v); }}
                            className={`text-left p-3 rounded-xl border ${on ? (o.v ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-500 bg-slate-50') : 'border-slate-200 hover:border-slate-300'} disabled:opacity-50`}>
                            <p className="text-sm font-semibold text-slate-900">{o.label}</p><p className="text-xs text-slate-500">{o.d}</p>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  <section className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><KeyIcon className="w-4 h-4 text-slate-400" /> Password</h3>
                        <p className="text-xs text-slate-500">Last changed {editing?.passwordLastChanged ? new Date(editing.passwordLastChanged).toLocaleDateString() : 'unknown'}.</p>
                      </div>
                      <button type="button" disabled={busy} onClick={doReset} className="px-3 py-2 text-sm font-semibold border border-slate-200 rounded-xl hover:bg-slate-50 whitespace-nowrap">Reset password</button>
                    </div>
                    {resetResult && (
                      <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                        <p className="text-xs font-semibold text-amber-900">New password — copy it now, it won't be shown again:</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <code className="flex-1 px-2 py-1.5 bg-white border border-amber-200 rounded font-mono text-sm">{resetResult}</code>
                          <button type="button" onClick={() => navigator.clipboard?.writeText(resetResult).catch(() => {})} className="px-3 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded">Copy</button>
                        </div>
                      </div>
                    )}
                  </section>
                  {!isSelf && (
                    <section className="rounded-xl border border-rose-200 p-4">
                      <h3 className="text-sm font-semibold text-rose-700">Delete account</h3>
                      <p className="text-xs text-slate-500 mb-3">Removes the login permanently. Prefer “Disabled” if they may return. Type <strong>{editing?.email}</strong> to confirm.</p>
                      <div className="flex gap-2">
                        <input value={confirmDelete} onChange={e => setConfirmDelete(e.target.value)} className={inputCls} placeholder={editing?.email} />
                        <button type="button" disabled={busy || confirmDelete.trim().toLowerCase() !== editing?.email?.toLowerCase()} onClick={doDelete}
                          className="px-4 py-2 text-sm font-semibold bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:bg-slate-300 whitespace-nowrap">Delete</button>
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3 bg-slate-50/60">
          <p className="text-xs text-slate-500 hidden sm:block">{createProblems.length ? `Still needed: ${createProblems.join(', ')}` : 'Changes apply the next time the staff member opens the app.'}</p>
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-100">Cancel</button>
            <button onClick={save} disabled={busy} className="px-5 py-2.5 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-slate-300">
              {busy ? 'Saving…' : needsLogin ? 'Create account' : 'Save changes'}
            </button>
          </div>
        </footer>
      </div>
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

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><UsersIcon className="w-6 h-6" /></div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Staff & permissions</h2>
              <p className="text-sm text-slate-500">Who can sign in, and what each person can see and do.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px] lg:w-72 lg:flex-none">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, email or job title" className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
            </div>
            <button onClick={() => setDrawer({ kind: 'create' })} disabled={!!loadError} className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:bg-slate-300">
              <PlusIcon className="w-4 h-4" /> Add staff member
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-100 divide-x divide-y lg:divide-y-0 divide-slate-100">
          {[
            { label: 'Staff', value: counts.all, sub: `${counts.active} can sign in` },
            { label: 'Administrators', value: counts.admins, sub: 'can manage staff' },
            { label: 'Disabled', value: counts.disabled, sub: 'blocked from signing in' },
            { label: 'Without login', value: counts.nologin, sub: counts.nologin ? 'need an account' : 'everyone has one', warn: counts.nologin > 0 },
          ].map(k => (
            <div key={k.label} className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${k.warn ? 'text-amber-600' : 'text-slate-900'}`}>{k.value}</p>
              <p className="text-xs text-slate-400">{k.sub}</p>
            </div>
          ))}
        </div>
        <div className="px-3 sm:px-5 border-t border-slate-100 flex gap-1 overflow-x-auto no-scrollbar">
          {([['all', 'All'], ['active', 'Active'], ['admins', 'Administrators'], ['disabled', 'Disabled'], ['nologin', 'Without login']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${filter === k ? 'border-indigo-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {label}<span className={`ml-2 px-1.5 py-0.5 rounded-md text-[11px] ${filter === k ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{counts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      {notice && <div className="flex items-start gap-2 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900"><CheckCircleIcon className="w-5 h-5 shrink-0" />{notice}</div>}
      {loadError && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
          <AlertIcon className="w-5 h-5 shrink-0" />
          <div className="flex-1"><p className="font-semibold">Staff accounts could not be loaded from the server</p><p className="text-xs">{loadError} Showing the app's staff list read-only.</p></div>
          <button onClick={load} className="text-xs font-semibold underline">Retry</button>
        </div>
      )}
      {counts.nologin > 0 && !loadError && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-white border border-amber-200 text-sm">
          <ShieldCheckIcon className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-slate-700"><strong>{counts.nologin}</strong> staff record{counts.nologin === 1 ? ' has' : 's have'} no sign-in account, so {counts.nologin === 1 ? 'this person' : 'these people'} cannot log in. Open them and choose <strong>Create account</strong>.</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading && !serverAccounts ? (
          <p className="py-14 text-center text-sm text-slate-500">Loading staff…</p>
        ) : visible.length === 0 ? (
          <p className="py-14 text-center text-sm text-slate-500">No staff match this view.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="hidden md:table-header-group">
              <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="text-left font-semibold px-5 py-3">Staff member</th>
                <th className="text-left font-semibold px-4 py-3">Role</th>
                <th className="text-left font-semibold px-4 py-3">Job title</th>
                <th className="text-left font-semibold px-4 py-3">Status</th>
                <th className="text-left font-semibold px-4 py-3">Last seen</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map(a => {
                const self = a.email?.toLowerCase() === currentUser?.email?.toLowerCase();
                return (
                  <tr key={a.id || a.email} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => !loadError && setDrawer({ kind: 'edit', account: a })}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          <Avatar name={a.fullName} email={a.email} />
                          {a.isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{a.fullName || a.username}{self && <span className="ml-2 text-[10px] font-bold uppercase text-indigo-600">You</span>}</p>
                          <p className="text-xs text-slate-500 truncate">{a.email}</p>
                          <div className="md:hidden mt-1 flex items-center gap-2"><StatusChip account={a} /><RoleBadge perms={a.permissions || []} /></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell"><RoleBadge perms={a.permissions || []} /></td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-600">{a.position || '—'}</td>
                    <td className="px-4 py-3 hidden md:table-cell"><StatusChip account={a} /></td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-slate-500">{a.isOnline ? <span className="text-emerald-600 font-semibold">Online now</span> : a.lastSeen ? new Date(a.lastSeen).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-xs font-semibold ${a.hasLogin ? 'text-indigo-600' : 'text-amber-700'}`}>{a.hasLogin ? 'Manage' : 'Create login'} →</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {drawer && <StaffDrawer key={drawer.kind === 'edit' ? drawer.account.id : 'new'} mode={drawer} currentUser={currentUser} onClose={() => setDrawer(null)} onSaved={handleSaved} />}
    </div>
  );
};

export default UserManagement;
