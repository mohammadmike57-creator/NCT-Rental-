import React, { useState, useMemo } from 'react';
import { Reservation, User, UserPermission, AppData, CompanyDetails } from '../types';
import SecurityKeyModal from './SecurityKeyModal';
import { CheckCircleIcon, LockClosedIcon, ShieldCheckIcon } from './icons';
import { Page, PageHeader, StatGrid, Panel, Badge, Button, EmptyState, table } from './ui/Crm';

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

    if (!(companyDetails.requirePaymentApproval ?? true)) {
        return (
            <Page>
                <PageHeader
                    section="Financials & Incidents"
                    title="Payment Approvals"
                    subtitle="Approve payment collections requested by rental agents."
                />
                <Panel>
                    <EmptyState
                        icon={<LockClosedIcon />}
                        title="Payment approvals are turned off"
                        hint={<>The payment approval workflow is currently disabled. Agents can collect payments directly.<span className="block mt-1 text-xs text-slate-400">An administrator can change this in Company Details.</span></>}
                    />
                </Panel>
            </Page>
        );
    }

    const renderApprove = (res: Reservation, full?: boolean) => (
        <Button
            variant="primary"
            size="sm"
            onClick={() => handleApproveClick(res)}
            disabled={!hasManagePermission}
            title={hasManagePermission ? 'Approve with security key' : 'You do not have permission to approve payments'}
            icon={<CheckCircleIcon className="w-4 h-4 shrink-0" />}
            className={full ? 'w-full' : ''}
        >
            Approve
        </Button>
    );

    return (
        <Page>
            <PageHeader
                section="Financials & Incidents"
                title="Payment Approvals"
                subtitle="Approve payment collections requested by rental agents."
                actions={!hasManagePermission ? (
                    <Badge tone="muted" dot={false}><LockClosedIcon className="w-3.5 h-3.5" /> View only</Badge>
                ) : undefined}
            />

            <StatGrid items={[
                { label: 'Pending', value: pendingApprovals.length, sub: 'awaiting approval', tone: pendingApprovals.length > 0 ? 'warning' : 'default' },
                { label: 'Total due', value: formatCurrency(totalDue), sub: 'across all requests' },
                { label: 'Largest request', value: formatCurrency(largest), sub: 'single booking' },
                { label: 'Requested by', value: requesterCount, sub: requesterCount === 1 ? 'agent' : 'agents' },
            ]} />

            <Panel
                title={<>Requests <span className="ml-1 text-slate-400 font-normal tabular-nums">{pendingApprovals.length}</span></>}
                subtitle="Oldest pickup first"
            >
                {pendingApprovals.length === 0 ? (
                    <EmptyState
                        icon={<ShieldCheckIcon />}
                        title="No pending approvals"
                        hint="Requests from agents will appear here as soon as they are submitted."
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
                                    <th className={table.th}>Requested by</th>
                                    <th className={`${table.th} text-right`}>Amount due</th>
                                    <th className={table.th}><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className={table.body}>
                                {pendingApprovals.map(res => (
                                    <tr key={res.id} className={table.row}>
                                        <td className={`${table.td} font-semibold text-slate-900`}>{res.personName}</td>
                                        <td className={`${table.td} whitespace-nowrap font-mono text-xs text-slate-600`}>{res.bookingId || '—'}</td>
                                        <td className={`${table.td} text-slate-600`}>{res.carModel}</td>
                                        <td className={`${table.td} text-slate-600`}>{res.paymentConfirmationRequestedBy || 'Unknown'}</td>
                                        <td className={`${table.td} text-right font-semibold tabular-nums text-rose-600 whitespace-nowrap`}>{formatCurrency(getAmountDue(res))}</td>
                                        <td className={`${table.td} text-right whitespace-nowrap`}>{renderApprove(res)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Mobile list */}
                        <ul className="md:hidden divide-y divide-slate-100">
                            {pendingApprovals.map(res => (
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
                                            <p className="text-[13px] font-semibold tabular-nums text-rose-600">{formatCurrency(getAmountDue(res))}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500">Requested by <span className="font-medium text-slate-700">{res.paymentConfirmationRequestedBy || 'Unknown'}</span></p>
                                    {renderApprove(res, true)}
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </Panel>

            {isKeyModalOpen && (
                <SecurityKeyModal
                    onSuccess={handleKeySuccess}
                    onClose={() => { setIsKeyModalOpen(false); setReservationToApprove(null); }}
                />
            )}
        </Page>
    );
};

export default PaymentApprovals;
