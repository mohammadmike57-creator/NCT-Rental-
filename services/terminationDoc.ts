import { CompanyDetails, Reservation } from '../types';
import { CHARGE_KIND_LABEL, PAYMENT_METHOD_LABEL, chargesTotal, formatMoney } from './returnChargesDoc';

export interface TerminationDocInput {
  reservation: Reservation;
  company: CompanyDetails;
  logo?: string;
  rentalDays: number;
  baseRentalFee: number;
  checklistItems: string[];
  locationName?: string;
  prepaid?: boolean;
}

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const usd = (n: number) => esc(formatMoney(n, 'USD'));
// Check-in/out times are stored as display strings such as "October 16, 2026 at 09:00 AM".
const parse = (s?: string) => { if (!s) return null; const d = new Date(s.replace(' at ', ' ')); return Number.isNaN(d.getTime()) ? null : d; };
const when = (d: Date | null) => (d ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const day = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export const terminationNumber = (bookingId: string) => `TRM-${(bookingId || 'X').replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`;
export const terminationFileName = (bookingId: string) => `Rental-Termination-${(bookingId || 'X').replace(/[^A-Za-z0-9-]/g, '')}.pdf`;

/**
 * Rental termination statement: the customer's confirmation that the agreement has ended,
 * with the final statement of account, the security deposit position and anything still due.
 */
export function buildTerminationHtml(i: TerminationDocInput): string {
  const r = i.reservation;
  const returnedAt = parse(r.dropOffDateTime) || parse(r.agreementEmails?.find(e => e.kind === 'checkin')?.sentAt) || new Date();
  const pickedUpAt = parse(r.pickupDateTime) || parse(r.startDate);
  const dueAt = parse(r.endDate);
  const lateHours = dueAt ? (returnedAt.getTime() - dueAt.getTime()) / 3600000 : 0;
  const kmDriven = r.dropOffKmIn != null && r.pickupKmOut != null && r.dropOffKmIn >= r.pickupKmOut ? r.dropOffKmIn - r.pickupKmOut : null;
  const fuelDiff = r.dropOffFuelLevel != null && r.pickupFuelLevel != null ? r.dropOffFuelLevel - r.pickupFuelLevel : null;
  const missing = i.checklistItems.filter(x => r.pickupChecklist?.[x] && !r.dropOffChecklist?.[x]);
  const newDamage = (r.dropOffDamageMarkers || []).length;

  const extras = (r.extras || []).map(e => ({ label: e.name, amount: e.isComplementary ? 0 : e.dailyPrice * i.rentalDays, free: e.isComplementary }));
  const extensions = r.extensionHistory || [];
  const late = r.lateReturnFee && !r.lateReturnFee.isWaived && r.lateReturnFee.status !== 'WAIVED' ? r.lateReturnFee : undefined;
  const rentalTotal = i.baseRentalFee + extras.reduce((s, e) => s + e.amount, 0) + (late && late.status === 'APPLIED' ? late.amount : 0);
  const rentalDue = (r.unpaidExtensionAmount || 0) + (late && late.status === 'PENDING' ? late.amount : 0);
  const rc = r.returnCharges && r.returnCharges.items.length ? r.returnCharges : undefined;
  const rcTotal = rc ? chargesTotal(rc.items) : 0;
  const rcDue = rc && rc.settlement === 'claim' ? rcTotal : 0;
  const settled = rentalDue <= 0 && rcDue <= 0;
  const deposit = r.securityDeposit || 0;
  const depositLine = deposit <= 0
    ? 'No security deposit was held for this rental.'
    : rcDue > 0
      ? `The security deposit of ${usd(deposit)} is held until claim ${esc(rc!.documentNumber || '')} is settled.`
      : rc && rc.paymentMethod === 'deposit'
        ? `Return charges were deducted from the security deposit of ${usd(deposit)}; any remaining balance is released.`
        : `The security deposit of ${usd(deposit)} is released in full.`;

  const row = (label: string, value: string, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="num">${value}</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rental Termination ${esc(r.bookingId)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Inter, Arial, sans-serif; color: #0f172a; font-size: 9pt; line-height: 1.45; padding: 4px; }
  .accent { height: 4px; background: linear-gradient(90deg, #0f172a, #334155 60%, #f97316); border-radius: 3px; margin-bottom: 14px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .top img { height: 28px; }
  .co { font-size: 7.6pt; color: #475569; margin-top: 4px; line-height: 1.45; }
  .doc { text-align: right; }
  .doc h1 { font-size: 19pt; letter-spacing: -0.02em; line-height: 1.05; }
  .doc .sub { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .14em; color: #64748b; margin-top: 3px; }
  .doc .no { margin-top: 6px; font-size: 8.5pt; } .doc .no b { font-family: Consolas, monospace; }
  .stamps { margin-top: 7px; display: flex; gap: 6px; justify-content: flex-end; }
  .stamp { display: inline-block; padding: 3px 10px; border-radius: 6px; font-size: 8pt; font-weight: 800; letter-spacing: .12em; border: 2px solid; }
  .stamp.term { color: #0f172a; border-color: #0f172a; }
  .stamp.ok { color: #047857; border-color: #047857; background: #ecfdf5; }
  .stamp.due { color: #b45309; border-color: #b45309; background: #fffbeb; }
  .lead { margin-top: 16px; padding: 12px 14px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0; font-size: 9.6pt; line-height: 1.6; }
  .lead b { color: #0f172a; }
  .facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin-top: 10px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
  .facts div { padding: 8px 11px; border-right: 1px solid #e2e8f0; }
  .facts div:last-child { border-right: 0; }
  .facts span { display: block; font-size: 6.8pt; text-transform: uppercase; letter-spacing: .1em; color: #64748b; font-weight: 700; }
  .facts b { font-size: 9.5pt; }
  .g2 { display: grid; grid-template-columns: 1.15fr 1fr; gap: 10px; margin-top: 10px; align-items: start; }
  .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 9px 12px; }
  h2 { font-size: 7.2pt; text-transform: uppercase; letter-spacing: .1em; color: #64748b; margin-bottom: 6px; font-weight: 700; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; }
  td { padding: 4px 0; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 600; padding-left: 10px; }
  tr.sub td { color: #64748b; font-size: 8pt; }
  tr.tot td { border-top: 1.5px solid #0f172a; border-bottom: 0; font-weight: 800; font-size: 10pt; padding-top: 6px; }
  tr.due td { color: #b45309; font-weight: 700; }
  tr.ok td { color: #047857; font-weight: 700; }
  .kv { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; border-bottom: 1px solid #f1f5f9; }
  .kv:last-child { border-bottom: 0; }
  .kv span:first-child { color: #64748b; } .kv span:last-child { font-weight: 600; text-align: right; }
  .bad { color: #b91c1c !important; } .good { color: #047857 !important; }
  .balance { margin-top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; border-radius: 10px; color: #fff; background: ${settled ? '#065f46' : '#92400e'}; }
  .balance .l { font-size: 7.2pt; text-transform: uppercase; letter-spacing: .12em; opacity: .8; }
  .balance .t { font-size: 11pt; font-weight: 700; margin-top: 2px; }
  .balance .v { font-size: 17pt; font-weight: 800; text-align: right; white-space: nowrap; }
  .notes { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .notes p { font-size: 8pt; color: #334155; }
  .sig { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 12px; }
  .si { height: 40px; display: flex; align-items: flex-end; }
  .si img { max-height: 40px; max-width: 70%; }
  .sl { border-top: 1px solid #0f172a; padding-top: 3px; font-size: 7.8pt; font-weight: 700; }
  .sm { font-size: 7pt; color: #64748b; }
  .foot { margin-top: 14px; padding-top: 6px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 7pt; color: #64748b; }
</style></head><body>
  <div class="accent"></div>
  <div class="top">
    <div>${i.logo ? `<img src="${i.logo}" alt="">` : `<b style="font-size:13pt">${esc(i.company.name)}</b>`}
      <div class="co"><b style="color:#0f172a">${esc(i.company.name)}</b>${i.company.subName ? ' · ' + esc(i.company.subName) : ''}<br>${esc(i.company.address)}<br>Tel ${esc(i.company.phone)} · ${esc(i.company.email)}${i.company.taxNumber ? ' · Tax No. ' + esc(i.company.taxNumber) : ''}</div>
    </div>
    <div class="doc">
      <h1>Rental Termination</h1>
      <div class="sub">Agreement closure statement</div>
      <div class="no">No. <b>${esc(terminationNumber(r.bookingId))}</b> · Agreement <b>${esc(r.bookingId)}</b></div>
      <div class="stamps"><span class="stamp term">TERMINATED</span><span class="stamp ${settled ? 'ok' : 'due'}">${settled ? 'SETTLED' : 'BALANCE DUE'}</span></div>
    </div>
  </div>

  <div class="lead">This statement confirms that rental agreement <b>${esc(r.bookingId)}</b> between <b>${esc(i.company.name)}</b> and <b>${esc(r.personName)}</b>
    for the <b>${esc(r.carModel || 'vehicle')}</b>${r.licensePlate ? `, plate <b>${esc(r.licensePlate)}</b>` : ''}, was <b>terminated on ${when(returnedAt)}</b>
    ${i.locationName || r.locationName ? `at ${esc(i.locationName || r.locationName)}` : ''} when the vehicle and its keys were returned and inspected.
    ${settled ? 'All amounts under the agreement have been settled.' : 'The amounts shown as due below remain payable.'}</div>

  <div class="facts">
    <div><span>Picked up</span><b>${when(pickedUpAt)}</b></div>
    <div><span>Returned</span><b>${when(returnedAt)}</b></div>
    <div><span>Rental days</span><b>${i.rentalDays}${lateHours > 2 ? ` <small class="bad">· ${lateHours.toFixed(1)} h late</small>` : ''}</b></div>
    <div><span>Distance</span><b>${kmDriven != null ? kmDriven.toLocaleString('en-US') + ' km' : '—'}</b></div>
  </div>

  <div class="g2">
    <div class="card"><h2>Final statement of account</h2>
      <table>
        ${row(`Rental · ${i.rentalDays} day${i.rentalDays === 1 ? '' : 's'}`, usd(i.baseRentalFee))}
        ${extras.map(e => row(esc(e.label), e.free ? 'Included' : usd(e.amount))).join('')}
        ${extensions.map(x => row(`Extension · +${x.days} day${x.days === 1 ? '' : 's'} (${x.paymentMethod === 'payNow' ? 'paid' : 'pay on return'})`, 'incl.', 'sub')).join('')}
        ${late ? row(`Late return · ${late.hoursLate} h${late.status === 'PENDING' ? ' (pending)' : ''}`, usd(late.amount)) : ''}
        ${row('Rental total', usd(rentalTotal), 'tot')}
        ${row(i.prepaid ? `Prepaid via ${esc(r.source || 'partner')}` : r.authNumber ? `Paid${r.authNumber ? ` · auth ${esc(r.authNumber)}` : ''}` : 'Paid at the counter', i.prepaid || r.authNumber ? '✓' : '—', 'sub')}
        ${rentalDue > 0 ? row('Rental balance still due', usd(rentalDue), 'due') : row('Rental balance', usd(0), 'ok')}
      </table>
      ${rc ? `<h2 style="margin-top:10px">Charges at return · ${esc(rc.documentNumber || '')}</h2>
      <table>
        ${rc.items.map(it => row(`${esc(CHARGE_KIND_LABEL[it.kind])} — ${esc(it.description)}`, esc(formatMoney(it.amount, rc.currency)))).join('')}
        ${row('Charges total', esc(formatMoney(rcTotal, rc.currency)), 'tot')}
        ${rc.settlement === 'paid'
          ? row(`Paid${rc.paymentMethod ? ' by ' + esc(PAYMENT_METHOD_LABEL[rc.paymentMethod].toLowerCase()) : ''}${rc.paymentReference ? ` · ${esc(rc.paymentReference)}` : ''}`, esc(formatMoney(0, rc.currency)), 'ok')
          : row(`Due${rc.dueDate ? ' by ' + day(new Date(rc.dueDate + 'T12:00:00')) : ''} — claim ${esc(rc.documentNumber || '')}`, esc(formatMoney(rcTotal, rc.currency)), 'due')}
      </table>` : ''}
    </div>
    <div>
      <div class="card"><h2>Vehicle at return</h2>
        <div class="kv"><span>Odometer</span><span>${r.pickupKmOut != null ? r.pickupKmOut.toLocaleString('en-US') : '—'} → ${r.dropOffKmIn != null ? r.dropOffKmIn.toLocaleString('en-US') : '—'} km</span></div>
        <div class="kv"><span>Fuel</span><span class="${fuelDiff != null && fuelDiff < 0 ? 'bad' : ''}">${r.pickupFuelLevel ?? '—'}/8 → ${r.dropOffFuelLevel ?? '—'}/8${fuelDiff != null && fuelDiff < 0 ? ` (${fuelDiff}/8)` : ''}</span></div>
        <div class="kv"><span>New damage</span><span class="${newDamage ? 'bad' : 'good'}">${newDamage ? `${newDamage} mark${newDamage === 1 ? '' : 's'}` : 'None'}</span></div>
        <div class="kv"><span>Equipment</span><span class="${missing.length ? 'bad' : 'good'}">${missing.length ? `Missing: ${esc(missing.join(', '))}` : 'All present'}</span></div>
        <div class="kv"><span>Received by</span><span>${esc(r.dropOffAgentName || '—')}</span></div>
      </div>
      <div class="card" style="margin-top:10px"><h2>Security deposit</h2><p style="font-size:8.5pt">${depositLine}</p></div>
    </div>
  </div>

  <div class="balance">
    <div><div class="l">${settled ? 'Account status' : 'Amount still payable'}</div><div class="t">${settled ? 'Nothing further is due under this agreement' : [rentalDue > 0 ? 'Rental balance' : '', rcDue > 0 ? `Claim ${rc!.documentNumber || ''}` : ''].filter(Boolean).join(' + ')}</div></div>
    <div class="v">${settled ? usd(0) : [rentalDue > 0 ? usd(rentalDue) : '', rcDue > 0 ? esc(formatMoney(rcDue, rc!.currency)) : ''].filter(Boolean).join(' + ')}</div>
  </div>

  <div class="notes">
    <div class="card"><h2>Please note</h2><p>Traffic violations, tolls and parking fines incurred between ${day(pickedUpAt)} and ${day(returnedAt)} remain the renter's responsibility, including any notified to us after this date. They will be passed on with the official notice.</p></div>
    <div class="card"><h2>Questions</h2><p>Contact us on ${esc(i.company.phone)} or ${esc(i.company.email)} quoting ${esc(terminationNumber(r.bookingId))}. Please keep this statement together with your final rental agreement.</p></div>
  </div>

  <div class="sig avoid">
    <div><div class="si">${r.dropOffRenterSignature ? `<img src="${esc(r.dropOffRenterSignature)}"/>` : ''}</div><div class="sl">${esc(r.personName)} — Renter</div><div class="sm">Signed at return · ${when(returnedAt)}</div></div>
    <div><div class="si">${r.dropOffAgentSignature ? `<img src="${esc(r.dropOffAgentSignature)}"/>` : ''}</div><div class="sl">${esc(r.dropOffAgentName || 'Company representative')} — for ${esc(i.company.name)}</div><div class="sm">Vehicle received and agreement closed</div></div>
  </div>

  <div class="foot"><span>${esc(i.company.name)} · ${esc(terminationNumber(r.bookingId))}</span><span>Customer copy · issued ${new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
</body></html>`;
}
