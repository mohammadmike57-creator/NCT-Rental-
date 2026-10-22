import { API_BASE } from './apiBase';
import axios from 'axios';
import { AvailableExtra } from '../types';

const API_URL = API_BASE;

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return {
    headers: { Authorization: `Bearer ${token}` }
  };
};

export const extraService = {
  getAll: async (): Promise<AvailableExtra[]> => {
    const response = await axios.get(`${API_URL}/api/extras`, getAuthHeader());
    return response.data;
  },
  getById: async (id: string): Promise<AvailableExtra> => {
    const response = await axios.get(`${API_URL}/api/extras/${id}`, getAuthHeader());
    return response.data;
  },
  create: async (extra: Omit<AvailableExtra, 'id'>): Promise<AvailableExtra> => {
    const response = await axios.post(`${API_URL}/api/extras`, extra, getAuthHeader());
    return response.data;
  },
  update: async (id: string, extra: Partial<AvailableExtra>): Promise<AvailableExtra> => {
    const response = await axios.put(`${API_URL}/api/extras/${id}`, extra, getAuthHeader());
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/api/extras/${id}`, getAuthHeader());
  }
};
