import React, { useState, useMemo } from 'react';
import { Reservation, User, UserPermission, AppData, CompanyDetails } from '../types';
import SecurityKeyModal from './SecurityKeyModal';
import { CurrencyDollarIcon, CheckCircleIcon, LockClosedIcon, ShieldCheckIcon } from './icons';

interface PaymentApprovalsProps {
    allData: AppData;
    onUpdateReservation: (reservation: Reservation) => void;
    currentUser: User | null;
    showConfirmation: (message: string) => void;
    companyDetails: CompanyDetails;
}

const PaymentApprovals: React.FC<PaymentApprovalsProps> = ({ allData, onUpdateReservation, currentUser, showConfirmation, companyDetails }) => {
    const [reservationToApprove, setReservationToApprove] = useState<Reservation | null>(null);
    const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);

    const hasManagePermission = currentUser?.permissions.includes(UserPermission.ACTION_FINANCIALS_MANAGE_PAYMENT_APPROVALS);

    const pendingApprovals = useMemo(() => {
        const pending: Reservation[] = [];
        for (const year in allData) {
            for (const month in allData[year]) {
                allData[year][month].forEach(res => {
                    if (res.paymentConfirmationPending) {
                        pending.push(res);
                    }
                });
            }
        }
        return pending.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    }, [allData]);
    
    const handleApproveClick = (reservation: Reservation) => {
        if (!hasManagePermission) return;
        setReservationToApprove(reservation);
        setIsKeyModalOpen(true);
    };

    const handleKeySuccess = () => {
        if (!reservationToApprove) return;
        
        const updatedReservation = {
            ...reservationToApprove,
            paymentConfirmationPending: false,
            pickupPaymentCollected: true,
        };
        onUpdateReservation(updatedReservation);
        showConfirmation(`Payment for ${reservationToApprove.personName} approved.`);
        setReservationToApprove(null);
        setIsKeyModalOpen(false);
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    };
    
    const getAmountDue = (reservation: Reservation) => {
        const rentalDays = 1; 
        const extrasTotal = (reservation.extras || []).reduce((sum, extra) => extra.isComplementary ? sum : sum + (extra.dailyPrice * rentalDays), 0);
        const unpaidExtensionAmount = reservation.unpaidExtensionAmount || 0;
        return (reservation.amount || 0) + unpaidExtensionAmount;
    };

    const totalDue = useMemo(() => pendingApprovals.reduce((sum, r) => sum + getAmountDue(r), 0), [pendingApprovals]);
    const requesterCount = useMemo(() => new Set(pendingApprovals.map(r => r.paymentConfirmationRequestedBy || 'Unknown')).size, [pendingApprovals]);
    const largest = useMemo(() => pendingApprovals.reduce((max, r) => Math.max(max, getAmountDue(r)), 0), [pendingApprovals]);

    const headers = ['Renter', 'Booking ID', 'Vehicle', 'Requested by', 'Amount due', ''];

    if (!(companyDetails.requirePaymentApproval ?? true)) {
        return (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-12 text-center">
                <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center">
                    <LockClosedIcon className="w-6 h-6" />
                </div>
                <h2 className="mt-4 text-lg font-bold text-slate-900 tracking-tight">Payment approvals are turned off</h2>
                <p className="mt-1 text-sm text-slate-500">The payment approval workflow is currently disabled. Agents can collect payments directly.</p>
                <p className="mt-1 text-xs text-slate-400">An administrator can change this in Company Details.</p>
            </div>
        );
    }

    const renderApprove = (res: Reservation, full?: boolean) => (
        <button
            onClick={() => handleApproveClick(res)}
            disabled={!hasManagePermission}
            title={hasManagePermission ? 'Approve with security key' : 'You do not have permission to approve payments'}
            className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-sm disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed whitespace-nowrap ${full ? 'w-full' : ''}`}
        >
            <CheckCircleIcon className="w-4 h-4 shrink-0" /> Approve
        </button>
    );

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <CurrencyDollarIcon className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Payment approvals</h2>
                            <p className="text-sm text-slate-500">Approve payment collections requested by rental agents.</p>
                        </div>
                    </div>
                    {!hasManagePermission && (
                        <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset bg-slate-50 text-slate-600 ring-slate-200">
                            <LockClosedIcon className="w-3.5 h-3.5" /> View only
                        </span>
                    )}
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-100 divide-x divide-y lg:divide-y-0 divide-slate-100">
                    {[
                        { label: 'Pending', value: pendingApprovals.length, sub: 'awaiting approval', warn: pendingApprovals.length > 0 },
                        { label: 'Total due', value: formatCurrency(totalDue), sub: 'across all requests' },
                        { label: 'Largest request', value: formatCurrency(largest), sub: 'single booking' },
                        { label: 'Requested by', value: requesterCount, sub: requesterCount === 1 ? 'agent' : 'agents' },
                    ].map(k => (
                        <div key={k.label} className="px-5 py-4 min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</p>
                            <p className={`mt-1 text-xl sm:text-2xl font-bold tabular-nums truncate ${k.warn ? 'text-amber-600' : 'text-slate-900'}`}>{k.value}</p>
                            <p className="text-xs text-slate-400">{k.sub}</p>
                        </div>
                    ))}
                </div>
            </div>

            {pendingApprovals.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 sm:p-16 text-center">
                    <div className="mx-auto w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                    <p className="mt-4 font-semibold text-slate-800">No pending approvals</p>
                    <p className="text-sm text-slate-500">Requests from agents will appear here as soon as they are submitted.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Requests · {pendingApprovals.length}</span>
                        <span className="text-xs text-slate-400">Oldest pickup first</span>
                    </div>

                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                                <tr>
                                    {headers.map((h, i) => (
                                        <th key={i} className={`px-5 py-3 font-semibold ${i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {pendingApprovals.map(res => (
                                    <tr key={res.id} className="hover:bg-slate-50/70 transition-colors">
                                        <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 whitespace-nowrap">{res.personName}</td>
                                        <td className="px-5 py-3.5 whitespace-nowrap">
                                            <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-xs text-slate-600">{res.bookingId || '—'}</span>
                                        </td>
                                        <td className="px-5 py-3.5 text-sm text-slate-600 whitespace-nowrap">{res.carModel}</td>
                                        <td className="px-5 py-3.5 text-sm text-slate-600 whitespace-nowrap">{res.paymentConfirmationRequestedBy || 'Unknown'}</td>
                                        <td className="px-5 py-3.5 text-sm text-right font-bold tabular-nums text-rose-600 whitespace-nowrap">{formatCurrency(getAmountDue(res))}</td>
                                        <td className="px-5 py-3.5 text-right whitespace-nowrap">{renderApprove(res)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards */}
                    <ul className="md:hidden divide-y divide-slate-100">
                        {pendingApprovals.map(res => (
                            <li key={res.id} className="p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-900 truncate">{res.personName}</p>
                                        <p className="mt-0.5 text-xs text-slate-500 truncate">
                                            <span className="font-mono">{res.bookingId || '—'}</span> · {res.carModel}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Due</p>
                                        <p className="text-base font-bold tabular-nums text-rose-600">{formatCurrency(getAmountDue(res))}</p>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500">Requested by <span className="font-semibold text-slate-700">{res.paymentConfirmationRequestedBy || 'Unknown'}</span></p>
                                {renderApprove(res, true)}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            
            {isKeyModalOpen && (
                 <SecurityKeyModal
                    onSuccess={handleKeySuccess}
                    onClose={() => { setIsKeyModalOpen(false); setReservationToApprove(null); }}
                />
            )}
        </div>
    );
};

export default PaymentApprovals;
