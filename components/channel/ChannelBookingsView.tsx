import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Aggregator } from '../../types';
import { fetchChannelBookings, fetchChannelStatement, ChannelBookingRow, ChannelStatement } from '../../firebase/api';
import { Panel, Badge, Button, StatGrid, EmptyState, Tabs, table } from '../ui/Crm';

const TONE: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'muted'> = {
  CONFIRMED: 'info', PENDING: 'warning', IN_PROGRESS: 'success', COMPLETED: 'muted', CANCELLED: 'danger', NO_SHOW: 'danger',
};
const LABEL: Record<string, string> = {
  CONFIRMED: 'Confirmed', PENDING: 'Pending', IN_PROGRESS: 'On rent', COMPLETED: 'Completed', CANCELLED: 'Cancelled', NO_SHOW: 'No-show',
};
const fmt = (s?: string) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const money = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

/** Monthly settlement: live bookings by pick-up month, commission on what was earned (fees for cancellations / no-shows). */
const StatementPanel: React.FC<{ aggregator: Aggregator }> = ({ aggregator }) => {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [st, setSt] = useState<ChannelStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSt(null); setError(null);
    fetchChannelStatement(aggregator.id, month).then(setSt).catch((e: any) => setError(e.message));
  }, [aggregator.id, month]);

  const csv = () => {
    if (!st) return;
    const head = ['Reservation', 'Broker reference', 'Customer', 'Group', 'Pick-up', 'Return', 'Status', 'Booking total', 'Fee', 'Commissionable', `Commission ${st.commissionPercent}%`, 'Net to us', 'Promotion'];
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head, ...st.rows.map(r => [r.reservationNumber, r.brokerReference, r.customerName, r.vehicleGroup, r.pickupAt.slice(0, 16).replace('T', ' '),
      r.returnAt.slice(0, 16).replace('T', ' '), r.status, r.total, r.fee, r.commissionable, r.commission, r.net, r.promoCode]),
      [], ['Totals', '', '', '', '', '', '', '', st.fees, st.gross, st.commission, st.net]].map(l => l.map(q).join(','));
    const url = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${aggregator.name.replace(/[^\w-]+/g, '_')}-statement-${month}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const print = () => {
    if (!st) return;
    const w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups to print the statement.'); return; }
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const title = `${esc(aggregator.name)} — commission statement ${esc(month)}`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
      body{font:12px/1.45 system-ui,sans-serif;color:#0f172a;margin:32px}h1{font-size:18px;margin:0}p{color:#64748b;margin:4px 0 16px}
      table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left}th{font-size:10px;text-transform:uppercase;color:#64748b}
      td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tfoot td{font-weight:700;border-top:2px solid #0f172a}</style></head><body>
      <h1>${title}</h1><p>Pick-ups in ${esc(month)} · ${st.bookings} completed or open, ${st.cancelled} cancelled, ${st.noShows} no-show · amounts in ${esc(st.currency)}</p>
      <table><thead><tr><th>Reservation</th><th>Broker ref</th><th>Customer</th><th>Group</th><th>Pick-up</th><th>Status</th><th class="n">Total</th><th class="n">Fee</th><th class="n">Commission</th><th class="n">Net</th></tr></thead><tbody>
      ${st.rows.map(r => `<tr><td>${esc(r.reservationNumber)}</td><td>${esc(r.brokerReference)}</td><td>${esc(r.customerName)}</td><td>${esc(r.vehicleGroup)}</td><td>${esc(r.pickupAt.slice(0, 10))}</td><td>${esc(r.status)}</td><td class="n">${money(r.total)}</td><td class="n">${money(r.fee)}</td><td class="n">${money(r.commission)}</td><td class="n">${money(r.net)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="6">Totals (commission ${st.commissionPercent}% of ${money(st.gross)})</td><td></td><td class="n">${money(st.fees)}</td><td class="n">${money(st.commission)}</td><td class="n">${money(st.net)}</td></tr></tfoot></table>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <Panel title="Commission statement" subtitle={`Live bookings by pick-up month. Commission ${aggregator.commissionPercent ?? 0}% (Overview tab) on bookings, and on the fee for cancellations and no-shows.`}
      actions={<div className="flex items-center gap-2">
        <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-xs" aria-label="Month" />
        <Button size="sm" onClick={csv} disabled={!st || !st.rows.length}>CSV</Button>
        <Button size="sm" onClick={print} disabled={!st || !st.rows.length}>Print</Button>
      </div>}>
      {error && <p className="px-4 py-3 text-xs text-rose-600">{error}</p>}
      {!st && !error ? <p className="px-4 py-8 text-center text-[13px] text-slate-500">Loading…</p> : st && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 border-b border-slate-100">
            {[['Commissionable', `${money(st.gross)} ${st.currency}`, `${st.bookings} booking${st.bookings === 1 ? '' : 's'}`],
              ['Cancellation & no-show fees', `${money(st.fees)} ${st.currency}`, `${st.cancelled} cancelled · ${st.noShows} no-show`],
              [`Commission (${st.commissionPercent}%)`, `${money(st.commission)} ${st.currency}`, 'owed to the broker'],
              ['Net to us', `${money(st.net)} ${st.currency}`, 'after commission']].map(([l, v, sub]) => (
              <div key={l} className="px-4 py-3 border-r last:border-r-0 border-slate-100">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{l}</p>
                <p className="text-[15px] font-semibold tabular-nums text-slate-900">{v}</p>
                <p className="text-[11px] text-slate-400">{sub}</p>
              </div>
            ))}
          </div>
          {st.rows.length ? (
            <div className="overflow-x-auto">
              <table className={`${table.wrap} min-w-[760px]`}>
                <thead className={table.head}><tr>{['Reservation', 'Pick-up', 'Status', 'Total', 'Fee', 'Commission', 'Net'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
                <tbody className={table.body}>
                  {st.rows.map(r => (
                    <tr key={r.reservationNumber} className={table.row}>
                      <td className={table.td}><p className="font-mono text-xs font-semibold text-slate-900">{r.reservationNumber}</p>
                        <p className="text-[11px] text-slate-500">{r.customerName || '—'}{r.promoCode ? ` · ${r.promoCode}` : ''}</p></td>
                      <td className={`${table.td} text-xs tabular-nums whitespace-nowrap`}>{day(r.pickupAt)} · <span className="font-mono">{r.vehicleGroup}</span></td>
                      <td className={table.td}><Badge tone={TONE[r.status] || 'muted'}>{LABEL[r.status] || r.status}</Badge></td>
                      {[r.total, r.fee, r.commission, r.net].map((v, i) => <td key={i} className={`${table.td} text-right tabular-nums ${i === 0 && r.commissionable !== r.total ? 'text-slate-400 line-through' : ''}`}>{money(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No pick-ups this month" hint="Choose another month." />}
        </>
      )}
    </Panel>
  );
};

type Diff = { kind: 'missing_broker' | 'missing_ours' | 'status' | 'amount'; ref: string; ours?: string; theirs?: string };
const DIFF_LABEL: Record<Diff['kind'], string> = {
  missing_broker: 'Not in the broker\'s list', missing_ours: 'Not in our system', status: 'Status differs', amount: 'Amount differs',
};

/** Splits one CSV line (comma or semicolon, quoted fields). */
const cells = (line: string, sep: string) => {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
};
const normStatus = (s: string) => {
  const t = s.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (/CANCEL/.test(t)) return 'CANCELLED';
  if (/NO_?SHOW/.test(t)) return 'NO_SHOW';
  if (/COMPLET|CLOSED|RETURN|FINISH/.test(t)) return 'COMPLETED';
  if (/PICK|ON_?RENT|IN_PROGRESS|STARTED/.test(t)) return 'IN_PROGRESS';
  if (/CONFIRM|BOOKED|RESERVED|ACTIVE|OK/.test(t)) return 'CONFIRMED';
  return t;
};

/**
 * Finds differences between the broker's own booking list (CSV export from its extranet) and ours:
 * bookings one side does not have, a different status, or a different amount. Nothing is changed
 * automatically; each line says what to check.
 */
const ReconcilePanel: React.FC<{ aggregator: Aggregator; rows: ChannelBookingRow[] }> = ({ aggregator, rows }) => {
  const [diffs, setDiffs] = useState<Diff[] | null>(null);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async (file: File) => {
    setError(null); setDiffs(null);
    const text = (await file.text()).replace(/^\ufeff/, '');
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { setError('The file has no bookings.'); return; }
    const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
    const head = cells(lines[0], sep).map(h => h.toLowerCase());
    const col = (re: RegExp) => head.findIndex(h => re.test(h));
    const refCol = col(/broker|their|partner|voucher|booking.?(ref|id|no|number)|reference/);
    const ourCol = col(/supplier|rsv|our|confirmation|reservation.?(no|number|id)/);
    const statusCol = col(/status|state/);
    const amountCol = col(/total|amount|price|value/);
    if (refCol < 0 && ourCol < 0) { setError('No reference column found. Use a header such as "Broker reference" or "Reservation number".'); return; }
    const live = rows.filter(r => !r.sandbox);
    const byRef = new Map(live.filter(r => r.brokerReference).map(r => [r.brokerReference!.toUpperCase(), r]));
    const byNum = new Map(live.map(r => [r.reservationNumber.toUpperCase(), r]));
    const seen = new Set<string>();
    const out: Diff[] = [];
    lines.slice(1).forEach(l => {
      const c = cells(l, sep);
      const ref = (refCol >= 0 ? c[refCol] : '') || '';
      const num = (ourCol >= 0 ? c[ourCol] : '') || '';
      const ours = byNum.get(num.toUpperCase()) || byRef.get(ref.toUpperCase());
      const label = ref || num;
      if (!label) return;
      if (!ours) { out.push({ kind: 'missing_ours', ref: label, theirs: statusCol >= 0 ? c[statusCol] : undefined }); return; }
      seen.add(ours.reservationNumber);
      if (statusCol >= 0 && c[statusCol] && normStatus(c[statusCol]) !== ours.status) {
        out.push({ kind: 'status', ref: `${ours.reservationNumber} / ${ours.brokerReference || '—'}`, ours: LABEL[ours.status] || ours.status, theirs: c[statusCol] });
      }
      const amt = amountCol >= 0 ? parseFloat((c[amountCol] || '').replace(/[^\d.,-]/g, '').replace(',', '.')) : NaN;
      if (Number.isFinite(amt) && Math.abs(amt - (ours.total || 0)) > 0.01) {
        out.push({ kind: 'amount', ref: `${ours.reservationNumber} / ${ours.brokerReference || '—'}`, ours: `${money(ours.total || 0)} ${ours.currency}`, theirs: money(amt) });
      }
    });
    live.filter(r => !seen.has(r.reservationNumber)).forEach(r => out.push({ kind: 'missing_broker', ref: `${r.reservationNumber} / ${r.brokerReference || '—'}`, ours: LABEL[r.status] || r.status }));
    setSummary(`${lines.length - 1} line(s) in ${file.name} compared with ${live.length} live booking(s).`);
    setDiffs(out);
  };

  return (
    <Panel title="Reconciliation" subtitle={`Compare ${aggregator.name}'s own booking list (CSV from its extranet) with ours, to find bookings or updates one side missed.`}
      actions={<label className="inline-flex items-center h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-50">
        Upload broker CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ''; }} />
      </label>}>
      {error && <p className="px-4 py-3 text-xs text-rose-600">{error}</p>}
      {!diffs && !error && <p className="px-4 py-4 text-[13px] text-slate-500">The file needs a reference column (broker reference or our reservation number); status and total columns are compared when present.</p>}
      {diffs && (
        <>
          <p className="px-4 pt-3 text-xs text-slate-500">{summary}</p>
          {diffs.length === 0 ? <p className="px-4 py-4 text-[13px] text-emerald-700 font-medium">Both lists match.</p> : (
            <div className="overflow-x-auto">
              <table className={`${table.wrap} min-w-[640px]`}>
                <thead className={table.head}><tr>{['Difference', 'Booking', 'Ours', 'Broker'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
                <tbody className={table.body}>
                  {diffs.map((d, i) => (
                    <tr key={i} className={table.row}>
                      <td className={table.td}><Badge tone={d.kind === 'status' || d.kind === 'amount' ? 'warning' : 'danger'}>{DIFF_LABEL[d.kind]}</Badge></td>
                      <td className={`${table.td} font-mono text-xs`}>{d.ref}</td>
                      <td className={`${table.td} text-xs`}>{d.ours || '—'}</td>
                      <td className={`${table.td} text-xs`}>{d.theirs || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
};

/** Every booking this broker made through the API, with both references. */
const ChannelBookingsView: React.FC<{ aggregator: Aggregator }> = ({ aggregator }) => {
  const [rows, setRows] = useState<ChannelBookingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'live' | 'sandbox'>('live');
  const load = useCallback(() => {
    setError(null);
    fetchChannelBookings(aggregator.id).then(setRows).catch(() => { setRows([]); setError('Could not load bookings from the server.'); });
  }, [aggregator.id]);
  useEffect(() => { load(); }, [load]);

  const live = (rows || []).filter(r => !r.sandbox);
  const sandbox = (rows || []).filter(r => r.sandbox);
  const shown = view === 'live' ? live : sandbox;
  const stats = useMemo(() => {
    const revenue = live.filter(r => r.status !== 'CANCELLED').reduce((s, r) => s + (r.total || 0), 0);
    const cancelled = live.filter(r => r.status === 'CANCELLED').length;
    return [
      { label: 'Bookings', value: live.length, sub: 'through the API' },
      { label: 'Booked value', value: `${revenue.toLocaleString('en-GB', { maximumFractionDigits: 0 })} ${aggregator.currency || 'USD'}`, sub: 'excluding cancelled' },
      { label: 'Cancellation rate', value: live.length ? `${Math.round((cancelled / live.length) * 100)}%` : '—', sub: `${cancelled} cancelled`, tone: cancelled ? 'warning' as const : 'default' as const },
      { label: 'Sandbox bookings', value: sandbox.length, sub: 'tests, not real', tone: 'muted' as const },
    ];
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <StatGrid items={stats} />
      <Panel title="Broker bookings" subtitle="Each one is also in Reservations under its pick-up month (search by the broker reference)."
        actions={<Button size="sm" onClick={load}>Refresh</Button>}>
        <Tabs value={view} onChange={k => setView(k as typeof view)} tabs={[{ key: 'live', label: 'Live', count: live.length }, { key: 'sandbox', label: 'Sandbox', count: sandbox.length }]} />
        {error && <p className="px-4 py-3 text-xs text-rose-600">{error}</p>}
        {rows === null ? <p className="px-4 py-10 text-center text-[13px] text-slate-500">Loading…</p> : shown.length === 0 ? (
          <EmptyState title={view === 'live' ? 'No bookings yet' : 'No sandbox bookings'} hint={view === 'live' ? 'Bookings appear here as soon as the broker books through the API.' : 'Certification runs and bookings made while testing appear here.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className={`${table.wrap} min-w-[760px]`}>
              <thead className={table.head}><tr>{['Reservation', 'Customer', 'Group', 'Rental', 'Total', 'Status'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
              <tbody className={table.body}>
                {shown.map(r => (
                  <tr key={r.reservationNumber} className={table.row}>
                    <td className={`${table.td} whitespace-nowrap`}>
                      <p className="font-mono text-xs font-semibold text-slate-900">{r.reservationNumber}</p>
                      <p className="font-mono text-[11px] text-slate-500">{r.brokerReference || '—'}</p>
                    </td>
                    <td className={table.td}>
                      <p className="text-slate-900">{r.customerName || '—'}</p>
                      <p className="text-[11px] text-slate-400">Booked {fmt(r.createdAt)}</p>
                    </td>
                    <td className={`${table.td} font-mono text-xs`}>{r.vehicleGroup}</td>
                    <td className={`${table.td} whitespace-nowrap tabular-nums text-xs`}>
                      <p className="text-slate-800">{fmt(r.pickupAt)}</p>
                      <p className="text-slate-500">→ {fmt(r.returnAt)}</p>
                    </td>
                    <td className={`${table.td} text-right tabular-nums whitespace-nowrap`}>{(r.total ?? 0).toFixed(2)} {r.currency}</td>
                    <td className={table.td}><Badge tone={TONE[r.status] || 'muted'}>{LABEL[r.status] || r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <ReconcilePanel aggregator={aggregator} rows={rows || []} />
      <StatementPanel aggregator={aggregator} />
    </div>
  );
};

export default ChannelBookingsView;
