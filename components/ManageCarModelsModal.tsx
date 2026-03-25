import React, { useState, useEffect, useMemo } from 'react';
import { Fleet, Vehicle, TransmissionType } from '../types';
import { PlusIcon, TrashIcon, SaveIcon } from './icons';
import { CAR_CATEGORIES } from '../constants';

interface ManageFleetViewProps {
  fleet: Fleet;
  onUpdate: (newFleet: Fleet) => void;
}

const InputField: React.FC<{
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}> = ({ label, value, onChange, type = 'text', placeholder }) => (
  <div>
    <label className="text-xs font-medium text-gray-500">{label}</label>
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary mt-1"
    />
  </div>
);

const getExpiryStatus = (expiryDate: string) => {
    if (!expiryDate) return { status: 'Unknown', days: null, colorClasses: 'border-l-4 border-gray-300', textBgClasses: 'bg-gray-200 text-gray-700' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
     // Adjust for timezone offset to compare dates correctly
    expiry.setMinutes(expiry.getMinutes() + expiry.getTimezoneOffset());
    
    if (isNaN(expiry.getTime())) return { status: 'Invalid Date', days: null, colorClasses: 'border-l-4 border-gray-300', textBgClasses: 'bg-gray-200 text-gray-700' };
    
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { status: `Expired ${Math.abs(diffDays)} days ago`, days: diffDays, colorClasses: 'border-l-4 border-red-500', textBgClasses: 'bg-red-100 text-red-700' };
    if (diffDays <= 30) return { status: `Expires in ${diffDays} days`, days: diffDays, colorClasses: 'border-l-4 border-red-500', textBgClasses: 'bg-red-100 text-red-700' };
    if (diffDays <= 90) return { status: `Expires in ${diffDays} days`, days: diffDays, colorClasses: 'border-l-4 border-yellow-500', textBgClasses: 'bg-yellow-100 text-yellow-700' };
    return { status: 'OK', days: diffDays, colorClasses: 'border-l-4 border-green-500', textBgClasses: 'bg-green-100 text-green-700' };
};


const ManageFleetView: React.FC<ManageFleetViewProps> = ({ fleet, onUpdate }) => {
  const [localFleet, setLocalFleet] = useState<Fleet>(fleet);
  const [newModel, setNewModel] = useState('');
  const [newPlate, setNewPlate] = useState('');
  const [newSippCode, setNewSippCode] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newTransmission, setNewTransmission] = useState<TransmissionType>(TransmissionType.AUTOMATIC);
  const [newExpiry, setNewExpiry] = useState('');
  const [newDeposit, setNewDeposit] = useState(0);
  const [newExcess, setNewExcess] = useState(0);
  const [error, setError] = useState('');
  
  const uniqueCategories = useMemo(() => {
    const allCategories = new Set([...CAR_CATEGORIES, ...localFleet.map(v => v.category)]);
    return Array.from(allCategories).sort();
  }, [localFleet]);
  
  useEffect(() => {
    setLocalFleet(fleet);
  }, [fleet]);

  const handleAddVehicle = () => {
    if (!newModel.trim() || !newPlate.trim() || !newExpiry.trim() || !newSippCode.trim() || !newCategory.trim() || !newTransmission) {
      setError('Model, Plate, SIPP Code, Category, Transmission, and Expiry are required.');
      return;
    }
    const plateExists = localFleet.some(v => v.licensePlate.trim().toLowerCase() === newPlate.trim().toLowerCase());
    if (plateExists) {
      setError('A vehicle with this license plate already exists.');
      return;
    }
    
    setError('');

    const newVehicle: Vehicle = {
      id: `vehicle-${Date.now()}`,
      modelName: newModel.trim(),
      licensePlate: newPlate.trim(),
      registrationExpiry: newExpiry,
      category: newCategory.trim(),
      securityDeposit: newDeposit,
      excess: newExcess,
      sippCode: newSippCode.trim().toUpperCase(),
      transmission: newTransmission,
    };
    setLocalFleet(prev => [...prev, newVehicle]);
    setNewModel('');
    setNewPlate('');
    setNewSippCode('');
    setNewExpiry('');
    setNewCategory('');
    setNewTransmission(TransmissionType.AUTOMATIC);
    setNewDeposit(0);
    setNewExcess(0);
  };

  const handleDeleteVehicle = (id: string) => {
    setLocalFleet(prev => prev.filter(v => v.id !== id));
  };
  
  const handleVehicleChange = (id: string, field: keyof Omit<Vehicle, 'id'>, value: string | number) => {
    setLocalFleet(prev => prev.map(v => 
        v.id === id ? { ...v, [field]: value } : v
    ));
  };

  const handleSaveChanges = () => {
    const licensePlates = new Set<string>();
    for (const vehicle of localFleet) {
      const plate = vehicle.licensePlate.trim().toLowerCase();
      if (!plate || !vehicle.modelName.trim() || !vehicle.registrationExpiry || !vehicle.sippCode?.trim() || !vehicle.category.trim() || !vehicle.transmission) {
        alert(`Vehicle "${vehicle.modelName} / ${vehicle.licensePlate}" has missing required fields (including SIPP code, category, and transmission).`);
        return;
      }
      if (licensePlates.has(plate)) {
        alert(`Duplicate license plate found: "${vehicle.licensePlate}". All license plates must be unique.`);
        return;
      }
      if (vehicle.securityDeposit < 0 || vehicle.excess < 0) {
        alert(`Deposit and excess for "${vehicle.modelName} / ${vehicle.licensePlate}" cannot be negative.`);
        return;
      }
      licensePlates.add(plate);
    }
    onUpdate(localFleet);
  };

  const handleCancel = () => {
    setLocalFleet(fleet);
  };

  const sortedFleet = [...localFleet].sort((a,b) => a.modelName.localeCompare(b.modelName) || a.licensePlate.localeCompare(b.licensePlate));

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 w-full max-w-7xl mx-auto">
        <header className="mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Manage Fleet</h2>
        </header>

        <div>
           <div className="mb-8 p-4 bg-slate-50 rounded-lg border">
            <h3 className="text-lg font-semibold text-gray-700 mb-3">Add New Vehicle</h3>
            <datalist id="category-options">
              {uniqueCategories.map(cat => <option key={cat} value={cat} />)}
            </datalist>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-end">
                <InputField label="Model Name" value={newModel} onChange={setNewModel} placeholder="e.g., Toyota Camry" />
                <InputField label="License Plate" value={newPlate} onChange={setNewPlate} placeholder="e.g., 10-12345" />
                <InputField label="SIPP Code" value={newSippCode} onChange={setNewSippCode} placeholder="e.g., CDAR" />
                <div>
                  <label className="text-xs font-medium text-gray-500">Category</label>
                  <input
                    list="category-options"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    placeholder="Select or type new"
                    className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary mt-1"
                  />
                </div>
                <div>
                    <label className="text-xs font-medium text-gray-500">Transmission</label>
                    <select value={newTransmission} onChange={e => setNewTransmission(e.target.value as TransmissionType)} className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary mt-1">
                        <option value={TransmissionType.AUTOMATIC}>Automatic</option>
                        <option value={TransmissionType.MANUAL}>Manual</option>
                    </select>
                </div>
                <InputField label="Reg. Expiry" type="date" value={newExpiry} onChange={setNewExpiry} />
                <InputField label="Deposit ($)" type="number" value={newDeposit || ''} onChange={v => setNewDeposit(parseFloat(v) || 0)} placeholder="0" />
                <InputField label="Excess ($)" type="number" value={newExcess || ''} onChange={v => setNewExcess(parseFloat(v) || 0)} placeholder="0" />
                <button onClick={handleAddVehicle} className="flex items-center justify-center gap-2 px-4 py-2 bg-secondary text-white rounded-md hover:bg-primary h-[42px]">
                  <PlusIcon /> Add Vehicle
                </button>
            </div>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </div>

          <div className="space-y-6">
            {sortedFleet.map((vehicle) => {
              const expiryStatus = getExpiryStatus(vehicle.registrationExpiry);
              return (
              <div key={vehicle.id} className={`bg-white rounded-lg shadow-md overflow-hidden transition-shadow hover:shadow-lg ${expiryStatus.colorClasses}`}>
                <div className="p-4 bg-slate-50/70 flex justify-between items-start gap-4 border-b">
                    <div className="flex-grow">
                        <h3 className="text-xl font-bold text-slate-800 font-serif-professional">{vehicle.modelName}</h3>
                        <p className="font-mono text-sm text-slate-500">{vehicle.licensePlate}</p>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0 gap-2">
                         <span className={`text-xs font-bold px-2 py-1 rounded-full ${expiryStatus.textBgClasses}`}>
                            {expiryStatus.status}
                         </span>
                         <button onClick={() => handleDeleteVehicle(vehicle.id)} className="text-gray-400 hover:text-red-600 p-1" aria-label={`Delete ${vehicle.modelName}`}>
                             <TrashIcon className="h-5 w-5"/>
                         </button>
                    </div>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <InputField label="Model Name" value={vehicle.modelName} onChange={v => handleVehicleChange(vehicle.id, 'modelName', v)} />
                    <InputField label="License Plate" value={vehicle.licensePlate} onChange={v => handleVehicleChange(vehicle.id, 'licensePlate', v)} />
                    <InputField label="SIPP Code" value={vehicle.sippCode || ''} onChange={v => handleVehicleChange(vehicle.id, 'sippCode', v.toUpperCase())} />
                    <div>
                      <label className="text-xs font-medium text-gray-500">Category</label>
                      <input
                        list="category-options"
                        value={vehicle.category}
                        onChange={e => handleVehicleChange(vehicle.id, 'category', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary mt-1"
                      />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-500">Transmission</label>
                        <select value={vehicle.transmission} onChange={e => handleVehicleChange(vehicle.id, 'transmission', e.target.value as TransmissionType)} className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary mt-1">
                            <option value={TransmissionType.AUTOMATIC}>Automatic</option>
                            <option value={TransmissionType.MANUAL}>Manual</option>
                        </select>
                    </div>
                    <InputField label="Reg. Expiry" type="date" value={vehicle.registrationExpiry} onChange={v => handleVehicleChange(vehicle.id, 'registrationExpiry', v)} />
                    <InputField label="Deposit ($)" type="number" value={vehicle.securityDeposit} onChange={v => handleVehicleChange(vehicle.id, 'securityDeposit', parseFloat(v) || 0)} />
                    <InputField label="Excess ($)" type="number" value={vehicle.excess} onChange={v => handleVehicleChange(vehicle.id, 'excess', parseFloat(v) || 0)} />
                </div>
              </div>
            )})}
             {sortedFleet.length === 0 && (
                <div className="text-center py-10 text-gray-500 border-2 border-dashed rounded-lg">No vehicles configured.</div>
            )}
          </div>
        </div>
        <footer className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2 mt-6 -mx-4 sm:-mx-6 -mb-6 rounded-b-lg">
            <button
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary text-sm font-medium"
            >
                Cancel
            </button>
            <button
                onClick={handleSaveChanges}
                className="px-6 py-2 bg-primary text-white rounded-md hover:bg-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary text-sm font-medium flex items-center gap-2"
            >
                <SaveIcon /> Save Changes
            </button>
        </footer>
    </div>
  );
};

export default ManageFleetView;