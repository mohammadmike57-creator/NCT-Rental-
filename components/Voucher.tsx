import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Reservation, CompanyDetails, CarView, RentalSource, PaymentType, RentalLocation, CarExchange, TrafficTicket, LateReturnFee, DamageMarker, Fleet, ReturnCharges } from '../types';
import SignaturePad from './SignaturePad';
import { InspectionDiagram, INSPECTION_LABEL, INSPECTION_SVG, VehicleArt, vehicleKind, vehicleKindLabel } from './VehicleGraphics';
import { ShieldExclamationIcon, PdfIcon } from './icons';
import { URDRIVE_LOGO_B64 } from '../constants';
import { sendCustomerEmail, recordActivity } from '../firebase/api';
import { agreementHtmlToPdfBase64 } from '../services/agreementPdf';
import ReturnChargesPanel from './ReturnChargesPanel';
import { StepRail, MobileStepBar, WorkflowStep } from './voucher/WorkflowNav';
import DriverDetailsForm from './voucher/DriverDetailsForm';
import { Badge, Button, Plate, SectionLabel, inputCls as kitInputCls, textareaCls, labelCls } from './ui/Crm';
import { DAMAGE_PARTS, DAMAGE_SEVERITIES, DAMAGE_SIZES, DAMAGE_TYPES, damageSeverityLabel, damageSummary, isDescribed } from '../services/damageMarks';
import { buildAgreementHtml as buildAgreementDoc } from '../services/agreementDoc';
import { buildTerminationHtml, terminationFileName, terminationNumber } from '../services/terminationDoc';
import { printHtml } from '../services/printDocs';
import { buildReturnChargesHtml, chargesDocumentNumber, chargesDocumentTitle, chargesFileName, chargesTotal, formatMoney, CHARGE_KIND_LABEL } from '../services/returnChargesDoc';

interface VoucherProps {
  reservation: Reservation;
  sources: RentalSource[];
  rentalLocations: RentalLocation[];
  trafficTickets: TrafficTicket[];
  onClose: () => void;
  companyDetails: CompanyDetails;
  onUpdate: (reservation: Reservation) => void;
  /** Called when a check-in closes with charges, so damages and tickets are also recorded in their registers. */
  onRecordReturnCharges?: (reservation: Reservation, charges: ReturnCharges) => void;
}

const InfoBlock: React.FC<{ title: string; children: React.ReactNode; className?: string; icon?: React.ReactNode }> = ({ title, children, className, icon }) => (
  <section className={`bg-white border border-slate-200 rounded-xl shadow-sm overflow-clip min-w-0 ${className || ''}`}>
    <h3 className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">
      {icon && <span className="text-slate-400">{icon}</span>}
      {title}
    </h3>
    <div className="p-4 space-y-2.5 text-[13px]">{children}</div>
  </section>
);

const InfoPair: React.FC<{ label: string; value?: string | React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4">
    <p className="text-[13px] text-slate-500 shrink-0">{label}</p>
    <div className="font-medium text-slate-900 text-right break-words whitespace-pre-wrap text-[13px] tabular-nums min-w-0">{value || '—'}</div>
  </div>
);

/** Numbered, titled card used for each step of the inspection. */
const StepSection: React.FC<{ step?: number; title: string; subtitle?: string; children: React.ReactNode; aside?: React.ReactNode }> = ({ step, title, subtitle, children, aside }) => (
  <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-clip min-w-0">
    <header className="px-4 py-3 border-b border-slate-200 flex items-center gap-3">
      {step !== undefined && (
        <span className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200 text-xs font-semibold tabular-nums flex items-center justify-center shrink-0">{step}</span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      {aside}
    </header>
    <div className="p-4">{children}</div>
  </section>
);

const FuelGauge: React.FC<{ level?: number; pickupLevel?: number; onLevelChange: (level: number) => void; disabled?: boolean }> = ({ level = 0, pickupLevel, onLevelChange, disabled = false }) => {
  const segments = Array.from({ length: 8 }, (_, i) => i + 1);
  const hasPickupLevel = typeof pickupLevel === 'number';
  const color = level <= 2 ? 'bg-rose-500' : level <= 4 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <p className="text-xl font-semibold text-slate-900 tabular-nums">{level}<span className="text-[13px] font-medium text-slate-400">/8</span></p>
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
              className={`flex-1 h-8 rounded transition-colors ${level >= s ? color : 'bg-slate-100'} ${!disabled ? 'hover:ring-2 hover:ring-slate-300 cursor-pointer' : 'cursor-default'}`}
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
        <p className="text-xs text-slate-500 tabular-nums">{done} of {items.length} items confirmed</p>
        <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-600" style={{ width: `${(done / items.length) * 100}%` }} /></div>
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
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left text-[13px] transition-colors ${on ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900' : 'border-slate-200 bg-white text-slate-700'} ${disabled ? 'cursor-default' : 'hover:border-slate-300'}`}
            >
              <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${on ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white'}`}>{on && CHECK_ICON}</span>
              <span className="flex-1 font-medium">{item}</span>
              {before !== undefined && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ring-1 ring-inset whitespace-nowrap shrink-0 ${before ? 'bg-slate-100 text-slate-500 ring-slate-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>pickup {before ? 'OK' : '—'}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** Four-view damage map with a numbered damage register below it. Markers are stored as % of each square view. */
const DamageBoard: React.FC<{
  markers: DamageMarker[];
  priorMarkers?: DamageMarker[];
  editable: boolean;
  onMark: (e: React.MouseEvent<HTMLDivElement>, view: CarView) => void;
  onRemove: (index: number) => void;
  onUpdate?: (index: number, patch: Partial<DamageMarker>) => void;
  priorLabel?: string;
}> = ({ markers, priorMarkers, editable, onMark, onRemove, onUpdate, priorLabel = 'Recorded at pickup' }) => {
  const [active, setActive] = useState<number | null>(null);
  const prevCount = useRef(markers.length);
  useEffect(() => {
    // A new mark opens its details so the agent describes it straight away.
    if (markers.length > prevCount.current) setActive(markers.length - 1);
    prevCount.current = markers.length;
  }, [markers.length]);
  const described = markers.filter(isDescribed).length;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {(['front', 'back', 'left', 'right'] as CarView[]).map(view => (
          <div key={view}>
            <SectionLabel className="mb-1.5">{INSPECTION_LABEL[view]}</SectionLabel>
            <div
              className={`relative w-full aspect-square rounded-lg border border-slate-200 bg-slate-50/50 p-1 overflow-hidden ${editable ? 'cursor-crosshair hover:border-indigo-300' : ''}`}
              onClick={e => editable && onMark(e, view)}
            >
              <InspectionDiagram view={view} className="w-full h-full" />
              {(priorMarkers || []).map((m, i) => m.view === view && (
                <span key={`p${i}`} title={damageSummary(m) || priorLabel}
                  className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border-2 border-sky-500 bg-sky-100/80 text-sky-700 text-[9px] font-bold flex items-center justify-center pointer-events-none"
                  style={{ left: `${m.x}%`, top: `${m.y}%` }}>{i + 1}</span>
              ))}
              {markers.map((m, i) => m.view === view && (
                <button type="button" key={i} title={damageSummary(m) || 'Damage mark'}
                  onClick={e => { e.stopPropagation(); setActive(i); }}
                  className={`absolute w-6 h-6 -ml-3 -mt-3 rounded-full text-white text-[10px] font-bold flex items-center justify-center shadow-md ring-2 ${active === i ? 'bg-indigo-600 ring-indigo-200 scale-110' : 'bg-rose-600 ring-white'} transition-transform`}
                  style={{ left: `${m.x}%`, top: `${m.y}%` }}>{i + 1}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {priorMarkers && <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full border-2 border-sky-500 bg-sky-100" /> {priorLabel} ({priorMarkers.length})</span>}
        <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full bg-rose-600" /> {priorMarkers ? 'New damage' : 'Damage'} ({markers.length})</span>
        {editable && <span className="text-slate-400">Tap the car where the damage is · tap a mark to describe it</span>}
      </div>

      <DamageRegister
        title={priorMarkers ? 'New damage register' : 'Damage register'}
        markers={markers} editable={editable && !!onUpdate} active={active} onActivate={setActive}
        onUpdate={(i, patch) => onUpdate?.(i, patch)}
        onRemove={i => { onRemove(i); setActive(null); }}
        described={described}
      />
      {priorMarkers && priorMarkers.length > 0 && (
        <div className="mt-4">
          <SectionLabel>{priorLabel}</SectionLabel>
          <ul className="mt-1.5 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/50">
            {priorMarkers.map((m, i) => (
              <li key={i} className="flex items-start gap-2.5 px-3 py-2 text-[13px]">
                <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full border-2 border-sky-500 bg-white text-sky-700 text-[9px] font-bold flex items-center justify-center">{i + 1}</span>
                <span className="min-w-0">
                  <span className="font-medium text-slate-800">{damageSummary(m) || 'Not described'}</span>
                  <span className="text-slate-400"> · {INSPECTION_LABEL[m.view]}</span>
                  {m.note && <span className="block text-xs text-slate-500">{m.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/** One row per diagram mark: what the damage is, where, how big and how bad — printed on the agreement. */
const DamageRegister: React.FC<{
  title: string;
  markers: DamageMarker[];
  editable: boolean;
  active: number | null;
  described: number;
  onActivate: (i: number | null) => void;
  onUpdate: (index: number, patch: Partial<DamageMarker>) => void;
  onRemove: (index: number) => void;
}> = ({ title, markers, editable, active, described, onActivate, onUpdate, onRemove }) => (
  <div className="mt-5 pt-4 border-t border-slate-100">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <SectionLabel>{title}</SectionLabel>
        <p className="text-xs text-slate-500 mt-0.5">Describe each mark. The list is printed on the rental agreement next to the diagram.</p>
      </div>
      {markers.length > 0 && (described === markers.length
        ? <Badge tone="success">All {markers.length} described</Badge>
        : <Badge tone="warning">{markers.length - described} of {markers.length} not described</Badge>)}
    </div>
    {markers.length === 0 ? (
      <div className="mt-2 rounded-lg border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-500">
        No damage marked. {editable ? 'Tap the diagram where you see a scratch, dent or chip.' : ''}
      </div>
    ) : (
      <ol className="mt-2 space-y-2">
        {markers.map((m, i) => {
          const open = editable && active === i;
          return (
            <li key={i} className={`rounded-xl border bg-white transition-shadow ${open ? 'border-indigo-300 shadow-sm ring-1 ring-indigo-100' : 'border-slate-200'}`}>
              <button type="button" onClick={() => onActivate(open ? null : i)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                <span className={`w-7 h-7 shrink-0 rounded-full text-white text-[11px] font-bold flex items-center justify-center ${open ? 'bg-indigo-600' : 'bg-rose-600'}`}>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] font-semibold truncate ${isDescribed(m) ? 'text-slate-900' : 'text-amber-700'}`}>{damageSummary(m) || 'Describe this damage'}</span>
                  <span className="block text-xs text-slate-500 truncate">{INSPECTION_LABEL[m.view]}{m.note ? ` · ${m.note}` : ''}</span>
                </span>
                {m.severity && <Badge tone={m.severity === 'major' ? 'danger' : m.severity === 'moderate' ? 'warning' : 'muted'}>{damageSeverityLabel(m.severity)}</Badge>}
                {editable && <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>}
              </button>
              {open && (
                <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3">
                  <div>
                    <span className={labelCls}>Type of damage</span>
                    <div className="flex flex-wrap gap-1.5">
                      {DAMAGE_TYPES.map(t => (
                        <button type="button" key={t.value} onClick={() => onUpdate(i, { type: m.type === t.value ? undefined : t.value })}
                          className={`h-8 px-3 rounded-full text-xs font-semibold border transition-colors ${m.type === t.value ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>{t.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block min-w-0">
                      <span className={labelCls}>Part / location</span>
                      <input className={inputCls} list={`damage-parts-${m.view}`} value={m.part || ''} placeholder="e.g. Front bumper"
                        onChange={e => onUpdate(i, { part: e.target.value })} />
                      <datalist id={`damage-parts-${m.view}`}>{DAMAGE_PARTS[m.view].map(p => <option key={p} value={p} />)}</datalist>
                    </label>
                    <label className="block min-w-0">
                      <span className={labelCls}>Size</span>
                      <select className={`${inputCls} w-full`} value={m.size || ''} onChange={e => onUpdate(i, { size: e.target.value || undefined })}>
                        <option value="">Not measured</option>
                        {DAMAGE_SIZES.map(z => <option key={z} value={z}>{z}</option>)}
                      </select>
                    </label>
                  </div>
                  <div>
                    <span className={labelCls}>Severity</span>
                    <div className="grid grid-cols-3 rounded-lg bg-slate-100 p-0.5">
                      {DAMAGE_SEVERITIES.map(s => (
                        <button type="button" key={s.value} onClick={() => onUpdate(i, { severity: m.severity === s.value ? undefined : s.value })}
                          className={`h-8 rounded-md text-xs font-semibold transition-colors ${m.severity === s.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{s.label}</button>
                      ))}
                    </div>
                  </div>
                  <label className="block">
                    <span className={labelCls}>Description</span>
                    <textarea className={areaCls} rows={2} value={m.note || ''} placeholder="e.g. Light scratch through the clear coat, paint not broken"
                      onChange={e => onUpdate(i, { note: e.target.value })} />
                  </label>
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => onRemove(i)} className="h-9 px-3 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50">Delete mark</button>
                    <Button size="sm" variant="primary" onClick={() => onActivate(null)}>Done</Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    )}
  </div>
);

const SignatureBlock: React.FC<{ title: string; subtitle?: string; signature?: string; onSave: (d: string) => void; onClear: () => void; disabled: boolean; children?: React.ReactNode }> = ({ title, subtitle, signature, onSave, onClear, disabled, children }) => (
  <div className="rounded-lg border border-slate-200 p-3 sm:p-4 min-w-0">
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
      </div>
      <Badge tone={signature ? 'success' : 'muted'}>{signature ? 'Signed' : 'Required'}</Badge>
    </div>
    {children}
    <SignaturePad signature={signature} onSave={onSave} onClear={onClear} disabled={disabled} />
  </div>
);

const inputCls = kitInputCls;
const areaCls = `${textareaCls} disabled:bg-slate-50 disabled:text-slate-500`;

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

const Voucher: React.FC<VoucherProps> = ({ reservation, sources, rentalLocations, onClose, companyDetails, onUpdate, trafficTickets, onRecordReturnCharges }) => {
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
  const ticketsBlockFlow = hasOutstandingTickets && processType === 'exchange';
  const isDropoffEditable = !!localReservation.voucherSubmitted && !localReservation.dropOffCompleted && !ticketsBlockFlow && !hasDueExtension && !isDropoffBlockedByPendingFee;

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

  const updateDamageMarker = (index: number, patch: Partial<DamageMarker>) => {
    const isEditable = viewMode === 'pickup' ? isPickupEditable : isDropoffEditable;
    if (!isEditable) return;
    const field = viewMode === 'pickup' ? 'pickupDamageMarkers' : 'dropOffDamageMarkers';
    handleFieldChange(field, (localReservation[field] || []).map((m, i) => (i === index ? { ...m, ...patch } : m)));
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
      recordActivity('CHECK_OUT', 'agreement', `Checked out ${submittedVoucher.carModel || 'vehicle'}${submittedVoucher.licensePlate ? ` (${submittedVoucher.licensePlate})` : ''} to ${submittedVoucher.personName}`,
        submittedVoucher.bookingId, `Km out ${submittedVoucher.pickupKmOut ?? '—'} · fuel ${submittedVoucher.pickupFuelLevel ?? '—'}/8 · agent ${submittedVoucher.pickupAgentName || '—'}`);
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
        const submittedVoucher: Reservation = { ...localReservation, dropOffCompleted: true, returnCharges: finalCharges };
        if (finalCharges && onRecordReturnCharges) onRecordReturnCharges(submittedVoucher, finalCharges);
        onUpdate(submittedVoucher);
        setLocalReservation(submittedVoucher);
        setShowSuccessOverlay(true);
        recordActivity('CHECK_IN', 'agreement', `Checked in ${submittedVoucher.carModel || 'vehicle'}${submittedVoucher.licensePlate ? ` (${submittedVoucher.licensePlate})` : ''} from ${submittedVoucher.personName} and closed the agreement`,
          submittedVoucher.bookingId, `Km in ${submittedVoucher.dropOffKmIn ?? '—'} · fuel ${submittedVoucher.dropOffFuelLevel ?? '—'}/8${finalCharges ? ` · charges ${formatMoney(chargesTotal(finalCharges.items), finalCharges.currency)} (${finalCharges.settlement === 'paid' ? 'paid' : 'claim'} ${finalCharges.documentNumber})` : ' · no charges'}`);
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
    prepaid: sources.find(src => src.name === r.source)?.paymentType === PaymentType.PREPAID,
  });

  const buildTermination = (r: Reservation = localReservation): string => buildTerminationHtml({
    reservation: r,
    company: companyDetails,
    logo: URDRIVE_LOGO_B64,
    rentalDays,
    baseRentalFee,
    checklistItems,
    locationName: location?.name || r.locationName,
    prepaid: sources.find(src => src.name === r.source)?.paymentType === PaymentType.PREPAID,
  });

  const handlePrintTermination = () => {
    if (!printHtml(buildTermination())) alert('Allow pop-ups for this site to print the termination statement.');
  };

  const handleDownloadVoucherPDF = () => {
    if (!printHtml(buildAgreementHtml())) alert('Allow pop-ups for this site to print the agreement.');
    recordActivity('AGREEMENT_PRINTED', 'agreement', `Printed the rental agreement for ${localReservation.personName}`, localReservation.bookingId);
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

  const handlePreviewCharges = () => {
    const html = buildReturnChargesHtml(localReservation, { ...charges, documentNumber: charges.documentNumber || 'PREVIEW' }, companyDetails, URDRIVE_LOGO_B64);
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (w) { w.document.write(html); w.document.close(); w.focus(); }
  };
  const handleDownloadChargesPDF = () => {
    if (!localReservation.returnCharges) return;
    if (!printHtml(buildReturnChargesHtml(localReservation, localReservation.returnCharges, companyDetails, URDRIVE_LOGO_B64))) alert('Allow pop-ups for this site to print.');
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
    const attachments = [attachment];
    if (kind === 'checkin') {
      const termHtml = buildTermination(r);
      try {
        attachments.push({ fileName: terminationFileName(r.bookingId), contentType: 'application/pdf', base64: await agreementHtmlToPdfBase64(termHtml) });
      } catch {
        attachments.push({ fileName: terminationFileName(r.bookingId).replace(/\.pdf$/, '.html'), contentType: 'text/html', base64: btoa(unescape(encodeURIComponent(termHtml))) });
      }
    }
    const rc = kind === 'checkin' && r.returnCharges && r.returnCharges.items.length > 0 ? r.returnCharges : undefined;
    if (rc) {
      const chargesHtml = buildReturnChargesHtml(r, rc, companyDetails, URDRIVE_LOGO_B64);
      try {
        attachments.push({ fileName: chargesFileName(rc, r.bookingId), contentType: 'application/pdf', base64: await agreementHtmlToPdfBase64(chargesHtml) });
      } catch {
        attachments.push({ fileName: chargesFileName(rc, r.bookingId).replace(/\.pdf$/, '.html'), contentType: 'text/html', base64: btoa(unescape(encodeURIComponent(chargesHtml))) });
      }
    }
    const days = calculateDaysWithGrace(r.startDate, r.endDate);
    const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
    const isCheckout = kind === 'checkout';
    const outcome = await sendCustomerEmail({
      to,
      subject: `${isCheckout ? 'Your rental agreement' : 'Rental agreement closed'} · Booking ${r.bookingId}`,
      heading: isCheckout ? 'Your rental agreement' : 'Thank you — your vehicle has been returned',
      intro: `Dear ${r.personName}, ${isCheckout
        ? `thank you for choosing ${companyDetails.name}. Your signed rental agreement is attached to this email. Please keep it with you for the duration of the rental.`
        : rc
          ? `we have checked in your vehicle and your rental agreement is now closed. Attached are your final signed agreement, the rental termination statement ${terminationNumber(r.bookingId)} and ${rc.settlement === 'paid' ? `your paid invoice ${rc.documentNumber}` : `claim ${rc.documentNumber} for the charges found at return`}, including photos.`
          : `we have checked in your vehicle and your rental agreement is now closed. Attached are your final signed agreement with the return inspection and the rental termination statement ${terminationNumber(r.bookingId)} confirming that nothing further is due.`}`,
      rows: [
        ['Booking', r.bookingId],
        ['Vehicle', `${r.carModel || '—'}${r.licensePlate ? ` · ${r.licensePlate}` : ''}`],
        ['Pick-up', fmt(r.startDate)],
        ['Return', fmt(r.endDate)],
        ['Duration', `${days} day${days === 1 ? '' : 's'}`],
        ['Total', formatCurrency(r.amount || 0)],
        ...(isCheckout ? [] : [['Kilometres', r.dropOffKmIn != null && r.pickupKmOut != null ? `${r.pickupKmOut} → ${r.dropOffKmIn}` : '—'] as [string, string]]),
        ...(rc ? [
          ...rc.items.map((it, i) => [`${i + 1}. ${CHARGE_KIND_LABEL[it.kind]}`, `${it.description} — ${formatMoney(it.amount, rc.currency)}`] as [string, string]),
          [rc.settlement === 'paid' ? 'Charges paid' : 'Amount due', `${formatMoney(chargesTotal(rc.items), rc.currency)}${rc.settlement === 'claim' && rc.dueDate ? ` by ${new Date(rc.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}`] as [string, string],
        ] : []),
      ],
      closing: isCheckout ? `We wish you a safe journey. If you need assistance during your rental, call us on ${companyDetails.phone}.`
        : rc && rc.settlement === 'claim' ? `Please settle the amount due, quoting ${rc.documentNumber}. For questions about the charges, call us on ${companyDetails.phone}.`
        : 'We hope to see you again soon.',
      companyName: companyDetails.name,
      companyAddress: companyDetails.address,
      companyPhone: companyDetails.phone,
      companyEmail: companyDetails.email,
      attachments,
      badge: isCheckout ? 'RENTAL AGREEMENT' : rc ? (rc.settlement === 'paid' ? 'PAID' : 'PAYMENT DUE') : 'AGREEMENT CLOSED',
      tone: rc ? (rc.settlement === 'paid' ? 'success' : 'warning') : isCheckout ? 'info' : 'success',
      highlightLabel: rc ? (rc.settlement === 'paid' ? `Invoice ${rc.documentNumber} · paid` : `Claim ${rc.documentNumber} · amount due`) : isCheckout ? 'Rental total' : undefined,
      highlightValue: rc ? formatMoney(chargesTotal(rc.items), rc.currency) : isCheckout ? formatCurrency(r.amount || 0) : undefined,
    });
    if (outcome.ok) {
      setEmailState({ status: 'sent', to });
      const sentAt = new Date().toISOString();
      const withLog: Reservation = {
        ...r,
        agreementEmails: [...(r.agreementEmails || []), { to, kind, sentAt }],
        ...(rc ? { returnCharges: { ...rc, emails: [...(rc.emails || []), { to, sentAt }] } } : {}),
      };
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
      <label className={labelCls}>{label}</label>
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
        <p className={`text-[13px] font-medium text-slate-900 py-1.5 ${isEmail ? 'break-all' : 'break-words'}`}>{value || '—'}</p>
      )}
    </div>
  );

  const renderKmField = ({ label, value, onChange, editable, reference, referenceLabel, placeholder }: { label: string; value?: number; onChange: (v?: number) => void; editable: boolean; reference?: number; referenceLabel?: string; placeholder: string }) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[13px] font-medium text-slate-700">{label}</label>
        {referenceLabel && <span className="text-xs text-slate-400">{referenceLabel}: {reference?.toLocaleString() ?? '—'} km</span>}
      </div>
      <div className="relative">
        <input type="number" inputMode="numeric" value={value ?? ''} onChange={e => onChange(parseInt(e.target.value) || undefined)}
          disabled={!editable} className={`${inputCls} pr-12 font-semibold tabular-nums`} placeholder={placeholder} />
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
                    <p className={labelCls}>From pickup</p>
                    <p className="min-h-[84px] px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[13px] text-slate-700 whitespace-pre-wrap">{localReservation.pickupNotes || 'No notes from pickup.'}</p>
                  </div>
                  <div>
                    <label className={labelCls}>Return notes</label>
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

            <StepSection step={stepNo} title={isPickup ? 'Agreement & signatures' : 'Return confirmation'} subtitle="Both signatures are required to finish">
              <p className="text-xs leading-relaxed text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">{isPickup ? PICKUP_TERMS : RETURN_TERMS}</p>
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
                    <label className={labelCls}>Reason for exchange</label>
                    <textarea value={currentExchange.reason || ''} onChange={e => handleExchangeFieldChange('reason', e.target.value)} rows={2} className={areaCls} required disabled={!isEditable} />
                  </div>
                ) : (
                  <div>
                    <label className={labelCls}>New car license plate</label>
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
  const emailValid = !!localReservation.customerEmail?.trim() && /^\S+@\S+\.\S+$/.test(localReservation.customerEmail);
  const countChecked = (c?: { [item: string]: boolean }) => checklistItems.filter(i => c?.[i]).length;
  const kmOutValid = localReservation.pickupKmOut !== undefined && localReservation.pickupKmOut !== null && localReservation.pickupKmOut >= 0;
  const kmInValid = localReservation.dropOffKmIn !== undefined && localReservation.dropOffKmIn !== null && localReservation.dropOffKmIn >= 0
    && !(localReservation.pickupKmOut !== undefined && localReservation.pickupKmOut !== null && localReservation.dropOffKmIn < localReservation.pickupKmOut);
  const pickupAuthOk = !(sources.find(s => s.name === localReservation.source)?.paymentType === PaymentType.PAY_ON_ARRIVAL) || !!localReservation.authNumber?.trim();
  const chargesValid = charges.items.length === 0 || (
    charges.items.every(i => !!i.description.trim() && i.amount > 0) && !!charges.settlement
    && (charges.settlement !== 'paid' || !!charges.paymentMethod) && !!charges.customerSignature);
  const signedCount = (a?: string, b?: string) => (a ? 1 : 0) + (b ? 1 : 0);

  type FlowStep = { key: string; label: string; done: boolean; hint?: string };
  const pickupClosed = !!localReservation.voucherSubmitted;
  const dropoffClosed = !!localReservation.dropOffCompleted;
  const pickupSteps: FlowStep[] = [
    { key: 'customer', label: 'Customer & documents', done: pickupClosed || emailValid, hint: emailValid ? undefined : 'Valid email required' },
    { key: 'vehicle', label: 'Vehicle', done: pickupClosed || !!localReservation.licensePlate?.trim(), hint: 'License plate required' },
    { key: 'inspection', label: 'Inspection checklist', done: pickupClosed || countChecked(localReservation.pickupChecklist) === checklistItems.length, hint: `${countChecked(localReservation.pickupChecklist)} of ${checklistItems.length} confirmed` },
    { key: 'damage', label: 'Damage', done: pickupClosed || !!visited['pickup:damage'], hint: `${(localReservation.pickupDamageMarkers || []).length} marked` },
    { key: 'fuel', label: 'Fuel & mileage', done: pickupClosed || (kmOutValid && localReservation.pickupFuelLevel !== undefined), hint: kmOutValid ? 'Fuel level not set' : 'Odometer out required' },
    { key: 'payment', label: 'Charges & payment', done: pickupClosed || (pickupAuthOk && !!visited['pickup:payment']), hint: pickupAuthOk ? formatCurrency(totalCost) : 'Authorisation required' },
    { key: 'signatures', label: 'Signatures', done: pickupClosed || signedCount(localReservation.pickupRenterSignature, localReservation.pickupAgentSignature) === 2, hint: `${signedCount(localReservation.pickupRenterSignature, localReservation.pickupAgentSignature)} of 2 signed` },
  ];
  const dropoffSteps: FlowStep[] = [
    { key: 'return', label: 'Return details', done: dropoffClosed || (emailValid && !!visited['dropoff:return']), hint: emailValid ? undefined : 'Customer email missing' },
    { key: 'inspection', label: 'Inspection', done: dropoffClosed || countChecked(localReservation.dropOffChecklist) === checklistItems.length, hint: `${countChecked(localReservation.dropOffChecklist)} of ${checklistItems.length} confirmed` },
    { key: 'damage', label: 'Damage', done: dropoffClosed || !!visited['dropoff:damage'], hint: `${(localReservation.dropOffDamageMarkers || []).length} new marked` },
    { key: 'fuel', label: 'Fuel & mileage', done: dropoffClosed || (kmInValid && localReservation.dropOffFuelLevel !== undefined), hint: kmInValid ? 'Fuel level not set' : 'Odometer in required' },
    { key: 'charges', label: 'Return charges', done: dropoffClosed || (chargesValid && !!visited['dropoff:charges']), hint: charges.items.length ? `${charges.items.length} charge${charges.items.length === 1 ? '' : 's'} · ${formatMoney(chargesTotal(charges.items), charges.currency)}` : 'No charges' },
    { key: 'signatures', label: 'Signatures', done: dropoffClosed || signedCount(localReservation.dropOffRenterSignature, localReservation.dropOffAgentSignature) === 2, hint: `${signedCount(localReservation.dropOffRenterSignature, localReservation.dropOffAgentSignature)} of 2 signed` },
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
  const firstMissingStep = (): string | undefined => {
    if (viewMode === 'pickup') {
      if (!emailValid) return 'customer';
      if (!localReservation.licensePlate?.trim()) return 'vehicle';
      if (!kmOutValid) return 'fuel';
      if (!pickupAuthOk) return 'payment';
      if (!localReservation.pickupRenterSignature || !localReservation.pickupAgentSignature) return 'signatures';
      return undefined;
    }
    if (!emailValid) return 'return';
    if (!kmInValid) return 'fuel';
    if (!localReservation.dropOffRenterSignature || !localReservation.dropOffAgentSignature) return 'signatures';
    if (!chargesValid) return 'charges';
    return undefined;
  };

  const handleComplete = () => {
    const missing = firstMissingStep();
    if (missing) {
      setAttempted(true);
      const idx = flowSteps.findIndex(s => s.key === missing);
      if (idx >= 0) goToStep(idx);
    }
    handleSubmit();
  };

  const exchangeNextAllowed = !!currentExchange.checkinRenterSignature && !!currentExchange.checkinAgentSignature && !!currentExchange.reason && !hasOutstandingTickets && !hasDueExtension;
  const exchangeRail: WorkflowStep[] = [
    { key: 'checkin', label: 'Return current car', hint: `${signedCount(currentExchange.checkinRenterSignature, currentExchange.checkinAgentSignature)} of 2 signed`, status: (!!currentExchange.checkinRenterSignature && !!currentExchange.checkinAgentSignature && !!currentExchange.reason?.trim()) ? 'done' : 'pending' },
    { key: 'checkout', label: 'Hand over new car', hint: exchangeNextAllowed ? 'New plate and signatures' : 'Finish the return first', enabled: exchangeNextAllowed || exchangeStep === 'checkout',
      status: (!!currentExchange.newCarLicensePlate?.trim() && !!currentExchange.checkoutRenterSignature && !!currentExchange.checkoutAgentSignature) ? 'done' : exchangeStep === 'checkout' ? 'incomplete' : 'pending' },
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
            <div className="mt-2">{renderTextField('Email (for receipt)', localReservation.customerEmail || '', val => handleFieldChange('customerEmail', val), isPickupEditable, true)}</div>
          </div>
        </div>
        <div className="space-y-2.5 min-w-0">
          <InfoPair label="Booking" value={<span className="font-mono">#{reservation.bookingId || 'N/A'}</span>} />
          <InfoPair label="Source" value={reservation.source} />
          <InfoPair label="Pickup" value={fmtDateTime(reservation.startDate)} />
          <InfoPair label="Return" value={fmtDateTime(reservation.endDate)} />
          <InfoPair label="Duration" value={`${rentalDays} day${rentalDays === 1 ? '' : 's'}`} />
          <InfoPair label="Location" value={`${location?.name || reservation.locationName || 'Location not set'}${location?.address ? ` — ${location.address}` : ''}`} />
        </div>
      </div>
      <DriverDetailsForm
        driver={localReservation.driver || {}}
        additionalDrivers={localReservation.additionalDrivers || []}
        editable={isPickupEditable}
        rentalEnd={localReservation.endDate}
        onChange={d => handleFieldChange('driver', d)}
        onChangeAdditional={list => handleFieldChange('additionalDrivers', list)}
      />
    </StepSection>
  );

  const renderVehicleStep = (stepNo: number) => (
    <StepSection step={stepNo} title="Vehicle" subtitle="The car being handed over on this agreement">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="flex items-center gap-3 min-w-0">
          <VehicleArt kind={kind} className="w-24 h-14 shrink-0" />
          <div className="min-w-0">
            <SectionLabel>{vehicleKindLabel[kind]}</SectionLabel>
            <p className="text-sm font-semibold text-slate-900 truncate">{localReservation.carModel || '—'}</p>
            <p className="mt-1"><Plate value={localReservation.licensePlate || 'NO PLATE'} /></p>
          </div>
        </div>
        <div className="space-y-2.5 text-[13px] min-w-0">
          {isPickupEditable ? (
            <>
              <div>
                <label className={labelCls}>Model</label>
                <input type="text" value={localReservation.carModel || ''} onChange={e => handleFieldChange('carModel', e.target.value)} className={inputCls} placeholder="Vehicle model" />
              </div>
              <div>
                <label className={labelCls}>License plate</label>
                <input type="text" value={localReservation.licensePlate || ''} onChange={e => handleFieldChange('licensePlate', e.target.value)} className={`${inputCls} font-mono uppercase`} placeholder="Plate number" />
              </div>
            </>
          ) : (
            <>
              <InfoPair label="Model" value={localReservation.carModel} />
              <InfoPair label="License plate" value={<span className="font-mono">{localReservation.licensePlate || '—'}</span>} />
            </>
          )}
        </div>
      </div>
    </StepSection>
  );

  const renderChargesBreakdown = () => (
    <>
      <InfoPair label={`Rental (${rentalDays} day${rentalDays === 1 ? '' : 's'})`} value={formatCurrency(baseRentalFee)} />
      {(reservation.extras || []).map((ex, i) => (
        <InfoPair key={i} label={ex.name} value={ex.isComplementary ? 'Included' : formatCurrency(ex.dailyPrice * rentalDays)} />
      ))}
      <div className="border-t border-slate-200 pt-2.5 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-slate-900">Total</span>
        <span className="text-xl font-semibold text-slate-900 tabular-nums">{formatCurrency(totalCost)}</span>
      </div>
      {charges.items.length > 0 && (
        <div className="rounded-lg bg-rose-50/50 border border-rose-200 p-3 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">Return charges{charges.settlement ? ` · ${charges.settlement === 'paid' ? 'paid' : 'claim'}` : ''}</p>
          {charges.items.map(i => (
            <div key={i.id} className="flex justify-between gap-3 text-xs"><span className="text-slate-600 truncate">{CHARGE_KIND_LABEL[i.kind]}</span><span className="font-semibold tabular-nums text-slate-900">{formatMoney(i.amount, charges.currency)}</span></div>
          ))}
          <div className="flex justify-between text-[13px] border-t border-rose-200 pt-1.5"><span className="font-semibold text-slate-800">Total</span><span className="font-semibold tabular-nums text-rose-700">{formatMoney(chargesTotal(charges.items), charges.currency)}</span></div>
        </div>
      )}
      <InfoPair label="Security deposit" value={formatCurrency(reservation.securityDeposit || 0)} />
      <InfoPair label="Excess" value={formatCurrency(reservation.excess || 0)} />
      {isPayOnArrival !== undefined && <InfoPair label="Payment type" value={isPayOnArrival ? 'Pay on arrival' : 'Prepaid'} />}
    </>
  );

  const renderPaymentStep = (stepNo: number) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
      <StepSection step={stepNo} title="Charges" subtitle="Rental, extras, deposit and excess">
        <div className="space-y-2.5 text-[13px]">{renderChargesBreakdown()}</div>
      </StepSection>
      <InfoBlock title="Payment">
        <div><Badge tone={paid ? 'success' : 'warning'}>{paid ? 'Paid' : 'Not yet authorised'}</Badge></div>
        {isPickupEditable ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Payment method</label>
                <select value={localReservation.paymentMethod || ''} onChange={e => handleFieldChange('paymentMethod', e.target.value || undefined)} className={inputCls}>
                  <option value="">Not set</option>
                  <option value="card">Card</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="prepaid">Prepaid by partner</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Card last 4 digits</label>
                <input type="text" inputMode="numeric" maxLength={4} value={(localReservation.cardNumber || '').replace(/\D/g, '').slice(-4)}
                  onChange={e => handleFieldChange('cardNumber', e.target.value.replace(/\D/g, '').slice(0, 4) || undefined)} className={`${inputCls} font-mono tabular-nums`} placeholder="4421" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Authorisation number{isPayOnArrival && <span className="text-rose-500"> *</span>}</label>
              <input type="text" value={localReservation.authNumber || ''} onChange={e => handleFieldChange('authNumber', e.target.value)} className={`${inputCls} font-mono`} placeholder="Card terminal auth code" />
            </div>
            <div>
              <label className={labelCls}>Amount charged ($)</label>
              <input type="number" step="0.01" value={localReservation.finalAmountCharged || ''} onChange={e => handleFieldChange('finalAmountCharged', parseFloat(e.target.value) || undefined)} className={`${inputCls} tabular-nums`} placeholder={totalCost.toFixed(2)} />
            </div>
          </>
        ) : (
          <>
            <InfoPair label="Payment method" value={localReservation.paymentMethod ? ({ card: 'Card', cash: 'Cash', bank_transfer: 'Bank transfer', prepaid: 'Prepaid by partner' } as Record<string, string>)[localReservation.paymentMethod] : undefined} />
            <InfoPair label="Authorisation" value={localReservation.authNumber ? <span className="font-mono">{localReservation.authNumber}</span> : undefined} />
            <InfoPair label="Amount charged" value={localReservation.finalAmountCharged ? formatCurrency(localReservation.finalAmountCharged) : undefined} />
          </>
        )}
      </InfoBlock>
    </div>
  );

  const renderReturnDetailsStep = (stepNo: number) => (
    <StepSection step={stepNo} title="Return details" subtitle="Who is returning the car and how it left">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2.5 min-w-0">
          <SectionLabel>Renter</SectionLabel>
          <InfoPair label="Name" value={reservation.personName} />
          <InfoPair label="Phone" value={reservation.contactNumber} />
          {renderTextField('Email (for receipt)', localReservation.customerEmail || '', val => handleFieldChange('customerEmail', val), isPickupEditable, true)}
          <SectionLabel className="pt-2">Vehicle</SectionLabel>
          <InfoPair label="Model" value={localReservation.carModel} />
          <InfoPair label="License plate" value={<span className="font-mono">{localReservation.licensePlate || '—'}</span>} />
        </div>
        <div className="space-y-2.5 min-w-0">
          <SectionLabel>Timing</SectionLabel>
          <InfoPair label="Checked out" value={localReservation.pickupDateTime || fmtDateTime(reservation.startDate)} />
          <InfoPair label="Scheduled return" value={fmtDateTime(reservation.endDate)} />
          <InfoPair label="Returned" value={localReservation.dropOffDateTime} />
          {localReservation.lateReturnFee && (
            <InfoPair label="Late return" value={<span className="inline-flex items-center gap-2">{localReservation.lateReturnFee.hoursLate} h · {formatCurrency(localReservation.lateReturnFee.amount)}<Badge tone={localReservation.lateReturnFee.status === 'PENDING' ? 'warning' : 'muted'}>{localReservation.lateReturnFee.isWaived ? 'Waived' : localReservation.lateReturnFee.status}</Badge></span>} />
          )}
          <SectionLabel className="pt-2">At check-out</SectionLabel>
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
          <h3 className="text-sm font-semibold text-slate-900">Rental summary</h3>
          <Badge tone={localReservation.dropOffCompleted ? 'success' : localReservation.voucherSubmitted ? 'info' : 'muted'}>{localReservation.dropOffCompleted ? 'Closed' : localReservation.voucherSubmitted ? 'On rent' : 'Reserved'}</Badge>
        </header>
        <div className="divide-y divide-slate-100 text-[13px]">
          <div className="p-4 space-y-1 min-w-0">
            <SectionLabel>Renter</SectionLabel>
            <p className="font-semibold text-slate-900 truncate">{reservation.personName}</p>
            <p className="text-xs text-slate-500 tabular-nums">{reservation.contactNumber || 'No phone'}</p>
            <p className="text-xs text-slate-500 break-all">{localReservation.customerEmail || 'No email'}</p>
          </div>
          <div className="p-4 flex items-center gap-3 min-w-0">
            <VehicleArt kind={kind} className="w-16 h-9 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{localReservation.carModel || '—'}</p>
              <p className="mt-1"><Plate value={localReservation.licensePlate || 'NO PLATE'} /></p>
            </div>
          </div>
          <div className="p-4 space-y-2">
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="w-0.5 h-8 bg-slate-200" />
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              </div>
              <div className="space-y-2 min-w-0 flex-1">
                <div><SectionLabel>Pickup</SectionLabel><p className="text-[13px] font-medium text-slate-900 tabular-nums">{fmtDateTime(reservation.startDate)}</p></div>
                <div><SectionLabel>Return</SectionLabel><p className="text-[13px] font-medium text-slate-900 tabular-nums">{fmtDateTime(reservation.endDate)}</p></div>
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
            <div className="flex items-center justify-between gap-2"><SectionLabel>Payment</SectionLabel><Badge tone={paid ? 'success' : 'warning'}>{paid ? 'Paid' : 'Not yet authorised'}</Badge></div>
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
      {localReservation.dropOffCompleted && (
        <Button variant="secondary" onClick={handlePrintTermination} icon={<PdfIcon className="w-4 h-4" />}>
          Termination
        </Button>
      )}
      <Button variant={isWizard && !isLastStep ? 'secondary' : 'primary'} onClick={handleDownloadVoucherPDF} icon={<PdfIcon className="w-4 h-4" />}>
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
            <h3 className="text-base font-semibold text-slate-900 truncate flex items-center gap-2">Rental agreement{localReservation.awaitingConfirmation && <Badge tone="warning">Awaiting confirmation</Badge>}</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate"><span className="font-mono">#{reservation.bookingId || 'N/A'}</span> · {reservation.personName}</p>
          </div>
          {/* progress */}
          <ol className="hidden md:flex items-center gap-2">
            {steps.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 text-xs font-semibold ${s.done ? 'text-emerald-700' : 'text-slate-400'}`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center ${s.done ? 'bg-emerald-600 text-white' : 'border border-slate-300'}`}>{s.done && CHECK_ICON}</span>
                  {s.label}
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
                <span className={`flex items-center gap-1.5 text-[13px] font-medium ${viewMode === t.key ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-800'}`}>{t.label}{t.done && <span className="text-emerald-600">{CHECK_ICON}</span>}</span>
                <span className="block text-[11px] text-slate-400">{t.hint}</span>
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
                  {localReservation.lateReturnFee && localReservation.lateReturnFee.status === 'PENDING' && (
                    <div className="flex items-start gap-2.5 p-3 rounded-lg text-[13px] bg-rose-50 border border-rose-200 text-rose-900" role="alert">
                      <ShieldExclamationIcon className="w-5 h-5 shrink-0" />
                      <div><p className="font-semibold">Late return detected</p><p className="text-xs">Resolve the fee in Late Returns, then come back to check the car in.</p></div>
                    </div>
                  )}

                  <fieldset disabled={ticketsBlockFlow || hasDueExtension || isDropoffBlockedByPendingFee} className="min-w-0">
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
                        </div>
                        </div>
                      </div>
                    ) : dropoffFlow === 'exchange' ? (
                      exchangeStep === 'checkin' ? renderExchangeStep('checkin') : renderExchangeStep('checkout')
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
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <div className="flex items-center gap-2 min-w-0 flex-wrap justify-end">
              {isWizard ? (
                <>
                  <Button variant="ghost" onClick={() => goToStep(activeIndex - 1)} disabled={activeIndex === 0}>Back</Button>
                  {!canComplete && printButtons}
                  {!isLastStep ? (
                    <Button variant={canComplete ? 'primary' : 'secondary'} onClick={() => goToStep(activeIndex + 1)}>
                      Next<span className="hidden sm:inline font-normal opacity-80">&nbsp;· {flowSteps[activeIndex + 1]?.label}</span>
                    </Button>
                  ) : canComplete && (
                    <Button
                      variant="primary"
                      onClick={handleComplete}
                      disabled={ticketsBlockFlow || hasDueExtension || isDropoffBlockedByPendingFee}
                      icon={CHECK_ICON}
                    >
                      {viewMode === 'pickup' ? 'Complete check-out' : 'Complete check-in'}
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {viewMode === 'dropoff' && processType === 'exchange' && (
                    <>
                      {exchangeStep === 'checkout' && (
                        <Button variant="ghost" onClick={() => setExchangeStep('checkin')}>Back</Button>
                      )}
                      {exchangeStep === 'checkin' && (
                        <Button
                          variant="primary"
                          onClick={() => setExchangeStep('checkout')}
                          disabled={!currentExchange.checkinRenterSignature || !currentExchange.checkinAgentSignature || !currentExchange.reason || hasOutstandingTickets || hasDueExtension}
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
                      disabled={ticketsBlockFlow || hasDueExtension || isDropoffBlockedByPendingFee}
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

        {showSuccessOverlay && (
          <div className="absolute inset-0 bg-slate-50 overflow-y-auto flex flex-col items-center justify-center p-4 sm:p-6 no-print">
            <div className="w-11 h-11 rounded-full bg-emerald-50 ring-1 ring-emerald-200 text-emerald-600 flex items-center justify-center mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-900">{localReservation.dropOffCompleted ? 'Check-in complete' : 'Check-out complete'}</h2>
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
                    {emailState.status === 'sending' ? 'Emailing the agreement…' :
                     emailState.status === 'sent' ? (localReservation.dropOffCompleted ? 'Closing documents emailed' : 'Agreement emailed') :
                     emailState.status === 'failed' ? 'Email not sent' :
                     emailState.status === 'unconfigured' ? 'Email is not set up' : 'Email the agreement'}
                  </span>
                  <span className="block text-xs text-slate-500 truncate">
                    {emailState.status === 'unconfigured' ? 'An administrator can turn it on in Email Settings.' :
                     emailState.status === 'failed' ? (emailState.message || 'Please try again.') :
                     `${localReservation.dropOffCompleted ? `Agreement + termination${localReservation.returnCharges?.items.length ? ` + ${localReservation.returnCharges.settlement === 'paid' ? 'invoice' : 'claim'}` : ''}` : 'Agreement PDF'} to ${localReservation.customerEmail}`}
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
