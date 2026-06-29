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
  CheckCircleIcon
} from './icons';

// Modal component (unchanged)
const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} aria-hidden="true"></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4" id="modal-title">{title}</h3>
            <div className="max-h-[70vh] overflow-y-auto px-1">{children}</div>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Close
            </button>
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
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-800">
            {isAgreementView ? `Agreement • ${selectedMonth} ${selectedYear}` : `${selectedMonth} ${selectedYear}`}
          </h2>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:min-w-[250px]">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <SearchIcon className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search by booking ID or name..."
                value={localBookingIdSearch}
                onChange={handleSearchChange}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            {isAgreementView && (
              <select
                value={getAgreementStatusFilter()}
                onChange={handleAgreementStatusFilterChange}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                aria-label="Filter agreement status"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="submitted">Submitted</option>
              </select>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleExportCSV}
                disabled={filteredReservations.length === 0}
                className="px-3 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 flex items-center gap-1 justify-center disabled:opacity-50"
                title="Export current view to CSV"
              >
                <ExportIcon className="w-4 h-4" />
                <span className="hidden lg:inline">CSV</span>
              </button>
              <button
                onClick={handleExportExcel}
                disabled={filteredReservations.length === 0}
                className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 flex items-center gap-1 justify-center disabled:opacity-50"
                title="Export current view to Excel"
              >
                <ExportIcon className="w-4 h-4" />
                <span className="hidden lg:inline">Excel</span>
              </button>
            </div>
            <div className="flex gap-2">
              {(currentUser?.email === 'nadeenalnahas@gmail.com' || currentUser?.role === 'ADMIN' || currentUser?.username === 'admin') && (
                <button
                  onClick={() => onDeleteMonth(selectedYear, selectedMonth)}
                  disabled={allDisplayReservations.length === 0}
                  className="px-3 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 flex items-center gap-1 justify-center disabled:opacity-50"
                  title={`Delete all reservations for ${selectedMonth} ${selectedYear}`}
                >
                  <CloseIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Delete Month</span>
                </button>
              )}
              <button
                onClick={openAddModal}
                className="px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 flex items-center gap-1 justify-center"
              >
                <PlusCircleIcon className="w-4 h-4" />
                <span>Add Reservation</span>
              </button>
            </div>
          </div>
        </div>

        {filteredReservations.length === 0 && (
          <div className="p-8 text-center text-gray-500">No reservations match your search.</div>
        )}

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReservations.map((res) => {
            const isNew = res.isNew;
            const voucherSubmitted = res.voucherSubmitted;
            const dropOffCompleted = res.dropOffCompleted;
            const { year: reservationYear, month: reservationMonth } = getReservationPeriod(res);
            const idStyle = duplicateBookingIds.has(res.bookingId?.trim()) ? 'border-2 border-red-400' : '';
            const statusColor = getStatusColor(res.status);

            // DEBUG: Log per reservation
            const canUpgrade = hasPermission(UserPermission.ACTION_RESERVATIONS_UPGRADE);
            console.log(`Reservation ${res.id}: canUpgrade = ${canUpgrade}`);

            return (
              <div
                key={res.id}
                className={`bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 border-2 ${
                  res.status === ReservationStatus.CONFIRMED ? 'border-green-500 shadow-green-100/50' :
                  res.status === ReservationStatus.COMPLETED ? 'border-blue-500 shadow-blue-100/50' :
                  res.status === ReservationStatus.CANCELLED ? 'border-red-500 shadow-red-100/50' :
                  'border-amber-500 shadow-amber-100/50'
                } overflow-hidden group ${idStyle}`}
              >
                <div className="p-5 relative">
                  {/* Premium Background Accent */}
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${
                    res.status === ReservationStatus.CONFIRMED ? 'bg-green-500' :
                    res.status === ReservationStatus.COMPLETED ? 'bg-blue-500' :
                    res.status === ReservationStatus.CANCELLED ? 'bg-red-500' :
                    'bg-amber-500'
                  }`} />
                  {/* Decorative Background Icon for Airport */}
                  {(res.locationName?.includes('Airport') || res.locationName?.includes('AMM')) && (
                    <div className="absolute -top-6 -right-6 w-24 h-24 bg-blue-500/5 rounded-full flex items-end justify-start pl-8 pb-8 transition-transform group-hover:scale-110 duration-500">
                      <AirplaneIcon className="w-8 h-8 text-blue-500/10 transform rotate-45" />
                    </div>
                  )}

                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <div className="flex-1 min-w-0">
                      <h3 
                        className="text-lg font-black text-gray-900 truncate cursor-pointer hover:text-indigo-600 transition-colors tracking-tight" 
                        title={res.personName}
                        onClick={() => setDetailsModalReservation(res)}
                      >
                        {res.personName}
                      </h3>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5 flex items-center">
                         <HashtagIcon className="w-2.5 h-2.5 mr-1" />
                         {res.bookingId || 'UNIDENTIFIED'}
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg shadow-sm border ${statusColor}`}>
                      {res.status}
                    </span>
                  </div>

                  <div className="flex gap-2 mb-4 flex-wrap relative z-10">
                    {voucherSubmitted && (
                      <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-tighter rounded bg-green-50 text-green-700 border border-green-100">
                        ✓ Voucher Secured
                      </span>
                    )}
                    {dropOffCompleted && (
                      <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-tighter rounded bg-gray-50 text-gray-700 border border-gray-200">
                        Closed Case
                      </span>
                    )}
                    {!voucherSubmitted && !dropOffCompleted && res.status === ReservationStatus.CONFIRMED && (
                      <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-tighter rounded bg-amber-50 text-amber-700 border border-amber-100">
                        ! Pending Action
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-5 relative z-10">
                    <div className="flex items-center gap-2 group/item">
                       <div className="p-1.5 bg-gray-50 rounded-lg border border-gray-100 group-hover/item:bg-white transition-colors">
                          <PhoneIcon className="w-3 h-3 text-gray-400 group-hover/item:text-indigo-500" />
                       </div>
                       <span className="text-xs font-bold text-gray-600 truncate">{res.contactNumber || 'No contact'}</span>
                    </div>

                    {res.locationName && (
                      <div className="flex items-center gap-2 group/item">
                        {res.locationName.includes('Airport') || res.locationName.includes('AMM') ? (
                          <div className="p-1.5 bg-blue-50 rounded-lg border border-blue-100 group-hover/item:bg-white transition-colors">
                            <AirplaneIcon className="w-3 h-3 text-blue-600" />
                          </div>
                        ) : res.locationName.includes('Downtown') ? (
                          <div className="p-1.5 bg-amber-50 rounded-lg border border-amber-100 group-hover/item:bg-white transition-colors">
                            <DowntownIcon className="w-3 h-3 text-amber-600" />
                          </div>
                        ) : (
                          <div className="p-1.5 bg-gray-50 rounded-lg border border-gray-100 group-hover/item:bg-white transition-colors">
                            <MapPinIcon className="w-3 h-3 text-gray-400 group-hover/item:text-indigo-500" />
                          </div>
                        )}
                        <span className={`text-[10px] font-black uppercase tracking-tight truncate ${
                          (res.locationName.includes('Airport') || res.locationName.includes('AMM')) ? 'text-blue-700' : 
                          res.locationName.includes('Downtown') ? 'text-amber-700' : 'text-gray-500'
                        }`}>
                          {res.locationName}
                        </span>
                      </div>
                    )}

                    <div className="col-span-2 border-t border-gray-50 pt-3 mt-1 grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1 flex items-center">
                           <AirplaneLandingIcon className="w-2.5 h-2.5 mr-1 text-indigo-400" /> Pickup
                        </p>
                        <p className="text-[11px] font-black text-gray-900">{formatDate(res.startDate)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1 flex items-center">
                           <AirplaneTakeoffIcon className="w-2.5 h-2.5 mr-1 text-indigo-400" /> Return
                        </p>
                        <p className="text-[11px] font-black text-gray-900">{formatDate(res.endDate)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-end border-t border-gray-50 pt-4 relative z-10">
                    <div className="flex items-center gap-2">
                       <div className="p-2 bg-indigo-50 rounded-xl">
                          <CarIcon className="w-4 h-4 text-indigo-600" />
                       </div>
                       <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none">Vehicle</p>
                          <p className="text-sm font-black text-gray-900 truncate max-w-[120px]">{res.carModel}</p>
                       </div>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none">Total</p>
                       <p className="text-xl font-black text-gray-900 tracking-tighter">${res.amount?.toFixed(2)}</p>
                    </div>
                  </div>

                  {res.notes && (
                    <div className="text-xs text-gray-500 italic border-t pt-2 mt-2 truncate" title={res.notes}>
                      📝 {res.notes}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1 mt-3 pt-2 border-t border-gray-100">
                    {hasPermission(UserPermission.ACTION_RESERVATIONS_EDIT) && (
                      <button onClick={() => openEditModal(res)} className="text-xs px-2 py-1 border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50" title="Edit">Edit</button>
                    )}
                    {canUpgrade && (
                      <button onClick={() => openUpgradeModal(res)} className="text-xs px-2 py-1 border border-orange-300 text-orange-700 rounded hover:bg-orange-50" title="Upgrade">Upgrade</button>
                    )}
                    {canViewVoucherActions && (
                      <button onClick={() => onShowRentalVoucher(res, reservationYear, reservationMonth)} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Rental Agreement">
                        <DocumentReportIcon className="w-4 h-4" />
                      </button>
                    )}
                    {canViewVoucherActions && (
                      <button onClick={() => onShowReceipt(res)} className="p-1 text-purple-600 hover:bg-purple-50 rounded" title="Receipt">
                        <CurrencyDollarIcon className="w-4 h-4" />
                      </button>
                    )}
                    {!dropOffCompleted && res.status === ReservationStatus.CONFIRMED && hasPermission(UserPermission.ACTION_RESERVATIONS_EXTEND) && (
                      <button onClick={() => onExtend(res)} className="p-1 text-orange-600 hover:bg-orange-50 rounded" title="Extend Rental">
                        <ClockIcon className="w-4 h-4" />
                      </button>
                    )}
                    {hasPermission(UserPermission.ACTION_RESERVATIONS_EDIT) && (
                      <button onClick={() => onShare(res)} className="p-1 text-indigo-600 hover:bg-indigo-50 rounded" title="Share">
                        <ShareIcon className="w-4 h-4" />
                      </button>
                    )}
                    {!voucherSubmitted && !dropOffCompleted && hasPermission(UserPermission.ACTION_RESERVATIONS_DELETE) && (
                      <button onClick={() => onDelete(res.id, isNew, reservationYear, reservationMonth)} className="text-xs px-2 py-1 border border-red-300 text-red-700 rounded hover:bg-red-50">Delete</button>
                    )}
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
            <div className="bg-gradient-to-br from-[#004d40] via-[#00695c] to-[#00796b] -mx-6 -mt-5 px-10 py-12 text-white relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-80 h-80 -mr-20 -mt-20 bg-white/5 rounded-full blur-[100px]"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 -ml-20 -mb-20 bg-emerald-400/10 rounded-full blur-[80px]"></div>
              
              <div className="relative flex justify-between items-start">
                <div className="flex items-center gap-6">
                  <div className="bg-white/10 backdrop-blur-xl p-5 rounded-[2rem] border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] transform hover:scale-105 transition-transform duration-500">
                    <UserIcon className="w-10 h-10 text-emerald-300" />
                  </div>
                  <div>
                    <h2 className="text-4xl font-black tracking-tight drop-shadow-md bg-clip-text text-transparent bg-gradient-to-b from-white to-emerald-100">{detailsModalReservation.personName}</h2>
                    <div className="flex items-center text-emerald-100/80 mt-3 bg-white/5 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10 w-fit">
                      <PhoneIcon className="w-4 h-4 mr-2 text-emerald-400" />
                      <span className="text-sm font-bold tracking-wide">{detailsModalReservation.contactNumber || 'No contact provided'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-4">
                  <span className={`px-6 py-2 text-[11px] font-black uppercase tracking-[0.3em] rounded-full backdrop-blur-xl border-2 shadow-[0_4px_16px_rgba(0,0,0,0.2)] ${
                    detailsModalReservation.status === ReservationStatus.CONFIRMED ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/40' :
                    detailsModalReservation.status === ReservationStatus.COMPLETED ? 'bg-blue-500/30 text-blue-300 border-blue-500/40' :
                    detailsModalReservation.status === ReservationStatus.CANCELLED ? 'bg-red-500/30 text-red-300 border-red-500/40' :
                    'bg-amber-500/30 text-amber-300 border-amber-500/40'
                  }`}>
                    {detailsModalReservation.status}
                  </span>
                  {(detailsModalReservation.locationName?.includes('Airport') || detailsModalReservation.locationName?.includes('AMM')) && (
                    <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20 shadow-lg group cursor-help">
                      <AirplaneIcon className="w-5 h-5 text-emerald-400 group-hover:rotate-12 transition-transform" />
                      <span className="text-[11px] font-black uppercase tracking-[0.1em]">VIP Airport Service</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-2">
              {/* Customer & Vehicle Information */}
              <div className="space-y-6">
                <section>
                  <h4 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.15em] mb-4 flex items-center">
                    <IdentificationIcon className="w-4 h-4 mr-2" />
                    Reservation Identity
                  </h4>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 flex justify-between items-center border-b border-gray-50">
                      <span className="text-gray-400 font-medium">Booking ID</span>
                      <span className="font-mono font-bold text-gray-900 bg-gray-50 px-2 py-1 rounded-md">{detailsModalReservation.bookingId}</span>
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
                  <h4 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.15em] mb-4 flex items-center">
                    <CarIcon className="w-4 h-4 mr-2" />
                    Vehicle Selection
                  </h4>
                  <div className="bg-indigo-50/30 rounded-2xl border border-indigo-100 p-5 flex items-center gap-5">
                    <div className="bg-white p-3 rounded-xl shadow-md border border-indigo-50">
                      <CarIcon className="w-8 h-8 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Assigned Model</p>
                      <p className="text-lg font-black text-gray-900 leading-tight mt-0.5">{detailsModalReservation.carModel}</p>
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

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={modalMode === 'add' ? 'Add Reservation' : 'Edit Reservation'}>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-700">Renter *</label><input type="text" value={formData.personName || ''} onChange={(e) => handleChange('personName', e.target.value)} className="mt-1 w-full px-2 py-1 border rounded" /></div>
            <div><label className="block text-xs font-medium text-gray-700">Contact</label><input type="text" value={formData.contactNumber || ''} onChange={(e) => handleChange('contactNumber', e.target.value)} className="mt-1 w-full px-2 py-1 border rounded" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-700">Booking ID *</label><input type="text" value={formData.bookingId || ''} onChange={(e) => handleChange('bookingId', e.target.value)} className="mt-1 w-full px-2 py-1 border rounded" /></div>
            <div><label className="block text-xs font-medium text-gray-700">Booking Date</label><input type="date" value={formData.bookingDate ? formData.bookingDate.split('T')[0] : ''} onChange={(e) => handleChange('bookingDate', e.target.value)} className="mt-1 w-full px-2 py-1 border rounded" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-700">Source</label><select value={formData.source || ''} onChange={(e) => handleChange('source', e.target.value)} className="mt-1 w-full px-2 py-1 border rounded"><option value="">Select</option>{rentalSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-gray-700">Car Model *</label><input type="text" value={formData.carModel || ''} onChange={(e) => handleChange('carModel', e.target.value)} className="mt-1 w-full px-2 py-1 border rounded" placeholder="e.g. Toyota Corolla" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-700">Pickup *</label><input type="datetime-local" value={formData.startDate || ''} onChange={(e) => handleChange('startDate', e.target.value)} className="mt-1 w-full px-2 py-1 border rounded" /></div>
            <div><label className="block text-xs font-medium text-gray-700">Return *</label><input type="datetime-local" value={formData.endDate || ''} onChange={(e) => handleChange('endDate', e.target.value)} className="mt-1 w-full px-2 py-1 border rounded" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-700">Amount ($)</label><input type="number" value={formData.amount || 0} onChange={(e) => handleChange('amount', parseFloat(e.target.value) || 0)} className="mt-1 w-full px-2 py-1 border rounded" min="0" step="0.01" /></div>
            <div><label className="block text-xs font-medium text-gray-700">Location</label><select value={formData.locationName || ''} onChange={(e) => handleChange('locationName', e.target.value)} className="mt-1 w-full px-2 py-1 border rounded"><option value="">Select</option>{rentalLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          </div>
          <div><label className="block text-xs font-medium text-gray-700">Status</label><select value={formData.status} onChange={(e) => handleChange('status', e.target.value)} className="mt-1 w-full px-2 py-1 border rounded"><option value={ReservationStatus.CONFIRMED}>Confirmed</option><option value={ReservationStatus.COMPLETED}>Completed</option><option value={ReservationStatus.CANCELLED}>Cancelled</option><option value="NO_SHOW">No Show</option></select></div>
          <div><label className="block text-xs font-medium text-gray-700">Notes</label><textarea value={formData.notes || ''} onChange={(e) => handleChange('notes', e.target.value)} rows={2} className="mt-1 w-full px-2 py-1 border rounded" /></div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Extras</label>
            <div className="border rounded p-2 max-h-32 overflow-y-auto">
              {availableExtras.map(extra => (
                <label key={extra.id} className="flex items-center space-x-2 py-1">
                  <input type="checkbox" checked={(formData.selectedExtras || []).includes(extra.id)} onChange={() => handleExtraToggle(extra.id)} className="rounded" />
                  <span className="text-xs">{extra.name} (${extra.pricePerDay}/day)</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-xs text-gray-600">Duration: {durationDays.toFixed(1)} days</span>
            <span className="text-sm font-semibold">Total: ${calculatedTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setIsModalOpen(false)} className="px-3 py-1 border rounded text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">Save</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} title="Upgrade Vehicle">
        {upgradeReservation && (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-gray-600">Reservation: {upgradeReservation.personName} – {upgradeReservation.carModel}</p>
            <div><label className="block text-xs font-medium text-gray-700">Select New Car</label><select value={selectedCarId} onChange={(e) => setSelectedCarId(e.target.value)} className="mt-1 w-full px-2 py-1 border rounded"><option value="">Choose a car</option>{fleet.map(car => (<option key={car.id} value={car.id}>{car.modelName} ({car.licensePlate})</option>))}</select></div>
            <div className="flex items-center gap-2"><input type="checkbox" id="customRate" checked={useCustomRate} onChange={(e) => setUseCustomRate(e.target.checked)} className="rounded" /><label htmlFor="customRate" className="text-xs">Use custom daily rate</label></div>
            {useCustomRate && (<div><label className="block text-xs font-medium text-gray-700">Custom Rate ($/day)</label><input type="number" value={customRate || ''} onChange={(e) => setCustomRate(parseFloat(e.target.value) || 0)} className="mt-1 w-full px-2 py-1 border rounded" min="0" step="0.01" /></div>)}
            <div className="flex justify-end gap-2 pt-2"><button onClick={() => setIsUpgradeModalOpen(false)} className="px-3 py-1 border rounded text-gray-700 hover:bg-gray-50">Cancel</button><button onClick={handleUpgradeSave} disabled={!selectedCarId} className="px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50">Confirm Upgrade</button></div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default ReservationTable;
