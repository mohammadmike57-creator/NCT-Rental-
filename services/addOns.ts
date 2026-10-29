import { PriceChange, Reservation, ReservationExtra, ReservationStatus, TrafficTicket, VehicleDamage } from '../types';
import { bookingKey } from './duplicates';
import { lateFeeOf } from './lateReturn';

/**
 * Reservation add-ons: everything that changed what a booking costs after it was made.
 *
 * Two groups:
 *  - rental price changes, which move the booking amount (extras, upgrades, extensions, price edits);
 *  - charges billed on top of it (late return, return charges, traffic tickets, damages, cancellation fees).
 */

export type AddOnKind =
  | 'extras' | 'upgrade' | 'extension' | 'manual'
  | 'late' | 'damage' | 'ticket' | 'fuel' | 'cleaning' | 'other' | 'cancellation' | 'noshow';

export type AddOnStatus = 'in-price' | 'paid' | 'outstanding' | 'claim' | 'charged' | 'pending' | 'waived';

export interface AddOn {
  id: string;
  kind: AddOnKind;
  /** price: changes the rental price; charge: billed on top of it. */
  group: 'price' | 'charge';
  at?: string;
  by?: string;
  title: string;
  detail?: string;
  /** Signed amount (a removed extra is negative). */
  amount: number;
  currency: 'USD' | 'JOD';
  status: AddOnStatus;
  reference?: string;
  /** Where it was recorded. */
  source: 'booking' | 'agreement' | 'register';
}

export const KIND_LABEL: Record<AddOnKind, string> = {
  extras: 'Extras', upgrade: 'Upgrade', extension: 'Extension', manual: 'Price change',
  late: 'Late return', damage: 'Damage', ticket: 'Traffic ticket', fuel: 'Fuel', cleaning: 'Cleaning', other: 'Other charge',
  cancellation: 'Cancellation fee', noshow: 'No-show fee',
};

export const STATUS_LABEL: Record<AddOnStatus, string> = {
  'in-price': 'In rental price', paid: 'Paid', outstanding: 'Outstanding', claim: 'Claim sent', charged: 'Charged', pending: 'Awaiting decision', waived: 'Waived',
};

/** Still to be collected from the customer. */
export const isOpen = (s: AddOnStatus) => s === 'outstanding' || s === 'claim' || s === 'pending';

const round = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (a?: string, b?: string) => {
  const s = new Date(a || '').getTime(), e = new Date(b || '').getTime();
  return Number.isFinite(s) && Number.isFinite(e) && e > s ? Math.max(1, Math.ceil((e - s) / 86400000)) : 0;
};
const extraNames = (list?: ReservationExtra[]) => (list || []).map(e => `${e.name}${e.isComplementary ? ' (free)' : ''}`);

/**
 * When a save changes the rental price, records the part no other history explains (extras, hand edits)
 * and keeps the price the booking was made at. Upgrades and extensions keep their own histories.
 */
export function withPriceChange(prev: Reservation | undefined, next: Reservation, by?: string, at = new Date().toISOString()): Reservation {
  if (!prev || prev.isNew) return next;
  const before = round(prev.amount || 0), after = round(next.amount || 0);
  if (before === after) return next;
  const newUpgrades = (next.upgradeHistory || []).slice((prev.upgradeHistory || []).length);
  const newExtensions = (next.extensionHistory || []).slice((prev.extensionHistory || []).length);
  const explained = newUpgrades.reduce((t, u) => t + (u.fee || 0), 0) + newExtensions.reduce((t, x) => t + (x.cost || 0), 0);
  const rest = round(after - before - explained);
  const out: Reservation = { ...next, originalAmount: prev.originalAmount ?? prev.amount };
  if (Math.abs(rest) < 0.01) return out;

  const was = extraNames(prev.extras), now = extraNames(next.extras);
  const added = now.filter(n => !was.includes(n)), removed = was.filter(n => !now.includes(n));
  const extras = added.length > 0 || removed.length > 0;
  const change: PriceChange = {
    at, by, kind: extras ? 'extras' : 'manual', amount: rest, fromTotal: before, toTotal: after,
    detail: extras
      ? [added.length ? `Added ${added.join(', ')}` : '', removed.length ? `Removed ${removed.join(', ')}` : ''].filter(Boolean).join(' · ')
      : `Rental price changed from ${before.toFixed(2)} to ${after.toFixed(2)}`,
    ...(extras ? { added, removed } : {}),
  };
  return { ...out, priceChanges: [...(next.priceChanges ?? prev.priceChanges ?? []), change] };
}

export interface AddOnSummary {
  reservation: Reservation;
  entries: AddOn[];
  /** Rental price when the booking was made. */
  originalPrice: number;
  /** Rental price now (the booking amount). */
  currentPrice: number;
  priceChange: number;
  /** Charges on top of the rental price, per currency (waived ones excluded). */
  charges: Record<'USD' | 'JOD', number>;
  outstanding: Record<'USD' | 'JOD', number>;
  original: { carModel?: string; endDate?: string; days: number; extras: string[] };
  now: { carModel?: string; licensePlate?: string; endDate?: string; days: number; extras: string[] };
}

/** Every add-on of one booking, oldest first, with the original booking next to what it is now. */
export function addOnsOf(res: Reservation, tickets: TrafficTicket[] = [], damages: VehicleDamage[] = []): AddOnSummary {
  const out: AddOn[] = [];
  const key = bookingKey(res);
  const price = (e: Omit<AddOn, 'group'>) => out.push({ ...e, group: 'price' });
  const charge = (e: Omit<AddOn, 'group'>) => out.push({ ...e, group: 'charge' });

  // ---- Rental price ----------------------------------------------------
  (res.priceChanges || []).forEach((c, i) => price({
    id: `pc-${i}`, kind: c.kind === 'extras' ? 'extras' : 'manual', at: c.at, by: c.by,
    title: c.kind === 'extras' ? 'Extras changed' : 'Rental price edited', detail: c.detail,
    amount: c.amount, currency: 'USD', status: 'in-price', source: 'booking',
  }));
  (res.upgradeHistory || []).forEach((u, i) => price({
    id: `up-${i}`, kind: 'upgrade', at: u.date, by: u.by,
    title: `${u.fromCar || 'Booked car'} → ${u.toCar}`,
    detail: u.fee > 0
      ? (u.pricing === 'daily' && u.dailyRate ? `${u.dailyRate.toFixed(2)} a day × ${u.days || 1} day${(u.days || 1) === 1 ? '' : 's'}` : 'Flat upgrade fee')
      : 'Free upgrade',
    amount: u.fee || 0, currency: 'USD', status: 'in-price', source: 'agreement',
  }));
  if (!res.upgradeHistory?.length && res.upgradeInfo && res.upgradeInfo.totalUpgradeCost) price({
    id: 'up-legacy', kind: 'upgrade', title: `${res.upgradeInfo.originalCarModel} → ${res.upgradeInfo.upgradedCarModel}`,
    detail: `${res.upgradeInfo.dailyUpgradePrice.toFixed(2)} a day`, amount: res.upgradeInfo.totalUpgradeCost, currency: 'USD', status: 'in-price', source: 'booking',
  });
  const unpaidExt = res.unpaidExtensionAmount || 0;
  (res.extensionHistory || []).forEach((x, i) => {
    const later = x.paymentMethod === 'payLater';
    price({
      id: `ex-${i}`, kind: 'extension', at: x.extensionDate,
      title: `Extended ${x.days} day${x.days === 1 ? '' : 's'} to ${(x.newEndDate || '').replace('T', ' ').slice(0, 16)}`,
      detail: [`${(x.dailyRate || 0).toFixed(2)} a day`, x.extras?.length ? `extras: ${extraNames(x.extras).join(', ')}` : '', later ? 'pay on return' : 'paid at extension'].filter(Boolean).join(' · '),
      amount: x.cost || 0, currency: 'USD', status: later ? (unpaidExt > 0 && !res.deferredPaymentCollectedOn ? 'outstanding' : 'paid') : 'paid', source: 'agreement',
    });
  });

  // ---- Charges on top ---------------------------------------------------
  const lf = lateFeeOf(res);
  if (lf && (lf.amount || 0) > 0) charge({
    id: 'late', kind: 'late', at: lf.resolvedDate || lf.feeAppliedDate, by: lf.resolvedBy,
    title: `Returned ${lf.hoursLate} h late`, detail: lf.notes,
    amount: lf.amount, currency: 'USD', status: lf.status === 'WAIVED' || lf.isWaived ? 'waived' : lf.status === 'PENDING' ? 'pending' : 'charged', source: 'agreement',
  });
  const rc = res.returnCharges;
  const ticketIds = new Set<string>();
  (rc?.items || []).forEach(i => {
    if (i.ticketId) ticketIds.add(i.ticketId);
    charge({
      id: `rc-${i.id}`, kind: (['damage', 'ticket', 'fuel', 'cleaning', 'late', 'other'].includes(i.kind) ? i.kind : 'other') as AddOnKind,
      at: rc!.issuedAt || res.dropOffDateTime, by: rc!.issuedBy, title: i.description || KIND_LABEL[i.kind as AddOnKind] || 'Charge',
      detail: [i.view ? `${i.view} side` : '', i.ticketReference ? `ref ${i.ticketReference}` : '', i.photos?.length ? `${i.photos.length} photo${i.photos.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') || undefined,
      amount: i.amount || 0, currency: rc!.currency || 'JOD', status: rc!.settlement === 'paid' ? 'paid' : rc!.settlement === 'claim' ? 'claim' : 'pending',
      reference: rc!.documentNumber, source: 'agreement',
    });
  });
  // Registers: tickets and damages recorded against the booking number, not already billed at the return.
  tickets.filter(t => key && bookingKey({ bookingId: t.bookingId }) === key && !ticketIds.has(t.id) && !t.id.startsWith(`tt-${res.id}-`)).forEach(t => charge({
    id: `tt-${t.id}`, kind: 'ticket', at: t.ticketDate, title: t.details || 'Traffic violation',
    amount: t.amount || 0, currency: 'JOD', status: t.status === 'COLLECTED' ? 'paid' : 'outstanding', source: 'register',
  }));
  damages.filter(d => key && bookingKey({ bookingId: d.bookingId }) === key && !d.id.startsWith(`vd-${res.id}-`)).forEach(d => charge({
    id: `vd-${d.id}`, kind: 'damage', title: d.details || 'Vehicle damage',
    detail: d.policeReportNumber ? `Police report ${d.policeReportNumber}` : undefined,
    amount: d.amount || 0, currency: 'JOD', status: d.status === 'COLLECTED' ? 'paid' : 'outstanding', source: 'register',
  }));
  if ((res.statusFee || 0) > 0 && (res.status === ReservationStatus.CANCELLED || res.status === ReservationStatus.NO_SHOW)) charge({
    id: 'status-fee', kind: res.status === ReservationStatus.NO_SHOW ? 'noshow' : 'cancellation', at: res.statusChangedAt, by: res.statusChangedBy,
    title: res.status === ReservationStatus.NO_SHOW ? 'No-show fee' : 'Cancellation fee', detail: res.statusReason,
    amount: res.statusFee || 0, currency: 'USD', status: 'charged', source: 'booking',
  });

  out.sort((a, b) => (a.at || '9999').localeCompare(b.at || '9999'));

  const currentPrice = round(res.amount || 0);
  const priceChange = round(out.filter(e => e.group === 'price').reduce((t, e) => t + e.amount, 0));
  const charges = { USD: 0, JOD: 0 }, outstanding = { USD: 0, JOD: 0 };
  out.forEach(e => {
    if (e.group === 'charge' && e.status !== 'waived') charges[e.currency] = round(charges[e.currency] + e.amount);
    if (isOpen(e.status)) outstanding[e.currency] = round(outstanding[e.currency] + e.amount);
  });

  // The booking as it was made: before upgrades and extensions.
  const firstExt = res.extensionHistory?.[0];
  let originalEnd = res.endDate;
  if (firstExt) {
    const d = new Date(firstExt.newEndDate || res.endDate);
    if (Number.isFinite(d.getTime())) { d.setDate(d.getDate() - (res.extensionHistory || []).reduce((t, x) => t + (x.days || 0), 0)); originalEnd = d.toISOString().slice(0, 16); }
  }
  const firstUpgrade = res.upgradeHistory?.[0];
  const extrasNow = extraNames(res.extras);
  // Undo the recorded extras changes, newest first, to get the extras the booking was made with.
  let extrasThen = [...extrasNow];
  [...(res.priceChanges || [])].reverse().forEach(c => {
    extrasThen = extrasThen.filter(n => !(c.added || []).includes(n));
    (c.removed || []).forEach(n => { if (!extrasThen.includes(n)) extrasThen.push(n); });
  });

  return {
    reservation: res, entries: out,
    originalPrice: round(currentPrice - priceChange), currentPrice, priceChange, charges, outstanding,
    original: {
      carModel: firstUpgrade?.fromCar || res.upgradeInfo?.originalCarModel || res.carModel,
      endDate: originalEnd, days: daysBetween(res.startDate, originalEnd),
      extras: extrasThen,
    },
    now: { carModel: res.carModel, licensePlate: res.licensePlate, endDate: res.endDate, days: daysBetween(res.startDate, res.endDate), extras: extrasNow },
  };
}
