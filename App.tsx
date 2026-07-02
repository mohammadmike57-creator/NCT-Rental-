import React, { useState, useCallback, useEffect, useMemo, useRef, Suspense } from 'react';
import { AppData, Reservation, ReservationStatus, YearData, Fleet, CompanyDetails, TrafficTicket, VehicleDamage, AllData, User, Expense, ExtensionInfo, RentalSource, PaymentType, UserPermission, Message, UserStatus, ReservationFilters, DateFilter, RentalLocation, InvoiceData, AvailableExtra, FranchisePayment, ActivityLog, Aggregator, StopSale } from './types';
import { INITIAL_YEARS, MONTHS, RENTAL_SOURCES, INITIAL_FLEET, MASTER_USER, RENTAL_LOCATIONS, NCT_LOGIN_LOGO_B64, VAPID_PUBLIC_KEY, INITIAL_AVAILABLE_EXTRAS, INITIAL_AGGREGATORS, INITIAL_STOP_SALES } from './constants';
import Tabs from './components/Tabs';
import { CogIcon, CarIcon, BuildingOfficeIcon, CloseIcon, CalendarIcon, ChartBarIcon, DocumentReportIcon, MenuIcon, ShieldExclamationIcon, ChartPieIcon, WrenchScrewdriverIcon, LogoutIcon, AccountingIcon, UsersIcon, ChevronDownIcon, InboxIcon, CalendarCheckIcon, HomeIcon, BellIcon, BellSlashIcon, CurrencyDollarIcon, ClockIcon, PlusCircleIcon, UserCircleIcon, GlobeAltIcon, CheckCircleIcon, UploadIcon, UserIcon, MailIcon, PdfIcon, ExportIcon, PlusIcon, SaveIcon, EditIcon, PaperAirplaneIcon, CancelIcon, DesktopComputerIcon, DevicePhoneMobileIcon, KeyIcon, LockClosedIcon, StopIcon, CodeBracketIcon } from './components/icons';
import LoadingSpinner from './components/LoadingSpinner';
import Notifications from './components/Notifications';
import { signOutUser, onAuthStateChangedListener, fetchInitialData, saveAllData } from './firebase/api';

// Lazy load components
const ReservationTable = React.lazy(() => import('./components/ReservationTable'));
const SummaryTable = React.lazy(() => import('./components/SummaryTable'));
const ManageSourcesView = React.lazy(() => import('./components/ManageSourcesModal'));
const Invoice = React.lazy(() => import('./components/Invoice'));
const ManageFleetView = React.lazy(() => import('./components/ManageFleetView'));
const FleetAvailability = React.lazy(() => import('./components/FleetAvailability'));
const Voucher = React.lazy(() => import('./components/Voucher'));
const Receipt = React.lazy(() => import('./components/Receipt'));
const SourcePerformanceReport = React.lazy(() => import('./components/SourcePerformanceReport'));
const TrafficTickets = React.lazy(() => import('./components/TrafficTickets'));
const VehicleDamages = React.lazy(() => import('./components/VehicleDamages'));
const LoginScreen = React.lazy(() => import('./components/LoginScreen'));
const ExtendRentalModal = React.lazy(() => import('./components/ExtendRentalModal'));
const ManageCompanyDetailsView = React.lazy(() => import('./components/ManageCompanyDetailsView'));
const ManageYearsView = React.lazy(() => import('./components/ManageYearsView'));
const UserManagement = React.lazy(() => import('./components/UserManagement'));
const AccountingDashboard = React.lazy(() => import('./components/AccountingDashboard'));
const InternalMessages = React.lazy(() => import('./components/InternalMessages'));
const TodaysReservations = React.lazy(() => import('./components/TodaysReservations'));
const HomePage = React.lazy(() => import('./components/HomePage'));
const ManageLocationsView = React.lazy(() => import('./components/ManageLocationsView'));
const DeferredPayments = React.lazy(() => import('./components/DeferredPayments'));
const LateReturns = React.lazy(() => import('./components/LateReturns'));
const PaymentApprovals = React.lazy(() => import('./components/PaymentApprovals'));
const ManageExtrasView = React.lazy(() => import('./components/ManageExtrasView'));
const ProfileView = React.lazy(() => import('./components/ProfileView'));
const AggregatorSetupView = React.lazy(() => import('./components/AggregatorSetupView'));
const UserActivityLogView = React.lazy(() => import('./components/UserActivityLogView'));
const ExcelUpload = React.lazy(() => import('./components/ExcelUpload'));
const FleetExcelUpload = React.lazy(() => import('./components/FleetExcelUpload'));

const USERS_CACHE_KEY = 'NCT_USERS_CACHE';

// Utility to remove undefined values recursively
const cleanUndefined = (obj: any): any => {
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

// Animated Modal Wrapper
const AnimatedModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  children: React.ReactNode;
  className?: string;
}> = ({ isOpen, onClose, children, className = "" }) => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [animationClass, setAnimationClass] = useState("");

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setAnimationClass("animate-modal-enter");
    } else {
      setAnimationClass("animate-modal-exit");
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300); // match duration of animate-modal-exit
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto ${className}`}>
      <div 
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`} 
        onClick={onClose}
      />
      <div className={`relative w-full max-w-5xl z-10 ${animationClass}`}>
        {children}
      </div>
    </div>
  );
};

const generateInitialData = (years: number[]): AppData => {
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

const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

const ConfirmationMessage: React.FC<{ message: string; onClose: () => void; }> = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div className="fixed bottom-5 right-5 bg-green-500 text-white py-3 px-6 rounded-lg shadow-lg z-50 animate-in slide-in-from-bottom-2 fade-in">
      <p>{message}</p>
    </div>
  );
};

interface Notification {
  id: string;
  message: string;
  type: 'warning' | 'error' | 'info';
  title?: string;
  vehicleInfo?: { modelName: string; licensePlate: string };
}

interface SidebarLink {
    name: string;
    icon: React.FC<any>;
    permission: UserPermission;
    badge?: number;
}

const SidebarSection: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => {
    const [isOpen, setIsOpen] = useState(true);
    return (
        <div>
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider hover:bg-slate-700/50 rounded-md">
                {title}
                <ChevronDownIcon className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && <div className="pl-3 pt-1 space-y-1">{children}</div>}
        </div>
    );
};

const hasPermission = (user: User | null, permission: UserPermission): boolean => {
    if (!user) return false;
    return user.permissions?.includes(permission) ?? false;
};

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const saveStatusRef = useRef<'saved' | 'saving' | 'error'>('saved');
  useEffect(() => {
    saveStatusRef.current = saveStatus;
  }, [saveStatus]);
  
  // State for each data slice
  const [reservations, setReservations] = useState<AppData>({});
  const [sources, setSources] = useState<RentalSource[]>([]);
  const [fleet, setFleet] = useState<Fleet>(INITIAL_FLEET);
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails>({ name: 'UR-Drive Jordan', subName: '', address: '', phone: '', email: '', taxNumber: '', requirePaymentApproval: false });
  const [trafficTickets, setTrafficTickets] = useState<TrafficTicket[]>([]);
  const [vehicleDamages, setVehicleDamages] = useState<VehicleDamage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [rentalLocations, setRentalLocations] = useState<RentalLocation[]>([]);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [availableExtras, setAvailableExtras] = useState<AvailableExtra[]>([]);
  const [franchisePayments, setFranchisePayments] = useState<FranchisePayment[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [aggregators, setAggregators] = useState<Aggregator[]>([]);
  const [stopSales, setStopSales] = useState<StopSale[]>([]);
  
  const [years, setYears] = useState<number[]>(INITIAL_YEARS);
  
  // Set initial selected year/month to current date
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>(MONTHS[new Date().getMonth()]);
  
  // Track whether user manually changed selection
  const userSelectedRef = useRef(false);
  
  // Wrapper setters to mark user interaction
  const handleSetSelectedYear = (year: number) => {
    userSelectedRef.current = true;
    setSelectedYear(year);
  };
  const handleSetSelectedMonth = (month: string) => {
    userSelectedRef.current = true;
    setSelectedMonth(month);
  };
  
  const [mainView, setMainView] = useState('Home');
  const [newReservations, setNewReservations] = useState<Reservation[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopView, setIsDesktopView] = useState(window.innerWidth >= 1024);

  const [filters, setFilters] = useState<ReservationFilters>({
    sourceFilter: '',
    carModelFilter: '',
    statusFilter: '',
    durationFilter: '',
    bookingIdSearch: '',
    dateFilter: '',
    voucherSubmitted: undefined,
    dropOffCompleted: undefined,
  });
  const [presetFilters, setPresetFilters] = useState<ReservationFilters | null>(null);
  
  const [modals, setModals] = useState({
      viewVoucher: null as { reservation: Reservation; year: number; month: string } | null,
      viewReceipt: null as Reservation | null,
      viewRentalVoucher: null as { reservation: Reservation; year: number; month: string } | null,
  });
  
  const [reservationToExtend, setReservationToExtend] = useState<Reservation | null>(null);
  const [reservationToAddExtras, setReservationToAddExtras] = useState<Reservation | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [messageToCompose, setMessageToCompose] = useState<{ subject: string; body: string } | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);

  // Force table remount when data changes or year/month changes (now only used for logging)
  const [tableKey, setTableKey] = useState(0);

  const isInitialDataLoad = useRef(true);
  const skipAutoSaveRef = useRef(false);
  const recurringAlertsTrackerRef = useRef<Record<string, number>>({});
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const blockPollingUntilRef = useRef<number>(0); // Timestamp to block polling until

  // Auto-save logic
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const addNotification = useCallback((message: string, type: Notification['type'], title?: string) => {
    const id = `notif-${Date.now()}-${Math.random()}`;
    setNotifications(prev => [...prev, { id, message, type, title }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);
  
  const handleDataUpdate = (data: AllData) => {
      if (!data) return;

      console.log('🔄 DATA UPDATE STARTED - Loading from backend');

      skipAutoSaveRef.current = true;
      const initialState = getInitialState();
      
      const rawReservations = data.reservations || initialState.reservations;
      const yearsFromReservations = Object.keys(rawReservations).map(Number).filter(n => !isNaN(n));
      const loadedYears = [...new Set([...(data.years || []), ...yearsFromReservations, ...initialState.years!])].sort((a,b) => a - b);
      
      setYears(loadedYears);
      if (!loadedYears.includes(selectedYear) && loadedYears.length > 0) {
          handleSetSelectedYear(loadedYears[0] || new Date().getFullYear());
      }

      // CRITICAL: Accept backend data structure AS-IS with minimal reorganization
      // Only ensure year/month structure exists, but don't move reservations around
      const finalReservations: AppData = {};

      // Initialize structure for all years
      loadedYears.forEach(y => {
          finalReservations[y] = {};
          MONTHS.forEach(m => finalReservations[y][m] = []);
      });

      let lockedCount = 0;
      let totalCount = 0;

      // Copy reservations directly from backend location - NO REORGANIZATION
      Object.keys(rawReservations).forEach(yearKey => {
          const yearNum = parseInt(yearKey);
          const yearData = rawReservations[yearKey as any];
          if (!yearData) return;

          Object.keys(yearData).forEach(monthKey => {
              const monthList = yearData[monthKey];
              if (Array.isArray(monthList)) {
                  // Ensure the destination bucket exists
                  if (!finalReservations[yearNum]) {
                      finalReservations[yearNum] = {};
                      MONTHS.forEach(m => finalReservations[yearNum][m] = []);
                  }
                  if (!finalReservations[yearNum][monthKey]) {
                      finalReservations[yearNum][monthKey] = [];
                  }

                  // Copy ALL reservations from this location to the SAME location
                  // NO reorganization based on dates or any other logic
                  monthList.forEach((res: Reservation) => {
                      if (res.importLockedYear !== undefined && res.importLockedMonth !== undefined) {
                          lockedCount++;
                      }
                      totalCount++;

                      // Add to the EXACT same location where backend stored it
                      if (!finalReservations[yearNum][monthKey].some(r => r.id === res.id)) {
                          finalReservations[yearNum][monthKey].push(res);
                      }
                  });
              }
          });
      });

      console.log('🔄 DATA LOADED FROM BACKEND:', {
        totalReservations: totalCount,
        lockedReservations: lockedCount,
        message: 'Loaded exactly as stored - NO reorganization performed'
      });

      setReservations(finalReservations);
      setSources(data.sources || initialState.sources);
      setFleet(data.fleet || initialState.fleet);
      setCompanyDetails({
        ...initialState.companyDetails,
        ...(data.companyDetails || {}),
      });
      setTrafficTickets(data.trafficTickets || initialState.trafficTickets);
      setVehicleDamages(data.vehicleDamages || initialState.vehicleDamages);
      
      // Users: prioritize localStorage over backend
      const storedUsers = localStorage.getItem(USERS_CACHE_KEY);
      if (storedUsers) {
          try {
              const parsed = JSON.parse(storedUsers);
              if (Array.isArray(parsed) && parsed.length > 0) {
                  setUsers(parsed);
              } else {
                  setUsers(data.users || initialState.users);
              }
          } catch (e) {
              setUsers(data.users || initialState.users);
          }
      } else {
          setUsers(data.users || initialState.users);
      }

      setExpenses(data.expenses || initialState.expenses);
      setMessages(data.messages || initialState.messages);
      setRentalLocations(data.rentalLocations || initialState.rentalLocations);
      setInvoices(data.invoices || initialState.invoices);
      setAvailableExtras(data.availableExtras || initialState.availableExtras);
      setFranchisePayments(data.franchisePayments || initialState.franchisePayments);
      setActivityLog(data.activityLog || initialState.activityLog);
      setAggregators(data.aggregators || initialState.aggregators);
      setStopSales(data.stopSales || initialState.stopSales);

      setTableKey(prev => prev + 1);
      console.log('Data updated, table key incremented to', tableKey + 1);
  };

  // Polling function to fetch full state from /api/state – now uses fetchInitialData
  const fetchAllData = useCallback(async () => {
    console.log('fetchAllData called');

    // Check if polling is blocked (e.g., after import)
    const now = Date.now();
    if (blockPollingUntilRef.current > now) {
      console.log('🚫 Polling blocked for', Math.round((blockPollingUntilRef.current - now) / 1000), 'more seconds (recent import)');
      return;
    }

    try {
      const data = await fetchInitialData();
      if (!data) return;

      // If we are currently saving or have unsaved changes, do not overwrite local state
      if (saveStatusRef.current !== 'saved') {
          console.log('Save in progress or pending, ignoring fetched data to prevent overwrite');
          return;
      }

      console.log('Data received:', data);
      handleDataUpdate(data);
    } catch (error) {
      console.error('Polling fetch failed', error);
      addNotification('Failed to sync data', 'error');
    }
  }, []);

  // Compute flat list of reservations for auto‑selection
  const allReservationsFlat = useMemo(() => {
    return Object.values(reservations).flatMap((y: YearData) => Object.values(y).flat() as Reservation[]);
  }, [reservations]);

  // Auto‑select the most recent reservation's year/month only if user hasn't manually chosen
  useEffect(() => {
    if (!isLoading && allReservationsFlat.length > 0 && !userSelectedRef.current) {
      const mostRecent = allReservationsFlat.reduce((latest, current) => {
        const currentDate = new Date(current.startDate);
        const latestDate = new Date(latest.startDate);
        return currentDate > latestDate ? current : latest;
      }, allReservationsFlat[0]);
      
      const date = new Date(mostRecent.startDate);
      const year = date.getFullYear();
      const month = MONTHS[date.getMonth()];
      
      if (selectedYear !== year || selectedMonth !== month) {
        handleSetSelectedYear(year);
        handleSetSelectedMonth(month);
      }
    }
  }, [isLoading, allReservationsFlat]);

  useEffect(() => {
      const cachedUsers = localStorage.getItem(USERS_CACHE_KEY);
      if (cachedUsers) {
          try {
              const parsedUsers = JSON.parse(cachedUsers);
              if (Array.isArray(parsedUsers) && parsedUsers.length > 0) {
                  setUsers(prev => {
                      return (prev.length <= 1) ? parsedUsers : prev;
                  });
              }
          } catch (e) {
              console.error("Failed to parse user cache", e);
          }
      }
  }, []);

  useEffect(() => {
      if (users.length > 1) { 
        localStorage.setItem(USERS_CACHE_KEY, JSON.stringify(users));
      }
  }, [users]);

  const isAuthenticated = !!currentUser;

  useEffect(() => {
    // On mount, if token exists, fetch data (for page refresh)
    const token = localStorage.getItem("token");
    if (token) {
      fetchAllData();
    }

    const unsubscribe = onAuthStateChangedListener((user) => {
      setCurrentUser(user);
      setAuthChecked(true);
      if (user) {
        setIsLoading(false);
        fetchAllData(); // Fetch immediately after login
        pollingIntervalRef.current = setInterval(() => {
            if (saveStatusRef.current !== 'saving') {
                fetchAllData();
            }
        }, 15000);
      } else {
        // Load initial state from constants
        handleDataUpdate(getInitialState());
        setIsLoading(false);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      }
    });
    return () => {
      unsubscribe();
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktopView(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if ('Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window) {
        const permission = Notification.permission;
        setNotificationPermission(permission);
        if (permission === 'granted') {
            navigator.serviceWorker.ready.then(registration => {
                registration.pushManager.getSubscription().then(subscription => {
                    setIsPushSubscribed(!!subscription);
                });
            });
        }
    }
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (saveStatus === 'saving') {
            const message = "Changes are still saving. If you leave now, you may lose data.";
            e.returnValue = message;
            return message;
        }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  useEffect(() => {
      if (currentUser) {
          const dbUser = users.find(u => u.id === currentUser.id);
          if (dbUser && (dbUser.webAppAccess === false || dbUser.status !== UserStatus.ACTIVE)) {
              alert("Your access has been revoked.");
              signOutUser();
              return;
          }
      }

      if (!currentUser || isLoading) return;

      const updatePresence = () => {
           const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
           const deviceType = isMobile ? 'mobile' : 'desktop';
           
           setUsers(prevUsers => {
               const userIndex = prevUsers.findIndex(u => u.id === currentUser.id);
               if (userIndex === -1 && currentUser.id !== MASTER_USER.id) return prevUsers;

               const userToUpdate = userIndex > -1 ? prevUsers[userIndex] : currentUser;
               
               const updatedUser = {
                   ...userToUpdate,
                   isOnline: true,
                   lastSeen: new Date().toISOString(),
                   deviceType: deviceType as 'desktop' | 'mobile',
                   webAppAccess: userToUpdate.webAppAccess ?? true
               };
               
               if (
                   userToUpdate.isOnline !== updatedUser.isOnline ||
                   userToUpdate.deviceType !== updatedUser.deviceType ||
                   Math.abs(new Date(userToUpdate.lastSeen || 0).getTime() - new Date(updatedUser.lastSeen).getTime()) > 59000 
               ) {
                   if (userIndex > -1) {
                        const newUsers = [...prevUsers];
                        newUsers[userIndex] = updatedUser;
                        return newUsers;
                   }
               }
               return prevUsers;
           });
      };
      
      updatePresence();
      const interval = setInterval(updatePresence, 60000); 
      
      return () => clearInterval(interval);

  }, [users, currentUser, isLoading]);

  const showConfirmation = (message: string) => {
    setConfirmation(message);
  };

  const executeAutoSave = useCallback(async () => {
    if (!isAuthenticated) return;
    setSaveStatus('saving');
    
    const allData: AllData = {
        reservations, sources, fleet, companyDetails,
        trafficTickets, vehicleDamages, users, expenses, messages, rentalLocations, invoices,
        availableExtras, franchisePayments,
        activityLog,
        aggregators,
        stopSales,
        years,
    };

    try {
        const cleanData = cleanUndefined(allData);
        await saveAllData(cleanData);
        setSaveStatus('saved');
        setLastSaved(new Date().toLocaleTimeString());
    } catch (err) {
        console.error("Failed to auto-save data:", err);
        setSaveStatus('error');
        addNotification("Auto-save failed. Please check your connection.", 'error');
    }
  }, [
      isAuthenticated, reservations, sources, fleet, companyDetails, trafficTickets, vehicleDamages, users, expenses, messages, rentalLocations, invoices, availableExtras, franchisePayments, activityLog, aggregators, stopSales, years, addNotification
  ]);

  useEffect(() => {
    if (isLoading || isInitialDataLoad.current) {
        if (!isLoading) isInitialDataLoad.current = false;
        return;
    }

    if (skipAutoSaveRef.current) {
        console.log("Skipping auto-save because data was just updated from backend or manual save.");
        skipAutoSaveRef.current = false;
        return;
    }

    if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
    }
    
    setSaveStatus('saving');

    timeoutRef.current = setTimeout(() => {
        console.log("Auto-saving data after 2 seconds of inactivity...");
        executeAutoSave();
    }, 2000);

    return () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
    };
  }, [reservations, sources, fleet, companyDetails, trafficTickets, vehicleDamages, users, expenses, messages, rentalLocations, invoices, availableExtras, franchisePayments, activityLog, aggregators, stopSales, years, isLoading, executeAutoSave]);

  useEffect(() => {
    if (authChecked && !isLoading && currentUser && !users.some(u => u.id === currentUser.id)) {
        setUsers(prev => [...prev, currentUser]);
        showConfirmation('Your user profile was restored.');
    }
  }, [authChecked, isLoading, currentUser, users]);
  
    const handleBatchUpdateReservations = useCallback((updatedReservations: Reservation[]) => {
        setReservations(prev => {
            const newReservationsData = JSON.parse(JSON.stringify(prev)) as AppData;
            updatedReservations.forEach(updatedRes => {
                const dateObj = new Date(updatedRes.startDate);
                const year = dateObj.getFullYear();
                const month = MONTHS[dateObj.getMonth()];
                if (newReservationsData[year]?.[month]) {
                    const resIndex = newReservationsData[year][month].findIndex((r: Reservation) => r.id === updatedRes.id);
                    if (resIndex > -1) {
                        newReservationsData[year][month][resIndex] = { ...updatedRes, lastEditedBy: 'System Automation' };
                    }
                }
            });
            return newReservationsData;
        });
    }, []);

    useEffect(() => {
        if (isLoading) return;
    
        const performPeriodicChecks = () => {
            const now = new Date();
            const nowTime = now.getTime();
            const oneHour = 60 * 60 * 1000;
            const twoHours = 2 * oneHour;
            const twentyFourHours = 24 * oneHour;

            const sendPushNotification = (title: string, body: string, tag: string) => {
                if (notificationPermission === 'granted' && 'serviceWorker' in navigator && 'showNotification' in ServiceWorkerRegistration.prototype) {
                    navigator.serviceWorker.ready.then(registration => {
                        registration.showNotification(title, { body, icon: '/images/icons/icon-192.png', badge: '/images/icons/icon-192.png', tag });
                    });
                }
            };
    
            const activeRecurringAlerts = new Set<string>();
    
            allReservationsFlat.forEach(res => {
                if (res.status === ReservationStatus.CONFIRMED && !res.voucherSubmitted) {
                    const startTime = new Date(res.startDate).getTime();
                    const timeToPickup = startTime - nowTime;
                    if (timeToPickup > 0 && timeToPickup <= twentyFourHours) {
                        const alertKey = `pickup-${res.id}`;
                        activeRecurringAlerts.add(alertKey);
                        const lastAlertTime = recurringAlertsTrackerRef.current[alertKey];
                        if (!lastAlertTime || nowTime - lastAlertTime > oneHour) {
                            const hoursRemaining = (timeToPickup / oneHour).toFixed(0);
                            const title = 'Upcoming Pickup Reminder';
                            const body = `Reservation for ${res.personName} (${res.carModel}) is due for pickup in ~${hoursRemaining} hour(s).`;
                            addNotification(body, 'info', title);
                            sendPushNotification(title, body, alertKey);
                            recurringAlertsTrackerRef.current[alertKey] = nowTime;
                        }
                    }
                }
    
                if (res.status === ReservationStatus.CONFIRMED && res.voucherSubmitted && !res.dropOffCompleted) {
                     const endTime = new Date(res.endDate).getTime();
                     if (nowTime > endTime + twoHours) {
                        const alertKey = `dropoff-${res.id}`;
                        activeRecurringAlerts.add(alertKey);
                        const lastAlertTime = recurringAlertsTrackerRef.current[alertKey];
                        if (!lastAlertTime || nowTime - lastAlertTime > oneHour) {
                            const hoursOverdue = ((nowTime - endTime) / oneHour).toFixed(0);
                            const title = 'Overdue Return Alert';
                            const body = `Rental for ${res.personName} (${res.carModel}) is overdue by ${hoursOverdue} hour(s). Please close or extend the agreement.`;
                            addNotification(body, 'warning', title);
                            sendPushNotification(title, body, alertKey);
                            recurringAlertsTrackerRef.current[alertKey] = nowTime;
                        }
                     }
                }
            });
    
            Object.keys(recurringAlertsTrackerRef.current).forEach(key => {
                if (!activeRecurringAlerts.has(key)) {
                    delete recurringAlertsTrackerRef.current[key];
                }
            });
        };
    
        const intervalId = setInterval(performPeriodicChecks, 60 * 1000);
        performPeriodicChecks();
    
        return () => clearInterval(intervalId);
    }, [isLoading, allReservationsFlat, fleet, notificationPermission, addNotification]);
  
  const handleEnableNotifications = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        addNotification('Push notifications are not supported by your browser.', 'error');
        return;
    }
    try {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        if (permission === 'granted') {
            const registration = await navigator.serviceWorker.ready;
            const existingSubscription = await registration.pushManager.getSubscription();
            if (existingSubscription) {
                setIsPushSubscribed(true);
                return;
            }
            await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
            setIsPushSubscribed(true);
            showConfirmation('Notifications enabled successfully!');
        } else {
            addNotification('Notifications permission denied.', 'warning');
        }
    } catch (error) {
        console.error('Error enabling notifications:', error);
        addNotification('Failed to enable notifications.', 'error');
    }
  };

  const handleDisableNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        addNotification('Push notifications are not supported.', 'error');
        return;
    }
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            const unsubscribed = await subscription.unsubscribe();
            if (unsubscribed) {
                setIsPushSubscribed(false);
                showConfirmation('Notifications disabled successfully.');
            }
        } else {
             setIsPushSubscribed(false);
        }
    } catch (error) {
        console.error('Error disabling notifications:', error);
        addNotification('Failed to disable notifications.', 'error');
    }
  };

  const handleLogout = async () => {
    try {
      await signOutUser();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setCurrentUser(null);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };
  
  const handleUpdateReservations = useCallback(async (reservation: Reservation, oldYear: number, oldMonth: string) => {
    const updatedReservation = { ...reservation, lastEditedBy: currentUser?.fullName };

    if (reservation.isNew) {
        setNewReservations(prev => prev.map(r => r.id === reservation.id ? updatedReservation : r));
        return;
    }

    if (updatedReservation.bookingId && updatedReservation.bookingId.trim()) {
        const trimmedId = updatedReservation.bookingId.trim().toLowerCase();
        if (allReservationsFlat.some(r => r.id !== updatedReservation.id && r.bookingId && r.bookingId.trim().toLowerCase() === trimmedId)) {
            alert(`Error: A reservation with Booking ID "${updatedReservation.bookingId}" already exists. Please use a unique ID.`);
            return;
        }
    }
    
    if (!updatedReservation.startDate) {
        alert('Start Date is required for a reservation.');
        return;
    }

    const targetYear = oldYear;
    const targetMonth = oldMonth;

    // NEVER change the storage location based on dates anymore.
    // The bucket (targetYear/targetMonth) is permanent.
    const reservationToSave = { 
        ...updatedReservation,
        importLockedYear: targetYear,
        importLockedMonth: targetMonth
    };

    setSaveStatus('saving');

    const newReservationsData = JSON.parse(JSON.stringify(reservations)) as AppData;

    // Update in the specific bucket
    if (!newReservationsData[targetYear]) {
         newReservationsData[targetYear] = {};
         MONTHS.forEach(m => newReservationsData[targetYear][m] = []);
    }
    if (!newReservationsData[targetYear][targetMonth]) {
         newReservationsData[targetYear][targetMonth] = [];
    }

    newReservationsData[targetYear][targetMonth] = newReservationsData[targetYear][targetMonth].map((res: Reservation) => 
        res.id === reservationToSave.id ? reservationToSave : res
    );

    // If for some reason it wasn't in that bucket (shouldn't happen with oldYear/oldMonth), add it
    if (!newReservationsData[targetYear][targetMonth].some((r: Reservation) => r.id === reservationToSave.id)) {
        newReservationsData[targetYear][targetMonth].push(reservationToSave);
    }

    try {
      skipAutoSaveRef.current = true;
      // OPTIMIZED SAVE: Only send the modified year/month to prevent race conditions on other months
      await saveAllData({ 
        reservations: { 
          [targetYear]: { 
            [targetMonth]: newReservationsData[targetYear][targetMonth] 
          } 
        } 
      });
      setReservations(newReservationsData);
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      console.error("Failed to save updated reservation:", err);
      addNotification("Failed to save changes. Check connection.", 'error');
    }
  }, [currentUser, allReservationsFlat, reservations, addNotification]);
  
  const handleUpdateSingleReservation = (updatedReservation: Reservation) => {
    let foundYear = -1;
    let foundMonth = '';
    
    outerLoop:
    for (const year in reservations) {
        for (const month in reservations[year]) {
            if (reservations[year][month].some(r => r.id === updatedReservation.id)) {
                foundYear = parseInt(year);
                foundMonth = month;
                break outerLoop;
            }
        }
    }
    
    if (foundYear !== -1) {
        handleUpdateReservations(updatedReservation, foundYear, foundMonth);
    } else if (updatedReservation.startDate) {
            const d = new Date(updatedReservation.startDate);
            handleUpdateReservations(updatedReservation, d.getFullYear(), MONTHS[d.getMonth()]);
    }
  };

  const handleAddNewReservation = (status: ReservationStatus = ReservationStatus.CONFIRMED) => {
    setNewReservations(prev => [...prev, {
      id: `new-${Date.now()}`,
      isNew: true,
      personName: '',
      contactNumber: '',
      bookingId: '', 
      source: '',
      bookingDate: new Date().toISOString().split('T')[0],
      startDate: '', endDate: '', carModel: '', notes: '',
      locationName: '',
      status: status,
      amount: 0,
    }]);
  };
  
  const handleSaveNewReservation = async (reservation: Reservation) => {
      const { isNew, id: transientId, ...newRes } = reservation;
      
      if (!newRes.startDate) {
          alert('A Start Date is required to save a new reservation.');
          return;
      }

      if (newRes.bookingId && newRes.bookingId.trim()) {
        const trimmedId = newRes.bookingId.trim().toLowerCase();
        if (allReservationsFlat.some(r => r.bookingId && r.bookingId.trim().toLowerCase() === trimmedId)) {
            alert(`Error: A reservation with Booking ID "${newRes.bookingId}" already exists. Please use a unique ID.`);
            return;
        }
      }
      
      // ALWAYS save new reservations into the CURRENTLY SELECTED month/year
      // This is the "selected month during import is the permanent storage location" rule applied to manual entry too.
      const year = selectedYear;
      const month = selectedMonth;
      
      const reservationId = `res-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      const reservationToSave: Reservation = {
          ...newRes,
          id: reservationId,
          createdBy: currentUser?.fullName,
          importLockedYear: year,
          importLockedMonth: month,
      };

      setSaveStatus('saving');
      
      const nextReservations = JSON.parse(JSON.stringify(reservations)) as AppData;
      if (!nextReservations[year]) {
           nextReservations[year] = {};
           MONTHS.forEach(m => nextReservations[year][m] = []);
      }
      if (!nextReservations[year][month]) {
          nextReservations[year][month] = [];
      }
      nextReservations[year][month].push(reservationToSave);

      try {
        skipAutoSaveRef.current = true;
        // OPTIMIZED SAVE: Only send the new month's data
        await saveAllData({ 
          reservations: { 
            [year]: { 
              [month]: nextReservations[year][month] 
            } 
          } 
        });
        setReservations(nextReservations);
        setSaveStatus('saved');
        showConfirmation(`Reservation for ${reservationToSave.personName} saved into ${month} ${year}.`);
        setNewReservations(prev => prev.filter(r => r.id !== transientId));
      } catch (err) {
        setSaveStatus('error');
        console.error("Failed to save new reservation:", err);
        addNotification("Failed to save reservation. Check connection.", 'error');
      }
  };

  const handleDeleteReservation = async (id: string, isNew?: boolean, year?: number, month?: string) => {
    if (isNew) {
      setNewReservations(prev => prev.filter(res => res.id !== id));
      return;
    }

    setSaveStatus('saving');
    const nextReservations = JSON.parse(JSON.stringify(reservations)) as AppData;
    let found = false;

    for (const y in nextReservations) {
        for (const m in nextReservations[y]) {
            const initialCount = nextReservations[y][m].length;
            nextReservations[y][m] = nextReservations[y][m].filter((res: Reservation) => res.id !== id);
            if (nextReservations[y][m].length < initialCount) found = true;
        }
    }

    if (!found) {
        setSaveStatus('saved');
        return;
    }

    try {
      skipAutoSaveRef.current = true;
      // Find which year/month the reservation was in to optimize save
      let targetYear: number | null = null;
      let targetMonth: string | null = null;
      
      for (const y in reservations) {
        for (const m in reservations[y]) {
          if (reservations[y][m].some(r => r.id === id)) {
            targetYear = parseInt(y);
            targetMonth = m;
            break;
          }
        }
        if (targetYear) break;
      }

      if (targetYear && targetMonth) {
        await saveAllData({ 
          reservations: { 
            [targetYear]: { 
              [targetMonth]: nextReservations[targetYear][targetMonth] 
            } 
          } 
        });
      } else {
        // Fallback to full save if not found (shouldn't happen)
        await saveAllData({ reservations: nextReservations });
      }
      
      setReservations(nextReservations);
      setSaveStatus('saved');
      showConfirmation('Reservation deleted.');
    } catch (err) {
      setSaveStatus('error');
      console.error("Failed to delete reservation:", err);
      addNotification("Failed to delete reservation. Check connection.", 'error');
    }
  };

  const handleDeleteMonthReservations = (year: number, month: string) => {
    if (!window.confirm(`Are you sure you want to delete ALL reservations for ${month} ${year}? This action cannot be undone.`)) {
      return;
    }

    setReservations(prev => {
      const newReservationsData = JSON.parse(JSON.stringify(prev)) as AppData;
      if (newReservationsData[year] && newReservationsData[year][month]) {
        newReservationsData[year][month] = [];
      }
      
      skipAutoSaveRef.current = true;
      saveAllData({ 
        reservations: { 
          [year]: { 
            [month]: [] 
          } 
        } 
      }).catch(err => {
           console.error("Failed to save bulk deletion immediately:", err);
           addNotification("Failed to delete from cloud. Check connection.", 'error');
      });

      return newReservationsData;
    });

    // Also clear transient newReservations that might match this month
    setNewReservations(prev => prev.filter(res => {
      const date = new Date(res.startDate);
      const resMonth = MONTHS[date.getMonth()];
      const resYear = date.getFullYear();
      return !(resYear === year && resMonth === month);
    }));
    
    showConfirmation(`All reservations for ${month} ${year} have been deleted.`);
  };
  
  const handleConfirmExtension = (
    originalReservation: Reservation,
    extensionInfo: Omit<ExtensionInfo, 'extensionDate' | 'paymentMethod'>,
    customerEmail: string,
    paymentMethod: 'payNow' | 'payLater'
  ) => {
      const fullExtensionInfo: ExtensionInfo = {
          ...extensionInfo,
          extensionDate: new Date().toISOString().split('T')[0],
          paymentMethod: paymentMethod,
      };

      const updatedReservation: Reservation = {
          ...originalReservation,
          endDate: extensionInfo.newEndDate,
          amount: (originalReservation.amount || 0) + extensionInfo.cost,
          originalAmount: originalReservation.originalAmount ?? originalReservation.amount,
          extensionHistory: [...(originalReservation.extensionHistory || []), fullExtensionInfo],
          customerEmail: customerEmail,
          lastEditedBy: currentUser?.fullName,
      };

      if (paymentMethod === 'payLater') {
          updatedReservation.unpaidExtensionAmount = (originalReservation.unpaidExtensionAmount || 0) + extensionInfo.cost;
      }

      handleUpdateSingleReservation(updatedReservation);
      setReservationToExtend(null);
      showConfirmation(`Rental for ${originalReservation.personName} extended successfully.`);
  };

  const handleCollectDeferredPayment = (reservationId: string) => {
    let found = false;
    for (const year in reservations) {
        for (const month in reservations[year]) {
            const res = reservations[year][month].find(r => r.id === reservationId);
            if (res) {
                 const updatedRes = {
                     ...res,
                     unpaidExtensionAmount: 0,
                     deferredPaymentCollectedOn: new Date().toISOString(),
                     lastEditedBy: currentUser?.fullName
                 };
                 handleUpdateReservations(updatedRes, parseInt(year), month);
                 found = true;
                 break;
            }
        }
        if (found) break;
    }

    if (found) {
        showConfirmation(`Payment collected successfully.`);
    } else {
        alert("Could not find the reservation to update. Please refresh.");
    }
  };

  const handleRequirePaymentConfirmation = (reservation: Reservation, year: number, month: string) => {
    if (!currentUser) return;

    const updatedReservation = {
        ...reservation,
        paymentConfirmationPending: true,
        paymentConfirmationRequestedBy: currentUser.fullName,
    };

    handleUpdateReservations(updatedReservation, year, month);
    showConfirmation('Payment approval request sent to manager.');
  };

  const handleAddYear = (year: number) => {
    if (years.includes(year)) {
        alert(`Year ${year} already exists.`);
        return;
    }
    const newYears = [...years, year].sort((a, b) => a - b);
    
    setYears(newYears);
    
    setReservations(prev => {
        const newReservationsData = { ...prev };
        const newYearData: YearData = {};
        for (const month of MONTHS) {
            newYearData[month] = [];
        }
        newReservationsData[year] = newYearData;
        
        saveAllData({ reservations: newReservationsData, years: newYears }).catch(console.error);
        return newReservationsData;
    });
  };

  const handleRemoveYear = (yearToRemove: number) => {
      if (years.length <= 1) {
          alert("You must have at least one year.");
          return;
      }
      
      if (window.confirm(`Are you sure you want to remove the year ${yearToRemove}? This action cannot be undone and will delete all associated data.`)) {
          const newYears = years.filter(y => y !== yearToRemove);
          setYears(newYears);
          
          setReservations(prev => {
              const { [yearToRemove]: _, ...newReservations } = prev;
              saveAllData({ reservations: newReservations, years: newYears }).catch(console.error);
              return newReservations;
          });
          
          if (selectedYear === yearToRemove) {
              handleSetSelectedYear(newYears[0]);
          }
      }
  };

  // FINAL FIX: delete all reservations – fetches state, builds empty structure, and overwrites backend
  const handleDeleteAllReservations = useCallback(async () => {
    if (!window.confirm("CRITICAL: This will permanently delete ALL reservations from the system. This cannot be undone. Proceed?")) {
      return;
    }

    try {
      setSaveStatus('saving');

      const cleanReservations: AppData = {};
      Object.keys(reservations).forEach(year => {
        const y = parseInt(year);
        cleanReservations[y] = {};
        MONTHS.forEach(month => {
          cleanReservations[y][month] = [];
        });
      });

      skipAutoSaveRef.current = true;
      await saveAllData({ reservations: cleanReservations });

      setReservations(cleanReservations);
      setNewReservations([]);
      setSaveStatus('saved');
      showConfirmation("All reservations have been deleted.");
    } catch (err) {
      console.error("Failed to delete all reservations:", err);
      setSaveStatus('error');
      addNotification("Failed to delete reservations. Check connection.", 'error');
    }
  }, [reservations, showConfirmation, addNotification]);

  // Handler for adding extras to a reservation
  const handleAddExtras = useCallback((reservation: Reservation) => {
    const extraName = window.prompt("Enter extra name (e.g., GPS, Insurance):");
    if (!extraName) return;

    const extraCost = window.prompt("Enter extra cost (numeric):");
    const cost = parseFloat(extraCost || "0");
    if (isNaN(cost)) {
      alert("Invalid cost. Please enter a number.");
      return;
    }

    const newExtra = {
      id: `extra-${Date.now()}`,
      name: extraName,
      price: cost,
      addedAt: new Date().toISOString(),
    };

    console.log('Old amount:', reservation.amount);
    const updatedReservation: Reservation = {
      ...reservation,
      extras: [...(reservation.extras || []), newExtra],
      amount: (reservation.amount || 0) + cost,
      lastEditedBy: currentUser?.fullName,
    };
    console.log('New amount:', updatedReservation.amount);

    handleUpdateSingleReservation(updatedReservation);
    setReservationToAddExtras(null);
    showConfirmation(`Added "${extraName}" ($${cost.toFixed(2)}) to reservation.`);
  }, [currentUser, handleUpdateSingleReservation, showConfirmation]);

  const handleFleetUpdate = async (newFleet: Fleet) => {
    setFleet(newFleet);
    const allData: AllData = {
        reservations, sources, fleet: newFleet, companyDetails,
        trafficTickets, vehicleDamages, users, expenses, messages, rentalLocations, invoices,
        availableExtras, franchisePayments,
        activityLog,
        aggregators,
        stopSales,
        years,
    };
    try {
      await saveAllData(cleanUndefined(allData));
      showConfirmation('Fleet updated successfully.');
    } catch (err) {
      console.error("Failed to save fleet update:", err);
      addNotification("Failed to save fleet changes. Check connection.", 'error');
    }
  };
  
  const handleSendMessage = (message: Omit<Message, 'id' | 'senderId' | 'senderName' | 'timestamp'>) => {
    if (!currentUser) return;
    const newMessage: Message = {
        id: `msg-${Date.now()}`,
        senderId: currentUser.id,
        senderName: currentUser.fullName,
        timestamp: new Date().toISOString(),
        isRead: false,
        ...message
    };
    setMessages(prev => {
        const newMessages = [...prev, newMessage];
        const allData: AllData = {
            reservations, sources, fleet, companyDetails,
            trafficTickets, vehicleDamages, users, expenses, messages: newMessages, rentalLocations, invoices,
            availableExtras, franchisePayments,
            activityLog,
            aggregators,
            stopSales,
            years,
        };
        saveAllData(cleanUndefined(allData)).catch(err => {
            console.error("Failed to save message:", err);
            addNotification("Failed to save message. Check connection.", 'error');
        });
        return newMessages;
    });
    showConfirmation('Message sent successfully!');
  };

  const handleMarkMessageRead = (messageId: string) => {
      setMessages(prev => {
          const newMessages = prev.map(msg => msg.id === messageId ? { ...msg, isRead: true } : msg);
          const allData: AllData = {
              reservations, sources, fleet, companyDetails,
              trafficTickets, vehicleDamages, users, expenses, messages: newMessages, rentalLocations, invoices,
              availableExtras, franchisePayments,
              activityLog,
              aggregators,
              stopSales,
              years,
          };
          saveAllData(cleanUndefined(allData)).catch(err => {
              console.error("Failed to mark message read:", err);
              addNotification("Failed to update message. Check connection.", 'error');
          });
          return newMessages;
      });
  };
  
  const handleDeleteMessage = (messageId: string) => {
      setMessages(prev => {
          const newMessages = prev.filter(msg => msg.id !== messageId);
          const allData: AllData = {
              reservations, sources, fleet, companyDetails,
              trafficTickets, vehicleDamages, users, expenses, messages: newMessages, rentalLocations, invoices,
              availableExtras, franchisePayments,
              activityLog,
              aggregators,
              stopSales,
              years,
          };
          saveAllData(cleanUndefined(allData)).catch(err => {
              console.error("Failed to delete message:", err);
              addNotification("Failed to delete message. Check connection.", 'error');
          });
          return newMessages;
      });
  };
  
  const handleShareReservation = (reservation: Reservation) => {
      const subject = `Reservation Details: ${reservation.personName} (${reservation.bookingId})`;
      const body = `
Hi,

Please see the details for the following reservation:

Renter: ${reservation.personName}
Booking ID: ${reservation.bookingId}
Source: ${reservation.source}
Vehicle: ${reservation.carModel}
Location: ${reservation.locationName || 'N/A'}
Pickup: ${reservation.startDate}
Return: ${reservation.endDate}
Status: ${reservation.status}
Total Amount: $${(reservation.amount || 0).toFixed(2)}

Notes: ${reservation.notes || 'N/A'}

Thanks,
${currentUser?.fullName}
      `.trim();
      setMessageToCompose({ subject, body });
      setMainView('Internal Messages');
  };
  
  const handleUpdateFranchisePayments = async (updatedPayments: FranchisePayment[]) => {
      setSaveStatus('saving');
      setFranchisePayments(updatedPayments);
      try {
          skipAutoSaveRef.current = true;
          await saveAllData({ franchisePayments: updatedPayments });
          setSaveStatus('saved');
      } catch (err) {
          setSaveStatus('error');
          console.error("Failed to save franchise payments:", err);
          addNotification("Failed to save franchise payments. Check connection.", 'error');
      }
  };

  const handleReservationsImport = useCallback(async (importedReservations: Reservation[], target?: { year?: number; month?: string }) => {
    if (!importedReservations || importedReservations.length === 0) return;

    console.log('🔵 IMPORT STARTED', {
      count: importedReservations.length,
      target,
      firstReservation: importedReservations[0]
    });

    setSaveStatus('saving');

    const nextReservations = JSON.parse(JSON.stringify(reservations)) as AppData;
    
    // THE NEW RULE: No deduplication unless IDs are identical.
    // We no longer deduplicate by bookingId, only by the internal system ID.
    const importedInternalIds = new Set(importedReservations.map(r => r.id).filter(Boolean));
    
    let removedCount = 0;
    if (importedInternalIds.size > 0) {
      Object.keys(nextReservations).forEach(year => {
        const y = parseInt(year);
        Object.keys(nextReservations[y]).forEach(month => {
          const before = nextReservations[y][month].length;
          nextReservations[y][month] = nextReservations[y][month].filter(res => {
            return !importedInternalIds.has(res.id);
          });
          removedCount += before - nextReservations[y][month].length;
        });
      });
    }
    console.log('🟡 Removed existing reservations with matching internal IDs:', removedCount);

    // Track which months were touched for optimized save
    const touchedMonths = new Set<string>();

    // 2. Add all imported reservations - STRICTLY enforce target month if provided
    importedReservations.forEach((res, index) => {
      let reservationToStore = { ...res };
      let startDate = new Date(reservationToStore.startDate);
      if (isNaN(startDate.getTime())) {
        reservationToStore = {
          ...reservationToStore,
          startDate: fallbackDate(index),
          endDate: reservationToStore.endDate || fallbackDate(index + 1),
          hasDateError: true,
          dateErrorDetail: `${reservationToStore.dateErrorDetail ? `${reservationToStore.dateErrorDetail}. ` : ''}Invalid Pick-up Date`,
        };
        startDate = new Date(reservationToStore.startDate);
      }

      let year: number;
      let month: string;

      if (target?.year !== undefined && target?.month !== undefined) {
        year = target.year;
        month = target.month;
      } else {
        year = reservationToStore.importLockedYear || startDate.getFullYear();
        month = reservationToStore.importLockedMonth || MONTHS[startDate.getMonth()];
      }

      if (!nextReservations[year]) {
        nextReservations[year] = {};
        MONTHS.forEach(m => nextReservations[year][m] = []);
      }
      if (!nextReservations[year][month]) {
        nextReservations[year][month] = [];
      }

      const id = reservationToStore.id || `res-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 9)}`;
      const finalReservation: Reservation = {
        ...reservationToStore,
        id,
        importLockedYear: year,
        importLockedMonth: month,
      };

      nextReservations[year][month].push(finalReservation);
      touchedMonths.add(`${year}|${month}`);

      if (index < 3) {
        console.log(`🟢 Added reservation ${index + 1}:`, {
          id: finalReservation.id,
          personName: finalReservation.personName,
          startDate: finalReservation.startDate,
          storedIn: `${year}/${month}`,
          locks: {
            year: finalReservation.importLockedYear,
            month: finalReservation.importLockedMonth
          }
        });
      }
    });

    const nextYears = [...new Set([...years, ...Object.keys(nextReservations).map(Number)])].sort((a,b) => a-b);

    // FINAL VALIDATION before save
    if (target?.year !== undefined && target?.month !== undefined) {
      const targetMonthReservations = nextReservations[target.year]?.[target.month] || [];
      const correctlyLocked = targetMonthReservations.filter(r =>
        r.importLockedYear === target.year && r.importLockedMonth === target.month
      ).length;

      console.log('🔍 FINAL VALIDATION:', {
        targetMonth: `${target.year}/${target.month}`,
        reservationsInTargetMonth: targetMonthReservations.length,
        correctlyLocked: correctlyLocked,
        validationPassed: correctlyLocked === targetMonthReservations.length,
        totalInSystem: Object.values(nextReservations).reduce((sum, yearData) =>
          sum + Object.values(yearData).reduce((s, monthArr) => s + monthArr.length, 0), 0
        )
      });

      if (correctlyLocked < targetMonthReservations.length) {
        console.error('❌ VALIDATION FAILED - Some reservations in target month are missing locks!');
        addNotification('Import validation failed. Please try again.', 'error');
        setSaveStatus('error');
        return;
      }
    }

    try {
      skipAutoSaveRef.current = true;

      // CRITICAL: Block polling for 60 seconds after import to prevent race conditions
      blockPollingUntilRef.current = Date.now() + 60000; // 60 seconds
      console.log('🚫 POLLING BLOCKED for 60 seconds to prevent data corruption');

      const partialReservations: any = {};
      touchedMonths.forEach(key => {
        const [y, m] = key.split('|');
        const yearInt = parseInt(y);
        if (!partialReservations[yearInt]) partialReservations[yearInt] = {};
        partialReservations[yearInt][m] = nextReservations[yearInt][m];
      });

      await saveAllData({ 
        reservations: partialReservations,
        years: nextYears 
      });
      setReservations(nextReservations);
      setYears(nextYears);

      console.log('🟢 SAVE COMPLETE - State updated locally');

      // VERIFY: Immediately fetch and compare to ensure backend saved correctly
      console.log('🔍 Verifying backend save...');
      setTimeout(async () => {
        try {
          const verifyData = await fetchInitialData();
          if (verifyData && target?.year && target?.month) {
            const backendCount = verifyData.reservations?.[target.year]?.[target.month]?.length || 0;
            const localCount = nextReservations[target.year]?.[target.month]?.length || 0;
            console.log('✅ Backend Verification:', {
              localCount,
              backendCount,
              match: backendCount === localCount
            });
            if (backendCount !== localCount) {
              console.error('❌ BACKEND MISMATCH - Backend has different count!');
              addNotification('Warning: Backend verification failed. Please refresh and check data.', 'error');
            }
          }
        } catch (err) {
          console.error('Verification failed:', err);
        }
      }, 2000); // Verify 2 seconds after save

      // Auto-switch view to the target month to ensure user sees results
      if (target?.year && target?.month) {
        handleSetSelectedYear(target.year);
        handleSetSelectedMonth(target.month);
        setMainView('Reservations');
      }

      setSaveStatus('saved');
      showConfirmation(`Successfully imported ${importedReservations.length} reservations into ${target?.month || 'various months'}. No existing records were overwritten unless they had the same internal ID.`);
    } catch (err) {
      setSaveStatus('error');
      console.error("❌ Failed to save imported reservations:", err);
      addNotification("Failed to save imported reservations. Check connection.", 'error');
    }
  }, [reservations, years, sources, fleet, companyDetails, trafficTickets, vehicleDamages, users, expenses, messages, rentalLocations, invoices, availableExtras, franchisePayments, activityLog, aggregators, stopSales, addNotification, showConfirmation]);

  const clearReservationFilters = useCallback(() => {
    setFilters({
      sourceFilter: '', carModelFilter: '', statusFilter: '',
      durationFilter: '', bookingIdSearch: '', dateFilter: '',
      voucherSubmitted: undefined,
      dropOffCompleted: undefined,
    });
    setPresetFilters(null);
  }, []);

  const unreadCount = useMemo(() => {
    if (!currentUser) return 0;
    return messages.filter(m => m.recipientId === currentUser.id && !m.isRead).length;
  }, [messages, currentUser]);

  const carModels = useMemo(() => [...new Set(fleet.map(v => v.modelName))].sort(), [fleet]);
  
  const duplicateBookingIds = useMemo(() => {
    const ids = new Set<string>();
    const duplicates = new Set<string>();
    
    [...allReservationsFlat, ...newReservations].forEach(res => {
        if (res.bookingId && res.bookingId.trim()) {
            const trimmedId = res.bookingId.trim();
            if (ids.has(trimmedId)) {
                duplicates.add(trimmedId);
            } else {
                ids.add(trimmedId);
            }
        }
    });
    return duplicates;
  }, [allReservationsFlat, newReservations]);
  
  const handleNavigation = (view: string, newFilters?: Partial<ReservationFilters>) => {
    const isReservationView = view === 'Reservations' || view === 'Agreement';

    if (!isReservationView) {
      setFilters({
        sourceFilter: '', carModelFilter: '', statusFilter: '',
        durationFilter: '', bookingIdSearch: '', dateFilter: '',
        voucherSubmitted: undefined,
        dropOffCompleted: undefined,
      });
      setPresetFilters(null);
    } else if (newFilters) {
      setPresetFilters(newFilters as ReservationFilters);
      setFilters(prev => ({ ...prev, ...newFilters }));
    } else if (view === 'Agreement') {
      setFilters({
        sourceFilter: '', carModelFilter: '', statusFilter: '',
        durationFilter: '', bookingIdSearch: '', dateFilter: '',
        voucherSubmitted: undefined,
        dropOffCompleted: undefined,
      });
      setPresetFilters(null);
    }
    setMainView(view);
    setIsSidebarOpen(false);
  };
  
  const pendingApprovalsCount = useMemo(() => allReservationsFlat.filter(r => r.paymentConfirmationPending).length, [allReservationsFlat]);

  // LocalStorage sync for availableExtras (workaround until backend supports it)
  useEffect(() => {
    const stored = localStorage.getItem('availableExtras');
    if (stored && availableExtras.length === 0) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAvailableExtras(parsed);
          console.log('Loaded extras from localStorage:', parsed.length);
        }
      } catch (e) {}
    }
  }, [availableExtras.length]);

  useEffect(() => {
    if (availableExtras.length > 0) {
      localStorage.setItem('availableExtras', JSON.stringify(availableExtras));
    }
  }, [availableExtras]);

  if (!authChecked || isLoading) return <LoadingSpinner />;
  if (!isAuthenticated && authChecked) return <Suspense fallback={<LoadingSpinner />}><LoginScreen users={users} /></Suspense>;
  
  const renderReservationView = (isAgreementView = false) => (
    <ReservationTable
      allData={reservations}
      newReservations={newReservations}
      onUpdate={handleUpdateReservations}
      onAdd={handleAddNewReservation}
      onDelete={handleDeleteReservation}
      onDeleteMonth={handleDeleteMonthReservations}
      onSaveNew={handleSaveNewReservation}
      selectedYear={selectedYear}
      selectedMonth={selectedMonth}
      rentalSources={sources}
      carModels={carModels}
      duplicateBookingIds={duplicateBookingIds}
      fleet={fleet}
      rentalLocations={rentalLocations}
      onShowVoucher={(reservation, year, month) => setModals(m => ({ ...m, viewVoucher: { reservation, year, month } }))}
      onShowRentalVoucher={(reservation, year, month) => setModals(m => ({ ...m, viewRentalVoucher: { reservation, year, month } }))}
      onShowReceipt={(reservation) => setModals(m => ({ ...m, viewReceipt: reservation }))}
      onExtend={(res) => setReservationToExtend(res)}
      onShare={handleShareReservation}
      onRequirePaymentConfirmation={handleRequirePaymentConfirmation}
      onEditReservation={handleUpdateSingleReservation}
      onUpgrade={(reservation, newCarId, customRate) => {
        const newCar = fleet.find(c => c.id === newCarId);
        if (!newCar) return;

        const upgradeFee = customRate !== undefined && customRate !== null ? customRate : 30;
        const newTotal = (reservation.amount || 0) + upgradeFee;

        const updatedReservation = {
          ...reservation,
          carModel: newCar.modelName,
          amount: newTotal,
          lastEditedBy: currentUser?.fullName,
          upgradeHistory: [
            ...(reservation.upgradeHistory || []),
            {
              date: new Date().toISOString(),
              fromCar: reservation.carModel,
              toCar: newCar.modelName,
              fee: upgradeFee,
            }
          ],
        };

        handleUpdateSingleReservation(updatedReservation);
        showConfirmation(`Upgraded to ${newCar.modelName} – additional fee $${upgradeFee.toFixed(2)}. New total: $${newTotal.toFixed(2)}`);
      }}
      onAssignCar={(reservation) => {
        console.log('Assign car for', reservation.id);
      }}
      onAddExtras={(reservation) => setReservationToAddExtras(reservation)}
      currentUser={currentUser}
      filters={filters}
      setFilters={setFilters}
      onClearFilters={clearReservationFilters}
      isDesktopView={isDesktopView}
      companyDetails={companyDetails}
      availableExtras={availableExtras}
      presetFilters={presetFilters}
      isAgreementView={isAgreementView}
    />
  );

  const mainViews: { [key: string]: { component: React.ReactNode, permission: UserPermission } } = {
    'Home': { component: (
        <HomePage 
            currentUser={currentUser!}
            allData={{reservations, fleet, sources, companyDetails, trafficTickets, vehicleDamages, users, expenses, messages, rentalLocations, invoices, availableExtras, franchisePayments, activityLog, aggregators, stopSales, years}}
            onNavigate={handleNavigation}
        />
    ), permission: UserPermission.VIEW_HOME_DASHBOARD },
    'Reservations': { component: renderReservationView(false), permission: UserPermission.VIEW_RESERVATIONS },
    'Agreement': { component: renderReservationView(true), permission: UserPermission.VIEW_HOME_DASHBOARD },
    'Today\'s Reservations': { component: (
      <TodaysReservations
        allData={reservations}
        onShowVoucher={(reservation, year, month) => setModals(m => ({ ...m, viewVoucher: { reservation, year, month }}))}
      />
    ), permission: UserPermission.VIEW_TODAYS_RESERVATIONS },
    'Internal Messages': { component: (
      <InternalMessages 
          currentUser={currentUser!}
          users={users}
          messages={messages}
          onSendMessage={handleSendMessage}
          onMarkAsRead={handleMarkMessageRead}
          onDeleteMessage={handleDeleteMessage}
          initialMessage={messageToCompose}
          onClearInitialMessage={() => setMessageToCompose(null)}
      />
    ), permission: UserPermission.VIEW_INTERNAL_MESSAGES },
    'Yearly Summary': { component: (
        <SummaryTable 
            allData={reservations} 
            yearData={reservations[selectedYear]} 
            year={selectedYear} 
            companyDetails={companyDetails}
            franchisePayments={franchisePayments}
            onUpdateFranchisePayment={handleUpdateFranchisePayments}
            currentUser={currentUser}
        />
    ), permission: UserPermission.VIEW_REPORTS_YEARLY_SUMMARY },
    'Fleet Availability': { component: <FleetAvailability fleet={fleet} yearData={reservations[selectedYear]} year={selectedYear} currentMonth={selectedMonth} onMonthChange={handleSetSelectedMonth} onYearChange={handleSetSelectedYear}/>, permission: UserPermission.VIEW_FLEET_AVAILABILITY },
    'Invoice Generation': { component: <Invoice yearData={reservations[selectedYear]} year={selectedYear} month={selectedMonth} companyDetails={companyDetails} sources={sources} invoices={invoices} onSaveInvoice={(inv) => setInvoices(prev => [...prev, inv])} />, permission: UserPermission.VIEW_REPORTS_INVOICE_GENERATION },
    'Source Performance': { component: <SourcePerformanceReport reservations={allReservationsFlat} year={selectedYear} month={selectedMonth} />, permission: UserPermission.VIEW_REPORTS_SOURCE_PERFORMANCE },
    'Accounting': { component: <AccountingDashboard allData={reservations} trafficTickets={trafficTickets} vehicleDamages={vehicleDamages} expenses={expenses} users={users} onUpdateExpenses={setExpenses} />, permission: UserPermission.VIEW_FINANCIALS_ACCOUNTING },
    'Payment Approvals': { component: <PaymentApprovals allData={reservations} onUpdateReservation={handleUpdateSingleReservation} currentUser={currentUser} showConfirmation={showConfirmation} companyDetails={companyDetails} />, permission: UserPermission.VIEW_FINANCIALS_PAYMENT_APPROVALS },
    'Deferred Payments': { component: <DeferredPayments allData={reservations} onCollectPayment={handleCollectDeferredPayment} currentUser={currentUser} />, permission: UserPermission.VIEW_FINANCIALS_DEFERRED_PAYMENTS },
    'Late Returns': { component: <LateReturns allData={reservations} onUpdateReservation={handleUpdateSingleReservation} currentUser={currentUser} />, permission: UserPermission.VIEW_FINANCIALS_LATE_RETURNS },
    'Traffic Tickets': { component: (
        <TrafficTickets
            tickets={trafficTickets} allData={reservations}
            onAddTicket={ticket => setTrafficTickets(prev => [...prev, { ...ticket, id: `tt-${Date.now()}`}])}
            onUpdateTicket={updatedTicket => setTrafficTickets(prev => prev.map(t => t.id === updatedTicket.id ? updatedTicket : t))}
            onDeleteTicket={id => setTrafficTickets(prev => prev.filter(t => t.id !== id))}
            currentUser={currentUser}
            companyDetails={companyDetails}
        />
    ), permission: UserPermission.VIEW_TRAFFIC_TICKETS },
    'Vehicle Damages': { component: (
         <VehicleDamages
            damages={vehicleDamages} allData={reservations}
            onAddDamage={damage => setVehicleDamages(prev => [...prev, { ...damage, id: `vd-${Date.now()}`}])}
            onUpdateDamage={updatedDamage => setVehicleDamages(prev => prev.map(dmg => dmg.id === updatedDamage.id ? updatedDamage : dmg))}
            onDeleteDamage={id => setVehicleDamages(prev => prev.filter(dmg => dmg.id !== id))}
            currentUser={currentUser}
            companyDetails={companyDetails}
        />
    ), permission: UserPermission.VIEW_VEHICLE_DAMAGES },
    'OTA XML': { component: (
        <AggregatorSetupView 
            aggregators={aggregators}
            onUpdateAggregators={setAggregators}
            fleet={fleet}
            availableExtras={availableExtras}
            stopSales={stopSales}
            onUpdateStopSales={setStopSales}
            showConfirmation={showConfirmation}
        />
    ), permission: UserPermission.VIEW_AGGREGATOR_SETUP },
    'User & Staff Management': { component: (
        <UserManagement 
          users={users} 
          onUpdateUsers={async (updatedUsers) => {
            setUsers(updatedUsers);
            const allData: AllData = {
                reservations, sources, fleet, companyDetails,
                trafficTickets, vehicleDamages, users: updatedUsers, expenses, messages, rentalLocations, invoices,
                availableExtras, franchisePayments,
                activityLog,
                aggregators,
                stopSales,
                years,
            };
            try {
                await saveAllData(cleanUndefined(allData));
                showConfirmation("Users updated.");
            } catch (err) {
                console.error("Failed to save users:", err);
                addNotification("Failed to save users. Check connection.", 'error');
            }
          }} 
          currentUser={currentUser} 
        />
    ), permission: UserPermission.ACTION_ADMIN_MANAGE_USERS },
    'Website Sources': { component: (
        <ManageSourcesView 
            sources={sources} 
            onAdd={async (s) => {
                console.log("Adding source:", s);
                const newSources = [...sources, s];
                setSources(newSources);
                const allData: AllData = {
                    reservations, sources: newSources, fleet, companyDetails,
                    trafficTickets, vehicleDamages, users, expenses, messages, rentalLocations, invoices,
                    availableExtras, franchisePayments,
                    activityLog,
                    aggregators,
                    stopSales,
                    years,
                };
                try {
                    const cleaned = cleanUndefined(allData);
                    await saveAllData(cleaned);
                    showConfirmation("Source added successfully.");
                } catch (err) {
                    console.error("Failed to save new source:", err);
                    addNotification("Failed to save source to cloud. Check connection.", 'error');
                }
            }} 
            onDelete={async (id) => {
                const newSources = sources.filter(src => src.id !== id);
                setSources(newSources);
                const allData: AllData = {
                    reservations, sources: newSources, fleet, companyDetails,
                    trafficTickets, vehicleDamages, users, expenses, messages, rentalLocations, invoices,
                    availableExtras, franchisePayments,
                    activityLog,
                    aggregators,
                    stopSales,
                    years,
                };
                try {
                    await saveAllData(cleanUndefined(allData));
                    showConfirmation("Source deleted.");
                } catch (err) {
                    console.error("Failed to delete source:", err);
                    addNotification("Failed to delete source.", 'error');
                }
            }}
            onUpdate={async (s) => {
                const newSources = sources.map(src => src.id === s.id ? s : src);
                setSources(newSources);
                const allData: AllData = {
                    reservations, sources: newSources, fleet, companyDetails,
                    trafficTickets, vehicleDamages, users, expenses, messages, rentalLocations, invoices,
                    availableExtras, franchisePayments,
                    activityLog,
                    aggregators,
                    stopSales,
                    years,
                };
                try {
                    await saveAllData(cleanUndefined(allData));
                    showConfirmation("Source updated.");
                } catch (err) {
                    console.error("Failed to update source:", err);
                    addNotification("Failed to update source.", 'error');
                }
            }}
        />
    ), permission: UserPermission.ACTION_ADMIN_MANAGE_SOURCES },
     'Manage Locations': { component: (
        <ManageLocationsView
            locations={rentalLocations}
            onUpdate={async (newLocations) => {
                setRentalLocations(newLocations);
                const allData: AllData = {
                    reservations, sources, fleet, companyDetails,
                    trafficTickets, vehicleDamages, users, expenses, messages, rentalLocations: newLocations, invoices,
                    availableExtras, franchisePayments,
                    activityLog,
                    aggregators,
                    stopSales,
                    years,
                };
                try {
                    await saveAllData(cleanUndefined(allData));
                    showConfirmation("Locations updated.");
                } catch (err) {
                    console.error("Failed to save locations:", err);
                    addNotification("Failed to save locations. Check connection.", 'error');
                }
            }}
        />
    ), permission: UserPermission.ACTION_ADMIN_MANAGE_LOCATIONS },
    'Fleet Management': { component: <ManageFleetView fleet={fleet} onUpdate={handleFleetUpdate} />, permission: UserPermission.ACTION_ADMIN_MANAGE_FLEET },
    'Manage Extras': { component: <ManageExtrasView extras={availableExtras} onUpdate={async (newExtras) => {
        setAvailableExtras(newExtras);
        localStorage.setItem('availableExtras', JSON.stringify(newExtras));
        const allData: AllData = {
            reservations, sources, fleet, companyDetails,
            trafficTickets, vehicleDamages, users, expenses, messages, rentalLocations, invoices,
            availableExtras: newExtras, franchisePayments,
            activityLog,
            aggregators,
            stopSales,
            years,
        };
        try {
            await saveAllData(cleanUndefined(allData));
            console.log('Extras saved to backend successfully');
            showConfirmation("Extras updated.");
            await fetchAllData();
        } catch (err) {
            console.error("Failed to save extras to backend:", err);
            addNotification("Failed to save extras to server, but stored locally.", 'warning');
        }
    }} />, permission: UserPermission.ACTION_ADMIN_MANAGE_EXTRAS },
    'Company Details': { component: <ManageCompanyDetailsView details={companyDetails} onUpdate={async (newDetails) => {
        setCompanyDetails(newDetails);
        const allData: AllData = {
            reservations, sources, fleet, companyDetails: newDetails,
            trafficTickets, vehicleDamages, users, expenses, messages, rentalLocations, invoices,
            availableExtras, franchisePayments,
            activityLog,
            aggregators,
            stopSales,
            years,
        };
        try {
            await saveAllData(cleanUndefined(allData));
            showConfirmation("Company details updated.");
        } catch (err) {
            console.error("Failed to save company details:", err);
            addNotification("Failed to save company details. Check connection.", 'error');
        }
    }} onDeleteAllReservations={handleDeleteAllReservations} />, permission: UserPermission.ACTION_ADMIN_MANAGE_COMPANY_DETAILS },
    'Manage Years': { component: <ManageYearsView years={years} onAddYear={handleAddYear} onRemoveYear={handleRemoveYear} />, permission: UserPermission.ACTION_ADMIN_MANAGE_YEARS },
    'Activity Log': { component: <UserActivityLogView activityLog={activityLog} users={users} />, permission: UserPermission.VIEW_SYSTEM_ACTIVITY_LOG },
    'My Profile': { component: (
        <ProfileView
            currentUser={currentUser!}
            firebaseUser={{ uid: currentUser!.id, email: currentUser!.email }}
            onUserUpdate={async (updatedUser: User) => {
                const newUsers = users.map(u => u.id === updatedUser.id ? updatedUser : u);
                setUsers(newUsers);
                const allData: AllData = {
                    reservations, sources, fleet, companyDetails,
                    trafficTickets, vehicleDamages, users: newUsers, expenses, messages, rentalLocations, invoices,
                    availableExtras, franchisePayments,
                    activityLog,
                    aggregators,
                    stopSales,
                    years,
                };
                try {
                    await saveAllData(cleanUndefined(allData));
                    showConfirmation("Profile updated.");
                } catch (err) {
                    console.error("Failed to save profile update:", err);
                    addNotification("Failed to save profile. Check connection.", 'error');
                }
            }}
        />
    ), permission: UserPermission.VIEW_MY_PROFILE },
    'Import Reservations': { component: <ExcelUpload onReservationsImported={handleReservationsImport} years={years} focusYear={selectedYear} focusMonth={selectedMonth} />, permission: UserPermission.VIEW_ADMIN_PANEL },
  };

  const sidebarLinks: Record<string, SidebarLink[]> = {
    "Core Operations": [
        { name: 'Home', icon: HomeIcon, permission: UserPermission.VIEW_HOME_DASHBOARD },
        { name: 'Reservations', icon: CalendarIcon, permission: UserPermission.VIEW_RESERVATIONS },
        { name: 'Agreement', icon: DocumentReportIcon, permission: UserPermission.VIEW_HOME_DASHBOARD },
        { name: 'Today\'s Reservations', icon: CalendarCheckIcon, permission: UserPermission.VIEW_TODAYS_RESERVATIONS },
        { name: 'Internal Messages', icon: InboxIcon, permission: UserPermission.VIEW_INTERNAL_MESSAGES, badge: unreadCount },
        { name: 'Fleet Availability', icon: CarIcon, permission: UserPermission.VIEW_FLEET_AVAILABILITY },
    ],
    "Reports": [
        { name: 'Yearly Summary', icon: ChartBarIcon, permission: UserPermission.VIEW_REPORTS_YEARLY_SUMMARY },
        { name: 'Source Performance', icon: ChartPieIcon, permission: UserPermission.VIEW_REPORTS_SOURCE_PERFORMANCE },
        { name: 'Invoice Generation', icon: DocumentReportIcon, permission: UserPermission.VIEW_REPORTS_INVOICE_GENERATION },
    ],
    "Financials & Incidents": [
        { name: 'Accounting', icon: AccountingIcon, permission: UserPermission.VIEW_FINANCIALS_ACCOUNTING },
        { name: 'Payment Approvals', icon: CurrencyDollarIcon, permission: UserPermission.VIEW_FINANCIALS_PAYMENT_APPROVALS, badge: pendingApprovalsCount },
        { name: 'Deferred Payments', icon: CurrencyDollarIcon, permission: UserPermission.VIEW_FINANCIALS_DEFERRED_PAYMENTS },
        { name: 'Late Returns', icon: ClockIcon, permission: UserPermission.VIEW_FINANCIALS_LATE_RETURNS },
        { name: 'Traffic Tickets', icon: ShieldExclamationIcon, permission: UserPermission.VIEW_TRAFFIC_TICKETS },
        { name: 'Vehicle Damages', icon: WrenchScrewdriverIcon, permission: UserPermission.VIEW_VEHICLE_DAMAGES },
    ],
    "Data Management": [
        { name: 'Import Reservations', icon: UploadIcon, permission: UserPermission.VIEW_ADMIN_PANEL },
    ],
    "OTA XML": [
        { name: 'OTA XML', icon: GlobeAltIcon, permission: UserPermission.VIEW_AGGREGATOR_SETUP },
    ],
    "Administration": [
        { name: 'User & Staff Management', icon: UsersIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_USERS },
        { name: 'Fleet Management', icon: CarIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_FLEET },
        { name: 'Website Sources', icon: CogIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_SOURCES },
        { name: 'Manage Extras', icon: PlusCircleIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_EXTRAS },
        { name: 'Manage Locations', icon: BuildingOfficeIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_LOCATIONS },
        { name: 'Company Details', icon: BuildingOfficeIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_COMPANY_DETAILS },
        { name: 'Manage Years', icon: CogIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_YEARS },
        { name: 'Activity Log', icon: DocumentReportIcon, permission: UserPermission.VIEW_SYSTEM_ACTIVITY_LOG },
    ]
  };

  const currentViewHasAccess = mainView === 'Agreement' ? true : hasPermission(currentUser, mainViews[mainView]?.permission);
  const showDateSelectors = ['Reservations', 'Agreement', 'Invoice Generation', 'Fleet Availability', 'Yearly Summary'].includes(mainView);

  return (
    <div className="flex h-screen bg-slate-100">
      {isSidebarOpen && <div className="fixed inset-0 z-30 bg-black bg-opacity-50 md:hidden" onClick={() => setIsSidebarOpen(false)}></div>}
      
      <aside className={`absolute md:relative z-40 md:z-auto w-64 bg-slate-800 text-white flex-shrink-0 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 flex flex-col h-full`}>
         <div className="flex items-center justify-between p-4 border-b border-slate-700 h-16 flex-shrink-0">
            <div className="flex items-center gap-2">
                <img src={NCT_LOGIN_LOGO_B64} alt="NCT Logo" className="h-8 w-8" />
                <h1 className="text-xl font-bold text-white font-serif-professional">NCT Rental</h1>
            </div>
            <button className="text-slate-300 md:hidden hover:text-white" onClick={() => setIsSidebarOpen(false)}><CloseIcon /></button>
         </div>
        
         <div className="flex-1 overflow-y-auto flex flex-col">
            <nav className="px-2 py-4 space-y-4 flex-1">
                {Object.entries(sidebarLinks).map(([sectionTitle, links]) => {
                    const visibleLinks = links.filter(link => {
                        if (link.name === 'Agreement') {
                            return true;
                        }
                        if (link.name === 'Payment Approvals' && !(companyDetails.requirePaymentApproval ?? true)) {
                            return false;
                        }
                        return hasPermission(currentUser, link.permission)
                    });
                    if (sectionTitle === "Administration" && !hasPermission(currentUser, UserPermission.VIEW_ADMIN_PANEL)) return null;
                    if(visibleLinks.length === 0) return null;

                    return (
                        <SidebarSection key={sectionTitle} title={sectionTitle}>
                            {visibleLinks.map(({ name, icon: Icon, badge }) => (
                                <a
                                    key={name}
                                    href="#"
                                    onClick={(e) => { e.preventDefault(); handleNavigation(name); }}
                                    className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${mainView === name ? 'bg-primary text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}
                                >
                                    <div className="flex items-center gap-3">
                                    <Icon />
                                    <span>{name}</span>
                                    </div>
                                    {typeof badge === 'number' && badge > 0 && (
                                    <span className="flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">{badge}</span>
                                    )}
                                </a>
                            ))}
                        </SidebarSection>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-slate-700 flex-shrink-0">
                {notificationPermission === 'denied' ? (
                    <div className="flex items-center w-full gap-3 px-3 py-2.5 mb-3 text-sm font-medium text-slate-400 bg-slate-900/50 rounded-md cursor-not-allowed" title="Notifications are blocked in your browser settings.">
                        <BellSlashIcon />
                        <span>Notifications Blocked</span>
                    </div>
                ) : isPushSubscribed ? (
                    <button onClick={handleDisableNotifications} className="flex items-center w-full gap-3 px-3 py-2.5 mb-3 text-sm font-medium text-slate-300 bg-red-800/70 hover:bg-red-600 hover:text-white rounded-md transition-colors">
                        <BellSlashIcon />
                        <span>Disable Notifications</span>
                    </button>
                ) : (
                    <button onClick={handleEnableNotifications} className="flex items-center w-full gap-3 px-3 py-2.5 mb-3 text-sm font-medium text-slate-300 bg-slate-700/50 hover:bg-secondary hover:text-white rounded-md transition-colors">
                        <BellIcon />
                        <span>Enable Notifications</span>
                    </button>
                )}
                {hasPermission(currentUser, UserPermission.VIEW_MY_PROFILE) && (
                    <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); handleNavigation('My Profile'); }}
                        className={`flex items-center w-full gap-3 px-3 py-2.5 mb-3 text-sm font-medium rounded-md transition-colors ${mainView === 'My Profile' ? 'bg-primary text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}
                    >
                        <UserCircleIcon />
                        <span>My Profile</span>
                    </a>
                )}
                <div className="px-3 py-2 rounded-md bg-slate-900/50">
                    <p className="text-xs text-slate-400">Logged in as</p>
                    <p className="text-sm font-semibold text-white">{currentUser?.fullName}</p>
                </div>
                <button onClick={handleLogout} className="flex items-center w-full gap-3 px-3 py-2.5 mt-3 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white rounded-md">
                    <LogoutIcon />
                    <span>Logout</span>
                </button>
            </div>
         </div>
      </aside>
      
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="flex items-center justify-between p-4 bg-white shadow-sm no-print h-16 flex-shrink-0">
            <div className="flex items-center flex-1 gap-4 min-w-0">
                <button className="text-slate-600 md:hidden" onClick={() => setIsSidebarOpen(true)}><MenuIcon /></button>
                <div className="min-w-0">
                    <h2 className="text-xl md:text-lg font-bold text-slate-800 truncate" title={mainView}>{mainView}</h2>
                    <p className="text-xs text-slate-500 truncate md:hidden" title="UR-Drive Jordan">UR-Drive Jordan</p>
                    <div className="hidden md:flex items-center gap-2">
                         <p className="text-xs text-slate-500 truncate" title="UR-Drive Jordan">UR-Drive Jordan</p>
                         {saveStatus === 'saving' && (
                             <span className="text-xs text-blue-600 font-medium animate-pulse flex items-center gap-1">
                                 <div className="w-2 h-2 bg-blue-600 rounded-full"></div> Auto-saving...
                             </span>
                         )}
                         {saveStatus === 'error' && (
                             <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                                 Save failed
                             </span>
                         )}
                         {saveStatus === 'saved' && lastSaved && (
                             <span className="text-xs text-green-600 font-medium flex items-center gap-1 transition-opacity duration-1000">
                                 <CheckCircleIcon className="w-3 h-3"/> Auto-saved at {lastSaved}
                             </span>
                         )}
                        <button
                          onClick={() => { console.log("Manual refresh triggered"); fetchAllData(); }}
                          className="ml-4 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          ⟳ Refresh
                        </button>
                        <button
                          onClick={() => { console.log("Manual save triggered"); executeAutoSave(); }}
                          className="ml-2 px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          💾 Save All
                        </button>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-4">
                 <button 
                    onClick={() => handleNavigation('Internal Messages')}
                    className="relative p-2 text-slate-600 rounded-full hover:bg-slate-100"
                    aria-label={`Open Inbox (${unreadCount} unread)`}
                >
                    <InboxIcon className="w-6 h-6" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 flex w-3 h-3">
                            <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping bg-red-400"></span>
                            <span className="relative inline-flex items-center justify-center w-3 h-3 text-white rounded-full bg-red-500 text-[8px]">{unreadCount}</span>
                        </span>
                    )}
                </button>
                <div className="hidden md:flex items-center gap-4">
                    {showDateSelectors && (
                        <>
                            <Tabs tabs={years.map(String)} selectedTab={String(selectedYear)} onSelectTab={(year) => handleSetSelectedYear(Number(year))} />
                            {mainView !== 'Yearly Summary' && (
                                <div className="relative">
                                    <select
                                        value={selectedMonth}
                                        onChange={(e) => handleSetSelectedMonth(e.target.value)}
                                        className="w-36 py-2 pl-3 pr-8 leading-tight text-gray-700 bg-white border border-gray-300 rounded-md appearance-none focus:outline-none focus:bg-white focus:border-primary-dark"
                                        aria-label="Select month"
                                    >
                                        {MONTHS.map(month => (
                                            <option key={month} value={month}>{month}</option>
                                        ))}
                                    </select>
                                    <div className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-700 pointer-events-none">
                                        <svg className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </header>

        {/* Global Mobile Sub-header */}
        <div className="md:hidden flex items-center justify-between p-2 bg-slate-100 border-b border-slate-200">
            <div className="flex items-center gap-2">
                {saveStatus === 'saving' && (
                     <span className="text-xs text-blue-600 font-medium animate-pulse flex items-center gap-1">
                         <div className="w-2 h-2 bg-blue-600 rounded-full"></div> Saving...
                     </span>
                 )}
                 {saveStatus === 'error' && (
                     <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                         Error
                     </span>
                 )}
                 {saveStatus === 'saved' && lastSaved && (
                     <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                         <CheckCircleIcon className="w-3 h-3"/> Saved {lastSaved}
                     </span>
                 )}
            </div>
            {showDateSelectors && (
                <div className="flex items-center gap-2">
                     <Tabs tabs={years.map(String)} selectedTab={String(selectedYear)} onSelectTab={(year) => handleSetSelectedYear(Number(year))} size="sm"/>
                    {mainView !== 'Yearly Summary' && (
                        <div className="relative">
                            <select
                                value={selectedMonth}
                                onChange={(e) => handleSetSelectedMonth(e.target.value)}
                                className="w-full py-1 pl-2 pr-7 text-sm leading-tight text-gray-700 bg-white border border-gray-300 rounded-md appearance-none focus:outline-none focus:bg-white focus:border-primary-dark"
                                aria-label="Select month"
                            >
                                {MONTHS.map(month => (
                                    <option key={month} value={month}>{month}</option>
                                ))}
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center px-1.5 text-gray-700 pointer-events-none">
                                <svg className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>

        <main className="flex-1 p-4 overflow-y-auto sm:p-6 bg-slate-100 min-w-0">
            <div className="max-w-7xl mx-auto">
            <Suspense fallback={<div className="flex items-center justify-center h-64"><LoadingSpinner /></div>}>
              {currentViewHasAccess 
                ? mainViews[mainView]?.component
                : <div className="p-12 text-center bg-white rounded-lg shadow-md">
                    <h2 className="text-xl font-bold text-red-600">Access Denied</h2>
                    <p className="mt-2 text-gray-600">You do not have permission to view this page.</p>
                  </div>
              }
              </Suspense>
            </div>
        </main>
      </div>

      <Suspense fallback={<LoadingSpinner />}>
      <AnimatedModal isOpen={!!modals.viewVoucher} onClose={() => setModals(m=>({...m, viewVoucher: null}))}>
        {modals.viewVoucher && <Voucher reservation={modals.viewVoucher.reservation} sources={sources} rentalLocations={rentalLocations} companyDetails={companyDetails} trafficTickets={trafficTickets} onClose={() => setModals(m=>({...m, viewVoucher: null}))} onUpdate={(res) => {handleUpdateReservations(res, modals.viewVoucher!.year, modals.viewVoucher!.month); }} />}
      </AnimatedModal>

      <AnimatedModal isOpen={!!modals.viewRentalVoucher} onClose={() => setModals(m=>({...m, viewRentalVoucher: null}))}>
        {modals.viewRentalVoucher && <Voucher reservation={modals.viewRentalVoucher.reservation} sources={sources} rentalLocations={rentalLocations} companyDetails={companyDetails} trafficTickets={trafficTickets} onClose={() => setModals(m=>({...m, viewRentalVoucher: null}))} onUpdate={(res) => {handleUpdateReservations(res, modals.viewRentalVoucher!.year, modals.viewRentalVoucher!.month); }} />}
      </AnimatedModal>

      <AnimatedModal isOpen={!!modals.viewReceipt} onClose={() => setModals(m=>({...m, viewReceipt: null}))}>
        {modals.viewReceipt && <Receipt reservation={modals.viewReceipt} companyDetails={companyDetails} sources={sources} onClose={() => setModals(m=>({...m, viewReceipt: null}))} />}
      </AnimatedModal>

      {reservationToExtend && <ExtendRentalModal reservation={reservationToExtend} trafficTickets={trafficTickets} companyDetails={companyDetails} onClose={() => setReservationToExtend(null)} onConfirm={handleConfirmExtension} />}
      {reservationToAddExtras && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 overflow-y-auto bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Add Extra to {reservationToAddExtras.personName}</h3>
            <button
              onClick={() => handleAddExtras(reservationToAddExtras)}
              className="bg-primary text-white px-4 py-2 rounded"
            >
              Add Extra (Prompt)
            </button>
            <button
              onClick={() => setReservationToAddExtras(null)}
              className="ml-2 text-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      </Suspense>
      
      {confirmation && <ConfirmationMessage message={confirmation} onClose={() => setConfirmation('')} />}
      <Notifications notifications={notifications} onDismiss={(id) => setNotifications(prev => prev.filter(n => n.id !== id))} />

    </div>
  );
};
