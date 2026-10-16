import React, { useState, useMemo } from 'react';
import { Fleet, FleetVehicle } from '../types';
import {
  PlusCircleIcon, PencilIcon, TrashIcon, CloseIcon, CarIcon,
  CheckCircleIcon, ExportIcon, UploadIcon, SaveIcon, SearchIcon,
  FilterIcon, ChevronDownIcon, ChevronUpIcon, AlertIcon
} from './icons';
import jsPDF from 'jspdf';

interface ProfessionalFleetManagementProps {
  fleet: Fleet;
  onUpdate: (newFleet: Fleet) => void;
}

type SortField = 'modelName' | 'licensePlate' | 'category' | 'registrationExpiry' | 'status';
type SortDirection = 'asc' | 'desc';
type FilterStatus = 'all' | 'available' | 'rented' | 'maintenance' | 'expired';

interface FleetStats {
  total: number;
  available: number;
  rented: number;
  maintenance: number;
  expired: number;
  avgSecurityDeposit: number;
  totalValue: number;
}

interface VehicleFormData extends Partial<FleetVehicle> {
  color?: string;
  odometer?: number;
  fuelLevel?: string;
  lastService?: string;
  nextServiceDue?: string;
  insuranceExpiry?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  vin?: string;
  notes?: string;
}

const ProfessionalFleetManagement: React.FC<ProfessionalFleetManagementProps> = ({ fleet, onUpdate }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<FleetVehicle | null>(null);
  const [formData, setFormData] = useState<VehicleFormData>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('modelName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedVehicles, setSelectedVehicles] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

  // Calculate fleet statistics
  const fleetStats: FleetStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const stats: FleetStats = {
      total: fleet.length,
      available: 0,
      rented: 0,
      maintenance: 0,
      expired: 0,
      avgSecurityDeposit: 0,
      totalValue: 0
    };

    fleet.forEach(vehicle => {
      const isExpired = vehicle.registrationExpiry && vehicle.registrationExpiry < today;
      if (isExpired) {
        stats.expired++;
      } else {
        stats.available++;
      }
      stats.avgSecurityDeposit += vehicle.securityDeposit || 0;
      stats.totalValue += (vehicle as any).purchasePrice || 0;
    });

    stats.avgSecurityDeposit = fleet.length > 0 ? stats.avgSecurityDeposit / fleet.length : 0;

    return stats;
  }, [fleet]);

  // Filter and sort vehicles
  const filteredVehicles = useMemo(() => {
    let filtered = [...fleet];
    const today = new Date().toISOString().split('T')[0];

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(v =>
        v.modelName?.toLowerCase().includes(search) ||
        v.licensePlate?.toLowerCase().includes(search) ||
        v.category?.toLowerCase().includes(search) ||
        v.sippCode?.toLowerCase().includes(search) ||
        (v as any).vin?.toLowerCase().includes(search)
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(v => {
        const isExpired = v.registrationExpiry && v.registrationExpiry < today;
        if (filterStatus === 'expired') return isExpired;
        if (filterStatus === 'available') return !isExpired;
        return false;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'registrationExpiry') {
        aVal = aVal || '9999-12-31';
        bVal = bVal || '9999-12-31';
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [fleet, searchTerm, filterStatus, sortField, sortDirection]);

  const openAddModal = () => {
    setEditingVehicle(null);
    setFormData({
      modelName: '',
      licensePlate: '',
      registrationExpiry: '',
      category: '',
      securityDeposit: 0,
      excess: 0,
      sippCode: '',
      transmission: 'Automatic',
      color: '',
      odometer: 0,
      fuelLevel: '100%',
      lastService: '',
      nextServiceDue: '',
      insuranceExpiry: '',
      purchaseDate: '',
      purchasePrice: 0,
      vin: '',
      notes: ''
    });
    setModalOpen(true);
  };

  const openEditModal = (vehicle: FleetVehicle) => {
    setEditingVehicle(vehicle);
    setFormData(vehicle);
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.modelName?.trim()) {
      alert('Model name is required');
      return;
    }
    if (!formData.licensePlate?.trim()) {
      alert('License plate is required');
      return;
    }

    const newVehicle: FleetVehicle = {
      id: editingVehicle?.id || `vehicle-${Date.now()}`,
      modelName: formData.modelName.trim(),
      licensePlate: formData.licensePlate.trim().toUpperCase(),
      registrationExpiry: formData.registrationExpiry || '',
      category: formData.category || '',
      securityDeposit: Number(formData.securityDeposit) || 0,
      excess: Number(formData.excess) || 0,
      sippCode: formData.sippCode || '',
      transmission: formData.transmission || 'Automatic',
      ...(formData.color && { color: formData.color }),
      ...(formData.odometer && { odometer: Number(formData.odometer) }),
      ...(formData.fuelLevel && { fuelLevel: formData.fuelLevel }),
      ...(formData.lastService && { lastService: formData.lastService }),
      ...(formData.nextServiceDue && { nextServiceDue: formData.nextServiceDue }),
      ...(formData.insuranceExpiry && { insuranceExpiry: formData.insuranceExpiry }),
      ...(formData.purchaseDate && { purchaseDate: formData.purchaseDate }),
      ...(formData.purchasePrice && { purchasePrice: Number(formData.purchasePrice) }),
      ...(formData.vin && { vin: formData.vin }),
      ...(formData.notes && { notes: formData.notes })
    };

    let updatedFleet: Fleet;
    if (editingVehicle) {
      updatedFleet = fleet.map(v => v.id === editingVehicle.id ? newVehicle : v);
    } else {
      updatedFleet = [...fleet, newVehicle];
    }

    onUpdate(updatedFleet);
    setModalOpen(false);
    setFormData({});
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this vehicle? This action cannot be undone.')) {
      const updatedFleet = fleet.filter(v => v.id !== id);
      onUpdate(updatedFleet);
    }
  };

  const handleBulkDelete = () => {
    if (selectedVehicles.size === 0) return;
    if (confirm(`Delete ${selectedVehicles.size} selected vehicle(s)?`)) {
      const updatedFleet = fleet.filter(v => !selectedVehicles.has(v.id));
      onUpdate(updatedFleet);
      setSelectedVehicles(new Set());
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const toggleVehicleSelection = (id: string) => {
    const newSelection = new Set(selectedVehicles);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedVehicles(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedVehicles.size === filteredVehicles.length) {
      setSelectedVehicles(new Set());
    } else {
      setSelectedVehicles(new Set(filteredVehicles.map(v => v.id)));
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF('landscape');

    doc.setFontSize(18);
    doc.text('Fleet Management Report', 14, 20);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(`Total Vehicles: ${fleetStats.total}`, 14, 34);
    doc.text(`Available: ${fleetStats.available} | Expired: ${fleetStats.expired}`, 14, 40);

    let yPos = 50;
    doc.setFontSize(9);

    filteredVehicles.forEach((vehicle, index) => {
      if (yPos > 180) {
        doc.addPage();
        yPos = 20;
      }

      const status = vehicle.registrationExpiry && vehicle.registrationExpiry < new Date().toISOString().split('T')[0]
        ? 'EXPIRED' : 'Active';

      doc.text(`${index + 1}. ${vehicle.modelName} | ${vehicle.licensePlate} | ${vehicle.category}`, 14, yPos);
      doc.text(`Reg: ${vehicle.registrationExpiry || 'N/A'} | Status: ${status}`, 20, yPos + 5);
      yPos += 12;
    });

    doc.save(`fleet-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const getStatusBadge = (vehicle: FleetVehicle) => {
    const today = new Date().toISOString().split('T')[0];
    const isExpired = vehicle.registrationExpiry && vehicle.registrationExpiry < today;

    if (isExpired) {
      return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-rose-100 text-rose-800 border border-rose-200">Expired</span>;
    }

    const daysUntilExpiry = vehicle.registrationExpiry
      ? Math.ceil((new Date(vehicle.registrationExpiry).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24))
      : 9999;

    if (daysUntilExpiry < 30) {
      return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 border border-amber-200">Expiring Soon</span>;
    }

    return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">Active</span>;
  };

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold flex items-center gap-3 text-slate-900">
              <CarIcon className="w-10 h-10 text-sky-600" />
              Fleet Management
            </h1>
            <p className="text-slate-600 mt-2">Comprehensive vehicle inventory management system</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={exportToPDF}
              className="px-4 py-2 bg-white border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm font-semibold"
            >
              <ExportIcon className="w-5 h-5" />
              Export PDF
            </button>
            <button
              onClick={openAddModal}
              className="px-6 py-2 text-white rounded-lg transition-all flex items-center gap-2 shadow-lg font-semibold bg-emerald-600 hover:bg-emerald-700"
            >
              <PlusCircleIcon className="w-5 h-5" />
              Add Vehicle
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-sky-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Total Fleet</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{fleetStats.total}</p>
              </div>
              <div className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center">
                <CarIcon className="w-6 h-6 text-sky-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-emerald-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Available</p>
                <p className="text-3xl font-bold text-emerald-600 mt-1">{fleetStats.available}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircleIcon className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-rose-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Expired Reg.</p>
                <p className="text-3xl font-bold text-rose-600 mt-1">{fleetStats.expired}</p>
              </div>
              <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center">
                <AlertIcon className="w-6 h-6 text-rose-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-emerald-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Avg. Deposit</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">${fleetStats.avgSecurityDeposit.toFixed(0)}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <span className="text-emerald-600 font-bold text-lg">$</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-emerald-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Fleet Value</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">${fleetStats.totalValue.toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <span className="text-emerald-600 font-bold text-lg">💎</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl p-6 shadow-md mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[300px]">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search vehicles by model, plate, category, SIPP, VIN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
              />
            </div>
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            className="px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all font-medium"
          >
            <option value="all">All Status ({fleet.length})</option>
            <option value="available">Available ({fleetStats.available})</option>
            <option value="expired">Expired ({fleetStats.expired})</option>
          </select>

          {/* Bulk Actions */}
          {selectedVehicles.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="px-4 py-2.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-all flex items-center gap-2 font-semibold shadow-md"
            >
              <TrashIcon className="w-5 h-5" />
              Delete {selectedVehicles.size} Selected
            </button>
          )}

          {/* Results Count */}
          <div className="text-sm text-slate-600 font-medium">
            Showing <span className="font-bold text-sky-600">{filteredVehicles.length}</span> of {fleet.length} vehicles
          </div>
        </div>
      </div>

      {/* Fleet Table */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b-2 border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-4 text-left">
                  <input
                    type="checkbox"
                    checked={selectedVehicles.size === filteredVehicles.length && filteredVehicles.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                </th>
                <th
                  className="px-4 py-4 text-left text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => toggleSort('modelName')}
                >
                  <div className="flex items-center gap-2">
                    Vehicle Model
                    {sortField === 'modelName' && (
                      sortDirection === 'asc' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-4 text-left text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => toggleSort('licensePlate')}
                >
                  <div className="flex items-center gap-2">
                    License Plate
                    {sortField === 'licensePlate' && (
                      sortDirection === 'asc' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-4 text-left text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => toggleSort('category')}
                >
                  <div className="flex items-center gap-2">
                    Category
                    {sortField === 'category' && (
                      sortDirection === 'asc' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-4 text-left text-sm font-bold text-slate-700">Transmission</th>
                <th className="px-4 py-4 text-left text-sm font-bold text-slate-700">SIPP Code</th>
                <th
                  className="px-4 py-4 text-left text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => toggleSort('registrationExpiry')}
                >
                  <div className="flex items-center gap-2">
                    Registration
                    {sortField === 'registrationExpiry' && (
                      sortDirection === 'asc' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-4 text-left text-sm font-bold text-slate-700">Deposit</th>
                <th className="px-4 py-4 text-left text-sm font-bold text-slate-700">Status</th>
                <th className="px-4 py-4 text-center text-sm font-bold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <CarIcon className="w-16 h-16 text-slate-300" />
                      <p className="text-slate-500 text-lg font-medium">No vehicles found</p>
                      <p className="text-slate-400 text-sm">Try adjusting your search or filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((vehicle, index) => (
                  <tr
                    key={vehicle.id}
                    className={`hover:bg-sky-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedVehicles.has(vehicle.id)}
                        onChange={() => toggleVehicleSelection(vehicle.id)}
                        className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-800">{vehicle.modelName}</div>
                      {(vehicle as any).vin && (
                        <div className="text-xs text-slate-500 font-mono">VIN: {(vehicle as any).vin}</div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-mono font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded border border-slate-300">
                        {vehicle.licensePlate}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-3 py-1 bg-sky-100 text-sky-800 rounded-lg text-sm font-medium border border-sky-200">
                        {vehicle.category}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{vehicle.transmission}</td>
                    <td className="px-4 py-4">
                      <span className="font-mono text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded">
                        {vehicle.sippCode || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-700 font-medium">
                      {vehicle.registrationExpiry || 'N/A'}
                    </td>
                    <td className="px-4 py-4 text-slate-700 font-semibold">
                      ${vehicle.securityDeposit?.toLocaleString() || 0}
                    </td>
                    <td className="px-4 py-4">
                      {getStatusBadge(vehicle)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditModal(vehicle)}
                          className="p-2 text-sky-600 hover:bg-sky-100 rounded-lg transition-colors"
                          title="Edit Vehicle"
                        >
                          <PencilIcon className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(vehicle.id)}
                          className="p-2 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
                          title="Delete Vehicle"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm transition-opacity" onClick={() => setModalOpen(false)} />

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

            <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              {/* Modal Header */}
              <div className="px-6 py-5 bg-slate-900">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                    <CarIcon className="w-7 h-7" />
                    {editingVehicle ? 'Edit Vehicle' : 'Add New Vehicle'}
                  </h3>
                  <button
                    onClick={() => setModalOpen(false)}
                    className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
                  >
                    <CloseIcon className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-6 max-h-[70vh] overflow-y-auto bg-slate-50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Information */}
                  <div className="col-span-2">
                    <h4 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b-2 border-sky-200">Basic Information</h4>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Vehicle Model *</label>
                    <input
                      type="text"
                      value={formData.modelName || ''}
                      onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                      placeholder="e.g., Toyota Camry 2024"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">License Plate *</label>
                    <input
                      type="text"
                      value={formData.licensePlate || ''}
                      onChange={(e) => setFormData({ ...formData, licensePlate: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all font-mono"
                      placeholder="ABC-1234"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
                    <select
                      value={formData.category || ''}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                    >
                      <option value="">Select Category</option>
                      <option value="Economy">Economy</option>
                      <option value="Compact">Compact</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Standard">Standard</option>
                      <option value="Full-Size">Full-Size</option>
                      <option value="Premium">Premium</option>
                      <option value="Luxury">Luxury</option>
                      <option value="SUV">SUV</option>
                      <option value="Van">Van</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Transmission</label>
                    <select
                      value={formData.transmission || 'Automatic'}
                      onChange={(e) => setFormData({ ...formData, transmission: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                    >
                      <option value="Automatic">Automatic</option>
                      <option value="Manual">Manual</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">SIPP Code</label>
                    <input
                      type="text"
                      value={formData.sippCode || ''}
                      onChange={(e) => setFormData({ ...formData, sippCode: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all font-mono"
                      placeholder="ECAR"
                      maxLength={4}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Color</label>
                    <input
                      type="text"
                      value={formData.color || ''}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                      placeholder="e.g., Silver"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">VIN (Vehicle Identification Number)</label>
                    <input
                      type="text"
                      value={formData.vin || ''}
                      onChange={(e) => setFormData({ ...formData, vin: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all font-mono"
                      placeholder="1HGBH41JXMN109186"
                      maxLength={17}
                    />
                  </div>

                  {/* Financial Information */}
                  <div className="col-span-2 mt-4">
                    <h4 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b-2 border-emerald-200">Financial Information</h4>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Security Deposit ($)</label>
                    <input
                      type="number"
                      value={formData.securityDeposit || 0}
                      onChange={(e) => setFormData({ ...formData, securityDeposit: Number(e.target.value) })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Excess/Deductible ($)</label>
                    <input
                      type="number"
                      value={formData.excess || 0}
                      onChange={(e) => setFormData({ ...formData, excess: Number(e.target.value) })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Purchase Price ($)</label>
                    <input
                      type="number"
                      value={formData.purchasePrice || 0}
                      onChange={(e) => setFormData({ ...formData, purchasePrice: Number(e.target.value) })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Purchase Date</label>
                    <input
                      type="date"
                      value={formData.purchaseDate || ''}
                      onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                    />
                  </div>

                  {/* Registration & Compliance */}
                  <div className="col-span-2 mt-4">
                    <h4 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b-2 border-emerald-200">Registration & Compliance</h4>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Registration Expiry</label>
                    <input
                      type="date"
                      value={formData.registrationExpiry || ''}
                      onChange={(e) => setFormData({ ...formData, registrationExpiry: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Insurance Expiry</label>
                    <input
                      type="date"
                      value={formData.insuranceExpiry || ''}
                      onChange={(e) => setFormData({ ...formData, insuranceExpiry: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                    />
                  </div>

                  {/* Maintenance & Service */}
                  <div className="col-span-2 mt-4">
                    <h4 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b-2 border-amber-200">Maintenance & Service</h4>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Current Odometer (km)</label>
                    <input
                      type="number"
                      value={formData.odometer || 0}
                      onChange={(e) => setFormData({ ...formData, odometer: Number(e.target.value) })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Fuel Level</label>
                    <select
                      value={formData.fuelLevel || '100%'}
                      onChange={(e) => setFormData({ ...formData, fuelLevel: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                    >
                      <option value="100%">100% (Full)</option>
                      <option value="75%">75% (3/4)</option>
                      <option value="50%">50% (1/2)</option>
                      <option value="25%">25% (1/4)</option>
                      <option value="0%">0% (Empty)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Last Service Date</label>
                    <input
                      type="date"
                      value={formData.lastService || ''}
                      onChange={(e) => setFormData({ ...formData, lastService: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Next Service Due</label>
                    <input
                      type="date"
                      value={formData.nextServiceDue || ''}
                      onChange={(e) => setFormData({ ...formData, nextServiceDue: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                    />
                  </div>

                  {/* Additional Notes */}
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Additional Notes</label>
                    <textarea
                      value={formData.notes || ''}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                      rows={3}
                      placeholder="Any additional information about this vehicle..."
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="bg-slate-100 px-6 py-4 flex items-center justify-end gap-3">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-6 py-2.5 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-200 transition-all font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-8 py-2.5 text-white rounded-lg transition-all flex items-center gap-2 shadow-lg font-semibold bg-emerald-600 hover:bg-emerald-700"
                >
                  <SaveIcon className="w-5 h-5" />
                  {editingVehicle ? 'Update Vehicle' : 'Add Vehicle'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfessionalFleetManagement;
