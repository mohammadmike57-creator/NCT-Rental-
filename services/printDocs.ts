import { CompanyDetails, RentalLocation, RentalSource, PaymentType, Reservation } from '../types';
import { URDRIVE_LOGO_B64 } from '../constants';
import { buildAgreementHtml } from './agreementDoc';
import { buildTerminationHtml } from './terminationDoc';

export const CHECKLIST_ITEMS = ['Spare Tire', 'Jack & Tools', 'Windows & Windshield', 'Headlights', 'Turn Signals', 'AC / Heater', 'Audio System', 'Mirrors', 'Interior Cleanliness'];

const DAY = 86400000;
/** Rental days with the 2-hour grace period used across the system. */
export const rentalDaysOf = (start: string, end: string) => {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(diff) || diff <= DAY) return 1;
  const full = Math.floor(diff / DAY);
  return diff % DAY >= 2 * 3600000 ? full + 1 : full;
};

export interface PrintContext { company: CompanyDetails; sources: RentalSource[]; locations: RentalLocation[] }

const docInput = (r: Reservation, ctx: PrintContext) => {
  const days = rentalDaysOf(r.startDate, r.endDate);
  const extras = (r.extras || []).reduce((s, e) => (e.isComplementary ? s : s + e.dailyPrice * days), 0);
  const loc = ctx.locations.find(l => l.name === r.locationName);
  return {
    reservation: r, company: ctx.company, logo: URDRIVE_LOGO_B64, checklistItems: CHECKLIST_ITEMS, rentalDays: days,
    baseRentalFee: r.baseAmount ?? ((r.amount || 0) - extras), locationName: loc?.name || r.locationName, locationAddress: loc?.address,
    prepaid: ctx.sources.find(s => s.name === r.source)?.paymentType === PaymentType.PREPAID,
  };
};

export const agreementHtmlFor = (r: Reservation, ctx: PrintContext) => buildAgreementHtml(docInput(r, ctx));
export const terminationHtmlFor = (r: Reservation, ctx: PrintContext) => buildTerminationHtml(docInput(r, ctx));

/**
 * Opens a document in a new window and shows the print dialog once its images
 * (logo, signatures, photos) have loaded. Returns false if pop-ups are blocked.
 */
export function printHtml(html: string): boolean {
  const w = window.open('', '_blank', 'width=900,height=1100');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  const go = () => { w.focus(); w.print(); };
  const imgs = Array.from(w.document.images);
  const pending = imgs.filter(i => !i.complete);
  if (!pending.length) setTimeout(go, 250);
  else {
    let left = pending.length;
    const done = () => { left -= 1; if (left <= 0) setTimeout(go, 150); };
    pending.forEach(i => { i.onload = done; i.onerror = done; });
    setTimeout(go, 4000); // never wait forever
  }
  return true;
}
