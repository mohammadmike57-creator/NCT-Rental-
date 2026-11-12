import React, { useState, useEffect, useMemo, useRef } from 'react';
import CarShowcase from './CarShowcase';
import { carPhotoFor } from '../services/carPhoto';
import { AppData, AvailableExtra, ReservationExtra, Reservation, CompanyDetails, CarView, RentalSource, PaymentType, RentalLocation, CarExchange, TrafficTicket, DamageMarker, Fleet, ReturnCharges } from '../types';
import { VehicleArt, vehicleKind } from './VehicleGraphics';
import { ShieldExclamationIcon, PdfIcon, MailIcon } from './icons';
import { URDRIVE_LOGO_B64 } from '../constants';
import { downloadReceiptPdf } from '../services/receiptPdf';
import { calculateDaysWithGrace, isDriverExtra, AMEND_FIELDS, AMEND_SAVED, AMEND_LABEL, emailCheck, kmOutOk, kmInOk, chargesOk, signedCount, countChecked as countTicked, firstMissingStep } from './voucher/agreementRules';
import { recordActivity, sendCustomerEmail } from '../firebase/api';
import { receiptEmailPayload } from '../services/receiptEmail';
import { thankYouEmailPayload } from '../services/thankYouEmail';
import { emailAgreementDocuments } from '../services/agreementEmail';
import { withEmailLog, documentsSentMessage } from '../services/agreementEmailLog';
import PaymentChoice from './PaymentChoice';
import { bookingPayment, isPrepaid as bookingIsPrepaid, paymentUnset, sourceOf, PAYMENT_LABEL } from '../services/paymentType';
import { depositTermsFor } from '../services/fleetLookup';
import { changedFields, clearDraft, draftTime, loadDraft, saveDraft } from '../services/drafts';
import { counterPayment, DEPOSIT_HOLD_LABEL } from '../services/counterPayment';
import UpgradeVehicleModal, { UpgradeDetails } from './UpgradeVehicleModal';
import ReturnChargesPanel from './ReturnChargesPanel';
import { StepRail, MobileStepBar, WorkflowStep } from './voucher/WorkflowNav';
import DriverDetailsForm from './voucher/DriverDetailsForm';
import { TextField, KmField, KmFieldProps } from './voucher/Fields';
import { TimeEditRow, VehiclePicker, ExtrasEditor, withTime } from './voucher/AgreementEditors';
import { Bi } from './ui/Bi';
import { Badge, Button, Plate, SectionLabel, labelCls } from './ui/Crm';
import { buildAgreementHtml as buildAgreementDoc, PICKUP_TERMS_AR, RETURN_TERMS_AR } from '../services/agreementDoc';
import { buildTerminationHtml, terminationNumber } from '../services/terminationDoc';
import { printHtml } from '../services/printDocs';
import { buildReturnChargesHtml, chargesDocumentNumber, chargesDocumentTitle, chargesTotal, formatMoney, CHARGE_KIND_LABEL } from '../services/returnChargesDoc';

import { InfoBlock, InfoPair, StepSection, FuelGauge, CHECK_ICON, ChecklistGrid, DamageBoard, SignatureBlock, inputCls, areaCls } from './voucher/AgreementParts';
interface VoucherProps {
  /** Used to show the real photo of the car when the fleet has one. */
  fleet?: Fleet;
  reservation: Reservation;
  sources: RentalSource[];
  rentalLocations: RentalLocation[];
  trafficTickets: TrafficTicket[];
  onClose: () => void;
  companyDetails: CompanyDetails;
  onUpdate: (reservation: Reservation) => void;
  /** Called when a check-in closes with charges, so damages and tickets are also recorded in their registers. */
  onRecordReturnCharges?: (reservation: Reservation, charges: ReturnCharges) => void;
  /** All bookings, so the upgrade picker can show which cars are free. */
  allData?: AppData;
  /** Upgrades the booking to another car; given only to staff allowed to upgrade. */
  onUpgrade?: (reservation: Reservation, newCarId: string, customRate?: number, details?: UpgradeDetails) => Reservation | null;
  /** Whether the signed-in staff member may upgrade; without it the upgrade options explain how to get access. */
  canUpgrade?: boolean;
  /** Extras set up in Manage Extras, offered on the agreement. */
  availableExtras?: AvailableExtra[];
}


const Voucher: React.FC<VoucherProps> = ({ reservation, sources, rentalLocations, onClose, companyDetails, onUpdate, trafficTickets, onRecordReturnCharges, fleet, allData, onUpgrade, canUpgrade, availableExtras = [] }) => {
  const NO_UPGRADE_ACCESS = 'Your account does not have the "Upgrade vehicle" permission. Ask an administrator to turn it on in User & Staff Management → Permissions.';
  const [showUpgrade, setShowUpgrade] = useState(false);
  // Upgrade asked for during the rental: chosen first, applied when the car swap is completed.
  const [midUpgrade, setMidUpgrade] = useState<{ carId: string; details: UpgradeDetails; model: string } | null>(null);
  const [showMidUpgrade, setShowMidUpgrade] = useState(false);
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

  // What staff entered but did not complete yet survives a reload or closing the page (kept in this browser).
  const draftKey = `agreement:${reservation.id}`;
  const phaseOf = (r: Reservation) => (!r.voucherSubmitted ? 'pickup' : !r.dropOffCompleted ? 'dropoff' : 'closed');
  const withDraft = (base: Reservation): Reservation => {
    const d = loadDraft<{ phase: string; fields: Partial<Reservation> }>(draftKey);
    if (!d) return base;
    if (d.data.phase !== phaseOf(base)) { clearDraft(draftKey); return base; }
    return { ...base, ...d.data.fields };
  };
  const [restoredDraftAt, setRestoredDraftAt] = useState<number | null>(() => {
    const d = loadDraft<{ phase: string }>(draftKey);
    return d && d.data.phase === phaseOf(reservation) ? d.savedAt : null;
  });
  const [localReservation, setLocalReservation] = useState<Reservation>(() => withDraft(getInitialReservationState(reservation)));
  useEffect(() => {
    setLocalReservation(withDraft(getInitialReservationState(reservation)));
  }, [reservation]); // eslint-disable-line react-hooks/exhaustive-deps
  // The agreement as last saved: drafts and the "fill in what is missing" checks compare against it.
  const [savedBase, setSavedBase] = useState<Reservation>(() => getInitialReservationState(reservation));
  useEffect(() => { setSavedBase(getInitialReservationState(reservation)); }, [reservation]);  
  /** Saves the agreement and keeps it as the last saved copy, so later changes build on it (nothing is lost). */
  const saveRes = (r: Reservation) => { onUpdate(r); setSavedBase(r); };
  const draftSuspended = useRef(false);
  useEffect(() => {
    if (draftSuspended.current) return;
    const t = window.setTimeout(() => {
      const base = savedBase;
      if (phaseOf(base) === 'closed') return;
      const fields = changedFields(base, localReservation);
      if (Object.keys(fields).length) saveDraft(draftKey, { phase: phaseOf(base), fields });
      else clearDraft(draftKey);
    }, 400);
    return () => window.clearTimeout(t);
  }, [localReservation]); // eslint-disable-line react-hooks/exhaustive-deps
  const finishDraft = () => { draftSuspended.current = true; clearDraft(draftKey); setRestoredDraftAt(null); };
  const discardDraft = () => { clearDraft(draftKey); setRestoredDraftAt(null); setLocalReservation(getInitialReservationState(reservation)); };

  const [viewMode, setViewMode] = useState<'pickup' | 'dropoff'>(reservation.voucherSubmitted ? 'dropoff' : 'pickup');
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [emailState, setEmailState] = useState<{ status: 'idle' | 'sending' | 'sent' | 'failed' | 'unconfigured'; to?: string; message?: string }>({ status: 'idle' });

  const [processType, setProcessType] = useState<'selection' | 'return' | 'exchange'>(
    (reservation.voucherSubmitted && !reservation.dropOffCompleted) ? 'selection' : 'return'
  );
  const [exchangeStep, setExchangeStep] = useState<'checkin' | 'checkout'>('checkin');
  const [currentExchange, setCurrentExchange] = useState<Partial<CarExchange>>({});

  // Counter workflow navigation (layout state only).
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState<Record<string, true>>({});
  const [attempted, setAttempted] = useState(false);
  const centerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setStep(0); setAttempted(false); centerRef.current?.scrollTo({ top: 0 }); }, [viewMode, processType]);

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
  }, [viewMode, processType, localReservation.voucherSubmitted, localReservation.dropOffCompleted, localReservation.pickupDateTime, localReservation.dropOffDateTime, localReservation.endDate, dailyRate, onUpdate, localReservation]);

  const isPickupEditable = !localReservation.voucherSubmitted;
  // After check-out the agreement can still be completed: the email changed, missing customer details and
  // auth codes filled in, and extras added while the car is out. Saved with "Save changes".
  const canAmend = !!savedBase.voucherSubmitted;
  const extrasOnRent = canAmend && !savedBase.dropOffCompleted;
  const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && !v.trim());
  const missingSaved = (k: keyof Reservation) => isBlank(savedBase[k]);

  // Until the car is handed over, the deposit and excess follow the car chosen for the rental (fleet settings).
  const fleetTerms = depositTermsFor(fleet, localReservation.licensePlate, localReservation.carModel);
  useEffect(() => {
    if (!isPickupEditable || !fleetTerms) return;
    if (localReservation.securityDeposit === fleetTerms.securityDeposit && localReservation.excess === fleetTerms.excess) return;
    setLocalReservation(prev => ({ ...prev, securityDeposit: fleetTerms.securityDeposit, excess: fleetTerms.excess }));
  }, [isPickupEditable, fleetTerms?.securityDeposit, fleetTerms?.excess, fleetTerms?.car.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const depositSource = fleetTerms ? `${fleetTerms.car.modelName}${fleetTerms.car.licensePlate ? ` · ${fleetTerms.car.licensePlate}` : ''}` : '';
  const ticketsBlockFlow = hasOutstandingTickets && processType === 'exchange';
  const isDropoffEditable = !!localReservation.voucherSubmitted && !localReservation.dropOffCompleted && !ticketsBlockFlow && !hasDueExtension;

  const charges: ReturnCharges = localReservation.returnCharges || { items: [], currency: 'JOD' };
  const setCharges = (c: ReturnCharges) => setLocalReservation(prev => ({ ...prev, returnCharges: c }));
  // Unpaid traffic tickets on this booking are billed as part of the return.
  useEffect(() => {
    if (viewMode !== 'dropoff' || processType !== 'return' || !isDropoffEditable || outstandingTickets.length === 0) return;
    setLocalReservation(prev => {
      const cur: ReturnCharges = prev.returnCharges || { items: [], currency: 'JOD' };
      const missing = outstandingTickets.filter(t => !cur.items.some(i => i.ticketId === t.id));
      if (missing.length === 0) return prev;
      return { ...prev, returnCharges: { ...cur, items: [...cur.items, ...missing.map(t => ({
        id: `rc-t-${t.id}`, kind: 'ticket' as const, description: t.details || 'Traffic violation', amount: t.amount, ticketId: t.id, ticketDate: t.ticketDate,
        photos: t.ticketDocument && t.ticketDocument.startsWith('data:image') ? [t.ticketDocument] : [],
      }))] } };
    });
  }, [viewMode, processType, isDropoffEditable, outstandingTickets]);

  const location = rentalLocations.find(loc => loc.name === reservation.locationName);
  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const checklistItems = ["Spare Tire", "Jack & Tools", "Windows & Windshield", "Headlights", "Turn Signals", "AC / Heater", "Audio System", "Mirrors", "Interior Cleanliness"];

  // ---- Counter edits before the car is handed over: times, car and extras ----
  const setPickupTime = (t: string) => (isPickupEditable || canAmend) && setLocalReservation(prev => ({ ...prev, startDate: withTime(prev.startDate, t), pickupDate: withTime(prev.pickupDate || prev.startDate, t) }));
  const setReturnTime = (t: string) => (isPickupEditable || canAmend) && setLocalReservation(prev => ({ ...prev, endDate: withTime(prev.endDate, t), dropoffDate: withTime(prev.dropoffDate || prev.endDate, t) }));
  const timesInvalid = !!localReservation.startDate && !!localReservation.endDate && new Date(localReservation.endDate).getTime() <= new Date(localReservation.startDate).getTime();
  const pickCar = (car: import('../types').Vehicle) => isPickupEditable && setLocalReservation(prev => ({
    ...prev, carModel: car.modelName, licensePlate: car.licensePlate, ...(car.transmission ? { transmission: car.transmission } : {}), ...(car.sippCode ? { sippCode: car.sippCode } : {}),
  }));
  /** After check-out: correct the car on the agreement (wrong model or plate typed). Prices and deposit stay as they are. */
  const correctCar = (car: import('../types').Vehicle) => canAmend && setLocalReservation(prev => ({
    ...prev, carModel: car.modelName, licensePlate: car.licensePlate, ...(car.transmission ? { transmission: car.transmission } : {}), ...(car.sippCode ? { sippCode: car.sippCode } : {}),
  }));
  /** New extras keep the rental price as it is: the booking total moves by the extras' difference only. */
  const setExtras = (list: ReservationExtra[]) => (isPickupEditable || extrasOnRent) && setLocalReservation(prev => {
    const days = calculateDaysWithGrace(prev.startDate, prev.endDate);
    const sum = (l: ReservationExtra[]) => l.reduce((t, e) => (e.isComplementary ? t : t + (e.dailyPrice || 0) * days), 0);
    const base = prev.baseAmount ?? ((prev.amount || 0) - sum(prev.extras || []));
    // Each "Additional driver" extra gets a driver line, so the name can be written straight away.
    const wanted = list.filter(e => isDriverExtra(e.name)).length;
    const drivers = [...(prev.additionalDrivers || [])];
    while (drivers.length < wanted) drivers.push({ name: '' });
    return { ...prev, extras: list, additionalDrivers: drivers, baseAmount: base, amount: Math.round((base + sum(list)) * 100) / 100 };
  });
  const driverExtras = (localReservation.extras || []).filter(e => isDriverExtra(e.name)).length;
  const setDriverName = (i: number, name: string) => {
    const list = [...(localReservation.additionalDrivers || [])];
    while (list.length <= i) list.push({ name: '' });
    list[i] = { ...list[i], name };
    if (isPickupEditable || extrasOnRent) setLocalReservation(prev => ({ ...prev, additionalDrivers: list }));
    else handleFieldChange('additionalDrivers', list);
  };

  const handleFieldChange = (field: keyof Reservation, value: any) => {
    const isEditable = viewMode === 'pickup' ? isPickupEditable : isDropoffEditable;
    const notesAreEditable = (field === 'pickupNotes' && isPickupEditable) || (field === 'dropOffNotes' && !localReservation.dropOffCompleted);
    if (!isEditable && !notesAreEditable && !(canAmend && AMEND_FIELDS.includes(field))) return;
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

  const updateDamageMarker = (index: number, patch: Partial<DamageMarker>) => {
    const isEditable = viewMode === 'pickup' ? isPickupEditable : isDropoffEditable;
    if (!isEditable) return;
    const field = viewMode === 'pickup' ? 'pickupDamageMarkers' : 'dropOffDamageMarkers';
    handleFieldChange(field, (localReservation[field] || []).map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };

  /**
   * Signatures are optional: they can be taken on screen or by hand on the printed agreement.
   * Returns true when the paper option applies, false when both are signed on screen, null when staff cancel.
   */
  const needsPaperSignatures = (mode: 'pickup' | 'dropoff'): boolean | null => {
    const renter = localReservation[mode === 'pickup' ? 'pickupRenterSignature' : 'dropOffRenterSignature'];
    const agent = localReservation[mode === 'pickup' ? 'pickupAgentSignature' : 'dropOffAgentSignature'];
    if (renter && agent) return false;
    if (localReservation[mode === 'pickup' ? 'pickupSignOnPaper' : 'dropOffSignOnPaper']) return true;
    const who = [!renter && 'the customer', !agent && 'the company representative'].filter(Boolean).join(' and ');
    return window.confirm(`No on-screen signature from ${who}.\n\nContinue and have the printed agreement signed by hand? The signature lines are left blank on the print.`) ? true : null;
  };

  const handleSubmit = () => {
    if (!localReservation.customerEmail?.trim()) {
      alert("The customer email address is required: the signed agreement is emailed to the customer.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(localReservation.customerEmail.trim())) {
      alert("The customer email address is not valid. Please correct it.");
      return;
    }

    if (viewMode === 'pickup') {
      if (!localReservation.licensePlate?.trim()) { alert("License Plate is required."); return; }
      if (timesInvalid) { alert("The return time must be after the pickup time (Customer step)."); return; }
      if (localReservation.pickupKmOut === undefined || localReservation.pickupKmOut === null || localReservation.pickupKmOut < 0) { alert("A valid starting Kilometers Out is required."); return; }

      if (paymentUnset(localReservation, sources)) {
        alert("Choose whether this booking is prepaid or pay on arrival (Charges & payment step).");
        return;
      }
      // Card details, payment method, deposit hold and auth codes are optional: they can be added after check-out.
      const paperPickup = needsPaperSignatures('pickup');
      if (paperPickup === null) return;

      const submittedVoucher = {
        ...localReservation, voucherSubmitted: true, ...(paperPickup ? { pickupSignOnPaper: true } : {}),
        ...(bookingPayment(localReservation, sources) === PaymentType.PREPAID && !localReservation.paymentMethod ? { paymentMethod: 'prepaid' as const } : {}),
      };
      finishDraft();
      saveRes(submittedVoucher);
      setLocalReservation(submittedVoucher);
      setShowSuccessOverlay(true);
      recordActivity('CHECK_OUT', 'agreement', `Checked out ${submittedVoucher.carModel || 'vehicle'}${submittedVoucher.licensePlate ? ` (${submittedVoucher.licensePlate})` : ''} to ${submittedVoucher.personName}`,
        submittedVoucher.bookingId, `Km out ${submittedVoucher.pickupKmOut ?? '—'} · fuel ${submittedVoucher.pickupFuelLevel ?? '—'}/8 · agent ${submittedVoucher.pickupAgentName || '—'}`);
      queueEmail(submittedVoucher, 'checkout');
    } else {
      if (processType === 'return') {
        if (localReservation.dropOffKmIn === undefined || localReservation.dropOffKmIn === null || localReservation.dropOffKmIn < 0) { alert("A valid returning Kilometers In is required for drop-off."); return; }
        if (localReservation.pickupKmOut !== undefined && localReservation.pickupKmOut !== null && localReservation.dropOffKmIn < localReservation.pickupKmOut) {
          alert("Kilometers In cannot be less than Kilometers Out.");
          return;
        }
        const paperReturn = needsPaperSignatures('dropoff');
        if (paperReturn === null) return;

        let finalCharges: ReturnCharges | undefined;
        if (charges.items.length > 0) {
          const bad = charges.items.findIndex(i => !i.description.trim() || !(i.amount > 0));
          if (bad >= 0) { alert(`Charge #${bad + 1} needs a description and an amount.`); return; }
          if (!charges.settlement) { alert('Choose whether the charges are paid now or sent to the customer as a claim.'); return; }
          if (charges.settlement === 'paid' && !charges.paymentMethod) { alert('Select how the charges were paid.'); return; }
          if (!charges.customerSignature) { alert('The customer must sign to acknowledge the charges.'); return; }
          finalCharges = {
            ...charges,
            documentNumber: charges.documentNumber || chargesDocumentNumber(localReservation.bookingId, charges.settlement),
            issuedAt: new Date().toISOString(),
            issuedBy: localReservation.dropOffAgentName || undefined,
            dueDate: charges.settlement === 'claim' ? (charges.dueDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)) : undefined,
          };
        }
        const submittedVoucher: Reservation = { ...localReservation, dropOffCompleted: true, returnCharges: finalCharges, ...(paperReturn ? { dropOffSignOnPaper: true } : {}) };
        if (finalCharges && onRecordReturnCharges) onRecordReturnCharges(submittedVoucher, finalCharges);
        finishDraft();
        saveRes(submittedVoucher);
        setLocalReservation(submittedVoucher);
        setShowSuccessOverlay(true);
        recordActivity('CHECK_IN', 'agreement', `Checked in ${submittedVoucher.carModel || 'vehicle'}${submittedVoucher.licensePlate ? ` (${submittedVoucher.licensePlate})` : ''} from ${submittedVoucher.personName} and closed the agreement`,
          submittedVoucher.bookingId, `Km in ${submittedVoucher.dropOffKmIn ?? '—'} · fuel ${submittedVoucher.dropOffFuelLevel ?? '—'}/8${finalCharges ? ` · charges ${formatMoney(chargesTotal(finalCharges.items), finalCharges.currency)} (${finalCharges.settlement === 'paid' ? 'paid' : 'claim'} ${finalCharges.documentNumber})` : ' · no charges'}`);
        queueEmail(submittedVoucher, 'checkin');
      } else if (processType === 'exchange') {
        if (!currentExchange.reason?.trim()) { alert("A reason for the exchange is required."); return; }
        if (!currentExchange.newCarLicensePlate?.trim()) { alert("The new car's license plate is required."); return; }
        const unsigned = [currentExchange.checkinRenterSignature, currentExchange.checkinAgentSignature, currentExchange.checkoutRenterSignature, currentExchange.checkoutAgentSignature].filter(x => !x).length;
        if (unsigned > 0 && !window.confirm(`${unsigned} of 4 exchange signatures ${unsigned === 1 ? 'is' : 'are'} not taken on screen.\n\nContinue and have them signed by hand on the printed agreement?`)) return;

        const completeExchange: CarExchange = {
          exchangeDate: new Date().toISOString(),
          reason: currentExchange.reason,
          oldCarLicensePlate: localReservation.licensePlate || 'UNKNOWN',
          checkinRenterSignature: currentExchange.checkinRenterSignature || '',
          checkinAgentSignature: currentExchange.checkinAgentSignature || '',
          checkinAgentName: currentExchange.checkinAgentName || '',
          checkinDamageMarkers: currentExchange.checkinDamageMarkers || [],
          checkinChecklist: currentExchange.checkinChecklist || {},
          checkinFuelLevel: currentExchange.checkinFuelLevel || 0,
          checkinKmIn: currentExchange.checkinKmIn || 0,
          newCarLicensePlate: currentExchange.newCarLicensePlate,
          checkoutRenterSignature: currentExchange.checkoutRenterSignature || '',
          checkoutAgentSignature: currentExchange.checkoutAgentSignature || '',
          checkoutAgentName: currentExchange.checkoutAgentName || '',
          checkoutDamageMarkers: currentExchange.checkoutDamageMarkers || [],
          checkoutChecklist: currentExchange.checkoutChecklist || {},
          checkoutFuelLevel: currentExchange.checkoutFuelLevel || 0,
          checkoutKmOut: currentExchange.checkoutKmOut || 0,
        };

        let upgraded: Partial<Reservation> = {};
        if (midUpgrade && onUpgrade) {
          const base: Reservation = { ...reservation, carModel: localReservation.carModel, licensePlate: localReservation.licensePlate, amount: localReservation.amount, upgradeHistory: localReservation.upgradeHistory };
          const upd = onUpgrade(base, midUpgrade.carId, midUpgrade.details.fee, midUpgrade.details);
          if (upd) upgraded = { carModel: upd.carModel, amount: upd.amount, upgradeHistory: upd.upgradeHistory };
        }
        const updatedReservation: Reservation = {
          ...localReservation,
          ...upgraded,
          licensePlate: completeExchange.newCarLicensePlate,
          pickupKmOut: completeExchange.checkoutKmOut,
          carExchanges: [...(localReservation.carExchanges || []), completeExchange],
        };
        finishDraft();
        saveRes(updatedReservation);
        recordActivity('VEHICLE_EXCHANGED', 'agreement', `Exchanged ${completeExchange.oldCarLicensePlate} for ${completeExchange.newCarLicensePlate} for ${localReservation.personName}`, localReservation.bookingId, `Reason: ${completeExchange.reason}`);
        onClose();
      }
    }
  };

  const PICKUP_TERMS = "By signing, the Renter acknowledges receipt of the vehicle in the condition documented above and agrees to the rental terms and conditions. The Renter accepts financial responsibility for all charges, traffic violations, damages and losses during the rental period. The Company Representative confirms the vehicle's condition and rental details are accurate at pickup.";
  const RETURN_TERMS = "By signing, the Renter confirms the return of the vehicle. The final condition and any additional charges (such as fuel shortage or new damage) have been reviewed and accepted. The Company Representative confirms receipt of the vehicle and the accuracy of the return inspection.";
  // ====================== PRINTABLE RENTAL AGREEMENT ======================
  const buildAgreementHtml = (r: Reservation = localReservation): string => buildAgreementDoc({
    reservation: r,
    company: companyDetails,
    logo: URDRIVE_LOGO_B64,
    checklistItems,
    rentalDays,
    baseRentalFee,
    locationName: location?.name || r.locationName,
    locationAddress: location?.address,
    prepaid: bookingIsPrepaid(r, sources),
    vehiclePhoto: carPhotoFor(fleet, r.licensePlate, r.carModel),
  });

  const buildTermination = (r: Reservation = localReservation): string => buildTerminationHtml({
    reservation: r,
    company: companyDetails,
    logo: URDRIVE_LOGO_B64,
    rentalDays,
    baseRentalFee,
    checklistItems,
    locationName: location?.name || r.locationName,
    prepaid: bookingIsPrepaid(r, sources),
  });

  const handlePrintTermination = () => {
    if (!printHtml(buildTermination())) alert('Allow pop-ups for this site to print the termination statement.');
  };

  const handleDownloadVoucherPDF = () => {
    if (!printHtml(buildAgreementHtml())) alert('Allow pop-ups for this site to print the agreement.');
    recordActivity('AGREEMENT_PRINTED', 'agreement', `Printed the rental agreement for ${localReservation.personName}`, localReservation.bookingId);
  };

  const handleDownloadReceiptPDF = () =>
    downloadReceiptPdf(localReservation, calculateDaysWithGrace(localReservation.startDate, localReservation.endDate));

  const handlePreviewCharges = () => {
    const html = buildReturnChargesHtml(localReservation, { ...charges, documentNumber: charges.documentNumber || 'PREVIEW' }, companyDetails, URDRIVE_LOGO_B64);
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (w) { w.document.write(html); w.document.close(); w.focus(); }
  };
  const handleDownloadChargesPDF = () => {
    if (!localReservation.returnCharges) return;
    if (!printHtml(buildReturnChargesHtml(localReservation, localReservation.returnCharges, companyDetails, URDRIVE_LOGO_B64))) alert('Allow pop-ups for this site to print.');
  };

  // Emails the signed agreement (as a PDF) to the customer right after check-out; at check-in also the
  // rental termination statement and any invoice / claim for damages and charges.
  const emailAgreement = async (r: Reservation, kind: 'checkout' | 'checkin') => {
    const to = r.customerEmail?.trim();
    if (!to) return;
    setEmailState({ status: 'sending', to });
    const outcome = await emailAgreementDocuments({
      reservation: r, kind, company: companyDetails,
      agreementHtml: buildAgreementHtml(r),
      terminationHtml: kind === 'checkin' ? buildTermination(r) : undefined,
    });
    if (outcome.ok) {
      setEmailState({ status: 'sent', to });
      const withLog = withEmailLog(r, to, kind, new Date().toISOString());
      // Only the email log is taken over, so check-in entries made meanwhile stay on screen.
      setLocalReservation(prev => ({ ...prev, agreementEmails: withLog.agreementEmails, ...(withLog.returnCharges !== r.returnCharges ? { returnCharges: withLog.returnCharges } : {}) }));
      saveRes(withLog);
      return true;
    } else {
      setEmailState({ status: outcome.reason === 'unconfigured' ? 'unconfigured' : 'failed', to, message: outcome.message });
      return false;
    }
  };

  // ---- Changes after check-out ("Save changes") ----
  const amendedKeys = AMEND_SAVED.filter(k => JSON.stringify(localReservation[k] ?? null) !== JSON.stringify(savedBase[k] ?? null));
  const amendDirty = canAmend && amendedKeys.length > 0;
  const [amendBusy, setAmendBusy] = useState(false);
  const saveAmendments = async () => {
    const email = (localReservation.customerEmail || '').trim();
    if (!email) { alert('The customer email address is required: the agreement is emailed to the customer.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { alert('The customer email address is not valid. Please correct it.'); return; }
    if (timesInvalid) { alert('The return time must be after the pickup time.'); return; }
    if (!(localReservation.licensePlate || '').trim()) { alert('The license plate cannot be empty.'); return; }
    const picked = Object.fromEntries(AMEND_SAVED.map(k => [k, localReservation[k]])) as Partial<Reservation>;
    const next: Reservation = { ...savedBase, ...picked, customerEmail: email };
    const labels = Array.from(new Set(amendedKeys.map(k => AMEND_LABEL[k]).filter(Boolean)));
    const oldEmail = (savedBase.customerEmail || '').trim();
    const emailChanged = email.toLowerCase() !== oldEmail.toLowerCase();
    const carChanged = (next.carModel || '') !== (savedBase.carModel || '') || (next.licensePlate || '') !== (savedBase.licensePlate || '');
    saveRes(next);
    setSavedBase(next);
    setLocalReservation(prev => ({ ...prev, ...picked, customerEmail: email }));
    recordActivity('AGREEMENT_UPDATED', 'agreement', `Updated the rental agreement for ${next.personName}: ${labels.join(', ') || 'details'}`, next.bookingId,
      [emailChanged ? `Email ${oldEmail || '(none)'} → ${email}` : '',
        carChanged ? `Car ${savedBase.carModel || '—'} ${savedBase.licensePlate || ''} → ${next.carModel || '—'} ${next.licensePlate || ''}`.replace(/\s+/g, ' ') : '']
        .filter(Boolean).join(' · ') || undefined);
    const docs = next.dropOffCompleted ? 'the closed agreement, the termination statement' : 'the updated agreement';
    const ask = emailChanged
      ? `Saved. The email address is now ${email}.\n\nSend ${docs} and the receipt to ${email} now?`
      : `Saved.\n\nSend ${docs} and the receipt to ${email}?`;
    if (!window.confirm(ask)) return;
    await emailDocuments(next, email, 'The changes are saved.');
  };

  /** Emails the documents for the agreement's stage: closed → closed agreement + termination (+ invoice / claim); on rent → agreement. The receipt goes too. */
  const emailDocuments = async (r: Reservation, email: string, savedNote = '') => {
    setAmendBusy(true);
    const kind = r.dropOffCompleted ? 'checkin' : 'checkout';
    const [agreementSent, receipt] = await Promise.all([
      emailAgreement(r, kind),
      sendCustomerEmail(receiptEmailPayload(r, companyDetails, sources, email)).catch(() => ({ ok: false } as { ok: boolean; reason?: string; message?: string })),
    ]);
    setAmendBusy(false);
    alert(documentsSentMessage(!!r.dropOffCompleted, email, !!agreementSent, receipt as { ok: boolean; reason?: string }, savedNote));
  };
  /** "Email documents": send them again to the address on the agreement, without changing anything. */
  const resendDocuments = () => {
    const email = (savedBase.customerEmail || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { alert('This agreement has no valid email address. Enter one, then click Save changes.'); return; }
    const what = savedBase.dropOffCompleted ? 'the closed agreement, the termination statement' : 'the agreement';
    if (!window.confirm(`Send ${what} and the receipt to ${email}?`)) return;
    recordActivity('DOCUMENTS_EMAILED', 'email', `Emailed ${what} and the receipt to ${email}`, savedBase.bookingId);
    void emailDocuments(savedBase, email);
  };

  // Building the PDFs keeps the browser busy, so it starts only once the success screen is on show.
  // Closing the agreement does not cancel it: the email still goes out in the background.
  const queueEmail = (r: Reservation, kind: 'checkout' | 'checkin') => {
    if (!r.customerEmail?.trim()) return;
    setEmailState({ status: 'sending', to: r.customerEmail.trim() });
    window.setTimeout(() => {
      void emailAgreement(r, kind).then(sent => {
        // After the car is returned: once the documents have gone out, a thank-you letter follows.
        if (kind !== 'checkin' || !sent) return;
        const thanks = thankYouEmailPayload(r, companyDetails, sources);
        if (!thanks) return;
        void sendCustomerEmail(thanks).then(o => {
          if (o.ok) recordActivity('THANK_YOU_EMAILED', 'email', `Sent the thank-you email to ${r.personName} (${thanks.to})`, r.bookingId);
        });
      });
    }, 1500);
  };

  const handleSendEmail = () => emailAgreement(localReservation, localReservation.dropOffCompleted ? 'checkin' : 'checkout');

  // From the agreement being edited: the pick-up and return times can be changed at the counter.
  const rentalDays = calculateDaysWithGrace(localReservation.startDate, localReservation.endDate);
  // From the agreement being edited, so an upgrade made at the counter shows at once.
  const extrasTotal = (localReservation.extras || []).reduce((sum, extra) => extra.isComplementary ? sum : sum + (extra.dailyPrice * rentalDays), 0);
  const baseRentalFee = localReservation.baseAmount ?? ((localReservation.amount || 0) - extrasTotal);
  const totalCost = baseRentalFee + extrasTotal;

  // How this booking is paid: its own choice, or its source's type. Unset when the source takes both.
  const payType = bookingPayment(localReservation, sources);
  const payUnset = paymentUnset(localReservation, sources);
  // Set when the reservation was added (or listed): the counter follows it instead of choosing again.
  const [paymentFromBooking] = useState(() => !!reservation.paymentType);
  const isPayOnArrival = payType === PaymentType.PAY_ON_ARRIVAL;
  const isPrepaidBooking = payType === PaymentType.PREPAID;
  // Prepaid: the partner was paid for the rental, so only extras and upgrades are collected. Deposit: always held.
  const pay = counterPayment(localReservation, isPrepaidBooking, baseRentalFee, extrasTotal);
  const counterMethodOk = !isPrepaidBooking || pay.toCollect <= 0
    || (!!localReservation.paymentMethod && localReservation.paymentMethod !== 'prepaid');

  const renderTextField = (label: string, value: string, onChange: (val: string) => void, isEditable: boolean, isEmail: boolean = false) =>
    <TextField label={label} value={value} onChange={onChange} isEditable={isEditable} isEmail={isEmail} />;
  const renderKmField = (props: KmFieldProps) => <KmField {...props} />;


  type CheckSection = 'inspection' | 'fuel' | 'damage' | 'charges' | 'signatures';

  /** One section of the check-out / check-in inspection; the workflow shows one at a time. */
  const renderCheckSection = (mode: 'pickup' | 'dropoff', section: CheckSection, stepNo?: number) => {
    const isEditable = mode === 'pickup' ? isPickupEditable : isDropoffEditable;
    const checklist = localReservation[mode === 'pickup' ? 'pickupChecklist' : 'dropOffChecklist'] || {};
    const damageMarkers = localReservation[mode === 'pickup' ? 'pickupDamageMarkers' : 'dropOffDamageMarkers'] || [];
    const fuelLevel = localReservation[mode === 'pickup' ? 'pickupFuelLevel' : 'dropOffFuelLevel'];
    const renterSign = localReservation[mode === 'pickup' ? 'pickupRenterSignature' : 'dropOffRenterSignature'];
    const agentSign = localReservation[mode === 'pickup' ? 'pickupAgentSignature' : 'dropOffAgentSignature'];
    const agentName = localReservation[mode === 'pickup' ? 'pickupAgentName' : 'dropOffAgentName'];
    const isPickup = mode === 'pickup';

    switch (section) {
      case 'inspection':
        return (
          <StepSection step={stepNo} title={isPickup ? 'Vehicle inspection' : 'Return inspection'} subtitle={isPickup ? 'Confirm each item before handing over the keys' : 'Compare with the condition at pickup'}>
            <ChecklistGrid
              items={checklistItems}
              checked={checklist}
              onToggle={(item, v) => handleFieldChange(isPickup ? 'pickupChecklist' : 'dropOffChecklist', { ...checklist, [item]: v })}
              disabled={!isEditable}
              compareWith={isPickup ? undefined : localReservation.pickupChecklist || {}}
            />
          </StepSection>
        );
      case 'fuel':
        return (
          <StepSection step={stepNo} title="Fuel & mileage" subtitle={isPickup ? 'Readings when the car leaves' : 'Readings when the car comes back'}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <FuelGauge
                level={fuelLevel}
                onLevelChange={level => handleFieldChange(isPickup ? 'pickupFuelLevel' : 'dropOffFuelLevel', level)}
                disabled={!isEditable}
                pickupLevel={isPickup ? undefined : localReservation.pickupFuelLevel}
              />
              {renderKmField({ label: isPickup ? 'Odometer out' : 'Odometer in', value: isPickup ? localReservation.pickupKmOut : localReservation.dropOffKmIn, onChange: v => handleFieldChange(isPickup ? 'pickupKmOut' : 'dropOffKmIn', v), editable: isEditable, reference: isPickup ? undefined : localReservation.pickupKmOut, referenceLabel: isPickup ? undefined : 'Out', placeholder: isPickup ? 'Starting reading' : 'Returning reading' })}
            </div>
          </StepSection>
        );
      case 'damage':
        return (
          <StepSection step={stepNo} title="Damage report" subtitle={isPickup ? 'Mark existing scratches, dents and chips' : 'Mark any damage that was not there at pickup'}>
            <DamageBoard
              markers={damageMarkers}
              priorMarkers={isPickup ? undefined : localReservation.pickupDamageMarkers || []}
              editable={isEditable}
              onMark={handleDamageMark}
              onRemove={removeDamageMarker}
              onUpdate={updateDamageMarker}
            />
          </StepSection>
        );
      case 'charges':
        return (
          <StepSection step={stepNo} title="Damages, traffic tickets & charges" subtitle="Photograph new damage, add tickets and other charges, then settle or claim">
            <ReturnChargesPanel
              charges={charges}
              onChange={setCharges}
              editable={isEditable}
              markers={localReservation.dropOffDamageMarkers || []}
              customerName={reservation.personName}
              onPreview={handlePreviewCharges}
            />
          </StepSection>
        );
      case 'signatures':
        return (
          <div className="space-y-4">
            <StepSection title="Notes">
              {isPickup ? (
                <textarea
                  value={localReservation.pickupNotes || ''}
                  onChange={e => handleFieldChange('pickupNotes', e.target.value)}
                  disabled={!isPickupEditable}
                  rows={3}
                  className={areaCls}
                  placeholder="Vehicle condition, customer requests, anything the return team should know"
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className={labelCls}><Bi en="From pickup" /></p>
                    <p className="min-h-[84px] px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[13px] text-slate-700 whitespace-pre-wrap">{localReservation.pickupNotes || 'No notes from pickup.'}</p>
                  </div>
                  <div>
                    <label className={labelCls}><Bi en="Return notes" /></label>
                    <textarea
                      value={localReservation.dropOffNotes || ''}
                      onChange={e => handleFieldChange('dropOffNotes', e.target.value)}
                      disabled={!isDropoffEditable}
                      rows={3}
                      className={areaCls}
                      placeholder="Return condition, extra charges, etc."
                    />
                  </div>
                </div>
              )}
            </StepSection>

            <StepSection step={stepNo} title={isPickup ? 'Agreement & signatures' : 'Return confirmation'} subtitle="Sign on screen, or print the agreement and sign it by hand">
              {(() => {
                const paperKey = isPickup ? 'pickupSignOnPaper' : 'dropOffSignOnPaper';
                const onPaper = !!localReservation[paperKey];
                return (
                  <div className={`mb-4 rounded-lg border p-3 flex flex-wrap items-center gap-3 ${onPaper ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-white'}`}>
                    <label className={`flex items-start gap-3 flex-1 min-w-[240px] ${isEditable ? 'cursor-pointer' : ''}`}>
                      <input type="checkbox" className="mt-0.5" checked={onPaper} disabled={!isEditable} onChange={e => handleFieldChange(paperKey, e.target.checked || undefined)} />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-slate-900">Sign on the printed agreement</span>
                        <span className="block text-xs text-slate-500">The customer and the representative sign the paper copy by hand. On-screen signatures become optional; the print keeps blank signature lines.</span>
                      </span>
                    </label>
                    <Button size="sm" onClick={handleDownloadVoucherPDF} icon={<PdfIcon className="w-4 h-4" />}>Print agreement</Button>
                  </div>
                );
              })()}
              <div className="text-xs leading-relaxed text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 space-y-2"><p>{isPickup ? PICKUP_TERMS : RETURN_TERMS}</p><p lang="ar" dir="rtl" className="ar-ui !font-normal !text-slate-700 !text-[13px] leading-6 pt-2 border-t border-slate-200">{isPickup ? PICKUP_TERMS_AR : RETURN_TERMS_AR}</p></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SignatureBlock
                  title="Renter"
                  subtitle={reservation.personName}
                  signature={renterSign}
                  onSave={data => handleFieldChange(isPickup ? 'pickupRenterSignature' : 'dropOffRenterSignature', data)}
                  onClear={() => handleFieldChange(isPickup ? 'pickupRenterSignature' : 'dropOffRenterSignature', undefined)}
                  disabled={!isEditable}
                  onPaper={!!localReservation[isPickup ? 'pickupSignOnPaper' : 'dropOffSignOnPaper']}
                />
                <SignatureBlock
                  title="Company representative"
                  signature={agentSign}
                  onSave={data => handleFieldChange(isPickup ? 'pickupAgentSignature' : 'dropOffAgentSignature', data)}
                  onClear={() => handleFieldChange(isPickup ? 'pickupAgentSignature' : 'dropOffAgentSignature', undefined)}
                  disabled={!isEditable}
                  onPaper={!!localReservation[isPickup ? 'pickupSignOnPaper' : 'dropOffSignOnPaper']}
                >
                  <div className="mb-3">
                    {renderTextField('Representative name', agentName || '', val => handleFieldChange(isPickup ? 'pickupAgentName' : 'dropOffAgentName', val), isEditable)}
                  </div>
                </SignatureBlock>
              </div>
            </StepSection>
          </div>
        );
    }
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

    const updateExchangeDamageMarker = (index: number, patch: Partial<DamageMarker>) => {
      if (!isEditable) return;
      const field = step === 'checkin' ? 'checkinDamageMarkers' : 'checkoutDamageMarkers';
      handleExchangeFieldChange(field, (currentExchange[field] || []).map((m, i) => (i === index ? { ...m, ...patch } : m)));
    };

    const isIn = step === 'checkin';

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 shadow-sm">
          <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${isIn ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>1 · Return current car</span>
          <span className="text-slate-300">→</span>
          <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${!isIn ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>2 · Hand over new car</span>
        </div>
        <div className="space-y-4">
          <div>
            <StepSection title={isIn ? 'Current car inspection' : 'New car inspection'}>
              <ChecklistGrid items={checklistItems} checked={checklist} disabled={!isEditable}
                onToggle={(item, v) => handleExchangeFieldChange(isIn ? 'checkinChecklist' : 'checkoutChecklist', { ...checklist, [item]: v })} />
            </StepSection>
          </div>
          <div>
            <StepSection title="Fuel, mileage & details">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FuelGauge level={fuelLevel} disabled={!isEditable}
                  onLevelChange={level => handleExchangeFieldChange(isIn ? 'checkinFuelLevel' : 'checkoutFuelLevel', level)}
                  pickupLevel={isIn ? localReservation.pickupFuelLevel : undefined} />
                {renderKmField({ label: isIn ? 'Odometer in (current car)' : 'Odometer out (new car)', value: isIn ? currentExchange.checkinKmIn : currentExchange.checkoutKmOut, onChange: v => handleExchangeFieldChange(isIn ? 'checkinKmIn' : 'checkoutKmOut', v), editable: isEditable, reference: isIn ? localReservation.pickupKmOut : undefined, referenceLabel: isIn ? 'Out' : undefined, placeholder: isIn ? 'Returning reading' : 'Starting reading' })}
                {isIn ? (
                  <div>
                    <label className={labelCls}><Bi en="Reason for exchange" /></label>
                    <textarea value={currentExchange.reason || ''} onChange={e => handleExchangeFieldChange('reason', e.target.value)} rows={2} className={areaCls} required disabled={!isEditable} />
                  </div>
                ) : (
                  <div>
                    <label className={labelCls}><Bi en="New car license plate" /></label>
                    <input value={currentExchange.newCarLicensePlate || ''} onChange={e => handleExchangeFieldChange('newCarLicensePlate', e.target.value)} className={inputCls} required disabled={!isEditable} />
                  </div>
                )}
              </div>
            </StepSection>
          </div>
        </div>
        <StepSection title="Damage report">
          <DamageBoard markers={damageMarkers} priorMarkers={isIn ? localReservation.pickupDamageMarkers || [] : undefined}
            editable={isEditable} onMark={handleExchangeDamageMark} onRemove={removeExchangeDamageMarker} onUpdate={updateExchangeDamageMarker} />
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

  // ====================== COUNTER WORKFLOW (navigation only) ======================
  // Which flow the check-in tab is showing; mirrors the branches of the original layout.
  const dropoffFlow: 'selection' | 'exchange' | 'return' =
    processType === 'selection' && !localReservation.dropOffCompleted ? 'selection' : processType === 'exchange' ? 'exchange' : 'return';
  const isWizard = viewMode === 'pickup' || dropoffFlow === 'return';

  // Completion states, derived from data already in state. They mirror the checks in handleSubmit.
  // The email is required (the signed documents are emailed to the customer) and must be valid.
  const { valid: emailValid, hint: emailHint } = emailCheck(localReservation.customerEmail);
  const countChecked = (c?: { [item: string]: boolean }) => countTicked(checklistItems, c);
  const kmOutValid = kmOutOk(localReservation);
  const kmInValid = kmInOk(localReservation);
  const pickupAuthOk = !payUnset;
  // Recorded or not, these never block check-out; the payment step lists what can still be added.
  const payDetailsMissing = [!counterMethodOk && 'payment method', !pay.depositHeld && 'deposit hold'].filter(Boolean).join(' and ');
  // Authorisation codes are optional; the payment step only flags them as not recorded.
  const authMissing = (isPayOnArrival || (pay.toCollect > 0 && localReservation.paymentMethod === 'card')) && !localReservation.authNumber?.trim();
  const authNote = [authMissing && 'payment auth code', pay.depositAuthMissing && 'deposit pre-auth code'].filter(Boolean).join(' and ');
  const chargesValid = chargesOk(charges);

  type FlowStep = { key: string; label: string; done: boolean; hint?: string };
  const pickupClosed = !!localReservation.voucherSubmitted;
  const dropoffClosed = !!localReservation.dropOffCompleted;
  const pickupSteps: FlowStep[] = [
    { key: 'customer', label: 'Customer & documents', done: pickupClosed || emailValid, hint: emailValid ? undefined : emailHint },
    { key: 'vehicle', label: 'Vehicle', done: pickupClosed || !!localReservation.licensePlate?.trim(), hint: 'License plate required' },
    { key: 'inspection', label: 'Inspection checklist', done: pickupClosed || countChecked(localReservation.pickupChecklist) === checklistItems.length, hint: `${countChecked(localReservation.pickupChecklist)} of ${checklistItems.length} confirmed` },
    { key: 'damage', label: 'Damage', done: pickupClosed || !!visited['pickup:damage'], hint: `${(localReservation.pickupDamageMarkers || []).length} marked` },
    { key: 'fuel', label: 'Fuel & mileage', done: pickupClosed || (kmOutValid && localReservation.pickupFuelLevel !== undefined), hint: kmOutValid ? 'Fuel level not set' : 'Odometer out required' },
    { key: 'payment', label: 'Charges & payment', done: pickupClosed || (pickupAuthOk && !!visited['pickup:payment']), hint: payUnset ? 'Choose prepaid or pay on arrival' : `${formatCurrency(pay.toCollect)} to collect · deposit ${pay.deposit <= 0 ? 'none' : pay.depositHeld ? 'held' : 'not recorded'}${payDetailsMissing || authNote ? ` · no ${[payDetailsMissing, authNote].filter(Boolean).join(', ')} yet (optional)` : ''}` },
    { key: 'signatures', label: 'Signatures', done: pickupClosed || signedCount(localReservation.pickupRenterSignature, localReservation.pickupAgentSignature) === 2 || !!localReservation.pickupSignOnPaper,
      hint: localReservation.pickupSignOnPaper && signedCount(localReservation.pickupRenterSignature, localReservation.pickupAgentSignature) < 2 ? 'Signed on the printed copy' : `${signedCount(localReservation.pickupRenterSignature, localReservation.pickupAgentSignature)} of 2 signed · optional` },
  ];
  const dropoffSteps: FlowStep[] = [
    { key: 'return', label: 'Return details', done: dropoffClosed || (emailValid && !!visited['dropoff:return']), hint: emailValid ? undefined : `Customer ${emailHint.toLowerCase()}` },
    { key: 'inspection', label: 'Inspection', done: dropoffClosed || countChecked(localReservation.dropOffChecklist) === checklistItems.length, hint: `${countChecked(localReservation.dropOffChecklist)} of ${checklistItems.length} confirmed` },
    { key: 'damage', label: 'Damage', done: dropoffClosed || !!visited['dropoff:damage'], hint: `${(localReservation.dropOffDamageMarkers || []).length} new marked` },
    { key: 'fuel', label: 'Fuel & mileage', done: dropoffClosed || (kmInValid && localReservation.dropOffFuelLevel !== undefined), hint: kmInValid ? 'Fuel level not set' : 'Odometer in required' },
    { key: 'charges', label: 'Return charges', done: dropoffClosed || (chargesValid && !!visited['dropoff:charges']), hint: charges.items.length ? `${charges.items.length} charge${charges.items.length === 1 ? '' : 's'} · ${formatMoney(chargesTotal(charges.items), charges.currency)}` : 'No charges' },
    { key: 'signatures', label: 'Signatures', done: dropoffClosed || signedCount(localReservation.dropOffRenterSignature, localReservation.dropOffAgentSignature) === 2 || !!localReservation.dropOffSignOnPaper,
      hint: localReservation.dropOffSignOnPaper && signedCount(localReservation.dropOffRenterSignature, localReservation.dropOffAgentSignature) < 2 ? 'Signed on the printed copy' : `${signedCount(localReservation.dropOffRenterSignature, localReservation.dropOffAgentSignature)} of 2 signed · optional` },
  ];
  const flowSteps = viewMode === 'pickup' ? pickupSteps : dropoffSteps;
  const activeIndex = Math.min(step, flowSteps.length - 1);
  const activeKey = flowSteps[activeIndex]?.key;
  const visitedKey = `${viewMode}:${activeKey}`;
  useEffect(() => {
    if (!isWizard || showSuccessOverlay) return;
    setVisited(prev => (prev[visitedKey] ? prev : { ...prev, [visitedKey]: true }));
  }, [visitedKey, isWizard, showSuccessOverlay]);

  const toRail = (list: FlowStep[]): WorkflowStep[] => list.map(s => ({
    key: s.key, label: s.label, hint: s.hint,
    status: s.done ? 'done' : (attempted || visited[`${viewMode}:${s.key}`]) ? 'incomplete' : 'pending',
  }));

  const goToStep = (i: number) => {
    setStep(Math.max(0, Math.min(i, flowSteps.length - 1)));
    centerRef.current?.scrollTo({ top: 0 });
  };

  // Same order as the checks in handleSubmit, so the step we jump to matches the alert shown.
  const nextMissingStep = (): string | undefined => firstMissingStep(viewMode, localReservation, pickupAuthOk, charges);

  const handleComplete = () => {
    const missing = nextMissingStep();
    if (missing) {
      setAttempted(true);
      const idx = flowSteps.findIndex(s => s.key === missing);
      if (idx >= 0) goToStep(idx);
    }
    handleSubmit();
  };

  // Signatures are optional here too (they can be taken on the printed agreement).
  const exchangeNextAllowed = !!currentExchange.reason && !hasOutstandingTickets && !hasDueExtension;
  const exchangeRail: WorkflowStep[] = [
    { key: 'checkin', label: 'Return current car', hint: `${signedCount(currentExchange.checkinRenterSignature, currentExchange.checkinAgentSignature)} of 2 signed · optional`, status: currentExchange.reason?.trim() ? 'done' : 'pending' },
    { key: 'checkout', label: 'Hand over new car', hint: exchangeNextAllowed ? 'New plate · signatures optional' : 'Finish the return first', enabled: exchangeNextAllowed || exchangeStep === 'checkout',
      status: currentExchange.newCarLicensePlate?.trim() ? 'done' : exchangeStep === 'checkout' ? 'incomplete' : 'pending' },
  ];
  const selectExchangeStep = (i: number) => {
    if (i === 0) setExchangeStep('checkin');
    else if (exchangeNextAllowed) setExchangeStep('checkout');
    centerRef.current?.scrollTo({ top: 0 });
  };

  const railSteps: WorkflowStep[] = isWizard ? toRail(flowSteps) : dropoffFlow === 'exchange' ? exchangeRail : [];
  const railActive = isWizard ? activeIndex : exchangeStep === 'checkin' ? 0 : 1;
  const railSelect = isWizard ? goToStep : selectExchangeStep;
  const railTitle = viewMode === 'pickup' ? 'Check-out' : dropoffFlow === 'exchange' ? 'Vehicle exchange' : 'Check-in';
  const canComplete = viewMode === 'pickup' ? isPickupEditable : (dropoffFlow === 'return' && isDropoffEditable);
  const isLastStep = activeIndex === flowSteps.length - 1;

  // ---------- step content (sections moved from the old single-page layout) ----------
  const renderCustomerStep = (stepNo: number) => (
    <StepSection step={stepNo} title="Customer & documents" subtitle="Confirm the renter and where the signed agreement is sent">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-center shrink-0">
            {(reservation.personName || '?').split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 truncate">{reservation.personName}</p>
            <p className="text-xs text-slate-500 tabular-nums">{reservation.contactNumber || 'No phone'}</p>
            <div className="mt-2">{renderTextField('Email *', localReservation.customerEmail || '', val => handleFieldChange('customerEmail', val), isPickupEditable || canAmend, true)}</div>
          </div>
        </div>
        <div className="space-y-2.5 min-w-0">
          <InfoPair label="Booking" value={<span className="font-mono">#{reservation.bookingId || 'N/A'}</span>} />
          <InfoPair label="Source" value={reservation.source} />
          {isPickupEditable || canAmend ? (
            <>
              {/* After check-out the times can still be corrected; saved with "Save changes". */}
              <TimeEditRow label="Pickup" value={localReservation.startDate} original={canAmend ? savedBase.startDate : reservation.startDate} onChange={t => setPickupTime(t)} />
              <TimeEditRow label="Return" value={localReservation.endDate} original={canAmend ? savedBase.endDate : reservation.endDate} onChange={t => setReturnTime(t)}
                error={timesInvalid ? 'Return must be after the pickup' : undefined} />
            </>
          ) : (
            <>
              <InfoPair label="Pickup" value={fmtDateTime(localReservation.startDate)} />
              <InfoPair label="Return" value={fmtDateTime(localReservation.endDate)} />
            </>
          )}
          <InfoPair label="Duration" value={`${rentalDays} day${rentalDays === 1 ? '' : 's'}`} />
          <InfoPair label="Location" value={`${location?.name || reservation.locationName || 'Location not set'}${location?.address ? ` — ${location.address}` : ''}`} />
        </div>
      </div>
      <DriverDetailsForm
        driver={localReservation.driver || {}}
        additionalDrivers={localReservation.additionalDrivers || []}
        editable={isPickupEditable || canAmend}
        rentalEnd={localReservation.endDate}
        onChange={d => handleFieldChange('driver', d)}
        onChangeAdditional={list => handleFieldChange('additionalDrivers', list)}
      />
    </StepSection>
  );

  const renderVehicleStep = (stepNo: number) => (
    <StepSection step={stepNo} title="Vehicle" subtitle="The car being handed over on this agreement">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <CarShowcase fleet={fleet} plate={localReservation.licensePlate} model={localReservation.carModel} size="lg" />
        <div className="space-y-2.5 text-[13px] min-w-0">
          {isPickupEditable ? (
            <>
              {fleet && fleet.length > 0 ? (
                <>
                  <VehiclePicker fleet={fleet} booking={localReservation} allData={allData} onPick={pickCar} />
                  {/* Picking a fleet car fills these; staff can still type the model and plate by hand. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className={labelCls}><Bi en="Model" /></label>
                      <input type="text" value={localReservation.carModel || ''} onChange={e => handleFieldChange('carModel', e.target.value)} className={inputCls} placeholder="Vehicle model" />
                    </div>
                    <div>
                      <label className={labelCls}><Bi en="License plate" /> <span className="text-rose-500">*</span></label>
                      <input type="text" value={localReservation.licensePlate || ''} onChange={e => handleFieldChange('licensePlate', e.target.value.toUpperCase())} className={`${inputCls} font-mono uppercase`} placeholder="Plate number" />
                    </div>
                  </div>
                  {((localReservation.carModel || '') !== (reservation.carModel || '') || (localReservation.licensePlate || '') !== (reservation.licensePlate || '')) && (reservation.carModel || reservation.licensePlate) && (
                    <p className="text-[11px] text-sky-700">Changed from {reservation.carModel}{reservation.licensePlate ? ` · ${reservation.licensePlate}` : ''}. The deposit and excess follow the new car.</p>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className={labelCls}><Bi en="Model" /></label>
                    <input type="text" value={localReservation.carModel || ''} onChange={e => handleFieldChange('carModel', e.target.value)} className={inputCls} placeholder="Vehicle model" />
                  </div>
                  <div>
                    <label className={labelCls}><Bi en="License plate" /></label>
                    <input type="text" value={localReservation.licensePlate || ''} onChange={e => handleFieldChange('licensePlate', e.target.value.toUpperCase())} className={`${inputCls} font-mono uppercase`} placeholder="Plate number" />
                  </div>
                </>
              )}
              {onUpgrade && fleet && fleet.length > 0 && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2.5 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-600 min-w-0">Customer wants a better car? Upgrade it here, free or with a supplement.{(localReservation.upgradeHistory || []).length ? ` Upgraded ${localReservation.upgradeHistory!.length}× already.` : ''}</p>
                  <Button size="sm" variant="primary" onClick={() => (canUpgrade ? setShowUpgrade(true) : alert(NO_UPGRADE_ACCESS))}>Upgrade vehicle</Button>
                </div>
              )}
            </>
          ) : canAmend ? renderCarCorrection() : (
            <>
              <InfoPair label="Model" value={localReservation.carModel} />
              <InfoPair label="License plate" value={<span className="font-mono">{localReservation.licensePlate || '—'}</span>} />
            </>
          )}
        </div>
      </div>
    </StepSection>
  );

  /** The car on a checked-out or closed agreement, editable to correct a wrong model or plate. */
  const renderCarCorrection = () => {
    const changed = (localReservation.carModel || '') !== (savedBase.carModel || '') || (localReservation.licensePlate || '') !== (savedBase.licensePlate || '');
    const cars = (fleet || []).filter(c => c.licensePlate || c.modelName);
    const current = cars.find(c => c.licensePlate && c.licensePlate === localReservation.licensePlate);
    return (
      <div className="space-y-2.5">
        {cars.length > 0 && (
          <div>
            <label className={labelCls}><Bi en="Car from the fleet" /></label>
            <select className={inputCls} value={current?.id || ''} aria-label="Car from the fleet"
              onChange={e => { const car = cars.find(c => c.id === e.target.value); if (car) correctCar(car); }}>
              <option value="">{current ? '' : 'Choose a car…'}</option>
              {cars.map(c => <option key={c.id} value={c.id}>{c.modelName || 'Car'}{c.licensePlate ? ` · ${c.licensePlate}` : ''}{c.sippCode ? ` (${c.sippCode})` : ''}</option>)}
            </select>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className={labelCls}><Bi en="Model" /></label>
            <input type="text" value={localReservation.carModel || ''} onChange={e => handleFieldChange('carModel', e.target.value)} className={inputCls} placeholder="Vehicle model" />
          </div>
          <div>
            <label className={labelCls}><Bi en="License plate" /></label>
            <input type="text" value={localReservation.licensePlate || ''} onChange={e => handleFieldChange('licensePlate', e.target.value.toUpperCase())} className={`${inputCls} font-mono uppercase`} placeholder="Plate number" />
          </div>
        </div>
        <p className={`text-[11px] ${changed ? 'text-sky-700' : 'text-slate-500'}`}>
          {changed
            ? <>Changed from {savedBase.carModel || '—'}{savedBase.licensePlate ? ` · ${savedBase.licensePlate}` : ''}. Click <b>Save changes</b> to update the agreement; prices and the deposit stay as they are.</>
            : <>To correct a wrong car type or plate on this agreement. {!localReservation.dropOffCompleted ? 'For a real car swap during the rental use Check-in / exchange.' : ''}</>}
        </p>
      </div>
    );
  };

  const renderChargesBreakdown = () => (
    <>
      <InfoPair label={`Rental (${rentalDays} day${rentalDays === 1 ? '' : 's'})`} value={isPrepaidBooking
        ? <span className="inline-flex items-center gap-1.5"><Badge tone="success">Prepaid</Badge>{formatCurrency(pay.rental)}</span>
        : formatCurrency(pay.rental)} />
      {(localReservation.extras || []).map((ex, i) => (
        <InfoPair key={i} label={ex.name} value={ex.isComplementary ? 'Included' : formatCurrency(ex.dailyPrice * rentalDays)} />
      ))}
      {pay.upgrades > 0 && <InfoPair label="Vehicle upgrade" value={formatCurrency(pay.upgrades)} />}
      <div className="border-t border-slate-200 pt-2.5 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-slate-900">Total</span>
        <span className="text-xl font-semibold text-slate-900 tabular-nums">{formatCurrency(pay.total)}</span>
      </div>
      {isPrepaidBooking && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5">
          <div className="flex justify-between gap-3 text-xs"><span className="text-slate-600">Paid in advance{sourceOf(localReservation, sources) ? ` via ${sourceOf(localReservation, sources)!.name}` : ''}</span><span className="font-semibold tabular-nums text-emerald-700">− {formatCurrency(pay.rental)}</span></div>
          <div className="flex justify-between gap-3 text-[13px] border-t border-slate-200 pt-1.5"><span className="font-semibold text-slate-800">To collect at the counter</span><span className="font-semibold tabular-nums text-slate-900">{formatCurrency(pay.toCollect)}</span></div>
        </div>
      )}
      {charges.items.length > 0 && (
        <div className="rounded-lg bg-rose-50/50 border border-rose-200 p-3 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">Return charges{charges.settlement ? ` · ${charges.settlement === 'paid' ? 'paid' : 'claim'}` : ''}</p>
          {charges.items.map(i => (
            <div key={i.id} className="flex justify-between gap-3 text-xs"><span className="text-slate-600 truncate">{CHARGE_KIND_LABEL[i.kind]}</span><span className="font-semibold tabular-nums text-slate-900">{formatMoney(i.amount, charges.currency)}</span></div>
          ))}
          <div className="flex justify-between text-[13px] border-t border-rose-200 pt-1.5"><span className="font-semibold text-slate-800">Total</span><span className="font-semibold tabular-nums text-rose-700">{formatMoney(chargesTotal(charges.items), charges.currency)}</span></div>
        </div>
      )}
      <InfoPair label="Security deposit" value={formatCurrency(localReservation.securityDeposit || 0)} />
      <InfoPair label="Excess" value={formatCurrency(localReservation.excess || 0)} />
      <InfoPair label="Payment type" value={payType
        ? <Badge tone={isPayOnArrival ? 'warning' : 'success'}>{PAYMENT_LABEL[payType]}</Badge>
        : payUnset ? <Badge tone="danger">Not chosen</Badge> : undefined} />
    </>
  );

  // What the counter has to do about payment for this booking.
  const extrasCharged = (localReservation.extras || []).reduce((s2, e) => (e.isComplementary ? s2 : s2 + e.dailyPrice * rentalDays), 0);
  const renderPaymentAction = () => {
    const src = sourceOf(localReservation, sources);
    const deposit = localReservation.securityDeposit || 0;
    const box = (tone: 'ok' | 'warn' | 'bad', title: React.ReactNode, lines: React.ReactNode[]) => (
      <div className={`rounded-lg border px-4 py-3 ${tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
        <p className="text-[13px] font-semibold">{title}</p>
        <ul className="mt-1 space-y-0.5 text-xs list-disc ps-4">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </div>
    );
    return (
      <div className="md:col-span-2 space-y-3">
        {src && src.paymentType === PaymentType.BOTH && paymentFromBooking && payType && (
          <p className="text-xs text-slate-500">
            Payment type set on the reservation{reservation.lastEditedBy || reservation.createdBy ? ` by ${reservation.lastEditedBy || reservation.createdBy}` : ''}: <b className="text-slate-800">{PAYMENT_LABEL[payType]}</b>. To change it, edit the reservation.
          </p>
        )}
        {src && src.paymentType === PaymentType.BOTH && !paymentFromBooking && (
          <PaymentChoice source={src} value={localReservation.paymentType} arabic disabled={!isPickupEditable}
            onChange={v => setLocalReservation(prev => ({ ...prev, paymentType: v, ...(v === PaymentType.PREPAID && !prev.paymentMethod ? { paymentMethod: 'prepaid' } : {}), ...(v === PaymentType.PAY_ON_ARRIVAL && prev.paymentMethod === 'prepaid' ? { paymentMethod: undefined } : {}) }))}
            error={payUnset && !!visited['pickup:payment'] ? 'Choose how this booking is paid before handing over the car.' : undefined} />
        )}
        {payUnset ? box('bad', <>Action needed: choose how this booking is paid <span className="ar-ui font-normal" dir="rtl">· اختر طريقة الدفع</span></>, [
            `${src?.name || 'This source'} sends both prepaid and pay-on-arrival bookings. Check the booking confirmation and choose above.`,
          ])
          : isPayOnArrival ? box('warn', <>Pay on arrival: collect {formatCurrency(pay.total)} now <span className="ar-ui font-normal" dir="rtl">· الدفع عند الاستلام</span></>, [
            <>Take payment for the rental{extrasCharged ? ', extras' : ''}{pay.upgrades ? ' and upgrade' : ''}: <b>{formatCurrency(pay.total)}</b>.</>,
            'Record the payment method, card last 4 digits and authorisation number now or later: none of them is needed to print or complete the agreement.',
            ...(deposit ? [<>Hold the refundable security deposit of <b>{formatCurrency(deposit)}</b>. How it is held can be recorded now or later.</>] : []),
          ])
          : payType ? box('ok', <>Prepaid{src ? ` via ${src.name}` : ''}: do not charge the rental again <span className="ar-ui font-normal" dir="rtl">· مدفوع مسبقاً</span></>, [
            <>The rental of <b>{formatCurrency(pay.rental)}</b> was paid to {src?.name || 'the partner'}. Do not charge it to the customer.</>,
            pay.toCollect > 0
              ? <>Collect only the extras{pay.upgrades ? ' and upgrade' : ''} added for this rental: <b>{formatCurrency(pay.toCollect)}</b>. Record the payment method (and the authorisation number for a card) now or later.</>
              : 'Nothing else to collect: no extras or upgrades.',
            ...(deposit ? [<>Hold the refundable security deposit of <b>{formatCurrency(deposit)}</b>. How it is held can be recorded now or later.</>] : []),
          ]) : null}
      </div>
    );
  };

  const renderPaymentStep = (stepNo: number) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
      {renderPaymentAction()}
      {(isPickupEditable || extrasOnRent || (localReservation.extras || []).length > 0) && (
        <div className="md:col-span-2">
          <StepSection title="Extras & add-ons" subtitle={isPickupEditable ? 'Add what the customer asks for at the counter: child seat, additional driver, GPS…' : extrasOnRent ? 'Add or remove extras during the rental. The booking total is updated when you save.' : 'Extras on this rental'}>
            <ExtrasEditor extras={localReservation.extras || []} catalogue={availableExtras} days={rentalDays} editable={isPickupEditable || extrasOnRent} onChange={setExtras} />
            {driverExtras > 0 && (
              <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
                <p className="text-[13px] font-semibold text-slate-900"><Bi en="Additional driver name" />{driverExtras > 1 ? 's' : ''}</p>
                {Array.from({ length: driverExtras }, (_, i) => (
                  <input key={i} className={inputCls} value={(localReservation.additionalDrivers || [])[i]?.name || ''}
                    onChange={e => setDriverName(i, e.target.value)} disabled={!(isPickupEditable || extrasOnRent || canAmend)}
                    placeholder={`Full name of additional driver${driverExtras > 1 ? ` ${i + 1}` : ''}`} aria-label={`Additional driver ${i + 1} name`} />
                ))}
                <p className="text-[11px] text-slate-500">Printed on the agreement. Licence number and date of birth: Renter step, under Additional drivers.</p>
              </div>
            )}
          </StepSection>
        </div>
      )}
      <StepSection step={stepNo} title="Charges" subtitle="Rental, extras, deposit and excess">
        <div className="space-y-2.5 text-[13px]">{renderChargesBreakdown()}</div>
      </StepSection>
      <InfoBlock title="Payment">
        <div>{isPrepaidBooking
          ? (pay.toCollect > 0 ? <Badge tone={counterMethodOk ? 'success' : 'warning'}>Prepaid rental · collect {formatCurrency(pay.toCollect)}{pay.upgrades ? (pay.extras ? " for extras and upgrade" : " for the upgrade") : " for extras"}</Badge> : <Badge tone="success">Prepaid · nothing to collect</Badge>)
          : <Badge tone={paid ? 'success' : 'warning'}>{paid ? 'Paid' : 'Not yet authorised'}</Badge>}</div>
        <div className={`rounded-lg border px-3 py-2.5 space-y-2 ${pay.deposit > 0 && !pay.depositHeld ? 'border-amber-300 bg-amber-50/70' : 'border-indigo-200 bg-indigo-50/60'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-slate-900"><Bi en="Security deposit" /></p>
              <p className="text-xs text-slate-500">{pay.deposit > 0 ? 'Hold it for every booking, prepaid or pay on arrival. Refundable: release it after the return inspection.' : 'No deposit for this car.'}{depositSource ? ` From the fleet: ${depositSource}.` : ''}</p>
            </div>
            <span className="text-base font-semibold tabular-nums text-slate-900 shrink-0">{formatCurrency(pay.deposit)}</span>
          </div>
          {pay.deposit > 0 && (isPickupEditable ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Held by</label>
                <select value={localReservation.depositHoldMethod || ''} onChange={e => handleFieldChange('depositHoldMethod', e.target.value || undefined)} className={inputCls}>
                  <option value="">Choose</option>
                  <option value="card">{DEPOSIT_HOLD_LABEL.card}</option>
                  <option value="cash">{DEPOSIT_HOLD_LABEL.cash}</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Pre-authorisation no. <span className="font-normal text-slate-400">optional</span></label>
                <input type="text" value={localReservation.depositAuthNumber || ''} disabled={localReservation.depositHoldMethod === 'cash'} onChange={e => handleFieldChange('depositAuthNumber', e.target.value || undefined)} className={`${inputCls} font-mono`} placeholder={localReservation.depositHoldMethod === 'cash' ? 'Not needed for cash' : 'Hold auth code'} />
              </div>
            </div>
          ) : (
            <>
              {canAmend && missingSaved('depositHoldMethod') && (
                <div>
                  <label className={labelCls}>Held by <span className="font-normal text-slate-400">optional</span></label>
                  <select value={localReservation.depositHoldMethod || ''} onChange={e => handleFieldChange('depositHoldMethod', e.target.value || undefined)} className={inputCls}>
                    <option value="">Choose</option>
                    <option value="card">{DEPOSIT_HOLD_LABEL.card}</option>
                    <option value="cash">{DEPOSIT_HOLD_LABEL.cash}</option>
                  </select>
                </div>
              )}
              <p className="text-xs text-slate-700">{localReservation.depositHoldMethod ? `Held by ${DEPOSIT_HOLD_LABEL[localReservation.depositHoldMethod].toLowerCase()}${localReservation.depositAuthNumber && !missingSaved('depositAuthNumber') ? ` · auth ${localReservation.depositAuthNumber}` : ''}` : 'Hold not recorded'}</p>
              {canAmend && localReservation.depositHoldMethod === 'card' && missingSaved('depositAuthNumber') && (
                <div>
                  <label className={labelCls}>Pre-authorisation no. <span className="font-normal text-slate-400">optional</span></label>
                  <input type="text" value={localReservation.depositAuthNumber || ''} onChange={e => handleFieldChange('depositAuthNumber', e.target.value || undefined)} className={`${inputCls} font-mono`} placeholder="Hold auth code" />
                </div>
              )}
            </>
          ))}
        </div>
        {isPickupEditable ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}><Bi en="Payment method" /></label>
                <select value={localReservation.paymentMethod || ''} onChange={e => handleFieldChange('paymentMethod', e.target.value || undefined)} className={inputCls}>
                  <option value="">Not set</option>
                  <option value="card">Card</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="prepaid">Prepaid by partner</option>
                </select>
              </div>
              <div>
                <label className={labelCls}><Bi en="Card last 4 digits" /></label>
                <input type="text" inputMode="numeric" maxLength={4} value={(localReservation.cardNumber || '').replace(/\D/g, '').slice(-4)}
                  onChange={e => handleFieldChange('cardNumber', e.target.value.replace(/\D/g, '').slice(0, 4) || undefined)} className={`${inputCls} font-mono tabular-nums`} placeholder="4421" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Authorisation number <span className="font-normal text-slate-400">optional</span></label>
              <input type="text" value={localReservation.authNumber || ''} onChange={e => handleFieldChange('authNumber', e.target.value)} className={`${inputCls} font-mono`} placeholder="Card terminal auth code" />
              {authMissing && <p className="mt-1 text-[11px] text-amber-700">Not recorded yet. Recommended for card payments; it can be added later.</p>}
            </div>
            <div>
              <label className={labelCls}><Bi en="Amount charged ($)" /></label>
              <input type="number" step="0.01" value={localReservation.finalAmountCharged || ''} onChange={e => handleFieldChange('finalAmountCharged', parseFloat(e.target.value) || undefined)} className={`${inputCls} tabular-nums`} placeholder={pay.toCollect.toFixed(2)} />
            </div>
          </>
        ) : (
          <>
            {canAmend && missingSaved('paymentMethod') ? (
              <div>
                <label className={labelCls}><Bi en="Payment method" /></label>
                <select value={localReservation.paymentMethod || ''} onChange={e => handleFieldChange('paymentMethod', e.target.value || undefined)} className={inputCls}>
                  <option value="">Not set</option>
                  <option value="card">Card</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="prepaid">Prepaid by partner</option>
                </select>
              </div>
            ) : <InfoPair label="Payment method" value={localReservation.paymentMethod ? ({ card: 'Card', cash: 'Cash', bank_transfer: 'Bank transfer', prepaid: 'Prepaid by partner' } as Record<string, string>)[localReservation.paymentMethod] : undefined} />}
            {canAmend && localReservation.paymentMethod === 'card' && missingSaved('cardNumber') && (
              <div>
                <label className={labelCls}><Bi en="Card last 4 digits" /></label>
                <input type="text" inputMode="numeric" maxLength={4} value={(localReservation.cardNumber || '').replace(/\D/g, '').slice(-4)}
                  onChange={e => handleFieldChange('cardNumber', e.target.value.replace(/\D/g, '').slice(0, 4) || undefined)} className={`${inputCls} font-mono tabular-nums`} placeholder="4421" />
              </div>
            )}
            {canAmend && missingSaved('authNumber') ? (
              <div>
                <label className={labelCls}>Authorisation number <span className="font-normal text-slate-400">optional</span></label>
                <input type="text" value={localReservation.authNumber || ''} onChange={e => handleFieldChange('authNumber', e.target.value)} className={`${inputCls} font-mono`} placeholder="Card terminal auth code" />
              </div>
            ) : <InfoPair label="Authorisation" value={localReservation.authNumber ? <span className="font-mono">{localReservation.authNumber}</span> : undefined} />}
            {canAmend && missingSaved('finalAmountCharged') ? (
              <div>
                <label className={labelCls}><Bi en="Amount charged ($)" /></label>
                <input type="number" step="0.01" value={localReservation.finalAmountCharged || ''} onChange={e => handleFieldChange('finalAmountCharged', parseFloat(e.target.value) || undefined)} className={`${inputCls} tabular-nums`} placeholder={pay.toCollect.toFixed(2)} />
              </div>
            ) : <InfoPair label="Amount charged" value={localReservation.finalAmountCharged ? formatCurrency(localReservation.finalAmountCharged) : undefined} />}
          </>
        )}
      </InfoBlock>
    </div>
  );

  const renderReturnDetailsStep = (stepNo: number) => (
    <StepSection step={stepNo} title="Return details" subtitle="Who is returning the car and how it left">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2.5 min-w-0">
          <SectionLabel><Bi en="Renter" /></SectionLabel>
          <InfoPair label="Name" value={reservation.personName} />
          <InfoPair label="Phone" value={reservation.contactNumber} />
          {renderTextField('Email *', localReservation.customerEmail || '', val => handleFieldChange('customerEmail', val), isPickupEditable || canAmend, true)}
          <SectionLabel className="pt-2"><Bi en="Vehicle" /></SectionLabel>
          <InfoPair label="Model" value={localReservation.carModel} />
          <InfoPair label="License plate" value={<span className="font-mono">{localReservation.licensePlate || '—'}</span>} />
        </div>
        <div className="space-y-2.5 min-w-0">
          <SectionLabel><Bi en="Timing" /></SectionLabel>
          <InfoPair label="Checked out" value={localReservation.pickupDateTime || fmtDateTime(localReservation.startDate)} />
          <InfoPair label="Scheduled return" value={fmtDateTime(localReservation.endDate)} />
          <InfoPair label="Returned" value={localReservation.dropOffDateTime} />
          <SectionLabel className="pt-2"><Bi en="At check-out" /></SectionLabel>
          <InfoPair label="Odometer out" value={localReservation.pickupKmOut !== undefined ? `${localReservation.pickupKmOut.toLocaleString()} km` : undefined} />
          <InfoPair label="Fuel out" value={localReservation.pickupFuelLevel !== undefined ? `${localReservation.pickupFuelLevel}/8` : undefined} />
          <InfoPair label="Damage recorded" value={`${(localReservation.pickupDamageMarkers || []).length}`} />
        </div>
      </div>
    </StepSection>
  );

  const renderWizardStep = () => {
    const n = activeIndex + 1;
    if (viewMode === 'pickup') {
      switch (activeKey) {
        case 'customer': return renderCustomerStep(n);
        case 'vehicle': return renderVehicleStep(n);
        case 'inspection': return renderCheckSection('pickup', 'inspection', n);
        case 'damage': return renderCheckSection('pickup', 'damage', n);
        case 'fuel': return renderCheckSection('pickup', 'fuel', n);
        case 'payment': return renderPaymentStep(n);
        default: return renderCheckSection('pickup', 'signatures', n);
      }
    }
    switch (activeKey) {
      case 'return': return renderReturnDetailsStep(n);
      case 'inspection': return renderCheckSection('dropoff', 'inspection', n);
      case 'damage': return renderCheckSection('dropoff', 'damage', n);
      case 'fuel': return renderCheckSection('dropoff', 'fuel', n);
      case 'charges': return renderCheckSection('dropoff', 'charges', n);
      default: return renderCheckSection('dropoff', 'signatures', n);
    }
  };

  // ---------- sticky rental summary (right column on desktop, collapsible on phones) ----------
  const renderSummary = () => (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-clip min-w-0">
        <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900"><Bi en="Rental summary" block /></h3>
          <Badge tone={localReservation.dropOffCompleted ? 'success' : localReservation.voucherSubmitted ? 'info' : 'muted'}><Bi en={localReservation.dropOffCompleted ? 'Closed' : localReservation.voucherSubmitted ? 'On rent' : 'Reserved'} className="!text-current" /></Badge>
        </header>
        <div className="divide-y divide-slate-100 text-[13px]">
          <div className="p-4 space-y-1 min-w-0">
            <SectionLabel><Bi en="Renter" /></SectionLabel>
            <p className="font-semibold text-slate-900 truncate">{reservation.personName}</p>
            <p className="text-xs text-slate-500 tabular-nums">{reservation.contactNumber || 'No phone'}</p>
            <p className="text-xs text-slate-500 break-all">{localReservation.customerEmail || 'No email'}</p>
          </div>
          <div className="p-3 min-w-0">
            <CarShowcase fleet={fleet} plate={localReservation.licensePlate} model={localReservation.carModel} />
          </div>
          <div className="p-4 space-y-2">
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="w-0.5 h-8 bg-slate-200" />
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              </div>
              <div className="space-y-2 min-w-0 flex-1">
                <div><SectionLabel><Bi en="Pickup" /></SectionLabel><p className="text-[13px] font-medium text-slate-900 tabular-nums">{fmtDateTime(localReservation.startDate)}</p></div>
                <div><SectionLabel><Bi en="Return" /></SectionLabel><p className="text-[13px] font-medium text-slate-900 tabular-nums">{fmtDateTime(localReservation.endDate)}</p></div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xl font-semibold text-slate-900 tabular-nums">{rentalDays}</p>
                <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">day{rentalDays === 1 ? '' : 's'}</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 truncate flex items-center gap-1"><svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg><span className="truncate">{location?.name || reservation.locationName || 'Location not set'}{location?.address ? ` — ${location.address}` : ''}</span></p>
          </div>
          <div className="p-4 space-y-2.5">{renderChargesBreakdown()}</div>
          <div className="p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2"><SectionLabel><Bi en="Payment" /></SectionLabel>{payType === PaymentType.PREPAID ? <Badge tone="success">Prepaid</Badge> : payUnset ? <Badge tone="danger">Choose type</Badge> : <Badge tone={paid ? 'success' : 'warning'}>{paid ? 'Paid' : 'Not yet authorised'}</Badge>}</div>
            <InfoPair label="Authorisation" value={localReservation.authNumber ? <span className="font-mono">{localReservation.authNumber}</span> : undefined} />
            <InfoPair label="Amount charged" value={localReservation.finalAmountCharged ? formatCurrency(localReservation.finalAmountCharged) : undefined} />
          </div>
          <div className="p-4 space-y-2.5">
            <InfoPair label="Odometer out" value={localReservation.pickupKmOut !== undefined ? `${localReservation.pickupKmOut.toLocaleString()} km` : undefined} />
            {localReservation.dropOffKmIn !== undefined && <InfoPair label="Odometer in" value={`${localReservation.dropOffKmIn.toLocaleString()} km`} />}
            {localReservation.dropOffKmIn && localReservation.pickupKmOut && localReservation.dropOffKmIn > localReservation.pickupKmOut && (
              <InfoPair label="Distance driven" value={`${(localReservation.dropOffKmIn - localReservation.pickupKmOut).toLocaleString()} km`} />
            )}
            <InfoPair label="Fuel out / in" value={`${localReservation.pickupFuelLevel ?? '—'}/8 → ${localReservation.dropOffFuelLevel ?? '—'}/8`} />
          </div>
        </div>
      </section>
      <div className="text-center text-[11px] text-slate-400 px-2">
        <p className="font-semibold text-slate-500">{companyDetails.name}</p>
        <p>{companyDetails.address} · {companyDetails.phone}</p>
      </div>
    </div>
  );

  const printButtons = (
    <div className="flex items-center gap-2">
      {amendDirty && (
        <Button variant="primary" onClick={saveAmendments} disabled={amendBusy} icon={CHECK_ICON}>
          {amendBusy ? 'Sending…' : 'Save changes'}
        </Button>
      )}
      {canAmend && !amendDirty && (
        <Button variant="secondary" onClick={resendDocuments} disabled={amendBusy} icon={<MailIcon className="w-4 h-4" />}>
          {amendBusy ? 'Sending…' : 'Email documents'}
        </Button>
      )}
      {localReservation.dropOffCompleted && (
        <Button variant="secondary" onClick={handlePrintTermination} icon={<PdfIcon className="w-4 h-4" />}>
          Termination
        </Button>
      )}
      <Button variant={(isWizard && (!isLastStep || canComplete)) || amendDirty ? 'secondary' : 'primary'} onClick={handleDownloadVoucherPDF} icon={<PdfIcon className="w-4 h-4" />}>
        Print agreement
      </Button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50" role="dialog" aria-modal="true">
      <div className="relative bg-slate-50 rounded-none sm:rounded-xl shadow-2xl max-w-7xl w-full h-[100dvh] sm:h-[96vh] max-h-[100dvh] sm:max-h-[96vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 sm:px-5 py-3.5 flex items-center gap-4">
          <img src={URDRIVE_LOGO_B64} alt={companyDetails.name} className="h-6 hidden sm:block" />
          <div className="hidden sm:block w-px h-8 bg-slate-200" />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-slate-900 truncate flex items-center gap-2">Rental agreement<span lang="ar" dir="rtl" className="ar-ui !text-[15px] !text-slate-700">عقد الإيجار</span>{localReservation.awaitingConfirmation && <Badge tone="warning">Awaiting confirmation</Badge>}</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate"><span className="font-mono">#{reservation.bookingId || 'N/A'}</span> · {reservation.personName}</p>
          </div>
          {/* progress */}
          <ol className="hidden md:flex items-center gap-2">
            {steps.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 text-xs font-semibold ${s.done ? 'text-emerald-700' : 'text-slate-400'}`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center ${s.done ? 'bg-emerald-600 text-white' : 'border border-slate-300'}`}>{s.done && CHECK_ICON}</span>
                  <Bi en={s.label} className="!text-current opacity-75" />
                </span>
                {i < steps.length - 1 && <span className={`w-6 h-px ${steps[i + 1].done ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
              </li>
            ))}
          </ol>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Mode switch */}
        <div className="flex-shrink-0 bg-white border-b border-slate-200 px-2 sm:px-3">
          <div className="flex gap-0.5 overflow-x-auto no-scrollbar" role="tablist">
            {([
              { key: 'pickup', label: 'Check-out', hint: localReservation.voucherSubmitted ? 'Completed' : 'Hand over the car', disabled: false, done: !!localReservation.voucherSubmitted },
              { key: 'dropoff', label: 'Check-in / exchange', hint: localReservation.dropOffCompleted ? 'Completed' : localReservation.voucherSubmitted ? 'Receive the car' : 'Available after check-out', disabled: !localReservation.voucherSubmitted, done: !!localReservation.dropOffCompleted },
            ] as const).map(t => (
              <button key={t.key} role="tab" aria-selected={viewMode === t.key} onClick={() => setViewMode(t.key)} disabled={t.disabled}
                className={`px-3 py-2.5 text-left whitespace-nowrap border-b-2 -mb-px transition-colors ${viewMode === t.key ? 'border-indigo-600' : 'border-transparent'} ${t.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                <span className={`flex items-center gap-1.5 text-[13px] font-medium ${viewMode === t.key ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-800'}`}><Bi en={t.label} />{t.done && <span className="text-emerald-600">{CHECK_ICON}</span>}</span>
                <span className="block text-[11px] text-slate-400"><Bi en={t.hint} /></span>
              </button>
            ))}
          </div>
        </div>

        {/* Compact progress for phones and tablets */}
        {railSteps.length > 0 && (
          <div className="flex-shrink-0 lg:hidden">
            <MobileStepBar steps={railSteps} active={railActive} onSelect={railSelect} />
          </div>
        )}

        <div className="flex-1 min-h-0 flex">
          {/* Left: step rail */}
          {railSteps.length > 0 && (
            <aside className="hidden lg:block w-60 shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
              <StepRail title={railTitle} steps={railSteps} active={railActive} onSelect={railSelect} />
            </aside>
          )}

          {/* Center: active step */}
          <div ref={centerRef} className="flex-1 min-w-0 overflow-y-auto">
            <div id="voucher-print-area" className="p-3 sm:p-5 space-y-4">
              {restoredDraftAt && (
                <div className="no-print rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] text-sky-900"><b>Unfinished work restored.</b> The details entered on {draftTime(restoredDraftAt)} were kept. Continue where you left off.</p>
                  <span className="flex gap-2">
                    <button type="button" onClick={() => setRestoredDraftAt(null)} className="h-8 px-3 rounded-md text-[13px] font-medium text-sky-900 hover:bg-sky-100">OK</button>
                    <button type="button" onClick={discardDraft} className="h-8 px-3 rounded-md text-[13px] font-medium text-rose-700 hover:bg-rose-50">Discard and start over</button>
                  </span>
                </div>
              )}
              <details className="lg:hidden bg-white rounded-xl border border-slate-200 shadow-sm overflow-clip group">
                <summary className="px-4 py-3 flex items-center gap-3 cursor-pointer list-none">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-slate-900 truncate">{localReservation.carModel || 'Vehicle'} · {reservation.personName}</p>
                    <p className="text-xs text-slate-500 tabular-nums truncate">{rentalDays} day{rentalDays === 1 ? '' : 's'} · {formatCurrency(totalCost)}{charges.items.length > 0 ? ` · charges ${formatMoney(chargesTotal(charges.items), charges.currency)}` : ''}</p>
                  </div>
                  <Plate value={localReservation.licensePlate || 'NO PLATE'} />
                  <svg className="w-4 h-4 text-slate-400 shrink-0 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </summary>
                <div className="border-t border-slate-200 p-3 bg-slate-50">{renderSummary()}</div>
              </details>

              {viewMode === 'pickup' && renderWizardStep()}
              {viewMode === 'dropoff' && (
                <>
                  {hasDueExtension && (
                    <div className="flex items-start gap-2.5 p-3 rounded-lg text-[13px] bg-amber-50 border border-amber-200 text-amber-900" role="alert">
                      <ShieldExclamationIcon className="w-5 h-5 shrink-0" />
                      <div><p className="font-semibold">Unpaid extension: {formatCurrency(dueForExtension)}</p><p className="text-xs">Collect the balance before the car can be checked in.</p></div>
                    </div>
                  )}
                  {hasOutstandingTickets && (
                    <div className="flex items-start gap-2.5 p-3 rounded-lg text-[13px] bg-rose-50 border border-rose-200 text-rose-900" role="alert">
                      <ShieldExclamationIcon className="w-5 h-5 shrink-0" />
                      <div><p className="font-semibold">Outstanding traffic tickets: {totalTicketAmountDue.toFixed(2)} JOD</p><p className="text-xs">{processType === 'exchange' ? 'Settle them in Traffic Tickets before exchanging the car.' : 'They have been added to the return charges — collect them now or send them to the customer as a claim.'}</p></div>
                    </div>
                  )}

                  <fieldset disabled={ticketsBlockFlow || hasDueExtension} className="min-w-0">
                    {dropoffFlow === 'selection' ? (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-clip">
                        <div className="px-4 py-3 border-b border-slate-200">
                          <h2 className="text-sm font-semibold text-slate-900">What are you processing?</h2>
                          <p className="text-xs text-slate-500">Choose how the customer is returning the vehicle.</p>
                        </div>
                        <div className="p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button onClick={() => setProcessType('return')} className="text-left p-4 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors">
                            <VehicleArt kind={kind} className="w-16 h-9 mb-2" />
                            <p className="text-[13px] font-semibold text-slate-900">Final return</p>
                            <p className="text-xs text-slate-500">The rental ends today. Inspect the car and close the agreement.</p>
                          </button>
                          <button onClick={() => setProcessType('exchange')} className="text-left p-4 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors">
                            <div className="flex items-center gap-1 mb-2"><VehicleArt kind={kind} className="w-12 h-7" /><span className="text-slate-400">⇄</span><VehicleArt kind="suv" className="w-12 h-7" /></div>
                            <p className="text-[13px] font-semibold text-slate-900">Vehicle exchange</p>
                            <p className="text-xs text-slate-500">Swap the car and continue the same rental.</p>
                          </button>
                          {onUpgrade && fleet && fleet.length > 0 && (
                            <button onClick={() => (canUpgrade ? setShowMidUpgrade(true) : alert(NO_UPGRADE_ACCESS))} className="sm:col-span-2 text-left p-4 rounded-lg border border-indigo-200 bg-indigo-50/40 hover:border-indigo-400 hover:bg-indigo-50 transition-colors flex items-center gap-4">
                              <div className="flex items-center gap-1 shrink-0"><VehicleArt kind={kind} className="w-12 h-7" /><span className="text-indigo-400">→</span><VehicleArt kind="suv" className="w-14 h-8" /></div>
                              <span className="min-w-0">
                                <span className="block text-[13px] font-semibold text-slate-900">Upgrade during rental</span>
                                <span className="block text-xs text-slate-500">The customer wants a better car for the rest of the rental. Choose the car and the charge, then swap the cars with inspection and signatures.</span>
                                {!canUpgrade && <span className="block text-xs font-medium text-amber-700 mt-1">Needs the "Upgrade vehicle" permission.</span>}
                              </span>
                            </button>
                          )}
                        </div>
                        </div>
                      </div>
                    ) : dropoffFlow === 'exchange' ? (
                      <>
                        {midUpgrade && (
                          <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[13px] text-indigo-900"><b>Upgrade during rental:</b> {localReservation.carModel} → {midUpgrade.model} · {midUpgrade.details.fee > 0 ? `+${formatCurrency(midUpgrade.details.fee)} added to the booking` : 'free of charge'}. It is applied when the swap is completed.</p>
                            <button type="button" onClick={() => setMidUpgrade(null)} className="h-8 px-3 rounded-md text-[13px] font-medium text-rose-700 hover:bg-rose-50">Cancel upgrade</button>
                          </div>
                        )}
                        {exchangeStep === 'checkin' ? renderExchangeStep('checkin') : renderExchangeStep('checkout')}
                      </>
                    ) : (
                      renderWizardStep()
                    )}
                  </fieldset>
                </>
              )}
            </div>
          </div>

          {/* Right: sticky rental summary */}
          <aside className="hidden lg:block w-80 shrink-0 border-l border-slate-200 bg-slate-50 overflow-y-auto p-4">
            {renderSummary()}
          </aside>
        </div>

        {!showSuccessOverlay && (
          <div className="flex-shrink-0 px-4 sm:px-5 py-3 border-t border-slate-200 bg-white flex justify-between items-center gap-2">
            <Button variant="secondary" onClick={onClose}><Bi en="Close" className="hidden sm:inline" /></Button>
            <div className="flex items-center gap-2 min-w-0 flex-wrap justify-end">
              {isWizard ? (
                <>
                  <Button variant="ghost" onClick={() => goToStep(activeIndex - 1)} disabled={activeIndex === 0}><Bi en="Back" className="hidden sm:inline" /></Button>
                  {printButtons}
                  {!isLastStep ? (
                    <Button variant={canComplete ? 'primary' : 'secondary'} onClick={() => goToStep(activeIndex + 1)}>
                      Next<span lang="ar" dir="rtl" className="ar-ui ml-1.5 !text-current opacity-80">التالي</span><span className="hidden sm:inline font-normal opacity-80">&nbsp;· {flowSteps[activeIndex + 1]?.label}</span>
                    </Button>
                  ) : canComplete && (
                    <Button
                      variant="primary"
                      onClick={handleComplete}
                      disabled={ticketsBlockFlow || hasDueExtension}
                      icon={CHECK_ICON}
                    >
                      <Bi en={viewMode === 'pickup' ? 'Complete check-out' : 'Complete check-in'} className="hidden sm:inline !text-white/80" />
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {viewMode === 'dropoff' && processType === 'exchange' && (
                    <>
                      {exchangeStep === 'checkout' && (
                        <Button variant="ghost" onClick={() => setExchangeStep('checkin')}><Bi en="Back" /></Button>
                      )}
                      {exchangeStep === 'checkin' && (
                        <Button
                          variant="primary"
                          onClick={() => setExchangeStep('checkout')}
                          disabled={!currentExchange.reason || hasOutstandingTickets || hasDueExtension}
                        >
                          Next: hand over new car →
                        </Button>
                      )}
                    </>
                  )}

                  {(viewMode === 'dropoff' && processType === 'exchange' && exchangeStep === 'checkout' && isDropoffEditable) ? (
                    <Button
                      variant="primary"
                      onClick={handleSubmit}
                      disabled={ticketsBlockFlow || hasDueExtension}
                      icon={CHECK_ICON}
                    >
                      Complete exchange
                    </Button>
                  ) : printButtons}
                </>
              )}
            </div>
          </div>
        )}

        {showMidUpgrade && onUpgrade && fleet && (
        <UpgradeVehicleModal
          reservation={localReservation}
          fleet={fleet}
          allData={allData || {}}
          onCancel={() => setShowMidUpgrade(false)}
          onConfirm={(carId, details) => {
            const car = fleet.find(c => c.id === carId);
            setMidUpgrade({ carId, details, model: car?.modelName || '' });
            setCurrentExchange(prev => ({
              ...prev,
              newCarLicensePlate: car?.licensePlate || prev.newCarLicensePlate,
              reason: prev.reason || `Upgrade to ${car?.modelName || 'another car'} at the customer's request${details.fee > 0 ? ` (+${formatCurrency(details.fee)})` : ' (free)'}${details.reason ? ` · ${details.reason}` : ''}`,
            }));
            setShowMidUpgrade(false);
            setProcessType('exchange');
          }}
        />
      )}
      {showUpgrade && onUpgrade && fleet && (
        <UpgradeVehicleModal
          reservation={localReservation}
          fleet={fleet}
          allData={allData || {}}
          onCancel={() => setShowUpgrade(false)}
          onConfirm={(carId, details) => {
            // Only the upgrade is saved now; the rest of the agreement is saved when it is completed.
            const base: Reservation = { ...reservation, carModel: localReservation.carModel, licensePlate: localReservation.licensePlate, amount: localReservation.amount, upgradeHistory: localReservation.upgradeHistory };
            const upd = onUpgrade(base, carId, details.fee, details);
            if (upd) setLocalReservation(prev => ({ ...prev, carModel: upd.carModel, licensePlate: upd.licensePlate, amount: upd.amount, upgradeHistory: upd.upgradeHistory }));
            setShowUpgrade(false);
          }}
        />
      )}
      {showSuccessOverlay && (
          <div className="absolute inset-0 bg-slate-50 overflow-y-auto flex flex-col items-center justify-center p-4 sm:p-6 no-print">
            <div className="w-11 h-11 rounded-full bg-emerald-50 ring-1 ring-emerald-200 text-emerald-600 flex items-center justify-center mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-900"><Bi en={localReservation.dropOffCompleted ? 'Check-in complete' : 'Check-out complete'} block className="!text-lg !text-slate-700" /></h2>
            <p className="text-[13px] text-slate-500 mt-0.5 mb-5">#{reservation.bookingId} · {reservation.personName}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
              <button onClick={handleDownloadVoucherPDF} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-left">
                <span className="w-8 h-8 shrink-0 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center"><PdfIcon className="w-4 h-4" /></span>
                <span className="min-w-0"><span className="block text-[13px] font-semibold text-slate-900">Rental agreement</span><span className="block text-xs text-slate-500">Print or save as PDF</span></span>
              </button>
              <button onClick={handleDownloadReceiptPDF} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-left">
                <span className="w-8 h-8 shrink-0 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center"><PdfIcon className="w-4 h-4" /></span>
                <span className="min-w-0"><span className="block text-[13px] font-semibold text-slate-900">Payment receipt</span><span className="block text-xs text-slate-500">Download PDF</span></span>
              </button>
              {localReservation.dropOffCompleted && (
                <button onClick={handlePrintTermination} className="sm:col-span-2 flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-left">
                  <span className="w-8 h-8 shrink-0 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center"><PdfIcon className="w-4 h-4" /></span>
                  <span className="min-w-0"><span className="block text-[13px] font-semibold text-slate-900">Rental termination {terminationNumber(localReservation.bookingId)}</span><span className="block text-xs text-slate-500">Closure statement and final account</span></span>
                </button>
              )}
              {localReservation.dropOffCompleted && localReservation.returnCharges && localReservation.returnCharges.items.length > 0 && (
                <button onClick={handleDownloadChargesPDF} className={`sm:col-span-2 flex items-center gap-3 p-3 rounded-lg border text-left ${localReservation.returnCharges.settlement === 'paid' ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50' : 'border-amber-200 bg-amber-50/50 hover:bg-amber-50'}`}>
                  <span className={`w-8 h-8 shrink-0 rounded-md flex items-center justify-center ${localReservation.returnCharges.settlement === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}><PdfIcon className="w-4 h-4" /></span>
                  <span className="flex-1 min-w-0"><span className="block text-[13px] font-semibold text-slate-900">{chargesDocumentTitle(localReservation.returnCharges)} {localReservation.returnCharges.documentNumber}</span>
                    <span className="block text-xs text-slate-500">{localReservation.returnCharges.items.length} charge{localReservation.returnCharges.items.length === 1 ? '' : 's'} · {formatMoney(chargesTotal(localReservation.returnCharges.items), localReservation.returnCharges.currency)} · {localReservation.returnCharges.settlement === 'paid' ? 'Paid' : 'Payment due'}</span></span>
                </button>
              )}
            </div>
            {localReservation.customerEmail && (
              <div className={`mt-3 w-full max-w-md flex items-center gap-3 p-3 rounded-lg border text-left ${
                emailState.status === 'sent' ? 'border-emerald-200 bg-emerald-50' :
                emailState.status === 'failed' ? 'border-rose-200 bg-rose-50' :
                emailState.status === 'unconfigured' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                <span className={`w-8 h-8 shrink-0 rounded-md flex items-center justify-center ${
                  emailState.status === 'sent' ? 'bg-emerald-100 text-emerald-700' :
                  emailState.status === 'failed' ? 'bg-rose-100 text-rose-700' :
                  emailState.status === 'unconfigured' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                  {emailState.status === 'sending'
                    ? <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                    : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-slate-900">
                    {emailState.status === 'sending' ? (localReservation.dropOffCompleted ? 'Emailing the termination statement…' : 'Emailing the agreement…') :
                     emailState.status === 'sent' ? (localReservation.dropOffCompleted ? 'Termination statement emailed' : 'Agreement emailed') :
                     emailState.status === 'failed' ? 'Email not sent' :
                     emailState.status === 'unconfigured' ? 'Email is not set up' : localReservation.dropOffCompleted ? 'Email the termination statement' : 'Email the agreement'}
                  </span>
                  <span className="block text-xs text-slate-500 truncate">
                    {emailState.status === 'unconfigured' ? 'An administrator can turn it on in Email Settings.' :
                     emailState.status === 'failed' ? (emailState.message || 'Please try again.') :
                     `${localReservation.dropOffCompleted ? `Termination + agreement${localReservation.returnCharges?.items.length ? ` + ${localReservation.returnCharges.settlement === 'paid' ? 'invoice' : 'claim'}` : ''}` : 'Agreement PDF'} to ${localReservation.customerEmail}`}
                  </span>
                </span>
                {(emailState.status === 'failed' || emailState.status === 'idle' || emailState.status === 'unconfigured') && (
                  <Button size="sm" variant="secondary" onClick={handleSendEmail} className="shrink-0">{emailState.status === 'idle' ? 'Send' : 'Retry'}</Button>
                )}
                {emailState.status === 'sent' && (
                  <button onClick={handleSendEmail} className="shrink-0 text-xs font-semibold text-emerald-700 hover:underline">Resend</button>
                )}
              </div>
            )}
            <Button variant="primary" onClick={onClose} className="mt-5 px-8">Done</Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Voucher;
