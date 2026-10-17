import React, { useState } from 'react';
import { Fleet, FleetVehicle } from '../types';
import { PlusIcon, PencilIcon, TrashIcon, CloseIcon, CarIcon, UploadIcon, SearchIcon } from './icons';
import FleetExcelUpload from './FleetExcelUpload';

interface ManageFleetViewProps {
  fleet: Fleet;
  onUpdate: (newFleet: Fleet) => void;
}

const inputCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

// Simple modal component
const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true"></div>
      <div className="relative w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900" id="modal-title">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">{children}</div>
      </div>
    </div>
  );
};

const money = (n?: number) => `$${(n || 0).toFixed(2)}`;

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
  const [query, setQuery] = useState('');

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

  const q = query.trim().toLowerCase();
  const visible: FleetVehicle[] = (fleet as FleetVehicle[]).filter(v => !q || [v.modelName, v.licensePlate, v.category, v.sippCode, v.transmission]
    .some(s => (s || '').toString().toLowerCase().includes(q)));

  const today = new Date().toISOString().slice(0, 10);
  const regBadge = (d?: string) => {
    if (!d) return <span className="text-slate-400">—</span>;
    const expired = d < today;
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${expired ? 'bg-rose-50 text-rose-700 ring-rose-600/20' : 'bg-slate-50 text-slate-700 ring-slate-500/20'}`}>
        {expired ? 'Expired ' : ''}{d}
      </span>
    );
  };

  const actionBtns = (vehicle: FleetVehicle) => (
    <div className="flex items-center gap-1 shrink-0">
      <button onClick={() => openEditModal(vehicle)} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" title="Edit" aria-label={`Edit ${vehicle.modelName}`}>
        <PencilIcon className="w-4 h-4" />
      </button>
      <button onClick={() => handleDelete(vehicle.id)} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="Delete" aria-label={`Delete ${vehicle.modelName}`}>
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="space-y-5 mb-10">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <CarIcon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Fleet management</h2>
            <p className="text-sm text-slate-500">{fleet.length} vehicle{fleet.length === 1 ? '' : 's'} · deposits, excess and registration details</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
          <div className="relative w-full sm:w-64">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search model, plate, category"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2">
            <button
              onClick={() => setShowImport(!showImport)}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border ${showImport ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              <UploadIcon className="w-4 h-4" />
              Import Excel
            </button>
            <button
              onClick={openAddModal}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700"
            >
              <PlusIcon className="w-4 h-4" />
              Add vehicle
            </button>
          </div>
        </div>
      </div>

      {showImport && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Import vehicles from Excel</h3>
            <button onClick={() => setShowImport(false)} aria-label="Close import" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><CloseIcon className="w-4 h-4" /></button>
          </div>
          <FleetExcelUpload onFleetImported={handleImport} />
        </section>
      )}

      {fleet.length === 0 || visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-14 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
            <CarIcon className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-slate-900">{fleet.length === 0 ? 'No vehicles in fleet' : 'No vehicles match your search'}</p>
          <p className="text-sm text-slate-500 mt-1">{fleet.length === 0 ? 'Add a vehicle or import your fleet from an Excel sheet.' : 'Try a different model, plate or category.'}</p>
          {fleet.length === 0 && (
            <button onClick={openAddModal} className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700">
              <PlusIcon className="w-4 h-4" /> Add vehicle
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3">Vehicle</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">SIPP</th>
                    <th className="px-4 py-3">Transmission</th>
                    <th className="px-4 py-3 text-right">Deposit</th>
                    <th className="px-4 py-3 text-right">Excess</th>
                    <th className="px-4 py-3">Reg. expiry</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map(vehicle => (
                    <tr key={vehicle.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-900">{vehicle.modelName}</p>
                        <p className="text-xs text-slate-500 font-mono">{vehicle.licensePlate}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{vehicle.category || <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-3 text-slate-700 font-mono text-xs">{vehicle.sippCode || <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-3 text-slate-700">{vehicle.transmission || <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{money(vehicle.securityDeposit)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{money(vehicle.excess)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{regBadge(vehicle.registrationExpiry)}</td>
                      <td className="px-4 py-3"><div className="flex justify-end">{actionBtns(vehicle)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {visible.map(vehicle => (
              <div key={vehicle.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900 break-words">{vehicle.modelName}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{vehicle.licensePlate}</p>
                  </div>
                  {actionBtns(vehicle)}
                </div>
                {(vehicle.category || vehicle.transmission || vehicle.sippCode) && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {vehicle.category && <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset bg-indigo-50 text-indigo-700 ring-indigo-600/20">{vehicle.category}</span>}
                    {vehicle.transmission && <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset bg-slate-50 text-slate-700 ring-slate-500/20">{vehicle.transmission}</span>}
                    {vehicle.sippCode && <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset bg-slate-50 text-slate-700 ring-slate-500/20 font-mono">{vehicle.sippCode}</span>}
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-x-2 gap-y-3 mt-3 pt-3 border-t border-slate-100 text-xs">
                  <div className="min-w-0"><dt className="text-slate-500">Deposit</dt><dd className="font-semibold text-slate-900 tabular-nums mt-0.5">{money(vehicle.securityDeposit)}</dd></div>
                  <div className="min-w-0"><dt className="text-slate-500">Excess</dt><dd className="font-semibold text-slate-900 tabular-nums mt-0.5">{money(vehicle.excess)}</dd></div>
                  <div className="min-w-0 col-span-2"><dt className="text-slate-500">Reg. expiry</dt><dd className="mt-0.5">{regBadge(vehicle.registrationExpiry)}</dd></div>
                </dl>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal for add/edit */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingVehicle ? 'Edit vehicle' : 'Add vehicle'}>
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className={labelCls}>Model <span className="text-rose-500">*</span></span>
              <input type="text" value={formData.modelName || ''} onChange={e => handleChange('modelName', e.target.value)} className={inputCls} required />
            </label>
            <label className="block">
              <span className={labelCls}>License plate <span className="text-rose-500">*</span></span>
              <input type="text" value={formData.licensePlate || ''} onChange={e => handleChange('licensePlate', e.target.value)} className={inputCls} required />
            </label>
            <label className="block">
              <span className={labelCls}>Category</span>
              <input type="text" value={formData.category || ''} onChange={e => handleChange('category', e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>SIPP code</span>
              <input type="text" value={formData.sippCode || ''} onChange={e => handleChange('sippCode', e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Security deposit ($)</span>
              <input type="number" inputMode="decimal" value={formData.securityDeposit || 0} onChange={e => handleChange('securityDeposit', parseFloat(e.target.value) || 0)} className={inputCls} min="0" step="0.01" />
            </label>
            <label className="block">
              <span className={labelCls}>Excess ($)</span>
              <input type="number" inputMode="decimal" value={formData.excess || 0} onChange={e => handleChange('excess', parseFloat(e.target.value) || 0)} className={inputCls} min="0" step="0.01" />
            </label>
            <label className="block">
              <span className={labelCls}>Transmission</span>
              <select value={formData.transmission || ''} onChange={e => handleChange('transmission', e.target.value)} className={inputCls}>
                <option value="">Select</option>
                <option value="Automatic">Automatic</option>
                <option value="Manual">Manual</option>
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Registration expiry</span>
              <input type="date" value={formData.registrationExpiry || ''} onChange={e => handleChange('registrationExpiry', e.target.value)} className={inputCls} />
            </label>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-slate-100">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
              Cancel
            </button>
            <button onClick={handleSave} className="px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700">
              {editingVehicle ? 'Save changes' : 'Add vehicle'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ManageFleetView;
