// firebase/mock.ts
// This file simulates a Firebase backend using the browser's localStorage.
// It allows the application to be developed with a "backend-ready" structure
// without needing a live Firebase project. A developer can later replace the
// functions in this file with real Firebase SDK calls.

import { AllData, AppData, CompanyDetails, Fleet, TrafficTicket, VehicleDamage } from '../types';
import { INITIAL_YEARS, MONTHS, RENTAL_SOURCES, INITIAL_FLEET, RENTAL_LOCATIONS, INITIAL_AVAILABLE_EXTRAS, INITIAL_AGGREGATORS, INITIAL_STOP_SALES } from '../constants';

const MOCK_USER = 'admin';
const MOCK_PASS = 'admin2024';
const DATA_KEY = 'NCT_RENTAL_ALL_DATA';

const generateInitialData = (years: number[]): AppData => {
  return years.reduce((acc, year) => {
    acc[year] = MONTHS.reduce((monthlyAcc, month) => {
      monthlyAcc[month] = [];
      return monthlyAcc;
    }, {} as any);
    return acc;
  }, {} as AppData);
};

const getInitialState = (): AllData => ({
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
    messages: [],
    rentalLocations: RENTAL_LOCATIONS,
    invoices: [],
    availableExtras: INITIAL_AVAILABLE_EXTRAS,
    franchisePayments: [],
    activityLog: [],
    aggregators: INITIAL_AGGREGATORS,
    stopSales: INITIAL_STOP_SALES,
    // FIX: Add missing 'years' property to satisfy the AllData type.
    years: INITIAL_YEARS,
});

// --- AUTHENTICATION ---

export const signIn = (email: string, password: string): Promise<{ uid: string; email: string } | null> => {
    console.log("MOCK: Attempting sign in...");
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (email === MOCK_USER && password === MOCK_PASS) {
                console.log("MOCK: Sign in successful.");
                resolve({ uid: 'mock-admin-uid', email: MOCK_USER });
            } else {
                console.log("MOCK: Sign in failed.");
                resolve(null);
            }
        }, 500); // Simulate network delay
    });
};


// --- DATA FETCHING & SAVING ---

export const fetchAllData = (): Promise<AllData> => {
    console.log("MOCK: Fetching all data from localStorage...");
    return new Promise((resolve) => {
        setTimeout(() => {
            let parsedData = {};
            try {
                const savedData = localStorage.getItem(DATA_KEY);
                if (savedData && savedData !== 'undefined') {
                    parsedData = JSON.parse(savedData);
                } else {
                     console.log("MOCK: No existing data found or data was invalid, returning initial state.");
                }
            } catch (error) {
                console.error("MOCK: Error parsing localStorage data, returning initial state.", error);
            }
            const initialState = getInitialState();
            const mergedData = { ...initialState, ...(parsedData && typeof parsedData === 'object' ? parsedData : {}) };
            resolve(mergedData);
        }, 700); // Simulate network delay
    });
};

export const saveAllData = (dataToSave: Partial<AllData>): Promise<void> => {
    console.log("MOCK: Saving data to localStorage...", dataToSave);
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                const currentData = JSON.parse(localStorage.getItem(DATA_KEY) || '{}');
                const newData = { ...currentData, ...dataToSave };
                localStorage.setItem(DATA_KEY, JSON.stringify(newData));
                console.log("MOCK: Save successful.");
                resolve();
            } catch (error) {
                console.error("MOCK: Error saving data to localStorage.", error);
                reject(error);
            }
        }, 300); // Simulate network delay
    });
};