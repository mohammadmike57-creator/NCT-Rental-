import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Reservation, CompanyDetails, CarView, RentalSource, PaymentType, RentalLocation, CarExchange, TrafficTicket, LateReturnFee } from '../types';
import SignaturePad from './SignaturePad';
import { FrontCarIcon, BackCarIcon, LeftSideCarIcon, RightSideCarIcon } from './CarCheckIcons';
import { ShieldExclamationIcon, PrinterIcon, ExportIcon, MailIcon, PdfIcon } from './icons';
import { URDRIVE_LOGO_B64 } from '../constants';

interface VoucherProps {
  reservation: Reservation;
  sources: RentalSource[];
  rentalLocations: RentalLocation[];
  trafficTickets: TrafficTicket[];
  onClose: () => void;
  companyDetails: CompanyDetails;
  onUpdate: (reservation: Reservation) => void;
}

const InfoBlock: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <div className={`bg-white border border-gray-200 rounded-lg shadow-sm p-4 h-full ${className || ''}`}>
    <h3 className="text-sm font-semibold text-primary border-b border-gray-200 pb-2 mb-3 uppercase tracking-wider">
      {title}
    </h3>
    <div className="space-y-3 text-sm">{children}</div>
  </div>
);

const InfoPair: React.FC<{ label: string; value?: string | React.ReactNode }> = ({ label, value }) => (
  <div>
    <p className="text-xs text-gray-500 font-medium">{label}</p>
    <p className="font-medium text-gray-800 break-words whitespace-pre-wrap">{value || 'N/A'}</p>
  </div>
);

const FuelGauge: React.FC<{ level?: number; pickupLevel?: number; onLevelChange: (level: number) => void; disabled?: boolean }> = ({ level = 0, pickupLevel, onLevelChange, disabled = false }) => {
  const segments = Array.from({ length: 8 }, (_, i) => i + 1);
  const hasPickupLevel = typeof pickupLevel === 'number';

  return (
    <div>
      <div className="flex items-center justify-between text-xs font-medium text-gray-500 mb-1">
        <span>E</span>
        <span>F</span>
      </div>
      <div className="relative">
        <div className="flex w-full h-8 border-2 border-gray-300 rounded-md overflow-hidden">
          {segments.map(s => (
            <div
              key={s}
              onClick={() => !disabled && onLevelChange(s)}
              className={`flex-1 border-r border-gray-300 last:border-r-0 transition-colors ${!disabled ? 'cursor-pointer hover:bg-slate-300' : ''} ${level >= s ? 'bg-primary' : 'bg-gray-100'}`}
            />
          ))}
        </div>
        {hasPickupLevel && (
          <div className="absolute top-1 bottom-0 left-0 flex items-center" style={{ width: `${(pickupLevel / 8) * 100}%` }}>
            <div className="h-full w-[3px] bg-yellow-500" title={`Pickup Fuel Level: ${pickupLevel}/8`} />
          </div>
        )}
      </div>
      <div className="text-center text-sm font-semibold mt-1">
        {level}/8 Tank {hasPickupLevel && <span className="text-xs font-normal text-gray-500">(Pickup was {pickupLevel}/8)</span>}
      </div>
    </div>
  );
};

const TabButton: React.FC<{ title: string; isActive: boolean; onClick: () => void; disabled?: boolean; completed?: boolean }> = ({ title, isActive, onClick, disabled, completed }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      isActive ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:border-gray-300'
    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
  >
    {title} {completed && ' ✅'}
  </button>
);

const calculateDaysWithGrace = (start: string, end: string): number => {
  if (!start || !end) return 1;
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) return 1;

  const diffInMs = endDate.getTime() - startDate.getTime();
  const oneDayInMs = 24 * 60 * 60 * 1000;
  if (diffInMs <= oneDayInMs) return 1;

  const gracePeriodInMs = 2 * 60 * 60 * 1000;
  const fullDays = Math.floor(diffInMs / oneDayInMs);
  const remainingMs = diffInMs % oneDayInMs;

  if (remainingMs === 0) return fullDays;
  return remainingMs >= gracePeriodInMs ? fullDays + 1 : fullDays;
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
  useEffect(() => {
    setLocalReservation(getInitialReservationState(reservation));
  }, [reservation]);

  const [viewMode, setViewMode] = useState<'pickup' | 'dropoff'>(reservation.voucherSubmitted ? 'dropoff' : 'pickup');
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

  const [processType, setProcessType] = useState<'selection' | 'return' | 'exchange'>(
    (reservation.voucherSubmitted && !reservation.dropOffCompleted) ? 'selection' : 'return'
  );
  const [exchangeStep, setExchangeStep] = useState<'checkin' | 'checkout'>('checkin');
  const [currentExchange, setCurrentExchange] = useState<Partial<CarExchange>>({});

  const outstandingTickets = useMemo(() => {
    if (!trafficTickets) return [];
    return trafficTickets.filter(ticket => ticket.bookingId === reservation.bookingId && ticket.status === 'NOT_COLLECTED');
  }, [trafficTickets, reservation.bookingId]);

  const totalTicketAmountDue = useMemo(() => outstandingTickets.reduce((sum, ticket) => sum + ticket.amount, 0), [outstandingTickets]);
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
    if (originalDays > 0 && baseRentalFee >= 0) return baseRentalFee / originalDays;
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

  const checklistItems = ["Spare Tire", "Jack & Tools", "Windows & Windshield", "Headlights", "Turn Signals", "AC / Heater", "Audio System", "Mirrors", "Interior Cleanliness"];

  const handleFieldChange = (field: keyof Reservation, value: any) => {
    const isEditable = viewMode === 'pickup' ? isPickupEditable : isDropoffEditable;
    const notesAreEditable = (field === 'pickupNotes' && isPickupEditable) || (field === 'dropOffNotes' && !localReservation.dropOffCompleted);
    if (!isEditable && !notesAreEditable) return;
    if (field === 'authNumber' && value) {
      setLocalReservation(prev => ({ ...prev, authNumber: value, pickupPaymentCollected: true }));
    } else {
      setLocalReservation(prev => ({ ...prev, [field]: value }));
    }
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
      alert("Please enter a valid customer email address.");
      return;
    }

    if (viewMode === 'pickup') {
      if (!localReservation.licensePlate?.trim()) { alert("License Plate is required."); return; }
      if (localReservation.pickupKmOut === undefined || localReservation.pickupKmOut === null || localReservation.pickupKmOut < 0) { alert("A valid starting Kilometers Out is required."); return; }

      const sourceInfo = sources.find(s => s.name === localReservation.source);
      const isPayOnArrival = sourceInfo?.paymentType === PaymentType.PAY_ON_ARRIVAL;
      if (isPayOnArrival && !localReservation.authNumber?.trim()) {
        alert("Authorization Number is required for 'Pay on Arrival' reservations.");
        return;
      }

      if (!localReservation.pickupRenterSignature) { alert("Renter signature is required."); return; }
      if (!localReservation.pickupAgentSignature) { alert("Agent signature is required."); return; }

      const submittedVoucher = { ...localReservation, voucherSubmitted: true };
      onUpdate(submittedVoucher);
      setLocalReservation(submittedVoucher);
      setShowSuccessOverlay(true);
    } else {
      if (processType === 'return') {
        if (localReservation.dropOffKmIn === undefined || localReservation.dropOffKmIn === null || localReservation.dropOffKmIn < 0) { alert("A valid returning Kilometers In is required for drop-off."); return; }
        if (localReservation.pickupKmOut !== undefined && localReservation.pickupKmOut !== null && localReservation.dropOffKmIn < localReservation.pickupKmOut) {
          alert("Kilometers In cannot be less than Kilometers Out.");
          return;
        }
        if (!localReservation.dropOffRenterSignature) { alert("Renter signature is required for drop-off."); return; }
        if (!localReservation.dropOffAgentSignature) { alert("Agent signature is required for drop-off."); return; }

        const submittedVoucher = { ...localReservation, dropOffCompleted: true };
        onUpdate(submittedVoucher);
        setLocalReservation(submittedVoucher);
        setShowSuccessOverlay(true);
      } else if (processType === 'exchange') {
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

  // ====================== PRINT-OPTIMIZED PDF GENERATION ======================
  const handleDownloadVoucherPDF = () => {
    const formatCurrencyPrint = (value: number) => `$${value.toFixed(2)}`;
    const formatDatePrint = (dateStr: string) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    const formatDateOnlyPrint = (dateStr: string) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };
    const getDurationDaysPrint = () => {
      if (!localReservation.startDate || !localReservation.endDate) return 0;
      const start = new Date(localReservation.startDate);
      const end = new Date(localReservation.endDate);
      const diff = end.getTime() - start.getTime();
      return Math.max(1, Math.ceil(diff / (1000 * 3600 * 24)));
    };
    const rentalDaysPrint = getDurationDaysPrint();
    const extrasTotalPrint = (localReservation.extras || []).reduce((sum, extra) => sum + extra.price, 0);
    const baseRentalFeePrint = (localReservation.baseAmount || localReservation.amount || 0) - extrasTotalPrint;
    const totalCostPrint = baseRentalFeePrint + extrasTotalPrint;

    const sourceNamePrint = sources.find(s => s.id === localReservation.source)?.name || localReservation.source || '—';
    const locationNamePrint = rentalLocations.find(l => l.id === localReservation.locationName)?.name || localReservation.locationName || '—';

    // Build checklist rows for print (as simple text)
    const pickupChecklist = localReservation.pickupChecklist || {};
    const dropoffChecklist = localReservation.dropOffChecklist || {};
    const checklistRows = checklistItems.map(item => ({
      item,
      pickup: pickupChecklist[item] ? '✓' : '□',
      dropoff: dropoffChecklist[item] ? '✓' : '□',
    }));

    // Damage markers summary (simple list)
    const pickupDamageMarkers = localReservation.pickupDamageMarkers || [];
    const dropoffDamageMarkers = localReservation.dropOffDamageMarkers || [];
    const damageSummary = [];
    if (pickupDamageMarkers.length) damageSummary.push(`Pickup damage: ${pickupDamageMarkers.length} marks`);
    if (dropoffDamageMarkers.length) damageSummary.push(`New damage at drop-off: ${dropoffDamageMarkers.length} marks`);

    // Build HTML for new window
    const html = `<!DOCTYPE html>
    <html>
    <head>
      <title>Rental Voucher - ${localReservation.bookingId}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          background: white;
          padding: 0.3in;
          font-size: 10pt;
          line-height: 1.3;
        }
        @page {
          size: A4;
          margin: 0.3in;
        }
        .header {
          text-align: center;
          border-bottom: 1px solid #aaa;
          padding-bottom: 5px;
          margin-bottom: 10px;
        }
        .header svg {
          max-height: 60px;
          width: auto;
          display: inline-block;
        }
        .header .company-details {
          margin-top: 5px;
          font-size: 9pt;
          color: #555;
        }
        .title {
          text-align: center;
          margin-bottom: 10px;
        }
        .title h2 {
          font-size: 14pt;
          margin: 0;
        }
        .section {
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          padding: 8px;
          margin-bottom: 12px;
          background: #fefefe;
          break-inside: avoid;
        }
        .two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 10px;
        }
        .section h3 {
          font-size: 11pt;
          border-bottom: 1px solid #ccc;
          margin-bottom: 6px;
          padding-bottom: 2px;
        }
        .row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 2px;
        }
        .label {
          font-weight: bold;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .checklist-row {
          display: flex;
          justify-content: space-between;
          font-size: 9pt;
          padding: 2px 0;
          border-bottom: 1px dotted #eee;
        }
        .signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-top: 10px;
        }
        .signature-box {
          text-align: center;
        }
        .signature-line {
          border-top: 1px solid #000;
          margin-top: 5px;
          padding-top: 2px;
          font-size: 8pt;
        }
        .footer {
          text-align: center;
          font-size: 8pt;
          margin-top: 10px;
          border-top: 1px solid #ccc;
          padding-top: 5px;
        }
        .small-text {
          font-size: 8pt;
        }
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <!-- SVG Logo -->
        <svg width="600" height="120" viewBox="0 0 600 120" xmlns="http://www.w3.org/2000/svg">
          <style>
            .dark { fill: #1f2933; font-family: Arial, Helvetica, sans-serif; font-weight: 700; }
            .orange { fill: #ff6a00; font-family: Arial, Helvetica, sans-serif; font-weight: 700; }
          </style>
          <text x="20" y="80" font-size="64" class="dark">
            URDRI<tspan class="orange">V</tspan>E.JO
          </text>
        </svg>
        <div class="company-details">
          <div>${companyDetails.address}</div>
          <div>Tel: ${companyDetails.phone} | Email: ${companyDetails.email}</div>
          <div>Tax No: ${companyDetails.taxNumber}</div>
        </div>
      </div>
      <div class="title">
        <h2>RENTAL AGREEMENT / VOUCHER</h2>
        <div>Booking ID: ${localReservation.bookingId}</div>
      </div>

      <div class="two-col">
        <div class="section">
          <h3>Renter Information</h3>
          <div><span class="label">Name:</span> ${localReservation.personName}</div>
          <div><span class="label">Contact:</span> ${localReservation.contactNumber || '—'}</div>
          <div><span class="label">Email:</span> ${localReservation.customerEmail || '—'}</div>
          <div><span class="label">Source:</span> ${sourceNamePrint}</div>
          <div><span class="label">Booking Date:</span> ${formatDateOnlyPrint(localReservation.bookingDate)}</div>
        </div>
        <div class="section">
          <h3>Vehicle Details</h3>
          <div><span class="label">Model:</span> ${localReservation.carModel}</div>
          <div><span class="label">License Plate:</span> ${localReservation.licensePlate || '—'}</div>
          <div><span class="label">Pickup Date/Time:</span> ${formatDatePrint(localReservation.startDate)}</div>
          <div><span class="label">Return Date/Time:</span> ${formatDatePrint(localReservation.endDate)}</div>
          <div><span class="label">Location:</span> ${locationNamePrint}</div>
          <div><span class="label">Duration:</span> ${rentalDaysPrint} days</div>
        </div>
      </div>

      <div class="section">
        <h3>Financial Summary</h3>
        <div class="grid-2">
          <div><span class="label">Base Rental Fee:</span> ${formatCurrencyPrint(baseRentalFeePrint)}</div>
          <div><span class="label">Extras Total:</span> ${formatCurrencyPrint(extrasTotalPrint)}</div>
          <div><span class="label">Total Amount:</span> <strong>${formatCurrencyPrint(totalCostPrint)}</strong></div>
          <div><span class="label">Security Deposit:</span> ${formatCurrencyPrint(localReservation.securityDeposit || 0)}</div>
          <div><span class="label">Excess:</span> ${formatCurrencyPrint(localReservation.excess || 0)}</div>
          <div><span class="label">Payment Status:</span> ${localReservation.authNumber && localReservation.finalAmountCharged ? 'PAID' : 'NOT AUTHORIZED'}</div>
        </div>
        ${localReservation.authNumber ? `<div><span class="label">Auth Number:</span> ${localReservation.authNumber}</div>` : ''}
        ${localReservation.finalAmountCharged ? `<div><span class="label">Final Amount Charged:</span> ${formatCurrencyPrint(localReservation.finalAmountCharged)}</div>` : ''}
      </div>

      <div class="two-col">
        <div class="section">
          <h3>Checklist (Pickup → Drop‑off)</h3>
          ${checklistRows.map(r => `<div class="checklist-row"><span>${r.item}</span><span>${r.pickup} → ${r.dropoff}</span></div>`).join('')}
          <div class="row" style="margin-top:5px;"><span class="label">Fuel Level:</span> <span>${localReservation.pickupFuelLevel || '?'}/8 → ${localReservation.dropOffFuelLevel || '?'}/8</span></div>
          <div class="row"><span class="label">Kilometers:</span> <span>${localReservation.pickupKmOut || '?'} km → ${localReservation.dropOffKmIn || '?'} km</span></div>
        </div>
        <div class="section">
          <h3>Vehicle Condition</h3>
          <div class="small-text">${damageSummary.length ? damageSummary.join('; ') : 'No damage marks recorded.'}</div>
          <div class="small-text" style="margin-top:5px;">(Detailed marks are available in the system)</div>
        </div>
      </div>

      <div class="section">
        <h3>Notes</h3>
        <div class="small-text">${localReservation.pickupNotes || '—'}</div>
        ${viewMode === 'dropoff' && localReservation.dropOffNotes ? `<div class="small-text" style="margin-top:4px;"><strong>Drop‑off notes:</strong> ${localReservation.dropOffNotes}</div>` : ''}
      </div>

      <div class="signatures">
        <div class="signature-box">
          ${localReservation.pickupRenterSignature ? '<img src="' + localReservation.pickupRenterSignature + '" style="max-height: 50px;" /><br/>' : ''}
          <div class="signature-line">Renter Signature</div>
          <div class="small-text">${localReservation.pickupDateTime || ''}</div>
        </div>
        <div class="signature-box">
          ${localReservation.pickupAgentSignature ? '<img src="' + localReservation.pickupAgentSignature + '" style="max-height: 50px;" /><br/>' : ''}
          <div class="signature-line">Agent Signature</div>
          <div class="small-text">${localReservation.pickupAgentName || ''}</div>
        </div>
      </div>

      <div class="footer">
        <div>Thank you for choosing ${companyDetails.name}!</div>
        <div>${companyDetails.address} | ${companyDetails.phone}</div>
        <div>Generated on ${new Date().toLocaleString()}</div>
      </div>
    </body>
    </html>`;

    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  const handleDownloadReceiptPDF = () => {
    const doc = new (window as any).jsPDF();
    const rentalDays = calculateDaysWithGrace(reservation.startDate, reservation.endDate);
    const extrasTotal = reservation.extras?.reduce((sum, extra) => extra.isComplementary ? sum : sum + (extra.dailyPrice * rentalDays), 0) ?? 0;
    const baseRentalFee = (reservation.baseAmount ?? (reservation.amount || 0)) - extrasTotal;
    const totalCharges = baseRentalFee + extrasTotal;

    doc.addImage(URDRIVE_LOGO_B64, 'PNG', 14, 15, 60, 10);
    doc.setFontSize(22);
    doc.text('Receipt', 200, 22, { align: 'right' });
    doc.setFontSize(10);
    doc.text(`Receipt ID: RCPT-${reservation.bookingId}`, 200, 30, { align: 'right' });
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 200, 35, { align: 'right' });

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
      foot: [['Total Charges', formatCurrency(totalCharges)], ['Amount Paid', formatCurrency(totalCharges)], ['Balance Due', formatCurrency(0)]],
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

  const renderTextField = (label: string, value: string, onChange: (val: string) => void, isEditable: boolean, isEmail: boolean = false) => (
    <div className="w-full">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      {isEditable ? (
        <textarea
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className={`w-full py-1 border-b border-gray-300 text-sm font-medium focus:outline-none focus:border-primary disabled:bg-transparent disabled:border-gray-200 font-serif-professional resize-none overflow-hidden ${isEmail ? 'break-all' : 'break-words'}`}
          placeholder={isEmail ? "Required for receipt" : "Enter here"}
          disabled={!isEditable}
          required={isEmail}
          rows={1}
          style={{ minHeight: '1.5em' }}
          onInput={e => {
            e.currentTarget.style.height = 'auto';
            e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
          }}
        />
      ) : (
        <p className={`font-medium text-gray-800 whitespace-pre-wrap py-1 border-b border-transparent ${isEmail ? 'break-all' : 'break-words'}`}>
          {value || 'N/A'}
        </p>
      )}
    </div>
  );

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
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 my-8">
          <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
            <h2 className="text-base font-semibold text-primary border-b border-gray-200 pb-2 mb-4 uppercase tracking-wider">
              {mode === 'pickup' ? 'Pre‑Rental Checklist' : 'Post‑Rental Checklist'}
            </h2>
            {mode === 'pickup' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {checklistItems.map(item => (
                  <label key={item} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checklist[item] || false}
                      onChange={e => handleFieldChange('pickupChecklist', { ...checklist, [item]: e.target.checked })}
                      disabled={!isEditable}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-secondary disabled:bg-gray-200"
                    />
                    <span className="text-gray-700">{item}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {checklistItems.map(item => {
                  const pickupChecked = localReservation.pickupChecklist?.[item] || false;
                  const dropoffChecked = localReservation.dropOffChecklist?.[item] || false;
                  return (
                    <div key={item} className="flex items-center justify-between border-b border-gray-200 pb-1 last:border-0">
                      <span className="text-sm text-gray-700">{item}</span>
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-1">
                          <span className="text-xs text-gray-500">Pickup:</span>
                          <input type="checkbox" checked={pickupChecked} disabled className="h-4 w-4 rounded border-gray-300 text-primary disabled:opacity-75" />
                        </div>
                        <div className="flex items-center space-x-1">
                          <span className="text-xs text-gray-500">Drop‑off:</span>
                          <input
                            type="checkbox"
                            checked={dropoffChecked}
                            onChange={e => handleFieldChange('dropOffChecklist', { ...checklist, [item]: e.target.checked })}
                            disabled={!isDropoffEditable}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-secondary disabled:bg-gray-200"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Fuel Level</h3>
              <FuelGauge
                level={fuelLevel}
                onLevelChange={level => handleFieldChange(mode === 'pickup' ? 'pickupFuelLevel' : 'dropOffFuelLevel', level)}
                disabled={!isEditable}
                pickupLevel={mode === 'dropoff' ? localReservation.pickupFuelLevel : undefined}
              />
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">{mode === 'pickup' ? 'Kilometers Out' : 'Kilometers In'}</h3>
              {mode === 'dropoff' && (
                <p className="text-xs text-gray-500 mb-1">KM Out at pickup: {localReservation.pickupKmOut?.toLocaleString() || 'N/A'}</p>
              )}
              <input
                type="number"
                value={(mode === 'pickup' ? localReservation.pickupKmOut : localReservation.dropOffKmIn) || ''}
                onChange={e => handleFieldChange(mode === 'pickup' ? 'pickupKmOut' : 'dropOffKmIn', parseInt(e.target.value) || undefined)}
                disabled={!isEditable}
                className="w-full p-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100 focus:ring-1 focus:ring-primary focus:border-primary"
                placeholder={mode === 'pickup' ? "Enter starting KM" : "Enter returning KM"}
              />
              {mode === 'dropoff' && localReservation.dropOffKmIn && localReservation.pickupKmOut && localReservation.dropOffKmIn > localReservation.pickupKmOut && (
                <p className="text-sm font-semibold mt-2 text-primary">
                  Total Driven: {(localReservation.dropOffKmIn - localReservation.pickupKmOut).toLocaleString()} KM
                </p>
              )}
            </div>
          </div>

          <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
            <h2 className="text-base font-semibold text-primary border-b border-gray-200 pb-2 mb-4 uppercase tracking-wider">
              Vehicle Condition Report
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {(['front', 'back', 'left', 'right'] as CarView[]).map(view => {
                const Icon = { front: FrontCarIcon, back: BackCarIcon, left: LeftSideCarIcon, right: RightSideCarIcon }[view];
                return (
                  <div key={view} className="flex flex-col items-center">
                    <p className="text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">{view} View</p>
                    <div
                      className={`relative ${isEditable ? 'cursor-crosshair' : ''} bg-white rounded-lg border-2 border-gray-300 shadow-sm hover:shadow-md transition-shadow w-full aspect-square flex items-center justify-center p-1 overflow-hidden`}
                      onClick={e => handleDamageMark(e, view)}
                    >
                      <Icon className="w-full h-full max-w-full max-h-full object-contain text-gray-700" />
                      {mode === 'dropoff' &&
                        localReservation.pickupDamageMarkers?.map(
                          (marker, index) =>
                            marker.view === view && (
                              <div
                                key={`pickup-${index}`}
                                className="absolute w-5 h-5 bg-blue-500 rounded-full text-white text-xs flex items-center justify-center font-bold shadow-md"
                                style={{ left: `calc(${marker.x}% - 10px)`, top: `calc(${marker.y}% - 10px)` }}
                                title="Damage from pickup"
                              >
                                O
                              </div>
                            )
                        )}
                      {damageMarkers.map(
                        (marker, index) =>
                          marker.view === view && (
                            <div
                              key={index}
                              className="absolute w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold shadow-md cursor-pointer"
                              style={{ left: `calc(${marker.x}% - 10px)`, top: `calc(${marker.y}% - 10px)` }}
                              onClick={e => {
                                e.stopPropagation();
                                removeDamageMarker(index);
                              }}
                              title="Remove mark"
                            >
                              X
                            </div>
                          )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {mode === 'dropoff' ? (
              <p className="text-xs text-center mt-3 text-gray-500 bg-blue-50 p-2 rounded-md border border-blue-200">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-4 h-4 bg-blue-500 rounded-full text-white text-xs text-center leading-4">O</span> Damage from pickup
                  <span className="inline-block w-4 h-4 bg-red-500 rounded-full text-white text-xs text-center leading-4 ml-4">X</span> New damage
                </span>
              </p>
            ) : (
              <p className="text-xs text-center mt-3 text-gray-500 bg-gray-100 p-2 rounded-md">
                Click on the car to mark damage. <span className="inline-block w-4 h-4 bg-red-500 rounded-full text-white text-xs text-center leading-4 ml-2">X</span> appears.
              </p>
            )}
          </div>
        </section>

        <section className="my-6">
          <h2 className="text-base font-semibold text-primary border-b border-gray-200 pb-2 mb-3 uppercase tracking-wider">Notes</h2>
          {viewMode === 'pickup' ? (
            <div>
              <label htmlFor="pickup-notes" className="text-sm font-medium text-gray-700 mb-1 block">
                Pickup Notes
              </label>
              <textarea
                id="pickup-notes"
                value={localReservation.pickupNotes || ''}
                onChange={e => handleFieldChange('pickupNotes', e.target.value)}
                disabled={!isPickupEditable}
                rows={3}
                className="w-full p-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100 focus:ring-1 focus:ring-primary focus:border-primary"
                placeholder="Add any notes about the vehicle condition, customer interaction, etc..."
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-1">Pickup Notes (Read‑only)</h3>
                <p className="w-full p-2 border border-gray-300 rounded-md text-sm bg-gray-100 min-h-[60px] whitespace-pre-wrap">
                  {localReservation.pickupNotes || 'No notes from pickup.'}
                </p>
              </div>
              <div>
                <label htmlFor="dropoff-notes" className="text-sm font-medium text-gray-700 mb-1 block">
                  Drop‑off Notes
                </label>
                <textarea
                  id="dropoff-notes"
                  value={localReservation.dropOffNotes || ''}
                  onChange={e => handleFieldChange('dropOffNotes', e.target.value)}
                  disabled={!isDropoffEditable}
                  rows={3}
                  className="w-full p-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100 focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="Add any notes about the return condition, extra charges, etc..."
                />
              </div>
            </div>
          )}
        </section>

        <section className="my-6 bg-gray-50 p-5 rounded-lg border border-gray-200">
          <h2 className="text-base font-semibold text-primary border-b border-gray-200 pb-2 mb-4 uppercase tracking-wider">
            Terms & Signatures ({mode})
          </h2>
          {mode === 'pickup' && (
            <div className="text-xs text-gray-600 p-3 bg-white rounded-md border border-gray-200 mb-4 shadow-sm">
              By signing below, the Renter acknowledges receipt of the vehicle in good condition as documented above and agrees to the full
              terms and conditions provided separately. The Renter accepts financial responsibility for all charges, traffic violations,
              damages, and losses incurred during the rental period. The Company Representative confirms the vehicle's condition and rental
              details are accurate at the time of pickup.
            </div>
          )}
          {mode === 'dropoff' && (
            <div className="text-xs text-gray-600 p-3 bg-white rounded-md border border-gray-200 mb-4 shadow-sm">
              By signing, the Renter confirms the return of the vehicle. The final condition and any additional charges (e.g., for fuel
              shortage, new damages) have been reviewed and accepted. The Company Representative confirms receipt of the vehicle and the
              accuracy of the post‑rental inspection.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Renter Signature</h3>
              <SignaturePad
                signature={renterSign}
                onSave={data => handleFieldChange(mode === 'pickup' ? 'pickupRenterSignature' : 'dropOffRenterSignature', data)}
                onClear={() => handleFieldChange(mode === 'pickup' ? 'pickupRenterSignature' : 'dropOffRenterSignature', undefined)}
                disabled={!isEditable}
              />
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Company Representative</h3>
              <div className="mb-3">
                {renderTextField(
                  'Representative Name',
                  agentName || '',
                  val => handleFieldChange(mode === 'pickup' ? 'pickupAgentName' : 'dropOffAgentName', val),
                  isEditable
                )}
              </div>
              <SignaturePad
                signature={agentSign}
                onSave={data => handleFieldChange(mode === 'pickup' ? 'pickupAgentSignature' : 'dropOffAgentSignature', data)}
                onClear={() => handleFieldChange(mode === 'pickup' ? 'pickupAgentSignature' : 'dropOffAgentSignature', undefined)}
                disabled={!isEditable}
              />
            </div>
          </div>
        </section>
      </>
    );
  };

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
      setCurrentExchange(prev => ({ ...prev, [field]: value }));
    };

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
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 my-8">
          <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
            <h2 className="text-base font-semibold text-primary border-b border-gray-200 pb-2 mb-4 uppercase tracking-wider">
              {step === 'checkin' ? 'Old Car' : 'New Car'} Checklist
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {checklistItems.map(item => (
                <label key={item} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={checklist[item] || false}
                    onChange={e =>
                      handleExchangeFieldChange(step === 'checkin' ? 'checkinChecklist' : 'checkoutChecklist', { ...checklist, [item]: e.target.checked })
                    }
                    disabled={!isEditable}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-secondary disabled:bg-gray-200"
                  />
                  <span className="text-gray-700">{item}</span>
                </label>
              ))}
            </div>
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Fuel Level</h3>
              <FuelGauge
                level={fuelLevel}
                onLevelChange={level => handleExchangeFieldChange(step === 'checkin' ? 'checkinFuelLevel' : 'checkoutFuelLevel', level)}
                pickupLevel={step === 'checkin' ? localReservation.pickupFuelLevel : undefined}
                disabled={!isEditable}
              />
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">
                {step === 'checkin' ? 'Kilometers In (Check‑in)' : 'Kilometers Out (New Car)'}
              </h3>
              {step === 'checkin' && (
                <p className="text-xs text-gray-500 mb-1">KM Out at pickup: {localReservation.pickupKmOut?.toLocaleString() || 'N/A'}</p>
              )}
              <input
                type="number"
                value={(step === 'checkin' ? currentExchange.checkinKmIn : currentExchange.checkoutKmOut) || ''}
                onChange={e => handleExchangeFieldChange(step === 'checkin' ? 'checkinKmIn' : 'checkoutKmOut', parseInt(e.target.value) || undefined)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100 focus:ring-1 focus:ring-primary focus:border-primary"
                placeholder={step === 'checkin' ? "Enter returning KM" : "Enter starting KM for new car"}
                disabled={!isEditable}
              />
              {step === 'checkin' && currentExchange.checkinKmIn && localReservation.pickupKmOut && currentExchange.checkinKmIn > localReservation.pickupKmOut && (
                <p className="text-sm font-semibold mt-2 text-primary">
                  Total Driven (Old Car): {(currentExchange.checkinKmIn - localReservation.pickupKmOut).toLocaleString()} KM
                </p>
              )}
            </div>
            {step === 'checkin' && (
              <div className="mt-4">
                <label htmlFor="exchange-reason" className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Exchange
                </label>
                <textarea
                  id="exchange-reason"
                  value={currentExchange.reason || ''}
                  onChange={e => handleExchangeFieldChange('reason', e.target.value)}
                  rows={2}
                  className="w-full p-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100 focus:ring-1 focus:ring-primary focus:border-primary"
                  required
                  disabled={!isEditable}
                />
              </div>
            )}
            {step === 'checkout' && (
              <div className="mt-4">
                <label htmlFor="new-license-plate" className="block text-sm font-medium text-gray-700 mb-1">
                  New Car License Plate
                </label>
                <input
                  id="new-license-plate"
                  value={currentExchange.newCarLicensePlate || ''}
                  onChange={e => handleExchangeFieldChange('newCarLicensePlate', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100 focus:ring-1 focus:ring-primary focus:border-primary"
                  required
                  disabled={!isEditable}
                />
              </div>
            )}
          </div>

          <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
            <h2 className="text-base font-semibold text-primary border-b border-gray-200 pb-2 mb-4 uppercase tracking-wider">
              Vehicle Condition Report
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {(['front', 'back', 'left', 'right'] as CarView[]).map(view => {
                const Icon = { front: FrontCarIcon, back: BackCarIcon, left: LeftSideCarIcon, right: RightSideCarIcon }[view];
                return (
                  <div key={view} className="flex flex-col items-center">
                    <p className="text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">{view} View</p>
                    <div
                      className={`relative ${isEditable ? 'cursor-crosshair' : ''} bg-white rounded-lg border-2 border-gray-300 shadow-sm hover:shadow-md transition-shadow w-full aspect-square flex items-center justify-center p-1 overflow-hidden`}
                      onClick={e => handleExchangeDamageMark(e, view)}
                    >
                      <Icon className="w-full h-full max-w-full max-h-full object-contain text-gray-700" />
                      {step === 'checkin' &&
                        localReservation.pickupDamageMarkers?.map(
                          (marker, index) =>
                            marker.view === view && (
                              <div
                                key={`pickup-${index}`}
                                className="absolute w-5 h-5 bg-blue-500 rounded-full text-white text-xs flex items-center justify-center font-bold shadow-md"
                                style={{ left: `calc(${marker.x}% - 10px)`, top: `calc(${marker.y}% - 10px)` }}
                                title="Damage from pickup"
                              >
                                O
                              </div>
                            )
                        )}
                      {damageMarkers.map(
                        (marker, index) =>
                          marker.view === view && (
                            <div
                              key={index}
                              className="absolute w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold shadow-md cursor-pointer"
                              style={{ left: `calc(${marker.x}% - 10px)`, top: `calc(${marker.y}% - 10px)` }}
                              onClick={e => {
                                e.stopPropagation();
                                removeExchangeDamageMarker(index);
                              }}
                              title="Remove mark"
                            >
                              X
                            </div>
                          )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {step === 'checkin' && (
              <p className="text-xs text-center mt-3 text-gray-500 bg-blue-50 p-2 rounded-md border border-blue-200">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-4 h-4 bg-blue-500 rounded-full text-white text-xs text-center leading-4">O</span> Damage from pickup
                  <span className="inline-block w-4 h-4 bg-red-500 rounded-full text-white text-xs text-center leading-4 ml-4">X</span> New damage
                </span>
              </p>
            )}
          </div>
        </section>

        <section className="my-6 bg-gray-50 p-5 rounded-lg border border-gray-200">
          <h2 className="text-base font-semibold text-primary border-b border-gray-200 pb-2 mb-4 uppercase tracking-wider">
            Signatures ({step})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Renter Signature</h3>
              <SignaturePad
                signature={renterSign}
                onSave={data => handleExchangeFieldChange(step === 'checkin' ? 'checkinRenterSignature' : 'checkoutRenterSignature', data)}
                onClear={() => handleExchangeFieldChange(step === 'checkin' ? 'checkinRenterSignature' : 'checkoutRenterSignature', undefined)}
                disabled={!isEditable}
              />
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Company Representative</h3>
              <div className="mb-3">
                {renderTextField(
                  'Representative Name',
                  agentName || '',
                  val => handleExchangeFieldChange(step === 'checkin' ? 'checkinAgentName' : 'checkoutAgentName', val),
                  isEditable
                )}
              </div>
              <SignaturePad
                signature={agentSign}
                onSave={data => handleExchangeFieldChange(step === 'checkin' ? 'checkinAgentSignature' : 'checkoutAgentSignature', data)}
                onClear={() => handleExchangeFieldChange(step === 'checkin' ? 'checkinAgentSignature' : 'checkoutAgentSignature', undefined)}
                disabled={!isEditable}
              />
            </div>
          </div>
        </section>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[95vh] flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">Rental Agreement</h2>
          <div className="flex items-center space-x-2">
            <TabButton
              title="Pickup Check"
              isActive={viewMode === 'pickup'}
              onClick={() => setViewMode('pickup')}
              completed={localReservation.voucherSubmitted}
            />
            <TabButton
              title="Return / Exchange"
              isActive={viewMode === 'dropoff'}
              onClick={() => setViewMode('dropoff')}
              disabled={!localReservation.voucherSubmitted}
              completed={localReservation.dropOffCompleted}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div id="voucher-print-area" className="space-y-6">
            <div className="flex justify-between items-start pb-4 border-b-2 border-gray-300">
              <div>
                <img src={URDRIVE_LOGO_B64} alt={companyDetails.name} className="h-10 mb-2" />
                <div className="text-sm text-gray-600">
                  <p className="font-semibold text-gray-800">{companyDetails.name}</p>
                  <p>{companyDetails.address}</p>
                  <p>Phone: {companyDetails.phone} | Email: {companyDetails.email}</p>
                </div>
              </div>
              <div className="text-right">
                <h1 className="text-xl font-bold uppercase text-gray-800">Rental Agreement</h1>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">Agreement #:</span> {reservation.bookingId || 'N/A'}
                </p>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="text-sm font-semibold text-primary border-b border-gray-200 pb-2 mb-3 uppercase tracking-wider">
                Renter Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InfoPair label="Name" value={reservation.personName} />
                <InfoPair label="Contact Number" value={reservation.contactNumber} />
                {renderTextField(
                  'Customer Email',
                  localReservation.customerEmail || '',
                  val => handleFieldChange('customerEmail', val),
                  isPickupEditable,
                  true
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InfoBlock title="Rental Period & Location">
                <InfoPair label="Pickup Date" value={reservation.startDate} />
                <InfoPair label="Return Date" value={reservation.endDate} />
                <InfoPair label="Rental Duration" value={`${rentalDays} day(s)`} />
                <InfoPair
                  label="Pickup/Return Location"
                  value={
                    <>
                      <p className="font-medium text-gray-800">{location?.name || 'N/A'}</p>
                      {location && <p className="text-xs text-gray-500">{location.address}</p>}
                    </>
                  }
                />
              </InfoBlock>

              <InfoBlock title="Vehicle Details">
                <InfoPair label="Vehicle Model" value={
                  isPickupEditable ? (
                    <input
                      type="text"
                      value={localReservation.carModel || ''}
                      onChange={e => handleFieldChange('carModel', e.target.value)}
                      className="w-full pt-0.5 border-b border-gray-300 text-sm font-medium focus:outline-none focus:border-primary"
                      placeholder="Enter vehicle model"
                    />
                  ) : (
                    reservation.carModel
                  )
                } />
                {isPickupEditable ? (
                  <div>
                    <p className="text-xs text-gray-500 font-medium">License Plate</p>
                    <input
                      type="text"
                      value={localReservation.licensePlate || ''}
                      onChange={e => handleFieldChange('licensePlate', e.target.value)}
                      className="w-full pt-0.5 border-b border-gray-300 text-sm font-medium focus:outline-none focus:border-primary"
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
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="text-sm font-semibold text-primary border-b border-gray-200 pb-2 mb-3 uppercase tracking-wider">
                Financial Summary
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <InfoPair label="Base Rental Fee" value={formatCurrency(baseRentalFee)} />
                  <InfoPair label="Extras Total" value={formatCurrency(extrasTotal)} />
                  <hr className="my-2" />
                  <InfoPair label="Total Amount" value={<span className="font-bold">{formatCurrency(totalCost)}</span>} />
                </div>
                <div>
                  <InfoPair label="Security Deposit" value={formatCurrency(reservation.securityDeposit || 0)} />
                  <InfoPair label="Excess" value={formatCurrency(reservation.excess || 0)} />
                  <div className="mt-2">
                    <InfoPair label="Payment Status" value={
                      localReservation.authNumber && localReservation.finalAmountCharged ? "PAID" : "NOT AUTHORIZED"
                    } />
                    {isPickupEditable && (
                      <>
                        <div className="mt-2">
                          <label className="text-xs text-gray-500">Authorization Number</label>
                          <input
                            type="text"
                            value={localReservation.authNumber || ''}
                            onChange={e => handleFieldChange('authNumber', e.target.value)}
                            className="w-full p-1 border rounded text-sm"
                            placeholder="Enter auth number"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Final Amount Charged ($)</label>
                          <input
                            type="number"
                            value={localReservation.finalAmountCharged || ''}
                            onChange={e => handleFieldChange('finalAmountCharged', parseFloat(e.target.value) || undefined)}
                            className="w-full p-1 border rounded text-sm"
                            placeholder="Enter final amount"
                            step="0.01"
                          />
                        </div>
                      </>
                    )}
                    {!isPickupEditable && localReservation.authNumber && (
                      <>
                        <InfoPair label="Authorization Number" value={localReservation.authNumber} />
                        <InfoPair label="Final Amount Charged" value={localReservation.finalAmountCharged ? formatCurrency(localReservation.finalAmountCharged) : 'N/A'} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {viewMode === 'pickup' && renderChecks('pickup')}
            {viewMode === 'dropoff' && (
              <>
                {hasDueExtension && (
                  <div className="p-3 bg-orange-100 border-l-4 border-orange-500 text-orange-800 rounded-md text-sm" role="alert">
                    <strong>Unpaid Extension Balance:</strong> {formatCurrency(dueForExtension)}
                  </div>
                )}
                {hasOutstandingTickets && (
                  <div className="p-3 bg-red-100 border-l-4 border-red-500 text-red-800 rounded-md text-sm" role="alert">
                    <strong>Outstanding Tickets:</strong> {totalTicketAmountDue.toFixed(2)} JOD
                  </div>
                )}
                {localReservation.lateReturnFee && localReservation.lateReturnFee.status === 'PENDING' && (
                  <div className="p-3 bg-red-100 border-l-4 border-red-500 text-red-800 rounded-md text-sm">
                    <strong>Late Return Detected:</strong> Resolve in Late Returns section.
                  </div>
                )}

                <fieldset disabled={hasOutstandingTickets || hasDueExtension || isDropoffBlockedByPendingFee}>
                  {processType === 'selection' && !localReservation.dropOffCompleted ? (
                    <div className="p-6 text-center border-y my-4">
                      <h2 className="text-lg font-bold mb-4">What are you processing today?</h2>
                      <div className="flex justify-center gap-4">
                        <button
                          onClick={() => setProcessType('return')}
                          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                          Final Vehicle Return
                        </button>
                        <button
                          onClick={() => setProcessType('exchange')}
                          className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                        >
                          Vehicle Exchange
                        </button>
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

            <div className="text-center pt-3 mt-3 border-t border-gray-300">
              <p className="text-sm font-semibold">Thank you for choosing {companyDetails.name}!</p>
              <p className="text-xs text-gray-500 mt-1">
                {companyDetails.address} | {companyDetails.phone} | {companyDetails.email}
              </p>
            </div>
          </div>
        </div>

        {!showSuccessOverlay && (
          <div className="flex-shrink-0 px-6 py-3 border-t bg-gray-50 flex justify-between items-center">
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">
              Close
            </button>
            <div className="flex items-center gap-4">
              {viewMode === 'dropoff' && processType === 'exchange' && (
                <>
                  {exchangeStep === 'checkout' && (
                    <button onClick={() => setExchangeStep('checkin')} className="px-4 py-2 text-gray-800">
                      Back
                    </button>
                  )}
                  {exchangeStep === 'checkin' && (
                    <button
                      onClick={() => setExchangeStep('checkout')}
                      disabled={!currentExchange.checkinRenterSignature || !currentExchange.checkinAgentSignature || !currentExchange.reason || hasOutstandingTickets || hasDueExtension}
                      className="px-5 py-2 bg-primary text-white rounded-md hover:bg-secondary disabled:bg-gray-400"
                    >
                      Next: Check-out New Car
                    </button>
                  )}
                </>
              )}

              {((viewMode === 'pickup' && isPickupEditable) ||
                (viewMode === 'dropoff' && processType === 'return' && isDropoffEditable) ||
                (viewMode === 'dropoff' && processType === 'exchange' && exchangeStep === 'checkout' && isDropoffEditable)) ? (
                <button
                  onClick={handleSubmit}
                  disabled={hasOutstandingTickets || hasDueExtension || isDropoffBlockedByPendingFee}
                  className="px-5 py-2 bg-primary text-white rounded-md hover:bg-secondary disabled:bg-gray-400"
                >
                  {`Submit & Finalize ${processType === 'exchange' ? 'Exchange' : viewMode === 'pickup' ? 'Pickup' : 'Return'}`}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadVoucherPDF}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark text-sm font-medium"
                  >
                    <PdfIcon /> Download PDF
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {showSuccessOverlay && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 no-print space-y-3">
            <svg className="w-12 h-12 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-bold text-gray-800">
              {localReservation.dropOffCompleted ? 'Return Process Completed!' : 'Pickup Process Completed!'}
            </h2>
            <div className="grid grid-cols-2 gap-3 w-full max-w-md">
              <div className="bg-gray-100 p-3 rounded-lg text-center">
                <h4 className="font-semibold text-gray-700">Rental Agreement</h4>
                <button onClick={handleDownloadVoucherPDF} className="mt-2 px-3 py-1 bg-white text-primary border border-primary rounded-md text-sm">Download PDF</button>
              </div>
              <div className="bg-gray-100 p-3 rounded-lg text-center">
                <h4 className="font-semibold text-gray-700">Payment Receipt</h4>
                <button onClick={handleDownloadReceiptPDF} className="mt-2 px-3 py-1 bg-white text-primary border border-primary rounded-md text-sm">Download PDF</button>
              </div>
            </div>
            <button onClick={onClose} className="mt-2 px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Voucher;
