import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import AppData from '../models/AppData';
import { AllData, AppData as AppDataType, YearData, User as AppUser, UserPermission, UserStatus } from '../types';
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

// Signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, fullName, ...profileData } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({ email, password: hashedPassword });
    await newUser.save();

    let appDataDoc = await AppData.findById('main');
    if (!appDataDoc) {
      appDataDoc = new AppData({ _id: 'main', data: getInitialState() });
    }
    const allData = appDataDoc.data as AllData;

    const newAppUser: AppUser = {
      id: newUser._id.toString(),
      email,
      fullName,
      username: email.split('@')[0],
      permissions: [UserPermission.VIEW_HOME_DASHBOARD, UserPermission.VIEW_MY_PROFILE],
      nationalId: profileData.nationalId || '',
      hireDate: profileData.hireDate || new Date().toISOString().split('T')[0],
      position: profileData.position || 'Agent',
      baseSalaryJOD: profileData.baseSalaryJOD || 0,
      status: UserStatus.ACTIVE,
      webAppAccess: true,
    };

    allData.users.push(newAppUser);
    appDataDoc.data = allData;
    await appDataDoc.save();

    const token = jwt.sign({ id: newUser._id, email }, process.env.JWT_SECRET!, { expiresIn: '7d' });

    res.status(201).json({ token, user: newAppUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const appDataDoc = await AppData.findById('main');
    if (!appDataDoc) {
      return res.status(500).json({ error: 'App data not found' });
    }
    const allData = appDataDoc.data as AllData;
    const appUser = allData.users.find(u => u.id === user._id.toString());

    if (!appUser || appUser.status !== UserStatus.ACTIVE) {
      return res.status(403).json({ error: 'User account is inactive or not found' });
    }

    const token = jwt.sign({ id: user._id, email }, process.env.JWT_SECRET!, { expiresIn: '7d' });

    res.json({ token, user: appUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
