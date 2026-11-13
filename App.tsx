import React, { useState, useCallback, useEffect, useMemo, useRef, Suspense } from 'react';
import type { UpgradeDetails } from './components/UpgradeVehicleModal';
import { v4 as uuidv4 } from 'uuid';
import { AppData, Reservation, ReservationExtra, ReturnCharges, TrafficTicketStatus, VehicleDamageStatus, ReservationStatus, YearData, Fleet, CompanyDetails, TrafficTicket, VehicleDamage, AllData, User, Expense, ExtensionInfo, RentalSource, UserPermission, Message, UserStatus, ReservationFilters, RentalLocation, InvoiceData, AvailableExtra, FranchisePayment, ActivityLog, Aggregator, StopSale, ImportReport } from './types';
import { reservationService } from './services/reservationService';
import { mergeAgreementInto } from './services/agreementLink';
import { duplicateKeys, findBooking, describeBooking, flatten } from './services/duplicates';
import { withPriceChange } from './services/addOns';
import { reservationShareMessage } from './services/reservationShare';
import { normalizeSources } from './services/paymentType';
import { ReservationSyncService } from './services/ReservationSyncService';
import { INITIAL_YEARS, MONTHS, INITIAL_FLEET } from './constants';
import { attentionCount as countAttention, findIssues } from './services/reservationIssues';
import LoadingSpinner from './components/LoadingSpinner';
import ErrorBoundary from './components/ErrorBoundary';
import Notifications from './components/Notifications';
import { pickupMonthOf } from './services/pickupMonth';
import MisfiledNotice from './components/MisfiledNotice';
import DeleteAgreementDialog from './components/DeleteAgreementDialog';
import { flushActivity } from './services/activityTracker';
import { signOutUser, onAuthStateChangedListener, fetchInitialData, fetchStateIfChanged, saveAllData, fetchCurrentAccount, recordActivity, markSignedOut, rememberServerState, clearDataSections } from './services/api';

import { ReservationTable, SummaryTable, ManageSourcesView, Invoice, ManageFleetView, FleetAvailability, Voucher, Receipt, SourcePerformanceReport, ReservationAddOnsView, TrafficTickets, VehicleDamages, LoginScreen, ExtendRentalModal, ExtrasManagerModal, UnlistedAgreementModal, UnlistedAgreementsView, ManageCompanyDetailsView, AgreementTermsView, ManageYearsView, UserManagement, AccountingDashboard, InternalMessages, TodaysReservations, NeedsAttentionView, HomePage, ManageLocationsView, DeferredPayments, PaymentApprovals, ManageExtrasView, ProfileView, AggregatorSetupView, StaffActivityView, EmailSettingsView, ExcelUpload } from './app/lazyViews';
import AnimatedModal from './components/ui/AnimatedModal';
import ConfirmationMessage from './components/ui/ConfirmationMessage';
import { cleanUndefined, getInitialState } from './app/initialState';
import { usePresence, useLeaveWarning } from './app/usePresence';
import { useUnlistedAgreements } from './app/useUnlistedAgreements';
import { sidebarLinks } from './app/navigation';
import { hasPermission } from './app/permissions';
import { findBookingMonth } from './services/globalSearch';
import AppSidebar from './app/AppSidebar';
import AppHeader from './app/AppHeader';
import PhoneTabBar from './app/PhoneTabBar';

const USERS_CACHE_KEY = 'NCT_USERS_CACHE';


interface Notification {
  id: string;
  message: string;
  type: 'warning' | 'error' | 'info' | 'success';
  title?: string;
  vehicleInfo?: { modelName: string; licensePlate: string };
}



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
  // Bookings made by brokers over XML live only in OTA XML: every other screen and report leaves them out.
  const shownReservations = useMemo<AppData>(() => {
    const out: AppData = {};
    Object.entries(reservations).forEach(([y, months]) => {
      const ym: YearData = {} as YearData;
      Object.entries(months as YearData).forEach(([m, list]) => { (ym as Record<string, Reservation[]>)[m] = (list as Reservation[]).filter(r => !r.channelId); });
      out[Number(y)] = ym;
    });
    return out;
  }, [reservations]);
  // A finished rental chosen for deletion (confirmed in DeleteAgreementDialog).
  const [agreementToDelete, setAgreementToDelete] = useState<Reservation | null>(null);
  const [deletingAgreement, setDeletingAgreement] = useState(false);
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
  
  // The page in use is remembered, so a reload or reopening the system returns to it.
  const [mainView, setMainView] = useState<string>(() => { try { return localStorage.getItem('nct.mainView') || 'Home'; } catch { return 'Home'; } });
  useEffect(() => { try { localStorage.setItem('nct.mainView', mainView); } catch { /* storage unavailable */ } }, [mainView]);
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
  const [, setNotificationPermission] = useState<NotificationPermission>('default');
  const [, setIsPushSubscribed] = useState(false);

  // Force table remount when data changes or year/month changes (now only used for logging)
  const [, setTableKey] = useState(0);
  /** True once data from the server has been applied; saving is blocked until then. */
  const serverLoadedRef = useRef(false);
  // Screens open only once the server's data is on screen (or loading it failed), so nobody
  // can edit or save the built-in starting values by mistake.
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  // The agreement being worked on is reopened after a reload (its unfinished entries come back as a draft).
  const OPEN_AGREEMENT_KEY = 'nct.openAgreement';
  const agreementRestoredRef = useRef(false);
  useEffect(() => {
    if (!agreementRestoredRef.current) return;
    const v = modals.viewRentalVoucher;
    try {
      if (v) localStorage.setItem(OPEN_AGREEMENT_KEY, JSON.stringify({ id: v.reservation.id, year: v.year, month: v.month }));
      else localStorage.removeItem(OPEN_AGREEMENT_KEY);
    } catch { /* storage unavailable */ }
  }, [modals.viewRentalVoucher]);
  useEffect(() => {
    if (agreementRestoredRef.current || !serverLoadedRef.current) return;
    agreementRestoredRef.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_AGREEMENT_KEY) || 'null');
      if (!saved) return;
      const found = (reservations as any)?.[saved.year]?.[saved.month]?.find((r: Reservation) => r.id === saved.id);
      if (found && !found.dropOffCompleted) setModals(m => ({ ...m, viewRentalVoucher: { reservation: found, year: saved.year, month: saved.month } }));
      else localStorage.removeItem(OPEN_AGREEMENT_KEY);
    } catch { /* ignore */ }
  }, [reservations]);  

  const isInitialDataLoad = useRef(true);
  const skipAutoSaveRef = useRef(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null); // Timestamp to block polling until

  // Auto-save logic
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const addNotification = useCallback((message: string, type: Notification['type'], title?: string) => {
    const id = `notif-${Date.now()}-${Math.random()}`;
    setNotifications(prev => [...prev, { id, message, type, title }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, type === 'error' ? 12000 : 5000);
  }, []);
  
  const handleDataUpdate = (data: AllData, fromServer = true) => {
      if (!data) return;
      if (fromServer) { rememberServerState(data); serverLoadedRef.current = true; setFirstLoadDone(true); }


      skipAutoSaveRef.current = true;
      const initialState = getInitialState();
      
      const rawReservations = data.reservations || initialState.reservations;
      
      // MIGRATION: Ensure all legacy reservations have mandatory persistence fields
      const migratedReservations: AppData = {};
      // Bookings made in the reservation form stored the branch / source id instead of its name.
      const branchById = new Map<string, string>(((data.rentalLocations || []) as RentalLocation[]).map(l => [l.id, l.name]));
      const sourceById = new Map<string, string>(((data.sources || []) as RentalSource[]).map(src => [src.id, src.name]));
      Object.keys(rawReservations).forEach(yKey => {
          const y = parseInt(yKey);
          migratedReservations[y] = {};
          Object.keys(rawReservations[y]).forEach(m => {
              migratedReservations[y][m] = rawReservations[y][m].map((res: Reservation, i: number) => ({
                  ...res,
                  ...(res.locationName && branchById.has(res.locationName) ? { locationName: branchById.get(res.locationName) } : {}),
                  ...(res.source && sourceById.has(res.source) && sourceById.get(res.source) !== res.source ? { source: sourceById.get(res.source) } : {}),
                  // A booking without an id gets the same one on every load, so edits and deletes find it.
                  id: res.id || `legacy-${y}-${m}-${i}-${res.bookingId || res.invoice || ''}`,
                  // Where the booking is actually filed; edits and deletes look it up there.
                  storageYear: y,
                  storageMonth: m,
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
      setSources(normalizeSources(data.sources || initialState.sources));
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
  };

  // Polling function to fetch full state from /api/state – now uses fetchInitialData
  // Polling always applies data with the current handler, without re-creating the poller on every render.
  const handleDataUpdateRef = useRef(handleDataUpdate);
  handleDataUpdateRef.current = handleDataUpdate;
  const fetchAllData = useCallback(async () => {

    try {
      // Never replace what is on screen while it is being saved or has unsaved changes.
      if (!ReservationSyncService.canSync()) return;
      // One request; the screen is redrawn only when someone actually changed something.
      const fullState = await fetchStateIfChanged();
      if (fullState && ReservationSyncService.canSync()) handleDataUpdateRef.current(fullState);
    } catch (error) {
      console.error('[SYNC LOG] Polling fetch failed', error);
      setFirstLoadDone(true); // server unreachable: open anyway (saving stays blocked until it answers)
    }
  }, []);

  // Compute flat list of reservations for auto‑selection
  const allReservationsFlat = useMemo(() => {
    return Object.values(shownReservations).flatMap((y: YearData) => Object.values(y).flat() as Reservation[]);
  }, [shownReservations]);

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

  // The sign-in listener below is set up once; it reaches the current loaders through this ref.
  const latest = useRef({ fetchAllData, handleDataUpdate });
  latest.current = { fetchAllData, handleDataUpdate };

  useEffect(() => {
    // On mount, if token exists, fetch data (for page refresh)
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
        latest.current.fetchAllData(); // Fetch immediately after login
        pollingIntervalRef.current = setInterval(() => {
            if (saveStatusRef.current !== 'saving') {
                latest.current.fetchAllData();
            }
        }, 15000);
      } else {
        // Load initial state from constants
        latest.current.handleDataUpdate(getInitialState(), false);
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

  }, [users, currentUser]);

  const signedInEmail = currentUser?.email;
  usePresence(signedInEmail, isLoading, mainView);

  const showConfirmation = (message: string) => {
    setConfirmation(message);
  };

  /**
   * Saves the given sections straight away (only what changed is sent), then shows `done` or the `failed` notice.
   * Everything else is saved by the automatic save as usual.
   */
  const saveSections = async (sections: Partial<AllData>, done: string, failed: string, level: Notification['type'] = 'error'): Promise<boolean> => {
    try {
      await saveAllData(cleanUndefined(sections));
      if (done) showConfirmation(done);
      return true;
    } catch (err) {
      console.error(failed, err);
      addNotification(failed, level);
      return false;
    }
  };

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const executeAutoSaveRef = useRef<(() => void) | null>(null);
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
        ReservationSyncService.setLocalChanges(false);
        setSaveStatus('saved');
        setLastSaved(new Date().toLocaleTimeString());
    } catch (err) {
        console.error("Failed to auto-save data:", err);
        setSaveStatus('error');
        addNotification("Changes not saved yet — retrying automatically. Check your connection.", 'error');
        // Keep trying until the server has the changes, so nothing entered is lost.
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => executeAutoSaveRef.current?.(), 8000);
    } finally {
        ReservationSyncService.setSaving(false);
    }
  }, [
      isAuthenticated, reservations, sources, fleet, companyDetails, trafficTickets, vehicleDamages, users, expenses, messages, rentalLocations, invoices, availableExtras, franchisePayments, activityLog, aggregators, stopSales, years, addNotification
  ]);

  useEffect(() => { executeAutoSaveRef.current = executeAutoSave; }, [executeAutoSave]);

  // Warn before closing the page while changes are still being saved.
  useLeaveWarning(saveStatus === 'saving' || saveStatus === 'error');

  useEffect(() => {
    if (isLoading || isInitialDataLoad.current) {
        if (!isLoading) isInitialDataLoad.current = false;
        return;
    }
    // Nothing is saved until the server's data has been loaded onto this screen.
    if (!serverLoadedRef.current) return;

    if (skipAutoSaveRef.current) {
        skipAutoSaveRef.current = false;
        return;
    }

    if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
    }
    
    setSaveStatus('saving');
    // Unsaved edits on screen: the 15-second refresh must not replace them before they are saved.
    ReservationSyncService.setLocalChanges(true);

    timeoutRef.current = setTimeout(() => {
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

  const handleLogout = async () => {
    recordActivity('LOGOUT', 'auth', 'Signed out');
    flushActivity();
    try {
      await markSignedOut();
      await signOutUser();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('nct.mainView');
      localStorage.removeItem('nct.openAgreement');
      setCurrentUser(null);
      setFirstLoadDone(false);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };
  
  // The bookings as last loaded or saved, so a save can be compared with what it replaces.
  const reservationsRef = useRef<AppData>(reservations);
  reservationsRef.current = reservations;
  const handleUpdateReservations = useCallback(async (reservation: Reservation) => {
    // A changed rental price is logged on the booking (Reservation Add-ons) with the price it was booked at.
    const previous = flatten(reservationsRef.current).find(r => r.id === reservation.id);
    const updatedReservation = withPriceChange(previous, {
      ...reservation, 
      lastEditedBy: currentUser?.fullName,
      updatedAt: new Date().toISOString()
    }, currentUser?.fullName);

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
    } as Reservation]);
  };
  
  const handleSaveNewReservation = async (reservation: Reservation) => {
      const { isNew, id: transientId, ...newResData } = reservation;
      
      // Listed in its pick-up month (a booking for 1 Oct goes to October whatever month is open).
      const pickupMonth = pickupMonthOf(newResData as Reservation);
      const year = pickupMonth?.y ?? selectedYear;
      const month = pickupMonth?.m ?? selectedMonth;
      
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

      // The same booking number is already saved (e.g. its agreement was opened at the counter and closed):
      // that record is updated, so one rental never counts as two bookings.
      const existing = findBooking(reservations, reservationToSave.bookingId);
      if (existing) {
        const what = describeBooking(existing);
        if (!window.confirm(`Booking ${existing.bookingId} is already in the system as a ${what} for ${existing.personName || 'a customer'}.\n\nOK: update that booking with these details (no second booking is added).\nCancel: go back and check the booking number.`)) return;
        const filled = Object.fromEntries(Object.entries(reservationToSave).filter(([k, v]) => v !== '' && v !== undefined && v !== null && !((k === 'amount' || k === 'baseAmount') && v === 0))) as Partial<Reservation>;
        const target: Reservation = { ...existing, ...filled, id: existing.id, createdAt: existing.createdAt || timestamp, createdBy: existing.createdBy || reservationToSave.createdBy, uploadBatchId: existing.uploadBatchId, lastEditedBy: currentUser?.fullName };
        const merged = mergeAgreementInto(target, existing, currentUser?.fullName);
        if (!existing.awaitingConfirmation) { merged.confirmedBy = existing.confirmedBy; merged.confirmedAt = existing.confirmedAt; merged.linkedAgreementRef = existing.linkedAgreementRef; }
        setSaveStatus('saving');
        try {
          setReservations(await reservationService.updateReservation(merged));
          setSaveStatus('saved');
          setNewReservations(prev => prev.filter(r => r.id !== transientId));
          showConfirmation(`Booking ${merged.bookingId} updated — it was already saved as a ${what}, so no second booking was added.`);
          recordActivity('RESERVATION_UPDATED', 'reservation', `Updated existing ${what} ${merged.bookingId} for ${merged.personName} instead of adding a duplicate booking`, merged.bookingId);
        } catch (err) {
          setSaveStatus('error');
          console.error('Failed to update the existing booking:', err);
          addNotification('Failed to save reservation. Check connection.', 'error');
        }
        return;
      }

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
    // The booking is in the system after all: open its own agreement rather than a second record.
    const existing = findBooking(reservations, draft.bookingId);
    if (existing) {
      const cancelled = existing.status === ReservationStatus.CANCELLED || existing.status === ReservationStatus.NO_SHOW;
      if (!cancelled) {
        if (!window.confirm(`Booking ${existing.bookingId} is already in the system as a ${describeBooking(existing)} for ${existing.personName || 'a customer'}.\n\nOK: open its agreement.\nCancel: go back and check the booking number.`)) return;
        const at = pickupMonthOf(existing);
        setShowUnlistedAgreement(false);
        setModals(m => ({ ...m, viewRentalVoucher: { reservation: existing, year: existing.storageYear || at?.y || selectedYear, month: existing.storageMonth || at?.m || selectedMonth } }));
        return;
      }
      if (!window.confirm(`Booking ${existing.bookingId} is already in the system as a ${describeBooking(existing)} for ${existing.personName || 'a customer'}.\n\nOpen a new agreement with the same booking number anyway? It will show as a duplicate until one of them is deleted.`)) return;
    }
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

  /** Broker (XML) bookings are cancelled, never deleted: the broker is told and the record stays for commission and disputes. */
  const refuseBrokerDelete = (r?: Reservation) => {
    if (!r?.channelReservationNumber) return false;
    alert(`${r.bookingId} was booked by ${r.source || 'a broker'} through the XML connection (${r.channelReservationNumber}).\n\n`
      + 'Broker bookings cannot be deleted. Set its status to Cancelled instead: the broker is told, and the booking stays on record for commission and disputes.');
    return true;
  };

  const handleDeleteReservation = async (id: string, isNew?: boolean, year?: number, month?: string) => {
    if (refuseBrokerDelete(allReservationsFlat.find(r => r.id === id))) return;
    if (!window.confirm("Are you sure you want to delete this reservation?")) return;

    if (isNew) {
      setNewReservations(prev => prev.filter(res => res.id !== id));
      return;
    }

    // Found wherever it is filed: the list may show it by pick-up date while it is stored under another month.
    const deleted = allReservationsFlat.find(r => r.id === id);
    setSaveStatus('saving');
    try {
      const updatedData = await reservationService.deleteReservation(id, year ?? deleted?.storageYear ?? selectedYear, month ?? deleted?.storageMonth ?? selectedMonth);
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

  const handleDeleteAgreement = async (res: Reservation, reason: string) => {
    if (refuseBrokerDelete(res)) { setAgreementToDelete(null); return; }
    setDeletingAgreement(true);
    setSaveStatus('saving');
    try {
      const updatedData = await reservationService.deleteReservation(res.id, res.storageYear, res.storageMonth);
      setReservations(updatedData);
      setTableKey(prev => prev + 1);
      setSaveStatus('saved');
      setAgreementToDelete(null);
      showConfirmation(`${res.voucherSubmitted ? 'Agreement' : 'Reservation'} ${res.bookingId} deleted.`);
      const what = res.dropOffCompleted ? 'completed agreement' : res.voucherSubmitted ? 'open agreement (car was still out)' : res.awaitingConfirmation ? 'unlisted reservation' : 'reservation';
      recordActivity(res.voucherSubmitted ? 'AGREEMENT_DELETED' : 'RESERVATION_DELETED', 'agreement', `Deleted the ${what} for ${res.personName} (${res.carModel || 'vehicle'}${res.licensePlate ? ` ${res.licensePlate}` : ''})`, res.bookingId,
        `Reason: ${reason}\nRental: ${res.startDate?.slice(0, 16)} → ${res.endDate?.slice(0, 16)}\nAmount: ${res.amount ?? ''}\nSource: ${res.source || ''}`);
    } catch (err) {
      setSaveStatus('error');
      console.error('Failed to delete agreement:', err);
      addNotification('Could not delete the agreement. Check your connection and try again.', 'error');
    } finally {
      setDeletingAgreement(false);
    }
  };

  // Bookings filed under another month than their pick-up month are moved there.
  const handleMoveToPickupMonths = async () => {
    setSaveStatus('saving');
    try {
      const { data, moved } = await reservationService.moveToPickupMonths(reservations);
      setReservations(data);
      setTableKey(prev => prev + 1);
      setSaveStatus('saved');
      showConfirmation(`${moved} booking${moved === 1 ? '' : 's'} moved to ${moved === 1 ? 'its' : 'their'} pick-up month.`);
      recordActivity('RESERVATIONS_MOVED', 'reservation', `Moved ${moved} booking${moved === 1 ? '' : 's'} to their pick-up month`);
    } catch (err) {
      setSaveStatus('error');
      console.error('Failed to move reservations:', err);
      addNotification('Could not move the bookings. Check your connection and try again.', 'error');
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
                 handleUpdateReservations(updatedRes);
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

  const handleRequirePaymentConfirmation = (reservation: Reservation, _year: number, _month: string) => {
    if (!currentUser) return;

    const updatedReservation = {
        ...reservation,
        paymentConfirmationPending: true,
        paymentConfirmationRequestedBy: currentUser.fullName,
    };

    handleUpdateReservations(updatedReservation);
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

  const cleanupSections = [
    { key: 'reservations', label: 'Reservations & agreements', hint: 'All bookings, agreements (incl. unlisted), charges, extensions and late fees', count: allReservationsFlat.length, defaultOn: true },
    { key: 'fleet', label: 'Fleet vehicles', hint: 'All cars, with their deposits, excess and photos', count: fleet.length, defaultOn: true },
    { key: 'trafficTickets', label: 'Traffic tickets', hint: 'Fines recorded against rentals', count: trafficTickets.length, defaultOn: true },
    { key: 'vehicleDamages', label: 'Vehicle damages', hint: 'Damage reports and repairs', count: vehicleDamages.length, defaultOn: true },
    { key: 'invoices', label: 'Partner invoices', hint: 'Invoices generated for booking partners', count: invoices.length, defaultOn: true },
    { key: 'expenses', label: 'Expenses', hint: 'Accounting expenses', count: expenses.length, defaultOn: true },
    { key: 'franchisePayments', label: 'Franchise fee payments', hint: 'Recorded franchise payments', count: franchisePayments.length, defaultOn: true },
    { key: 'messages', label: 'Internal messages', hint: 'Staff messages', count: messages.length, defaultOn: false },
    { key: 'stopSales', label: 'OTA stop sales', hint: 'Channel stop-sale periods', count: stopSales.length, defaultOn: false },
  ];

  /** Administrator clean-up: downloads a full backup, clears the chosen sections on the server (which keeps its own backup), then reloads. */
  const handleBackupRestored = async () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const fresh = await fetchInitialData();
    if (fresh) handleDataUpdate(fresh);
    setNewReservations([]);
    recordActivity('BACKUP_RESTORED', 'settings', 'Restored a data backup');
    showConfirmation('Backup restored. The data on screen has been reloaded.');
  };

  const handleClearData = async (keys: string[]) => {
    try {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      const backup = await fetchInitialData();
      if (!backup) throw new Error('Could not read the current data for the backup.');
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `nct-backup-${stamp}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);

      const result = await clearDataSections(keys);
      const fresh = await fetchInitialData();
      if (fresh) handleDataUpdate(fresh);
      setNewReservations([]);
      recordActivity('DATA_CLEARED', 'settings', `Cleared ${result.cleared.join(', ')}`, undefined, `Server backup ${result.backupId}`);
      showConfirmation(`Data cleared. Backup downloaded and kept on the server (${result.backupId}).`);
    } catch (err: any) {
      console.error('Clean-up failed', err);
      addNotification(err?.response?.data?.error || 'Clean-up failed — nothing was removed. Please try again.', 'error');
    }
  };

  const handleSaveExtras = (reservation: Reservation, extras: ReservationExtra[], newAmount: number) => {
    handleUpdateSingleReservation({ ...reservation, extras, amount: newAmount, lastEditedBy: currentUser?.fullName });
    setReservationToAddExtras(null);
    showConfirmation(`Extras updated for ${reservation.personName}. New total $${newAmount.toFixed(2)}.`);
    recordActivity('EXTRAS_UPDATED', 'agreement', `Updated extras for ${reservation.personName}: ${extras.map(e => e.name + (e.isComplementary ? ' (free)' : '')).join(', ') || 'none'} — new total $${newAmount.toFixed(2)}`, reservation.bookingId);
  };

  const handleFleetUpdate = async (newFleet: Fleet) => {
    setFleet(newFleet);
    await saveSections({ fleet: newFleet }, 'Fleet updated successfully.', 'Failed to save fleet changes. Check connection.');
  };
  
  const handleSendMessage = (message: Omit<Message, 'id' | 'senderId' | 'senderName' | 'timestamp'>) => {
    if (!currentUser) return;
    const newMessage: Message = {
        id: `msg-${Date.now()}`,
        senderId: currentUser.id,
        senderName: currentUser.fullName,
        timestamp: new Date().toISOString(),
        ...message
    };
    const newMessages = [...messages, newMessage];
    setMessages(newMessages);
    saveSections({ messages: newMessages }, 'Message sent successfully!', 'Failed to save message. Check connection.');
  };

  const handleMarkMessageRead = (messageId: string) => {
      const newMessages = messages.map(msg => msg.id === messageId ? { ...msg, isRead: true } : msg);
      setMessages(newMessages);
      saveSections({ messages: newMessages }, '', 'Failed to update message. Check connection.');
  };
  
  const handleDeleteMessage = (messageId: string) => {
      const newMessages = messages.filter(msg => msg.id !== messageId);
      setMessages(newMessages);
      saveSections({ messages: newMessages }, '', 'Failed to delete message. Check connection.');
  };
  
  const handleShareReservation = (reservation: Reservation) => {
      setMessageToCompose(reservationShareMessage(reservation, currentUser?.fullName));
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

  const handleReservationsImport = useCallback(async (data: AppData, report: ImportReport, touchedYears: number[] = []) => {
    setReservations(data);
    // Bookings in a new year (e.g. returns in 2027) make that year selectable straight away.
    const dataYears = Object.keys(data).map(Number).filter(n => !isNaN(n));
    setYears(prev => {
        const next = [...new Set([...prev, ...dataYears, ...touchedYears])].sort((a, b) => a - b);
        if (next.length === prev.length) return prev;
        saveAllData({ years: next } as any).catch(console.error);
        return next;
    });
    setSaveStatus('saved');
    setTableKey(prev => prev + 1);
    
    if (report.imported === 0 && report.duplicates === 0) {
        addNotification(`Import complete: nothing was added or updated.`, 'warning');
    } else {
        addNotification(`Import complete: ${report.imported} added, ${report.duplicates} updated.`, 'success');
    }
    recordActivity('RESERVATIONS_IMPORTED', 'reservation', `Imported reservations from Excel: ${report.imported} added, ${report.duplicates} updated, ${report.invalidRows} skipped`);
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
  
  // Booking numbers saved on more than one record (see services/duplicates); drafts being typed are not counted.
  const duplicateBookingIds = useMemo(() => duplicateKeys(allReservationsFlat), [allReservationsFlat]);
  
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
  // Incomplete and pending bookings (Needs Attention); cancelled ones are listed there but not counted here.
  const attentionCount = useMemo(() => countAttention(findIssues(reservations, sources)), [reservations, sources]);
  const unlistedWaitingCount = useMemo(() => allReservationsFlat.filter(r => r.awaitingConfirmation && r.status !== ReservationStatus.CANCELLED).length, [allReservationsFlat]);
  const myEmail = (currentUser?.email || '').toLowerCase();
  const unlistedNewCount = useMemo(() => allReservationsFlat.filter(r => r.awaitingConfirmation && r.status !== ReservationStatus.CANCELLED
    && !(r.unlistedSeenBy || []).includes(myEmail)).length, [allReservationsFlat, myEmail]);

  // A save the server refused for lack of permission is said out loud, never lost silently.
  useEffect(() => {
    const onRefused = (e: Event) => {
      const names = (e as CustomEvent<string[]>).detail || [];
      addNotification(`Not saved: ${names.join(', ')}. Your account does not have permission to change this. Ask an administrator to give you the permission, then do it again.`, 'error', 'Change not saved');
    };
    window.addEventListener('nct:save-refused', onRefused);
    return () => window.removeEventListener('nct:save-refused', onRefused);
  }, [addNotification]);

  // Other screens (reservations banner, dashboard) can ask to open a view.
  useEffect(() => {
    const onNav = (e: Event) => { const v = (e as CustomEvent<string>).detail; if (v) handleNavigation(v); };
    window.addEventListener('nct:navigate', onNav);
    return () => window.removeEventListener('nct:navigate', onNav);
  });

  const { handleListUnlisted, handleLinkUnlisted, handleSaveUnlistedDraft, handleMarkUnlistedSeen, handleRejectUnlisted } = useUnlistedAgreements({
    currentUser, myEmail, setReservations, setSaveStatus, showConfirmation, addNotification, updateReservation: handleUpdateReservations,
  });

  // LocalStorage sync for availableExtras (workaround until backend supports it)
  useEffect(() => {
    const stored = localStorage.getItem('availableExtras');
    // Only someone allowed to manage extras may put a saved copy back on the server.
    if (stored && availableExtras.length === 0 && hasPermission(currentUser, UserPermission.ACTION_ADMIN_MANAGE_EXTRAS)) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAvailableExtras(parsed);
        }
      } catch { /* a damaged saved copy is ignored; the server copy is used */ }
    }
  }, [availableExtras.length, currentUser]);

  useEffect(() => {
    if (availableExtras.length > 0) {
      localStorage.setItem('availableExtras', JSON.stringify(availableExtras));
    }
  }, [availableExtras]);

  // Shell UI state (kept above the early returns so the hook order never changes).
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => { try { return localStorage.getItem('nct.sidebarCollapsed') === '1'; } catch { return false; } });
  const toggleSidebarCollapsed = () => setSidebarCollapsed(v => { const n = !v; try { localStorage.setItem('nct.sidebarCollapsed', n ? '1' : '0'); } catch { /* storage unavailable */ } return n; });
  if (!authChecked || isLoading || (isAuthenticated && !firstLoadDone)) return <LoadingSpinner />;
  if (!isAuthenticated && authChecked) return <Suspense fallback={<LoadingSpinner message="Opening" />}><LoginScreen users={users} /></Suspense>;
  
  // Moves a booking to another car (from the reservations list or from the agreement at the counter).
  const handleUpgradeVehicle = (reservation: Reservation, newCarId: string, customRate?: number, details?: UpgradeDetails): Reservation | null => {
    const newCar = fleet.find(c => c.id === newCarId);
    if (!newCar) return null;

    const upgradeFee = details?.fee ?? customRate ?? 0;
    const newTotal = (reservation.amount || 0) + upgradeFee;

    const updatedReservation: Reservation = {
      ...reservation,
      carModel: newCar.modelName,
      ...(details?.licensePlate !== undefined ? { licensePlate: details.licensePlate } : {}),
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
    return updatedReservation;
  };

  const renderReservationView = (isAgreementView = false) => (
    <ReservationTable
      allData={shownReservations}
      newReservations={newReservations}
      onUpdate={handleUpdateReservations}
      onAdd={handleAddNewReservation}
      onDelete={handleDeleteReservation}
      onDeleteAgreement={setAgreementToDelete}
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
      onUpgrade={handleUpgradeVehicle}
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
        fleet={fleet}
        allData={shownReservations}
        rentalSources={sources}
        onShowVoucher={(reservation, year, month) => setModals(m => ({ ...m, viewRentalVoucher: { reservation, year, month }}))}
      />
    ), permission: UserPermission.VIEW_TODAYS_RESERVATIONS },
    'Needs Attention': { component: (
      <NeedsAttentionView
        allData={shownReservations}
        sources={sources}
        onOpenBooking={(r, year, month) => { setSelectedYear(year); setSelectedMonth(month); handleNavigation('Reservations', { bookingIdSearch: r.bookingId || '' }); }}
        onOpenAgreement={(reservation, year, month) => setModals(m => ({ ...m, viewRentalVoucher: { reservation, year, month } }))}
      />
    ), permission: UserPermission.VIEW_NEEDS_ATTENTION },
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
            allData={shownReservations} 
            yearData={shownReservations[selectedYear]} 
            year={selectedYear} 
            companyDetails={companyDetails}
            franchisePayments={franchisePayments}
            onUpdateFranchisePayment={handleUpdateFranchisePayments}
            currentUser={currentUser}
            trafficTickets={trafficTickets}
            vehicleDamages={vehicleDamages}
        />
    ), permission: UserPermission.VIEW_REPORTS_YEARLY_SUMMARY },
    'Unlisted Agreements': { component: (
        <UnlistedAgreementsView
            allData={shownReservations}
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
            onDelete={hasPermission(currentUser, UserPermission.ACTION_RESERVATIONS_DELETE) ? setAgreementToDelete : undefined}
            onMarkSeen={handleMarkUnlistedSeen}
            onNewWalkIn={hasPermission(currentUser, UserPermission.ACTION_AGREEMENT_WITHOUT_RESERVATION) ? () => setShowUnlistedAgreement(true) : undefined}
        />
    ), permission: UserPermission.VIEW_RESERVATIONS },
    'Reservation Add-ons': { component: (
        <ReservationAddOnsView
            allData={shownReservations}
            tickets={trafficTickets}
            damages={vehicleDamages}
            sources={sources}
            company={companyDetails}
            onOpenBooking={(reservation, year, month) => setModals(m => ({ ...m, viewRentalVoucher: { reservation, year, month } }))}
            currentUser={currentUser}
        />
    ), permission: UserPermission.VIEW_RESERVATION_ADDONS },
    'Fleet Availability': { component: (
      <FleetAvailability 
        fleet={fleet} 
        yearData={shownReservations[selectedYear]} 
        year={selectedYear} 
        currentMonth={selectedMonth} 
        onMonthChange={handleSetSelectedMonth} 
        onYearChange={handleSetSelectedYear}
        rentalSources={sources}
      />
    ), permission: UserPermission.VIEW_FLEET_AVAILABILITY },
    'Invoice Generation': { component: <Invoice yearData={shownReservations[selectedYear]} allData={shownReservations} year={selectedYear} month={selectedMonth} companyDetails={companyDetails} sources={sources} aggregators={aggregators} invoices={invoices} currentUserName={currentUser?.fullName}
        onSaveInvoice={(inv) => persistInvoices([...invoices, inv])}
        onUpdateInvoice={(inv) => persistInvoices(invoices.map(i => i.id === inv.id ? inv : i))} />, permission: UserPermission.VIEW_REPORTS_INVOICE_GENERATION },
    'Source Performance': { component: <SourcePerformanceReport reservations={allReservationsFlat} year={selectedYear} month={selectedMonth} />, permission: UserPermission.VIEW_REPORTS_SOURCE_PERFORMANCE },
    'Accounting': { component: <AccountingDashboard allData={shownReservations} trafficTickets={trafficTickets} vehicleDamages={vehicleDamages} expenses={expenses} users={users} onUpdateExpenses={setExpenses} />, permission: UserPermission.VIEW_FINANCIALS_ACCOUNTING },
    'Payment Approvals': { component: <PaymentApprovals allData={shownReservations} onUpdateReservation={handleUpdateSingleReservation} currentUser={currentUser} showConfirmation={showConfirmation} companyDetails={companyDetails} />, permission: UserPermission.VIEW_FINANCIALS_PAYMENT_APPROVALS },
    'Deferred Payments': { component: <DeferredPayments allData={shownReservations} onCollectPayment={handleCollectDeferredPayment} currentUser={currentUser} />, permission: UserPermission.VIEW_FINANCIALS_DEFERRED_PAYMENTS },
    'Traffic Tickets': { component: (
        <TrafficTickets
            tickets={trafficTickets} allData={shownReservations}
            onAddTicket={ticket => setTrafficTickets(prev => [...prev, { ...ticket, id: `tt-${Date.now()}`, createdAt: new Date().toISOString() }])}
            onUpdateTicket={updatedTicket => setTrafficTickets(prev => prev.map(t => t.id === updatedTicket.id ? updatedTicket : t))}
            onDeleteTicket={id => setTrafficTickets(prev => prev.filter(t => t.id !== id))}
            currentUser={currentUser}
            companyDetails={companyDetails}
        />
    ), permission: UserPermission.VIEW_TRAFFIC_TICKETS },
    'Vehicle Damages': { component: (
         <VehicleDamages
            damages={vehicleDamages} allData={shownReservations}
            onAddDamage={damage => setVehicleDamages(prev => [...prev, { ...damage, id: `vd-${Date.now()}`, createdAt: new Date().toISOString() }])}
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
            rentalLocations={rentalLocations}
            companyDetails={companyDetails}
        />
    ), permission: UserPermission.VIEW_AGGREGATOR_SETUP },
    'User & Staff Management': { component: (
        <UserManagement 
          users={users} 
          onUpdateUsers={async (updatedUsers) => {
            setUsers(updatedUsers);
            await saveSections({ users: updatedUsers }, 'Users updated.', 'Failed to save users. Check connection.');
          }} 
          currentUser={currentUser} 
        />
    ), permission: UserPermission.ACTION_ADMIN_MANAGE_USERS },
    'Website Sources': { component: (
        <ManageSourcesView 
            sources={sources} 
            onAdd={async (s) => {
                const newSources = [...sources, s];
                setSources(newSources);
                await saveSections({ sources: newSources }, 'Source added successfully.', 'Failed to save source to cloud. Check connection.');
            }} 
            onDelete={async (id) => {
                const newSources = sources.filter(src => src.id !== id);
                setSources(newSources);
                await saveSections({ sources: newSources }, 'Source deleted.', 'Failed to delete source.');
            }}
            onUpdate={async (s) => {
                const newSources = sources.map(src => src.id === s.id ? s : src);
                setSources(newSources);
                await saveSections({ sources: newSources }, 'Source updated.', 'Failed to update source.');
            }}
        />
    ), permission: UserPermission.ACTION_ADMIN_MANAGE_SOURCES },
     'Manage Locations': { component: (
        <ManageLocationsView
            locations={rentalLocations}
            onUpdate={async (newLocations) => {
                setRentalLocations(newLocations);
                await saveSections({ rentalLocations: newLocations }, 'Locations updated.', 'Failed to save locations. Check connection.');
            }}
        />
    ), permission: UserPermission.ACTION_ADMIN_MANAGE_LOCATIONS },
    'Fleet Management': { component: <ManageFleetView fleet={fleet} onUpdate={handleFleetUpdate} />, permission: UserPermission.ACTION_ADMIN_MANAGE_FLEET },
    'Manage Extras': { component: <ManageExtrasView extras={availableExtras} onUpdate={async (newExtras) => {
        setAvailableExtras(newExtras);
        localStorage.setItem('availableExtras', JSON.stringify(newExtras));
        if (await saveSections({ availableExtras: newExtras }, 'Extras updated.', 'Failed to save extras to server, but stored locally.', 'warning')) await fetchAllData();
    }} />, permission: UserPermission.ACTION_ADMIN_MANAGE_EXTRAS },
    'Company Details': { component: <ManageCompanyDetailsView details={companyDetails} onUpdate={async (newDetails) => {
        setCompanyDetails(newDetails);
        await saveSections({ companyDetails: newDetails }, 'Company details updated.', 'Failed to save company details. Check connection.');
    }} cleanup={hasPermission(currentUser, UserPermission.ACTION_ADMIN_MANAGE_USERS) ? { sections: cleanupSections, onClear: handleClearData, onRestored: handleBackupRestored } : undefined} />, permission: UserPermission.ACTION_ADMIN_MANAGE_COMPANY_DETAILS },
    'Agreement Terms': { component: <AgreementTermsView details={companyDetails} currentUser={currentUser} onSave={async (newDetails) => {
        setCompanyDetails(newDetails);
        try {
            await saveAllData(cleanUndefined({ companyDetails: newDetails }));
            recordActivity('AGREEMENT_TERMS_UPDATED', 'settings', 'Updated the rental agreement terms and conditions');
            showConfirmation('Agreement terms saved. New agreements use the updated text.');
        } catch (err) {
            console.error('Failed to save agreement terms:', err);
            addNotification('Failed to save the agreement terms. Check connection.', 'error');
        }
    }} />, permission: UserPermission.ACTION_ADMIN_MANAGE_COMPANY_DETAILS },
    'Manage Years': { component: <ManageYearsView years={years} onAddYear={handleAddYear} onRemoveYear={handleRemoveYear} />, permission: UserPermission.ACTION_ADMIN_MANAGE_YEARS },
    'Activity Log': { component: <StaffActivityView users={users} />, permission: UserPermission.VIEW_SYSTEM_ACTIVITY_LOG },
    'Email Settings': { component: <EmailSettingsView defaultFromName={companyDetails.name} defaultTestTo={currentUser?.email} />, permission: UserPermission.ACTION_ADMIN_MANAGE_EMAIL_SETTINGS },
    'My Profile': { component: (
        <ProfileView
            currentUser={currentUser!}
            onUserUpdate={async (updatedUser: User) => {
                const newUsers = users.map(u => u.id === updatedUser.id ? updatedUser : u);
                setUsers(newUsers);
                await saveSections({ users: newUsers }, 'Profile updated.', 'Failed to save profile. Check connection.');
            }}
        />
    ), permission: UserPermission.VIEW_MY_PROFILE },
    'Import Reservations': { component: (
        <ExcelUpload onReservationsImported={handleReservationsImport} years={years} focusYear={selectedYear} focusMonth={selectedMonth}
            allData={shownReservations} sources={sources} fleet={fleet}
            onAddSources={async added => {
                const next = [...sources, ...added];
                setSources(next);
                await saveAllData({ sources: next } as any);
            }}
            onOpenReservations={() => setMainView('Reservations')}
            onReservationsMoved={(data, moved) => {
                setReservations(data);
                setTableKey(prev => prev + 1);
                addNotification(`${moved} booking${moved === 1 ? '' : 's'} moved to ${moved === 1 ? 'its' : 'their'} pick-up month.`, 'info');
                recordActivity('RESERVATIONS_MOVED', 'reservation', `Moved ${moved} booking${moved === 1 ? '' : 's'} to their pick-up month`);
            }} />
    ), permission: UserPermission.VIEW_IMPORT_RESERVATIONS },
  };

  const sidebarGroups = sidebarLinks({
    unlistedWaitingCount, unlistedNewCount, attentionCount, unreadCount, pendingApprovalsCount,
    openUnlistedAgreement: () => setShowUnlistedAgreement(true),
  });

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
    const hit = findBookingMonth(reservations, term);
    if (hit) { handleSetSelectedYear(hit.year); handleSetSelectedMonth(hit.month); }
    else addNotification(`No booking matches "${term}".`, 'info');
    handleNavigation('Reservations', { bookingIdSearch: term });
  };
  return (
    <div className="flex h-screen bg-slate-50">
      <AppSidebar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} sidebarCollapsed={sidebarCollapsed}
        toggleSidebarCollapsed={toggleSidebarCollapsed} sidebarGroups={sidebarGroups} companyDetails={companyDetails}
        currentUser={currentUser} mainView={mainView} handleNavigation={handleNavigation} userInitials={userInitials} handleLogout={handleLogout} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <AppHeader mainView={mainView} currentUser={currentUser} setIsSidebarOpen={setIsSidebarOpen} sidebarCollapsed={sidebarCollapsed}
            toggleSidebarCollapsed={toggleSidebarCollapsed} runGlobalSearch={runGlobalSearch} saveStatus={saveStatus} lastSaved={lastSaved}
            setMainView={setMainView} fetchAllData={() => { fetchAllData(); }} executeAutoSave={() => { executeAutoSave(); }}
            showDateSelectors={showDateSelectors} newItems={newItems} handleNavigation={handleNavigation} unreadCount={unreadCount}
            userInitials={userInitials} handleLogout={handleLogout}
            dates={{ selectedYear, years, selectedMonth, mainView, handleSetSelectedYear, handleSetSelectedMonth }} />
        <main className="flex-1 p-4 pb-24 md:pb-6 overflow-y-auto sm:p-6 bg-slate-50 min-w-0">
            <div className="max-w-[1500px] mx-auto">
            <Suspense fallback={<LoadingSpinner variant="inline" />}>
              {currentViewHasAccess 
                ? <ErrorBoundary resetKey={mainView}>
                    {mainView === 'Reservations' && hasPermission(currentUser, UserPermission.ACTION_RESERVATIONS_EDIT) && (
                      <MisfiledNotice data={shownReservations} onMove={handleMoveToPickupMonths}
                        onReview={hasPermission(currentUser, UserPermission.VIEW_IMPORT_RESERVATIONS) ? () => setMainView('Import Reservations') : undefined} />
                    )}
                    {mainViews[mainView]?.component}
                  </ErrorBoundary>
                : <div className="p-12 text-center bg-white rounded-lg shadow-md">
                    <h2 className="text-xl font-bold text-red-600">Access Denied</h2>
                    <p className="mt-2 text-gray-600">You do not have permission to view this page.</p>
                  </div>
              }
              </Suspense>
            </div>
        </main>

        <PhoneTabBar currentUser={currentUser} mainView={mainView} handleNavigation={handleNavigation} setIsSidebarOpen={setIsSidebarOpen} unreadCount={unreadCount} />
      </div>

      <Suspense fallback={<LoadingSpinner />}>
      <AnimatedModal isOpen={!!modals.viewVoucher} onClose={() => setModals(m=>({...m, viewVoucher: null}))}>
        {modals.viewVoucher && <Voucher fleet={fleet} allData={shownReservations} availableExtras={availableExtras} onUpgrade={handleUpgradeVehicle} canUpgrade={hasPermission(currentUser, UserPermission.ACTION_RESERVATIONS_UPGRADE_VEHICLE)} reservation={modals.viewVoucher.reservation} sources={sources} rentalLocations={rentalLocations} companyDetails={companyDetails} trafficTickets={trafficTickets} onRecordReturnCharges={handleRecordReturnCharges} onClose={() => setModals(m=>({...m, viewVoucher: null}))} onUpdate={(res) => {handleUpdateReservations(res); }} />}
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
      {modals.viewRentalVoucher && <Voucher fleet={fleet} allData={shownReservations} availableExtras={availableExtras} onUpgrade={handleUpgradeVehicle} canUpgrade={hasPermission(currentUser, UserPermission.ACTION_RESERVATIONS_UPGRADE_VEHICLE)} reservation={modals.viewRentalVoucher.reservation} sources={sources} rentalLocations={rentalLocations} companyDetails={companyDetails} trafficTickets={trafficTickets} onRecordReturnCharges={handleRecordReturnCharges} onClose={() => setModals(m=>({...m, viewRentalVoucher: null}))} onUpdate={(res) => {handleUpdateReservations(res); }} />}

      <AnimatedModal isOpen={!!modals.viewReceipt} onClose={() => setModals(m=>({...m, viewReceipt: null}))}>
        {modals.viewReceipt && <Receipt reservation={modals.viewReceipt} companyDetails={companyDetails} sources={sources} onClose={() => setModals(m=>({...m, viewReceipt: null}))} />}
      </AnimatedModal>

      {agreementToDelete && <DeleteAgreementDialog reservation={agreementToDelete} busy={deletingAgreement} onCancel={() => setAgreementToDelete(null)} onConfirm={reason => handleDeleteAgreement(agreementToDelete, reason)} />}
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
