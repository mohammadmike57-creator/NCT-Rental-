import '@testing-library/jest-dom';

// Mock Firebase
jest.mock('./firebase/config', () => ({
  auth: {
    currentUser: null,
    signInWithEmailAndPassword: jest.fn(),
    signOut: jest.fn(),
  },
  db: {
    collection: jest.fn(),
    doc: jest.fn(),
  },
}));

// Mock Firebase API
jest.mock('./firebase/api', () => ({
  fetchReservations: jest.fn(),
  createReservation: jest.fn(),
  updateReservation: jest.fn(),
  deleteReservation: jest.fn(),
  fetchVehicles: jest.fn(),
  fetchUsers: jest.fn(),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() { return []; }
  unobserve() {}
} as any;

// Mock HTML Canvas API for jsPDF
HTMLCanvasElement.prototype.getContext = jest.fn();
HTMLCanvasElement.prototype.toDataURL = jest.fn();

// Global test utilities
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
};

// Setup global test data
export const mockReservation = {
  id: 'test-reservation-1',
  personName: 'Test Customer',
  contactNumber: '+1234567890',
  customerEmail: 'test@example.com',
  bookingId: 'TEST-001',
  startDate: '2024-06-01',
  endDate: '2024-06-05',
  amount: 500,
  status: 'CONFIRMED',
};

export const mockVehicle = {
  id: 'test-vehicle-1',
  plateNumber: 'ABC-123',
  model: 'Toyota Camry',
  year: 2023,
  status: 'AVAILABLE',
};

export const mockUser = {
  id: 'test-user-1',
  email: 'agent@nct.com',
  username: 'agent',
  role: 'ADMIN',
};

export const mockCompanyDetails = {
  name: 'NCT Rental',
  address: '123 Main St',
  phone: '+1234567890',
  email: 'info@nct.com',
  website: 'https://nct.com',
  logo: 'https://nct.com/logo.png',
};
