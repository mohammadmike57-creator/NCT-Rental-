import { waitForFonts } from './docFonts';
import { CompanyDetails, Fleet, RentalLocation, RentalSource, PaymentType, Reservation } from '../types';
import { carPhotoFor } from './carPhoto';
import { isPrepaid } from './paymentType';
import { URDRIVE_LOGO_B64 } from '../constants';
import { buildAgreementHtml } from './agreementDoc';
import { buildTerminationHtml } from './terminationDoc';

export const CHECKLIST_ITEMS = ['Spare Tire', 'Jack & Tools', 'Windows & Windshield', 'Headlights', 'Turn Signals', 'AC / Heater', 'Audio System', 'Mirrors', 'Interior Cleanliness'];

import { rentalDaysOf } from './rentalDays';
export { rentalDaysOf };

export interface PrintContext { company: CompanyDetails; sources: RentalSource[]; locations: RentalLocation[]; fleet?: Fleet }

const docInput = (r: Reservation, ctx: PrintContext) => {
  const days = rentalDaysOf(r.startDate, r.endDate);
  const extras = (r.extras || []).reduce((s, e) => (e.isComplementary ? s : s + e.dailyPrice * days), 0);
  const loc = ctx.locations.find(l => l.name === r.locationName);
  return {
    reservation: r, company: ctx.company, logo: URDRIVE_LOGO_B64, checklistItems: CHECKLIST_ITEMS, rentalDays: days,
    baseRentalFee: r.baseAmount ?? ((r.amount || 0) - extras), locationName: loc?.name || r.locationName, locationAddress: loc?.address,
    prepaid: isPrepaid(r, ctx.sources),
    vehiclePhoto: carPhotoFor(ctx.fleet, r.licensePlate, r.carModel),
  };
};

export const agreementHtmlFor = (r: Reservation, ctx: PrintContext) => buildAgreementHtml(docInput(r, ctx));
export const terminationHtmlFor = (r: Reservation, ctx: PrintContext) => buildTerminationHtml(docInput(r, ctx));

// Printable area of an A4 sheet with the documents' 9 mm margins, in CSS px.
const A4_PRINT_WIDTH = '192mm';
const A4_PRINT_HEIGHT_PX = ((297 - 18) * 96) / 25.4 - 10;

/**
 * Documents made of fixed pages (<div class="pdf-page">, e.g. the rental agreement and its
 * terms) are scaled so each one fills exactly one printed sheet. The terms then always land
 * on page 2 — the back of the agreement when printing two-sided.
 */
function fitPagesForPrint(d: Document) {
  const pages = Array.from(d.querySelectorAll<HTMLElement>('body > .pdf-page'));
  if (pages.length < 2) return;
  // Full-page documents (the rental agreement) print without margins: each page is a whole A4 sheet.
  const fullBleed = d.body.dataset.fullbleed === '1';
  const maxH = fullBleed ? (297 * 96) / 25.4 : A4_PRINT_HEIGHT_PX;
  d.body.style.width = fullBleed ? 'auto' : A4_PRINT_WIDTH;
  d.body.style.margin = '0 auto';
  d.body.style.padding = '0';
  d.body.style.setProperty('zoom', '1');
  (d.defaultView as (Window & { __fitPages?: () => void }) | null)?.__fitPages?.();
  pages.forEach(page => {
    page.style.setProperty('zoom', '1');
    // A full page laid out on a larger sheet is shrunk back to exactly one A4 sheet.
    if (fullBleed) { if (page.dataset.scale) page.style.setProperty('zoom', page.dataset.scale); return; }
    const h = page.getBoundingClientRect().height;
    if (h > maxH + 1) page.style.setProperty('zoom', (maxH / h).toFixed(3));
  });
  if (!d.getElementById('duplex-tip')) {
    const tip = d.createElement('div');
    tip.id = 'duplex-tip';
    tip.textContent = 'Tip: choose “Two-sided” / “Print on both sides” in the print settings so the Terms and Conditions print on the back of the agreement.';
    tip.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:8px 14px;background:#0f172a;color:#fff;font:13px/1.4 Inter,Arial,sans-serif;text-align:center;z-index:10;';
    const style = d.createElement('style');
    style.textContent = '@media print { #duplex-tip { display: none !important; } }';
    d.head.appendChild(style);
    d.body.appendChild(tip);
  }
}

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
  let printed = false;
  const go = () => { if (printed) return; printed = true; waitForFonts(w.document).then(() => { fitPagesForPrint(w.document); w.focus(); w.print(); }); };
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
