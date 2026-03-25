import axios from 'axios';
import { User } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

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
