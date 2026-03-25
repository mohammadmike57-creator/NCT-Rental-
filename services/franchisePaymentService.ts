import axios from 'axios';
import { FranchisePayment } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return {
    headers: { Authorization: `Bearer ${token}` }
  };
};

export const franchisePaymentService = {
  getAll: async (): Promise<FranchisePayment[]> => {
    const response = await axios.get(`${API_URL}/api/franchise-payments`, getAuthHeader());
    return response.data;
  },
  getById: async (id: string): Promise<FranchisePayment> => {
    const response = await axios.get(`${API_URL}/api/franchise-payments/${id}`, getAuthHeader());
    return response.data;
  },
  create: async (payment: Omit<FranchisePayment, 'id'>): Promise<FranchisePayment> => {
    const response = await axios.post(`${API_URL}/api/franchise-payments`, payment, getAuthHeader());
    return response.data;
  },
  update: async (id: string, payment: Partial<FranchisePayment>): Promise<FranchisePayment> => {
    const response = await axios.put(`${API_URL}/api/franchise-payments/${id}`, payment, getAuthHeader());
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/api/franchise-payments/${id}`, getAuthHeader());
  }
};
