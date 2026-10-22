/**
 * Unfinished work kept in this browser, so a reload or closing the page does not lose what staff
 * typed before it was completed (an agreement being filled in, a new reservation). Saved work lives
 * on the server; a draft is only the part that was not completed yet.
 */
const PREFIX = 'nct:draft:';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

export interface Draft<T> { savedAt: number; data: T }

export function loadDraft<T>(key: string): Draft<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft<T>;
    if (!d || typeof d.savedAt !== 'number' || Date.now() - d.savedAt > MAX_AGE_MS) { localStorage.removeItem(PREFIX + key); return null; }
    return d;
  } catch { return null; }
}

export function saveDraft<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Storage full (large photos or signatures): keep the rest of the draft.
    try {
      const slim = JSON.parse(JSON.stringify(data), (_k, v) => (typeof v === 'string' && v.startsWith('data:') && v.length > 20000 ? undefined : v));
      localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), data: slim }));
    } catch { /* no room: skip */ }
  }
}

export function clearDraft(key: string): void {
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}

/** The fields of `current` that differ from `base` (what the user changed). */
export function changedFields<T extends object>(base: T, current: T): Partial<T> {
  const out: Partial<T> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(current)]) as Set<keyof T>;
  keys.forEach(k => { if (JSON.stringify(base[k]) !== JSON.stringify(current[k])) out[k] = current[k]; });
  return out;
}

export const draftTime = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
