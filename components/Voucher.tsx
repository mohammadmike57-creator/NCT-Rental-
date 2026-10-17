import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Reservation, CompanyDetails, CarView, RentalSource, PaymentType, RentalLocation, CarExchange, TrafficTicket, LateReturnFee, DamageMarker, Fleet } from '../types';
import SignaturePad from './SignaturePad';
import { InspectionDiagram, INSPECTION_LABEL, INSPECTION_SVG, VehicleArt, vehicleKind, vehicleKindLabel } from './VehicleGraphics';
import { ShieldExclamationIcon, PdfIcon } from './icons';
import { URDRIVE_LOGO_B64 } from '../constants';
import { sendCustomerEmail } from '../firebase/api';
import { agreementHtmlToPdfBase64 } from '../services/agreementPdf';

interface VoucherProps {
  reservation: Reservation;
  sources: RentalSource[];
  rentalLocations: RentalLocation[];
  trafficTickets: TrafficTicket[];
  onClose: () => void;
  companyDetails: CompanyDetails;
  onUpdate: (reservation: Reservation) => void;
}

const InfoBlock: React.FC<{ title: string; children: React.ReactNode; className?: string; icon?: React.ReactNode }> = ({ title, children, className, icon }) => (
  <div className={`bg-white border border-slate-200 rounded-2xl p-5 h-full ${className || ''}`}>
    <h3 className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-4">
      {icon && <span className="text-slate-400">{icon}</span>}
      {title}
    </h3>
    <div className="space-y-3 text-sm">{children}</div>
  </div>
);

const InfoPair: React.FC<{ label: string; value?: string | React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4">
    <p className="text-xs text-slate-500 pt-0.5 shrink-0">{label}</p>
    <div className="font-medium text-slate-900 text-right break-words whitespace-pre-wrap text-sm min-w-0">{value || '—'}</div>
  </div>
);

/** Numbered, titled card used for each step of the inspection. */
const StepSection: React.FC<{ step?: number; title: string; subtitle?: string; children: React.ReactNode; aside?: React.ReactNode }> = ({ step, title, subtitle, children, aside }) => (
  <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
    <header className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
      {step !== undefined && (
        <span className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center shrink-0">{step}</span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      {aside}
    </header>
    <div className="p-5">{children}</div>
  </section>
);

const FuelGauge: React.FC<{ level?: number; pickupLevel?: number; onLevelChange: (level: number) => void; disabled?: boolean }> = ({ level = 0, pickupLevel, onLevelChange, disabled = false }) => {
  const segments = Array.from({ length: 8 }, (_, i) => i + 1);
  const hasPickupLevel = typeof pickupLevel === 'number';
  const color = level <= 2 ? 'bg-rose-500' : level <= 4 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <p className="text-2xl font-bold text-slate-900 tabular-nums">{level}<span className="text-sm font-medium text-slate-400">/8</span></p>
        {hasPickupLevel && (
          <p className={`text-xs font-medium ${level < (pickupLevel as number) ? 'text-rose-600' : 'text-slate-500'}`}>
            Pickup level {pickupLevel}/8{level < (pickupLevel as number) ? ` · ${(pickupLevel as number) - level} short` : ''}
          </p>
        )}
      </div>
      <div className="relative">
        <div className="flex gap-1">
          {segments.map(s => (
            <button
              type="button"
              key={s}
              onClick={() => !disabled && onLevelChange(s)}
              disabled={disabled}
              aria-label={`Fuel ${s} of 8`}
              className={`flex-1 h-9 rounded-md transition-colors ${level >= s ? color : 'bg-slate-100'} ${!disabled ? 'hover:ring-2 hover:ring-slate-300 cursor-pointer' : 'cursor-default'}`}
            />
          ))}
        </div>
        {hasPickupLevel && (
          <div className="absolute -top-1 -bottom-1 w-0.5 bg-slate-900 rounded" style={{ left: `calc(${((pickupLevel as number) / 8) * 100}% - 1px)` }} title={`Pickup level ${pickupLevel}/8`} />
        )}
      </div>
      <div className="flex justify-between text-[10px] font-semibold text-slate-400 mt-1"><span>EMPTY</span><span>½</span><span>FULL</span></div>
    </div>
  );
};

const CHECK_ICON = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
);

/** Inspection checklist as tappable tiles; shows the pickup result next to each item when comparing. */
const ChecklistGrid: React.FC<{
  items: string[];
  checked: { [item: string]: boolean };
  onToggle: (item: string, value: boolean) => void;
  disabled?: boolean;
  compareWith?: { [item: string]: boolean };
}> = ({ items, checked, onToggle, disabled, compareWith }) => {
  const done = items.filter(i => checked[i]).length;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-500">{done} of {items.length} items confirmed</p>
        <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${(done / items.length) * 100}%` }} /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {items.map(item => {
          const on = !!checked[item];
          const before = compareWith ? !!compareWith[item] : undefined;
          return (
            <button
              type="button"
              key={item}
              disabled={disabled}
              onClick={() => onToggle(item, !on)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left text-sm transition-all ${on ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700'} ${disabled ? 'cursor-default' : 'hover:border-slate-300'}`}
            >
              <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${on ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300'}`}>{on && CHECK_ICON}</span>
              <span className="flex-1 font-medium">{item}</span>
              {before !== undefined && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap shrink-0 ${before ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>pickup {before ? 'OK' : '—'}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** Four-view damage map. Markers are stored as % of each square view. */
const DamageBoard: React.FC<{
  markers: DamageMarker[];
  priorMarkers?: DamageMarker[];
  editable: boolean;
  onMark: (e: React.MouseEvent<HTMLDivElement>, view: CarView) => void;
  onRemove: (index: number) => void;
  priorLabel?: string;
}> = ({ markers, priorMarkers, editable, onMark, onRemove, priorLabel = 'Recorded at pickup' }) => (
  <div>
    <div className="grid grid-cols-2 gap-3">
      {(['front', 'back', 'left', 'right'] as CarView[]).map(view => (
        <div key={view}>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{INSPECTION_LABEL[view]}</p>
          <div
            className={`relative w-full aspect-square rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-1 overflow-hidden ${editable ? 'cursor-crosshair hover:border-indigo-300' : ''}`}
            onClick={e => editable && onMark(e, view)}
          >
            <InspectionDiagram view={view} className="w-full h-full" />
            {(priorMarkers || []).map((m, i) => m.view === view && (
              <span key={`p${i}`} title={priorLabel}
                className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border-2 border-sky-500 bg-sky-100/80 text-sky-700 text-[9px] font-bold flex items-center justify-center pointer-events-none"
                style={{ left: `${m.x}%`, top: `${m.y}%` }}>{i + 1}</span>
            ))}
            {markers.map((m, i) => m.view === view && (
              <button type="button" key={i} title={editable ? 'Remove this mark' : 'Damage mark'}
                onClick={e => { e.stopPropagation(); if (editable) onRemove(i); }}
                className={`absolute w-6 h-6 -ml-3 -mt-3 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center shadow-md ring-2 ring-white ${editable ? 'hover:bg-rose-700' : 'cursor-default'}`}
                style={{ left: `${m.x}%`, top: `${m.y}%` }}>{i + 1}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
      {priorMarkers && <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full border-2 border-sky-500 bg-sky-100" /> {priorLabel} ({priorMarkers.length})</span>}
      <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full bg-rose-600" /> {priorMarkers ? 'New damage' : 'Damage'} ({markers.length})</span>
      {editable && <span className="text-slate-400">Tap the car to add a mark · tap a mark to remove it</span>}
    </div>
  </div>
);

const SignatureBlock: React.FC<{ title: string; subtitle?: string; signature?: string; onSave: (d: string) => void; onClear: () => void; disabled: boolean; children?: React.ReactNode }> = ({ title, subtitle, signature, onSave, onClear, disabled, children }) => (
  <div className="rounded-xl border border-slate-200 p-4">
    <div className="flex items-center justify-between mb-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${signature ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{signature ? 'Signed' : 'Required'}</span>
    </div>
    {children}
    <SignaturePad signature={signature} onSave={onSave} onClear={onClear} disabled={disabled} />
  </div>
);

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-600';

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
  const [emailState, setEmailState] = useState<{ status: 'idle' | 'sending' | 'sent' | 'failed' | 'unconfigured'; to?: string; message?: string }>({ status: 'idle' });

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
      void emailAgreement(submittedVoucher, 'checkout');
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
        void emailAgreement(submittedVoucher, 'checkin');
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

  const PICKUP_TERMS = "By signing, the Renter acknowledges receipt of the vehicle in the condition documented above and agrees to the rental terms and conditions. The Renter accepts financial responsibility for all charges, traffic violations, damages and losses during the rental period. The Company Representative confirms the vehicle's condition and rental details are accurate at pickup.";
  const RETURN_TERMS = "By signing, the Renter confirms the return of the vehicle. The final condition and any additional charges (such as fuel shortage or new damage) have been reviewed and accepted. The Company Representative confirms receipt of the vehicle and the accuracy of the return inspection.";
  // ====================== PRINTABLE RENTAL AGREEMENT ======================
  const buildAgreementHtml = (r: Reservation = localReservation): string => {
    const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const money = (n: number) => `$${(n || 0).toFixed(2)}`;
    const when = (iso?: string) => {
      if (!iso) return '—';
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? esc(iso) : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    const sourceName = sources.find(s => s.id === r.source)?.name || r.source || '—';
    const loc = location?.name || r.locationName || '—';
    const pickupMarks = r.pickupDamageMarkers || [];
    const returnMarks = r.dropOffDamageMarkers || [];
    // Inspection views are 100x60 drawings centred in a square box; markers are % of that square.
    const diagram = (view: CarView) => {
      const dots = (marks: DamageMarker[], color: string, filled: boolean) => marks
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => m.view === view)
        .map(({ m, i }) => `<g><circle cx="${m.x.toFixed(1)}" cy="${(m.y - 20).toFixed(1)}" r="4.2" fill="${filled ? color : '#fff'}" stroke="${color}" stroke-width="1.2"/><text x="${m.x.toFixed(1)}" y="${(m.y - 20 + 1.6).toFixed(1)}" font-size="4.6" text-anchor="middle" font-family="Arial" font-weight="700" fill="${filled ? '#fff' : color}">${i + 1}</text></g>`)
        .join('');
      return `<div class="view"><svg viewBox="0 -12 100 84">${INSPECTION_SVG[view]}${dots(pickupMarks, '#0284c7', false)}${dots(returnMarks, '#e11d48', true)}</svg><div class="view-label">${INSPECTION_LABEL[view]}</div></div>`;
    };
    const check = (on?: boolean) => (on ? '<span class="ok">✔</span>' : '<span class="no">—</span>');
    const sig = (img?: string, label?: string, sub?: string) => `
      <div class="sig">
        <div class="sig-img">${img ? `<img src="${esc(img)}"/>` : ''}</div>
        <div class="sig-line">${esc(label)}</div>
        <div class="muted">${esc(sub || '')}</div>
      </div>`;
    const extrasRows = (r.extras || []).map(ex => `<tr><td>${esc(ex.name)}</td><td class="num">${ex.isComplementary ? 'Included' : money(ex.dailyPrice * rentalDays)}</td></tr>`).join('');
    const kmDriven = r.dropOffKmIn && r.pickupKmOut && r.dropOffKmIn > r.pickupKmOut ? r.dropOffKmIn - r.pickupKmOut : null;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rental Agreement ${esc(r.bookingId)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Inter, Arial, sans-serif; color: #0f172a; font-size: 9pt; line-height: 1.4; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; border-bottom: 2px solid #0f172a; }
  .top img { height: 30px; }
  .co { font-size: 8pt; color: #475569; margin-top: 4px; }
  .doc { text-align: right; }
  .doc h1 { font-size: 16pt; letter-spacing: -0.02em; }
  .pill { display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 999px; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
  .pill.open { background: #ecfdf5; color: #047857; } .pill.closed { background: #f1f5f9; color: #334155; } .pill.new { background: #eff6ff; color: #1d4ed8; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
  .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; break-inside: avoid; }
  h2 { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: #64748b; margin-bottom: 6px; }
  .kv { display: flex; justify-content: space-between; gap: 8px; padding: 1.5px 0; }
  .kv span:first-child { color: #64748b; } .kv span:last-child { font-weight: 600; text-align: right; }
  .big { font-size: 11pt; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 3px 0; border-bottom: 1px solid #f1f5f9; text-align: left; }
  th { font-size: 7pt; text-transform: uppercase; letter-spacing: .06em; color: #64748b; font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .total td { border-top: 1.5px solid #0f172a; border-bottom: none; font-weight: 700; font-size: 10.5pt; padding-top: 5px; }
  .ok { color: #059669; font-weight: 700; } .no { color: #cbd5e1; }
  .views { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .view { border: 1px solid #e2e8f0; border-radius: 6px; padding: 2px; text-align: center; }
  .view svg { width: 100%; height: auto; display: block; }
  .view-label { font-size: 7pt; color: #64748b; padding-bottom: 2px; }
  .legend { margin-top: 5px; font-size: 7.5pt; color: #475569; }
  .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin: 0 3px -1px 10px; }
  .notes { white-space: pre-wrap; color: #334155; min-height: 14px; }
  .terms { font-size: 7.5pt; color: #475569; text-align: justify; }
  .sigs { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin-top: 8px; }
  .sig-img { height: 38px; display: flex; align-items: flex-end; justify-content: center; }
  .sig-img img { max-height: 38px; max-width: 100%; }
  .sig-line { border-top: 1px solid #0f172a; margin-top: 3px; padding-top: 2px; font-size: 7.5pt; font-weight: 600; text-align: center; }
  .muted { color: #64748b; font-size: 7pt; text-align: center; }
  .foot { margin-top: 10px; padding-top: 6px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 7pt; color: #64748b; }
</style></head><body>
  <div class="top">
    <div>
      <img src="${URDRIVE_LOGO_B64}" alt="">
      <div class="co"><strong>${esc(companyDetails.name)}</strong>${companyDetails.subName ? ' · ' + esc(companyDetails.subName) : ''}<br>${esc(companyDetails.address)}<br>Tel ${esc(companyDetails.phone)} · ${esc(companyDetails.email)}${companyDetails.taxNumber ? ' · Tax No. ' + esc(companyDetails.taxNumber) : ''}</div>
    </div>
    <div class="doc">
      <h1>Rental Agreement</h1>
      <div>No. <strong>${esc(r.bookingId || '—')}</strong></div>
      <span class="pill ${r.dropOffCompleted ? 'closed' : r.voucherSubmitted ? 'open' : 'new'}">${r.dropOffCompleted ? 'Closed' : r.voucherSubmitted ? 'Open · on rent' : 'Not yet checked out'}</span>
    </div>
  </div>

  <div class="grid3">
    <div class="card"><h2>Renter</h2>
      <div class="big">${esc(r.personName)}</div>
      <div class="kv"><span>Phone</span><span>${esc(r.contactNumber || '—')}</span></div>
      <div class="kv"><span>Email</span><span>${esc(r.customerEmail || '—')}</span></div>
      <div class="kv"><span>Booked via</span><span>${esc(sourceName)}</span></div>
    </div>
    <div class="card"><h2>Vehicle</h2>
      <div class="big">${esc(r.carModel || '—')}</div>
      <div class="kv"><span>Plate</span><span>${esc(r.licensePlate || '—')}</span></div>
      <div class="kv"><span>Odometer</span><span>${r.pickupKmOut ?? '—'} → ${r.dropOffKmIn ?? '—'} km</span></div>
      <div class="kv"><span>Fuel</span><span>${r.pickupFuelLevel ?? '—'}/8 → ${r.dropOffFuelLevel ?? '—'}/8</span></div>
      ${kmDriven !== null ? `<div class="kv"><span>Driven</span><span>${kmDriven.toLocaleString()} km</span></div>` : ''}
    </div>
    <div class="card"><h2>Rental period</h2>
      <div class="kv"><span>Pickup</span><span>${when(r.startDate)}</span></div>
      <div class="kv"><span>Return</span><span>${when(r.endDate)}</span></div>
      <div class="kv"><span>Duration</span><span>${rentalDays} day${rentalDays === 1 ? '' : 's'}</span></div>
      <div class="kv"><span>Location</span><span>${esc(loc)}</span></div>
    </div>
  </div>

  <div class="grid2">
    <div class="card"><h2>Charges</h2>
      <table>
        <tr><td>Rental · ${rentalDays} day${rentalDays === 1 ? '' : 's'}</td><td class="num">${money(baseRentalFee)}</td></tr>
        ${extrasRows}
        <tr class="total"><td>Total</td><td class="num">${money(totalCost)}</td></tr>
      </table>
      <div class="kv" style="margin-top:6px"><span>Security deposit</span><span>${money(r.securityDeposit || 0)}</span></div>
      <div class="kv"><span>Excess</span><span>${money(r.excess || 0)}</span></div>
      <div class="kv"><span>Payment</span><span>${r.authNumber && r.finalAmountCharged ? `Paid ${money(r.finalAmountCharged)} · auth ${esc(r.authNumber)}` : 'Not authorised'}</span></div>
    </div>
    <div class="card"><h2>Inspection checklist</h2>
      <table>
        <tr><th>Item</th><th class="num">Out</th><th class="num">In</th></tr>
        ${checklistItems.map(item => `<tr><td>${esc(item)}</td><td class="num">${check(r.pickupChecklist?.[item])}</td><td class="num">${r.voucherSubmitted && r.dropOffCompleted ? check(r.dropOffChecklist?.[item]) : '<span class="no">·</span>'}</td></tr>`).join('')}
      </table>
    </div>
  </div>

  <div class="card" style="margin-top:8px"><h2>Vehicle condition</h2>
    <div class="views">${(['front', 'back', 'left', 'right'] as CarView[]).map(diagram).join('')}</div>
    <div class="legend"><i style="border:1.5px solid #0284c7"></i>At pickup (${pickupMarks.length}) <i style="background:#e11d48"></i>New at return (${returnMarks.length})</div>
  </div>

  <div class="grid2">
    <div class="card"><h2>Pickup notes</h2><div class="notes">${esc(r.pickupNotes || '—')}</div></div>
    <div class="card"><h2>Return notes</h2><div class="notes">${esc(r.dropOffNotes || '—')}</div></div>
  </div>

  <div class="card" style="margin-top:8px"><h2>Terms & declaration</h2>
    <p class="terms">${esc(PICKUP_TERMS)} ${r.dropOffCompleted ? esc(RETURN_TERMS) : ''}</p>
    <div class="sigs">
      ${sig(r.pickupRenterSignature, 'Renter · check-out', r.pickupDateTime)}
      ${sig(r.pickupAgentSignature, 'Agent · check-out', r.pickupAgentName)}
      ${sig(r.dropOffRenterSignature, 'Renter · check-in', r.dropOffDateTime)}
      ${sig(r.dropOffAgentSignature, 'Agent · check-in', r.dropOffAgentName)}
    </div>
  </div>

  <div class="foot"><span>Thank you for choosing ${esc(companyDetails.name)}</span><span>Generated ${new Date().toLocaleString('en-GB')}</span></div>
</body></html>`;
    return html;
  };

  const handleDownloadVoucherPDF = () => {
    const html = buildAgreementHtml();
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 300);
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
      ['Rental Fee', formatCurrency(baseRentalFee)],
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

  // Emails the signed agreement (as a PDF) to the customer right after check-out / check-in.
  const emailAgreement = async (r: Reservation, kind: 'checkout' | 'checkin') => {
    const to = r.customerEmail?.trim();
    if (!to) return;
    setEmailState({ status: 'sending', to });
    const html = buildAgreementHtml(r);
    let attachment: { fileName: string; contentType: 'application/pdf' | 'text/html'; base64: string };
    try {
      attachment = { fileName: `Rental-Agreement-${r.bookingId}.pdf`, contentType: 'application/pdf', base64: await agreementHtmlToPdfBase64(html) };
    } catch {
      attachment = { fileName: `Rental-Agreement-${r.bookingId}.html`, contentType: 'text/html', base64: btoa(unescape(encodeURIComponent(html))) };
    }
    const days = calculateDaysWithGrace(r.startDate, r.endDate);
    const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
    const isCheckout = kind === 'checkout';
    const outcome = await sendCustomerEmail({
      to,
      subject: `${isCheckout ? 'Your rental agreement' : 'Vehicle return confirmation'} · Booking ${r.bookingId}`,
      heading: isCheckout ? 'Your rental agreement' : 'Thank you — your vehicle has been returned',
      intro: `Dear ${r.personName}, ${isCheckout
        ? `thank you for choosing ${companyDetails.name}. Your signed rental agreement is attached to this email. Please keep it with you for the duration of the rental.`
        : `we have checked in your vehicle. The final signed agreement, including the return inspection, is attached for your records.`}`,
      rows: [
        ['Booking', r.bookingId],
        ['Vehicle', `${r.carModel || '—'}${r.licensePlate ? ` · ${r.licensePlate}` : ''}`],
        ['Pick-up', fmt(r.startDate)],
        ['Return', fmt(r.endDate)],
        ['Duration', `${days} day${days === 1 ? '' : 's'}`],
        ['Total', formatCurrency(r.amount || 0)],
        ...(isCheckout ? [] : [['Kilometres', r.dropOffKmIn != null && r.pickupKmOut != null ? `${r.pickupKmOut} → ${r.dropOffKmIn}` : '—'] as [string, string]]),
      ],
      closing: isCheckout ? 'We wish you a safe journey. If you need assistance during your rental, just reply to this email or call us.' : 'We hope to see you again soon.',
      companyName: companyDetails.name,
      companyAddress: companyDetails.address,
      companyPhone: companyDetails.phone,
      companyEmail: companyDetails.email,
      replyTo: companyDetails.email,
      attachments: [attachment],
    });
    if (outcome.ok) {
      setEmailState({ status: 'sent', to });
      const withLog: Reservation = { ...r, agreementEmails: [...(r.agreementEmails || []), { to, kind, sentAt: new Date().toISOString() }] };
      setLocalReservation(withLog);
      onUpdate(withLog);
    } else {
      setEmailState({ status: outcome.reason === 'unconfigured' ? 'unconfigured' : 'failed', to, message: outcome.message });
    }
  };

  const handleSendEmail = () => emailAgreement(localReservation, localReservation.dropOffCompleted ? 'checkin' : 'checkout');

  const rentalDays = calculateDaysWithGrace(reservation.startDate, reservation.endDate);
  const extrasTotal = (reservation.extras || []).reduce((sum, extra) => extra.isComplementary ? sum : sum + (extra.dailyPrice * rentalDays), 0);
  const baseRentalFee = reservation.baseAmount ?? ((reservation.amount || 0) - extrasTotal);
  const totalCost = baseRentalFee + extrasTotal;

  const sourceInfo = sources.find(s => s.name === reservation.source);
  const isPayOnArrival = sourceInfo?.paymentType === PaymentType.PAY_ON_ARRIVAL;

  const renderTextField = (label: string, value: string, onChange: (val: string) => void, isEditable: boolean, isEmail: boolean = false) => (
    <div className="w-full">
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {isEditable ? (
        <input
          type={isEmail ? 'email' : 'text'}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className={inputCls}
          placeholder={isEmail ? 'Required for the receipt' : 'Enter name'}
          required={isEmail}
        />
      ) : (
        <p className={`text-sm font-medium text-slate-900 py-2 ${isEmail ? 'break-all' : 'break-words'}`}>{value || '—'}</p>
      )}
    </div>
  );

  const renderKmField = ({ label, value, onChange, editable, reference, referenceLabel, placeholder }: { label: string; value?: number; onChange: (v?: number) => void; editable: boolean; reference?: number; referenceLabel?: string; placeholder: string }) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-slate-500">{label}</label>
        {referenceLabel && <span className="text-xs text-slate-400">{referenceLabel}: {reference?.toLocaleString() ?? '—'} km</span>}
      </div>
      <div className="relative">
        <input type="number" inputMode="numeric" value={value ?? ''} onChange={e => onChange(parseInt(e.target.value) || undefined)}
          disabled={!editable} className={`${inputCls} pr-12 text-base font-semibold tabular-nums`} placeholder={placeholder} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">KM</span>
      </div>
      {reference !== undefined && value !== undefined && value > reference && (
        <p className="mt-1.5 text-xs font-semibold text-indigo-700">{(value - reference).toLocaleString()} km driven</p>
      )}
      {reference !== undefined && value !== undefined && value < reference && (
        <p className="mt-1.5 text-xs font-semibold text-rose-600">Lower than the pickup reading</p>
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
    const isPickup = mode === 'pickup';

    return (
      <div className="space-y-5">
        <div className="space-y-5">
          <div>
            <StepSection step={1} title={isPickup ? 'Vehicle inspection' : 'Return inspection'} subtitle={isPickup ? 'Confirm each item before handing over the keys' : 'Compare with the condition at pickup'}>
              <ChecklistGrid
                items={checklistItems}
                checked={checklist}
                onToggle={(item, v) => handleFieldChange(isPickup ? 'pickupChecklist' : 'dropOffChecklist', { ...checklist, [item]: v })}
                disabled={!isEditable}
                compareWith={isPickup ? undefined : localReservation.pickupChecklist || {}}
              />
            </StepSection>
          </div>
          <div>
            <StepSection step={2} title="Fuel & mileage" subtitle={isPickup ? 'Readings when the car leaves' : 'Readings when the car comes back'}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FuelGauge
                  level={fuelLevel}
                  onLevelChange={level => handleFieldChange(isPickup ? 'pickupFuelLevel' : 'dropOffFuelLevel', level)}
                  disabled={!isEditable}
                  pickupLevel={isPickup ? undefined : localReservation.pickupFuelLevel}
                />
                {renderKmField({ label: isPickup ? 'Odometer out' : 'Odometer in', value: isPickup ? localReservation.pickupKmOut : localReservation.dropOffKmIn, onChange: v => handleFieldChange(isPickup ? 'pickupKmOut' : 'dropOffKmIn', v), editable: isEditable, reference: isPickup ? undefined : localReservation.pickupKmOut, referenceLabel: isPickup ? undefined : 'Out', placeholder: isPickup ? 'Starting reading' : 'Returning reading' })}
              </div>
            </StepSection>
          </div>
        </div>

        <StepSection step={3} title="Damage report" subtitle={isPickup ? 'Mark existing scratches, dents and chips' : 'Mark any damage that was not there at pickup'}>
          <DamageBoard
            markers={damageMarkers}
            priorMarkers={isPickup ? undefined : localReservation.pickupDamageMarkers || []}
            editable={isEditable}
            onMark={handleDamageMark}
            onRemove={removeDamageMarker}
          />
        </StepSection>

        <StepSection step={4} title="Notes">
          {isPickup ? (
            <textarea
              value={localReservation.pickupNotes || ''}
              onChange={e => handleFieldChange('pickupNotes', e.target.value)}
              disabled={!isPickupEditable}
              rows={3}
              className={inputCls}
              placeholder="Vehicle condition, customer requests, anything the return team should know"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">From pickup</p>
                <p className="min-h-[84px] px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 whitespace-pre-wrap">{localReservation.pickupNotes || 'No notes from pickup.'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Return notes</label>
                <textarea
                  value={localReservation.dropOffNotes || ''}
                  onChange={e => handleFieldChange('dropOffNotes', e.target.value)}
                  disabled={!isDropoffEditable}
                  rows={3}
                  className={inputCls}
                  placeholder="Return condition, extra charges, etc."
                />
              </div>
            </div>
          )}
        </StepSection>

        <StepSection step={5} title={isPickup ? 'Agreement & signatures' : 'Return confirmation'} subtitle="Both signatures are required to finish">
          <p className="text-xs leading-relaxed text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">{isPickup ? PICKUP_TERMS : RETURN_TERMS}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SignatureBlock
              title="Renter"
              subtitle={reservation.personName}
              signature={renterSign}
              onSave={data => handleFieldChange(isPickup ? 'pickupRenterSignature' : 'dropOffRenterSignature', data)}
              onClear={() => handleFieldChange(isPickup ? 'pickupRenterSignature' : 'dropOffRenterSignature', undefined)}
              disabled={!isEditable}
            />
            <SignatureBlock
              title="Company representative"
              signature={agentSign}
              onSave={data => handleFieldChange(isPickup ? 'pickupAgentSignature' : 'dropOffAgentSignature', data)}
              onClear={() => handleFieldChange(isPickup ? 'pickupAgentSignature' : 'dropOffAgentSignature', undefined)}
              disabled={!isEditable}
            >
              <div className="mb-3">
                {renderTextField('Representative name', agentName || '', val => handleFieldChange(isPickup ? 'pickupAgentName' : 'dropOffAgentName', val), isEditable)}
              </div>
            </SignatureBlock>
          </div>
        </StepSection>
      </div>
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

    const isIn = step === 'checkin';

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-indigo-50 border border-indigo-100">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${isIn ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700'}`}>1 · Return current car</span>
          <span className="text-indigo-300">→</span>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${!isIn ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700'}`}>2 · Hand over new car</span>
        </div>
        <div className="space-y-5">
          <div>
            <StepSection title={isIn ? 'Current car inspection' : 'New car inspection'}>
              <ChecklistGrid items={checklistItems} checked={checklist} disabled={!isEditable}
                onToggle={(item, v) => handleExchangeFieldChange(isIn ? 'checkinChecklist' : 'checkoutChecklist', { ...checklist, [item]: v })} />
            </StepSection>
          </div>
          <div>
            <StepSection title="Fuel, mileage & details">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FuelGauge level={fuelLevel} disabled={!isEditable}
                  onLevelChange={level => handleExchangeFieldChange(isIn ? 'checkinFuelLevel' : 'checkoutFuelLevel', level)}
                  pickupLevel={isIn ? localReservation.pickupFuelLevel : undefined} />
                {renderKmField({ label: isIn ? 'Odometer in (current car)' : 'Odometer out (new car)', value: isIn ? currentExchange.checkinKmIn : currentExchange.checkoutKmOut, onChange: v => handleExchangeFieldChange(isIn ? 'checkinKmIn' : 'checkoutKmOut', v), editable: isEditable, reference: isIn ? localReservation.pickupKmOut : undefined, referenceLabel: isIn ? 'Out' : undefined, placeholder: isIn ? 'Returning reading' : 'Starting reading' })}
                {isIn ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Reason for exchange</label>
                    <textarea value={currentExchange.reason || ''} onChange={e => handleExchangeFieldChange('reason', e.target.value)} rows={2} className={inputCls} required disabled={!isEditable} />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">New car license plate</label>
                    <input value={currentExchange.newCarLicensePlate || ''} onChange={e => handleExchangeFieldChange('newCarLicensePlate', e.target.value)} className={inputCls} required disabled={!isEditable} />
                  </div>
                )}
              </div>
            </StepSection>
          </div>
        </div>
        <StepSection title="Damage report">
          <DamageBoard markers={damageMarkers} priorMarkers={isIn ? localReservation.pickupDamageMarkers || [] : undefined}
            editable={isEditable} onMark={handleExchangeDamageMark} onRemove={removeExchangeDamageMarker} />
        </StepSection>
        <StepSection title="Signatures">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SignatureBlock title="Renter" subtitle={reservation.personName} signature={renterSign} disabled={!isEditable}
              onSave={data => handleExchangeFieldChange(isIn ? 'checkinRenterSignature' : 'checkoutRenterSignature', data)}
              onClear={() => handleExchangeFieldChange(isIn ? 'checkinRenterSignature' : 'checkoutRenterSignature', undefined)} />
            <SignatureBlock title="Company representative" signature={agentSign} disabled={!isEditable}
              onSave={data => handleExchangeFieldChange(isIn ? 'checkinAgentSignature' : 'checkoutAgentSignature', data)}
              onClear={() => handleExchangeFieldChange(isIn ? 'checkinAgentSignature' : 'checkoutAgentSignature', undefined)}>
              <div className="mb-3">{renderTextField('Representative name', agentName || '', val => handleExchangeFieldChange(isIn ? 'checkinAgentName' : 'checkoutAgentName', val), isEditable)}</div>
            </SignatureBlock>
          </div>
        </StepSection>
      </div>
    );
  };

  const kind = vehicleKind(localReservation.carModel);
  const fmtDateTime = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const paid = !!(localReservation.authNumber && localReservation.finalAmountCharged);
  const steps = [
    { key: 'booked', label: 'Booked', done: true },
    { key: 'pickup', label: 'Checked out', done: !!localReservation.voucherSubmitted },
    { key: 'dropoff', label: 'Returned', done: !!localReservation.dropOffCompleted },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="relative bg-slate-50 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[96vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-4">
          <img src={URDRIVE_LOGO_B64} alt={companyDetails.name} className="h-7 hidden sm:block" />
          <div className="hidden sm:block w-px h-8 bg-slate-200" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Rental agreement{localReservation.awaitingConfirmation && <span className="ml-2 normal-case tracking-normal px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800">Awaiting confirmation</span>}</p>
            <p className="text-base font-bold text-slate-900 truncate">#{reservation.bookingId || 'N/A'} <span className="font-normal text-slate-400">·</span> <span className="font-semibold">{reservation.personName}</span></p>
          </div>
          {/* progress */}
          <ol className="hidden md:flex items-center gap-2">
            {steps.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 text-xs font-semibold ${s.done ? 'text-emerald-700' : 'text-slate-400'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center ${s.done ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300'}`}>{s.done && CHECK_ICON}</span>
                  {s.label}
                </span>
                {i < steps.length - 1 && <span className={`w-8 h-0.5 rounded ${steps[i + 1].done ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
              </li>
            ))}
          </ol>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M6.3 5.3a1 1 0 011.4 0L10 7.6l2.3-2.3a1 1 0 111.4 1.4L11.4 9l2.3 2.3a1 1 0 01-1.4 1.4L10 10.4l-2.3 2.3a1 1 0 01-1.4-1.4L8.6 9 6.3 6.7a1 1 0 010-1.4z" /></svg>
          </button>
        </div>

        {/* Mode switch */}
        <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 sm:px-6">
          <div className="flex gap-1">
            {([
              { key: 'pickup', label: 'Check-out', hint: localReservation.voucherSubmitted ? 'Completed' : 'Hand over the car', disabled: false, done: !!localReservation.voucherSubmitted },
              { key: 'dropoff', label: 'Check-in / exchange', hint: localReservation.dropOffCompleted ? 'Completed' : localReservation.voucherSubmitted ? 'Receive the car' : 'Available after check-out', disabled: !localReservation.voucherSubmitted, done: !!localReservation.dropOffCompleted },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setViewMode(t.key)} disabled={t.disabled}
                className={`px-4 py-3 text-left border-b-2 -mb-px transition-colors ${viewMode === t.key ? 'border-indigo-600' : 'border-transparent hover:border-slate-300'} ${t.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                <span className={`block text-sm font-semibold ${viewMode === t.key ? 'text-slate-900' : 'text-slate-600'}`}>{t.label}{t.done && <span className="ml-1.5 text-emerald-600">✓</span>}</span>
                <span className="block text-[11px] text-slate-400">{t.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div id="voucher-print-area" className="p-4 sm:p-6 space-y-5">
            {/* Summary hero */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                <div className="p-5 flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white font-bold flex items-center justify-center shrink-0">
                    {(reservation.personName || '?').split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 truncate">{reservation.personName}</p>
                    <p className="text-sm text-slate-500">{reservation.contactNumber || 'No phone'}</p>
                    <div className="mt-2">{renderTextField('Email (for receipt)', localReservation.customerEmail || '', val => handleFieldChange('customerEmail', val), isPickupEditable, true)}</div>
                  </div>
                </div>
                <div className="p-5 flex items-center gap-4">
                  <VehicleArt kind={kind} className="w-28 h-16 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{vehicleKindLabel[kind]}</p>
                    <p className="font-semibold text-slate-900 truncate">{localReservation.carModel || '—'}</p>
                    <p className="mt-1 inline-block px-2 py-0.5 rounded border border-slate-300 bg-slate-50 font-mono text-xs font-semibold text-slate-700">{localReservation.licensePlate || 'NO PLATE'}</p>
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center pt-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="w-0.5 h-8 bg-slate-200" />
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    </div>
                    <div className="space-y-2 min-w-0 flex-1">
                      <div><p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Pickup</p><p className="text-sm font-medium text-slate-900">{fmtDateTime(reservation.startDate)}</p></div>
                      <div><p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Return</p><p className="text-sm font-medium text-slate-900">{fmtDateTime(reservation.endDate)}</p></div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-bold text-slate-900">{rentalDays}</p>
                      <p className="text-[11px] text-slate-400 font-semibold uppercase">day{rentalDays === 1 ? '' : 's'}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 truncate">📍 {location?.name || reservation.locationName || 'Location not set'}{location?.address ? ` — ${location.address}` : ''}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
              {/* Main column */}
              <div className="lg:col-span-2 space-y-5 min-w-0">
                {viewMode === 'pickup' && renderChecks('pickup')}
                {viewMode === 'dropoff' && (
                  <>
                    {hasDueExtension && (
                      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm" role="alert">
                        <ShieldExclamationIcon className="w-5 h-5 shrink-0" />
                        <div><p className="font-semibold">Unpaid extension: {formatCurrency(dueForExtension)}</p><p className="text-xs">Collect the balance before the car can be checked in.</p></div>
                      </div>
                    )}
                    {hasOutstandingTickets && (
                      <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-sm" role="alert">
                        <ShieldExclamationIcon className="w-5 h-5 shrink-0" />
                        <div><p className="font-semibold">Outstanding traffic tickets: {totalTicketAmountDue.toFixed(2)} JOD</p><p className="text-xs">Settle them in Traffic Tickets before closing the rental.</p></div>
                      </div>
                    )}
                    {localReservation.lateReturnFee && localReservation.lateReturnFee.status === 'PENDING' && (
                      <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-sm" role="alert">
                        <ShieldExclamationIcon className="w-5 h-5 shrink-0" />
                        <div><p className="font-semibold">Late return detected</p><p className="text-xs">Resolve the fee in Late Returns, then come back to check the car in.</p></div>
                      </div>
                    )}

                    <fieldset disabled={hasOutstandingTickets || hasDueExtension || isDropoffBlockedByPendingFee} className="min-w-0">
                      {processType === 'selection' && !localReservation.dropOffCompleted ? (
                        <div className="bg-white rounded-2xl border border-slate-200 p-6">
                          <h2 className="text-base font-semibold text-slate-900">What are you processing?</h2>
                          <p className="text-sm text-slate-500 mb-5">Choose how the customer is returning the vehicle.</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button onClick={() => setProcessType('return')} className="text-left p-5 rounded-2xl border-2 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40 transition-all">
                              <VehicleArt kind={kind} className="w-20 h-11 mb-3" />
                              <p className="font-semibold text-slate-900">Final return</p>
                              <p className="text-xs text-slate-500">The rental ends today. Inspect the car and close the agreement.</p>
                            </button>
                            <button onClick={() => setProcessType('exchange')} className="text-left p-5 rounded-2xl border-2 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 transition-all">
                              <div className="flex items-center gap-1 mb-3"><VehicleArt kind={kind} className="w-14 h-8" /><span className="text-slate-400">⇄</span><VehicleArt kind="suv" className="w-14 h-8" /></div>
                              <p className="font-semibold text-slate-900">Vehicle exchange</p>
                              <p className="text-xs text-slate-500">Swap the car and continue the same rental.</p>
                            </button>
                          </div>
                        </div>
                      ) : processType === 'exchange' ? (
                        exchangeStep === 'checkin' ? renderExchangeStep('checkin') : renderExchangeStep('checkout')
                      ) : (
                        renderChecks('dropoff')
                      )}
                    </fieldset>
                  </>
                )}
              </div>

              {/* Side column */}
              <aside className="space-y-5 lg:sticky lg:top-0">
                <InfoBlock title="Vehicle">
                  {isPickupEditable ? (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Model</label>
                        <input type="text" value={localReservation.carModel || ''} onChange={e => handleFieldChange('carModel', e.target.value)} className={inputCls} placeholder="Vehicle model" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">License plate</label>
                        <input type="text" value={localReservation.licensePlate || ''} onChange={e => handleFieldChange('licensePlate', e.target.value)} className={`${inputCls} font-mono uppercase`} placeholder="Plate number" />
                      </div>
                    </>
                  ) : (
                    <>
                      <InfoPair label="Model" value={localReservation.carModel} />
                      <InfoPair label="License plate" value={<span className="font-mono">{localReservation.licensePlate || '—'}</span>} />
                    </>
                  )}
                  <InfoPair label="Odometer out" value={localReservation.pickupKmOut !== undefined ? `${localReservation.pickupKmOut.toLocaleString()} km` : undefined} />
                  {localReservation.dropOffKmIn !== undefined && <InfoPair label="Odometer in" value={`${localReservation.dropOffKmIn.toLocaleString()} km`} />}
                  {localReservation.dropOffKmIn && localReservation.pickupKmOut && localReservation.dropOffKmIn > localReservation.pickupKmOut && (
                    <InfoPair label="Distance driven" value={`${(localReservation.dropOffKmIn - localReservation.pickupKmOut).toLocaleString()} km`} />
                  )}
                  <InfoPair label="Fuel out / in" value={`${localReservation.pickupFuelLevel ?? '—'}/8 → ${localReservation.dropOffFuelLevel ?? '—'}/8`} />
                </InfoBlock>

                <InfoBlock title="Charges">
                  <InfoPair label={`Rental (${rentalDays} day${rentalDays === 1 ? '' : 's'})`} value={formatCurrency(baseRentalFee)} />
                  {(reservation.extras || []).map((ex, i) => (
                    <InfoPair key={i} label={ex.name} value={ex.isComplementary ? 'Included' : formatCurrency(ex.dailyPrice * rentalDays)} />
                  ))}
                  <div className="border-t border-slate-100 pt-3 flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-slate-900">Total</span>
                    <span className="text-2xl font-bold text-slate-900 tabular-nums">{formatCurrency(totalCost)}</span>
                  </div>
                  <InfoPair label="Security deposit" value={formatCurrency(reservation.securityDeposit || 0)} />
                  <InfoPair label="Excess" value={formatCurrency(reservation.excess || 0)} />
                  {isPayOnArrival !== undefined && <InfoPair label="Payment type" value={isPayOnArrival ? 'Pay on arrival' : 'Prepaid'} />}
                </InfoBlock>

                <InfoBlock title="Payment">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold ${paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    <span className={`w-2 h-2 rounded-full ${paid ? 'bg-emerald-500' : 'bg-amber-500'}`} /> {paid ? 'Paid' : 'Not yet authorised'}
                  </div>
                  {isPickupEditable ? (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Authorisation number</label>
                        <input type="text" value={localReservation.authNumber || ''} onChange={e => handleFieldChange('authNumber', e.target.value)} className={`${inputCls} font-mono`} placeholder="Card terminal auth code" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Amount charged ($)</label>
                        <input type="number" step="0.01" value={localReservation.finalAmountCharged || ''} onChange={e => handleFieldChange('finalAmountCharged', parseFloat(e.target.value) || undefined)} className={`${inputCls} tabular-nums`} placeholder={totalCost.toFixed(2)} />
                      </div>
                    </>
                  ) : (
                    <>
                      <InfoPair label="Authorisation" value={localReservation.authNumber ? <span className="font-mono">{localReservation.authNumber}</span> : undefined} />
                      <InfoPair label="Amount charged" value={localReservation.finalAmountCharged ? formatCurrency(localReservation.finalAmountCharged) : undefined} />
                    </>
                  )}
                </InfoBlock>

                <div className="text-center text-xs text-slate-400 px-2">
                  <p className="font-semibold text-slate-500">{companyDetails.name}</p>
                  <p>{companyDetails.address} · {companyDetails.phone}</p>
                </div>
              </aside>
            </div>
          </div>
        </div>

        {!showSuccessOverlay && (
          <div className="flex-shrink-0 px-4 sm:px-6 py-3 border-t border-slate-200 bg-white flex justify-between items-center gap-3">
            <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-100">Close</button>
            <div className="flex items-center gap-2">
              {viewMode === 'dropoff' && processType === 'exchange' && (
                <>
                  {exchangeStep === 'checkout' && (
                    <button onClick={() => setExchangeStep('checkin')} className="px-4 py-2.5 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-100">Back</button>
                  )}
                  {exchangeStep === 'checkin' && (
                    <button
                      onClick={() => setExchangeStep('checkout')}
                      disabled={!currentExchange.checkinRenterSignature || !currentExchange.checkinAgentSignature || !currentExchange.reason || hasOutstandingTickets || hasDueExtension}
                      className="px-5 py-2.5 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-slate-300"
                    >
                      Next: hand over new car →
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:bg-slate-300 shadow-sm"
                >
                  {CHECK_ICON}
                  {processType === 'exchange' && viewMode === 'dropoff' ? 'Complete exchange' : viewMode === 'pickup' ? 'Complete check-out' : 'Complete check-in'}
                </button>
              ) : (
                <button onClick={handleDownloadVoucherPDF} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800">
                  <PdfIcon className="w-4 h-4" /> Print agreement
                </button>
              )}
            </div>
          </div>
        )}

        {showSuccessOverlay && (
          <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 no-print">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
              <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-900">{localReservation.dropOffCompleted ? 'Check-in complete' : 'Check-out complete'}</h2>
            <p className="text-sm text-slate-500 mt-1 mb-6">#{reservation.bookingId} · {reservation.personName}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
              <button onClick={handleDownloadVoucherPDF} className="flex items-center gap-3 p-4 rounded-2xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left">
                <span className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center"><PdfIcon className="w-5 h-5" /></span>
                <span><span className="block text-sm font-semibold text-slate-900">Rental agreement</span><span className="block text-xs text-slate-500">Print or save as PDF</span></span>
              </button>
              <button onClick={handleDownloadReceiptPDF} className="flex items-center gap-3 p-4 rounded-2xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left">
                <span className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center"><PdfIcon className="w-5 h-5" /></span>
                <span><span className="block text-sm font-semibold text-slate-900">Payment receipt</span><span className="block text-xs text-slate-500">Download PDF</span></span>
              </button>
            </div>
            {localReservation.customerEmail && (
              <div className={`mt-4 w-full max-w-md flex items-center gap-3 p-3.5 rounded-2xl border text-left ${
                emailState.status === 'sent' ? 'border-emerald-200 bg-emerald-50' :
                emailState.status === 'failed' ? 'border-rose-200 bg-rose-50' :
                emailState.status === 'unconfigured' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${
                  emailState.status === 'sent' ? 'bg-emerald-600 text-white' :
                  emailState.status === 'failed' ? 'bg-rose-600 text-white' :
                  emailState.status === 'unconfigured' ? 'bg-amber-500 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                  {emailState.status === 'sending'
                    ? <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                    : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">
                    {emailState.status === 'sending' ? 'Emailing the agreement…' :
                     emailState.status === 'sent' ? 'Agreement emailed' :
                     emailState.status === 'failed' ? 'Email not sent' :
                     emailState.status === 'unconfigured' ? 'Email is not set up' : 'Email the agreement'}
                  </span>
                  <span className="block text-xs text-slate-500 truncate">
                    {emailState.status === 'unconfigured' ? 'Ask an administrator to configure outgoing email on the server.' :
                     emailState.status === 'failed' ? (emailState.message || 'Please try again.') :
                     `PDF to ${localReservation.customerEmail}`}
                  </span>
                </span>
                {(emailState.status === 'failed' || emailState.status === 'idle' || emailState.status === 'unconfigured') && (
                  <button onClick={handleSendEmail} className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 hover:bg-slate-100">{emailState.status === 'idle' ? 'Send' : 'Retry'}</button>
                )}
                {emailState.status === 'sent' && (
                  <button onClick={handleSendEmail} className="shrink-0 text-xs font-semibold text-emerald-700 hover:underline">Resend</button>
                )}
              </div>
            )}
            <button onClick={onClose} className="mt-6 px-8 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800">Done</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Voucher;
