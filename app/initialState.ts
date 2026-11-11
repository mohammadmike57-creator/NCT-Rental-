import { AppData, AllData, YearData } from '../types';
import { INITIAL_YEARS, MONTHS, RENTAL_SOURCES, INITIAL_FLEET, RENTAL_LOCATIONS, INITIAL_AVAILABLE_EXTRAS, INITIAL_AGGREGATORS, INITIAL_STOP_SALES } from '../constants';

/** Removes undefined values (recursively) before data is sent to the server. */
export const cleanUndefined = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj
      .map(v => cleanUndefined(v))
      .filter(v => v !== undefined);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const value = obj[key];
      if (value !== undefined) {
        acc[key] = cleanUndefined(value);
      }
      return acc;
    }, {} as any);
  }
  return obj;
};

export const generateInitialData = (years: number[]): AppData => {
  const data: AppData = {};
  for (const year of years) {
    const yearData: YearData = {};
    for (const month of MONTHS) {
      yearData[month] = [];
    }
    data[year] = yearData;
  }
  return data;
};

/** Starting data before the server's copy has loaded. */
export const getInitialState = (): AllData => ({
    reservations: generateInitialData(INITIAL_YEARS),
    sources: RENTAL_SOURCES,
    fleet: INITIAL_FLEET,
    companyDetails: {
        name: 'UR-Drive Jordan',
        subName: 'NCT Car Rental LLC',
        address: 'Amman, Jordan',
        phone: '+962 7 9999 9999',
        email: 'contact@urdrive.com',
        taxNumber: '123456789',
        requirePaymentApproval: false,
    },
    trafficTickets: [],
    vehicleDamages: [],
    users: [],
    expenses: [],
    rentalLocations: RENTAL_LOCATIONS,
    messages: [],
    invoices: [],
    availableExtras: INITIAL_AVAILABLE_EXTRAS,
    franchisePayments: [],
    activityLog: [],
    aggregators: INITIAL_AGGREGATORS,
    stopSales: INITIAL_STOP_SALES,
    years: INITIAL_YEARS,
});
