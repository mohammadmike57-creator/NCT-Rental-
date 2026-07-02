import axios from 'axios';
import { AllData } from '../types';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

let token: string | null = localStorage.getItem('token');

export const signInUser = async (email: string, password: string) => {
  console.log('Login attempt with:', { email, password });
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
