import React, { useState, useMemo, useEffect } from 'react';
import { Reservation, ExtensionInfo, ReservationExtra, TrafficTicket, TrafficTicketStatus, CompanyDetails } from '../types';
import { CloseIcon, CalendarIcon, CarIcon, UserIcon, MailIcon, ShieldExclamationIcon } from './icons';

const calculateDaysWithGrace = (start: string, end: string): number => {
    if (!start || !end) return 1;
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
        return 1;
    }

    const diffInMs = endDate.getTime() - startDate.getTime();

    const oneDayInMs = 24 * 60 * 60 * 1000;
    if (diffInMs <= oneDayInMs) {
        return 1;
    }

    const gracePeriodInMs = 2 * 60 * 60 * 1000;
    const fullDays = Math.floor(diffInMs / oneDayInMs);
    const remainingMs = diffInMs % oneDayInMs;

    if (remainingMs === 0) {
        return fullDays;
    }
    
    if (remainingMs >= gracePeriodInMs) {
        return fullDays + 1;
    }
    
    return fullDays;
};


interface ExtendRentalModalProps {
  reservation: Reservation;
  trafficTickets: TrafficTicket[];
  companyDetails: CompanyDetails;
  onConfirm: (
    originalReservation: Reservation,
    extensionInfo: Omit<ExtensionInfo, 'extensionDate' | 'paymentMethod'>,
    customerEmail: string,
    paymentMethod: 'payNow' | 'payLater'
  ) => void;
  onClose: () => void;
}

const ExtendRentalModal: React.FC<ExtendRentalModalProps> = ({ reservation, trafficTickets, onConfirm, onClose, companyDetails }) => {
  const [newEndDate, setNewEndDate] = useState(reservation.endDate);
  const [rateOption, setRateOption] = useState<'original' | 'custom'>('original');
  const [customRate, setCustomRate] = useState<number>(0);
  const [selectedExtras, setSelectedExtras] = useState<Record<string, boolean>>({});
  const [customerEmail, setCustomerEmail] = useState(reservation.customerEmail || '');
  const [paymentMethod, setPaymentMethod] = useState<'payNow' | 'payLater'>('payLater');
  const [isConfirming, setIsConfirming] = useState(false);

  const outstandingTickets = useMemo(() => {
    return trafficTickets.filter(
        ticket => ticket.bookingId === reservation.bookingId && ticket.status === TrafficTicketStatus.NOT_COLLECTED
    );
  }, [trafficTickets, reservation.bookingId]);

  const totalTicketAmountDue = useMemo(() => {
      return outstandingTickets.reduce((sum, ticket) => sum + ticket.amount, 0);
  }, [outstandingTickets]);

  const hasOutstandingTickets = outstandingTickets.length > 0;

  useEffect(() => {
    const initialExtras: Record<string, boolean> = {};
    (reservation.extras || []).forEach(extra => {
        initialExtras[extra.name] = true; // Default all extras to be included
    });
    setSelectedExtras(initialExtras);
  }, [reservation.extras]);

  const originalDays = useMemo(() => calculateDaysWithGrace(reservation.startDate, reservation.endDate), [reservation.startDate, reservation.endDate]);

  const dailyRate = useMemo(() => {
    const originalTotalAmount = reservation.originalAmount ?? reservation.amount;
    const originalExtrasTotal = (reservation.extras || [])
        .filter(extra => !extra.isComplementary)
        .reduce((sum, extra) => sum + (extra.dailyPrice * originalDays), 0);
    const baseRentalFee = originalTotalAmount - originalExtrasTotal;
    if (originalDays > 0 && baseRentalFee >= 0) {
      return baseRentalFee / originalDays;
    }
    return 0;
  }, [reservation.amount, reservation.originalAmount, reservation.extras, originalDays]);

  
  useEffect(() => {
    if (dailyRate) {
        setCustomRate(parseFloat(dailyRate.toFixed(2)));
    }
  }, [dailyRate]);

  const extensionDays = useMemo(() => {
    if (!newEndDate || newEndDate <= reservation.endDate) return 0;
    
    const diffInMs = new Date(newEndDate).getTime() - new Date(reservation.endDate).getTime();
    
    // Applying the same grace period logic to the extension duration
    const oneDayInMs = 24 * 60 * 60 * 1000;
    if (diffInMs < oneDayInMs) {
        return 1;
    }
    const gracePeriodInMs = 2 * 60 * 60 * 1000;
    const fullDays = Math.floor(diffInMs / oneDayInMs);
    const remainingMs = diffInMs % oneDayInMs;

    if (remainingMs === 0) {
        return fullDays;
    }
    if (remainingMs >= gracePeriodInMs) {
        return fullDays + 1;
    }
    return fullDays;
    
  }, [newEndDate, reservation.endDate]);
  
  const handleExtraToggle = (extraName: string) => {
    setSelectedExtras(prev => ({ ...prev, [extraName]: !prev[extraName] }));
  };

  const totalExtensionCost = useMemo(() => {
    const rateToUse = rateOption === 'custom' ? customRate : dailyRate;
    const rentalCost = extensionDays * rateToUse;
    const extrasCost = (reservation.extras || [])
        .filter(extra => selectedExtras[extra.name] && !extra.isComplementary)
        .reduce((sum, extra) => sum + (extra.dailyPrice * extensionDays), 0);
    return rentalCost + extrasCost;
  }, [extensionDays, dailyRate, rateOption, customRate, reservation.extras, selectedExtras]);


  const newTotalAmount = useMemo(() => {
    return (reservation.amount || 0) + totalExtensionCost;
  }, [reservation.amount, totalExtensionCost]);

  const formatCurrency = (value: number, currency: 'USD' | 'JOD' = 'USD') => {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  }

  const handleConfirm = () => {
    if (extensionDays <= 0) {
      alert('New end date must be after the current end date.');
      return;
    }
    
    const needsEmail = paymentMethod === 'payNow';
    if (needsEmail && (!customerEmail.trim() || !/^\S+@\S+\.\S+$/.test(customerEmail.trim()))) {
        alert('A valid customer email is required to send the immediate invoice.');
        return;
    }

    const extendedExtras: ReservationExtra[] = (reservation.extras || []).filter(e => selectedExtras[e.name]);

    const extensionInfo: Omit<ExtensionInfo, 'extensionDate' | 'paymentMethod'> = {
        newEndDate,
        days: extensionDays,
        dailyRate: rateOption === 'custom' ? customRate : dailyRate,
        extras: extendedExtras,
        cost: totalExtensionCost,
    };
    
    setIsConfirming(true);

    // Only attempt to open mail client if email is provided
    if (customerEmail && customerEmail.trim()) {
        const signature = `\n\nThank you,\n${companyDetails.name}\n${companyDetails.address}\nPhone: ${companyDetails.phone}\nEmail: ${companyDetails.email}`;

        const subject = paymentMethod === 'payNow'
            ? `Invoice for Rental Extension - Booking #${reservation.bookingId}`
            : `Rental Extension Confirmation - Booking #${reservation.bookingId}`;
        
        const body = paymentMethod === 'payNow'
            ? `Dear ${reservation.personName},\n\nThis is an invoice for the extension of your rental agreement for the ${reservation.carModel}.\n\nInvoice Details:\n- Extended by: ${extensionDays} day(s)\n- New Return Date: ${newEndDate}\n\nCharges for this extension:\n- Extension Cost: ${formatCurrency(totalExtensionCost)}\n\nThis amount is due now.${signature}`
            : `Dear ${reservation.personName},\n\nThis email confirms the extension of your rental agreement for the ${reservation.carModel}.\n\nExtension Details:\n- Previous Return Date: ${reservation.endDate}\n- New Return Date: ${newEndDate}\n- Extended by: ${extensionDays} day(s)\n\nCharges for this extension:\n- Extension Cost: ${formatCurrency(totalExtensionCost)}\n- New Total Rental Amount: ${formatCurrency(newTotalAmount)}\n\nPlease note that the extension cost of ${formatCurrency(totalExtensionCost)} will be added to your final bill and is due upon your new return date.${signature}`;
        
        window.location.href = `mailto:${customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    setTimeout(() => {
        onConfirm(reservation, extensionInfo, customerEmail, paymentMethod);
    }, 300);
  };
  
  const rateToUse = rateOption === 'custom' ? customRate : dailyRate;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <header className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold text-gray-800">Extend Rental Agreement</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200"><CloseIcon /></button>
        </header>
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="p-4 bg-gray-50 rounded-lg border">
            <h3 className="font-semibold text-gray-700 mb-2">Current Reservation</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2"><UserIcon/> <span>{reservation.personName}</span></div>
                <div className="flex items-center gap-2"><CarIcon/> <span>{reservation.carModel}</span></div>
                <div className="flex items-center gap-2 col-span-2"><CalendarIcon/> <span>{reservation.startDate.replace('T', ' ')} to {reservation.endDate.replace('T', ' ')}</span></div>
            </div>
          </div>
          
          {hasOutstandingTickets && (
            <div className="p-3 bg-red-100 border-l-4 border-red-500 text-red-700 text-sm rounded-r-md">
                <p><strong className="font-semibold flex items-center gap-1"><ShieldExclamationIcon /> Outstanding Balance:</strong> This customer has a due amount of <strong>{formatCurrency(totalTicketAmountDue, 'JOD')}</strong> for traffic tickets. Please inform them.</p>
            </div>
           )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label htmlFor="new-end-date" className="block text-sm font-medium text-gray-700 mb-1">New Return Date & Time</label>
                <input
                type="datetime-local"
                id="new-end-date"
                value={newEndDate}
                min={reservation.endDate}
                onChange={e => setNewEndDate(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
                />
            </div>
             <div>
                <label htmlFor="customer-email" className="block text-sm font-medium text-gray-700 mb-1">Customer Email {paymentMethod === 'payLater' && <span className="text-gray-400 font-normal">(Optional)</span>}</label>
                 <div className="relative">
                     <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 pointer-events-none"><MailIcon/></span>
                    <input
                        id="customer-email"
                        type="email"
                        value={customerEmail}
                        onChange={e => setCustomerEmail(e.target.value)}
                        placeholder={paymentMethod === 'payNow' ? "Required for invoice" : "Optional for confirmation"}
                        className="w-full p-2 pl-9 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
                    />
                 </div>
            </div>
          </div>
          
           <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Extension Rate</label>
            <div className="flex items-center gap-x-6 gap-y-2 flex-wrap">
                <label className="flex items-center cursor-pointer">
                    <input type="radio" value="original" name="rateOption" checked={rateOption === 'original'} onChange={() => setRateOption('original')} className="h-4 w-4 text-primary focus:ring-secondary" />
                    <span className="ml-2 text-sm text-gray-700">Original Rate ({formatCurrency(dailyRate)}/day)</span>
                </label>
                <label className="flex items-center cursor-pointer">
                    <input type="radio" value="custom" name="rateOption" checked={rateOption === 'custom'} onChange={() => setRateOption('custom')} className="h-4 w-4 text-primary focus:ring-secondary" />
                    <span className="ml-2 text-sm text-gray-700">Custom Rate</span>
                </label>
            </div>
            {rateOption === 'custom' && (
                <div className="pt-2">
                    <label htmlFor="custom-rate-input" className="sr-only">Custom daily rate</label>
                    <input
                        id="custom-rate-input"
                        type="number"
                        step="0.01"
                        value={customRate || ''}
                        onChange={e => setCustomRate(parseFloat(e.target.value) || 0)}
                        className="w-full p-2 border border-gray-300 rounded-md text-sm"
                        placeholder="Enter custom daily rate"
                    />
                </div>
            )}
          </div>
          
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Include Extras in Extension</h3>
            {(reservation.extras && reservation.extras.length > 0) ? (
                <div className="space-y-2 p-3 bg-gray-50 border rounded-md">
                    {reservation.extras.map(extra => (
                        <label key={extra.name} className="flex items-center">
                            <input 
                                type="checkbox"
                                checked={!!selectedExtras[extra.name]}
                                onChange={() => handleExtraToggle(extra.name)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-secondary"
                            />
                            <span className="ml-2 text-sm text-gray-700">{extra.name} ({extra.isComplementary ? 'Free' : `${formatCurrency(extra.dailyPrice)}/day`})</span>
                        </label>
                    ))}
                </div>
            ) : (
                <p className="text-sm text-gray-500">No extras on original rental.</p>
            )}
          </div>
          
           <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Payment for Extension</label>
            <div className="flex items-center gap-x-6 gap-y-2 flex-wrap p-3 bg-gray-50 border rounded-md">
                <label className="flex items-center cursor-pointer">
                    <input type="radio" value="payLater" name="paymentMethod" checked={paymentMethod === 'payLater'} onChange={() => setPaymentMethod('payLater')} className="h-4 w-4 text-primary focus:ring-secondary" />
                    <span className="ml-2 text-sm text-gray-700">Pay at End of Rental</span>
                </label>
                <label className="flex items-center cursor-pointer">
                    <input type="radio" value="payNow" name="paymentMethod" checked={paymentMethod === 'payNow'} onChange={() => setPaymentMethod('payNow')} className="h-4 w-4 text-primary focus:ring-secondary" />
                    <span className="ml-2 text-sm text-gray-700">Pay Now</span>
                </label>
            </div>
          </div>
          
          {extensionDays > 0 && (
             <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-2">
                <h3 className="font-semibold text-gray-700">Extension Summary</h3>
                <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Rental Extension ({extensionDays} days @ {formatCurrency(rateToUse)}/day):</span>
                    <span className="font-medium">{formatCurrency(extensionDays * rateToUse)}</span>
                </div>
                {(reservation.extras || [])
                    .filter(extra => selectedExtras[extra.name] && !extra.isComplementary)
                    .map(extra => (
                        <div className="flex justify-between items-center text-sm" key={extra.name}>
                            <span className="text-gray-600 pl-2">- {extra.name}:</span>
                            <span className="font-medium">{formatCurrency(extra.dailyPrice * extensionDays)}</span>
                        </div>
                    ))
                }
                 <div className="flex justify-between items-center pt-2 mt-2 border-t text-base">
                    <span className="font-semibold text-gray-800">Total for Extension:</span>
                    <span className="font-bold text-gray-900">{formatCurrency(totalExtensionCost)}</span>
                </div>
            </div>
          )}
          
           <div className="p-3 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 text-sm rounded-r-md">
                <h4 className="font-semibold mb-1">Payment Information</h4>
                {paymentMethod === 'payLater' ? (
                    <p>The total cost for this extension will be added to the final rental bill and is due upon the vehicle's return on the new end date.</p>
                ) : (
                    <p>Payment for the extension cost of <strong>{formatCurrency(totalExtensionCost)}</strong> is due now. An invoice for the extension cost will be sent to the customer's email.</p>
                )}
            </div>

        </div>
        <footer className="p-4 bg-gray-50 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={extensionDays <= 0 || isConfirming}
            className="px-6 py-2 bg-primary text-white rounded-md hover:bg-secondary disabled:bg-gray-400"
          >
            {isConfirming ? 'Confirming...' : (paymentMethod === 'payLater' && !customerEmail ? 'Confirm Extension' : 'Confirm & Email Customer')}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ExtendRentalModal;