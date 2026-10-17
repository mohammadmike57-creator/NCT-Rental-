import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { AppData, Reservation, RentalSource, Fleet, User, ReservationStatus, RentalLocation, AvailableExtra, CompanyDetails, UserPermission } from '../types';
import { MONTHS } from '../constants';
import { VehicleArt, vehicleKind, vehicleKindLabel } from './VehicleGraphics';
import UpgradeVehicleModal, { UpgradeDetails } from './UpgradeVehicleModal';
import { recordActivity } from '../firebase/api';
import { agreementHtmlFor, printHtml, terminationHtmlFor } from '../services/printDocs';
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

// Modal component (with animation)
const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }> = ({ isOpen, onClose, title, children, footer }) => {
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
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className={`absolute inset-0 bg-slate-900/50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} aria-hidden="true" />
      <div className={`relative bg-white w-full sm:max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-xl shadow-2xl flex flex-col overflow-hidden ${animationClass}`}>
        <div className="flex justify-between items-center px-5 sm:px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight" id="modal-title">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Fields marked * are required</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-6 custom-scrollbar">{children}</div>
        <div className="bg-slate-50 px-5 sm:px-6 py-3.5 border-t border-slate-200 flex justify-end gap-2">
          {footer || (
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">Done</button>
          )}
        </div>
      </div>
    </div>
  );
};

interface ReservationTableProps {
  allData: AppData;
  newReservations: Reservation[];
  onUpdate: (reservation: Reservation, oldYear: number, oldMonth: string) => void;
  onAdd: (status?: ReservationStatus) => void;
  onDelete: (id: string, isNew?: boolean, year?: number, month?: string) => void;
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
    return !!currentUser && currentUser.permissions?.includes(permission);
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
  const [stageTab, setStageTab] = useState<'all' | 'ready' | 'onrent' | 'closed' | 'pending' | 'cancelled'>('all');
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
    let extrasTotal = 0;
    if (res.selectedExtras && res.selectedExtras.length > 0 && res.startDate && res.endDate) {
      const start = new Date(res.startDate);
      const end = new Date(res.endDate);
      const diff = end.getTime() - start.getTime();
      const days = Math.max(0, diff / (1000 * 3600 * 24));
      
      extrasTotal = res.selectedExtras.reduce((sum, extraId) => {
        const extra = availableExtras.find(e => e.id === extraId);
        if (extra && extra.pricePerDay) {
          return sum + (extra.pricePerDay * days);
        }
        return sum;
      }, 0);
    }

    setFormData({
      ...res,
      amount: (res.amount || 0) - extrasTotal,
      selectedExtras: res.selectedExtras || [],
    });
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setModalMode('add');
    setIsModalOpen(true);
  };

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
    let base = formData.amount || 0;
    const extrasTotal = (formData.selectedExtras || []).reduce((sum, extraId) => {
      const extra = availableExtras.find(e => e.id === extraId);
      if (extra && extra.pricePerDay) {
        return sum + (extra.pricePerDay * durationDays);
      }
      return sum;
    }, 0);
    return base + extrasTotal;
  }, [formData.amount, formData.selectedExtras, durationDays, availableExtras]);

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
    const reservationData: Partial<Reservation> = {
      ...formData,
      amount: calculatedTotal,
      id: modalMode === 'edit' ? formData.id : `new-${Date.now()}`,
      lastEditedBy: currentUser?.fullName,
      createdBy: modalMode === 'add' ? currentUser?.fullName : formData.createdBy,
    };
    if (modalMode === 'add') {
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
      'Amount': res.amount,
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
      'Amount': res.amount,
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

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = { all: filteredReservations.length, ready: 0, onrent: 0, closed: 0, pending: 0, cancelled: 0 };
    filteredReservations.forEach(r => { c[stageOf(r)]++; });
    return c;
  }, [filteredReservations]);

  const visibleReservations = useMemo(() => {
    let list = stageTab === 'all' ? filteredReservations : filteredReservations.filter(r => stageOf(r) === stageTab);
    if (sourceFilterLocal) list = list.filter(r => r.source === sourceFilterLocal);
    if (branchFilterLocal) list = list.filter(r => (r.locationName || '') === branchFilterLocal);
    if (quick === 'pickupToday') list = list.filter(r => stageOf(r) === 'ready' && (r.startDate || '').slice(0, 10) === todayKey);
    if (quick === 'returnToday') list = list.filter(r => stageOf(r) === 'onrent' && (r.endDate || '').slice(0, 10) === todayKey);
    if (quick === 'overdue') list = list.filter(r => /overdue/i.test(alertOf(r)?.label || ''));
    const dir = sortDir === 'asc' ? 1 : -1;
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
  }, [filteredReservations, stageTab, sortKey, sortDir, sourceFilterLocal, branchFilterLocal, quick]);

  const revenue = filteredReservations.filter(r => stageOf(r) !== 'cancelled').reduce((s, r) => s + (r.amount || 0), 0);
  const actionToday = filteredReservations.filter(r => alertOf(r) !== null).length;

  const TABS: { key: 'all' | Stage; label: string }[] = isAgreementView
    ? [{ key: 'all', label: 'All' }, { key: 'ready', label: 'To check out' }, { key: 'onrent', label: 'Open' }, { key: 'closed', label: 'Closed' }]
    : [{ key: 'all', label: 'All' }, { key: 'ready', label: 'Awaiting pickup' }, { key: 'onrent', label: 'On rent' }, { key: 'closed', label: 'Closed' }, { key: 'pending', label: 'Pending' }, { key: 'cancelled', label: 'Cancelled' }];

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
    const ctx = { company: props.companyDetails, sources: rentalSources, locations: rentalLocations };
    const ok = printHtml(kind === 'agreement' ? agreementHtmlFor(res, ctx) : terminationHtmlFor(res, ctx));
    if (!ok) { window.alert('Allow pop-ups for this site to print.'); return; }
    recordActivity(kind === 'agreement' ? 'AGREEMENT_PRINTED' : 'TERMINATION_PRINTED', 'agreement', `Printed the ${kind === 'agreement' ? 'rental agreement' : 'termination statement'} for ${res.personName}`, res.bookingId);
  };

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
    if (canViewVoucherActions && (stage === 'onrent' || stage === 'closed')) list.push({ key: 'print', label: 'Print rental agreement', icon: <PrinterGlyph />, onClick: () => printDoc(res, 'agreement'), section: 'documents' });
    if (canViewVoucherActions && stage === 'closed') list.push({ key: 'term', label: 'Print termination statement', icon: <PdfIcon className="w-4 h-4" />, onClick: () => printDoc(res, 'termination'), section: 'documents' });
    if (hasPermission(UserPermission.ACTION_RESERVATIONS_EDIT)) list.push({ key: 'share', label: 'Share booking', icon: <ShareIcon className="w-4 h-4" />, onClick: () => onShare(res), section: 'documents' });
    if (hasPermission(UserPermission.ACTION_RESERVATIONS_EDIT)) list.push({ key: 'edit', label: 'Edit reservation', icon: <EditIcon className="w-4 h-4" />, onClick: () => openEditModal(res), section: 'booking' });
    if (stage === 'onrent' && hasPermission(UserPermission.ACTION_RESERVATIONS_EXTEND)) list.push({ key: 'extend', label: 'Extend rental', icon: <ClockIcon className="w-4 h-4" />, onClick: () => onExtend(res), section: 'booking' });
    if (upgradePermission && live) list.push({ key: 'upgrade', label: 'Upgrade vehicle', icon: <CarIcon className="w-4 h-4" />, onClick: () => openUpgradeModal(res), section: 'booking' });
    if (onAddExtras && live && hasPermission(UserPermission.ACTION_RESERVATIONS_MANAGE_EXTRAS)) list.push({ key: 'extras', label: 'Manage extras', icon: <PlusCircleIcon className="w-4 h-4" />, onClick: () => onAddExtras(res), section: 'booking' });
    if (!res.voucherSubmitted && !res.dropOffCompleted && hasPermission(UserPermission.ACTION_RESERVATIONS_DELETE)) list.push({ key: 'delete', label: 'Delete reservation', icon: <TrashIcon className="w-4 h-4" />, onClick: () => onDelete(res.id, res.isNew, y, m), danger: true, section: 'danger' });
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
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap ${STAGE_META[stage].chip}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${STAGE_META[stage].dot}`} />{STAGE_META[stage].label}
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
    { key: 'bk', label: 'Bookings', value: filteredReservations.length, sub: `${stageCounts.cancelled} cancelled`, tone: 'text-slate-900', active: false },
    { key: 'rv', label: 'Revenue', value: money(revenue), sub: 'excl. cancellations', tone: 'text-slate-900', active: false },
  ];
  const selectCls = 'h-9 pl-3 pr-8 bg-white border border-slate-200 rounded-lg text-[13px] text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none';

  return (
    <>
      <div className="space-y-4 mb-10">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">Operations <span className="text-slate-300 mx-1">/</span> {isAgreementView ? 'Rental agreements' : 'Reservations'}</p>
            <h2 className="mt-0.5 text-2xl font-semibold text-slate-900 tracking-tight">{isAgreementView ? 'Rental agreements' : 'Reservations'}</h2>
            <p className="text-sm text-slate-500">{selectedMonth} {selectedYear} · {filteredReservations.length} booking{filteredReservations.length === 1 ? '' : 's'} · {money(revenue)}</p>
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
            {onOpenUnlistedAgreement && canViewVoucherActions && (
              <button onClick={onOpenUnlistedAgreement} title="Open a rental agreement for a booking that is not in the list"
                className="h-9 inline-flex items-center justify-center gap-2 px-3 bg-white border border-slate-200 text-slate-700 text-[13px] font-semibold rounded-lg hover:bg-slate-50 shadow-sm whitespace-nowrap">
                <DocumentReportIcon className="w-4 h-4 text-amber-600" /> Unlisted agreement
              </button>
            )}
            <button onClick={openAddModal} className={`${onOpenUnlistedAgreement && canViewVoucherActions ? '' : 'col-span-2 '}h-9 inline-flex items-center justify-center gap-2 px-3.5 bg-indigo-600 text-white text-[13px] font-semibold rounded-lg hover:bg-indigo-700 shadow-sm whitespace-nowrap`}>
              <PlusIcon className="w-4 h-4" /> New reservation
            </button>
          </div>
        </div>

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
          <section className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-amber-50/70 border-b border-amber-100 flex items-center gap-3">
              <span className="relative flex w-2.5 h-2.5"><span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60 animate-ping" /><span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-amber-500" /></span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">Awaiting confirmation <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] tabular-nums">{awaitingConfirmation.length}</span></h3>
                <p className="text-xs text-slate-500">Agreements opened for bookings that were not in the list. The agreement stays usable while these wait.</p>
              </div>
            </div>
            <ul className="divide-y divide-slate-100">
              {awaitingConfirmation.map(res => {
                const stage = stageOf(res);
                const { year: y, month: m } = getReservationPeriod(res);
                const agreementLabel = res.dropOffCompleted ? 'Returned' : res.voucherSubmitted ? 'Checked out' : 'Not checked out';
                return (
                  <li key={res.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
                    <button onClick={() => setDetailsModalReservation(res)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                      <span className="font-mono text-[13px] font-semibold text-slate-900 shrink-0">{res.bookingId}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900 truncate">{res.personName}</span>
                        <span className="block text-xs text-slate-500 truncate">{res.contactNumber}{res.customerEmail ? ` · ${res.customerEmail}` : ''} · by {res.unlistedCreatedBy || res.createdBy || 'staff'} {ago(res.unlistedCreatedAt || res.createdAt)}</span>
                      </span>
                    </button>
                    <div className="text-xs text-slate-600 md:w-56 min-w-0">
                      <span className="font-medium text-slate-800">{res.carModel}</span> <Plate value={res.licensePlate} />
                      <span className="block text-slate-500">{dayDate(res.startDate)} → {dayDate(res.endDate)}</span>
                    </div>
                    <div className="flex items-center gap-3 md:w-44">
                      <span className="text-[11px] font-semibold text-slate-500">{agreementLabel}</span>
                      <span className="text-sm font-semibold text-slate-900 tabular-nums ml-auto">{money(res.amount)}</span>
                    </div>
                    <div className="flex items-center gap-2 md:justify-end">
                      {canViewVoucherActions && stage !== 'cancelled' && (
                        <button onClick={() => onShowRentalVoucher(res, y, m)} className="h-8 px-3 rounded-md text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">
                          {res.dropOffCompleted ? 'Agreement' : res.voucherSubmitted ? 'Check in' : 'Check out'}
                        </button>
                      )}
                      {canConfirm && (
                        <>
                          <button onClick={() => rejectUnlisted(res)} className="h-8 px-3 rounded-md text-xs font-semibold text-rose-700 hover:bg-rose-50">Reject</button>
                          <button onClick={() => confirmUnlisted(res)} className="h-8 px-3 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700">Confirm</button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Data grid */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-clip">
          <div className="px-2 sm:px-3 border-b border-slate-200 flex gap-0.5 overflow-x-auto no-scrollbar">
            {TABS.map(t => (
              <button key={t.key} onClick={() => { setQuick(null); setStageTab(t.key); }}
                className={`px-3 py-3 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${stageTab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                {t.label}
                <span className={`ml-1.5 px-1.5 py-px rounded text-[11px] tabular-nums ${stageTab === t.key ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{stageCounts[t.key] ?? 0}</span>
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
                    <th className="hidden xl:table-cell font-semibold px-3 py-2.5 uppercase tracking-wider">Source</th>
                    <SortTh k="amount" className="text-right">Total</SortTh>
                    <th className="px-3 py-2.5 pr-4"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map(res => {
                    const kind = vehicleKind(res.carModel, fleet);
                    const isDuplicate = duplicateBookingIds.has(res.bookingId?.trim());
                    const days = rentalDaysOf(res);
                    const selected = drawerRes?.id === res.id;
                    return (
                      <tr key={res.id} onClick={() => setDetailsModalReservation(res)}
                        className={`cursor-pointer align-middle transition-colors ${selected ? 'bg-indigo-50/60' : isDuplicate ? 'bg-rose-50/40 hover:bg-rose-50' : 'hover:bg-slate-50'}`}>
                        <td className="pl-4 pr-3 py-2.5 whitespace-nowrap">
                          <span className={`font-mono font-semibold ${selected ? 'text-indigo-700' : 'text-slate-900'}`}>{res.bookingId || 'NO-ID'}</span>
                          {isDuplicate && <span className="ml-1.5 px-1 rounded bg-rose-100 text-rose-700 text-[10px] font-semibold uppercase">dup</span>}
                          <span className="block xl:hidden text-[11px] text-slate-400 truncate max-w-[7rem]">{res.source ? getSourceName(res.source) : ''}</span>
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
                          <p className="text-slate-800 truncate max-w-[10rem]">{res.carModel || '—'}</p>
                          <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><Plate value={res.licensePlate} /><span>{res.sippCode || vehicleKindLabel[kind]}</span></p>
                        </td>
                        <td className="hidden xl:table-cell px-3 py-2.5 text-slate-600 truncate max-w-[8rem]">{res.source ? getSourceName(res.source) : '—'}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <p className="font-semibold text-slate-900 tabular-nums">{money(res.amount)}</p>
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

              {/* Mobile / tablet list */}
              <ul className="lg:hidden divide-y divide-slate-100">
                {pageRows.map(res => {
                  const days = rentalDaysOf(res);
                  return (
                    <li key={res.id} className="px-4 py-3">
                      <button onClick={() => setDetailsModalReservation(res)} className="w-full text-left">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2"><span className="font-mono text-[13px] font-semibold text-slate-900">{res.bookingId || 'NO-ID'}</span><span className="text-[11px] text-slate-400 truncate">{res.source ? getSourceName(res.source) : ''}</span></p>
                            <p className="text-sm font-medium text-slate-900 truncate">{res.personName || 'Unnamed'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-slate-900 tabular-nums">{money(res.amount)}</p>
                            <div className="mt-1 flex justify-end"><StatusBadge res={res} withAlert={false} /></div>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 min-w-0">
                          <span className="truncate">{res.carModel || '—'}</span><Plate value={res.licensePlate} />
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                          <span className="text-slate-800">{dayDate(res.startDate)} {timeOf(res.startDate)}</span>
                          <ChevronRightIcon className="w-3 h-3 text-slate-300" />
                          <span className="text-slate-800">{dayDate(res.endDate)} {timeOf(res.endDate)}</span>
                          <span className="ml-auto">{days}d</span>
                        </div>
                      </button>
                      <div className="mt-2.5 flex items-center gap-2">
                        {alertOf(res) && <span className={`text-[11px] font-semibold ${isOverdue(res) ? 'text-rose-600' : 'text-sky-700'}`}>{alertOf(res)!.label}</span>}
                        <div className="ml-auto flex items-center gap-1"><PrimaryAction res={res} /><MenuButton res={res} /></div>
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

      {/* Booking detail panel */}
      {drawerRes && (() => {
        const res = drawerRes;
        const stage = stageOf(res);
        const alert = alertOf(res);
        const kind = vehicleKind(res.carModel, fleet);
        const days = rentalDaysOf(res);
        const acts = actionsFor(res);
        const quickActs = acts.filter(a => a.section === 'booking');
        const docActs = acts.filter(a => a.section === 'documents');
        const danger = acts.filter(a => a.section === 'danger');
        const extras = res.extras || [];
        const extrasTotal = extras.reduce((s, e) => s + (e.isComplementary ? 0 : (e.dailyPrice || 0) * days), 0);
        const extensions = res.extensionHistory || [];
        const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
          <div className="flex items-start justify-between gap-4 py-2">
            <dt className="text-slate-500 shrink-0">{label}</dt>
            <dd className="text-right text-slate-900 font-medium min-w-0 break-words">{children}</dd>
          </div>
        );
        const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
          <section className="px-5 py-4 border-b border-slate-100">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{title}</h4>
            {children}
          </section>
        );
        return (
          <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={`Reservation ${res.bookingId}`}>
            <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" onClick={() => setDetailsModalReservation(null)} />
            <aside className="absolute inset-y-0 right-0 w-full sm:w-[480px] bg-white shadow-2xl flex flex-col">
              <header className="px-5 pt-4 pb-3 border-b border-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Reservation</span>
                    <span className="font-mono text-sm font-semibold text-slate-900">{res.bookingId || 'NO-ID'}</span>
                  </div>
                  <button onClick={() => setDetailsModalReservation(null)} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100"><CloseIcon className="w-5 h-5" /></button>
                </div>
                <h3 className="mt-1 text-xl font-semibold text-slate-900 tracking-tight truncate">{res.personName || 'Unnamed'}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-500">
                  {res.contactNumber && <a href={`tel:${res.contactNumber}`} className="inline-flex items-center gap-1 hover:text-indigo-600"><PhoneIcon className="w-3.5 h-3.5" />{res.contactNumber}</a>}
                  {res.customerEmail && <a href={`mailto:${res.customerEmail}`} className="inline-flex items-center gap-1 hover:text-indigo-600 truncate"><MailIcon className="w-3.5 h-3.5" />{res.customerEmail}</a>}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <StatusBadge res={res} withAlert={false} />
                  {alert && <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${/overdue/i.test(alert.label) ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700'}`}>{alert.label}</span>}
                  {res.awaitingConfirmation && <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700">Awaiting confirmation</span>}
                </div>
              </header>

              {(canViewVoucherActions || quickActs.length > 0) && (
                <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/60 space-y-2">
                  {canViewVoucherActions && stage !== 'cancelled' && (
                    <div className="flex [&>button]:flex-1 [&>button]:h-9"><PrimaryAction res={res} full /></div>
                  )}
                  {quickActs.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {quickActs.map(a => (
                        <button key={a.key} onClick={a.onClick} className="h-9 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50">
                          <span className="text-slate-400">{a.icon}</span>{a.label.replace(' reservation', '')}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto text-[13px]">
                <Section title="Rental">
                  <div className="grid grid-cols-2 gap-3 py-2">
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Pickup</p>
                      <p className="mt-1 font-semibold text-slate-900">{longDate(res.startDate)}</p>
                      <p className="text-slate-500">{timeOf(res.startDate) || '—'}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-600">Return</p>
                      <p className="mt-1 font-semibold text-slate-900">{longDate(res.endDate)}</p>
                      <p className="text-slate-500">{timeOf(res.endDate) || '—'}</p>
                    </div>
                  </div>
                  <dl className="divide-y divide-slate-100">
                    <Row label="Duration">{days} day{days === 1 ? '' : 's'}</Row>
                    <Row label="Branch">{res.locationName || '—'}</Row>
                  </dl>
                </Section>

                <Section title="Vehicle">
                  <div className="flex items-center gap-3 py-2">
                    <VehicleArt kind={kind} className="w-16 h-9 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{res.carModel || 'Not assigned'}</p>
                      <p className="flex items-center gap-1.5 text-slate-500"><Plate value={res.licensePlate} />{vehicleKindLabel[kind]}{res.sippCode ? ` · ${res.sippCode}` : ''}{res.transmission ? ` · ${res.transmission}` : ''}</p>
                    </div>
                  </div>
                  {(res.upgradeHistory || []).length > 0 && (
                    <dl className="divide-y divide-slate-100">
                      {(res.upgradeHistory || []).map((u, i) => (
                        <Row key={i} label={`Upgrade · ${dayDate(u.date)}`}>{u.fromCar ? `${u.fromCar} → ` : ''}{u.toCar}{u.fee ? ` (${money(u.fee)})` : ' (free)'}</Row>
                      ))}
                    </dl>
                  )}
                </Section>

                <Section title="Charges">
                  <dl className="divide-y divide-slate-100">
                    <Row label={`Rental · ${days} day${days === 1 ? '' : 's'}`}><span className="tabular-nums">{money(res.baseAmount ?? Math.max(0, (res.amount || 0) - extrasTotal - extensions.reduce((s, x) => s + (x.cost || 0), 0)))}</span></Row>
                    {extras.map(e => (
                      <Row key={e.name} label={e.name}>{e.isComplementary ? <span className="text-emerald-600">Included</span> : <span className="tabular-nums">{money((e.dailyPrice || 0) * days)} <span className="text-slate-400 font-normal">({money(e.dailyPrice)}/day)</span></span>}</Row>
                    ))}
                    {extensions.map((x, i) => (
                      <Row key={i} label={`Extension · +${x.days} day${x.days === 1 ? '' : 's'}`}><span className="tabular-nums">{money(x.cost)}</span> <span className={`text-[11px] font-semibold ${x.paymentMethod === 'payLater' ? 'text-amber-600' : 'text-emerald-600'}`}>{x.paymentMethod === 'payLater' ? 'pay later' : 'paid'}</span></Row>
                    ))}
                    {res.returnCharges && res.returnCharges.items.length > 0 && (
                      <Row label={`Return charges · ${res.returnCharges.settlement === 'paid' ? 'paid' : 'claim'}`}><span className="tabular-nums">{res.returnCharges.currency} {res.returnCharges.items.reduce((s, it) => s + (Number(it.amount) || 0), 0).toFixed(2)}</span></Row>
                    )}
                  </dl>
                  <div className="mt-1 pt-3 border-t border-slate-200 flex items-baseline justify-between">
                    <span className="font-semibold text-slate-900">Total</span>
                    <span className="text-lg font-semibold text-slate-900 tabular-nums">{money(res.amount)}</span>
                  </div>
                  {(res.unpaidExtensionAmount || 0) > 0 && <p className="mt-1 text-right text-xs font-semibold text-amber-600">{money(res.unpaidExtensionAmount)} outstanding</p>}
                  {(res.securityDeposit || res.excess) ? (
                    <dl className="mt-2 divide-y divide-slate-100">
                      {res.securityDeposit ? <Row label="Security deposit"><span className="tabular-nums">{money(res.securityDeposit)}</span></Row> : null}
                      {res.excess ? <Row label="Excess"><span className="tabular-nums">{money(res.excess)}</span></Row> : null}
                    </dl>
                  ) : null}
                </Section>

                <Section title="Agreement">
                  <dl className="divide-y divide-slate-100">
                    <Row label="Check-out">{res.voucherSubmitted ? `${stamp(res.pickupDateTime)}${res.pickupAgentName ? ` · ${res.pickupAgentName}` : ''}` : <span className="text-slate-400 font-normal">Not yet</span>}</Row>
                    {res.voucherSubmitted && (res.pickupKmOut || res.pickupFuelLevel !== undefined) && <Row label="Out">{res.pickupKmOut ? `${res.pickupKmOut.toLocaleString()} km` : ''}{res.pickupFuelLevel !== undefined ? ` · fuel ${res.pickupFuelLevel}/8` : ''}</Row>}
                    <Row label="Check-in">{res.dropOffCompleted ? `${stamp(res.dropOffDateTime)}${res.dropOffAgentName ? ` · ${res.dropOffAgentName}` : ''}` : <span className="text-slate-400 font-normal">Not yet</span>}</Row>
                    {res.dropOffCompleted && (res.dropOffKmIn || res.dropOffFuelLevel !== undefined) && <Row label="In">{res.dropOffKmIn ? `${res.dropOffKmIn.toLocaleString()} km` : ''}{res.dropOffFuelLevel !== undefined ? ` · fuel ${res.dropOffFuelLevel}/8` : ''}</Row>}
                    {(res.agreementEmails || []).map((m, i) => (
                      <Row key={i} label={`Emailed · ${m.kind}`}>{m.to} <span className="text-slate-400 font-normal">{stamp(m.sentAt)}</span></Row>
                    ))}
                  </dl>
                </Section>

                <Section title="Booking">
                  <dl className="divide-y divide-slate-100">
                    <Row label="Source">{res.source ? getSourceName(res.source) : '—'}</Row>
                    <Row label="Booked on">{longDate(res.bookingDate)}</Row>
                    {res.createdBy && <Row label="Created by">{res.createdBy}</Row>}
                    {res.lastEditedBy && <Row label="Last edited by">{res.lastEditedBy}</Row>}
                    {res.confirmedBy && <Row label="Confirmed by">{res.confirmedBy}{res.confirmedAt ? ` · ${stamp(res.confirmedAt)}` : ''}</Row>}
                  </dl>
                </Section>

                {res.notes && (
                  <Section title="Notes">
                    <p className="py-2 text-slate-700 whitespace-pre-wrap leading-relaxed">{res.notes}</p>
                  </Section>
                )}
              </div>

              {(docActs.length > 0 || danger.length > 0) && (
                <footer className="px-5 py-3 border-t border-slate-200 flex flex-wrap items-center gap-2">
                  {docActs.map(a => (
                    <button key={a.key} onClick={a.onClick} className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <span className="text-slate-400">{a.icon}</span>{a.label.replace('Print rental agreement', 'Print agreement').replace('Print termination statement', 'Termination').replace('Share booking', 'Share')}
                    </button>
                  ))}
                  {danger.map(a => (
                    <button key={a.key} onClick={() => { a.onClick(); }} className="ml-auto h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-rose-600 hover:bg-rose-50">
                      {a.icon}Delete
                    </button>
                  ))}
                </footer>
              )}
            </aside>
          </div>
        );
      })()}

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={modalMode === 'add' ? 'Add Reservation' : 'Edit Reservation'}
        footer={
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={() => setIsModalOpen(false)} 
              className="flex-1 sm:flex-none h-9 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold text-sm hover:bg-slate-50"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave} 
              className="flex-1 sm:flex-none h-9 px-5 rounded-lg bg-indigo-600 text-white font-semibold text-sm shadow-sm hover:bg-indigo-700"
            >
              {modalMode === 'add' ? 'Create Reservation' : 'Save Changes'}
            </button>
          </div>
        }
      >
        <div className="space-y-7">
          {/* Section: Customer Information */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <UserIcon className="w-4 h-4 text-indigo-600" />
              </div>
              <h4 className="text-sm font-semibold text-slate-900">Customer Information</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-slate-700">Renter Name <span className="text-rose-500">*</span></label>
                <div className="relative group">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input 
                    type="text" 
                    value={formData.personName || ''} 
                    onChange={(e) => handleChange('personName', e.target.value)} 
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none font-medium text-slate-700"
                    placeholder="John Doe"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-slate-700">Contact Number</label>
                <div className="relative group">
                  <PhoneIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input 
                    type="text" 
                    value={formData.contactNumber || ''} 
                    onChange={(e) => handleChange('contactNumber', e.target.value)} 
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none font-medium text-slate-700"
                    placeholder="+1 234 567 890"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Section: Booking Details */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-amber-50 rounded-lg">
                <HashtagIcon className="w-4 h-4 text-amber-600" />
              </div>
              <h4 className="text-sm font-semibold text-slate-900">Booking Details</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-slate-700">Booking ID <span className="text-rose-500">*</span></label>
                <div className="relative group">
                  <HashtagIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
                  <input 
                    type="text" 
                    value={formData.bookingId || ''} 
                    onChange={(e) => handleChange('bookingId', e.target.value)} 
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500 transition-all outline-none font-medium text-slate-700"
                    placeholder="BK-1001"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-slate-700">Booking Date</label>
                <div className="relative group">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
                  <input 
                    type="date" 
                    value={formData.bookingDate ? formData.bookingDate.split('T')[0] : ''} 
                    onChange={(e) => handleChange('bookingDate', e.target.value)} 
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500 transition-all outline-none font-medium text-slate-700"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-slate-700">Source</label>
                <div className="relative group">
                  <GlobeAltIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
                  <select 
                    value={formData.source || ''} 
                    onChange={(e) => handleChange('source', e.target.value)} 
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500 transition-all outline-none font-medium text-slate-700 appearance-none"
                  >
                    <option value="">Select Source</option>
                    {rentalSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* Section: Vehicle & Logistics */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <CarIcon className="w-4 h-4 text-emerald-600" />
              </div>
              <h4 className="text-sm font-semibold text-slate-900">Vehicle & Logistics</h4>
            </div>
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-slate-700">Car Model <span className="text-rose-500">*</span></label>
                  <div className="relative group">
                    <CarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                    <input 
                      type="text" 
                      value={formData.carModel || ''} 
                      onChange={(e) => handleChange('carModel', e.target.value)} 
                      className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none font-medium text-slate-700"
                      placeholder="e.g. Toyota Corolla"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-slate-700">Location</label>
                  <div className="relative group">
                    <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                    <select 
                      value={formData.locationName || ''} 
                      onChange={(e) => handleChange('locationName', e.target.value)} 
                      className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none font-medium text-slate-700 appearance-none"
                    >
                      <option value="">Select Location</option>
                      {rentalLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-slate-700">Pickup Date & Time <span className="text-rose-500">*</span></label>
                  <div className="relative group">
                    <AirplaneLandingIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                    <input 
                      type="datetime-local" 
                      value={formData.startDate || ''} 
                      onChange={(e) => handleChange('startDate', e.target.value)} 
                      className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none font-medium text-slate-700"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-slate-700">Return Date & Time <span className="text-rose-500">*</span></label>
                  <div className="relative group">
                    <AirplaneTakeoffIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                    <input 
                      type="datetime-local" 
                      value={formData.endDate || ''} 
                      onChange={(e) => handleChange('endDate', e.target.value)} 
                      className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none font-medium text-slate-700"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section: Financials & Extras */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-rose-50 rounded-lg">
                  <CurrencyDollarIcon className="w-4 h-4 text-rose-600" />
                </div>
                <h4 className="text-sm font-semibold text-slate-900">Financials & Status</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-slate-700">Amount ($)</label>
                  <input 
                    type="number" 
                    value={formData.amount || 0} 
                    onChange={(e) => handleChange('amount', parseFloat(e.target.value) || 0)} 
                    className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-rose-500/10 focus:border-rose-500 transition-all outline-none font-bold text-slate-700"
                    min="0" 
                    step="0.01" 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-slate-700">Status</label>
                  <select 
                    value={formData.status} 
                    onChange={(e) => handleChange('status', e.target.value)} 
                    className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-rose-500/10 focus:border-rose-500 transition-all outline-none font-medium text-slate-700 appearance-none"
                  >
                    <option value={ReservationStatus.CONFIRMED}>Confirmed</option>
                    <option value={ReservationStatus.COMPLETED}>Completed</option>
                    <option value={ReservationStatus.CANCELLED}>Cancelled</option>
                    <option value="NO_SHOW">No Show</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-slate-700">Reservation Notes</label>
                <textarea 
                  value={formData.notes || ''} 
                  onChange={(e) => handleChange('notes', e.target.value)} 
                  rows={3} 
                  className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-slate-500/10 focus:border-slate-500 transition-all outline-none font-medium text-slate-700 resize-none"
                  placeholder="Any special requests or notes..."
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <PlusCircleIcon className="w-4 h-4 text-indigo-600" />
                </div>
                <h4 className="text-sm font-semibold text-slate-900">Additional Services</h4>
              </div>
              <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 space-y-3 max-h-[220px] overflow-y-auto custom-scrollbar">
                {availableExtras.map(extra => (
                  <label 
                    key={extra.id} 
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                      (formData.selectedExtras || []).includes(extra.id) 
                        ? 'bg-white border-indigo-200 shadow-sm' 
                        : 'bg-transparent border-transparent hover:bg-white/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                        (formData.selectedExtras || []).includes(extra.id) 
                          ? 'bg-indigo-600 border-indigo-600' 
                          : 'bg-white border-slate-200'
                      }`}>
                        {(formData.selectedExtras || []).includes(extra.id) && <CheckCircleIcon className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <span className={`text-xs font-bold transition-colors ${
                        (formData.selectedExtras || []).includes(extra.id) ? 'text-slate-900' : 'text-slate-500'
                      }`}>
                        {extra.name}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase bg-slate-100 px-2 py-1 rounded-lg">
                      ${extra.pricePerDay}/day
                    </span>
                    <input 
                      type="checkbox" 
                      className="hidden"
                      checked={(formData.selectedExtras || []).includes(extra.id)} 
                      onChange={() => handleExtraToggle(extra.id)} 
                    />
                  </label>
                ))}
              </div>
            </div>
          </section>

          {/* Price summary */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-200 text-sm">
            <div className="flex items-center justify-between px-4 py-2.5"><span className="text-slate-500">Duration</span><span className="font-medium text-slate-900 tabular-nums">{durationDays.toFixed(1)} days</span></div>
            <div className="flex items-center justify-between px-4 py-2.5"><span className="text-slate-500">Base amount</span><span className="font-medium text-slate-900 tabular-nums">${(formData.amount || 0).toFixed(2)}</span></div>
            <div className="flex items-center justify-between px-4 py-3"><span className="font-semibold text-slate-900">Estimated total</span><span className="text-xl font-semibold text-slate-900 tabular-nums">${calculatedTotal.toFixed(2)}</span></div>
          </div>
        </div>
      </Modal>

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
