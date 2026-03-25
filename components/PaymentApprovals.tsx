import React, { useState, useMemo } from 'react';
import { Reservation, User, UserPermission, AppData, CompanyDetails } from '../types';
import SecurityKeyModal from './SecurityKeyModal';
import { CurrencyDollarIcon } from './icons';

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

    const headers = ['Renter Name', 'Booking ID', 'Car Model', 'Amount Due', 'Requested By', 'Actions'];

    if (!(companyDetails.requirePaymentApproval ?? true)) {
        return (
            <div className="p-12 text-center bg-white rounded-lg shadow-md">
                <h2 className="text-xl font-bold text-blue-600">Feature Disabled</h2>
                <p className="mt-2 text-gray-600">The payment approval workflow is currently disabled. Agents can collect payments directly.</p>
                <p className="mt-1 text-xs text-gray-500">This can be changed by an administrator in 'Company Details'.</p>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 bg-white rounded-lg shadow">
            <header className="mb-6">
                <h3 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <CurrencyDollarIcon />
                    Payment Confirmation Requests
                </h3>
                <p className="text-md text-gray-500 mt-1">Approve payment collections requested by rental agents.</p>
            </header>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>{headers.map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {pendingApprovals.length > 0 ? (
                            pendingApprovals.map(res => (
                                <tr key={res.id}>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-800">{res.personName}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{res.bookingId}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{res.carModel}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-red-600">
                                        {formatCurrency(getAmountDue(res))}
                                    </td>
                                     <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{res.paymentConfirmationRequestedBy || 'Unknown'}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                                        <button
                                            onClick={() => handleApproveClick(res)}
                                            disabled={!hasManagePermission}
                                            className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 text-xs font-semibold disabled:bg-gray-400"
                                        >
                                            Approve
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={headers.length} className="text-center py-10 text-gray-500">
                                    There are no pending payment approvals.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            
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
