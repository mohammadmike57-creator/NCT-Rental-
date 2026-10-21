import { PaymentType, RentalSource, Reservation } from '../types';

export type BookingPayment = PaymentType.PREPAID | PaymentType.PAY_ON_ARRIVAL;
type PayFields = Partial<Pick<Reservation, 'source' | 'paymentType'>>;

/** The booking's source, matched by name (or by id on older bookings). */
export const sourceOf = (r: { source?: string }, sources: RentalSource[] = []) =>
  r.source ? sources.find(s => s.name === r.source || s.id === r.source) : undefined;

/** True when the source sends bookings both ways, so each booking must say how it is paid. */
export const sourceTakesBoth = (src?: RentalSource) => src?.paymentType === PaymentType.BOTH;

/**
 * How a booking is paid: the booking's own choice, otherwise its source's payment type.
 * undefined means the source takes both and nobody has chosen yet.
 */
export const bookingPayment = (r: PayFields, sources: RentalSource[] = []): BookingPayment | undefined => {
  if (r.paymentType === PaymentType.PREPAID || r.paymentType === PaymentType.PAY_ON_ARRIVAL) return r.paymentType;
  const t = sourceOf(r, sources)?.paymentType;
  return t === PaymentType.PREPAID || t === PaymentType.PAY_ON_ARRIVAL ? t : undefined;
};

export const isPrepaid = (r: PayFields, sources?: RentalSource[]) => bookingPayment(r, sources) === PaymentType.PREPAID;
export const isPayOnArrival = (r: PayFields, sources?: RentalSource[]) => bookingPayment(r, sources) === PaymentType.PAY_ON_ARRIVAL;
/** The source takes both ways and this booking has not been set yet. */
export const paymentUnset = (r: PayFields, sources?: RentalSource[]) => !!r.source && bookingPayment(r, sources) === undefined && sourceTakesBoth(sourceOf(r, sources));

export const PAYMENT_LABEL: Record<PaymentType, string> = {
  [PaymentType.PREPAID]: 'Prepaid',
  [PaymentType.PAY_ON_ARRIVAL]: 'Pay on arrival',
  [PaymentType.BOTH]: 'Prepaid or pay on arrival',
};
export const PAYMENT_LABEL_AR: Record<BookingPayment, string> = {
  [PaymentType.PREPAID]: 'مدفوع مسبقاً',
  [PaymentType.PAY_ON_ARRIVAL]: 'الدفع عند الاستلام',
};
