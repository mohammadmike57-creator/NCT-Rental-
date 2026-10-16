import React from 'react';
import { CarView, Fleet } from '../types';

/*
 * Vehicle illustrations used across reservations, agreements and the car check.
 * Shapes are defined once as SVG markup strings so the same drawing can be used
 * in React and in the printable agreement (plain HTML).
 * Damage markers are stored as % of a 100x60 box, so all inspection views keep
 * that viewBox.
 */

const BODY = 'fill="#f1f5f9" stroke="#475569" stroke-width="1.1" stroke-linejoin="round"';
const GLASS = 'fill="#cbd5e1" stroke="#64748b" stroke-width="0.7"';
const TYRE = 'fill="#1e293b"';
const RIM = 'fill="#94a3b8"';
const LINE = 'fill="none" stroke="#94a3b8" stroke-width="0.7" stroke-linecap="round"';

const SIDE = `
  <path ${BODY} d="M6 40 Q6 34 12 33 L24 31 Q31 21 41 20 L61 20 Q70 20 77 28 L88 31 Q94 32 94 38 L94 42 Q94 44 92 44 L86 44 A8 8 0 0 0 70 44 L32 44 A8 8 0 0 0 16 44 L8 44 Q6 44 6 42 Z"/>
  <path ${GLASS} d="M30 30 L40.5 23 L50 23 L50 30 Z"/>
  <path ${GLASS} d="M53 30 L53 23 L61 23 Q66.5 23 71 30 Z"/>
  <path ${LINE} d="M51.5 23 L51.5 43 M30 31 L79 31 M44 34.5 L48 34.5 M60 34.5 L64 34.5"/>
  <rect x="6.5" y="35" width="4" height="3" rx="1" fill="#fbbf24"/>
  <rect x="90" y="34" width="4" height="3.5" rx="1" fill="#ef4444"/>
  <path fill="#475569" d="M28 30 L31 30 L31 32.5 L27.5 32.5 Z"/>
  <circle cx="24" cy="44" r="6.6" ${TYRE}/><circle cx="24" cy="44" r="3.2" ${RIM}/>
  <circle cx="78" cy="44" r="6.6" ${TYRE}/><circle cx="78" cy="44" r="3.2" ${RIM}/>
`;

const FRONT = `
  <path ${BODY} d="M29 26 L33 13 Q34.5 10 39 10 L61 10 Q65.5 10 67 13 L71 26 Z"/>
  <path ${GLASS} d="M33.5 24 L36 14.5 Q36.8 13 39 13 L61 13 Q63.2 13 64 14.5 L66.5 24 Z"/>
  <path ${BODY} d="M14 30 Q14 26 20 26 L80 26 Q86 26 86 30 L88 43 Q88 47 84 47 L16 47 Q12 47 12 43 Z"/>
  <path fill="#e2e8f0" stroke="#64748b" stroke-width="0.7" d="M17 31 Q17 29.5 19 29.5 L31 30.5 Q33 31 33 33 L33 34.5 Q33 36 31 36 L19 36 Q17 36 17 34.5 Z"/>
  <path fill="#e2e8f0" stroke="#64748b" stroke-width="0.7" d="M83 31 Q83 29.5 81 29.5 L69 30.5 Q67 31 67 33 L67 34.5 Q67 36 69 36 L81 36 Q83 36 83 34.5 Z"/>
  <rect x="38" y="31" width="24" height="7" rx="2" fill="#334155"/>
  <path ${LINE} d="M41 34.5 L59 34.5"/>
  <rect x="43" y="40.5" width="14" height="4" rx="0.8" fill="#ffffff" stroke="#64748b" stroke-width="0.5"/>
  <path ${LINE} d="M16 41 L35 41 M65 41 L84 41"/>
  <path fill="#475569" d="M24 23 L29 23.5 L28.5 26 L23 26 Z M76 23 L71 23.5 L71.5 26 L77 26 Z"/>
  <rect x="15" y="46" width="11" height="7" rx="2" ${TYRE}/>
  <rect x="74" y="46" width="11" height="7" rx="2" ${TYRE}/>
`;

const BACK = `
  <path ${BODY} d="M29 26 L33 13 Q34.5 10 39 10 L61 10 Q65.5 10 67 13 L71 26 Z"/>
  <path ${GLASS} d="M34 24 L36.5 15 Q37.3 13.5 39.5 13.5 L60.5 13.5 Q62.7 13.5 63.5 15 L66 24 Z"/>
  <path ${BODY} d="M14 30 Q14 26 20 26 L80 26 Q86 26 86 30 L88 43 Q88 47 84 47 L16 47 Q12 47 12 43 Z"/>
  <rect x="16.5" y="29.5" width="15" height="6" rx="1.5" fill="#ef4444"/>
  <rect x="68.5" y="29.5" width="15" height="6" rx="1.5" fill="#ef4444"/>
  <path ${LINE} d="M33 29 L67 29 M33 37 L67 37"/>
  <rect x="42" y="31" width="16" height="5" rx="0.8" fill="#ffffff" stroke="#64748b" stroke-width="0.5"/>
  <path ${LINE} d="M16 42 L84 42"/>
  <rect x="22" y="43.5" width="5" height="2" rx="1" fill="#94a3b8"/>
  <rect x="15" y="46" width="11" height="7" rx="2" ${TYRE}/>
  <rect x="74" y="46" width="11" height="7" rx="2" ${TYRE}/>
`;

export const INSPECTION_SVG: Record<CarView, string> = {
  left: SIDE,
  right: `<g transform="translate(100 0) scale(-1 1)">${SIDE}</g>`,
  front: FRONT,
  back: BACK,
};

export const INSPECTION_LABEL: Record<CarView, string> = {
  front: 'Front',
  back: 'Rear',
  left: 'Driver side',
  right: 'Passenger side',
};

export const InspectionDiagram: React.FC<{ view: CarView; className?: string }> = ({ view, className }) => (
  <svg viewBox="0 0 100 60" className={className} role="img" aria-label={`${INSPECTION_LABEL[view]} of vehicle`}
    dangerouslySetInnerHTML={{ __html: INSPECTION_SVG[view] }} />
);

// ---------------------------------------------------------------------------
// Vehicle type artwork (side profile, coloured) for lists and headers
// ---------------------------------------------------------------------------

export type VehicleKind = 'sedan' | 'suv' | 'compact' | 'sports' | 'truck';

const KIND_COLOR: Record<VehicleKind, string> = {
  sedan: '#2563eb',
  suv: '#0f766e',
  compact: '#7c3aed',
  sports: '#dc2626',
  truck: '#b45309',
};

const KIND_PATH: Record<VehicleKind, string> = {
  sedan: 'M6 38 Q6 33 12 32 L25 30 Q32 21 42 20 L60 20 Q69 20 76 28 L88 30.5 Q94 31.5 94 37 L94 41 Q94 43 92 43 L86 43 A8 8 0 0 0 70 43 L32 43 A8 8 0 0 0 16 43 L8 43 Q6 43 6 41 Z',
  suv: 'M6 37 Q6 31 11 30 L22 28.5 Q27 17 34 15.5 L70 15.5 Q76 15.5 80 22 L88 28 Q94 29.5 94 35 L94 41 Q94 43 92 43 L86 43 A8 8 0 0 0 70 43 L32 43 A8 8 0 0 0 16 43 L8 43 Q6 43 6 41 Z',
  compact: 'M10 38 Q10 32 15 31 L26 29 Q33 19 44 18 L62 18 Q70 18 76 25 L84 31 Q90 32.5 90 37 L90 41 Q90 43 88 43 L82 43 A8 8 0 0 0 66 43 L34 43 A8 8 0 0 0 18 43 L12 43 Q10 43 10 41 Z',
  sports: 'M4 39 Q4 35 10 34 L28 31.5 Q38 23 50 22.5 L60 22.5 Q68 23 76 29 L90 31.5 Q96 33 96 38 L96 41 Q96 43 94 43 L87 43 A8 8 0 0 0 71 43 L31 43 A8 8 0 0 0 15 43 L6 43 Q4 43 4 41 Z',
  truck: 'M4 37 Q4 31 9 30 L18 29 Q22 18 28 17 L50 17 Q54 17 54 21 L54 29 L94 29 Q96 29 96 31 L96 41 Q96 43 94 43 L88 43 A8 8 0 0 0 72 43 L30 43 A8 8 0 0 0 14 43 L6 43 Q4 43 4 41 Z',
};

const KIND_GLASS: Record<VehicleKind, string> = {
  sedan: 'M31 29.5 L41.5 22.5 L50 22.5 L50 29.5 Z M53 29.5 L53 22.5 L60 22.5 Q66 22.5 70 29.5 Z',
  suv: 'M27 27.5 L33.5 18.5 L49 18.5 L49 27.5 Z M52 27.5 L52 18.5 L69 18.5 Q73 18.5 76 23 L78 27.5 Z',
  compact: 'M32 28 L43 21 L52 21 L52 28 Z M55 28 L55 21 L62 21 Q67 21 71 26 L72 28 Z',
  sports: 'M36 30 L48 25 L56 25 L56 30 Z M58 30 L58 25 L61 25 Q66 25.5 70 30 Z',
  truck: 'M22 28 L27.5 20 L39 20 L39 28 Z M42 28 L42 20 L50 20 Q51 20 51 21 L51 28 Z',
};

const WHEELS: Record<VehicleKind, [number, number]> = {
  sedan: [24, 78], suv: [24, 78], compact: [26, 74], sports: [23, 79], truck: [22, 80],
};

/** Guess the vehicle kind from fleet category, SIPP code or model name. */
export const vehicleKind = (model?: string, fleet?: Fleet): VehicleKind => {
  const m = (model || '').toLowerCase().trim();
  const v = (fleet || []).find(f => (f.modelName || '').toLowerCase().trim() === m);
  const cat = (v?.category || '').toLowerCase();
  const sipp = /^[A-Z]{4}$/.test((v?.sippCode || '').toUpperCase()) ? (v?.sippCode || '').toUpperCase() : '';

  if (/suv|4x4|jeep|crossover/.test(cat)) return 'suv';
  if (/truck|pick/.test(cat)) return 'truck';
  if (/sport|convert|coupe/.test(cat)) return 'sports';
  if (/compact|mini|economy|hatch/.test(cat)) return 'compact';
  if (/sedan|standard|intermediate|full|premium|luxury/.test(cat)) return 'sedan';

  if (sipp) {
    const type = sipp.charAt(1);
    if ('FGJ'.includes(type)) return 'suv';      // SUV / crossover / open-air all-terrain
    if (type === 'P' || type === 'Q') return 'truck';
    if (type === 'S' || type === 'T') return 'sports';
    if ('MNEH'.includes(sipp.charAt(0))) return 'compact';
    return 'sedan';
  }

  if (/(rav4|tucson|sportage|wrangler|jeep|cr-v|x-trail|land cruiser|prado|santa fe|creta|kona|suv)/.test(m)) return 'suv';
  if (/(silverado|hilux|ranger|navara|f-150|pickup)/.test(m)) return 'truck';
  if (/(mustang|camaro|porsche|corvette)/.test(m)) return 'sports';
  if (/(accent|yaris|civic|i10|i20|picanto|rio|polo|golf|sunny|micra|swift)/.test(m)) return 'compact';
  return 'sedan';
};

export const vehicleKindLabel: Record<VehicleKind, string> = {
  sedan: 'Sedan', suv: 'SUV', compact: 'Compact', sports: 'Sports', truck: 'Pickup',
};

export const VehicleArt: React.FC<{ kind: VehicleKind; className?: string; color?: string }> = ({ kind, className, color }) => {
  const c = color || KIND_COLOR[kind];
  const [w1, w2] = WHEELS[kind];
  return (
    <svg viewBox="0 0 100 52" className={className} role="img" aria-label={vehicleKindLabel[kind]}>
      <ellipse cx="50" cy="49" rx="44" ry="2.2" fill="#0f172a" opacity="0.08" />
      <path d={KIND_PATH[kind]} fill={c} />
      <path d={KIND_PATH[kind]} fill="url(#vg-shine)" />
      <path d={KIND_GLASS[kind]} fill="#e0f2fe" opacity="0.9" />
      <defs>
        <linearGradient id="vg-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      {[w1, w2].map(x => (
        <g key={x}>
          <circle cx={x} cy="43" r="6.4" fill="#0f172a" />
          <circle cx={x} cy="43" r="3" fill="#cbd5e1" />
          <circle cx={x} cy="43" r="1" fill="#475569" />
        </g>
      ))}
    </svg>
  );
};
