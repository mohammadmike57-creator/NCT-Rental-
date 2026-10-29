import { CompanyDetails, Reservation } from '../types';
import { CHARGE_KIND_AR, CHARGE_KIND_LABEL, PAYMENT_METHOD_LABEL, chargesTotal, damageChargesTotal, damageCostByMark, formatMoney } from './returnChargesDoc';
import { arabicFontCss, VIEW_AR } from './agreementDoc';
import { INSPECTION_LABEL } from '../components/VehicleGraphics';
import { damageSeverityLabel, damageTypeLabel, DAMAGE_SEVERITY_AR, DAMAGE_TYPE_AR } from './damageMarks';
import { lateFeeOf } from './lateReturn';

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
/** English label with its Arabic translation beside it. */
const L = (en: string, ar: string) => `${en}<bdi class="ar">${ar}</bdi>`;
/** Card heading: English on the left, Arabic on the right. */
const H = (en: string, ar: string, style = '') => `<h2${style ? ` style="${style}"` : ''}><span>${en}</span><bdi class="ar h">${ar}</bdi></h2>`;
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
  const returnMarks = r.dropOffDamageMarkers || [];
  const newDamage = returnMarks.length;

  const extras = (r.extras || []).map(e => ({ label: e.name, amount: e.isComplementary ? 0 : e.dailyPrice * i.rentalDays, free: e.isComplementary }));
  const extensions = r.extensionHistory || [];
  const late = lateFeeOf(r) && !lateFeeOf(r)!.isWaived && lateFeeOf(r)!.status !== 'WAIVED' ? lateFeeOf(r) : undefined;
  const rentalTotal = i.baseRentalFee + extras.reduce((s, e) => s + e.amount, 0) + (late && late.status === 'APPLIED' ? late.amount : 0);
  const rentalDue = (r.unpaidExtensionAmount || 0) + (late && late.status === 'PENDING' ? late.amount : 0);
  const rc = r.returnCharges && r.returnCharges.items.length ? r.returnCharges : undefined;
  const rcTotal = rc ? chargesTotal(rc.items) : 0;
  const rcDue = rc && rc.settlement === 'claim' ? rcTotal : 0;
  const markCost = damageCostByMark(rc);
  const damageCost = damageChargesTotal(rc);
  // Damage charges not tied to a diagram mark are listed on their own below the marks.
  const looseDamage = rc ? rc.items.filter(it => it.kind === 'damage' && !(it.markerNumber && it.markerNumber <= returnMarks.length)) : [];
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
  ${arabicFontCss()}
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

  .ar { font-family: 'Plex Arabic', 'Noto Naskh Arabic', Tahoma, Arial, sans-serif; font-style: normal; direction: rtl; unicode-bidi: isolate; letter-spacing: 0 !important; text-transform: none !important; margin-left: 5px; font-weight: 600; color: #6b7280; font-size: 1.02em; }
  h2 { display: flex; align-items: baseline; gap: 8px; }
  h2 .ar.h { margin-left: auto; color: #475569; font-size: 8pt; font-weight: 700; }
  .doc .ar-title { font-family: 'Plex Arabic', Tahoma, Arial, sans-serif; direction: rtl; font-size: 14pt; font-weight: 700; line-height: 1.2; margin-top: 2px; letter-spacing: 0; color: #0f172a; }
  .facts span .ar { font-size: 6.8pt; color: #94a3b8; }
  .stamp .ar { color: inherit; margin-left: 5px; font-size: 7.6pt; }
  .balance .ar { color: inherit; opacity: .85; }
  .lead .ar-p { display: block; margin-top: 6px; direction: rtl; text-align: right; font-family: 'Plex Arabic', Tahoma, Arial, sans-serif; font-size: 9.2pt; color: #334155; }
  .dmgt { width: 100%; border-collapse: collapse; font-size: 8pt; }
  .dmgt th { text-align: left; font-size: 6.6pt; text-transform: uppercase; letter-spacing: .06em; color: #475569; border-bottom: 1px solid #0f172a; padding: 3px 4px; font-weight: 700; }
  .dmgt th .ar { display: block; margin-left: 0; font-size: 6.6pt; }
  .dmgt td { padding: 4px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .dmgt td .ar { font-weight: 400; color: #64748b; }
  .dmgt .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .dmgt td.cost { font-weight: 800; color: #b91c1c; }
  .dmgt td.dim { color: #94a3b8; }
  .dmgt tr.tot td { border-top: 1.5px solid #0f172a; border-bottom: 0; font-weight: 800; padding-top: 6px; }
  .dn { display: inline-block; width: 15px; height: 15px; line-height: 15px; border-radius: 50%; text-align: center; font-size: 7pt; font-weight: 700; background: #e11d48; color: #fff; }
  .sv.major { color: #b91c1c; } .sv.moderate { color: #b45309; } .sv.minor { color: #334155; }
  .k { font-weight: 700; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print { body { padding: 0; } .card, .avoid, figure, tr, .sgrp, .band, .balance, .lead, .facts, .totals, .note, .sum { break-inside: avoid; page-break-inside: avoid; } thead { display: table-header-group; } }
</style></head><body>
  <div class="accent"></div>
  <div class="top">
    <div>${i.logo ? `<img src="${i.logo}" alt="">` : `<b style="font-size:13pt">${esc(i.company.name)}</b>`}
      <div class="co"><b style="color:#0f172a">${esc(i.company.name)}</b>${i.company.subName ? ' · ' + esc(i.company.subName) : ''}<br>${esc(i.company.address)}<br>Tel ${esc(i.company.phone)} · ${esc(i.company.email)}${i.company.taxNumber ? ' · Tax No. ' + esc(i.company.taxNumber) : ''}</div>
    </div>
    <div class="doc">
      <h1>Rental Termination</h1>
      <div class="ar-title">إنهاء عقد الإيجار</div>
      <div class="sub">Agreement closure statement · <bdi class="ar">كشف إغلاق العقد</bdi></div>
      <div class="no">No. <b>${esc(terminationNumber(r.bookingId))}</b> · Agreement <b>${esc(r.bookingId)}</b></div>
      <div class="stamps"><span class="stamp term">TERMINATED<bdi class="ar">منتهي</bdi></span><span class="stamp ${settled ? 'ok' : 'due'}">${settled ? 'SETTLED<bdi class="ar">مسدد</bdi>' : 'BALANCE DUE<bdi class="ar">رصيد مستحق</bdi>'}</span></div>
    </div>
  </div>

  <div class="lead">This statement confirms that rental agreement <b>${esc(r.bookingId)}</b> between <b>${esc(i.company.name)}</b> and <b>${esc(r.personName)}</b>
    for the <b>${esc(r.carModel || 'vehicle')}</b>${r.licensePlate ? `, plate <b>${esc(r.licensePlate)}</b>` : ''}, was <b>terminated on ${when(returnedAt)}</b>
    ${i.locationName || r.locationName ? `at ${esc(i.locationName || r.locationName)}` : ''} when the vehicle and its keys were returned and inspected.
    ${settled ? 'All amounts under the agreement have been settled.' : 'The amounts shown as due below remain payable.'}
    <span class="ar-p">يؤكد هذا الكشف إنهاء عقد الإيجار رقم <bdi dir="ltr">${esc(r.bookingId)}</bdi> بتاريخ <bdi dir="ltr">${when(returnedAt)}</bdi> عند إرجاع المركبة ومفاتيحها وفحصها. ${settled ? 'تمت تسوية جميع المبالغ المستحقة بموجب العقد.' : 'المبالغ المبيّنة أدناه كمستحقة لا تزال واجبة الدفع.'}</span></div>

  <div class="facts">
    <div><span>${L('Picked up', 'الاستلام')}</span><b>${when(pickedUpAt)}</b></div>
    <div><span>${L('Returned', 'الإرجاع')}</span><b>${when(returnedAt)}</b></div>
    <div><span>${L('Rental days', 'أيام الإيجار')}</span><b>${i.rentalDays}${lateHours > 2 ? ` <small class="bad">· ${lateHours.toFixed(1)} h late</small>` : ''}</b></div>
    <div><span>${L('Distance', 'المسافة')}</span><b>${kmDriven != null ? kmDriven.toLocaleString('en-US') + ' km' : '—'}</b></div>
  </div>

  <div class="g2">
    <div class="card">${H('Final statement of account', 'الكشف النهائي للحساب')}
      <table>
        ${row(`Rental · ${i.rentalDays} day${i.rentalDays === 1 ? '' : 's'}`, usd(i.baseRentalFee))}
        ${extras.map(e => row(esc(e.label), e.free ? 'Included' : usd(e.amount))).join('')}
        ${extensions.map(x => row(`Extension · +${x.days} day${x.days === 1 ? '' : 's'} (${x.paymentMethod === 'payNow' ? 'paid' : 'pay on return'})`, 'incl.', 'sub')).join('')}
        ${late ? row(`Late return · ${late.hoursLate} h${late.status === 'PENDING' ? ' (pending)' : ''}`, usd(late.amount)) : ''}
        ${row('Rental total', usd(rentalTotal), 'tot')}
        ${row(i.prepaid ? `Prepaid via ${esc(r.source || 'partner')}` : r.authNumber ? `Paid${r.authNumber ? ` · auth ${esc(r.authNumber)}` : ''}` : 'Paid at the counter', i.prepaid || r.authNumber ? '✓' : '—', 'sub')}
        ${rentalDue > 0 ? row('Rental balance still due', usd(rentalDue), 'due') : row('Rental balance', usd(0), 'ok')}
      </table>
      ${rc ? `${H(`Damages &amp; return charges · ${esc(rc.documentNumber || '')}`, 'الأضرار ورسوم الإرجاع', 'margin-top:10px')}
      <table>
        ${rc.items.map(it => row(`<span class="k">${esc(CHARGE_KIND_LABEL[it.kind])}</span><bdi class="ar">${CHARGE_KIND_AR[it.kind]}</bdi>${it.markerNumber ? ` · mark #${it.markerNumber}` : ''}<br>${esc(it.description)}`, esc(formatMoney(it.amount, rc.currency)))).join('')}
        ${damageCost > 0 && damageCost !== rcTotal ? row(L('of which vehicle damage', 'منها أضرار المركبة'), esc(formatMoney(damageCost, rc.currency)), 'sub') : ''}
        ${row(L('Return charges total', 'إجمالي رسوم الإرجاع'), esc(formatMoney(rcTotal, rc.currency)), 'tot')}
        ${rc.settlement === 'paid'
          ? row(`Paid${rc.paymentMethod ? ' by ' + esc(PAYMENT_METHOD_LABEL[rc.paymentMethod].toLowerCase()) : ''}${rc.paymentReference ? ` · ${esc(rc.paymentReference)}` : ''}`, esc(formatMoney(0, rc.currency)), 'ok')
          : row(`Due${rc.dueDate ? ' by ' + day(new Date(rc.dueDate + 'T12:00:00')) : ''} — claim ${esc(rc.documentNumber || '')}`, esc(formatMoney(rcTotal, rc.currency)), 'due')}
      </table>` : ''}
    </div>
    <div>
      <div class="card">${H('Vehicle at return', 'المركبة عند الإرجاع')}
        <div class="kv"><span>${L('Odometer', 'العداد')}</span><span>${r.pickupKmOut != null ? r.pickupKmOut.toLocaleString('en-US') : '—'} → ${r.dropOffKmIn != null ? r.dropOffKmIn.toLocaleString('en-US') : '—'} km</span></div>
        <div class="kv"><span>${L('Fuel', 'الوقود')}</span><span class="${fuelDiff != null && fuelDiff < 0 ? 'bad' : ''}">${r.pickupFuelLevel ?? '—'}/8 → ${r.dropOffFuelLevel ?? '—'}/8${fuelDiff != null && fuelDiff < 0 ? ` (${fuelDiff}/8)` : ''}</span></div>
        <div class="kv"><span>${L('New damage', 'أضرار جديدة')}</span><span class="${newDamage ? 'bad' : 'good'}">${newDamage ? `${newDamage} mark${newDamage === 1 ? '' : 's'}` : 'None'}</span></div>
        ${damageCost > 0 ? `<div class="kv"><span>${L('Damage cost', 'تكلفة الأضرار')}</span><span class="bad">${esc(formatMoney(damageCost, rc!.currency))}</span></div>` : ''}
        <div class="kv"><span>${L('Equipment', 'التجهيزات')}</span><span class="${missing.length ? 'bad' : 'good'}">${missing.length ? `Missing: ${esc(missing.join(', '))}` : 'All present'}</span></div>
        <div class="kv"><span>${L('Received by', 'استلمها')}</span><span>${esc(r.dropOffAgentName || '—')}</span></div>
      </div>
      <div class="card" style="margin-top:10px">${H('Security deposit', 'مبلغ التأمين')}<p style="font-size:8.5pt">${depositLine}</p></div>
    </div>
  </div>

  ${newDamage || looseDamage.length ? `<div class="card avoid" style="margin-top:10px">${H('Damage found at return', 'الأضرار المكتشفة عند الإرجاع')}
    <table class="dmgt">
      <tr><th style="width:6%">${L('No.', 'رقم')}</th><th style="width:13%">${L('Side', 'الجهة')}</th><th style="width:14%">${L('Damage', 'الضرر')}</th><th style="width:17%">${L('Part / location', 'الجزء / الموقع')}</th><th style="width:11%">${L('Severity', 'الشدة')}</th><th>${L('Description', 'الوصف')}</th><th class="num" style="width:13%">${L('Cost', 'التكلفة')}</th></tr>
      ${returnMarks.map((m, n) => { const c = markCost.get(n + 1); return `<tr><td><span class="dn">${n + 1}</span></td><td>${esc(INSPECTION_LABEL[m.view])}<bdi class="ar">${VIEW_AR[m.view]}</bdi></td><td>${m.type ? `${esc(damageTypeLabel(m.type))}<bdi class="ar">${DAMAGE_TYPE_AR[m.type]}</bdi>` : '—'}</td><td>${esc(m.part || '—')}${m.size ? ` · ${esc(m.size)}` : ''}</td><td>${m.severity ? `<b class="sv ${m.severity}">${esc(damageSeverityLabel(m.severity))}</b><bdi class="ar">${DAMAGE_SEVERITY_AR[m.severity]}</bdi>` : '—'}</td><td>${esc(m.note || '')}</td>${c != null ? `<td class="num cost">${esc(formatMoney(c, rc!.currency))}</td>` : `<td class="num dim">${L('Not charged', 'غير محتسب')}</td>`}</tr>`; }).join('')}
      ${looseDamage.map(it => `<tr><td>—</td><td>${it.view ? esc(INSPECTION_LABEL[it.view]) : '—'}</td><td>${L('Vehicle damage', 'أضرار المركبة')}</td><td>—</td><td>—</td><td>${esc(it.description)}</td><td class="num cost">${esc(formatMoney(it.amount, rc!.currency))}</td></tr>`).join('')}
      ${damageCost > 0 ? `<tr class="tot"><td colspan="6">${L('Total damage cost', 'إجمالي تكلفة الأضرار')}${rc!.settlement === 'paid' ? ' · paid' : ' · due'}</td><td class="num">${esc(formatMoney(damageCost, rc!.currency))}</td></tr>` : ''}
    </table>
  </div>` : ''}

  <div class="balance">
    <div><div class="l">${settled ? L('Account status', 'حالة الحساب') : L('Amount still payable', 'المبلغ المستحق')}</div><div class="t">${settled ? 'Nothing further is due under this agreement' : [rentalDue > 0 ? 'Rental balance' : '', rcDue > 0 ? `Claim ${rc!.documentNumber || ''}` : ''].filter(Boolean).join(' + ')}</div></div>
    <div class="v">${settled ? usd(0) : [rentalDue > 0 ? usd(rentalDue) : '', rcDue > 0 ? esc(formatMoney(rcDue, rc!.currency)) : ''].filter(Boolean).join(' + ')}</div>
  </div>

  <div class="notes">
    <div class="card">${H('Please note', 'يرجى الملاحظة')}<p>Traffic violations, tolls and parking fines incurred between ${day(pickedUpAt)} and ${day(returnedAt)} remain the renter's responsibility, including any notified to us after this date. They will be passed on with the official notice.</p></div>
    <div class="card">${H('Questions', 'استفسارات')}<p>Contact us on ${esc(i.company.phone)} or ${esc(i.company.email)} quoting ${esc(terminationNumber(r.bookingId))}. Please keep this statement together with your final rental agreement.</p></div>
  </div>

  <div class="sig avoid">
    <div><div class="si">${r.dropOffRenterSignature ? `<img src="${esc(r.dropOffRenterSignature)}"/>` : ''}</div><div class="sl">${esc(r.personName)} — ${L('Renter', 'المستأجر')}</div><div class="sm">Signed at return · ${when(returnedAt)}</div></div>
    <div><div class="si">${r.dropOffAgentSignature ? `<img src="${esc(r.dropOffAgentSignature)}"/>` : ''}</div><div class="sl">${esc(r.dropOffAgentName || 'Company representative')} — for ${esc(i.company.name)}</div><div class="sm">Vehicle received and agreement closed</div></div>
  </div>

  <div class="foot"><span>${esc(i.company.name)} · ${esc(terminationNumber(r.bookingId))}</span><span>Customer copy · issued ${new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
</body></html>`;
}
