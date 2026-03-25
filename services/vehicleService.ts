import axios from 'axios';
import { Vehicle } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return {
    headers: { Authorization: `Bearer ${token}` }
  };
};

export const vehicleService = {
  getAll: async (): Promise<Vehicle[]> => {
    const response = await axios.get(`${API_URL}/api/vehicles`, getAuthHeader());
    return response.data;
  },
  getById: async (id: string): Promise<Vehicle> => {
    const response = await axios.get(`${API_URL}/api/vehicles/${id}`, getAuthHeader());
    return response.data;
  },
  create: async (vehicle: Omit<Vehicle, 'id'>): Promise<Vehicle> => {
    const response = await axios.post(`${API_URL}/api/vehicles`, vehicle, getAuthHeader());
    return response.data;
  },
  update: async (id: string, vehicle: Partial<Vehicle>): Promise<Vehicle> => {
    const response = await axios.put(`${API_URL}/api/vehicles/${id}`, vehicle, getAuthHeader());
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/api/vehicles/${id}`, getAuthHeader());
  }
};
