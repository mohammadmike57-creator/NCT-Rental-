import { AppData, RentalSource, Reservation, ReservationStatus } from '../types';
import { MONTHS } from '../constants';
import { paymentUnset } from './paymentType';
import { amountOf } from './revenue';

/**
 * The Needs Attention list: bookings that are incomplete (details missing), pending, or cancelled / no-show.
 * Everything except cancelled and no-show bookings is counted in the summaries.
 */
export type IssueCode =
  | 'PENDING' | 'AWAITING_CONFIRMATION' | 'NO_STATUS'
  | 'NO_AMOUNT' | 'ZERO_AMOUNT' | 'NO_NAME' | 'BAD_DATES' | 'NO_SOURCE' | 'NO_CAR' | 'NO_PLATE' | 'PAYMENT_TYPE_UNSET'
  | 'CANCELLED' | 'NO_SHOW';

export type IssueGroup = 'incomplete' | 'pending' | 'cancelled';

export const ISSUES: Record<IssueCode, { label: string; group: IssueGroup; fix: string }> = {
  PENDING: { label: 'Pending', group: 'pending', fix: 'Waiting to be confirmed. Counted in the summary.' },
  AWAITING_CONFIRMATION: { label: 'Unlisted, waiting', group: 'pending', fix: 'Agreement made without a reservation, waiting to be confirmed (Unlisted Agreements).' },
  NO_STATUS: { label: 'No status', group: 'pending', fix: 'Has no status. Set it to Confirmed, Pending or Cancelled.' },
  NO_AMOUNT: { label: 'No amount', group: 'incomplete', fix: 'The amount is empty: it adds nothing to the summary. Enter the price.' },
  ZERO_AMOUNT: { label: 'Amount 0', group: 'incomplete', fix: 'The amount is 0: it adds nothing to the summary. Enter the price if it is not a free rental.' },
  NO_NAME: { label: 'No customer name', group: 'incomplete', fix: 'Enter the customer name.' },
  BAD_DATES: { label: 'Dates wrong', group: 'incomplete', fix: 'The pick-up or return date is missing, or the return is not after the pick-up.' },
  NO_SOURCE: { label: 'No source', group: 'incomplete', fix: 'Choose where the booking came from.' },
  NO_CAR: { label: 'No car', group: 'incomplete', fix: 'Choose the car or car type.' },
  NO_PLATE: { label: 'No plate', group: 'incomplete', fix: 'On rent without a license plate. Enter it on the agreement (Check-out → Vehicle).' },
  PAYMENT_TYPE_UNSET: { label: 'Payment type missing', group: 'incomplete', fix: 'Its source takes both prepaid and pay-on-arrival bookings: choose which one this is.' },
  CANCELLED: { label: 'Cancelled', group: 'cancelled', fix: 'Not counted in the summary.' },
  NO_SHOW: { label: 'No-show', group: 'cancelled', fix: 'Not counted in the summary.' },
};

export const GROUP_LABEL: Record<IssueGroup, string> = {
  incomplete: 'Incomplete',
  pending: 'Pending',
  cancelled: 'Cancelled / no-show',
};

export interface BookingIssues { r: Reservation; year: number; month: string; issues: IssueCode[] }

const STATUSES = new Set<string>(Object.values(ReservationStatus));
const time = (s?: string) => { const t = s ? new Date(s).getTime() : NaN; return Number.isFinite(t) ? t : NaN; };

/** What puts one booking on the list. */
export function issuesOf(r: Reservation, sources: RentalSource[] = []): IssueCode[] {
  const status = String(r.status || '');
  if (status === ReservationStatus.CANCELLED) return ['CANCELLED'];
  if (status === ReservationStatus.NO_SHOW) return ['NO_SHOW'];
  const out: IssueCode[] = [];
  if (r.awaitingConfirmation) out.push('AWAITING_CONFIRMATION');
  else if (status === ReservationStatus.PENDING) out.push('PENDING');
  else if (!STATUSES.has(status)) out.push('NO_STATUS');

  const raw = r.amount as unknown;
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(Number(raw))) out.push('NO_AMOUNT');
  else if (amountOf(r) === 0) out.push('ZERO_AMOUNT');
  if (!String(r.personName || r.customer || '').trim()) out.push('NO_NAME');
  const start = time(r.startDate || r.pickupDate), end = time(r.endDate || r.dropoffDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) out.push('BAD_DATES');
  if (!String(r.source || '').trim()) out.push('NO_SOURCE');
  if (!String(r.carModel || r.reservationVehicle || r.vehicle || r.sippCode || '').trim()) out.push('NO_CAR');
  if (r.voucherSubmitted && !r.dropOffCompleted && !String(r.licensePlate || '').trim()) out.push('NO_PLATE');
  if (paymentUnset(r, sources)) out.push('PAYMENT_TYPE_UNSET');
  return out;
}

/** Every booking on the list, newest pick-up first. */
export function findIssues(data: AppData, sources: RentalSource[] = []): BookingIssues[] {
  const out: BookingIssues[] = [];
  Object.entries(data || {}).forEach(([y, months]) => Object.entries(months || {}).forEach(([m, list]) => {
    if (!MONTHS.includes(m)) return;
    ((list as Reservation[]) || []).forEach(r => {
      if (!r || r.isNew) return;
      const issues = issuesOf(r, sources);
      if (issues.length) out.push({ r, year: Number(y), month: m, issues });
    });
  }));
  return out.sort((a, b) => String(b.r.startDate || '').localeCompare(String(a.r.startDate || '')));
}

/** Bookings someone has to act on (incomplete or pending), for the sidebar badge. */
export const attentionCount = (list: BookingIssues[]) => list.filter(x => x.issues.some(c => ISSUES[c].group !== 'cancelled')).length;
