
// FIX: Updated data structure for RENTAL_SOURCES to support payment types.
import { Fleet, ExpenseCategory, RentalSource, PaymentType, UserPermission, UserStatus, User, RentalLocation, AvailableExtra, Aggregator, StopSale, TransmissionType } from './types';

export const INITIAL_YEARS = [2026];
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June', 
  'July', 'August', 'September', 'October', 'November', 'December'
];

// FIX: Updated to an array of objects to support payment type designation.
export const RENTAL_SOURCES: RentalSource[] = [
  { id: 'src-1', name: 'Website', paymentType: PaymentType.PAY_ON_ARRIVAL },
  { id: 'src-2', name: 'Booking.com', paymentType: PaymentType.PAY_ON_ARRIVAL },
  { id: 'src-3', name: 'Expedia', paymentType: PaymentType.PAY_ON_ARRIVAL },
  { id: 'src-4', name: 'Kayak', paymentType: PaymentType.PAY_ON_ARRIVAL },
  { id: 'src-5', name: 'Direct Call', paymentType: PaymentType.PAY_ON_ARRIVAL },
  { id: 'src-6', name: 'Walk-in', paymentType: PaymentType.PAY_ON_ARRIVAL },
  { id: 'src-7', name: 'Economy Booking', paymentType: PaymentType.PREPAID },
];

export const RENTAL_LOCATIONS: RentalLocation[] = [
  { id: 'loc-1', name: 'Airport Office', address: 'Queen Alia International Airport, Arrival Hall' },
  { id: 'loc-2', name: 'City Center Branch', address: '123 Main Street, Downtown Amman' },
  { id: 'loc-3', name: 'Hotel Kiosk', address: 'Grand Hyatt Amman, Lobby' },
  { id: 'loc-4', name: 'Amman Downtown', address: 'Amman Downtown' },
  { id: 'loc-5', name: 'Airport AMM', address: 'Queen Alia International Airport (AMM)' },
];


export const INITIAL_AVAILABLE_EXTRAS: AvailableExtra[] = [
  { id: 'extra-1', name: 'Additional Driver', defaultDailyPrice: 10 },
  { id: 'extra-2', name: 'WIFI', defaultDailyPrice: 5 },
  { id: 'extra-3', name: 'GPS', defaultDailyPrice: 8 },
  { id: 'extra-4', name: 'Baby Seat', defaultDailyPrice: 7 },
  { id: 'extra-5', name: 'Child Seat', defaultDailyPrice: 7 },
];

export const CAR_CATEGORIES = [
  'Compact', 
  'Crossover',
  'Economy',
  'Full size',
  'Intermediate',
  'Standard',
  'SUV',
  'Van'
];

export const INITIAL_AGGREGATORS: Aggregator[] = [
    {
        id: 'agg-1',
        name: 'Booking.com',
        connectionDetails: { apiUrl: 'https://api.booking.com/v1/xml', username: 'nct_rental', apiKey: 'abc-123' },
        termsAndConditions: 'These are the specific terms and conditions for Booking.com. Renter must present a valid passport.',
        extras: [
            { id: 'extra-1', name: 'Additional Driver', price: 12 },
            { id: 'extra-3', name: 'GPS', price: 10 },
        ],
        currentRatePlans: [
            {
                id: 'rp-low-season',
                name: 'Low Season',
                startDate: '2026-01-01',
                endDate: '2026-05-31',
                sippRates: [
                    { 
                        id: 'sipp-sdar-low',
                        sippCode: 'SDAR',
                        tiers: [
                            { id: 't1', fromDay: 1, toDay: 3, dailyPrice: 50 },
                            { id: 't2', fromDay: 4, toDay: 7, dailyPrice: 45 },
                            { id: 't3', fromDay: 8, toDay: Infinity, dailyPrice: 42 },
                        ]
                    },
                    { 
                        id: 'sipp-ifar-low',
                        sippCode: 'IFAR',
                        tiers: [
                            { id: 't4', fromDay: 1, toDay: 7, dailyPrice: 70 },
                            { id: 't5', fromDay: 8, toDay: Infinity, dailyPrice: 65 },
                        ]
                    }
                ]
            },
            {
                id: 'rp-high-season',
                name: 'High Season',
                startDate: '2026-06-01',
                endDate: '2026-09-30',
                sippRates: [
                     { 
                        id: 'sipp-sdar-high',
                        sippCode: 'SDAR',
                        tiers: [
                            { id: 't6', fromDay: 1, toDay: 7, dailyPrice: 65 },
                            { id: 't7', fromDay: 8, toDay: Infinity, dailyPrice: 60 },
                        ]
                    }
                ]
            }
        ],
        ratePlanHistory: [],
    },
    {
        id: 'agg-2',
        name: 'Expedia',
        connectionDetails: { apiUrl: 'https://api.expediapartners.com/v2/', username: 'nctrentaljo', apiKey: 'xyz-789' },
        termsAndConditions: 'Expedia bookings require full pre-payment. No refunds for cancellations within 48 hours.',
        extras: [],
        currentRatePlans: [],
        ratePlanHistory: [],
    }
];

export const INITIAL_STOP_SALES: StopSale[] = [
    {
        id: 'ss-1',
        type: 'vehicle',
        target: 'vehicle-1', // Corresponds to vehicleId
        startDate: '2026-07-10',
        endDate: '2026-07-15',
        reason: 'Scheduled Maintenance'
    },
    {
        id: 'ss-2',
        type: 'category',
        target: 'Sports', // Corresponds to category name
        startDate: '2026-12-20',
        endDate: '2026-12-28',
        reason: 'Holiday Blackout'
    }
];

// FIX: Added a constant for expense categories.
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  ExpenseCategory.SALARIES,
  ExpenseCategory.RENT,
  ExpenseCategory.UTILITIES,
  ExpenseCategory.MAINTENANCE,
  ExpenseCategory.MARKETING,
  ExpenseCategory.OFFICE_SUPPLIES,
  ExpenseCategory.OTHER,
];

// FIX: Removed 'defaultDailyRate' and 'ratePlanId' to align with new aggregator-based pricing model.
const generateInitialFleet = (): Fleet => {
  const fleetData = {
    'Toyota Camry': { count: 5, registrationExpiry: '2026-08-15', prefix: 'TC', category: 'Sedan', deposit: 200, excess: 1000, sippCode: 'SDAR', transmission: TransmissionType.AUTOMATIC },
    'Honda Civic': { count: 4, registrationExpiry: '2026-07-22', prefix: 'HC', category: 'Compact', deposit: 150, excess: 800, sippCode: 'CDAR', transmission: TransmissionType.MANUAL },
    'Ford Mustang': { count: 2, registrationExpiry: '2026-01-10', prefix: 'FM', category: 'Sports', deposit: 500, excess: 2500, sippCode: 'SSAR', transmission: TransmissionType.AUTOMATIC },
    'Chevrolet Silverado': { count: 3, registrationExpiry: '2026-11-30', prefix: 'CS', category: 'Truck', deposit: 300, excess: 1500, sippCode: 'PTAR', transmission: TransmissionType.AUTOMATIC },
    'Jeep Wrangler': { count: 3, registrationExpiry: '2026-09-05', prefix: 'JW', category: 'SUV', deposit: 350, excess: 1800, sippCode: 'IFAR', transmission: TransmissionType.MANUAL },
    'Tesla Model 3': { count: 2, registrationExpiry: '2026-03-20', prefix: 'TM3', category: 'Luxury', deposit: 700, excess: 3000, sippCode: 'PDAR', transmission: TransmissionType.AUTOMATIC },
    'BMW 3 Series': { count: 2, registrationExpiry: '2026-12-12', prefix: 'B3S', category: 'Luxury', deposit: 600, excess: 2800, sippCode: 'LDAR', transmission: TransmissionType.AUTOMATIC }
  };

  const fleet: Fleet = [];
  let idCounter = 1;

  for (const modelName in fleetData) {
    const data = fleetData[modelName as keyof typeof fleetData];
    for (let i = 1; i <= data.count; i++) {
      fleet.push({
        id: `vehicle-${idCounter++}`,
        modelName,
        licensePlate: `${data.prefix}-${i.toString().padStart(3, '0')}`,
        registrationExpiry: data.registrationExpiry,
        category: data.category,
        securityDeposit: data.deposit,
        excess: data.excess,
        sippCode: data.sippCode,
        transmission: data.transmission,
      });
    }
  }
  return fleet;
};


export const INITIAL_FLEET: Fleet = generateInitialFleet();

export const COMMISSION_RATE = 0.075;

export const USD_TO_JOD_RATE = 0.71; // Jordanian Dinar

export const MASTER_USER: User = {
    id: 'admin-user-01',
    email: 'admin@nct.com',
    fullName: 'Admin NCT',
    username: 'admin',
    password: 'admin2024',
    permissions: Object.values(UserPermission), // Grant all permissions
    status: UserStatus.ACTIVE,
    nationalId: '000000000',
    hireDate: new Date().toISOString().split('T')[0],
    position: 'System Administrator',
    baseSalaryJOD: 5000,
    isOnline: false,
    lastSeen: new Date().toISOString(),
    deviceType: 'desktop',
    webAppAccess: true,
};

export const URDRIVE_LOGO_B64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDA2IiBoZWlnaHQ9IjYyIiB2aWV3Qm94PSIwIDAgNDA2IDYyIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8dGV4dCBmaWxsPSIjMWUyOTNiIiB4bWw6c3BhY2U9InByZXNlcnZlIiBzdHlsZT0id2hpdGUtc3BhY2U6IHByZSIgZm9udC1mYW1pbHk9IkludGVyIiBmb250LXNpemU9IjY0IiBmb250LXdlaWdodD0iYm9sZCIgbGV0dGVyLXNwYWNpbmc9IjBlbSI+PHRzcGFuIHg9IjAiIHk9IjU1Ljg3MiI+VVJEUkk8L3RzcGFuPjwvdGV4dD4KPHRleHQgZmlsbD0iI0Y5NzMxNiIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSIgc3R5bGU9IndoaXRlLXNwYWNlOiBwcmUiIGZvbnQtZmFtaWx5PSJJbnRlciIgZm9udC1zaXplPSI2NCIgZm9udC13ZWlnaHQ9ImJvbGQiIGxldHRlci1zcGFjaW5nPSIwZW0iPjx0c3BhbiB4PSIyMDQuNDgiIHk9IjU1Ljg3MiI+VjwvdHNwYW4+PC90ZXh0Pgo8dGV4dCBmaWxsPSIjMWUyOTNiIiB4bWw6c3BhY2U9InByZXNlcnZlIiBzdHlsZT0id2hpdGUtc3BhY2U6IHByZSIgZm9udC1mYW1pbHk9IkludGVyIiBmb250LXNpemU9IjY0IiBmb250LXdlaWdodD0iYm9sZCIgbGV0dGVyLXNwYWNpbmc9IjBlbSI+PHRzcGFuIHg9IjI1MS4zMjgiIHk9IjU1Ljg3MiI+RS5KTzwvdHNwYW4+PC90ZXh0Pgo8L3N2Zz4=';

export const NCT_LOGIN_LOGO_B64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMTAwIiBjeT0iMTAwIiByPSI5MCIgc3Ryb2tlPSIjNDc1NTY5IiBzdHJva2Utd2lkdGg9IjgiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkxvcmEsIHNlcmlmIiBmb250LXNpemU9IjY0IiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0iIzQ3NTU2OSI+TkNUPC90ZXh0PjxwYXRoIGQ9Ik01MCAxNDAgUSAxMDAgMTIwLCAxNTAgMTQwIiBzdHJva2U9IiMxMEI5ODEiIHN0cm9rZS13aWR0aD0iOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+';

export const NCT_LOGO_B64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImdyYWQxIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3R5bGU9InN0b3AtY29sb3I6IzQ3NTU2OTtzdG9wLW9wYWNpdHk6MSIgLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojMzM0MTU1O3N0b3Atb3BhY2l0eToxIiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPGNpcmNsZSBjeD0iMTAwIiBjeT0iMTAwIiByPSI5NSIgZmlsbD0idXJsKCNncmFkMSkiIC8+CiAgPHBhdGggZD0iTSA1MCAxNTAgUSAxMDAgNTAgMTUwIDE1MCIgc3Ryb2tlPSIjMTBCOTgxIiBzdHJva2Utd2lkdGg9IjEyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8dGV4dCB4PSIxMDAiIHk9IjExNSIgZm9udC1mYW1pbHk9IkxvcmEsIHNlcmlmIiBmb250LXNpemU9IjYwIiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk5DVDwvdGV4dD4KPC9zdmc+';

// This is a public key for web push notifications.
// For a production application, you should generate your own VAPID keys.
export const VAPID_PUBLIC_KEY = 'BEl_432hDeu-2YgFB5jWmA6pP-7WfzafGTHkl3ccGCqPUoKMdwx6w3-9XAFw4wZtChv5d0-wFlxYEV26z3pVA9E';
