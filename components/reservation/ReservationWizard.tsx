import React, { useEffect, useMemo, useRef, useState } from 'react';
import { depositTermsFor } from '../../services/fleetLookup';
import CarShowcase from '../CarShowcase';
import CarPicture from '../CarPicture';
import { AppData, AvailableExtra, Fleet, RentalLocation, RentalSource, Reservation, ReservationStatus } from '../../types';
import { Badge, Button, Field, inputCls, selectCls, textareaCls, SectionLabel, EmptyState } from '../ui/Crm';
import { VehicleArt, vehicleKind, vehicleKindLabel } from '../VehicleGraphics';
import { extraDailyPrice } from '../../services/extras';
import { bookingKey } from '../../services/duplicates';
import PaymentChoice from '../PaymentChoice';
import { bookingPayment, PAYMENT_LABEL, sourceOf, sourceTakesBoth } from '../../services/paymentType';
import { rentalDaysOf } from '../../services/rentalDays';

/*
 * Step-by-step booking editor (RentWay / Wheelsys style). It owns no booking
 * data: the parent keeps formData, the price maths and handleSave, and this
 * component only edits fields through onChange / onToggleExtra.
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type StepKey = 'dates' | 'vehicle' | 'customer' | 'extras' | 'review';
const STEPS: { key: StepKey; label: string; hint: string }[] = [
  { key: 'dates', label: 'Dates & branch', hint: 'Pickup, return, booking' },
  { key: 'vehicle', label: 'Vehicle', hint: 'Group and availability' },
  { key: 'customer', label: 'Customer', hint: 'Renter details' },
  { key: 'extras', label: 'Extras & price', hint: 'Services, rate, status' },
  { key: 'review', label: 'Review', hint: 'Check and confirm' },
];

export interface ReservationWizardProps {
  open: boolean;
  mode: 'add' | 'edit';
  formData: Partial<Reservation>;
  onChange: (field: keyof Reservation, value: any) => void;
  onToggleExtra: (extraId: string) => void;
  durationDays: number;
  calculatedTotal: number;
  onSave: () => void;
  onClose: () => void;
  /** Shown when an unfinished new reservation was restored after a reload. */
  draftNotice?: { savedAt: number; onDiscard: () => void };
  rentalSources: RentalSource[];
  rentalLocations: RentalLocation[];
  fleet: Fleet;
  allData: AppData;
  newReservations?: Reservation[];
  availableExtras: AvailableExtra[];
  duplicateBookingIds: Set<string>;
  carModels?: string[];
}

const datePart = (v?: string) => (v ? v.slice(0, 10) : '');
const timePart = (v?: string) => (v && v.includes('T') ? v.split('T')[1].slice(0, 5) : '');
const joinDT = (d: string, t: string) => (d ? `${d}T${t || '10:00'}` : '');
const money = (n?: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}${iso.includes('T') ? `, ${iso.split('T')[1].slice(0, 5)}` : ''}`;
};

const ReservationWizard: React.FC<ReservationWizardProps> = ({
  open, mode, formData, onChange, onToggleExtra, durationDays, calculatedTotal, onSave, onClose,
  rentalSources, rentalLocations, fleet, allData, newReservations = [], availableExtras, duplicateBookingIds, carModels = [], draftNotice,
}) => {
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState<Record<number, boolean>>({});
  const [modelQuery, setModelQuery] = useState('');

  useEffect(() => { if (open) { setStep(0); setTried({}); setModelQuery(''); } }, [open]);
  // Keep the page behind the form still while it is open (no background scroll or bounce on phones).
  useEffect(() => {
    if (!open) return;
    const { overflow, overscrollBehavior } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => { document.body.style.overflow = overflow; document.body.style.overscrollBehavior = overscrollBehavior; };
  }, [open]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    const chip = chipsRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    chip?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [step]);

  const selectedExtras: string[] = ((formData as any).selectedExtras as string[]) || [];
  // Extras are charged per rental day (with the 2-hour grace), as on the agreement.
  const billDays = formData.startDate && formData.endDate ? rentalDaysOf(formData.startDate, formData.endDate) : 0;
  const rentalDays = formData.startDate && formData.endDate
    ? Math.max(1, Math.ceil((new Date(formData.endDate).getTime() - new Date(formData.startDate).getTime()) / 86400000))
    : 0;

  // ---- Booking-number checks ---------------------------------------------
  const bookingIdTaken = useMemo(() => {
    const id = bookingKey(formData);
    if (!id) return false;
    let hit = false;
    const check = (r: Reservation) => { if (!hit && r.id !== formData.id && bookingKey(r) === id) hit = true; };
    Object.values(allData || {}).forEach((months: any) => Object.values(months || {}).forEach((items: any) => (items as Reservation[]).forEach(check)));
    newReservations.forEach(check);
    return hit;
  }, [formData.bookingId, formData.id, allData, newReservations]);
  const bookingIdDuplicate = bookingIdTaken || duplicateBookingIds.has(bookingKey(formData));

  // ---- Fleet availability for the chosen dates ---------------------------
  const allReservations = useMemo(() => {
    const list: Reservation[] = [];
    Object.values(allData || {}).forEach((months: any) => Object.values(months || {}).forEach((items: any) => list.push(...(items as Reservation[]))));
    newReservations.forEach(r => { if (!list.some(x => x.id === r.id)) list.push(r); });
    return list;
  }, [allData, newReservations]);

  const groups = useMemo(() => {
    const start = formData.startDate ? new Date(formData.startDate).getTime() : NaN;
    const end = formData.endDate ? new Date(formData.endDate).getTime() : NaN;
    const haveDates = !Number.isNaN(start) && !Number.isNaN(end) && end > start;
    const byModel = new Map<string, Fleet>();
    (fleet || []).forEach(v => {
      const k = (v.modelName || '').trim();
      if (!k) return;
      byModel.set(k, [...(byModel.get(k) || []), v]);
    });
    return Array.from(byModel.entries()).map(([model, cars]) => {
      let free: number | null = null;
      if (haveDates) {
        const busyPlates = new Set<string>();
        let unassigned = 0;
        allReservations.forEach(r => {
          if (r.id === formData.id) return;
          if (r.status === ReservationStatus.CANCELLED || r.status === ReservationStatus.NO_SHOW) return;
          if (r.dropOffCompleted) {
            // returned early: busy only until the actual return
            const back = r.dropOffDateTime ? new Date(r.dropOffDateTime).getTime() : NaN;
            if (!Number.isNaN(back) && back <= start) return;
          }
          if ((r.carModel || '').trim() !== model) return;
          const rs = new Date(r.startDate).getTime();
          const re = new Date(r.endDate).getTime();
          if (Number.isNaN(rs) || Number.isNaN(re) || !(rs < end && re > start)) return;
          const plate = (r.licensePlate || '').trim();
          if (plate && cars.some(c => c.licensePlate === plate)) busyPlates.add(plate);
          else unassigned++;
        });
        free = Math.max(0, cars.length - busyPlates.size - unassigned);
      }
      const first = cars[0];
      return {
        model,
        cars,
        category: first.category || '—',
        transmission: Array.from(new Set(cars.map(c => c.transmission).filter(Boolean))).join(' / ') || '—',
        sipp: first.sippCode,
        deposit: first.securityDeposit,
        free,
      };
    }).sort((a, b) => a.category.localeCompare(b.category) || a.model.localeCompare(b.model));
  }, [fleet, allReservations, formData.startDate, formData.endDate, formData.id]);

  // Choosing a car brings its security deposit and excess from the fleet onto the booking.
  const pickModel = (model: string) => {
    onChange('carModel', model);
    const terms = depositTermsFor(fleet, formData.licensePlate, model);
    if (terms) { onChange('securityDeposit', terms.securityDeposit); onChange('excess', terms.excess); }
  };
  const visibleGroups = groups.filter(g => !modelQuery || `${g.model} ${g.category} ${g.sipp || ''}`.toLowerCase().includes(modelQuery.toLowerCase()));
  const modelInFleet = groups.some(g => g.model === (formData.carModel || '').trim());

  // ---- Validation --------------------------------------------------------
  const errorsFor = (i: number): Record<string, string> => {
    const e: Record<string, string> = {};
    const key = STEPS[i].key;
    if (key === 'dates') {
      if (!formData.startDate) e.startDate = 'Enter the pickup date.';
      if (!formData.endDate) e.endDate = 'Enter the return date.';
      if (formData.startDate && formData.endDate && new Date(formData.endDate).getTime() <= new Date(formData.startDate).getTime()) e.endDate = 'Return must be after pickup.';
      if (!(formData.bookingId || '').trim()) e.bookingId = 'Enter the booking ID.';
      if (sourceTakesBoth(sourceOf(formData, rentalSources)) && !formData.paymentType) e.paymentType = 'Choose prepaid or pay on arrival.';
    }
    if (key === 'vehicle' && !(formData.carModel || '').trim()) e.carModel = 'Choose a vehicle group or type a model.';
    if (key === 'customer' && !(formData.personName || '').trim()) e.personName = 'Enter the renter name.';
    if (key === 'extras' && (formData.amount || 0) < 0) e.amount = 'Amount cannot be negative.';
    return e;
  };
  const stepErrors = errorsFor(step);
  const showErr = (f: string) => (tried[step] ? stepErrors[f] : undefined);
  const stepDone = (i: number) => Object.keys(errorsFor(i)).length === 0;
  const firstInvalid = () => STEPS.findIndex((_, i) => i < STEPS.length - 1 && !stepDone(i));

  const next = () => {
    if (Object.keys(stepErrors).length) {
      setTried(t => ({ ...t, [step]: true }));
      // Bring the first highlighted field into view (the error hint is hidden on phones).
      setTimeout(() => bodyRef.current?.querySelector<HTMLElement>('.border-rose-400')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
      return;
    }
    setStep(s => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => setStep(s => Math.max(0, s - 1));
  const save = () => {
    const bad = firstInvalid();
    if (bad !== -1) { setTried(t => ({ ...t, [bad]: true })); setStep(bad); return; }
    onSave();
  };
  const jump = (i: number) => {
    if (mode === 'edit' || i <= step) { setStep(i); return; }
    // in add mode, only move forward through completed steps
    for (let k = step; k < i; k++) {
      if (!stepDone(k)) { setTried(t => ({ ...t, [k]: true })); setStep(k); return; }
    }
    setStep(i);
  };

  if (!open) return null;

  const Err = ({ f }: { f: string }) => (showErr(f) ? <span className="block mt-1 text-xs font-medium text-rose-600">{showErr(f)}</span> : null);
  const errCls = (f: string) => (showErr(f) ? ' border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : '');
  // Bookings store the source name (as imports do); older ones may hold the source id.
  const sourceName = rentalSources.find(s => s.name === formData.source || s.id === formData.source)?.name || formData.source || '—';
  // Bookings store the branch name; older ones may hold the branch id.
  const locationName = rentalLocations.find(l => l.name === formData.locationName || l.id === formData.locationName)?.name || formData.locationName || '—';
  const locationKnown = !formData.locationName || rentalLocations.some(l => l.name === formData.locationName);
  const extrasLines = availableExtras.filter(x => selectedExtras.includes(x.id)).map(x => {
    const perDay = extraDailyPrice(x);
    return { id: x.id, name: x.name, perDay, total: perDay * billDays };
  });
  const statusLabel: Record<string, string> = { CONFIRMED: 'Confirmed', COMPLETED: 'Completed', CANCELLED: 'Cancelled', NO_SHOW: 'No show', PENDING: 'Pending' };
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const ReviewPanel = ({ title, stepIdx, rows, media }: { title: string; stepIdx: number; rows: [string, React.ReactNode][]; media?: React.ReactNode }) => (
    <section className="rounded-xl border border-slate-200">
      <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        <button type="button" onClick={() => setStep(stepIdx)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Edit</button>
      </div>
      {media && <div className="px-4 pt-3">{media}</div>}
      <dl className="px-4 divide-y divide-slate-100 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 py-2">
            <dt className="text-slate-500 shrink-0">{k}</dt>
            <dd className="text-right text-slate-900 font-medium min-w-0 break-words">{v || '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={mode === 'add' ? 'New reservation' : 'Edit reservation'}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-5xl h-[100dvh] sm:h-[88vh] sm:max-h-[860px] sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between gap-3 px-4 sm:px-5 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-4 pb-3 sm:pb-4 border-b border-slate-200 bg-white">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{mode === 'add' ? 'New reservation' : `Edit reservation${formData.bookingId ? ` · ${formData.bookingId}` : ''}`}</p>
            <h3 className="text-base font-semibold text-slate-900 truncate">{current.label}</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Estimated total</p>
              <p className="text-sm font-semibold text-slate-900 tabular-nums">{money(calculatedTotal)}</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Phone step indicator */}
        <div className="md:hidden border-b border-slate-200 bg-slate-50/70">
          <div ref={chipsRef} className="flex gap-1.5 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {STEPS.map((s, i) => {
              const active = i === step;
              const done = i < STEPS.length - 1 && stepDone(i) && (i < step || mode === 'edit');
              const invalid = tried[i] && !stepDone(i);
              return (
                <button key={s.key} data-step={i} type="button" onClick={() => jump(i)} aria-current={active ? 'step' : undefined}
                  className={cx('shrink-0 inline-flex items-center gap-1.5 h-8 pl-1 pr-3 rounded-full text-xs font-semibold border transition-colors',
                    active ? 'bg-slate-900 border-slate-900 text-white' : invalid ? 'bg-rose-50 border-rose-200 text-rose-700' : done ? 'bg-white border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500')}>
                  <span className={cx('w-6 h-6 rounded-full inline-flex items-center justify-center text-[11px] tabular-nums',
                    active ? 'bg-white/15' : invalid ? 'bg-rose-100' : done ? 'bg-indigo-50' : 'bg-slate-100')}>
                    {done && !active && !invalid
                      ? <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
                      : i + 1}
                  </span>
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* Desktop step rail */}
          <nav className="hidden md:flex w-60 shrink-0 flex-col border-r border-slate-200 bg-slate-50/60 py-4" aria-label="Steps">
            <ol className="space-y-0.5 px-3">
              {STEPS.map((s, i) => {
                const active = i === step;
                const done = i < STEPS.length - 1 && stepDone(i) && (i < step || mode === 'edit');
                const invalid = tried[i] && !stepDone(i);
                return (
                  <li key={s.key}>
                    <button type="button" onClick={() => jump(i)} aria-current={active ? 'step' : undefined}
                      className={cx('w-full flex items-start gap-3 px-2.5 py-2 rounded-lg text-left transition-colors', active ? 'bg-white shadow-sm ring-1 ring-slate-200' : 'hover:bg-white/70')}>
                      <span className={cx('mt-0.5 w-6 h-6 shrink-0 rounded-full inline-flex items-center justify-center text-[11px] font-semibold tabular-nums',
                        invalid ? 'bg-rose-100 text-rose-700' : active ? 'bg-indigo-600 text-white' : done ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200' : 'bg-white text-slate-500 ring-1 ring-inset ring-slate-300')}>
                        {done && !active && !invalid ? (
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
                        ) : i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className={cx('block text-[13px] font-semibold', active ? 'text-slate-900' : 'text-slate-700')}>{s.label}</span>
                        <span className="block text-[11px] text-slate-500">{invalid ? 'Needs attention' : s.hint}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="mt-auto mx-3 rounded-lg border border-slate-200 bg-white p-3 text-[12px] space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Summary</p>
              <p className="text-slate-700 truncate">{formData.personName || <span className="text-slate-400">No renter yet</span>}</p>
              <p className="text-slate-700 truncate">{formData.carModel || <span className="text-slate-400">No vehicle yet</span>}</p>
              <p className="text-slate-500 tabular-nums">{rentalDays ? `${rentalDays} day${rentalDays === 1 ? '' : 's'}` : 'No dates yet'}</p>
              <p className="pt-1 border-t border-slate-100 font-semibold text-slate-900 tabular-nums">{money(calculatedTotal)}</p>
            </div>
          </nav>

          {/* Step body */}
          <div ref={bodyRef} className="flex-1 min-w-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-5 pb-8 text-[13px] [-webkit-overflow-scrolling:touch]">
            {draftNotice && (
              <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-sky-900"><b>Unfinished reservation restored.</b> The details entered on {new Date(draftNotice.savedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} were kept.</p>
                <button type="button" onClick={draftNotice.onDiscard} className="h-8 px-3 rounded-md text-[13px] font-medium text-rose-700 hover:bg-rose-50">Discard and start over</button>
              </div>
            )}
            {current.key === 'dates' && (
              <div className="space-y-6 max-w-3xl">
                <div>
                  <SectionLabel className="mb-3">Rental period</SectionLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 mb-2">Pickup</p>
                      <div className="grid grid-cols-[1fr_7rem] gap-2">
                        <Field label="Date" required>
                          <input type="date" value={datePart(formData.startDate)} onChange={e => onChange('startDate', joinDT(e.target.value, timePart(formData.startDate)))} className={inputCls + errCls('startDate')} />
                        </Field>
                        <Field label="Time">
                          <input type="time" value={timePart(formData.startDate)} disabled={!formData.startDate} onChange={e => onChange('startDate', joinDT(datePart(formData.startDate), e.target.value))} className={inputCls} />
                        </Field>
                      </div>
                      <Err f="startDate" />
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-600 mb-2">Return</p>
                      <div className="grid grid-cols-[1fr_7rem] gap-2">
                        <Field label="Date" required>
                          <input type="date" value={datePart(formData.endDate)} min={datePart(formData.startDate) || undefined} onChange={e => onChange('endDate', joinDT(e.target.value, timePart(formData.endDate) || timePart(formData.startDate)))} className={inputCls + errCls('endDate')} />
                        </Field>
                        <Field label="Time">
                          <input type="time" value={timePart(formData.endDate)} disabled={!formData.endDate} onChange={e => onChange('endDate', joinDT(datePart(formData.endDate), e.target.value))} className={inputCls} />
                        </Field>
                      </div>
                      <Err f="endDate" />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                    <span className="text-slate-500">Rental days</span>
                    <span className="font-semibold text-slate-900 tabular-nums">{rentalDays || '—'}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">Exact duration</span>
                    <span className="font-medium text-slate-700 tabular-nums">{durationDays.toFixed(1)} days</span>
                  </div>
                </div>

                <div>
                  <SectionLabel className="mb-3">Branch & channel</SectionLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Location">
                      <select value={formData.locationName || ''} onChange={e => onChange('locationName', e.target.value)} className={selectCls + ' w-full'}>
                        <option value="">Select location</option>
                        {!locationKnown && <option value={formData.locationName}>{locationName}</option>}
                        {rentalLocations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Source">
                      <select value={formData.source || ''} onChange={e => { onChange('source', e.target.value); if (!sourceTakesBoth(sourceOf({ source: e.target.value }, rentalSources))) onChange('paymentType', undefined); }} className={selectCls + ' w-full'}>
                        <option value="">Select source</option>
                        {formData.source && !rentalSources.some(s => s.name === formData.source) && <option value={formData.source}>{sourceName}</option>}
                        {rentalSources.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                    </Field>
                  </div>
                  {formData.source && (
                    <div className="mt-4">
                      <PaymentChoice source={sourceOf(formData, rentalSources)} value={formData.paymentType} onChange={v => onChange('paymentType', v)} error={showErr('paymentType')} />
                    </div>
                  )}
                </div>

                <div>
                  <SectionLabel className="mb-3">Booking</SectionLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Field label="Booking ID" required>
                        <input type="text" value={formData.bookingId || ''} onChange={e => onChange('bookingId', e.target.value)} placeholder="BK-1001" className={inputCls + ' font-mono' + errCls('bookingId')} />
                      </Field>
                      <Err f="bookingId" />
                      {bookingIdDuplicate && (formData.bookingId || '').trim() && (
                        <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 text-xs text-amber-800">
                          <span><span className="font-semibold">Already in the system:</span> {mode === 'edit' ? 'another record uses this booking ID.' : 'saving updates that booking instead of adding a second one.'}</span>
                        </p>
                      )}
                    </div>
                    <Field label="Booking date">
                      <input type="date" value={formData.bookingDate ? formData.bookingDate.split('T')[0] : ''} onChange={e => onChange('bookingDate', e.target.value)} className={inputCls} />
                    </Field>
                  </div>
                </div>
              </div>
            )}

            {current.key === 'vehicle' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                  <p className="text-slate-500">
                    {formData.startDate && formData.endDate
                      ? <>Availability for <span className="font-medium text-slate-800">{fmt(formData.startDate)}</span> → <span className="font-medium text-slate-800">{fmt(formData.endDate)}</span></>
                      : 'Set the rental dates to see free cars per group.'}
                  </p>
                  {groups.length > 0 && (
                    <input type="text" value={modelQuery} onChange={e => setModelQuery(e.target.value)} placeholder="Filter models" className={inputCls + ' sm:w-56'} />
                  )}
                </div>
                <Err f="carModel" />

                {groups.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300">
                    <EmptyState title="No fleet on file" hint="Type the car model for this booking below." className="py-8" />
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="hidden md:table w-full text-[13px]">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 text-left">
                        <tr>
                          <th className="font-semibold px-3 py-2.5 pl-4 w-8"><span className="sr-only">Select</span></th>
                          <th className="font-semibold px-3 py-2.5">Model</th>
                          <th className="font-semibold px-3 py-2.5">Category</th>
                          <th className="font-semibold px-3 py-2.5">Transmission</th>
                          <th className="font-semibold px-3 py-2.5 text-right">Cars</th>
                          <th className="font-semibold px-3 py-2.5 pr-4 text-right">Free</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleGroups.map(g => {
                          const sel = (formData.carModel || '').trim() === g.model;
                          return (
                            <tr key={g.model} onClick={() => pickModel(g.model)} className={cx('cursor-pointer transition-colors', sel ? 'bg-indigo-50/70' : 'hover:bg-slate-50')}>
                              <td className="px-3 py-2.5 pl-4">
                                <span className={cx('w-4 h-4 rounded-full border inline-flex items-center justify-center', sel ? 'border-indigo-600' : 'border-slate-300')}>{sel && <span className="w-2 h-2 rounded-full bg-indigo-600" />}</span>
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-3">
                                  <CarPicture fleet={fleet} model={g.model} className="w-14 h-9" artClassName="w-12 h-7 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-900 truncate">{g.model}</p>
                                    <p className="text-[11px] text-slate-500">{g.sipp || vehicleKindLabel[vehicleKind(g.model, fleet)]}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-slate-700">{g.category}</td>
                              <td className="px-3 py-2.5 text-slate-700">{g.transmission}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{g.cars.length}</td>
                              <td className="px-3 py-2.5 pr-4 text-right">
                                {g.free === null ? <span className="text-slate-400">—</span>
                                  : <Badge tone={g.free === 0 ? 'danger' : g.free <= 1 ? 'warning' : 'success'}><span className="tabular-nums">{g.free} free</span></Badge>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <ul className="md:hidden divide-y divide-slate-100">
                      {visibleGroups.map(g => {
                        const sel = (formData.carModel || '').trim() === g.model;
                        return (
                          <li key={g.model}>
                            <button type="button" onClick={() => pickModel(g.model)} className={cx('w-full text-left px-4 py-3 flex items-center gap-3', sel ? 'bg-indigo-50/70' : '')}>
                              <span className={cx('w-4 h-4 shrink-0 rounded-full border inline-flex items-center justify-center', sel ? 'border-indigo-600' : 'border-slate-300')}>{sel && <span className="w-2 h-2 rounded-full bg-indigo-600" />}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block font-medium text-slate-900 truncate">{g.model}</span>
                                <span className="block text-[11px] text-slate-500 truncate">{g.category} · {g.transmission} · {g.cars.length} car{g.cars.length === 1 ? '' : 's'}</span>
                              </span>
                              {g.free !== null && <Badge tone={g.free === 0 ? 'danger' : g.free <= 1 ? 'warning' : 'success'}><span className="tabular-nums">{g.free} free</span></Badge>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {visibleGroups.length === 0 && <p className="px-4 py-6 text-center text-slate-500">No models match the filter.</p>}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <Field label={groups.length ? 'Or type another model' : 'Car model'} required={!groups.length} hint={formData.carModel && !modelInFleet && groups.length ? 'This model is not in the fleet list.' : undefined}>
                    <input type="text" list="res-wizard-models" value={formData.carModel || ''} onChange={e => pickModel(e.target.value)} placeholder="e.g. Toyota Corolla" className={inputCls + errCls('carModel')} />
                    <datalist id="res-wizard-models">{carModels.map(m => <option key={m} value={m} />)}</datalist>
                  </Field>
                  {formData.licensePlate && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 self-end">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Assigned car</p>
                      <p className="font-mono font-semibold text-slate-800">{formData.licensePlate}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {current.key === 'customer' && (
              <div className="space-y-4 max-w-3xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Field label="Renter name" required>
                      <input type="text" value={formData.personName || ''} onChange={e => onChange('personName', e.target.value)} placeholder="John Doe" className={inputCls + errCls('personName')} autoFocus />
                    </Field>
                    <Err f="personName" />
                  </div>
                  <Field label="Phone">
                    <input type="tel" value={formData.contactNumber || ''} onChange={e => onChange('contactNumber', e.target.value)} placeholder="+1 234 567 890" className={inputCls} />
                  </Field>
                  <Field label="Email">
                    <input type="email" value={formData.customerEmail || ''} onChange={e => onChange('customerEmail', e.target.value)} placeholder="name@example.com" className={inputCls} />
                  </Field>
                  <Field label="Reservation notes" className="sm:col-span-2">
                    <textarea rows={4} value={formData.notes || ''} onChange={e => onChange('notes', e.target.value)} placeholder="Any special requests or notes..." className={textareaCls + ' resize-none'} />
                  </Field>
                </div>
              </div>
            )}

            {current.key === 'extras' && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-6">
                <div className="space-y-5 min-w-0">
                  <div>
                    <SectionLabel className="mb-3">Rate & status</SectionLabel>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Field label="Base amount ($)" hint="Rental charge before extras.">
                          <input type="number" min="0" step="0.01" value={formData.amount || 0} onChange={e => onChange('amount', parseFloat(e.target.value) || 0)} className={inputCls + ' tabular-nums font-semibold' + errCls('amount')} />
                        </Field>
                        <Err f="amount" />
                        {rentalDays > 0 && (formData.amount || 0) > 0 && <p className="mt-1 text-xs text-slate-500 tabular-nums">≈ {money((formData.amount || 0) / rentalDays)} per day</p>}
                      </div>
                      <Field label="Status">
                        <select value={formData.status} onChange={e => onChange('status', e.target.value)} className={selectCls + ' w-full'}>
                          <option value={ReservationStatus.CONFIRMED}>Confirmed</option>
                          <option value={ReservationStatus.PENDING}>Pending</option>
                          <option value={(ReservationStatus as any).COMPLETED}>Completed</option>
                          <option value={ReservationStatus.CANCELLED}>Cancelled</option>
                          <option value="NO_SHOW">No Show</option>
                        </select>
                      </Field>
                    </div>
                  </div>
                  <div>
                    <SectionLabel className="mb-3">Additional services</SectionLabel>
                    {availableExtras.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-slate-500">No extras are configured.</p>
                    ) : (
                      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                        {availableExtras.map(extra => {
                          const on = selectedExtras.includes(extra.id);
                          const perDay = extraDailyPrice(extra);
                          return (
                            <label key={extra.id} className={cx('flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors', on ? 'bg-indigo-50/50' : 'hover:bg-slate-50')}>
                              <input type="checkbox" checked={on} onChange={() => onToggleExtra(extra.id)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                              <span className={cx('flex-1 min-w-0 truncate', on ? 'font-semibold text-slate-900' : 'text-slate-700')}>{extra.name}</span>
                              <span className="text-[11px] text-slate-500 tabular-nums">${perDay}/day</span>
                              {on && perDay ? <span className="w-20 text-right font-medium text-slate-900 tabular-nums">{money(perDay * billDays)}</span> : <span className="w-20" />}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <aside className="rounded-xl border border-slate-200 bg-slate-50 self-start text-[13px]">
                  <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Price</p>
                  <dl className="px-4 divide-y divide-slate-200">
                    <div className="flex justify-between py-2"><dt className="text-slate-500">Duration</dt><dd className="font-medium tabular-nums">{durationDays.toFixed(1)} days</dd></div>
                    <div className="flex justify-between py-2"><dt className="text-slate-500">Base amount</dt><dd className="font-medium tabular-nums">${(formData.amount || 0).toFixed(2)}</dd></div>
                    {extrasLines.map(x => <div key={x.id} className="flex justify-between gap-3 py-2"><dt className="text-slate-500 truncate">{x.name}</dt><dd className="font-medium tabular-nums">${x.total.toFixed(2)}</dd></div>)}
                  </dl>
                  <div className="px-4 py-3 border-t border-slate-300 flex items-baseline justify-between">
                    <span className="font-semibold text-slate-900">Estimated total</span>
                    <span className="text-lg font-semibold text-slate-900 tabular-nums">${calculatedTotal.toFixed(2)}</span>
                  </div>
                </aside>
              </div>
            )}

            {current.key === 'review' && (
              <div className="space-y-4">
                {firstInvalid() !== -1 && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    Some required details are missing. <button type="button" className="font-semibold underline" onClick={() => { const b = firstInvalid(); setTried(t => ({ ...t, [b]: true })); setStep(b); }}>Go to {STEPS[firstInvalid()].label}</button>
                  </div>
                )}
                {bookingIdDuplicate && (formData.bookingId || '').trim() && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Booking ID {formData.bookingId} is already in the system. {mode === 'edit' ? 'Change it, or delete the other record, so the booking is not counted twice.' : 'Saving updates that booking — no second booking is added.'}</div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ReviewPanel title="Dates & branch" stepIdx={0} rows={[
                    ['Pickup', fmt(formData.startDate)],
                    ['Return', fmt(formData.endDate)],
                    ['Rental days', rentalDays ? `${rentalDays} (${durationDays.toFixed(1)} exact)` : '—'],
                    ['Location', locationName],
                    ['Source', sourceName],
                    ['Payment', (() => { const t = bookingPayment(formData, rentalSources); return t ? PAYMENT_LABEL[t] : formData.source ? <span className="text-rose-600">Not chosen</span> : '—'; })()],
                    ['Booking date', formData.bookingDate ? fmt(formData.bookingDate.split('T')[0]) : '—'],
                    ['Booking ID', <span className="font-mono">{formData.bookingId || '—'}</span>],
                  ]} />
                  <ReviewPanel title="Vehicle" stepIdx={1} media={formData.carModel ? <CarShowcase fleet={fleet} plate={formData.licensePlate} model={formData.carModel} /> : undefined} rows={[
                    ['Model', formData.carModel || '—'],
                    ...(() => { const g = groups.find(x => x.model === (formData.carModel || '').trim()); return g ? [['Category', g.category], ['Transmission', g.transmission], ['Free for dates', g.free === null ? '—' : `${g.free} of ${g.cars.length}`]] as [string, React.ReactNode][] : []; })(),
                    ...(formData.licensePlate ? [['Assigned plate', <span className="font-mono">{formData.licensePlate}</span>]] as [string, React.ReactNode][] : []),
                  ]} />
                  <ReviewPanel title="Customer" stepIdx={2} rows={[
                    ['Renter', formData.personName || '—'],
                    ['Phone', formData.contactNumber || '—'],
                    ['Email', formData.customerEmail || '—'],
                    ['Notes', formData.notes ? <span className="whitespace-pre-wrap font-normal">{formData.notes}</span> : '—'],
                  ]} />
                  <section className="rounded-xl border border-slate-200">
                    <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-900">Extras & price</h4>
                      <button type="button" onClick={() => setStep(3)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Edit</button>
                    </div>
                    <dl className="px-4 divide-y divide-slate-100 text-[13px]">
                      <div className="flex justify-between py-2"><dt className="text-slate-500">Status</dt><dd className="font-medium">{statusLabel[String(formData.status)] || String(formData.status || '—')}</dd></div>
                      <div className="flex justify-between py-2"><dt className="text-slate-500">Base amount</dt><dd className="font-medium tabular-nums">{money(formData.amount)}</dd></div>
                      {extrasLines.map(x => <div key={x.id} className="flex justify-between gap-3 py-2"><dt className="text-slate-500 truncate">{x.name}</dt><dd className="font-medium tabular-nums">{money(x.total)}</dd></div>)}
                    </dl>
                    <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl flex items-baseline justify-between">
                      <span className="font-semibold text-slate-900">Total</span>
                      <span className="text-xl font-semibold text-slate-900 tabular-nums">{money(calculatedTotal)}</span>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-200 bg-white sm:bg-slate-50 flex items-center gap-2 shadow-[0_-4px_12px_-8px_rgba(15,23,42,0.18)] sm:shadow-none">
          <Button variant="ghost" onClick={onClose} className="hidden sm:inline-flex">Cancel</Button>
          <div className="sm:hidden min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total · {rentalDays || 0} day{rentalDays === 1 ? '' : 's'}</p>
            <p className="text-[15px] font-semibold text-slate-900 tabular-nums truncate">{money(calculatedTotal)}</p>
          </div>
          {Object.keys(stepErrors).length > 0 && tried[step] && <span className="hidden sm:inline text-xs font-medium text-rose-600">Complete the highlighted fields.</span>}
          <div className="ml-auto flex items-center gap-2">
            {step > 0 && <Button variant="secondary" onClick={back} className="max-sm:h-11 max-sm:px-4">Back</Button>}
            {mode === 'edit' && !isLast && <Button variant="secondary" onClick={save} className="max-sm:h-11 max-sm:px-3"><span className="sm:hidden">Save</span><span className="hidden sm:inline">Save changes</span></Button>}
            {isLast
              ? <Button variant="primary" onClick={save} className="max-sm:h-11 max-sm:px-5">{mode === 'add' ? 'Create reservation' : 'Save changes'}</Button>
              : <Button variant="primary" onClick={next} className="max-sm:h-11 max-sm:px-6">Next</Button>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReservationWizard;
