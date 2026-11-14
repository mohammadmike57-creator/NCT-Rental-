/**
 * The sign-in a browser tab uses. Normally the person's own (localStorage). A platform admin's read-only support
 * view of a supplier lives only in that one tab (sessionStorage), so it never replaces their own sign-in elsewhere.
 */
const SUPPORT = 'nct.supportToken';
const SUPPORT_UNTIL = 'nct.supportUntil';
const SUPPORT_NAME = 'nct.supportName';

export const supportToken = (): string | null => {
  try { return sessionStorage.getItem(SUPPORT); } catch { return null; }
};

/** True in a tab opened from the admin portal's "Support access". */
export const isSupportView = (): boolean => !!supportToken();

export const supportInfo = (): { until: string | null; name: string | null } => {
  try { return { until: sessionStorage.getItem(SUPPORT_UNTIL), name: sessionStorage.getItem(SUPPORT_NAME) }; } catch { return { until: null, name: null }; }
};

/** The token for server calls from this tab. */
export const sessionToken = (): string | null => {
  const s = supportToken();
  if (s) return s;
  try { return localStorage.getItem('token'); } catch { return null; }
};

/** Called once when the app opens: a support link (/?support=…) is moved into this tab only and removed from the address. */
export const adoptSupportLink = () => {
  try {
    const url = new URL(window.location.href);
    const t = url.searchParams.get('support');
    if (!t) return;
    sessionStorage.setItem(SUPPORT, t);
    const until = url.searchParams.get('until');
    const name = url.searchParams.get('name');
    if (until) sessionStorage.setItem(SUPPORT_UNTIL, until);
    if (name) sessionStorage.setItem(SUPPORT_NAME, name);
    url.searchParams.delete('support'); url.searchParams.delete('until'); url.searchParams.delete('name');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch { /* storage unavailable: no support view */ }
};

export const endSupportView = () => {
  try { sessionStorage.removeItem(SUPPORT); sessionStorage.removeItem(SUPPORT_UNTIL); sessionStorage.removeItem(SUPPORT_NAME); } catch { /* nothing to clear */ }
};

/**
 * Data the browser keeps between visits (unsent drafts, a cached staff list, extras, an open agreement, the channel
 * editor's working copy) belongs to one company. When someone of another company signs in on the same browser, it is
 * cleared first, so nothing of one company ever shows to another.
 */
const LAST_SUPPLIER = 'nct.supplier';
const COMPANY_CACHES = ['NCT_USERS_CACHE', 'availableExtras', 'nct.openAgreement', 'nct.channelEditor.v1', 'nct.mainView'];
const COMPANY_PREFIXES = ['nct:draft:'];

export const keepCachesFor = (supplierId: string | undefined | null) => {
  if (isSupportView()) return;
  const now = supplierId && supplierId.trim() ? supplierId : 'urd';
  try {
    const last = localStorage.getItem(LAST_SUPPLIER);
    if (last !== null && last !== now) {
      COMPANY_CACHES.forEach(k => localStorage.removeItem(k));
      Object.keys(localStorage).filter(k => COMPANY_PREFIXES.some(p => k.startsWith(p))).forEach(k => localStorage.removeItem(k));
    }
    localStorage.setItem(LAST_SUPPLIER, now);
  } catch { /* storage unavailable: nothing is kept anyway */ }
};
