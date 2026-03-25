import axios from 'axios';
import { RentalSource } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return {
    headers: { Authorization: `Bearer ${token}` }
  };
};

export const sourceService = {
  getAll: async (): Promise<RentalSource[]> => {
    const response = await axios.get(`${API_URL}/api/sources`, getAuthHeader());
    return response.data;
  },
  getById: async (id: string): Promise<RentalSource> => {
    const response = await axios.get(`${API_URL}/api/sources/${id}`, getAuthHeader());
    return response.data;
  },
  create: async (source: Omit<RentalSource, 'id'>): Promise<RentalSource> => {
    const response = await axios.post(`${API_URL}/api/sources`, source, getAuthHeader());
    return response.data;
  },
  update: async (id: string, source: Partial<RentalSource>): Promise<RentalSource> => {
    const response = await axios.put(`${API_URL}/api/sources/${id}`, source, getAuthHeader());
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/api/sources/${id}`, getAuthHeader());
  }
};
