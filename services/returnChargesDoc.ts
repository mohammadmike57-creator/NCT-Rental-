import { CompanyDetails, Reservation, ReturnChargeItem, ReturnChargeKind, ReturnCharges } from '../types';

export const CHARGE_KIND_LABEL: Record<ReturnChargeKind, string> = {
  damage: 'Vehicle damage',
  ticket: 'Traffic violation',
  fuel: 'Fuel shortage',
  cleaning: 'Cleaning',
  late: 'Late return',
  other: 'Other charge',
};

export const CHARGE_KIND_AR: Record<ReturnChargeKind, string> = {
  damage: 'أضرار المركبة',
  ticket: 'مخالفة مرورية',
  fuel: 'نقص الوقود',
  cleaning: 'تنظيف',
  late: 'تأخير في الإرجاع',
  other: 'رسوم أخرى',
};

/** Damage charged against each numbered return mark (mark number → amount). */
export const damageCostByMark = (c?: ReturnCharges) => {
  const map = new Map<number, number>();
  (c?.items || []).forEach(it => { if (it.kind === 'damage' && it.markerNumber) map.set(it.markerNumber, (map.get(it.markerNumber) || 0) + (it.amount || 0)); });
  return map;
};
export const damageChargesTotal = (c?: ReturnCharges) => chargesTotal((c?.items || []).filter(i => i.kind === 'damage'));

export const PAYMENT_METHOD_LABEL: Record<NonNullable<ReturnCharges['paymentMethod']>, string> = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  deposit: 'Deducted from deposit',
};

export const chargesTotal = (items: ReturnChargeItem[]) => Math.round(items.reduce((s, i) => s + (i.amount || 0), 0) * 100) / 100;

export const formatMoney = (n: number, currency: 'JOD' | 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: currency === 'JOD' ? 3 : 2 }).format(n || 0);

/** Document number: INV-… when settled at the counter, CLM-… when billed to the customer later. */
export const chargesDocumentNumber = (bookingId: string, settlement: 'paid' | 'claim') =>
  `${settlement === 'paid' ? 'INV' : 'CLM'}-${(bookingId || 'X').replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

export const chargesDocumentTitle = (c: ReturnCharges) => (c.settlement === 'paid' ? 'Invoice' : 'Damage & charges claim');
export const chargesFileName = (c: ReturnCharges, bookingId: string) => `${c.settlement === 'paid' ? 'Invoice' : 'Claim'}-${c.documentNumber || bookingId}.pdf`;

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const day = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? esc(iso) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Printable A4 document listing the return charges, with damage photos, settlement status and the customer's signature. */
export function buildReturnChargesHtml(r: Reservation, c: ReturnCharges, company: CompanyDetails, logo?: string): string {
  const total = chargesTotal(c.items);
  const m = (n: number) => esc(formatMoney(n, c.currency));
  const paid = c.settlement === 'paid';
  const title = chargesDocumentTitle(c);
  const rows = c.items.map((it, i) => `
    <tr>
      <td class="n">${i + 1}</td>
      <td><div class="k">${esc(CHARGE_KIND_LABEL[it.kind])}${it.markerNumber ? ` · mark #${it.markerNumber}` : ''}${it.view ? ` · ${esc(it.view)} side` : ''}</div>
          <div>${esc(it.description)}</div>
          ${it.kind === 'ticket' && (it.ticketDate || it.ticketReference) ? `<div class="muted">${it.ticketDate ? `Issued ${day(it.ticketDate)}` : ''}${it.ticketReference ? ` · Ref ${esc(it.ticketReference)}` : ''}</div>` : ''}
          ${it.photos?.length ? `<div class="muted">${it.photos.length} photo${it.photos.length === 1 ? '' : 's'} attached below</div>` : ''}</td>
      <td class="num">${m(it.amount)}</td>
    </tr>`).join('');
  const photos = c.items.flatMap((it, i) => (it.photos || []).map((src, j) => `
    <figure><img src="${esc(src)}"/><figcaption>${i + 1}${(it.photos!.length > 1) ? String.fromCharCode(97 + j) : ''} · ${esc(it.description || CHARGE_KIND_LABEL[it.kind])}</figcaption></figure>`)).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)} ${esc(c.documentNumber || '')}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Inter, Arial, sans-serif; color: #0f172a; font-size: 9.5pt; line-height: 1.45; padding: 4px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2px solid #0f172a; }
  .top img { height: 30px; }
  .co { font-size: 8pt; color: #475569; margin-top: 4px; }
  .doc { text-align: right; }
  .doc h1 { font-size: 18pt; letter-spacing: -0.02em; }
  .doc .no { font-family: monospace; font-size: 9pt; color: #334155; margin-top: 2px; }
  .stamp { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 6px; font-size: 9pt; font-weight: 800; letter-spacing: .12em; border: 2px solid; }
  .stamp.paid { color: #047857; border-color: #047857; background: #ecfdf5; }
  .stamp.due { color: #b45309; border-color: #b45309; background: #fffbeb; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 14px; }
  .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 9px 11px; }
  h2 { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: #64748b; margin-bottom: 5px; }
  .b { font-weight: 700; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 14px; }
  th { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em; color: #64748b; text-align: left; padding: 6px 8px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  td { padding: 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  td.n { width: 22px; color: #94a3b8; font-weight: 700; }
  .k { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 600; }
  .muted { color: #64748b; font-size: 8pt; }
  .totals { margin-left: auto; width: 46%; margin-top: 8px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 8px; }
  .totals .grand { border-top: 2px solid #0f172a; font-size: 13pt; font-weight: 800; padding-top: 7px; margin-top: 3px; }
  .totals .bal { font-weight: 700; color: ${paid ? '#047857' : '#b45309'}; }
  .note { margin-top: 14px; padding: 10px 12px; border-radius: 8px; font-size: 8.5pt; background: ${paid ? '#ecfdf5' : '#fffbeb'}; color: ${paid ? '#065f46' : '#92400e'}; border: 1px solid ${paid ? '#a7f3d0' : '#fde68a'}; }
  .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
  figure { border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; break-inside: avoid; }
  figure img { width: 100%; height: 130px; object-fit: cover; display: block; }
  figcaption { font-size: 7.5pt; color: #475569; padding: 3px 6px; }
  .sec { margin-top: 16px; }
  .sig { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 10px; }
  .sig-img { height: 48px; display: flex; align-items: flex-end; }
  .sig-img img { max-height: 48px; max-width: 100%; }
  .sig-line { border-top: 1px solid #0f172a; margin-top: 3px; padding-top: 3px; font-size: 8pt; font-weight: 600; }
  .foot { margin-top: 16px; padding-top: 6px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 7.5pt; color: #64748b; }

  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print { body { padding: 0; } .card, .avoid, figure, tr, .sgrp, .band, .balance, .lead, .facts, .totals, .note, .sum { break-inside: avoid; page-break-inside: avoid; } thead { display: table-header-group; } }
</style></head><body>
  <div class="top">
    <div>${logo ? `<img src="${logo}" alt="">` : `<div class="b" style="font-size:14pt">${esc(company.name)}</div>`}
      <div class="co"><strong>${esc(company.name)}</strong>${company.subName ? ' · ' + esc(company.subName) : ''}<br>${esc(company.address)}<br>Tel ${esc(company.phone)} · ${esc(company.email)}${company.taxNumber ? ' · Tax No. ' + esc(company.taxNumber) : ''}</div>
    </div>
    <div class="doc">
      <h1>${esc(title)}</h1>
      <div class="no">${esc(c.documentNumber || 'DRAFT')}</div>
      <div class="muted">Issued ${day(c.issuedAt || new Date().toISOString())}</div>
      <div class="stamp ${paid ? 'paid' : 'due'}">${paid ? 'PAID' : 'PAYMENT DUE'}</div>
    </div>
  </div>

  <div class="grid">
    <div class="card"><h2>Billed to</h2><div class="b">${esc(r.personName)}</div><div>${esc(r.contactNumber || '')}</div><div>${esc(r.customerEmail || '')}</div></div>
    <div class="card"><h2>Rental</h2><div class="b">Booking ${esc(r.bookingId)}</div><div>${day(r.startDate)} → ${day(r.endDate)}</div><div class="muted">${esc(r.locationName || '')}</div></div>
    <div class="card"><h2>Vehicle</h2><div class="b">${esc(r.carModel || '—')}</div><div>Plate ${esc(r.licensePlate || '—')}</div><div class="muted">${r.pickupKmOut != null ? `${r.pickupKmOut} km out` : ''}${r.dropOffKmIn != null ? ` · ${r.dropOffKmIn} km in` : ''}</div></div>
  </div>

  <table>
    <thead><tr><th></th><th>Description</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows || '<tr><td></td><td class="muted">No charges</td><td></td></tr>'}</tbody>
  </table>
  <div class="totals">
    <div class="grand"><span>Total</span><span>${m(total)}</span></div>
    ${paid
      ? `<div><span>Paid${c.paymentMethod ? ` · ${esc(PAYMENT_METHOD_LABEL[c.paymentMethod])}` : ''}</span><span>${m(total)}</span></div><div class="bal"><span>Balance</span><span>${m(0)}</span></div>`
      : `<div class="bal"><span>Amount due${c.dueDate ? ` by ${day(c.dueDate)}` : ''}</span><span>${m(total)}</span></div>`}
  </div>

  <div class="note">${paid
    ? `Received with thanks${c.paymentReference ? ` — reference <b>${esc(c.paymentReference)}</b>` : ''}. This invoice confirms that the charges above have been settled in full.`
    : `The charges above were found when the vehicle was returned and were acknowledged by the renter. Please settle the amount due${c.dueDate ? ` by <b>${day(c.dueDate)}</b>` : ' within 14 days'}. Contact us on ${esc(company.phone)} or ${esc(company.email)} with any questions, quoting <b>${esc(c.documentNumber || r.bookingId)}</b>.`}</div>

  ${photos ? `<div class="sec"><h2>Photo evidence</h2><div class="photos">${photos}</div></div>` : ''}

  <div class="sec">
    <h2>Acknowledgement</h2>
    <div class="muted">The renter confirms the charges listed above were reviewed with them at the return of the vehicle${paid ? ' and have been paid' : ' and agrees to pay the amount due'}.</div>
    <div class="sig">
      <div><div class="sig-img">${c.customerSignature ? `<img src="${esc(c.customerSignature)}"/>` : ''}</div><div class="sig-line">${esc(r.personName)} — Renter</div><div class="muted">${c.signedAt ? `Signed ${new Date(c.signedAt).toLocaleString('en-GB')}` : 'Not signed'}</div></div>
      <div><div class="sig-img"></div><div class="sig-line">${esc(c.issuedBy || company.name)} — for ${esc(company.name)}</div></div>
    </div>
  </div>

  <div class="foot"><span>${esc(company.name)} · ${esc(c.documentNumber || '')}</span><span>Generated ${new Date().toLocaleString('en-GB')}</span></div>
</body></html>`;
}
