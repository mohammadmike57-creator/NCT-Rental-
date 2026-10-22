import { API_BASE } from './apiBase';
import axios from 'axios';
import { User } from '../types';

const API_URL = API_BASE;

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return {
    headers: { Authorization: `Bearer ${token}` }
  };
};

export const userService = {
  getCurrentUser: (): User | null => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  },
  getAll: async (): Promise<User[]> => {
    const response = await axios.get(`${API_URL}/api/users`, getAuthHeader());
    return response.data;
  },
  update: async (id: string, user: Partial<User>): Promise<User> => {
    const response = await axios.put(`${API_URL}/api/users/${id}`, user, getAuthHeader());
    return response.data;
  }
};
