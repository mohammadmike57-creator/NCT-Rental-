import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { AllData, User } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

let socket: Socket;
let token: string | null = localStorage.getItem('token');
let currentUser: User | null = null;

export const initSocket = (onDataUpdate: (data: AllData) => void) => {
  if (socket) return socket;
  socket = io(API_URL);
  socket.on('connect', () => {
    console.log('Socket connected');
  });
  socket.on('data-updated', (updatedData: AllData) => {
    onDataUpdate(updatedData);
  });
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null as any;
  }
};

export const signInUser = async (email: string, password: string) => {
  const response = await axios.post(`${API_URL}/auth/login`, { email, password });
  token = response.data.token;
  currentUser = response.data.user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(currentUser));
  return { user: { uid: currentUser.id, email: currentUser.email } };
};

export const signOutUser = async () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  token = null;
  currentUser = null;
  disconnectSocket();
};

export const onAuthStateChangedListener = (callback: (user: any) => void) => {
  const storedToken = localStorage.getItem('token');
  const storedUser = localStorage.getItem('user');
  if (storedToken && storedUser) {
    token = storedToken;
    currentUser = JSON.parse(storedUser);
    callback({ uid: currentUser.id, email: currentUser.email });
  } else {
    callback(null);
  }
};

export const registerUser = async (userData: {
  email: string;
  password: string;
  username: string;
  fullName: string;
  permissions?: string[];
}) => {
  const response = await axios.post(`${API_URL}/auth/signup`, {
    email: userData.email,
    password: userData.password,
    username: userData.username,
    fullName: userData.fullName,
    permissions: userData.permissions || [],
  });
  token = response.data.token;
  currentUser = response.data.user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(currentUser));
  return currentUser.id;
};

export const sendPasswordReset = async (email: string) => {
  await axios.post(`${API_URL}/auth/reset-password?email=${email}`);
};

export const fetchInitialData = async (): Promise<AllData | null> => {
  try {
    const response = await axios.get(`${API_URL}/api/state`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch initial data', error);
    return null;
  }
};

export const saveAllData = async (data: Partial<AllData>): Promise<void> => {
  try {
    await axios.post(`${API_URL}/api/state`, data, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (error) {
    console.error('Failed to save data', error);
    throw error;
  }
};

export const onAllDataSnapshot = (callback: (docSnap: any) => void): (() => void) => {
  const handler = (updatedData: AllData) => {
    callback({
      exists: () => true,
      data: () => updatedData
    });
  };
  if (!socket) {
    initSocket(handler);
  } else {
    socket.on('data-updated', handler);
  }
  return () => {
    if (socket) {
      socket.off('data-updated', handler);
    }
  };
};
