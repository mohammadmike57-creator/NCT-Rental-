import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  ExportIcon
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
            <button
              onClick={openAddModal}
              className="px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 flex items-center gap-1 justify-center"
            >
              <PlusCircleIcon className="w-4 h-4" />
              <span>Add Reservation</span>
            </button>
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
                className={`bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border-l-4 ${
                  res.status === ReservationStatus.CONFIRMED ? 'border-l-green-500' :
                  res.status === ReservationStatus.COMPLETED ? 'border-l-blue-500' :
                  res.status === ReservationStatus.CANCELLED ? 'border-l-red-500' :
                  'border-l-yellow-500'
                } ${idStyle}`}
              >
                <div className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 
                      className="text-base font-bold text-gray-900 truncate cursor-pointer hover:text-blue-600" 
                      title={res.personName}
                      onClick={() => setDetailsModalReservation(res)}
                    >
                      {res.personName}
                    </h3>
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${statusColor}`}>
                      {res.status}
                    </span>
                  </div>

                  <div className="flex gap-2 mb-2 flex-wrap">
                    {voucherSubmitted && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
                        Voucher Submitted
                      </span>
                    )}
                    {dropOffCompleted && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                        Closed
                      </span>
                    )}
                    {!voucherSubmitted && !dropOffCompleted && res.status === ReservationStatus.CONFIRMED && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                        Voucher Pending
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 mb-3">
                    <div className="flex items-center text-xs text-gray-600">
                      <CalendarIcon className="w-3 h-3 mr-1 flex-shrink-0" />
                      <span className={duplicateBookingIds.has(res.bookingId?.trim()) ? 'text-red-600 font-bold' : ''}>
                        {res.bookingId || 'No ID'}
                      </span>
                    </div>
                    <div className="flex items-center text-xs text-gray-600">
                      <PhoneIcon className="w-3 h-3 mr-1 flex-shrink-0" />
                      <span>{res.contactNumber || 'No contact'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div>
                      <span className="text-gray-500 block">Booking</span>
                      <span className="font-medium">{formatDateOnly(res.bookingDate || res.startDate)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Pickup</span>
                      <span className="font-medium">{formatDate(res.startDate)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Return</span>
                      <span className="font-medium">{formatDate(res.endDate)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Duration</span>
                      <span className="font-medium">{getDuration(res.startDate, res.endDate)} days</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mb-3">
                    <div className="text-sm font-medium text-gray-700 truncate max-w-[60%]" title={res.carModel}>
                      {res.carModel}
                    </div>
                    <div className="text-base font-bold text-gray-900">${res.amount?.toFixed(2)}</div>
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

      <Modal isOpen={!!detailsModalReservation} onClose={() => setDetailsModalReservation(null)} title="Reservation Details">
        {detailsModalReservation && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-gray-500">Renter</p><p className="font-medium">{detailsModalReservation.personName}</p></div>
              <div><p className="text-gray-500">Contact</p><p className="font-medium">{detailsModalReservation.contactNumber || '—'}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-gray-500">Booking ID</p><p className="font-medium">{detailsModalReservation.bookingId}</p></div>
              <div><p className="text-gray-500">Source</p><p className="font-medium">{getSourceName(detailsModalReservation.source || '')}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-gray-500">Car Model</p><p className="font-medium">{detailsModalReservation.carModel}</p></div>
              <div><p className="text-gray-500">Location</p><p className="font-medium">{detailsModalReservation.locationName || rentalLocations.find(l => l.id === detailsModalReservation.locationName)?.name || '—'}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-gray-500">Booking Date</p><p className="font-medium">{formatDateOnly(detailsModalReservation.bookingDate || detailsModalReservation.startDate)}</p></div>
              <div><p className="text-gray-500">Pickup</p><p className="font-medium">{formatDate(detailsModalReservation.startDate)}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-gray-500">Return</p><p className="font-medium">{formatDate(detailsModalReservation.endDate)}</p></div>
              <div><p className="text-gray-500">Duration</p><p className="font-medium">{getDuration(detailsModalReservation.startDate, detailsModalReservation.endDate)} days</p></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-gray-500">Amount</p><p className="font-medium">${detailsModalReservation.amount?.toFixed(2)}</p></div>
              <div><p className="text-gray-500">Status</p><p className="font-medium">{detailsModalReservation.status}</p></div>
            </div>
            <div><p className="text-gray-500">Notes</p><p className="font-medium whitespace-pre-wrap">{detailsModalReservation.notes || '—'}</p></div>
            <div>
              <p className="text-gray-500">Extras</p>
              {detailsModalReservation.selectedExtras && detailsModalReservation.selectedExtras.length > 0 ? (
                <ul className="list-disc list-inside">
                  {detailsModalReservation.selectedExtras.map((extraId, idx) => {
                    const extra = availableExtras.find(e => e.id === extraId);
                    return <li key={idx}>{extra ? extra.name : extraId}</li>;
                  })}
                </ul>
              ) : (
                <p className="font-medium">None</p>
              )}
            </div>
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
