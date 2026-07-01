import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { AppData, Reservation, RentalSource, Fleet, User, ReservationStatus, RentalLocation, AvailableExtra, CompanyDetails, UserPermission } from '../types';
import { MONTHS } from '../constants';
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
  onUpgrade: (reservation: Reservation, newCarId: string, customRate?: number) => void;
  onAssignCar?: (reservation: Reservation) => void;
  onAddExtras?: (reservation: Reservation) => void;
  currentUser: User | null;
  filters: any;
  setFilters: any;
  isDesktopView: boolean;
  companyDetails: CompanyDetails;
  availableExtras: AvailableExtra[];
  isAgreementView?: boolean;
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
  const [selectedCarId, setSelectedCarId] = useState('');
  const [customRate, setCustomRate] = useState<number | null>(null);
  const [useCustomRate, setUseCustomRate] = useState(false);
  const [localBookingIdSearch, setLocalBookingIdSearch] = useState('');

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
      setSelectedCarId('');
      setCustomRate(null);
      setUseCustomRate(false);
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
    setSelectedCarId('');
    setCustomRate(null);
    setUseCustomRate(false);
    setIsUpgradeModalOpen(true);
  };

  const handleUpgradeSave = () => {
    if (!upgradeReservation || !selectedCarId) return;
    const selectedCar = fleet.find(c => c.id === selectedCarId);
    if (!selectedCar) return;
    onUpgrade(upgradeReservation, selectedCarId, useCustomRate ? customRate || undefined : undefined);
    setIsUpgradeModalOpen(false);
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

  // DEBUG: Log upgrade permission for each reservation
  const upgradePermission = hasPermission(UserPermission.ACTION_RESERVATIONS_UPGRADE);
  const canViewVoucherActions = isAgreementView || hasPermission(UserPermission.ACTION_RESERVATIONS_VIEW_VOUCHER);
  console.log('Upgrade permission for user:', upgradePermission, currentUser?.email);

  return (
    <>
      <div className="bg-white rounded-[3rem] shadow-xl border border-slate-200 overflow-hidden mb-12">
        <div className="p-10 bg-white border-b border-slate-100">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-10">
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">
              {isAgreementView ? (
                <span className="flex items-center gap-6">
                  <div className="p-5 bg-indigo-50 rounded-[2rem] shadow-lg shadow-indigo-100 border border-indigo-100">
                    <DocumentReportIcon className="w-10 h-10 text-indigo-600" />
                  </div>
                  Agreement • {selectedMonth} {selectedYear}
                </span>
              ) : (
                <span className="flex items-center gap-6">
                   <div className="p-5 bg-emerald-50 rounded-[2rem] shadow-lg shadow-emerald-100 border border-emerald-100">
                    <CalendarIcon className="w-10 h-10 text-emerald-600" />
                  </div>
                  {selectedMonth} {selectedYear}
                </span>
              )}
            </h2>
            
            <div className="flex flex-wrap items-center justify-center lg:justify-end gap-4 w-full lg:w-auto">
              <div className="relative flex-1 sm:flex-none sm:min-w-[320px]">
                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by ID or name..."
                  value={localBookingIdSearch}
                  onChange={handleSearchChange}
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm font-medium text-slate-700"
                />
              </div>

              {isAgreementView && (
                <div className="relative">
                  <select
                    value={getAgreementStatusFilter()}
                    onChange={handleAgreementStatusFilterChange}
                    className="pl-5 pr-12 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm font-bold text-slate-700 appearance-none cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="submitted">Submitted</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <ChevronDownIcon className="w-4 h-4" />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleExportCSV}
                  disabled={filteredReservations.length === 0}
                  className="p-3.5 bg-white border border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50 group hover:border-indigo-200"
                  title="Export to CSV"
                >
                  <ExportIcon className="w-5 h-5 group-hover:text-indigo-600 transition-colors" />
                </button>
                <button
                  onClick={handleExportExcel}
                  disabled={filteredReservations.length === 0}
                  className="p-3.5 bg-white border border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50 group hover:border-emerald-200"
                  title="Export to Excel"
                >
                  <PdfIcon className="w-5 h-5 group-hover:text-emerald-600 transition-colors" />
                </button>
              </div>

              {(currentUser?.email === 'nadeenalnahas@gmail.com' || currentUser?.role === 'ADMIN' || currentUser?.username === 'admin') && (
                <button
                  onClick={() => onDeleteMonth(selectedYear, selectedMonth)}
                  disabled={allDisplayReservations.length === 0}
                  className="p-3.5 bg-white border border-rose-100 text-rose-500 rounded-2xl hover:bg-rose-50 transition-all shadow-sm disabled:opacity-50 group"
                  title={`Delete all reservations for ${selectedMonth} ${selectedYear}`}
                >
                  <CloseIcon className="w-5 h-5" />
                </button>
              )}

              <button
                onClick={openAddModal}
                className="px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl hover:shadow-xl hover:shadow-indigo-200 transition-all hover:-translate-y-0.5 active:scale-95 flex items-center gap-3 shadow-lg shadow-indigo-100"
              >
                <PlusCircleIcon className="w-5 h-5" />
                <span>New Reservation</span>
              </button>
            </div>
          </div>
        </div>

        {filteredReservations.length === 0 && (
          <div className="p-8 text-center text-gray-500">No reservations match your search.</div>
        )}

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
          {filteredReservations.map((res) => {
            const isNew = res.isNew;
            const voucherSubmitted = res.voucherSubmitted;
            const dropOffCompleted = res.dropOffCompleted;
            const { year: reservationYear, month: reservationMonth } = getReservationPeriod(res);
            const isDuplicate = duplicateBookingIds.has(res.bookingId?.trim());
            const statusColor = getStatusColor(res.status);
            const canUpgrade = hasPermission(UserPermission.ACTION_RESERVATIONS_UPGRADE);

            return (
              <div
                key={res.id}
                className={`group relative bg-white rounded-2xl transition-all duration-500 hover:-translate-y-2 flex flex-col h-full overflow-hidden border ${
                  isDuplicate ? 'border-red-300 ring-2 ring-red-50' : 'border-slate-200 shadow-md'
                } hover:shadow-xl hover:shadow-indigo-100/40`}
              >
                {/* Status-based Accent line */}
                <div className={`h-2 w-full ${
                  res.status === ReservationStatus.CONFIRMED ? 'bg-emerald-500' :
                  res.status === ReservationStatus.COMPLETED ? 'bg-indigo-500' :
                  res.status === ReservationStatus.CANCELLED ? 'bg-rose-500' :
                  'bg-amber-500'
                }`} />

                <div className="p-6 flex-1 flex flex-col relative">
                  {/* Decorative Background for Airport */}
                  {(res.locationName?.includes('Airport') || res.locationName?.includes('AMM')) && (
                    <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-500 pointer-events-none">
                      <AirplaneIcon className="w-32 h-32 transform rotate-12" />
                    </div>
                  )}

                  <div className="flex justify-between items-start mb-5">
                    <div className="flex-1 min-w-0">
                      <h3 
                        className="text-xl font-black text-slate-900 truncate cursor-pointer hover:text-indigo-600 transition-colors tracking-tight leading-tight mb-1" 
                        title={res.personName}
                        onClick={() => setDetailsModalReservation(res)}
                      >
                        {res.personName}
                      </h3>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="flex items-center text-[11px] text-slate-500 font-black uppercase tracking-[0.2em] bg-slate-100 px-3 py-1 rounded-xl border border-slate-200">
                           <HashtagIcon className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                           {res.bookingId || 'NO-ID'}
                        </span>
                        {res.source && (
                          <span className="flex items-center text-[11px] text-indigo-600 font-black uppercase tracking-[0.2em] bg-indigo-50 px-3 py-1 rounded-xl border border-indigo-100">
                             <GlobeAltIcon className="w-3.5 h-3.5 mr-1.5" />
                             {res.source}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border shadow-sm backdrop-blur-sm transition-all duration-500 group-hover:scale-105 ${statusColor}`}>
                      {res.status}
                    </div>
                  </div>

                  {/* Badges row */}
                  <div className="flex gap-2 mb-5 flex-wrap">
                    {voucherSubmitted && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500 text-white shadow-lg shadow-emerald-200/40 border border-emerald-400">
                        <CheckCircleIcon className="w-3.5 h-3.5" /> Agreement Signed
                      </span>
                    )}
                    {dropOffCompleted && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-900 text-white shadow-lg shadow-slate-300 border border-slate-700">
                        <CheckCircleIcon className="w-3.5 h-3.5" /> Closed Case
                      </span>
                    )}
                    {!voucherSubmitted && !dropOffCompleted && res.status === ReservationStatus.CONFIRMED && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-lg shadow-orange-200/40 border border-amber-300">
                        <ShieldExclamationIcon className="w-3.5 h-3.5" /> Action Required
                      </span>
                    )}
                  </div>

                  <div className="space-y-4">
                    {/* Vehicle & Contact Section */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200/50 group-hover:bg-white group-hover:border-indigo-100 group-hover:shadow-md transition-all duration-500">
                        <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 text-indigo-600">
                           <CarIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none mb-1">Vehicle Type</p>
                          <p className="text-sm font-black text-slate-800 truncate">{res.carModel || '—'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200/50 group-hover:bg-white group-hover:border-indigo-100 group-hover:shadow-md transition-all duration-500">
                        <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 text-emerald-600">
                           <PhoneIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none mb-1">Contact Info</p>
                          <p className="text-sm font-black text-slate-800 truncate">{res.contactNumber || '—'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Timeline-style Dates & Location */}
                    <div className="p-5 rounded-2xl bg-slate-900 text-white shadow-xl shadow-slate-300/50 relative overflow-hidden group-hover:bg-indigo-950 transition-all duration-500">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/5 to-transparent rounded-full blur-[40px] -mr-16 -mt-16" />
                      
                      <div className="flex items-center gap-3 mb-5 relative z-10">
                        <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md border border-white/5">
                          {res.locationName?.includes('Airport') || res.locationName?.includes('AMM') ? (
                            <AirplaneIcon className="w-4 h-4 text-sky-300" />
                          ) : (
                            <MapPinIcon className="w-4 h-4 text-indigo-300" />
                          )}
                        </div>
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-100 truncate">{res.locationName || 'Location N/A'}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-6 relative z-10">
                        <div className="relative pl-4 border-l-2 border-emerald-500/40">
                          <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                             Pickup
                          </p>
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-bold tracking-tight">{formatDateOnly(res.startDate)}</p>
                            <p className="text-sm font-light text-emerald-50/70">{res.startDate?.split('T')[1]?.substring(0, 5) || '00:00'}</p>
                          </div>
                        </div>
                        <div className="relative pl-4 border-l-2 border-rose-500/40">
                          <p className="text-[9px] text-rose-400 font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                             Return
                          </p>
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-bold tracking-tight">{formatDateOnly(res.endDate)}</p>
                            <p className="text-sm font-light text-rose-50/70">{res.endDate?.split('T')[1]?.substring(0, 5) || '00:00'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Section */}
                <div className="px-6 py-5 bg-slate-50 border-t border-slate-200 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                       <div className="p-2.5 bg-white rounded-2xl shadow-sm border border-slate-100 text-indigo-700">
                          <CurrencyDollarIcon className="w-5 h-5" />
                       </div>
                       <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none mb-1">Total Amount</p>
                          <p className="text-2xl font-black text-slate-900 tracking-tight">${res.amount?.toFixed(2)}</p>
                       </div>
                    </div>
                    
                    <div className="flex gap-2">
                      {canViewVoucherActions && (
                        <button onClick={() => onShowRentalVoucher(res, reservationYear, reservationMonth)} className="p-2.5 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all shadow-sm bg-white border border-slate-200 active:scale-95" title="Rental Agreement">
                          <DocumentReportIcon className="w-5 h-5" />
                        </button>
                      )}
                      {canViewVoucherActions && (
                        <button onClick={() => onShowReceipt(res)} className="p-2.5 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl transition-all shadow-sm bg-white border border-slate-200 active:scale-95" title="Receipt">
                          <CurrencyDollarIcon className="w-5 h-5" />
                        </button>
                      )}
                      {!dropOffCompleted && res.status === ReservationStatus.CONFIRMED && hasPermission(UserPermission.ACTION_RESERVATIONS_EXTEND) && (
                        <button onClick={() => onExtend(res)} className="p-2.5 text-amber-600 hover:bg-amber-600 hover:text-white rounded-xl transition-all shadow-sm bg-white border border-slate-200 active:scale-95" title="Extend Rental">
                          <ClockIcon className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {res.notes && (
                    <div className="text-[10px] text-slate-500 italic bg-white/50 p-2 rounded-xl border border-slate-100 truncate" title={res.notes}>
                      <span className="font-bold not-italic mr-1">Notes:</span> {res.notes}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                    {hasPermission(UserPermission.ACTION_RESERVATIONS_EDIT) && (
                      <button 
                        onClick={() => openEditModal(res)} 
                        className="flex-1 py-2.5 px-4 rounded-2xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                      >
                        <EditIcon className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    )}
                    {canUpgrade && (
                      <button 
                        onClick={() => openUpgradeModal(res)} 
                        className="flex-1 py-2.5 px-4 rounded-2xl border border-orange-100 bg-orange-50 text-[10px] font-black uppercase tracking-widest text-orange-600 hover:bg-orange-600 hover:text-white hover:border-orange-600 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                      >
                        <CarIcon className="w-3.5 h-3.5" />
                        Upgrade
                      </button>
                    )}
                    <div className="flex gap-1.5 ml-1">
                      {hasPermission(UserPermission.ACTION_RESERVATIONS_EDIT) && (
                        <button onClick={() => onShare(res)} className="p-2.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all border border-transparent hover:border-indigo-100 active:scale-95" title="Share">
                          <ShareIcon className="w-5 h-5" />
                        </button>
                      )}
                      {!voucherSubmitted && !dropOffCompleted && hasPermission(UserPermission.ACTION_RESERVATIONS_DELETE) && (
                        <button onClick={() => onDelete(res.id, isNew, reservationYear, reservationMonth)} className="p-2.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-2xl transition-all border border-transparent hover:border-rose-100 active:scale-95" title="Delete">
                          <CloseIcon className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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

      <Modal 
        isOpen={isUpgradeModalOpen} 
        onClose={() => setIsUpgradeModalOpen(false)} 
        title="Upgrade Vehicle"
        footer={
          <div className="flex gap-3 w-full sm:w-auto">
            <button 
              onClick={() => setIsUpgradeModalOpen(false)} 
              className="flex-1 sm:flex-none px-8 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleUpgradeSave} 
              disabled={!selectedCarId}
              className="flex-1 sm:flex-none px-8 py-3 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 text-white font-bold text-sm shadow-lg shadow-orange-200 hover:shadow-orange-300 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
            >
              Confirm Upgrade
            </button>
          </div>
        }
      >
        {upgradeReservation && (
          <div className="space-y-6">
            <div className="bg-orange-50 rounded-2xl p-4 border border-orange-100 flex items-start gap-4">
              <div className="p-2 bg-white rounded-xl shadow-sm">
                <CarIcon className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1">Current Vehicle</p>
                <p className="text-sm font-bold text-orange-900">{upgradeReservation.carModel}</p>
                <p className="text-xs text-orange-700 font-medium">Renter: {upgradeReservation.personName}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1">Select New Vehicle</label>
                <div className="relative group">
                  <CarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                  <select 
                    value={selectedCarId} 
                    onChange={(e) => setSelectedCarId(e.target.value)} 
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 transition-all outline-none font-medium text-slate-700 appearance-none"
                  >
                    <option value="">Choose a car from fleet</option>
                    {fleet.map(car => (
                      <option key={car.id} value={car.id}>{car.modelName} ({car.licensePlate})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-4">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                    useCustomRate ? 'bg-orange-600 border-orange-600' : 'bg-white border-slate-200'
                  }`}>
                    {useCustomRate && <CheckCircleIcon className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <span className="text-xs font-bold text-slate-700">Apply custom daily rate for this upgrade</span>
                  <input 
                    type="checkbox" 
                    className="hidden"
                    checked={useCustomRate} 
                    onChange={(e) => setUseCustomRate(e.target.checked)} 
                  />
                </label>

                {useCustomRate && (
                  <div className="space-y-1.5 animate-modal-enter">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1">Custom Daily Rate ($)</label>
                    <div className="relative">
                      <CurrencyDollarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-500" />
                      <input 
                        type="number" 
                        value={customRate || ''} 
                        onChange={(e) => setCustomRate(parseFloat(e.target.value) || 0)} 
                        className="w-full pl-11 pr-4 py-3 bg-white border border-orange-100 rounded-xl focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 transition-all outline-none font-bold text-slate-700"
                        placeholder="0.00"
                        min="0" 
                        step="0.01" 
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default ReservationTable;
