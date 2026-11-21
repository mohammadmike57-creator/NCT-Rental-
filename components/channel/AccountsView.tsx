import React, { useMemo, useState } from 'react';
import { Aggregator, BrokerAccounting, BrokerInvoice, BrokerPayment, CompanyDetails } from '../../types';
import { fetchChannelStatement } from '../../services/api';
import { Badge, Button, Dialog, EmptyState, Field, Panel, inputCls, selectCls, table } from '../ui/Crm';
import { PlusIcon, TrashIcon } from '../icons';

/**
 * Money with one broker: an invoice per month made from the commission statement, the payments received or made,
 * and the balance (who owes whom, what is overdue). Who pays whom follows the settlement agreed with the broker:
 * when the broker collects the rental money it owes us the net; when customers pay us, we owe the broker its
 * commission.
 */

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const fmt = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const lastMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Who pays whom: set on this page, else read from Connection → Settlement (counter = customers pay us). */
export const directionOf = (a: Aggregator): 'broker_pays' | 'we_pay' =>
  a.accounting?.direction || (a.connectionProfile?.settlement === 'COUNTER' ? 'we_pay' : a.connectionProfile?.settlement ? 'broker_pays' : 'we_pay');

/** Paid so far against each invoice, and the state of each. */
export function invoiceStates(acc: BrokerAccounting, on: string = today()) {
  return acc.invoices.map(inv => {
    const paid = acc.payments.filter(p => p.invoiceId === inv.id).reduce((t, p) => t + p.amount, 0);
    const open = Math.round((inv.amount - paid) * 100) / 100;
    const state = open <= 0.004 ? 'paid' : inv.dueDate < on ? 'overdue' : paid > 0 ? 'part' : 'open';
    return { inv, paid, open: Math.max(0, open), state: state as 'paid' | 'overdue' | 'part' | 'open' };
  });
}

const STATE: Record<string, { label: string; tone: 'success' | 'danger' | 'warning' | 'info' }> = {
  paid: { label: 'Paid', tone: 'success' }, overdue: { label: 'Overdue', tone: 'danger' }, part: { label: 'Part paid', tone: 'warning' }, open: { label: 'Open', tone: 'info' },
};

const AccountsView: React.FC<{ aggregator: Aggregator; onUpdate: (a: Aggregator) => void; company?: CompanyDetails; currentUserName?: string; notify: (m: string) => void }> = ({
  aggregator, onUpdate, company, currentUserName, notify,
}) => {
  const acc: BrokerAccounting = useMemo(() => aggregator.accounting || { invoices: [], payments: [] }, [aggregator.accounting]);
  const dir = directionOf(aggregator);
  const terms = acc.termsDays ?? 30;
  const states = useMemo(() => invoiceStates(acc), [acc]);
  const save = (next: BrokerAccounting) => onUpdate({ ...aggregator, accounting: next });

  // Balance per currency: invoiced minus paid.
  const balance = useMemo(() => {
    const m: Record<string, { open: number; overdue: number }> = {};
    states.forEach(s => { const c = s.inv.currency; m[c] = m[c] || { open: 0, overdue: 0 }; m[c].open += s.open; if (s.state === 'overdue') m[c].overdue += s.open; });
    const unlinked = acc.payments.filter(p => !p.invoiceId);
    unlinked.forEach(p => { m[p.currency] = m[p.currency] || { open: 0, overdue: 0 }; m[p.currency].open -= p.amount; });
    return m;
  }, [states, acc.payments]);
  const year = String(new Date().getFullYear());
  const invoicedYear = acc.invoices.filter(i => i.month.startsWith(year)).reduce((t, i) => t + i.amount, 0);
  const paidYear = acc.payments.filter(p => p.date.startsWith(year)).reduce((t, p) => t + p.amount, 0);
  const cur = acc.invoices[0]?.currency || aggregator.currency || 'USD';

  // ---- create an invoice from a month's statement
  const [making, setMaking] = useState(false);
  const [month, setMonth] = useState(lastMonth());
  const [busy, setBusy] = useState(false);
  const [settleUsd, setSettleUsd] = useState(false);
  const makeInvoice = async () => {
    if (acc.invoices.some(i => i.month === month)) { notify(`${monthName(month)} is already invoiced for ${aggregator.name}.`); return; }
    setBusy(true);
    try {
      const st = await fetchChannelStatement(aggregator.id, month, settleUsd ? 'USD' : undefined);
      const amount = Math.round((dir === 'broker_pays' ? st.net : st.commission) * 100) / 100;
      if (!st.rows.length || amount <= 0) { notify(`No billable bookings for ${aggregator.name} in ${monthName(month)}: nothing to invoice.`); return; }
      const inv: BrokerInvoice = {
        id: `inv-${Date.now()}`, number: `${(aggregator.channelCode || 'BRK').toUpperCase()}-${month.replace('-', '')}`, month,
        issuedAt: today(), dueDate: addDays(today(), terms), direction: dir, amount, currency: st.currency, bookings: st.rows.length, createdBy: currentUserName,
      };
      save({ ...acc, invoices: [inv, ...acc.invoices].sort((a, b) => b.month.localeCompare(a.month)) });
      setMaking(false);
      notify(`Invoice ${inv.number} created: ${fmt(amount)} ${inv.currency} for ${st.rows.length} booking${st.rows.length === 1 ? '' : 's'}.`);
    } catch (e: any) {
      notify(`Could not read the ${monthName(month)} statement: ${e?.message || 'server not reachable'}.`);
    } finally { setBusy(false); }
  };

  // ---- record a payment
  const [paying, setPaying] = useState<{ invoiceId?: string } | null>(null);
  const [pay, setPay] = useState<{ date: string; amount: string; reference: string; note: string; currency: string }>({ date: today(), amount: '', reference: '', note: '', currency: cur });
  const openPay = (invoiceId?: string) => {
    const s = states.find(x => x.inv.id === invoiceId);
    setPay({ date: today(), amount: s ? String(s.open) : '', reference: '', note: '', currency: s?.inv.currency || cur });
    setPaying({ invoiceId });
  };
  const savePayment = () => {
    const amount = Number(pay.amount);
    if (!(amount > 0)) return;
    const p: BrokerPayment = { id: `pay-${Date.now()}`, date: pay.date, amount, currency: pay.currency, invoiceId: paying?.invoiceId, reference: pay.reference.trim() || undefined, note: pay.note.trim() || undefined, by: currentUserName };
    save({ ...acc, payments: [p, ...acc.payments].sort((a, b) => b.date.localeCompare(a.date)) });
    setPaying(null);
    notify(`Payment of ${fmt(amount)} ${p.currency} recorded${p.invoiceId ? ` against ${acc.invoices.find(i => i.id === p.invoiceId)?.number}` : ''}.`);
  };

  const removeInvoice = (inv: BrokerInvoice) => {
    if (!window.confirm(`Delete invoice ${inv.number}? Payments recorded against it stay, without an invoice.`)) return;
    save({ ...acc, invoices: acc.invoices.filter(i => i.id !== inv.id), payments: acc.payments.map(p => (p.invoiceId === inv.id ? { ...p, invoiceId: undefined } : p)) });
  };
  const removePayment = (p: BrokerPayment) => {
    if (!window.confirm(`Delete the payment of ${fmt(p.amount)} ${p.currency} on ${day(p.date)}?`)) return;
    save({ ...acc, payments: acc.payments.filter(x => x.id !== p.id) });
  };

  const print = (inv: BrokerInvoice) => {
    const w = window.open('', '_blank');
    if (!w) { window.alert('Allow pop-ups to print the invoice.'); return; }
    const supplier = aggregator.vendorName && !/nct/i.test(aggregator.vendorName) ? aggregator.vendorName : company?.name && !/nct/i.test(company.name) ? company.name : 'UR-Drive Jordan';
    const s = states.find(x => x.inv.id === inv.id);
    const from = inv.direction === 'broker_pays' ? supplier : aggregator.name;
    const to = inv.direction === 'broker_pays' ? aggregator.name : supplier;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.number)}</title><style>
      body{font:13px/1.5 system-ui,sans-serif;color:#0f172a;margin:48px;max-width:760px}h1{font-size:22px;margin:0 0 4px}.muted{color:#64748b}
      .row{display:flex;justify-content:space-between;gap:24px;margin:24px 0}table{border-collapse:collapse;width:100%;margin-top:16px}
      th,td{border-bottom:1px solid #e2e8f0;padding:10px 8px;text-align:left}th{font-size:11px;text-transform:uppercase;color:#64748b}td.n,th.n{text-align:right}
      .total td{font-weight:700;font-size:15px;border-top:2px solid #0f172a;border-bottom:0}</style></head><body>
      <h1>${inv.direction === 'broker_pays' ? 'Invoice' : 'Commission statement'} ${esc(inv.number)}</h1>
      <p class="muted">Issued ${esc(day(inv.issuedAt))} · due ${esc(day(inv.dueDate))}</p>
      <div class="row"><div><b>From</b><br>${esc(from)}</div><div><b>To</b><br>${esc(to)}</div></div>
      <table><thead><tr><th>Description</th><th class="n">Bookings</th><th class="n">Amount</th></tr></thead><tbody>
      <tr><td>${inv.direction === 'broker_pays' ? 'Net rental revenue collected by the broker' : 'Broker commission'} for pick-ups in ${esc(monthName(inv.month))}</td><td class="n">${inv.bookings}</td><td class="n">${fmt(inv.amount)} ${esc(inv.currency)}</td></tr>
      ${s && s.paid > 0 ? `<tr><td>Paid so far</td><td></td><td class="n">−${fmt(s.paid)} ${esc(inv.currency)}</td></tr>` : ''}
      <tr class="total"><td>Amount due</td><td></td><td class="n">${fmt(s ? s.open : inv.amount)} ${esc(inv.currency)}</td></tr></tbody></table>
      <p class="muted" style="margin-top:32px">Booking by booking details are in the commission statement for ${esc(monthName(inv.month))}.</p>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  const owedText = dir === 'broker_pays' ? `${aggregator.name} owes us` : `We owe ${aggregator.name}`;
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: 'Balance', v: Object.entries(balance).filter(([, x]) => Math.abs(x.open) > 0.004).map(([c, x]) => `${fmt(x.open)} ${c}`).join(' · ') || `0.00 ${cur}`, sub: owedText, tone: 'text-slate-900' },
          { l: 'Overdue', v: Object.entries(balance).filter(([, x]) => x.overdue > 0.004).map(([c, x]) => `${fmt(x.overdue)} ${c}`).join(' · ') || 'Nothing', sub: `past the ${terms}-day terms`, tone: Object.values(balance).some(x => x.overdue > 0.004) ? 'text-rose-600' : 'text-emerald-700' },
          { l: `Invoiced ${year}`, v: `${fmt(invoicedYear)} ${cur}`, sub: `${acc.invoices.filter(i => i.month.startsWith(year)).length} invoice(s)`, tone: 'text-slate-900' },
          { l: `${dir === 'broker_pays' ? 'Received' : 'Paid'} ${year}`, v: `${fmt(paidYear)} ${cur}`, sub: `${acc.payments.filter(p => p.date.startsWith(year)).length} payment(s)`, tone: 'text-slate-900' },
        ].map((k, i) => (
          <div key={k.l} className="ota-pop rounded-2xl bg-white border border-slate-200/80 px-4 py-3" style={{ animationDelay: `${i * 60}ms` }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{k.l}</p>
            <p className={`mt-1 text-[18px] font-semibold tabular-nums ${k.tone}`}>{k.v}</p>
            <p className="text-[11.5px] text-slate-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Terms */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
        <span className="text-slate-500">Who collects the rental money</span>
        <select className={`${selectCls} !h-8 !w-auto`} value={dir} onChange={e => save({ ...acc, direction: e.target.value as 'broker_pays' | 'we_pay' })} aria-label="Who collects the rental money">
          <option value="we_pay">Customers pay us (we owe the broker its commission)</option>
          <option value="broker_pays">The broker collects (it owes us the net)</option>
        </select>
        <span className="text-slate-500 ml-auto">Payment terms</span>
        <input type="number" min={0} className={`${inputCls} !h-8 !w-20 text-right`} value={terms} onChange={e => save({ ...acc, termsDays: Math.max(0, Number(e.target.value) || 0) })} aria-label="Payment terms in days" />
        <span className="text-slate-500">days</span>
      </div>

      {/* Invoices */}
      <Panel title="Invoices" subtitle={dir === 'broker_pays' ? 'One per month: the net of the broker\'s bookings, after its commission.' : 'One per month: the commission we owe the broker on its bookings.'}
        actions={<Button size="sm" variant="primary" icon={<PlusIcon className="w-4 h-4" />} onClick={() => setMaking(true)}>Invoice a month</Button>}>
        {acc.invoices.length === 0 ? (
          <EmptyState title="No invoices yet" hint="Invoice a month: the amount comes from that month's commission statement." />
        ) : (
          <div className="overflow-x-auto">
            <table className={`${table.wrap} min-w-[760px]`}>
              <thead className={table.head}><tr>{['Invoice', 'Month', 'Issued', 'Due', 'Amount', 'Paid', 'Open', 'State', ''].map(h => <th key={h} className={`${table.th} ${['Amount', 'Paid', 'Open'].includes(h) ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody className={table.body}>
                {states.map(({ inv, paid, open, state }) => (
                  <tr key={inv.id} className={table.row}>
                    <td className={`${table.td} font-mono text-xs font-semibold text-slate-900`}>{inv.number}</td>
                    <td className={table.td}>{monthName(inv.month)}<p className="text-[11px] text-slate-400">{inv.bookings} booking{inv.bookings === 1 ? '' : 's'}</p></td>
                    <td className={`${table.td} whitespace-nowrap`}>{day(inv.issuedAt)}</td>
                    <td className={`${table.td} whitespace-nowrap ${state === 'overdue' ? 'text-rose-600 font-semibold' : ''}`}>{day(inv.dueDate)}</td>
                    <td className={`${table.td} text-right tabular-nums whitespace-nowrap`}>{fmt(inv.amount)} {inv.currency}</td>
                    <td className={`${table.td} text-right tabular-nums whitespace-nowrap text-slate-500`}>{fmt(paid)}</td>
                    <td className={`${table.td} text-right tabular-nums whitespace-nowrap font-semibold`}>{fmt(open)}</td>
                    <td className={table.td}><Badge tone={STATE[state].tone}>{STATE[state].label}</Badge></td>
                    <td className={`${table.td} text-right whitespace-nowrap`}>
                      {state !== 'paid' && <Button size="sm" onClick={() => openPay(inv.id)}>Record payment</Button>}
                      <Button size="sm" variant="ghost" onClick={() => print(inv)}>Print</Button>
                      <button type="button" onClick={() => removeInvoice(inv)} className="ml-1 w-7 h-7 inline-flex items-center justify-center rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50" aria-label={`Delete invoice ${inv.number}`}><TrashIcon className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Payments */}
      <Panel title="Payments" subtitle={dir === 'broker_pays' ? 'Money received from the broker.' : 'Money paid to the broker.'}
        actions={<Button size="sm" icon={<PlusIcon className="w-4 h-4" />} onClick={() => openPay()}>Add payment</Button>}>
        {acc.payments.length === 0 ? <EmptyState title="No payments yet" hint="Record a payment against an invoice, or on its own." /> : (
          <div className="overflow-x-auto">
            <table className={`${table.wrap} min-w-[640px]`}>
              <thead className={table.head}><tr>{['Date', 'Amount', 'For invoice', 'Reference', 'Recorded by', ''].map(h => <th key={h} className={`${table.th} ${h === 'Amount' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody className={table.body}>
                {acc.payments.map(p => (
                  <tr key={p.id} className={table.row}>
                    <td className={`${table.td} whitespace-nowrap`}>{day(p.date)}</td>
                    <td className={`${table.td} text-right tabular-nums font-semibold whitespace-nowrap`}>{fmt(p.amount)} {p.currency}</td>
                    <td className={`${table.td} font-mono text-xs`}>{acc.invoices.find(i => i.id === p.invoiceId)?.number || <span className="font-sans text-slate-400">On account</span>}</td>
                    <td className={table.td}>{p.reference || '—'}{p.note && <p className="text-[11px] text-slate-400">{p.note}</p>}</td>
                    <td className={`${table.td} text-slate-500`}>{p.by || '—'}</td>
                    <td className={`${table.td} text-right`}><button type="button" onClick={() => removePayment(p)} className="w-7 h-7 inline-flex items-center justify-center rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50" aria-label="Delete payment"><TrashIcon className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog open={making} onClose={() => setMaking(false)} size="md" title={`Invoice a month · ${aggregator.name}`}
        subtitle={dir === 'broker_pays' ? 'The amount is the net of the month\'s bookings after the broker\'s commission.' : 'The amount is the commission on the month\'s bookings.'}
        footer={<><Button variant="ghost" onClick={() => setMaking(false)}>Cancel</Button><Button variant="primary" onClick={makeInvoice} disabled={busy}>{busy ? 'Reading the statement…' : 'Create invoice'}</Button></>}>
        <div className="space-y-3">
          <Field label="Month (pick-ups in)"><input type="month" className={inputCls} value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></Field>
          {(aggregator.currency || 'USD') !== 'USD' && (
            <label className="flex items-center gap-2 text-[13px] text-slate-700"><input type="checkbox" checked={settleUsd} onChange={e => setSettleUsd(e.target.checked)} />Invoice in USD (converted at the fixed rate)</label>
          )}
          <p className="text-[12px] text-slate-500">Due {terms} days after today. Invoice number {(aggregator.channelCode || 'BRK').toUpperCase()}-{month.replace('-', '')}.</p>
        </div>
      </Dialog>

      <Dialog open={!!paying} onClose={() => setPaying(null)} size="md" title={dir === 'broker_pays' ? 'Payment received' : 'Payment made'}
        subtitle={paying?.invoiceId ? `Against ${acc.invoices.find(i => i.id === paying.invoiceId)?.number}` : 'On account (not tied to one invoice)'}
        footer={<><Button variant="ghost" onClick={() => setPaying(null)}>Cancel</Button><Button variant="primary" onClick={savePayment} disabled={!(Number(pay.amount) > 0)}>Save payment</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input type="date" className={inputCls} value={pay.date} onChange={e => setPay(p => ({ ...p, date: e.target.value }))} /></Field>
          <Field label={`Amount (${pay.currency})`}><input type="number" min={0} step="0.01" className={`${inputCls} text-right`} value={pay.amount} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} autoFocus /></Field>
          <Field label="Reference"><input className={inputCls} value={pay.reference} onChange={e => setPay(p => ({ ...p, reference: e.target.value }))} placeholder="Bank transfer number" /></Field>
          <Field label="Note"><input className={inputCls} value={pay.note} onChange={e => setPay(p => ({ ...p, note: e.target.value }))} placeholder="Optional" /></Field>
        </div>
      </Dialog>
    </div>
  );
};

export default AccountsView;
