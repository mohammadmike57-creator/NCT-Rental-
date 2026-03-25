import axios from 'axios';
import { RentalLocation } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return {
    headers: { Authorization: `Bearer ${token}` }
  };
};

export const locationService = {
  getAll: async (): Promise<RentalLocation[]> => {
    const response = await axios.get(`${API_URL}/api/locations`, getAuthHeader());
    return response.data;
  },
  getById: async (id: string): Promise<RentalLocation> => {
    const response = await axios.get(`${API_URL}/api/locations/${id}`, getAuthHeader());
    return response.data;
  },
  create: async (location: Omit<RentalLocation, 'id'>): Promise<RentalLocation> => {
    const response = await axios.post(`${API_URL}/api/locations`, location, getAuthHeader());
    return response.data;
  },
  update: async (id: string, location: Partial<RentalLocation>): Promise<RentalLocation> => {
    const response = await axios.put(`${API_URL}/api/locations/${id}`, location, getAuthHeader());
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/api/locations/${id}`, getAuthHeader());
  }
};
