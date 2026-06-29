import React, { useMemo, useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { YearData, ReservationStatus, CompanyDetails, AppData, FranchisePayment, User, UserPermission, Reservation } from '../types';
import { MONTHS, COMMISSION_RATE, NCT_LOGO_B64, USD_TO_JOD_RATE } from '../constants';
import { PdfIcon, CheckCircleIcon, ClockIcon, CurrencyDollarIcon, CloseIcon, CreditCardIcon } from './icons';
import Tabs from './Tabs';
import SecurityKeyModal from './SecurityKeyModal';

const FIXED_ADDON = 250; // Fixed extra amount per month

interface SummaryTableProps {
  allData: AppData;
  yearData: YearData;
  year: number;
  companyDetails: CompanyDetails;
  franchisePayments?: FranchisePayment[];
  onUpdateFranchisePayment?: (payments: FranchisePayment[]) => void;
  currentUser?: User | null;
}

const PaymentEntryModal: React.FC<{
    month: string;
    year: number;
    initialAmount: number;
    onClose: () => void;
    onConfirm: (amount: number, currency: 'USD' | 'JOD') => void;
}> = ({ month, year, initialAmount, onClose, onConfirm }) => {
    const [amount, setAmount] = useState(initialAmount);
    const [currency, setCurrency] = useState<'USD' | 'JOD'>('USD');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (amount <= 0) {
            alert("Amount must be greater than zero.");
            return;
        }
        onConfirm(amount, currency);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4" aria-modal="true">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
                <header className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-lg font-semibold text-gray-800">Record Franchise Payment</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><CloseIcon className="w-5 h-5" /></button>
                </header>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="text-sm text-gray-600 mb-4">
                        Recording payment for <strong>{month} {year}</strong>.
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Payment Amount</label>
                        <input 
                            type="number" 
                            step="0.01" 
                            value={amount} 
                            onChange={e => setAmount(parseFloat(e.target.value))}
                            className="w-full p-2 mt-1 border rounded-md focus:ring-primary focus:border-primary"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Currency</label>
                        <select 
                            value={currency} 
                            onChange={e => setCurrency(e.target.value as 'USD' | 'JOD')}
                            className="w-full p-2 mt-1 border rounded-md focus:ring-primary focus:border-primary"
                        >
                            <option value="USD">USD ($)</option>
                            <option value="JOD">JOD (JD)</option>
                        </select>
                    </div>
                    <div className="pt-4 flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 text-sm">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-primary text-white rounded-md hover:bg-secondary text-sm">Next: Authorize</button>
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

    const paymentLink = `https://buy.stripe.com/nct_rental_${month.toLowerCase()}_${year}_${amount.toFixed(0)}`;

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
                                <h4 className="text-gray-500 text-sm uppercase tracking-wider font-semibold">Franchise Payment</h4>
                                <p className="text-4xl font-bold text-gray-900 mt-2">{currency} {amount.toFixed(2)}</p>
                                <p className="text-gray-500 text-sm mt-1">{month} {year}</p>
                            </div>

                            <div className="space-y-6">
                                <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                                    <p className="text-sm text-gray-600 mb-4 font-medium">Click the button below to complete payment via Stripe:</p>
                                    
                                    <a 
                                        href={paymentLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => setShowConfirmButton(true)}
                                        className="inline-flex items-center gap-2 px-8 py-3 bg-[#635bff] text-white rounded-full font-bold shadow-lg hover:bg-[#534bb3] transition-all transform hover:scale-105"
                                    >
                                        <CreditCardIcon className="w-5 h-5" />
                                        Pay with Stripe
                                    </a>
                                    
                                    <div className="mt-4 text-[10px] text-gray-400 font-mono break-all px-2">
                                        {paymentLink}
                                    </div>
                                </div>

                                {showConfirmButton && (
                                    <button 
                                        onClick={handleConfirm}
                                        disabled={isProcessing}
                                        className="w-full py-3 bg-green-600 text-white rounded-md font-semibold hover:bg-green-700 transition-all shadow flex items-center justify-center gap-2"
                                    >
                                        {isProcessing ? "Confirming..." : "I have completed the payment"}
                                    </button>
                                )}
                                
                                <p className="text-center text-[10px] text-gray-400">
                                    Secure payment powered by Stripe
                                </p>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-10">
                            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 scale-110">
                                <CheckCircleIcon className="w-12 h-12" />
                            </div>
                            <h4 className="text-2xl font-bold text-gray-900">Payment Confirmed</h4>
                            <p className="text-gray-500 mt-2">The franchise fee has been recorded as paid.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const FranchisePaymentTracker: React.FC<{
    summary: any[];
    payments: FranchisePayment[];
    year: number;
    onPay: (month: string, amount: number, currency: 'USD' | 'JOD') => void;
    onDelete: (month: string) => void;
    canManage: boolean;
}> = ({ summary, payments, year, onPay, onDelete, canManage }) => {
    const [paymentModalData, setPaymentModalData] = useState<{month: string, amount: number} | null>(null);
    const [stripeModalData, setStripeModalData] = useState<{month: string, amount: number, currency: 'USD' | 'JOD'} | null>(null);
    const [pendingPayment, setPendingPayment] = useState<{month: string, amount: number, currency: 'USD' | 'JOD'} | null>(null);
    const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
    const [loadingLink, setLoadingLink] = useState<string | null>(null);

    const handleCardClick = async (totalFee: number, month: string) => {
        setLoadingLink(month);
        try {
            const response = await fetch('https://www.nctrental.com/stripe/create-payment-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: totalFee,
                    description: `Franchise fee for ${month} ${year}`
                })
            });
            const data = await response.json();
            if (data.url) {
                window.open(data.url, '_blank');
            } else {
                throw new Error('No URL returned');
            }
        } catch (error) {
            console.error('Failed to create payment link', error);
            alert('Could not create payment link. Please try again later.');
        } finally {
            setLoadingLink(null);
        }
    };

    const handlePayClick = (month: string, amount: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setPaymentModalData({ month, amount });
    };

    const handlePaymentDetailsConfirmed = (amount: number, currency: 'USD' | 'JOD') => {
        if (paymentModalData) {
            setStripeModalData({ month: paymentModalData.month, amount, currency });
            setPaymentModalData(null);
        }
    };

    const handleStripeSuccess = () => {
        if (stripeModalData) {
            setPendingPayment({ ...stripeModalData });
            setStripeModalData(null);
            setIsKeyModalOpen(true);
        }
    };

    const handleKeySuccess = () => {
        if (pendingPayment) {
            onPay(pendingPayment.month, pendingPayment.amount, pendingPayment.currency);
            setPendingPayment(null);
        }
        setIsKeyModalOpen(false);
    };

    const getDeadlineDate = (monthStr: string, currentYear: number) => {
        const monthIndex = MONTHS.indexOf(monthStr);
        let deadlineYear = currentYear;
        let deadlineMonth = monthIndex + 1;
        
        if (deadlineMonth > 11) {
            deadlineMonth = 0;
            deadlineYear++;
        }
        
        const deadline = new Date(deadlineYear, deadlineMonth, 5);
        deadline.setHours(23, 59, 59, 999);
        return deadline;
    };
    
    const statusInfo = {
        PAID: { text: 'Paid', icon: <CheckCircleIcon className="w-4 h-4" />, badgeClasses: 'bg-green-100 text-green-800', cardClasses: 'border-green-300 bg-white' },
        OVERDUE: { text: 'Overdue', icon: <ClockIcon className="w-4 h-4" />, badgeClasses: 'bg-red-100 text-red-800', cardClasses: 'border-red-300 bg-white' },
        DUE: { text: 'Due', icon: <ClockIcon className="w-4 h-4" />, badgeClasses: 'bg-orange-100 text-orange-800', cardClasses: 'border-orange-300 bg-white' },
        UPCOMING: { text: 'Upcoming', icon: null, badgeClasses: 'bg-gray-100 text-gray-500', cardClasses: 'border-gray-200 bg-white' },
    };

    return (
        <div className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {summary.map(row => {
                    const payment = payments.find(p => p.year === year && p.month === row.month);
                    const isPaid = !!payment;
                    
                    const today = new Date();
                    const deadline = getDeadlineDate(row.month, year);
                    const monthEnd = new Date(year, MONTHS.indexOf(row.month) + 1, 0);
                    monthEnd.setHours(23,59,59,999);
                    
                    const isPastMonthEnd = today > monthEnd;

                    const getStatus = () => {
                        if (isPaid) return 'PAID';
                        if (isPastMonthEnd && today > deadline) return 'OVERDUE';
                        if (isPastMonthEnd && today <= deadline) return 'DUE';
                        return 'UPCOMING';
                    };
                    
                    const status = getStatus();
                    const currentStatusInfo = statusInfo[status];
                    const deadlineDate = getDeadlineDate(row.month, year);

                    // Special handling for January, February, and March 2026: show only "Paid" without any amount
                    const isSpecialPaid = year === 2026 && (['January', 'February', 'March', 'April', 'May'].includes(row.month)) && isPaid;

                    return (
                        <div 
                            key={row.month} 
                            className={`rounded-xl shadow-sm border ${currentStatusInfo.cardClasses} flex flex-col transition-all hover:shadow-lg hover:-translate-y-1 ${!isSpecialPaid ? 'cursor-pointer' : ''} ${loadingLink === row.month ? 'opacity-50 pointer-events-none' : ''}`}
                            onClick={() => !isSpecialPaid && handleCardClick(row.totalFee, row.month)}
                        >
                            <div className="p-4 flex justify-between items-center border-b">
                                <div>
                                    <h4 className="font-bold text-lg text-slate-800">{row.month}</h4>
                                    {status !== 'PAID' && status !== 'UPCOMING' && (
                                        <p className="text-xs text-slate-500 font-medium mt-1">
                                            Deadline: {deadlineDate.toLocaleDateString()}
                                        </p>
                                    )}
                                </div>
                                <span className={`px-3 py-1 text-xs font-bold rounded-full flex items-center gap-1.5 ${currentStatusInfo.badgeClasses}`}>
                                    {currentStatusInfo.icon} {currentStatusInfo.text}
                                </span>
                            </div>
                            
                            {!isSpecialPaid ? (
                                <>
                                    <div className="p-4 space-y-3 flex-grow">
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-sm text-slate-500">Total Revenue</span>
                                            <span className="font-medium text-slate-700">${row.totalRevenue.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-sm text-slate-500">7.5% Commission</span>
                                            <span className="font-medium text-slate-700">${row.commission.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-baseline border-t pt-2 mt-1">
                                            <span className="text-sm font-semibold text-slate-800">Total Franchise Fee</span>
                                            <span className="font-bold text-xl text-primary">${row.totalFee.toFixed(2)}</span>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-slate-50 rounded-b-xl mt-auto">
                                        {isPaid && payment ? (
                                            <div className="flex justify-between items-end">
                                                <div className="text-xs text-green-800 space-y-1">
                                                    <p><strong>Paid Amount:</strong> {payment.currency} {payment.amount.toFixed(2)}</p>
                                                    <p><strong>On:</strong> {new Date(payment.datePaid).toLocaleDateString()}</p>
                                                </div>
                                                {canManage && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); if(confirm('Are you sure you want to mark this month as UNPAID?')) onDelete(row.month); }}
                                                        className="text-red-600 hover:text-red-800 text-xs font-semibold p-1"
                                                        title="Mark as Unpaid"
                                                    >
                                                        Mark Unpaid
                                                    </button>
                                                )}
                                            </div>
                                        ) : canManage ? (
                                            <button 
                                                onClick={(e) => handlePayClick(row.month, row.totalFee, e)}
                                                className="w-full py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-secondary transition-colors shadow-sm flex items-center justify-center gap-2"
                                            >
                                               <CurrencyDollarIcon className="w-4 h-4"/> Record Payment
                                            </button>
                                        ) : (
                                            <div className="text-center text-xs text-slate-500 font-medium h-9 flex items-center justify-center">
                                                {status === 'UPCOMING' ? 'Payment pending' : 'No payment recorded'}
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                // Special paid card: just show a simple "Paid" message with correct date
                                <div className="p-4 flex flex-col items-center justify-center flex-grow relative">
                                    <CheckCircleIcon className="w-12 h-12 text-green-600 mb-2" />
                                    <p className="text-green-800 font-semibold">Payment Completed</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Paid on {payment ? new Date(payment.datePaid).toLocaleDateString() : ''}
                                    </p>
                                    {canManage && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); if(confirm('Are you sure you want to mark this month as UNPAID?')) onDelete(row.month); }}
                                            className="absolute bottom-2 right-2 text-red-600 hover:text-red-800 text-xs font-semibold p-1"
                                            title="Mark as Unpaid"
                                        >
                                            Mark Unpaid
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
             {paymentModalData && (
                 <PaymentEntryModal 
                    month={paymentModalData.month}
                    year={year}
                    initialAmount={paymentModalData.amount}
                    onClose={() => setPaymentModalData(null)}
                    onConfirm={handlePaymentDetailsConfirmed}
                 />
             )}
             {stripeModalData && (
                 <StripePaymentModal 
                    month={stripeModalData.month}
                    year={year}
                    amount={stripeModalData.amount}
                    currency={stripeModalData.currency}
                    onClose={() => setStripeModalData(null)}
                    onConfirm={handleStripeSuccess}
                 />
             )}
             {isKeyModalOpen && (
                <SecurityKeyModal onSuccess={handleKeySuccess} onClose={() => setIsKeyModalOpen(false)} />
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
  const canManageFinancials = currentUser?.permissions.includes(UserPermission.ACTION_FINANCIALS_MANAGE_FRANCHISE_PAYMENTS) ?? false;

  const summary = useMemo(() => {
    const allReservations: Reservation[] = Object.values(allData || {}).flatMap((yData: YearData) => Object.values(yData || {}).flat() as Reservation[]);

    return MONTHS.map((month, index) => {
      const reservationsInMonth = allReservations.filter(r => {
          if (!r.startDate) return false;
          const startDate = new Date(r.startDate);
          if (isNaN(startDate.getTime())) return false;
          return startDate.getFullYear() === year && startDate.getMonth() === index;
      });
      
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
  }, [allData, year, conversionRate]);
  
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

  const handlePayFranchise = (month: string, amount: number, currency: 'USD' | 'JOD') => {
      if (!onUpdateFranchisePayment) return;

      const newPayment: FranchisePayment = {
          id: `fp-${year}-${month}-${Date.now()}`,
          year,
          month,
          amount,
          currency,
          datePaid: new Date().toISOString(),
          paidBy: currentUser?.fullName || 'Unknown',
          referenceNote: `Franchise Fee for ${month} ${year}`
      };
      
      onUpdateFranchisePayment([...franchisePayments, newPayment]);
  };

  const handleDeleteFranchisePayment = (month: string) => {
      if (!onUpdateFranchisePayment) return;
      onUpdateFranchisePayment(franchisePayments.filter(p => !(p.year === year && p.month === month)));
  };

  // Prepare data for FranchisePaymentTracker: includes totalRevenue, commission, and totalFee = commission + FIXED_ADDON
  // For January, February, and March 2026, set totalFee = 0 (not shown) but they will be auto-paid.
  const franchiseSummary = summary.map(s => {
      let totalFee = s.commissionUSD + FIXED_ADDON;
      if (year === 2026 && (['January', 'February', 'March', 'April', 'May'].includes(s.month))) {
          totalFee = 0; // Not shown
      }
      return {
          month: s.month,
          totalRevenue: s.totalRevenueUSD,
          commission: s.commissionUSD,
          totalFee: totalFee
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
    <div className="flex justify-between items-center py-2 border-b border-gray-100">
        <span className="text-sm text-gray-500">{label}</span>
        <span className="font-semibold text-gray-800">{value}</span>
    </div>
  );

  return (
    <div className="p-4 sm:p-6">
       <div className="flex flex-col sm:flex-row justify-between items-start mb-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-800 mb-1">Yearly Summary for {year}</h3>
          <p className="text-md text-gray-500">Commission is calculated at ${(COMMISSION_RATE * 100).toFixed(1)}% on the total revenue.</p>
        </div>
        <div className="flex items-center gap-4 mt-4 sm:mt-0">
             {activeTab === 'Summary' && (
                <>
                    <div className="flex bg-gray-200 rounded-lg p-1">
                        <button
                            onClick={() => setCurrency('USD')}
                            className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${currency === 'USD' ? 'bg-white text-primary shadow' : 'text-gray-600'}`}
                        >
                            USD
                        </button>
                        <button
                            onClick={() => setCurrency('JOD')}
                            className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${currency === 'JOD' ? 'bg-white text-primary shadow' : 'text-gray-600'}`}
                        >
                            JOD
                        </button>
                    </div>
                    <button 
                    onClick={handleExportPDF} 
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-600 text-sm font-medium"
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
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Reservations</th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Confirmed Reservations</th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Revenue ({currency})</th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Commission ({currency})</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {summary.map((row, index) => (
                      <tr key={row.month} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.month}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{row.totalReservations}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{row.confirmedReservations}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{formatCurrency(row.totalRevenue)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{formatCurrency(row.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100">
                      <tr>
                          <th scope="row" className="px-6 py-3 text-left text-sm font-bold text-gray-700 uppercase">Grand Total</th>
                          <td className="px-6 py-3 text-right text-sm font-bold text-gray-700">{grandTotal.totalReservations}</td>
                          <td className="px-6 py-3 text-right text-sm font-bold text-gray-700">{grandTotal.confirmedReservations}</td>
                          <td className="px-6 py-3 text-right text-sm font-bold text-gray-700">{formatCurrency(grandTotal.totalRevenue)}</td>
                          <td className="px-6 py-3 text-right text-sm font-bold text-gray-700">{formatCurrency(grandTotal.commission)}</td>
                      </tr>
                  </tfoot>
                </table>
              </div>
          ) : (
            <div className="space-y-4">
                {summary.map(row => (
                    <div key={row.month} className="bg-white p-4 rounded-lg shadow border border-gray-200">
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
          <div>
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
                  <h4 className="text-blue-800 font-bold">Franchise Fee Management</h4>
                  <p className="text-blue-700 text-sm mt-1">
                      Total franchise fee = 7.5% commission + $250 fixed fee per month.
                  </p>
              </div>
              <FranchisePaymentTracker 
                summary={franchiseSummary} 
                payments={franchisePayments} 
                year={year} 
                onPay={handlePayFranchise}
                onDelete={handleDeleteFranchisePayment}
                canManage={canManageFinancials}
              />
          </div>
      )}
    </div>
  );
};

export default SummaryTable;
