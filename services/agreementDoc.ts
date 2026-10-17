import { CarView, CompanyDetails, DamageMarker, Reservation } from '../types';
import { INSPECTION_LABEL, INSPECTION_SVG } from '../components/VehicleGraphics';
import { CHARGE_KIND_LABEL, PAYMENT_METHOD_LABEL, chargesTotal, formatMoney } from './returnChargesDoc';

export const PICKUP_TERMS = "By signing, the Renter acknowledges receipt of the vehicle in the condition documented above and agrees to the rental terms and conditions. The Renter accepts financial responsibility for all charges, traffic violations, damages and losses during the rental period. The Company Representative confirms the vehicle's condition and rental details are accurate at pickup.";
export const RETURN_TERMS = "By signing, the Renter confirms the return of the vehicle. The final condition and any additional charges (such as fuel shortage or new damage) have been reviewed and accepted. The Company Representative confirms receipt of the vehicle and the accuracy of the return inspection.";

export interface AgreementDocInput {
  reservation: Reservation;
  company: CompanyDetails;
  logo?: string;
  checklistItems: string[];
  rentalDays: number;
  baseRentalFee: number;
  locationName?: string;
  locationAddress?: string;
  /** true when the booking source is paid by the partner (renter pays nothing at the counter) */
  prepaid?: boolean;
}

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const usd = (n: number) => esc(formatMoney(n, 'USD'));
// Check-in/out times are stored as display strings such as "October 16, 2026 at 09:00 AM".
const parse = (s?: string) => { if (!s) return null; const d = new Date(s.replace(' at ', ' ')); return Number.isNaN(d.getTime()) ? null : d; };
const when = (s?: string) => { const d = parse(s); return d ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : esc(s || '—'); };
const km = (n?: number) => (n == null ? '—' : `${n.toLocaleString('en-US')} km`);

/** Eight-segment fuel gauge. */
const fuel = (level?: number, tone = '#0f172a') => {
  if (level == null) return '<span class="dim">—</span>';
  const segs = Array.from({ length: 8 }, (_, i) => `<i style="background:${i < level ? tone : '#e2e8f0'}"></i>`).join('');
  return `<span class="gauge">${segs}</span><b>${level}/8</b>`;
};

/**
 * The customer's copy of the rental agreement. Before return it is the check-out agreement;
 * once the car is back it becomes the closed agreement with the check-in comparison,
 * charges at return and all four signatures.
 */
export function buildAgreementHtml(i: AgreementDocInput): string {
  const r = i.reservation;
  const closed = !!r.dropOffCompleted;
  const onRent = !!r.voucherSubmitted && !closed;
  const pickupMarks = r.pickupDamageMarkers || [];
  const returnMarks = r.dropOffDamageMarkers || [];
  const out = r.pickupChecklist || {};
  const back = r.dropOffChecklist || {};
  const kmDriven = r.dropOffKmIn != null && r.pickupKmOut != null && r.dropOffKmIn >= r.pickupKmOut ? r.dropOffKmIn - r.pickupKmOut : null;
  const fuelDiff = r.dropOffFuelLevel != null && r.pickupFuelLevel != null ? r.dropOffFuelLevel - r.pickupFuelLevel : null;
  const returnedAt = parse(r.dropOffDateTime) || (closed ? parse(r.agreementEmails?.find(e => e.kind === 'checkin')?.sentAt) : null);
  const due = parse(r.endDate);
  const lateHours = returnedAt && due ? (returnedAt.getTime() - due.getTime()) / 3600000 : 0;
  const okOut = i.checklistItems.filter(x => out[x]).length;
  const okIn = i.checklistItems.filter(x => back[x]).length;
  const missingAtReturn = closed ? i.checklistItems.filter(x => out[x] && !back[x]) : [];
  const extrasTotal = (r.extras || []).reduce((s, e) => (e.isComplementary ? s : s + e.dailyPrice * i.rentalDays), 0);
  const rentalTotal = i.baseRentalFee + extrasTotal;
  const rc = r.returnCharges && r.returnCharges.items.length ? r.returnCharges : undefined;
  const photos = rc ? rc.items.flatMap((it, n) => (it.photos || []).map((src, j) => ({ src, cap: `${n + 1}${(it.photos!.length > 1) ? String.fromCharCode(97 + j) : ''} · ${it.description || CHARGE_KIND_LABEL[it.kind]}` }))).slice(0, 6) : [];

  const diagram = (view: CarView) => {
    const dots = (marks: DamageMarker[], color: string, filled: boolean) => marks
      .map((m, n) => ({ m, n }))
      .filter(({ m }) => m.view === view)
      .map(({ m, n }) => `<g><circle cx="${m.x.toFixed(1)}" cy="${(m.y - 20).toFixed(1)}" r="4.4" fill="${filled ? color : '#fff'}" stroke="${color}" stroke-width="1.3"/><text x="${m.x.toFixed(1)}" y="${(m.y - 20 + 1.7).toFixed(1)}" font-size="4.8" text-anchor="middle" font-family="Arial" font-weight="700" fill="${filled ? '#fff' : color}">${n + 1}</text></g>`)
      .join('');
    return `<div class="view"><svg viewBox="0 -12 100 84">${INSPECTION_SVG[view]}${dots(pickupMarks, '#0284c7', false)}${closed || returnMarks.length ? dots(returnMarks, '#e11d48', true) : ''}</svg><div class="vl">${INSPECTION_LABEL[view]}</div></div>`;
  };
  const sig = (img: string | undefined, role: string, name?: string, at?: string) => `
    <div class="sig"><div class="si">${img ? `<img src="${esc(img)}"/>` : ''}</div><div class="sl">${esc(role)}</div><div class="sm">${esc([name, at].filter(Boolean).join(' · ') || ' ')}</div></div>`;
  const tick = (v?: boolean, warn?: boolean) => (v ? '<span class="ok">✔</span>' : warn ? '<span class="bad">✕</span>' : '<span class="dim">—</span>');

  const status = closed ? ['Closed', 'closed'] : onRent ? ['On rent', 'open'] : ['Booked', 'new'];
  const paymentLine = i.prepaid
    ? `Prepaid via ${esc(r.source || 'partner')}`
    : r.authNumber ? `Paid${r.finalAmountCharged ? ' ' + usd(r.finalAmountCharged) : ''} · auth ${esc(r.authNumber)}` : 'Payable at the counter';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rental Agreement ${esc(r.bookingId)}</title>
<style>
  @page { size: A4; margin: 11mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Inter, Arial, sans-serif; color: #0f172a; font-size: 8.6pt; line-height: 1.4; padding: 4px; }
  .accent { height: 4px; background: linear-gradient(90deg, #0f172a, #334155 60%, #f97316); border-radius: 3px; margin-bottom: 12px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .top img { height: 28px; }
  .co { font-size: 7.6pt; color: #475569; margin-top: 4px; line-height: 1.45; }
  .doc { text-align: right; }
  .doc h1 { font-size: 17pt; letter-spacing: -0.02em; line-height: 1.05; }
  .doc .sub { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .14em; color: #64748b; margin-top: 3px; }
  .doc .no { margin-top: 5px; font-size: 8.5pt; } .doc .no b { font-family: Consolas, monospace; }
  .pill { display: inline-block; margin-top: 5px; padding: 2px 9px; border-radius: 999px; font-size: 7.3pt; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
  .pill.closed { background: #0f172a; color: #fff; } .pill.open { background: #ecfdf5; color: #047857; } .pill.new { background: #eff6ff; color: #1d4ed8; }
  .band { margin-top: 10px; display: flex; gap: 0; border-radius: 8px; overflow: hidden; background: #0f172a; color: #fff; }
  .band div { flex: 1; padding: 7px 11px; border-right: 1px solid #1e293b; }
  .band div:last-child { border-right: 0; }
  .band span { display: block; font-size: 6.8pt; text-transform: uppercase; letter-spacing: .1em; color: #94a3b8; }
  .band b { font-size: 10pt; }
  .band .warn b { color: #fdba74; }
  .g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 7px; margin-top: 8px; }
  .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 7px; }
  .g2w { display: grid; grid-template-columns: 1.1fr 1fr; gap: 7px; margin-top: 7px; }
  .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 10px; }
  h2 { font-size: 7pt; text-transform: uppercase; letter-spacing: .1em; color: #64748b; margin-bottom: 5px; font-weight: 700; }
  .name { font-size: 10.5pt; font-weight: 700; }
  .kv { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
  .kv span:first-child { color: #64748b; } .kv span:last-child { font-weight: 600; text-align: right; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; }
  td, th { padding: 3px 4px; border-bottom: 1px solid #f1f5f9; text-align: left; vertical-align: middle; }
  th { font-size: 6.8pt; text-transform: uppercase; letter-spacing: .07em; color: #64748b; font-weight: 700; }
  .cmp th { background: #f8fafc; }
  .cmp td:first-child { color: #64748b; width: 23%; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ctr { text-align: center; }
  .gauge { display: inline-flex; gap: 1.5px; margin-right: 5px; vertical-align: middle; }
  .gauge i { width: 7px; height: 9px; border-radius: 1.5px; display: inline-block; }
  .diff-bad { color: #b91c1c; font-weight: 700; } .diff-ok { color: #047857; font-weight: 700; }
  .ok { color: #059669; font-weight: 800; } .bad { color: #dc2626; font-weight: 800; } .dim { color: #cbd5e1; }
  .views { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
  .view { border: 1px solid #eef2f6; border-radius: 6px; text-align: center; background: #fcfdfe; }
  .view svg { width: 100%; height: 74px; display: block; }
  .vl { font-size: 6.8pt; color: #64748b; padding-bottom: 2px; }
  .legend { margin-top: 5px; font-size: 7pt; color: #475569; }
  .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin: 0 3px -1px 8px; vertical-align: baseline; }
  .tot td { border-top: 1.5px solid #0f172a; border-bottom: 0; font-weight: 800; font-size: 9.5pt; padding-top: 5px; }
  .settle { margin-top: 5px; padding: 5px 8px; border-radius: 6px; font-size: 7.6pt; font-weight: 600; }
  .settle.paid { background: #ecfdf5; color: #065f46; } .settle.claim { background: #fffbeb; color: #92400e; } .settle.info { background: #f1f5f9; color: #334155; }
  .photos { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; }
  figure { border: 1px solid #e2e8f0; border-radius: 5px; overflow: hidden; }
  figure img { width: 100%; height: 62px; object-fit: cover; display: block; }
  figcaption { font-size: 6.4pt; color: #475569; padding: 2px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .notes { white-space: pre-wrap; color: #334155; }
  .terms { font-size: 6.9pt; color: #475569; text-align: justify; line-height: 1.45; }
  .sg { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; }
  .sgrp { border: 1px solid #eef2f6; border-radius: 6px; padding: 5px 8px 6px; }
  .sgrp h3 { font-size: 6.8pt; text-transform: uppercase; letter-spacing: .1em; color: #64748b; margin-bottom: 2px; }
  .sgrp .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .si { height: 34px; display: flex; align-items: flex-end; justify-content: center; }
  .si img { max-height: 34px; max-width: 100%; }
  .sl { border-top: 1px solid #0f172a; padding-top: 2px; font-size: 7.2pt; font-weight: 700; text-align: center; }
  .sm { font-size: 6.6pt; color: #64748b; text-align: center; min-height: 9px; }
  .foot { margin-top: 8px; padding-top: 5px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 6.8pt; color: #64748b; }
</style></head><body>
  <div class="accent"></div>
  <div class="top">
    <div>${i.logo ? `<img src="${i.logo}" alt="">` : `<div class="name">${esc(i.company.name)}</div>`}
      <div class="co"><b style="color:#0f172a">${esc(i.company.name)}</b>${i.company.subName ? ' · ' + esc(i.company.subName) : ''}<br>${esc(i.company.address)}<br>Tel ${esc(i.company.phone)} · ${esc(i.company.email)}${i.company.taxNumber ? ' · Tax No. ' + esc(i.company.taxNumber) : ''}</div>
    </div>
    <div class="doc">
      <h1>Rental Agreement</h1>
      <div class="sub">${closed ? 'Check-out & check-in record' : onRent ? 'Check-out record' : 'Booking confirmation'}</div>
      <div class="no">No. <b>${esc(r.bookingId)}</b></div>
      <div class="pill ${status[1]}">${status[0]}</div>
    </div>
  </div>

  ${closed ? `<div class="band">
    <div><span>Returned</span><b>${returnedAt ? when(returnedAt.toISOString()) : '—'}</b></div>
    <div><span>Rental</span><b>${i.rentalDays} day${i.rentalDays === 1 ? '' : 's'}</b></div>
    <div><span>Distance</span><b>${kmDriven != null ? km(kmDriven) : '—'}</b></div>
    <div class="${lateHours > 2 ? 'warn' : ''}"><span>On time</span><b>${lateHours > 2 ? `${lateHours.toFixed(1)} h late` : 'Yes'}</b></div>
    <div class="${rc ? 'warn' : ''}"><span>Charges at return</span><b>${rc ? esc(formatMoney(chargesTotal(rc.items), rc.currency)) : 'None'}</b></div>
  </div>` : ''}

  <div class="g3">
    <div class="card"><h2>Renter</h2><div class="name">${esc(r.personName)}</div>
      <div class="kv"><span>Phone</span><span>${esc(r.contactNumber || '—')}</span></div>
      <div class="kv"><span>Email</span><span>${esc(r.customerEmail || '—')}</span></div>
      <div class="kv"><span>Booked via</span><span>${esc(r.source || '—')}</span></div></div>
    <div class="card"><h2>Vehicle</h2><div class="name">${esc(r.carModel || '—')}</div>
      <div class="kv"><span>Plate</span><span style="font-family:Consolas,monospace">${esc(r.licensePlate || '—')}</span></div>
      ${(r.carExchanges || []).length ? `<div class="kv"><span>Exchanged</span><span>${r.carExchanges!.length}×</span></div>` : ''}
      <div class="kv"><span>Deposit / excess</span><span>${usd(r.securityDeposit || 0)} / ${usd(r.excess || 0)}</span></div></div>
    <div class="card"><h2>Rental period</h2>
      <div class="kv"><span>Pick-up</span><span>${when(r.startDate)}</span></div>
      <div class="kv"><span>Return due</span><span>${when(r.endDate)}</span></div>
      <div class="kv"><span>Location</span><span>${esc(i.locationName || r.locationName || '—')}</span></div>
      ${(r.extensionHistory || []).length ? `<div class="kv"><span>Extended</span><span>+${r.extensionHistory!.reduce((s, e) => s + e.days, 0)} days</span></div>` : ''}</div>
  </div>

  <div class="card" style="margin-top:7px"><h2>${closed ? 'Check-out vs check-in' : 'Condition at check-out'}</h2>
    <table class="cmp">
      <tr><th></th><th>Check-out</th>${closed ? '<th>Check-in</th><th class="num">Difference</th>' : ''}</tr>
      <tr><td>Date & time</td><td>${r.pickupDateTime ? when(r.pickupDateTime) : when(r.startDate)}</td>${closed ? `<td>${returnedAt ? when(returnedAt.toISOString()) : '—'}</td><td class="num ${lateHours > 2 ? 'diff-bad' : ''}">${lateHours > 2 ? `${lateHours.toFixed(1)} h late` : 'On time'}</td>` : ''}</tr>
      <tr><td>Odometer</td><td>${km(r.pickupKmOut)}</td>${closed ? `<td>${km(r.dropOffKmIn)}</td><td class="num">${kmDriven != null ? '+' + km(kmDriven) : '—'}</td>` : ''}</tr>
      <tr><td>Fuel</td><td>${fuel(r.pickupFuelLevel, '#0284c7')}</td>${closed ? `<td>${fuel(r.dropOffFuelLevel, fuelDiff != null && fuelDiff < 0 ? '#dc2626' : '#059669')}</td><td class="num ${fuelDiff != null && fuelDiff < 0 ? 'diff-bad' : 'diff-ok'}">${fuelDiff == null ? '—' : fuelDiff < 0 ? `${fuelDiff}/8 short` : fuelDiff > 0 ? `+${fuelDiff}/8` : 'Same level'}</td>` : ''}</tr>
      <tr><td>Checklist</td><td>${okOut} of ${i.checklistItems.length} items OK</td>${closed ? `<td>${okIn} of ${i.checklistItems.length} items OK</td><td class="num ${missingAtReturn.length ? 'diff-bad' : 'diff-ok'}">${missingAtReturn.length ? `${missingAtReturn.length} missing` : 'All present'}</td>` : ''}</tr>
      <tr><td>Damage marks</td><td>${pickupMarks.length} existing</td>${closed ? `<td>${returnMarks.length} new</td><td class="num ${returnMarks.length ? 'diff-bad' : 'diff-ok'}">${returnMarks.length ? `${returnMarks.length} new` : 'No new damage'}</td>` : ''}</tr>
      <tr><td>Staff</td><td>${esc(r.pickupAgentName || '—')}</td>${closed ? `<td>${esc(r.dropOffAgentName || '—')}</td><td></td>` : ''}</tr>
    </table>
  </div>

  <div class="g2w">
    <div class="card"><h2>Vehicle condition</h2>
      <div class="views">${(['front', 'back', 'left', 'right'] as CarView[]).map(diagram).join('')}</div>
      <div class="legend"><i style="border:1.5px solid #0284c7;background:#fff"></i>At check-out (${pickupMarks.length})${closed ? `<i style="background:#e11d48"></i>New at check-in (${returnMarks.length})` : ''}</div>
    </div>
    <div class="card"><h2>Inspection checklist</h2>
      <table>
        <tr><th>Item</th><th class="ctr">Out</th>${closed ? '<th class="ctr">In</th>' : ''}</tr>
        ${i.checklistItems.map(x => `<tr><td>${esc(x)}</td><td class="ctr">${tick(out[x])}</td>${closed ? `<td class="ctr">${tick(back[x], !!out[x])}</td>` : ''}</tr>`).join('')}
      </table>
    </div>
  </div>

  <div class="${rc ? 'g2' : ''}" style="${rc ? '' : 'margin-top:7px'}">
    <div class="card"><h2>Rental charges</h2>
      <table>
        <tr><td>Rental · ${i.rentalDays} day${i.rentalDays === 1 ? '' : 's'}</td><td class="num">${usd(i.baseRentalFee)}</td></tr>
        ${(r.extras || []).map(e => `<tr><td>${esc(e.name)}</td><td class="num">${e.isComplementary ? 'Included' : usd(e.dailyPrice * i.rentalDays)}</td></tr>`).join('')}
        <tr class="tot"><td>Total</td><td class="num">${usd(rentalTotal)}</td></tr>
      </table>
      <div class="settle info">${paymentLine}${r.unpaidExtensionAmount ? ` · ${usd(r.unpaidExtensionAmount)} extension due` : ''}</div>
    </div>
    ${rc ? `<div class="card"><h2>Charges at check-in · ${esc(rc.documentNumber || '')}</h2>
      <table>
        ${rc.items.map(it => `<tr><td>${esc(CHARGE_KIND_LABEL[it.kind])} — ${esc(it.description)}</td><td class="num">${esc(formatMoney(it.amount, rc.currency))}</td></tr>`).join('')}
        <tr class="tot"><td>Total</td><td class="num">${esc(formatMoney(chargesTotal(rc.items), rc.currency))}</td></tr>
      </table>
      <div class="settle ${rc.settlement === 'paid' ? 'paid' : 'claim'}">${rc.settlement === 'paid'
        ? `Paid${rc.paymentMethod ? ' by ' + esc(PAYMENT_METHOD_LABEL[rc.paymentMethod].toLowerCase()) : ''}${rc.paymentReference ? ` · ref ${esc(rc.paymentReference)}` : ''} — see invoice ${esc(rc.documentNumber || '')}`
        : `Payment due${rc.dueDate ? ' by ' + esc(new Date(rc.dueDate + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })) : ''} — see claim ${esc(rc.documentNumber || '')}`}</div>
    </div>` : ''}
  </div>

  ${photos.length ? `<div class="card" style="margin-top:7px"><h2>Photo evidence at check-in</h2><div class="photos">${photos.map(p => `<figure><img src="${esc(p.src)}"/><figcaption>${esc(p.cap)}</figcaption></figure>`).join('')}</div></div>` : ''}

  ${r.pickupNotes || r.dropOffNotes ? `<div class="g2">
    <div class="card"><h2>Check-out notes</h2><div class="notes">${esc(r.pickupNotes || '—')}</div></div>
    <div class="card"><h2>Check-in notes</h2><div class="notes">${esc(r.dropOffNotes || '—')}</div></div>
  </div>` : ''}

  <div class="card avoid" style="margin-top:7px"><h2>Declaration & signatures</h2>
    <p class="terms">${esc(PICKUP_TERMS)}${closed ? ' ' + esc(RETURN_TERMS) : ''}</p>
    <div class="sg">
      <div class="sgrp"><h3>Check-out</h3><div class="row">
        ${sig(r.pickupRenterSignature, 'Renter', r.personName, r.pickupDateTime ? when(r.pickupDateTime) : undefined)}
        ${sig(r.pickupAgentSignature, 'Company representative', r.pickupAgentName)}
      </div></div>
      <div class="sgrp"><h3>Check-in</h3><div class="row">
        ${closed ? sig(r.dropOffRenterSignature, 'Renter', r.personName, returnedAt ? when(returnedAt.toISOString()) : undefined) : sig(undefined, 'Renter', 'at return')}
        ${closed ? sig(r.dropOffAgentSignature, 'Company representative', r.dropOffAgentName) : sig(undefined, 'Company representative', 'at return')}
      </div></div>
    </div>
  </div>

  <div class="foot"><span>${esc(i.company.name)} · Agreement ${esc(r.bookingId)} · ${esc(i.locationAddress || i.locationName || r.locationName || '')}</span><span>Customer copy · issued ${new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
</body></html>`;
}
