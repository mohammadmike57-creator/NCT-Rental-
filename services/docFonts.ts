/** Waits (at most 3 s) for the document's web fonts, e.g. the bundled Arabic font, so text is captured in the right typeface. */
export async function waitForFonts(doc: Document): Promise<void> {
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  const loads = ['400', '600', '700'].map(w => fonts.load(`${w} 12px 'Plex Arabic'`, 'عربي').catch(() => []));
  await Promise.race([Promise.all(loads).then(() => fonts.ready), new Promise(r => setTimeout(r, 3000))]);
}

let appFontsReady: Promise<void> | null = null;
/**
 * html2canvas draws text on a canvas owned by the app page, not by the document being captured,
 * so the Arabic font must also be loaded here or words are drawn in a wider fallback font.
 */
export function loadArabicFontInApp(): Promise<void> {
  if (appFontsReady) return appFontsReady;
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return Promise.resolve();
  appFontsReady = Promise.all(['400', '600', '700'].map(w => {
    const face = new FontFace('Plex Arabic', `url(${window.location.origin}/fonts/plex-arabic-${w}.woff2) format('woff2')`, { weight: w, style: 'normal' });
    document.fonts.add(face);
    return face.load().catch(() => face);
  })).then(() => undefined);
  return Promise.race([appFontsReady, new Promise<void>(r => setTimeout(r, 3000))]);
}
