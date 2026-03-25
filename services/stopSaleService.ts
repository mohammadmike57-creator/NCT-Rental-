import axios from 'axios';
import { StopSale } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return {
    headers: { Authorization: `Bearer ${token}` }
  };
};

export const stopSaleService = {
  getAll: async (): Promise<StopSale[]> => {
    const response = await axios.get(`${API_URL}/api/stop-sales`, getAuthHeader());
    return response.data;
  },
  getById: async (id: string): Promise<StopSale> => {
    const response = await axios.get(`${API_URL}/api/stop-sales/${id}`, getAuthHeader());
    return response.data;
  },
  create: async (stopSale: Omit<StopSale, 'id'>): Promise<StopSale> => {
    const response = await axios.post(`${API_URL}/api/stop-sales`, stopSale, getAuthHeader());
    return response.data;
  },
  update: async (id: string, stopSale: Partial<StopSale>): Promise<StopSale> => {
    const response = await axios.put(`${API_URL}/api/stop-sales/${id}`, stopSale, getAuthHeader());
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/api/stop-sales/${id}`, getAuthHeader());
  }
};
