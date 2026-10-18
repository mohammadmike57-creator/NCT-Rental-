import { CarView, DamageMarker, DamageSeverity, DamageType } from '../types';

export const DAMAGE_TYPES: { value: DamageType; label: string }[] = [
  { value: 'scratch', label: 'Scratch' },
  { value: 'dent', label: 'Dent' },
  { value: 'chip', label: 'Chip' },
  { value: 'crack', label: 'Crack' },
  { value: 'scuff', label: 'Scuff' },
  { value: 'broken', label: 'Broken' },
  { value: 'missing', label: 'Missing part' },
  { value: 'other', label: 'Other' },
];

export const DAMAGE_SEVERITIES: { value: DamageSeverity; label: string }[] = [
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'major', label: 'Major' },
];

export const DAMAGE_SIZES = ['Under 2 cm', '2–5 cm', '5–10 cm', '10–30 cm', 'Over 30 cm'];

/** Common panels per view, offered as suggestions for the part field. */
export const DAMAGE_PARTS: Record<CarView, string[]> = {
  front: ['Front bumper', 'Bonnet', 'Windscreen', 'Headlight left', 'Headlight right', 'Grille', 'Number plate'],
  back: ['Rear bumper', 'Boot lid', 'Rear window', 'Tail light left', 'Tail light right', 'Number plate'],
  left: ['Front wing left', 'Front door left', 'Rear door left', 'Rear wing left', 'Mirror left', 'Wheel / rim left', 'Sill left'],
  right: ['Front wing right', 'Front door right', 'Rear door right', 'Rear wing right', 'Mirror right', 'Wheel / rim right', 'Sill right'],
};

export const damageTypeLabel = (t?: DamageType) => DAMAGE_TYPES.find(x => x.value === t)?.label || '';
export const damageSeverityLabel = (s?: DamageSeverity) => DAMAGE_SEVERITIES.find(x => x.value === s)?.label || '';

/** One-line description of a mark, e.g. "Scratch · Front bumper · 2–5 cm". */
export const damageSummary = (m: DamageMarker) =>
  [damageTypeLabel(m.type), m.part, m.size].filter(Boolean).join(' · ');

export const isDescribed = (m: DamageMarker) => !!(m.type || m.part || m.note);
