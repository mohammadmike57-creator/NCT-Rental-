import axios from 'axios';
import { Message } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return {
    headers: { Authorization: `Bearer ${token}` }
  };
};

export const messageService = {
  getAll: async (): Promise<Message[]> => {
    const response = await axios.get(`${API_URL}/api/messages`, getAuthHeader());
    return response.data;
  },
  getById: async (id: string): Promise<Message> => {
    const response = await axios.get(`${API_URL}/api/messages/${id}`, getAuthHeader());
    return response.data;
  },
  create: async (message: Omit<Message, 'id'>): Promise<Message> => {
    const response = await axios.post(`${API_URL}/api/messages`, message, getAuthHeader());
    return response.data;
  },
  update: async (id: string, message: Partial<Message>): Promise<Message> => {
    const response = await axios.put(`${API_URL}/api/messages/${id}`, message, getAuthHeader());
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/api/messages/${id}`, getAuthHeader());
  }
};
