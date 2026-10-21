import { jsPDF } from 'jspdf';
import { loadArabicFontInApp, waitForFonts } from './docFonts';

/** Any of the printable documents (agreement, invoice, claim) as a PDF. */
/**
 * html2canvas cannot read images from another origin (the canvas becomes "tainted"), so photos
 * served by the API on a different host are embedded as data URLs first. An image that cannot be
 * fetched is removed rather than breaking the PDF.
 */
async function inlineRemoteImages(doc: Document) {
  const imgs = Array.from(doc.images).filter(img => /^https?:/i.test(img.src) && new URL(img.src).origin !== window.location.origin);
  await Promise.all(imgs.map(async img => {
    try {
      const blob = await (await fetch(img.src, { mode: 'cors' })).blob();
      const dataUrl = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(blob); });
      await new Promise(res => { img.onload = img.onerror = () => res(null); img.src = dataUrl; });
    } catch {
      img.remove();
    }
  }));
}

export const htmlToPdfBase64 = (html: string) => agreementHtmlToPdfBase64(html);

/** Triggers a browser download of a base64 PDF. */
export function downloadPdf(base64: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Renders the printable agreement HTML in an off-screen iframe (so its styles
 * cannot leak into the app) and turns it into an A4 PDF, returned as base64.
 */
export async function agreementHtmlToPdfBase64(html: string): Promise<string> {
  const html2canvas = (await import('html2canvas')).default;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('Could not prepare the document');
    doc.open();
    doc.write(html);
    doc.close();
    await new Promise(r => setTimeout(r, 150));
    await Promise.all([waitForFonts(doc), loadArabicFontInApp()]);
    await inlineRemoteImages(doc);
    await Promise.all(Array.from(doc.images).map(img => (img.complete ? null : new Promise(res => { img.onload = img.onerror = () => res(null); }))));
    // html2canvas draws text a few pixels lower than the browser lays it out, which makes
    // table rules cut through the text. Extra room under each cell keeps them clear.
    const fix = doc.createElement('style');
    fix.textContent = 'td, th { padding-bottom: 7px !important; } .stamp, .pill { padding-top: 1px !important; padding-bottom: 7px !important; } .terms-page td, .terms-page th { padding-bottom: 3px !important; } .card h2 { padding-top: 1px !important; padding-bottom: 7px !important; }';
    doc.head.appendChild(fix);
    const body = doc.body;
    body.style.padding = '0';

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 28;
    const imgW = pageW - margin * 2;
    let page = 0;

    // A document may be split into fixed pages (e.g. agreement + terms and conditions)
    // with top-level <div class="pdf-page"> blocks; each one starts on a new PDF page.
    const sections = Array.from(body.children).filter(el => el.classList.contains('pdf-page')) as HTMLElement[];
    for (const section of (sections.length ? sections : [null])) {
      if (section) sections.forEach(s => { s.style.display = s === section ? '' : 'none'; });
      await new Promise(r => setTimeout(r, 30));
      const height = Math.max(body.scrollHeight + 32, 1123);
      const canvas = await html2canvas(body, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 794, height, windowWidth: 794, windowHeight: height, logging: false });

      // Places where a page may end without cutting through a row, card or photo (in CSS px from the top).
      const bodyTop = body.getBoundingClientRect().top;
      // Documents can ask to break only between whole blocks (<body data-breaks="blocks">), never inside a table.
      const breakSelector = body.dataset.breaks === 'blocks'
        ? '.card, .band, .g2, .g3, .g2a, .foot, .clause, .ack, .tcols, .terms-head'
        : 'tr, .card, .avoid, .sec, table, .totals, .note, .band, .photos, .sign, .info, .parties, .sum, .foot, .balance, .notes, .sig, .lead, .facts, .clause';
      const breaks = Array.from(doc.querySelectorAll(breakSelector))
        .filter(el => (el as HTMLElement).offsetParent !== null || el.tagName === 'TR')
        .map(el => (el as HTMLElement).getBoundingClientRect().bottom - bodyTop)
        .filter(b => b > 0)
        .sort((a, b) => a - b);
      const scale = canvas.height / height;
      const ratio = imgW / canvas.width;
      const sliceH = Math.floor((pageH - margin * 2 - 10) / ratio);
      let y = 0;
      // Trim the blank space below the last element so it doesn't count as content.
      const contentBottom = Math.min(canvas.height, Math.round(((breaks[breaks.length - 1] ?? height) + 12) * scale));
      // A fixed page (.pdf-page) always fits on one sheet, so the agreement's terms land on the back of the
      // printed copy; other documents shrink only when slightly longer than a page (up to 20%).
      if (contentBottom > sliceH && (section || contentBottom <= sliceH * 1.2)) {
        const fit = (pageH - margin * 2 - 10) / contentBottom;
        const w = canvas.width * fit;
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = contentBottom;
        const ctx = slice.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, 0, canvas.width, contentBottom, 0, 0, canvas.width, contentBottom);
        if (page > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', (pageW - w) / 2, margin, w, contentBottom * fit);
        page++;
        continue;
      }
      while (y < Math.min(canvas.height, contentBottom) - 2) {
        let end = Math.min(y + sliceH, contentBottom);
        if (end < contentBottom) {
          const fit = breaks.map(b => Math.round((b + 5) * scale)).filter(b => b > y + sliceH * 0.55 && b <= y + sliceH);
          if (fit.length) end = fit[fit.length - 1];
        }
        const h = end - y;
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = h;
        const ctx = slice.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, slice.width, h);
        ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        if (page > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', margin, margin, imgW, h * ratio);
        y = end;
        page++;
      }
    }
    if (page > 1) {
      for (let i = 1; i <= page; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7);
        pdf.setTextColor(120, 130, 145);
        pdf.text(`Page ${i} of ${page}`, pageW - margin, pageH - 12, { align: 'right' });
      }
    }
    return pdf.output('datauristring').split(',')[1];
  } finally {
    iframe.remove();
  }
}
