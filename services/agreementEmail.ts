import { CompanyDetails, Reservation } from '../types';
import { URDRIVE_LOGO_B64 } from '../constants';
import { sendCustomerEmail, EmailOutcome } from '../firebase/api';
import { agreementHtmlToPdfBase64 } from './agreementPdf';
import { terminationFileName, terminationNumber } from './terminationDoc';
import { buildReturnChargesHtml, chargesFileName, chargesTotal, formatMoney, CHARGE_KIND_LABEL } from './returnChargesDoc';
import { rentalDaysOf } from './rentalDays';
import { brandFields, supportLine } from './emailBrand';
import { lateFeeOf } from './lateReturn';

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
  const late = lateFeeOf(r) && !lateFeeOf(r)!.isWaived && lateFeeOf(r)!.status !== 'WAIVED' ? lateFeeOf(r) : undefined;
  const newDamage = (r.dropOffDamageMarkers || []).length;
  const rentalDue = (r.unpaidExtensionAmount || 0) + (late && late.status === 'PENDING' ? late.amount : 0);

  const day = (iso?: string) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '');
  const rcTotal = rc ? formatMoney(chargesTotal(rc.items), rc.currency) : '';
  const brand = company.name;
  const contact = supportLine(company);
  const finesNote = 'Please note that traffic violations, tolls and parking fines incurred during the rental period remain the responsibility of the renter, including any notified to us by the authorities after the vehicle has been returned.';

  const intro = isCheckout
    ? `Dear ${r.personName},\n\nThank you for choosing ${brand}. Your vehicle has been handed over and your rental agreement is now in effect.\n\nPlease find your signed rental agreement attached. It records the condition of the vehicle at pick-up, the agreed charges and the terms and conditions of your rental. We recommend keeping a copy with you for the duration of your rental.`
    : !rc
      ? `Dear ${r.personName},\n\nThank you for returning your vehicle. Following our return inspection, we confirm that your rental agreement ${r.bookingId} has now been closed.\n\nAttached you will find your rental termination statement ${trm}, which sets out the final account of your rental${rentalDue > 0 ? ' and the balance that remains payable' : ' and confirms that no further amount is due'}, together with your final signed rental agreement including the return inspection.`
      : rc.settlement === 'paid'
        ? `Dear ${r.personName},\n\nThank you for returning your vehicle. Following our return inspection, we confirm that your rental agreement ${r.bookingId} has now been closed.\n\nThe additional charges identified at return, summarised below, were settled at the counter. For your records, we attach your paid invoice ${rc.documentNumber}, your rental termination statement ${trm} and your final signed rental agreement.`
        : `Dear ${r.personName},\n\nThank you for returning your vehicle. Following our return inspection, we confirm that your rental agreement ${r.bookingId} has now been closed.\n\nDuring the inspection, the items summarised below were identified and have been charged in accordance with the terms and conditions of your rental agreement. The attached claim ${rc.documentNumber} details each item, with supporting photographs where applicable. Your rental termination statement ${trm} and final signed rental agreement are also attached.`;

  const closing = isCheckout
    ? `Please return the vehicle${r.locationName ? ` to ${r.locationName}` : ''} by ${fmt(r.endDate)}, with the same fuel level as at pick-up. Should you wish to extend your rental or require any assistance during your journey, please contact our customer support team on ${contact}, quoting your booking reference ${r.bookingId}.\n\nWe wish you a safe and pleasant journey.`
    : rc && rc.settlement === 'claim'
      ? `We kindly request payment of ${rcTotal}${rc.dueDate ? ` by ${day(rc.dueDate)}` : ''}, quoting reference ${rc.documentNumber}. Should you have any questions regarding these charges, our customer support team will be pleased to assist you on ${contact}.\n\n${finesNote}`
      : `${rc ? 'No further payment is required. ' : rentalDue > 0 ? `We kindly request settlement of the outstanding balance of ${usd(rentalDue)} at your earliest convenience, quoting your booking reference ${r.bookingId}. ` : ''}${finesNote}\n\nThank you for choosing ${brand}. We look forward to welcoming you again.`;

  return sendCustomerEmail({
    to,
    subject: isCheckout
      ? `Your Rental Agreement – Booking ${r.bookingId} | ${brand}`
      : rc && rc.settlement === 'claim'
        ? `Payment Required – Return Charges ${rc.documentNumber} – Booking ${r.bookingId} | ${brand}`
        : `Your Rental is Complete – Termination Statement ${trm} – Booking ${r.bookingId} | ${brand}`,
    heading: isCheckout ? 'Your rental has started' : rc && rc.settlement === 'claim' ? 'Your rental is complete – payment required' : 'Your rental is complete',
    intro,
    rows: [
      ['Booking reference', r.bookingId],
      ...(isCheckout ? [] : [['Termination statement', trm] as [string, string]]),
      ['Vehicle', `${r.carModel || '—'}${r.licensePlate ? ` · ${r.licensePlate}` : ''}`],
      ['Pick-up', fmt(r.startDate)],
      [isCheckout ? 'Scheduled return' : 'Return', fmt(r.endDate)],
      ['Rental period', `${days} day${days === 1 ? '' : 's'}`],
      ['Rental total', usd(r.amount || 0)],
      ...(isCheckout ? [] : [
        ['Mileage', r.dropOffKmIn != null && r.pickupKmOut != null ? `${r.pickupKmOut.toLocaleString('en-US')} → ${r.dropOffKmIn.toLocaleString('en-US')} km` : '—'] as [string, string],
        ['New damage at return', newDamage ? `${newDamage} item${newDamage === 1 ? '' : 's'}` : 'None'] as [string, string],
        ...(late ? [['Late return', `${late.hoursLate} h · ${usd(late.amount)}${late.status === 'PENDING' ? ' (payable)' : ''}`] as [string, string]] : []),
      ]),
      ...(rc ? [
        ...rc.items.map((it, i) => [`${i + 1}. ${CHARGE_KIND_LABEL[it.kind]}`, `${it.description} · ${formatMoney(it.amount, rc.currency)}`] as [string, string]),
        [rc.settlement === 'paid' ? 'Total paid' : 'Total due', `${rcTotal}${rc.settlement === 'claim' && rc.dueDate ? ` by ${day(rc.dueDate)}` : ''}`] as [string, string],
      ] : []),
    ],
    closing,
    ...brandFields(company),
    attachments,
    badge: isCheckout ? 'RENTAL AGREEMENT' : rc ? (rc.settlement === 'paid' ? 'TERMINATED · PAID' : 'TERMINATED · PAYMENT DUE') : 'RENTAL TERMINATED',
    tone: rc ? (rc.settlement === 'paid' ? 'success' : 'warning') : isCheckout ? 'info' : 'success',
    highlightLabel: rc ? (rc.settlement === 'paid' ? `Charges paid · ${rc.documentNumber}` : `Amount due · ${rc.documentNumber}`) : isCheckout ? 'Rental total' : rentalDue > 0 ? 'Balance payable' : 'Balance due',
    highlightValue: rc ? rcTotal : isCheckout ? usd(r.amount || 0) : usd(rentalDue),
  });
}
