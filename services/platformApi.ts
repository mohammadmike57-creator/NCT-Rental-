import axios from 'axios';
import { API_URL } from './api';

/** The platform admin portal (/admin): calls for platform super admins only. */

export type PlanId = 'FULL' | 'CRM' | 'XML';
export type SupplierStatus = 'ACTIVE' | 'PAUSED' | 'CLOSED';

export interface PlanOption { id: PlanId; label: string; description: string; crm: boolean; xml: boolean; permissions: string[] }
export interface PlatformMe { email: string; name: string; plans: PlanOption[] }
export interface ActivityRow { at: string; by: string; action: string; summary: string }

export interface SupplierRow {
  id: string; code: string; name: string; legalName?: string; status: SupplierStatus; plan: PlanId; planLabel: string;
  currency?: string; country?: string; timeZone?: string; testAccess: boolean; liveAccess: boolean;
  contactName?: string; contactEmail?: string; contactPhone?: string; supportEmail?: string; supportPhone?: string;
  website?: string; address?: string; notes?: string; primary: boolean; createdAt?: string; updatedAt?: string;
  /** The supplier's own sign-in address part (www.nctrental.com/s/{slug}); none for the primary supplier. */
  slug?: string | null; signInPath?: string;
  users?: number; channels?: number; brokerCalls7d?: number; brokerBookings30d?: number; lastActivity?: string | null; owner?: string | null;
}
export interface StaffRow { id: string; name: string; email: string; position?: string; active: boolean; admin: boolean; permissions: number; lastSeen?: string | null; presence: string }
export interface SupplierDetail extends SupplierRow { staff: StaffRow[]; history: ActivityRow[] }
export interface Overview {
  suppliers: number; byStatus: Record<SupplierStatus, number>; byPlan: Record<PlanId, number>; users: number; channels: number;
  brokerCalls24h: number; brokerCalls7d: number; brokerBookings30d: number; recentActivity: ActivityRow[];
}
export interface Invitation { emailSent: boolean; link: string; expiresAt: string; emailProblem?: string }

export interface SupplierForm {
  code?: string; name?: string; legalName?: string; country?: string; currency?: string; timeZone?: string; plan?: PlanId;
  testAccess?: boolean; liveAccess?: boolean; contactName?: string; contactEmail?: string; contactPhone?: string;
  supportEmail?: string; supportPhone?: string; website?: string; address?: string; notes?: string;
  ownerName?: string; ownerEmail?: string; ownerAccess?: 'invite' | 'password'; ownerPassword?: string;
  slug?: string;
}

export interface SlugCheck { slug: string; available: boolean; problem?: string; url: string }
/** Is this sign-in address free (or, with a name only, a free suggestion)? {@code id}: the supplier being edited. */
export const checkSlug = (q: { slug?: string; name?: string; id?: string }) => {
  const p = new URLSearchParams();
  if (q.slug) p.set('slug', q.slug);
  if (q.name) p.set('name', q.name);
  if (q.id) p.set('id', q.id);
  return get<SlugCheck>(`/api/platform/slug-check?${p.toString()}`);
};

/** The full sign-in address of a supplier, on the site the portal is opened on. */
export const signInUrl = (slug: string) => `${window.location.origin}/s/${slug}`;

const headers = () => {
  let t: string | null = null;
  try { t = localStorage.getItem('token'); } catch { /* storage unavailable */ }
  return { Authorization: `Bearer ${t}` };
};

/** The server's own message, or a plain fallback. */
export const problem = (e: unknown, fallback: string): string => {
  const d = (e as { response?: { data?: unknown } })?.response?.data;
  if (d && typeof d === 'object' && 'error' in d && typeof (d as { error: unknown }).error === 'string') return (d as { error: string }).error;
  if (typeof d === 'string' && d.trim() && d.length < 300) return d;
  return fallback;
};

const get = async <T>(path: string): Promise<T> => (await axios.get(`${API_URL}${path}`, { headers: headers() })).data;
const send = async <T>(method: 'post' | 'put', path: string, body: unknown): Promise<T> =>
  (await axios({ method, url: `${API_URL}${path}`, data: body, headers: headers() })).data;

export const platformMe = () => get<PlatformMe>('/api/platform/me');
export const platformOverview = () => get<Overview>('/api/platform/overview');
export const listSuppliers = () => get<SupplierRow[]>('/api/platform/suppliers');
export const supplierDetail = (id: string) => get<SupplierDetail>(`/api/platform/suppliers/${encodeURIComponent(id)}`);
export const platformActivity = (limit = 300) => get<ActivityRow[]>(`/api/platform/activity?limit=${limit}`);
export const createSupplier = (f: SupplierForm) => send<SupplierRow & { owner: string; invitation?: Invitation }>('post', '/api/platform/suppliers', f);
export const updateSupplier = (id: string, f: SupplierForm) => send<SupplierRow>('put', `/api/platform/suppliers/${encodeURIComponent(id)}`, f);
export const setSupplierStatus = (id: string, status: SupplierStatus, reason: string) =>
  send<SupplierRow>('post', `/api/platform/suppliers/${encodeURIComponent(id)}/status`, { status, reason });
export const inviteSupplierUser = (id: string, name: string, email: string) =>
  send<StaffRow & { invitation: Invitation }>('post', `/api/platform/suppliers/${encodeURIComponent(id)}/users`, { name, email });
export const newPasswordLink = (id: string, uid: string) => send<Invitation>('post', `/api/platform/suppliers/${encodeURIComponent(id)}/users/${encodeURIComponent(uid)}/link`, {});
export const setSupplierUserActive = (id: string, uid: string, active: boolean) =>
  send<StaffRow>('post', `/api/platform/suppliers/${encodeURIComponent(id)}/users/${encodeURIComponent(uid)}/status`, { active });
export const openSupportAccess = (id: string, reason: string, minutes: number) =>
  send<{ token: string; until: string; supplier: string; minutes: number }>('post', `/api/platform/suppliers/${encodeURIComponent(id)}/support`, { reason, minutes });

/** The set-password page (no sign-in). */
export const checkPasswordLink = async (token: string) => (await axios.get(`${API_URL}/auth/password-setup`, { params: { token } })).data as { email: string; name: string; company: string };
export const submitPasswordLink = async (token: string, password: string) => (await axios.post(`${API_URL}/auth/password-setup`, { token, password })).data as { email: string };
