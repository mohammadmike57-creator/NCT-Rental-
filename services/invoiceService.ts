import axios from 'axios';
import { InvoiceData } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return {
    headers: { Authorization: `Bearer ${token}` }
  };
};

export const invoiceService = {
  getAll: async (): Promise<InvoiceData[]> => {
    const response = await axios.get(`${API_URL}/api/invoices`, getAuthHeader());
    return response.data;
  },
  getById: async (id: string): Promise<InvoiceData> => {
    const response = await axios.get(`${API_URL}/api/invoices/${id}`, getAuthHeader());
    return response.data;
  },
  create: async (invoice: Omit<InvoiceData, 'id'>): Promise<InvoiceData> => {
    const response = await axios.post(`${API_URL}/api/invoices`, invoice, getAuthHeader());
    return response.data;
  },
  update: async (id: string, invoice: Partial<InvoiceData>): Promise<InvoiceData> => {
    const response = await axios.put(`${API_URL}/api/invoices/${id}`, invoice, getAuthHeader());
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/api/invoices/${id}`, getAuthHeader());
  }
};
