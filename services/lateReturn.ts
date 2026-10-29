import { LateReturnFee, Reservation } from '../types';

/**
 * Late-return fees are switched off: none is worked out at check-in, and fees stored on older
 * bookings are not shown, printed, emailed or counted anywhere. Set to true to bring them back.
 */
export const LATE_RETURN_FEES = false;

/** The booking's late-return fee, or nothing while late-return fees are switched off. */
export const lateFeeOf = (r: Pick<Reservation, 'lateReturnFee'>): LateReturnFee | undefined => (LATE_RETURN_FEES ? r.lateReturnFee : undefined);
