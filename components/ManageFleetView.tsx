import React, { useState } from 'react';
import { Fleet, FleetVehicle } from '../types';
import { PlusCircleIcon, PencilIcon, TrashIcon, CloseIcon } from './icons';
import FleetExcelUpload from './FleetExcelUpload';

interface ManageFleetViewProps {
  fleet: Fleet;
  onUpdate: (newFleet: Fleet) => void;
}

// Simple modal component
const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-slate-500 bg-opacity-75 transition-opacity" onClick={onClose} aria-hidden="true"></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <h3 className="text-lg leading-6 font-medium text-slate-900 mb-4" id="modal-title">{title}</h3>
            <div className="max-h-[70vh] overflow-y-auto px-1">{children}</div>
          </div>
          <div className="bg-slate-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-slate-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-slate-700 hover:bg-slate-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ManageFleetView: React.FC<ManageFleetViewProps> = ({ fleet, onUpdate }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<FleetVehicle | null>(null);
  const [formData, setFormData] = useState<Partial<FleetVehicle>>({
    modelName: '',
    licensePlate: '',
    registrationExpiry: '',
    category: '',
    securityDeposit: 0,
    excess: 0,
    sippCode: '',
    transmission: '',
  });
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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
      transmission: '',
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
      licensePlate: formData.licensePlate.trim(),
      registrationExpiry: formData.registrationExpiry || '',
      category: formData.category || '',
      securityDeposit: formData.securityDeposit || 0,
      excess: formData.excess || 0,
      sippCode: formData.sippCode || '',
      transmission: formData.transmission || '',
    };

    let updatedFleet: Fleet;
    if (editingVehicle) {
      updatedFleet = fleet.map(v => v.id === editingVehicle.id ? newVehicle : v);
    } else {
      updatedFleet = [...fleet, newVehicle];
    }
    onUpdate(updatedFleet);
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this vehicle?')) {
      onUpdate(fleet.filter(v => v.id !== id));
    }
  };

  const handleImport = (newVehicles: FleetVehicle[]) => {
    onUpdate([...fleet, ...newVehicles]);
    setShowImport(false);
  };

  const handleChange = (field: keyof FleetVehicle, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const today = new Date().toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const registrationStatus = (expiry?: string) => {
    if (!expiry) return null;
    if (expiry < today) return { label: 'Expired', className: 'bg-rose-50 text-rose-700 ring-rose-600/20' };
    if (expiry <= in30Days) return { label: 'Expires soon', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' };
    return { label: 'Valid', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' };
  };
  const query = search.trim().toLowerCase();
  const visibleFleet = fleet
    .filter(v => !query || [v.modelName, v.licensePlate, v.category, v.sippCode].some(f => (f || '').toLowerCase().includes(query)))
    .filter(v => statusFilter === 'all' || registrationStatus(v.registrationExpiry)?.label === statusFilter)
    .sort((a, b) => a.modelName.localeCompare(b.modelName) || a.licensePlate.localeCompare(b.licensePlate));
  const expiredCount = fleet.filter(v => registrationStatus(v.registrationExpiry)?.label === 'Expired').length;
  const soonCount = fleet.filter(v => registrationStatus(v.registrationExpiry)?.label === 'Expires soon').length;
  const categoryCount = new Set(fleet.map(v => v.category).filter(Boolean)).size;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Fleet Management</h2>
          <p className="text-sm text-slate-500 mt-1">Every vehicle, its deposit and excess, and when its registration runs out.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(!showImport)}
            className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Import Excel
          </button>
          <button
            onClick={openAddModal}
            className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 inline-flex items-center gap-1.5"
          >
            <PlusCircleIcon className="w-4 h-4" />
            Add vehicle
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Vehicles', value: fleet.length, sub: `${categoryCount} categories`, tone: 'text-slate-900' },
          { label: 'Registration valid', value: fleet.length - expiredCount - soonCount, sub: 'More than 30 days left', tone: 'text-emerald-700' },
          { label: 'Expires within 30 days', value: soonCount, sub: 'Renew soon', tone: soonCount ? 'text-amber-700' : 'text-slate-900' },
          { label: 'Expired', value: expiredCount, sub: expiredCount ? 'Do not rent until renewed' : 'None', tone: expiredCount ? 'text-rose-700' : 'text-slate-900' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{k.label}</p>
            <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${k.tone}`}>{k.value}</p>
            <p className="mt-1 text-xs text-slate-500">{k.sub}</p>
          </div>
        ))}
      </div>

      {showImport && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <FleetExcelUpload onFleetImported={handleImport} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-3 flex flex-col sm:flex-row gap-2 border-b border-slate-100">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search model, plate, category or SIPP…"
            aria-label="Search vehicles"
            className="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            aria-label="Filter by registration"
            className="h-9 px-3 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
          >
            <option value="all">All registrations</option>
            <option value="Expired">Expired</option>
            <option value="Expires soon">Expires soon</option>
            <option value="Valid">Valid</option>
          </select>
        </div>

        {visibleFleet.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">{fleet.length === 0 ? 'No vehicles yet. Add your first vehicle to start renting it out.' : 'No vehicles match this search.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3">Plate</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Transmission</th>
                  <th className="px-4 py-3">SIPP</th>
                  <th className="px-4 py-3 text-right">Deposit</th>
                  <th className="px-4 py-3 text-right">Excess</th>
                  <th className="px-4 py-3">Registration</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleFleet.map(vehicle => {
                  const reg = registrationStatus(vehicle.registrationExpiry);
                  return (
                    <tr key={vehicle.id} className={reg?.label === 'Expired' ? 'bg-rose-50/40' : 'hover:bg-slate-50/60'}>
                      <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{vehicle.modelName}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{vehicle.licensePlate}</span></td>
                      <td className="px-4 py-3 text-slate-600">{vehicle.category || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{vehicle.transmission || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 font-mono text-xs">{vehicle.sippCode || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">${(vehicle.securityDeposit || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">${(vehicle.excess || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {reg ? (
                          <span className="inline-flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset ${reg.className}`}>{reg.label}</span>
                            <span className="text-xs text-slate-500 tabular-nums">{vehicle.registrationExpiry}</span>
                          </span>
                        ) : <span className="text-xs text-slate-400">Not set</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => openEditModal(vehicle)} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100" title="Edit" aria-label={`Edit ${vehicle.licensePlate}`}>
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(vehicle.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50" title="Delete" aria-label={`Delete ${vehicle.licensePlate}`}>
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal for add/edit */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Model *</label>
            <input
              type="text"
              value={formData.modelName || ''}
              onChange={e => handleChange('modelName', e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">License Plate *</label>
            <input
              type="text"
              value={formData.licensePlate || ''}
              onChange={e => handleChange('licensePlate', e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Category</label>
            <input
              type="text"
              value={formData.category || ''}
              onChange={e => handleChange('category', e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Security Deposit ($)</label>
            <input
              type="number"
              value={formData.securityDeposit || 0}
              onChange={e => handleChange('securityDeposit', parseFloat(e.target.value) || 0)}
              className="mt-1 w-full px-3 py-2 border rounded-md"
              min="0"
              step="0.01"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Excess ($)</label>
            <input
              type="number"
              value={formData.excess || 0}
              onChange={e => handleChange('excess', parseFloat(e.target.value) || 0)}
              className="mt-1 w-full px-3 py-2 border rounded-md"
              min="0"
              step="0.01"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">SIPP Code</label>
            <input
              type="text"
              value={formData.sippCode || ''}
              onChange={e => handleChange('sippCode', e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Transmission</label>
            <select
              value={formData.transmission || ''}
              onChange={e => handleChange('transmission', e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-md"
            >
              <option value="">Select</option>
              <option value="Automatic">Automatic</option>
              <option value="Manual">Manual</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Registration Expiry</label>
            <input
              type="date"
              value={formData.registrationExpiry || ''}
              onChange={e => handleChange('registrationExpiry', e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
            >
              {editingVehicle ? 'Save Changes' : 'Add Vehicle'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ManageFleetView;
