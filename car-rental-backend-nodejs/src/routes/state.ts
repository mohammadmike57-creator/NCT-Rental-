import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import AppData from '../models/AppData';
import { AllData, AppData as AppDataType, YearData, UserPermission } from '../types';
import { getIO } from '../socket';
import { INITIAL_YEARS, MONTHS, RENTAL_SOURCES, INITIAL_FLEET, MASTER_USER, RENTAL_LOCATIONS, INITIAL_AVAILABLE_EXTRAS, INITIAL_AGGREGATORS, INITIAL_STOP_SALES } from '../constants';

const router = express.Router();

const getInitialState = (): AllData => {
  const data: AppDataType = {};
  for (const year of INITIAL_YEARS) {
    const yearData: YearData = {};
    for (const month of MONTHS) {
      yearData[month] = [];
    }
    data[year] = yearData;
  }
  
  const masterWithProfile = { ...MASTER_USER, permissions: [...MASTER_USER.permissions, UserPermission.VIEW_MY_PROFILE]};

  return {
    reservations: data,
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
    users: [masterWithProfile],
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
  };
};

// GET /api/state
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    let appDataDoc = await AppData.findById('main');
    if (!appDataDoc) {
      appDataDoc = new AppData({ _id: 'main', data: getInitialState() });
      await appDataDoc.save();
    }
    res.json(appDataDoc.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper deep merge
function mergeDeep(target: any, source: any): any {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = mergeDeep(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  return output;
}

function isObject(item: any): boolean {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

// POST /api/state
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const updates = req.body as Partial<AllData>;
    const appDataDoc = await AppData.findById('main');
    if (!appDataDoc) {
      return res.status(404).json({ error: 'App data not found' });
    }

    const currentData = appDataDoc.data as AllData;
    const mergedData = mergeDeep(currentData, updates);

    appDataDoc.data = mergedData;
    await appDataDoc.save();

    getIO().emit('data-updated', mergedData);

    res.json({ message: 'State updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
