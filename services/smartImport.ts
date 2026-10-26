import * as XLSX from 'xlsx';
import { Fleet, RentalSource, Reservation, ReservationStatus } from '../types';

/**
 * Reads reservation spreadsheets the way a person would:
 *  - finds the sheet and the header row (titles or logos above the table are fine),
 *  - recognises columns by many common names (Pick-up date, Return, Customer, Broker, Car group, …),
 *  - reads dates as day / month / year (15/10/2026, 15-10-26, 15 Oct 2026, Excel dates, date + time),
 *    switching to month / day / year only when the file clearly uses it,
 *  - matches each booking's source to the sources already set up (website, web, www.… → "Website"),
 *  - matches car names to the fleet or to known models ("Pegas" → Kia Pegas, "Sunny" → Nissan Sunny).
 * Nothing is saved here; the import screen shows the result for review first.
 */

export type FieldKey =
  | 'bookingId' | 'customer' | 'firstName' | 'lastName' | 'pickupDate' | 'pickupTime' | 'dropoffDate' | 'dropoffTime'
  | 'vehicle' | 'source' | 'amount' | 'phone' | 'email' | 'location' | 'notes' | 'bookingDate';

export type DateOrder = 'DMY' | 'MDY';

interface FieldDef { key: FieldKey; label: string; names: string[] }

export const FIELDS: FieldDef[] = [
  { key: 'bookingId', label: 'Booking number', names: ['reservation number', 'reservation no', 'reservation', 'reservation id', 'reservation code', 'res no', 'res number', 'res', 'booking id', 'booking number', 'booking no', 'booking ref', 'booking reference', 'booking code', 'booking', 'reference', 'reference number', 'reference no', 'ref', 'ref no', 'confirmation', 'confirmation number', 'confirmation no', 'voucher', 'voucher number', 'voucher no', 'order id', 'order number', 'order no', 'invoice', 'invoice number', 'invoice no', 'rental number', 'contract number', 'serial', 'id', 'no', 'number'] },
  { key: 'customer', label: 'Customer name', names: ['customer', 'customer name', 'name', 'renter', 'renter name', 'driver', 'driver name', 'main driver', 'lead driver', 'client', 'client name', 'guest', 'guest name', 'full name', 'passenger', 'passenger name', 'traveller', 'traveler', 'person', 'person name'] },
  { key: 'firstName', label: 'First name', names: ['first name', 'firstname', 'given name', 'forename', 'driver first name'] },
  { key: 'lastName', label: 'Last name', names: ['last name', 'lastname', 'surname', 'family name', 'driver last name'] },
  { key: 'pickupDate', label: 'Pick-up date', names: ['pickup date', 'pick up date', 'pickup', 'pick up', 'pickup date time', 'pick up date time', 'pickup datetime', 'start date', 'start', 'start date time', 'from', 'from date', 'date from', 'collection date', 'collection', 'rental start', 'out date', 'date out', 'checkout date', 'check out date', 'arrival date', 'arrival', 'delivery date', 'pickup on', 'begin date'] },
  { key: 'pickupTime', label: 'Pick-up time', names: ['pickup time', 'pick up time', 'start time', 'from time', 'collection time', 'arrival time', 'out time', 'time out', 'delivery time', 'checkout time'] },
  { key: 'dropoffDate', label: 'Drop-off date', names: ['dropoff date', 'drop off date', 'dropoff', 'drop off', 'dropoff date time', 'drop off date time', 'dropoff datetime', 'return date', 'return', 'return date time', 'end date', 'end', 'end date time', 'to', 'to date', 'date to', 'rental end', 'in date', 'date in', 'checkin date', 'check in date', 'departure date', 'departure', 'collection return date', 'until'] },
  { key: 'dropoffTime', label: 'Drop-off time', names: ['dropoff time', 'drop off time', 'return time', 'end time', 'to time', 'departure time', 'in time', 'time in', 'checkin time'] },
  { key: 'vehicle', label: 'Car', names: ['car', 'car model', 'vehicle', 'vehicle model', 'model', 'car type', 'vehicle type', 'car group', 'group', 'category', 'car category', 'vehicle category', 'vehicle group', 'sipp', 'sipp code', 'acriss', 'car name', 'vehicle name', 'make model', 'make and model', 'booked car', 'car booked', 'car class', 'class', 'type'] },
  { key: 'source', label: 'Source', names: ['source', 'booking source', 'reservation source', 'channel', 'sales channel', 'website', 'web site', 'site', 'broker', 'broker name', 'agent', 'agent name', 'agency', 'partner', 'supplier', 'provider', 'platform', 'marketplace', 'company', 'booked via', 'booked through', 'booked from', 'origin', 'aggregator', 'ota'] },
  { key: 'amount', label: 'Amount', names: ['amount', 'total', 'total amount', 'total price', 'price', 'grand total', 'rental amount', 'rental price', 'rental fee', 'net', 'net amount', 'net price', 'cost', 'total cost', 'rate', 'value', 'payable', 'amount due', 'total due', 'charges', 'total charge', 'fee', 'revenue', 'jod', 'amount jod', 'total jod', 'usd', 'amount usd'] },
  { key: 'phone', label: 'Phone', names: ['phone', 'phone number', 'mobile', 'mobile number', 'contact', 'contact number', 'telephone', 'tel', 'whatsapp', 'cell', 'customer phone'] },
  { key: 'email', label: 'Email', names: ['email', 'e mail', 'email address', 'customer email', 'mail'] },
  { key: 'location', label: 'Branch', names: ['location', 'pickup location', 'pick up location', 'branch', 'station', 'office', 'pickup branch', 'pickup station', 'pickup office'] },
  { key: 'notes', label: 'Notes', names: ['notes', 'note', 'comments', 'comment', 'remarks', 'remark', 'special requests', 'special request', 'instructions', 'extras', 'equipment'] },
  { key: 'bookingDate', label: 'Booked on', names: ['booking date', 'booked on', 'date booked', 'booked', 'created', 'created at', 'created on', 'created date', 'reservation date', 'order date', 'date of booking', 'issue date'] },
];

export const fieldLabel = (k: FieldKey) => FIELDS.find(f => f.key === k)?.label || k;

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const isBlank = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

/** How well a header names a field: 100 exact, 50–90 contains the name as whole words, 0 no. */
const headerScore = (header: string, def: FieldDef): number => {
  const h = norm(header);
  if (!h) return 0;
  let best = 0;
  for (const n of def.names) {
    if (h === n || h.replace(/ /g, '') === n.replace(/ /g, '')) return 100;
    if (n.length >= 3 && ` ${h} `.includes(` ${n} `)) best = Math.max(best, 50 + Math.min(40, n.length * 2));
  }
  // "Pick-up date & time" is a date column; "Pick-up time" alone is a time column.
  if ((def.key === 'pickupDate' || def.key === 'dropoffDate') && /\btime\b/.test(h) && !/\bdate\b/.test(h)) return 0;
  if ((def.key === 'pickupTime' || def.key === 'dropoffTime') && /\bdate\b/.test(h)) return 0;
  return best;
};

// ---------- dates ----------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const pad = (n: number) => String(n).padStart(2, '0');
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);
const validYmd = (y: number, m: number, d: number) => {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** noYear: the cell had no year (e.g. "05/01" or "5 Jan"); the year is filled in from the booking. */
export interface ParsedDate { date: string; time?: string; noYear?: boolean }

/** A time written in a cell: 10:30, 10.30 pm, 9am, or the time part of an Excel date. */
export function parseTime(v: unknown): string | undefined {
  if (isBlank(v)) return undefined;
  if (typeof v === 'number') {
    const frac = v - Math.floor(v);
    if (frac <= 0 && v >= 1) return undefined;
    const mins = Math.round(frac * 1440) % 1440;
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  }
  if (v instanceof Date) return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  const s = String(v).trim().toLowerCase();
  let m = s.match(/(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?/);
  if (m) {
    let h = +m[1];
    const mm = +m[2];
    if (m[3]?.startsWith('p') && h < 12) h += 12;
    if (m[3]?.startsWith('a') && h === 12) h = 0;
    return h < 24 && mm < 60 ? `${pad(h)}:${pad(mm)}` : undefined;
  }
  m = s.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (m) {
    let h = +m[1] % 12;
    if (m[2] === 'pm') h += 12;
    return `${pad(h)}:00`;
  }
  return undefined;
}

/** True when a written date can only be month/day/year (e.g. 10/25/2026). */
export const looksMonthFirst = (v: unknown): boolean => {
  if (typeof v !== 'string') return false;
  const m = v.trim().match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  return !!m && +m[1] <= 12 && +m[2] > 12;
};

/** A date written in a cell. Day / month / year unless order is 'MDY'. */
export function parseDate(v: unknown, order: DateOrder = 'DMY'): ParsedDate | null {
  if (isBlank(v)) return null;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    const c = XLSX.SSF.parse_date_code(v);
    if (!c || !validYmd(c.y, c.m, c.d)) return null;
    const hasTime = v % 1 > 0.0001;
    return { date: `${c.y}-${pad(c.m)}-${pad(c.d)}`, time: hasTime ? `${pad(c.H)}:${pad(c.M)}` : undefined };
  }
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const t = v.getHours() || v.getMinutes() ? `${pad(v.getHours())}:${pad(v.getMinutes())}` : undefined;
    return { date: `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`, time: t };
  }
  let s = String(v).trim().toLowerCase()
    .replace(/\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|nesday|sday|urday)?\b,?/g, ' ')
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .replace(/\bat\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  const time = parseTime(s.replace(/^\S+/, '')) || parseTime(s.match(/[t ]\d{1,2}[:.]\d{2}.*$/)?.[0]);
  let y = 0, mo = 0, d = 0, m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})/))) {
    y = +m[1]; mo = +m[2]; d = +m[3];
  } else if ((m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/))) {
    const a = +m[1], b = +m[2];
    y = fullYear(+m[3]);
    if (order === 'MDY') { mo = a; d = b; } else { d = a; mo = b; }
    // A value that only makes sense the other way round (e.g. 10/25/2026) is read that way.
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
  } else if ((m = s.match(/^(\d{1,2})[\s/.\-,]*([a-z]{3,9})[\s/.\-,]*(\d{2,4})\b/)) && MONTHS[m[2]]) {
    d = +m[1]; mo = MONTHS[m[2]]; y = fullYear(+m[3]);
  } else if ((m = s.match(/^([a-z]{3,9})[\s/.\-,]*(\d{1,2})[\s/.\-,]+(\d{2,4})\b/)) && MONTHS[m[1]]) {
    mo = MONTHS[m[1]]; d = +m[2]; y = fullYear(+m[3]);
  } else if ((m = s.match(/^(\d{1,2})[/\-](\d{1,2})(?=\s|$)/))) {
    // No year written: 05/01 or 05-01 10:30 (not 10.30, which is a time). 2024 stands in (a leap year, so 29/02 is accepted).
    const a = +m[1], b = +m[2];
    if (order === 'MDY') { mo = a; d = b; } else { d = a; mo = b; }
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    if (!validYmd(2024, mo, d)) return null;
    return { date: `2024-${pad(mo)}-${pad(d)}`, time, noYear: true };
  } else if ((m = s.match(/^(\d{1,2})[\s/.\-,]*([a-z]{3,9})\.?(?=\s|$)/)) && MONTHS[m[2]]) {
    d = +m[1]; mo = MONTHS[m[2]];
    if (!validYmd(2024, mo, d)) return null;
    return { date: `2024-${pad(mo)}-${pad(d)}`, time, noYear: true };
  } else if ((m = s.match(/^([a-z]{3,9})\.?[\s/.\-,]*(\d{1,2})(?=\s|$)/)) && MONTHS[m[1]]) {
    mo = MONTHS[m[1]]; d = +m[2];
    if (!validYmd(2024, mo, d)) return null;
    return { date: `2024-${pad(mo)}-${pad(d)}`, time, noYear: true };
  } else if ((m = s.match(/^(\d{8})$/))) {
    // 20261025 or 25102026
    const t = m[1];
    if (+t.slice(0, 4) > 1990) { y = +t.slice(0, 4); mo = +t.slice(4, 6); d = +t.slice(6, 8); } else { d = +t.slice(0, 2); mo = +t.slice(2, 4); y = +t.slice(4); }
  } else {
    return null;
  }
  if (!validYmd(y, mo, d)) return null;
  return { date: `${y}-${pad(mo)}-${pad(d)}`, time };
}

// ---------- sources ----------

const srcNorm = (s: string) => s.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '')
  .replace(/\.(com|net|org|jo|co|uk|de|fr|io|ae|sa)(\.[a-z]{2})?(\/.*)?$/, '').replace(/[^a-z0-9]+/g, '');

/** Names people write for the same channel. The first entry is the group's key. */
const SOURCE_GROUPS: string[][] = [
  ['website', 'web', 'site', 'online', 'onlinebooking', 'webbooking', 'websitebooking', 'ourwebsite', 'homepage', 'internet', 'nctrental', 'nct', 'urdrive', 'urdrivejordan', 'urdrivejo', 'directonline', 'webdirect'],
  ['bookingcom', 'booking', 'bcom', 'bookingcomcars', 'bookingcars'],
  ['rentalcars', 'rentalcarscom', 'rentalcar', 'rc'],
  ['discovercars', 'discover', 'discovercar'],
  ['expedia'], ['kayak'], ['priceline'], ['carjet'], ['qeeq'], ['zest', 'zestcarrental'], ['autoeurope'], ['holidayautos'], ['argus', 'arguscarhire'],
  ['economybookings', 'economybooking', 'economy bookings'], ['vipcars'], ['carrentals', 'carrentalscom'], ['localrent'], ['getaround'], ['skyscanner'], ['trip', 'tripcom'],
  ['walkin', 'walk', 'counter', 'walkincustomer'],
  ['directcall', 'phone', 'call', 'telephone', 'phonecall', 'direct call'],
  ['whatsapp', 'wa'],
  ['direct'],
];
const groupOf = (n: string) => SOURCE_GROUPS.find(g => g.some(a => a.replace(/ /g, '') === n));

export interface SourceMatch { raw: string; match?: string; suggested: string }

/** The existing source a written source refers to, if any; otherwise a clean name to add. */
export function matchSource(raw: string, sources: RentalSource[]): SourceMatch {
  const text = String(raw ?? '').trim();
  const n = srcNorm(text);
  const clean = text.replace(/\s+/g, ' ');
  if (!n) return { raw: text, suggested: '' };
  const existing = sources.map(s => ({ name: s.name, n: srcNorm(s.name) })).filter(s => s.n);
  const exact = existing.find(s => s.n === n);
  if (exact) return { raw: text, match: exact.name, suggested: exact.name };
  const g = groupOf(n) || SOURCE_GROUPS.find(gr => gr.some(a => a.length >= 5 && n.includes(a.replace(/ /g, ''))));
  if (g) {
    const inGroup = existing.find(s => g.some(a => a.replace(/ /g, '') === s.n) || s.n.includes(g[0]));
    if (inGroup) return { raw: text, match: inGroup.name, suggested: inGroup.name };
  }
  const contains = existing.filter(s => (s.n.length >= 4 && n.includes(s.n)) || (n.length >= 4 && s.n.includes(n))).sort((a, b) => b.n.length - a.n.length)[0];
  if (contains) return { raw: text, match: contains.name, suggested: contains.name };
  const nice = clean === clean.toLowerCase() || clean === clean.toUpperCase() ? clean.replace(/\b[a-z]/gi, c => c.toUpperCase()).replace(/\B[A-Z]/g, c => c.toLowerCase()) : clean;
  return { raw: text, suggested: nice.replace(/\.Com\b/, '.com') };
}

/** Channel names to look for anywhere in a row when it has no source column. */
const CHANNEL_HINTS = ['booking.com', 'rentalcars', 'discover cars', 'discovercars', 'expedia', 'kayak', 'carjet', 'qeeq', 'economybookings', 'economy bookings', 'zest', 'auto europe', 'holiday autos', 'argus', 'vipcars', 'priceline'];

// ---------- cars ----------

const CAR_CATALOG: Record<string, string[]> = {
  Kia: ['Pegas', 'Picanto', 'Rio', 'Cerato', 'K3', 'K5', 'Optima', 'Sportage', 'Sorento', 'Seltos', 'Sonet', 'Soul', 'Stonic', 'Carnival', 'Carens', 'Niro', 'EV6', 'Telluride'],
  Nissan: ['Sunny', 'Sentra', 'Altima', 'Micra', 'Tiida', 'Kicks', 'X-Trail', 'Qashqai', 'Juke', 'Patrol', 'Pathfinder', 'Navara', 'Urvan', 'Maxima', 'Leaf'],
  Hyundai: ['Accent', 'Elantra', 'Sonata', 'Grand i10', 'i10', 'i20', 'i30', 'Creta', 'Venue', 'Tucson', 'Santa Fe', 'Kona', 'Staria', 'H1', 'Ioniq', 'Azera', 'Palisade'],
  Toyota: ['Yaris', 'Corolla Cross', 'Corolla', 'Camry', 'Avalon', 'RAV4', 'C-HR', 'Fortuner', 'Prado', 'Land Cruiser', 'Hilux', 'Hiace', 'Rush', 'Raize', 'Avanza', 'Veloz', 'Innova', 'Prius', 'Highlander'],
  Mitsubishi: ['Attrage', 'Mirage', 'Lancer', 'ASX', 'Eclipse Cross', 'Outlander', 'Pajero', 'Xpander', 'L200'],
  Suzuki: ['Swift', 'Dzire', 'Ciaz', 'Baleno', 'Celerio', 'Alto', 'Grand Vitara', 'Vitara', 'Jimny', 'Ertiga', 'S-Presso', 'Fronx'],
  Honda: ['Civic', 'Accord', 'City', 'Jazz', 'HR-V', 'CR-V', 'Pilot'],
  Chevrolet: ['Spark', 'Aveo', 'Sail', 'Cruze', 'Malibu', 'Captiva', 'Groove', 'Tahoe', 'Trax', 'Equinox', 'Onix'],
  Renault: ['Symbol', 'Logan', 'Sandero', 'Duster', 'Megane', 'Koleos', 'Clio', 'Talisman'],
  Peugeot: ['208', '301', '308', '2008', '3008', '5008', '508'],
  MG: ['MG3', 'MG5', 'MG6', 'ZS', 'HS', 'RX5', 'RX8', 'GT', 'One'],
  Volkswagen: ['Polo', 'Jetta', 'Passat', 'Golf', 'Tiguan', 'Teramont', 'Touareg'],
  Ford: ['Fiesta', 'Focus', 'Fusion', 'Mustang', 'Explorer', 'Escape', 'Edge', 'Expedition', 'Ranger', 'Taurus', 'Territory'],
  Jeep: ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass', 'Renegade'],
  Chery: ['Tiggo 2', 'Tiggo 4', 'Tiggo 7', 'Tiggo 8', 'Tiggo', 'Arrizo'],
  Geely: ['Emgrand', 'Coolray', 'Azkarra', 'Okavango', 'Tugella', 'Monjaro'],
  Changan: ['Alsvin', 'Eado', 'CS35', 'CS75', 'CS85', 'UNI-K', 'UNI-T'],
  BYD: ['F3', 'Seal', 'Atto 3', 'Song', 'Han', 'Qin'],
  Skoda: ['Octavia', 'Superb', 'Kodiaq', 'Rapid'],
  Mazda: ['CX-3', 'CX-5', 'CX-9', 'Mazda 2', 'Mazda 3', 'Mazda 6'],
  'Mercedes-Benz': ['C-Class', 'E-Class', 'S-Class', 'GLC', 'GLE', 'Vito', 'Sprinter'],
  BMW: ['3 Series', '5 Series', '7 Series', 'X1', 'X3', 'X5'],
  Audi: ['A3', 'A4', 'A6', 'Q3', 'Q5', 'Q7'],
  Lexus: ['ES', 'LX', 'RX', 'GX'],
  GMC: ['Yukon', 'Sierra', 'Acadia'],
  Dodge: ['Charger', 'Durango', 'Challenger'],
  Cadillac: ['Escalade'],
  Tesla: ['Model 3', 'Model Y'],
  'Land Rover': ['Range Rover Evoque', 'Range Rover Sport', 'Range Rover Velar', 'Range Rover', 'Defender', 'Discovery'],
};
const BRAND_ALIASES: Record<string, string> = { mercedes: 'Mercedes-Benz', benz: 'Mercedes-Benz', vw: 'Volkswagen', chevy: 'Chevrolet', landrover: 'Land Rover', rangerover: 'Land Rover' };
const BRANDS = Object.keys(CAR_CATALOG);
const carNorm = (s: string) => ` ${s.toLowerCase().replace(/\bor\s+similar\b|\bor\s+equivalent\b|\bsimilar\b|\bo\s*\/\s*s\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()} `;
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface CarMatch { raw: string; match?: string; via?: 'fleet' | 'known' | 'sipp' }

/** The car a written name refers to: a fleet model first, otherwise a well-known model. */
export function matchCar(raw: string, fleet: Fleet): CarMatch {
  const text = String(raw ?? '').trim();
  if (!text) return { raw: text };
  const t = carNorm(text);
  const tc = compact(text);
  const fleetModels = Array.from(new Set((fleet || []).map(v => v.modelName).filter(Boolean)));

  // A SIPP / ACRISS code (e.g. EDAR) that a fleet car carries.
  const code = text.toUpperCase().match(/\b[A-Z]{4}\b/)?.[0];
  if (code) {
    const v = (fleet || []).find(f => f.sippCode && f.sippCode.toUpperCase() === code);
    if (v && compact(text) === compact(code)) return { raw: text, match: v.modelName, via: 'sipp' };
  }

  const brandIn = (s: string) => BRANDS.find(b => t.includes(carNorm(b))) || Object.entries(BRAND_ALIASES).find(([a]) => t.includes(` ${a} `) || tc.includes(a))?.[1];
  const writtenBrand = brandIn(text);

  // Candidate names: fleet models, then "Brand Model" from the catalogue.
  type Cand = { name: string; brand?: string; model: string; fleet: boolean };
  const cands: Cand[] = [];
  for (const name of fleetModels) {
    const b = BRANDS.find(x => carNorm(name).startsWith(carNorm(x)));
    cands.push({ name, brand: b, model: b ? name.slice(b.length).trim() : name, fleet: true });
  }
  for (const b of BRANDS) for (const m of CAR_CATALOG[b]) cands.push({ name: `${b} ${m}`, brand: b, model: m, fleet: false });

  let best: { c: Cand; score: number } | null = null;
  for (const c of cands) {
    const full = carNorm(c.name);
    const model = carNorm(c.model);
    const mc = compact(c.model);
    if (!mc) continue;
    // Short or number-only model names (ES, 208, One) only count next to their brand.
    const needsBrand = mc.length < 3 || /^\d+$/.test(mc) || ['one', 'gt', 'han', 'song', 'qin', 'seal', 'city', 'edge', 'rush', 'soul'].includes(mc);
    let score = 0;
    if (t.includes(full) || tc === compact(c.name)) score = 100 + full.length;
    else if (t.includes(model) || (mc.length >= 4 && tc.includes(mc))) {
      if (needsBrand && (!c.brand || writtenBrand !== c.brand)) continue;
      if (writtenBrand && c.brand && writtenBrand !== c.brand) continue;
      score = 70 + model.length + (writtenBrand && writtenBrand === c.brand ? 15 : 0);
    }
    if (!score) continue;
    if (c.fleet) score += 8;
    if (!best || score > best.score) best = { c, score };
  }
  if (!best) return { raw: text };
  // A catalogue match that the fleet carries under its own spelling uses the fleet's name.
  if (!best.c.fleet) {
    const same = fleetModels.find(f => compact(f) === compact(best!.c.name) || compact(f) === compact(best!.c.model));
    if (same) return { raw: text, match: same, via: 'fleet' };
  }
  return { raw: text, match: best.c.name, via: best.c.fleet ? 'fleet' : 'known' };
}

// ---------- reading the workbook ----------

export interface SheetTable { sheet: string; headerRow: number; headers: string[]; rows: unknown[][] }

/** Picks the sheet and header row that look most like a reservations table. */
export function readTables(data: ArrayBuffer): SheetTable[] {
  const wb = XLSX.read(data, { type: 'array', cellDates: false, raw: false });
  const out: { t: SheetTable; score: number }[] = [];
  for (const sheet of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, raw: true, defval: '', blankrows: true });
    if (!grid.length) continue;
    let bestRow = 0, bestHits = -1;
    for (let r = 0; r < Math.min(25, grid.length); r++) {
      const hits = (grid[r] || []).filter(c => typeof c === 'string' && FIELDS.some(f => headerScore(c, f) >= 70)).length;
      if (hits > bestHits) { bestHits = hits; bestRow = r; }
    }
    const headers = (grid[bestRow] || []).map((h, i) => (isBlank(h) ? `Column ${XLSX.utils.encode_col(i)}` : String(h).trim()));
    // Blank rows stay in place so row numbers match the spreadsheet; they are ignored later.
    const rows = grid.slice(bestRow + 1).map(r => r || []);
    while (rows.length && !rows[rows.length - 1].some(c => !isBlank(c))) rows.pop();
    out.push({ t: { sheet, headerRow: bestRow + 1, headers, rows }, score: bestHits * 1000 + rows.filter(r => r.some(c => !isBlank(c))).length });
  }
  return out.sort((a, b) => b.score - a.score).map(o => o.t);
}

export type ColumnMap = Partial<Record<FieldKey, number>>;

/** Which column holds each field, from the headers first and then from what the cells contain. */
export function detectColumns(t: SheetTable): ColumnMap {
  const pairs: { f: FieldKey; c: number; s: number }[] = [];
  FIELDS.forEach(f => t.headers.forEach((h, c) => { const s = headerScore(h, f); if (s) pairs.push({ f: f.key, c, s }); }));
  pairs.sort((a, b) => b.s - a.s);
  const map: ColumnMap = {};
  const used = new Set<number>();
  for (const p of pairs) {
    if (map[p.f] !== undefined || used.has(p.c)) continue;
    map[p.f] = p.c;
    used.add(p.c);
  }
  // No date headers found: use the first two columns that are mostly dates.
  const dateCols = t.headers.map((_, c) => c).filter(c => !used.has(c) && isDateColumn(t.rows.map(r => r[c])));
  if (map.pickupDate === undefined && dateCols.length) { map.pickupDate = dateCols.shift()!; used.add(map.pickupDate); }
  if (map.dropoffDate === undefined && dateCols.length) { map.dropoffDate = dateCols.shift()!; used.add(map.dropoffDate); }
  return map;
}

const isDateColumn = (vals: unknown[]) => {
  const filled = vals.filter(v => !isBlank(v)).slice(0, 50);
  // Only full dates count here, so numbers and times are never mistaken for a date column.
  return filled.length >= 1 && filled.filter(v => { const d = parseDate(v); return d !== null && !d.noYear; }).length / filled.length >= 0.7;
};

/** Day/month or month/day for the whole file: month-first only when a date can't be read otherwise. */
export function detectDateOrder(t: SheetTable, map: ColumnMap): DateOrder {
  const cols = [map.pickupDate, map.dropoffDate, map.bookingDate].filter((c): c is number => c !== undefined);
  return t.rows.some(r => cols.some(c => looksMonthFirst(r[c]))) ? 'MDY' : 'DMY';
}

// ---------- building reservations ----------

export interface PreparedRow {
  row: number; // spreadsheet row number
  bookingId: string;
  customer: string;
  pickup: string; // YYYY-MM-DDTHH:mm
  dropoff: string;
  carRaw: string;
  sourceRaw: string;
  amount: number;
  phone: string;
  email: string;
  location: string;
  notes: string;
  bookingDate: string;
  problems: string[];
  /** Things the import put right by itself, shown on the review screen (e.g. a return year). */
  fixes: string[];
  /** Set when staff edited the row by hand: the exact car and source to save. */
  car?: string;
  source?: string;
}

const text = (v: unknown) => (isBlank(v) ? '' : String(v).replace(/\s+/g, ' ').trim());
export const parseAmount = (v: unknown): number => {
  if (typeof v === 'number') return isFinite(v) ? Math.round(v * 1000) / 1000 : 0;
  let s = text(v).replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  // 1.234,50 → 1234.50 ; 1,234.50 → 1234.50 ; 12,5 → 12.5
  if (/,\d{1,2}$/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};
const cleanId = (v: unknown) => {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return text(v);
};

const withYear = (date: string, y: number) => `${y}${date.slice(4)}`;
const dayDiff = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
const realDate = (date: string) => validYmd(+date.slice(0, 4), +date.slice(5, 7), +date.slice(8, 10));

/** Longest rental accepted without a note on the review screen. */
const LONG_RENTAL_DAYS = 90;

export function prepareRows(t: SheetTable, map: ColumnMap, order: DateOrder, today: Date = new Date()): PreparedRow[] {
  const get = (r: unknown[], f: FieldKey) => (map[f] === undefined ? '' : r[map[f]!]);
  const seen = new Map<string, number>();
  // The year most pick-ups in the file carry; used for dates written without a year.
  const yearCount = new Map<number, number>();
  t.rows.forEach(r => { const p = parseDate(get(r, 'pickupDate'), order); if (p && !p.noYear) { const y = +p.date.slice(0, 4); yearCount.set(y, (yearCount.get(y) || 0) + 1); } });
  const fileYear = Array.from(yearCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return t.rows.map((r, i) => {
    const row = t.headerRow + 1 + i;
    const problems: string[] = [];
    const fixes: string[] = [];
    const p = parseDate(get(r, 'pickupDate'), order);
    const d = parseDate(get(r, 'dropoffDate'), order);
    const pTime = parseTime(get(r, 'pickupTime')) || p?.time || '12:00';
    const dTime = parseTime(get(r, 'dropoffTime')) || d?.time || '12:00';
    if (!p) problems.push(isBlank(get(r, 'pickupDate')) ? 'No pick-up date' : `Pick-up date “${text(get(r, 'pickupDate'))}” could not be read`);
    if (!d) problems.push(isBlank(get(r, 'dropoffDate')) ? 'No drop-off date' : `Drop-off date “${text(get(r, 'dropoffDate'))}” could not be read`);

    let pDate = p?.date || '';
    let dDate = d?.date || '';
    if (p?.noYear) {
      // The file's year; without one, the next time this day comes round (from a month ago).
      let y = fileYear ?? today.getFullYear();
      if (fileYear === undefined && dayDiff(todayIso, withYear(pDate, y)) < -31) y += 1;
      pDate = withYear(pDate, y);
      if (!realDate(pDate)) { problems.push(`Pick-up date ${text(get(r, 'pickupDate'))} does not exist in ${y}`); pDate = ''; }
      else fixes.push(`Pick-up year ${y} added`);
    }
    if (d?.noYear && pDate) {
      // Same year as the pick-up, or the next one when the rental runs over New Year.
      let y = +pDate.slice(0, 4);
      if (withYear(dDate, y) < pDate) y += 1;
      dDate = withYear(dDate, y);
      if (!realDate(dDate)) { problems.push(`Drop-off date ${text(get(r, 'dropoffDate'))} does not exist in ${y}`); dDate = ''; }
      else fixes.push(`Drop-off year ${y} added`);
    }
    // A return typed with the old year over New Year (pick-up 28/12/2026, return 03/01/2026).
    if (pDate && dDate && dDate < pDate && !d?.noYear) {
      const next = withYear(dDate, +dDate.slice(0, 4) + 1);
      if (realDate(next) && next >= pDate && dayDiff(pDate, next) <= 60) {
        fixes.push(`Drop-off year corrected to ${next.slice(0, 4)} (the rental runs into the new year)`);
        dDate = next;
      }
    }
    const pickup = pDate ? `${pDate}T${pTime}` : '';
    const dropoff = dDate ? `${dDate}T${dTime}` : '';
    if (pickup && dropoff && dropoff < pickup) problems.push('Drop-off is before pick-up');
    if (pDate && dDate && dropoff >= pickup && dayDiff(pDate, dDate) > LONG_RENTAL_DAYS) fixes.push(`Long rental: ${dayDiff(pDate, dDate)} days, please check the dates`);
    let customer = text(get(r, 'customer'));
    if (!customer) customer = [text(get(r, 'firstName')), text(get(r, 'lastName'))].filter(Boolean).join(' ');
    if (!customer) problems.push('No customer name');
    const bookingId = cleanId(get(r, 'bookingId'));
    if (bookingId) {
      if (seen.has(bookingId)) problems.push(`Same booking number as row ${seen.get(bookingId)}`);
      else seen.set(bookingId, row);
    }
    let sourceRaw = text(get(r, 'source'));
    if (!sourceRaw) {
      const cells = r.map(c => text(c).toLowerCase());
      sourceRaw = CHANNEL_HINTS.find(h => cells.some(c => c.includes(h))) || '';
    }
    const bdRaw = parseDate(get(r, 'bookingDate'), order);
    const bd = bdRaw?.noYear ? { ...bdRaw, date: withYear(bdRaw.date, +(pDate || todayIso).slice(0, 4)) } : bdRaw;
    return {
      row, bookingId, customer, pickup, dropoff,
      carRaw: text(get(r, 'vehicle')), sourceRaw, amount: parseAmount(get(r, 'amount')),
      phone: text(get(r, 'phone')), email: text(get(r, 'email')), location: text(get(r, 'location')), notes: text(get(r, 'notes')),
      bookingDate: bd && realDate(bd.date) ? bd.date : '', problems, fixes,
    };
  });
}

const uuidv4 = (): string =>
  globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Turns reviewed rows into reservations. Source and car names come from the review's choices. */
export function toReservations(
  rows: PreparedRow[],
  opts: { year: number; month: string; byPickupMonth: boolean; fileName: string; sourceFor: (raw: string) => string; carFor: (raw: string) => string },
): Reservation[] {
  const batch = uuidv4();
  const now = new Date().toISOString();
  return rows.map(r => {
    const y = opts.byPickupMonth && r.pickup ? +r.pickup.slice(0, 4) : opts.year;
    const m = opts.byPickupMonth && r.pickup ? MONTH_NAMES[+r.pickup.slice(5, 7) - 1] : opts.month;
    const bookingId = r.bookingId || `IMP-${r.pickup.slice(0, 10).replace(/-/g, '')}-${r.row}`;
    const car = r.car ?? opts.carFor(r.carRaw);
    return {
      id: uuidv4(), uploadBatchId: batch, createdAt: now, updatedAt: now,
      storageYear: y, storageMonth: m,
      pickupDate: r.pickup, dropoffDate: r.dropoff, startDate: r.pickup, endDate: r.dropoff,
      customer: r.customer, personName: r.customer,
      invoice: bookingId, bookingId,
      vehicle: car, reservationVehicle: car, carModel: car,
      status: ReservationStatus.CONFIRMED,
      notes: r.notes,
      originalRowNumber: r.row, originalFileName: opts.fileName,
      source: r.source ?? opts.sourceFor(r.sourceRaw),
      bookingDate: r.bookingDate,
      amount: r.amount, baseAmount: r.amount,
      ...(r.phone ? { contactNumber: r.phone } : {}),
      ...(r.email ? { customerEmail: r.email } : {}),
      ...(r.location ? { locationName: r.location } : {}),
    } as Reservation;
  });
}
