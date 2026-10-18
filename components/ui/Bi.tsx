import React from 'react';
import { arOf } from '../../services/uiArabic';

/**
 * English text with its Arabic translation beside it (or under it with `block`). Falls back to
 * English only when no translation is known.
 */
export const Bi: React.FC<{ en: string; ar?: string; block?: boolean; className?: string }> = ({ en, ar, block, className }) => {
  const a = ar ?? arOf(en);
  return (
    <>
      {en}
      {a && <span lang="ar" dir="rtl" className={`ar-ui ${block ? 'block w-fit mt-0.5' : 'ml-1.5'} ${className || ''}`}>{a}</span>}
    </>
  );
};
