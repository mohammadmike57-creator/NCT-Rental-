import { CompanyDetails, Reservation } from '../types';
import { URDRIVE_LOGO_B64 } from '../constants';
import { sendCustomerEmail, EmailOutcome } from '../firebase/api';
import { agreementHtmlToPdfBase64 } from './agreementPdf';
import { terminationFileName, terminationNumber } from './terminationDoc';
import { buildReturnChargesHtml, chargesFileName, chargesTotal, formatMoney, CHARGE_KIND_LABEL } from './returnChargesDoc';
import { rentalDaysOf } from './rentalDays';

type Attachment = { fileName: string; contentType: 'application/pdf' | 'text/html'; base64: string };

/** PDF of the document, or the HTML itself when the PDF cannot be produced (e.g. no canvas support). */
async function attach(html: string, fileName: string): Promise<Attachment> {
  try {
    return { fileName, contentType: 'application/pdf', base64: await agreementHtmlToPdfBase64(html) };
  } catch {
    return { fileName: fileName.replace(/\.pdf$/, '.html'), contentType: 'text/html', base64: btoa(unescape(encodeURIComponent(html))) };
  }
}

export interface AgreementEmailInput {
  reservation: Reservation;
  kind: 'checkout' | 'checkin';
  company: CompanyDetails;
  agreementHtml: string;
  /** Rental termination statement; attached when the agreement is closed. */
  terminationHtml?: string;
}

/**
 * Emails the customer their documents. At check-out: the signed agreement. At check-in: the closed
 * agreement, the rental termination statement and, if anything was charged at return, the invoice or claim.
 * Never throws.
 */
export async function emailAgreementDocuments({ reservation: r, kind, company, agreementHtml, terminationHtml }: AgreementEmailInput): Promise<EmailOutcome> {
  const to = r.customerEmail?.trim();
  if (!to) return { ok: false, reason: 'invalid', message: 'This booking has no customer email address.' };
  const isCheckout = kind === 'checkout';
  const rc = !isCheckout && r.returnCharges && r.returnCharges.items.length > 0 ? r.returnCharges : undefined;

  const attachments: Attachment[] = [await attach(agreementHtml, `Rental-Agreement-${r.bookingId}.pdf`)];
  if (!isCheckout && terminationHtml) attachments.push(await attach(terminationHtml, terminationFileName(r.bookingId)));
  if (rc) attachments.push(await attach(buildReturnChargesHtml(r, rc, company, URDRIVE_LOGO_B64), chargesFileName(rc, r.bookingId)));

  const days = rentalDaysOf(r.startDate, r.endDate);
  const usd = (n: number) => formatMoney(n, 'USD');
  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const trm = terminationNumber(r.bookingId);
  const late = r.lateReturnFee && !r.lateReturnFee.isWaived && r.lateReturnFee.status !== 'WAIVED' ? r.lateReturnFee : undefined;
  const newDamage = (r.dropOffDamageMarkers || []).length;
  const rentalDue = (r.unpaidExtensionAmount || 0) + (late && late.status === 'PENDING' ? late.amount : 0);

  return sendCustomerEmail({
    to,
    subject: isCheckout ? `Your rental agreement · Booking ${r.bookingId}` : `Rental termination ${trm} · Booking ${r.bookingId}`,
    heading: isCheckout ? 'Your rental agreement' : 'Your rental has ended — termination statement',
    intro: `Dear ${r.personName}, ${isCheckout
      ? `thank you for choosing ${company.name}. Your signed rental agreement is attached to this email. Please keep it with you for the duration of the rental.`
      : rc
        ? `we have checked in your vehicle and your rental agreement is now terminated. Attached are the rental termination statement ${trm}, your final signed agreement and ${rc.settlement === 'paid' ? `your paid invoice ${rc.documentNumber}` : `claim ${rc.documentNumber}`} for the damages and charges found at return, including photos.`
        : `we have checked in your vehicle and your rental agreement is now terminated. Attached are the rental termination statement ${trm}${rentalDue > 0 ? '' : ', confirming that nothing further is due,'} and your final signed agreement with the return inspection.`}`,
    rows: [
      ['Booking', r.bookingId],
      ...(isCheckout ? [] : [['Termination no.', trm] as [string, string]]),
      ['Vehicle', `${r.carModel || '—'}${r.licensePlate ? ` · ${r.licensePlate}` : ''}`],
      ['Pick-up', fmt(r.startDate)],
      ['Return', fmt(r.endDate)],
      ['Duration', `${days} day${days === 1 ? '' : 's'}`],
      ['Rental total', usd(r.amount || 0)],
      ...(isCheckout ? [] : [
        ['Kilometres', r.dropOffKmIn != null && r.pickupKmOut != null ? `${r.pickupKmOut} → ${r.dropOffKmIn}` : '—'] as [string, string],
        ['New damage', newDamage ? `${newDamage} mark${newDamage === 1 ? '' : 's'}` : 'None'] as [string, string],
        ...(late ? [['Late return', `${late.hoursLate} h — ${usd(late.amount)}${late.status === 'PENDING' ? ' (due)' : ''}`] as [string, string]] : []),
      ]),
      ...(rc ? [
        ...rc.items.map((it, i) => [`${i + 1}. ${CHARGE_KIND_LABEL[it.kind]}${it.markerNumber ? ` (mark #${it.markerNumber})` : ''}`, `${it.description} — ${formatMoney(it.amount, rc.currency)}`] as [string, string]),
        [rc.settlement === 'paid' ? 'Charges paid' : 'Amount due', `${formatMoney(chargesTotal(rc.items), rc.currency)}${rc.settlement === 'claim' && rc.dueDate ? ` by ${new Date(rc.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}`] as [string, string],
      ] : []),
    ],
    closing: isCheckout ? `We wish you a safe journey. If you need assistance during your rental, call us on ${company.phone}.`
      : rc && rc.settlement === 'claim' ? `Please settle the amount due, quoting ${rc.documentNumber}. For questions about the charges, call us on ${company.phone}.`
      : `Thank you for renting with ${company.name}. We hope to see you again soon.`,
    companyName: company.name,
    companyAddress: company.address,
    companyPhone: company.phone,
    companyEmail: company.email,
    attachments,
    badge: isCheckout ? 'RENTAL AGREEMENT' : rc ? (rc.settlement === 'paid' ? 'TERMINATED · PAID' : 'TERMINATED · PAYMENT DUE') : 'RENTAL TERMINATED',
    tone: rc ? (rc.settlement === 'paid' ? 'success' : 'warning') : isCheckout ? 'info' : 'success',
    highlightLabel: rc ? (rc.settlement === 'paid' ? `Damages & charges · paid (${rc.documentNumber})` : `Damages & charges · amount due (${rc.documentNumber})`) : isCheckout ? 'Rental total' : rentalDue > 0 ? 'Balance still due' : 'Balance',
    highlightValue: rc ? formatMoney(chargesTotal(rc.items), rc.currency) : isCheckout ? usd(r.amount || 0) : usd(rentalDue),
  });
}
