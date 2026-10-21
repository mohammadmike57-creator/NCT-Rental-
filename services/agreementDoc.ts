import { CarView, CompanyDetails, DamageMarker, Reservation } from '../types';
import { damageSeverityLabel, damageTypeLabel, DAMAGE_TYPE_AR, DAMAGE_SEVERITY_AR } from './damageMarks';
import { INSPECTION_LABEL, INSPECTION_SVG } from '../components/VehicleGraphics';
import { CHARGE_KIND_LABEL, PAYMENT_METHOD_LABEL, chargesTotal, formatMoney } from './returnChargesDoc';
import { parseTerms, parseTermsAr } from './agreementTerms';
import { code39Svg } from './barcode';

export const PICKUP_TERMS = "By signing, the Renter acknowledges receipt of the vehicle in the condition documented above and agrees to the rental terms and conditions. The Renter accepts financial responsibility for all charges, traffic violations, damages and losses during the rental period. The Company Representative confirms the vehicle's condition and rental details are accurate at pickup.";
export const PICKUP_TERMS_AR = 'بتوقيعه، يقرّ المستأجر باستلام المركبة بالحالة الموثقة أعلاه ويوافق على شروط وأحكام التأجير، ويتحمّل المسؤولية المالية عن جميع الرسوم والمخالفات المرورية والأضرار والخسائر خلال فترة الإيجار. ويؤكد ممثل الشركة صحة حالة المركبة وبيانات الإيجار عند التسليم.';
export const RETURN_TERMS_AR = 'بتوقيعه، يؤكد المستأجر إرجاع المركبة، وقد تمت مراجعة حالتها النهائية وأي رسوم إضافية (مثل نقص الوقود أو الأضرار الجديدة) والموافقة عليها. ويؤكد ممثل الشركة استلام المركبة وصحة فحص الإرجاع.';
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
  /** Photo of the actual car (URL or data URL), shown in the vehicle and inspection sections. */
  vehiclePhoto?: string;
}

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const usd = (n: number) => esc(formatMoney(n, 'USD'));
// Check-in/out times are stored as display strings such as "October 16, 2026 at 09:00 AM".
const parse = (s?: string) => { if (!s) return null; const d = new Date(s.replace(' at ', ' ')); return Number.isNaN(d.getTime()) ? null : d; };
const when = (s?: string) => { const d = parse(s); return d ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : esc(s || '—'); };
const km = (n?: number) => (n == null ? '—' : `${n.toLocaleString('en-US')} km`);
const day = (s?: string) => { if (!s) return '—'; const d = new Date(s.length === 10 ? s + 'T12:00:00' : s); return Number.isNaN(d.getTime()) ? esc(s) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); };
const ID_TYPE: Record<string, string> = { passport: 'Passport', national_id: 'National ID', residence: 'Residence permit' };
const ID_TYPE_AR: Record<string, string> = { passport: 'جواز السفر', national_id: 'الهوية الوطنية', residence: 'الإقامة' };
const VIEW_AR: Record<CarView, string> = { front: 'الأمام', back: 'الخلف', left: 'جهة السائق', right: 'جهة الراكب' };
/** English label with its Arabic translation beside it. */
const L = (en: string, ar: string) => `${en}<bdi class="ar">${ar}</bdi>`;
/** Section header bar: number and English title on the left, Arabic title on the right. */
const H = (n: string, en: string, ar: string) => `<h2>${n ? `<span class="n">${n}</span>` : ''}<span class="en">${en}</span><bdi class="ar h">${ar}</bdi></h2>`;
/** The Arabic font ships with the app (public/fonts) so PDFs and prints never depend on a font service. */
const fontBase = () => (typeof window !== 'undefined' && window.location ? window.location.origin : '');
const arabicFontCss = () => [400, 600, 700].map(w => `@font-face { font-family: 'Plex Arabic'; font-weight: ${w}; font-style: normal; src: url('${fontBase()}/fonts/plex-arabic-${w}.woff2') format('woff2'); }`).join('\n');
const PAY_METHOD: Record<string, string> = { card: 'Card', cash: 'Cash', bank_transfer: 'Bank transfer', prepaid: 'Prepaid by partner' };
/** Products the renter bought that reduce their liability (named like insurance / CDW / protection). */
const isProtection = (name: string) => /insur|cdw|scdw|waiver|protect|cover|liabil/i.test(name);

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
    return `<div class="view"><svg viewBox="0 -12 100 84">${INSPECTION_SVG[view]}${dots(pickupMarks, '#0284c7', false)}${closed || returnMarks.length ? dots(returnMarks, '#e11d48', true) : ''}</svg><div class="vl">${L(INSPECTION_LABEL[view], VIEW_AR[view])}</div></div>`;
  };
  const damageRows = [
    ...pickupMarks.map((m, n) => ({ m, n, kind: 'out' as const })),
    ...(closed || returnMarks.length ? returnMarks.map((m, n) => ({ m, n, kind: 'in' as const })) : []),
  ];
  const damageRegister = damageRows.length ? `<table class="dmg">
      <tr><th style="width:7%">${L('No.', 'رقم')}</th><th style="width:11%">${L('View', 'الجهة')}</th><th style="width:13%">${L('Damage', 'الضرر')}</th><th style="width:19%">${L('Part / location', 'الجزء / الموقع')}</th><th style="width:11%">${L('Size', 'الحجم')}</th><th style="width:10%">${L('Severity', 'الشدة')}</th><th>${L('Description', 'الوصف')}</th></tr>
      ${damageRows.map(({ m, n, kind }) => `<tr><td><span class="dn ${kind}">${n + 1}</span>${kind === 'in' ? '<span class="dk">NEW</span>' : ''}</td><td>${esc(INSPECTION_LABEL[m.view])}<bdi class="ar">${VIEW_AR[m.view]}</bdi></td><td>${m.type ? `${esc(damageTypeLabel(m.type))}<bdi class="ar">${DAMAGE_TYPE_AR[m.type]}</bdi>` : '—'}</td><td>${esc(m.part || '—')}</td><td>${esc(m.size || '—')}</td><td>${m.severity ? `<b class="sv ${m.severity}">${esc(damageSeverityLabel(m.severity))}</b><bdi class="ar">${DAMAGE_SEVERITY_AR[m.severity]}</bdi>` : '—'}</td><td>${esc(m.note || '')}</td></tr>`).join('')}
    </table>` : `<div class="nodmg">No damage recorded on the vehicle at check-out${closed ? ' or check-in' : ''}.<bdi class="ar">${closed ? 'لا توجد أضرار مسجّلة على المركبة عند التسليم أو الإرجاع.' : 'لا توجد أضرار مسجّلة على المركبة عند التسليم.'}</bdi></div>`;
  const sig = (img: string | undefined, role: string, name?: string, at?: string) => `
    <div class="sig"><div class="si">${img ? `<img src="${esc(img)}"/>` : ''}</div><div class="sl">${role}</div><div class="sm">${esc([name, at].filter(Boolean).join(' · ') || ' ')}</div></div>`;
  const tick = (v?: boolean, warn?: boolean) => (v ? '<span class="ok">✔</span>' : warn ? '<span class="bad">✕</span>' : '<span class="dim">—</span>');

  // Notes sit beside the rental charges when there is no charges-at-return card, to keep one page.
  const sideNotes = !rc && (closed ? !!(r.pickupNotes || r.dropOffNotes) : !!r.pickupNotes);
  const status = closed ? [L('Closed', 'مغلق'), 'closed'] : onRent ? [L('On rent', 'ساري'), 'open'] : [L('Booked', 'محجوز'), 'new'];
  const drv = r.driver || {};
  const extraDrivers = r.additionalDrivers || [];
  const licenceExpired = !!(drv.licenseExpiry && r.endDate && drv.licenseExpiry < r.endDate.slice(0, 10));
  const protection = (r.extras || []).filter(e => isProtection(e.name));
  const cardRef = r.cardNumber ? `•••• ${esc(String(r.cardNumber).replace(/\D/g, '').slice(-4))}` : '';
  const clauses = parseTerms(i.company.agreementTerms);
  const clausesAr = parseTermsAr(i.company.agreementTermsAr);
  const paymentLine = i.prepaid
    ? `Prepaid via ${esc(r.source || 'partner')}`
    : r.authNumber ? `Paid${r.finalAmountCharged ? ' ' + usd(r.finalAmountCharged) : ''} · auth ${esc(r.authNumber)}` : 'Payable at the counter';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Rental Agreement ${esc(r.bookingId)}</title>
<style>
  ${arabicFontCss()}
  @page { size: A4; margin: 11mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, 'Segoe UI', Helvetica, Arial, sans-serif; color: #0f172a; font-size: 8.6pt; line-height: 1.4; padding: 6px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 8px; border-bottom: 2px solid #0f172a; }
  .top img { height: 28px; }
  .co { font-size: 7.6pt; color: #475569; margin-top: 4px; line-height: 1.45; }
  .doc { text-align: right; min-width: 235px; }
  .doc h1 { font-size: 15.5pt; letter-spacing: -0.01em; line-height: 1.05; font-weight: 700; }
  .doc .sub { font-size: 7pt; text-transform: uppercase; letter-spacing: .14em; color: #64748b; margin-top: 6px; }
  .ref { margin-top: 7px; margin-left: auto; border: 1px solid #cbd5e1; border-radius: 6px; border-collapse: separate; border-spacing: 0; width: 235px; overflow: hidden; }
  .ref td { padding: 2.5px 8px; border-bottom: 1px solid #e2e8f0; font-size: 7.6pt; }
  .ref tr:last-child td { border-bottom: 0; }
  .ref td:first-child { color: #64748b; text-align: left; background: #f8fafc; width: 42%; }
  .ref td:last-child { text-align: right; font-weight: 600; }
  .mono { font-family: Consolas, 'SF Mono', monospace; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 7.3pt; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
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
  .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; }
  h2 { font-size: 7pt; text-transform: uppercase; letter-spacing: .1em; color: #334155; margin-bottom: 5px; font-weight: 700; }
  h2 .n { color: #94a3b8; font-weight: 800; letter-spacing: 0; margin-right: 5px; }
  h2 .n::after { content: '.'; }
  .items th { background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  .items td { border-bottom: 1px solid #f1f5f9; }
  .items .sub td { color: #64748b; border-bottom: 0; padding-top: 2px; padding-bottom: 0; }
  .keyterms { margin-top: 6px; border: 1px solid #e2e8f0; border-left: 3px solid #0f172a; border-radius: 6px; padding: 6px 10px; }
  .keyterms ol { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 3px 16px; counter-reset: k; }
  .keyterms li { counter-increment: k; font-size: 7.3pt; color: #334155; padding-left: 14px; position: relative; line-height: 1.4; }
  .keyterms li::before { content: counter(k); position: absolute; left: 0; top: 0; font-weight: 800; color: #0f172a; }
  .keyterms b { color: #0f172a; }
  .name { font-size: 10.5pt; font-weight: 700; }
  .kv { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
  .kv span:first-child { color: #64748b; } .kv span:last-child { font-weight: 600; text-align: right; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; }
  td, th { padding: 2.5px 4px; border-bottom: 1px solid #f1f5f9; text-align: left; vertical-align: middle; }
  th { font-size: 6.8pt; text-transform: uppercase; letter-spacing: .07em; color: #64748b; font-weight: 700; }
  .cmp th { background: #f8fafc; }
  .cmp td, .cl td { padding-top: 1px; }
  .cgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 14px; }
  .cgrid > div > span { display: block; font-size: 6.8pt; color: #64748b; text-transform: uppercase; letter-spacing: .08em; }
  .cgrid b { font-size: 9pt; }
  .cmp td:first-child { color: #64748b; width: 23%; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ctr { text-align: center; }
  .gauge { display: inline-flex; gap: 1.5px; margin-right: 5px; vertical-align: middle; }
  .gauge i { width: 7px; height: 9px; border-radius: 1.5px; display: inline-block; }
  .diff-bad { color: #b91c1c; font-weight: 700; } .diff-ok { color: #047857; font-weight: 700; }
  .ok { color: #059669; font-weight: 800; } .bad { color: #dc2626; font-weight: 800; } .dim { color: #cbd5e1; }
  .views { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
  .dmg { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 7.4pt; }
  .dmg th { text-align: left; font-size: 6.6pt; text-transform: uppercase; letter-spacing: .06em; color: #475569; border-bottom: 1px solid #0f172a; padding: 2px 4px; }
  .dmg td { border-bottom: 1px solid #e2e8f0; padding: 2px 4px; vertical-align: top; }
  .dmg .dn { display: inline-block; width: 13px; height: 13px; line-height: 11px; border-radius: 50%; text-align: center; font-size: 6.6pt; font-weight: 700; }
  .dmg .dn.out { border: 1.2px solid #0284c7; color: #0284c7; }
  .dmg .dn.in { background: #e11d48; color: #fff; border: 1.2px solid #e11d48; }
  .dmg .dk { font-size: 5.8pt; font-weight: 800; color: #e11d48; margin-left: 3px; letter-spacing: .04em; }
  .dmg .sv.major { color: #b91c1c; } .dmg .sv.moderate { color: #b45309; } .dmg .sv.minor { color: #334155; }
  .nodmg { margin-top: 5px; font-size: 7.4pt; color: #475569; border: 1px dashed #cbd5e1; padding: 3px 6px; }
  .views4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .views5 { display: grid; grid-template-columns: 1.35fr repeat(4, 1fr); gap: 6px; }
  .view.photo { overflow: hidden; display: flex; flex-direction: column; }
  .view.photo img { width: 100%; height: 62px; object-fit: cover; display: block; flex: 1; }
  .vhead { display: flex; align-items: center; gap: 7px; margin-bottom: 2px; }
  .vthumb { width: 58px; height: 38px; object-fit: cover; border: 1px solid #d1d5db; flex-shrink: 0; }
  .chips { margin-top: 5px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px 12px; }
  .chips span { display: flex; align-items: center; gap: 4px; font-size: 7.6pt; padding: 1px 0; border-bottom: 1px dashed #eef2f6; }
  .chips em { font-style: normal; color: #334155; margin-left: 2px; }
  .view { border: 1px solid #eef2f6; border-radius: 6px; text-align: center; background: #fcfdfe; }
  .view svg { width: 100%; height: 62px; display: block; }
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
  .nl + .nl { margin-top: 5px; } .nl span { display: block; font-size: 6.6pt; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; }
  .sgrp.next p { font-size: 7.4pt; color: #475569; margin-top: 3px; } .sgrp.next .due { color: #0f172a; }
  .si { height: 34px; display: flex; align-items: flex-end; justify-content: center; }
  .si img { max-height: 34px; max-width: 100%; }
  .sl { border-top: 1px solid #0f172a; padding-top: 2px; font-size: 7.2pt; font-weight: 700; text-align: center; }
  .sm { font-size: 6.6pt; color: #64748b; text-align: center; min-height: 9px; }
  .foot { margin-top: 8px; padding-top: 5px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; gap: 12px; font-size: 6.6pt; color: #64748b; }

  .bc { margin-top: 6px; text-align: right; }
  .bc svg { height: 26px; width: 200px; display: inline-block; }
  .bc div { font-family: Consolas, monospace; font-size: 6.6pt; letter-spacing: .2em; color: #475569; margin-top: 1px; }
  .g2a { display: grid; grid-template-columns: 1.65fr 1fr; gap: 7px; margin-top: 8px; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
  .drv { padding: 2px 0; border-bottom: 1px dashed #e2e8f0; display: flex; justify-content: space-between; gap: 8px; }
  .drv:last-child { border-bottom: 0; }
  .drv b { font-weight: 600; } .drv span { color: #64748b; }
  .missing { color: #b45309 !important; font-weight: 600; }
  .terms-page { font-size: 7pt; line-height: 1.42; color: #1e293b; }
  .terms-head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 9px; }
  .terms-head h1 { font-size: 13pt; font-weight: 700; }
  .terms-head .meta { text-align: right; font-size: 7.4pt; color: #475569; }
  .tcols { column-count: 2; column-gap: 18px; }
  .clause { break-inside: avoid; margin-bottom: 6px; text-align: justify; }
  .clause h4 { font-size: 7.4pt; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #0f172a; margin-bottom: 1px; }
  .clause h4 span { color: #94a3b8; margin-right: 4px; }
  .ack { margin-top: 10px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 14px; align-items: end; }
  .ack p { font-size: 7.2pt; color: #334155; }
  .pdf-page + .pdf-page { break-before: page; page-break-before: always; }

  /* ---- Formal contract styling: square ruled boxes, black header bars, monochrome ---- */
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; }
  .top { border-bottom: 3px solid #111827; }
  .doc h1 { font-size: 16pt; font-weight: 800; letter-spacing: .01em; text-transform: uppercase; }
  .doc .sub { color: #374151; letter-spacing: .18em; }
  .ref { border: 1px solid #111827; border-radius: 0; }
  .ref td { border-bottom: 1px solid #d1d5db; }
  .ref td:first-child { background: #f3f4f6; color: #374151; text-transform: uppercase; font-size: 6.6pt; letter-spacing: .08em; }
  .pill { border-radius: 0; letter-spacing: .14em; }
  .pill.open, .pill.new { background: #fff; color: #111827; border: 1px solid #111827; }
  .pill.closed { background: #111827; color: #fff; }
  .band { border-radius: 0; background: #111827; }
  .band div { border-right-color: #374151; }
  .card { border: 1px solid #111827; border-radius: 0; padding: 0 9px 6px; }
  .card h2 { margin: 0 -9px 6px; padding: 3.5px 9px; background: #111827; color: #fff; font-size: 6.8pt; letter-spacing: .14em; }
  .card h2 .n { color: #9ca3af; }
  .g3, .g2, .g2w, .g2a { gap: 6px; }
  .name { font-size: 10pt; font-weight: 800; letter-spacing: -.005em; }
  .kv, .drv { border-bottom: 1px solid #e5e7eb; padding: 2px 0; }
  .kv:last-child, .drv:last-child { border-bottom: 0; }
  .kv span:first-child, .drv span { color: #4b5563; font-size: 7.4pt; text-transform: uppercase; letter-spacing: .04em; }
  .drv b, .kv span:last-child { font-weight: 700; color: #111827; }
  .missing { color: #92400e !important; }
  th { color: #374151; }
  .cmp th, .items th { background: #f3f4f6; border-bottom: 1px solid #111827; }
  .cmp td:first-child { color: #374151; text-transform: uppercase; font-size: 7pt; letter-spacing: .04em; }
  .diff-ok { color: #111827; } .diff-bad { color: #991b1b; }
  .ok { color: #111827; } .bad { color: #991b1b; }
  .gauge i { border-radius: 0; }
  .view { border: 1px solid #d1d5db; border-radius: 0; background: #fff; }
  .chips span { border-bottom: 1px solid #e5e7eb; }
  .tot td { border-top: 2px solid #111827; }
  .settle { border-radius: 0; border: 1px solid #d1d5db; background: #f9fafb !important; color: #111827 !important; }
  .sgrp { border: 1px solid #d1d5db; border-radius: 0; }
  .sgrp h3 { color: #111827; }
  .sl { border-top: 1px solid #111827; }
  .bc div { color: #111827; }
  .foot { border-top: 1px solid #111827; color: #374151; }
  .terms-head { border-bottom: 3px solid #111827; }
  .terms-head h1 { text-transform: uppercase; letter-spacing: .02em; font-weight: 800; }
  .clause h4 { color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 1px; margin-bottom: 2px; }
  .clause h4 span { color: #6b7280; }
  .ack { border: 1px solid #111827; border-radius: 0; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4; margin: 9mm; }
  /* ---- Bilingual (English / Arabic) ---- */
  .ar { font-family: 'Plex Arabic', 'Noto Naskh Arabic', Tahoma, Arial, sans-serif; font-style: normal; direction: rtl; unicode-bidi: isolate; letter-spacing: 0 !important; text-transform: none !important; margin-left: 5px; font-weight: 600; color: #6b7280; font-size: 1.04em; }
  .card h2 { display: flex; align-items: baseline; gap: 6px; }
  .kv span:first-child, .drv span, .ref td:first-child, .band span, .cmp td:first-child, .cgrid > div > span { white-space: nowrap; }
  .pill .ar { color: inherit; font-size: 7.6pt; margin-left: 6px; }
  .ref td:first-child { width: 48%; }
  .card h2 .ar.h { margin-left: auto; color: #fff; font-size: 8.2pt; font-weight: 700; }
  .doc .ar-title { font-family: 'Plex Arabic', Tahoma, Arial, sans-serif; direction: rtl; font-size: 15pt; font-weight: 700; line-height: 1.2; margin-top: 2px; letter-spacing: 0; }
  .band span .ar { color: #9ca3af; font-size: 7pt; }
  .kv span:first-child .ar, .drv span .ar, .cmp td:first-child .ar, .ref td:first-child .ar { font-size: 7.2pt; }
  th .ar { display: block; margin-left: 0; font-size: 6.8pt; }
  .dmg td .ar, .items td .ar { color: #4b5563; font-weight: 400; }
  .ardecl { direction: rtl; text-align: justify; font-family: 'Plex Arabic', Tahoma, Arial, sans-serif; font-size: 7.4pt; line-height: 1.6; color: #374151; margin-top: 3px; letter-spacing: 0; }
  .sl .ar, .sgrp h3 .ar { color: #374151; }
  .terms-bi { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
  .terms-bi > div + div { border-left: 1px solid #d1d5db; padding-left: 16px; }
  .terms-bi .rtl { direction: rtl; font-family: 'Plex Arabic', Tahoma, Arial, sans-serif; letter-spacing: 0; font-size: 7.4pt; line-height: 1.6; }
  .terms-bi .rtl .clause { text-align: justify; }
  .terms-bi .rtl .clause h4 { text-transform: none; letter-spacing: 0; font-size: 7.8pt; }
  .terms-bi .rtl .clause h4 span { margin-right: 0; margin-left: 4px; }
  .terms-bi .lang { font-size: 6.6pt; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: #6b7280; margin-bottom: 5px; }
  .terms-bi .rtl .lang { letter-spacing: 0; font-size: 7.4pt; }
  .terms-head h1 .ar { display: block; margin: 2px 0 0; color: #111827; font-size: 13pt; font-weight: 700; }
  @media print { body { padding: 0; zoom: 0.86; } .card, .avoid, figure, tr, .sgrp, .band, .balance, .lead, .facts, .totals, .note, .sum { break-inside: avoid; page-break-inside: avoid; } thead { display: table-header-group; } }
</style></head><body data-breaks="blocks">
<div class="pdf-page">
  <div class="top">
    <div>${i.logo ? `<img src="${i.logo}" alt="">` : `<div class="name">${esc(i.company.name)}</div>`}
      <div class="co"><b style="color:#0f172a">${esc(i.company.name)}</b>${i.company.subName ? ' · ' + esc(i.company.subName) : ''}<br>${esc(i.company.address)}<br>Tel ${esc(i.company.phone)} · ${esc(i.company.email)}${i.company.taxNumber ? ' · Tax No. ' + esc(i.company.taxNumber) : ''}</div>
    </div>
    <div class="doc">
      <h1>Vehicle Rental Agreement</h1>
      <div class="ar-title">عقد تأجير مركبة</div>
      <div class="sub">${closed ? 'Closed · check-out &amp; check-in record' : onRent ? 'Open · check-out record' : 'Booking confirmation'}</div>
      <table class="ref">
        <tr><td>${L('Agreement no.', 'رقم العقد')}</td><td class="mono">RA-${esc(r.bookingId)}</td></tr>
        <tr><td>${L('Issued', 'الإصدار')}</td><td>${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td></tr>
        <tr><td>${L('Status', 'الحالة')}</td><td><span class="pill ${status[1]}">${status[0]}</span></td></tr>
      </table>
      <div class="bc">${code39Svg('RA-' + (r.bookingId || ''))}<div>RA-${esc(r.bookingId)}</div></div>
    </div>
  </div>

  ${closed ? `<div class="band">
    <div><span>${L('Returned', 'تاريخ الإرجاع')}</span><b>${returnedAt ? when(returnedAt.toISOString()) : '—'}</b></div>
    <div><span>${L('Rental', 'مدة الإيجار')}</span><b>${i.rentalDays} day${i.rentalDays === 1 ? '' : 's'}</b></div>
    <div><span>${L('Distance', 'المسافة')}</span><b>${kmDriven != null ? km(kmDriven) : '—'}</b></div>
    <div class="${lateHours > 2 ? 'warn' : ''}"><span>${L('On time', 'في الموعد')}</span><b>${lateHours > 2 ? `${lateHours.toFixed(1)} h late` : 'Yes'}</b></div>
    <div class="${rc ? 'warn' : ''}"><span>${L('Return charges', 'رسوم الإرجاع')}</span><b>${rc ? esc(formatMoney(chargesTotal(rc.items), rc.currency)) : 'None'}</b></div>
  </div>` : ''}

  <div class="g2a">
    <div class="card">${H('1', 'Renter &amp; main driver', 'المستأجر والسائق الرئيسي')}
      <div class="name">${esc(r.personName)}</div>
      <div class="cols2">
        <div>
          <div class="drv"><span>${L('Phone', 'الهاتف')}</span><b>${esc(r.contactNumber || '—')}</b></div>
          <div class="drv"><span>${L('Email', 'البريد')}</span><b>${esc(r.customerEmail || '—')}</b></div>
          <div class="drv"><span>${L('Address', 'العنوان')}</span><b>${esc(drv.address || '—')}</b></div>
          <div class="drv"><span>${L('Date of birth', 'تاريخ الميلاد')}</span><b>${day(drv.dateOfBirth)}</b></div>
        </div>
        <div>
          <div class="drv"><span>${L('Nationality', 'الجنسية')}</span><b>${esc(drv.nationality || '—')}</b></div>
          <div class="drv"><span>${L('Licence', 'الرخصة')}</span><b class="${drv.licenseNumber ? '' : 'missing'}">${drv.licenseNumber ? `${esc(drv.licenseNumber)}${drv.licenseCountry ? ' · ' + esc(drv.licenseCountry) : ''}` : 'Not recorded · غير مسجّلة'}</b></div>
          <div class="drv"><span>${L('Expiry', 'الانتهاء')}</span><b class="${licenceExpired ? 'missing' : ''}">${day(drv.licenseExpiry)}${licenceExpired ? ' (before return)' : ''}</b></div>
          <div class="drv"><span>${L(esc(ID_TYPE[drv.idType || ''] || 'ID / passport'), ID_TYPE_AR[drv.idType || ''] || 'الهوية / الجواز')}</span><b>${esc(drv.idNumber || '—')}</b></div>
        </div>
      </div>
    </div>
    <div class="card">${H('2', 'Additional drivers', 'السائقون الإضافيون')}
      ${extraDrivers.length ? extraDrivers.map(d => `<div class="drv"><span>${esc(d.name)}</span><b>${esc(d.licenseNumber || 'licence —')}${d.dateOfBirth ? ' · ' + day(d.dateOfBirth) : ''}</b></div>`).join('') : '<p class="dim" style="color:#64748b">None. Only the main driver may drive the vehicle.<br><span class="ardecl" style="display:block;margin:0">لا يوجد. تقتصر قيادة المركبة على السائق الرئيسي فقط.</span></p>'}
      <div class="drv" style="margin-top:4px"><span>${L('Booked via', 'جهة الحجز')}</span><b>${esc(r.source || '—')}</b></div>
    </div>
  </div>

  <div class="g3">
    <div class="card">${H('3', 'Vehicle', 'المركبة')}${i.vehiclePhoto ? `<div class="vhead"><img class="vthumb" src="${esc(i.vehiclePhoto)}" alt=""/><div class="name">${esc(r.carModel || '—')}</div></div>` : `<div class="name">${esc(r.carModel || '—')}</div>`}
      <div class="kv"><span>${L('Plate', 'اللوحة')}</span><span style="font-family:Consolas,monospace">${esc(r.licensePlate || '—')}</span></div>
      <div class="kv"><span>${L('Group / gear', 'الفئة / الناقل')}</span><span>${esc([r.sippCode, r.transmission].filter(Boolean).join(' · ') || '—')}</span></div>
      ${(r.carExchanges || []).length ? `<div class="kv"><span>${L('Exchanged', 'استبدال')}</span><span>${r.carExchanges!.length}×</span></div>` : ''}
      <div class="kv"><span>${L('Km / fuel out', 'العداد / الوقود')}</span><span>${km(r.pickupKmOut)} · ${r.pickupFuelLevel != null ? r.pickupFuelLevel + '/8' : '—'}</span></div></div>
    <div class="card">${H('4', 'Pick-up', 'الاستلام')}
      <div class="name" style="font-size:9.5pt">${when(r.startDate)}</div>
      <div class="kv"><span>${L('Branch', 'الفرع')}</span><span>${esc(i.locationName || r.locationName || '—')}</span></div>
      ${i.locationAddress ? `<div class="kv"><span>${L('Address', 'العنوان')}</span><span>${esc(i.locationAddress)}</span></div>` : ''}
      <div class="kv"><span>${L('Checked out', 'التسليم')}</span><span>${r.pickupDateTime ? when(r.pickupDateTime) : '—'}</span></div></div>
    <div class="card">${H('5', 'Return', 'الإرجاع')}
      <div class="name" style="font-size:9.5pt">${when(r.endDate)}</div>
      <div class="kv"><span>${L('Branch', 'الفرع')}</span><span>${esc(i.locationName || r.locationName || '—')}</span></div>
      <div class="kv"><span>${L('Rental days', 'أيام الإيجار')}</span><span>${i.rentalDays}${(r.extensionHistory || []).length ? ` (incl. +${r.extensionHistory!.reduce((s2, e) => s2 + e.days, 0)} extended)` : ''}</span></div>
      <div class="kv"><span>${L('Returned', 'الإرجاع')}</span><span>${closed && returnedAt ? when(returnedAt.toISOString()) : '—'}</span></div></div>
  </div>

  ${closed ? `<div class="card" style="margin-top:7px">${H('6', 'Check-out vs check-in', 'مقارنة التسليم والإرجاع')}
    <table class="cmp">
      <tr><th></th><th>${L('Check-out', 'التسليم')}</th>${closed ? `<th>${L('Check-in', 'الإرجاع')}</th><th class="num">${L('Difference', 'الفرق')}</th>` : ''}</tr>
      <tr><td>${L('Date &amp; time', 'التاريخ والوقت')}</td><td>${r.pickupDateTime ? when(r.pickupDateTime) : when(r.startDate)}</td>${closed ? `<td>${returnedAt ? when(returnedAt.toISOString()) : '—'}</td><td class="num ${lateHours > 2 ? 'diff-bad' : ''}">${lateHours > 2 ? `${lateHours.toFixed(1)} h late` : 'On time'}</td>` : ''}</tr>
      <tr><td>${L('Odometer', 'العداد')}</td><td>${km(r.pickupKmOut)}</td>${closed ? `<td>${km(r.dropOffKmIn)}</td><td class="num">${kmDriven != null ? '+' + km(kmDriven) : '—'}</td>` : ''}</tr>
      <tr><td>${L('Fuel', 'الوقود')}</td><td>${fuel(r.pickupFuelLevel, '#111827')}</td>${closed ? `<td>${fuel(r.dropOffFuelLevel, fuelDiff != null && fuelDiff < 0 ? '#991b1b' : '#374151')}</td><td class="num ${fuelDiff != null && fuelDiff < 0 ? 'diff-bad' : 'diff-ok'}">${fuelDiff == null ? '—' : fuelDiff < 0 ? `${fuelDiff}/8 short` : fuelDiff > 0 ? `+${fuelDiff}/8` : 'Same level'}</td>` : ''}</tr>
      <tr><td>${L('Checklist', 'قائمة الفحص')}</td><td>${okOut} of ${i.checklistItems.length} items OK</td>${closed ? `<td>${okIn} of ${i.checklistItems.length} items OK</td><td class="num ${missingAtReturn.length ? 'diff-bad' : 'diff-ok'}">${missingAtReturn.length ? `${missingAtReturn.length} missing` : 'All present'}</td>` : ''}</tr>
      <tr><td>${L('Damage marks', 'علامات الأضرار')}</td><td>${pickupMarks.length} existing</td>${closed ? `<td>${returnMarks.length} new</td><td class="num ${returnMarks.length ? 'diff-bad' : 'diff-ok'}">${returnMarks.length ? `${returnMarks.length} new` : 'No new damage'}</td>` : ''}</tr>
      <tr><td>${L('Staff', 'الموظف')}</td><td>${esc(r.pickupAgentName || '—')}</td>${closed ? `<td>${esc(r.dropOffAgentName || '—')}</td><td></td>` : ''}</tr>
    </table>
  </div>` : `<div class="card" style="margin-top:7px">${H('6', 'Condition at check-out', 'حالة المركبة عند التسليم')}
    <div class="cgrid">
      <div><span>${L('Date &amp; time', 'التاريخ والوقت')}</span><b>${r.pickupDateTime ? when(r.pickupDateTime) : when(r.startDate)}</b></div>
      <div><span>${L('Odometer', 'العداد')}</span><b>${km(r.pickupKmOut)}</b></div>
      <div><span>${L('Fuel', 'الوقود')}</span><b>${fuel(r.pickupFuelLevel, '#111827')}</b></div>
      <div><span>${L('Checklist', 'قائمة الفحص')}</span><b>${okOut} of ${i.checklistItems.length} items OK</b></div>
      <div><span>${L('Existing damage', 'الأضرار الموجودة')}</span><b>${pickupMarks.length} mark${pickupMarks.length === 1 ? '' : 's'}</b></div>
      <div><span>${L('Handed over by', 'المسلِّم')}</span><b>${esc(r.pickupAgentName || '—')}</b></div>
    </div>
  </div>`}

  <div class="card" style="margin-top:7px">${H('7', 'Vehicle condition &amp; inspection', 'حالة المركبة والفحص')}
    <div class="${i.vehiclePhoto ? 'views5' : 'views4'}">${i.vehiclePhoto ? `<div class="view photo"><img src="${esc(i.vehiclePhoto)}" alt=""/><div class="vl">${L('Vehicle photo', 'صورة المركبة')}</div></div>` : ''}${(['front', 'back', 'left', 'right'] as CarView[]).map(diagram).join('')}</div>
    <div class="legend"><i style="border:1.5px solid #0284c7;background:#fff"></i>${L('Existing at check-out', 'موجودة عند التسليم')} (${pickupMarks.length})${closed ? `<i style="background:#e11d48"></i>${L('New at check-in', 'جديدة عند الإرجاع')} (${returnMarks.length})` : ''}<span style="float:right">Checklist ${okOut}/${i.checklistItems.length} out${closed ? ` · ${okIn}/${i.checklistItems.length} in` : ''}</span></div>
    ${damageRegister}
    <div class="chips">${i.checklistItems.map(x => `<span>${tick(out[x])}${closed ? tick(back[x], !!out[x]) : ''}<em>${esc(x)}</em></span>`).join('')}</div>
  </div>

  <div class="${rc || sideNotes ? 'g2' : ''}" style="${rc || sideNotes ? '' : 'margin-top:7px'}">
    <div class="card">${H('9', 'Charges, protection &amp; payment', 'الرسوم والحماية والدفع')}
      <table class="items">
        <tr><th>${L('Description', 'البيان')}</th><th class="num">${L('Qty', 'الكمية')}</th><th class="num">${L('Rate', 'السعر')}</th><th class="num">${L('Amount', 'المبلغ')}</th></tr>
        <tr><td>${L('Vehicle rental', 'أجرة المركبة')}${r.sippCode ? ` (${esc(r.sippCode)})` : ''}</td><td class="num">${i.rentalDays} d</td><td class="num">${usd(i.rentalDays ? i.baseRentalFee / i.rentalDays : i.baseRentalFee)}</td><td class="num">${usd(i.baseRentalFee)}</td></tr>
        ${(r.extras || []).map(e => `<tr><td>${esc(e.name)}</td><td class="num">${i.rentalDays} d</td><td class="num">${e.isComplementary ? '—' : usd(e.dailyPrice)}</td><td class="num">${e.isComplementary ? 'Included' : usd(e.dailyPrice * i.rentalDays)}</td></tr>`).join('')}
        <tr class="tot"><td colspan="3">${L('Total', 'الإجمالي')}</td><td class="num">${usd(rentalTotal)}</td></tr>
        <tr class="sub"><td colspan="3">${L('Protection', 'الحماية')}</td><td class="num">${protection.length ? esc(protection.map(e => e.name).join(', ')) : 'Standard cover · تغطية أساسية'}</td></tr>
        ${(r.securityDeposit || 0) > 0 ? `<tr class="sub"><td colspan="3">${L('Security deposit (refundable)', 'مبلغ التأمين (مسترد)')}</td><td class="num">${usd(r.securityDeposit || 0)}</td></tr>` : ''}
        ${(r.excess || 0) > 0 ? `<tr class="sub"><td colspan="3">${L('Damage excess (your maximum liability)', 'مبلغ التحمّل (الحد الأقصى لمسؤوليتك)')}</td><td class="num">${usd(r.excess || 0)}</td></tr>` : ''}
      </table>
      <div class="settle info">${paymentLine}${r.paymentMethod && !i.prepaid ? ` · ${esc(PAY_METHOD[r.paymentMethod] || r.paymentMethod)}` : ''}${cardRef && !i.prepaid ? ` ${cardRef}` : ''}${r.unpaidExtensionAmount ? ` · ${usd(r.unpaidExtensionAmount)} extension due` : ''}</div>
    </div>
    ${sideNotes ? `<div class="card">${closed ? H('10', 'Notes', 'ملاحظات') : H('10', 'Check-out notes', 'ملاحظات التسليم')}${closed
      ? `<div class="nl"><span>${L('At check-out', 'عند التسليم')}</span><div class="notes">${esc(r.pickupNotes || '—')}</div></div><div class="nl"><span>${L('At check-in', 'عند الإرجاع')}</span><div class="notes">${esc(r.dropOffNotes || '—')}</div></div>`
      : `<div class="notes">${esc(r.pickupNotes)}</div>`}</div>` : ''}
    ${rc ? `<div class="card">${H('10', `Charges at check-in · ${esc(rc.documentNumber || '')}`, 'رسوم الإرجاع')}
      <table>
        ${rc.items.map(it => `<tr><td>${esc(CHARGE_KIND_LABEL[it.kind])} — ${esc(it.description)}</td><td class="num">${esc(formatMoney(it.amount, rc.currency))}</td></tr>`).join('')}
        <tr class="tot"><td>${L('Total', 'الإجمالي')}</td><td class="num">${esc(formatMoney(chargesTotal(rc.items), rc.currency))}</td></tr>
      </table>
      <div class="settle ${rc.settlement === 'paid' ? 'paid' : 'claim'}">${rc.settlement === 'paid'
        ? `Paid${rc.paymentMethod ? ' by ' + esc(PAYMENT_METHOD_LABEL[rc.paymentMethod].toLowerCase()) : ''}${rc.paymentReference ? ` · ref ${esc(rc.paymentReference)}` : ''} — see invoice ${esc(rc.documentNumber || '')}`
        : `Payment due${rc.dueDate ? ' by ' + esc(new Date(rc.dueDate + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })) : ''} — see claim ${esc(rc.documentNumber || '')}`}</div>
    </div>` : ''}
  </div>

  ${photos.length ? `<div class="card" style="margin-top:7px">${H('', 'Photo evidence at check-in', 'صور الإثبات عند الإرجاع')}<div class="photos">${photos.map(p => `<figure><img src="${esc(p.src)}"/><figcaption>${esc(p.cap)}</figcaption></figure>`).join('')}</div></div>` : ''}

  ${closed && rc && (r.pickupNotes || r.dropOffNotes) ? `<div class="g2">
    <div class="card">${H('', 'Check-out notes', 'ملاحظات التسليم')}<div class="notes">${esc(r.pickupNotes || '—')}</div></div>
    <div class="card">${H('', 'Check-in notes', 'ملاحظات الإرجاع')}<div class="notes">${esc(r.dropOffNotes || '—')}</div></div>
  </div>` : ''}

  <div class="card avoid" style="margin-top:7px">${H('11', 'Declaration &amp; signatures', 'الإقرار والتواقيع')}
    <p class="terms">${esc(PICKUP_TERMS)}${closed ? ' ' + esc(RETURN_TERMS) : ''} <b>The Renter confirms having read and accepted the attached Terms and Conditions of Rental.</b></p>
    <p class="ardecl" lang="ar">${PICKUP_TERMS_AR}${closed ? ' ' + RETURN_TERMS_AR : ''} <b>ويقرّ المستأجر بأنه قرأ شروط وأحكام التأجير المرفقة ووافق عليها.</b></p>
    <div class="sg">
      <div class="sgrp"><h3>${L('Check-out', 'التسليم')}</h3><div class="row">
        ${sig(r.pickupRenterSignature, L('Renter', 'المستأجر'), r.personName, r.pickupDateTime ? when(r.pickupDateTime) : undefined)}
        ${sig(r.pickupAgentSignature, L('Company representative', 'ممثل الشركة'), r.pickupAgentName)}
      </div></div>
      ${closed ? `<div class="sgrp"><h3>${L('Check-in', 'الإرجاع')}</h3><div class="row">
        ${sig(r.dropOffRenterSignature, L('Renter', 'المستأجر'), r.personName, returnedAt ? when(returnedAt.toISOString()) : undefined)}
        ${sig(r.dropOffAgentSignature, L('Company representative', 'ممثل الشركة'), r.dropOffAgentName)}
      </div></div>` : `<div class="sgrp next"><h3>${L('At return', 'عند الإرجاع')}</h3><p>When you bring the car back it is inspected with you and both of you sign the check-in. You then receive the final agreement and the rental termination statement by email.</p><p class="ardecl" lang="ar">عند إرجاع المركبة يتم فحصها بحضورك ويوقّع الطرفان على محضر الإرجاع، ثم تستلم العقد النهائي وبيان إنهاء الإيجار عبر البريد الإلكتروني.</p><p class="due">Please return by <b>${when(r.endDate)}</b>${i.locationName || r.locationName ? ` at ${esc(i.locationName || r.locationName)}` : ''}.</p></div>`}
    </div>
  </div>

  <div class="foot"><span>${esc(i.company.name)}${i.company.subName ? ' · ' + esc(i.company.subName) : ''} · Agreement RA-${esc(r.bookingId)} · ${esc(i.locationAddress || i.locationName || r.locationName || '')}</span><span>Customer copy · نسخة العميل · signed electronically · ${new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
</div>

<div class="pdf-page terms-page">
  <div class="terms-head">
    <div>${i.logo ? `<img src="${i.logo}" alt="" style="height:20px">` : `<b>${esc(i.company.name)}</b>`}<h1>Terms and Conditions of Rental<bdi class="ar">شروط وأحكام التأجير</bdi></h1></div>
    <div class="meta">Agreement <b class="mono">RA-${esc(r.bookingId)}</b><br>${esc(i.company.name)}${i.company.subName ? ' · ' + esc(i.company.subName) : ''}</div>
  </div>
  <div class="terms-bi">
    <div><div class="lang">English</div>${clauses.map((c, n) => `<div class="clause">${c.title ? `<h4><span>${n + 1}.</span>${esc(c.title)}</h4>` : ''}<p>${esc(c.body)}</p></div>`).join('')}</div>
    <div class="rtl" lang="ar" dir="rtl"><div class="lang">العربية</div>${clausesAr.map((c, n) => `<div class="clause">${c.title ? `<h4><span>${n + 1}.</span>${esc(c.title)}</h4>` : ''}<p>${esc(c.body)}</p></div>`).join('')}</div>
  </div>
  <div class="ack avoid">
    <p>I have read, understood and accept these Terms and Conditions and the condition of the vehicle recorded in this agreement.<span class="ardecl" style="display:block">أقرّ بأنني قرأت وفهمت هذه الشروط والأحكام وأوافق عليها وعلى حالة المركبة المسجّلة في هذا العقد.</span></p>
    ${sig(r.pickupRenterSignature, L('Renter', 'المستأجر'), r.personName, r.pickupDateTime ? when(r.pickupDateTime) : undefined)}
    ${sig(r.pickupAgentSignature, L('For the Company', 'عن الشركة'), r.pickupAgentName)}
  </div>
  <div class="foot"><span>${esc(i.company.name)} · ${esc(i.company.address)} · ${esc(i.company.phone)}${i.company.website ? ' · ' + esc(i.company.website) : ''}</span><span>RA-${esc(r.bookingId)} · Terms · الشروط</span></div>
</div>
</body></html>`;
}
