import React, { useState, useMemo } from 'react';
import { Reservation, ExtensionInfo, ReservationExtra, TrafficTicket, TrafficTicketStatus, CompanyDetails } from '../types';
import { CloseIcon, ShieldExclamationIcon } from './icons';
import { sendCustomerEmail } from '../firebase/api';

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
      closing: 'Please return the vehicle by the new return time to avoid late-return charges. Reply to this email if anything looks wrong.',
      companyName: companyDetails.name,
      companyAddress: companyDetails.address,
      companyPhone: companyDetails.phone,
      companyEmail: companyDetails.email,
      replyTo: companyDetails.email,
      badge: 'RENTAL EXTENDED',
      tone: payNow ? 'success' : 'warning',
      highlightLabel: payNow ? 'Extension paid' : 'Due on return',
      highlightValue: money(extensionCost),
    });
    setBusy(false);
    if (outcome.ok) finish();
    else setEmailError(outcome.reason === 'unconfigured' ? 'Outgoing email is not set up yet — an administrator can turn it on in Email Settings.' : outcome.message || 'The email could not be sent.');
  };

  const inputCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-4 px-6 py-5 bg-white border-b border-slate-200">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Extend rental</h2>
              <p className="text-sm text-slate-500">#{reservation.bookingId} · {reservation.personName} · {reservation.carModel}{reservation.licensePlate ? ` · ${reservation.licensePlate}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><CloseIcon className="w-5 h-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-5 gap-5">
          <div className="md:col-span-3 space-y-5">
            {outstandingTickets.length > 0 && (
              <div className="flex gap-3 p-4 rounded-2xl border border-rose-200 bg-rose-50 text-sm text-rose-800">
                <ShieldExclamationIcon className="w-5 h-5 shrink-0" />
                <p><b>{outstandingTickets.length} unpaid traffic ticket{outstandingTickets.length === 1 ? '' : 's'}</b> on this booking ({money(ticketsDue)}). Collect them before extending if possible.</p>
              </div>
            )}

            <section className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">New return</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {[1, 2, 3, 7, 14].map(n => (
                  <button key={n} onClick={() => setQuick(n)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ring-1 transition-colors ${quickActive(n) ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'}`}>
                    +{n} day{n === 1 ? '' : 's'}
                  </button>
                ))}
              </div>
              <input type="datetime-local" value={newEnd} min={toLocalInput(new Date(currentEndMs + 60000))} onChange={e => setNewEnd(e.target.value)} className={inputCls} />
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50"><p className="text-slate-500">Currently due back</p><p className="font-semibold text-slate-800 mt-0.5">{fmtDate(currentEndMs)}</p></div>
                <div className="p-3 rounded-xl bg-amber-50"><p className="text-amber-700">New return</p><p className="font-semibold text-slate-900 mt-0.5">{Number.isFinite(newEndMs) ? fmtDate(newEndMs) : '—'}</p></div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Daily rate</h3>
              <div className="grid grid-cols-2 gap-2">
                {([['current', 'Current rate', money(currentRate) + ' / day'], ['custom', 'Custom rate', 'Agreed with customer']] as const).map(([key, title, sub]) => (
                  <button key={key} onClick={() => setRateOption(key)}
                    className={`p-3 rounded-xl text-left ring-1 transition-colors ${rateOption === key ? 'ring-2 ring-indigo-600 bg-indigo-50/50' : 'ring-slate-200 hover:bg-slate-50'}`}>
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                    <p className="text-xs text-slate-500">{sub}</p>
                  </button>
                ))}
              </div>
              {rateOption === 'custom' && (
                <div className="mt-3 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                  <input type="number" min={0} step="0.01" value={customRate || ''} onChange={e => setCustomRate(parseFloat(e.target.value) || 0)} className={`${inputCls} pl-7 tabular-nums`} placeholder="0.00" autoFocus />
                </div>
              )}
            </section>

            {(reservation.extras || []).length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-200 p-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Keep extras for the extra days</h3>
                <div className="space-y-2">
                  {(reservation.extras || []).map(ex => (
                    <label key={ex.name} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={!!extrasOn[ex.name]} onChange={() => setExtrasOn(p => ({ ...p, [ex.name]: !p[ex.name] }))} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      <span className="flex-1 text-sm font-medium text-slate-800">{ex.name}</span>
                      <span className="text-xs text-slate-500 tabular-nums">{ex.isComplementary ? 'Included' : `${money(ex.dailyPrice)} / day`}</span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            <section className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Payment</h3>
              <div className="grid grid-cols-2 gap-2">
                {([['payNow', 'Paid now', 'Collected at the counter'], ['payLater', 'Pay on return', 'Added to deferred payments']] as const).map(([key, title, sub]) => (
                  <button key={key} onClick={() => setPaymentMethod(key)}
                    className={`p-3 rounded-xl text-left ring-1 transition-colors ${paymentMethod === key ? 'ring-2 ring-indigo-600 bg-indigo-50/50' : 'ring-slate-200 hover:bg-slate-50'}`}>
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                    <p className="text-xs text-slate-500">{sub}</p>
                  </button>
                ))}
              </div>
              <label className="mt-4 flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm font-medium text-slate-800">Email the confirmation to the customer</span>
              </label>
              {sendEmail && (
                <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="name@example.com"
                  className={`${inputCls} mt-2 ${customerEmail && !emailValid ? 'border-rose-300' : ''}`} />
              )}
            </section>
          </div>

          <aside className="md:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sticky top-0 space-y-3 text-sm">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Summary</h3>
              <div className="flex justify-between"><span className="text-slate-500">Extra days</span><span className="font-semibold text-slate-900">{extensionDays}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Car · {extensionDays} × {money(rate)}</span><span className="font-semibold tabular-nums">{money(carCost)}</span></div>
              {extrasCost > 0 && <div className="flex justify-between"><span className="text-slate-500">Extras</span><span className="font-semibold tabular-nums">{money(extrasCost)}</span></div>}
              <div className="flex justify-between border-t border-slate-100 pt-3"><span className="font-semibold text-slate-700">Extension cost</span><span className="font-bold text-amber-700 tabular-nums">{money(extensionCost)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-500">Current total</span><span className="tabular-nums">{money(reservation.amount || 0)}</span></div>
              <div className="flex justify-between items-baseline border-t border-slate-200 pt-3">
                <span className="font-semibold text-slate-700">New total</span>
                <span className="text-2xl font-bold text-slate-900 tabular-nums">{money(newTotal)}</span>
              </div>
              <p className={`text-xs px-2.5 py-1.5 rounded-lg ${paymentMethod === 'payNow' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {paymentMethod === 'payNow' ? `${money(extensionCost)} collected now` : `${money(extensionCost)} added to amount due on return`}
              </p>
            </div>
          </aside>
        </div>

        <footer className="px-6 py-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 text-xs">
            {emailError ? (
              <span className="text-rose-700"><b>Email not sent:</b> {emailError}{' '}
                <button onClick={finish} className="font-semibold underline">Extend without email</button>
              </span>
            ) : problems.length ? <span className="text-slate-500">{problems[0]}</span> : <span className="text-slate-500">The agreement and return date update immediately.</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
            <button onClick={handleConfirm} disabled={busy || problems.length > 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 disabled:opacity-40">
              {busy && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {busy ? 'Sending email…' : `Extend by ${extensionDays || 0} day${extensionDays === 1 ? '' : 's'}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ExtendRentalModal;
