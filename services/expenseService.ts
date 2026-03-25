import axios from 'axios';
import { Expense } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return {
    headers: { Authorization: `Bearer ${token}` }
  };
};

export const expenseService = {
  getAll: async (): Promise<Expense[]> => {
    const response = await axios.get(`${API_URL}/api/expenses`, getAuthHeader());
    return response.data;
  },
  getById: async (id: string): Promise<Expense> => {
    const response = await axios.get(`${API_URL}/api/expenses/${id}`, getAuthHeader());
    return response.data;
  },
  create: async (expense: Omit<Expense, 'id'>): Promise<Expense> => {
    const response = await axios.post(`${API_URL}/api/expenses`, expense, getAuthHeader());
    return response.data;
  },
  update: async (id: string, expense: Partial<Expense>): Promise<Expense> => {
    const response = await axios.put(`${API_URL}/api/expenses/${id}`, expense, getAuthHeader());
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/api/expenses/${id}`, getAuthHeader());
  }
};
