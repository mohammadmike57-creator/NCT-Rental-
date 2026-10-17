import React, { useMemo, useState } from 'react';
import { AppData, Reservation, User, UserPermission } from '../types';
import { CurrencyDollarIcon, CheckCircleIcon, LockClosedIcon, ShieldCheckIcon } from './icons';
import ConfirmationDialog from './ConfirmationDialog';
import SecurityKeyModal from './SecurityKeyModal';

interface DeferredPaymentsProps {
    allData: AppData;
    onCollectPayment: (reservationId: string) => void;
    currentUser: User | null;
}

const DeferredPayments: React.FC<DeferredPaymentsProps> = ({ allData, onCollectPayment, currentUser }) => {
    const [paymentToCollect, setPaymentToCollect] = useState<Reservation | null>(null);
    const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);

    const hasManagePermission = currentUser?.permissions.includes(UserPermission.ACTION_FINANCIALS_MANAGE_DEFERRED_PAYMENTS);

    const deferredPayments = useMemo(() => {
        const payments: Reservation[] = [];
        for (const year in allData) {
            for (const month in allData[year]) {
                allData[year][month].forEach(res => {
                    if (res.unpaidExtensionAmount && res.unpaidExtensionAmount > 0) {
                        payments.push(res);
                    }
                });
            }
        }
        return payments.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
    }, [allData]);

    const handleCollectAttempt = (reservation: Reservation) => {
        setPaymentToCollect(reservation);
        if (hasManagePermission) {
            setIsKeyModalOpen(true);
        } else {
            alert("You don't have permission to perform this action.");
        }
    };
    
    const handleKeySuccess = () => {
        setIsKeyModalOpen(false);
        // After security key success, we show the final confirmation dialog, which is triggered by paymentToCollect still being set
    };
    
    const handleConfirmCollection = () => {
        if (paymentToCollect) {
            onCollectPayment(paymentToCollect.id);
        }
        setPaymentToCollect(null); // This will close the confirmation dialog
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    };

    const formatDate = (value?: string) => {
        if (!value) return '—';
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        const hasTime = value.includes('T');
        return d.toLocaleString('en-GB', hasTime
            ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
            : { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const isOverdue = (value?: string) => {
        if (!value) return false;
        const d = new Date(value);
        return !isNaN(d.getTime()) && d.getTime() < Date.now();
    };

    const kpis = useMemo(() => {
        const total = deferredPayments.reduce((s, r) => s + (r.unpaidExtensionAmount || 0), 0);
        const overdue = deferredPayments.filter(r => isOverdue(r.endDate));
        const overdueTotal = overdue.reduce((s, r) => s + (r.unpaidExtensionAmount || 0), 0);
        return { total, overdueCount: overdue.length, overdueTotal };
    }, [deferredPayments]);

    const renderCollect = (res: Reservation, full?: boolean) => (
        <button
            onClick={() => handleCollectAttempt(res)}
            disabled={!hasManagePermission}
            title={hasManagePermission ? 'Mark this payment as collected' : 'You do not have permission to collect payments'}
            className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-sm disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed whitespace-nowrap ${full ? 'w-full' : ''}`}
        >
            <CheckCircleIcon className="w-4 h-4 shrink-0" /> Mark as collected
        </button>
    );

    const renderStatus = (res: Reservation) => isOverdue(res.endDate) ? (
        <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset bg-rose-50 text-rose-700 ring-rose-200">Past return</span>
    ) : (
        <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset bg-amber-50 text-amber-700 ring-amber-200">On rent</span>
    );

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                            <CurrencyDollarIcon className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Deferred payments</h2>
                            <p className="text-sm text-slate-500">Collect outstanding amounts from "Pay Later" rental extensions.</p>
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
                        { label: 'Outstanding', value: deferredPayments.length, sub: deferredPayments.length === 1 ? 'extension' : 'extensions', warn: deferredPayments.length > 0 },
                        { label: 'Total due', value: formatCurrency(kpis.total), sub: 'to be collected' },
                        { label: 'Past return', value: kpis.overdueCount, sub: 'return date passed', danger: kpis.overdueCount > 0 },
                        { label: 'Past-return value', value: formatCurrency(kpis.overdueTotal), sub: 'collect first', danger: kpis.overdueTotal > 0 },
                    ].map(k => (
                        <div key={k.label} className="px-5 py-4 min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</p>
                            <p className={`mt-1 text-xl sm:text-2xl font-bold tabular-nums truncate ${k.danger ? 'text-rose-600' : k.warn ? 'text-amber-600' : 'text-slate-900'}`}>{k.value}</p>
                            <p className="text-xs text-slate-400">{k.sub}</p>
                        </div>
                    ))}
                </div>
            </div>

            {deferredPayments.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 sm:p-16 text-center">
                    <div className="mx-auto w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                    <p className="mt-4 font-semibold text-slate-800">All deferred payments are collected</p>
                    <p className="text-sm text-slate-500">Extensions booked as "Pay Later" will appear here until they are paid.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Extensions · {deferredPayments.length}</span>
                        <span className="text-xs text-slate-400">Earliest return first</span>
                    </div>

                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-5 py-3 text-left font-semibold">Renter</th>
                                    <th className="px-5 py-3 text-left font-semibold">Booking ID</th>
                                    <th className="px-5 py-3 text-left font-semibold">Vehicle</th>
                                    <th className="px-5 py-3 text-left font-semibold">New return date</th>
                                    <th className="px-5 py-3 text-left font-semibold">Status</th>
                                    <th className="px-5 py-3 text-right font-semibold">Amount due</th>
                                    <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {deferredPayments.map(res => (
                                    <tr key={res.id} className="hover:bg-slate-50/70 transition-colors">
                                        <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 whitespace-nowrap">{res.personName}</td>
                                        <td className="px-5 py-3.5 whitespace-nowrap">
                                            <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-xs text-slate-600">{res.bookingId || '—'}</span>
                                        </td>
                                        <td className="px-5 py-3.5 text-sm text-slate-600 whitespace-nowrap">{res.carModel}</td>
                                        <td className="px-5 py-3.5 text-sm text-slate-600 tabular-nums whitespace-nowrap">{formatDate(res.endDate)}</td>
                                        <td className="px-5 py-3.5 whitespace-nowrap">{renderStatus(res)}</td>
                                        <td className="px-5 py-3.5 text-sm text-right font-bold tabular-nums text-rose-600 whitespace-nowrap">{formatCurrency(res.unpaidExtensionAmount || 0)}</td>
                                        <td className="px-5 py-3.5 text-right whitespace-nowrap">{renderCollect(res)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards */}
                    <ul className="md:hidden divide-y divide-slate-100">
                        {deferredPayments.map(res => (
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
                                        <p className="text-base font-bold tabular-nums text-rose-600">{formatCurrency(res.unpaidExtensionAmount || 0)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-xs">
                                    <span className="text-slate-500 min-w-0 truncate">Returns <span className="font-semibold text-slate-700 tabular-nums">{formatDate(res.endDate)}</span></span>
                                    {renderStatus(res)}
                                </div>
                                {renderCollect(res, true)}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            
            {isKeyModalOpen && paymentToCollect && (
                 <SecurityKeyModal
                    onSuccess={handleKeySuccess}
                    onClose={() => { setIsKeyModalOpen(false); setPaymentToCollect(null); }}
                />
            )}

            {!isKeyModalOpen && paymentToCollect && (
                <ConfirmationDialog
                    message={`Are you sure you want to mark the payment of ${formatCurrency(paymentToCollect.unpaidExtensionAmount || 0)} for ${paymentToCollect.personName} as collected?`}
                    onConfirm={handleConfirmCollection}
                    onCancel={() => setPaymentToCollect(null)}
                    confirmButtonText="Confirm Collection"
                />
            )}
        </div>
    );
};

export default DeferredPayments;
