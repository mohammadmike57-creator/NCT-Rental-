import React, { useEffect, useMemo, useState } from 'react';
import { listSuppliers, PlanId, problem, SupplierRow, SupplierStatus } from '../../services/platformApi';
import { Btn, cx, date, ErrorNote, Icon, input, Monogram, num, PlanPill, StatusPill, when } from './ui';

/** Every supplier, searchable and filtered by status and package. */
const SuppliersPage: React.FC<{ onOpen: (id: string) => void; onNew: () => void }> = ({ onOpen, onNew }) => {
  const [rows, setRows] = useState<SupplierRow[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'ALL' | SupplierStatus>('ALL');
  const [plan, setPlan] = useState<'ALL' | PlanId>('ALL');
  useEffect(() => { listSuppliers().then(setRows).catch(e => setError(problem(e, 'Suppliers could not be loaded.'))); }, []);

  const shown = useMemo(() => (rows || []).filter(s =>
    (status === 'ALL' || s.status === status) && (plan === 'ALL' || s.plan === plan) &&
    (!q.trim() || [s.name, s.code, s.owner, s.contactEmail, s.legalName, s.slug].some(v => (v || '').toLowerCase().includes(q.trim().toLowerCase())))), [rows, q, status, plan]);
  const count = (st: 'ALL' | SupplierStatus) => (rows || []).filter(s => st === 'ALL' || s.status === st).length;

  return (
    <div className="space-y-5" data-testid="suppliers-page">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-[24px] font-semibold text-slate-900 tracking-tight">Suppliers</h1>
          <p className="mt-1 text-[13px] text-slate-500">Rental companies on the platform. Each one sees only its own data.</p>
        </div>
        <Btn kind="primary" className="ml-auto" icon={Icon.plus('w-3.5 h-3.5')} onClick={onNew}>New supplier</Btn>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100">
          <div className="relative w-full sm:w-72">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{Icon.search()}</span>
            <input className={cx(input, 'pl-9 h-9')} placeholder="Search name, code or email" value={q} onChange={e => setQ(e.target.value)} aria-label="Search suppliers" />
          </div>
          <div className="inline-flex rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Status">
            {(['ALL', 'ACTIVE', 'PAUSED', 'CLOSED'] as const).map(st => (
              <button key={st} type="button" role="tab" aria-selected={status === st} onClick={() => setStatus(st)}
                className={cx('px-3 h-7 rounded-md text-[12.5px] font-medium', status === st ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900')}>
                {st === 'ALL' ? 'All' : st[0] + st.slice(1).toLowerCase()} <span className="ml-1 text-slate-400 tabular-nums">{count(st)}</span>
              </button>
            ))}
          </div>
          <select className="h-9 px-3 rounded-lg border border-slate-300 text-[13px] text-slate-700 bg-white" value={plan} onChange={e => setPlan(e.target.value as 'ALL' | PlanId)} aria-label="Package">
            <option value="ALL">All packages</option><option value="FULL">Full system</option><option value="CRM">CRM only</option><option value="XML">OTA XML only</option>
          </select>
          <span className="ml-auto text-[12.5px] text-slate-500 tabular-nums">{shown.length} of {(rows || []).length}</span>
        </div>
        {error ? <div className="p-5"><ErrorNote text={error} /></div> : !rows ? (
          <div className="p-5 space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}</div>
        ) : shown.length === 0 ? (
          <div className="py-14 text-center"><p className="text-[14px] font-medium text-slate-800">No suppliers match</p><p className="text-[13px] text-slate-500 mt-1">Change the search or filters, or create a new supplier.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-[0.06em] text-slate-500 bg-slate-50/80">
                <th className="px-5 py-2.5 font-semibold">Supplier</th><th className="px-3 py-2.5 font-semibold">Package</th><th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold text-right">People</th><th className="px-3 py-2.5 font-semibold text-right">Channels</th>
                <th className="px-3 py-2.5 font-semibold text-right">Calls · 7d</th><th className="px-3 py-2.5 font-semibold">Last activity</th><th className="px-5 py-2.5 font-semibold">Created</th>
              </tr></thead>
              <tbody>
                {shown.map(s => (
                  <tr key={s.id} onClick={() => onOpen(s.id)} className="border-t border-slate-100 hover:bg-slate-50/80 cursor-pointer" data-testid={`supplier-row-${s.code}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Monogram name={s.name} plan={s.plan} />
                        <div className="min-w-0">
                          <button type="button" onClick={e => { e.stopPropagation(); onOpen(s.id); }} className="block font-medium text-slate-900 hover:text-teal-800 truncate text-left">{s.name}</button>
                          <p className="text-[12px] text-slate-500 truncate"><span className="font-mono">{s.code}</span>{s.slug ? <> · <span className="font-mono">/s/{s.slug}</span></> : s.owner && <> · {s.owner}</>}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><PlanPill plan={s.plan} /></td>
                    <td className="px-3 py-3"><StatusPill status={s.status} /></td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{num(s.users)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{s.plan === 'CRM' ? <span className="text-slate-300">—</span> : num(s.channels)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-900 font-medium">{s.plan === 'CRM' ? <span className="text-slate-300 font-normal">—</span> : num(s.brokerCalls7d)}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{when(s.lastActivity)}</td>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{date(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SuppliersPage;
