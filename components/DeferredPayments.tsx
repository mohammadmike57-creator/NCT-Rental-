import React, { useMemo, useState } from 'react';
import { AppData, Reservation, User, UserPermission } from '../types';
import { CurrencyDollarIcon } from './icons';
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

    return (
        <div className="p-4 sm:p-6 bg-white rounded-lg shadow">
            <header className="mb-6">
                <h3 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <CurrencyDollarIcon />
                    Deferred Extension Payments
                </h3>
                <p className="text-md text-gray-500 mt-1">Manage and collect outstanding payments from "Pay Later" rental extensions.</p>
            </header>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Renter Name</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Booking ID</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Car Model</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">New Return Date</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount Due</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {deferredPayments.length > 0 ? (
                            deferredPayments.map(res => (
                                <tr key={res.id}>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-800">{res.personName}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{res.bookingId}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{res.carModel}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{res.endDate}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-red-600">
                                        {formatCurrency(res.unpaidExtensionAmount || 0)}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                                        <button
                                            onClick={() => handleCollectAttempt(res)}
                                            disabled={!hasManagePermission}
                                            className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 text-xs font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"
                                        >
                                            Mark as Collected
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={6} className="text-center py-10 text-gray-500">
                                    All deferred payments are collected.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            
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
