import { Reservation, ReturnCharges } from '../../types';

/** Rental days for an agreement: any part day counts as a day once it is 2 hours or more past full days. */
export const calculateDaysWithGrace = (start: string, end: string): number => {
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

/** Extras that add a driver ("Additional driver", "Extra driver", "Second driver", Arabic "سائق إضافي"). */
export const isDriverExtra = (name: string) => /(additional|extra|second)\s*driver|سائق إضافي/i.test(name || '');

/** What can still be changed on the agreement after check-out (with "Save changes"). */
export const AMEND_FIELDS: (keyof Reservation)[] = ['customerEmail', 'driver', 'additionalDrivers', 'paymentMethod', 'cardNumber', 'authNumber', 'finalAmountCharged', 'depositHoldMethod', 'depositAuthNumber',
  'carModel', 'licensePlate', 'sippCode', 'transmission'];
/** Saved together with the fields above: extras added while the car is out move the booking total. */
export const AMEND_SAVED: (keyof Reservation)[] = [...AMEND_FIELDS, 'extras', 'baseAmount', 'amount', 'pickupPaymentCollected', 'startDate', 'pickupDate', 'endDate', 'dropoffDate'];
export const AMEND_LABEL: Partial<Record<keyof Reservation, string>> = {
  customerEmail: 'email', driver: 'driver documents', additionalDrivers: 'additional drivers', authNumber: 'payment auth code',
  depositAuthNumber: 'deposit pre-auth code', cardNumber: 'card digits', extras: 'extras',
  paymentMethod: 'payment method', finalAmountCharged: 'amount charged', depositHoldMethod: 'deposit hold',
  startDate: 'pick-up time', pickupDate: 'pick-up time', endDate: 'return time', dropoffDate: 'return time',
  carModel: 'car type', licensePlate: 'license plate', sippCode: 'car type', transmission: 'car type',
};

// ---- What makes each step of check-out / check-in complete (the same checks the "Complete" button makes) ----

/** The customer email is required (the signed documents are emailed) and must look like an email address. */
export const emailCheck = (email?: string): { valid: boolean; hint: string } => {
  const missing = !email?.trim();
  const valid = !missing && /^\S+@\S+\.\S+$/.test(email!.trim());
  return { valid, hint: missing ? 'Email address required' : 'Email address not valid' };
};

/** Odometer at check-out: a number, zero or more. */
export const kmOutOk = (r: Pick<Reservation, 'pickupKmOut'>): boolean =>
  r.pickupKmOut !== undefined && r.pickupKmOut !== null && r.pickupKmOut >= 0;

/** Odometer at check-in: a number, zero or more, and not below the check-out reading. */
export const kmInOk = (r: Pick<Reservation, 'pickupKmOut' | 'dropOffKmIn'>): boolean =>
  r.dropOffKmIn !== undefined && r.dropOffKmIn !== null && r.dropOffKmIn >= 0
  && !(r.pickupKmOut !== undefined && r.pickupKmOut !== null && r.dropOffKmIn < r.pickupKmOut);

/** Return charges: none, or every line described with an amount, settled, paid with a method, and signed. */
export const chargesOk = (charges: ReturnCharges): boolean => charges.items.length === 0 || (
  charges.items.every(i => !!i.description.trim() && i.amount > 0) && !!charges.settlement
  && (charges.settlement !== 'paid' || !!charges.paymentMethod) && !!charges.customerSignature);

/** How many of the two signatures (renter, agent) are there. */
export const signedCount = (a?: string, b?: string) => (a ? 1 : 0) + (b ? 1 : 0);

/** How many checklist items are ticked. */
export const countChecked = (items: string[], ticked?: { [item: string]: boolean }) => items.filter(i => ticked?.[i]).length;

/**
 * The first step that stops the agreement from being completed, in the order the screen checks them
 * (so the step it jumps to matches the message shown), or undefined when it can be completed.
 */
export const firstMissingStep = (mode: 'pickup' | 'dropoff', r: Reservation, paymentChosen: boolean, charges: ReturnCharges): string | undefined => {
  const email = emailCheck(r.customerEmail).valid;
  if (mode === 'pickup') {
    if (!email) return 'customer';
    if (!r.licensePlate?.trim()) return 'vehicle';
    if (!kmOutOk(r)) return 'fuel';
    if (!paymentChosen) return 'payment';
    return undefined;
  }
  if (!email) return 'return';
  if (!kmInOk(r)) return 'fuel';
  if (!chargesOk(charges)) return 'charges';
  return undefined;
};
