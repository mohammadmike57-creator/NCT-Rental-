import React, { useState, useCallback, useEffect, useMemo, useRef, Suspense } from 'react';
import { effectivePermissions } from './services/permissionCatalog';
import { v4 as uuidv4 } from 'uuid';
import { AppData, Reservation, ReservationExtra, ReturnCharges, TrafficTicketStatus, VehicleDamageStatus, ReservationStatus, YearData, Fleet, CompanyDetails, TrafficTicket, VehicleDamage, AllData, User, Expense, ExtensionInfo, RentalSource, PaymentType, UserPermission, Message, UserStatus, ReservationFilters, DateFilter, RentalLocation, InvoiceData, AvailableExtra, FranchisePayment, ActivityLog, Aggregator, StopSale, ImportReport } from './types';
import { reservationService } from './services/reservationService';
import { mergeAgreementInto } from './services/agreementLink';
import { ReservationSyncService } from './services/ReservationSyncService';
import { INITIAL_YEARS, MONTHS, RENTAL_SOURCES, INITIAL_FLEET, MASTER_USER, RENTAL_LOCATIONS, NCT_LOGIN_LOGO_B64, VAPID_PUBLIC_KEY, INITIAL_AVAILABLE_EXTRAS, INITIAL_AGGREGATORS, INITIAL_STOP_SALES } from './constants';
import Tabs from './components/Tabs';
import { CogIcon, CarIcon, BuildingOfficeIcon, CloseIcon, CalendarIcon, ChartBarIcon, DocumentReportIcon, MenuIcon, ShieldExclamationIcon, ChartPieIcon, WrenchScrewdriverIcon, LogoutIcon, AccountingIcon, UsersIcon, ChevronDownIcon, InboxIcon, CalendarCheckIcon, HomeIcon, BellIcon, BellSlashIcon, CurrencyDollarIcon, ClockIcon, PlusCircleIcon, UserCircleIcon, GlobeAltIcon, CheckCircleIcon, UploadIcon, UserIcon, MailIcon, PdfIcon, ExportIcon, PlusIcon, SaveIcon, EditIcon, PaperAirplaneIcon, CancelIcon, DesktopComputerIcon, DevicePhoneMobileIcon, KeyIcon, LockClosedIcon, StopIcon, CodeBracketIcon } from './components/icons';
import LoadingSpinner from './components/LoadingSpinner';
import Notifications from './components/Notifications';
import { signOutUser, onAuthStateChangedListener, fetchInitialData, saveAllData, fetchCurrentAccount, recordActivity } from './firebase/api';

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
const ExtrasManagerModal = React.lazy(() => import('./components/ExtrasManagerModal'));
const UnlistedAgreementModal = React.lazy(() => import('./components/UnlistedAgreementModal'));
const UnlistedAgreementsView = React.lazy(() => import('./components/UnlistedAgreementsView'));
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
const StaffActivityView = React.lazy(() => import('./components/StaffActivityView'));
const EmailSettingsView = React.lazy(() => import('./components/EmailSettingsView'));
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
    /** Text badge (e.g. "3 new") shown instead of the number. */
    badgeText?: string;
    /** Runs instead of opening a page (e.g. opens a form). */
    action?: () => void;
}

const SidebarSection: React.FC<{ title: string, children: React.ReactNode, collapsed?: boolean }> = ({ title, children, collapsed }) => {
    const [isOpen, setIsOpen] = useState(true);
    if (collapsed) return <div className="space-y-px pt-2 first:pt-0 border-t border-white/5 first:border-0">{children}</div>;
    return (
        <div>
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center px-3 py-1.5 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.08em] hover:text-slate-300">
                {title}
                <ChevronDownIcon className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
            </button>
            {isOpen && <div className="pt-0.5 space-y-px">{children}</div>}
        </div>
    );
};

declare const __APP_BUILD__: string;

const hasPermission = (user: User | null, permission: UserPermission): boolean => {
    if (!user) return false;
    return effectivePermissions(user.permissions || []).includes(permission);
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
  
  // Wrapper setters to mark user interaction
  const handleSetSelectedYear = (year: number) => {
    setSelectedYear(year);
  };
  const handleSetSelectedMonth = (month: string) => {
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
  const [showUnlistedAgreement, setShowUnlistedAgreement] = useState(false);
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

      console.log('🔄 DATA UPDATE STARTED - Initializing Reservation Engine');

      skipAutoSaveRef.current = true;
      const initialState = getInitialState();
      
      const rawReservations = data.reservations || initialState.reservations;
      
      // MIGRATION: Ensure all legacy reservations have mandatory persistence fields
      const migratedReservations: AppData = {};
      Object.keys(rawReservations).forEach(yKey => {
          const y = parseInt(yKey);
          migratedReservations[y] = {};
          Object.keys(rawReservations[y]).forEach(m => {
              migratedReservations[y][m] = rawReservations[y][m].map((res: Reservation) => ({
                  ...res,
                  id: res.id || uuidv4(),
                  storageYear: res.storageYear || res.importLockedYear || y,
                  storageMonth: res.storageMonth || res.importLockedMonth || m,
                  pickupDate: res.pickupDate || res.startDate,
                  dropoffDate: res.dropoffDate || res.endDate,
                  customer: res.customer || res.personName,
                  invoice: res.invoice || res.bookingId,
                  vehicle: res.vehicle || res.reservationVehicle || '',
                  createdAt: res.createdAt || new Date().toISOString(),
                  updatedAt: res.updatedAt || new Date().toISOString(),
                  uploadBatchId: res.uploadBatchId || 'LEGACY'
              }));
          });
      });

      // Initialize the service with migrated data
      reservationService.setData(migratedReservations);
      
      const yearsFromReservations = Object.keys(rawReservations).map(Number).filter(n => !isNaN(n));
      // Always include the current year so the app opens on today's month.
      const loadedYears = [...new Set([...(data.years || []), ...yearsFromReservations, ...initialState.years!, new Date().getFullYear()])].sort((a,b) => a - b);
      
      setYears(loadedYears);
      if (!loadedYears.includes(selectedYear) && loadedYears.length > 0) {
          handleSetSelectedYear(loadedYears[0] || new Date().getFullYear());
      }

      setReservations(migratedReservations);
      setSources(data.sources || initialState.sources);
      setFleet(data.fleet || initialState.fleet);
      setCompanyDetails({
        ...initialState.companyDetails,
        ...(data.companyDetails || {}),
      });
      setTrafficTickets(data.trafficTickets || initialState.trafficTickets);
      setVehicleDamages(data.vehicleDamages || initialState.vehicleDamages);
      
      setUsers(data.users || initialState.users);
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
      console.log('Reservation Engine Initialized with', Object.keys(rawReservations).length, 'years of data');
  };

  // Polling function to fetch full state from /api/state – now uses fetchInitialData
  const fetchAllData = useCallback(async () => {
    console.log('[SYNC LOG] Polling for updates...');

    try {
      // Use SyncService to check if we should fetch
      const updatedReservations = await ReservationSyncService.syncWithBackend(reservations);
      
      if (updatedReservations) {
        // If we got new reservations, we also need the rest of the state
        // fetchInitialData already fetched everything, but we need to update all state slices
        const fullState = await fetchInitialData();
        if (fullState) {
          handleDataUpdate(fullState);
        }
      }
    } catch (error) {
      console.error('[SYNC LOG] Polling fetch failed', error);
    }
  }, [reservations, handleDataUpdate]);

  // Compute flat list of reservations for auto‑selection
  const allReservationsFlat = useMemo(() => {
    return Object.values(reservations).flatMap((y: YearData) => Object.values(y).flat() as Reservation[]);
  }, [reservations]);

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
        // Pick up permission/status changes made by an administrator since login.
        fetchCurrentAccount()
          .then(fresh => {
            if (fresh && fresh.id) {
              localStorage.setItem('user', JSON.stringify(fresh));
              setCurrentUser(fresh);
            }
          })
          .catch(() => { /* offline or older backend: keep the cached profile */ });
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
    ReservationSyncService.setSaving(true);
    
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
    } finally {
        ReservationSyncService.setSaving(false);
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

    // Automatic pickup / overdue pop-ups and browser notifications were removed on request:
    // the dashboard, Late Returns and the planning board show the same information without interrupting staff.
  
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
    recordActivity('LOGOUT', 'auth', 'Signed out');
    try {
      await signOutUser();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setCurrentUser(null);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };
  
  const handleUpdateReservations = useCallback(async (reservation: Reservation) => {
    const updatedReservation = { 
      ...reservation, 
      lastEditedBy: currentUser?.fullName,
      updatedAt: new Date().toISOString()
    };

    if (reservation.isNew) {
        setNewReservations(prev => prev.map(r => r.id === reservation.id ? updatedReservation : r));
        return;
    }

    setSaveStatus('saving');
    try {
      const updatedData = await reservationService.updateReservation(updatedReservation);
      setReservations(updatedData);
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      console.error("Failed to save updated reservation:", err);
      addNotification("Failed to save changes. Check connection.", 'error');
    }
  }, [currentUser, addNotification]);
  
  const handleUpdateSingleReservation = (updatedReservation: Reservation) => {
    handleUpdateReservations(updatedReservation);
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
      const { isNew, id: transientId, ...newResData } = reservation;
      
      const year = selectedYear;
      const month = selectedMonth;
      
      const timestamp = new Date().toISOString();
      const reservationToSave: Reservation = {
          ...newResData,
          id: uuidv4(),
          uploadBatchId: 'MANUAL',
          createdAt: timestamp,
          updatedAt: timestamp,
          storageYear: year,
          storageMonth: month,
          customer: newResData.personName || '',
          invoice: newResData.bookingId || '',
          pickupDate: newResData.startDate || '',
          dropoffDate: newResData.endDate || '',
          vehicle: newResData.reservationVehicle || '',
          createdBy: currentUser?.fullName,
          
          // Legacy fields for compatibility
          personName: newResData.personName || '',
          bookingId: newResData.bookingId || '',
          startDate: newResData.startDate || '',
          endDate: newResData.endDate || '',
          importLockedYear: year,
          importLockedMonth: month,
      } as Reservation;

      setSaveStatus('saving');
      try {
        const updatedData = await reservationService.updateReservation(reservationToSave);
        setReservations(updatedData);
        setSaveStatus('saved');
        showConfirmation(`Reservation for ${reservationToSave.personName} saved into ${month} ${year}.`);
        recordActivity('RESERVATION_CREATED', 'reservation', `Created reservation for ${reservationToSave.personName} (${reservationToSave.carModel || 'vehicle'}, ${reservationToSave.startDate?.slice(0, 10)} → ${reservationToSave.endDate?.slice(0, 10)})`, reservationToSave.bookingId);
        setNewReservations(prev => prev.filter(r => r.id !== transientId));
      } catch (err) {
        setSaveStatus('error');
        console.error("Failed to save new reservation:", err);
        addNotification("Failed to save reservation. Check connection.", 'error');
      }
  };

  // Opens a rental agreement for a booking that is not in the list (walk-in, late partner booking…).
  // The booking is stored as PENDING + awaitingConfirmation until a supervisor confirms it.
  const handleCreateUnlistedAgreement = async (draft: import('./components/UnlistedAgreementModal').UnlistedBookingDraft) => {
    const start = new Date(draft.startDate);
    const year = start.getFullYear();
    const month = MONTHS[start.getMonth()];
    const timestamp = new Date().toISOString();
    const reservation: Reservation = {
      ...draft,
      id: uuidv4(),
      status: ReservationStatus.PENDING,
      awaitingConfirmation: true,
      unlistedCreatedBy: currentUser?.fullName,
      unlistedCreatedAt: timestamp,
      unlistedSeenBy: currentUser?.email ? [currentUser.email.toLowerCase()] : [],
      bookingDate: timestamp.split('T')[0],
      uploadBatchId: 'UNLISTED',
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: currentUser?.fullName,
      storageYear: year,
      storageMonth: month,
      importLockedYear: year,
      importLockedMonth: month,
      customer: draft.personName,
      invoice: draft.bookingId,
      pickupDate: draft.startDate,
      dropoffDate: draft.endDate,
      vehicle: draft.carModel,
    } as Reservation;

    setSaveStatus('saving');
    try {
      const updatedData = await reservationService.updateReservation(reservation);
      setReservations(updatedData);
      setSaveStatus('saved');
      setShowUnlistedAgreement(false);
      setModals(m => ({ ...m, viewRentalVoucher: { reservation, year, month } }));
      showConfirmation(`Agreement ${reservation.bookingId} opened. The reservations team will list it from Unlisted agreements.`);
      recordActivity('UNLISTED_AGREEMENT_CREATED', 'reservation', `Opened an agreement for unlisted booking — ${reservation.personName}, ${reservation.carModel}`, reservation.bookingId);
    } catch (err) {
      setSaveStatus('error');
      console.error('Failed to create unlisted booking:', err);
      addNotification('Could not create the booking. Check your connection and try again.', 'error');
    }
  };

  // Charges raised at check-in also go to the Vehicle Damages and Traffic Tickets registers.
  const handleRecordReturnCharges = (reservation: Reservation, charges: ReturnCharges) => {
    const paid = charges.settlement === 'paid';
    const ref = `${charges.documentNumber || ''}${paid ? ' · paid' : ' · claimed'}`;
    const damages: VehicleDamage[] = charges.items.filter(i => i.kind === 'damage').map(i => ({
      id: `vd-${reservation.id}-${i.id}`,
      bookingId: reservation.bookingId,
      amount: i.amount,
      details: `${i.description}${i.view ? ` (${i.view} side)` : ''} — ${ref}`,
      status: paid ? VehicleDamageStatus.COLLECTED : VehicleDamageStatus.NOT_COLLECTED,
      damageImage: i.photos?.[0],
      damageImageFilename: i.photos?.[0] ? `damage-${reservation.bookingId}-${i.id}.jpg` : undefined,
    }));
    const nextDamages = damages.length ? [...vehicleDamages.filter(d => !damages.some(n => n.id === d.id)), ...damages] : vehicleDamages;
    const ticketItems = charges.items.filter(i => i.kind === 'ticket');
    const addedTickets: TrafficTicket[] = ticketItems.filter(i => !i.ticketId).map(i => ({
      id: `tt-${reservation.id}-${i.id}`,
      bookingId: reservation.bookingId,
      ticketDate: i.ticketDate || new Date().toISOString().slice(0, 10),
      amount: i.amount,
      details: `${i.description}${i.ticketReference ? ` · Ref ${i.ticketReference}` : ''} — ${ref}`,
      status: paid ? TrafficTicketStatus.COLLECTED : TrafficTicketStatus.NOT_COLLECTED,
      ticketDocument: i.photos?.[0],
      ticketDocumentFilename: i.photos?.[0] ? `ticket-${reservation.bookingId}-${i.id}.jpg` : undefined,
    }));
    const nextTickets = ticketItems.length
      ? [
          ...trafficTickets
            .filter(t => !addedTickets.some(a => a.id === t.id))
            .map(t => (paid && ticketItems.some(i => i.ticketId === t.id) ? { ...t, status: TrafficTicketStatus.COLLECTED } : t)),
          ...addedTickets,
        ]
      : trafficTickets;
    recordActivity('RETURN_CHARGES_RAISED', 'charges', `Raised ${charges.items.length} charge${charges.items.length === 1 ? '' : 's'} at return for ${reservation.personName} — ${charges.currency} ${charges.items.reduce((s, i) => s + i.amount, 0).toFixed(3)} (${paid ? 'paid' : 'claim'} ${charges.documentNumber})`,
      reservation.bookingId, charges.items.map(i => `${i.kind}: ${i.description} ${i.amount}`).join(' · '));
    if (!damages.length && !ticketItems.length) return;
    setVehicleDamages(nextDamages);
    setTrafficTickets(nextTickets);
    // Save straight away so the next background refresh cannot replace them with the older server copy.
    skipAutoSaveRef.current = true;
    saveAllData({ vehicleDamages: nextDamages, trafficTickets: nextTickets }).catch(err => {
      console.error('Failed to save return charges:', err);
      addNotification('Damages and tickets could not be saved to the server. They will be retried on the next save.', 'error');
    });
  };

  // Invoices are saved straight away so a background refresh cannot drop a just-issued invoice.
  const persistInvoices = (next: InvoiceData[]) => {
    setInvoices(next);
    skipAutoSaveRef.current = true;
    saveAllData({ invoices: next }).catch(err => {
      console.error('Failed to save invoices:', err);
      addNotification('The invoice could not be saved to the server. Check your connection.', 'error');
    });
  };

  const handleDeleteReservation = async (id: string, isNew?: boolean, year?: number, month?: string) => {
    if (!window.confirm("Are you sure you want to delete this reservation?")) return;

    if (isNew) {
      setNewReservations(prev => prev.filter(res => res.id !== id));
      return;
    }

    if (year === undefined || month === undefined) {
      console.error("Year and month are required to delete a reservation.");
      return;
    }

    const deleted = (reservations[year]?.[month] || []).find(r => r.id === id);
    setSaveStatus('saving');
    try {
      const updatedData = await reservationService.deleteReservation(id, year, month);
      recordActivity('RESERVATION_DELETED', 'reservation', `Deleted reservation${deleted ? ` for ${deleted.personName}` : ''}`, deleted?.bookingId);
      setReservations(updatedData);
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
    recordActivity('MONTH_DELETED', 'reservation', `Deleted all ${(reservations[year]?.[month] || []).length} reservations for ${month} ${year}`);

    setReservations(prev => {
      const newReservationsData = JSON.parse(JSON.stringify(prev)) as AppData;
      if (newReservationsData[year] && newReservationsData[year][month]) {
        newReservationsData[year][month] = [];
      }
      
      skipAutoSaveRef.current = true;
      ReservationSyncService.setSaving(true);
      saveAllData({ 
        reservations: { 
          [year]: { 
            [month]: [] 
          } 
        } 
      }).then(() => {
          ReservationSyncService.setSaving(false);
      }).catch(err => {
           ReservationSyncService.setSaving(false);
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
      recordActivity('RENTAL_EXTENDED', 'agreement', `Extended rental for ${originalReservation.personName} by ${extensionInfo.days} day${extensionInfo.days === 1 ? '' : 's'} (+$${extensionInfo.cost.toFixed(2)}, ${paymentMethod === 'payNow' ? 'paid now' : 'pay on return'})`, originalReservation.bookingId);
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
                 recordActivity('DEFERRED_PAYMENT_COLLECTED', 'finance', `Collected deferred payment of $${(res.unpaidExtensionAmount || 0).toFixed(2)} from ${res.personName}`, res.bookingId);
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
    recordActivity('PAYMENT_APPROVAL_REQUESTED', 'finance', `Requested payment approval for ${reservation.personName}`, reservation.bookingId);
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

  const handleSaveExtras = (reservation: Reservation, extras: ReservationExtra[], newAmount: number) => {
    handleUpdateSingleReservation({ ...reservation, extras, amount: newAmount, lastEditedBy: currentUser?.fullName });
    setReservationToAddExtras(null);
    showConfirmation(`Extras updated for ${reservation.personName}. New total $${newAmount.toFixed(2)}.`);
    recordActivity('EXTRAS_UPDATED', 'agreement', `Updated extras for ${reservation.personName}: ${extras.map(e => e.name + (e.isComplementary ? ' (free)' : '')).join(', ') || 'none'} — new total $${newAmount.toFixed(2)}`, reservation.bookingId);
  };

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

  const handleReservationsImport = useCallback(async (data: AppData, report: ImportReport) => {
    console.log('[IMPORT LOG] Received imported data:', report);
    setReservations(data);
    setSaveStatus('saved');
    setTableKey(prev => prev + 1);
    
    if (report.imported === 0 && report.duplicates === 0) {
        addNotification(`Import complete: 0 imported. Please check Excel headers.`, 'warning');
    } else {
        addNotification(`Successfully imported ${report.imported} and updated ${report.duplicates} reservations.`, 'success');
    }
    setMainView('Reservations');
  }, [addNotification]);

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
  const unlistedWaitingCount = useMemo(() => allReservationsFlat.filter(r => r.awaitingConfirmation && r.status !== ReservationStatus.CANCELLED).length, [allReservationsFlat]);
  const myEmail = (currentUser?.email || '').toLowerCase();
  const unlistedNewCount = useMemo(() => allReservationsFlat.filter(r => r.awaitingConfirmation && r.status !== ReservationStatus.CANCELLED
    && !(r.unlistedSeenBy || []).includes(myEmail)).length, [allReservationsFlat, myEmail]);

  // Other screens (reservations banner, dashboard) can ask to open a view.
  useEffect(() => {
    const onNav = (e: Event) => { const v = (e as CustomEvent<string>).detail; if (v) handleNavigation(v); };
    window.addEventListener('nct:navigate', onNav);
    return () => window.removeEventListener('nct:navigate', onNav);
  });

  /** Unlisted agreement → normal reservation, stored under its (possibly changed) pickup month. */
  const handleListUnlisted = async (updated: Reservation, original: Reservation) => {
    const start = new Date(updated.startDate);
    const year = Number.isNaN(start.getTime()) ? original.storageYear : start.getFullYear();
    const month = Number.isNaN(start.getTime()) ? original.storageMonth : MONTHS[start.getMonth()];
    const next: Reservation = { ...updated, storageYear: year, storageMonth: month, importLockedYear: year, importLockedMonth: month, lastEditedBy: currentUser?.fullName, updatedAt: new Date().toISOString() };
    setSaveStatus('saving');
    try {
      if (original.storageYear && original.storageMonth && (original.storageYear !== year || original.storageMonth !== month)) {
        await reservationService.deleteReservation(original.id, original.storageYear, original.storageMonth);
      }
      const data = await reservationService.updateReservation(next);
      setReservations(data);
      setSaveStatus('saved');
      showConfirmation(`${next.bookingId} is now listed in Reservations (${month} ${year}).`);
      recordActivity('UNLISTED_LISTED', 'reservation', `Listed unlisted agreement as a reservation — ${next.personName}, ${next.carModel}`, next.bookingId);
    } catch (err) {
      setSaveStatus('error');
      console.error('Failed to list unlisted agreement:', err);
      addNotification('Could not list the reservation. Check your connection and try again.', 'error');
    }
  };
  /** Counter agreement → the website/partner reservation entered later; the temporary record is removed. */
  const handleLinkUnlisted = async (target: Reservation, agreement: Reservation) => {
    const merged = mergeAgreementInto(target, agreement, currentUser?.fullName);
    setSaveStatus('saving');
    try {
      await reservationService.updateReservation({ ...merged, lastEditedBy: currentUser?.fullName, updatedAt: new Date().toISOString() });
      const data = await reservationService.deleteReservation(agreement.id, agreement.storageYear, agreement.storageMonth);
      setReservations(data);
      setSaveStatus('saved');
      showConfirmation(`Agreement ${agreement.bookingId} is now attached to reservation ${target.bookingId}.`);
      recordActivity('UNLISTED_LINKED', 'reservation', `Linked counter agreement ${agreement.bookingId} to reservation ${target.bookingId} — ${target.personName}`, target.bookingId);
    } catch (err) {
      setSaveStatus('error');
      console.error('Failed to link agreement:', err);
      addNotification('Could not link the agreement. Check your connection and try again.', 'error');
    }
  };
  const handleSaveUnlistedDraft = async (updated: Reservation) => {
    await handleUpdateReservations(updated);
    showConfirmation(`Details saved for ${updated.bookingId}. It stays in Unlisted agreements until you list it.`);
  };
  /** Marks unlisted agreements as reviewed by the signed-in user (removes them from their "New" section). */
  const handleMarkUnlistedSeen = async (items: Reservation[]) => {
    if (!myEmail) return;
    for (const res of items) {
      if ((res.unlistedSeenBy || []).includes(myEmail)) continue;
      // Saved directly so "last edited by" is not changed just by reviewing.
      try { setReservations(await reservationService.updateReservation({ ...res, unlistedSeenBy: [...(res.unlistedSeenBy || []), myEmail] })); } catch (e) { console.error('Could not mark as reviewed', e); }
    }
  };
  const handleRejectUnlisted = (res: Reservation) => {
    const msg = res.voucherSubmitted && !res.dropOffCompleted
      ? `${res.personName} currently has the car (${res.licensePlate || res.carModel}). Reject ${res.bookingId} anyway? It will be marked as cancelled.`
      : `Reject ${res.bookingId} for ${res.personName}? It will be marked as cancelled.`;
    if (!window.confirm(msg)) return;
    handleUpdateReservations({ ...res, awaitingConfirmation: false, status: ReservationStatus.CANCELLED, confirmedBy: currentUser?.fullName, confirmedAt: new Date().toISOString() });
    recordActivity('UNLISTED_REJECTED', 'reservation', `Rejected unlisted agreement — ${res.personName}`, res.bookingId);
  };

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

  // Shell UI state (kept above the early returns so the hook order never changes).
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => { try { return localStorage.getItem('nct.sidebarCollapsed') === '1'; } catch { return false; } });
  const toggleSidebarCollapsed = () => setSidebarCollapsed(v => { const n = !v; try { localStorage.setItem('nct.sidebarCollapsed', n ? '1' : '0'); } catch { /* storage unavailable */ } return n; });
  const [openMenu, setOpenMenu] = useState<null | 'new' | 'user'>(null);
  const globalSearchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // "/" jumps to the booking search, Escape closes header menus.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); globalSearchRef.current?.focus(); }
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
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
      onUpgrade={(reservation, newCarId, customRate, details) => {
        const newCar = fleet.find(c => c.id === newCarId);
        if (!newCar) return;

        const upgradeFee = details?.fee ?? customRate ?? 0;
        const newTotal = (reservation.amount || 0) + upgradeFee;

        const updatedReservation: Reservation = {
          ...reservation,
          carModel: newCar.modelName,
          ...(details?.licensePlate ? { licensePlate: details.licensePlate } : {}),
          amount: newTotal,
          lastEditedBy: currentUser?.fullName,
          upgradeHistory: [
            ...(reservation.upgradeHistory || []),
            {
              date: new Date().toISOString(),
              fromCar: reservation.carModel,
              toCar: newCar.modelName,
              fee: upgradeFee,
              pricing: details?.pricing,
              dailyRate: details?.dailyRate,
              days: details?.days,
              by: currentUser?.fullName,
            }
          ],
        };

        handleUpdateSingleReservation(updatedReservation);
        recordActivity('VEHICLE_UPGRADED', 'agreement', `Upgraded ${reservation.personName} from ${reservation.carModel} to ${newCar.modelName} (${upgradeFee > 0 ? `+$${upgradeFee.toFixed(2)}` : 'free'})`, reservation.bookingId, details?.reason ? `Reason: ${details.reason}` : undefined);
        showConfirmation(upgradeFee > 0
          ? `Upgraded to ${newCar.modelName} (+$${upgradeFee.toFixed(2)}). New total $${newTotal.toFixed(2)}.`
          : `Upgraded to ${newCar.modelName} free of charge.`);
      }}
      onAssignCar={(reservation) => {
        console.log('Assign car for', reservation.id);
      }}
      onAddExtras={(reservation) => setReservationToAddExtras(reservation)}
      onOpenUnlistedAgreement={hasPermission(currentUser, UserPermission.ACTION_AGREEMENT_WITHOUT_RESERVATION) ? () => setShowUnlistedAgreement(true) : undefined}
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
            onOpenAgreement={(reservation, year, month) => setModals(m => ({ ...m, viewRentalVoucher: { reservation, year, month } }))}
            onOpenUnlistedAgreement={hasPermission(currentUser, UserPermission.ACTION_AGREEMENT_WITHOUT_RESERVATION) ? () => setShowUnlistedAgreement(true) : undefined}
        />
    ), permission: UserPermission.VIEW_HOME_DASHBOARD },
    'Reservations': { component: renderReservationView(false), permission: UserPermission.VIEW_RESERVATIONS },
    'Agreement': { component: renderReservationView(true), permission: UserPermission.VIEW_AGREEMENTS },
    'Today\'s Reservations': { component: (
      <TodaysReservations
        allData={reservations}
        rentalSources={sources}
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
    'Unlisted Agreements': { component: (
        <UnlistedAgreementsView
            allData={reservations}
            sources={sources}
            rentalLocations={rentalLocations}
            fleet={fleet}
            currentUser={currentUser}
            canEdit={hasPermission(currentUser, UserPermission.ACTION_UNLISTED_AGREEMENTS_LIST)}
            onOpenAgreement={(reservation, year, month) => setModals(m => ({ ...m, viewRentalVoucher: { reservation, year, month } }))}
            onList={handleListUnlisted}
            onSaveDraft={handleSaveUnlistedDraft}
            onLink={handleLinkUnlisted}
            onReject={handleRejectUnlisted}
            onMarkSeen={handleMarkUnlistedSeen}
            onNewWalkIn={hasPermission(currentUser, UserPermission.ACTION_AGREEMENT_WITHOUT_RESERVATION) ? () => setShowUnlistedAgreement(true) : undefined}
        />
    ), permission: UserPermission.VIEW_RESERVATIONS },
    'Fleet Availability': { component: (
      <FleetAvailability 
        fleet={fleet} 
        yearData={reservations[selectedYear]} 
        year={selectedYear} 
        currentMonth={selectedMonth} 
        onMonthChange={handleSetSelectedMonth} 
        onYearChange={handleSetSelectedYear}
        rentalSources={sources}
      />
    ), permission: UserPermission.VIEW_FLEET_AVAILABILITY },
    'Invoice Generation': { component: <Invoice yearData={reservations[selectedYear]} allData={reservations} year={selectedYear} month={selectedMonth} companyDetails={companyDetails} sources={sources} aggregators={aggregators} invoices={invoices} currentUserName={currentUser?.fullName}
        onSaveInvoice={(inv) => persistInvoices([...invoices, inv])}
        onUpdateInvoice={(inv) => persistInvoices(invoices.map(i => i.id === inv.id ? inv : i))} />, permission: UserPermission.VIEW_REPORTS_INVOICE_GENERATION },
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
            currentUserName={currentUser?.fullName || currentUser?.username}
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
    'Activity Log': { component: <StaffActivityView users={users} />, permission: UserPermission.VIEW_SYSTEM_ACTIVITY_LOG },
    'Email Settings': { component: <EmailSettingsView defaultFromName={companyDetails.name} defaultTestTo={currentUser?.email} />, permission: UserPermission.ACTION_ADMIN_MANAGE_EMAIL_SETTINGS },
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
    'Import Reservations': { component: <ExcelUpload onReservationsImported={handleReservationsImport} years={years} focusYear={selectedYear} focusMonth={selectedMonth} />, permission: UserPermission.VIEW_IMPORT_RESERVATIONS },
  };

  const sidebarLinks: Record<string, SidebarLink[]> = {
    "Core Operations": [
        { name: 'Home', icon: HomeIcon, permission: UserPermission.VIEW_HOME_DASHBOARD },
        { name: 'Reservations', icon: CalendarIcon, permission: UserPermission.VIEW_RESERVATIONS },
        { name: 'Agreement', icon: DocumentReportIcon, permission: UserPermission.VIEW_AGREEMENTS },
        { name: 'Agreement for Unlisted Reservation', icon: PlusCircleIcon, permission: UserPermission.ACTION_AGREEMENT_WITHOUT_RESERVATION, action: () => setShowUnlistedAgreement(true) },
        { name: 'Unlisted Agreements', icon: ShieldExclamationIcon, permission: UserPermission.VIEW_UNLISTED_AGREEMENTS, badge: unlistedWaitingCount, badgeText: unlistedNewCount ? `${unlistedNewCount} new` : undefined },
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
        { name: 'Import Reservations', icon: UploadIcon, permission: UserPermission.VIEW_IMPORT_RESERVATIONS },
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
        { name: 'Email Settings', icon: MailIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_EMAIL_SETTINGS },
        { name: 'Manage Years', icon: CogIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_YEARS },
        { name: 'Activity Log', icon: ClockIcon, permission: UserPermission.VIEW_SYSTEM_ACTIVITY_LOG },
    ]
  };

  const currentViewHasAccess = hasPermission(currentUser, mainViews[mainView]?.permission);
  const showDateSelectors = ['Reservations', 'Agreement', 'Invoice Generation', 'Fleet Availability', 'Yearly Summary'].includes(mainView);

  const newItems = [
    { label: 'Reservation', hint: 'Create a booking', show: hasPermission(currentUser, UserPermission.VIEW_RESERVATIONS), run: () => { handleNavigation('Reservations'); setTimeout(() => window.dispatchEvent(new CustomEvent('nct:new-reservation')), 350); } },
    { label: 'Agreement for Unlisted Reservation', hint: 'Customer is here but the booking is not in the system yet', show: hasPermission(currentUser, UserPermission.ACTION_AGREEMENT_WITHOUT_RESERVATION), run: () => setShowUnlistedAgreement(true) },
    { label: 'Traffic ticket', hint: 'Record a fine', show: hasPermission(currentUser, UserPermission.VIEW_TRAFFIC_TICKETS), run: () => handleNavigation('Traffic Tickets') },
    { label: 'Damage report', hint: 'Record vehicle damage', show: hasPermission(currentUser, UserPermission.VIEW_TRAFFIC_TICKETS), run: () => handleNavigation('Vehicle Damages') },
    { label: 'Partner invoice', hint: 'Bill a booking partner', show: hasPermission(currentUser, UserPermission.VIEW_REPORTS_INVOICE_GENERATION), run: () => handleNavigation('Invoice Generation') },
    { label: 'Vehicle', hint: 'Add a car to the fleet', show: hasPermission(currentUser, UserPermission.ACTION_ADMIN_MANAGE_FLEET), run: () => handleNavigation('Fleet Management') },
  ].filter(i => i.show);
  const userInitials = (currentUser?.fullName || currentUser?.username || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
  const runGlobalSearch = (q: string) => {
    const term = q.trim();
    if (!term) return;
    // Search every stored month and open the month of the best match.
    const t = term.toLowerCase();
    let best: { year: number; month: string; score: number } | null = null;
    Object.entries(reservations || {}).forEach(([y, months]) => Object.entries(months || {}).forEach(([m, list]) => {
      (Array.isArray(list) ? list : []).forEach((r: Reservation) => {
        const score = (r.bookingId || '').toLowerCase() === t ? 3
          : (r.bookingId || '').toLowerCase().includes(t) || (r.licensePlate || '').toLowerCase().includes(t) ? 2
          : (r.personName || '').toLowerCase().includes(t) || (r.contactNumber || '').toLowerCase().includes(t) ? 1 : 0;
        if (score && (!best || score > best.score)) best = { year: Number(y), month: m, score };
      });
    }));
    const hit = best as { year: number; month: string; score: number } | null;
    if (hit) { handleSetSelectedYear(hit.year); handleSetSelectedMonth(hit.month); }
    else addNotification(`No booking matches "${term}".`, 'info');
    handleNavigation('Reservations', { bookingIdSearch: term });
  };
  const DateSelectors: React.FC<{ compact?: boolean }> = ({ compact }) => (
    <div className="flex items-center gap-2">
      <select value={String(selectedYear)} onChange={e => handleSetSelectedYear(Number(e.target.value))} aria-label="Select year"
        className={`${compact ? 'h-8 text-xs w-[6.25rem]' : 'h-9 text-[13px]'} pl-2.5 pr-7 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none`}>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      {mainView !== 'Yearly Summary' && (
        <select value={selectedMonth} onChange={e => handleSetSelectedMonth(e.target.value)} aria-label="Select month"
          className={`${compact ? 'h-8 text-xs w-[8.5rem]' : 'h-9 text-[13px] w-36'} pl-2.5 pr-7 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none`}>
          {MONTHS.map(month => <option key={month} value={month}>{month}</option>)}
        </select>
      )}
    </div>
  );
  const SaveState = () => (
    saveStatus === 'saving' ? <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />Saving…</span>
    : saveStatus === 'error' ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" />Save failed</span>
    : saveStatus === 'saved' && lastSaved ? <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap" title={`Last saved ${lastSaved}`}><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Saved<span className="hidden sm:inline">{lastSaved}</span></span>
    : null
  );

  return (
    <div className="flex h-screen bg-slate-50">
      {isSidebarOpen && <div className="fixed inset-0 z-30 bg-slate-900/50 md:hidden" onClick={() => setIsSidebarOpen(false)}></div>}

      <aside className={`absolute md:relative z-40 md:z-auto w-60 ${sidebarCollapsed ? 'md:w-[68px]' : ''} bg-slate-900 text-white flex-shrink-0 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 flex flex-col h-full border-r border-slate-800`}>
         <div className="flex items-center justify-between px-4 h-14 border-b border-white/5 flex-shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
                <img src={NCT_LOGIN_LOGO_B64} alt="NCT Logo" className="h-7 w-7 rounded bg-white/5 shrink-0" />
                <div className={`min-w-0 leading-tight ${sidebarCollapsed ? 'md:hidden' : ''}`}>
                    <h1 className="text-[15px] font-semibold text-white tracking-tight">NCT Rental</h1>
                    <p className="text-[10.5px] text-slate-400 truncate">Rental management</p>
                </div>
            </div>
            <button className="text-slate-400 md:hidden hover:text-white" onClick={() => setIsSidebarOpen(false)} aria-label="Close menu"><CloseIcon /></button>
         </div>

         <div className="flex-1 overflow-y-auto flex flex-col">
            <nav className="px-2.5 py-3 space-y-3 flex-1 [&_svg]:w-[18px] [&_svg]:h-[18px]">
                {Object.entries(sidebarLinks).map(([sectionTitle, links]) => {
                    const visibleLinks = links.filter(link => {
                        if (link.name === 'Payment Approvals' && !(companyDetails.requirePaymentApproval ?? true)) {
                            return false;
                        }
                        return hasPermission(currentUser, link.permission)
                    });
                    if(visibleLinks.length === 0) return null;

                    return (
                        <SidebarSection key={sectionTitle} title={sectionTitle} collapsed={sidebarCollapsed && !isSidebarOpen}>
                            {visibleLinks.map(({ name, icon: Icon, badge, badgeText, action }) => (
                                <a
                                    key={name}
                                    href="#"
                                    onClick={(e) => { e.preventDefault(); if (action) { setIsSidebarOpen(false); action(); } else handleNavigation(name); }}
                                    aria-current={mainView === name ? 'page' : undefined}
                                    title={sidebarCollapsed ? name : undefined}
                                    className={`relative flex items-center ${sidebarCollapsed && !isSidebarOpen ? 'md:justify-center' : ''} justify-between gap-3 px-3 py-[7px] rounded-md text-[13px] font-medium transition-colors ${mainView === name ? 'bg-white/10 text-white before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-indigo-400' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'}`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                    <Icon />
                                    <span className={`line-clamp-2 leading-[1.25] ${sidebarCollapsed && !isSidebarOpen ? 'md:hidden' : ''}`}>{name}</span>
                                    </div>
                                    {badgeText ? (
                                    <span className={`${sidebarCollapsed && !isSidebarOpen ? 'md:absolute md:top-0.5 md:right-1 md:h-4 md:text-[9px]' : ''} h-5 px-1.5 inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-white bg-rose-500 rounded-full whitespace-nowrap`}><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />{badgeText}</span>
                                    ) : typeof badge === 'number' && badge > 0 && (
                                    <span className={`${sidebarCollapsed && !isSidebarOpen ? 'md:absolute md:top-0.5 md:right-1 md:min-w-[16px] md:h-4 md:text-[10px]' : ''} min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center text-[11px] font-semibold text-white bg-rose-500 rounded-full tabular-nums`}>{badge}</span>
                                    )}
                                </a>
                            ))}
                        </SidebarSection>
                    );
                })}
            </nav>

            <div className="p-2.5 border-t border-white/5 flex-shrink-0 space-y-1 [&_svg]:w-[18px] [&_svg]:h-[18px]">
                <button onClick={toggleSidebarCollapsed} title={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'} aria-label={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
                    className={`hidden md:flex items-center w-full gap-2.5 px-3 py-[7px] text-[13px] font-medium text-slate-400 hover:bg-white/5 hover:text-white rounded-md ${sidebarCollapsed ? 'justify-center' : ''}`}>
                    <svg className={`transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" /></svg>
                    {!sidebarCollapsed && <span>Collapse menu</span>}
                </button>
                <div className={sidebarCollapsed ? 'md:hidden space-y-1' : 'space-y-1'}>
                <div className="mt-1 flex items-center gap-2.5 px-2 py-2 rounded-lg bg-white/[0.04]">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/90 text-white text-xs font-semibold flex items-center justify-center shrink-0">{userInitials}</div>
                    <div className="min-w-0 flex-1 leading-tight">
                        <p className="text-[13px] font-medium text-white truncate">{currentUser?.fullName}</p>
                        <p className="text-[11px] text-slate-400 truncate capitalize">{(currentUser?.role || 'staff').toLowerCase()}</p>
                    </div>
                    {hasPermission(currentUser, UserPermission.VIEW_MY_PROFILE) && (
                        <button onClick={() => handleNavigation('My Profile')} title="My profile" aria-label="My profile"
                            className={`p-1.5 rounded-md ${mainView === 'My Profile' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}><UserCircleIcon /></button>
                    )}
                    <button onClick={handleLogout} title="Log out" aria-label="Log out" className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10"><LogoutIcon /></button>
                </div>
                </div>
            </div>
         </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="flex items-center gap-3 px-4 sm:px-6 bg-white border-b border-slate-200 no-print h-14 flex-shrink-0">
            <button className="text-slate-600 md:hidden -ml-1 p-1" onClick={() => setIsSidebarOpen(true)} aria-label="Open menu"><MenuIcon /></button>
            <div className="min-w-0 md:w-56 shrink-0">
                <h2 className="text-[15px] font-semibold text-slate-900 truncate leading-tight" title={mainView}>{mainView}</h2>
                <p className="text-[11px] text-slate-500 truncate" title="UR-Drive Jordan">UR-Drive Jordan</p>
            </div>
            <form className="hidden md:block flex-1 max-w-md" onSubmit={e => { e.preventDefault(); const f = e.currentTarget.elements.namedItem('q') as HTMLInputElement; runGlobalSearch(f.value); f.value = ''; }} role="search">
                <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                    <input ref={globalSearchRef} name="q" type="search" placeholder="Find a booking — number, customer, phone or plate" aria-label="Find a booking"
                        className="peer w-full h-9 pl-9 pr-9 bg-slate-100 border border-transparent rounded-lg text-[13px] text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                    <kbd className="peer-focus:hidden absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 rounded border border-slate-300 bg-white text-[10px] font-semibold text-slate-400">/</kbd>
                </div>
            </form>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                <div className="hidden lg:block mr-1"><SaveState /></div>
                <button onClick={() => { fetchAllData(); }} title="Reload data from the server" aria-label="Reload data"
                    className="hidden md:inline-flex w-9 h-9 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100">
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                </button>
                <button onClick={() => { executeAutoSave(); }} title="Save all changes now"
                    className="hidden md:inline-flex h-9 items-center gap-1.5 px-3 rounded-lg border border-slate-200 text-[13px] font-medium text-slate-700 hover:bg-slate-50">
                    <SaveIcon className="w-4 h-4 text-slate-500" />Save
                </button>
                {showDateSelectors && <div className="hidden md:block pl-2 ml-1 border-l border-slate-200"><DateSelectors /></div>}
                <div className="relative">
                    <button onClick={() => setOpenMenu(m => (m === 'new' ? null : 'new'))} aria-haspopup="menu" aria-expanded={openMenu === 'new'}
                        className="h-9 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-lg bg-indigo-600 text-white text-[13px] font-semibold shadow-sm hover:bg-indigo-700">
                        <PlusIcon className="w-4 h-4" /><span className="hidden sm:inline">New</span>
                        <ChevronDownIcon className="hidden sm:block w-3.5 h-3.5 opacity-80" />
                    </button>
                    {openMenu === 'new' && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
                            <div role="menu" className="absolute right-0 mt-1.5 z-50 w-64 bg-white rounded-lg border border-slate-200 shadow-xl py-1">
                                <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Create</p>
                                {newItems.map(i => (
                                    <button key={i.label} role="menuitem" onClick={() => { setOpenMenu(null); i.run(); }} className="w-full text-left px-3 py-2 hover:bg-slate-50">
                                        <span className="block text-[13px] font-medium text-slate-800">{i.label}</span>
                                        <span className="block text-[11px] text-slate-500">{i.hint}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
                <button
                    onClick={() => handleNavigation('Internal Messages')}
                    className="relative w-9 h-9 inline-flex items-center justify-center text-slate-500 rounded-lg hover:text-slate-900 hover:bg-slate-100"
                    aria-label={`Open Inbox (${unreadCount} unread)`}
                >
                    <InboxIcon className="w-5 h-5" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-semibold tabular-nums">{unreadCount}</span>
                    )}
                </button>
                <div className="relative hidden md:block">
                    <button onClick={() => setOpenMenu(m => (m === 'user' ? null : 'user'))} aria-haspopup="menu" aria-expanded={openMenu === 'user'} title={currentUser?.fullName}
                        className="w-9 h-9 rounded-full bg-indigo-500 text-white text-xs font-semibold inline-flex items-center justify-center ring-2 ring-white hover:ring-indigo-100">{userInitials}</button>
                    {openMenu === 'user' && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
                            <div role="menu" className="absolute right-0 mt-1.5 z-50 w-60 bg-white rounded-lg border border-slate-200 shadow-xl py-1 text-[13px]">
                                <div className="px-3 py-2 border-b border-slate-100">
                                    <p className="font-semibold text-slate-900 truncate">{currentUser?.fullName}</p>
                                    <p className="text-[11px] text-slate-500 truncate">{currentUser?.email || currentUser?.username}</p>
                                </div>
                                {hasPermission(currentUser, UserPermission.VIEW_MY_PROFILE) && (
                                    <button role="menuitem" onClick={() => { setOpenMenu(null); handleNavigation('My Profile'); }} className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50">My profile</button>
                                )}
                                <button role="menuitem" onClick={() => { setOpenMenu(null); toggleSidebarCollapsed(); }} className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50">{sidebarCollapsed ? 'Expand side menu' : 'Collapse side menu'}</button>
                                <div className="border-t border-slate-100 mt-1 pt-1">
                                    <button role="menuitem" onClick={() => { setOpenMenu(null); handleLogout(); }} className="w-full text-left px-3 py-2 text-rose-600 hover:bg-rose-50">Log out</button>
                                    <p className="px-3 pt-1.5 pb-1 border-t border-slate-100 text-[10.5px] text-slate-400 tabular-nums">Version {typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev'}</p>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>

        {/* Mobile sub-header */}
        <div className="md:hidden flex items-center justify-between gap-2 px-4 py-2 bg-white border-b border-slate-200">
            <SaveState />
            {showDateSelectors && <DateSelectors compact />}
        </div>

        <main className="flex-1 p-4 pb-24 md:pb-6 overflow-y-auto sm:p-6 bg-slate-50 min-w-0">
            <div className="max-w-[1500px] mx-auto">
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

        {/* Phone tab bar: the four most used screens plus the full menu */}
        <nav className="md:hidden no-print fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 pb-[env(safe-area-inset-bottom)]" aria-label="Quick navigation">
            <div className="grid grid-cols-5">
                {[
                    { name: 'Home', label: 'Home', icon: HomeIcon, ok: hasPermission(currentUser, UserPermission.VIEW_HOME_DASHBOARD) },
                    { name: 'Reservations', label: 'Bookings', icon: CalendarIcon, ok: hasPermission(currentUser, UserPermission.VIEW_RESERVATIONS) },
                    { name: 'Agreement', label: 'Agreements', icon: DocumentReportIcon, ok: hasPermission(currentUser, UserPermission.VIEW_AGREEMENTS) },
                    { name: "Today's Reservations", label: 'Today', icon: CalendarCheckIcon, ok: hasPermission(currentUser, UserPermission.VIEW_TODAYS_RESERVATIONS) },
                ].filter(t => t.ok).map(({ name, label, icon: Icon }) => (
                    <button key={name} onClick={() => handleNavigation(name)} aria-current={mainView === name ? 'page' : undefined}
                        className={`relative flex flex-col items-center justify-center gap-0.5 h-14 text-[10.5px] font-medium [&_svg]:w-5 [&_svg]:h-5 ${mainView === name ? 'text-indigo-600' : 'text-slate-500'}`}>
                        {mainView === name && <span className="absolute top-0 inset-x-5 h-0.5 rounded-full bg-indigo-600" />}
                        <Icon />{label}
                    </button>
                ))}
                <button onClick={() => setIsSidebarOpen(true)} className="relative flex flex-col items-center justify-center gap-0.5 h-14 text-[10.5px] font-medium text-slate-500 [&_svg]:w-5 [&_svg]:h-5">
                    <MenuIcon />Menu
                    {unreadCount > 0 && <span className="absolute top-2 right-[calc(50%-16px)] w-2 h-2 rounded-full bg-rose-500" />}
                </button>
            </div>
        </nav>
      </div>

      <Suspense fallback={<LoadingSpinner />}>
      <AnimatedModal isOpen={!!modals.viewVoucher} onClose={() => setModals(m=>({...m, viewVoucher: null}))}>
        {modals.viewVoucher && <Voucher fleet={fleet} reservation={modals.viewVoucher.reservation} sources={sources} rentalLocations={rentalLocations} companyDetails={companyDetails} trafficTickets={trafficTickets} onRecordReturnCharges={handleRecordReturnCharges} onClose={() => setModals(m=>({...m, viewVoucher: null}))} onUpdate={(res) => {handleUpdateReservations(res, modals.viewVoucher!.year, modals.viewVoucher!.month); }} />}
      </AnimatedModal>

      <AnimatedModal isOpen={showUnlistedAgreement} onClose={() => setShowUnlistedAgreement(false)}>
        {showUnlistedAgreement && (
          <UnlistedAgreementModal
            fleet={fleet}
            sources={sources}
            rentalLocations={rentalLocations}
            existingBookingIds={new Set(Object.values(reservations).flatMap(y => Object.values(y as YearData).flat()).map(r => (r as Reservation).bookingId).filter(Boolean))}
            onCancel={() => setShowUnlistedAgreement(false)}
            onSubmit={handleCreateUnlistedAgreement}
          />
        )}
      </AnimatedModal>
      {/* The agreement draws its own full-screen backdrop, so it is not wrapped in AnimatedModal. */}
      {modals.viewRentalVoucher && <Voucher fleet={fleet} reservation={modals.viewRentalVoucher.reservation} sources={sources} rentalLocations={rentalLocations} companyDetails={companyDetails} trafficTickets={trafficTickets} onRecordReturnCharges={handleRecordReturnCharges} onClose={() => setModals(m=>({...m, viewRentalVoucher: null}))} onUpdate={(res) => {handleUpdateReservations(res, modals.viewRentalVoucher!.year, modals.viewRentalVoucher!.month); }} />}

      <AnimatedModal isOpen={!!modals.viewReceipt} onClose={() => setModals(m=>({...m, viewReceipt: null}))}>
        {modals.viewReceipt && <Receipt reservation={modals.viewReceipt} companyDetails={companyDetails} sources={sources} onClose={() => setModals(m=>({...m, viewReceipt: null}))} />}
      </AnimatedModal>

      {reservationToExtend && <ExtendRentalModal reservation={reservationToExtend} trafficTickets={trafficTickets} companyDetails={companyDetails} onClose={() => setReservationToExtend(null)} onConfirm={handleConfirmExtension} />}
      {reservationToAddExtras && (
        <ExtrasManagerModal
          reservation={reservationToAddExtras}
          availableExtras={availableExtras}
          onCancel={() => setReservationToAddExtras(null)}
          onSave={(extras, amount) => handleSaveExtras(reservationToAddExtras, extras, amount)}
        />
      )}
      </Suspense>
      
      {confirmation && <ConfirmationMessage message={confirmation} onClose={() => setConfirmation('')} />}
      <Notifications notifications={notifications} onDismiss={(id) => setNotifications(prev => prev.filter(n => n.id !== id))} />

    </div>
  );
};
