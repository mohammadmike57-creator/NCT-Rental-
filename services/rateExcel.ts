import { RatePlan } from '../types';
import { Band, PriceMatrix, bandLabel, bandsOf, checkBands, matrixOf, withMatrix } from './rateBuilder';
import { tierInversions } from './channelManager';

/**
 * Rates as a spreadsheet: one row per period and car group, one column per rental-length band,
 * the daily price in each cell. The same layout downloads and uploads, so staff can edit a
 * whole season's prices in Excel and load them back in one go.
 */

export const RATE_SHEET_FIXED = ['Period', 'From', 'To', 'Car group'] as const;

/** Every band start used by any of the periods, so one header fits them all. */
export function sheetBands(plans: RatePlan[]): Band[] {
  return bandsOf({ id: 'all', name: 'all', startDate: '', endDate: '', sippRates: plans.flatMap(p => p.sippRates || []) });
}

/** Header labels a person can read and the importer can parse back: "1-2", "3-6", "30+". */
export const bandHeader = (b: Band) => (b.toDay == null ? `${b.fromDay}+` : b.toDay === b.fromDay ? `${b.fromDay}` : `${b.fromDay}-${b.toDay}`);

/** The rows of the sheet (first row = header). Without periods, one example period to fill in. */
export function rateSheetRows(plans: RatePlan[], groups: string[] = []): (string | number | null)[][] {
  const list = plans.length ? plans : [{ id: 'x', name: 'Summer 2027', startDate: `${new Date().getFullYear() + 1}-06-01`, endDate: `${new Date().getFullYear() + 1}-08-31`,
    sippRates: (groups.length ? groups : ['ECAR', 'CDAR']).map((g, i) => ({ id: `r${i}`, sippCode: g, tiers: [] })) } as RatePlan];
  const bands = plans.length ? sheetBands(plans) : bandsOf(list[0]);
  const rows: (string | number | null)[][] = [[...RATE_SHEET_FIXED, ...bands.map(bandHeader)]];
  [...list].sort((a, b) => a.startDate.localeCompare(b.startDate)).forEach(p => {
    const m = matrixOf(p, bands);
    (p.sippRates || []).forEach(r => rows.push([p.name, p.startDate, p.endDate, r.sippCode, ...bands.map((_, i) => m[r.sippCode]?.[i] ?? null)]));
  });
  return rows;
}

/** "1-2", "1 – 2 days", "Day 1 to 2", "30+", "30+ days", "30 and more", "7" → a band (null when not a band). */
export function parseBandHeader(raw: unknown): Band | null {
  const s = String(raw ?? '').toLowerCase().replace(/days?/g, ' ').replace(/[–—]/g, '-').trim();
  let m = s.match(/^(\d+)\s*(?:\+|or more|and more|plus|or longer|and longer)$/);
  if (m) return { fromDay: +m[1], toDay: null };
  m = s.match(/^(\d+)\s*(?:-|to)\s*(\d+)$/);
  if (m) return { fromDay: +m[1], toDay: +m[2] };
  m = s.match(/^(\d+)$/);
  if (m) return { fromDay: +m[1], toDay: +m[1] };
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Excel dates arrive as serial numbers, Date objects or text (2027-06-01, 01/06/2027, 1.6.2027). Day first for slashes, as in Jordan. */
export function parseSheetDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  return null;
}
const valid = (y: number, mo: number, d: number) => {
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : null;
};

const parsePrice = (v: unknown): number | null | 'bad' => {
  if (v == null || String(v).trim() === '' || String(v).trim() === '-' || String(v).trim() === '—') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 'bad';
};

export interface RateImport {
  plans: RatePlan[];
  errors: string[];
  warnings: string[];
  rows: number;
}

/** Reads the sheet back into rate periods; errors block the import, warnings do not. */
export function parseRateSheet(rows: unknown[][], fleetGroups: string[] = [], stamp = Date.now()): RateImport {
  const errors: string[] = [], warnings: string[] = [];
  const body = rows.filter(r => Array.isArray(r) && r.some(c => c != null && String(c).trim() !== ''));
  if (body.length < 2) return { plans: [], errors: ['The sheet is empty: it needs a header row and at least one price row.'], warnings, rows: 0 };
  const head = body[0].map(c => String(c ?? '').trim());
  const col = (re: RegExp) => head.findIndex(h => re.test(h.toLowerCase()));
  const iName = col(/^(period|season|name)/), iFrom = col(/^(from|start)/), iTo = col(/^(to|end|until)/), iGroup = col(/(car group|group|sipp|category|acriss)/);
  const missing = [iName < 0 && 'Period', iFrom < 0 && 'From', iTo < 0 && 'To', iGroup < 0 && 'Car group'].filter(Boolean);
  if (missing.length) return { plans: [], errors: [`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Download the Excel file from here to get the right layout.`], warnings, rows: 0 };
  const bandCols = head.map((h, i) => ({ i, band: [iName, iFrom, iTo, iGroup].includes(i) ? null : parseBandHeader(h) })).filter(x => x.band) as { i: number; band: Band }[];
  if (!bandCols.length) return { plans: [], errors: ['No rental-length columns found. Name them like "1-2", "3-6", "7-13", "30+".'], warnings, rows: 0 };
  bandCols.sort((a, b) => a.band.fromDay - b.band.fromDay);
  const bands = bandCols.map(b => b.band);
  checkBands(bands).forEach(m => errors.push(`Columns: ${m}`));

  const known = new Set(fleetGroups.map(g => g.toUpperCase()));
  const periods = new Map<string, { name: string; from: string; to: string; groups: string[]; prices: PriceMatrix }>();
  body.slice(1).forEach((r, k) => {
    const line = k + 2;
    const name = String(r[iName] ?? '').trim();
    const from = parseSheetDate(r[iFrom]), to = parseSheetDate(r[iTo]);
    const group = String(r[iGroup] ?? '').trim().toUpperCase();
    if (!name && !group) return;
    if (!name) { errors.push(`Row ${line}: no period name.`); return; }
    if (!from || !to) { errors.push(`Row ${line} (${name}): ${!from ? 'From' : 'To'} is not a date. Use 2027-06-01 or 01/06/2027.`); return; }
    if (from > to) { errors.push(`Row ${line} (${name}): the period ends before it starts.`); return; }
    if (!/^[A-Z0-9]{2,8}$/.test(group)) { errors.push(`Row ${line} (${name}): "${r[iGroup] ?? ''}" is not a car group code (e.g. CDAR).`); return; }
    if (known.size && !known.has(group)) warnings.push(`Row ${line}: no car in the fleet has group ${group}.`);
    const key = `${name.toLowerCase()}|${from}|${to}`;
    const sameName = [...periods.values()].find(p => p.name.toLowerCase() === name.toLowerCase() && (p.from !== from || p.to !== to));
    if (sameName) { errors.push(`Row ${line}: "${name}" has other dates than in an earlier row (${sameName.from} → ${sameName.to}).`); return; }
    const p = periods.get(key) || { name, from, to, groups: [], prices: {} };
    if (p.groups.includes(group)) { errors.push(`Row ${line}: ${group} appears twice in "${name}".`); return; }
    const prices = bandCols.map(b => parsePrice(r[b.i]));
    prices.forEach((v, i) => { if (v === 'bad') errors.push(`Row ${line} (${name} / ${group}): "${r[bandCols[i].i]}" in column ${bandHeader(bands[i])} is not a price.`); });
    const clean = prices.map(v => (v === 'bad' ? null : v));
    if (clean.every(v => v == null)) warnings.push(`Row ${line} (${name} / ${group}): no prices, so the group is not sold in that period.`);
    else if (clean.some(v => v == null)) warnings.push(`Row ${line} (${name} / ${group}): empty cells, those rental lengths cannot be booked.`);
    p.groups.push(group);
    p.prices[group] = clean;
    periods.set(key, p);
  });

  const list = [...periods.values()].sort((a, b) => a.from.localeCompare(b.from));
  for (let i = 1; i < list.length; i++) {
    if (list[i].from <= list[i - 1].to) errors.push(`"${list[i - 1].name}" (${list[i - 1].from} → ${list[i - 1].to}) and "${list[i].name}" (${list[i].from} → ${list[i].to}) overlap.`);
  }
  const plans = list.map((p, i) => {
    const plan = withMatrix({ id: `plan-${stamp}-${i}`, name: p.name, startDate: p.from, endDate: p.to, sippRates: [] }, bands, p.groups, p.prices, stamp + i);
    plan.sippRates = plan.sippRates.filter(r => r.tiers.length > 0);
    plan.sippRates.forEach(r => tierInversions(r).forEach(m => warnings.push(`${p.name} / ${r.sippCode}: ${m}`)));
    return plan;
  });
  return { plans, errors, warnings, rows: body.length - 1 };
}

/**
 * Puts imported periods into the existing ones: a period with the same name keeps its id (so history
 * and links stay), the others are added. With replaceAll, periods missing from the sheet are removed.
 */
export function mergeImportedPlans(current: RatePlan[], imported: RatePlan[], replaceAll: boolean): RatePlan[] {
  const byName = new Map(current.map(p => [p.name.trim().toLowerCase(), p]));
  const merged = imported.map(p => { const old = byName.get(p.name.trim().toLowerCase()); return old ? { ...p, id: old.id } : p; });
  if (replaceAll) return merged;
  const names = new Set(imported.map(p => p.name.trim().toLowerCase()));
  return [...current.filter(p => !names.has(p.name.trim().toLowerCase())), ...merged].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export { bandLabel };
