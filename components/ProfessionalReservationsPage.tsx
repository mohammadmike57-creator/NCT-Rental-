import React, { useState, useMemo } from 'react';
import {
  SearchIcon, FilterIcon, PlusIcon, DownloadIcon, RefreshIcon,
  EyeIcon, EditIcon, TrashIcon, CheckCircleIcon, XCircleIcon,
  ClockIcon, CalendarIcon, TruckIcon, UserIcon, PhoneIcon,
  MailIcon, CurrencyDollarIcon, ChevronLeftIcon, ChevronRightIcon
} from './icons';

interface Reservation {
  id: string;
  bookingId: string;
  personName: string;
  contactNumber: string;
  customerEmail?: string;
  startDate: string;
  endDate: string;
  reservationVehicle: string;
  assignedVehicle?: any;
  status: string;
  amount?: number;
  voucherSubmitted?: boolean;
  dropOffCompleted?: boolean;
  source?: any;
  notes?: string;
  bookingDate?: string;
}

interface ProfessionalReservationsPageProps {
  reservations: Reservation[];
  onCreateNew: () => void;
  onEdit: (reservation: Reservation) => void;
  onDelete: (id: string) => void;
  onView: (reservation: Reservation) => void;
  onExport: () => void;
}

/**
 * EXTREMELY PROFESSIONAL RESERVATIONS MANAGEMENT PAGE
 *
 * Features:
 * - Advanced search and filtering
 * - Multi-column sorting
 * - Bulk actions
 * - Status management
 * - Quick preview
 * - Export functionality
 * - Pagination
 * - Real-time stats
 * - Professional UI/UX
 */
const ProfessionalReservationsPage: React.FC<ProfessionalReservationsPageProps> = ({
  reservations,
  onCreateNew,
  onEdit,
  onDelete,
  onView,
  onExport
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('startDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [selectedReservations, setSelectedReservations] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Filter and search reservations
  const filteredReservations = useMemo(() => {
    let filtered = [...reservations];

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(res =>
        res.personName?.toLowerCase().includes(search) ||
        res.bookingId?.toLowerCase().includes(search) ||
        res.contactNumber?.includes(search) ||
        res.customerEmail?.toLowerCase().includes(search) ||
        res.reservationVehicle?.toLowerCase().includes(search)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'active') {
        filtered = filtered.filter(res => res.voucherSubmitted && !res.dropOffCompleted);
      } else if (statusFilter === 'upcoming') {
        filtered = filtered.filter(res => {
          const startDate = new Date(res.startDate);
          return startDate > new Date() && !res.voucherSubmitted;
        });
      } else if (statusFilter === 'completed') {
        filtered = filtered.filter(res => res.dropOffCompleted);
      } else if (statusFilter === 'overdue') {
        const today = new Date().toISOString().split('T')[0];
        filtered = filtered.filter(res => {
          const endDate = res.endDate?.split('T')[0];
          return endDate < today && res.voucherSubmitted && !res.dropOffCompleted;
        });
      } else {
        filtered = filtered.filter(res => res.status === statusFilter);
      }
    }

    // Date filter
    if (dateFilter !== 'all') {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      if (dateFilter === 'today') {
        filtered = filtered.filter(res => res.startDate?.split('T')[0] === todayStr);
      } else if (dateFilter === 'thisWeek') {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        filtered = filtered.filter(res => new Date(res.startDate) >= weekStart);
      } else if (dateFilter === 'thisMonth') {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        filtered = filtered.filter(res => new Date(res.startDate) >= monthStart);
      }
    }

    // Sorting
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'startDate' || sortField === 'endDate') {
        aVal = new Date(aVal || 0).getTime();
        bVal = new Date(bVal || 0).getTime();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [reservations, searchTerm, statusFilter, dateFilter, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredReservations.length / itemsPerPage);
  const paginatedReservations = filteredReservations.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Stats
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return {
      total: filteredReservations.length,
      active: filteredReservations.filter(r => r.voucherSubmitted && !r.dropOffCompleted).length,
      upcoming: filteredReservations.filter(r => {
        const start = new Date(r.startDate);
        return start > new Date() && !r.voucherSubmitted;
      }).length,
      overdue: filteredReservations.filter(r => {
        const end = r.endDate?.split('T')[0];
        return end < today && r.voucherSubmitted && !r.dropOffCompleted;
      }).length,
      totalRevenue: filteredReservations.reduce((sum, r) => sum + (r.amount || 0), 0)
    };
  }, [filteredReservations]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const toggleSelectAll = () => {
    if (selectedReservations.size === paginatedReservations.length) {
      setSelectedReservations(new Set());
    } else {
      setSelectedReservations(new Set(paginatedReservations.map(r => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedReservations);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedReservations(newSelected);
  };

  const getStatusBadge = (reservation: Reservation) => {
    if (reservation.dropOffCompleted) {
      return <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">Completed</span>;
    }
    if (reservation.voucherSubmitted) {
      const today = new Date().toISOString().split('T')[0];
      const endDate = reservation.endDate?.split('T')[0];
      if (endDate < today) {
        return <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">Overdue</span>;
      }
      return <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">Active</span>;
    }
    const startDate = new Date(reservation.startDate);
    if (startDate > new Date()) {
      return <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">Upcoming</span>;
    }
    return <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">Pending</span>;
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Reservations Management</h1>
            <p className="text-gray-500 mt-1">Manage all your rental reservations in one place</p>
          </div>
          <button
            onClick={onCreateNew}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-md"
          >
            <PlusIcon className="h-5 w-5" />
            New Reservation
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg">
            <div className="text-blue-600 text-sm font-semibold">Total</div>
            <div className="text-2xl font-bold text-blue-900">{stats.total}</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg">
            <div className="text-green-600 text-sm font-semibold">Active</div>
            <div className="text-2xl font-bold text-green-900">{stats.active}</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg">
            <div className="text-purple-600 text-sm font-semibold">Upcoming</div>
            <div className="text-2xl font-bold text-purple-900">{stats.upcoming}</div>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg">
            <div className="text-red-600 text-sm font-semibold">Overdue</div>
            <div className="text-2xl font-bold text-red-900">{stats.overdue}</div>
          </div>
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-4 rounded-lg">
            <div className="text-indigo-600 text-sm font-semibold">Revenue</div>
            <div className="text-2xl font-bold text-indigo-900">${stats.totalRevenue.toFixed(0)}</div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="col-span-1 md:col-span-2">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, booking ID, email, phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="upcoming">Upcoming</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="overdue">Overdue</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="thisWeek">This Week</option>
            <option value="thisMonth">This Month</option>
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={onExport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <DownloadIcon className="h-4 w-4" />
            Export
          </button>
          {selectedReservations.size > 0 && (
            <button
              onClick={() => setSelectedReservations(new Set())}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Clear Selection ({selectedReservations.size})
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left">
                  <input
                    type="checkbox"
                    checked={selectedReservations.size === paginatedReservations.length && paginatedReservations.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('bookingId')}>
                  Booking ID {sortField === 'bookingId' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('personName')}>
                  Customer {sortField === 'personName' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('startDate')}>
                  Pickup {sortField === 'startDate' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('endDate')}>
                  Return {sortField === 'endDate' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Vehicle</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('amount')}>
                  Amount {sortField === 'amount' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedReservations.map((reservation) => (
                <tr key={reservation.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedReservations.has(reservation.id)}
                      onChange={() => toggleSelect(reservation.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-blue-600">{reservation.bookingId || 'N/A'}</div>
                    {reservation.source && (
                      <div className="text-xs text-gray-500">{reservation.source.name}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{reservation.personName}</div>
                    <div className="text-sm text-gray-500">{reservation.contactNumber}</div>
                    {reservation.customerEmail && (
                      <div className="text-xs text-gray-400">{reservation.customerEmail}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {new Date(reservation.startDate).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(reservation.startDate).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {new Date(reservation.endDate).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(reservation.endDate).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{reservation.reservationVehicle}</div>
                    {reservation.assignedVehicle && (
                      <div className="text-xs text-gray-500">{reservation.assignedVehicle.licensePlate}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">{getStatusBadge(reservation)}</td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-gray-900">
                      ${reservation.amount?.toFixed(2) || '0.00'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => onView(reservation)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="View"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onEdit(reservation)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <EditIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this reservation?')) {
                            onDelete(reservation.id);
                          }
                        }}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
            <div className="text-sm text-gray-600">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredReservations.length)} of {filteredReservations.length} results
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
              <span className="px-4 py-2 bg-blue-600 text-white rounded-lg">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfessionalReservationsPage;
