import axios from 'axios';
import { ActivityLog } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

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
