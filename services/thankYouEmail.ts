import { CompanyDetails, RentalSource, Reservation } from '../types';
import { CustomerEmailPayload } from '../firebase/api';
import { brandFields } from './emailBrand';
import { rentalDaysOf } from './rentalDays';
import { chargesTotal, formatMoney } from './returnChargesDoc';

/**
 * The thank-you letter sent automatically once a car is returned and the agreement closed. It follows
 * the documents email (termination statement, final agreement, any invoice or claim), so it carries
 * no attachments: it thanks the customer, confirms the rental is complete and invites them back.
 */
export function thankYouEmailPayload(r: Reservation, company: CompanyDetails, sources: RentalSource[] = []): CustomerEmailPayload | null {
  const to = r.customerEmail?.trim();
  if (!to) return null;
  const brand = company.name || 'us';
  const days = rentalDaysOf(r.startDate, r.endDate);
  const km = r.dropOffKmIn != null && r.pickupKmOut != null && r.dropOffKmIn >= r.pickupKmOut ? r.dropOffKmIn - r.pickupKmOut : null;
  const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
  const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
  const when = (iso?: string) => (iso ? `${date(iso)}, ${time(iso)}` : '—');
  const returnedAt = r.dropOffDateTime && !Number.isNaN(new Date(r.dropOffDateTime).getTime()) ? r.dropOffDateTime : r.endDate;
  // "Rate us on …" names the site the customer booked through (not shown for walk-ins, calls and other direct bookings).
  const sourceName = (sources.find(s => s.id === r.source || s.name === r.source)?.name || r.source || '').trim();
  const rateOn = !sourceName || /walk|direct|call|phone|counter|office|unlisted/i.test(sourceName) ? ''
    : /^(our )?(web ?site|online)$/i.test(sourceName) ? 'our website' : sourceName;

  // How the rental ended, money-wise. The figures themselves were sent with the documents.
  const rc = r.returnCharges && r.returnCharges.items.length ? r.returnCharges : undefined;
  const late = r.lateReturnFee && r.lateReturnFee.status === 'PENDING' ? r.lateReturnFee.amount : 0;
  const balance = (r.unpaidExtensionAmount || 0) + late;
  const claim = rc && rc.settlement === 'claim';
  const owed = claim || balance > 0;
  const status = claim ? `Completed · ${formatMoney(chargesTotal(rc!.items), rc!.currency)} outstanding (${rc!.documentNumber})`
    : rc ? `Completed · additional charges of ${formatMoney(chargesTotal(rc.items), rc.currency)} settled`
      : balance > 0 ? `Completed · ${formatMoney(balance, 'USD')} outstanding`
        : 'Completed · no balance outstanding';

  const intro = `Dear ${r.personName},\n\n`
    + `On behalf of everyone at ${brand}, thank you for choosing us for your recent rental. We sincerely hope the ${r.carModel || 'vehicle'} served you well and that you were pleased with the service you received.\n\n`
    + `We are pleased to confirm that the vehicle was returned${r.locationName ? ` to our ${r.locationName}` : ''} on ${date(returnedAt)} at ${time(returnedAt)}, and that your rental has been successfully completed. Your rental termination statement and final rental agreement have been sent to you in a separate email for your records.`;

  const closing = (owed ? 'Regarding the outstanding amount, please refer to the separate email containing the full details. Our team will be pleased to answer any questions you may have.\n\n' : '')
    + 'Your feedback is important to us and helps us continually raise our standards. Should you wish to share your experience, or recognise a member of our team, we would be delighted to hear from you.\n\n'
    + `It would be our privilege to welcome you again on your next journey.`;

  return {
    to,
    subject: `Thank you for choosing ${brand} | Booking ${r.bookingId}`,
    heading: `Thank you for choosing ${brand}`,
    intro,
    rows: [
      ['Booking reference', r.bookingId],
      ['Vehicle', `${r.carModel || '—'}${r.licensePlate ? ` · ${r.licensePlate}` : ''}`],
      ['Pick-up', `${when(r.startDate)}${r.locationName ? ` · ${r.locationName}` : ''}`],
      ['Return', `${when(returnedAt)}${r.locationName ? ` · ${r.locationName}` : ''}`],
      ['Rental period', `${days} day${days === 1 ? '' : 's'}`],
      ...(km != null ? [['Distance', `${km.toLocaleString('en-US')} km`] as [string, string]] : []),
      ['Status', status],
    ],
    closing,
    ...brandFields(company),
    layout: 'letter',
    badge: 'Rental completed',
    tone: owed ? 'info' : 'success',
    arabic: `عزيزنا العميل،\nنشكركم على اختياركم ${brand}، ويسعدنا أنكم كنتم ضيوفنا. نؤكد إتمام عقد الإيجار بنجاح، ونتطلع إلى خدمتكم مجدداً.`,
    ...(rateOn ? { rateTitle: `Don't forget to rate us on ${rateOn}` } : {}),
    signature: 'Customer Experience Team',
  };
}
