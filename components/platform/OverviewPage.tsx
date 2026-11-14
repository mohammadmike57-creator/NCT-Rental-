import React, { useEffect, useState } from 'react';
import { listSuppliers, Overview, platformOverview, PlanId, problem, SupplierRow } from '../../services/platformApi';
import { Timeline } from './SupplierPage';
import { Btn, Card, cx, ErrorNote, Icon, Monogram, num, PLAN_STYLE, PlanPill, Stat, StatusPill, when } from './ui';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

/** Platform at a glance: suppliers, packages, broker traffic, what needs attention, recent platform actions. */
const OverviewPage: React.FC<{ name: string; onOpen: (id: string) => void; onNew: () => void; onAll: () => void; onActivity: () => void }> = ({ name, onOpen, onNew, onAll, onActivity }) => {
  const [o, setO] = useState<Overview | null>(null);
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([platformOverview(), listSuppliers()]).then(([a, b]) => { setO(a); setRows(b); }).catch(e => setError(problem(e, 'The overview could not be loaded.')));
  }, []);
  if (error) return <ErrorNote text={error} />;
  if (!o) return <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-white border border-slate-200 animate-pulse" />)}</div>;

  const active = o.byStatus.ACTIVE || 0;
  const attention = rows.flatMap(s => {
    const out: { s: SupplierRow; text: string; tone: 'amber' | 'rose' | 'slate' }[] = [];
    if (s.status === 'PAUSED') out.push({ s, text: 'Paused: nobody can sign in, brokers get no answers', tone: 'amber' });
    if (s.status === 'ACTIVE' && s.plan !== 'CRM' && !s.liveAccess && (s.channels || 0) > 0) out.push({ s, text: 'Has broker channels but live access is off', tone: 'slate' });
    if (s.status === 'ACTIVE' && !s.primary && (!s.lastActivity || Date.now() - new Date(s.lastActivity).getTime() > 14 * 86_400_000))
      out.push({ s, text: s.lastActivity ? `No activity for ${Math.floor((Date.now() - new Date(s.lastActivity).getTime()) / 86_400_000)} days` : 'Nobody has signed in yet', tone: 'slate' });
    return out;
  }).slice(0, 6);
  const top = [...rows].sort((a, b) => (b.brokerCalls7d || 0) - (a.brokerCalls7d || 0)).slice(0, 5);
  const plans: PlanId[] = ['FULL', 'CRM', 'XML'];
  const totalPlans = plans.reduce((n, p) => n + (o.byPlan[p] || 0), 0) || 1;

  return (
    <div className="space-y-6" data-testid="platform-overview">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-[13px] text-slate-500">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <h1 className="mt-1 text-[26px] font-semibold text-slate-900 tracking-tight">{greeting()}, {name.split(' ')[0]}</h1>
        </div>
        <Btn kind="primary" className="ml-auto" icon={Icon.plus('w-3.5 h-3.5')} onClick={onNew}>New supplier</Btn>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat label="Active suppliers" value={num(active)} sub={`${num(o.suppliers)} in total`} icon={Icon.suppliers()} />
        <Stat label="People" value={num(o.users)} sub="Accounts on the platform" icon={Icon.users()} />
        <Stat label="Broker channels" value={num(o.channels)} sub="Across all suppliers" icon={Icon.signal()} />
        <Stat label="Broker calls" value={num(o.brokerCalls7d)} sub={`Last 7 days · ${num(o.brokerCalls24h)} in 24 h`} icon={Icon.activity()} />
        <Stat label="Broker bookings" value={num(o.brokerBookings30d)} sub="Live, last 30 days" icon={Icon.car()} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <Card title="Packages" subtitle="What suppliers are using">
          <div className="flex h-3 rounded-full overflow-hidden bg-slate-100" role="img" aria-label="Suppliers per package">
            {plans.map(p => (o.byPlan[p] || 0) > 0 && <span key={p} className={PLAN_STYLE[p].dot} style={{ width: `${((o.byPlan[p] || 0) / totalPlans) * 100}%` }} />)}
          </div>
          <ul className="mt-4 space-y-2.5">
            {plans.map(p => (
              <li key={p} className="flex items-center gap-3 text-[13px]">
                <span className={cx('w-2.5 h-2.5 rounded-sm', PLAN_STYLE[p].dot)} />
                <span className="text-slate-700">{PLAN_STYLE[p].short}</span>
                <span className="ml-auto font-semibold tabular-nums text-slate-900">{o.byPlan[p] || 0}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
            {(['ACTIVE', 'PAUSED', 'CLOSED'] as const).map(st => (
              <div key={st}><p className="text-[20px] font-semibold tabular-nums text-slate-900">{o.byStatus[st] || 0}</p><p className="text-[11.5px] text-slate-500">{st === 'ACTIVE' ? 'Active' : st === 'PAUSED' ? 'Paused' : 'Closed'}</p></div>
            ))}
          </div>
        </Card>

        <Card title="Needs attention" subtitle={attention.length ? `${attention.length} item${attention.length > 1 ? 's' : ''}` : 'Nothing waiting'} padded={false}>
          {attention.length === 0
            ? <div className="px-5 pb-8 pt-4 text-center"><span className="inline-flex w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 items-center justify-center">{Icon.check('w-5 h-5')}</span><p className="mt-2 text-[13px] text-slate-600">Every supplier is set up and active.</p></div>
            : <ul className="divide-y divide-slate-100">{attention.map((a, i) => (
              <li key={i}><button type="button" onClick={() => onOpen(a.s.id)} className="w-full text-left flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <span className={cx('w-1.5 h-8 rounded-full shrink-0', a.tone === 'amber' ? 'bg-amber-400' : a.tone === 'rose' ? 'bg-rose-500' : 'bg-slate-300')} />
                <span className="min-w-0"><span className="block text-[13px] font-medium text-slate-900 truncate">{a.s.name}</span><span className="block text-[12px] text-slate-500 truncate">{a.text}</span></span>
              </button></li>
            ))}</ul>}
        </Card>

        <Card title="Recent platform activity" actions={<button type="button" onClick={onActivity} className="text-[12.5px] font-medium text-teal-700 hover:text-teal-900">View all</button>}>
          <Timeline rows={o.recentActivity.slice(0, 6)} empty="Nothing yet. Creating a supplier is logged here." />
        </Card>
      </div>

      <Card title="Suppliers by broker traffic" subtitle="Live broker calls in the last 7 days" padded={false}
        actions={<button type="button" onClick={onAll} className="text-[12.5px] font-medium text-teal-700 hover:text-teal-900">All suppliers</button>}>
        <ul className="divide-y divide-slate-100">
          {top.map(s => {
            const max = Math.max(1, top[0]?.brokerCalls7d || 0);
            return (
              <li key={s.id}><button type="button" onClick={() => onOpen(s.id)} className="w-full text-left grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_160px_100px_auto] items-center gap-4 px-5 py-3 hover:bg-slate-50">
                <Monogram name={s.name} plan={s.plan} />
                <span className="min-w-0"><span className="block text-[13.5px] font-medium text-slate-900 truncate">{s.name}</span><span className="block text-[12px] text-slate-500"><span className="font-mono">{s.code}</span> · {num(s.channels)} channel{s.channels === 1 ? '' : 's'}</span></span>
                <span className="hidden sm:block h-1.5 rounded-full bg-slate-100 overflow-hidden"><span className="block h-full bg-teal-600 rounded-full" style={{ width: `${((s.brokerCalls7d || 0) / max) * 100}%` }} /></span>
                <span className="hidden sm:block text-right text-[13px] font-semibold tabular-nums text-slate-900">{num(s.brokerCalls7d)}</span>
                <span className="flex items-center gap-2"><PlanPill plan={s.plan} /><StatusPill status={s.status} /></span>
              </button></li>
            );
          })}
        </ul>
        {top.length > 0 && <p className="px-5 py-3 text-[12px] text-slate-500 border-t border-slate-100">Last activity on the platform: {when(rows.map(r => r.lastActivity).filter(Boolean).sort().reverse()[0])}</p>}
      </Card>
    </div>
  );
};

export default OverviewPage;
