import axios from 'axios';
import { AllData } from '../types';

const configuredApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
// The server also hosts the website, so when the page is opened on the company
// domain (with or without "www") talk to that same address. Otherwise opening
// nctrental.com instead of www.nctrental.com breaks every request.
const sameOriginHost = typeof window !== 'undefined' && /(^|\.)nctrental\.com$/i.test(window.location.hostname);
const rawApiUrl = sameOriginHost ? window.location.origin : configuredApiUrl;
export const API_URL = rawApiUrl.endsWith('/') ? rawApiUrl.slice(0, -1) : rawApiUrl;

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

export const fetchInitialData = async (): Promise<AllData | null> => {
  const currentToken = localStorage.getItem('token');
  if (!currentToken) return null;
  try {
    const response = await axios.get(`${API_URL}/api/state`, {
      params: { ts: Date.now() },
      headers: {
        Authorization: `Bearer ${currentToken}`,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch initial data', error);
    throw error;
  }
};

export const saveAllData = async (data: Partial<AllData>): Promise<void> => {
  const currentToken = localStorage.getItem('token');
  try {
    await axios.post(`${API_URL}/api/state`, data, {
      headers: { Authorization: `Bearer ${currentToken}` }
    });
  } catch (error: any) {
    console.error('Failed to save data:', error);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    throw error;
  }
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
  replyTo?: string;
  attachments?: { fileName: string; contentType: 'application/pdf' | 'text/html'; base64: string }[];
  badge?: string;
  tone?: 'success' | 'warning' | 'info';
  highlightLabel?: string;
  highlightValue?: string;
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
export type ActivityCategory = 'auth' | 'reservation' | 'agreement' | 'charges' | 'invoice' | 'email' | 'fleet' | 'finance' | 'settings' | 'staff' | 'other';

/** Records something the signed-in user did. Fire-and-forget: never blocks or breaks the action. */
export const recordActivity = (action: string, category: ActivityCategory, summary: string, bookingId?: string, details?: string) => {
  try {
    if (!localStorage.getItem('token')) return;
  } catch { return; }
  axios.post(`${API_URL}/api/activity`, { action, category, summary, bookingId, details }, { headers: authHeaders(), timeout: 15000 }).catch(() => { /* offline: skip */ });
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
