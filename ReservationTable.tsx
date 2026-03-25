import React, { useState, useMemo } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { AppData, Reservation, ReservationExtra, ReservationStatus, Fleet, RentalSource, User, ReservationFilters, RentalLocation, PaymentType, CompanyDetails, AvailableExtra } from '../types';
import { PlusIcon, TrashIcon, ExportIcon, ClearIcon, PdfIcon, DocumentTextIcon, EditIcon, SaveIcon, CancelIcon, SearchIcon, PlusCircleIcon, CloseIcon, ReceiptIcon, CalendarPlusIcon, ShareIcon, ChevronRightIcon, CarIcon, CalendarIcon, LocationIcon, ClockIcon, CheckCircleIcon } from './icons';
import ConfirmationDialog from './ConfirmationDialog';
import SecurityKeyModal from './SecurityKeyModal';
import { NCT_LOGO_B64 } from '../constants';

type DisplayReservation = Reservation & { originalYear?: number; originalMonth?: string };

const calculateDays = (start: string, end: string): number | '...' => {
    if (!start || !end) return '...';
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
        return '...';
    }

    const diffInMs = endDate.getTime() - startDate.getTime();

    // Any rental period less than or equal to 24 hours is considered one day.
    const oneDayInMs = 24 * 60 * 60 * 1000;
    if (diffInMs <= oneDayInMs) {
        return 1;
    }

    // Grace period of 2 hours
    const gracePeriodInMs = 2 * 60 * 60 * 1000;

    const fullDays = Math.floor(diffInMs / oneDayInMs);
    const remainingMs = diffInMs % oneDayInMs;

    if (remainingMs === 0) {
        return fullDays;
    }
    
    // If the remainder is 2 hours or more, count as an extra day
    if (remainingMs >= gracePeriodInMs) {
        return fullDays + 1;
    }
    
    // Otherwise, it's within the grace period
    return fullDays;
};


const calculateExtrasTotal = (extras: ReservationExtra[] | undefined, rentalDays: number): number => {
    if (!extras) return 0;
    return extras.reduce((sum, extra) => {
        if (extra.isComplementary) return sum;
        return sum + (extra.dailyPrice * rentalDays);
    }, 0);
};

const getReservationAmounts = (reservation: Reservation | undefined) => {
    if (!reservation) {
        return { baseAmount: 0, extrasTotal: 0, totalAmount: 0, rentalDays: 0 };
    }
    const rentalDaysResult = calculateDays(reservation.startDate, reservation.endDate);
    const rentalDays = typeof rentalDaysResult === 'number' ? rentalDaysResult : 1;

    const extrasTotal = calculateExtrasTotal(reservation.extras, rentalDays);

    const baseAmount = reservation.baseAmount ?? ((reservation.amount || 0) - extrasTotal);
    
    // Clean up potential floating point inaccuracies from subtraction
    const cleanBaseAmount = parseFloat(baseAmount.toFixed(2));

    const totalAmount = cleanBaseAmount + extrasTotal;

    return { baseAmount: cleanBaseAmount, extrasTotal, totalAmount, rentalDays };
};

interface ManageExtrasModalProps {
    reservation: Reservation;
    onSave: (extras: ReservationExtra[]) => void;
    onClose: () => void;
    availableExtras: AvailableExtra[];
}

const ManageExtrasModal: React.FC<ManageExtrasModalProps> = ({ reservation, onSave, onClose, availableExtras }) => {
    const [extras, setExtras] = useState<ReservationExtra[]>(reservation.extras || []);
    const [newExtraName, setNewExtraName] = useState('');
    
    const rentalDaysResult = useMemo(() => calculateDays(reservation.startDate, reservation.endDate), [reservation.startDate, reservation.endDate]);
    const rentalDays = typeof rentalDaysResult === 'number' ? rentalDaysResult : 1;

    const handleAddExtra = () => {
        if (!newExtraName) return;
        const existingExtra = extras.find(e => e.name === newExtraName);
        if (existingExtra) {
            alert(`"${newExtraName}" has already been added.`);
            return;
        }
        const extraConfig = availableExtras.find(e => e.name === newExtraName);
        const newExtra: ReservationExtra = {
            name: newExtraName,
            dailyPrice: extraConfig?.defaultDailyPrice || 0,
            isComplementary: false,
        };
        setExtras(prev => [...prev, newExtra]);
        setNewExtraName('');
    };
    
    const handleUpdateExtra = (index: number, field: keyof ReservationExtra, value: any) => {
        setExtras(prev => prev.map((extra, i) => i === index ? { ...extra, [field]: value } : extra));
    };

    const handleDeleteExtra = (index: number) => {
        setExtras(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = () => {
        onSave(extras);
    };
    
    const availableOptions = availableExtras.filter(opt => !extras.some(e => e.name === opt.name));

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
                <header className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-xl font-semibold">Manage Extras for {reservation.personName}</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200"><CloseIcon /></button>
                </header>
                <div className="p-6 overflow-y-auto space-y-4">
                    {/* Add new extra form */}
                    <div className="p-4 bg-gray-50 rounded-lg border space-y-3">
                        <h3 className="font-semibold text-gray-700">Add New Extra</h3>
                        <div className="flex gap-2">
                           <select
                                value={newExtraName}
                                onChange={e => setNewExtraName(e.target.value)}
                                className="w-full p-2 border rounded-md"
                            >
                                <option value="">Select an extra...</option>
                                {availableOptions.map(opt => <option key={opt.id} value={opt.name}>{opt.name}</option>)}
                            </select>
                             <button onClick={handleAddExtra} disabled={!newExtraName} className="px-4 py-2 bg-secondary text-white rounded-md hover:bg-primary disabled:bg-gray-400">Add</button>
                        </div>
                    </div>
                    {/* List of current extras */}
                    <div>
                        <h3 className="font-semibold text-gray-700 mb-2">Current Extras for {rentalDays} day(s)</h3>
                        {extras.length > 0 ? (
                            <ul className="space-y-2">
                                {extras.map((extra, index) => (
                                    <li key={index} className="grid grid-cols-4 gap-3 items-center bg-white p-2 border rounded-md">
                                        <p className="font-medium col-span-1">{extra.name}</p>
                                        <div className="col-span-1">
                                            <label className="text-xs">Daily Price</label>
                                            <input
                                                type="number"
                                                value={extra.dailyPrice || ''}
                                                onChange={e => handleUpdateExtra(index, 'dailyPrice', parseFloat(e.target.value) || 0)}
                                                disabled={extra.isComplementary}
                                                className="w-full p-1 border rounded-md text-sm disabled:bg-gray-200"
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <div className="col-span-1 flex items-center justify-center">
                                            <input
                                                type="checkbox"
                                                id={`comp-${index}`}
                                                checked={extra.isComplementary}
                                                onChange={e => handleUpdateExtra(index, 'isComplementary', e.target.checked)}
                                                className="h-4 w-4 rounded"
                                            />
                                            <label htmlFor={`comp-${index}`} className="ml-2 text-sm">Free</label>
                                        </div>
                                        <div className="col-span-1 flex items-center justify-end">
                                            <p className="text-sm font-semibold mr-4">
                                                {extra.isComplementary ? '$0.00' : `$${(extra.dailyPrice * rentalDays).toFixed(2)}`}
                                            </p>
                                            <button onClick={() => handleDeleteExtra(index)} className="text-red-500 hover:text-red-700"><TrashIcon /></button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-center text-gray-500 py-4">No extras added yet.</p>
                        )}
                    </div>
                </div>
                <footer className="p-4 bg-gray-50 border-t flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-primary text-white rounded-md hover:bg-secondary">Save Changes</button>
                </footer>
            </div>
        </div>
    );
};


interface ReservationTableProps {
  allData: AppData;
  newReservations: Reservation[];
  onUpdate: (reservation: Reservation, year: number, month: string) => void;
  onAdd: () => void;
  onDelete: (id: string, isNew?: boolean, year?: number, month?: string) => void;
  onShowVoucher: (reservation: Reservation, year: number, month: string) => void;
  onShowRentalVoucher: (reservation: Reservation) => void;
  onShowReceipt: (reservation: Reservation) => void;
  onExtend: (reservation: DisplayReservation) => void;
  onShare: (reservation: Reservation) => void;
  onSaveNew: (reservation: Reservation) => void;
  selectedYear: number;
  selectedMonth: string;
  rentalSources: RentalSource[];
  rentalLocations: RentalLocation[];
  carModels: string[];
  duplicateBookingIds: Set<string>;
  fleet: Fleet;
  currentUser: User | null;
  filters: ReservationFilters;
  setFilters: React.Dispatch<React.SetStateAction<ReservationFilters>>;
  isDesktopView: boolean;
  onRequirePaymentConfirmation: (reservation: Reservation, year: number, month: string) => void;
  companyDetails: CompanyDetails;
  availableExtras: AvailableExtra[];
}

const ReadOnlyCell: React.FC<{ value: React.ReactNode }> = ({ value }) => (
    <div className="px-1 py-1 text-sm text-gray-700 truncate">{value || '-'}</div>
);

const ExpandedInfo: React.FC<{ reservation: DisplayReservation }> = ({ reservation }) => {
    const days = calculateDays(reservation.startDate, reservation.endDate);
    const { baseAmount, extrasTotal } = getReservationAmounts(reservation);
    const agreementStatus = (() => {
        if (reservation.status !== ReservationStatus.CONFIRMED) return 'N/A';
        if (reservation.dropOffCompleted) return 'Closed';
        if (reservation.voucherSubmitted) return 'Open';
        
        const today = new Date();
        today.setHours(0,0,0,0);
        if (reservation.startDate) {
            try {
                const startDate = new Date(reservation.startDate);
                const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                if (startDay > today) {
                    return 'Upcoming';
                }
            } catch(e) {
                return 'N/A'; // Invalid date format
            }
        }
        
        return 'Pending Pickup';
    })();
    return (
        <div className="bg-slate-50/50 p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-4">
                <h4 className="font-bold text-gray-700">Key Details</h4>
                <InfoItem label="Booking Date" value={reservation.bookingDate} />
                <InfoItem label="Rental Period" value={`${reservation.startDate?.replace('T', ' ')} to ${reservation.endDate?.replace('T', ' ')} (${days} days)`} />
                <InfoItem label="Location" value={reservation.locationName} />
                <InfoItem label="Agreement Status" value={agreementStatus} />
            </div>
            <div className="space-y-4">
                <h4 className="font-bold text-gray-700">Financials & Mileage</h4>
                <InfoItem label="Base Amount" value={`$${baseAmount.toFixed(2)}`} />
                <InfoItem label="Extras Total" value={`$${extrasTotal.toFixed(2)}`} />
                <InfoItem label="Security Deposit" value={`$${(reservation.securityDeposit || 0).toFixed(2)}`} />
                <InfoItem label="Excess Amount" value={`$${(reservation.excess || 0).toFixed(2)}`} />
                {reservation.pickupKmOut && <InfoItem label="Pickup KM" value={reservation.pickupKmOut.toLocaleString()} />}
                {reservation.dropOffKmIn && <InfoItem label="Return KM" value={reservation.dropOffKmIn.toLocaleString()} />}
                {reservation.dropOffKmIn && reservation.pickupKmOut && reservation.dropOffKmIn > reservation.pickupKmOut && (
                    <InfoItem label="Total KM Driven" value={`${(reservation.dropOffKmIn - reservation.pickupKmOut).toLocaleString()} KM`} />
                )}
            </div>
            <div className="space-y-4">
                <h4 className="font-bold text-gray-700">Notes & History</h4>
                <div>
                    <p className="text-xs text-gray-500">Notes</p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{reservation.notes || 'No notes.'}</p>
                </div>
                 <div>
                    <p className="text-xs text-gray-500">History</p>
                    {reservation.createdBy && <p className="text-sm text-gray-800">Added by: <strong>{reservation.createdBy}</strong></p>}
                    {reservation.lastEditedBy && <p className="text-sm text-gray-800">Last edited by: <strong>{reservation.lastEditedBy}</strong></p>}
                    {(!reservation.createdBy && !reservation.lastEditedBy) && <p className="text-sm text-gray-500">No history.</p>}
                </div>
            </div>
        </div>
    );
};

const InfoItem: React.FC<{label: string, value: string | number | undefined}> = ({label, value}) => (
    <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-800">{value || 'N/A'}</p>
    </div>
);


const ReservationTable: React.FC<ReservationTableProps> = ({ allData, newReservations, onUpdate, onAdd, onDelete, onShowVoucher, onShowRentalVoucher, onShowReceipt, onExtend, onShare, onSaveNew, selectedYear, selectedMonth, rentalSources, rentalLocations, carModels, duplicateBookingIds, fleet, currentUser, filters, setFilters, isDesktopView, onRequirePaymentConfirmation, companyDetails, availableExtras }) => {
  const [reservationToDelete, setReservationToDelete] = useState<{id: string, isNew?: boolean, year?: number, month?: string} | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalReservation, setOriginalReservation] = useState<DisplayReservation | null>(null);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'edit' | 'delete'; payload: any } | null>(null);
  const [reservationForExtras, setReservationForExtras] = useState<DisplayReservation | null>(null);
  const [isExtrasModalOpen, setIsExtrasModalOpen] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);


  const { sourceFilter, carModelFilter, statusFilter, durationFilter, bookingIdSearch, dateFilter } = filters;

  const setFilterValue = (key: keyof ReservationFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const isGlobalSearch = bookingIdSearch.trim() !== '' || dateFilter !== '';

  const reservationsToDisplay = useMemo((): DisplayReservation[] => {
    let sourceData: DisplayReservation[];

    if (isGlobalSearch) {
      // Global search across all data
      const allReservations: DisplayReservation[] = [];
      for (const year in allData) {
        for (const month in allData[year]) {
          allData[year][month].forEach(res => {
            allReservations.push({ ...res, originalYear: parseInt(year), originalMonth: month });
          });
        }
      }
      const allNewReservations = newReservations.map(r => ({...r, isNew: true}));
      sourceData = [...allReservations, ...allNewReservations];
    } else {
      // Show data for selected month and year
      const monthReservations = (allData[selectedYear]?.[selectedMonth] || []).map(res => ({
        ...res,
        originalYear: selectedYear,
        originalMonth: selectedMonth,
      }));
      const newReservationsWithFlag = newReservations.map(r => ({...r, isNew: true}));
      sourceData = [...monthReservations, ...newReservationsWithFlag];
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    return sourceData.filter(res => {
      const sourceMatch = !sourceFilter || res.source === sourceFilter;
      const modelMatch = !carModelFilter || res.carModel === carModelFilter;
      const statusMatch = !statusFilter || res.status === statusFilter;
      const bookingIdMatch = !bookingIdSearch.trim() || (res.bookingId && res.bookingId.toLowerCase().includes(bookingIdSearch.toLowerCase().trim()));
      
      const durationMatch = !durationFilter || (() => {
        const days = calculateDays(res.startDate, res.endDate);
        if (typeof days !== 'number') return false;

        if (durationFilter.includes('+')) {
            const minDays = parseInt(durationFilter.replace('+', ''), 10);
            return days >= minDays;
        }

        if (durationFilter.includes('-')) {
            const [min, max] = durationFilter.split('-').map(Number);
            return days >= min && days <= max;
        }

        return false;
      })();

      const dateFilterMatch = !dateFilter || (() => {
        if (!res.startDate || !res.endDate) return false;
        try {
            const startDate = new Date(res.startDate);
            const endDate = new Date(res.endDate);

            // Normalize to the start of the day
            const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
            const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

            if (isNaN(startDay.getTime()) || isNaN(endDay.getTime())) return false;

            switch (dateFilter) {
                case 'today_pickup':
                    return startDay.getTime() === today.getTime() && res.status === ReservationStatus.CONFIRMED;
                case 'today_return':
                    return endDay.getTime() === today.getTime() && res.status === ReservationStatus.CONFIRMED;
                case 'open_agreements':
                    return res.status === ReservationStatus.CONFIRMED && res.voucherSubmitted === true && res.dropOffCompleted !== true;
                case 'upcoming_7_days':
                     return res.status === ReservationStatus.CONFIRMED && startDay > today && startDay <= nextWeek;
                case 'upcoming_returns_7_days':
                     return res.status === ReservationStatus.CONFIRMED && endDay > today && endDay <= nextWeek;
                default:
                    return true;
            }
        } catch (e) {
            console.error('Error parsing date for filter:', res.id, e);
            return false;
        }
      })();
      
      return sourceMatch && modelMatch && statusMatch && bookingIdMatch && durationMatch && dateFilterMatch;
    });
  }, [allData, newReservations, selectedYear, selectedMonth, sourceFilter, carModelFilter, statusFilter, durationFilter, bookingIdSearch, dateFilter, isGlobalSearch]);


  const handleInputChange = (id: string, field: keyof Reservation, value: any) => {
    const reservation = reservationsToDisplay.find(r => r.id === id);
    if (reservation) {
        const year = reservation.originalYear || selectedYear;
        const month = reservation.originalMonth || selectedMonth;

        let updatedReservation = { ...reservation, [field]: value };
        
        if (field === 'amount' || field === 'startDate' || field === 'endDate' || field === 'extras') {
            const rentalDaysResult = calculateDays(updatedReservation.startDate, updatedReservation.endDate);
            const rentalDays = typeof rentalDaysResult === 'number' ? rentalDaysResult : 1;
            const extrasTotal = calculateExtrasTotal(updatedReservation.extras, rentalDays);
            
            let baseAmount;
            if (field === 'amount') {
                baseAmount = parseFloat(value) || 0;
            } else {
                 baseAmount = updatedReservation.baseAmount ?? ((updatedReservation.amount || 0) - calculateExtrasTotal(reservation.extras, getReservationAmounts(reservation).rentalDays));
            }
            
            updatedReservation.baseAmount = parseFloat(baseAmount.toFixed(2));
            updatedReservation.amount = updatedReservation.baseAmount + extrasTotal;

        } else if (field === 'carModel' && value) {
            const selectedCar = fleet.find(v => v.modelName === value);
            updatedReservation.securityDeposit = selectedCar ? selectedCar.securityDeposit : 0;
            updatedReservation.excess = selectedCar ? selectedCar.excess : 0;
            updatedReservation.sippCode = selectedCar?.sippCode || '';
        }
        
        onUpdate(updatedReservation, year, month);
    }
};
  
  const handleEditClick = (reservation: DisplayReservation) => {
    setPendingAction({ type: 'edit', payload: reservation });
    setIsKeyModalOpen(true);
  };

  const handleDeleteClick = (id: string, isNew?: boolean) => {
    if (isNew) {
        setReservationToDelete({ id, isNew });
        return;
    }
    const reservation = reservationsToDisplay.find(r => r.id === id);
    if (!reservation) return;

    const year = reservation.originalYear;
    const month = reservation.originalMonth;
    
    setPendingAction({ type: 'delete', payload: { id, isNew, year, month } });
    setIsKeyModalOpen(true);
  };
  
    const handleManageExtras = (reservation: DisplayReservation) => {
        setReservationForExtras(reservation);
        setIsExtrasModalOpen(true);
    };
    
    const handleVoucherClick = (reservation: DisplayReservation) => {
        const sourceInfo = rentalSources.find(s => s.name === reservation.source);
        const isPayOnArrival = sourceInfo?.paymentType === PaymentType.PAY_ON_ARRIVAL;
        const isPrepaid = sourceInfo?.paymentType === PaymentType.PREPAID;
        const { extrasTotal } = getReservationAmounts(reservation);
        const hasUnpaidExtension = reservation.unpaidExtensionAmount && reservation.unpaidExtensionAmount > 0;

        const isPaymentDueAtPickup = isPayOnArrival || (isPrepaid && extrasTotal > 0) || hasUnpaidExtension;

        const year = reservation.originalYear || selectedYear;
        const month = reservation.originalMonth || selectedMonth;
        
        const requireApproval = companyDetails.requirePaymentApproval ?? true;

        if (isPaymentDueAtPickup && !reservation.pickupPaymentCollected) {
            if (requireApproval) {
                onRequirePaymentConfirmation(reservation, year, month);
            } else {
                // Bypass approval: mark as collected and show voucher
                const updatedReservation = { ...reservation, pickupPaymentCollected: true, paymentConfirmationPending: false };
                onUpdate(updatedReservation, year, month);
                onShowVoucher(updatedReservation, year, month);
            }
        } else {
            onShowVoucher(reservation, year, month);
        }
    };

    const handleSaveExtras = (newExtras: ReservationExtra[]) => {
        if (reservationForExtras) {
            const year = reservationForExtras.originalYear || selectedYear;
            const month = reservationForExtras.originalMonth || selectedMonth;
            handleInputChange(reservationForExtras.id, 'extras', newExtras);
        }
        setIsExtrasModalOpen(false);
        setReservationForExtras(null);
    };


  const handleKeySuccess = () => {
    if (!pendingAction) return;

    if (pendingAction.type === 'edit') {
      setOriginalReservation(pendingAction.payload);
      setEditingId(pendingAction.payload.id);
    } else if (pendingAction.type === 'delete') {
      setReservationToDelete(pendingAction.payload);
    }
    
    setIsKeyModalOpen(false);
    setPendingAction(null);
  };

  const handleSaveEdit = (reservation: DisplayReservation) => {
    if (reservation.isNew) {
      onSaveNew(reservation);
    } else {
        const year = reservation.originalYear || selectedYear;
        const month = reservation.originalMonth || selectedMonth;
        const { originalYear, originalMonth, ...reservationToSave } = reservation;
        onUpdate(reservationToSave, year, month);
    }
    setEditingId(null);
    setOriginalReservation(null);
  };

  const handleCancelEdit = () => {
    if (originalReservation) {
      const year = originalReservation.originalYear || selectedYear;
      const month = originalReservation.originalMonth || selectedMonth;
      onUpdate(originalReservation, year, month);
    }
    setEditingId(null);
    setOriginalReservation(null);
  };

  const handleStatusChange = (id: string, newStatus: ReservationStatus) => {
    const reservation = reservationsToDisplay.find(r => r.id === id);
    if (reservation) {
      const year = reservation.originalYear || selectedYear;
      const month = reservation.originalMonth || selectedMonth;
      const statusToSet = reservation.status === newStatus ? ReservationStatus.PENDING : newStatus;
      onUpdate({ ...reservation, status: statusToSet }, year, month);
    }
  };
  
  const handleConfirmDelete = () => {
    if (reservationToDelete) {
      const { id, isNew, year, month } = reservationToDelete;
      onDelete(id, isNew, year, month);
    }
    setReservationToDelete(null);
  };

  const handleClearFilters = () => {
    setFilters({
        sourceFilter: '', carModelFilter: '', statusFilter: '',
        durationFilter: '', bookingIdSearch: '', dateFilter: '',
    });
  };

  const handleExportCSV = () => {
    const dataToExport = reservationsToDisplay.filter(r => !r.isNew);
    if (!dataToExport.length) {
      alert('No saved data to export for the current filter selection.');
      return;
    }

    const headers = [
      'Person Name', 'Booking ID', 'Source', 'Location', 'Booking Date', 'Start Date', 'End Date', 'Number of Days',
      'Car Model', 'Notes', 'Status', 'Amount'
    ];

    const escapeCSV = (str: any): string => {
        const stringified = String(str ?? '');
        if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
            return `"${stringified.replace(/"/g, '""')}"`;
        }
        return stringified;
    };
    
    const rows = dataToExport.map(res => [
        escapeCSV(res.personName),
        escapeCSV(res.bookingId),
        escapeCSV(res.source),
        escapeCSV(res.locationName),
        escapeCSV(res.bookingDate),
        escapeCSV(res.startDate),
        escapeCSV(res.endDate),
        escapeCSV(calculateDays(res.startDate, res.endDate)),
        escapeCSV(res.carModel),
        escapeCSV(res.notes),
        escapeCSV(res.status),
        escapeCSV(res.amount)
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const filename = isGlobalSearch ? 'reservation_search_results.csv' : `reservations_${selectedYear}_${selectedMonth}.csv`;
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    const dataToExport = reservationsToDisplay.filter(r => !r.isNew);
    if (!dataToExport.length) {
      alert('No saved data to export for the current filter selection.');
      return;
    }
    
    const doc = new jsPDF({ orientation: 'landscape' });
    
    const tableHead = [['Person Name', 'Booking ID', 'Source', 'Location', 'Booking Date', 'Start Date', 'End Date', 'Days', 'Car Model', 'Notes', 'Status', 'Amount']];
    const tableBody = dataToExport.map(res => [
      res.personName,
      res.bookingId,
      res.source,
      res.locationName || 'N/A',
      res.bookingDate,
      res.startDate,
      res.endDate,
      calculateDays(res.startDate, res.endDate),
      res.carModel,
      res.notes,
      res.status,
      `$${(res.amount || 0).toFixed(2)}`
    ]);
    
    const logoWidth = 45;
    const logoHeight = 45; // Assuming square logo
    doc.addImage(NCT_LOGO_B64, 'PNG', 14, 15, logoWidth, logoHeight);

    const title = isGlobalSearch ? 'Reservation Search Results' : `Monthly Reservations - ${selectedMonth} ${selectedYear}`;
    const filename = isGlobalSearch ? 'reservation_search_results.pdf' : `reservations_${selectedYear}_${selectedMonth}.pdf`;
    
    doc.setFontSize(18);
    doc.text(title, doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });
    doc.setFontSize(11);
    doc.setTextColor(100);
    
    let reportDateY = 15 + logoHeight;
    if (reportDateY < 28) reportDateY = 28; // Ensure it doesn't overlap with centered title

    doc.text(`Report generated on: ${new Date().toLocaleDateString()}`, 14, reportDateY);
    
    (doc as any).autoTable({
      startY: reportDateY + 7,
      head: tableHead,
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [30, 64, 175] }, // primary color
    });

    doc.save(filename);
  };

  const desktopHeaders = [
    { name: "Rental Person Name", className: "sticky left-0 z-10" },
    { name: "Contact #" },
    { name: "Booking ID" }, { name: "Rental Source" },
    { name: "Location", className: "hidden md:table-cell" },
    { name: "Booking Date", className: "hidden lg:table-cell" },
    { name: "Start Date" }, { name: "End Date" },
    { name: "Days", className: "hidden xl:table-cell" },
    { name: "Agreement Status", className: "hidden xl:table-cell" },
    { name: "Car Model" }, { name: "SIPP", className: "hidden xl:table-cell" }, { name: "Extras" },
    { name: "Notes", className: "hidden lg:table-cell" },
    { name: "Confirm" }, { name: "Cancel" }, { name: "No Show" },
    { name: "Amount" }, { name: "Agreement" }, { name: "Receipt" },
    { name: "History", className: "hidden lg:table-cell" },
    { name: "Actions", className: "sticky right-0 z-10" }
  ];

  const MobileEditableField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-0.5">{label}</label>
        {children}
      </div>
  );

  return (
    <div>
      <div className="sticky top-0 z-30 p-4 bg-gray-50/90 backdrop-blur-sm rounded-t-lg border-b border-gray-200 flex flex-wrap items-center gap-4 justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <h4 className="text-sm font-semibold text-gray-600 mr-2">Filters:</h4>
           {dateFilter && (
            <div className="flex items-center gap-2 p-2 bg-blue-100 text-blue-800 rounded-md text-sm font-medium">
                <span className="capitalize">Showing: <strong>{dateFilter.replace(/_/g, ' ')}</strong></span>
                <button onClick={() => setFilterValue('dateFilter', '')} className="font-bold text-lg leading-none hover:text-blue-900" aria-label="Clear date filter">&times;</button>
            </div>
          )}
           <div className="flex-grow sm:flex-grow-0">
            <select value={sourceFilter} onChange={e => setFilterValue('sourceFilter', e.target.value)} className="w-full sm:w-40 p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary">
              <option value="">All Sources</option>
              {rentalSources.map(source => <option key={source.id} value={source.name}>{source.name}</option>)}
            </select>
          </div>
          <div className="flex-grow sm:flex-grow-0">
            <select value={carModelFilter} onChange={e => setFilterValue('carModelFilter', e.target.value)} className="w-full sm:w-40 p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary">
              <option value="">All Car Models</option>
              {carModels.map(model => <option key={model} value={model}>{model}</option>)}
            </select>
          </div>
          <div className="flex-grow sm:flex-grow-0">
            <select value={statusFilter} onChange={e => setFilterValue('statusFilter', e.target.value as ReservationStatus | '')} className="w-full sm:w-40 p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary">
              <option value="">All Statuses</option>
              <option value={ReservationStatus.PENDING}>Pending</option>
              <option value={ReservationStatus.CONFIRMED}>Confirmed</option>
              <option value={ReservationStatus.CANCELLED}>Cancelled</option>
              <option value={ReservationStatus.NO_SHOW}>No Show</option>
            </select>
          </div>
          <div className="flex-grow sm:flex-grow-0">
            <select value={durationFilter} onChange={e => setFilterValue('durationFilter', e.target.value)} className="w-full sm:w-40 p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary">
              <option value="">All Durations</option>
              <option value="1-3">1-3 Days</option>
              <option value="4-7">4-7 Days</option>
              <option value="8-14">8-14 Days</option>
              <option value="15+">15+ Days</option>
            </select>
          </div>
           <div className="relative flex-grow sm:flex-grow-0">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 pointer-events-none">
                    <SearchIcon />
                </span>
                <input
                    type="text"
                    value={bookingIdSearch}
                    onChange={e => setFilterValue('bookingIdSearch', e.target.value)}
                    placeholder="Search all by Booking ID..."
                    className="w-full sm:w-56 p-2 pl-10 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
                />
            </div>
          {(sourceFilter || carModelFilter || statusFilter || durationFilter || bookingIdSearch || dateFilter) && (
              <button onClick={handleClearFilters} className="flex items-center gap-1.5 px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary text-sm font-medium">
                <ClearIcon />
                Clear Filters
              </button>
          )}
        </div>
      </div>
      
      {isDesktopView ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>{desktopHeaders.map(h => <th key={h.name} scope="col" className={`px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap ${h.className || ''} ${h.className?.includes('sticky') ? 'bg-gray-50' : ''}`}>{h.name}</th>)}</tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reservationsToDisplay.map((res, index) => {
                 const isDuplicate = res.bookingId ? duplicateBookingIds.has(res.bookingId.trim()) : false;
                 const isEditing = editingId === res.id;
                 const isNew = !!res.isNew;
                 const isEditable = isEditing || isNew;
                 const { baseAmount } = getReservationAmounts(res);
                 const sourceInfo = rentalSources.find(s => s.name === res.source);
                 const isPayOnArrival = sourceInfo?.paymentType === PaymentType.PAY_ON_ARRIVAL;
                 const { extrasTotal } = getReservationAmounts(res);
                 const hasUnpaidExtension = res.unpaidExtensionAmount && res.unpaidExtensionAmount > 0;
                 const isPaymentDue = isPayOnArrival || (sourceInfo?.paymentType === PaymentType.PREPAID && extrasTotal > 0) || hasUnpaidExtension;

                 const getRowClass = () => {
                  let baseClass = 'transition-colors duration-150';
                  if (isEditing) return `${baseClass} bg-yellow-100`;
                  if (isNew) return `${baseClass} bg-blue-100`;
                  if (isDuplicate) return `${baseClass} bg-red-200`;
                  
                  switch (res.status) {
                      case ReservationStatus.CONFIRMED:
                          return `${baseClass} bg-green-100`;
                      case ReservationStatus.CANCELLED:
                          return `${baseClass} bg-red-100`;
                      case ReservationStatus.NO_SHOW:
                          return `${baseClass} bg-yellow-100`;
                      default: // PENDING
                          if (isGlobalSearch && !isNew) return `${baseClass} bg-purple-50`;
                          return `${baseClass} ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`;
                  }
                 };
                 
                  const agreementStatus = (() => {
                      if (res.status !== ReservationStatus.CONFIRMED) return 'N/A';
                      if (res.dropOffCompleted) return 'Closed';
                      if (res.voucherSubmitted) return 'Open';
                      
                      const today = new Date();
                      today.setHours(0,0,0,0);
              
                      if (res.startDate) {
                          try {
                              const startDate = new Date(res.startDate);
                              const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                              if (startDay > today) {
                                  return 'Upcoming';
                              }
                          } catch(e) {
                              return 'N/A'; // Invalid date format
                          }
                      }
                      
                      return 'Pending Pickup';
                  })();

                const rowClasses = getRowClass();
                 
                return (
                <tr key={res.id} className={rowClasses}>
                  <td className={`px-3 py-2 whitespace-nowrap sticky left-0 z-10 ${rowClasses}`}>
                      {isEditable ? (
                          <input type="text" value={res.personName} onChange={e => handleInputChange(res.id, 'personName', e.target.value)} className="w-40 p-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"/>
                      ) : (
                          <button
                              onClick={(e) => { e.stopPropagation(); if(!res.isNew) onShowRentalVoucher(res); }}
                              disabled={res.isNew}
                              className="text-blue-600 hover:underline font-semibold text-left truncate w-40 text-sm disabled:text-gray-700 disabled:no-underline disabled:font-normal disabled:cursor-default"
                              title={!res.isNew ? `View rental voucher for ${res.personName}` : 'Save reservation to view details'}
                          >
                              {res.personName || '-'}
                          </button>
                      )}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap ${rowClasses}`}>
                    {isEditable ? <input type="text" value={res.contactNumber || ''} onChange={e => handleInputChange(res.id, 'contactNumber', e.target.value)} className="w-32 p-1 border rounded-md text-sm border-gray-300 focus:ring-secondary focus:border-secondary" placeholder="Contact number" /> : <ReadOnlyCell value={res.contactNumber} />}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap ${rowClasses}`}>
                    {isEditable ? <input type="text" value={res.bookingId} onChange={e => handleInputChange(res.id, 'bookingId', e.target.value)} className={`w-32 p-1 border rounded-md text-sm ${isDuplicate ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:ring-secondary focus:border-secondary'}`} /> : <ReadOnlyCell value={res.bookingId} />}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap ${rowClasses}`}>
                    {isEditable ? <select value={res.source} onChange={e => handleInputChange(res.id, 'source', e.target.value)} className="w-32 p-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"><option value="">Select...</option>{rentalSources.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</select> : <ReadOnlyCell value={res.source} />}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap hidden md:table-cell ${rowClasses}`}>
                    {isEditable ? (
                      <select value={res.locationName || ''} onChange={e => handleInputChange(res.id, 'locationName', e.target.value)} className="w-40 p-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary">
                        <option value="">Select...</option>
                        {rentalLocations.map(loc => <option key={loc.id} value={loc.name}>{loc.name}</option>)}
                      </select>
                    ) : <ReadOnlyCell value={res.locationName} />}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap hidden lg:table-cell ${rowClasses}`}>
                    {isEditable ? <input type="date" value={res.bookingDate} onChange={e => handleInputChange(res.id, 'bookingDate', e.target.value)} className="w-36 p-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"/> : <ReadOnlyCell value={res.bookingDate} />}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap ${rowClasses}`}>
                    {isEditable ? <input type="datetime-local" value={res.startDate} onChange={e => handleInputChange(res.id, 'startDate', e.target.value)} className="w-48 p-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"/> : <ReadOnlyCell value={res.startDate?.replace('T', ' ')} />}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap ${rowClasses}`}>
                    {isEditable ? <input type="datetime-local" value={res.endDate} onChange={e => handleInputChange(res.id, 'endDate', e.target.value)} className="w-48 p-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"/> : <ReadOnlyCell value={res.endDate?.replace('T', ' ')} />}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap text-center hidden xl:table-cell ${rowClasses}`}><span className="text-sm font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded">{calculateDays(res.startDate, res.endDate)}</span></td>
                  <td className={`px-3 py-2 whitespace-nowrap text-center hidden xl:table-cell ${rowClasses}`}>
                      {agreementStatus === 'Open' && <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Open</span>}
                      {agreementStatus === 'Closed' && <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Closed</span>}
                      {agreementStatus === 'Upcoming' && <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">Upcoming</span>}
                      {agreementStatus === 'Pending Pickup' && <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Pending Pickup</span>}
                      {agreementStatus === 'N/A' && <span className="text-gray-400">-</span>}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap ${rowClasses}`}>
                    {isEditable ? <select value={res.carModel} onChange={e => handleInputChange(res.id, 'carModel', e.target.value)} className="w-40 p-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"><option value="">Select...</option>{carModels.map(m => <option key={m} value={m}>{m}</option>)}</select> : <ReadOnlyCell value={res.carModel} />}
                  </td>
                   <td className={`px-3 py-2 whitespace-nowrap hidden xl:table-cell ${rowClasses}`}>
                    <ReadOnlyCell value={res.sippCode} />
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap text-center ${rowClasses}`}>
                      <button onClick={(e) => { e.stopPropagation(); handleManageExtras(res); }} className="p-1 rounded-md text-secondary hover:bg-blue-100" aria-label={`Manage extras for ${res.personName}`}><PlusCircleIcon /></button>
                  </td>
                  <td className={`px-3 py-2 hidden lg:table-cell ${rowClasses}`} style={{minWidth: '200px'}}>
                    {isEditable ? <textarea value={res.notes} onChange={e => handleInputChange(res.id, 'notes', e.target.value)} rows={1} className="w-full p-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"/> : <div className="text-sm text-gray-700 whitespace-pre-wrap max-w-xs truncate">{res.notes || '-'}</div>}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap text-center ${rowClasses}`}><input type="checkbox" checked={res.status === ReservationStatus.CONFIRMED} onChange={() => handleStatusChange(res.id, ReservationStatus.CONFIRMED)} className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 disabled:opacity-50" aria-label={`Confirm reservation for ${res.personName}`} disabled={!isEditable} /></td>
                  <td className={`px-3 py-2 whitespace-nowrap text-center ${rowClasses}`}><input type="checkbox" checked={res.status === ReservationStatus.CANCELLED} onChange={() => handleStatusChange(res.id, ReservationStatus.CANCELLED)} className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-50" aria-label={`Cancel reservation for ${res.personName}`} disabled={!isEditable} /></td>
                  <td className={`px-3 py-2 whitespace-nowrap text-center ${rowClasses}`}><input type="checkbox" checked={res.status === ReservationStatus.NO_SHOW} onChange={() => handleStatusChange(res.id, ReservationStatus.NO_SHOW)} className="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500 disabled:opacity-50" aria-label={`Mark reservation for ${res.personName} as no-show`} disabled={!isEditable} /></td>
                  <td className={`px-3 py-2 whitespace-nowrap ${rowClasses}`}>
                    {isEditable ? <input type="number" step="0.01" value={baseAmount || ''} placeholder="0.00" onChange={e => handleInputChange(res.id, 'amount', e.target.value)} className="w-24 p-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"/> : <ReadOnlyCell value={`$${(res.amount || 0).toFixed(2)}`} />}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap text-center ${rowClasses}`}>
                    {!isNew && (
                        <div className="relative flex items-center justify-center">
                            <button onClick={(e) => { e.stopPropagation(); handleVoucherClick(res); }} className="p-1.5 rounded-md text-blue-600 hover:bg-blue-100" aria-label={`Manage rental agreement for ${res.personName}`}>
                                <DocumentTextIcon />
                            </button>
                            {isPaymentDue && res.paymentConfirmationPending && !res.pickupPaymentCollected && (
                                <span className="absolute -top-1 -right-1" title="Payment approval pending">
                                    <ClockIcon className="h-4 w-4 text-yellow-500" />
                                </span>
                            )}
                            {isPaymentDue && res.pickupPaymentCollected && (
                                <span className="absolute -top-1 -right-1" title="Payment confirmed">
                                    <CheckCircleIcon className="h-4 w-4 text-green-500" />
                                </span>
                            )}
                        </div>
                    )}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap text-center ${rowClasses}`}>
                    {res.voucherSubmitted && <button onClick={(e) => { e.stopPropagation(); onShowReceipt(res); }} className="p-1.5 rounded-md text-green-600 hover:bg-green-100" aria-label={`View receipt for ${res.personName}`}><ReceiptIcon /></button>}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap hidden lg:table-cell ${rowClasses}`}>
                      <div className="text-xs text-gray-500 max-w-[150px]">
                      {res.createdBy && (<p className="truncate" title={`Added by ${res.createdBy}`}>Added by: <strong>{res.createdBy}</strong></p>)}
                      {res.lastEditedBy && (<p className="truncate" title={`Edited by ${res.lastEditedBy}`}>Edited by: <strong>{res.lastEditedBy}</strong></p>)}
                      {(!res.createdBy && !res.lastEditedBy) && (<span>-</span>)}
                      </div>
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap text-center sticky right-0 z-10 ${rowClasses}`}>
                      <div className="flex items-center justify-center gap-2">
                          {isEditable ? (
                              <>
                                  <button onClick={(e) => { e.stopPropagation(); handleSaveEdit(res); }} className="p-1.5 text-green-600 hover:bg-green-100 rounded-md" aria-label={`Save changes for ${res.personName}`}><SaveIcon /></button>
                                  {isNew ? <button onClick={(e) => { e.stopPropagation(); onDelete(res.id, true); }} className="p-1.5 text-red-500 hover:bg-red-100 rounded-md" aria-label={`Delete new reservation`}><TrashIcon /></button> : <button onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md" aria-label="Cancel editing"><CancelIcon /></button>}
                              </>
                          ) : (
                              <>
                                  {res.status === ReservationStatus.CONFIRMED && !res.isNew && (
                                      <button onClick={(e) => { e.stopPropagation(); onExtend(res); }} className="p-1.5 text-teal-500 hover:bg-teal-100 rounded-md" aria-label={`Extend rental for ${res.personName}`}><CalendarPlusIcon /></button>
                                  )}
                                  <button onClick={(e) => { e.stopPropagation(); onShare(res); }} className="p-1.5 text-purple-500 hover:bg-purple-100 rounded-md" aria-label={`Share reservation details for ${res.personName}`}><ShareIcon /></button>
                                  <button onClick={(e) => { e.stopPropagation(); handleEditClick(res); }} className="p-1.5 text-blue-500 hover:bg-blue-100 rounded-md" aria-label={`Edit reservation for ${res.personName}`}><EditIcon /></button>
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(res.id, res.isNew); }} className="p-1.5 text-red-500 hover:bg-red-100 rounded-md" aria-label={`Delete reservation for ${res.personName}`}><TrashIcon /></button>
                              </>
                          )}
                      </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          {reservationsToDisplay.map((res) => {
            const isDuplicate = res.bookingId ? duplicateBookingIds.has(res.bookingId.trim()) : false;
            const isEditing = editingId === res.id;
            const isNew = !!res.isNew;
            const isEditable = isEditing || isNew;
            const isExpanded = expandedRowId === res.id;
            const { baseAmount } = getReservationAmounts(res);
            const sourceInfo = rentalSources.find(s => s.name === res.source);
            const isPayOnArrival = sourceInfo?.paymentType === PaymentType.PAY_ON_ARRIVAL;
            const { extrasTotal } = getReservationAmounts(res);
            const hasUnpaidExtension = res.unpaidExtensionAmount && res.unpaidExtensionAmount > 0;
            const isPaymentDue = isPayOnArrival || (sourceInfo?.paymentType === PaymentType.PREPAID && extrasTotal > 0) || hasUnpaidExtension;

            const statusColors = {
              [ReservationStatus.CONFIRMED]: { border: 'border-green-500', bg: 'bg-green-100', text: 'text-green-800' },
              [ReservationStatus.CANCELLED]: { border: 'border-red-500', bg: 'bg-red-100', text: 'text-red-800' },
              [ReservationStatus.NO_SHOW]: { border: 'border-yellow-500', bg: 'bg-yellow-100', text: 'text-yellow-800' },
              [ReservationStatus.PENDING]: { border: 'border-gray-400', bg: 'bg-gray-100', text: 'text-gray-800' },
            };
            const color = statusColors[res.status] || statusColors[ReservationStatus.PENDING];
            const finalBorder = isNew ? 'border-blue-500' : isDuplicate ? 'border-red-500' : color.border;

            return (
              <div key={res.id} className={`bg-white rounded-lg shadow-md border-l-4 ${finalBorder} transition-shadow`}>
                {isEditable ? (
                    <div className="p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <MobileEditableField label="Renter Name">
                                <input type="text" value={res.personName} onChange={e => handleInputChange(res.id, 'personName', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm" placeholder="Full Name" />
                            </MobileEditableField>
                             <MobileEditableField label="Contact Number">
                                <input type="tel" value={res.contactNumber || ''} onChange={e => handleInputChange(res.id, 'contactNumber', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm" placeholder="e.g., +962..." />
                            </MobileEditableField>
                        </div>
                         <div className="grid grid-cols-2 gap-3">
                            <MobileEditableField label="Booking ID">
                                <input type="text" value={res.bookingId} onChange={e => handleInputChange(res.id, 'bookingId', e.target.value)} className={`w-full p-2 border ${isDuplicate ? 'border-red-500 bg-red-50' : 'border-gray-300'} rounded-md text-sm`} placeholder="e.g., AB-12345" />
                            </MobileEditableField>
                            <MobileEditableField label="Source">
                                <select value={res.source} onChange={e => handleInputChange(res.id, 'source', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm">
                                    <option value="">Select...</option>
                                    {rentalSources.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                </select>
                            </MobileEditableField>
                        </div>
                        <MobileEditableField label="Car Model">
                            <select value={res.carModel} onChange={e => handleInputChange(res.id, 'carModel', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm">
                                <option value="">Select...</option>
                                {carModels.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </MobileEditableField>
                        <MobileEditableField label="Location">
                            <select value={res.locationName || ''} onChange={e => handleInputChange(res.id, 'locationName', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm">
                                <option value="">Select...</option>
                                {rentalLocations.map(loc => <option key={loc.id} value={loc.name}>{loc.name}</option>)}
                            </select>
                        </MobileEditableField>
                        <div className="grid grid-cols-2 gap-3">
                            <MobileEditableField label="Start Date">
                                <input type="datetime-local" value={res.startDate} onChange={e => handleInputChange(res.id, 'startDate', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm" />
                            </MobileEditableField>
                            <MobileEditableField label="End Date">
                                <input type="datetime-local" value={res.endDate} onChange={e => handleInputChange(res.id, 'endDate', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm" />
                            </MobileEditableField>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <MobileEditableField label="Booking Date">
                                <input type="date" value={res.bookingDate} onChange={e => handleInputChange(res.id, 'bookingDate', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm" />
                            </MobileEditableField>
                            <MobileEditableField label="Base Amount ($)">
                                <input type="number" step="0.01" value={baseAmount || ''} placeholder="0.00" onChange={e => handleInputChange(res.id, 'amount', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm" />
                            </MobileEditableField>
                        </div>
                        <MobileEditableField label="Notes">
                            <textarea value={res.notes} onChange={e => handleInputChange(res.id, 'notes', e.target.value)} rows={2} className="w-full p-2 border border-gray-300 rounded-md text-sm" placeholder="Any special requests or notes..."/>
                        </MobileEditableField>
                        <div className="pt-2">
                            <button 
                                type="button"
                                onClick={() => handleManageExtras(res)}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors text-sm font-medium"
                            >
                                <PlusCircleIcon />
                                Manage Extras ({res.extras?.length || 0})
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="p-4">
                        <div className="flex justify-between items-start gap-2">
                            <div className="flex-grow">
                            <button
                                onClick={(e) => { e.stopPropagation(); if(!isNew) onShowRentalVoucher(res); }}
                                disabled={isNew}
                                className="text-lg font-bold text-slate-800 text-left hover:text-blue-600 disabled:hover:text-slate-800 disabled:cursor-default"
                                title={!isNew ? `View rental voucher for ${res.personName}` : 'Save reservation to view details'}
                            >
                                {res.personName || <span className="text-gray-400">New Renter</span>}
                            </button>
                            <p className="text-sm text-slate-500">Booking ID: {res.bookingId || <span className="text-gray-400">N/A</span>}</p>
                            </div>
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${color.bg} ${color.text}`}>{res.status}</span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-700">
                            <div className="flex items-center gap-2 truncate"><CarIcon/> <span className="truncate">{res.carModel || 'No car selected'}</span></div>
                            <div className="flex items-center gap-2 truncate"><LocationIcon/> <span className="truncate">{res.locationName || 'No location'}</span></div>
                            <div className="col-span-2 flex items-center gap-2"><CalendarIcon/> <span>{res.startDate?.replace('T', ' ')} to {res.endDate?.replace('T', ' ')}</span></div>
                        </div>
                    </div>
                )}
                <div className="bg-slate-50 p-2 flex justify-between items-center rounded-b-lg border-t">
                    {!isEditable && (
                        <button onClick={() => setExpandedRowId(isExpanded ? null : res.id)} className="flex items-center gap-1.5 px-3 py-1 text-sm text-primary font-medium hover:bg-slate-200 rounded-md">
                            <ChevronRightIcon className={`h-5 w-5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                            {isExpanded ? 'Hide' : 'Show'} Details
                        </button>
                    )}
                    <div className="flex items-center gap-1 ml-auto">
                      {isEditable ? (
                        <>
                          <button onClick={() => handleSaveEdit(res)} className="p-2 text-green-600 hover:bg-green-100 rounded-full" aria-label="Save"><SaveIcon /></button>
                          <button onClick={isNew ? () => onDelete(res.id, true) : handleCancelEdit} className="p-2 text-red-500 hover:bg-red-100 rounded-full" aria-label={isNew ? "Delete" : "Cancel"}>{isNew ? <TrashIcon /> : <CancelIcon />}</button>
                        </>
                      ) : (
                         <>
                            {res.status === ReservationStatus.CONFIRMED && !res.isNew && (
                                <button onClick={() => onExtend(res)} className="p-2 text-teal-500 hover:bg-teal-100 rounded-full" aria-label={`Extend rental for ${res.personName}`}><CalendarPlusIcon /></button>
                            )}
                            <button onClick={() => onShare(res)} className="p-2 text-purple-500 hover:bg-purple-100 rounded-full" aria-label={`Share reservation details for ${res.personName}`}><ShareIcon /></button>
                            <div className="relative">
                                <button onClick={() => handleVoucherClick(res)} disabled={isNew} className="p-2 text-blue-600 hover:bg-blue-100 rounded-full disabled:text-gray-300" title="Manage Rental Agreement">
                                    <DocumentTextIcon />
                                </button>
                                {isPaymentDue && res.paymentConfirmationPending && !res.pickupPaymentCollected && (
                                    <span className="absolute -top-0 -right-0" title="Payment approval pending">
                                        <ClockIcon className="h-4 w-4 text-yellow-500" />
                                    </span>
                                )}
                                {isPaymentDue && res.pickupPaymentCollected && (
                                    <span className="absolute -top-0 -right-0" title="Payment confirmed">
                                        <CheckCircleIcon className="h-4 w-4 text-green-500" />
                                    </span>
                                )}
                            </div>
                            <button onClick={() => handleEditClick(res)} className="p-2 text-blue-500 hover:bg-blue-100 rounded-full"><EditIcon /></button>
                            <button onClick={() => handleDeleteClick(res.id, res.isNew)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><TrashIcon /></button>
                        </>
                      )}
                    </div>
                </div>
                {isExpanded && !isEditable && <ExpandedInfo reservation={res} />}
              </div>
            )
          })}
        </div>
      )}

      <div className="p-4 bg-gray-50 rounded-b-lg border-t border-gray-200 flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-md hover:bg-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary text-sm font-medium"
        >
          <PlusIcon />
          Add New Reservation
        </button>
        <div className="flex items-center gap-2">
            <button
                onClick={handleExportCSV}
                disabled={reservationsToDisplay.filter(r => !r.isNew).length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 text-sm font-medium disabled:bg-gray-400"
            >
                <ExportIcon />
                Export CSV
            </button>
             <button
                onClick={handleExportPDF}
                disabled={reservationsToDisplay.filter(r => !r.isNew).length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-600 text-sm font-medium disabled:bg-gray-400"
            >
                <PdfIcon />
                Export PDF
            </button>
        </div>
      </div>
      {reservationToDelete && (
        <ConfirmationDialog 
            message={`Are you sure you want to delete the reservation for ${reservationsToDisplay.find(r => r.id === reservationToDelete.id)?.personName || 'this entry'}? This action cannot be undone.`}
            onConfirm={handleConfirmDelete}
            onCancel={() => setReservationToDelete(null)}
            confirmButtonText="Delete Reservation"
        />
      )}
      {isKeyModalOpen && (
        <SecurityKeyModal
            onSuccess={handleKeySuccess}
            onClose={() => { setIsKeyModalOpen(false); setPendingAction(null); }}
        />
      )}
      {isExtrasModalOpen && reservationForExtras && (
        <ManageExtrasModal 
            reservation={reservationForExtras}
            onSave={handleSaveExtras}
            onClose={() => setIsExtrasModalOpen(false)}
            availableExtras={availableExtras}
        />
      )}
    </div>
  );
};

export default ReservationTable;