// jsPDF can only embed raster images. Our logos are SVG data URLs, so they
// are drawn onto a canvas once and handed to jsPDF as PNG.
const cache = new Map<string, Promise<string>>();

export function svgToPng(dataUrl: string, widthPx: number, heightPx: number): Promise<string> {
  if (!dataUrl.startsWith('data:image/svg')) return Promise.resolve(dataUrl);
  const key = `${widthPx}x${heightPx}:${dataUrl}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = widthPx;
        canvas.height = heightPx;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas is not available')); return; }
        ctx.drawImage(img, 0, 0, widthPx, heightPx);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Could not load the logo'));
      img.src = dataUrl;
    });
    hit.catch(() => cache.delete(key));
    cache.set(key, hit);
  }
  return hit;
}

/** Adds a logo to a jsPDF page; a logo that cannot be drawn is skipped, never fatal. */
export async function addLogo(
  doc: { addImage: (...a: any[]) => unknown },
  dataUrl: string, x: number, y: number, w: number, h: number,
): Promise<void> {
  try {
    const png = await svgToPng(dataUrl, Math.round(w * 12), Math.round(h * 12));
    doc.addImage(png, 'PNG', x, y, w, h);
  } catch (e) {
    console.warn('PDF logo skipped:', e);
  }
}
