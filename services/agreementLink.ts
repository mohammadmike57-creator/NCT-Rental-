import { Reservation } from '../types';

/**
 * Everything the counter recorded on an agreement opened before its booking was in the system.
 * When the reservations team links that agreement to the real (website/partner) reservation,
 * these fields move onto the reservation; the booking details themselves come from the reservation.
 */
const AGREEMENT_FIELDS: (keyof Reservation)[] = [
  'voucherSubmitted', 'dropOffCompleted',
  'pickupDateTime', 'pickupRenterSignature', 'pickupAgentSignature', 'pickupAgentName', 'pickupDamageMarkers',
  'pickupChecklist', 'pickupFuelLevel', 'pickupKmOut', 'pickupNotes',
  'dropOffDateTime', 'dropOffRenterSignature', 'dropOffAgentSignature', 'dropOffAgentName', 'dropOffDamageMarkers',
  'dropOffChecklist', 'dropOffFuelLevel', 'dropOffKmIn', 'dropOffNotes',
  'carExchanges', 'returnCharges', 'agreementEmails', 'upgradeHistory', 'extensionHistory', 'unpaidExtensionAmount',
  'lateReturnFee', 'driver', 'additionalDrivers', 'paymentMethod', 'cardNumber', 'cardExpiry', 'authNumber',
  'finalAmountCharged', 'pickupPaymentCollected',
];
/** Copied only when the reservation does not already have a value. */
const FILL_IF_EMPTY: (keyof Reservation)[] = ['customerEmail', 'contactNumber', 'securityDeposit', 'excess', 'locationName', 'paymentType'];

export function mergeAgreementInto(target: Reservation, agreement: Reservation, linkedBy?: string): Reservation {
  const merged: Reservation = { ...target };
  const m = merged as unknown as Record<string, unknown>;
  const a = agreement as unknown as Record<string, unknown>;
  AGREEMENT_FIELDS.forEach(k => { if (a[k as string] !== undefined) m[k as string] = a[k as string]; });
  FILL_IF_EMPTY.forEach(k => { if ((m[k as string] === undefined || m[k as string] === '' || m[k as string] === 0) && a[k as string]) m[k as string] = a[k as string]; });
  // The car actually handed over at the counter wins over the booked model.
  if (agreement.voucherSubmitted) {
    if (agreement.licensePlate) merged.licensePlate = agreement.licensePlate;
    if (agreement.carModel) merged.carModel = agreement.carModel;
  }
  merged.notes = [target.notes, agreement.notes && agreement.notes !== target.notes ? agreement.notes : ''].filter(Boolean).join(' · ');
  merged.awaitingConfirmation = false;
  merged.confirmedBy = linkedBy;
  merged.confirmedAt = new Date().toISOString();
  merged.unlistedCreatedBy = agreement.unlistedCreatedBy;
  merged.unlistedCreatedAt = agreement.unlistedCreatedAt;
  merged.linkedAgreementRef = agreement.bookingId;
  return merged;
}

/** How likely a reservation is the booking an agreement was opened for (higher is better). */
export function matchScore(candidate: Reservation, agreement: Reservation): number {
  let score = 0;
  const norm = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ ]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  if (candidate.bookingId && agreement.bookingId && candidate.bookingId.trim().toLowerCase() === agreement.bookingId.trim().toLowerCase()) score += 100;
  const a = new Set(norm(agreement.personName));
  const shared = norm(candidate.personName).filter(w => a.has(w)).length;
  score += shared * 25;
  const phone = (s?: string) => (s || '').replace(/\D/g, '').slice(-8);
  if (phone(candidate.contactNumber) && phone(candidate.contactNumber) === phone(agreement.contactNumber)) score += 40;
  if (candidate.customerEmail && agreement.customerEmail && candidate.customerEmail.toLowerCase() === agreement.customerEmail.toLowerCase()) score += 40;
  const days = Math.abs(new Date(candidate.startDate).getTime() - new Date(agreement.startDate).getTime()) / 86400000;
  if (Number.isFinite(days)) score += days < 0.6 ? 30 : days <= 1.5 ? 18 : days <= 3 ? 6 : 0;
  if (candidate.carModel && agreement.carModel && candidate.carModel.toLowerCase() === agreement.carModel.toLowerCase()) score += 10;
  return score;
}
