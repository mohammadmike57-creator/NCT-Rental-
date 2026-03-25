export const INITIAL_YEARS = [2025, 2026];

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const RENTAL_SOURCES = [
  { id: '1', name: 'Website', paymentType: 'PREPAID' },
  { id: '2', name: 'Phone', paymentType: 'PAY_ON_ARRIVAL' },
  { id: '3', name: 'Walk-in', paymentType: 'PAY_ON_ARRIVAL' },
];

export const INITIAL_FLEET = [
  { id: 'v1', modelName: 'Toyota Corolla', licensePlate: '', registrationExpiry: '2026-12-31', category: 'Economy', securityDeposit: 200, excess: 500, sippCode: 'EDMR', transmission: 'AUTOMATIC' },
  { id: 'v2', modelName: 'Hyundai Accent', licensePlate: '', registrationExpiry: '2026-12-31', category: 'Economy', securityDeposit: 200, excess: 500, sippCode: 'EDMR', transmission: 'AUTOMATIC' },
  { id: 'v3', modelName: 'Kia Sportage', licensePlate: '', registrationExpiry: '2026-12-31', category: 'SUV', securityDeposit: 300, excess: 700, sippCode: 'IFAR', transmission: 'AUTOMATIC' },
];

export const MASTER_USER = {
  id: 'master',
  email: 'admin@nctrental.com',
  fullName: 'Admin User',
  username: 'admin',
  password: '$2a$10$C0eS5pXdN6yFpNynZo6JU.5HtEn/3fsHcdzDZlEBvWv.nFurpmgkO',
  permissions: [],
  status: 'ACTIVE',
};

export const RENTAL_LOCATIONS = [
  { id: 'loc1', name: 'Amman', address: 'Amman, Jordan' },
  { id: 'loc2', name: 'Aqaba', address: 'Aqaba, Jordan' },
  { id: 'loc3', name: 'Dead Sea', address: 'Dead Sea, Jordan' },
];

export const NCT_LOGIN_LOGO_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'; // truncated for brevity, keep your existing or replace with a placeholder
// For a quick placeholder, use a small base64 image. But keep your original if you have it.

export const VAPID_PUBLIC_KEY = 'BEl62iUYgUwq...'; // keep your existing key

export const INITIAL_AVAILABLE_EXTRAS = [
  { id: 'gps', name: 'GPS', pricePerDay: 5, defaultDailyPrice: 5 },
  { id: 'insurance', name: 'Full Insurance', pricePerDay: 15, defaultDailyPrice: 15 },
  { id: 'child_seat', name: 'Child Seat', pricePerDay: 8, defaultDailyPrice: 8 },
];

export const INITIAL_AGGREGATORS = [];

export const INITIAL_STOP_SALES = [];
