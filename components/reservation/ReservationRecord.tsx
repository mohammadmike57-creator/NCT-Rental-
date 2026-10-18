import React, { useState } from 'react';
import { Fleet, Reservation } from '../../types';
import { Badge, Tabs, SectionLabel } from '../ui/Crm';
import { VehicleArt, vehicleKind, vehicleKindLabel } from '../VehicleGraphics';

/*
 * Full booking record (RentWay "reservation card"): header with lifecycle
 * track, primary + quick actions, then tabs for overview, charges, agreement,
 * documents and history. All actions come from the parent (actionsFor), so
 * permissions stay in one place.
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export type RecordAction = { key: string; label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean; section: 'documents' | 'booking' | 'danger' };

export interface ReservationRecordProps {
  res: Reservation;
  stage: 'ready' | 'onrent' | 'closed' | 'pending' | 'cancelled';
  statusBadge: React.ReactNode;
  alert: { label: string } | null;
  primaryAction: React.ReactNode;
  showPrimary: boolean;
  actions: RecordAction[];
  sourceName: string;
  fleet: Fleet;
  onClose: () => void;
}

const money = (n?: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const timeOf = (iso?: string) => (iso && iso.includes('T') ? iso.split('T')[1].slice(0, 5) : '');
const dayDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
};
const longDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};
const stamp = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};
const shortStamp = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};
const checklistCount = (c?: { [k: string]: boolean }) => {
  if (!c) return null;
  const keys = Object.keys(c);
  if (!keys.length) return null;
  return `${keys.filter(k => c[k]).length} of ${keys.length} checked`;
};
const yesNo = (v?: string) => (v ? <span className="text-emerald-700">Signed</span> : <span className="text-slate-400 font-normal">Missing</span>);

const Row = ({ label, children }: { label: React.ReactNode; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 py-2">
    <dt className="text-slate-500 shrink-0">{label}</dt>
    <dd className="text-right text-slate-900 font-medium min-w-0 break-words">{children}</dd>
  </div>
);
const Section = ({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) => (
  <section className="px-5 py-4 border-b border-slate-100">
    <div className="flex items-center justify-between mb-1">
      <SectionLabel>{title}</SectionLabel>
      {actions}
    </div>
    {children}
  </section>
);
const Muted = ({ children }: { children: React.ReactNode }) => <span className="text-slate-400 font-normal">{children}</span>;

type TabKey = 'overview' | 'charges' | 'agreement' | 'documents' | 'history';

const ReservationRecord: React.FC<ReservationRecordProps> = ({ res, stage, statusBadge, alert, primaryAction, showPrimary, actions, sourceName, fleet, onClose }) => {
  const [tab, setTab] = useState<TabKey>('overview');

  const kind = vehicleKind(res.carModel, fleet);
  const days = res.startDate && res.endDate ? Math.max(1, Math.ceil((new Date(res.endDate).getTime() - new Date(res.startDate).getTime()) / 86400000)) : 0;
  const quickActs = actions.filter(a => a.section === 'booking');
  const docActs = actions.filter(a => a.section === 'documents');
  const danger = actions.filter(a => a.section === 'danger');
  const extras = res.extras || [];
  const extrasTotal = extras.reduce((s, e) => s + (e.isComplementary ? 0 : (e.dailyPrice || 0) * days), 0);
  const extensions = res.extensionHistory || [];
  const extensionsTotal = extensions.reduce((s, x) => s + (x.cost || 0), 0);
  const rentalAmount = res.baseAmount ?? Math.max(0, (res.amount || 0) - extrasTotal - extensionsTotal);
  const rc = res.returnCharges;
  const rcItems = rc?.items || [];
  const rcTotal = rcItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const rcOutstanding = rcItems.length > 0 && rc?.settlement !== 'paid' ? rcTotal : 0;
  const lateFee = res.lateReturnFee;
  const lateOutstanding = lateFee && !lateFee.isWaived && lateFee.status === 'PENDING' ? lateFee.amount || 0 : 0;
  const outstandingUsd = (res.unpaidExtensionAmount || 0) + lateOutstanding;
  const exchanges = res.carExchanges || [];
  const emails = res.agreementEmails || [];

  // ---- Lifecycle track ---------------------------------------------------
  const terminal = stage === 'cancelled' || stage === 'pending';
  const closedAt = res.dropOffCompleted ? (rc?.issuedAt || res.dropOffDateTime) : undefined;
  const isClosed = !!res.dropOffCompleted && rcOutstanding === 0 && outstandingUsd === 0;
  const track = [
    { label: 'Booked', done: true, at: res.createdAt || res.bookingDate },
    { label: 'Checked out', done: !!res.voucherSubmitted, at: res.pickupDateTime },
    { label: 'Returned', done: !!res.dropOffCompleted, at: res.dropOffDateTime },
    { label: 'Closed', done: isClosed, at: isClosed ? closedAt : undefined },
  ];
  const currentIdx = track.reduce((acc, s, i) => (s.done ? i : acc), 0);

  // ---- History -----------------------------------------------------------
  type Ev = { at?: string; title: string; detail?: string; tone: 'default' | 'info' | 'success' | 'warning' | 'danger' };
  const events: Ev[] = [];
  if (res.createdAt || res.createdBy) events.push({ at: res.createdAt, title: res.awaitingConfirmation || res.unlistedCreatedBy ? 'Booking created from unlisted agreement' : 'Booking created', detail: res.unlistedCreatedBy || res.createdBy ? `by ${res.unlistedCreatedBy || res.createdBy}` : undefined, tone: 'default' });
  if (res.unlistedCreatedAt && res.unlistedCreatedAt !== res.createdAt) events.push({ at: res.unlistedCreatedAt, title: 'Unlisted agreement opened', detail: res.unlistedCreatedBy ? `by ${res.unlistedCreatedBy}` : undefined, tone: 'warning' });
  if (res.confirmedAt || res.confirmedBy) events.push({ at: res.confirmedAt, title: res.status === 'CANCELLED' ? 'Booking rejected' : 'Booking confirmed', detail: res.confirmedBy ? `by ${res.confirmedBy}` : undefined, tone: res.status === 'CANCELLED' ? 'danger' : 'success' });
  (res.upgradeHistory || []).forEach(u => events.push({ at: u.date, title: 'Vehicle upgraded', detail: `${u.fromCar ? `${u.fromCar} → ` : ''}${u.toCar}${u.fee ? ` · ${money(u.fee)}` : ' · free'}${u.by ? ` · by ${u.by}` : ''}`, tone: 'info' }));
  extensions.forEach(x => events.push({ at: x.extensionDate, title: `Rental extended +${x.days} day${x.days === 1 ? '' : 's'}`, detail: `New return ${longDate(x.newEndDate)} · ${money(x.cost)} · ${x.paymentMethod === 'payLater' ? 'pay later' : 'paid'}`, tone: 'info' }));
  if (res.voucherSubmitted) events.push({ at: res.pickupDateTime, title: 'Checked out', detail: [res.pickupAgentName && `by ${res.pickupAgentName}`, res.licensePlate, res.pickupKmOut ? `${res.pickupKmOut.toLocaleString()} km` : ''].filter(Boolean).join(' · '), tone: 'success' });
  exchanges.forEach(x => events.push({ at: x.exchangeDate, title: 'Car exchanged', detail: `${x.oldCarLicensePlate} → ${x.newCarLicensePlate}${x.reason ? ` · ${x.reason}` : ''}`, tone: 'warning' }));
  if (res.dropOffCompleted) events.push({ at: res.dropOffDateTime, title: 'Checked in (returned)', detail: [res.dropOffAgentName && `by ${res.dropOffAgentName}`, res.dropOffKmIn ? `${res.dropOffKmIn.toLocaleString()} km` : ''].filter(Boolean).join(' · '), tone: 'success' });
  if (lateFee) events.push({ at: lateFee.feeAppliedDate, title: `Late return fee ${lateFee.status.toLowerCase()}`, detail: `${lateFee.hoursLate} h late · ${money(lateFee.amount)}`, tone: lateFee.isWaived ? 'default' : 'warning' });
  if (rc?.issuedAt) events.push({ at: rc.issuedAt, title: 'Return charges issued', detail: `${rc.currency} ${rcTotal.toFixed(2)} · ${rc.settlement === 'paid' ? 'paid' : 'claim'}${rc.issuedBy ? ` · by ${rc.issuedBy}` : ''}`, tone: 'warning' });
  (rc?.emails || []).forEach(m => events.push({ at: m.sentAt, title: 'Return charges emailed', detail: m.to, tone: 'default' }));
  emails.forEach(m => events.push({ at: m.sentAt, title: `Agreement emailed · ${m.kind}`, detail: m.to, tone: 'default' }));
  if (res.deferredPaymentCollectedOn) events.push({ at: res.deferredPaymentCollectedOn, title: 'Deferred payment collected', tone: 'success' });
  const dated = events.filter(e => e.at).sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  const undated = events.filter(e => !e.at);
  const toneDot: Record<Ev['tone'], string> = { default: 'bg-slate-400', info: 'bg-sky-500', success: 'bg-emerald-500', warning: 'bg-amber-500', danger: 'bg-rose-500' };

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'charges', label: 'Charges' },
    { key: 'agreement', label: 'Agreement' },
    { key: 'documents', label: 'Documents & emails', count: emails.length || undefined },
    { key: 'history', label: 'History', count: events.length || undefined },
  ];

  const agreementBlock = (side: 'out' | 'in') => {
    const out = side === 'out';
    const done = out ? res.voucherSubmitted : res.dropOffCompleted;
    const checklist = out ? (res.pickupChecklist || res.checklist) : res.dropOffChecklist;
    const marks = out ? (res.pickupDamageMarkers || res.damageMarkers) : res.dropOffDamageMarkers;
    const renterSig = out ? (res.pickupRenterSignature || res.renterSignature) : res.dropOffRenterSignature;
    const agentSig = out ? (res.pickupAgentSignature || res.agentSignature) : res.dropOffAgentSignature;
    const agent = out ? (res.pickupAgentName || res.agentName) : res.dropOffAgentName;
    const km = out ? res.pickupKmOut : res.dropOffKmIn;
    const fuel = out ? res.pickupFuelLevel : res.dropOffFuelLevel;
    const notes = out ? res.pickupNotes : res.dropOffNotes;
    return (
      <Section title={out ? 'Check-out' : 'Check-in'} actions={done ? <Badge tone="success">Completed</Badge> : <Badge tone="muted" dot={false}>Not yet</Badge>}>
        <dl className="divide-y divide-slate-100">
          <Row label="Date & time">{done ? stamp(out ? res.pickupDateTime : res.dropOffDateTime) : <Muted>—</Muted>}</Row>
          <Row label="Agent">{agent || <Muted>—</Muted>}</Row>
          <Row label={out ? 'Km out' : 'Km in'}>{km ? <span className="tabular-nums">{km.toLocaleString()} km</span> : <Muted>—</Muted>}</Row>
          <Row label="Fuel">{fuel !== undefined && fuel !== null ? <span className="tabular-nums">{fuel}/8</span> : <Muted>—</Muted>}</Row>
          <Row label="Checklist">{checklistCount(checklist) || <Muted>—</Muted>}</Row>
          <Row label="Damage marks">{marks && marks.length ? <span className="tabular-nums">{marks.length}</span> : <Muted>None</Muted>}</Row>
          <Row label="Renter signature">{yesNo(renterSig)}</Row>
          <Row label="Agent signature">{yesNo(agentSig)}</Row>
          {!out && km && res.pickupKmOut ? <Row label="Distance driven"><span className="tabular-nums">{(km - res.pickupKmOut).toLocaleString()} km</span></Row> : null}
        </dl>
        {notes && <p className="mt-1 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-slate-700 whitespace-pre-wrap">{notes}</p>}
      </Section>
    );
  };

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={`Reservation ${res.bookingId}`}>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 w-full sm:w-[640px] bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <header className="px-5 pt-4 pb-3 border-b border-slate-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Reservation record</span>
              <span className="font-mono text-sm font-semibold text-slate-900">{res.bookingId || 'NO-ID'}</span>
            </div>
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <h3 className="text-xl font-semibold text-slate-900 tracking-tight truncate">{res.personName || 'Unnamed'}</h3>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-500">
                {res.contactNumber && <a href={`tel:${res.contactNumber}`} className="hover:text-indigo-600">{res.contactNumber}</a>}
                {res.customerEmail && <a href={`mailto:${res.customerEmail}`} className="hover:text-indigo-600 truncate">{res.customerEmail}</a>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total</p>
              <p className="text-lg font-semibold text-slate-900 tabular-nums">{money(res.amount)}</p>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {statusBadge}
            {alert && <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${/overdue/i.test(alert.label) ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700'}`}>{alert.label}</span>}
            {res.awaitingConfirmation && <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700">Awaiting confirmation</span>}
            {res.paymentConfirmationPending && <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700">Payment approval pending</span>}
            {(outstandingUsd > 0 || rcOutstanding > 0) && <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-700">Balance outstanding</span>}
          </div>

          {/* Lifecycle */}
          {terminal ? (
            <div className={cx('mt-3 rounded-lg border px-3 py-2 text-xs flex items-center gap-2', stage === 'cancelled' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-800')}>
              <span className={cx('w-2 h-2 rounded-full', stage === 'cancelled' ? 'bg-rose-500' : 'bg-amber-500')} />
              <span className="font-semibold">{stage === 'cancelled' ? (res.status === 'NO_SHOW' ? 'No show' : 'Cancelled') : 'Pending'}</span>
              <span className="text-slate-600">{stage === 'cancelled' ? (res.confirmedAt ? `· ${stamp(res.confirmedAt)}${res.confirmedBy ? ` by ${res.confirmedBy}` : ''}` : '· this booking will not run') : res.awaitingConfirmation ? '· waiting for a supervisor to confirm' : '· not yet confirmed'}</span>
            </div>
          ) : (
            <ol className="mt-3 grid grid-cols-4" aria-label="Rental progress">
              {track.map((s, i) => (
                <li key={s.label} className="relative min-w-0">
                  {i > 0 && <span className={cx('absolute top-[7px] right-1/2 w-full h-0.5', s.done ? 'bg-indigo-600' : 'bg-slate-200')} aria-hidden="true" />}
                  <span className="relative flex flex-col items-center text-center">
                    <span className={cx('w-4 h-4 rounded-full border-2 bg-white', s.done ? 'border-indigo-600' : 'border-slate-300', s.done && i === currentIdx && 'bg-indigo-600')} />
                    <span className={cx('mt-1 text-[11px] font-semibold truncate max-w-full', s.done ? 'text-slate-900' : 'text-slate-400')}>{s.label}</span>
                    <span className="text-[10.5px] text-slate-500 tabular-nums truncate max-w-full">{s.done && s.at ? shortStamp(s.at) : ''}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </header>

        {/* Actions */}
        {(showPrimary || quickActs.length > 0) && (
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row gap-2">
            {showPrimary && <div className="flex sm:w-44 [&>button]:flex-1 [&>button]:h-9">{primaryAction}</div>}
            {quickActs.length > 0 && (
              <div className="flex-1 grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                {quickActs.map(a => (
                  <button key={a.key} onClick={a.onClick} className="h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50">
                    <span className="text-slate-400">{a.icon}</span>{a.label.replace(' reservation', '')}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <Tabs tabs={tabs} value={tab} onChange={k => setTab(k as TabKey)} />

        <div className="flex-1 overflow-y-auto text-[13px]">
          {tab === 'overview' && (
            <>
              <Section title="Rental">
                <div className="grid grid-cols-2 gap-3 py-2">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Pickup</p>
                    <p className="mt-1 font-semibold text-slate-900">{longDate(res.startDate)}</p>
                    <p className="text-slate-500">{timeOf(res.startDate) || '—'}{res.locationName ? ` · ${res.locationName}` : ''}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-600">Return</p>
                    <p className="mt-1 font-semibold text-slate-900">{longDate(res.endDate)}</p>
                    <p className="text-slate-500">{timeOf(res.endDate) || '—'}</p>
                  </div>
                </div>
                <dl className="divide-y divide-slate-100">
                  <Row label="Duration">{days} day{days === 1 ? '' : 's'}</Row>
                  <Row label="Branch">{res.locationName || '—'}</Row>
                  <Row label="Source">{sourceName || '—'}</Row>
                  <Row label="Booked on">{longDate(res.bookingDate)}</Row>
                  {res.createdBy && <Row label="Created by">{res.createdBy}</Row>}
                  {res.lastEditedBy && <Row label="Last edited by">{res.lastEditedBy}</Row>}
                  {res.confirmedBy && <Row label="Confirmed by">{res.confirmedBy}{res.confirmedAt ? ` · ${stamp(res.confirmedAt)}` : ''}</Row>}
                </dl>
              </Section>

              <Section title="Vehicle">
                <div className="flex items-center gap-3 py-2">
                  <VehicleArt kind={kind} className="w-16 h-9 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{res.carModel || 'Not assigned'}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-slate-500">
                      {res.licensePlate && <span className="inline-block px-1.5 py-px rounded border border-slate-300 bg-slate-50 font-mono text-[10.5px] font-semibold text-slate-700 tracking-wide">{res.licensePlate}</span>}
                      {vehicleKindLabel[kind]}{res.sippCode ? ` · ${res.sippCode}` : ''}{res.transmission ? ` · ${res.transmission}` : ''}
                    </p>
                  </div>
                </div>
                {(res.reservationVehicle && res.reservationVehicle !== res.carModel) && <dl className="divide-y divide-slate-100"><Row label="Booked as">{res.reservationVehicle}</Row></dl>}
                {(res.upgradeHistory || []).length > 0 && (
                  <dl className="divide-y divide-slate-100">
                    {(res.upgradeHistory || []).map((u, i) => (
                      <Row key={i} label={`Upgrade · ${dayDate(u.date)}`}>{u.fromCar ? `${u.fromCar} → ` : ''}{u.toCar}{u.fee ? ` (${money(u.fee)})` : ' (free)'}</Row>
                    ))}
                  </dl>
                )}
                {exchanges.length > 0 && (
                  <dl className="divide-y divide-slate-100">
                    {exchanges.map((x, i) => <Row key={i} label={`Exchange · ${dayDate(x.exchangeDate)}`}>{x.oldCarLicensePlate} → {x.newCarLicensePlate}</Row>)}
                  </dl>
                )}
              </Section>

              <Section title="Customer">
                <dl className="divide-y divide-slate-100">
                  <Row label="Name">{res.personName || '—'}</Row>
                  <Row label="Phone">{res.contactNumber ? <a href={`tel:${res.contactNumber}`} className="hover:text-indigo-600">{res.contactNumber}</a> : '—'}</Row>
                  <Row label="Email">{res.customerEmail ? <a href={`mailto:${res.customerEmail}`} className="hover:text-indigo-600">{res.customerEmail}</a> : '—'}</Row>
                </dl>
              </Section>

              {res.notes && (
                <Section title="Notes">
                  <p className="py-2 text-slate-700 whitespace-pre-wrap leading-relaxed">{res.notes}</p>
                </Section>
              )}
            </>
          )}

          {tab === 'charges' && (
            <>
              <Section title="Rental charges">
                <dl className="divide-y divide-slate-100">
                  <Row label={`Rental · ${days} day${days === 1 ? '' : 's'}`}><span className="tabular-nums">{money(rentalAmount)}</span>{days > 0 && rentalAmount > 0 && <span className="text-slate-400 font-normal"> ({money(rentalAmount / days)}/day)</span>}</Row>
                  {extras.map(e => (
                    <Row key={e.name} label={e.name}>{e.isComplementary ? <span className="text-emerald-600">Included</span> : <span className="tabular-nums">{money((e.dailyPrice || 0) * days)} <span className="text-slate-400 font-normal">({money(e.dailyPrice)}/day)</span></span>}</Row>
                  ))}
                  {extensions.map((x, i) => (
                    <Row key={i} label={`Extension · +${x.days} day${x.days === 1 ? '' : 's'}`}><span className="tabular-nums">{money(x.cost)}</span> <span className={`text-[11px] font-semibold ${x.paymentMethod === 'payLater' ? 'text-amber-600' : 'text-emerald-600'}`}>{x.paymentMethod === 'payLater' ? 'pay later' : 'paid'}</span></Row>
                  ))}
                </dl>
                <div className="mt-1 pt-3 border-t border-slate-200 flex items-baseline justify-between">
                  <span className="font-semibold text-slate-900">Total</span>
                  <span className="text-lg font-semibold text-slate-900 tabular-nums">{money(res.amount)}</span>
                </div>
                {res.originalAmount !== undefined && res.originalAmount !== res.amount && <p className="mt-0.5 text-right text-xs text-slate-500 tabular-nums">Originally {money(res.originalAmount)}</p>}
              </Section>

              {(rcItems.length > 0 || lateFee) && (
                <Section title="Return charges" actions={rc && rcItems.length > 0 ? <Badge tone={rc.settlement === 'paid' ? 'success' : 'warning'}>{rc.settlement === 'paid' ? 'Paid' : 'Claim'}</Badge> : undefined}>
                  <dl className="divide-y divide-slate-100">
                    {rcItems.map(it => (
                      <Row key={it.id} label={<span className="capitalize">{it.kind}{it.description ? <span className="normal-case"> · {it.description}</span> : ''}</span>}><span className="tabular-nums">{rc!.currency} {(Number(it.amount) || 0).toFixed(2)}</span></Row>
                    ))}
                    {rcItems.length > 0 && <Row label={<span className="font-semibold text-slate-900">Return charges total</span>}><span className="tabular-nums">{rc!.currency} {rcTotal.toFixed(2)}</span></Row>}
                    {rc?.paymentMethod && <Row label="Payment method"><span className="capitalize">{rc.paymentMethod.replace('_', ' ')}</span>{rc.paymentReference ? ` · ${rc.paymentReference}` : ''}</Row>}
                    {rc?.dueDate && rc.settlement !== 'paid' && <Row label="Due">{longDate(rc.dueDate)}</Row>}
                    {rc?.documentNumber && <Row label="Document no.">{rc.documentNumber}</Row>}
                    {lateFee && <Row label={`Late return · ${lateFee.hoursLate} h`}><span className="tabular-nums">{money(lateFee.amount)}</span> <span className="text-[11px] font-semibold text-slate-500">{lateFee.isWaived ? 'waived' : lateFee.status.toLowerCase()}</span></Row>}
                  </dl>
                </Section>
              )}

              <Section title="Deposit & payment">
                <dl className="divide-y divide-slate-100">
                  <Row label="Security deposit">{res.securityDeposit ? <span className="tabular-nums">{money(res.securityDeposit)}</span> : <Muted>—</Muted>}</Row>
                  <Row label="Excess">{res.excess ? <span className="tabular-nums">{money(res.excess)}</span> : <Muted>—</Muted>}</Row>
                  {res.pickupPaymentCollected !== undefined && <Row label="Paid at pickup">{res.pickupPaymentCollected ? 'Yes' : 'No'}</Row>}
                  {res.finalAmountCharged !== undefined && <Row label="Final amount charged"><span className="tabular-nums">{money(res.finalAmountCharged)}</span></Row>}
                  {res.authNumber && <Row label="Auth no.">{res.authNumber}</Row>}
                  {res.deferredPaymentCollectedOn && <Row label="Deferred payment collected">{longDate(res.deferredPaymentCollectedOn)}</Row>}
                  {res.paymentConfirmationPending && <Row label="Payment approval">Pending{res.paymentConfirmationRequestedBy ? ` · requested by ${res.paymentConfirmationRequestedBy}` : ''}</Row>}
                </dl>
              </Section>

              <Section title="Outstanding">
                <dl className="divide-y divide-slate-100">
                  <Row label="Unpaid extensions"><span className="tabular-nums">{money(res.unpaidExtensionAmount)}</span></Row>
                  {lateOutstanding > 0 && <Row label="Late return fee"><span className="tabular-nums">{money(lateOutstanding)}</span></Row>}
                  {rcOutstanding > 0 && <Row label="Return charges (claim)"><span className="tabular-nums">{rc!.currency} {rcOutstanding.toFixed(2)}</span></Row>}
                </dl>
                <div className="mt-1 pt-3 border-t border-slate-200 flex items-baseline justify-between">
                  <span className="font-semibold text-slate-900">Balance due</span>
                  <span className={cx('text-base font-semibold tabular-nums', outstandingUsd > 0 || rcOutstanding > 0 ? 'text-rose-600' : 'text-emerald-700')}>
                    {money(outstandingUsd)}{rcOutstanding > 0 ? ` + ${rc!.currency} ${rcOutstanding.toFixed(2)}` : ''}
                  </span>
                </div>
              </Section>
            </>
          )}

          {tab === 'agreement' && (
            <>
              {agreementBlock('out')}
              {agreementBlock('in')}
              {exchanges.map((x, i) => (
                <Section key={i} title={`Car exchange ${i + 1}`}>
                  <dl className="divide-y divide-slate-100">
                    <Row label="Date">{stamp(x.exchangeDate)}</Row>
                    <Row label="Reason">{x.reason || '—'}</Row>
                    <Row label="Returned car">{x.oldCarLicensePlate}{x.checkinKmIn ? ` · ${x.checkinKmIn.toLocaleString()} km` : ''}{x.checkinFuelLevel !== undefined ? ` · fuel ${x.checkinFuelLevel}/8` : ''}</Row>
                    <Row label="New car">{x.newCarLicensePlate}{x.checkoutKmOut ? ` · ${x.checkoutKmOut.toLocaleString()} km` : ''}{x.checkoutFuelLevel !== undefined ? ` · fuel ${x.checkoutFuelLevel}/8` : ''}</Row>
                    <Row label="Agents">{[x.checkinAgentName, x.checkoutAgentName].filter(Boolean).join(' / ') || '—'}</Row>
                    <Row label="Damage marks">{(x.checkinDamageMarkers || []).length} in · {(x.checkoutDamageMarkers || []).length} out</Row>
                    <Row label="Signatures">{[x.checkinRenterSignature, x.checkinAgentSignature, x.checkoutRenterSignature, x.checkoutAgentSignature].filter(Boolean).length} of 4</Row>
                  </dl>
                </Section>
              ))}
            </>
          )}

          {tab === 'documents' && (
            <>
              <Section title="Documents">
                {docActs.length === 0 ? (
                  <p className="py-2 text-slate-500">No documents are available for this booking at its current stage.</p>
                ) : (
                  <ul className="py-1 divide-y divide-slate-100">
                    {docActs.map(a => (
                      <li key={a.key} className="flex items-center justify-between gap-3 py-2">
                        <span className="flex items-center gap-2 text-slate-700"><span className="text-slate-400">{a.icon}</span>{a.label}</span>
                        <button onClick={a.onClick} className="h-8 px-3 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          {a.key === 'share' ? 'Share' : a.key === 'receipt' ? 'Open' : 'Print'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
              <Section title="Agreement emails">
                {emails.length === 0 ? <p className="py-2 text-slate-500">No agreement emails sent yet.</p> : (
                  <dl className="divide-y divide-slate-100">
                    {emails.map((m, i) => <Row key={i} label={<span className="capitalize">{m.kind}</span>}>{m.to} <Muted>{stamp(m.sentAt)}</Muted></Row>)}
                  </dl>
                )}
              </Section>
              {(rc?.emails || []).length > 0 && (
                <Section title="Return charge emails">
                  <dl className="divide-y divide-slate-100">
                    {(rc?.emails || []).map((m, i) => <Row key={i} label={rc?.documentNumber || 'Statement'}>{m.to} <Muted>{stamp(m.sentAt)}</Muted></Row>)}
                  </dl>
                </Section>
              )}
            </>
          )}

          {tab === 'history' && (
            <div className="px-5 py-4">
              {events.length === 0 ? <p className="text-slate-500">No recorded activity for this booking.</p> : (
                <ol className="relative border-l border-slate-200 ml-1.5 space-y-4">
                  {[...dated, ...undated].map((e, i) => (
                    <li key={i} className="pl-4 relative">
                      <span className={cx('absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white', toneDot[e.tone])} />
                      <p className="text-[11px] text-slate-500 tabular-nums">{e.at ? stamp(e.at) : 'Date not recorded'}</p>
                      <p className="font-semibold text-slate-900">{e.title}</p>
                      {e.detail && <p className="text-slate-600">{e.detail}</p>}
                    </li>
                  ))}
                </ol>
              )}
              {res.lastEditedBy && <p className="mt-5 pt-3 border-t border-slate-100 text-xs text-slate-500">Last edited by <span className="font-medium text-slate-700">{res.lastEditedBy}</span>{res.updatedAt ? ` · ${stamp(res.updatedAt)}` : ''}</p>}
            </div>
          )}
        </div>

        {(docActs.length > 0 || danger.length > 0) && (
          <footer className="px-5 py-3 border-t border-slate-200 flex flex-wrap items-center gap-2">
            {docActs.map(a => (
              <button key={a.key} onClick={a.onClick} className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <span className="text-slate-400">{a.icon}</span>{a.label.replace('Print rental agreement', 'Print agreement').replace('Print termination statement', 'Termination').replace('Share booking', 'Share')}
              </button>
            ))}
            {danger.map(a => (
              <button key={a.key} onClick={() => { a.onClick(); }} className="ml-auto h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-rose-600 hover:bg-rose-50">
                {a.icon}Delete
              </button>
            ))}
          </footer>
        )}
      </aside>
    </div>
  );
};

export default ReservationRecord;
