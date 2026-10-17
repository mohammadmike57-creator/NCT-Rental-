import React, { useMemo, useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { YearData, ReservationStatus, CompanyDetails, AppData, FranchisePayment, User, UserPermission } from '../types';
import { MONTHS, COMMISSION_RATE, NCT_LOGO_B64, USD_TO_JOD_RATE } from '../constants';
import { PdfIcon, CheckCircleIcon, ClockIcon, CurrencyDollarIcon, CloseIcon, CreditCardIcon, AlertIcon, ChartBarIcon } from './icons';
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
}

type Method = NonNullable<FranchisePayment['method']>;
type FeeStatus = 'PAID' | 'WAIVED' | 'OVERDUE' | 'DUE' | 'ACCRUING' | 'UPCOMING';

const METHOD_LABEL: Record<Method, string> = { card: 'Card (Stripe)', bank_transfer: 'Bank transfer', cash: 'Cash', cheque: 'Cheque' };

const STATUS_META: Record<FeeStatus, { label: string; chip: string; dot: string }> = {
  PAID: { label: 'Paid', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  WAIVED: { label: 'Waived', chip: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' },
  OVERDUE: { label: 'Overdue', chip: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
  DUE: { label: 'Due', chip: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  ACCRUING: { label: 'In progress', chip: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  UPCOMING: { label: 'Upcoming', chip: 'bg-white text-slate-400 ring-slate-200', dot: 'bg-slate-300' },
};

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const deadlineFor = (month: string, year: number) => {
  const d = new Date(year, MONTHS.indexOf(month) + 1, DEADLINE_DAY);
  d.setHours(23, 59, 59, 999);
  return d;
};
const shortMonth = (m: string) => m.slice(0, 3);

const StatusChip: React.FC<{ status: FeeStatus }> = ({ status }) => (
  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset whitespace-nowrap ${STATUS_META[status].chip}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[status].dot}`} />{STATUS_META[status].label}
  </span>
);

const ModalShell: React.FC<{ title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; z?: string }> = ({ title, subtitle, onClose, children, z = 'z-50' }) => (
  <div className={`fixed inset-0 ${z} flex items-center justify-center p-4`} role="dialog" aria-modal="true">
    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]" onClick={onClose} />
    <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
      <header className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <button onClick={onClose} aria-label="Close" className="p-1 text-slate-400 hover:text-slate-700"><CloseIcon className="w-5 h-5" /></button>
      </header>
      {children}
    </div>
  </div>
);

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none';

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
      <form onSubmit={submit} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Payment method</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(METHOD_LABEL) as Method[]).map(m => (
              <button key={m} type="button" onClick={() => setMethod(m)}
                className={`px-3 py-2.5 rounded-xl border text-sm font-medium text-left ${method === m ? 'border-indigo-500 ring-2 ring-indigo-500/15 bg-indigo-50/40 text-slate-900' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1">Amount</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className={`${inputCls} text-base font-semibold tabular-nums`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Currency</label>
            <select value={currency} onChange={e => switchCurrency(e.target.value as 'USD' | 'JOD')} className={inputCls}>
              <option value="USD">USD</option>
              <option value="JOD">JOD</option>
            </select>
          </div>
        </div>
        {value > 0 && Math.abs(value - expected) > 0.009 && (
          <p className={`text-xs font-medium ${value < expected ? 'text-amber-700' : 'text-slate-500'}`}>
            {value < expected ? `Short by ${(expected - value).toFixed(2)} ${currency} — this will be recorded as a partial payment.` : `${(value - expected).toFixed(2)} ${currency} more than the fee.`}
          </p>
        )}
        {method !== 'card' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Payment date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} max={new Date().toISOString().slice(0, 10)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Reference {method === 'cash' ? '(optional)' : ''}</label>
              <input value={reference} onChange={e => setReference(e.target.value)} className={inputCls} placeholder={method === 'cheque' ? 'Cheque no.' : 'Transfer ref.'} />
            </div>
          </div>
        )}
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        <div className="pt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-100">Cancel</button>
          <button type="submit" className="px-5 py-2.5 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700">{method === 'card' ? 'Continue to card payment' : 'Continue'}</button>
        </div>
        <p className="text-[11px] text-slate-400">A security key is required to confirm every franchise payment.</p>
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
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[#635bff]/5 border border-[#635bff]/20">
          <span className="w-10 h-10 rounded-xl bg-[#635bff] text-white flex items-center justify-center"><CreditCardIcon className="w-5 h-5" /></span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Secure checkout by Stripe</p>
            <p className="text-xs text-slate-500">Opens in a new tab. Come back here when the payment is complete.</p>
          </div>
        </div>
        {error ? (
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3"><AlertIcon className="w-4 h-4 mt-0.5 shrink-0" />{error}</p>
            <button onClick={onUseBankTransfer} className="w-full py-2.5 text-sm font-semibold border border-slate-200 rounded-xl hover:bg-slate-50">Record a bank transfer instead</button>
          </div>
        ) : (
          <>
            <button disabled={loading || !link} onClick={() => { if (link) { window.open(link, '_blank', 'noopener'); setOpened(true); } }}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-[#635bff] hover:bg-[#534bb3] disabled:bg-slate-300">
              {loading ? 'Preparing secure link…' : 'Open Stripe checkout'}
            </button>
            {opened && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-500">Stripe receipt or payment ID <span className="text-slate-400">(optional)</span></label>
                <input value={reference} onChange={e => setReference(e.target.value)} className={inputCls} placeholder="e.g. pi_3P… or receipt number" />
                <button onClick={() => onPaid(reference.trim())} className="w-full py-2.5 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700">I've completed the payment</button>
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

const SummaryTable: React.FC<SummaryTableProps> = ({ allData, yearData, year, companyDetails, franchisePayments = [], onUpdateFranchisePayment, currentUser }) => {
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

  const months = useMemo(() => MONTHS.map((month, idx) => {
    const list = (yearData && yearData[month]) || [];
    const confirmed = list.filter(r => r.status === ReservationStatus.CONFIRMED && typeof r.amount === 'number' && r.amount >= 0);
    const cancelled = list.filter(r => r.status === ReservationStatus.CANCELLED || (r.status as string) === 'NO_SHOW').length;
    const revenueUSD = confirmed.reduce((s, r) => s + (r.amount || 0), 0);
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
  }), [yearData, year, franchisePayments, now.toDateString()]);

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
  const Kpi: React.FC<{ label: string; value: React.ReactNode; sub: string; tone?: string }> = ({ label, value, sub, tone = 'text-slate-900' }) => (
    <div className="px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-slate-400">{sub}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><ChartBarIcon className="w-6 h-6" /></div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Financial summary {year}</h2>
              <p className="text-sm text-slate-500">Confirmed revenue, {(COMMISSION_RATE * 100).toFixed(1)}% commission and franchise fees by month.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'overview' && (
              <div className="inline-flex p-1 bg-slate-100 rounded-xl">
                {(['USD', 'JOD'] as const).map(c => (
                  <button key={c} onClick={() => setCurrency(c)} className={`px-3 py-1.5 text-sm font-semibold rounded-lg ${currency === c ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>{c}</button>
                ))}
              </div>
            )}
            <button onClick={activeTab === 'overview' ? exportSummaryPDF : exportStatementPDF}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800">
              <PdfIcon className="w-4 h-4" /> {activeTab === 'overview' ? 'Export summary' : 'Export statement'}
            </button>
          </div>
        </div>
        <div className="px-3 sm:px-5 border-t border-slate-100 flex gap-1">
          {([['overview', 'Overview'], ['franchise', 'Franchise fees']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setActiveTab(k)} className={`px-3 py-3 text-sm font-medium border-b-2 -mb-px ${activeTab === k ? 'border-indigo-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {label}
              {k === 'franchise' && fees.overdueCount > 0 && <span className="ml-2 px-1.5 py-0.5 rounded-md text-[11px] bg-rose-100 text-rose-700">{fees.overdueCount} overdue</span>}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' ? (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm grid grid-cols-2 lg:grid-cols-5 divide-x divide-y lg:divide-y-0 divide-slate-100">
            <Kpi label="Confirmed revenue" value={money(totals.revenueUSD * rate)} sub={`${totals.confirmed} confirmed bookings`} />
            <Kpi label="Commission" value={money(totals.commissionUSD * rate)} sub={`${(COMMISSION_RATE * 100).toFixed(1)}% of revenue`} />
            <Kpi label="Average booking" value={money(avgBooking * rate)} sub="per confirmed booking" />
            <Kpi label="Cancellation rate" value={`${cancelRate.toFixed(1)}%`} sub={`${totals.cancelled} of ${totals.bookings} bookings`} tone={cancelRate > 15 ? 'text-amber-600' : 'text-slate-900'} />
            <Kpi label="Best month" value={best ? best.month : '—'} sub={best ? money(best.revenueUSD * rate) : 'no bookings yet'} />
          </div>

          {/* Chart */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Monthly confirmed revenue</h3>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />Revenue</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-200" />Commission</span>
              </div>
            </div>
            <div className="grid grid-cols-12 gap-1.5 sm:gap-3 items-end h-56">
              {months.map(m => {
                const h = (m.revenueUSD / maxRevenue) * 100;
                const ch = (m.commissionUSD / maxRevenue) * 100;
                const current = m.idx === currentMonthIdx;
                return (
                  <div key={m.month} className="flex flex-col items-center h-full justify-end group" title={`${m.month}: ${money(m.revenueUSD * rate)} revenue · ${m.confirmed} confirmed`}>
                    <span className="text-[10px] font-semibold text-slate-500 tabular-nums mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {m.revenueUSD ? money(m.revenueUSD * rate).replace(/\.\d+$/, '') : ''}
                    </span>
                    <div className="relative w-full max-w-[44px] flex-1 flex items-end">
                      <div className={`w-full rounded-t-md ${current ? 'bg-indigo-600' : 'bg-indigo-500'} group-hover:bg-indigo-700 transition-colors`} style={{ height: `${Math.max(h, m.revenueUSD ? 2 : 0)}%` }} />
                      {m.commissionUSD > 0 && <div className="absolute bottom-0 left-0 right-0 bg-indigo-200 rounded-t-sm" style={{ height: `${ch}%` }} />}
                    </div>
                    <span className={`mt-1.5 text-[11px] font-semibold ${current ? 'text-indigo-600' : 'text-slate-500'}`}>{shortMonth(m.month)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Table */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="text-left font-semibold px-5 py-3">Month</th>
                    <th className="text-right font-semibold px-4 py-3">Bookings</th>
                    <th className="text-right font-semibold px-4 py-3">Confirmed</th>
                    <th className="text-right font-semibold px-4 py-3 hidden md:table-cell">Cancelled</th>
                    <th className="text-right font-semibold px-4 py-3">Revenue</th>
                    <th className="text-right font-semibold px-4 py-3 hidden lg:table-cell">Avg booking</th>
                    <th className="text-right font-semibold px-4 py-3">Commission</th>
                    <th className="text-left font-semibold px-5 py-3 hidden md:table-cell">Franchise fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {months.map(m => (
                    <tr key={m.month} className={`${m.idx === currentMonthIdx ? 'bg-indigo-50/40' : 'hover:bg-slate-50/60'} ${!m.started && m.total === 0 ? 'text-slate-400' : ''}`}>
                      <td className="px-5 py-3 font-medium text-slate-900">{m.month}{m.idx === currentMonthIdx && <span className="ml-2 text-[10px] font-bold uppercase text-indigo-600">Current</span>}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{m.total}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{m.confirmed}</td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{m.cancelled}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{money(m.revenueUSD * rate)}</td>
                      <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">{m.confirmed ? money((m.revenueUSD / m.confirmed) * rate) : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(m.commissionUSD * rate)}</td>
                      <td className="px-5 py-3 hidden md:table-cell"><button onClick={() => setActiveTab('franchise')}><StatusChip status={m.status} /></button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white">
                    <td className="px-5 py-3 font-semibold">Total {year}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{totals.bookings}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{totals.confirmed}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold hidden md:table-cell">{totals.cancelled}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold">{money(totals.revenueUSD * rate)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold hidden lg:table-cell">{money(avgBooking * rate)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold">{money(totals.commissionUSD * rate)}</td>
                    <td className="px-5 py-3 hidden md:table-cell text-xs text-slate-300">{usd(fees.paid)} paid</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-100">
            <Kpi label="Paid this year" value={usd(fees.paid)} sub={`${months.filter(m => m.payment).length} payments recorded`} tone="text-emerald-700" />
            <Kpi label="Outstanding" value={usd(fees.outstanding)} sub="due and overdue fees" tone={fees.outstanding > 0 ? 'text-amber-600' : 'text-slate-900'} />
            <Kpi label="Overdue" value={usd(fees.overdue)} sub={fees.overdueCount ? `${fees.overdueCount} month${fees.overdueCount === 1 ? '' : 's'} past deadline` : 'nothing overdue'} tone={fees.overdue > 0 ? 'text-rose-600' : 'text-slate-900'} />
            <Kpi label="Next deadline" value={fees.next ? fees.next.deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'} sub={fees.next ? `${fees.next.month} fee · ${fees.next.status === 'ACCRUING' ? 'est. ' : ''}${usd(fees.next.feeUSD)}` : 'all settled'} />
          </div>

          <div className="flex items-start gap-3 p-4 rounded-2xl bg-white border border-slate-200 text-sm text-slate-600">
            <CurrencyDollarIcon className="w-5 h-5 text-indigo-500 shrink-0" />
            <p>Monthly fee = <strong className="text-slate-900">{(COMMISSION_RATE * 100).toFixed(1)}% of confirmed revenue</strong> + <strong className="text-slate-900">{usd(FIXED_ADDON)} fixed</strong>, due by the {DEADLINE_DAY}th of the following month.{(WAIVED_MONTHS[year] || []).length > 0 && ` Fees for ${WAIVED_MONTHS[year][0]}–${WAIVED_MONTHS[year][WAIVED_MONTHS[year].length - 1]} ${year} are waived.`}</p>
          </div>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="text-left font-semibold px-5 py-3">Month</th>
                    <th className="text-right font-semibold px-4 py-3 hidden md:table-cell">Revenue</th>
                    <th className="text-right font-semibold px-4 py-3 hidden lg:table-cell">Commission</th>
                    <th className="text-right font-semibold px-4 py-3 hidden lg:table-cell">Fixed</th>
                    <th className="text-right font-semibold px-4 py-3">Fee</th>
                    <th className="text-left font-semibold px-4 py-3">Status</th>
                    <th className="text-left font-semibold px-4 py-3 hidden md:table-cell">Payment</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {months.map(m => (
                    <tr key={m.month} className={m.status === 'OVERDUE' ? 'bg-rose-50/30' : 'hover:bg-slate-50/60'}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{m.month}</p>
                        {!m.waived && m.status !== 'PAID' && m.started && <p className={`text-xs ${m.status === 'OVERDUE' ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>Due {m.deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{usd(m.revenueUSD)}</td>
                      <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">{usd(m.commissionUSD)}</td>
                      <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell text-slate-500">{m.waived ? '—' : usd(FIXED_ADDON)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{m.waived ? <span className="text-slate-400 font-normal">Waived</span> : !m.started ? <span className="text-slate-300">—</span> : usd(m.feeUSD)}</td>
                      <td className="px-4 py-3"><StatusChip status={m.status} /></td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {m.payment ? (
                          <div className="text-xs">
                            <p className="font-semibold text-slate-900">{m.payment.currency} {m.payment.amount.toFixed(2)}{m.paidUSD + 0.009 < m.feeUSD && <span className="ml-1.5 text-amber-700">partial</span>}</p>
                            <p className="text-slate-500">{new Date(m.payment.datePaid).toLocaleDateString('en-GB')}{m.payment.method ? ` · ${METHOD_LABEL[m.payment.method]}` : ''} · {m.payment.paidBy}</p>
                            {m.payment.referenceNote && <p className="text-slate-400 truncate max-w-[16rem]" title={m.payment.referenceNote}>{m.payment.referenceNote}</p>}
                          </div>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {canManage && m.payment && (
                          <button onClick={() => setReverseMonth(m.month)} className="text-xs font-semibold text-slate-500 hover:text-rose-600">Reverse</button>
                        )}
                        {canManage && !m.payment && !m.waived && m.started && (
                          <button onClick={() => setEntry({ month: m.month, fee: m.feeUSD })}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${m.status === 'OVERDUE' || m.status === 'DUE' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
                            <CurrencyDollarIcon className="w-3.5 h-3.5" /> Record payment
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white text-sm">
                    <td className="px-5 py-3 font-semibold">Total {year}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{usd(totals.revenueUSD)}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">{usd(totals.commissionUSD)}</td>
                    <td className="hidden lg:table-cell" />
                    <td className="px-4 py-3 text-right tabular-nums font-bold">{usd(fees.due)}</td>
                    <td className="px-4 py-3 text-xs text-slate-300" colSpan={3}>{usd(fees.paid)} paid · {usd(fees.outstanding)} outstanding</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {!canManage && <p className="px-5 py-3 text-xs text-slate-500 border-t border-slate-100">You can view fees. Recording payments requires the “Franchise payments” permission.</p>}
          </section>
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
          <div className="p-6 flex justify-end gap-2">
            <button onClick={() => setReverseMonth(null)} className="px-4 py-2.5 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-100">Keep payment</button>
            <button onClick={() => reverse(reverseMonth)} className="px-5 py-2.5 text-sm font-semibold bg-rose-600 text-white rounded-xl hover:bg-rose-700">Reverse payment</button>
          </div>
        </ModalShell>
      )}
    </div>
  );
};

export default SummaryTable;
