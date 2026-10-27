import { CompanyDetails, RentalSource, Reservation } from '../types';
import { CustomerEmailPayload } from '../firebase/api';
import { isPrepaid as bookingIsPrepaid } from './paymentType';
import { brandFields, supportLine } from './emailBrand';

/** Rental days with the two-hour grace period used on the receipt. */
export function receiptDays(start: string, end: string): number {
  if (!start || !end) return 1;
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return 1;
  const ms = e.getTime() - s.getTime(), day = 86400000;
  if (ms <= day) return 1;
  const full = Math.floor(ms / day), rest = ms % day;
  return rest === 0 ? full : rest >= 2 * 3600000 ? full + 1 : full;
}

/** The figures on a payment receipt. */
export function receiptFigures(r: Reservation, sources: RentalSource[]) {
  const rentalDays = receiptDays(r.startDate, r.endDate);
  const extrasTotal = r.extras?.reduce((sum, x) => sum + (x.isComplementary ? 0 : x.dailyPrice * rentalDays), 0) ?? 0;
  const baseRentalFee = r.baseAmount ?? (r.amount || 0);
  const totalCharges = baseRentalFee + extrasTotal;
  const isPrepaid = bookingIsPrepaid(r, sources);
  return {
    rentalDays, extrasTotal, baseRentalFee, totalCharges, isPrepaid,
    amountPaid: isPrepaid ? baseRentalFee : totalCharges,
    balanceDue: isPrepaid ? extrasTotal : 0,
  };
}

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

/** The branded payment-receipt email, to any address. */
export function receiptEmailPayload(r: Reservation, company: CompanyDetails, sources: RentalSource[], to: string): CustomerEmailPayload {
  const f = receiptFigures(r, sources);
  const period = (d: string) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const settled = f.balanceDue <= 0;
  return {
    to,
    subject: `Payment Receipt RCPT-${r.bookingId} – Booking ${r.bookingId} | ${company.name}`,
    heading: 'Thank you for your payment',
    intro: `Dear ${r.personName},\n\nThank you for your payment. We confirm receipt of the amount below for your rental with ${company.name}. Please retain this email as your receipt.`,
    rows: [
      ['Receipt number', `RCPT-${r.bookingId}`],
      ['Booking reference', r.bookingId],
      ['Vehicle', `${r.carModel || '—'}${r.licensePlate ? ` · ${r.licensePlate}` : ''}`],
      ['Rental period', `${period(r.startDate)} – ${period(r.endDate)}`],
      ['Total charges', usd(f.totalCharges)],
      ['Amount paid', usd(f.amountPaid)],
      ['Balance due', usd(f.balanceDue)],
    ],
    closing: settled
      ? `Your account for this booking is fully settled and no further payment is required.\n\nThank you for choosing ${company.name}. We look forward to serving you again.`
      : `A balance of ${usd(f.balanceDue)} remains outstanding on this booking. We kindly request settlement at your earliest convenience, quoting your booking reference.\n\nShould you have any questions regarding this receipt, please contact our customer support team on ${supportLine(company)}.`,
    ...brandFields(company),
    badge: settled ? 'PAID IN FULL' : 'PAYMENT RECEIVED',
    tone: settled ? 'success' : 'info',
    highlightLabel: 'Amount paid',
    highlightValue: usd(f.amountPaid),
  };
}
