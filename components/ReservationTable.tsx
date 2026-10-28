import React, { useState, useMemo, useEffect, useRef } from 'react';
import { effectivePermissions } from '../services/permissionCatalog';
import CarPicture from './CarPicture';
import * as XLSX from 'xlsx';
import { AppData, Reservation, RentalSource, Fleet, User, ReservationStatus, RentalLocation, AvailableExtra, CompanyDetails, UserPermission, PaymentType } from '../types';
import { MONTHS } from '../constants';
import { VehicleArt, vehicleKind, vehicleKindLabel } from './VehicleGraphics';
import UpgradeVehicleModal, { UpgradeDetails } from './UpgradeVehicleModal';
import ReservationWizard from './reservation/ReservationWizard';
import { clearDraft, loadDraft, saveDraft } from '../services/drafts';
import ReservationRecord from './reservation/ReservationRecord';
import { recordActivity } from '../firebase/api';
import { bookingKey } from '../services/duplicates';
import SendDocumentsDialog from './SendDocumentsDialog';
import ChangeStatusDialog, { statusLabel } from './ChangeStatusDialog';
import { bookingPayment, paymentUnset } from '../services/paymentType';
import { agreementHtmlFor, printHtml, terminationHtmlFor } from '../services/printDocs';
import { rentalDaysOf as billingDays } from '../services/rentalDays';
import { mergeSelectedExtras, selectedExtrasTotal } from '../services/extras';
import { 
  DocumentReportIcon, 
  ShareIcon, 
  CurrencyDollarIcon, 
  ClockIcon,
  PlusCircleIcon,
  PhoneIcon,
  CalendarIcon,
  SearchIcon,
  PdfIcon,
  ExportIcon,
  CloseIcon,
  AirplaneIcon,
  AirplaneLandingIcon,
  AirplaneTakeoffIcon,
  DowntownIcon,
  UserIcon,
  MapPinIcon,
  HashtagIcon,
  GlobeAltIcon,
  CarIcon,
  IdentificationIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  TrashIcon,
  EyeIcon,
  MailIcon,
  PlusIcon,
  DownloadIcon,
  EditIcon,
  ShieldExclamationIcon
} from './icons';

interface ReservationTableProps {
  allData: AppData;
  newReservations: Reservation[];
  onUpdate: (reservation: Reservation, oldYear: number, oldMonth: string) => void;
  onAdd: (status?: ReservationStatus) => void;
  onDelete: (id: string, isNew?: boolean, year?: number, month?: string) => void;
  /** Deletes a finished rental (checked out and checked in) after a typed confirmation. */
  onDeleteAgreement?: (reservation: Reservation) => void;
  onDeleteMonth: (year: number, month: string) => void;
  onSaveNew: (reservation: Reservation) => void;
  selectedYear: number;
  selectedMonth: string;
  rentalSources: RentalSource[];
  carModels: string[];
  duplicateBookingIds: Set<string>;
  fleet: Fleet;
  rentalLocations: RentalLocation[];
  onShowVoucher: (reservation: Reservation, year: number, month: string) => void;
  onShowRentalVoucher: (reservation: Reservation, year: number, month: string) => void;
  onShowReceipt: (reservation: Reservation) => void;
  onExtend: (reservation: Reservation) => void;
  onShare: (reservation: Reservation) => void;
  onRequirePaymentConfirmation: (reservation: Reservation, year: number, month: string) => void;
  onEditReservation: (reservation: Reservation) => void;
  onUpgrade: (reservation: Reservation, newCarId: string, customRate?: number, details?: UpgradeDetails) => void;
  onAssignCar?: (reservation: Reservation) => void;
  onAddExtras?: (reservation: Reservation) => void;
  currentUser: User | null;
  filters: any;
  setFilters: any;
  isDesktopView: boolean;
  companyDetails: CompanyDetails;
  availableExtras: AvailableExtra[];
  isAgreementView?: boolean;
  onOpenUnlistedAgreement?: () => void;
}

const ReservationTable: React.FC<ReservationTableProps> = (props) => {
  const {
    allData,
    newReservations,
    onAdd,
    onDelete,
    onDeleteAgreement,
    onDeleteMonth,
    selectedYear,
    selectedMonth,
    rentalSources,
    duplicateBookingIds,
    rentalLocations,
    onShowVoucher,
    onShowRentalVoucher,
    onShowReceipt,
    onExtend,
    onShare,
    onRequirePaymentConfirmation,
    onEditReservation,
    onUpgrade,
    onAssignCar,
    onAddExtras,
    currentUser,
    filters,
    setFilters,
    isDesktopView,
    fleet,
    availableExtras,
    onSaveNew,
    isAgreementView = false,
    onOpenUnlistedAgreement,
  } = props;

  // Helper to check permissions
  const hasPermission = (permission: UserPermission): boolean => {
    return !!currentUser && effectivePermissions(currentUser.permissions || []).includes(permission);
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [formData, setFormData] = useState<Partial<Reservation>>({
    personName: '',
    contactNumber: '',
    bookingId: '',
    source: '',
    carModel: '',
    startDate: '',
    endDate: '',
    amount: 0,
    locationName: '',
    notes: '',
    status: ReservationStatus.CONFIRMED,
    selectedExtras: [] as string[],
  });

  const [detailsModalReservation, setDetailsModalReservation] = useState<Reservation | null>(null);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeReservation, setUpgradeReservation] = useState<Reservation | null>(null);
  const [localBookingIdSearch, setLocalBookingIdSearch] = useState<string>(filters?.bookingIdSearch || '');
  // Keep the box in step when a search arrives from elsewhere (the top-bar booking search).
  useEffect(() => { setLocalBookingIdSearch(filters?.bookingIdSearch || ''); }, [filters?.bookingIdSearch]);
  const [stageTab, setStageTab] = useState<'all' | 'ready' | 'onrent' | 'closed' | 'pending' | 'cancelled' | 'noshow' | 'duplicates'>('all');
  const [sortKey, setSortKey] = useState<'pickup' | 'return' | 'name' | 'amount' | 'booking'>('pickup');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [quick, setQuick] = useState<null | 'pickupToday' | 'returnToday' | 'overdue'>(null);
  const [sourceFilterLocal, setSourceFilterLocal] = useState('');
  const [branchFilterLocal, setBranchFilterLocal] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);


  // Ref to prevent closing modal on same tick
  const modalOpenTime = useRef(0);

  useEffect(() => {
    setLocalBookingIdSearch(filters.bookingIdSearch || '');
  }, [filters.bookingIdSearch]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalBookingIdSearch(value);
    setFilters((prev: any) => ({ ...prev, bookingIdSearch: value }));
  };

  const getAgreementStatusFilter = (): 'all' | 'pending' | 'open' | 'closed' | 'submitted' => {
    if (filters.dropOffCompleted === true) return 'closed';
    if (filters.voucherSubmitted === true && filters.dropOffCompleted === false) return 'open';
    if (filters.voucherSubmitted === true && filters.dropOffCompleted === undefined) return 'submitted';
    if (filters.voucherSubmitted === false && filters.dropOffCompleted === false) return 'pending';
    return 'all';
  };

  const handleAgreementStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;

    if (value === 'pending') {
      setFilters((prev: any) => ({ ...prev, voucherSubmitted: false, dropOffCompleted: false }));
      return;
    }
    if (value === 'open') {
      setFilters((prev: any) => ({ ...prev, voucherSubmitted: true, dropOffCompleted: false }));
      return;
    }
    if (value === 'closed') {
      setFilters((prev: any) => ({ ...prev, voucherSubmitted: undefined, dropOffCompleted: true }));
      return;
    }
    if (value === 'submitted') {
      setFilters((prev: any) => ({ ...prev, voucherSubmitted: true, dropOffCompleted: undefined }));
      return;
    }

    setFilters((prev: any) => ({ ...prev, voucherSubmitted: undefined, dropOffCompleted: undefined }));
  };

  // Reset form when modal closes
  useEffect(() => {
    if (!isModalOpen) {
      setFormData({
        personName: '',
        contactNumber: '',
        bookingId: '',
        source: '',
        carModel: '',
        startDate: '',
        endDate: '',
        amount: 0,
        locationName: '',
        notes: '',
        status: ReservationStatus.CONFIRMED,
        selectedExtras: [],
      });
    }
  }, [isModalOpen]);

  useEffect(() => {
    if (!isUpgradeModalOpen) {
      setUpgradeReservation(null);
    }
  }, [isUpgradeModalOpen]);

  const openEditModal = (res: Reservation) => {
    setModalMode('edit');
    
    // Calculate current extras total to get the "Amount" for the form
    const extrasTotal = res.startDate && res.endDate ? selectedExtrasTotal((res as any).selectedExtras, availableExtras, billingDays(res.startDate, res.endDate)) : 0;

    setFormData({
      ...res,
      amount: (res.amount || 0) - extrasTotal,
      selectedExtras: res.selectedExtras || [],
    });
    setIsModalOpen(true);
  };

  // An unfinished new reservation survives a reload or closing the page.
  const [restoredDraftAt, setRestoredDraftAt] = useState<number | null>(null);
  const openAddModal = () => {
    setModalMode('add');
    const d = loadDraft<Partial<Reservation>>('reservation:new');
    if (d) { setFormData(prev => ({ ...prev, ...d.data })); setRestoredDraftAt(d.savedAt); } else setRestoredDraftAt(null);
    setIsModalOpen(true);
  };
  useEffect(() => {
    if (!isModalOpen || modalMode !== 'add') return;
    const t = window.setTimeout(() => {
      const f = formData as any;
      const touched = !!(f.personName || f.contactNumber || f.customerEmail || f.bookingId || f.carModel || f.startDate || f.endDate || f.amount || f.notes || (f.selectedExtras || []).length);
      if (touched) saveDraft('reservation:new', formData); else clearDraft('reservation:new');
    }, 400);
    return () => window.clearTimeout(t);
  }, [formData, isModalOpen, modalMode]);
  // The top bar's "New → Reservation" opens the wizard here.
  useEffect(() => {
    const onNew = () => openAddModal();
    window.addEventListener('nct:new-reservation', onNew);
    return () => window.removeEventListener('nct:new-reservation', onNew);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openUpgradeModal = (res: Reservation) => {
    setUpgradeReservation(res);
    setIsUpgradeModalOpen(true);
  };

  const durationDays = useMemo(() => {
    if (!formData.startDate || !formData.endDate) return 0;
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const diff = end.getTime() - start.getTime();
    return Math.max(0, diff / (1000 * 3600 * 24));
  }, [formData.startDate, formData.endDate]);

  const calculatedTotal = useMemo(() => {
    const base = formData.amount || 0;
    const days = formData.startDate && formData.endDate ? billingDays(formData.startDate, formData.endDate) : 0;
    return base + selectedExtrasTotal((formData as any).selectedExtras, availableExtras, days);
  }, [formData.amount, formData.selectedExtras, formData.startDate, formData.endDate, availableExtras]);

  const handleChange = (field: keyof Reservation, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleExtraToggle = (extraId: string) => {
    setFormData(prev => {
      const current = prev.selectedExtras || [];
      if (current.includes(extraId)) {
        return { ...prev, selectedExtras: current.filter(id => id !== extraId) };
      } else {
        return { ...prev, selectedExtras: [...current, extraId] };
      }
    });
  };

  const handleSave = () => {
    // Chosen extras are itemised on the booking so agreements and reports show them.
    const extras = ((formData as any).selectedExtras || []).length ? mergeSelectedExtras(formData.extras, (formData as any).selectedExtras, availableExtras) : formData.extras;
    const days = formData.startDate && formData.endDate ? billingDays(formData.startDate, formData.endDate) : 0;
    const extrasCharged = (extras || []).reduce((s, e) => (e.isComplementary ? s : s + e.dailyPrice * days), 0);
    const reservationData: Partial<Reservation> = {
      ...formData,
      ...(extras ? { extras, baseAmount: Math.max(0, calculatedTotal - extrasCharged) } : {}),
      amount: calculatedTotal,
      id: modalMode === 'edit' ? formData.id : `new-${Date.now()}`,
      lastEditedBy: currentUser?.fullName,
      createdBy: modalMode === 'add' ? currentUser?.fullName : formData.createdBy,
    };
    if (modalMode === 'add') {
      clearDraft('reservation:new');
      setRestoredDraftAt(null);
      if (onSaveNew) {
        onSaveNew(reservationData as Reservation);
      } else if (onAdd) {
        onAdd();
      }
    } else {
      onEditReservation(reservationData as Reservation);
      recordActivity('RESERVATION_EDITED', 'reservation', `Edited reservation for ${reservationData.personName}`, reservationData.bookingId);
    }
    setIsModalOpen(false);
  };

  const monthReservations = allData[selectedYear]?.[selectedMonth] || [];
  const allDisplayReservations = useMemo(() => [...monthReservations, ...newReservations], [monthReservations, newReservations]);

  const getReservationPeriod = (reservation: Reservation) => {
    if (reservation.startDate) {
      const parsedDate = new Date(reservation.startDate);
      if (!Number.isNaN(parsedDate.getTime())) {
        return {
          year: parsedDate.getFullYear(),
          month: MONTHS[parsedDate.getMonth()],
        };
      }
    }

    return { year: selectedYear, month: selectedMonth };
  };

  const filteredReservations = useMemo(() => {
    let result = allDisplayReservations;
    if (filters.sourceFilter) result = result.filter(r => r.source === filters.sourceFilter);
    if (filters.carModelFilter) result = result.filter(r => r.carModel === filters.carModelFilter);
    if (filters.statusFilter) result = result.filter(r => r.status === filters.statusFilter);
    if (typeof filters.voucherSubmitted === 'boolean') result = result.filter(r => Boolean(r.voucherSubmitted) === filters.voucherSubmitted);
    if (typeof filters.dropOffCompleted === 'boolean') result = result.filter(r => Boolean(r.dropOffCompleted) === filters.dropOffCompleted);
    if (filters.bookingIdSearch) {
      const search = filters.bookingIdSearch.toLowerCase();
      result = result.filter(r => 
        (r.bookingId && r.bookingId.toLowerCase().includes(search)) ||
        (r.personName && r.personName.toLowerCase().includes(search)) ||
        (r.contactNumber && r.contactNumber.toLowerCase().includes(search)) ||
        (r.licensePlate && r.licensePlate.toLowerCase().includes(search))
      );
    }
    return result;
  }, [allDisplayReservations, filters]);

  const getSourceName = (sourceId: string) => rentalSources.find(s => s.id === sourceId)?.name || sourceId;
  // Short payment tag for a booking: prepaid, pay on arrival, or "set payment" when its source takes both.
  const payTag = (res: Reservation) => {
    if (paymentUnset(res, rentalSources) && !res.dropOffCompleted && res.status !== ReservationStatus.CANCELLED) return <span className="inline-block px-1.5 py-px rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 text-[10px] font-semibold whitespace-nowrap">Set payment</span>;
    const t = bookingPayment(res, rentalSources);
    if (!t) return null;
    return t === PaymentType.PREPAID
      ? <span className="inline-block px-1.5 py-px rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold whitespace-nowrap">Prepaid</span>
      : <span className="inline-block px-1.5 py-px rounded bg-amber-50 text-amber-700 text-[10px] font-semibold whitespace-nowrap">Pay on arrival</span>;
  };
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const formatDateOnly = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const getDuration = (start: string, end: string) => {
    if (!start || !end) return '';
    const diff = new Date(end).getTime() - new Date(start).getTime();
    return (diff / (1000 * 3600 * 24)).toFixed(1);
  };

  const handleExportExcel = () => {
    if (filteredReservations.length === 0) return;

    const data = filteredReservations.map(res => ({
      'Person Name': res.personName,
      'Booking ID': res.bookingId,
      'Source': getSourceName(res.source || ''),
      'Car Model': res.carModel,
      'Booking Date': res.bookingDate || res.startDate?.split('T')[0],
      'Pickup Date': res.startDate,
      'Return Date': res.endDate,
      'Days': getDuration(res.startDate, res.endDate),
      'Status': res.status,
      'Location': res.locationName,
      'Contact': res.contactNumber,
      'Notes': res.notes
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reservations");
    
    XLSX.writeFile(workbook, `Reservations_${selectedMonth}_${selectedYear}.xlsx`);
  };

  const handleExportCSV = () => {
    if (filteredReservations.length === 0) return;

    const data = filteredReservations.map(res => ({
      'Person Name': res.personName,
      'Booking ID': res.bookingId,
      'Source': getSourceName(res.source || ''),
      'Car Model': res.carModel,
      'Booking Date': res.bookingDate || res.startDate?.split('T')[0],
      'Pickup Date': res.startDate,
      'Return Date': res.endDate,
      'Days': getDuration(res.startDate, res.endDate),
      'Status': res.status,
      'Location': res.locationName,
      'Contact': res.contactNumber,
      'Notes': res.notes
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Reservations_${selectedMonth}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  const getStatusColor = (status: ReservationStatus) => {
    switch(status) {
      case ReservationStatus.CONFIRMED: return 'bg-green-100 text-green-800';
      case ReservationStatus.COMPLETED: return 'bg-blue-100 text-blue-800';
      case ReservationStatus.CANCELLED: return 'bg-red-100 text-red-800';
      case 'NO_SHOW': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const upgradePermission = hasPermission(UserPermission.ACTION_RESERVATIONS_UPGRADE_VEHICLE);
  const canViewVoucherActions = isAgreementView || hasPermission(UserPermission.ACTION_VOUCHER_MANAGE);

  // ---- Rental lifecycle -------------------------------------------------
  type Stage = 'ready' | 'onrent' | 'closed' | 'pending' | 'cancelled';
  const stageOf = (res: Reservation): Stage => {
    if (res.status === ReservationStatus.CANCELLED || res.status === ('NO_SHOW' as ReservationStatus)) return 'cancelled';
    if (res.dropOffCompleted) return 'closed';
    if (res.voucherSubmitted) return 'onrent';
    if (res.status === ReservationStatus.PENDING) return 'pending';
    return 'ready';
  };
  const STAGE_META: Record<Stage, { label: string; dot: string; chip: string }> = {
    ready: { label: 'Awaiting pickup', dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 ring-sky-200' },
    onrent: { label: 'On rent', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    closed: { label: 'Closed', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600 ring-slate-200' },
    pending: { label: 'Pending', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 ring-amber-200' },
    cancelled: { label: 'Cancelled', dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 ring-rose-200' },
  };
  const todayKey = new Date().toISOString().slice(0, 10);
  const alertOf = (res: Reservation): { label: string; cls: string } | null => {
    const stage = stageOf(res);
    const pickupDay = (res.startDate || '').slice(0, 10);
    if (stage === 'ready' && pickupDay === todayKey) return { label: 'Pickup today', cls: 'bg-sky-600 text-white' };
    if (stage === 'ready' && pickupDay && pickupDay < todayKey) return { label: 'Pickup overdue', cls: 'bg-amber-500 text-white' };
    if (stage === 'onrent' && res.endDate && new Date(res.endDate).getTime() < Date.now()) return { label: 'Return overdue', cls: 'bg-rose-600 text-white' };
    if (stage === 'onrent' && (res.endDate || '').slice(0, 10) === todayKey) return { label: 'Returns today', cls: 'bg-emerald-600 text-white' };
    return null;
  };
  const rentalDaysOf = (res: Reservation) => {
    if (!res.startDate || !res.endDate) return 0;
    return Math.max(1, Math.ceil((new Date(res.endDate).getTime() - new Date(res.startDate).getTime()) / 86400000));
  };
  const timeOf = (iso?: string) => (iso && iso.includes('T') ? iso.split('T')[1].slice(0, 5) : '');
  const shortDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };
  const initials = (name?: string) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
  const money = (n?: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Filter tabs: the lifecycle stages, with cancelled and no-show apart, and records sharing a booking number.
  type Tab = 'all' | Stage | 'noshow' | 'duplicates';
  const isNoShow = (r: Reservation) => r.status === ReservationStatus.NO_SHOW;
  const isDup = (r: Reservation) => duplicateBookingIds.has(bookingKey(r));
  const inTab = (r: Reservation, t: Tab) => t === 'all' ? true
    : t === 'duplicates' ? isDup(r)
    : t === 'noshow' ? isNoShow(r)
    : t === 'cancelled' ? stageOf(r) === 'cancelled' && !isNoShow(r)
    : stageOf(r) === t;
  const stageCounts = useMemo(() => {
    const c: Record<string, number> = { all: filteredReservations.length, ready: 0, onrent: 0, closed: 0, pending: 0, cancelled: 0, noshow: 0, duplicates: 0 };
    filteredReservations.forEach(r => {
      const st = stageOf(r);
      c[st === 'cancelled' && isNoShow(r) ? 'noshow' : st]++;
      if (isDup(r)) c.duplicates++;
    });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredReservations, duplicateBookingIds]);
  // A rental is one booking whatever its stage; copies under the same booking number count once.
  const uniqueBookings = useMemo(() => {
    const keys = new Set<string>();
    let unnumbered = 0;
    filteredReservations.forEach(r => { const k = bookingKey(r); if (k) keys.add(k); else unnumbered++; });
    return keys.size + unnumbered;
  }, [filteredReservations]);

  const visibleReservations = useMemo(() => {
    let list = stageTab === 'all' ? filteredReservations : filteredReservations.filter(r => inTab(r, stageTab));
    if (sourceFilterLocal) list = list.filter(r => r.source === sourceFilterLocal);
    if (branchFilterLocal) list = list.filter(r => (r.locationName || '') === branchFilterLocal);
    if (quick === 'pickupToday') list = list.filter(r => stageOf(r) === 'ready' && (r.startDate || '').slice(0, 10) === todayKey);
    if (quick === 'returnToday') list = list.filter(r => stageOf(r) === 'onrent' && (r.endDate || '').slice(0, 10) === todayKey);
    if (quick === 'overdue') list = list.filter(r => /overdue/i.test(alertOf(r)?.label || ''));
    const dir = sortDir === 'asc' ? 1 : -1;
    // Copies of the same booking sit next to each other so the extra one is easy to spot.
    if (stageTab === 'duplicates') return [...list].sort((a, b) => bookingKey(a).localeCompare(bookingKey(b), undefined, { numeric: true }) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'return': return dir * (a.endDate || '').localeCompare(b.endDate || '');
        case 'name': return dir * (a.personName || '').localeCompare(b.personName || '');
        case 'amount': return dir * ((a.amount || 0) - (b.amount || 0));
        case 'booking': return dir * (a.bookingId || '').localeCompare(b.bookingId || '', undefined, { numeric: true });
        default: return dir * (a.startDate || '').localeCompare(b.startDate || '');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredReservations, stageTab, sortKey, sortDir, sourceFilterLocal, branchFilterLocal, quick, duplicateBookingIds]);

  const actionToday = filteredReservations.filter(r => alertOf(r) !== null).length;

  const TABS: { key: Tab; label: string }[] = [
    ...(isAgreementView
      ? [{ key: 'all', label: 'All' }, { key: 'ready', label: 'To check out' }, { key: 'onrent', label: 'On rent' }, { key: 'closed', label: 'Closed' }]
      : [{ key: 'all', label: 'All' }, { key: 'ready', label: 'Awaiting pickup' }, { key: 'onrent', label: 'On rent' }, { key: 'closed', label: 'Closed' }, { key: 'pending', label: 'Pending' }]) as { key: Tab; label: string }[],
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'noshow', label: 'No-show' },
    ...(stageCounts.duplicates > 0 || stageTab === 'duplicates' ? [{ key: 'duplicates' as Tab, label: 'Duplicates' }] : []),
  ];

  const PrimaryAction: React.FC<{ res: Reservation; full?: boolean }> = ({ res, full }) => {
    if (!canViewVoucherActions) return null;
    const { year: y, month: m } = getReservationPeriod(res);
    const stage = stageOf(res);
    const cfg = stage === 'ready' || (stage === 'pending' && res.awaitingConfirmation) ? { label: 'Check out', cls: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm' }
      : stage === 'onrent' ? { label: 'Check in', cls: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm' }
      : stage === 'closed' ? { label: 'Agreement', cls: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50' }
      : null;
    if (!cfg) return null;
    return (
      <button onClick={() => onShowRentalVoucher(res, y, m)} className={`${full ? 'flex-1' : ''} inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${cfg.cls}`}>
        <DocumentReportIcon className="w-4 h-4" /> {cfg.label}
      </button>
    );
  };

  // Bookings created from an unlisted agreement, across every month, waiting for a supervisor.
  const awaitingConfirmation = useMemo(() => {
    const list: Reservation[] = [];
    Object.values(allData || {}).forEach((months: any) => Object.values(months || {}).forEach((items: any) => {
      (items as Reservation[]).forEach(r => { if (r.awaitingConfirmation && r.status !== ReservationStatus.CANCELLED) list.push(r); });
    }));
    return list.sort((a, b) => (b.unlistedCreatedAt || b.createdAt || '').localeCompare(a.unlistedCreatedAt || a.createdAt || ''));
  }, [allData]);
  // Every booking number saved more than once, with the months its copies are filed under.
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, { bookingId: string; count: number; months: Set<string> }>();
    Object.entries(allData || {}).forEach(([y, months]: [string, any]) => Object.entries(months || {}).forEach(([m, items]: [string, any]) => {
      (items as Reservation[]).forEach(r => {
        const k = bookingKey(r);
        if (!k || !duplicateBookingIds.has(k)) return;
        const g = map.get(k) || { bookingId: r.bookingId || k, count: 0, months: new Set<string>() };
        g.count++;
        g.months.add(`${m.slice(0, 3)} ${y}`);
        map.set(k, g);
      });
    }));
    return Array.from(map.values()).sort((a, b) => a.bookingId.localeCompare(b.bookingId, undefined, { numeric: true }));
  }, [allData, duplicateBookingIds]);
  const canConfirm = hasPermission(UserPermission.ACTION_RESERVATIONS_EDIT);
  const confirmUnlisted = (res: Reservation) => {
    onEditReservation({ ...res, awaitingConfirmation: false, status: ReservationStatus.CONFIRMED, confirmedBy: currentUser?.fullName, confirmedAt: new Date().toISOString() });
    recordActivity('UNLISTED_CONFIRMED', 'reservation', `Confirmed unlisted booking for ${res.personName}`, res.bookingId);
  };
  const rejectUnlisted = (res: Reservation) => {
    const msg = res.voucherSubmitted && !res.dropOffCompleted
      ? `${res.personName} currently has the car (${res.licensePlate || res.carModel}). Reject booking ${res.bookingId} anyway? It will be marked as cancelled.`
      : `Reject booking ${res.bookingId} for ${res.personName}? It will be marked as cancelled.`;
    if (!window.confirm(msg)) return;
    onEditReservation({ ...res, awaitingConfirmation: false, status: ReservationStatus.CANCELLED, confirmedBy: currentUser?.fullName, confirmedAt: new Date().toISOString() });
    recordActivity('UNLISTED_REJECTED', 'reservation', `Rejected unlisted booking for ${res.personName}`, res.bookingId);
  };
  const ago = (iso?: string) => {
    if (!iso) return '';
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
    return `${Math.round(mins / 1440)} d ago`;
  };

  const printDoc = (res: Reservation, kind: 'agreement' | 'termination') => {
    const ctx = { company: props.companyDetails, sources: rentalSources, locations: rentalLocations, fleet };
    const ok = printHtml(kind === 'agreement' ? agreementHtmlFor(res, ctx) : terminationHtmlFor(res, ctx));
    if (!ok) { window.alert('Allow pop-ups for this site to print.'); return; }
    recordActivity(kind === 'agreement' ? 'AGREEMENT_PRINTED' : 'TERMINATION_PRINTED', 'agreement', `Printed the ${kind === 'agreement' ? 'rental agreement' : 'termination statement'} for ${res.personName}`, res.bookingId);
  };

  // Sends the termination statement (with the closed agreement and any invoice / claim) to the customer.
  const [mailNotice, setMailNotice] = useState<{ tone: 'busy' | 'ok' | 'bad'; text: string } | null>(null);

  const [sendDocs, setSendDocs] = useState<Reservation | null>(null);
  const [statusFor, setStatusFor] = useState<{ res: Reservation; to?: ReservationStatus } | null>(null);
  useEffect(() => {
    if (!mailNotice || mailNotice.tone === 'busy') return;
    const t = setTimeout(() => setMailNotice(null), 6000);
    return () => clearTimeout(t);
  }, [mailNotice]);

  const PrinterGlyph = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>
  );

  // Every secondary action a booking offers, in one place so the row menu,
  // the detail panel and the mobile list stay identical.
  type RowAction = { key: string; label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean; section: 'documents' | 'booking' | 'danger' };
  const actionsFor = (res: Reservation): RowAction[] => {
    const { year: y, month: m } = getReservationPeriod(res);
    const stage = stageOf(res);
    const live = stage !== 'closed' && stage !== 'cancelled';
    const list: RowAction[] = [];
    if (canViewVoucherActions) list.push({ key: 'receipt', label: 'Receipt', icon: <CurrencyDollarIcon className="w-4 h-4" />, onClick: () => onShowReceipt(res), section: 'documents' });
    if (canViewVoucherActions && (stage === 'ready' || stage === 'onrent' || stage === 'closed')) list.push({ key: 'print', label: 'Print rental agreement', icon: <PrinterGlyph />, onClick: () => printDoc(res, 'agreement'), section: 'documents' });
    if (canViewVoucherActions && stage === 'closed') list.push({ key: 'term', label: 'Print termination statement', icon: <PdfIcon className="w-4 h-4" />, onClick: () => printDoc(res, 'termination'), section: 'documents' });
    if (canViewVoucherActions && (stage === 'onrent' || stage === 'closed')) list.push({ key: 'docmail', label: stage === 'closed' ? 'Email termination & receipt…' : 'Email agreement & receipt…', icon: <MailIcon className="w-4 h-4" />, onClick: () => setSendDocs(res), section: 'documents' });
    if (hasPermission(UserPermission.ACTION_RESERVATIONS_EDIT)) list.push({ key: 'share', label: 'Share booking', icon: <ShareIcon className="w-4 h-4" />, onClick: () => onShare(res), section: 'documents' });
    if (hasPermission(UserPermission.ACTION_RESERVATIONS_EDIT)) list.push({ key: 'edit', label: 'Edit reservation', icon: <EditIcon className="w-4 h-4" />, onClick: () => openEditModal(res), section: 'booking' });
    if (stage === 'onrent' && hasPermission(UserPermission.ACTION_RESERVATIONS_EXTEND)) list.push({ key: 'extend', label: 'Extend rental', icon: <ClockIcon className="w-4 h-4" />, onClick: () => onExtend(res), section: 'booking' });
    if (upgradePermission && live) list.push({ key: 'upgrade', label: 'Upgrade vehicle', icon: <CarIcon className="w-4 h-4" />, onClick: () => openUpgradeModal(res), section: 'booking' });
    if (onAddExtras && live && hasPermission(UserPermission.ACTION_RESERVATIONS_MANAGE_EXTRAS)) list.push({ key: 'extras', label: 'Manage extras', icon: <PlusCircleIcon className="w-4 h-4" />, onClick: () => onAddExtras(res), section: 'booking' });
    if (!res.voucherSubmitted && !res.dropOffCompleted && hasPermission(UserPermission.ACTION_RESERVATIONS_EDIT)) {
      if (stage === 'cancelled') {
        list.push({ key: 'restore', label: 'Restore reservation…', icon: <ClockIcon className="w-4 h-4" />, onClick: () => setStatusFor({ res, to: ReservationStatus.CONFIRMED }), section: 'booking' });
      } else {
        list.push({ key: 'noshow', label: 'Mark as no-show…', icon: <ClockIcon className="w-4 h-4" />, onClick: () => setStatusFor({ res, to: ReservationStatus.NO_SHOW }), section: 'booking' });
        list.push({ key: 'cancel', label: 'Cancel reservation…', icon: <CloseIcon className="w-4 h-4" />, onClick: () => setStatusFor({ res, to: ReservationStatus.CANCELLED }), section: 'booking' });
      }
      list.push({ key: 'status', label: 'Change status…', icon: <EditIcon className="w-4 h-4" />, onClick: () => setStatusFor({ res }), section: 'booking' });
    }
    if (!res.voucherSubmitted && !res.dropOffCompleted && hasPermission(UserPermission.ACTION_RESERVATIONS_DELETE)) list.push({ key: 'delete', label: 'Delete reservation', icon: <TrashIcon className="w-4 h-4" />, onClick: () => onDelete(res.id, res.isNew, y, m), danger: true, section: 'danger' });
    if ((stage === 'closed' || stage === 'onrent' || (stage === 'cancelled' && res.voucherSubmitted)) && onDeleteAgreement && hasPermission(UserPermission.ACTION_RESERVATIONS_DELETE)) list.push({ key: 'delete-agreement', label: 'Delete agreement', icon: <TrashIcon className="w-4 h-4" />, onClick: () => onDeleteAgreement(res), danger: true, section: 'danger' });
    return list;
  };

  // One floating menu for the whole grid (positioned from the trigger so it is never clipped).
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; up: boolean } | null>(null);
  useEffect(() => {
    if (!menu) return;
    // Ignore the scroll a tap can cause right as the menu opens.
    const close = () => { if (Date.now() - menuOpenedAt.current > 250) setMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); window.removeEventListener('keydown', onKey); };
  }, [menu]);
  const menuOpenedAt = useRef(0);
  const openMenu = (e: React.MouseEvent, res: Reservation) => {
    menuOpenedAt.current = Date.now();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const up = r.bottom + 320 > window.innerHeight;
    setMenu(prev => (prev?.id === res.id ? null : { id: res.id, x: Math.max(8, r.right - 240), y: up ? r.top - 6 : r.bottom + 6, up }));
  };
  const MenuButton: React.FC<{ res: Reservation }> = ({ res }) => (
    <button onClick={e => openMenu(e, res)} aria-label={`More actions for ${res.bookingId}`} title="More actions"
      className={`w-8 h-8 inline-flex items-center justify-center rounded-md border transition-colors ${menu?.id === res.id ? 'bg-slate-100 border-slate-300 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-800 hover:bg-slate-100 hover:border-slate-200'}`}>
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" /></svg>
    </button>
  );

  const isOverdue = (res: Reservation) => { const a = alertOf(res); return !!a && /overdue/i.test(a.label); };
  const ops = useMemo(() => {
    let pickupToday = 0, returnToday = 0, overdue = 0;
    filteredReservations.forEach(r => {
      const s = stageOf(r);
      if (s === 'ready' && (r.startDate || '').slice(0, 10) === todayKey) pickupToday++;
      if (s === 'onrent' && (r.endDate || '').slice(0, 10) === todayKey) returnToday++;
      if (isOverdue(r)) overdue++;
    });
    return { pickupToday, returnToday, overdue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredReservations]);
  const branchOptions = useMemo(() => Array.from(new Set(allDisplayReservations.map(r => r.locationName).filter(Boolean) as string[])).sort(), [allDisplayReservations]);
  const sourceOptions = useMemo(() => {
    const used = new Set(allDisplayReservations.map(r => r.source).filter(Boolean));
    return Array.from(used).map(id => ({ id, name: getSourceName(id) })).sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDisplayReservations, rentalSources]);
  useEffect(() => { setPage(0); }, [stageTab, quick, sourceFilterLocal, branchFilterLocal, filters.bookingIdSearch, selectedMonth, selectedYear, pageSize]);

  const pageCount = Math.max(1, Math.ceil(visibleReservations.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = visibleReservations.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const filtersActive = !!(quick || sourceFilterLocal || branchFilterLocal || localBookingIdSearch || stageTab !== 'all');
  const clearAllFilters = () => {
    setQuick(null); setSourceFilterLocal(''); setBranchFilterLocal(''); setStageTab('all');
    setLocalBookingIdSearch(''); setFilters((prev: any) => ({ ...prev, bookingIdSearch: '' }));
  };
  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'amount' ? 'desc' : 'asc'); }
  };
  const SortTh = ({ k, children, className = '' }: { k: typeof sortKey; children: React.ReactNode; className?: string }) => (
    <th className={`font-semibold px-3 py-2.5 whitespace-nowrap ${className}`} aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 ${sortKey === k ? 'text-slate-900' : ''}`}>
        {children}
        <svg className={`w-3 h-3 transition-transform ${sortKey === k ? 'opacity-100' : 'opacity-30'} ${sortKey === k && sortDir === 'desc' ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a.75.75 0 01.53.22l4 4a.75.75 0 11-1.06 1.06L10 6.81 6.53 10.28a.75.75 0 01-1.06-1.06l4-4A.75.75 0 0110 5z" clipRule="evenodd" /></svg>
      </button>
    </th>
  );
  const dayDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
  };
  const longDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  };
  const stamp = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  };
  const StatusBadge = ({ res, withAlert = true }: { res: Reservation; withAlert?: boolean }) => {
    const stage = stageOf(res);
    const alert = withAlert ? alertOf(res) : null;
    return (
      <div className="flex flex-col items-start gap-1">
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap ${STAGE_META[stage].chip}`}
          title={stage === 'cancelled' && res.statusReason ? `${res.statusReason}${res.statusChangedBy ? ` · ${res.statusChangedBy}` : ''}` : undefined}>
          <span className={`w-1.5 h-1.5 rounded-full ${STAGE_META[stage].dot}`} />{stage === 'cancelled' && res.status === ReservationStatus.NO_SHOW ? 'No-show' : STAGE_META[stage].label}
        </span>
        {alert && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap ${/overdue/i.test(alert.label) ? 'text-rose-600' : 'text-sky-700'}`}>
            <ClockIcon className="w-3 h-3" />{alert.label}
          </span>
        )}
      </div>
    );
  };
  const Plate = ({ value }: { value?: string }) => value
    ? <span className="inline-block px-1.5 py-px rounded border border-slate-300 bg-slate-50 font-mono text-[10.5px] font-semibold text-slate-700 tracking-wide">{value}</span>
    : null;

  const drawerRes = detailsModalReservation
    ? (allDisplayReservations.find(r => r.id === detailsModalReservation.id) || awaitingConfirmation.find(r => r.id === detailsModalReservation.id) || detailsModalReservation)
    : null;
  useEffect(() => {
    if (!detailsModalReservation) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isModalOpen) setDetailsModalReservation(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailsModalReservation, isModalOpen]);

  const tiles: { key: string; label: string; value: React.ReactNode; sub: string; tone: string; active: boolean; onClick?: () => void }[] = [
    { key: 'pu', label: 'Pickups today', value: ops.pickupToday, sub: 'awaiting handover', tone: 'text-sky-700', active: quick === 'pickupToday', onClick: () => { setStageTab('all'); setQuick(q => (q === 'pickupToday' ? null : 'pickupToday')); } },
    { key: 'rt', label: 'Returns today', value: ops.returnToday, sub: 'due back', tone: 'text-emerald-700', active: quick === 'returnToday', onClick: () => { setStageTab('all'); setQuick(q => (q === 'returnToday' ? null : 'returnToday')); } },
    { key: 'od', label: 'Overdue', value: ops.overdue, sub: 'pickups or returns', tone: ops.overdue > 0 ? 'text-rose-600' : 'text-slate-900', active: quick === 'overdue', onClick: () => { setStageTab('all'); setQuick(q => (q === 'overdue' ? null : 'overdue')); } },
    { key: 'or', label: 'On rent', value: stageCounts.onrent, sub: 'vehicles out', tone: 'text-slate-900', active: stageTab === 'onrent' && !quick, onClick: () => { setQuick(null); setStageTab(t => (t === 'onrent' ? 'all' : 'onrent')); } },
    { key: 'bk', label: 'Bookings', value: uniqueBookings, sub: [`${stageCounts.cancelled} cancelled`, `${stageCounts.noshow} no-show`].join(' · '), tone: 'text-slate-900', active: false },
    { key: 'cl', label: 'Returned', value: stageCounts.closed, sub: 'agreements closed', tone: 'text-slate-900', active: stageTab === 'closed' && !quick, onClick: () => { setQuick(null); setStageTab(t => (t === 'closed' ? 'all' : 'closed')); } },
  ];
  const selectCls = 'h-9 pl-3 pr-8 bg-white border border-slate-200 rounded-lg text-[13px] text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none';

  return (
    <>
      {statusFor && (
        <ChangeStatusDialog reservation={statusFor.res} initial={statusFor.to} currentUserName={currentUser?.fullName}
          onClose={() => setStatusFor(null)}
          onSave={updated => {
            const from = statusFor.res.status || ReservationStatus.CONFIRMED;
            onEditReservation(updated);
            recordActivity(updated.status === ReservationStatus.CANCELLED ? 'RESERVATION_CANCELLED' : updated.status === ReservationStatus.NO_SHOW ? 'RESERVATION_NO_SHOW' : 'RESERVATION_STATUS_CHANGED',
              'reservation', `${statusLabel(from)} → ${statusLabel(updated.status)}: booking ${updated.bookingId} for ${updated.personName}`, updated.bookingId,
              [updated.statusReason, updated.statusFee ? `fee ${updated.statusFee.toFixed(2)} USD` : ''].filter(Boolean).join(' · ') || undefined);
            setStatusFor(null);
          }} />
      )}
      {sendDocs && (
        <SendDocumentsDialog reservation={sendDocs} onClose={() => setSendDocs(null)}
          ctx={{ company: props.companyDetails, sources: rentalSources, locations: rentalLocations, fleet }}
          onSaved={updated => { onEditReservation(updated); setSendDocs(updated); }} />
      )}
      {mailNotice && (
        <div role="status" className={`fixed z-[80] bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-[13px] font-medium ${
          mailNotice.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : mailNotice.tone === 'bad' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-white border-slate-200 text-slate-800'}`}>
          {mailNotice.tone === 'busy' ? <span className="w-4 h-4 shrink-0 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" /> : <MailIcon className="w-4 h-4 shrink-0" />}
          <span className="flex-1 min-w-0">{mailNotice.text}</span>
          {mailNotice.tone !== 'busy' && <button type="button" onClick={() => setMailNotice(null)} aria-label="Dismiss" className="shrink-0 text-slate-400 hover:text-slate-700"><CloseIcon className="w-4 h-4" /></button>}
        </div>
      )}
      <div className="space-y-4 mb-10">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">Operations <span className="text-slate-300 mx-1">/</span> {isAgreementView ? 'Rental agreements' : 'Reservations'}</p>
            <h2 className="mt-0.5 text-2xl font-semibold text-slate-900 tracking-tight">{isAgreementView ? 'Rental agreements' : 'Reservations'}</h2>
            <p className="text-sm text-slate-500">{selectedMonth} {selectedYear} · {uniqueBookings} booking{uniqueBookings === 1 ? '' : 's'}</p>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2">
            <div className="col-span-2 order-last sm:order-none flex items-center rounded-lg border border-slate-200 bg-white divide-x divide-slate-200 overflow-hidden shadow-sm [&>button]:flex-1 sm:[&>button]:flex-none [&>button]:justify-center">
              <button onClick={handleExportCSV} disabled={filteredReservations.length === 0} className="h-9 px-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ExportIcon className="w-4 h-4" />CSV</button>
              <button onClick={handleExportExcel} disabled={filteredReservations.length === 0} className="h-9 px-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"><DownloadIcon className="w-4 h-4" />Excel</button>
              {(currentUser?.email === 'nadeenalnahas@gmail.com' || currentUser?.role === 'ADMIN' || currentUser?.username === 'admin') && (
                <button onClick={() => onDeleteMonth(selectedYear, selectedMonth)} disabled={allDisplayReservations.length === 0} title={`Delete all reservations for ${selectedMonth} ${selectedYear}`} aria-label="Delete month"
                  className="h-9 px-3 text-rose-500 hover:bg-rose-50 disabled:opacity-40"><TrashIcon className="w-4 h-4" /></button>
              )}
            </div>
            {onOpenUnlistedAgreement && canViewVoucherActions && !isAgreementView && (
              <button onClick={onOpenUnlistedAgreement} title="Open a rental agreement for a booking that is not in the list"
                className="h-9 inline-flex items-center justify-center gap-2 px-3 bg-white border border-slate-200 text-slate-700 text-[13px] font-semibold rounded-lg hover:bg-slate-50 shadow-sm whitespace-nowrap">
                <DocumentReportIcon className="w-4 h-4 text-amber-600" /><span className="sm:hidden">Unlisted reservation</span><span className="hidden sm:inline">Agreement for Unlisted Reservation</span>
              </button>
            )}
            <button onClick={openAddModal} className={`${onOpenUnlistedAgreement && canViewVoucherActions && !isAgreementView ? '' : 'col-span-2 '}h-9 inline-flex items-center justify-center gap-2 px-3.5 bg-indigo-600 text-white text-[13px] font-semibold rounded-lg hover:bg-indigo-700 shadow-sm whitespace-nowrap`}>
              <PlusIcon className="w-4 h-4" /> New reservation
            </button>
          </div>
        </div>

        {/* Rental desk: customer is here but the booking is not in the list yet */}
        {isAgreementView && onOpenUnlistedAgreement && (
          <div className="relative overflow-hidden rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-white px-4 py-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <span className="w-10 h-10 shrink-0 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-sm"><DocumentReportIcon className="w-5 h-5" /></span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-slate-900">Customer at the desk, booking not in the list?</p>
                <p className="text-xs text-slate-600 mt-0.5">Open the rental agreement now with the website or partner booking number. The reservations team lists it later from <b>Unlisted Agreements</b>.</p>
              </div>
            </div>
            <button onClick={onOpenUnlistedAgreement}
              className="h-10 sm:h-9 shrink-0 inline-flex items-center justify-center gap-2 px-4 rounded-lg bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 shadow-sm whitespace-nowrap">
              <PlusIcon className="w-4 h-4" /> Agreement for Unlisted Reservation
            </button>
          </div>
        )}

        {/* Operations counters */}
        <div className="grid grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
          {tiles.map(t => {
            const Tag: any = t.onClick ? 'button' : 'div';
            return (
              <Tag key={t.key} onClick={t.onClick} aria-pressed={t.onClick ? t.active : undefined}
                className={`text-left min-w-0 bg-white rounded-xl border px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm transition-colors ${t.active ? 'border-indigo-500 ring-2 ring-indigo-500/15' : 'border-slate-200'} ${t.onClick ? 'hover:border-slate-300' : ''}`}>
                <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">{t.label}</p>
                <p className={`mt-0.5 sm:mt-1 text-base sm:text-xl font-semibold tabular-nums truncate ${t.tone}`}>{t.value}</p>
                <p className="hidden sm:block text-[11px] text-slate-400 truncate">{t.sub}</p>
              </Tag>
            );
          })}
        </div>

        {awaitingConfirmation.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
            <span className="relative flex w-2.5 h-2.5 shrink-0"><span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60 animate-ping" /><span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-amber-500" /></span>
            <p className="flex-1 text-[13px] text-slate-700">
              <b className="text-slate-900">{awaitingConfirmation.length} unlisted agreement{awaitingConfirmation.length === 1 ? '' : 's'}</b> opened for bookings that are not in the list yet. Add {awaitingConfirmation.length === 1 ? 'it' : 'them'} as reservations to complete the booking details.
            </p>
            <button onClick={() => window.dispatchEvent(new CustomEvent('nct:navigate', { detail: 'Unlisted Agreements' }))}
              className="h-8 px-3 rounded-lg bg-white border border-amber-300 text-xs font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap self-start sm:self-auto">Review unlisted agreements</button>
          </div>
        )}

        {duplicateGroups.length > 0 && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-3">
            <span className="w-8 h-8 shrink-0 rounded-lg bg-rose-600 text-white flex items-center justify-center text-sm font-bold">!</span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-slate-800">
                <b className="text-rose-800">{duplicateGroups.length} booking number{duplicateGroups.length === 1 ? ' is' : 's are'} saved more than once</b>, so {duplicateGroups.length === 1 ? 'it is' : 'they are'} counted twice. Open each copy, keep the one with the agreement and delete the other (More actions → Delete).
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {duplicateGroups.slice(0, 8).map(g => (
                  <button key={g.bookingId} onClick={() => { setQuick(null); setStageTab('all'); setLocalBookingIdSearch(g.bookingId); setFilters((prev: any) => ({ ...prev, bookingIdSearch: g.bookingId })); }}
                    title="Show this booking number" className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md bg-white border border-rose-200 text-xs text-rose-800 hover:bg-rose-100">
                    <span className="font-mono font-semibold">{g.bookingId}</span><span className="text-rose-500">×{g.count}</span><span className="text-slate-500">{Array.from(g.months).join(', ')}</span>
                  </button>
                ))}
                {duplicateGroups.length > 8 && <span className="h-7 inline-flex items-center text-xs text-rose-700">+{duplicateGroups.length - 8} more</span>}
              </div>
            </div>
            {stageCounts.duplicates > 0 && (
              <button onClick={() => { setQuick(null); setStageTab('duplicates'); }}
                className="h-8 px-3 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 whitespace-nowrap self-start">Show {stageCounts.duplicates} in this month</button>
            )}
          </div>
        )}

        {/* Data grid */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-clip">
          <div className="px-2 sm:px-3 border-b border-slate-200 flex gap-0.5 overflow-x-auto no-scrollbar">
            {TABS.map(t => (
              <button key={t.key} onClick={() => { setQuick(null); setStageTab(t.key); }}
                className={`px-3 py-3 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${t.key === 'duplicates' ? (stageTab === t.key ? 'border-rose-600 text-rose-700' : 'border-transparent text-rose-600 hover:text-rose-800') : stageTab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                {t.label}
                <span className={`ml-1.5 px-1.5 py-px rounded text-[11px] tabular-nums ${t.key === 'duplicates' ? 'bg-rose-600 text-white' : stageTab === t.key ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{stageCounts[t.key] ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="p-3 flex flex-col md:flex-row md:flex-wrap md:items-center gap-2 border-b border-slate-100 bg-slate-50/50">
            <div className="relative w-full md:w-72">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input type="text" placeholder="Search name, booking no. or phone" value={localBookingIdSearch} onChange={handleSearchChange}
                className="w-full h-9 pl-9 pr-3 bg-white border border-slate-200 rounded-lg text-[13px] text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
            </div>
            <div className="grid grid-cols-2 md:flex gap-2">
              <select value={stageTab} onChange={e => { setQuick(null); setStageTab(e.target.value as Tab); }} aria-label="Status" className={`${selectCls} min-w-0 col-span-2 md:col-span-1`}>
                {TABS.map(t => <option key={t.key} value={t.key}>{t.key === 'all' ? 'All statuses' : t.label} ({stageCounts[t.key] ?? 0})</option>)}
              </select>
              <select value={sourceFilterLocal} onChange={e => setSourceFilterLocal(e.target.value)} aria-label="Source" className={`${selectCls} min-w-0`}>
                <option value="">All sources</option>
                {sourceOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={branchFilterLocal} onChange={e => setBranchFilterLocal(e.target.value)} aria-label="Branch" className={`${selectCls} min-w-0`}>
                <option value="">All branches</option>
                {branchOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            {quick && (
              <span className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold w-fit">
                {quick === 'pickupToday' ? 'Pickups today' : quick === 'returnToday' ? 'Returns today' : 'Overdue'}
                <button onClick={() => setQuick(null)} aria-label="Remove filter" className="w-5 h-5 inline-flex items-center justify-center rounded-full hover:bg-indigo-100"><CloseIcon className="w-3 h-3" /></button>
              </span>
            )}
            {filtersActive && <button onClick={clearAllFilters} className="text-xs font-semibold text-slate-500 hover:text-slate-900 w-fit">Clear filters</button>}
            <span className="md:ml-auto text-xs text-slate-500 tabular-nums">{visibleReservations.length} result{visibleReservations.length === 1 ? '' : 's'}</span>
          </div>

          {visibleReservations.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-11 h-11 mx-auto rounded-full bg-slate-100 flex items-center justify-center"><CalendarIcon className="w-5 h-5 text-slate-400" /></div>
              <p className="mt-3 text-sm font-semibold text-slate-800">No reservations match</p>
              <p className="text-sm text-slate-500">Change the filters or the month, or create a new reservation.</p>
              {filtersActive && <button onClick={clearAllFilters} className="mt-3 h-8 px-3 rounded-md border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">Clear filters</button>}
            </div>
          ) : (
            <>
              {/* Desktop grid */}
              <table className="hidden lg:table w-full text-[13px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 text-[11px] text-slate-500 border-b border-slate-200 text-left">
                    <SortTh k="booking" className="pl-4">Res. no.</SortTh>
                    <th className="font-semibold px-3 py-2.5 uppercase tracking-wider">Status</th>
                    <SortTh k="name">Customer</SortTh>
                    <SortTh k="pickup">Pickup</SortTh>
                    <SortTh k="return">Return</SortTh>
                    <th className="font-semibold px-3 py-2.5 uppercase tracking-wider">Vehicle</th>
                    <th className="hidden 2xl:table-cell font-semibold px-3 py-2.5 uppercase tracking-wider">Source</th>
                    <th className="font-semibold px-3 py-2.5 uppercase tracking-wider text-right">Days</th>
                    <th className="px-3 py-2.5 pr-4"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map(res => {
                    const kind = vehicleKind(res.carModel, fleet);
                    const isDuplicate = isDup(res);
                    const days = rentalDaysOf(res);
                    const selected = drawerRes?.id === res.id;
                    return (
                      <tr key={res.id} onClick={() => setDetailsModalReservation(res)}
                        title={isDuplicate ? `Booking ${res.bookingId} is saved more than once — keep one record and delete the other` : undefined}
                        className={`cursor-pointer align-middle transition-colors ${isDuplicate ? `shadow-[inset_4px_0_0_#e11d48] ${selected ? 'bg-rose-100' : 'bg-rose-50 hover:bg-rose-100/70'}` : selected ? 'bg-indigo-50/60' : 'hover:bg-slate-50'}`}>
                        <td className="pl-4 pr-3 py-2.5 whitespace-nowrap">
                          <span className={`font-mono font-semibold ${isDuplicate ? 'text-rose-700' : selected ? 'text-indigo-700' : 'text-slate-900'}`}>{res.bookingId || 'NO-ID'}</span>
                          {isDuplicate && <span className="ml-1.5 px-1.5 py-px rounded bg-rose-600 text-white text-[10px] font-semibold uppercase tracking-wide">Duplicate</span>}
                          <span className="block 2xl:hidden text-[11px] text-slate-400 truncate max-w-[7rem]">{res.source ? getSourceName(res.source) : ''}</span>
                          <span className="block mt-0.5">{payTag(res)}</span>
                        </td>
                        <td className="px-3 py-2.5"><StatusBadge res={res} /></td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-slate-900 truncate max-w-[12rem]">{res.personName || 'Unnamed'}</p>
                          <p className="text-[11px] text-slate-500 truncate max-w-[12rem]">{res.contactNumber || res.customerEmail || '—'}</p>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <p className="text-slate-800">{dayDate(res.startDate)} <span className="text-slate-400">{timeOf(res.startDate)}</span></p>
                          <p className="text-[11px] text-slate-500 truncate max-w-[9rem]">{res.locationName || '—'}</p>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <p className="text-slate-800">{dayDate(res.endDate)} <span className="text-slate-400">{timeOf(res.endDate)}</span></p>
                          <p className="text-[11px] text-slate-500">{days} day{days === 1 ? '' : 's'}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <CarPicture fleet={fleet} plate={res.licensePlate} model={res.carModel} className="w-14 h-9" artClassName="w-14 h-9 p-1 rounded-md bg-slate-50 ring-1 ring-inset ring-slate-200" />
                            <div className="min-w-0">
                              <p className="text-slate-800 truncate max-w-[10rem]">{res.carModel || '—'}</p>
                              <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><Plate value={res.licensePlate} /><span>{res.sippCode || vehicleKindLabel[kind]}</span></p>
                            </div>
                          </div>
                        </td>
                        <td className="hidden 2xl:table-cell px-3 py-2.5 text-slate-600 truncate max-w-[8rem]">{res.source ? getSourceName(res.source) : '—'}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <p className="font-semibold text-slate-900 tabular-nums">{rentalDaysOf(res) || '—'}</p>
                          {(res.unpaidExtensionAmount || 0) > 0 && <p className="text-[11px] font-semibold text-amber-600 tabular-nums">{money(res.unpaidExtensionAmount)} due</p>}
                        </td>
                        <td className="px-3 py-2.5 pr-4" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <PrimaryAction res={res} />
                            <MenuButton res={res} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile / tablet cards */}
              <ul className="lg:hidden bg-slate-50/70 p-3 space-y-3">
                {pageRows.map(res => {
                  const days = rentalDaysOf(res);
                  const stage = stageOf(res);
                  const alert = alertOf(res);
                  const overdue = isOverdue(res);
                  const kind = vehicleKind(res.carModel || '');
                  const isDuplicate = isDup(res);
                  const edge = isDuplicate ? 'before:bg-rose-600' : { ready: 'before:bg-sky-500', onrent: 'before:bg-emerald-500', closed: 'before:bg-slate-300', pending: 'before:bg-amber-500', cancelled: 'before:bg-rose-400' }[stage];
                  const tel = (res.contactNumber || '').replace(/[^\d+]/g, '');
                  return (
                    <li key={res.id} className={`relative overflow-hidden rounded-xl border shadow-[0_1px_2px_rgba(15,23,42,0.05)] before:absolute before:inset-y-0 before:left-0 before:w-1 ${edge} ${isDuplicate ? 'bg-rose-50 border-rose-300' : 'bg-white border-slate-200'} ${stage === 'cancelled' && !isDuplicate ? 'opacity-80' : ''}`}>
                      <button onClick={() => setDetailsModalReservation(res)} className="w-full text-left pl-4 pr-3.5 pt-3 pb-3 active:bg-slate-50">
                        {/* Booking no. · source · status */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-[12.5px] font-semibold text-slate-900 tracking-tight">{res.bookingId || 'NO-ID'}</span>
                            {isDuplicate && <span className="px-1.5 py-px rounded bg-rose-600 text-white text-[10px] font-semibold uppercase tracking-wide">Duplicate</span>}
                            {res.source && <span className="px-1.5 py-px rounded bg-slate-100 text-[10.5px] font-medium text-slate-600 truncate max-w-[8.5rem]">{getSourceName(res.source)}</span>}
                            {payTag(res)}
                          </div>
                          <StatusBadge res={res} withAlert={false} />
                        </div>

                        {/* Customer */}
                        <p className="mt-2 text-[15px] font-semibold text-slate-900 truncate">{res.personName || 'Unnamed'}</p>
                        <p className="text-xs text-slate-500 truncate">{res.contactNumber || res.customerEmail || 'No contact details'}</p>

                        {/* Vehicle */}
                        <div className="mt-2.5 flex items-center gap-2.5 min-w-0">
                          <CarPicture fleet={fleet} plate={res.licensePlate} model={res.carModel} className="w-14 h-9" artClassName="w-14 h-9 p-1 rounded-md bg-slate-50 ring-1 ring-inset ring-slate-200" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium text-slate-800 truncate">{res.carModel || 'No vehicle'}</span>
                            <span className="flex items-center gap-1.5 text-[11px] text-slate-500">{res.licensePlate ? <Plate value={res.licensePlate} /> : <span className="text-amber-600 font-medium">No car assigned</span>}<span>{res.sippCode || vehicleKindLabel[kind]}</span></span>
                          </span>
                        </div>

                        {/* Pickup → return */}
                        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-100 px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Pickup</p>
                            <p className="text-[13px] font-semibold text-slate-900 whitespace-nowrap">{dayDate(res.startDate)}</p>
                            <p className="text-[11px] text-slate-500 truncate">{[timeOf(res.startDate), res.locationName].filter(Boolean).join(' · ') || '—'}</p>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="px-2 py-0.5 rounded-full bg-white ring-1 ring-slate-200 text-[10.5px] font-semibold text-slate-600 tabular-nums whitespace-nowrap">{days} day{days === 1 ? '' : 's'}</span>
                            <ChevronRightIcon className="mt-0.5 w-3.5 h-3.5 text-slate-300" />
                          </div>
                          <div className="min-w-0 text-right">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-600">Return</p>
                            <p className="text-[13px] font-semibold text-slate-900 whitespace-nowrap">{dayDate(res.endDate)}</p>
                            <p className="text-[11px] text-slate-500 truncate">{timeOf(res.endDate) || '—'}</p>
                          </div>
                        </div>

                        {(alert || (res.unpaidExtensionAmount || 0) > 0) && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            {alert && (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ring-inset ${overdue ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-sky-50 text-sky-700 ring-sky-200'}`}>
                                <ClockIcon className="w-3 h-3" />{alert.label}
                              </span>
                            )}
                            {(res.unpaidExtensionAmount || 0) > 0 && <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">Extension unpaid</span>}
                          </div>
                        )}
                      </button>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pl-4 pr-3 py-2.5 border-t border-slate-100 bg-slate-50/50 [&_button]:h-9" onClick={e => e.stopPropagation()}>
                        {tel && (
                          <a href={`tel:${tel}`} aria-label={`Call ${res.personName || 'customer'}`}
                            className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 active:bg-slate-100">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.28 6.72 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.37c0-.52-.35-.97-.85-1.09l-4.42-1.1c-.44-.11-.9.05-1.17.42l-.97 1.29a1.13 1.13 0 01-1.21.38 12.04 12.04 0 01-7.14-7.14 1.13 1.13 0 01.38-1.21l1.29-.97c.37-.27.53-.73.42-1.17l-1.1-4.42a1.13 1.13 0 00-1.09-.85H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                          </a>
                        )}
                        <button onClick={() => setDetailsModalReservation(res)}
                          className="shrink-0 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 active:bg-slate-100">Details</button>
                        <div className="flex-1 flex"><PrimaryAction res={res} full /></div>
                        <MenuButton res={res} />
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Pagination */}
              <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50/50 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="tabular-nums">{safePage * pageSize + 1}–{Math.min(visibleReservations.length, (safePage + 1) * pageSize)} of {visibleReservations.length}</span>
                <label className="hidden sm:flex items-center gap-1.5">Rows
                  <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="h-7 pl-2 pr-6 bg-white border border-slate-200 rounded-md text-xs">
                    {[25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0} className="h-7 px-2.5 rounded-md border border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">Previous</button>
                  <span className="px-2 tabular-nums">Page {safePage + 1} of {pageCount}</span>
                  <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} className="h-7 px-2.5 rounded-md border border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">Next</button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Row action menu */}
      {menu && (() => {
        const res = [...allDisplayReservations, ...awaitingConfirmation].find(r => r.id === menu.id);
        if (!res) return null;
        const acts = actionsFor(res);
        const sections: RowAction['section'][] = ['booking', 'documents', 'danger'];
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
            <div role="menu" className="fixed z-50 w-60 bg-white rounded-lg border border-slate-200 shadow-xl py-1 text-[13px]"
              style={{ left: menu.x, ...(menu.up ? { bottom: window.innerHeight - menu.y } : { top: menu.y }) }}>
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="font-mono text-xs font-semibold text-slate-900">{res.bookingId}</p>
                <p className="text-[11px] text-slate-500 truncate">{res.personName}</p>
              </div>
              <button role="menuitem" onClick={() => { setMenu(null); setDetailsModalReservation(res); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 hover:bg-slate-50">
                <EyeIcon className="w-4 h-4 text-slate-400" /> View details
              </button>
              {sections.map(sec => {
                const items = acts.filter(a => a.section === sec);
                if (!items.length) return null;
                return (
                  <div key={sec} className="border-t border-slate-100 py-1">
                    {items.map(a => (
                      <button key={a.key} role="menuitem" onClick={() => { setMenu(null); a.onClick(); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 ${a.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'}`}>
                        <span className={a.danger ? 'text-rose-500' : 'text-slate-400'}>{a.icon}</span>{a.label}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* Reservation record */}
      {drawerRes && (
        <ReservationRecord
          key={drawerRes.id}
          res={drawerRes}
          stage={stageOf(drawerRes)}
          statusBadge={<StatusBadge res={drawerRes} withAlert={false} />}
          alert={alertOf(drawerRes)}
          primaryAction={<PrimaryAction res={drawerRes} full />}
          showPrimary={canViewVoucherActions && stageOf(drawerRes) !== 'cancelled'}
          actions={actionsFor(drawerRes)}
          sourceName={drawerRes.source ? getSourceName(drawerRes.source) : ''}
          paymentTag={payTag(drawerRes)}
          fleet={fleet}
          onClose={() => setDetailsModalReservation(null)}
        />
      )}

      <ReservationWizard
        open={isModalOpen}
        mode={modalMode}
        formData={formData}
        onChange={handleChange}
        onToggleExtra={handleExtraToggle}
        durationDays={durationDays}
        calculatedTotal={calculatedTotal}
        onSave={handleSave}
        onClose={() => setIsModalOpen(false)}
        draftNotice={modalMode === 'add' && restoredDraftAt ? { savedAt: restoredDraftAt, onDiscard: () => { clearDraft('reservation:new'); setRestoredDraftAt(null); setIsModalOpen(false); window.setTimeout(() => openAddModal(), 0); } } : undefined}
        rentalSources={rentalSources}
        rentalLocations={rentalLocations}
        fleet={fleet}
        allData={allData}
        newReservations={newReservations}
        availableExtras={availableExtras}
        duplicateBookingIds={duplicateBookingIds}
        carModels={props.carModels}
      />

      {isUpgradeModalOpen && upgradeReservation && (
        <UpgradeVehicleModal
          reservation={upgradeReservation}
          fleet={fleet}
          allData={allData}
          onCancel={() => setIsUpgradeModalOpen(false)}
          onConfirm={(carId, details) => { onUpgrade(upgradeReservation, carId, details.fee, details); setIsUpgradeModalOpen(false); }}
        />
      )}
    </>
  );
};

export default ReservationTable;
