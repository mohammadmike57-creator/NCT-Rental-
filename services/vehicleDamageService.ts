import axios from 'axios';
import { VehicleDamage } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return {
    headers: { Authorization: `Bearer ${token}` }
  };
};

export const vehicleDamageService = {
  getAll: async (): Promise<VehicleDamage[]> => {
    const response = await axios.get(`${API_URL}/api/damages`, getAuthHeader());
    return response.data;
  },
  getById: async (id: string): Promise<VehicleDamage> => {
    const response = await axios.get(`${API_URL}/api/damages/${id}`, getAuthHeader());
    return response.data;
  },
  create: async (damage: Omit<VehicleDamage, 'id'>): Promise<VehicleDamage> => {
    const response = await axios.post(`${API_URL}/api/damages`, damage, getAuthHeader());
    return response.data;
  },
  update: async (id: string, damage: Partial<VehicleDamage>): Promise<VehicleDamage> => {
    const response = await axios.put(`${API_URL}/api/damages/${id}`, damage, getAuthHeader());
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/api/damages/${id}`, getAuthHeader());
  }
};
