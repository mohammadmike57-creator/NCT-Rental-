import { jsPDF } from 'jspdf';

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
    fix.textContent = 'td, th { padding-bottom: 7px !important; }';
    doc.head.appendChild(fix);
    const body = doc.body;
    body.style.padding = '0';
    const height = Math.max(body.scrollHeight, 1123);
    const canvas = await html2canvas(body, { scale: 2, backgroundColor: '#ffffff', width: 794, height, windowWidth: 794, windowHeight: height, logging: false });

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 28;
    const imgW = pageW - margin * 2;
    const ratio = imgW / canvas.width;
    const sliceH = Math.floor((pageH - margin * 2) / ratio);
    for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
      const h = Math.min(sliceH, canvas.height - y);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = h;
      slice.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.88), 'JPEG', margin, margin, imgW, h * ratio);
    }
    return pdf.output('datauristring').split(',')[1];
  } finally {
    iframe.remove();
  }
}
