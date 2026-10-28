import axios from 'axios';
import { AllData } from '../types';
import { API_BASE } from '../services/apiBase';

export const API_URL = API_BASE;

let token: string | null = localStorage.getItem('token');

// When the server rejects our login token (expired, or the user was removed),
// clear the session and return to the login screen instead of failing silently.
let sessionExpiredHandled = false;
axios.interceptors.response.use(
  response => response,
  error => {
    const status = error?.response?.status;
    const url: string = error?.config?.url || '';
    const isLoginCall = url.includes('/auth/');
    if (status === 401 && !isLoginCall && url.startsWith(API_URL) && localStorage.getItem('token') && !sessionExpiredHandled) {
      sessionExpiredHandled = true;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export const signInUser = async (email: string, password: string) => {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, { email, password });
    console.log('Login response:', response.data);
    token = response.data.token;
    const user = response.data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    return { user: { uid: user.id, email: user.email } };
  } catch (error: any) {
    console.error('Login error:', error.response?.data || error.message);
    throw error;
  }
};

export const signOutUser = async () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  token = null;
};

export const onAuthStateChangedListener = (callback: (user: any) => void) => {
  const storedUser = localStorage.getItem('user');
  if (storedUser) {
    callback(JSON.parse(storedUser));
  } else {
    callback(null);
  }
  return () => {};
};

// The last state document received, as text, so polling can skip work when nothing changed.
let lastStateText: string | null = null;

const getStateText = async (): Promise<string | null> => {
  const currentToken = localStorage.getItem('token');
  if (!currentToken) return null;
  const response = await axios.get(`${API_URL}/api/state`, {
    params: { ts: Date.now() },
    responseType: 'text',
    transformResponse: [(x: unknown) => x],
    headers: { Authorization: `Bearer ${currentToken}`, 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
};

export const fetchInitialData = async (): Promise<AllData | null> => {
  try {
    const text = await getStateText();
    if (text === null) return null;
    // Not marked as shown: only data the screen actually applied (rememberServerState) counts.
    return JSON.parse(text);
  } catch (error) {
    console.error('Failed to fetch initial data', error);
    throw error;
  }
};

/** The server's data, or null when it is exactly what this screen already shows. */
export const fetchStateIfChanged = async (): Promise<AllData | null> => {
  const text = await getStateText();
  if (text === null || text === lastStateText) return null;
  lastStateText = text;
  return JSON.parse(text);
};

// ---------------------------------------------------------------------------
// Saving. The server keeps one document with every section of the app's data. To make sure
// staff working at the same time never overwrite each other, the app sends only what changed
// since it last read the server: one operation per booking added, changed or deleted, and a
// whole section only when that section changed. The server applies them in order on the latest
// saved data.
// ---------------------------------------------------------------------------

type PatchOp =
  | { op: 'upsertReservation'; year: string; month: string; reservation: Record<string, unknown> }
  | { op: 'deleteReservation'; id: string }
  | { op: 'set'; key: string; value: unknown };

/** What this browser last read from (or successfully saved to) the server. */
let serverState: Record<string, unknown> | null = null;
const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
/** Called when server data is applied on screen, so later saves are compared with what the user actually sees. */
export const rememberServerState = (data: unknown) => { if (data && typeof data === 'object') serverState = clone(data as Record<string, unknown>); };

type Located = { year: string; month: string; json: string; res: Record<string, unknown> };
const indexReservations = (data: unknown): Map<string, Located> => {
  const out = new Map<string, Located>();
  if (!data || typeof data !== 'object') return out;
  Object.entries(data as Record<string, Record<string, unknown[]>>).forEach(([year, months]) => {
    Object.entries(months || {}).forEach(([month, list]) => {
      (Array.isArray(list) ? list : []).forEach((res: any) => {
        if (res && res.id) out.set(String(res.id), { year, month, json: JSON.stringify(res), res });
      });
    });
  });
  return out;
};

const diffOps = (data: Partial<AllData>): PatchOp[] => {
  const base = serverState || {};
  const ops: PatchOp[] = [];
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined) return;
    if (key === 'reservations') {
      const before = indexReservations(base.reservations);
      const after = indexReservations(value);
      after.forEach((loc, id) => {
        const prev = before.get(id);
        if (!prev || prev.json !== loc.json || prev.year !== loc.year || prev.month !== loc.month) {
          ops.push({ op: 'upsertReservation', year: loc.year, month: loc.month, reservation: loc.res });
        }
      });
      // Only bookings this browser had and no longer has are deleted; bookings added by others meanwhile are untouched.
      before.forEach((_, id) => { if (!after.has(id)) ops.push({ op: 'deleteReservation', id }); });
    } else if (JSON.stringify(value) !== JSON.stringify(base[key])) {
      ops.push({ op: 'set', key, value });
    }
  });
  return ops;
};

let saveQueue: Promise<void> = Promise.resolve();

export interface SaveOptions { /** Set only by actions that deliberately delete many bookings at once. */ allowBulkDelete?: boolean }

/**
 * Last line of defence against a screen that lost its data overwriting the server: drops
 * deletions of many bookings at once (unless asked for) and refuses to empty a list that holds
 * several items. Such changes only come from a screen that failed to load.
 */
const guardOps = (ops: PatchOp[], opts: SaveOptions): PatchOp[] => {
  const deletes = ops.filter(o => o.op === 'deleteReservation').length;
  const base = (serverState || {}) as Record<string, unknown>;
  return ops.filter(o => {
    if (o.op === 'deleteReservation' && deletes > 3 && !opts.allowBulkDelete) { console.warn('Refused bulk delete of', deletes, 'bookings'); return false; }
    if (o.op === 'set' && Array.isArray(o.value) && o.value.length === 0 && Array.isArray(base[o.key]) && (base[o.key] as unknown[]).length >= 2) { console.warn('Refused to empty', o.key); return false; }
    return true;
  });
};

const sendAll = async (data: Partial<AllData>, opts: SaveOptions = {}) => {
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  // Never save before this screen has loaded the server's data: the screen would still hold
  // the built-in starting values, and saving them would overwrite the real data.
  if (!serverState) { console.warn('Save skipped: server data not loaded yet'); return; }
  const ops = guardOps(diffOps(data), opts);
  if (!ops.length) return;
  try {
    for (let i = 0; i < ops.length; i += 200) {
      await axios.post(`${API_URL}/api/state/patch`, { ops: ops.slice(i, i + 200), ...(opts.allowBulkDelete ? { allowBulkDelete: true } : {}) }, { headers });
    }
  } catch (error: any) {
    // Server not updated yet: fall back to the older whole-section save.
    if (error?.response?.status === 404 || error?.response?.status === 405) {
      await axios.post(`${API_URL}/api/state`, data, { headers });
    } else {
      throw error;
    }
  }
  const next = { ...(serverState || {}) };
  Object.entries(data).forEach(([k, v]) => { if (v !== undefined) next[k] = clone(v); });
  serverState = next;
};

export const saveAllData = (data: Partial<AllData>, opts: SaveOptions = {}): Promise<void> => {
  // Saves run one after another so a later save never races an earlier one.
  const run = saveQueue.then(() => sendAll(data, opts));
  saveQueue = run.catch(() => undefined);
  return run.catch((error: any) => {
    console.error('Failed to save data:', error);
    if (error?.response) console.error('Response:', error.response.status, error.response.data);
    throw error;
  });
};

export interface DataBackup { id: string; kind: 'automatic' | 'manual'; bookings?: number; fleet?: number; sources?: number; company?: string; size: number }
export const listBackups = async (): Promise<DataBackup[]> => (await axios.get(`${API_URL}/api/state/backups`, { headers: authHeaders() })).data;
export const restoreBackup = async (id: string): Promise<{ restored: string; previousDataBackup: string }> => {
  const response = await axios.post(`${API_URL}/api/state/restore`, { id }, { headers: authHeaders() });
  serverState = null; // the app reloads its data next
  return response.data;
};

/** Administrator clean-up on the server (a full backup copy is kept there first). */
export const clearDataSections = async (sections: string[]): Promise<{ backupId: string; cleared: string[] }> => {
  const response = await axios.post(`${API_URL}/api/state/clear`, { sections }, { headers: authHeaders() });
  serverState = null; // the app reloads its data next
  return response.data;
};

export const registerUser = async (email: string, password: string) => { console.error('registerUser not implemented'); return null; };
export const sendPasswordReset = async (email: string) => { console.error('sendPasswordReset not implemented'); return null; };

// --- Channel manager (OTA XML) ----------------------------------------------

export interface ChannelDeliveryLog {
  id: number;
  channelId: string;
  channelName?: string;
  direction: 'OUTBOUND' | 'INBOUND';
  messageType: string;
  version?: number;
  httpStatus?: number;
  success: boolean;
  durationMs: number;
  requestBytes: number;
  error?: string;
  responseSnippet?: string;
  actor?: string;
  createdAt: string;
}

/** Asks the server to push the last published rate sheet to the partner's endpoint. */
export const deliverChannelRates = async (channelId: string): Promise<ChannelDeliveryLog> => {
  const response = await axios.post(`${API_URL}/api/channels/${encodeURIComponent(channelId)}/deliver`, null, { headers: authHeaders() });
  return response.data;
};

// --- Booking gateway (broker bookings, webhooks, certification) ------------------

export interface ChannelBookingRow {
  reservationNumber: string; brokerReference?: string; status: string; vehicleGroup: string;
  pickupAt: string; returnAt: string; total: number; currency: string; customerName?: string;
  sandbox: boolean; createdAt: string; updatedAt?: string; fee?: number; promoCode?: string;
}
export interface ChannelStatementRow {
  reservationNumber: string; brokerReference?: string; customerName?: string; vehicleGroup: string; pickupAt: string; returnAt: string;
  status: string; total: number; fee: number; commissionable: number; commission: number; net: number; promoCode?: string;
}
export interface ChannelStatement {
  channel: string; month: string; currency: string; commissionPercent: number; rows: ChannelStatementRow[];
  bookings: number; cancelled: number; noShows: number; gross: number; fees: number; commission: number; net: number;
}
export interface ChannelInventory {
  channel_code: string; from: string; to: string;
  groups: { vehicle_group: string; name: string; fleet_size: number; days: { date: string; available: number; status: string; reason?: string }[] }[];
}
export interface ChannelWebhookRow {
  id: number; eventId: string; eventType: string; reservationNumber?: string; brokerReference?: string;
  status: 'PENDING' | 'DELIVERED' | 'FAILED'; attempts: number; lastHttpStatus?: number; lastError?: string;
  nextAttemptAt?: string; createdAt: string; deliveredAt?: string;
}
const channelPath = (id: string, p: string) => `${API_URL}/api/channels/${encodeURIComponent(id)}${p}`;
export const fetchChannelBookings = async (channelId: string): Promise<ChannelBookingRow[]> =>
  (await axios.get(channelPath(channelId, '/bookings'), { headers: authHeaders() })).data;
export const fetchChannelWebhooks = async (channelId: string): Promise<{ secretCreatedAt?: string; deliveries: ChannelWebhookRow[] }> =>
  (await axios.get(channelPath(channelId, '/webhooks'), { headers: authHeaders() })).data;
export const rotateWebhookSecret = async (channelId: string): Promise<{ secret: string; createdAt: string }> => {
  try { return (await axios.post(channelPath(channelId, '/webhooks/secret'), {}, { headers: authHeaders() })).data; }
  catch (e) { throw apiError(e, 'Could not create the signing secret.'); }
};
export const sendTestWebhook = async (channelId: string): Promise<ChannelWebhookRow> => {
  try { return (await axios.post(channelPath(channelId, '/webhooks/test'), {}, { headers: authHeaders() })).data; }
  catch (e) { throw apiError(e, 'Could not send the test event.'); }
};
export const replayWebhook = async (channelId: string, deliveryId: number): Promise<ChannelWebhookRow> =>
  (await axios.post(channelPath(channelId, `/webhooks/${deliveryId}/replay`), {}, { headers: authHeaders() })).data;
export const fetchChannelStatement = async (channelId: string, month: string): Promise<ChannelStatement> => {
  try { return (await axios.get(channelPath(channelId, '/statement'), { params: { month }, headers: authHeaders() })).data; }
  catch (e) { throw apiError(e, 'Could not load the statement.'); }
};
export const fetchChannelInventory = async (channelId: string, days?: number): Promise<ChannelInventory> => {
  try { return (await axios.get(channelPath(channelId, '/inventory'), { params: days ? { days } : {}, headers: authHeaders() })).data; }
  catch (e) { throw apiError(e, 'Could not load the inventory.'); }
};
export const pushChannelInventory = async (channelId: string): Promise<{ queued: boolean }> => {
  try { return (await axios.post(channelPath(channelId, '/inventory/push'), {}, { headers: authHeaders() })).data; }
  catch (e) { throw apiError(e, 'Could not send the inventory.'); }
};
export interface ChannelTrafficRow {
  id: number; createdAt: string; requestId?: string; format: string; operation: string; httpStatus: number; success: boolean;
  errorCode?: string; errorMessage?: string; durationMs: number; requestBytes: number; responseBytes: number; remoteIp?: string;
  sandbox: boolean; reservationNumber?: string;
}
export interface ChannelTrafficMessage extends ChannelTrafficRow { requestBody?: string; responseBody?: string }
export interface ChannelTrafficStats {
  hours: number; calls: number; errors: number; errorRate: number; avgMs: number; p95Ms: number; maxMs: number;
  searches: number; bookings: number; lookToBook: number | null; retentionDays: number;
  operations: { operation: string; calls: number; errors: number; avgMs: number }[];
  errorCodes: { code: string; count: number }[];
  series: { at: string; calls: number; errors: number }[];
}
export interface ChannelConsoleResult { status: number; durationMs: number; requestId: string; contentType?: string; body: string }
export const fetchChannelTraffic = async (channelId: string, f: { hours?: number; operation?: string; result?: string; q?: string; limit?: number }): Promise<ChannelTrafficRow[]> =>
  (await axios.get(channelPath(channelId, '/traffic'), { params: f, headers: authHeaders() })).data;
export const fetchChannelTrafficMessage = async (channelId: string, id: number): Promise<ChannelTrafficMessage> =>
  (await axios.get(channelPath(channelId, `/traffic/${id}`), { headers: authHeaders() })).data;
export const fetchChannelTrafficStats = async (channelId: string, hours: number): Promise<ChannelTrafficStats> =>
  (await axios.get(channelPath(channelId, '/traffic/stats'), { params: { hours }, headers: authHeaders() })).data;
export const sendChannelConsole = async (channelId: string, req: { format: string; operation?: string; method?: string; body?: string }): Promise<ChannelConsoleResult> => {
  try { return (await axios.post(channelPath(channelId, '/console'), req, { headers: authHeaders(), timeout: 60000 })).data; }
  catch (e) { throw apiError(e, 'The console could not send the message.'); }
};
export const runChannelCertification = async (channelId: string): Promise<import('../types').ChannelCertificationReport> => {
  try { return (await axios.post(channelPath(channelId, '/certification'), {}, { headers: authHeaders(), timeout: 60000 })).data; }
  catch (e) { throw apiError(e, 'Could not run the certification tests.'); }
};

export const fetchChannelDeliveries = async (channelId: string, limit = 50): Promise<ChannelDeliveryLog[]> => {
  const response = await axios.get(`${API_URL}/api/channels/${encodeURIComponent(channelId)}/deliveries`, {
    params: { limit },
    headers: authHeaders(),
  });
  return response.data;
};

// --- Staff accounts (server-side login accounts) -----------------------------

const apiError = (e: any, fallback: string): Error =>
  new Error(e?.response?.data?.error || (typeof e?.response?.data === 'string' ? e.response.data : '') || fallback);

/** The signed-in user as the server sees them now (fresh permissions). */
export const fetchCurrentAccount = async () => {
  const response = await axios.get(`${API_URL}/api/account/me`, { headers: authHeaders() });
  return response.data;
};

export const listStaffAccounts = async (): Promise<any[]> => {
  try {
    const response = await axios.get(`${API_URL}/api/admin/users`, { headers: authHeaders() });
    return response.data;
  } catch (e: any) {
    throw apiError(e, 'Could not load staff accounts.');
  }
};

export const createStaffAccount = async (payload: Record<string, unknown>) => {
  try {
    const response = await axios.post(`${API_URL}/api/admin/users`, payload, { headers: authHeaders() });
    return response.data;
  } catch (e: any) {
    throw apiError(e, 'Could not create the account.');
  }
};

export const updateStaffAccount = async (id: string, payload: Record<string, unknown>) => {
  try {
    const response = await axios.put(`${API_URL}/api/admin/users/${encodeURIComponent(id)}`, payload, { headers: authHeaders() });
    return response.data;
  } catch (e: any) {
    throw apiError(e, 'Could not save the account.');
  }
};

export const resetStaffPassword = async (id: string, password: string) => {
  try {
    await axios.post(`${API_URL}/api/admin/users/${encodeURIComponent(id)}/password`, { password }, { headers: authHeaders() });
  } catch (e: any) {
    throw apiError(e, 'Could not reset the password.');
  }
};

export const deleteStaffAccount = async (id: string) => {
  try {
    await axios.delete(`${API_URL}/api/admin/users/${encodeURIComponent(id)}`, { headers: authHeaders() });
  } catch (e: any) {
    throw apiError(e, 'Could not delete the account.');
  }
};

// --- Customer emails ----------------------------------------------------------

export interface CustomerEmailPayload {
  to: string;
  subject: string;
  heading: string;
  intro: string;
  rows?: [string, string][];
  closing?: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyWebsite?: string;
  /** Shown in the "Customer support" box; replies go here unless email settings name a reply-to address. */
  supportEmail?: string;
  supportPhone?: string;
  supportHours?: string;
  replyTo?: string;
  attachments?: { fileName: string; contentType: 'application/pdf' | 'text/html'; base64: string }[];
  badge?: string;
  tone?: 'success' | 'warning' | 'info';
  highlightLabel?: string;
  highlightValue?: string;
  /** 'letter': the elegant letter design (thank-you emails); default: the document design. */
  layout?: 'letter';
  /** Arabic paragraph, shown right-to-left. */
  arabic?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Signer under "With warm regards". */
  signature?: string;
  /** Letter layout: review panel ("Don't forget to rate us on …"); its button is ctaLabel / ctaUrl. */
  rateTitle?: string;
  rateText?: string;
}

export interface EmailOutcome { ok: boolean; reason?: 'unconfigured' | 'invalid' | 'failed'; message?: string }

/** Sends a branded customer email through the server. Never throws. */
export const sendCustomerEmail = async (payload: CustomerEmailPayload): Promise<EmailOutcome> => {
  try {
    await axios.post(`${API_URL}/api/notifications/customer-email`, payload, { headers: authHeaders(), timeout: 60000 });
    return { ok: true };
  } catch (e: any) {
    const status = e?.response?.status;
    const message = e?.response?.data?.error || (e?.response ? 'The email could not be sent.' : 'Cannot reach the server.');
    if (status === 503) return { ok: false, reason: 'unconfigured', message };
    if (status === 400) return { ok: false, reason: 'invalid', message };
    return { ok: false, reason: 'failed', message };
  }
};

// --- Staff activity log ---------------------------------------------------------

export interface StaffActivityEntry {
  id: string;
  occurredAt: string;
  userEmail: string;
  userName?: string;
  action: string;
  category: string;
  summary: string;
  bookingId?: string;
  details?: string;
}
export type ActivityCategory = 'auth' | 'reservation' | 'agreement' | 'charges' | 'invoice' | 'email' | 'fleet' | 'finance' | 'settings' | 'staff' | 'screen' | 'other';

/** Records something the signed-in user did. Fire-and-forget: never blocks or breaks the action. */
export const recordActivity = (action: string, category: ActivityCategory, summary: string, bookingId?: string, details?: string) => {
  try {
    if (!localStorage.getItem('token')) return;
  } catch { return; }
  axios.post(`${API_URL}/api/activity`, { action, category, summary, bookingId, details }, { headers: authHeaders(), timeout: 15000 }).catch(() => { /* offline: skip */ });
};

export interface ActivityEvent { action: string; category: ActivityCategory; summary: string; bookingId?: string; details?: string }

/** Records several events at once. keepalive lets the last batch go out while the page is closing. */
export const recordActivityBatch = (events: ActivityEvent[], keepalive = false) => {
  let token: string | null = null;
  try { token = localStorage.getItem('token'); } catch { return; }
  if (!token || !events.length) return;
  fetch(`${API_URL}/api/activity/batch`, { method: 'POST', keepalive, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(events) }).catch(() => { /* offline: skip */ });
};

/** "Still here": keeps the signed-in user's Last seen current on the server. */
export const sendHeartbeat = (deviceType: 'mobile' | 'desktop', screen?: string) => {
  try { if (!localStorage.getItem('token')) return; } catch { return; }
  axios.post(`${API_URL}/api/account/heartbeat`, { deviceType, screen }, { headers: authHeaders(), timeout: 15000 }).catch(() => { /* offline: skip */ });
};

export interface OnlineStaff { id: string; email: string; fullName?: string; position?: string; presence: 'online' | 'away'; currentScreen?: string; deviceType?: 'desktop' | 'mobile'; lastSeen?: string; lastActiveAt?: string }
/** Who is online or away right now (managers only). */
export const fetchOnlineNow = async (): Promise<OnlineStaff[]> => {
  const res = await axios.get(`${API_URL}/api/account/online`, { headers: authHeaders(), timeout: 15000 });
  return Array.isArray(res.data) ? res.data : [];
};

/** Shown as offline straight away when signing out. */
export const markSignedOut = async () => {
  try { await axios.post(`${API_URL}/api/account/signed-out`, {}, { headers: authHeaders(), timeout: 5000 }); } catch { /* offline: skip */ }
};

export const fetchActivity = async (params: { user?: string; category?: string; bookingId?: string; q?: string; from?: string; to?: string; limit?: number }): Promise<StaffActivityEntry[]> => {
  try {
    const res = await axios.get(`${API_URL}/api/activity`, { headers: authHeaders(), params });
    return res.data;
  } catch (e) { throw apiError(e, 'Could not load the activity log.'); }
};

export interface StaffActivitySummary { userEmail: string; userName?: string; events: number; lastActivity: string; byCategory: Record<string, number> }
export const fetchActivitySummary = async (days = 30): Promise<StaffActivitySummary[]> => {
  try {
    const res = await axios.get(`${API_URL}/api/activity/users`, { headers: authHeaders(), params: { days } });
    return res.data;
  } catch (e) { throw apiError(e, 'Could not load staff activity.'); }
};

// --- Outgoing email settings ----------------------------------------------------

export interface MailSettingsView {
  enabled: boolean; host: string; port: number; username: string; passwordSet: boolean;
  fromAddress: string; fromName: string; security: 'STARTTLS' | 'SSL'; replyTo?: string; source: 'app' | 'environment' | 'none';
  configured: boolean; updatedBy?: string; updatedAt?: string;
}
export const getMailSettings = async (): Promise<MailSettingsView> => {
  try { return (await axios.get(`${API_URL}/api/admin/mail-settings`, { headers: authHeaders() })).data; }
  catch (e) { throw apiError(e, 'Could not load email settings.'); }
};
export const saveMailSettings = async (s: Partial<MailSettingsView> & { password?: string }): Promise<MailSettingsView> => {
  try { return (await axios.put(`${API_URL}/api/admin/mail-settings`, s, { headers: authHeaders() })).data; }
  catch (e) { throw apiError(e, 'Could not save email settings.'); }
};
export const sendTestEmail = async (to: string): Promise<void> => {
  try { await axios.post(`${API_URL}/api/admin/mail-settings/test`, { to }, { headers: authHeaders(), timeout: 60000 }); }
  catch (e) { throw apiError(e, 'The test email could not be sent.'); }
};


/** Uploads an image (data URL) and returns its stored path, e.g. "/api/media/<id>". */
export const uploadImage = async (dataUrl: string): Promise<string> => {
  const response = await axios.post(`${API_URL}/api/media`, { dataUrl }, { headers: authHeaders() });
  return response.data.url as string;
};

/** Turns a stored media path into a full URL for <img>; other URLs (data:, https:) pass through. */
export const mediaUrl = (path?: string): string | undefined =>
  !path ? undefined : path.startsWith('/api/') ? `${API_URL}${path}` : path;
