import type { Workbook } from 'exceljs';
import { Reservation, ReservationStatus } from '../types';
import { KIND_LABEL, addOnsOf } from './addOns';

/**
 * The reservations export as a finished Excel workbook: a title block with the company and when it was
 * exported, a dark header row that stays on screen, filters on every column, real Excel dates and money,
 * coloured statuses, banded rows, a totals row with live formulas, and landscape printing on one page wide.
 * ExcelJS is loaded only when the export is used, so the app itself stays small.
 */

const NAVY = 'FF0F172A', SLATE = 'FF475569', LINE = 'FFE2E8F0', BAND = 'FFF8FAFC';
const STATUS_STYLE: Record<string, { label: string; text: string; fill: string }> = {
  [ReservationStatus.CONFIRMED]: { label: 'Confirmed', text: 'FF1D4ED8', fill: 'FFEFF6FF' },
  [ReservationStatus.CANCELLED]: { label: 'Cancelled', text: 'FFB91C1C', fill: 'FFFEF2F2' },
  [ReservationStatus.NO_SHOW]: { label: 'No-show', text: 'FFB45309', fill: 'FFFFFBEB' },
  [ReservationStatus.PENDING]: { label: 'Pending', text: 'FF6D28D9', fill: 'FFF5F3FF' },
};

/** "YYYY-MM-DDTHH:mm" (local business time) as a Date Excel shows unchanged, whatever the viewer's time zone. */
export const excelDate = (v?: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(v || '');
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0))) : null;
};
const rentalDays = (a?: string, b?: string) => {
  const s = excelDate(a), e = excelDate(b);
  return s && e && e > s ? Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86400000)) : null;
};
const round2 = (n: number) => Math.round((n || 0) * 100) / 100;

export interface ReservationExcelOptions {
  companyName?: string;
  /** What the list shows, e.g. "November 2026 · all sources". */
  scope?: string;
  sourceName: (id: string) => string;
  now?: Date;
}

const COLUMNS: { key: string; header: string; width: number; money?: boolean; date?: 'day' | 'time'; wrap?: boolean; center?: boolean }[] = [
  { key: 'booking', header: 'Booking ID', width: 16 },
  { key: 'customer', header: 'Customer', width: 24 },
  { key: 'source', header: 'Source', width: 16 },
  { key: 'car', header: 'Car model', width: 22 },
  { key: 'booked', header: 'Booked on', width: 14, date: 'day' },
  { key: 'pickup', header: 'Pick-up', width: 21, date: 'time' },
  { key: 'return', header: 'Return', width: 21, date: 'time' },
  { key: 'days', header: 'Days', width: 7, center: true },
  { key: 'status', header: 'Status', width: 13, center: true },
  { key: 'amount', header: 'Amount (USD)', width: 15, money: true },
  { key: 'original', header: 'Original (USD)', width: 15, money: true },
  { key: 'addons', header: 'Add-ons (USD)', width: 15, money: true },
  { key: 'addonList', header: 'Add-ons', width: 52, wrap: true },
  { key: 'location', header: 'Location', width: 18 },
  { key: 'contact', header: 'Contact', width: 17 },
  { key: 'notes', header: 'Notes', width: 32, wrap: true },
];

export async function buildReservationWorkbook(list: Reservation[], o: ReservationExcelOptions): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = o.companyName || 'Rental management';
  wb.created = o.now || new Date();
  const ws = wb.addWorksheet('Reservations', {
    views: [{ state: 'frozen', ySplit: 4, xSplit: 2, showGridLines: false }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: '&L&8&K475569' + (o.companyName || '') + ' · Reservations&R&8&K475569Page &P of &N' },
  });
  ws.columns = COLUMNS.map(c => ({ key: c.key, width: c.width }));
  const last = COLUMNS.length;

  // ---- Title block (rows 1–2), blank row 3, header row 4
  ws.mergeCells(1, 1, 1, last);
  const title = ws.getCell(1, 1);
  title.value = `${o.companyName ? `${o.companyName} · ` : ''}Reservations`;
  title.font = { name: 'Calibri', size: 16, bold: true, color: { argb: NAVY } };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, 8);
  const now = o.now || new Date();
  const sub = ws.getCell(2, 1);
  sub.value = [o.scope, `${list.length} reservation${list.length === 1 ? '' : 's'}`,
    `Exported ${now.toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`].filter(Boolean).join('  ·  ');
  sub.font = { name: 'Calibri', size: 10, color: { argb: SLATE } };
  ws.getRow(3).height = 6;

  const head = ws.getRow(4);
  COLUMNS.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { vertical: 'middle', horizontal: c.money ? 'right' : c.center ? 'center' : 'left', indent: c.money || c.center ? 0 : 1 };
  });
  head.height = 24;

  // ---- One row per reservation
  list.forEach((res, i) => {
    const s = addOnsOf(res);
    const priceAddOns = s.entries.filter(e => e.group === 'price');
    const row = ws.addRow({
      booking: res.bookingId || '',
      customer: res.personName || '',
      source: o.sourceName(res.source || ''),
      car: res.carModel || '',
      booked: excelDate(res.bookingDate || res.startDate),
      pickup: excelDate(res.startDate),
      return: excelDate(res.endDate),
      days: rentalDays(res.startDate, res.endDate),
      status: STATUS_STYLE[res.status]?.label || String(res.status || ''),
      amount: round2(res.amount),
      original: round2(s.originalPrice),
      addons: round2(s.priceChange),
      addonList: priceAddOns.map(e => `${KIND_LABEL[e.kind]}: ${e.title} (${e.amount >= 0 ? '+' : '−'}${Math.abs(e.amount).toFixed(2)})`).join('\n'),
      location: res.locationName || '',
      contact: res.contactNumber || '',
      notes: res.notes || '',
    });
    const lines = Math.max(1, priceAddOns.length, Math.ceil(String(res.notes || '').length / 40));
    row.height = Math.max(20, 15 * lines + 5);
    COLUMNS.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      cell.font = { name: 'Calibri', size: 10.5, color: { argb: NAVY }, bold: c.key === 'booking' };
      cell.alignment = { vertical: 'middle', horizontal: c.money ? 'right' : c.center ? 'center' : 'left', wrapText: !!c.wrap, indent: c.money || c.center ? 0 : 1 };
      cell.border = { bottom: { style: 'thin', color: { argb: LINE } } };
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
      if (c.money) cell.numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
      if (c.date === 'day') cell.numFmt = 'ddd dd mmm yyyy';
      if (c.date === 'time') cell.numFmt = 'ddd dd mmm yyyy  hh:mm';
    });
    const st = STATUS_STYLE[res.status];
    if (st) {
      const cell = row.getCell(COLUMNS.findIndex(c => c.key === 'status') + 1);
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: st.text } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: st.fill } };
    }
    if (s.priceChange > 0) row.getCell(COLUMNS.findIndex(c => c.key === 'addons') + 1).font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF047857' } };
  });

  // ---- Totals row with live formulas
  const first = 5, lastData = 4 + list.length;

  // ---- Search box (row 2, stays on screen): type a booking number, name, car or phone and the matching
  // rows turn yellow, with the number found beside it. Plain formulas, so it works in Excel, Sheets and Calc.
  if (list.length) {
    const col = (k: string) => COLUMNS.findIndex(c => c.key === k) + 1;
    const letter = (k: string) => ws.getColumn(col(k)).letter;
    const searched = ['booking', 'customer', 'source', 'car', 'contact', 'location'];
    const labelCol = col('status'), boxFrom = col('amount'), boxTo = col('addons'), countCol = col('addonList');
    const label = ws.getCell(2, labelCol);
    label.value = 'Search:';
    label.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: NAVY } };
    label.alignment = { vertical: 'middle', horizontal: 'right' };
    ws.mergeCells(2, boxFrom, 2, boxTo);
    const box = ws.getCell(2, boxFrom);
    box.value = '';
    box.note = 'Type a booking number, customer name, car or phone number. Matching rows turn yellow.';
    box.font = { name: 'Calibri', size: 11, bold: true, color: { argb: NAVY } };
    box.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
    box.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    const edge = { style: 'medium' as const, color: { argb: 'FFF59E0B' } };
    for (let c = boxFrom; c <= boxTo; c++) {
      ws.getCell(2, c).border = { top: edge, bottom: edge, ...(c === boxFrom ? { left: edge } : {}), ...(c === boxTo ? { right: edge } : {}) };
    }
    ws.getRow(2).height = 22;
    const ref = `$${ws.getColumn(boxFrom).letter}$2`;
    const rowText = searched.map(k => `$${letter(k)}${first}`).join('&" "&');
    const colText = searched.map(k => `$${letter(k)}$${first}:$${letter(k)}$${lastData}`).join('&" "&');
    const count = ws.getCell(2, countCol);
    count.value = { formula: `IF(${ref}="","Type to highlight bookings",SUMPRODUCT(--ISNUMBER(SEARCH(${ref},${colText})))&" found")` };
    count.font = { name: 'Calibri', size: 10, italic: true, color: { argb: SLATE } };
    count.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.addConditionalFormatting({
      ref: `A${first}:${ws.getColumn(last).letter}${lastData}`,
      rules: [{
        type: 'expression', priority: 1,
        formulae: [`AND(${ref}<>"",ISNUMBER(SEARCH(${ref},${rowText})))`],
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFDE68A' } }, font: { bold: true, color: { argb: NAVY } } },
      }],
    });
  }

  if (list.length) {
    const total = ws.addRow({});
    const col = (k: string) => COLUMNS.findIndex(c => c.key === k) + 1;
    const letter = (k: string) => ws.getColumn(col(k)).letter;
    total.getCell(1).value = 'Total';
    total.getCell(col('days')).value = { formula: `SUM(${letter('days')}${first}:${letter('days')}${lastData})` };
    (['amount', 'original', 'addons'] as const).forEach(k => {
      total.getCell(col(k)).value = { formula: `SUM(${letter(k)}${first}:${letter(k)}${lastData})` };
    });
    total.height = 24;
    COLUMNS.forEach((c, ci) => {
      const cell = total.getCell(ci + 1);
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = { top: { style: 'medium', color: { argb: NAVY } } };
      cell.alignment = { vertical: 'middle', horizontal: c.money ? 'right' : c.center ? 'center' : 'left', indent: c.money || c.center ? 0 : 1 };
      if (c.money) cell.numFmt = '"$"#,##0.00';
    });
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: lastData, column: last } };
  }
  ws.pageSetup.printTitlesRow = '4:4';
  return wb;
}

/** Builds the workbook and has the browser save it as <name>.xlsx. */
export async function downloadReservationExcel(list: Reservation[], name: string, o: ReservationExcelOptions): Promise<void> {
  const wb = await buildReservationWorkbook(list, o);
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
