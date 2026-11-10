import { useEffect } from 'react';

/**
 * Phones: every table inside the container becomes a list of cards (see .rt-cards in index.css).
 * Each cell gets its column name (data-label) from the table header, so the value keeps its meaning
 * when the header row is hidden. Computers keep the normal table. Tables marked data-no-cards are left alone.
 */
export function labelTables(root: ParentNode) {
  root.querySelectorAll('table').forEach(table => {
    if (table.hasAttribute('data-no-cards')) return;
    const head = table.tHead?.rows[table.tHead.rows.length - 1];
    if (!head) return;
    const labels: string[] = [];
    Array.from(head.cells).forEach(th => {
      // Text of each part of the header, kept apart ("1–3 days" + "rate band" → "1–3 days · rate band").
      const parts = Array.from(th.querySelectorAll('p, span, div')).filter(e => !e.children.length).map(e => (e.textContent || '').trim()).filter(Boolean);
      const label = (parts.length > 1 ? parts.join(' · ') : (th.textContent || '')).replace(/\s+/g, ' ').trim();
      for (let i = 0; i < (th.colSpan || 1); i++) labels.push(label);
    });
    table.classList.add('rt-cards');
    Array.from(table.tBodies).concat(table.tFoot ? [table.tFoot as unknown as HTMLTableSectionElement] : []).forEach(body => {
      Array.from(body.rows).forEach(row => {
        let col = 0;
        Array.from(row.cells).forEach(cell => {
          const label = cell.colSpan > 1 ? '' : labels[col] || '';
          if (label) { if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label); }
          else if (cell.hasAttribute('data-label')) cell.removeAttribute('data-label');
          col += cell.colSpan || 1;
        });
      });
    });
  });
}

/** Keeps the tables under the element with this class labelled while the screen changes. */
export function useResponsiveTables(rootClass: string) {
  useEffect(() => {
    const root = document.querySelector(`.${rootClass}`);
    if (!root) return;
    let frame = 0;
    const run = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => labelTables(root)); };
    run();
    const obs = new MutationObserver(muts => { if (muts.some(m => m.type === 'childList')) run(); });
    obs.observe(root, { childList: true, subtree: true });
    return () => { obs.disconnect(); cancelAnimationFrame(frame); };
  }, [rootClass]);
}
