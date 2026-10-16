import axios from 'axios';
import { AllData } from '../types';

const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
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
