import React, { useEffect, useMemo, useState } from 'react';
import { ActivityRow, platformActivity, problem } from '../../services/platformApi';
import { Card, cx, ErrorNote, Icon, input } from './ui';

/** Everything platform admins did: suppliers created, packages changed, pauses, invitations, support access. */
const ActivityPage: React.FC = () => {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'support' | 'status' | 'people'>('all');
  useEffect(() => { platformActivity(1000).then(setRows).catch(e => setError(problem(e, 'The activity log could not be loaded.'))); }, []);
  const shown = useMemo(() => (rows || []).filter(r =>
    (kind === 'all' || (kind === 'support' && r.action.includes('SUPPORT')) || (kind === 'status' && /PAUSED|CLOSED|ACTIVE|UPDATED|CREATED/.test(r.action))
      || (kind === 'people' && r.action.includes('USER'))) &&
    (!q.trim() || `${r.summary} ${r.by}`.toLowerCase().includes(q.trim().toLowerCase()))), [rows, q, kind]);
  return (
    <div className="space-y-5" data-testid="platform-activity">
      <div>
        <h1 className="text-[24px] font-semibold text-slate-900 tracking-tight">Activity log</h1>
        <p className="mt-1 text-[13px] text-slate-500">Every platform action, with who did it and when. Support access is also written to the supplier's own log.</p>
      </div>
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100">
          <div className="relative w-full sm:w-72">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{Icon.search()}</span>
            <input className={cx(input, 'pl-9 h-9')} placeholder="Search the log" value={q} onChange={e => setQ(e.target.value)} aria-label="Search the log" />
          </div>
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            {([['all', 'All'], ['status', 'Suppliers'], ['people', 'People'], ['support', 'Support access']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={cx('px-3 h-7 rounded-md text-[12.5px] font-medium', kind === k ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900')}>{l}</button>
            ))}
          </div>
        </div>
        {error ? <div className="p-5"><ErrorNote text={error} /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-[0.06em] text-slate-500 bg-slate-50/80">
                <th className="px-5 py-2.5 font-semibold whitespace-nowrap">When</th><th className="px-3 py-2.5 font-semibold">What</th><th className="px-5 py-2.5 font-semibold">By</th></tr></thead>
              <tbody>
                {!rows ? <tr><td colSpan={3} className="px-5 py-8 text-center text-slate-400">Loading…</td></tr>
                  : shown.length === 0 ? <tr><td colSpan={3} className="px-5 py-10 text-center text-slate-500">No entries.</td></tr>
                  : shown.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-5 py-3 whitespace-nowrap text-slate-600 tabular-nums">{new Date(r.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-3 py-3 text-slate-800">
                        <span className={cx('inline-block mr-2 px-1.5 py-0.5 rounded text-[10.5px] font-semibold tracking-wide align-middle',
                          r.action.includes('SUPPORT') ? 'bg-amber-100 text-amber-800' : /PAUSED|CLOSED|DISABLED/.test(r.action) ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600')}>
                          {r.action.replace(/^SUPPLIER_/, '').replace(/_/g, ' ')}</span>{r.summary}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{r.by}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ActivityPage;
