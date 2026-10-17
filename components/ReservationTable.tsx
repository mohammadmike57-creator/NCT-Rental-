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
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div 
          className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`} 
          onClick={onClose} 
          aria-hidden="true"
        ></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className={`inline-block align-bottom bg-white rounded-[2.5rem] text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full ${animationClass}`}>
          <div className="bg-white">
            <div className="flex justify-between items-center px-8 py-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight" id="modal-title">{title}</h3>
                <p className="text-xs text-slate-500 font-medium mt-1">Please fill in the details below</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors group">
                <CloseIcon className="w-6 h-6 text-slate-400 group-hover:text-slate-600 transition-colors" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto px-8 py-8 custom-scrollbar">{children}</div>
          </div>
          <div className="bg-slate-50/80 backdrop-blur-md px-8 py-6 border-t border-slate-100 flex flex-row-reverse gap-3">
            {footer || (
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto inline-flex justify-center rounded-2xl border border-slate-200 shadow-sm px-8 py-3 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none transition-all hover:shadow-md"
              >
                Done
              </button>
            )}
          </div>
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
  const [localBookingIdSearch, setLocalBookingIdSearch] = useState('');
  const [stageTab, setStageTab] = useState<'all' | 'ready' | 'onrent' | 'closed' | 'pending' | 'cancelled'>('all');
  const [sortKey, setSortKey] = useState<'pickup' | 'return' | 'name' | 'amount'>('pickup');

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
        (r.personName && r.personName.toLowerCase().includes(search))
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
    const list = stageTab === 'all' ? filteredReservations : filteredReservations.filter(r => stageOf(r) === stageTab);
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'return': return (a.endDate || '').localeCompare(b.endDate || '');
        case 'name': return (a.personName || '').localeCompare(b.personName || '');
        case 'amount': return (b.amount || 0) - (a.amount || 0);
        default: return (a.startDate || '').localeCompare(b.startDate || '');
      }
    });
    return sorted;
  }, [filteredReservations, stageTab, sortKey]);

  const revenue = filteredReservations.filter(r => stageOf(r) !== 'cancelled').reduce((s, r) => s + (r.amount || 0), 0);
  const actionToday = filteredReservations.filter(r => alertOf(r) !== null).length;

  const TABS: { key: 'all' | Stage; label: string }[] = isAgreementView
    ? [{ key: 'all', label: 'All' }, { key: 'ready', label: 'To check out' }, { key: 'onrent', label: 'Open' }, { key: 'closed', label: 'Closed' }]
    : [{ key: 'all', label: 'All' }, { key: 'ready', label: 'Awaiting pickup' }, { key: 'onrent', label: 'On rent' }, { key: 'closed', label: 'Closed' }, { key: 'pending', label: 'Pending' }, { key: 'cancelled', label: 'Cancelled' }];

  const PrimaryAction: React.FC<{ res: Reservation; full?: boolean }> = ({ res, full }) => {
    if (!canViewVoucherActions) return null;
    const { year: y, month: m } = getReservationPeriod(res);
    const stage = stageOf(res);
    const cfg = stage === 'ready' || (stage === 'pending' && res.awaitingConfirmation) ? { label: 'Check out', cls: 'bg-slate-900 text-white hover:bg-slate-800' }
      : stage === 'onrent' ? { label: 'Check in', cls: 'bg-emerald-600 text-white hover:bg-emerald-700' }
      : stage === 'closed' ? { label: 'Agreement', cls: 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50' }
      : null;
    if (!cfg) return null;
    return (
      <button onClick={() => onShowRentalVoucher(res, y, m)} className={`${full ? 'flex-1' : ''} inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${cfg.cls}`}>
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

  const IconAction: React.FC<{ title: string; onClick: () => void; tone?: string; children: React.ReactNode }> = ({ title, onClick, tone = 'hover:text-slate-900 hover:bg-slate-100', children }) => (
    <button onClick={onClick} title={title} aria-label={title} className={`p-1.5 rounded-lg text-slate-400 transition-colors ${tone}`}>{children}</button>
  );

  const RowActions: React.FC<{ res: Reservation }> = ({ res }) => {
    const { year: y, month: m } = getReservationPeriod(res);
    const stage = stageOf(res);
    return (
      <div className="flex items-center gap-0.5">
        {canViewVoucherActions && <IconAction title="Receipt" onClick={() => onShowReceipt(res)}><CurrencyDollarIcon className="w-4 h-4" /></IconAction>}
        {canViewVoucherActions && (stage === 'onrent' || stage === 'closed') && (
          <IconAction title="Print rental agreement" onClick={() => printDoc(res, 'agreement')} tone="hover:text-slate-900 hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>
          </IconAction>
        )}
        {canViewVoucherActions && stage === 'closed' && (
          <IconAction title="Print termination statement" onClick={() => printDoc(res, 'termination')}><PdfIcon className="w-4 h-4" /></IconAction>
        )}
        {stage === 'onrent' && hasPermission(UserPermission.ACTION_RESERVATIONS_EXTEND) && (
          <IconAction title="Extend rental" onClick={() => onExtend(res)} tone="hover:text-amber-700 hover:bg-amber-50"><ClockIcon className="w-4 h-4" /></IconAction>
        )}
        {hasPermission(UserPermission.ACTION_RESERVATIONS_EDIT) && <IconAction title="Edit" onClick={() => openEditModal(res)}><EditIcon className="w-4 h-4" /></IconAction>}
        {upgradePermission && stage !== 'closed' && stage !== 'cancelled' && (
          <IconAction title="Upgrade vehicle" onClick={() => openUpgradeModal(res)} tone="hover:text-orange-700 hover:bg-orange-50"><CarIcon className="w-4 h-4" /></IconAction>
        )}
        {onAddExtras && stage !== 'closed' && stage !== 'cancelled' && hasPermission(UserPermission.ACTION_RESERVATIONS_MANAGE_EXTRAS) && (
          <IconAction title="Extras" onClick={() => onAddExtras(res)} tone="hover:text-violet-700 hover:bg-violet-50"><PlusCircleIcon className="w-4 h-4" /></IconAction>
        )}
        {hasPermission(UserPermission.ACTION_RESERVATIONS_EDIT) && <IconAction title="Share" onClick={() => onShare(res)}><ShareIcon className="w-4 h-4" /></IconAction>}
        {!res.voucherSubmitted && !res.dropOffCompleted && hasPermission(UserPermission.ACTION_RESERVATIONS_DELETE) && (
          <IconAction title="Delete" onClick={() => onDelete(res.id, res.isNew, y, m)} tone="hover:text-rose-700 hover:bg-rose-50"><CloseIcon className="w-4 h-4" /></IconAction>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="space-y-5 mb-10">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="p-5 sm:p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isAgreementView ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                {isAgreementView ? <DocumentReportIcon className="w-6 h-6" /> : <CalendarIcon className="w-6 h-6" />}
              </div>
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{isAgreementView ? 'Rental agreements' : 'Reservations'}</h2>
                <p className="text-sm text-slate-500">{selectedMonth} {selectedYear} · {filteredReservations.length} booking{filteredReservations.length === 1 ? '' : 's'}</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 w-full xl:w-auto">
              <div className="relative w-full sm:w-72">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input type="text" placeholder="Search name or booking ID" value={localBookingIdSearch} onChange={handleSearchChange}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
              </div>
              <div className="flex items-center gap-2">
                <select value={sortKey} onChange={e => setSortKey(e.target.value as typeof sortKey)} aria-label="Sort"
                  className="flex-1 sm:flex-none min-w-0 py-2.5 pl-3 pr-8 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500/20 outline-none">
                  <option value="pickup">Sort: pickup date</option>
                  <option value="return">Sort: return date</option>
                  <option value="name">Sort: customer</option>
                  <option value="amount">Sort: amount</option>
                </select>
                <div className="flex items-center rounded-xl border border-slate-200 bg-white divide-x divide-slate-200 overflow-hidden shrink-0">
                  <button onClick={handleExportCSV} disabled={filteredReservations.length === 0} title="Export CSV" aria-label="Export CSV" className="p-2.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40"><ExportIcon className="w-4 h-4" /></button>
                  <button onClick={handleExportExcel} disabled={filteredReservations.length === 0} title="Export Excel" aria-label="Export Excel" className="p-2.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40"><PdfIcon className="w-4 h-4" /></button>
                  {(currentUser?.email === 'nadeenalnahas@gmail.com' || currentUser?.role === 'ADMIN' || currentUser?.username === 'admin') && (
                    <button onClick={() => onDeleteMonth(selectedYear, selectedMonth)} disabled={allDisplayReservations.length === 0} title={`Delete all reservations for ${selectedMonth} ${selectedYear}`} aria-label="Delete month"
                      className="p-2.5 text-rose-500 hover:bg-rose-50 disabled:opacity-40"><CloseIcon className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
              <div className={`grid gap-2 sm:flex ${onOpenUnlistedAgreement && canViewVoucherActions ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {onOpenUnlistedAgreement && canViewVoucherActions && (
                  <button onClick={onOpenUnlistedAgreement} title="Open a rental agreement for a booking that is not in the list"
                    className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 bg-white border border-amber-300 text-amber-800 text-sm font-semibold rounded-xl hover:bg-amber-50 whitespace-nowrap">
                    <DocumentReportIcon className="w-4 h-4 shrink-0" /> Unlisted agreement
                  </button>
                )}
                <button onClick={openAddModal} className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-sm whitespace-nowrap">
                  <PlusCircleIcon className="w-4 h-4 shrink-0" /> New reservation
                </button>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-100 divide-x divide-y lg:divide-y-0 divide-slate-100">
            {[
              { label: 'Bookings', value: filteredReservations.length, sub: `${stageCounts.cancelled} cancelled` },
              { label: 'On rent now', value: stageCounts.onrent, sub: `${stageCounts.ready} awaiting pickup` },
              { label: 'Needs attention', value: actionToday, sub: 'due today or overdue', warn: actionToday > 0 },
              { label: 'Revenue', value: money(revenue), sub: 'excluding cancellations' },
            ].map(k => (
              <div key={k.label} className="px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${k.warn ? 'text-amber-600' : 'text-slate-900'}`}>{k.value}</p>
                <p className="text-xs text-slate-400">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Stage tabs */}
          <div className="px-3 sm:px-5 border-t border-slate-100 flex gap-1 overflow-x-auto no-scrollbar">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setStageTab(t.key)}
                className={`px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${stageTab === t.key ? 'border-indigo-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                {t.label}
                <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[11px] tabular-nums ${stageTab === t.key ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{stageCounts[t.key] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        {awaitingConfirmation.length > 0 && (
          <section className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 bg-gradient-to-r from-amber-50 to-white border-b border-amber-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="relative flex w-2.5 h-2.5"><span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60 animate-ping" /><span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-amber-500" /></span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Awaiting confirmation <span className="ml-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[11px] tabular-nums">{awaitingConfirmation.length}</span></h3>
                  <p className="text-xs text-slate-500">Agreements opened for bookings that were not in the list. The agreement stays usable while these wait.</p>
                </div>
              </div>
            </div>
            <ul className="divide-y divide-slate-100">
              {awaitingConfirmation.map(res => {
                const stage = stageOf(res);
                const { year: y, month: m } = getReservationPeriod(res);
                const kind = vehicleKind(res.carModel, fleet);
                const agreementLabel = res.dropOffCompleted ? 'Returned' : res.voucherSubmitted ? 'Checked out' : 'Not checked out';
                const agreementCls = res.dropOffCompleted ? 'bg-slate-100 text-slate-600' : res.voucherSubmitted ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700';
                return (
                  <li key={res.id} className="px-5 py-3.5 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-bold shrink-0">{initials(res.personName)}</div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{res.personName} <span className="font-mono text-xs text-slate-400 font-normal">#{res.bookingId}</span></p>
                        <p className="text-xs text-slate-500 truncate">{res.contactNumber}{res.customerEmail ? ` · ${res.customerEmail}` : ''} · by {res.unlistedCreatedBy || res.createdBy || 'staff'} {ago(res.unlistedCreatedAt || res.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600 md:w-56 min-w-0">
                      <VehicleArt kind={kind} className="w-12 h-7 shrink-0" />
                      <span className="truncate"><span className="font-semibold text-slate-800">{res.carModel}</span>{res.licensePlate ? ` · ${res.licensePlate}` : ''}<br />{shortDate(res.startDate)} → {shortDate(res.endDate)}</span>
                    </div>
                    <div className="flex items-center gap-2 md:w-40">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${agreementCls}`}>{agreementLabel}</span>
                      <span className="text-sm font-bold text-slate-900 tabular-nums ml-auto md:ml-0">{money(res.amount)}</span>
                    </div>
                    <div className="flex items-center gap-2 md:justify-end">
                      {canViewVoucherActions && stage !== 'cancelled' && (
                        <button onClick={() => onShowRentalVoucher(res, y, m)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white ring-1 ring-slate-200 text-slate-700 hover:bg-slate-50">
                          <DocumentReportIcon className="w-4 h-4" /> {res.dropOffCompleted ? 'Agreement' : res.voucherSubmitted ? 'Check in' : 'Check out'}
                        </button>
                      )}
                      {canConfirm && (
                        <>
                          <button onClick={() => rejectUnlisted(res)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 hover:bg-rose-50">Reject</button>
                          <button onClick={() => confirmUnlisted(res)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700">Confirm</button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {visibleReservations.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 py-16 text-center">
            <CalendarIcon className="w-10 h-10 mx-auto text-slate-300" />
            <p className="mt-3 font-semibold text-slate-700">No reservations here</p>
            <p className="text-sm text-slate-500">Try another tab, clear the search, or create a new reservation.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="text-left font-semibold px-5 py-3">Customer</th>
                    <th className="text-left font-semibold px-4 py-3">Vehicle</th>
                    <th className="text-left font-semibold px-4 py-3">Pickup</th>
                    <th className="text-left font-semibold px-4 py-3">Return</th>
                    <th className="text-left font-semibold px-4 py-3">Status</th>
                    <th className="text-right font-semibold px-4 py-3">Amount</th>
                    <th className="text-right font-semibold px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleReservations.map(res => {
                    const stage = stageOf(res);
                    const alert = alertOf(res);
                    const kind = vehicleKind(res.carModel, fleet);
                    const isDuplicate = duplicateBookingIds.has(res.bookingId?.trim());
                    return (
                      <tr key={res.id} className={`group hover:bg-slate-50/70 ${isDuplicate ? 'bg-rose-50/40' : ''}`}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-xs font-bold flex items-center justify-center shrink-0">{initials(res.personName)}</div>
                            <div className="min-w-0">
                              <button onClick={() => setDetailsModalReservation(res)} className="font-semibold text-slate-900 hover:text-indigo-600 truncate max-w-[14rem] block text-left">{res.personName || 'Unnamed'}</button>
                              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <span className="font-mono">{res.bookingId || 'NO-ID'}</span>
                                {res.source && <><span className="text-slate-300">·</span><span className="truncate max-w-[8rem]">{getSourceName(res.source)}</span></>}
                                {isDuplicate && <span className="ml-1 px-1.5 rounded bg-rose-100 text-rose-700 font-semibold">duplicate</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <VehicleArt kind={kind} className="w-14 h-8 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800 truncate max-w-[10rem]">{res.carModel || '—'}</p>
                              <p className="text-xs text-slate-400">{res.licensePlate || vehicleKindLabel[kind]}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-medium text-slate-800">{shortDate(res.startDate)} <span className="text-slate-400 font-normal">{timeOf(res.startDate)}</span></p>
                          <p className="text-xs text-slate-400 truncate max-w-[9rem]">{res.locationName || '—'}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-medium text-slate-800">{shortDate(res.endDate)} <span className="text-slate-400 font-normal">{timeOf(res.endDate)}</span></p>
                          <p className="text-xs text-slate-400">{rentalDaysOf(res)} day{rentalDaysOf(res) === 1 ? '' : 's'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset ${STAGE_META[stage].chip}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${STAGE_META[stage].dot}`} />{STAGE_META[stage].label}
                            </span>
                            {alert && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${alert.cls}`}>{alert.label}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">{money(res.amount)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <RowActions res={res} />
                            <PrimaryAction res={res} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile / tablet cards */}
            <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-3">
              {visibleReservations.map(res => {
                const stage = stageOf(res);
                const alert = alertOf(res);
                const kind = vehicleKind(res.carModel, fleet);
                return (
                  <div key={res.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <button onClick={() => setDetailsModalReservation(res)} className="min-w-0 text-left">
                          <p className="font-semibold text-slate-900 truncate">{res.personName || 'Unnamed'}</p>
                          <p className="text-xs text-slate-500 font-mono">{res.bookingId || 'NO-ID'}{res.source ? ` · ${getSourceName(res.source)}` : ''}</p>
                        </button>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset shrink-0 ${STAGE_META[stage].chip}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${STAGE_META[stage].dot}`} />{STAGE_META[stage].label}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <VehicleArt kind={kind} className="w-16 h-9 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{res.carModel || '—'}</p>
                          <p className="text-xs text-slate-400">{res.licensePlate || vehicleKindLabel[kind]}</p>
                        </div>
                        <p className="ml-auto text-lg font-bold text-slate-900 tabular-nums">{money(res.amount)}</p>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                          <p className="text-slate-400 font-semibold uppercase tracking-wide text-[10px]">Pickup</p>
                          <p className="font-medium text-slate-800">{shortDate(res.startDate)} {timeOf(res.startDate)}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                          <p className="text-slate-400 font-semibold uppercase tracking-wide text-[10px]">Return · {rentalDaysOf(res)}d</p>
                          <p className="font-medium text-slate-800">{shortDate(res.endDate)} {timeOf(res.endDate)}</p>
                        </div>
                      </div>
                      {alert && <p className={`mt-2 inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${alert.cls}`}>{alert.label}</p>}
                    </div>
                    <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/60 flex items-center gap-2">
                      <RowActions res={res} />
                      <div className="ml-auto"><PrimaryAction res={res} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Modal isOpen={!!detailsModalReservation} onClose={() => setDetailsModalReservation(null)} title="Reservation Preview">
        {detailsModalReservation && (
          <div className="space-y-6 text-sm">
            {/* Professional High-End Header */}
            <div className="bg-gradient-to-br from-[#004d40] via-[#00695c] to-[#00796b] -mx-6 -mt-5 px-6 py-8 text-white relative overflow-hidden shadow-xl">
              <div className="absolute top-0 right-0 w-64 h-64 -mr-16 -mt-16 bg-white/5 rounded-full blur-[80px]"></div>
              
              <div className="relative flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="bg-white/10 backdrop-blur-lg p-3 rounded-2xl border border-white/20 shadow-lg transform hover:scale-105 transition-transform duration-500">
                    <UserIcon className="w-8 h-8 text-emerald-300" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black tracking-tight drop-shadow-md bg-clip-text text-transparent bg-gradient-to-b from-white to-emerald-100">{detailsModalReservation.personName}</h2>
                    <div className="flex items-center text-emerald-100/70 mt-2 bg-white/5 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/10 w-fit">
                      <PhoneIcon className="w-3.5 h-3.5 mr-2 text-emerald-400" />
                      <span className="text-xs font-bold tracking-wide">{detailsModalReservation.contactNumber || 'No contact provided'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <span className={`px-4 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-full backdrop-blur-lg border shadow-md ${
                    detailsModalReservation.status === ReservationStatus.CONFIRMED ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/40' :
                    detailsModalReservation.status === ReservationStatus.COMPLETED ? 'bg-blue-500/30 text-blue-300 border-blue-500/40' :
                    detailsModalReservation.status === ReservationStatus.CANCELLED ? 'bg-red-500/30 text-red-300 border-red-500/40' :
                    'bg-amber-500/30 text-amber-300 border-amber-500/40'
                  }`}>
                    {detailsModalReservation.status}
                  </span>
                  {(detailsModalReservation.locationName?.includes('Airport') || detailsModalReservation.locationName?.includes('AMM')) && (
                    <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/20 shadow-sm group cursor-help">
                      <AirplaneIcon className="w-4 h-4 text-emerald-400" />
                      <span className="text-[9px] font-bold uppercase tracking-tight">VIP Airport</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-2">
              {/* Customer & Vehicle Information */}
              <div className="space-y-6">
                <section>
                  <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-3 flex items-center">
                    <IdentificationIcon className="w-3.5 h-3.5 mr-1.5" />
                    Reservation Identity
                  </h4>
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden text-xs">
                    <div className="p-3 flex justify-between items-center border-b border-gray-50">
                      <span className="text-gray-400 font-medium">Booking ID</span>
                      <span className="font-mono font-bold text-gray-900 bg-gray-50 px-2 py-0.5 rounded">{detailsModalReservation.bookingId}</span>
                    </div>
                    <div className="p-4 flex justify-between items-center border-b border-gray-50">
                      <span className="text-gray-400 font-medium">Platform</span>
                      <div className="flex items-center font-bold text-indigo-700">
                        <GlobeAltIcon className="w-4 h-4 mr-2" />
                        {getSourceName(detailsModalReservation.source || '')}
                      </div>
                    </div>
                    <div className="p-4 flex justify-between items-center">
                      <span className="text-gray-400 font-medium">Created On</span>
                      <span className="font-semibold text-gray-700">{formatDateOnly(detailsModalReservation.bookingDate || detailsModalReservation.startDate)}</span>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-3 flex items-center">
                    <CarIcon className="w-3.5 h-3.5 mr-1.5" />
                    Vehicle Selection
                  </h4>
                  <div className="bg-indigo-50/30 rounded-xl border border-indigo-100 p-4 flex items-center gap-4 text-xs">
                    <div className="bg-white p-2 rounded-lg shadow-sm border border-indigo-50">
                      <CarIcon className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider">Assigned Model</p>
                      <p className="text-base font-black text-gray-900 leading-tight mt-0.5">{detailsModalReservation.carModel}</p>
                    </div>
                  </div>
                </section>
              </div>

              {/* Schedule & Location */}
              <div className="space-y-6">
                <section>
                  <h4 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.15em] mb-4 flex items-center">
                    <ClockIcon className="w-4 h-4 mr-2" />
                    Itinerary Details
                  </h4>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
                    <div className="flex items-start gap-4">
                      <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600">
                        {(detailsModalReservation.locationName?.includes('Airport') || detailsModalReservation.locationName?.includes('AMM')) ? <AirplaneIcon className="w-5 h-5" /> : <MapPinIcon className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Service Location</p>
                        <p className="text-sm font-bold text-gray-900">{detailsModalReservation.locationName || 'Main Office'}</p>
                        {(detailsModalReservation.locationName?.includes('Airport') || detailsModalReservation.locationName?.includes('AMM')) && (
                          <span className="mt-1 inline-flex text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-tighter border border-blue-100">Premium Airport Hub</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5 text-indigo-500">
                          <AirplaneLandingIcon className="w-4 h-4" />
                          <span className="text-[9px] font-black uppercase tracking-widest">Pickup</span>
                        </div>
                        <p className="text-xs font-bold text-gray-900">{formatDate(detailsModalReservation.startDate)}</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5 text-indigo-500">
                          <AirplaneTakeoffIcon className="w-4 h-4" />
                          <span className="text-[9px] font-black uppercase tracking-widest">Drop-off</span>
                        </div>
                        <p className="text-xs font-bold text-gray-900">{formatDate(detailsModalReservation.endDate)}</p>
                      </div>
                    </div>

                    <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Duration</span>
                      <span className="text-sm font-black text-indigo-600">{getDuration(detailsModalReservation.startDate, detailsModalReservation.endDate)} DAYS</span>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.15em] mb-4 flex items-center">
                    <CurrencyDollarIcon className="w-4 h-4 mr-2" />
                    Financial Overview
                  </h4>
                  <div className="bg-gradient-to-br from-green-500 to-emerald-700 rounded-2xl p-6 text-white shadow-lg shadow-emerald-200/50">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mb-1">Estimated Total</p>
                        <p className="text-3xl font-black tracking-tighter">${detailsModalReservation.amount?.toFixed(2)}</p>
                      </div>
                      <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm border border-white/20">
                        <CheckCircleIcon className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            {/* Extras Section */}
            {detailsModalReservation.selectedExtras && detailsModalReservation.selectedExtras.length > 0 && (
              <div className="px-2">
                <h4 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.15em] mb-4 flex items-center">
                  <PlusCircleIcon className="w-4 h-4 mr-2" />
                  Additional Services
                </h4>
                <div className="flex flex-wrap gap-2">
                  {detailsModalReservation.selectedExtras.map((extraId, idx) => {
                    const extra = availableExtras.find(e => e.id === extraId);
                    return (
                      <span key={idx} className="bg-white px-4 py-2 rounded-xl border border-gray-100 text-xs font-bold text-gray-700 shadow-sm hover:shadow-md transition-shadow">
                        {extra ? extra.name : extraId}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes Section */}
            {detailsModalReservation.notes && (
              <div className="px-2">
                <div className="bg-amber-50/50 rounded-2xl border border-amber-100 p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 text-amber-100 rotate-12">
                    <DocumentReportIcon className="w-12 h-12" />
                  </div>
                  <h4 className="text-[11px] font-black text-amber-600 uppercase tracking-[0.15em] mb-3 flex items-center">
                    <DocumentReportIcon className="w-4 h-4 mr-2" />
                    Reservation Notes
                  </h4>
                  <p className="text-sm text-amber-900 font-medium leading-relaxed italic relative z-10">
                    "{detailsModalReservation.notes}"
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={modalMode === 'add' ? 'Add Reservation' : 'Edit Reservation'}
        footer={
          <div className="flex gap-3 w-full sm:w-auto">
            <button 
              onClick={() => setIsModalOpen(false)} 
              className="flex-1 sm:flex-none px-8 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all active:scale-95"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave} 
              className="flex-1 sm:flex-none px-8 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm shadow-lg shadow-emerald-200 hover:shadow-emerald-300 transition-all hover:-translate-y-0.5 active:scale-95"
            >
              {modalMode === 'add' ? 'Create Reservation' : 'Save Changes'}
            </button>
          </div>
        }
      >
        <div className="space-y-8">
          {/* Section: Customer Information */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <UserIcon className="w-4 h-4 text-indigo-600" />
              </div>
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Customer Information</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1">Renter Name <span className="text-rose-500">*</span></label>
                <div className="relative group">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input 
                    type="text" 
                    value={formData.personName || ''} 
                    onChange={(e) => handleChange('personName', e.target.value)} 
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none font-medium text-slate-700"
                    placeholder="John Doe"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1">Contact Number</label>
                <div className="relative group">
                  <PhoneIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input 
                    type="text" 
                    value={formData.contactNumber || ''} 
                    onChange={(e) => handleChange('contactNumber', e.target.value)} 
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none font-medium text-slate-700"
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
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Booking Details</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1">Booking ID <span className="text-rose-500">*</span></label>
                <div className="relative group">
                  <HashtagIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
                  <input 
                    type="text" 
                    value={formData.bookingId || ''} 
                    onChange={(e) => handleChange('bookingId', e.target.value)} 
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all outline-none font-medium text-slate-700"
                    placeholder="BK-1001"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1">Booking Date</label>
                <div className="relative group">
                  <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
                  <input 
                    type="date" 
                    value={formData.bookingDate ? formData.bookingDate.split('T')[0] : ''} 
                    onChange={(e) => handleChange('bookingDate', e.target.value)} 
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all outline-none font-medium text-slate-700"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1">Source</label>
                <div className="relative group">
                  <GlobeAltIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
                  <select 
                    value={formData.source || ''} 
                    onChange={(e) => handleChange('source', e.target.value)} 
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all outline-none font-medium text-slate-700 appearance-none"
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
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Vehicle & Logistics</h4>
            </div>
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1">Car Model <span className="text-rose-500">*</span></label>
                  <div className="relative group">
                    <CarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                    <input 
                      type="text" 
                      value={formData.carModel || ''} 
                      onChange={(e) => handleChange('carModel', e.target.value)} 
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none font-medium text-slate-700"
                      placeholder="e.g. Toyota Corolla"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1">Location</label>
                  <div className="relative group">
                    <MapPinIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                    <select 
                      value={formData.locationName || ''} 
                      onChange={(e) => handleChange('locationName', e.target.value)} 
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none font-medium text-slate-700 appearance-none"
                    >
                      <option value="">Select Location</option>
                      {rentalLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1">Pickup Date & Time <span className="text-rose-500">*</span></label>
                  <div className="relative group">
                    <AirplaneLandingIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                    <input 
                      type="datetime-local" 
                      value={formData.startDate || ''} 
                      onChange={(e) => handleChange('startDate', e.target.value)} 
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none font-medium text-slate-700"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1">Return Date & Time <span className="text-rose-500">*</span></label>
                  <div className="relative group">
                    <AirplaneTakeoffIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                    <input 
                      type="datetime-local" 
                      value={formData.endDate || ''} 
                      onChange={(e) => handleChange('endDate', e.target.value)} 
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none font-medium text-slate-700"
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
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Financials & Status</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1">Amount ($)</label>
                  <input 
                    type="number" 
                    value={formData.amount || 0} 
                    onChange={(e) => handleChange('amount', parseFloat(e.target.value) || 0)} 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 transition-all outline-none font-bold text-slate-700"
                    min="0" 
                    step="0.01" 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1">Status</label>
                  <select 
                    value={formData.status} 
                    onChange={(e) => handleChange('status', e.target.value)} 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 transition-all outline-none font-medium text-slate-700 appearance-none"
                  >
                    <option value={ReservationStatus.CONFIRMED}>Confirmed</option>
                    <option value={ReservationStatus.COMPLETED}>Completed</option>
                    <option value={ReservationStatus.CANCELLED}>Cancelled</option>
                    <option value="NO_SHOW">No Show</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1">Reservation Notes</label>
                <textarea 
                  value={formData.notes || ''} 
                  onChange={(e) => handleChange('notes', e.target.value)} 
                  rows={3} 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-slate-500/10 focus:border-slate-500 transition-all outline-none font-medium text-slate-700 resize-none"
                  placeholder="Any special requests or notes..."
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <PlusCircleIcon className="w-4 h-4 text-indigo-600" />
                </div>
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Additional Services</h4>
              </div>
              <div className="bg-slate-50 rounded-[2rem] p-6 border border-slate-100 space-y-3 max-h-[220px] overflow-y-auto custom-scrollbar">
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
                    <span className="text-[10px] font-black text-slate-400 uppercase bg-slate-100 px-2 py-1 rounded-lg">
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

          {/* Price Summary Card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[2rem] p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
              <CurrencyDollarIcon className="w-24 h-24" />
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-center gap-6 relative z-10">
              <div className="flex items-center gap-6">
                <div className="text-center sm:text-left">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Total Duration</p>
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <ClockIcon className="w-4 h-4 text-emerald-400" />
                    <span className="text-xl font-bold">{durationDays.toFixed(1)} <span className="text-sm font-medium text-slate-400">Days</span></span>
                  </div>
                </div>
                <div className="w-px h-10 bg-slate-700 hidden sm:block"></div>
                <div className="text-center sm:text-left">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Base Amount</p>
                  <p className="text-xl font-bold">${formData.amount?.toFixed(2)}</p>
                </div>
              </div>
              <div className="text-center sm:text-right">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-2">Estimated Total</p>
                <p className="text-5xl font-black tracking-tighter">${calculatedTotal.toFixed(2)}</p>
              </div>
            </div>
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
