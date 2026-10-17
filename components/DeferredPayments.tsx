import React, { useMemo, useState } from 'react';
import { AppData, Reservation, User, UserPermission } from '../types';
import { CheckCircleIcon, LockClosedIcon, ShieldCheckIcon } from './icons';
import { Page, PageHeader, StatGrid, Panel, Badge, Button, EmptyState, table } from './ui/Crm';
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
        <Button
            variant="primary"
            size="sm"
            onClick={() => handleCollectAttempt(res)}
            disabled={!hasManagePermission}
            title={hasManagePermission ? 'Mark this payment as collected' : 'You do not have permission to collect payments'}
            icon={<CheckCircleIcon className="w-4 h-4 shrink-0" />}
            className={full ? 'w-full' : ''}
        >
            Mark as collected
        </Button>
    );

    const renderStatus = (res: Reservation) => isOverdue(res.endDate)
        ? <Badge tone="danger">Past return</Badge>
        : <Badge tone="warning">On rent</Badge>;

    return (
        <Page>
            <PageHeader
                section="Financials & Incidents"
                title="Deferred Payments"
                subtitle={'Collect outstanding amounts from "Pay Later" rental extensions.'}
                actions={!hasManagePermission ? (
                    <Badge tone="muted" dot={false}><LockClosedIcon className="w-3.5 h-3.5" /> View only</Badge>
                ) : undefined}
            />

            <StatGrid items={[
                { label: 'Outstanding', value: deferredPayments.length, sub: deferredPayments.length === 1 ? 'extension' : 'extensions', tone: deferredPayments.length > 0 ? 'warning' : 'default' },
                { label: 'Total due', value: formatCurrency(kpis.total), sub: 'to be collected' },
                { label: 'Past return', value: kpis.overdueCount, sub: 'return date passed', tone: kpis.overdueCount > 0 ? 'danger' : 'default' },
                { label: 'Past-return value', value: formatCurrency(kpis.overdueTotal), sub: 'collect first', tone: kpis.overdueTotal > 0 ? 'danger' : 'default' },
            ]} />

            <Panel
                title={<>Extensions <span className="ml-1 text-slate-400 font-normal tabular-nums">{deferredPayments.length}</span></>}
                subtitle="Earliest return first"
            >
                {deferredPayments.length === 0 ? (
                    <EmptyState
                        icon={<ShieldCheckIcon />}
                        title="All deferred payments are collected"
                        hint={'Extensions booked as "Pay Later" will appear here until they are paid.'}
                    />
                ) : (
                    <>
                        {/* Desktop table */}
                        <table className={`hidden md:table ${table.wrap}`}>
                            <thead className={table.head}>
                                <tr>
                                    <th className={table.th}>Renter</th>
                                    <th className={table.th}>Booking ID</th>
                                    <th className={table.th}>Vehicle</th>
                                    <th className={table.th}>New return date</th>
                                    <th className={table.th}>Status</th>
                                    <th className={`${table.th} text-right`}>Amount due</th>
                                    <th className={table.th}><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className={table.body}>
                                {deferredPayments.map(res => (
                                    <tr key={res.id} className={table.row}>
                                        <td className={`${table.td} font-semibold text-slate-900`}>{res.personName}</td>
                                        <td className={`${table.td} whitespace-nowrap font-mono text-xs text-slate-600`}>{res.bookingId || '—'}</td>
                                        <td className={`${table.td} text-slate-600`}>{res.carModel}</td>
                                        <td className={`${table.td} text-slate-600 tabular-nums whitespace-nowrap`}>{formatDate(res.endDate)}</td>
                                        <td className={table.td}>{renderStatus(res)}</td>
                                        <td className={`${table.td} text-right font-semibold tabular-nums text-rose-600 whitespace-nowrap`}>{formatCurrency(res.unpaidExtensionAmount || 0)}</td>
                                        <td className={`${table.td} text-right whitespace-nowrap`}>{renderCollect(res)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Mobile list */}
                        <ul className="md:hidden divide-y divide-slate-100">
                            {deferredPayments.map(res => (
                                <li key={res.id} className="px-4 py-3 space-y-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-semibold text-slate-900 truncate">{res.personName}</p>
                                            <p className="mt-0.5 text-xs text-slate-500 truncate">
                                                <span className="font-mono">{res.bookingId || '—'}</span> · {res.carModel}
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Due</p>
                                            <p className="text-[13px] font-semibold tabular-nums text-rose-600">{formatCurrency(res.unpaidExtensionAmount || 0)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 text-xs">
                                        <span className="text-slate-500 min-w-0 truncate">Returns <span className="font-medium text-slate-700 tabular-nums">{formatDate(res.endDate)}</span></span>
                                        {renderStatus(res)}
                                    </div>
                                    {renderCollect(res, true)}
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </Panel>

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
        </Page>
    );
};

export default DeferredPayments;
