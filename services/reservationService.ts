import axios from 'axios';
import { Reservation } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return {
    headers: { Authorization: `Bearer ${token}` }
  };
};

export const reservationService = {
  getAll: async (): Promise<Reservation[]> => {
    const response = await axios.get(`${API_URL}/api/reservations`, getAuthHeader());
    return response.data;
  },
  getById: async (id: string): Promise<Reservation> => {
    const response = await axios.get(`${API_URL}/api/reservations/${id}`, getAuthHeader());
    return response.data;
  },
  create: async (reservation: Omit<Reservation, 'id'>): Promise<Reservation> => {
    const response = await axios.post(`${API_URL}/api/reservations`, reservation, getAuthHeader());
    return response.data;
  },
  update: async (id: string, reservation: Partial<Reservation>): Promise<Reservation> => {
    try {
      const response = await axios.put(`${API_URL}/api/reservations/${id}`, reservation, getAuthHeader());
      return response.data;
    } catch (error: any) {
      console.error('Update failed with status', error.response?.status);
      console.error('Response data:', error.response?.data);
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      } else {
        throw error;
      }
    }
  },
  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/api/reservations/${id}`, getAuthHeader());
  }
};
