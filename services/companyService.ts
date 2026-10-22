import { API_BASE } from './apiBase';
import axios from 'axios';
import { CompanyDetails } from '../types';

const API_URL = API_BASE;

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return {
    headers: { Authorization: `Bearer ${token}` }
  };
};

export const companyService = {
  get: async (): Promise<CompanyDetails> => {
    const response = await axios.get(`${API_URL}/api/company`, getAuthHeader());
    return response.data;
  },
  update: async (company: CompanyDetails): Promise<CompanyDetails> => {
    const response = await axios.put(`${API_URL}/api/company`, company, getAuthHeader());
    return response.data;
  }
};
