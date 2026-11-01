import { AppData, RentalSource, Reservation, ReservationStatus } from '../types';
import { MONTHS } from '../constants';
import { pickupMonthOf } from './pickupMonth';
import { paymentUnset } from './paymentType';
import { bookingKey } from './duplicates';

/**
 * Bookings that need someone to look at them: not counted (or counted wrongly) in the Yearly Summary,
 * an operation that should have happened, or details missing. Cancelled and no-show bookings are left out.
 */
export type IssueCode =
  | 'PENDING' | 'NO_STATUS' | 'AWAITING_CONFIRMATION' | 'NO_AMOUNT' | 'NEGATIVE_AMOUNT' | 'ZERO_AMOUNT' | 'WRONG_MONTH'
  | 'NOT_CHECKED_OUT' | 'RETURN_OVERDUE' | 'PAYMENT_TYPE_UNSET'
  | 'NO_NAME' | 'BAD_DATES' | 'NO_SOURCE' | 'NO_PLATE' | 'DUPLICATE';

export type IssueGroup = 'summary' | 'operation' | 'details';

export const ISSUES: Record<IssueCode, { label: string; group: IssueGroup; fix: string }> = {
  PENDING: { label: 'Pending', group: 'summary', fix: 'Not counted in the summary until it is confirmed.' },
  NO_STATUS: { label: 'No status', group: 'summary', fix: 'Has no valid status, so the summary does not count it. Set it to Confirmed or Cancelled.' },
  AWAITING_CONFIRMATION: { label: 'Unlisted, waiting', group: 'summary', fix: 'Agreement made without a reservation, waiting to be confirmed (Unlisted Agreements).' },
  NO_AMOUNT: { label: 'No amount', group: 'summary', fix: 'The amount is empty or not a number, so the summary does not count it.' },
  NEGATIVE_AMOUNT: { label: 'Negative amount', group: 'summary', fix: 'The amount is below zero, so the summary does not count it.' },
  ZERO_AMOUNT: { label: 'Amount 0', group: 'summary', fix: 'Counted in the summary with no revenue. Enter the price if it is not a free rental.' },
  WRONG_MONTH: { label: 'Wrong month', group: 'summary', fix: 'Filed under a different month than its pick-up date, so the summary counts it in the wrong month.' },
  NOT_CHECKED_OUT: { label: 'Not checked out', group: 'operation', fix: 'The pick-up day has passed (last 30 days) and the car was never checked out. Check it out, or mark it No-show or Cancelled.' },
  RETURN_OVERDUE: { label: 'Return overdue', group: 'operation', fix: 'Still on rent after its return time. Check the car in, or extend the rental.' },
  PAYMENT_TYPE_UNSET: { label: 'Payment type missing', group: 'operation', fix: 'Its source takes both prepaid and pay-on-arrival bookings: choose which one this is.' },
  NO_NAME: { label: 'No customer name', group: 'details', fix: 'Enter the customer name.' },
  BAD_DATES: { label: 'Dates wrong', group: 'details', fix: 'The pick-up or return date is missing, or the return is not after the pick-up.' },
  NO_SOURCE: { label: 'No source', group: 'details', fix: 'Choose where the booking came from.' },
  NO_PLATE: { label: 'No plate', group: 'details', fix: 'On rent without a license plate. Enter it on the agreement (Check-out → Vehicle).' },
  DUPLICATE: { label: 'Duplicate number', group: 'details', fix: 'Another booking uses the same booking number.' },
};

export const GROUP_LABEL: Record<IssueGroup, string> = {
  summary: 'Not right in the summary',
  operation: 'Needs action',
  details: 'Details missing',
};

export interface BookingIssues { r: Reservation; year: number; month: string; issues: IssueCode[] }

/** A missed check-out is listed for this many days after the pick-up day. */
export const CHECKOUT_WINDOW_DAYS = 30;
const STATUSES = new Set<string>(Object.values(ReservationStatus));
const time = (s?: string) => { const t = s ? new Date(s).getTime() : NaN; return Number.isFinite(t) ? t : NaN; };
const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** What is wrong with one booking, filed under `year` / `month`. */
export function issuesOf(r: Reservation, year: number, month: string, sources: RentalSource[], dupes: Set<string>, now: Date = new Date()): IssueCode[] {
  if (r.status === ReservationStatus.CANCELLED || r.status === ReservationStatus.NO_SHOW) return [];
  const out: IssueCode[] = [];
  const status = String(r.status || '');
  if (r.awaitingConfirmation) out.push('AWAITING_CONFIRMATION');
  else if (status === ReservationStatus.PENDING) out.push('PENDING');
  else if (!STATUSES.has(status)) out.push('NO_STATUS');

  const amount = r.amount as unknown;
  if (typeof amount !== 'number' || !Number.isFinite(amount)) out.push('NO_AMOUNT');
  else if (amount < 0) out.push('NEGATIVE_AMOUNT');
  else if (amount === 0 && status === ReservationStatus.CONFIRMED) out.push('ZERO_AMOUNT');

  const pm = pickupMonthOf(r);
  if (pm && (pm.y !== year || pm.m !== month)) out.push('WRONG_MONTH');

  const start = time(r.startDate || r.pickupDate), end = time(r.endDate || r.dropoffDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) out.push('BAD_DATES');
  else if (status === ReservationStatus.CONFIRMED) {
    // Only once the pick-up day is over, so today's late arrivals are not flagged.
    // Older ones are left out: bookings imported from before the system was used were handled on paper.
    if (!r.voucherSubmitted && dayOf(new Date(start)) < dayOf(now) && now.getTime() - start <= CHECKOUT_WINDOW_DAYS * 86400000) out.push('NOT_CHECKED_OUT');
    if (r.voucherSubmitted && !r.dropOffCompleted && end < now.getTime()) out.push('RETURN_OVERDUE');
  }
  if (paymentUnset(r, sources)) out.push('PAYMENT_TYPE_UNSET');

  if (!String(r.personName || r.customer || '').trim()) out.push('NO_NAME');
  if (!String(r.source || '').trim()) out.push('NO_SOURCE');
  if (r.voucherSubmitted && !r.dropOffCompleted && !String(r.licensePlate || '').trim()) out.push('NO_PLATE');
  const key = bookingKey(r);
  if (key && dupes.has(key)) out.push('DUPLICATE');
  return out;
}

/** Every booking with at least one issue, newest pick-up first. */
export function findIssues(data: AppData, sources: RentalSource[] = [], now: Date = new Date()): BookingIssues[] {
  const all: { r: Reservation; year: number; month: string }[] = [];
  Object.entries(data || {}).forEach(([y, months]) => Object.entries(months || {}).forEach(([m, list]) => {
    if (!MONTHS.includes(m)) return;
    (list as Reservation[] || []).forEach(r => { if (r && !r.isNew) all.push({ r, year: Number(y), month: m }); });
  }));
  // Duplicate numbers among live bookings only: a cancelled booking rebooked under its number is fine.
  const seen = new Set<string>(), dupes = new Set<string>();
  all.forEach(({ r }) => {
    if (r.status === ReservationStatus.CANCELLED || r.status === ReservationStatus.NO_SHOW) return;
    const k = bookingKey(r);
    if (!k) return;
    if (seen.has(k)) dupes.add(k); else seen.add(k);
  });
  return all
    .map(x => ({ ...x, issues: issuesOf(x.r, x.year, x.month, sources, dupes, now) }))
    .filter(x => x.issues.length > 0)
    .sort((a, b) => String(b.r.startDate || '').localeCompare(String(a.r.startDate || '')));
}
