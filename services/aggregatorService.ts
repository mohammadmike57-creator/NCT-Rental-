import { API_BASE } from './apiBase';
import axios from 'axios';
import { Aggregator } from '../types';

const API_URL = API_BASE;

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return {
    headers: { Authorization: `Bearer ${token}` }
  };
};

export const aggregatorService = {
  getAll: async (): Promise<Aggregator[]> => {
    const response = await axios.get(`${API_URL}/api/aggregators`, getAuthHeader());
    return response.data;
  },
  getById: async (id: string): Promise<Aggregator> => {
    const response = await axios.get(`${API_URL}/api/aggregators/${id}`, getAuthHeader());
    return response.data;
  },
  create: async (aggregator: Omit<Aggregator, 'id'>): Promise<Aggregator> => {
    const response = await axios.post(`${API_URL}/api/aggregators`, aggregator, getAuthHeader());
    return response.data;
  },
  update: async (id: string, aggregator: Partial<Aggregator>): Promise<Aggregator> => {
    const response = await axios.put(`${API_URL}/api/aggregators/${id}`, aggregator, getAuthHeader());
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/api/aggregators/${id}`, getAuthHeader());
  }
};
