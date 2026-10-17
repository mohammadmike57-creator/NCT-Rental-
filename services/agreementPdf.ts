import { jsPDF } from 'jspdf';

/** Any of the printable documents (agreement, invoice, claim) as a PDF. */
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
    await Promise.all(Array.from(doc.images).map(img => (img.complete ? null : new Promise(res => { img.onload = img.onerror = () => res(null); }))));
    // html2canvas draws text a few pixels lower than the browser lays it out, which makes
    // table rules cut through the text. Extra room under each cell keeps them clear.
    const fix = doc.createElement('style');
    fix.textContent = 'td, th { padding-bottom: 7px !important; } .stamp, .pill { padding-top: 1px !important; padding-bottom: 7px !important; }';
    doc.head.appendChild(fix);
    const body = doc.body;
    body.style.padding = '0';
    const height = Math.max(body.scrollHeight + 32, 1123);
    const canvas = await html2canvas(body, { scale: 2, backgroundColor: '#ffffff', width: 794, height, windowWidth: 794, windowHeight: height, logging: false });

    // Places where a page may end without cutting through a row, card or photo (in CSS px from the top).
    const bodyTop = body.getBoundingClientRect().top;
    const breaks = Array.from(doc.querySelectorAll('tr, .card, .avoid, .sec, table, .totals, .note, .band, .photos, .sign, .info, .parties, .sum'))
      .map(el => (el as HTMLElement).getBoundingClientRect().bottom - bodyTop)
      .filter(b => b > 0)
      .sort((a, b) => a - b);
    const scale = canvas.height / height;

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 28;
    const imgW = pageW - margin * 2;
    const ratio = imgW / canvas.width;
    const sliceH = Math.floor((pageH - margin * 2 - 10) / ratio);
    let y = 0;
    let page = 0;
    while (y < canvas.height - 2) {
      let end = Math.min(y + sliceH, canvas.height);
      if (end < canvas.height) {
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
