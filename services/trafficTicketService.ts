import axios from 'axios';
import { TrafficTicket } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return {
    headers: { Authorization: `Bearer ${token}` }
  };
};

export const trafficTicketService = {
  getAll: async (): Promise<TrafficTicket[]> => {
    const response = await axios.get(`${API_URL}/api/tickets`, getAuthHeader());
    return response.data;
  },
  getById: async (id: string): Promise<TrafficTicket> => {
    const response = await axios.get(`${API_URL}/api/tickets/${id}`, getAuthHeader());
    return response.data;
  },
  create: async (ticket: Omit<TrafficTicket, 'id'>): Promise<TrafficTicket> => {
    const response = await axios.post(`${API_URL}/api/tickets`, ticket, getAuthHeader());
    return response.data;
  },
  update: async (id: string, ticket: Partial<TrafficTicket>): Promise<TrafficTicket> => {
    const response = await axios.put(`${API_URL}/api/tickets/${id}`, ticket, getAuthHeader());
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/api/tickets/${id}`, getAuthHeader());
  }
};
