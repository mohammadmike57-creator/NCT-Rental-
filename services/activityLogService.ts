import { API_BASE } from './apiBase';
import axios from 'axios';
import { ActivityLog } from '../types';

const API_URL = API_BASE;

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return {
    headers: { Authorization: `Bearer ${token}` }
  };
};

export const activityLogService = {
  getAll: async (): Promise<ActivityLog[]> => {
    const response = await axios.get(`${API_URL}/api/activity-log`, getAuthHeader());
    return response.data;
  },
  getById: async (id: string): Promise<ActivityLog> => {
    const response = await axios.get(`${API_URL}/api/activity-log/${id}`, getAuthHeader());
    return response.data;
  },
  // Usually no write methods for logs
};
