import { Reservation } from '../types';

export const DEPOSIT_HOLD_LABEL: Record<'card' | 'cash', string> = { card: 'Card pre-authorisation', cash: 'Cash' };

/**
 * What the booking costs and what the counter collects at pick-up. A prepaid booking's rental was
 * paid to the partner, so the counter only collects extras and upgrades. The security deposit is
 * held for every booking, whatever the payment type.
 */
export function counterPayment(r: Reservation, prepaid: boolean, baseRentalFee: number, extrasTotal: number) {
  const upgrades = (r.upgradeHistory || []).reduce((s, u) => s + (u.fee || 0), 0);
  // Without a stored base amount, the booking amount already includes upgrade fees.
  const rental = Math.max(0, baseRentalFee - (r.baseAmount == null ? upgrades : 0));
  const total = rental + upgrades + extrasTotal;
  const toCollect = prepaid ? upgrades + extrasTotal : total;
  const deposit = r.securityDeposit || 0;
  const depositHeld = deposit <= 0 || (r.depositHoldMethod === 'cash') || (r.depositHoldMethod === 'card' && !!r.depositAuthNumber?.trim());
  return { rental, upgrades, extras: extrasTotal, total, toCollect, deposit, depositHeld };
}
