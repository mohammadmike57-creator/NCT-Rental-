import React, { useState, useMemo } from 'react';
import { Reservation, ExtensionInfo, ReservationExtra, TrafficTicket, TrafficTicketStatus, CompanyDetails } from '../types';
import { CloseIcon, ShieldExclamationIcon } from './icons';
import { sendCustomerEmail } from '../firebase/api';
import { Panel, SectionLabel, Badge, Button, DetailList, inputCls } from './ui/Crm';

const DAY = 24 * 60 * 60 * 1000;
const GRACE = 2 * 60 * 60 * 1000;

/** Whole rental days between two instants, with a 2-hour grace period on the last day. */
const daysWithGrace = (startMs: number, endMs: number): number => {
  const diff = endMs - startMs;
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  if (diff <= DAY) return 1;
  const full = Math.floor(diff / DAY);
  const rest = diff % DAY;
  return rest >= GRACE ? full + 1 : full;
};

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDate = (ms: number) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

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
  const currentEndMs = new Date(reservation.endDate).getTime();
  const startMs = new Date(reservation.startDate).getTime();

  const [newEnd, setNewEnd] = useState(() => toLocalInput(new Date(currentEndMs + DAY)));
  const [rateOption, setRateOption] = useState<'current' | 'custom'>('current');
  const [extrasOn, setExtrasOn] = useState<Record<string, boolean>>(() => Object.fromEntries((reservation.extras || []).map(e => [e.name, true])));
  const [customerEmail, setCustomerEmail] = useState(reservation.customerEmail || '');
  const [sendEmail, setSendEmail] = useState(!!reservation.customerEmail);
  const [paymentMethod, setPaymentMethod] = useState<'payNow' | 'payLater'>('payNow');
  const [busy, setBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const outstandingTickets = useMemo(
    () => trafficTickets.filter(t => t.bookingId === reservation.bookingId && t.status === TrafficTicketStatus.NOT_COLLECTED),
    [trafficTickets, reservation.bookingId]
  );
  const ticketsDue = outstandingTickets.reduce((s, t) => s + t.amount, 0);

  const currentDays = Math.max(1, daysWithGrace(startMs, currentEndMs));
  const chargeableExtrasPerDay = (reservation.extras || []).filter(e => !e.isComplementary).reduce((s, e) => s + (e.dailyPrice || 0), 0);
  // Base daily rate = what the customer currently pays per day for the car alone.
  const currentRate = useMemo(() => {
    const base = (reservation.amount || 0) - chargeableExtrasPerDay * currentDays;
    return base > 0 ? Math.round((base / currentDays) * 100) / 100 : 0;
  }, [reservation.amount, chargeableExtrasPerDay, currentDays]);
  const [customRate, setCustomRate] = useState<number>(currentRate);

  const newEndMs = new Date(newEnd).getTime();
  const extensionDays = daysWithGrace(currentEndMs, newEndMs);
  const rate = rateOption === 'custom' ? customRate || 0 : currentRate;
  const carCost = extensionDays * rate;
  const extendedExtras: ReservationExtra[] = (reservation.extras || []).filter(e => extrasOn[e.name]);
  const extrasCost = extendedExtras.filter(e => !e.isComplementary).reduce((s, e) => s + e.dailyPrice * extensionDays, 0);
  const extensionCost = Math.round((carCost + extrasCost) * 100) / 100;
  const newTotal = (reservation.amount || 0) + extensionCost;
  const emailValid = /^\S+@\S+\.\S+$/.test(customerEmail.trim());

  const setQuick = (days: number) => setNewEnd(toLocalInput(new Date(currentEndMs + days * DAY)));
  const quickActive = (days: number) => Math.abs(newEndMs - (currentEndMs + days * DAY)) < 60000;

  const problems: string[] = [];
  if (!Number.isFinite(newEndMs) || newEndMs <= currentEndMs) problems.push('Choose a new return date after the current one.');
  if (rateOption === 'custom' && !(customRate >= 0)) problems.push('Enter a valid daily rate.');
  if (sendEmail && !emailValid) problems.push('Enter a valid customer email or turn off the confirmation email.');

  const finish = () => {
    const newEndDate = newEnd;
    onConfirm(reservation, { newEndDate, days: extensionDays, dailyRate: rate, extras: extendedExtras, cost: extensionCost }, customerEmail.trim(), paymentMethod);
  };

  const handleConfirm = async () => {
    if (problems.length) return;
    if (!sendEmail) { finish(); return; }
    setBusy(true);
    setEmailError(null);
    const payNow = paymentMethod === 'payNow';
    const outcome = await sendCustomerEmail({
      to: customerEmail.trim(),
      subject: `Rental extended · Booking ${reservation.bookingId}`,
      heading: 'Your rental has been extended',
      intro: `Dear ${reservation.personName}, your rental of the ${reservation.carModel}${reservation.licensePlate ? ` (${reservation.licensePlate})` : ''} has been extended. Here are the updated details.`,
      rows: [
        ['Booking', reservation.bookingId],
        ['Previous return', fmtDate(currentEndMs)],
        ['New return', fmtDate(newEndMs)],
        ['Extended by', `${extensionDays} day${extensionDays === 1 ? '' : 's'}`],
        ['Daily rate', money(rate)],
        ...(extrasCost > 0 ? [['Extras', money(extrasCost)] as [string, string]] : []),
        ['Extension cost', money(extensionCost)],
        ['New rental total', money(newTotal)],
        ['Payment', payNow ? 'Paid at the counter' : 'Due when the vehicle is returned'],
      ],
      closing: `Please return the vehicle by the new return time to avoid late-return charges. If anything looks wrong, call us on ${companyDetails.phone}.`,
      companyName: companyDetails.name,
      companyAddress: companyDetails.address,
      companyPhone: companyDetails.phone,
      companyEmail: companyDetails.email,
      badge: 'RENTAL EXTENDED',
      tone: payNow ? 'success' : 'warning',
      highlightLabel: payNow ? 'Extension paid' : 'Due on return',
      highlightValue: money(extensionCost),
    });
    setBusy(false);
    if (outcome.ok) finish();
    else setEmailError(outcome.reason === 'unconfigured' ? 'Outgoing email is not set up yet — an administrator can turn it on in Email Settings.' : outcome.message || 'The email could not be sent.');
  };

  const optCls = (on: boolean) => `p-2.5 rounded-lg text-left border transition-colors ${on ? 'border-indigo-500 ring-2 ring-indigo-500/15 bg-indigo-50/40' : 'border-slate-200 bg-white hover:bg-slate-50'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50" />
      <div className="relative bg-slate-50 w-full sm:max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-3 px-5 py-4 bg-white border-b border-slate-200">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">Extend rental</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">#{reservation.bookingId} · {reservation.personName} · {reservation.carModel}{reservation.licensePlate ? ` · ${reservation.licensePlate}` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100"><CloseIcon className="w-5 h-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 md:grid-cols-5 gap-4 content-start">
          <div className="md:col-span-3 space-y-4 min-w-0">
            {outstandingTickets.length > 0 && (
              <div className="flex gap-2.5 p-3 rounded-lg border border-rose-200 bg-rose-50 text-[13px] text-rose-800">
                <ShieldExclamationIcon className="w-5 h-5 shrink-0" />
                <p><b>{outstandingTickets.length} unpaid traffic ticket{outstandingTickets.length === 1 ? '' : 's'}</b> on this booking ({money(ticketsDue)}). Collect them before extending if possible.</p>
              </div>
            )}

            <Panel title="New return" padded bodyClassName="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 7, 14].map(n => (
                  <button key={n} onClick={() => setQuick(n)} aria-pressed={quickActive(n)}
                    className={`h-8 px-2.5 rounded-lg text-xs font-semibold border transition-colors ${quickActive(n) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                    +{n} day{n === 1 ? '' : 's'}
                  </button>
                ))}
              </div>
              <input type="datetime-local" value={newEnd} min={toLocalInput(new Date(currentEndMs + 60000))} onChange={e => setNewEnd(e.target.value)} className={inputCls} />
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50"><SectionLabel>Currently due back</SectionLabel><p className="font-semibold text-slate-800 mt-0.5 tabular-nums">{fmtDate(currentEndMs)}</p></div>
                <div className="p-2.5 rounded-lg border border-indigo-200 bg-indigo-50/50"><SectionLabel className="!text-indigo-600">New return</SectionLabel><p className="font-semibold text-slate-900 mt-0.5 tabular-nums">{Number.isFinite(newEndMs) ? fmtDate(newEndMs) : '—'}</p></div>
              </div>
            </Panel>

            <Panel title="Daily rate" padded bodyClassName="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {([['current', 'Current rate', money(currentRate) + ' / day'], ['custom', 'Custom rate', 'Agreed with customer']] as const).map(([key, title, sub]) => (
                  <button key={key} onClick={() => setRateOption(key)} aria-pressed={rateOption === key} className={optCls(rateOption === key)}>
                    <p className="text-[13px] font-semibold text-slate-900">{title}</p>
                    <p className="text-xs text-slate-500">{sub}</p>
                  </button>
                ))}
              </div>
              {rateOption === 'custom' && (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-slate-400">$</span>
                  <input type="number" min={0} step="0.01" value={customRate || ''} onChange={e => setCustomRate(parseFloat(e.target.value) || 0)} className={`${inputCls} pl-7 tabular-nums`} placeholder="0.00" autoFocus />
                </div>
              )}
            </Panel>

            {(reservation.extras || []).length > 0 && (
              <Panel title="Keep extras for the extra days">
                <div className="divide-y divide-slate-100">
                  {(reservation.extras || []).map(ex => (
                    <label key={ex.name} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={!!extrasOn[ex.name]} onChange={() => setExtrasOn(p => ({ ...p, [ex.name]: !p[ex.name] }))} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      <span className="flex-1 text-[13px] font-medium text-slate-800">{ex.name}</span>
                      <span className="text-xs text-slate-500 tabular-nums">{ex.isComplementary ? 'Included' : `${money(ex.dailyPrice)} / day`}</span>
                    </label>
                  ))}
                </div>
              </Panel>
            )}

            <Panel title="Payment" padded bodyClassName="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {([['payNow', 'Paid now', 'Collected at the counter'], ['payLater', 'Pay on return', 'Added to deferred payments']] as const).map(([key, title, sub]) => (
                  <button key={key} onClick={() => setPaymentMethod(key)} aria-pressed={paymentMethod === key} className={optCls(paymentMethod === key)}>
                    <p className="text-[13px] font-semibold text-slate-900">{title}</p>
                    <p className="text-xs text-slate-500">{sub}</p>
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-[13px] font-medium text-slate-800">Email the confirmation to the customer</span>
              </label>
              {sendEmail && (
                <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="name@example.com"
                  className={`${inputCls} ${customerEmail && !emailValid ? '!border-rose-300' : ''}`} />
              )}
            </Panel>
          </div>

          <aside className="md:col-span-2 min-w-0">
            <Panel title="Summary" padded className="md:sticky md:top-0">
              <DetailList rows={[
                { label: 'Extra days', value: <span className="tabular-nums">{extensionDays}</span> },
                { label: `Car · ${extensionDays} × ${money(rate)}`, value: <span className="tabular-nums">{money(carCost)}</span> },
                ...(extrasCost > 0 ? [{ label: 'Extras', value: <span className="tabular-nums">{money(extrasCost)}</span> }] : []),
                { label: <span className="font-semibold text-slate-700">Extension cost</span>, value: <span className="tabular-nums text-indigo-700">{money(extensionCost)}</span> },
                { label: 'Current total', value: <span className="tabular-nums font-normal text-slate-600">{money(reservation.amount || 0)}</span> },
              ]} />
              <div className="flex justify-between items-baseline border-t border-slate-200 pt-2.5 mt-1">
                <span className="text-[13px] font-semibold text-slate-700">New total</span>
                <span className="text-xl font-semibold text-slate-900 tabular-nums">{money(newTotal)}</span>
              </div>
              <div className="mt-3">
                <Badge tone={paymentMethod === 'payNow' ? 'success' : 'warning'} className="whitespace-normal">
                  {paymentMethod === 'payNow' ? `${money(extensionCost)} collected now` : `${money(extensionCost)} added to amount due on return`}
                </Badge>
              </div>
            </Panel>
          </aside>
        </div>

        <footer className="px-5 py-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 min-w-0 text-xs">
            {emailError ? (
              <span className="text-rose-700"><b>Email not sent:</b> {emailError}{' '}
                <button onClick={finish} className="font-semibold underline">Extend without email</button>
              </span>
            ) : problems.length ? <span className="text-slate-500">{problems[0]}</span> : <span className="text-slate-500">The agreement and return date update immediately.</span>}
          </div>
          <div className="flex gap-2 [&>*]:max-sm:flex-1">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={handleConfirm} disabled={busy || problems.length > 0}
              icon={busy ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : undefined}>
              {busy ? 'Sending email…' : `Extend by ${extensionDays || 0} day${extensionDays === 1 ? '' : 's'}`}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ExtendRentalModal;
