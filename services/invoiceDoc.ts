import { CompanyDetails, InvoiceData, InvoiceLine, Reservation } from '../types';

export const TERMS_LABEL: Record<NonNullable<InvoiceData['terms']>, string> = {
  receipt: 'Due on receipt',
  net7: 'Net 7 days',
  net15: 'Net 15 days',
  net30: 'Net 30 days',
  net45: 'Net 45 days',
};
export const TERMS_DAYS: Record<NonNullable<InvoiceData['terms']>, number> = { receipt: 0, net7: 7, net15: 15, net30: 30, net45: 45 };

const DAY = 86400000;
/** Rental days with a 2-hour grace period on the last day (same rule as the agreement). */
export const rentalDays = (start: string, end: string) => {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(diff) || diff <= DAY) return 1;
  const full = Math.floor(diff / DAY);
  return diff % DAY >= 2 * 3600000 ? full + 1 : full;
};

/** Older invoices stored whole reservations; newer ones store slim lines. */
export const linesOf = (inv: InvoiceData): InvoiceLine[] =>
  inv.lines ?? (inv.reservations || []).map(r => ({
    reservationId: r.id, bookingId: r.bookingId, renter: r.personName, source: r.source, carModel: r.carModel,
    startDate: r.startDate, endDate: r.endDate, days: rentalDays(r.startDate, r.endDate), subtotal: r.subtotal, tax: r.tax, total: r.total,
  }));

export type InvoiceState = 'paid' | 'void' | 'overdue' | 'unpaid';
export const invoiceState = (inv: InvoiceData, now = Date.now()): InvoiceState => {
  if (inv.status === 'void') return 'void';
  if (inv.status === 'paid') return 'paid';
  if (inv.dueDate && new Date(inv.dueDate + 'T23:59:59').getTime() < now) return 'overdue';
  return 'unpaid';
};

export const money = (n: number, currency: string = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: currency === 'JOD' ? 3 : 2, maximumFractionDigits: currency === 'JOD' ? 3 : 2 }).format(n || 0);

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const words = (n: number): string => {
  if (n === 0) return 'Zero';
  const chunk = (x: number): string => {
    const h = Math.floor(x / 100), r = x % 100;
    const rest = r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? '-' + ONES[r % 10] : '');
    return [h ? ONES[h] + ' Hundred' : '', rest].filter(Boolean).join(' ');
  };
  const scales = ['', 'Thousand', 'Million', 'Billion'];
  const parts: string[] = [];
  for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) {
    if (n % 1000) parts.unshift(chunk(n % 1000) + (scales[i] ? ' ' + scales[i] : ''));
  }
  return parts.join(' ');
};
const CURRENCY_WORDS: Record<string, [string, string, number]> = { USD: ['US Dollars', 'Cents', 100], JOD: ['Jordanian Dinars', 'Fils', 1000], EUR: ['Euros', 'Cents', 100] };
export const amountInWords = (n: number, currency = 'USD') => {
  const [major, minor, base] = CURRENCY_WORDS[currency] || CURRENCY_WORDS.USD;
  const whole = Math.floor(n + 1e-9);
  const frac = Math.round((n - whole) * base);
  return `${words(whole)} ${major}${frac ? ` and ${words(frac)} ${minor}` : ''} only`;
};

/** Splits a booking amount into net and VAT according to the invoice's tax mode. */
export const priceLine = (gross: number, rate: number, mode: InvoiceData['taxMode']) => {
  if (mode === 'none' || !rate) return { subtotal: gross, tax: 0, total: gross };
  if (mode === 'added') { const tax = gross * rate; return { subtotal: gross, tax, total: gross + tax }; }
  const subtotal = gross / (1 + rate);
  return { subtotal, tax: gross - subtotal, total: gross };
};

/** Net rental amount for invoicing (extras are billed to the renter, not the partner). */
export const billableAmount = (r: Reservation) => {
  const days = rentalDays(r.startDate, r.endDate);
  const extras = (r.extras || []).reduce((s, e) => (e.isComplementary ? s : s + e.dailyPrice * days), 0);
  return r.baseAmount ?? ((r.amount || 0) - extras);
};

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const day = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return Number.isNaN(d.getTime()) ? esc(iso) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const shortDay = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? esc(iso) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

/** A4 tax invoice to a booking partner, ready to print or convert to PDF. */
export function buildInvoiceHtml(inv: InvoiceData, company: CompanyDetails, logo?: string): string {
  const cur = inv.currency || 'USD';
  const m = (n: number) => esc(money(n, cur));
  const lines = linesOf(inv);
  const state = invoiceState(inv);
  const rate = inv.taxRate ?? 0.16;
  const mode = inv.taxMode ?? 'included';
  const paid = state === 'paid';
  const balance = paid || state === 'void' ? 0 : inv.grandTotal;
  const stamp = state === 'void' ? ['VOID', 'void'] : paid ? ['PAID', 'paid'] : state === 'overdue' ? ['OVERDUE', 'due'] : ['PAYMENT DUE', 'open'];
  const totalDays = lines.reduce((s, l) => s + l.days, 0);

  const rows = lines.map((l, i) => `
      <tr>
        <td class="n">${i + 1}</td>
        <td><div class="b">${esc(l.bookingId || '—')}</div><div class="muted">${esc(l.source)}</div></td>
        <td><div>${esc(l.renter)}</div>${l.carModel ? `<div class="muted">${esc(l.carModel)}</div>` : ''}</td>
        <td class="nowrap">${shortDay(l.startDate)} – ${shortDay(l.endDate)}</td>
        <td class="num">${l.days}</td>
        <td class="num">${m(l.subtotal)}</td>
        ${mode !== 'none' ? `<td class="num">${m(l.tax)}</td>` : ''}
        <td class="num b">${m(l.total)}</td>
      </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${esc(inv.invoiceNumber)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Inter, Arial, sans-serif; color: #0f172a; font-size: 9pt; line-height: 1.45; padding: 6px 4px; }
  .accent { height: 5px; background: linear-gradient(90deg, #0f172a 0%, #334155 60%, #f97316 100%); border-radius: 3px; margin-bottom: 18px; }
  .top { display: flex; justify-content: space-between; gap: 24px; }
  .top img { height: 32px; }
  .co { font-size: 8pt; color: #475569; margin-top: 6px; line-height: 1.5; }
  .co b { color: #0f172a; font-size: 9pt; }
  .doc { text-align: right; min-width: 230px; }
  .doc h1 { font-size: 22pt; letter-spacing: -0.03em; line-height: 1; }
  .doc .sub { font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; color: #64748b; margin-top: 4px; }
  .meta { margin-top: 10px; display: grid; grid-template-columns: auto auto; gap: 2px 14px; justify-content: end; font-size: 8.5pt; }
  .meta span:nth-child(odd) { color: #64748b; text-align: right; } .meta span:nth-child(even) { font-weight: 600; text-align: right; }
  .mono { font-family: 'SFMono-Regular', Consolas, monospace; }
  .stamp { display: inline-block; margin-top: 10px; padding: 4px 12px; border-radius: 6px; font-size: 8.5pt; font-weight: 800; letter-spacing: .14em; border: 2px solid; }
  .stamp.paid { color: #047857; border-color: #047857; background: #ecfdf5; }
  .stamp.open { color: #1d4ed8; border-color: #1d4ed8; background: #eff6ff; }
  .stamp.due { color: #b91c1c; border-color: #b91c1c; background: #fef2f2; }
  .stamp.void { color: #64748b; border-color: #64748b; background: #f1f5f9; }
  .parties { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 10px; margin-top: 20px; }
  .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
  .card.dark { background: #0f172a; border-color: #0f172a; color: #fff; }
  .card.dark .lbl { color: #94a3b8; }
  .lbl { font-size: 7pt; text-transform: uppercase; letter-spacing: .1em; color: #64748b; font-weight: 700; margin-bottom: 5px; }
  .big { font-size: 15pt; font-weight: 800; letter-spacing: -0.02em; }
  .b { font-weight: 700; }
  .muted { color: #64748b; font-size: 7.8pt; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 18px; }
  thead { display: table-header-group; }
  th { font-size: 7pt; text-transform: uppercase; letter-spacing: .08em; color: #fff; background: #0f172a; text-align: left; padding: 7px 8px; font-weight: 700; }
  th:first-child { border-top-left-radius: 6px; } th:last-child { border-top-right-radius: 6px; }
  td { padding: 7px 8px; border-bottom: 1px solid #eef2f6; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  tr { break-inside: avoid; }
  td.n { width: 22px; color: #94a3b8; font-weight: 700; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  th.num { text-align: right; }
  .nowrap { white-space: nowrap; }
  .sum { display: grid; grid-template-columns: 1fr 300px; gap: 20px; margin-top: 14px; align-items: start; }
  .words { border-left: 3px solid #f97316; padding: 6px 10px; background: #fff7ed; border-radius: 0 6px 6px 0; font-size: 8.5pt; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 10px; font-variant-numeric: tabular-nums; }
  .totals .grand { background: #0f172a; color: #fff; border-radius: 6px; font-size: 12pt; font-weight: 800; padding: 9px 10px; margin-top: 4px; }
  .totals .bal { font-weight: 800; color: ${balance > 0 ? '#b91c1c' : '#047857'}; border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 7px; }
  .info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 18px; }
  .pre { white-space: pre-wrap; font-size: 8.3pt; color: #334155; }
  .voidbox { margin-top: 14px; padding: 10px 12px; border-radius: 8px; background: #f1f5f9; color: #475569; border: 1px dashed #94a3b8; font-size: 8.5pt; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; }
  .sign div { border-top: 1px solid #0f172a; padding-top: 4px; font-size: 7.8pt; color: #475569; }
  .foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 7.3pt; color: #64748b; }

  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print { body { padding: 0; } .card, .avoid, figure, tr, .sgrp, .band, .balance, .lead, .facts, .totals, .note, .sum { break-inside: avoid; page-break-inside: avoid; } thead { display: table-header-group; } }
</style></head><body>
  <div class="accent"></div>
  <div class="top">
    <div>
      ${logo ? `<img src="${logo}" alt="">` : `<div class="big">${esc(company.name)}</div>`}
      <div class="co"><b>${esc(company.name)}</b>${company.subName ? ' · ' + esc(company.subName) : ''}<br>${esc(company.address)}<br>Tel ${esc(company.phone)} · ${esc(company.email)}${company.taxNumber ? `<br>Tax registration no. <b>${esc(company.taxNumber)}</b>` : ''}</div>
    </div>
    <div class="doc">
      <h1>${mode === 'none' ? 'Invoice' : 'Tax Invoice'}</h1>
      <div class="sub">Partner billing statement</div>
      <div class="meta">
        <span>Invoice no.</span><span class="mono">${esc(inv.invoiceNumber)}</span>
        <span>Issue date</span><span>${day(inv.generatedAt)}</span>
        <span>Due date</span><span>${inv.dueDate ? day(inv.dueDate) : esc(TERMS_LABEL[inv.terms || 'receipt'])}</span>
        ${inv.poNumber ? `<span>PO / reference</span><span>${esc(inv.poNumber)}</span>` : ''}
      </div>
      <div class="stamp ${stamp[1]}">${stamp[0]}</div>
    </div>
  </div>

  <div class="parties">
    <div class="card"><div class="lbl">Bill to</div>
      <div class="b" style="font-size:11pt">${esc(inv.billToName)}</div>
      ${inv.billToAddress ? `<div class="pre">${esc(inv.billToAddress)}</div>` : ''}
      ${inv.billToEmail ? `<div>${esc(inv.billToEmail)}</div>` : ''}
      ${inv.billToTaxNumber ? `<div class="muted">Tax no. ${esc(inv.billToTaxNumber)}</div>` : ''}
    </div>
    <div class="card"><div class="lbl">Service period</div>
      <div class="b">${day(inv.startDate)} – ${day(inv.endDate)}</div>
      <div class="muted">${lines.length} booking${lines.length === 1 ? '' : 's'} · ${totalDays} rental day${totalDays === 1 ? '' : 's'}</div>
      <div class="muted">${esc(TERMS_LABEL[inv.terms || 'receipt'])} · ${esc(cur)}</div>
    </div>
    <div class="card dark"><div class="lbl">${paid ? 'Amount paid' : state === 'void' ? 'Voided' : 'Amount due'}</div>
      <div class="big">${m(state === 'void' ? 0 : inv.grandTotal)}</div>
      <div class="muted" style="color:#cbd5e1">${paid ? `Received ${day(inv.paidAt)}` : state === 'void' ? day(inv.voidedAt) : inv.dueDate ? `by ${day(inv.dueDate)}` : 'on receipt'}</div>
    </div>
  </div>

  <table>
    <thead><tr>
      <th></th><th>Booking</th><th>Renter / vehicle</th><th>Rental period</th><th class="num">Days</th>
      <th class="num">${mode === 'none' ? 'Amount' : 'Net'}</th>${mode !== 'none' ? `<th class="num">VAT ${Math.round(rate * 100)}%</th>` : ''}<th class="num">Total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="sum">
    <div>
      <div class="words"><div class="lbl" style="margin-bottom:2px">Amount in words</div>${esc(amountInWords(inv.grandTotal, cur))}</div>
    </div>
    <div class="totals">
      <div><span>Subtotal (net)</span><span>${m(inv.totalSubtotal)}</span></div>
      ${mode !== 'none' ? `<div><span>VAT ${Math.round(rate * 100)}%${mode === 'included' ? ' (included in rates)' : ''}</span><span>${m(inv.totalTax)}</span></div>` : ''}
      <div class="grand"><span>Total ${esc(cur)}</span><span>${m(inv.grandTotal)}</span></div>
      ${paid ? `<div><span>Paid${inv.paymentMethod ? ' · ' + esc(inv.paymentMethod) : ''}</span><span>− ${m(inv.grandTotal)}</span></div>` : ''}
      <div class="bal"><span>Balance due</span><span>${m(balance)}</span></div>
    </div>
  </div>

  ${state === 'void' ? `<div class="voidbox"><b>This invoice has been voided</b>${inv.voidReason ? ` — ${esc(inv.voidReason)}` : ''}. No payment is due.</div>` : ''}

  <div class="info">
    <div class="card avoid"><div class="lbl">Payment instructions</div><div class="pre">${esc(inv.paymentInstructions || `Please pay by bank transfer quoting ${inv.invoiceNumber}.`)}</div></div>
    <div class="card avoid"><div class="lbl">Notes</div><div class="pre">${esc(inv.notes || 'Thank you for your partnership. Please contact us within 7 days of receipt if any booking on this invoice is incorrect.')}</div></div>
  </div>

  <div class="sign avoid">
    <div>Issued by ${esc(inv.issuedBy || company.name)}</div>
    <div>Received by (partner)</div>
  </div>

  <div class="foot"><span>${esc(company.name)}${company.taxNumber ? ' · Tax no. ' + esc(company.taxNumber) : ''} · ${esc(inv.invoiceNumber)}</span><span>${esc(company.email)} · ${esc(company.phone)}</span></div>
</body></html>`;
}
