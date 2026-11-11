import { Reservation } from '../../types';

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
