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

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800">Fleet Management</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(!showImport)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Import Excel
          </button>
          <button
            onClick={openAddModal}
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 flex items-center gap-1"
          >
            <PlusCircleIcon className="w-4 h-4" />
            Add Vehicle
          </button>
        </div>
      </div>

      {showImport && (
        <div className="p-4 border-b border-gray-200">
          <FleetExcelUpload onFleetImported={handleImport} />
        </div>
      )}

      {/* Card grid */}
      {fleet.length === 0 ? (
        <div className="p-8 text-center text-gray-500">No vehicles in fleet.</div>
      ) : (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {fleet.map(vehicle => (
            <div
              key={vehicle.id}
              className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-base font-semibold text-gray-900">{vehicle.modelName}</h3>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEditModal(vehicle)}
                      className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                      title="Edit"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(vehicle.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Plate:</span>
                    <span className="font-medium">{vehicle.licensePlate}</span>
                  </div>
                  {vehicle.category && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Category:</span>
                      <span>{vehicle.category}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Deposit:</span>
                    <span>${vehicle.securityDeposit?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Excess:</span>
                    <span>${vehicle.excess?.toFixed(2)}</span>
                  </div>
                  {vehicle.sippCode && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">SIPP:</span>
                      <span>{vehicle.sippCode}</span>
                    </div>
                  )}
                  {vehicle.transmission && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Trans:</span>
                      <span>{vehicle.transmission}</span>
                    </div>
                  )}
                  {vehicle.registrationExpiry && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Reg expiry:</span>
                      <span>{vehicle.registrationExpiry}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for add/edit */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Model *</label>
            <input
              type="text"
              value={formData.modelName || ''}
              onChange={e => handleChange('modelName', e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">License Plate *</label>
            <input
              type="text"
              value={formData.licensePlate || ''}
              onChange={e => handleChange('licensePlate', e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Category</label>
            <input
              type="text"
              value={formData.category || ''}
              onChange={e => handleChange('category', e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Security Deposit ($)</label>
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
            <label className="block text-sm font-medium text-gray-700">Excess ($)</label>
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
            <label className="block text-sm font-medium text-gray-700">SIPP Code</label>
            <input
              type="text"
              value={formData.sippCode || ''}
              onChange={e => handleChange('sippCode', e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Transmission</label>
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
            <label className="block text-sm font-medium text-gray-700">Registration Expiry</label>
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
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
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
