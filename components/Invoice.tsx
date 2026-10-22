import { isPrepaid as bookingIsPrepaid } from '../services/paymentType';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppData, Aggregator, CompanyDetails, InvoiceData, InvoiceLine, PaymentType, RentalSource, Reservation, ReservationStatus, YearData } from '../types';
import { MONTHS, URDRIVE_LOGO_B64 } from '../constants';
import { sendCustomerEmail, recordActivity } from '../firebase/api';
import { downloadPdf, htmlToPdfBase64 } from '../services/agreementPdf';
import { printHtml } from '../services/printDocs';
import {
  TERMS_DAYS, TERMS_LABEL, amountInWords, billableAmount, buildInvoiceHtml, invoiceState, InvoiceState, linesOf, money, priceLine, rentalDays,
} from '../services/invoiceDoc';
import { Page, PageHeader, StatGrid, Panel, Toolbar, Tabs, Segmented, Badge, Button, Field, EmptyState, inputCls, selectCls, textareaCls, table } from './ui/Crm';

interface InvoiceProps {
  yearData: YearData;
  allData?: AppData;
  year: number;
  month: string;
  companyDetails: CompanyDetails;
  sources: RentalSource[];
  aggregators?: Aggregator[];
  invoices: InvoiceData[];
  currentUserName?: string;
  onSaveInvoice: (invoice: InvoiceData) => void;
  onUpdateInvoice?: (invoice: InvoiceData) => void;
}

const STATE_META: Record<InvoiceState, { label: string; cls: string; dot: string }> = {
  unpaid: { label: 'Unpaid', cls: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  overdue: { label: 'Overdue', cls: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
  paid: { label: 'Paid', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  void: { label: 'Void', cls: 'bg-slate-100 text-slate-500 ring-slate-200', dot: 'bg-slate-400' },
};

const PAY_KEY = 'nct.invoice.paymentInstructions';
const readPref = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const writePref = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDay = (s?: string) => (s ? new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/** Shows a printable HTML document as a scaled A4 page. */
const DocPreview: React.FC<{ html: string; className?: string }> = ({ html, className }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.6);
  const [height, setHeight] = useState(1123);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / 794)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const measure = () => {
    const d = frame.current?.contentDocument;
    if (d?.body) setHeight(Math.max(1123, d.body.scrollHeight + 24));
  };
  return (
    <div ref={wrap} className={`w-full ${className || ''}`}>
      <div style={{ height: height * scale }} className="relative overflow-hidden rounded-lg shadow-[0_8px_30px_rgba(15,23,42,0.12)] ring-1 ring-slate-200 bg-white">
        <iframe ref={frame} title="Invoice preview" srcDoc={html} onLoad={measure}
          style={{ width: 794, height, transform: `scale(${scale})`, transformOrigin: 'top left', border: 0 }} className="absolute top-0 left-0 bg-white" />
      </div>
    </div>
  );
};

const Invoice: React.FC<InvoiceProps> = ({ yearData, allData, year, month, companyDetails, sources, aggregators = [], invoices, currentUserName, onSaveInvoice, onUpdateInvoice }) => {
  const [tab, setTab] = useState<'new' | 'history'>('new');
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 3500); };

  // ----- data ---------------------------------------------------------------
  // Partners that send prepaid bookings (prepaid-only, or both ways — then only their prepaid bookings are billed).
  const prepaidSources = useMemo(() => sources.filter(s => s.paymentType === PaymentType.PREPAID || s.paymentType === PaymentType.BOTH), [sources]);
  const allReservations: Reservation[] = useMemo(() => {
    const src = allData ? Object.values(allData).flatMap(y => Object.values(y as YearData).flat()) : Object.values(yearData || {}).flat();
    return src as Reservation[];
  }, [allData, yearData]);
  const invoicedBy = useMemo(() => {
    const map = new Map<string, string>();
    invoices.filter(i => i.status !== 'void').forEach(inv => linesOf(inv).forEach(l => map.set(l.reservationId, inv.invoiceNumber)));
    return map;
  }, [invoices]);

  // ----- form ---------------------------------------------------------------
  const monthRange = (y: number, mIdx: number) => [iso(new Date(y, mIdx, 1)), iso(new Date(y, mIdx + 1, 0))] as const;
  const [sourceId, setSourceId] = useState<string>(prepaidSources[0]?.id || '');
  const [[startDate, endDate], setRange] = useState<readonly [string, string]>(() => monthRange(year, Math.max(0, MONTHS.indexOf(month))));
  useEffect(() => { setRange(monthRange(year, Math.max(0, MONTHS.indexOf(month)))); }, [year, month]);
  useEffect(() => { if (!prepaidSources.some(s => s.id === sourceId)) setSourceId(prepaidSources[0]?.id || ''); }, [prepaidSources, sourceId]);

  const source = prepaidSources.find(s => s.id === sourceId);
  const partner = aggregators.find(a => source && a.name.toLowerCase() === source.name.toLowerCase());
  const [billTo, setBillTo] = useState({ name: '', email: '', address: '', taxNumber: '' });
  useEffect(() => { setBillTo({ name: source?.name || '', email: partner?.contactEmail || '', address: '', taxNumber: '' }); }, [sourceId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [terms, setTerms] = useState<NonNullable<InvoiceData['terms']>>('net30');
  const [currency, setCurrency] = useState<NonNullable<InvoiceData['currency']>>('USD');
  const [taxMode, setTaxMode] = useState<NonNullable<InvoiceData['taxMode']>>('included');
  const [taxPct, setTaxPct] = useState(16);
  const [poNumber, setPoNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [payInstr, setPayInstr] = useState(() => readPref(PAY_KEY));
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const candidates = useMemo(() => {
    if (!source || !startDate || !endDate) return [];
    return allReservations
      .filter(r => r.source === source.name && bookingIsPrepaid(r, sources) && r.status !== ReservationStatus.CANCELLED && (r.status as string) !== 'NO_SHOW'
        && (r.startDate || '').slice(0, 10) >= startDate && (r.startDate || '').slice(0, 10) <= endDate && billableAmount(r) > 0)
      .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  }, [allReservations, source, sources, startDate, endDate]);

  // Bookings already on another invoice start unticked, so nothing is billed twice by accident.
  useEffect(() => { setExcluded(new Set(candidates.filter(r => invoicedBy.has(r.id)).map(r => r.id))); }, [candidates, invoicedBy]);

  const rate = taxMode === 'none' ? 0 : taxPct / 100;
  const lines: InvoiceLine[] = useMemo(() => candidates.filter(r => !excluded.has(r.id)).map(r => {
    const p = priceLine(billableAmount(r), rate, taxMode);
    return { reservationId: r.id, bookingId: r.bookingId, renter: r.personName, source: r.source, carModel: r.carModel, startDate: r.startDate, endDate: r.endDate, days: rentalDays(r.startDate, r.endDate), ...p };
  }), [candidates, excluded, rate, taxMode]);

  const totals = useMemo(() => {
    const r2 = (n: number) => Math.round(n * 1000) / 1000;
    const sub = r2(lines.reduce((s, l) => s + l.subtotal, 0));
    const tax = r2(lines.reduce((s, l) => s + l.tax, 0));
    return { sub, tax, total: r2(sub + tax) };
  }, [lines]);

  const nextNumber = useMemo(() => {
    const issueYear = new Date().getFullYear();
    const prefix = `INV-${issueYear}-`;
    const used = invoices.map(i => i.invoiceNumber).filter(n => (n || '').startsWith(prefix)).map(n => parseInt(n.slice(prefix.length)) || 0);
    return `${prefix}${String((used.length ? Math.max(...used) : 0) + 1).padStart(4, '0')}`;
  }, [invoices]);

  const dueDate = useMemo(() => iso(new Date(Date.now() + TERMS_DAYS[terms] * 86400000)), [terms]);
  const draft: InvoiceData = {
    id: 'draft', invoiceNumber: nextNumber, issueDate: new Date().toLocaleDateString('en-GB'), generatedAt: new Date().toISOString(),
    billToName: billTo.name || source?.name || '—', billToEmail: billTo.email.trim() || undefined, billToAddress: billTo.address.trim() || undefined, billToTaxNumber: billTo.taxNumber.trim() || undefined,
    startDate, endDate, reservations: [], lines, totalSubtotal: totals.sub, totalTax: totals.tax, grandTotal: totals.total,
    grandTotalInWords: amountInWords(totals.total, currency), status: 'issued', currency, taxRate: rate, taxMode, terms, dueDate,
    poNumber: poNumber.trim() || undefined, notes: notes.trim() || undefined, paymentInstructions: payInstr.trim() || undefined, issuedBy: currentUserName,
  };
  const draftHtml = useMemo(() => buildInvoiceHtml(draft, companyDetails, URDRIVE_LOGO_B64),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify({ ...draft, generatedAt: draft.generatedAt.slice(0, 10) }), companyDetails]);

  const issue = () => {
    if (!lines.length) return;
    if (billTo.email.trim() && !/^\S+@\S+\.\S+$/.test(billTo.email.trim())) { flash('The billing email address is not valid.'); return; }
    writePref(PAY_KEY, payInstr);
    const inv: InvoiceData = { ...draft, id: `invoice-${Date.now()}`, generatedAt: new Date().toISOString() };
    onSaveInvoice(inv);
    recordActivity('INVOICE_ISSUED', 'invoice', `Issued invoice ${inv.invoiceNumber} to ${inv.billToName} for ${money(inv.grandTotal, inv.currency)} (${linesOf(inv).length} bookings)`);
    setTab('history');
    setOpenId(inv.id);
    setPoNumber('');
    setNotes('');
    flash(`Invoice ${inv.invoiceNumber} issued for ${money(inv.grandTotal, inv.currency)}.`);
  };

  // ----- history ------------------------------------------------------------
  const [filter, setFilter] = useState<'all' | InvoiceState>('all');
  const [query, setQuery] = useState('');
  const sorted = useMemo(() => [...invoices].sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || '')), [invoices]);
  const visible = sorted.filter(i => (filter === 'all' || invoiceState(i) === filter) && (!query || `${i.invoiceNumber} ${i.billToName} ${i.poNumber || ''}`.toLowerCase().includes(query.toLowerCase())));

  const kpi = useMemo(() => {
    const thisYear = String(new Date().getFullYear());
    const live = invoices.filter(i => invoiceState(i) !== 'void');
    const sum = (l: InvoiceData[]) => l.reduce((s, i) => s + (i.grandTotal || 0), 0);
    const yearL = live.filter(i => (i.generatedAt || '').startsWith(thisYear));
    const unpaid = live.filter(i => invoiceState(i) === 'unpaid');
    const overdue = live.filter(i => invoiceState(i) === 'overdue');
    const paid = yearL.filter(i => invoiceState(i) === 'paid');
    return { yearCount: yearL.length, yearSum: sum(yearL), unpaid: sum(unpaid), unpaidN: unpaid.length, overdue: sum(overdue), overdueN: overdue.length, paid: sum(paid), paidN: paid.length };
  }, [invoices]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: invoices.length, unpaid: 0, overdue: 0, paid: 0, void: 0 };
    invoices.forEach(i => { c[invoiceState(i)]++; });
    return c;
  }, [invoices]);

  const open = invoices.find(i => i.id === openId) || null;

  const sel = `${selectCls} w-full`;
  const stateTone: Record<InvoiceState, 'info' | 'danger' | 'success' | 'muted'> = { unpaid: 'info', overdue: 'danger', paid: 'success', void: 'muted' };
  const toggleLine = (id: string) => setExcluded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Page>
      <PageHeader
        section="Reports"
        title="Invoice Generation"
        subtitle="Bill prepaid booking partners, track payment and send invoices by email."
        actions={
          <Segmented
            options={[{ key: 'new', label: 'New invoice' }, { key: 'history', label: `Invoices (${invoices.length})` }]}
            value={tab}
            onChange={k => setTab(k as 'new' | 'history')}
          />
        }
      />

      <StatGrid items={[
        { label: `Invoiced ${new Date().getFullYear()}`, value: money(kpi.yearSum), sub: `${kpi.yearCount} invoice${kpi.yearCount === 1 ? '' : 's'}` },
        { label: 'Awaiting payment', value: money(kpi.unpaid), sub: `${kpi.unpaidN} not yet due`, tone: 'info' },
        { label: 'Overdue', value: money(kpi.overdue), sub: `${kpi.overdueN} past due date`, tone: kpi.overdueN > 0 ? 'danger' : 'default' },
        { label: 'Collected', value: money(kpi.paid), sub: `${kpi.paidN} paid this year`, tone: 'success' },
      ]} />

      {tab === 'new' ? (
        prepaidSources.length === 0 ? (
          <Panel>
            <EmptyState title="No prepaid partners yet" hint="Mark a booking source as “Prepaid” in Manage Sources to invoice it here." />
          </Panel>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-4 items-start">
            {/* Builder */}
            <div className="space-y-4 min-w-0">
              <Panel title="Bill to" bodyClassName="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Partner" className="sm:col-span-2">
                    <select className={sel} value={sourceId} onChange={e => setSourceId(e.target.value)}>
                      {prepaidSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Legal name on invoice">
                    <input className={inputCls} value={billTo.name} onChange={e => setBillTo(b => ({ ...b, name: e.target.value }))} /></Field>
                  <Field label="Billing email">
                    <input className={inputCls} value={billTo.email} onChange={e => setBillTo(b => ({ ...b, email: e.target.value }))} placeholder="accounts@partner.com" inputMode="email" /></Field>
                  <Field label="Address">
                    <textarea rows={2} className={textareaCls} value={billTo.address} onChange={e => setBillTo(b => ({ ...b, address: e.target.value }))} placeholder="Street, city, country" /></Field>
                  <Field label="Partner tax number">
                    <input className={inputCls} value={billTo.taxNumber} onChange={e => setBillTo(b => ({ ...b, taxNumber: e.target.value }))} placeholder="Optional" /></Field>
                </div>
              </Panel>

              <Panel title="Period & terms" footer={<span className="tabular-nums">Due {fmtDay(dueDate)} · invoice number {nextNumber}</span>} bodyClassName="p-4 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    const now = new Date();
                    const presets: [string, readonly [string, string]][] = [
                      [`${month} ${year}`, monthRange(year, Math.max(0, MONTHS.indexOf(month)))],
                      ['This month', monthRange(now.getFullYear(), now.getMonth())],
                      ['Last month', monthRange(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), (now.getMonth() + 11) % 12)],
                      ['Year to date', [iso(new Date(now.getFullYear(), 0, 1)), iso(now)] as const],
                    ];
                    return presets.map(([label, r]) => {
                      const on = startDate === r[0] && endDate === r[1];
                      return (
                        <button key={label} onClick={() => setRange(r)} aria-pressed={on} className={`h-7 px-2.5 rounded-md text-xs font-semibold ring-1 ring-inset ${on ? 'bg-indigo-50 text-indigo-700 ring-indigo-200' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>{label}</button>
                      );
                    });
                  })()}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Field label="From"><input type="date" className={inputCls} value={startDate} onChange={e => setRange([e.target.value, endDate])} /></Field>
                  <Field label="To"><input type="date" className={inputCls} value={endDate} onChange={e => setRange([startDate, e.target.value])} /></Field>
                  <Field label="Payment terms">
                    <select className={sel} value={terms} onChange={e => setTerms(e.target.value as typeof terms)}>{Object.entries(TERMS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                  <Field label="Currency">
                    <select className={sel} value={currency} onChange={e => setCurrency(e.target.value as typeof currency)}><option>USD</option><option>JOD</option><option>EUR</option></select></Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px_1fr] gap-3 items-end">
                  <Field label="VAT">
                    <select className={sel} value={taxMode} onChange={e => setTaxMode(e.target.value as typeof taxMode)}>
                      <option value="included">Rates include VAT</option><option value="added">Add VAT on top</option><option value="none">No VAT (exempt / export)</option>
                    </select></Field>
                  <Field label="Rate %">
                    <input type="number" min={0} max={50} step="0.5" disabled={taxMode === 'none'} className={`${inputCls} tabular-nums`} value={taxPct} onChange={e => setTaxPct(parseFloat(e.target.value) || 0)} /></Field>
                  <Field label="PO / partner reference">
                    <input className={inputCls} value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="Optional" /></Field>
                </div>
              </Panel>

              <Panel
                title="Bookings"
                subtitle={`${lines.length} of ${candidates.length} selected · extras are excluded (charged to the renter)`}
                actions={candidates.length > 0 ? (
                  <>
                    <Button size="sm" variant="ghost" className="!text-indigo-600" onClick={() => setExcluded(new Set(candidates.filter(r => invoicedBy.has(r.id)).map(r => r.id)))}>Select uninvoiced</Button>
                    <Button size="sm" variant="ghost" onClick={() => setExcluded(new Set(candidates.map(r => r.id)))}>Clear</Button>
                  </>
                ) : undefined}
              >
                {candidates.length === 0 ? (
                  <EmptyState className="!py-10" title={`No ${source?.name || ''} bookings start in this period.`} hint="Pick another period or partner." />
                ) : (
                  <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                    {candidates.map(r => {
                      const on = !excluded.has(r.id);
                      const prior = invoicedBy.get(r.id);
                      const p = priceLine(billableAmount(r), rate, taxMode);
                      return (
                        <li key={r.id}>
                          <label className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer ${on ? '' : 'opacity-60'} hover:bg-slate-50`}>
                            <input type="checkbox" checked={on} onChange={() => toggleLine(r.id)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0" />
                            <span className="flex-1 min-w-0">
                              <span className="block text-[13px] font-semibold text-slate-900 truncate">{r.personName} <span className="font-mono text-xs font-normal text-slate-400">#{r.bookingId}</span></span>
                              <span className="block text-xs text-slate-500 truncate">{fmtDay(r.startDate)} → {fmtDay(r.endDate)} · {rentalDays(r.startDate, r.endDate)} days · {r.carModel}</span>
                              {(prior || r.status === ReservationStatus.PENDING) && (
                                <span className="mt-1 flex flex-wrap gap-1 sm:hidden">
                                  {prior && <Badge tone="warning" dot={false}>On {prior}</Badge>}
                                  {r.status === ReservationStatus.PENDING && <Badge tone="muted" dot={false}>Pending</Badge>}
                                </span>
                              )}
                            </span>
                            {prior && <Badge tone="warning" dot={false} className="hidden sm:inline-flex">On {prior}</Badge>}
                            {r.status === ReservationStatus.PENDING && <Badge tone="muted" dot={false} className="hidden sm:inline-flex">Pending</Badge>}
                            <span className="w-20 sm:w-24 text-right text-[13px] font-semibold tabular-nums text-slate-900 shrink-0">{money(p.total, currency)}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>

              <Panel title="Payment & notes" bodyClassName="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={<>Payment instructions <span className="text-slate-400 font-normal">(remembered)</span></>}>
                  <textarea rows={4} className={textareaCls} value={payInstr} onChange={e => setPayInstr(e.target.value)} placeholder={'Bank: …\nIBAN: …\nSWIFT: …\nPlease quote the invoice number.'} /></Field>
                <Field label="Notes to partner">
                  <textarea rows={4} className={textareaCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></Field>
              </Panel>
            </div>

            {/* Preview */}
            <div className="xl:sticky xl:top-4 space-y-3 min-w-0">
              <Panel bodyClassName="px-4 py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total · {lines.length} booking{lines.length === 1 ? '' : 's'}</p>
                  <p className="text-xl font-semibold text-slate-900 tabular-nums">{money(totals.total, currency)}</p>
                  <p className="text-xs text-slate-500 tabular-nums">Net {money(totals.sub, currency)}{taxMode !== 'none' ? ` · VAT ${money(totals.tax, currency)}` : ''}</p>
                </div>
                <Button variant="primary" onClick={issue} disabled={!lines.length} className="max-sm:w-full">Issue invoice {nextNumber}</Button>
              </Panel>
              <DocPreview html={draftHtml} />
              <p className="text-xs text-slate-400 text-center">Live preview — this is exactly what the partner receives.</p>
            </div>
          </div>
        )
      ) : (
        <Panel footer={<span className="tabular-nums">{visible.length} of {invoices.length} invoices shown</span>}>
          <Tabs
            tabs={(['all', 'unpaid', 'overdue', 'paid', 'void'] as const).map(k => ({ key: k, label: k === 'all' ? 'All' : STATE_META[k].label, count: counts[k] ?? 0 }))}
            value={filter}
            onChange={k => setFilter(k as typeof filter)}
          />
          <Toolbar>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search number, partner, PO" className={`${inputCls} md:w-72`} />
          </Toolbar>
          {visible.length === 0 ? (
            <EmptyState title={invoices.length ? 'No invoices match.' : 'No invoices yet'} hint={invoices.length ? 'Try another tab or clear the search.' : 'Issue your first one from “New invoice”.'} />
          ) : (
            <>
              <table className={`hidden md:table ${table.wrap}`}>
                <thead className={table.head}><tr>
                  <th className={table.th}>Invoice</th><th className={table.th}>Period</th>
                  <th className={`${table.th} hidden lg:table-cell`}>Issued</th><th className={table.th}>Due</th>
                  <th className={table.th}>Status</th><th className={`${table.th} text-right`}>Amount</th>
                </tr></thead>
                <tbody className={table.body}>
                  {visible.map(inv => {
                    const st = invoiceState(inv);
                    return (
                      <tr key={inv.id} onClick={() => setOpenId(inv.id)} className={`${table.row} cursor-pointer`}>
                        <td className={table.td}><p className="font-mono text-xs font-semibold text-slate-900">{inv.invoiceNumber}</p><p className="text-xs text-slate-500">{inv.billToName} · {linesOf(inv).length} booking{linesOf(inv).length === 1 ? '' : 's'}</p></td>
                        <td className={`${table.td} text-xs text-slate-600 whitespace-nowrap`}>{fmtDay(inv.startDate)} – {fmtDay(inv.endDate)}</td>
                        <td className={`${table.td} text-xs text-slate-600 hidden lg:table-cell whitespace-nowrap`}>{fmtDay(inv.generatedAt)}{inv.emails?.length ? <span className="ml-1.5 text-emerald-700">· sent</span> : ''}</td>
                        <td className={`${table.td} text-xs whitespace-nowrap ${st === 'overdue' ? 'text-rose-600 font-semibold' : 'text-slate-600'}`}>{inv.dueDate ? fmtDay(inv.dueDate) : '—'}</td>
                        <td className={table.td}><Badge tone={stateTone[st]}>{STATE_META[st].label}</Badge></td>
                        <td className={`${table.td} text-right font-semibold tabular-nums ${st === 'void' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{money(inv.grandTotal, inv.currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <ul className="md:hidden divide-y divide-slate-100">
                {visible.map(inv => {
                  const st = invoiceState(inv);
                  return (
                    <li key={inv.id}>
                      <button type="button" onClick={() => setOpenId(inv.id)} className="w-full text-left px-4 py-3 active:bg-slate-50">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-900">{inv.invoiceNumber}</span>
                          <span className={`text-[13px] font-semibold tabular-nums ${st === 'void' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{money(inv.grandTotal, inv.currency)}</span>
                        </div>
                        <p className="text-xs text-slate-500 truncate">{inv.billToName} · {linesOf(inv).length} booking{linesOf(inv).length === 1 ? '' : 's'} · {fmtDay(inv.startDate)} – {fmtDay(inv.endDate)}</p>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                          <Badge tone={stateTone[st]}>{STATE_META[st].label}</Badge>
                          <span className={st === 'overdue' ? 'text-rose-600 font-semibold' : ''}>Due {inv.dueDate ? fmtDay(inv.dueDate) : '—'}</span>
                          {inv.emails?.length ? <span className="text-emerald-700">· sent</span> : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>
      )}

      {open && (
        <InvoiceDrawer
          invoice={open}
          company={companyDetails}
          onClose={() => setOpenId(null)}
          onUpdate={inv => { onUpdateInvoice?.(inv); }}
          canUpdate={!!onUpdateInvoice}
          flash={flash}
        />
      )}

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] px-4 py-2.5 rounded-lg bg-slate-900 text-white text-[13px] shadow-xl max-w-[calc(100vw-32px)]">{toast}</div>}
    </Page>
  );
};

const InvoiceDrawer: React.FC<{ invoice: InvoiceData; company: CompanyDetails; onClose: () => void; onUpdate: (i: InvoiceData) => void; canUpdate: boolean; flash: (t: string) => void }> = ({ invoice, company, onClose, onUpdate, canUpdate, flash }) => {
  const html = useMemo(() => buildInvoiceHtml(invoice, company, URDRIVE_LOGO_B64), [invoice, company]);
  const st = invoiceState(invoice);
  const [busy, setBusy] = useState<'pdf' | 'email' | null>(null);
  const [emailTo, setEmailTo] = useState(invoice.billToEmail || '');
  const [pay, setPay] = useState<{ open: boolean; date: string; method: string; ref: string }>({ open: false, date: iso(new Date()), method: 'Bank transfer', ref: '' });
  const fileName = `${invoice.invoiceNumber}.pdf`;

  const pdf = async () => {
    setBusy('pdf');
    try { downloadPdf(await htmlToPdfBase64(html), fileName); } catch { flash('The PDF could not be created. Use Print instead.'); } finally { setBusy(null); }
  };
  const print = () => {
    if (!printHtml(html)) flash('Allow pop-ups for this site to print.');
  };
  const csv = () => {
    const q = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = [['Invoice', 'Booking', 'Renter', 'Vehicle', 'Start', 'End', 'Days', 'Net', 'VAT', 'Total', 'Currency'].join(',')]
      .concat(linesOf(invoice).map(l => [invoice.invoiceNumber, l.bookingId, l.renter, l.carModel || '', l.startDate, l.endDate, l.days, l.subtotal.toFixed(3), l.tax.toFixed(3), l.total.toFixed(3), invoice.currency || 'USD'].map(q).join(',')));
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${invoice.invoiceNumber}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const email = async () => {
    const to = emailTo.trim();
    if (!/^\S+@\S+\.\S+$/.test(to)) { flash('Enter a valid email address.'); return; }
    setBusy('email');
    try {
      const base64 = await htmlToPdfBase64(html);
      const cur = invoice.currency || 'USD';
      const outcome = await sendCustomerEmail({
        to,
        subject: `${st === 'paid' ? 'Paid Invoice' : 'Invoice'} ${invoice.invoiceNumber} – ${company.name}`,
        heading: st === 'paid' ? `Invoice ${invoice.invoiceNumber} — paid` : `Invoice ${invoice.invoiceNumber}`,
        intro: `Dear ${invoice.billToName} Accounts Team,\n\nPlease find attached invoice ${invoice.invoiceNumber} for ${linesOf(invoice).length} booking${linesOf(invoice).length === 1 ? '' : 's'} with rental start dates between ${fmtDay(invoice.startDate)} and ${fmtDay(invoice.endDate)}. A summary is provided below, and each booking is itemised on the attached invoice.`,
        rows: [
          ['Invoice number', invoice.invoiceNumber],
          ['Issue date', fmtDay(invoice.generatedAt)],
          ['Service period', `${fmtDay(invoice.startDate)} – ${fmtDay(invoice.endDate)}`],
          ['Bookings', String(linesOf(invoice).length)],
          ...(invoice.poNumber ? [['Your reference', invoice.poNumber] as [string, string]] : []),
          ['Net amount', money(invoice.totalSubtotal, cur)],
          ...((invoice.taxMode ?? 'included') !== 'none' ? [[`VAT ${Math.round((invoice.taxRate ?? 0.16) * 100)}%`, money(invoice.totalTax, cur)] as [string, string]] : []),
          ['Payment terms', TERMS_LABEL[invoice.terms || 'receipt']],
        ],
        closing: st === 'paid' ? `This invoice has been settled in full. Thank you for your prompt payment and your continued partnership with ${company.name}.` : `We kindly request payment of the amount due${invoice.dueDate ? ` by ${fmtDay(invoice.dueDate)}` : ''}, quoting invoice number ${invoice.invoiceNumber}. Payment details are provided on the invoice.\n\nShould you have any questions regarding this invoice, please contact us${company.email ? ` at ${company.email}` : ''}${company.phone ? ` or on ${company.phone}` : ''}. We appreciate your continued partnership.`,
        companyName: company.name, companyAddress: company.address, companyPhone: company.phone, companyEmail: company.email,
        attachments: [{ fileName, contentType: 'application/pdf', base64 }],
        badge: st === 'paid' ? 'PAID' : st === 'overdue' ? 'OVERDUE' : 'INVOICE',
        tone: st === 'paid' ? 'success' : st === 'overdue' ? 'warning' : 'info',
        highlightLabel: st === 'paid' ? 'Amount paid' : `Amount due${invoice.dueDate ? ` by ${fmtDay(invoice.dueDate)}` : ''}`,
        highlightValue: money(invoice.grandTotal, cur),
      });
      if (outcome.ok) {
        onUpdate({ ...invoice, billToEmail: invoice.billToEmail || to, emails: [...(invoice.emails || []), { to, sentAt: new Date().toISOString() }] });
        flash(`Invoice emailed to ${to}.`);
      } else {
        flash(outcome.reason === 'unconfigured' ? 'Outgoing email is not set up yet — an administrator can turn it on in Email Settings.' : outcome.message || 'The email could not be sent.');
      }
    } catch { flash('The invoice PDF could not be created.'); } finally { setBusy(null); }
  };
  const markPaid = () => {
    onUpdate({ ...invoice, status: 'paid', paidAt: pay.date, paymentMethod: pay.method, paymentReference: pay.ref.trim() || undefined });
    setPay(p => ({ ...p, open: false }));
    recordActivity('INVOICE_PAID', 'invoice', `Recorded payment of ${money(invoice.grandTotal, invoice.currency)} for ${invoice.invoiceNumber} (${pay.method}${pay.ref.trim() ? `, ref ${pay.ref.trim()}` : ''})`);
    flash(`${invoice.invoiceNumber} marked as paid.`);
  };
  const voidIt = () => {
    const reason = window.prompt(`Void ${invoice.invoiceNumber}? Its bookings become available to invoice again.\n\nReason:`);
    if (reason === null) return;
    onUpdate({ ...invoice, status: 'void', voidedAt: new Date().toISOString(), voidReason: reason.trim() || undefined });
    recordActivity('INVOICE_VOIDED', 'invoice', `Voided invoice ${invoice.invoiceNumber}${reason.trim() ? ` — ${reason.trim()}` : ''}`);
    flash(`${invoice.invoiceNumber} voided.`);
  };

  const stTone = st === 'paid' ? 'success' : st === 'overdue' ? 'danger' : st === 'void' ? 'muted' : 'info';
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose} role="dialog" aria-modal="true">
      <aside className="w-full max-w-4xl h-full bg-slate-50 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 bg-white border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><p className="font-mono text-sm font-semibold text-slate-900">{invoice.invoiceNumber}</p>
              <Badge tone={stTone}>{STATE_META[st].label}</Badge></div>
            <p className="text-[13px] text-slate-500 tabular-nums">{invoice.billToName} · {money(invoice.grandTotal, invoice.currency)} · due {invoice.dueDate ? fmtDay(invoice.dueDate) : 'on receipt'}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={pdf} disabled={!!busy}>{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</Button>
          <Button size="sm" onClick={print}>Print</Button>
          <Button size="sm" onClick={csv}>CSV</Button>
          {canUpdate && st !== 'void' && st !== 'paid' && <Button size="sm" className="!text-emerald-700 !border-emerald-200" onClick={() => setPay(p => ({ ...p, open: !p.open }))} aria-expanded={pay.open}>Record payment</Button>}
          {canUpdate && st !== 'void' && <Button size="sm" variant="danger" className="sm:ml-auto" onClick={voidIt}>Void</Button>}
        </div>
        {pay.open && (
          <div className="px-5 py-3 bg-emerald-50/60 border-b border-emerald-200 grid grid-cols-1 sm:grid-cols-[150px_1fr_1fr_auto] gap-2 items-end">
            <Field label="Received on"><input type="date" className={inputCls} value={pay.date} onChange={e => setPay(p => ({ ...p, date: e.target.value }))} /></Field>
            <Field label="Method">
              <select className={`${selectCls} w-full`} value={pay.method} onChange={e => setPay(p => ({ ...p, method: e.target.value }))}><option>Bank transfer</option><option>Card</option><option>Cheque</option><option>Cash</option><option>Offset against commission</option></select></Field>
            <Field label="Reference"><input className={inputCls} value={pay.ref} onChange={e => setPay(p => ({ ...p, ref: e.target.value }))} placeholder="Transfer ID" /></Field>
            <Button variant="success" onClick={markPaid}>Mark paid</Button>
          </div>
        )}
        <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center gap-2">
          <input value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="partner@company.com" className={`${inputCls} flex-1 min-w-[200px] !w-auto`} />
          <Button variant="primary" onClick={email} disabled={!!busy || st === 'void'} icon={busy === 'email' ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : undefined}>
            {busy === 'email' ? 'Sending…' : 'Email invoice'}
          </Button>
          {invoice.emails?.length ? <span className="text-xs text-slate-500 w-full">Sent {invoice.emails.map(e => `${new Date(e.sentAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} to ${e.to}`).join(' · ')}</span> : null}
          {st === 'paid' && <span className="text-xs text-emerald-700 w-full">Paid {fmtDay(invoice.paidAt)}{invoice.paymentMethod ? ` by ${invoice.paymentMethod}` : ''}{invoice.paymentReference ? ` · ref ${invoice.paymentReference}` : ''}</span>}
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5"><DocPreview html={html} /></div>
      </aside>
    </div>
  );
};

export default Invoice;
