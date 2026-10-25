import { ActivityCategory, ActivityEvent, recordActivityBatch } from '../firebase/api';

/**
 * Records what staff do in the app for the Activity Log: every screen opened, button, tab, link
 * and menu item pressed, row opened, option chosen and field changed. Events are queued and
 * sent in small batches; the last batch is sent as the page closes.
 * Typed text is never recorded (only which field was changed) and password fields are ignored.
 * Mark an element with data-no-track to leave it out.
 */

let queue: ActivityEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let lastKey = '';
let lastAt = 0;
let lastInteraction = Date.now();
let screen = () => '';

/** When the user last pressed, typed, scrolled or touched anything (ms since epoch). */
export const lastInteractionAt = () => lastInteraction;

const flush = (closing = false) => {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const batch = queue.splice(0, 100);
  recordActivityBatch(batch, closing);
  if (queue.length) flush(closing);
};

export const track = (action: string, summary: string, category: ActivityCategory = 'screen', details?: string, bookingId?: string) => {
  const key = `${action}|${summary}`;
  const now = Date.now();
  // A double click, or the same control reported twice by one press, is one event.
  if (key === lastKey && now - lastAt < 800) return;
  lastKey = key;
  lastAt = now;
  const where = screen();
  queue.push({ action, category, summary: summary.slice(0, 480), bookingId, details: [where && `Screen: ${where}`, details].filter(Boolean).join('\n') || undefined });
  if (queue.length >= 25) flush();
  else if (!timer) timer = setTimeout(() => flush(), 4000);
};

const clean = (s: string | null | undefined, n = 80) => {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** The words a person sees for a control. */
const labelOf = (el: Element): string => {
  const aria = el.getAttribute('aria-label') || el.getAttribute('title');
  if (aria) return clean(aria);
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const t = labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ');
    if (clean(t)) return clean(t);
  }
  const text = clean((el as HTMLElement).innerText ?? el.textContent);
  if (text) return text;
  const img = el.querySelector('img[alt], svg[aria-label]');
  return clean(img?.getAttribute('alt') || img?.getAttribute('aria-label')) || clean(el.getAttribute('name')) || '';
};

/** The label of a form field: its <label>, aria-label, placeholder or name. */
const fieldName = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string => {
  const aria = el.getAttribute('aria-label');
  if (aria) return clean(aria);
  if (el.id) {
    const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (l && clean(l.textContent)) return clean(l.textContent);
  }
  const wrap = el.closest('label');
  if (wrap) {
    const t = clean(Array.from(wrap.childNodes).filter(n => n !== el && !(n instanceof HTMLInputElement || n instanceof HTMLSelectElement || n instanceof HTMLTextAreaElement)).map(n => n.textContent || '').join(' '));
    if (t) return t;
  }
  // Common layout: <div><label>Name</label><input/></div>
  const prev = el.previousElementSibling;
  if (prev && prev.tagName === 'LABEL' && clean(prev.textContent)) return clean(prev.textContent);
  const parentLabel = el.parentElement?.querySelector(':scope > label');
  if (parentLabel && clean(parentLabel.textContent)) return clean(parentLabel.textContent);
  return clean(el.getAttribute('placeholder') || el.getAttribute('name') || el.id) || 'a field';
};

/** The dialog or panel a control sits in, so "Save" reads as "Save (Edit vehicle)". */
const contextOf = (el: Element): string => {
  const dlg = el.closest('[role="dialog"], [aria-modal="true"]');
  const title = dlg?.querySelector('h1, h2, h3, [id$="title"]');
  return title ? clean(title.textContent, 60) : '';
};

const CLICKABLE = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="link"], summary, input[type="checkbox"], input[type="radio"], input[type="submit"], input[type="button"]';

const onClick = (e: MouseEvent) => {
  const target = e.target as Element | null;
  if (!target || target.closest('[data-no-track]')) return;
  const el = target.closest(CLICKABLE);
  if (el) {
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      const name = fieldName(el);
      track('UI_TOGGLE', el.type === 'radio' ? `Chose “${name}”` : `${el.checked ? 'Ticked' : 'Unticked'} “${name}”`);
      return;
    }
    const label = labelOf(el) || (el instanceof HTMLInputElement ? clean(el.value) : '');
    if (!label) return;
    const ctx = contextOf(el);
    const role = el.getAttribute('role');
    const verb = role === 'tab' ? 'Opened tab' : role === 'menuitem' ? 'Chose menu item' : role === 'option' ? 'Chose' : el.tagName === 'A' ? 'Opened link' : 'Pressed';
    track('UI_CLICK', `${verb} “${label}”${ctx && ctx !== label ? ` (${ctx})` : ''}`);
    return;
  }
  // Table rows and cards that open something when clicked.
  const row = target.closest('tbody tr, [data-track-row], li.cursor-pointer, div.cursor-pointer') as HTMLElement | null;
  if (row && (row.matches('[data-track-row], .cursor-pointer') || getComputedStyle(row).cursor === 'pointer')) {
    const text = clean(row.dataset.trackRow || row.innerText, 100);
    if (text) track('UI_OPEN_ROW', `Opened “${text}”`);
  }
};

const onChange = (e: Event) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  if (!el || !('value' in el) || el.closest('[data-no-track]')) return;
  if (el instanceof HTMLInputElement && ['password', 'checkbox', 'radio', 'submit', 'button', 'hidden'].includes(el.type)) return;
  const name = fieldName(el);
  const ctx = contextOf(el);
  const suffix = ctx && ctx !== name ? ` (${ctx})` : '';
  if (el instanceof HTMLSelectElement) {
    track('UI_SELECT', `Set “${name}” to “${clean(el.selectedOptions[0]?.text || el.value)}”${suffix}`);
  } else if (el instanceof HTMLInputElement && el.type === 'file') {
    const n = el.files?.length || 0;
    track('UI_UPLOAD', `Added ${n} file${n === 1 ? '' : 's'} to “${name}”${suffix}`);
  } else if (el instanceof HTMLInputElement && ['date', 'datetime-local', 'time', 'month', 'number', 'range', 'color'].includes(el.type)) {
    track('UI_EDIT', `Set “${name}” to ${clean(el.value) || 'empty'}${suffix}`);
  } else {
    // Free text (names, ID numbers, notes) is not copied into the log.
    track('UI_EDIT', `${el.value ? 'Edited' : 'Cleared'} “${name}”${suffix}`);
  }
};

const onKey = (e: KeyboardEvent) => {
  lastInteraction = Date.now();
  if (e.key === 'Escape' && document.querySelector('[role="dialog"], [aria-modal="true"]')) track('UI_KEY', 'Closed a window with Esc');
};
const onTouch = () => { lastInteraction = Date.now(); };
const onHide = () => { if (document.visibilityState === 'hidden') flush(true); };
const onPageHide = () => flush(true);

/** Starts recording; returns a function that stops it (and sends what is queued). */
export function startActivityTracking(currentScreen: () => string): () => void {
  screen = currentScreen;
  document.addEventListener('click', onClick, true);
  document.addEventListener('change', onChange, true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onTouch, true);
  document.addEventListener('scroll', onTouch, true);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('change', onChange, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onTouch, true);
    document.removeEventListener('scroll', onTouch, true);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
    flush();
  };
}

/** Sends anything still queued now (e.g. just before signing out). */
export const flushActivity = () => flush();
