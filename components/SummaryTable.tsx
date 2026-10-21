import React, { useMemo, useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { YearData, ReservationStatus, CompanyDetails, AppData, FranchisePayment, User, UserPermission, TrafficTicket, VehicleDamage } from '../types';
import { bookingRevenue, indexRegisters } from '../services/revenue';
import { MONTHS, COMMISSION_RATE, NCT_LOGO_B64, USD_TO_JOD_RATE } from '../constants';
import { PdfIcon, CurrencyDollarIcon, CloseIcon, CreditCardIcon, AlertIcon } from './icons';
import { Page, PageHeader, StatGrid, Panel, Tabs, Segmented, Badge, Button, Field, inputCls, selectCls, table } from './ui/Crm';
import SecurityKeyModal from './SecurityKeyModal';
import { API_URL } from '../firebase/api';

const FIXED_ADDON = 250; // Fixed franchise fee per month (USD)
// Franchise fees for these months were settled outside the system and are not charged.
const WAIVED_MONTHS: Record<number, string[]> = { 2026: ['January', 'February', 'March', 'April', 'May'] };
const DEADLINE_DAY = 5; // fee is due on the 5th of the following month

interface SummaryTableProps {
  allData: AppData;
  yearData: YearData;
  year: number;
  companyDetails: CompanyDetails;
  franchisePayments?: FranchisePayment[];
  onUpdateFranchisePayment?: (payments: FranchisePayment[]) => void;
  currentUser?: User | null;
  trafficTickets?: TrafficTicket[];
  vehicleDamages?: VehicleDamage[];
}

type Method = NonNullable<FranchisePayment['method']>;
type FeeStatus = 'PAID' | 'WAIVED' | 'OVERDUE' | 'DUE' | 'ACCRUING' | 'UPCOMING';

const METHOD_LABEL: Record<Method, string> = { card: 'Card (Stripe)', bank_transfer: 'Bank transfer', cash: 'Cash', cheque: 'Cheque' };

const STATUS_META: Record<FeeStatus, { label: string; tone: 'success' | 'muted' | 'danger' | 'warning' | 'info' | 'default' }> = {
  PAID: { label: 'Paid', tone: 'success' },
  WAIVED: { label: 'Waived', tone: 'muted' },
  OVERDUE: { label: 'Overdue', tone: 'danger' },
  DUE: { label: 'Due', tone: 'warning' },
  ACCRUING: { label: 'In progress', tone: 'info' },
  UPCOMING: { label: 'Upcoming', tone: 'default' },
};

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const deadlineFor = (month: string, year: number) => {
  const d = new Date(year, MONTHS.indexOf(month) + 1, DEADLINE_DAY);
  d.setHours(23, 59, 59, 999);
  return d;
};
const shortMonth = (m: string) => m.slice(0, 3);

const StatusChip: React.FC<{ status: FeeStatus }> = ({ status }) => (
  <Badge tone={STATUS_META[status].tone} className={status === 'UPCOMING' ? 'bg-white text-slate-400' : ''}>{STATUS_META[status].label}</Badge>
);

const ModalShell: React.FC<{ title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; z?: string }> = ({ title, subtitle, onClose, children, z = 'z-50' }) => (
  <div className={`fixed inset-0 ${z} flex items-stretch sm:items-center justify-center sm:p-4`} role="dialog" aria-modal="true">
    <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
    <div className="relative w-full sm:max-w-md h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-y-auto bg-white sm:rounded-xl shadow-2xl">
      <header className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <button onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100"><CloseIcon className="w-5 h-5" /></button>
      </header>
      {children}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Payment entry
// ---------------------------------------------------------------------------

interface PaymentDraft { month: string; amount: number; currency: 'USD' | 'JOD'; method: Method; reference: string; date: string }

const PaymentEntryModal: React.FC<{
  month: string;
  year: number;
  fee: number;
  initial?: Partial<PaymentDraft>;
  onClose: () => void;
  onConfirm: (d: PaymentDraft) => void;
}> = ({ month, year, fee, initial, onClose, onConfirm }) => {
  const [currency, setCurrency] = useState<'USD' | 'JOD'>(initial?.currency || 'USD');
  const [amount, setAmount] = useState<string>(String(initial?.amount ?? fee.toFixed(2)));
  const [method, setMethod] = useState<Method>(initial?.method || 'bank_transfer');
  const [reference, setReference] = useState(initial?.reference || '');
  const [date, setDate] = useState(initial?.date || new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const expected = currency === 'JOD' ? fee * USD_TO_JOD_RATE : fee;
  const value = parseFloat(amount);

  const switchCurrency = (c: 'USD' | 'JOD') => {
    setCurrency(c);
    setAmount((c === 'JOD' ? fee * USD_TO_JOD_RATE : fee).toFixed(2));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(value > 0)) { setError('Enter an amount greater than zero.'); return; }
    if (method !== 'card' && method !== 'cash' && !reference.trim()) { setError('Add the transfer or cheque reference so the payment can be traced.'); return; }
    onConfirm({ month, amount: value, currency, method, reference: reference.trim(), date });
  };

  return (
    <ModalShell title="Record franchise payment" subtitle={`${month} ${year} · fee due ${usd(fee)}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="p-5 space-y-4">
        <div>
          <span className="block text-[13px] font-medium text-slate-700 mb-1">Payment method</span>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(METHOD_LABEL) as Method[]).map(m => (
              <button key={m} type="button" onClick={() => setMethod(m)}
                className={`h-9 px-3 rounded-lg border text-[13px] font-medium text-left ${method === m ? 'border-indigo-500 ring-2 ring-indigo-500/15 bg-indigo-50/40 text-slate-900' : 'border-slate-300 text-slate-600 hover:border-slate-400'}`}>
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Amount" className="col-span-2">
            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className={`${inputCls} font-semibold tabular-nums`} />
          </Field>
          <Field label="Currency">
            <select value={currency} onChange={e => switchCurrency(e.target.value as 'USD' | 'JOD')} className={`${selectCls} w-full`}>
              <option value="USD">USD</option>
              <option value="JOD">JOD</option>
            </select>
          </Field>
        </div>
        {value > 0 && Math.abs(value - expected) > 0.009 && (
          <p className={`text-xs font-medium ${value < expected ? 'text-amber-700' : 'text-slate-500'}`}>
            {value < expected ? `Short by ${(expected - value).toFixed(2)} ${currency} — this will be recorded as a partial payment.` : `${(value - expected).toFixed(2)} ${currency} more than the fee.`}
          </p>
        )}
        {method !== 'card' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment date">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} max={new Date().toISOString().slice(0, 10)} />
            </Field>
            <Field label={`Reference ${method === 'cash' ? '(optional)' : ''}`}>
              <input value={reference} onChange={e => setReference(e.target.value)} className={inputCls} placeholder={method === 'cheque' ? 'Cheque no.' : 'Transfer ref.'} />
            </Field>
          </div>
        )}
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        <p className="text-[11px] text-slate-400">A security key is required to confirm every franchise payment.</p>
        </div>
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">{method === 'card' ? 'Continue to card payment' : 'Continue'}</Button>
        </div>
      </form>
    </ModalShell>
  );
};

// ---------------------------------------------------------------------------
// Stripe card payment
// ---------------------------------------------------------------------------

const StripePaymentModal: React.FC<{
  draft: PaymentDraft;
  year: number;
  onClose: () => void;
  onPaid: (reference: string) => void;
  onUseBankTransfer: () => void;
}> = ({ draft, year, onClose, onPaid, onUseBankTransfer }) => {
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [reference, setReference] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const usdAmount = draft.currency === 'JOD' ? draft.amount / USD_TO_JOD_RATE : draft.amount;
        const response = await fetch(`${API_URL}/stripe/create-payment-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ amount: usdAmount, description: `Franchise fee - ${draft.month} ${year} (${draft.currency} ${draft.amount.toFixed(2)})` }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.url) throw new Error('No payment link returned');
        if (!cancelled) setLink(data.url);
      } catch {
        // No fake fallback link: if Stripe is unavailable the user is offered another method.
        if (!cancelled) setError('Card payments are unavailable right now (the payment server could not create a Stripe link).');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [draft, year]);

  return (
    <ModalShell title="Pay by card" subtitle={`${draft.month} ${year} · ${draft.currency} ${draft.amount.toFixed(2)}`} onClose={onClose} z="z-[60]">
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
          <span className="w-8 h-8 rounded-md bg-white border border-slate-200 text-slate-500 flex items-center justify-center shrink-0"><CreditCardIcon className="w-4 h-4" /></span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Secure checkout by Stripe</p>
            <p className="text-xs text-slate-500">Opens in a new tab. Come back here when the payment is complete.</p>
          </div>
        </div>
        {error ? (
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-[13px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3"><AlertIcon className="w-4 h-4 mt-0.5 shrink-0" />{error}</p>
            <Button className="w-full" onClick={onUseBankTransfer}>Record a bank transfer instead</Button>
          </div>
        ) : (
          <>
            <Button variant="primary" className="w-full" disabled={loading || !link} onClick={() => { if (link) { window.open(link, '_blank', 'noopener'); setOpened(true); } }}>
              {loading ? 'Preparing secure link…' : 'Open Stripe checkout'}
            </Button>
            {opened && (
              <div className="space-y-2">
                <label className="block text-[13px] font-medium text-slate-700">Stripe receipt or payment ID <span className="text-slate-400 font-normal">(optional)</span></label>
                <input value={reference} onChange={e => setReference(e.target.value)} className={inputCls} placeholder="e.g. pi_3P… or receipt number" />
                <Button variant="success" className="w-full" onClick={() => onPaid(reference.trim())}>I've completed the payment</Button>
              </div>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const SummaryTable: React.FC<SummaryTableProps> = ({ allData, yearData, year, companyDetails, franchisePayments = [], onUpdateFranchisePayment, currentUser, trafficTickets = [], vehicleDamages = [] }) => {
  const [currency, setCurrency] = useState<'USD' | 'JOD'>('USD');
  const [activeTab, setActiveTab] = useState<'overview' | 'franchise'>('overview');
  const [entry, setEntry] = useState<{ month: string; fee: number; initial?: Partial<PaymentDraft> } | null>(null);
  const [cardDraft, setCardDraft] = useState<PaymentDraft | null>(null);
  const [pending, setPending] = useState<PaymentDraft | null>(null);
  const [reverseMonth, setReverseMonth] = useState<string | null>(null);

  const rate = currency === 'JOD' ? USD_TO_JOD_RATE : 1;
  const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n || 0);
  const canManage =
    !!currentUser?.permissions?.includes(UserPermission.ACTION_FINANCIALS_MANAGE_FRANCHISE_PAYMENTS) ||
    currentUser?.role === 'ADMIN' || currentUser?.username === 'admin' || currentUser?.email === 'nadeenalnahas@gmail.com';

  const now = new Date();

  // Revenue per booking = rental (with extras, upgrades, extensions) + damages + traffic tickets + other return charges.
  const registers = useMemo(() => indexRegisters({ trafficTickets, vehicleDamages }), [trafficTickets, vehicleDamages]);
  const months = useMemo(() => MONTHS.map((month, idx) => {
    const list = (yearData && yearData[month]) || [];
    const confirmed = list.filter(r => r.status === ReservationStatus.CONFIRMED && typeof r.amount === 'number' && r.amount >= 0);
    const cancelled = list.filter(r => r.status === ReservationStatus.CANCELLED || (r.status as string) === 'NO_SHOW').length;
    const revenueUSD = confirmed.reduce((s, r) => s + bookingRevenue(r, registers).total, 0);
    const commissionUSD = revenueUSD * COMMISSION_RATE;
    const waived = (WAIVED_MONTHS[year] || []).includes(month);
    const monthStart = new Date(year, idx, 1);
    const monthEnd = new Date(year, idx + 1, 0, 23, 59, 59, 999);
    const started = now >= monthStart;
    const feeUSD = waived ? 0 : commissionUSD + FIXED_ADDON;
    const payment = franchisePayments.find(p => p.year === year && p.month === month);
    const deadline = deadlineFor(month, year);
    let status: FeeStatus;
    if (payment) status = 'PAID';
    else if (waived) status = 'WAIVED';
    else if (now > deadline) status = 'OVERDUE';
    else if (now > monthEnd) status = 'DUE';
    else if (started) status = 'ACCRUING';
    else status = 'UPCOMING';
    const paidUSD = payment ? (payment.currency === 'JOD' ? payment.amount / USD_TO_JOD_RATE : payment.amount) : 0;
    return {
      month, idx, total: list.length, confirmed: confirmed.length, cancelled,
      revenueUSD, commissionUSD, feeUSD, waived, started, payment, paidUSD, deadline, status,
    };
  }), [yearData, year, franchisePayments, registers, now.toDateString()]);

  const totals = useMemo(() => {
    const t = { bookings: 0, confirmed: 0, cancelled: 0, revenueUSD: 0, commissionUSD: 0 };
    months.forEach(m => { t.bookings += m.total; t.confirmed += m.confirmed; t.cancelled += m.cancelled; t.revenueUSD += m.revenueUSD; t.commissionUSD += m.commissionUSD; });
    return t;
  }, [months]);

  const activeMonths = months.filter(m => m.total > 0);
  const best = activeMonths.reduce<typeof months[number] | null>((b, m) => (!b || m.revenueUSD > b.revenueUSD ? m : b), null);
  const avgBooking = totals.confirmed ? totals.revenueUSD / totals.confirmed : 0;
  const cancelRate = totals.bookings ? (totals.cancelled / totals.bookings) * 100 : 0;
  const maxRevenue = Math.max(1, ...months.map(m => m.revenueUSD));
  const currentMonthIdx = now.getFullYear() === year ? now.getMonth() : -1;

  const fees = useMemo(() => {
    const billable = months.filter(m => m.status !== 'UPCOMING' && m.status !== 'ACCRUING' && !m.waived);
    const due = billable.reduce((s, m) => s + m.feeUSD, 0);
    const paid = months.reduce((s, m) => s + m.paidUSD, 0);
    const overdue = months.filter(m => m.status === 'OVERDUE').reduce((s, m) => s + m.feeUSD, 0);
    const outstanding = months.filter(m => m.status === 'OVERDUE' || m.status === 'DUE').reduce((s, m) => s + m.feeUSD, 0);
    const next = months.find(m => m.status === 'DUE' || m.status === 'ACCRUING');
    return { due, paid, overdue, outstanding, next, overdueCount: months.filter(m => m.status === 'OVERDUE').length };
  }, [months]);

  // ---- payments --------------------------------------------------------
  const record = (d: PaymentDraft) => {
    if (!onUpdateFranchisePayment) return;
    const payment: FranchisePayment = {
      id: `fp-${year}-${d.month}-${Date.now()}`,
      year,
      month: d.month,
      amount: d.amount,
      currency: d.currency,
      datePaid: d.method === 'card' ? new Date().toISOString() : new Date(`${d.date}T12:00:00`).toISOString(),
      paidBy: currentUser?.fullName || currentUser?.username || 'Unknown',
      referenceNote: d.reference || `Franchise fee for ${d.month} ${year}`,
      method: d.method,
      recordedAt: new Date().toISOString(),
    };
    onUpdateFranchisePayment([...franchisePayments.filter(p => !(p.year === year && p.month === d.month)), payment]);
  };

  const onEntryConfirmed = (d: PaymentDraft) => {
    setEntry(null);
    if (d.method === 'card') setCardDraft(d);
    else setPending(d);
  };

  const reverse = (month: string) => {
    if (!onUpdateFranchisePayment) return;
    onUpdateFranchisePayment(franchisePayments.filter(p => !(p.year === year && p.month === month)));
    setReverseMonth(null);
  };

  // ---- PDF -------------------------------------------------------------
  const pdfHeader = (doc: jsPDF, title: string) => {
    doc.addImage(NCT_LOGO_B64, 'PNG', 14, 12, 18, 18);
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    doc.text(companyDetails.name, 36, 19);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(companyDetails.address || '', 36, 25);
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(title, doc.internal.pageSize.getWidth() - 14, 19, { align: 'right' });
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated ${new Date().toLocaleString('en-GB')}`, doc.internal.pageSize.getWidth() - 14, 25, { align: 'right' });
    doc.setDrawColor(15, 23, 42);
    doc.line(14, 33, doc.internal.pageSize.getWidth() - 14, 33);
  };

  const exportSummaryPDF = () => {
    const doc = new jsPDF();
    pdfHeader(doc, `Yearly summary ${year} (${currency})`);
    (doc as any).autoTable({
      startY: 39,
      head: [['Month', 'Bookings', 'Confirmed', 'Cancelled', `Revenue`, 'Avg booking', `Commission ${(COMMISSION_RATE * 100).toFixed(1)}%`]],
      body: months.map(m => [m.month, m.total, m.confirmed, m.cancelled, money(m.revenueUSD * rate), m.confirmed ? money((m.revenueUSD / m.confirmed) * rate) : '—', money(m.commissionUSD * rate)]),
      foot: [['Total', totals.bookings, totals.confirmed, totals.cancelled, money(totals.revenueUSD * rate), money(avgBooking * rate), money(totals.commissionUSD * rate)]],
      theme: 'striped',
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [15, 23, 42] },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    });
    doc.save(`summary_${year}_${currency}.pdf`);
  };

  const exportStatementPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    pdfHeader(doc, `Franchise fee statement ${year}`);
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(`Fee = ${(COMMISSION_RATE * 100).toFixed(1)}% of confirmed revenue + ${usd(FIXED_ADDON)} per month, due on the ${DEADLINE_DAY}th of the following month. Amounts in USD.`, 14, 40);
    (doc as any).autoTable({
      startY: 45,
      head: [['Month', 'Revenue', 'Commission', 'Fixed fee', 'Fee due', 'Deadline', 'Status', 'Paid', 'Date', 'Method', 'Reference']],
      body: months.map(m => [
        m.month, usd(m.revenueUSD), usd(m.commissionUSD), m.waived ? '—' : usd(FIXED_ADDON), m.waived ? 'Waived' : usd(m.feeUSD),
        m.deadline.toLocaleDateString('en-GB'), STATUS_META[m.status].label,
        m.payment ? `${m.payment.currency} ${m.payment.amount.toFixed(2)}` : '—',
        m.payment ? new Date(m.payment.datePaid).toLocaleDateString('en-GB') : '—',
        m.payment?.method ? METHOD_LABEL[m.payment.method] : m.payment ? '—' : '',
        m.payment?.referenceNote || '',
      ]),
      foot: [['Total', usd(totals.revenueUSD), usd(totals.commissionUSD), '', usd(fees.due), '', '', usd(fees.paid), '', '', `Outstanding ${usd(fees.outstanding)}`]],
      theme: 'striped',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    });
    doc.save(`franchise_statement_${year}.pdf`);
  };

  // ---- UI --------------------------------------------------------------
  const stickyCell = 'sticky left-0 z-10';
  const feeNote = (
    <>Monthly fee = {(COMMISSION_RATE * 100).toFixed(1)}% of confirmed revenue + {usd(FIXED_ADDON)} fixed, due by the {DEADLINE_DAY}th of the following month.{(WAIVED_MONTHS[year] || []).length > 0 && ` Fees for ${WAIVED_MONTHS[year][0]}–${WAIVED_MONTHS[year][WAIVED_MONTHS[year].length - 1]} ${year} are waived.`}</>
  );
  const noPermissionNote = <>You can view fees. Recording payments requires the “Franchise payments” permission.</>;

  return (
    <Page className="min-w-0">
      <PageHeader
        section="Reports"
        title="Yearly Summary"
        subtitle={`${year} · confirmed revenue, ${(COMMISSION_RATE * 100).toFixed(1)}% commission and franchise fees by month.`}
        actions={
          <>
            {activeTab === 'overview' && (
              <Segmented value={currency} onChange={k => setCurrency(k as 'USD' | 'JOD')} options={[{ key: 'USD', label: 'USD' }, { key: 'JOD', label: 'JOD' }]} />
            )}
            <Button variant="primary" icon={<PdfIcon className="w-4 h-4" />} onClick={activeTab === 'overview' ? exportSummaryPDF : exportStatementPDF}>
              {activeTab === 'overview' ? 'Export summary' : 'Export statement'}
            </Button>
          </>
        }
      />

      <Tabs
        className="px-0 sm:px-0"
        value={activeTab}
        onChange={k => setActiveTab(k as 'overview' | 'franchise')}
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'franchise', label: <>Franchise fees{fees.overdueCount > 0 && <span className="ml-2 px-1.5 py-px rounded text-[11px] bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200">{fees.overdueCount} overdue</span>}</> },
        ]}
      />

      {activeTab === 'overview' ? (
        <>
          <StatGrid items={[
            { label: 'Confirmed revenue', value: money(totals.revenueUSD * rate), sub: `${totals.confirmed} confirmed bookings` },
            { label: 'Commission', value: money(totals.commissionUSD * rate), sub: `${(COMMISSION_RATE * 100).toFixed(1)}% of revenue` },
            { label: 'Average booking', value: money(avgBooking * rate), sub: 'per confirmed booking' },
            { label: 'Cancellation rate', value: `${cancelRate.toFixed(1)}%`, sub: `${totals.cancelled} of ${totals.bookings} bookings`, tone: cancelRate > 15 ? 'warning' : 'default' },
            { label: 'Best month', value: best ? best.month : '—', sub: best ? money(best.revenueUSD * rate) : 'no bookings yet' },
          ]} />

          {/* Chart */}
          <Panel
            title="Monthly confirmed revenue"
            actions={
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />Revenue</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-200" />Commission</span>
              </div>
            }
            padded
          >
            <div className="grid grid-cols-12 gap-1 sm:gap-3 items-end h-44 sm:h-52 pt-5">
              {months.map(m => {
                const h = (m.revenueUSD / maxRevenue) * 100;
                const ch = (m.commissionUSD / maxRevenue) * 100;
                const current = m.idx === currentMonthIdx;
                return (
                  <div key={m.month} className="min-w-0 flex flex-col items-center h-full justify-end group" title={`${m.month}: ${money(m.revenueUSD * rate)} revenue · ${m.confirmed} confirmed`}>
                    <div className="relative w-full max-w-[40px] flex-1 flex items-end">
                      <div className={`relative w-full rounded-t ${current ? 'bg-indigo-600' : 'bg-indigo-500'} group-hover:bg-indigo-700 transition-colors`} style={{ height: `${Math.max(h, m.revenueUSD ? 2 : 0)}%` }}>
                        {m.revenueUSD > 0 && (
                          <span className="hidden sm:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 text-[10px] font-semibold text-slate-500 tabular-nums whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            {money(m.revenueUSD * rate).replace(/\.\d+$/, '')}
                          </span>
                        )}
                      </div>
                      {m.commissionUSD > 0 && <div className="absolute bottom-0 left-0 right-0 bg-indigo-200 rounded-t-sm" style={{ height: `${ch}%` }} />}
                    </div>
                    <span className={`mt-1.5 text-[10px] sm:text-[11px] font-semibold ${current ? 'text-indigo-600' : 'text-slate-500'}`}>
                      <span className="sm:hidden">{m.month.charAt(0)}</span>
                      <span className="hidden sm:inline">{shortMonth(m.month)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Monthly breakdown */}
          <Panel title="Monthly breakdown" subtitle={`Amounts in ${currency}`}>
            {/* phones */}
            <ul className="md:hidden divide-y divide-slate-100">
              {months.map(m => (
                <li key={m.month} className={`px-4 py-3 ${m.idx === currentMonthIdx ? 'bg-indigo-50/40' : ''} ${!m.started && m.total === 0 ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-slate-900 truncate">{m.month}</p>
                      {m.idx === currentMonthIdx && <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600">Current</span>}
                    </div>
                    <p className="shrink-0 text-[13px] font-semibold tabular-nums text-slate-900">{money(m.revenueUSD * rate)}</p>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div className="min-w-0"><p className="text-slate-400">Bookings</p><p className="font-medium tabular-nums text-slate-700">{m.total}</p></div>
                    <div className="min-w-0"><p className="text-slate-400">Confirmed</p><p className="font-medium tabular-nums text-slate-700">{m.confirmed}</p></div>
                    <div className="min-w-0"><p className="text-slate-400">Cancelled</p><p className="font-medium tabular-nums text-slate-700">{m.cancelled}</p></div>
                    <div className="min-w-0"><p className="text-slate-400">Avg booking</p><p className="font-medium tabular-nums text-slate-700 truncate">{m.confirmed ? money((m.revenueUSD / m.confirmed) * rate) : '—'}</p></div>
                    <div className="min-w-0"><p className="text-slate-400">Commission</p><p className="font-medium tabular-nums text-slate-700 truncate">{money(m.commissionUSD * rate)}</p></div>
                    <div className="min-w-0"><p className="text-slate-400">Fee</p><button onClick={() => setActiveTab('franchise')} className="mt-0.5"><StatusChip status={m.status} /></button></div>
                  </div>
                </li>
              ))}
              <li className="px-4 py-3 bg-slate-50">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13px] font-semibold text-slate-900">Total {year}</p>
                  <p className="text-[13px] font-semibold tabular-nums text-slate-900">{money(totals.revenueUSD * rate)}</p>
                </div>
                <p className="mt-1 text-xs text-slate-500 tabular-nums">
                  {totals.bookings} bookings · {totals.confirmed} confirmed · {totals.cancelled} cancelled · avg {money(avgBooking * rate)} · commission {money(totals.commissionUSD * rate)} · {usd(fees.paid)} fees paid
                </p>
              </li>
            </ul>

            {/* md+ */}
            <div className="hidden md:block overflow-x-auto">
              <table className={`${table.wrap} whitespace-nowrap`}>
                <thead className={table.head}>
                  <tr>
                    <th className={`${table.th} ${stickyCell} bg-slate-50`}>Month</th>
                    <th className={`${table.th} text-right`}>Bookings</th>
                    <th className={`${table.th} text-right`}>Confirmed</th>
                    <th className={`${table.th} text-right`}>Cancelled</th>
                    <th className={`${table.th} text-right`}>Revenue</th>
                    <th className={`${table.th} text-right`}>Avg booking</th>
                    <th className={`${table.th} text-right`}>Commission</th>
                    <th className={table.th}>Franchise fee</th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {months.map(m => {
                    const current = m.idx === currentMonthIdx;
                    return (
                      <tr key={m.month} className={`group transition-colors ${current ? 'bg-indigo-50/60' : 'bg-white hover:bg-slate-50'} ${!m.started && m.total === 0 ? 'text-slate-400' : 'text-slate-700'}`}>
                        <td className={`${table.td} ${stickyCell} ${current ? 'bg-indigo-50' : 'bg-white group-hover:bg-slate-50'} font-medium text-slate-900`}>{m.month}{current && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-indigo-600">Current</span>}</td>
                        <td className={`${table.td} text-right tabular-nums`}>{m.total}</td>
                        <td className={`${table.td} text-right tabular-nums`}>{m.confirmed}</td>
                        <td className={`${table.td} text-right tabular-nums`}>{m.cancelled}</td>
                        <td className={`${table.td} text-right tabular-nums font-semibold text-slate-900`}>{money(m.revenueUSD * rate)}</td>
                        <td className={`${table.td} text-right tabular-nums`}>{m.confirmed ? money((m.revenueUSD / m.confirmed) * rate) : '—'}</td>
                        <td className={`${table.td} text-right tabular-nums`}>{money(m.commissionUSD * rate)}</td>
                        <td className={table.td}><button onClick={() => setActiveTab('franchise')}><StatusChip status={m.status} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 text-slate-900">
                  <tr>
                    <td className={`${table.td} ${stickyCell} bg-slate-50 font-semibold`}>Total {year}</td>
                    <td className={`${table.td} text-right tabular-nums font-semibold`}>{totals.bookings}</td>
                    <td className={`${table.td} text-right tabular-nums font-semibold`}>{totals.confirmed}</td>
                    <td className={`${table.td} text-right tabular-nums font-semibold`}>{totals.cancelled}</td>
                    <td className={`${table.td} text-right tabular-nums font-semibold`}>{money(totals.revenueUSD * rate)}</td>
                    <td className={`${table.td} text-right tabular-nums font-semibold`}>{money(avgBooking * rate)}</td>
                    <td className={`${table.td} text-right tabular-nums font-semibold`}>{money(totals.commissionUSD * rate)}</td>
                    <td className={`${table.td} text-xs text-slate-500`}>{usd(fees.paid)} paid</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>
        </>
      ) : (
        <>
          <StatGrid items={[
            { label: 'Paid this year', value: usd(fees.paid), sub: `${months.filter(m => m.payment).length} payments recorded`, tone: 'success' },
            { label: 'Outstanding', value: usd(fees.outstanding), sub: 'due and overdue fees', tone: fees.outstanding > 0 ? 'warning' : 'default' },
            { label: 'Overdue', value: usd(fees.overdue), sub: fees.overdueCount ? `${fees.overdueCount} month${fees.overdueCount === 1 ? '' : 's'} past deadline` : 'nothing overdue', tone: fees.overdue > 0 ? 'danger' : 'default' },
            { label: 'Next deadline', value: fees.next ? fees.next.deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—', sub: fees.next ? `${fees.next.month} fee · ${fees.next.status === 'ACCRUING' ? 'est. ' : ''}${usd(fees.next.feeUSD)}` : 'all settled' },
          ]} />

          <Panel title="Franchise fees" subtitle={feeNote} footer={!canManage ? noPermissionNote : undefined}>
            {/* phones */}
            <ul className="md:hidden divide-y divide-slate-100">
              {months.map(m => (
                <li key={m.month} className={`px-4 py-3 ${m.status === 'OVERDUE' ? 'bg-rose-50/40' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-900">{m.month}</p>
                      {!m.waived && m.status !== 'PAID' && m.started && <p className={`text-xs ${m.status === 'OVERDUE' ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>Due {m.deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-semibold tabular-nums text-slate-900">{m.waived ? <span className="text-slate-400 font-normal">Waived</span> : !m.started ? <span className="text-slate-300">—</span> : usd(m.feeUSD)}</p>
                      <div className="mt-1"><StatusChip status={m.status} /></div>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 tabular-nums">Revenue {usd(m.revenueUSD)} · Commission {usd(m.commissionUSD)} · Fixed {m.waived ? '—' : usd(FIXED_ADDON)}</p>
                  {m.payment && (
                    <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs min-w-0">
                      <p className="font-semibold text-slate-900 tabular-nums">{m.payment.currency} {m.payment.amount.toFixed(2)}{m.paidUSD + 0.009 < m.feeUSD && <span className="ml-1.5 text-amber-700">partial</span>}</p>
                      <p className="text-slate-500">{new Date(m.payment.datePaid).toLocaleDateString('en-GB')}{m.payment.method ? ` · ${METHOD_LABEL[m.payment.method]}` : ''} · {m.payment.paidBy}</p>
                      {m.payment.referenceNote && <p className="text-slate-400 break-words">{m.payment.referenceNote}</p>}
                    </div>
                  )}
                  {canManage && m.payment && (
                    <div className="mt-2 text-right">
                      <button onClick={() => setReverseMonth(m.month)} className="text-xs font-semibold text-rose-600 hover:text-rose-700">Reverse payment</button>
                    </div>
                  )}
                  {canManage && !m.payment && !m.waived && m.started && (
                    <Button className="mt-3 w-full" variant={m.status === 'OVERDUE' || m.status === 'DUE' ? 'primary' : 'secondary'} icon={<CurrencyDollarIcon className="w-4 h-4" />} onClick={() => setEntry({ month: m.month, fee: m.feeUSD })}>
                      Record payment
                    </Button>
                  )}
                </li>
              ))}
              <li className="px-4 py-3 bg-slate-50">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13px] font-semibold text-slate-900">Total {year}</p>
                  <p className="text-[13px] font-semibold tabular-nums text-slate-900">{usd(fees.due)}</p>
                </div>
                <p className="mt-1 text-xs text-slate-500 tabular-nums">Revenue {usd(totals.revenueUSD)} · Commission {usd(totals.commissionUSD)} · {usd(fees.paid)} paid · {usd(fees.outstanding)} outstanding</p>
              </li>
            </ul>

            {/* md+ */}
            <div className="hidden md:block overflow-x-auto">
              <table className={table.wrap}>
                <thead className={`${table.head} whitespace-nowrap`}>
                  <tr>
                    <th className={`${table.th} ${stickyCell} bg-slate-50`}>Month</th>
                    <th className={`${table.th} text-right`}>Revenue</th>
                    <th className={`${table.th} text-right`}>Commission</th>
                    <th className={`${table.th} text-right`}>Fixed</th>
                    <th className={`${table.th} text-right`}>Fee</th>
                    <th className={table.th}>Status</th>
                    <th className={table.th}>Payment</th>
                    <th className={table.th}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {months.map(m => {
                    const overdue = m.status === 'OVERDUE';
                    return (
                      <tr key={m.month} className={`group transition-colors text-slate-700 ${overdue ? 'bg-rose-50/60' : 'bg-white hover:bg-slate-50'}`}>
                        <td className={`${table.td} ${stickyCell} ${overdue ? 'bg-rose-50' : 'bg-white group-hover:bg-slate-50'} whitespace-nowrap`}>
                          <p className="font-medium text-slate-900">{m.month}</p>
                          {!m.waived && m.status !== 'PAID' && m.started && <p className={`text-[11px] ${overdue ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>Due {m.deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>}
                        </td>
                        <td className={`${table.td} text-right tabular-nums whitespace-nowrap`}>{usd(m.revenueUSD)}</td>
                        <td className={`${table.td} text-right tabular-nums whitespace-nowrap`}>{usd(m.commissionUSD)}</td>
                        <td className={`${table.td} text-right tabular-nums whitespace-nowrap text-slate-500`}>{m.waived ? '—' : usd(FIXED_ADDON)}</td>
                        <td className={`${table.td} text-right tabular-nums whitespace-nowrap font-semibold text-slate-900`}>{m.waived ? <span className="text-slate-400 font-normal">Waived</span> : !m.started ? <span className="text-slate-300">—</span> : usd(m.feeUSD)}</td>
                        <td className={table.td}><StatusChip status={m.status} /></td>
                        <td className={`${table.td} min-w-[12rem]`}>
                          {m.payment ? (
                            <div className="text-xs">
                              <p className="font-semibold text-slate-900 tabular-nums">{m.payment.currency} {m.payment.amount.toFixed(2)}{m.paidUSD + 0.009 < m.feeUSD && <span className="ml-1.5 text-amber-700">partial</span>}</p>
                              <p className="text-slate-500">{new Date(m.payment.datePaid).toLocaleDateString('en-GB')}{m.payment.method ? ` · ${METHOD_LABEL[m.payment.method]}` : ''} · {m.payment.paidBy}</p>
                              {m.payment.referenceNote && <p className="text-slate-400 truncate max-w-[16rem]" title={m.payment.referenceNote}>{m.payment.referenceNote}</p>}
                            </div>
                          ) : <span className="text-xs text-slate-300">—</span>}
                        </td>
                        <td className={`${table.td} text-right whitespace-nowrap`}>
                          {canManage && m.payment && (
                            <Button size="sm" variant="ghost" className="!text-rose-600 hover:!bg-rose-50" onClick={() => setReverseMonth(m.month)}>Reverse</Button>
                          )}
                          {canManage && !m.payment && !m.waived && m.started && (
                            <Button size="sm" variant={m.status === 'OVERDUE' || m.status === 'DUE' ? 'primary' : 'secondary'} icon={<CurrencyDollarIcon className="w-3.5 h-3.5" />} onClick={() => setEntry({ month: m.month, fee: m.feeUSD })}>
                              Record payment
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 text-slate-900 whitespace-nowrap">
                  <tr>
                    <td className={`${table.td} ${stickyCell} bg-slate-50 font-semibold`}>Total {year}</td>
                    <td className={`${table.td} text-right tabular-nums font-semibold`}>{usd(totals.revenueUSD)}</td>
                    <td className={`${table.td} text-right tabular-nums font-semibold`}>{usd(totals.commissionUSD)}</td>
                    <td className={table.td} />
                    <td className={`${table.td} text-right tabular-nums font-semibold`}>{usd(fees.due)}</td>
                    <td className={`${table.td} text-xs text-slate-500`} colSpan={3}>{usd(fees.paid)} paid · {usd(fees.outstanding)} outstanding</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>
        </>
      )}

      {entry && (
        <PaymentEntryModal month={entry.month} year={year} fee={entry.fee} initial={entry.initial} onClose={() => setEntry(null)} onConfirm={onEntryConfirmed} />
      )}
      {cardDraft && (
        <StripePaymentModal
          draft={cardDraft}
          year={year}
          onClose={() => setCardDraft(null)}
          onPaid={ref => { setPending({ ...cardDraft, reference: ref || 'Stripe card payment' }); setCardDraft(null); }}
          onUseBankTransfer={() => {
            const fee = months.find(m => m.month === cardDraft.month)?.feeUSD || cardDraft.amount;
            setEntry({ month: cardDraft.month, fee, initial: { ...cardDraft, method: 'bank_transfer' } });
            setCardDraft(null);
          }}
        />
      )}
      {pending && (
        <SecurityKeyModal onSuccess={() => { record(pending); setPending(null); }} onClose={() => setPending(null)} />
      )}
      {reverseMonth && (
        <ModalShell title={`Reverse ${reverseMonth} payment?`} subtitle="The month goes back to unpaid. Use this to correct a mistake." onClose={() => setReverseMonth(null)}>
          <div className="px-5 py-3.5 bg-slate-50 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setReverseMonth(null)}>Keep payment</Button>
            <Button variant="danger" onClick={() => reverse(reverseMonth)}>Reverse payment</Button>
          </div>
        </ModalShell>
      )}
    </Page>
  );
};

export default SummaryTable;
