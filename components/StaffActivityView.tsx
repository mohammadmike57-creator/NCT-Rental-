import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from '../types';
import { fetchActivity, fetchActivitySummary, StaffActivityEntry, StaffActivitySummary } from '../firebase/api';
import { Page, PageHeader, StatGrid, Panel, Toolbar, Segmented, Badge, Button, EmptyState, inputCls } from './ui/Crm';

interface Props {
  users: User[];
}

const CATEGORY: Record<string, { label: string; dot: string; chip: string; icon: string }> = {
  agreement: { label: 'Agreements', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z' },
  reservation: { label: 'Reservations', dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 ring-sky-200', icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5' },
  charges: { label: 'Damage & charges', dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 ring-rose-200', icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z' },
  invoice: { label: 'Invoices', dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700 ring-violet-200', icon: 'M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185z' },
  email: { label: 'Emails', dot: 'bg-indigo-500', chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200', icon: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75' },
  finance: { label: 'Payments', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 ring-amber-200', icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0z' },
  auth: { label: 'Sign-ins', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600 ring-slate-200', icon: 'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z' },
  staff: { label: 'Staff accounts', dot: 'bg-teal-500', chip: 'bg-teal-50 text-teal-700 ring-teal-200', icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z' },
  settings: { label: 'Settings', dot: 'bg-slate-500', chip: 'bg-slate-100 text-slate-700 ring-slate-200', icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z' },
  fleet: { label: 'Fleet', dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-700 ring-orange-200', icon: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25' },
  other: { label: 'Other', dot: 'bg-slate-300', chip: 'bg-slate-100 text-slate-600 ring-slate-200', icon: 'M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z' },
};
const meta = (c: string) => CATEGORY[c] || CATEGORY.other;

const PERIODS = [
  { key: 1, label: 'Today' },
  { key: 7, label: '7 days' },
  { key: 30, label: '30 days' },
  { key: 90, label: '90 days' },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const initials = (n?: string) => (n || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
const ago = (s?: string) => {
  if (!s) return 'no activity';
  const mins = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
};
const dayLabel = (s: string) => {
  const d = new Date(s);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

const StaffActivityView: React.FC<Props> = ({ users }) => {
  const [days, setDays] = useState(7);
  const [selected, setSelected] = useState<string>('');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [summary, setSummary] = useState<StaffActivitySummary[]>([]);
  const [events, setEvents] = useState<StaffActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = new Date();
      from.setDate(from.getDate() - (days - 1));
      const [s, e] = await Promise.all([
        fetchActivitySummary(days),
        fetchActivity({ user: selected || undefined, category: category || undefined, q: query.trim() || undefined, from: iso(from), limit: 1000 }),
      ]);
      setSummary(s);
      setEvents(e);
    } catch (err: any) {
      setError(err?.message || 'Could not load the activity log.');
    } finally {
      setLoading(false);
    }
  }, [days, selected, category, query]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  // Every staff member appears, including those with no activity in the period.
  const staff = useMemo(() => {
    const byEmail = new Map(summary.map(s => [s.userEmail.toLowerCase(), s]));
    const seen = new Set<string>();
    const rows = users.filter(u => u.email && !seen.has(u.email.toLowerCase()) && seen.add(u.email.toLowerCase())).map(u => {
      const s = byEmail.get(u.email.toLowerCase());
      byEmail.delete(u.email.toLowerCase());
      return { email: u.email, name: u.fullName || s?.userName || u.email, position: u.position, events: s?.events || 0, last: s?.lastActivity, byCategory: s?.byCategory || {} };
    });
    byEmail.forEach(s => rows.push({ email: s.userEmail, name: s.userName || s.userEmail, position: undefined, events: s.events, last: s.lastActivity, byCategory: s.byCategory }));
    return rows.sort((a, b) => (b.last || '').localeCompare(a.last || '') || a.name.localeCompare(b.name));
  }, [users, summary]);

  const person = staff.find(s => s.email.toLowerCase() === selected.toLowerCase());
  const totals = useMemo(() => {
    const count = (pred: (e: StaffActivityEntry) => boolean) => events.filter(pred).length;
    return {
      all: events.length,
      checkouts: count(e => e.action === 'CHECK_OUT'),
      checkins: count(e => e.action === 'CHECK_IN'),
      emails: count(e => e.action === 'EMAIL_SENT'),
      logins: count(e => e.action === 'LOGIN'),
      issues: count(e => e.action === 'LOGIN_FAILED' || e.action === 'EMAIL_FAILED'),
    };
  }, [events]);

  const groups = useMemo(() => {
    const g: { day: string; items: StaffActivityEntry[] }[] = [];
    events.forEach(e => {
      const key = new Date(e.occurredAt).toDateString();
      const last = g[g.length - 1];
      if (last && new Date(last.items[0].occurredAt).toDateString() === key) last.items.push(e);
      else g.push({ day: e.occurredAt, items: [e] });
    });
    return g;
  }, [events]);

  const exportCsv = () => {
    const q = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = [['Time', 'Staff', 'Email', 'Category', 'Action', 'Summary', 'Booking', 'Details'].join(',')]
      .concat(events.map(e => [new Date(e.occurredAt).toLocaleString('en-GB'), e.userName || '', e.userEmail, meta(e.category).label, e.action, e.summary, e.bookingId || '', e.details || ''].map(q).join(',')));
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `staff-activity-${selected || 'all'}-${iso(new Date())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <Page>
      <PageHeader
        section="Administration"
        title="Activity Log"
        subtitle="What each staff member did, recorded by the server with their account and the time."
        actions={
          <>
            <Segmented options={PERIODS.map(p => ({ key: String(p.key), label: p.label }))} value={String(days)} onChange={k => setDays(Number(k))} />
            <Button onClick={load}>Refresh</Button>
            <Button onClick={exportCsv} disabled={!events.length}>Export CSV</Button>
          </>
        }
      />

      <StatGrid items={[
        { label: 'Events', value: totals.all, sub: person ? person.name : 'All staff' },
        { label: 'Check-outs', value: totals.checkouts },
        { label: 'Check-ins', value: totals.checkins },
        { label: 'Emails sent', value: totals.emails },
        { label: 'Sign-ins', value: totals.logins },
        { label: 'Problems', value: totals.issues, tone: totals.issues > 0 ? 'danger' : 'default' },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start">
        {/* Staff list */}
        <Panel title="Staff" subtitle={`${staff.length} accounts`} className="lg:sticky lg:top-4">
          <ul className="max-h-[40vh] lg:max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
            <li>
              <button onClick={() => setSelected('')} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-l-2 ${!selected ? 'bg-indigo-50/60 border-indigo-600' : 'border-transparent hover:bg-slate-50'}`}>
                <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[11px] font-semibold">ALL</span>
                <span className="flex-1 min-w-0"><span className="block text-[13px] font-semibold text-slate-900">All staff</span><span className="block text-xs text-slate-500 tabular-nums">{summary.reduce((s, x) => s + x.events, 0)} events</span></span>
              </button>
            </li>
            {staff.map(s => {
              const total = Object.values(s.byCategory).reduce((a, b) => a + b, 0) || 1;
              const active = s.email.toLowerCase() === selected.toLowerCase();
              return (
                <li key={s.email}>
                  <button onClick={() => setSelected(s.email)} className={`w-full px-4 py-2.5 text-left border-l-2 ${active ? 'bg-indigo-50/60 border-indigo-600' : 'border-transparent hover:bg-slate-50'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${s.events ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>{initials(s.name)}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-semibold text-slate-900 truncate">{s.name}</span>
                        <span className="block text-xs text-slate-500 truncate">{s.position || s.email}</span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block text-[13px] font-semibold tabular-nums text-slate-900">{s.events}</span>
                        <span className="block text-[11px] text-slate-400">{ago(s.last)}</span>
                      </span>
                    </div>
                    {s.events > 0 && (
                      <div className="mt-2 ml-11 flex h-1 rounded-full overflow-hidden bg-slate-100">
                        {Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]).map(([c, n]) => <span key={c} className={meta(c).dot} style={{ width: `${(n / total) * 100}%` }} title={`${meta(c).label}: ${n}`} />)}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* Timeline */}
        <Panel
          title={person ? person.name : 'All staff'}
          subtitle={person ? `${person.position ? person.position + ' · ' : ''}${person.email} · last active ${ago(person.last)}` : `Everything recorded in the last ${days === 1 ? 'day' : `${days} days`}`}
          actions={loading && events.length ? <span className="text-xs text-slate-400">Refreshing…</span> : undefined}
        >
          <Toolbar>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setCategory('')} className={`h-7 px-2.5 rounded-md text-xs font-semibold ring-1 ring-inset whitespace-nowrap ${!category ? 'bg-indigo-50 text-indigo-700 ring-indigo-200' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>Everything</button>
              {['agreement', 'reservation', 'charges', 'email', 'invoice', 'finance', 'auth', 'staff', 'settings'].map(c => (
                <button key={c} onClick={() => setCategory(category === c ? '' : c)} className={`h-7 px-2.5 rounded-md text-xs font-semibold ring-1 ring-inset whitespace-nowrap ${category === c ? 'bg-indigo-50 text-indigo-700 ring-indigo-200' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>{meta(c).label}</button>
              ))}
            </div>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search text or booking ref" className={`${inputCls} md:ml-auto md:w-64`} />
          </Toolbar>

          {error ? (
            <div className="m-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-4 text-[13px]">{error}</div>
          ) : loading && !events.length ? (
            <div className="py-14 text-center text-[13px] text-slate-500">Loading activity…</div>
          ) : !events.length ? (
            <EmptyState title="No activity in this period" hint="Try a longer period or clear the filters." />
          ) : (
            groups.map(g => (
              <div key={g.day}>
                <div className="px-4 py-2 bg-slate-50 border-y border-slate-100 first:border-t-0 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{dayLabel(g.day)}</span>
                  <span className="text-xs text-slate-400 tabular-nums">{g.items.length} event{g.items.length === 1 ? '' : 's'}</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {g.items.map(e => {
                    const m = meta(e.category);
                    const bad = e.action.endsWith('_FAILED');
                    return (
                      <li key={e.id} className="px-4 py-2.5 flex gap-3">
                        <span className="w-12 shrink-0 pt-0.5 text-xs text-slate-500 tabular-nums">{new Date(e.occurredAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[13px] ${bad ? 'text-rose-700 font-medium' : 'text-slate-900'}`}>{e.summary || e.action}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                            <Badge tone={bad ? 'danger' : 'muted'} dot={false} className="!font-medium"><span className={`w-1.5 h-1.5 rounded-full ${bad ? 'bg-rose-500' : m.dot}`} />{m.label}</Badge>
                            {!selected && <button onClick={() => setSelected(e.userEmail)} className="font-semibold text-slate-700 hover:text-indigo-700 hover:underline">{e.userName || e.userEmail}</button>}
                            <span className="font-mono text-[11px] text-slate-400">{e.action}</span>
                            {e.bookingId && <button onClick={() => setQuery(e.bookingId!)} className="px-1.5 py-px rounded border border-slate-200 bg-slate-50 font-mono text-[11px] text-slate-600 hover:bg-slate-100">#{e.bookingId}</button>}
                            {e.details && <button onClick={() => setOpenId(openId === e.id ? null : e.id)} className="text-indigo-600 font-semibold hover:underline">{openId === e.id ? 'Hide details' : 'Details'}</button>}
                          </div>
                          {openId === e.id && e.details && <p className="mt-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5 whitespace-pre-wrap break-words">{e.details}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </Panel>
      </div>
    </Page>
  );
};

export default StaffActivityView;
