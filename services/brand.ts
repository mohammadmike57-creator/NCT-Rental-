import { URDRIVE_LOGO_B64 } from '../constants';
import { CompanyDetails } from '../types';
/** Where stored images are served from (set by the app; the same site when deployed). */
let mediaBase = '';
export const setMediaBase = (base: string) => { mediaBase = base.replace(/\/+$/, ''); };
const mediaUrl = (path: string) => (path.startsWith('/api/') ? `${mediaBase}${path}` : path);

/**
 * Each supplier's own look on screens and documents. UR-Drive Jordan keeps its existing logo; another supplier
 * shows the logo it uploads in Company Details → Branding, or its name when it has none. Never someone else's.
 */
let supplierId = 'urd';
let current: CompanyDetails | null = null;

export const DEFAULT_BRAND_COLOR = '#4f46e5';
export const BRAND_PRESETS = ['#4f46e5', '#0f766e', '#0369a1', '#be123c', '#b45309', '#7c3aed', '#15803d', '#1e293b'];

/** Called by the app once it knows who is signed in and their company details. */
export const setBrand = (supplier: string | undefined | null, company: CompanyDetails | null) => {
  supplierId = supplier && supplier.trim() ? supplier : 'urd';
  current = company;
};

export const isPrimarySupplier = () => supplierId === 'urd';

/** The logo printed on agreements, invoices, receipts and other documents (undefined: print the company name). */
export const documentLogo = (c?: CompanyDetails | null): string | undefined => {
  const logo = (c ?? current)?.logoUrl;
  if (logo) return mediaUrl(logo);
  return isPrimarySupplier() ? URDRIVE_LOGO_B64 : undefined;
};

/** The company's main colour, or the app's indigo. */
export const brandColor = (c?: CompanyDetails | null): string => {
  const v = ((c ?? current)?.brandColor || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : DEFAULT_BRAND_COLOR;
};

/** Two letters for a name ("Desert Drive Rentals" → DD). */
export const initialsOf = (name: string) =>
  name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
