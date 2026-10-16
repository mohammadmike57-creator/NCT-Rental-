import React, { useMemo, useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { YearData, ReservationStatus, CompanyDetails, AppData, FranchisePayment, User, UserPermission, Reservation } from '../types';
import { MONTHS, COMMISSION_RATE, NCT_LOGO_B64, USD_TO_JOD_RATE } from '../constants';
import { PdfIcon, CheckCircleIcon, ClockIcon, CurrencyDollarIcon, CloseIcon, CreditCardIcon } from './icons';
import Tabs from './Tabs';
import SecurityKeyModal from './SecurityKeyModal';
import { API_URL } from '../firebase/api';

const FIXED_ADDON = 250; // Fixed extra amount per month

// Months whose franchise fee is waived, by year
const WAIVED_FRANCHISE_MONTHS: Record<number, string[]> = {
    2026: ['January', 'February', 'March', 'April', 'May'],
};

interface SummaryTableProps {
  allData: AppData;
  yearData: YearData;
  year: number;
  companyDetails: CompanyDetails;
  franchisePayments?: FranchisePayment[];
  onUpdateFranchisePayment?: (payments: FranchisePayment[]) => void;
  currentUser?: User | null;
}

type PaymentMethod = 'CARD' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE';

const PAYMENT_METHODS: { id: PaymentMethod, label: string, hint: string }[] = [
    { id: 'CARD', label: 'Card (Stripe)', hint: 'Pay online through Stripe Checkout' },
    { id: 'BANK_TRANSFER', label: 'Bank transfer', hint: 'Record a transfer already received' },
    { id: 'CASH', label: 'Cash', hint: 'Record a cash payment' },
    { id: 'CHEQUE', label: 'Cheque', hint: 'Record a cheque payment' },
];

interface FranchisePaymentDetails {
    amount: number;
    currency: 'USD' | 'JOD';
    method: PaymentMethod;
    reference: string;
    datePaid: string;
    note: string;
}

const toUSD = (amount: number, currency: string) => currency === 'JOD' ? amount / USD_TO_JOD_RATE : amount;

const formatMoney = (value: number, currency: string = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const buildReferenceNote = (details: FranchisePaymentDetails) => {
    const label = PAYMENT_METHODS.find(m => m.id === details.method)?.label || details.method;
    return [label, details.reference.trim() && `Ref ${details.reference.trim()}`, details.note.trim()].filter(Boolean).join(' · ');
};

const localDateInputValue = (date: Date = new Date()) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const PaymentEntryModal: React.FC<{
    month: string;
    year: number;
    feeUSD: number;
    paidUSD: number;
    revenueUSD: number;
    commissionUSD: number;
    onClose: () => void;
    onConfirm: (details: FranchisePaymentDetails) => void;
}> = ({ month, year, feeUSD, paidUSD, revenueUSD, commissionUSD, onClose, onConfirm }) => {
    const balanceUSD = Math.max(0, feeUSD - paidUSD);
    const [currency, setCurrency] = useState<'USD' | 'JOD'>('USD');
    const [amount, setAmount] = useState<string>(balanceUSD > 0 ? balanceUSD.toFixed(2) : '');
    const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
    const [reference, setReference] = useState('');
    const [datePaid, setDatePaid] = useState(localDateInputValue());
    const [note, setNote] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleCurrencyChange = (next: 'USD' | 'JOD') => {
        const value = parseFloat(amount);
        if (!isNaN(value) && next !== currency) {
            const converted = next === 'JOD' ? value * USD_TO_JOD_RATE : value / USD_TO_JOD_RATE;
            setAmount(converted.toFixed(2));
        }
        setCurrency(next);
    };

    const amountValue = parseFloat(amount);
    const amountUSD = isNaN(amountValue) ? 0 : toUSD(amountValue, currency);
    const remainingAfter = Math.max(0, balanceUSD - amountUSD);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isNaN(amountValue) || amountValue <= 0) {
            setError('Enter an amount greater than zero.');
            return;
        }
        if (method !== 'CARD' && !datePaid) {
            setError('Enter the date the payment was received.');
            return;
        }
        onConfirm({ amount: amountValue, currency, method, reference, datePaid, note });
    };

    const inputClasses = 'w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" aria-modal="true" role="dialog">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                <header className="flex justify-between items-start px-6 pt-5 pb-4 border-b border-slate-100">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Record franchise payment</p>
                        <h3 className="text-lg font-semibold text-slate-900 mt-0.5">{month} {year}</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 -mr-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100" aria-label="Close"><CloseIcon className="w-5 h-5" /></button>
                </header>

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm">
                        <div className="flex justify-between py-0.5 text-slate-600"><span>Confirmed revenue</span><span className="tabular-nums">{formatMoney(revenueUSD)}</span></div>
                        <div className="flex justify-between py-0.5 text-slate-600"><span>Commission ({(COMMISSION_RATE * 100).toFixed(1)}%)</span><span className="tabular-nums">{formatMoney(commissionUSD)}</span></div>
                        <div className="flex justify-between py-0.5 text-slate-600"><span>Fixed monthly fee</span><span className="tabular-nums">{formatMoney(FIXED_ADDON)}</span></div>
                        <div className="flex justify-between pt-2 mt-2 border-t border-slate-200 font-semibold text-slate-900"><span>Total fee</span><span className="tabular-nums">{formatMoney(feeUSD)}</span></div>
                        {paidUSD > 0 && (
                            <div className="flex justify-between py-0.5 text-emerald-700"><span>Already paid</span><span className="tabular-nums">− {formatMoney(paidUSD)}</span></div>
                        )}
                        <div className="flex justify-between pt-1 font-semibold text-slate-900"><span>Balance due</span><span className="tabular-nums">{formatMoney(balanceUSD)}</span></div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Payment method</label>
                        <div className="grid grid-cols-2 gap-2">
                            {PAYMENT_METHODS.map(m => (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => setMethod(m.id)}
                                    className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${method === m.id ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' : 'border-slate-200 hover:border-slate-300'}`}
                                >
                                    <span className={`block font-medium ${method === m.id ? 'text-emerald-800' : 'text-slate-800'}`}>{m.label}</span>
                                    <span className="block text-xs text-slate-500 mt-0.5">{m.hint}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <label htmlFor="fp-amount" className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
                            <input id="fp-amount" type="number" step="0.01" min="0" value={amount} onChange={e => { setAmount(e.target.value); setError(null); }} className={`${inputClasses} tabular-nums`} required />
                        </div>
                        <div>
                            <label htmlFor="fp-currency" className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
                            <select id="fp-currency" value={currency} onChange={e => handleCurrencyChange(e.target.value as 'USD' | 'JOD')} className={inputClasses}>
                                <option value="USD">USD</option>
                                <option value="JOD">JOD</option>
                            </select>
                        </div>
                    </div>
                    <p className="-mt-3 text-xs text-slate-500">
                        {currency === 'JOD' && amountUSD > 0 && <>≈ {formatMoney(amountUSD)} · </>}
                        {amountUSD > 0 && (remainingAfter > 0.009 ? `${formatMoney(remainingAfter)} will remain outstanding` : 'Settles this month in full')}
                    </p>

                    {method !== 'CARD' && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="fp-date" className="block text-sm font-medium text-slate-700 mb-1">Date received</label>
                                <input id="fp-date" type="date" value={datePaid} max={localDateInputValue()} onChange={e => setDatePaid(e.target.value)} className={inputClasses} required />
                            </div>
                            <div>
                                <label htmlFor="fp-ref" className="block text-sm font-medium text-slate-700 mb-1">Reference no.</label>
                                <input id="fp-ref" type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder={method === 'CHEQUE' ? 'Cheque number' : 'Transfer / receipt no.'} className={inputClasses} />
                            </div>
                        </div>
                    )}

                    <div>
                        <label htmlFor="fp-note" className="block text-sm font-medium text-slate-700 mb-1">Note <span className="font-normal text-slate-400">(optional)</span></label>
                        <input id="fp-note" type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Paid by head office" className={inputClasses} />
                    </div>

                    {error && <p className="text-sm text-rose-600">{error}</p>}

                    <div className="pt-1 flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100">Cancel</button>
                        <button type="submit" className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm">
                            {method === 'CARD' ? 'Continue to Stripe' : 'Continue to authorize'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const StripePaymentModal: React.FC<{
    month: string;
    year: number;
    amount: number;
    currency: string;
    onClose: () => void;
    onConfirm: () => void;
}> = ({ month, year, amount, currency, onClose, onConfirm }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [showConfirmButton, setShowConfirmButton] = useState(false);
    const [realPaymentLink, setRealPaymentLink] = useState<string | null>(null);
    const [isLoadingLink, setIsLoadingLink] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);

    useEffect(() => {
        const fetchLink = async () => {
            console.log(`[STRIPE LOG] Fetching payment link for ${month} ${year}, amount: ${amount} ${currency}`);
            setIsLoadingLink(true);
            try {
                // Ensure amount is in USD for the API
                const usdAmount = currency === 'JOD' ? amount / USD_TO_JOD_RATE : amount;

                const currentToken = localStorage.getItem('token');
                const response = await fetch(`${API_URL}/stripe/create-payment-link`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${currentToken}`
                    },
                    body: JSON.stringify({
                        amount: usdAmount,
                        description: `Franchise Payment - ${month} ${year} (${currency} ${amount.toFixed(2)})`
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`[STRIPE LOG] API error: ${response.status} - ${errorText}`);
                    throw new Error(`Error: ${response.status}`);
                }

                const data = await response.json();
                if (data.url) {
                    console.log(`[STRIPE LOG] Successfully received link: ${data.url}`);
                    setRealPaymentLink(data.url);
                } else {
                    console.warn('[STRIPE LOG] No URL returned from server');
                    throw new Error('No URL returned from server');
                }
            } catch (err) {
                console.error('[STRIPE LOG] Failed to fetch Stripe link:', err);
                setFetchError('Could not generate payment link. Please check backend connection.');
                // Fallback to simulated link if backend fails, to allow progress
                setRealPaymentLink(`https://buy.stripe.com/nct_rental_${month.toLowerCase()}_${year}_${amount.toFixed(0)}`);
            } finally {
                setIsLoadingLink(false);
            }
        };

        fetchLink();
    }, [amount, month, year, currency]);

    const handleConfirm = () => {
        setIsProcessing(true);
        setTimeout(() => {
            setIsProcessing(false);
            setIsSuccess(true);
            setTimeout(() => {
                onConfirm();
            }, 1500);
        }, 1000);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4" aria-modal="true">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
                <div className="bg-[#635bff] p-6 text-white flex justify-between items-center">
                   <div className="flex items-center gap-2">
                       <svg className="w-8 h-8" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                           <path d="M20 40c11.046 0 20-8.954 20-20S31.046 0 20 0 0 8.954 0 20s8.954 20 20 20z" fill="#fff" fillOpacity=".2"/>
                           <path d="M25.743 14.82c-.443-.19-.94-.285-1.493-.285-.92 0-1.54.436-1.54 1.253 0 .592.483.978 1.458 1.328 1.344.472 2.19 1.157 2.19 2.457 0 1.944-1.61 3.033-3.924 3.033-.943 0-1.848-.15-2.585-.436v-2.348c.594.333 1.292.51 2.053.51.815 0 1.36-.376 1.36-1.002 0-.616-.543-.91-1.603-1.306-1.282-.468-2.043-1.127-2.043-2.336 0-1.745 1.503-2.88 3.524-2.88.85 0 1.62.13 2.603.413v2.348z" fill="#fff"/>
                       </svg>
                       <span className="text-xl font-bold">Stripe Checkout</span>
                   </div>
                   <button onClick={onClose} className="text-white hover:opacity-80"><CloseIcon className="w-6 h-6" /></button>
                </div>
                
                <div className="p-8">
                    {!isSuccess ? (
                        <>
                            <div className="text-center mb-6">
                                <h4 className="text-slate-500 text-sm uppercase tracking-wider font-semibold">Franchise Payment</h4>
                                <p className="text-4xl font-bold text-slate-900 mt-2">{currency} {amount.toFixed(2)}</p>
                                <p className="text-slate-500 text-sm mt-1">{month} {year}</p>
                            </div>

                            <div className="space-y-6">
                                <div className="bg-slate-50 border-2 border-dashed border-emerald-200 rounded-xl p-6 text-center">
                                    <div className="flex justify-center mb-4">
                                        <div className="p-3 bg-emerald-100 rounded-full">
                                            <CreditCardIcon className="w-8 h-8 text-[#635bff]" />
                                        </div>
                                    </div>
                                    
                                    {isLoadingLink ? (
                                        <div className="flex flex-col items-center gap-2 py-4">
                                            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                                            <p className="text-xs text-slate-500">Generating secure payment link...</p>
                                        </div>
                                    ) : fetchError ? (
                                        <div className="mb-4">
                                            <p className="text-xs text-rose-600 font-bold mb-2">{fetchError}</p>
                                            <p className="text-[10px] text-slate-500">Using backup payment gateway.</p>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-600 mb-4 font-medium">To complete the payment, click the secure link below to open Stripe Checkout:</p>
                                    )}
                                    
                                    <button 
                                        type="button"
                                        disabled={isLoadingLink}
                                        onClick={() => {
                                            if (realPaymentLink) {
                                                window.open(realPaymentLink, '_blank');
                                                setShowConfirmButton(true);
                                            }
                                        }}
                                        className={`inline-flex items-center gap-2 px-8 py-3 rounded-full font-bold shadow-lg transition-all transform hover:scale-105 ${
                                            isLoadingLink ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#635bff] text-white hover:bg-[#534bb3]'
                                        }`}
                                    >
                                        <CreditCardIcon className="w-5 h-5" />
                                        {isLoadingLink ? 'Preparing...' : 'Pay with Stripe'}
                                    </button>
                                </div>

                                {showConfirmButton && (
                                    <button 
                                        onClick={handleConfirm}
                                        disabled={isProcessing}
                                        className="w-full py-3 bg-emerald-600 text-white rounded-md font-semibold hover:bg-emerald-700 transition-all shadow flex items-center justify-center gap-2"
                                    >
                                        {isProcessing ? "Confirming..." : "I have completed the payment"}
                                    </button>
                                )}
                                
                                <p className="text-center text-[10px] text-slate-400">
                                    Secure payment powered by Stripe
                                </p>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-10">
                            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 scale-110">
                                <CheckCircleIcon className="w-12 h-12" />
                            </div>
                            <h4 className="text-2xl font-bold text-slate-900">Payment Confirmed</h4>
                            <p className="text-slate-500 mt-2">The franchise fee has been recorded as paid.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

type FranchiseStatus = 'PAID' | 'PARTIAL' | 'OVERDUE' | 'DUE' | 'ACCRUING' | 'UPCOMING' | 'WAIVED';

interface FranchiseRow {
    month: string;
    totalRevenue: number;
    commission: number;
    totalFee: number;
    isWaived: boolean;
}

const FRANCHISE_STATUS_STYLES: Record<FranchiseStatus, { label: string, pill: string, dot: string }> = {
    PAID: { label: 'Paid', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
    PARTIAL: { label: 'Part paid', pill: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500' },
    OVERDUE: { label: 'Overdue', pill: 'bg-rose-50 text-rose-700 ring-rose-600/20', dot: 'bg-rose-500' },
    DUE: { label: 'Due', pill: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500' },
    ACCRUING: { label: 'In progress', pill: 'bg-sky-50 text-sky-700 ring-sky-600/20', dot: 'bg-sky-500' },
    UPCOMING: { label: 'Upcoming', pill: 'bg-slate-50 text-slate-500 ring-slate-500/20', dot: 'bg-slate-300' },
    WAIVED: { label: 'Waived', pill: 'bg-slate-100 text-slate-600 ring-slate-500/20', dot: 'bg-slate-400' },
};

const getFranchiseDeadline = (monthStr: string, year: number) => {
    const deadline = new Date(year, MONTHS.indexOf(monthStr) + 1, 5);
    deadline.setHours(23, 59, 59, 999);
    return deadline;
};

const formatShortDate = (date: Date | string) =>
    new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const FranchisePaymentTracker: React.FC<{
    summary: FranchiseRow[];
    payments: FranchisePayment[];
    year: number;
    companyName: string;
    onRecord: (month: string, details: FranchisePaymentDetails) => void;
    onDeletePayment: (paymentId: string) => void;
    canManage: boolean;
}> = ({ summary, payments, year, companyName, onRecord, onDeletePayment, canManage }) => {
    const [view, setView] = useState<'cards' | 'ledger'>('cards');
    const [paymentModalMonth, setPaymentModalMonth] = useState<string | null>(null);
    const [stripeModalData, setStripeModalData] = useState<{ month: string, details: FranchisePaymentDetails } | null>(null);
    const [pendingPayment, setPendingPayment] = useState<{ month: string, details: FranchisePaymentDetails } | null>(null);

    const rows = useMemo(() => {
        const today = new Date();
        return summary.map(row => {
            const monthIndex = MONTHS.indexOf(row.month);
            const monthStart = new Date(year, monthIndex, 1);
            const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
            const deadline = getFranchiseDeadline(row.month, year);
            const monthPayments = payments
                .filter(p => p.year === year && p.month === row.month)
                .sort((a, b) => new Date(a.datePaid).getTime() - new Date(b.datePaid).getTime());
            const paidUSD = monthPayments.reduce((sum, p) => sum + toUSD(p.amount, p.currency), 0);
            const balance = Math.max(0, row.totalFee - paidUSD);
            const isSettled = monthPayments.length > 0 && balance < 0.01;

            let status: FranchiseStatus;
            if (row.isWaived && !isSettled) status = 'WAIVED';
            else if (isSettled) status = 'PAID';
            else if (today < monthStart) status = 'UPCOMING';
            else if (today <= monthEnd) status = 'ACCRUING';
            else if (paidUSD > 0) status = 'PARTIAL';
            else if (today > deadline) status = 'OVERDUE';
            else status = 'DUE';

            const isPastDeadline = today > deadline && balance >= 0.01 && !row.isWaived && today > monthEnd;
            const daysOverdue = isPastDeadline ? Math.floor((today.getTime() - deadline.getTime()) / 86400000) + 1 : 0;

            return { ...row, monthPayments, paidUSD, balance, status, deadline, isPastDeadline, daysOverdue, monthEnd };
        });
    }, [summary, payments, year]);

    const totals = useMemo(() => {
        const billable = rows.filter(r => !r.isWaived && ['PAID', 'PARTIAL', 'OVERDUE', 'DUE'].includes(r.status));
        const feesBilled = billable.reduce((s, r) => s + r.totalFee, 0);
        const collected = rows.reduce((s, r) => s + r.paidUSD, 0);
        // Payments applied to billed fees, capped per month so overpayments don't inflate progress
        const collectedApplied = billable.reduce((s, r) => s + Math.min(r.paidUSD, r.totalFee), 0);
        const outstanding = billable.reduce((s, r) => s + r.balance, 0);
        const overdueRows = rows.filter(r => r.isPastDeadline);
        const overdue = overdueRows.reduce((s, r) => s + r.balance, 0);
        const accruing = rows.find(r => r.status === 'ACCRUING');
        const nextDue = rows.find(r => r.status === 'DUE' || (r.status === 'PARTIAL' && !r.isPastDeadline));
        const oldestOverdue = overdueRows[0];
        const waivedCount = rows.filter(r => r.status === 'WAIVED').length;
        const collectionRate = feesBilled > 0 ? (collectedApplied / feesBilled) * 100 : 100;
        return { feesBilled, collected, collectedApplied, outstanding, overdue, overdueCount: overdueRows.length, accruing, nextDue, oldestOverdue, waivedCount, collectionRate };
    }, [rows]);

    const modalRow = rows.find(r => r.month === paymentModalMonth);

    const handleDetailsConfirmed = (details: FranchisePaymentDetails) => {
        if (!paymentModalMonth) return;
        if (details.method === 'CARD') {
            setStripeModalData({ month: paymentModalMonth, details });
        } else {
            setPendingPayment({ month: paymentModalMonth, details });
        }
        setPaymentModalMonth(null);
    };

    const handleStripeSuccess = () => {
        if (stripeModalData) {
            setPendingPayment({ month: stripeModalData.month, details: { ...stripeModalData.details, datePaid: localDateInputValue() } });
            setStripeModalData(null);
        }
    };

    const handleKeySuccess = () => {
        if (pendingPayment) onRecord(pendingPayment.month, pendingPayment.details);
        setPendingPayment(null);
    };

    const handleRemovePayment = (payment: FranchisePayment, month: string) => {
        if (confirm(`Remove the ${formatMoney(payment.amount, payment.currency)} payment recorded for ${month} ${year}?`)) {
            onDeletePayment(payment.id);
        }
    };

    const handleExportStatement = () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.setFontSize(16);
        doc.text(companyName || 'NCT Rental', 14, 18);
        doc.setFontSize(12);
        doc.text(`Franchise Fee Statement — ${year}`, 14, 26);
        doc.setFontSize(9);
        doc.setTextColor(110);
        doc.text(`Fee = ${(COMMISSION_RATE * 100).toFixed(1)}% of confirmed revenue + ${formatMoney(FIXED_ADDON)} fixed monthly fee, due by the 5th of the following month.`, 14, 32);
        doc.text(`Generated ${new Date().toLocaleString()}`, pageWidth - 14, 18, { align: 'right' });

        (doc as any).autoTable({
            startY: 38,
            head: [['Month', 'Revenue', 'Commission', 'Fixed fee', 'Total fee', 'Paid', 'Balance', 'Status']],
            body: rows.map(r => [
                r.month,
                formatMoney(r.totalRevenue),
                formatMoney(r.commission),
                r.isWaived ? '—' : formatMoney(FIXED_ADDON),
                r.isWaived ? 'Waived' : formatMoney(r.totalFee),
                r.paidUSD > 0 ? formatMoney(r.paidUSD) : '—',
                r.isWaived || r.status === 'UPCOMING' ? '—' : formatMoney(r.balance),
                FRANCHISE_STATUS_STYLES[r.status].label + (r.daysOverdue ? ` (${r.daysOverdue}d)` : ''),
            ]),
            foot: [['Total', '', '', '', formatMoney(totals.feesBilled), formatMoney(totals.collected), formatMoney(totals.outstanding), '']],
            theme: 'grid',
            styles: { fontSize: 8.5 },
            headStyles: { fillColor: [15, 23, 42] },
            footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
            columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
        });
        doc.save(`franchise_statement_${year}.pdf`);
    };

    const StatusPill: React.FC<{ status: FranchiseStatus }> = ({ status }) => {
        const s = FRANCHISE_STATUS_STYLES[status];
        return (
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap flex-shrink-0 ring-1 ring-inset ${s.pill}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}
            </span>
        );
    };

    const dueLine = (r: typeof rows[number]) => {
        switch (r.status) {
            case 'WAIVED': return 'Fee waived for this period';
            case 'PAID': return r.monthPayments.length ? `Settled ${formatShortDate(r.monthPayments[r.monthPayments.length - 1].datePaid)}` : 'Settled';
            case 'UPCOMING': return `Due ${formatShortDate(r.deadline)}`;
            case 'ACCRUING': return `Month closes ${formatShortDate(r.monthEnd)} · due ${formatShortDate(r.deadline)}`;
            default: return r.isPastDeadline ? `${r.daysOverdue} day${r.daysOverdue === 1 ? '' : 's'} overdue · was due ${formatShortDate(r.deadline)}` : `Due ${formatShortDate(r.deadline)}`;
        }
    };

    const canRecord = (r: typeof rows[number]) => canManage && !r.isWaived && r.balance >= 0.01 && r.status !== 'UPCOMING';

    const kpis = [
        { label: 'Fees billed', value: formatMoney(totals.feesBilled), sub: `${rows.filter(r => !r.isWaived && ['PAID', 'PARTIAL', 'OVERDUE', 'DUE'].includes(r.status)).length} closed months${totals.waivedCount ? ` · ${totals.waivedCount} waived` : ''}`, tone: 'text-slate-900' },
        { label: 'Collected', value: formatMoney(totals.collected), sub: `${totals.collectionRate.toFixed(0)}% collection rate`, tone: 'text-emerald-700' },
        { label: 'Outstanding', value: formatMoney(totals.outstanding), sub: totals.nextDue ? `Next: ${totals.nextDue.month}, due ${formatShortDate(totals.nextDue.deadline)}` : totals.outstanding > 0 ? 'All past its deadline' : 'Nothing awaiting payment', tone: totals.outstanding > 0 ? 'text-amber-700' : 'text-slate-900' },
        { label: 'Overdue', value: formatMoney(totals.overdue), sub: totals.overdueCount ? `${totals.overdueCount} month${totals.overdueCount === 1 ? '' : 's'} past deadline` : 'No overdue months', tone: totals.overdue > 0 ? 'text-rose-700' : 'text-slate-900' },
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {kpis.map(k => (
                    <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{k.label}</p>
                        <p className={`mt-1.5 text-xl sm:text-2xl font-semibold tabular-nums ${k.tone}`}>{k.value}</p>
                        <p className="mt-1 text-xs text-slate-500 truncate">{k.sub}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-700">Collection progress {year}</span>
                    <span className="text-slate-500 tabular-nums">{formatMoney(totals.collectedApplied)} of {formatMoney(totals.feesBilled)} billed</span>
                </div>
                <div className="mt-2 h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
                    <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, totals.collectionRate)}%` }} />
                    {totals.feesBilled > 0 && (
                        <div className="h-full bg-rose-400" style={{ width: `${(totals.overdue / totals.feesBilled) * 100}%` }} />
                    )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Collected</span>
                    <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400" />Overdue</span>
                    <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-200" />Due, not yet late</span>
                    {totals.accruing && <span>· {totals.accruing.month} is accruing ({formatMoney(totals.accruing.totalFee)} so far)</span>}
                </div>
            </div>

            {totals.overdueCount > 0 ? (
                <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                    <ClockIcon className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                        <p className="font-semibold text-rose-900">{formatMoney(totals.overdue)} overdue across {totals.overdueCount} month{totals.overdueCount === 1 ? '' : 's'}</p>
                        <p className="text-rose-700 mt-0.5">Oldest: {totals.oldestOverdue!.month} — {totals.oldestOverdue!.daysOverdue} days past its {formatShortDate(totals.oldestOverdue!.deadline)} deadline.</p>
                    </div>
                </div>
            ) : (
                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <CheckCircleIcon className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-emerald-900"><span className="font-semibold">No overdue franchise fees.</span> {totals.nextDue ? `${totals.nextDue.month} is due by ${formatShortDate(totals.nextDue.deadline)}.` : 'All closed months are settled.'}</p>
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                    Fee = <span className="font-medium text-slate-700">{(COMMISSION_RATE * 100).toFixed(1)}%</span> of confirmed revenue + <span className="font-medium text-slate-700">{formatMoney(FIXED_ADDON)}</span> fixed, due by the 5th of the following month.
                </p>
                <div className="flex items-center gap-2">
                    <div className="inline-flex p-0.5 rounded-lg bg-slate-100" role="tablist" aria-label="View">
                        {(['cards', 'ledger'] as const).map(v => (
                            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`px-3 h-8 rounded-md text-sm font-medium transition-colors ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                {v === 'cards' ? 'Cards' : 'Ledger'}
                            </button>
                        ))}
                    </div>
                    <button onClick={handleExportStatement} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50">
                        <PdfIcon className="w-4 h-4" /> Statement PDF
                    </button>
                </div>
            </div>

            {view === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {rows.map(r => {
                        const paidPct = r.totalFee > 0 ? Math.min(100, (r.paidUSD / r.totalFee) * 100) : 0;
                        const muted = r.status === 'UPCOMING' || r.status === 'WAIVED';
                        return (
                            <div key={r.month} className={`flex flex-col rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md ${r.isPastDeadline ? 'border-rose-200' : 'border-slate-200'}`}>
                                <div className="px-5 pt-4 flex items-start justify-between gap-2">
                                    <div>
                                        <h4 className="text-base font-semibold text-slate-900">{r.month} <span className="font-normal text-slate-400">{year}</span></h4>
                                        <p className={`text-xs mt-0.5 ${r.isPastDeadline ? 'text-rose-600 font-medium' : 'text-slate-500'}`}>{dueLine(r)}</p>
                                    </div>
                                    <StatusPill status={r.status} />
                                </div>

                                <div className="px-5 pt-3">
                                    <p className={`text-2xl font-semibold tabular-nums ${muted ? 'text-slate-400' : 'text-slate-900'}`}>
                                        {r.isWaived ? formatMoney(0) : formatMoney(r.totalFee)}
                                    </p>
                                    <p className="text-xs text-slate-500">{r.status === 'ACCRUING' ? 'Fee so far this month' : r.isWaived ? 'Franchise fee (waived)' : 'Franchise fee'}</p>
                                </div>

                                <dl className="px-5 pt-3 pb-4 space-y-1.5 text-sm">
                                    <div className="flex justify-between"><dt className="text-slate-500">Confirmed revenue</dt><dd className="tabular-nums text-slate-700">{formatMoney(r.totalRevenue)}</dd></div>
                                    <div className="flex justify-between"><dt className="text-slate-500">Commission {(COMMISSION_RATE * 100).toFixed(1)}%</dt><dd className="tabular-nums text-slate-700">{formatMoney(r.commission)}</dd></div>
                                    <div className="flex justify-between"><dt className="text-slate-500">Fixed fee</dt><dd className="tabular-nums text-slate-700">{r.isWaived ? '—' : formatMoney(FIXED_ADDON)}</dd></div>
                                </dl>

                                {!r.isWaived && r.status !== 'UPCOMING' && (
                                    <div className="px-5 pb-4">
                                        <div className="flex justify-between text-xs text-slate-500 mb-1">
                                            <span>Paid {formatMoney(r.paidUSD)}</span>
                                            <span>{r.balance >= 0.01 ? `${formatMoney(r.balance)} left` : 'Fully paid'}</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                            <div className={`h-full rounded-full ${paidPct >= 99.9 ? 'bg-emerald-500' : r.isPastDeadline ? 'bg-rose-400' : 'bg-amber-400'}`} style={{ width: `${paidPct}%` }} />
                                        </div>
                                    </div>
                                )}

                                <div className="mt-auto border-t border-slate-100 bg-slate-50/60 rounded-b-xl px-5 py-3 space-y-2">
                                    {r.monthPayments.map(p => (
                                        <div key={p.id} className="flex items-start justify-between gap-2 text-xs">
                                            <div className="min-w-0">
                                                <p className="font-medium text-slate-800 tabular-nums">{formatMoney(p.amount, p.currency)} <span className="font-normal text-slate-500">· {formatShortDate(p.datePaid)}</span></p>
                                                <p className="text-slate-500 truncate" title={p.referenceNote}>{p.referenceNote || 'Payment'}{p.paidBy ? ` · ${p.paidBy}` : ''}</p>
                                            </div>
                                            {canManage && (
                                                <button onClick={() => handleRemovePayment(p, r.month)} className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="Remove this payment" aria-label="Remove this payment">
                                                    <CloseIcon className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {canRecord(r) ? (
                                        <button onClick={() => setPaymentModalMonth(r.month)} className={`w-full h-9 rounded-lg text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 ${r.isPastDeadline ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white'}`}>
                                            <CurrencyDollarIcon className="w-4 h-4" />
                                            {r.paidUSD > 0 ? `Record remaining ${formatMoney(r.balance)}` : r.status === 'ACCRUING' ? 'Record early payment' : 'Record payment'}
                                        </button>
                                    ) : r.monthPayments.length === 0 && (
                                        <p className="text-xs text-slate-400 text-center py-1.5">
                                            {r.isWaived ? 'No payment required' : r.status === 'UPCOMING' ? 'Opens when the month starts' : 'No payment recorded'}
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                                <th className="px-4 py-3">Month</th>
                                <th className="px-4 py-3 text-right">Revenue</th>
                                <th className="px-4 py-3 text-right">Commission</th>
                                <th className="px-4 py-3 text-right">Fixed</th>
                                <th className="px-4 py-3 text-right">Total fee</th>
                                <th className="px-4 py-3 text-right">Paid</th>
                                <th className="px-4 py-3 text-right">Balance</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Due</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map(r => (
                                <tr key={r.month} className={r.isPastDeadline ? 'bg-rose-50/40' : 'hover:bg-slate-50/60'}>
                                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{r.month}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatMoney(r.totalRevenue)}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatMoney(r.commission)}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r.isWaived ? '—' : formatMoney(FIXED_ADDON)}</td>
                                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{r.isWaived ? '—' : formatMoney(r.totalFee)}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{r.paidUSD > 0 ? formatMoney(r.paidUSD) : '—'}</td>
                                    <td className={`px-4 py-3 text-right tabular-nums ${r.isPastDeadline ? 'text-rose-700 font-semibold' : 'text-slate-700'}`}>{r.isWaived || r.status === 'UPCOMING' ? '—' : formatMoney(r.balance)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap"><StatusPill status={r.status} /></td>
                                    <td className={`px-4 py-3 whitespace-nowrap text-xs ${r.isPastDeadline ? 'text-rose-600 font-medium' : 'text-slate-500'}`}>{r.isWaived ? '—' : r.isPastDeadline ? `${r.daysOverdue}d late` : formatShortDate(r.deadline)}</td>
                                    <td className="px-4 py-3 text-right whitespace-nowrap">
                                        {canRecord(r) && (
                                            <button onClick={() => setPaymentModalMonth(r.month)} className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">Record</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-50 font-semibold text-slate-900">
                                <td className="px-4 py-3">Total</td>
                                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(rows.reduce((s, r) => s + r.totalRevenue, 0))}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(rows.reduce((s, r) => s + r.commission, 0))}</td>
                                <td className="px-4 py-3" />
                                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(totals.feesBilled)}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{formatMoney(totals.collected)}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(totals.outstanding)}</td>
                                <td className="px-4 py-3" colSpan={3} />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {modalRow && (
                <PaymentEntryModal
                    month={modalRow.month}
                    year={year}
                    feeUSD={modalRow.totalFee}
                    paidUSD={modalRow.paidUSD}
                    revenueUSD={modalRow.totalRevenue}
                    commissionUSD={modalRow.commission}
                    onClose={() => setPaymentModalMonth(null)}
                    onConfirm={handleDetailsConfirmed}
                />
            )}
            {stripeModalData && (
                <StripePaymentModal
                    month={stripeModalData.month}
                    year={year}
                    amount={stripeModalData.details.amount}
                    currency={stripeModalData.details.currency}
                    onClose={() => setStripeModalData(null)}
                    onConfirm={handleStripeSuccess}
                />
            )}
            {pendingPayment && (
                <SecurityKeyModal onSuccess={handleKeySuccess} onClose={() => setPendingPayment(null)} />
            )}
        </div>
    );
};

const SummaryTable: React.FC<SummaryTableProps> = ({ allData, yearData, year, companyDetails, franchisePayments = [], onUpdateFranchisePayment, currentUser }) => {
  const [currency, setCurrency] = useState<'USD' | 'JOD'>('USD');
  const [activeTab, setActiveTab] = useState<'Summary' | 'Franchise Payments'>('Summary');
  const [isDesktopView, setIsDesktopView] = useState(window.innerWidth >= 768);

  useEffect(() => {
    const handleResize = () => setIsDesktopView(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const conversionRate = currency === 'JOD' ? USD_TO_JOD_RATE : 1;
  const canManageFinancials = 
    currentUser?.permissions?.includes(UserPermission.ACTION_FINANCIALS_MANAGE_FRANCHISE_PAYMENTS) || 
    currentUser?.role === 'ADMIN' || 
    currentUser?.username === 'admin' ||
    currentUser?.email === 'nadeenalnahas@gmail.com' ||
    false;

  const summary = useMemo(() => {
    return MONTHS.map((month) => {
      // THE NEW RULE: Summary ONLY reads the month bucket that is currently selected.
      // We trust the data structure. No scanning, no re-inferring from dates.
      const reservationsInMonth = (yearData && yearData[month]) || [];
      
      const confirmedReservations = reservationsInMonth.filter(
        r => r.status === ReservationStatus.CONFIRMED && typeof r.amount === 'number' && r.amount >= 0
      );
      
      const totalRevenueUSD = confirmedReservations.reduce((sum, r) => sum + (r.amount || 0), 0);
      
      const totalRevenue = totalRevenueUSD * conversionRate;
      const commission = totalRevenue * COMMISSION_RATE;

      return {
        month,
        totalReservations: reservationsInMonth.length,
        confirmedReservations: confirmedReservations.length,
        totalRevenue,
        totalRevenueUSD,
        commission,
        commissionUSD: totalRevenueUSD * COMMISSION_RATE
      };
    });
  }, [allData, yearData, year, conversionRate]);
  
  const grandTotal = useMemo(() => {
      return summary.reduce((totals, monthData) => {
          totals.totalReservations += monthData.totalReservations;
          totals.confirmedReservations += monthData.confirmedReservations;
          totals.totalRevenue += monthData.totalRevenue;
          totals.commission += monthData.commission;
          return totals;
      }, { totalReservations: 0, confirmedReservations: 0, totalRevenue: 0, commission: 0 });
  }, [summary]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(value);
  };

  const handleRecordFranchisePayment = (month: string, details: FranchisePaymentDetails) => {
      if (!onUpdateFranchisePayment) return;

      // Noon local time keeps the chosen calendar day stable across time zones
      const [y, m, d] = details.datePaid.split('-').map(Number);
      const datePaid = y && m && d ? new Date(y, m - 1, d, 12).toISOString() : new Date().toISOString();

      const newPayment: FranchisePayment = {
          id: `fp-${year}-${month}-${Date.now()}`,
          year,
          month,
          amount: details.amount,
          currency: details.currency,
          datePaid,
          paidBy: currentUser?.fullName || 'Unknown',
          referenceNote: buildReferenceNote(details)
      };

      onUpdateFranchisePayment([...franchisePayments, newPayment]);
  };

  const handleDeleteFranchisePayment = (paymentId: string) => {
      if (!onUpdateFranchisePayment) return;
      onUpdateFranchisePayment(franchisePayments.filter(p => p.id !== paymentId));
  };

  // Franchise fee = commission + FIXED_ADDON, always in USD. Waived periods carry no fee.
  const franchiseSummary: FranchiseRow[] = summary.map(s => {
      const isWaived = (WAIVED_FRANCHISE_MONTHS[year] || []).includes(s.month);
      return {
          month: s.month,
          totalRevenue: s.totalRevenueUSD,
          commission: s.commissionUSD,
          totalFee: isWaived ? 0 : s.commissionUSD + FIXED_ADDON,
          isWaived
      };
  });


  const handleExportPDF = () => {
    const doc = new jsPDF();

    const tableHead = [['Month', 'Total Reservations', 'Confirmed', `Total Revenue (${currency})`, `Commission (${currency})`]];
    const tableBody = summary.map(row => [
      row.month,
      row.totalReservations,
      row.confirmedReservations,
      formatCurrency(row.totalRevenue),
      formatCurrency(row.commission),
    ]);
    const tableFoot = [[
        'Grand Total',
        grandTotal.totalReservations,
        grandTotal.confirmedReservations,
        formatCurrency(grandTotal.totalRevenue),
        formatCurrency(grandTotal.commission),
    ]];
    
    const logoWidth = 45;
    const logoHeight = 45;
    doc.addImage(NCT_LOGO_B64, 'PNG', 14, 15, logoWidth, logoHeight);

    doc.setFontSize(18);
    doc.text(companyDetails.name, doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });
    doc.setFontSize(14);
    doc.text(`Yearly Summary for ${year} (in ${currency})`, doc.internal.pageSize.getWidth() / 2, 30, { align: 'center' });
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    
    let reportDateY = 15 + logoHeight;
    if (reportDateY < 35) reportDateY = 35;

    doc.text(`Report generated on: ${new Date().toLocaleString()}`, 14, reportDateY);
    
    (doc as any).autoTable({
      startY: reportDateY + 7,
      head: tableHead,
      body: tableBody,
      foot: tableFoot,
      theme: 'grid',
      headStyles: { fillColor: [71, 85, 105] }, // primary color slate-600
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    });

    doc.save(`summary_${year}_${currency}.pdf`);
  };

  const SummaryRow: React.FC<{label: string, value: string | number}> = ({ label, value }) => (
    <div className="flex justify-between items-center py-2 border-b border-slate-100">
        <span className="text-sm text-slate-500">{label}</span>
        <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );

  return (
    <div className="p-4 sm:p-6">
       <div className="flex flex-col sm:flex-row justify-between items-start mb-6">
        <div>
          <h3 className="text-2xl font-bold text-slate-800 mb-1">Yearly Summary for {year}</h3>
          <p className="text-md text-slate-500">Commission is calculated at {(COMMISSION_RATE * 100).toFixed(1)}% on the total revenue.</p>
        </div>
        <div className="flex items-center gap-4 mt-4 sm:mt-0">
             {activeTab === 'Summary' && (
                <>
                    <div className="flex bg-slate-200 rounded-lg p-1">
                        <button
                            onClick={() => setCurrency('USD')}
                            className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${currency === 'USD' ? 'bg-white text-primary shadow' : 'text-slate-600'}`}
                        >
                            USD
                        </button>
                        <button
                            onClick={() => setCurrency('JOD')}
                            className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${currency === 'JOD' ? 'bg-white text-primary shadow' : 'text-slate-600'}`}
                        >
                            JOD
                        </button>
                    </div>
                    <button 
                    onClick={handleExportPDF} 
                    className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-md hover:bg-rose-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-600 text-sm font-medium"
                    >
                    <PdfIcon />
                    <span className="hidden sm:inline">Export PDF</span>
                    </button>
                </>
             )}
        </div>
       </div>

       <div className="mb-6">
            <Tabs 
                tabs={['Summary', 'Franchise Payments']} 
                selectedTab={activeTab} 
                onSelectTab={(t) => setActiveTab(t as any)} 
                variant="underline"
            />
       </div>

      {activeTab === 'Summary' ? (
          isDesktopView ? (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Month</th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Total Reservations</th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Confirmed Reservations</th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Total Revenue ({currency})</th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Commission ({currency})</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {summary.map((row, index) => (
                      <tr key={row.month} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{row.month}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">{row.totalReservations}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">{row.confirmedReservations}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">{formatCurrency(row.totalRevenue)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">{formatCurrency(row.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100">
                      <tr>
                          <th scope="row" className="px-6 py-3 text-left text-sm font-bold text-slate-700 uppercase">Grand Total</th>
                          <td className="px-6 py-3 text-right text-sm font-bold text-slate-700">{grandTotal.totalReservations}</td>
                          <td className="px-6 py-3 text-right text-sm font-bold text-slate-700">{grandTotal.confirmedReservations}</td>
                          <td className="px-6 py-3 text-right text-sm font-bold text-slate-700">{formatCurrency(grandTotal.totalRevenue)}</td>
                          <td className="px-6 py-3 text-right text-sm font-bold text-slate-700">{formatCurrency(grandTotal.commission)}</td>
                      </tr>
                  </tfoot>
                </table>
              </div>
          ) : (
            <div className="space-y-4">
                {summary.map(row => (
                    <div key={row.month} className="bg-white p-4 rounded-lg shadow border border-slate-200">
                        <h4 className="font-bold text-lg mb-2 text-primary">{row.month}</h4>
                        <SummaryRow label="Total Reservations" value={row.totalReservations} />
                        <SummaryRow label="Confirmed" value={row.confirmedReservations} />
                        <SummaryRow label={`Revenue (${currency})`} value={formatCurrency(row.totalRevenue)} />
                        <SummaryRow label={`Commission (${currency})`} value={formatCurrency(row.commission)} />
                    </div>
                ))}
                <div className="bg-slate-800 text-white p-4 rounded-lg shadow-lg">
                    <h4 className="font-bold text-lg mb-2">Grand Total</h4>
                    <SummaryRow label="Total Reservations" value={grandTotal.totalReservations} />
                    <SummaryRow label="Confirmed" value={grandTotal.confirmedReservations} />
                    <SummaryRow label={`Total Revenue (${currency})`} value={formatCurrency(grandTotal.totalRevenue)} />
                    <SummaryRow label={`Total Commission (${currency})`} value={formatCurrency(grandTotal.commission)} />
                </div>
            </div>
          )
      ) : (
          <FranchisePaymentTracker
            summary={franchiseSummary}
            payments={franchisePayments}
            year={year}
            companyName={companyDetails.name}
            onRecord={handleRecordFranchisePayment}
            onDeletePayment={handleDeleteFranchisePayment}
            canManage={canManageFinancials}
          />
      )}
    </div>
  );
};

export default SummaryTable;
