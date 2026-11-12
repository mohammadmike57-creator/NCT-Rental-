import { Reservation } from '../types';

/** The agreement with this email added to its log (and to the return charges' log when charges were sent too). */
export function withEmailLog(r: Reservation, to: string, kind: 'checkout' | 'checkin', sentAt: string): Reservation {
  const rc = kind === 'checkin' && r.returnCharges && r.returnCharges.items.length > 0 ? r.returnCharges : undefined;
  return {
    ...r,
    agreementEmails: [...(r.agreementEmails || []), { to, kind, sentAt }],
    ...(rc ? { returnCharges: { ...rc, emails: [...(rc.emails || []), { to, sentAt }] } } : {}),
  };
}

/** What staff are told after "Email documents": what went out, what did not, or that email is not set up. */
export function documentsSentMessage(closed: boolean, email: string, agreementSent: boolean, receipt: { ok: boolean; reason?: string }, savedNote = ''): string {
  const docs = closed ? 'closed agreement, the termination statement' : 'agreement';
  const note = savedNote ? ' ' + savedNote : '';
  if (agreementSent && receipt.ok) return `The ${docs} and the receipt were emailed to ${email}.`;
  if (receipt.reason === 'unconfigured') return `Email is not set up yet (Email Settings), so nothing was sent.${note}`;
  return `${agreementSent ? `The ${docs} ${closed ? 'were' : 'was'} sent` : `The ${docs} could not be sent`}; ${receipt.ok ? 'the receipt was sent' : 'the receipt could not be sent'} to ${email}.${note}`;
}
