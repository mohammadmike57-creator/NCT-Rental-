import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { PlatformMe, platformMe } from '../../services/platformApi';
import ActionFeedback from '../ui/ActionFeedback';
import ActivityPage from './ActivityPage';
import NewSupplierWizard from './NewSupplierWizard';
import OverviewPage from './OverviewPage';
import SupplierPage from './SupplierPage';
import SuppliersPage from './SuppliersPage';
import { cx, Icon } from './ui';

const LoginScreen = React.lazy(() => import('../LoginScreen'));

type Route = { page: 'overview' } | { page: 'suppliers' } | { page: 'supplier'; id: string } | { page: 'activity' };

const parse = (path: string): Route => {
  const p = path.replace(/\/+$/, '');
  const m = p.match(/^\/admin\/suppliers\/([^/]+)$/);
  if (m) return { page: 'supplier', id: decodeURIComponent(m[1]) };
  if (p === '/admin/suppliers') return { page: 'suppliers' };
  if (p === '/admin/activity') return { page: 'activity' };
  return { page: 'overview' };
};

const hasToken = () => { try { return !!localStorage.getItem('token'); } catch { return false; } };

/** The platform admin portal at /admin: suppliers, packages, people and support, for platform super admins. */
const AdminPortal: React.FC = () => {
  const [route, setRoute] = useState<Route>(() => parse(window.location.pathname));
  const [me, setMe] = useState<PlatformMe | null>(null);
  const [why, setWhy] = useState<{ reason?: string; signedInAs?: string }>({});
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'signin'>(hasToken() ? 'loading' : 'signin');
  const [wizard, setWizard] = useState(false);
  const [menu, setMenu] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    document.title = 'Admin Portal';
    if (!hasToken()) return;
    platformMe().then(m => { setMe(m); setState('ready'); })
      .catch(e => { setWhy(e?.response?.data || {}); setState(e?.response?.status === 401 ? 'signin' : 'denied'); });
  }, []);
  useEffect(() => {
    const pop = () => setRoute(parse(window.location.pathname));
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);

  const go = useCallback((path: string) => {
    window.history.pushState(null, '', path);
    setRoute(parse(path));
    setMenu(false);
    window.scrollTo({ top: 0 });
  }, []);
  const signOut = () => { try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch { /* nothing stored */ } window.location.href = '/admin'; };

  if (state === 'signin') return <Suspense fallback={null}><LoginScreen users={[]} admin /></Suspense>;
  if (state === 'loading') return <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center"><span className="w-6 h-6 rounded-full border-2 border-slate-300 border-t-teal-600 animate-spin" aria-label="Loading" /></div>;
  if (state === 'denied' || !me) return (
    <div className="min-h-screen bg-[#0B1220] flex items-center justify-center p-6" data-testid="portal-denied">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-2xl">
        <span className="inline-flex w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 items-center justify-center">{Icon.shield('w-6 h-6')}</span>
        <h1 className="mt-4 text-[20px] font-semibold text-slate-900">No access to the admin portal</h1>
        <p className="mt-2 text-[13.5px] text-slate-600">
          {why.reason === 'off' ? 'The admin portal is switched off on the server (MULTI_SUPPLIER is not true).'
            : why.reason === 'not-listed' ? 'This account is not listed as a platform administrator (PLATFORM_SUPER_ADMINS).'
            : "This portal is for platform administrators. Your account works in your company's workspace."}
        </p>
        {why.signedInAs && <p className="mt-3 text-[12.5px] text-slate-500" data-testid="portal-signed-in-as">Signed in as <b className="text-slate-800 break-all">{why.signedInAs}</b></p>}
        <div className="mt-6 flex justify-center gap-2">
          <a href="/" className="inline-flex items-center h-10 px-4 rounded-lg bg-teal-700 text-white text-[13px] font-medium hover:bg-teal-800">Open my workspace</a>
          <button type="button" onClick={signOut} className="inline-flex items-center h-10 px-4 rounded-lg ring-1 ring-inset ring-slate-300 text-[13px] font-medium text-slate-700 hover:bg-slate-50">Sign out</button>
        </div>
      </div>
    </div>
  );

  const nav: { label: string; path: string; icon: (c?: string) => React.ReactNode; on: boolean }[] = [
    { label: 'Overview', path: '/admin', icon: Icon.overview, on: route.page === 'overview' },
    { label: 'Suppliers', path: '/admin/suppliers', icon: Icon.suppliers, on: route.page === 'suppliers' || route.page === 'supplier' },
    { label: 'Activity log', path: '/admin/activity', icon: Icon.activity, on: route.page === 'activity' },
  ];
  const initials = (me.name || me.email).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const sidebar = (
    <div className="h-full flex flex-col bg-[#0B1220] text-slate-300">
      <div className="px-5 h-16 flex items-center gap-3 border-b border-white/5">
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 inline-flex items-center justify-center text-[#0B1220]">{Icon.layers('w-[18px] h-[18px]')}</span>
        <div className="leading-tight">
          <p className="text-[14px] font-semibold text-white">Admin Portal</p>
          <p className="text-[11px] text-slate-400">Platform administration</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-5 space-y-0.5" aria-label="Portal">
        <p className="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">Platform</p>
        {nav.map(n => (
          <a key={n.path} href={n.path} onClick={e => { e.preventDefault(); go(n.path); }} aria-current={n.on ? 'page' : undefined}
            className={cx('flex items-center gap-3 px-3 h-10 rounded-lg text-[13.5px] font-medium transition-colors', n.on ? 'bg-white/[0.08] text-white' : 'text-slate-400 hover:text-white hover:bg-white/[0.04]')}>
            <span className={n.on ? 'text-teal-300' : ''}>{n.icon('w-[18px] h-[18px]')}</span>{n.label}
          </a>
        ))}
        <div className="pt-6">
          <p className="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">Workspace</p>
          <a href="/" className="flex items-center gap-3 px-3 h-10 rounded-lg text-[13.5px] font-medium text-slate-400 hover:text-white hover:bg-white/[0.04]">
            {Icon.external('w-[18px] h-[18px]')}UR-Drive Jordan
          </a>
        </div>
      </nav>
      <div className="p-3 border-t border-white/5">
        <div className="flex items-center gap-3 px-2 py-2">
          <span className="w-8 h-8 rounded-full bg-white/10 text-white text-[12px] font-semibold inline-flex items-center justify-center">{initials}</span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[13px] text-white truncate">{me.name}</p>
            <p className="text-[11px] text-slate-400 truncate">Super admin · {me.email}</p>
          </div>
          <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out" className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10">{Icon.logout()}</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F6F8] font-sans-ui" data-testid="admin-portal">
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-[248px] z-30">{sidebar}</aside>
      {menu && <div className="lg:hidden fixed inset-0 z-40"><div className="absolute inset-0 bg-black/40" onClick={() => setMenu(false)} /><div className="absolute inset-y-0 left-0 w-[260px]">{sidebar}</div></div>}
      <div className="lg:pl-[248px]">
        <header className="lg:hidden sticky top-0 z-20 h-14 bg-white border-b border-slate-200 flex items-center gap-3 px-4">
          <button type="button" onClick={() => setMenu(true)} aria-label="Open menu" className="p-1.5 -ml-1.5 rounded-md text-slate-600 hover:bg-slate-100">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <p className="text-[14px] font-semibold text-slate-900">Admin Portal</p>
        </header>
        <main className="px-4 sm:px-8 py-6 sm:py-8 max-w-[1320px] mx-auto" key={key}>
          {route.page === 'overview' && <OverviewPage name={me.name || me.email} onOpen={id => go(`/admin/suppliers/${encodeURIComponent(id)}`)} onNew={() => setWizard(true)}
            onAll={() => go('/admin/suppliers')} onActivity={() => go('/admin/activity')} />}
          {route.page === 'suppliers' && <SuppliersPage onOpen={id => go(`/admin/suppliers/${encodeURIComponent(id)}`)} onNew={() => setWizard(true)} />}
          {route.page === 'supplier' && <SupplierPage id={route.id} onBack={() => go('/admin/suppliers')} />}
          {route.page === 'activity' && <ActivityPage />}
        </main>
      </div>
      {wizard && <NewSupplierWizard onClose={() => { setWizard(false); setKey(k => k + 1); }}
        onCreated={id => { setWizard(false); go(`/admin/suppliers/${encodeURIComponent(id)}`); setKey(k => k + 1); }} />}
      <ActionFeedback />
    </div>
  );
};

export default AdminPortal;
