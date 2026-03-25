import React, { useState, useEffect, useMemo } from 'react';
import { Reservation, CompanyDetails, CarView, RentalSource, PaymentType, RentalLocation, CarExchange, TrafficTicket, LateReturnFee } from '../types';
import SignaturePad from './SignaturePad';
import { FrontCarIcon, BackCarIcon, LeftSideCarIcon, RightSideCarIcon } from './CarCheckIcons';
import { ShieldExclamationIcon, PrinterIcon, ExportIcon, MailIcon } from './icons';
import { URDRIVE_LOGO_B64 } from '../constants';

// Forward declaration for html2canvas from CDN
declare const html2canvas: any;

interface VoucherProps {
  reservation: Reservation;
  sources: RentalSource[];
  rentalLocations: RentalLocation[];
  trafficTickets: TrafficTicket[];
  onClose: () => void;
  companyDetails: CompanyDetails;
  onUpdate: (reservation: Reservation) => void;
}

const InfoBlock: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="border border-gray-200 p-3 rounded-md h-full voucher-info-box">
        <h3 className="text-sm font-bold text-primary border-b border-gray-200 pb-2 mb-3 uppercase tracking-wider">{title}</h3>
        <div className="space-y-2 text-sm">{children}</div>
    </div>
);

const InfoPair: React.FC<{ label: string, value?: string | React.ReactNode }> = ({ label, value }) => (
    <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="font-medium text-gray-800">{value || 'N/A'}</p>
    </div>
);

const FuelGauge: React.FC<{ level?: number, pickupLevel?: number, onLevelChange: (level: number) => void, disabled?: boolean }> = ({ level = 0, pickupLevel, onLevelChange, disabled = false }) => {
    const segments = Array.from({ length: 8 }, (_, i) => i + 1);
    const hasPickupLevel = typeof pickupLevel === 'number';

    return (
        <div>
            <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                <span>E</span>
                <span>F</span>
            </div>
            <div className="relative">
                <div className="flex w-full h-8 border-2 border-gray-400 rounded mt-1">
                    {segments.map(s => (
                        <div
                            key={s}
                            onClick={() => !disabled && onLevelChange(s)}
                            className={`flex-1 border-r border-gray-300 last:border-r-0 transition-colors ${!disabled ? 'cursor-pointer hover:bg-slate-300' : ''} ${level >= s ? 'bg-primary' : 'bg-gray-200'}`}
                        ></div>
                    ))}
                </div>
                {hasPickupLevel && (
                    <div className="absolute top-1 bottom-0 left-0 flex items-center" style={{ width: `${(pickupLevel / 8) * 100}%` }}>
                        <div className="h-full w-[3px] bg-yellow-500" title={`Pickup Fuel Level: ${pickupLevel}/8`}></div>
                    </div>
                )}
            </div>
            <div className="text-center text-sm font-semibold mt-1">
                {level}/8 Tank {hasPickupLevel && <span className="text-xs font-normal text-gray-500">(Pickup was {pickupLevel}/8)</span>}
            </div>
        </div>
    );
};

const TabButton: React.FC<{ title: string; isActive: boolean; onClick: () => void; disabled?: boolean; completed?: boolean; }> = ({ title, isActive, onClick, disabled, completed }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            isActive ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:border-gray-300'
        } ${disabled ? 'cursor-not-allowed text-gray-300' : ''}`}
    >
        {title} {completed && '✅'}
    </button>
);

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


const Voucher: React.FC<VoucherProps> = ({ reservation, sources, rentalLocations, onClose, companyDetails, onUpdate, trafficTickets }) => {
    const getInitialReservationState = (res: Reservation) => {
        const migrated: any = { ...res };
        if (res.checklist && !res.pickupChecklist) migrated.pickupChecklist = res.checklist;
        if (res.damageMarkers && !res.pickupDamageMarkers) migrated.pickupDamageMarkers = res.damageMarkers;
        if (res.renterSignature && !res.pickupRenterSignature) migrated.pickupRenterSignature = res.renterSignature;
        if (res.agentSignature && !res.pickupAgentSignature) migrated.pickupAgentSignature = res.agentSignature;
        if (res.agentName && !res.pickupAgentName) migrated.pickupAgentName = res.agentName;
        delete migrated.checklist;
        delete migrated.damageMarkers;
        delete migrated.renterSignature;
        delete migrated.agentSignature;
        delete migrated.agentName;
        return migrated;
    };
    
    const [localReservation, setLocalReservation] = useState<Reservation>(getInitialReservationState(reservation));
    const [viewMode, setViewMode] = useState<'pickup' | 'dropoff'>(reservation.voucherSubmitted ? 'dropoff' : 'pickup');
    const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
    
    const [processType, setProcessType] = useState<'selection' | 'return' | 'exchange'>(
        (reservation.voucherSubmitted && !reservation.dropOffCompleted) ? 'selection' : 'return'
    );
    const [exchangeStep, setExchangeStep] = useState<'checkin' | 'checkout'>('checkin');
    const [currentExchange, setCurrentExchange] = useState<Partial<CarExchange>>({});

    const outstandingTickets = useMemo(() => {
        if (!trafficTickets) return [];
        return trafficTickets.filter(
            ticket => ticket.bookingId === reservation.bookingId && ticket.status === 'NOT_COLLECTED'
        );
    }, [trafficTickets, reservation.bookingId]);

    const totalTicketAmountDue = useMemo(() => {
        return outstandingTickets.reduce((sum, ticket) => sum + ticket.amount, 0);
    }, [outstandingTickets]);

    const hasOutstandingTickets = outstandingTickets.length > 0;
    
    const dueForExtension = localReservation.unpaidExtensionAmount || 0;
    const hasDueExtension = dueForExtension > 0;
    
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
        const now = new Date();
        const formattedDateTime = now.toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });

        if (viewMode === 'pickup' && !localReservation.voucherSubmitted && !localReservation.pickupDateTime) {
            setLocalReservation(prev => ({ ...prev, pickupDateTime: formattedDateTime }));
        }

        if (viewMode === 'dropoff' && processType === 'return' && localReservation.voucherSubmitted && !localReservation.dropOffCompleted && !localReservation.dropOffDateTime) {
            setLocalReservation(prev => ({ ...prev, dropOffDateTime: formattedDateTime }));
        }
        
        if (viewMode === 'dropoff' && processType === 'return' && !localReservation.dropOffCompleted && !localReservation.lateReturnFee) {
            const dropOffTime = new Date();
            const scheduledReturnTime = new Date(localReservation.endDate);
            if (!isNaN(scheduledReturnTime.getTime())) {
                const diffInMs = dropOffTime.getTime() - scheduledReturnTime.getTime();
                const diffInHours = diffInMs / (1000 * 60 * 60);

                if (diffInHours > 2) {
                    const newLateFee: LateReturnFee = {
                        feeAppliedDate: new Date().toISOString().split('T')[0],
                        hoursLate: parseFloat(diffInHours.toFixed(1)),
                        amount: parseFloat(dailyRate.toFixed(2)),
                        isWaived: false,
                        status: 'PENDING',
                        notes: `Vehicle returned ${parseFloat(diffInHours.toFixed(1))} hours late.`
                    };
                    const updatedReservation = { ...localReservation, lateReturnFee: newLateFee };
                    setLocalReservation(updatedReservation);
                    onUpdate(updatedReservation);
                }
            }
        }
    }, [viewMode, processType, localReservation.voucherSubmitted, localReservation.dropOffCompleted, localReservation.pickupDateTime, localReservation.dropOffDateTime, localReservation.endDate, localReservation.lateReturnFee, dailyRate, onUpdate, localReservation]);


    const isPickupEditable = !localReservation.voucherSubmitted;
    const isDropoffBlockedByPendingFee = localReservation.lateReturnFee?.status === 'PENDING';
    const isDropoffEditable = !!localReservation.voucherSubmitted && !localReservation.dropOffCompleted && !hasOutstandingTickets && !hasDueExtension && !isDropoffBlockedByPendingFee;
    
    const location = rentalLocations.find(loc => loc.name === reservation.locationName);
    const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    
    const checklistItems = [ "Spare Tire", "Jack & Tools", "Windows & Windshield", "Headlights", "Turn Signals", "AC / Heater", "Audio System", "Mirrors", "Interior Cleanliness" ];

    const handleFieldChange = (field: keyof Reservation, value: any) => {
         const isEditable = viewMode === 'pickup' ? isPickupEditable : isDropoffEditable;
         if (!isEditable) return;
         setLocalReservation(prev => ({ ...prev, [field]: value }));
    };

    const handleDamageMark = (e: React.MouseEvent<HTMLDivElement>, view: CarView) => {
        const isEditable = viewMode === 'pickup' ? isPickupEditable : isDropoffEditable;
        if (!isEditable) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        const field = viewMode === 'pickup' ? 'pickupDamageMarkers' : 'dropOffDamageMarkers';
        handleFieldChange(field, [...(localReservation[field] || []), { x, y, view }]);
    };
    
    const removeDamageMarker = (index: number) => {
        const isEditable = viewMode === 'pickup' ? isPickupEditable : isDropoffEditable;
        if (!isEditable) return;
        const field = viewMode === 'pickup' ? 'pickupDamageMarkers' : 'dropOffDamageMarkers';
        handleFieldChange(field, localReservation[field]?.filter((_, i) => i !== index));
    };
    
    const handleSubmit = () => {
        if (!localReservation.customerEmail?.trim() || !/^\S+@\S+\.\S+$/.test(localReservation.customerEmail)) {
            alert("Please enter a valid customer email address."); return;
        }

        if (viewMode === 'pickup') {
            if (!localReservation.pickupRenterSignature) { alert("Renter signature is required."); return; }
            if (!localReservation.pickupAgentSignature) { alert("Agent signature is required."); return; }
            
            const submittedVoucher = { ...localReservation, voucherSubmitted: true };
            onUpdate(submittedVoucher);
            setLocalReservation(submittedVoucher); // Update local state
            setShowSuccessOverlay(true);
        } else { // dropoff view
            if (processType === 'return') {
                if (!localReservation.dropOffRenterSignature) { alert("Renter signature is required for drop-off."); return; }
                if (!localReservation.dropOffAgentSignature) { alert("Agent signature is required for drop-off."); return; }
                
                let submittedVoucher = { ...localReservation, dropOffCompleted: true };
                onUpdate(submittedVoucher);
                onClose();
            } else if (processType === 'exchange') {
                // Validation for exchange
                if (!currentExchange.reason?.trim()) { alert("A reason for the exchange is required."); return; }
                if (!currentExchange.checkinRenterSignature || !currentExchange.checkinAgentSignature) { alert("Signatures for checking in the old car are required."); return; }
                if (!currentExchange.newCarLicensePlate?.trim()) { alert("The new car's license plate is required."); return; }
                if (!currentExchange.checkoutRenterSignature || !currentExchange.checkoutAgentSignature) { alert("Signatures for checking out the new car are required."); return; }

                const completeExchange: CarExchange = {
                    exchangeDate: new Date().toISOString(),
                    reason: currentExchange.reason,
                    oldCarLicensePlate: localReservation.licensePlate || 'UNKNOWN',
                    checkinRenterSignature: currentExchange.checkinRenterSignature,
                    checkinAgentSignature: currentExchange.checkinAgentSignature,
                    checkinAgentName: currentExchange.checkinAgentName || '',
                    checkinDamageMarkers: currentExchange.checkinDamageMarkers || [],
                    checkinChecklist: currentExchange.checkinChecklist || {},
                    checkinFuelLevel: currentExchange.checkinFuelLevel || 0,
                    checkinKmIn: currentExchange.checkinKmIn || 0,
                    newCarLicensePlate: currentExchange.newCarLicensePlate,
                    checkoutRenterSignature: currentExchange.checkoutRenterSignature,
                    checkoutAgentSignature: currentExchange.checkoutAgentSignature,
                    checkoutAgentName: currentExchange.checkoutAgentName || '',
                    checkoutDamageMarkers: currentExchange.checkoutDamageMarkers || [],
                    checkoutChecklist: currentExchange.checkoutChecklist || {},
                    checkoutFuelLevel: currentExchange.checkoutFuelLevel || 0,
                    checkoutKmOut: currentExchange.checkoutKmOut || 0,
                };
                
                const updatedReservation: Reservation = {
                    ...localReservation,
                    licensePlate: completeExchange.newCarLicensePlate,
                    pickupKmOut: completeExchange.checkoutKmOut,
                    carExchanges: [...(localReservation.carExchanges || []), completeExchange],
                };
                onUpdate(updatedReservation);
                onClose();
            }
        }
    };

    const handleDownloadVoucherPDF = () => {
        const element = document.getElementById('voucher-print-area');
        if (!element || typeof html2canvas === 'undefined') {
            alert('Could not generate PDF. A required library might be missing.');
            return;
        }
        // @ts-ignore
        const { jsPDF } = window.jspdf;

        html2canvas(element, { scale: 2 }).then((canvas: any) => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
            const imgX = (pdfWidth - imgWidth * ratio) / 2;
            const imgY = 10;
            
            pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
            pdf.save(`rental-agreement-${localReservation.bookingId}.pdf`);
        });
    };

    const handleDownloadReceiptPDF = () => {
         // @ts-ignore
        if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') return;
        // @ts-ignore
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const rentalDays = calculateDaysWithGrace(reservation.startDate, reservation.endDate);
        const extrasTotal = reservation.extras?.reduce((sum, extra) => extra.isComplementary ? sum : sum + (extra.dailyPrice * rentalDays), 0) ?? 0;
        const baseRentalFee = (reservation.baseAmount ?? (reservation.amount || 0)) - extrasTotal;
        const totalCharges = baseRentalFee + extrasTotal;

        // Header
        doc.addImage(URDRIVE_LOGO_B64, 'SVG', 14, 15, 60, 10);
        doc.setFontSize(22);
        doc.text('Receipt', 200, 22, { align: 'right' });
        doc.setFontSize(10);
        doc.text(`Receipt ID: RCPT-${reservation.bookingId}`, 200, 30, { align: 'right' });
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 200, 35, { align: 'right' });

        // Billed To & Summary
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Billed To:', 14, 50);
        doc.setFont('helvetica', 'normal');
        doc.text(reservation.personName, 14, 56);
        doc.text(reservation.customerEmail || 'No email', 14, 62);
        
        const tableBody = [
            ['Base Rental Fee', formatCurrency(baseRentalFee)],
            ...(reservation.extras || []).map(extra => [
                `Extra: ${extra.name}`,
                extra.isComplementary ? 'Free' : formatCurrency(extra.dailyPrice * rentalDays)
            ]),
        ];
        
        (doc as any).autoTable({
            startY: 75,
            head: [['Description', 'Amount']],
            body: tableBody,
            foot: [
                ['Total Charges', formatCurrency(totalCharges)],
                ['Amount Paid', formatCurrency(totalCharges)],
                ['Balance Due', formatCurrency(0)],
            ],
            theme: 'striped',
            headStyles: { fillColor: [71, 85, 105] },
            footStyles: { fontStyle: 'bold', fillColor: [241, 245, 249] },
        });

        doc.save(`receipt-${reservation.bookingId}.pdf`);
    };

    const handleSendEmail = () => {
        const subject = `Your Rental Documents from ${companyDetails.name} - Booking #${localReservation.bookingId}`;
        const body = `Dear ${localReservation.personName},\n\nThank you for choosing ${companyDetails.name}.\n\nPlease find your rental agreement and payment receipt attached to this email. We recommend downloading them now using the links in the previous screen.\n\nWe wish you a safe journey!\n\nSincerely,\nThe ${companyDetails.name} Team`;
        window.location.href = `mailto:${localReservation.customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };

    const rentalDays = calculateDaysWithGrace(reservation.startDate, reservation.endDate);
    const extrasTotal = (reservation.extras || []).reduce((sum, extra) => extra.isComplementary ? sum : sum + (extra.dailyPrice * rentalDays), 0);
    const baseRentalFee = reservation.baseAmount ?? ((reservation.amount || 0) - extrasTotal);
    const totalCost = baseRentalFee + extrasTotal;
    
    const sourceInfo = sources.find(s => s.name === reservation.source);
    const isPayOnArrival = sourceInfo?.paymentType === PaymentType.PAY_ON_ARRIVAL;
    const isPrepaid = sourceInfo?.paymentType === PaymentType.PREPAID;
    
    const renderChecks = (mode: 'pickup' | 'dropoff') => {
        const isEditable = mode === 'pickup' ? isPickupEditable : isDropoffEditable;
        const checklist = localReservation[mode === 'pickup' ? 'pickupChecklist' : 'dropOffChecklist'] || {};
        const damageMarkers = localReservation[mode === 'pickup' ? 'pickupDamageMarkers' : 'dropOffDamageMarkers'] || [];
        const fuelLevel = localReservation[mode === 'pickup' ? 'pickupFuelLevel' : 'dropOffFuelLevel'];
        const renterSign = localReservation[mode === 'pickup' ? 'pickupRenterSignature' : 'dropOffRenterSignature'];
        const agentSign = localReservation[mode === 'pickup' ? 'pickupAgentSignature' : 'dropOffAgentSignature'];
        const agentName = localReservation[mode === 'pickup' ? 'pickupAgentName' : 'dropOffAgentName'];
        
        return (
             <>
                <section className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6 pt-4">
                    <div>
                        <h2 className="text-base font-bold text-primary border-b border-gray-200 pb-2 mb-3 uppercase tracking-wider">{mode === 'pickup' ? 'Pre-Rental' : 'Post-Rental'} Checklist</h2>
                        {mode === 'pickup' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm font-sans-ui">
                                {checklistItems.map(item => (
                                    <label key={item} className="flex items-center">
                                        <input type="checkbox" checked={checklist[item] || false} onChange={(e) => handleFieldChange(mode === 'pickup' ? 'pickupChecklist' : 'dropOffChecklist', {...checklist, [item]: e.target.checked})} disabled={!isEditable} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-secondary disabled:bg-gray-200" />
                                        <span className="ml-2 text-gray-700">{item}</span>
                                    </label>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-1 text-sm font-sans-ui">
                                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 font-semibold text-xs text-gray-500 px-2">
                                    <span>Item</span>
                                    <span className="text-center w-12">Pickup</span>
                                    <span className="text-center w-12">Drop-off</span>
                                </div>
                                {checklistItems.map(item => {
                                    const pickupChecked = localReservation.pickupChecklist?.[item] || false;
                                    const dropoffChecked = localReservation.dropOffChecklist?.[item] || false;
                                    
                                    return (
                                        <div key={item} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-t py-1.5 px-2">
                                            <span className="text-gray-700">{item}</span>
                                            <div className="flex justify-center w-12" title={`Pickup: ${pickupChecked ? 'OK' : 'Missing'}`}>
                                                <input type="checkbox" checked={pickupChecked} disabled className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-secondary disabled:bg-gray-200 disabled:opacity-75" />
                                            </div>
                                            <div className="flex justify-center w-12">
                                                <input type="checkbox" checked={dropoffChecked} onChange={(e) => handleFieldChange('dropOffChecklist', {...checklist, [item]: e.target.checked})} disabled={!isDropoffEditable} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-secondary disabled:bg-gray-200 cursor-pointer disabled:cursor-not-allowed" />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                         <div className="mt-4">
                            <h3 className="text-sm font-semibold text-gray-700 mb-1">Fuel Level</h3>
                            <FuelGauge level={fuelLevel} onLevelChange={(level) => handleFieldChange(mode === 'pickup' ? 'pickupFuelLevel' : 'dropOffFuelLevel', level)} disabled={!isEditable} pickupLevel={mode === 'dropoff' ? localReservation.pickupFuelLevel : undefined}/>
                        </div>
                        <div className="mt-4">
                            <h3 className="text-sm font-semibold text-gray-700 mb-1">{mode === 'pickup' ? 'Kilometers Out' : 'Kilometers In'}</h3>
                             {mode === 'dropoff' && (
                                <p className="text-xs text-gray-500">KM Out at pickup: {localReservation.pickupKmOut?.toLocaleString() || 'N/A'}</p>
                            )}
                            <input 
                                type="number" 
                                value={(mode === 'pickup' ? localReservation.pickupKmOut : localReservation.dropOffKmIn) || ''} 
                                onChange={e => handleFieldChange(mode === 'pickup' ? 'pickupKmOut' : 'dropOffKmIn', parseInt(e.target.value) || undefined)}
                                disabled={!isEditable}
                                className="w-full p-2 mt-1 border rounded-md text-sm disabled:bg-gray-200"
                                placeholder={mode === 'pickup' ? "Enter starting KM" : "Enter returning KM"}
                            />
                             {mode === 'dropoff' && localReservation.dropOffKmIn && localReservation.pickupKmOut && localReservation.dropOffKmIn > localReservation.pickupKmOut && (
                                <p className="text-sm font-semibold mt-1 text-primary">
                                    Total Driven: {(localReservation.dropOffKmIn - localReservation.pickupKmOut).toLocaleString()} KM
                                </p>
                            )}
                        </div>
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-primary border-b border-gray-200 pb-2 mb-3 uppercase tracking-wider">Vehicle Condition Report</h2>
                        <div className="grid grid-cols-2 gap-4">
                            {(['front', 'back', 'left', 'right'] as CarView[]).map(view => {
                                const Icon = {front: FrontCarIcon, back: BackCarIcon, left: LeftSideCarIcon, right: RightSideCarIcon}[view];
                                return (
                                    <div key={view}>
                                        <p className="text-center text-xs font-medium capitalize mb-1">{view} View</p>
                                        <div className={`relative ${isEditable ? 'cursor-crosshair' : ''} bg-gray-100 p-2 rounded-md aspect-[1.6]`} onClick={(e) => handleDamageMark(e, view)}>
                                            <Icon className="w-full h-full text-gray-600" />
                                            {mode === 'dropoff' && localReservation.pickupDamageMarkers?.map((marker, index) => marker.view === view && (
                                                <div key={`pickup-${index}`} className="absolute w-4 h-4 text-blue-500 font-bold text-lg flex items-center justify-center pointer-events-none" style={{ left: `calc(${marker.x}% - 8px)`, top: `calc(${marker.y}% - 8px)` }} title="Damage from pickup">O</div>
                                            ))}
                                            {damageMarkers.map((marker, index) => marker.view === view && (
                                                <div key={index} className={`absolute w-4 h-4 text-red-500 font-bold text-lg flex items-center justify-center ${isEditable ? 'cursor-pointer' : ''}`} style={{ left: `calc(${marker.x}% - 8px)`, top: `calc(${marker.y}% - 8px)` }} onClick={(e) => { e.stopPropagation(); removeDamageMarker(index); }} title="Remove mark">X</div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                         {mode === 'dropoff' && <p className="text-xs text-center mt-2 text-gray-500">Pickup damage marked with <span className="text-blue-500 font-bold">O</span>. New damage marked with <span className="text-red-500 font-bold">X</span>.</p>}
                    </div>
                </section>

                <section className="my-6">
                    <h2 className="text-base font-bold text-primary border-b border-gray-200 pb-2 mb-3 uppercase tracking-wider">Terms & Signatures ({mode})</h2>
                    {mode === 'pickup' && <div className="text-xs text-gray-600 p-3 border rounded-md bg-gray-50/50 mb-4">By signing below, the Renter acknowledges receipt of the vehicle in good condition as documented above and agrees to the full terms and conditions provided separately. The Renter accepts financial responsibility for all charges, traffic violations, damages, and losses incurred during the rental period. The Company Representative confirms the vehicle's condition and rental details are accurate at the time of pickup.</div>}
                    {mode === 'dropoff' && <div className="text-xs text-gray-600 p-3 border rounded-md bg-gray-50/50 mb-4">By signing, the Renter confirms the return of the vehicle. The final condition and any additional charges (e.g., for fuel shortage, new damages) have been reviewed and accepted. The Company Representative confirms receipt of the vehicle and the accuracy of the post-rental inspection.</div>}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <SignaturePad title="Renter Signature" signature={renterSign} onSave={(data) => handleFieldChange(mode === 'pickup' ? 'pickupRenterSignature' : 'dropOffRenterSignature', data)} onClear={() => handleFieldChange(mode === 'pickup' ? 'pickupRenterSignature' : 'dropOffRenterSignature', undefined)} disabled={!isEditable} />
                        <div>
                            <SignaturePad title="Company Representative Signature" signature={agentSign} onSave={(data) => handleFieldChange(mode === 'pickup' ? 'pickupAgentSignature' : 'dropOffAgentSignature', data)} onClear={() => handleFieldChange(mode === 'pickup' ? 'pickupAgentSignature' : 'dropOffAgentSignature', undefined)} disabled={!isEditable} />
                             <div className="mt-1">
                                <label htmlFor="agent-name" className="text-xs text-gray-500">Representative Name</label>
                                <input id="agent-name" type="text" value={agentName || ''} onChange={e => handleFieldChange(mode === 'pickup' ? 'pickupAgentName' : 'dropOffAgentName', e.target.value)} className="w-full p-1 border-b text-sm focus:outline-none focus:ring-0 focus:border-primary disabled:bg-transparent disabled:border-gray-200 font-serif-professional" disabled={!isEditable} placeholder="Print name here" />
                            </div>
                        </div>
                    </div>
                </section>
             </>
        );
    }
    
    const renderExchangeStep = (step: 'checkin' | 'checkout') => {
        const isEditable = !localReservation.dropOffCompleted && !hasOutstandingTickets && !hasDueExtension;
        const checklist = currentExchange[step === 'checkin' ? 'checkinChecklist' : 'checkoutChecklist'] || {};
        const damageMarkers = currentExchange[step === 'checkin' ? 'checkinDamageMarkers' : 'checkoutDamageMarkers'] || [];
        const fuelLevel = currentExchange[step === 'checkin' ? 'checkinFuelLevel' : 'checkoutFuelLevel'];
        const renterSign = currentExchange[step === 'checkin' ? 'checkinRenterSignature' : 'checkoutRenterSignature'];
        const agentSign = currentExchange[step === 'checkin' ? 'checkinAgentSignature' : 'checkoutAgentSignature'];
        const agentName = currentExchange[step === 'checkin' ? 'checkinAgentName' : 'checkoutAgentName'];

        const handleExchangeFieldChange = (field: keyof CarExchange, value: any) => {
            if (!isEditable) return;
            setCurrentExchange(prev => ({...prev, [field]: value}));
        }

        const handleExchangeDamageMark = (e: React.MouseEvent<HTMLDivElement>, view: CarView) => {
            if (!isEditable) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            const field = step === 'checkin' ? 'checkinDamageMarkers' : 'checkoutDamageMarkers';
            handleExchangeFieldChange(field, [...(currentExchange[field] || []), { x, y, view }]);
        };
        
        const removeExchangeDamageMarker = (index: number) => {
            if (!isEditable) return;
            const field = step === 'checkin' ? 'checkinDamageMarkers' : 'checkoutDamageMarkers';
            handleExchangeFieldChange(field, currentExchange[field]?.filter((_, i) => i !== index));
        };
        
        return (
             <>
                <section className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6 pt-4">
                    <div>
                        <h2 className="text-base font-bold text-primary border-b border-gray-200 pb-2 mb-3 uppercase tracking-wider">{step === 'checkin' ? 'Old Car' : 'New Car'} Checklist</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm font-sans-ui">
                            {checklistItems.map(item => (
                                <label key={item} className="flex items-center">
                                    <input type="checkbox" checked={checklist[item] || false} onChange={(e) => handleExchangeFieldChange(step === 'checkin' ? 'checkinChecklist' : 'checkoutChecklist', {...checklist, [item]: e.target.checked})} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-secondary" disabled={!isEditable} />
                                    <span className="ml-2 text-gray-700">{item}</span>
                                </label>
                            ))}
                        </div>
                         <div className="mt-4">
                            <h3 className="text-sm font-semibold text-gray-700 mb-1">Fuel Level</h3>
                            <FuelGauge level={fuelLevel} onLevelChange={(level) => handleExchangeFieldChange(step === 'checkin' ? 'checkinFuelLevel' : 'checkoutFuelLevel', level)} pickupLevel={step === 'checkin' ? localReservation.pickupFuelLevel : undefined} disabled={!isEditable} />
                        </div>
                        <div className="mt-4">
                            <h3 className="text-sm font-semibold text-gray-700 mb-1">{step === 'checkin' ? 'Kilometers In (Check-in)' : 'Kilometers Out (New Car)'}</h3>
                            {step === 'checkin' && <p className="text-xs text-gray-500">KM Out at pickup: {localReservation.pickupKmOut?.toLocaleString() || 'N/A'}</p>}
                            <input
                                type="number"
                                value={(step === 'checkin' ? currentExchange.checkinKmIn : currentExchange.checkoutKmOut) || ''}
                                onChange={e => handleExchangeFieldChange(step === 'checkin' ? 'checkinKmIn' : 'checkoutKmOut', parseInt(e.target.value) || undefined)}
                                className="w-full p-2 mt-1 border rounded-md text-sm"
                                placeholder={step === 'checkin' ? "Enter returning KM" : "Enter starting KM for new car"}
                                disabled={!isEditable}
                            />
                             {step === 'checkin' && currentExchange.checkinKmIn && localReservation.pickupKmOut && currentExchange.checkinKmIn > localReservation.pickupKmOut && (
                                <p className="text-sm font-semibold mt-1 text-primary">
                                    Total Driven (Old Car): {(currentExchange.checkinKmIn - localReservation.pickupKmOut).toLocaleString()} KM
                                </p>
                            )}
                        </div>
                        {step === 'checkin' && (
                            <div className="mt-4">
                                <label htmlFor="exchange-reason" className="block text-sm font-medium text-gray-700 mb-1">Reason for Exchange</label>
                                <textarea id="exchange-reason" value={currentExchange.reason || ''} onChange={(e) => handleExchangeFieldChange('reason', e.target.value)} rows={2} className="w-full p-2 border rounded-md" required disabled={!isEditable} />
                            </div>
                        )}
                         {step === 'checkout' && (
                            <div className="mt-4">
                                <label htmlFor="new-license-plate" className="block text-sm font-medium text-gray-700 mb-1">New Car License Plate</label>
                                <input id="new-license-plate" value={currentExchange.newCarLicensePlate || ''} onChange={(e) => handleExchangeFieldChange('newCarLicensePlate', e.target.value)} className="w-full p-2 border rounded-md" required disabled={!isEditable}/>
                            </div>
                        )}
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-primary border-b border-gray-200 pb-2 mb-3 uppercase tracking-wider">Vehicle Condition Report</h2>
                        <div className="grid grid-cols-2 gap-4">
                            {(['front', 'back', 'left', 'right'] as CarView[]).map(view => {
                                const Icon = {front: FrontCarIcon, back: BackCarIcon, left: LeftSideCarIcon, right: RightSideCarIcon}[view];
                                return (
                                    <div key={view}>
                                        <p className="text-center text-xs font-medium capitalize mb-1">{view} View</p>
                                        <div className={`relative ${isEditable ? 'cursor-crosshair' : ''} bg-gray-100 p-2 rounded-md aspect-[1.6]`} onClick={(e) => handleExchangeDamageMark(e, view)}>
                                            <Icon className="w-full h-full text-gray-600" />
                                            {step === 'checkin' && localReservation.pickupDamageMarkers?.map((marker, index) => marker.view === view && (
                                                <div key={`pickup-${index}`} className="absolute w-4 h-4 text-blue-500 font-bold text-lg flex items-center justify-center pointer-events-none" style={{ left: `calc(${marker.x}% - 8px)`, top: `calc(${marker.y}% - 8px)` }} title="Damage from pickup">O</div>
                                            ))}
                                            {damageMarkers.map((marker, index) => marker.view === view && (
                                                <div key={index} className="absolute w-4 h-4 text-red-500 font-bold text-lg flex items-center justify-center cursor-pointer" style={{ left: `calc(${marker.x}% - 8px)`, top: `calc(${marker.y}% - 8px)` }} onClick={(e) => { e.stopPropagation(); removeExchangeDamageMarker(index); }} title="Remove mark">X</div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                         {step === 'checkin' && <p className="text-xs text-center mt-2 text-gray-500">Pickup damage marked with <span className="text-blue-500 font-bold">O</span>. New damage marked with <span className="text-red-500 font-bold">X</span>.</p>}
                    </div>
                </section>

                <section className="my-6">
                    <h2 className="text-base font-bold text-primary border-b border-gray-200 pb-2 mb-3 uppercase tracking-wider">Signatures ({step})</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <SignaturePad title="Renter Signature" signature={renterSign} onSave={(data) => handleExchangeFieldChange(step === 'checkin' ? 'checkinRenterSignature' : 'checkoutRenterSignature', data)} onClear={() => handleExchangeFieldChange(step === 'checkin' ? 'checkinRenterSignature' : 'checkoutRenterSignature', undefined)} disabled={!isEditable} />
                        <div>
                            <SignaturePad title="Company Representative Signature" signature={agentSign} onSave={(data) => handleExchangeFieldChange(step === 'checkin' ? 'checkinAgentSignature' : 'checkoutAgentSignature', data)} onClear={() => handleExchangeFieldChange(step === 'checkin' ? 'checkinAgentSignature' : 'checkoutAgentSignature', undefined)} disabled={!isEditable} />
                             <div className="mt-1">
                                <label className="text-xs text-gray-500">Representative Name</label>
                                <input type="text" value={agentName || ''} onChange={e => handleExchangeFieldChange(step === 'checkin' ? 'checkinAgentName' : 'checkoutAgentName', e.target.value)} className="w-full p-1 border-b text-sm focus:outline-none focus:ring-0 focus:border-primary font-serif-professional" placeholder="Print name here" disabled={!isEditable} />
                            </div>
                        </div>
                    </div>
                </section>
             </>
        );
    }
    

    return (
        <div className="relative bg-white rounded-lg shadow-lg font-sans-ui voucher-container w-full max-w-4xl max-h-[95vh] flex flex-col">
            <header className="flex-shrink-0 px-6 pt-4 border-b bg-gray-50/80 backdrop-blur-sm rounded-t-lg z-10 no-print">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold">Rental Agreement</h2>
                    <div className="flex items-center space-x-2">
                         <TabButton title="Pickup Check" isActive={viewMode === 'pickup'} onClick={() => setViewMode('pickup')} completed={localReservation.voucherSubmitted} />
                         <TabButton title="Return / Exchange" isActive={viewMode === 'dropoff'} onClick={() => setViewMode('dropoff')} disabled={!localReservation.voucherSubmitted} completed={localReservation.dropOffCompleted} />
                    </div>
                </div>
            </header>

            <div className="flex-grow overflow-y-auto voucher-scroll-content">
                <div id="voucher-print-area" className="p-6 sm:p-8 bg-white text-gray-800 font-serif-professional w-full">
                    <header className="flex justify-between items-start pb-4 border-b-2 border-gray-800 mb-6">
                        <div>
                            <img src={URDRIVE_LOGO_B64} alt={companyDetails.name} className="h-6" />
                            <div className="mt-2 text-xs text-gray-600 font-sans-ui">
                                <p className="font-bold text-sm text-gray-800">{companyDetails.name}</p>
                                <p>{companyDetails.address}</p>
                                <p>Phone: {companyDetails.phone}</p>
                                <p>Email: {companyDetails.email}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <h1 className="text-lg font-bold uppercase text-gray-800">Rental Agreement</h1>
                            <p className="text-sm text-gray-600 mt-1 font-sans-ui">
                                <strong>Agreement #:</strong> {reservation.bookingId || 'N/A'}
                            </p>
                        </div>
                    </header>

                    <section className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
                        <InfoBlock title="Renter Details">
                            <InfoPair label="Name" value={reservation.personName} />
                            <InfoPair label="Contact Number" value={reservation.contactNumber} />
                             <div>
                                <p className="text-xs text-gray-500">Customer Email</p>
                                <input type="email" value={localReservation.customerEmail || ''} onChange={e => handleFieldChange('customerEmail', e.target.value)} className="w-full pt-0.5 border-b text-sm font-medium focus:outline-none focus:ring-0 focus:border-primary disabled:bg-transparent disabled:border-gray-200 font-serif-professional" placeholder="Required for receipt" disabled={!isPickupEditable} required />
                            </div>
                            <InfoPair label="Reservation Notes" value={<p className="whitespace-pre-wrap">{reservation.notes || 'None'}</p>} />
                        </InfoBlock>
                        <InfoBlock title="Rental Period & Location">
                            <InfoPair label="Pickup Date" value={`${reservation.startDate}`} />
                            <InfoPair label="Return Date" value={`${reservation.endDate}`} />
                            <InfoPair label="Rental Duration" value={`${rentalDays} day(s)`} />
                            <InfoPair label="Pickup/Return Location" value={<><p className="font-medium text-gray-800">{location?.name || 'N/A'}</p>{location && <p className="text-xs text-gray-500">{location.address}</p>}</>} />
                        </InfoBlock>
                         <InfoBlock title="Vehicle Details">
                            <InfoPair label="Vehicle Model" value={reservation.carModel} />
                            {isPickupEditable ? (
                                <div>
                                    <p className="text-xs text-gray-500">License Plate</p>
                                    <input 
                                        type="text" 
                                        value={localReservation.licensePlate || ''} 
                                        onChange={e => handleFieldChange('licensePlate', e.target.value)}
                                        className="w-full pt-0.5 border-b text-sm font-medium focus:outline-none focus:ring-0 focus:border-primary font-serif-professional"
                                        placeholder="Enter Plate #"
                                    />
                                </div>
                            ) : (
                                <InfoPair label="License Plate" value={localReservation.licensePlate || 'N/A'} />
                            )}
                            <InfoPair label="KM Out (Pickup)" value={localReservation.pickupKmOut?.toLocaleString()} />
                            {localReservation.dropOffKmIn && <InfoPair label="KM In (Return)" value={localReservation.dropOffKmIn?.toLocaleString()} />}
                            {localReservation.dropOffKmIn && localReservation.pickupKmOut && localReservation.dropOffKmIn > localReservation.pickupKmOut && (
                                <InfoPair label="Total KM Driven" value={`${(localReservation.dropOffKmIn - localReservation.pickupKmOut).toLocaleString()} KM`} />
                            )}
                        </InfoBlock>
                        <InfoBlock title="Financial Summary">
                            {isPayOnArrival ? (
                                <>
                                    <div className="space-y-3">
                                        <InfoPair label="Rental Cost" value={formatCurrency(baseRentalFee)} />
                                        <InfoPair label="Extras Cost" value={formatCurrency(extrasTotal)} />
                                        <InfoPair label="Due on Arrival" value={<span className="font-bold text-lg text-red-600">{formatCurrency(totalCost)}</span>} />
                                    </div>
                                    <p className="text-xs text-center text-red-700 mt-4 p-2 bg-red-50 rounded">This amount is due to be paid upon vehicle pickup.</p>
                                </>
                            ) : isPrepaid ? (
                                <>
                                    <div className="space-y-3">
                                        <InfoPair label="Base Rental" value={<span className="font-semibold text-green-600">PAID</span>} />
                                        <InfoPair label="Base Amount" value={formatCurrency(baseRentalFee)} />
                                        <InfoPair label="Extras Total" value={formatCurrency(extrasTotal)} />
                                        {extrasTotal > 0 && <InfoPair label="Due for Extras" value={<span className="font-bold text-lg text-red-600">{formatCurrency(extrasTotal)}</span>} />}
                                    </div>
                                    {extrasTotal > 0 ? (
                                        <p className="text-xs text-center text-red-700 mt-4 p-2 bg-red-50 rounded">Extras are to be paid at the rental desk upon vehicle pickup.</p>
                                    ) : (
                                        <p className="text-xs text-center text-green-700 mt-4 p-2 bg-green-50 rounded">This reservation has been fully prepaid.</p>
                                    )}
                                </>
                            ) : (
                                // Fallback for old/uncategorized sources
                                <div className="space-y-3">
                                    <InfoPair label="Total Reservation Cost" value={formatCurrency(totalCost)} />
                                </div>
                            )}
                            <hr className="my-3"/>
                            <div className="space-y-3">
                                <InfoPair label="Rental Security Deposit" value={formatCurrency(reservation.securityDeposit || 0)} />
                                <InfoPair label="Vehicle Excess Amount" value={formatCurrency(reservation.excess || 0)} />
                            </div>
                        </InfoBlock>
                    </section>
                    
                    {viewMode === 'pickup' && renderChecks('pickup')}
                    {viewMode === 'dropoff' && (
                        <>
                            {hasDueExtension && (
                                <div className="my-6 p-4 bg-orange-100 border-l-4 border-orange-500 text-orange-800 rounded-md" role="alert">
                                    <h3 className="font-bold text-lg flex items-center gap-2"><ShieldExclamationIcon /> Unpaid Extension Balance</h3>
                                    <p className="mt-2">This rental has an outstanding balance of <strong>{formatCurrency(dueForExtension)}</strong> from a previous extension.</p>
                                    <p className="mt-1 text-sm">Please collect the payment and clear the balance in the 'Deferred Payments' section to proceed.</p>
                                </div>
                            )}
                            {hasOutstandingTickets && (
                                <div className="my-6 p-4 bg-red-100 border-l-4 border-red-500 text-red-800 rounded-md" role="alert">
                                    <h3 className="font-bold text-lg flex items-center gap-2"><ShieldExclamationIcon /> Return Process Blocked</h3>
                                    <p className="mt-2">This rental cannot be finalized due to an outstanding balance for traffic tickets.</p>
                                    <p className="mt-1"><strong>Total Amount Due: {totalTicketAmountDue.toFixed(2)} JOD</strong></p>
                                    <p className="mt-2 text-sm">Please collect the payment from the customer and update the ticket status in the 'Traffic Tickets' section to proceed.</p>
                                </div>
                            )}
                            {localReservation.lateReturnFee && (
                                <section className="my-6">
                                    {localReservation.lateReturnFee.status === 'PENDING' && (
                                        <div className="p-4 bg-red-100 border-l-4 border-red-500 text-red-800 rounded-md">
                                            <h3 className="font-bold text-lg">Action Required: Late Return Detected</h3>
                                            <p className="mt-2">This return cannot be finalized until the late fee is resolved by a manager in the 'Late Returns' section.</p>
                                        </div>
                                    )}
                                    {localReservation.lateReturnFee.status === 'WAIVED' && (
                                        <div className="p-4 bg-blue-100 border-l-4 border-blue-500 text-blue-800 rounded-md">
                                            <h3 className="font-bold text-lg">Late Fee Information</h3>
                                            <p className="mt-2 text-sm">The late fee for this rental was waived.</p>
                                            {localReservation.lateReturnFee.notes && <p className="text-sm mt-1">Notes: {localReservation.lateReturnFee.notes}</p>}
                                            {localReservation.lateReturnFee.resolvedBy && <p className="text-xs mt-1">Resolved by: {localReservation.lateReturnFee.resolvedBy} on {localReservation.lateReturnFee.resolvedDate}</p>}
                                        </div>
                                    )}
                                    {localReservation.lateReturnFee.status === 'APPLIED' && (
                                        <div className="p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 rounded-md">
                                            <h3 className="font-bold text-lg">Late Fee Information</h3>
                                            <p className="mt-2 text-sm">A late fee of <strong>{formatCurrency(localReservation.lateReturnFee.amount)}</strong> was applied.</p>
                                            {localReservation.lateReturnFee.notes && <p className="text-sm mt-1">Notes: {localReservation.lateReturnFee.notes}</p>}
                                            {localReservation.lateReturnFee.resolvedBy && <p className="text-xs mt-1">Resolved by: {localReservation.lateReturnFee.resolvedBy} on {localReservation.lateReturnFee.resolvedDate}</p>}
                                        </div>
                                    )}
                                </section>
                            )}
                            <fieldset disabled={hasOutstandingTickets || hasDueExtension || isDropoffBlockedByPendingFee}>
                                {(processType === 'selection' && !localReservation.dropOffCompleted) ? (
                                    <div className="p-10 text-center border-y my-6">
                                        <h2 className="text-xl font-bold mb-6">What are you processing today?</h2>
                                        <div className="flex justify-center gap-6">
                                            <button onClick={() => setProcessType('return')} className="px-8 py-4 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors text-lg font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed">Final Vehicle Return</button>
                                            <button onClick={() => setProcessType('exchange')} className="px-8 py-4 bg-green-600 text-white rounded-lg shadow-md hover:bg-green-700 transition-colors text-lg font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed">Vehicle Exchange</button>
                                        </div>
                                    </div>
                                ) : processType === 'exchange' ? (
                                    <div>
                                        {exchangeStep === 'checkin' ? renderExchangeStep('checkin') : renderExchangeStep('checkout')}
                                    </div>
                                ) : (
                                    renderChecks('dropoff')
                                )}
                            </fieldset>
                        </>
                    )}

                    <footer className="text-center pt-4 mt-4 border-t border-gray-300">
                        <p className="text-sm font-semibold">Thank you for choosing {companyDetails.name}!</p>
                        <p className="text-xs text-gray-500 mt-1">{companyDetails.address} | {companyDetails.phone} | {companyDetails.email}</p>
                    </footer>
                </div>
            </div>

            { !showSuccessOverlay && (
                <footer className="flex-shrink-0 p-4 border-t bg-gray-50 flex justify-between items-center no-print">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">
                        Close
                    </button>
                    <div className="flex items-center gap-4">
                        {viewMode === 'dropoff' && processType === 'exchange' && (
                            <>
                            {exchangeStep === 'checkout' && <button onClick={() => setExchangeStep('checkin')} className="px-4 py-2 text-gray-800">Back</button>}
                            {exchangeStep === 'checkin' && <button onClick={() => setExchangeStep('checkout')} disabled={!currentExchange.checkinRenterSignature || !currentExchange.checkinAgentSignature || !currentExchange.reason || hasOutstandingTickets || hasDueExtension} className="px-6 py-2 bg-primary text-white rounded-md hover:bg-secondary disabled:bg-gray-400">Next: Check-out New Car</button>}
                            </>
                        )}

                        {((viewMode === 'pickup' && isPickupEditable) || (viewMode === 'dropoff' && processType === 'return' && isDropoffEditable) || (viewMode === 'dropoff' && processType === 'exchange' && exchangeStep === 'checkout' && isDropoffEditable)) ? (
                            <button onClick={handleSubmit} disabled={hasOutstandingTickets || hasDueExtension || isDropoffBlockedByPendingFee} className="px-6 py-2 bg-primary text-white rounded-md hover:bg-secondary disabled:bg-gray-400">
                                {`Submit & Finalize ${processType === 'exchange' ? 'Exchange' : viewMode === 'pickup' ? 'Pickup' : 'Return'}`}
                            </button>
                        ) : (
                            <button onClick={() => window.print()} className="px-6 py-2 bg-secondary text-white rounded-md hover:bg-primary flex items-center gap-2">
                                <PrinterIcon /> Print Agreement
                            </button>
                        )}
                    </div>
                </footer>
            )}
            
            {showSuccessOverlay && (
                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 no-print space-y-6">
                     <svg className="w-16 h-16 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h2 className="text-2xl font-bold text-gray-800">Pickup Process Completed!</h2>
                    <p className="text-gray-600 text-center max-w-md">The rental agreement has been finalized. You can now provide the customer with their documents.</p>

                    <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
                        <div className="bg-gray-100 p-4 rounded-lg text-center">
                            <h4 className="font-semibold text-gray-700">Rental Agreement</h4>
                            <div className="flex justify-center gap-3 mt-3">
                                <button onClick={handleDownloadVoucherPDF} className="flex items-center gap-2 px-4 py-2 bg-white text-primary border border-primary rounded-md text-sm hover:bg-blue-50"><ExportIcon/> Download PDF</button>
                                <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-white text-primary border border-primary rounded-md text-sm hover:bg-blue-50"><PrinterIcon/> Print</button>
                            </div>
                        </div>
                         <div className="bg-gray-100 p-4 rounded-lg text-center">
                            <h4 className="font-semibold text-gray-700">Payment Receipt</h4>
                            <div className="flex justify-center gap-3 mt-3">
                                <button onClick={handleDownloadReceiptPDF} className="flex items-center gap-2 px-4 py-2 bg-white text-primary border border-primary rounded-md text-sm hover:bg-blue-50"><ExportIcon/> Download PDF</button>
                                <button onClick={() => alert('Printing receipts from here is coming soon. Please download the PDF to print.')} className="flex items-center gap-2 px-4 py-2 bg-white text-primary border border-primary rounded-md text-sm hover:bg-blue-50 opacity-50 cursor-not-allowed"><PrinterIcon/> Print</button>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t w-full max-w-lg text-center">
                        <p className="text-sm text-gray-500 mb-3">Or, prepare an email for the customer (requires manual attachment of downloaded files).</p>
                        <button onClick={handleSendEmail} className="px-6 py-2 bg-secondary text-white rounded-md hover:bg-primary flex items-center gap-2 mx-auto">
                           <MailIcon /> Send Confirmation Email
                        </button>
                    </div>

                    <button onClick={onClose} className="mt-6 px-8 py-2 bg-primary text-white rounded-md hover:bg-primary-dark">Done</button>
                </div>
            )}

        </div>
    );
};

export default Voucher;