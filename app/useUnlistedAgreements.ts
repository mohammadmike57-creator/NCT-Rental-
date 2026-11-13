import { AppData, Reservation, ReservationStatus, User } from '../types';
import { MONTHS } from '../constants';
import { reservationService } from '../services/reservationService';
import { mergeAgreementInto } from '../services/agreementLink';
import { recordActivity } from '../services/api';

type SaveStatus = 'saved' | 'saving' | 'error';

interface Deps {
  currentUser: User | null;
  /** The signed-in person's email in lower case ('' when signed out). */
  myEmail: string;
  setReservations: (data: AppData) => void;
  setSaveStatus: (s: SaveStatus) => void;
  showConfirmation: (message: string) => void;
  addNotification: (message: string, type: 'error' | 'warning' | 'success' | 'info') => void;
  updateReservation: (r: Reservation) => Promise<void> | void;
}

/**
 * Unlisted agreements (rentals started at the counter without a reservation): list one as a normal
 * reservation, attach it to the reservation entered later, save details, mark as reviewed, or reject.
 */
export const useUnlistedAgreements = ({ currentUser, myEmail, setReservations, setSaveStatus, showConfirmation, addNotification, updateReservation }: Deps) => {
  /** Unlisted agreement → normal reservation, stored under its (possibly changed) pickup month. */
  const handleListUnlisted = async (updated: Reservation, original: Reservation) => {
    const start = new Date(updated.startDate);
    const year = Number.isNaN(start.getTime()) ? original.storageYear : start.getFullYear();
    const month = Number.isNaN(start.getTime()) ? original.storageMonth : MONTHS[start.getMonth()];
    const next: Reservation = { ...updated, storageYear: year, storageMonth: month, importLockedYear: year, importLockedMonth: month, lastEditedBy: currentUser?.fullName, updatedAt: new Date().toISOString() };
    setSaveStatus('saving');
    try {
      if (original.storageYear && original.storageMonth && (original.storageYear !== year || original.storageMonth !== month)) {
        await reservationService.deleteReservation(original.id, original.storageYear, original.storageMonth);
      }
      const data = await reservationService.updateReservation(next);
      setReservations(data);
      setSaveStatus('saved');
      showConfirmation(`${next.bookingId} is now listed in Reservations (${month} ${year}).`);
      recordActivity('UNLISTED_LISTED', 'reservation', `Listed unlisted agreement as a reservation — ${next.personName}, ${next.carModel}`, next.bookingId);
    } catch (err) {
      setSaveStatus('error');
      console.error('Failed to list unlisted agreement:', err);
      addNotification('Could not list the reservation. Check your connection and try again.', 'error');
    }
  };
  /** Counter agreement → the website/partner reservation entered later; the temporary record is removed. */
  const handleLinkUnlisted = async (target: Reservation, agreement: Reservation) => {
    const merged = mergeAgreementInto(target, agreement, currentUser?.fullName);
    setSaveStatus('saving');
    try {
      await reservationService.updateReservation({ ...merged, lastEditedBy: currentUser?.fullName, updatedAt: new Date().toISOString() });
      const data = await reservationService.deleteReservation(agreement.id, agreement.storageYear, agreement.storageMonth);
      setReservations(data);
      setSaveStatus('saved');
      showConfirmation(`Agreement ${agreement.bookingId} is now attached to reservation ${target.bookingId}.`);
      recordActivity('UNLISTED_LINKED', 'reservation', `Linked counter agreement ${agreement.bookingId} to reservation ${target.bookingId} — ${target.personName}`, target.bookingId);
    } catch (err) {
      setSaveStatus('error');
      console.error('Failed to link agreement:', err);
      addNotification('Could not link the agreement. Check your connection and try again.', 'error');
    }
  };
  const handleSaveUnlistedDraft = async (updated: Reservation) => {
    await updateReservation(updated);
    showConfirmation(`Details saved for ${updated.bookingId}. It stays in Unlisted agreements until you list it.`);
  };
  /** Marks unlisted agreements as reviewed by the signed-in user (removes them from their "New" section). */
  const handleMarkUnlistedSeen = async (items: Reservation[]) => {
    if (!myEmail) return;
    for (const res of items) {
      if ((res.unlistedSeenBy || []).includes(myEmail)) continue;
      // Saved directly so "last edited by" is not changed just by reviewing.
      try { setReservations(await reservationService.updateReservation({ ...res, unlistedSeenBy: [...(res.unlistedSeenBy || []), myEmail] })); } catch (e) { console.error('Could not mark as reviewed', e); }
    }
  };
  const handleRejectUnlisted = (res: Reservation) => {
    const msg = res.voucherSubmitted && !res.dropOffCompleted
      ? `${res.personName} currently has the car (${res.licensePlate || res.carModel}). Reject ${res.bookingId} anyway? It will be marked as cancelled.`
      : `Reject ${res.bookingId} for ${res.personName}? It will be marked as cancelled.`;
    if (!window.confirm(msg)) return;
    updateReservation({ ...res, awaitingConfirmation: false, status: ReservationStatus.CANCELLED, confirmedBy: currentUser?.fullName, confirmedAt: new Date().toISOString() });
    recordActivity('UNLISTED_REJECTED', 'reservation', `Rejected unlisted agreement — ${res.personName}`, res.bookingId);
  };

  return { handleListUnlisted, handleLinkUnlisted, handleSaveUnlistedDraft, handleMarkUnlistedSeen, handleRejectUnlisted };
};
