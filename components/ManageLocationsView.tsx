import React, { useState } from 'react';
import { RentalLocation } from '../types';
import { PlusIcon, TrashIcon, SaveIcon } from './icons';
import SecurityKeyModal from './SecurityKeyModal';

interface ManageLocationsViewProps {
  locations: RentalLocation[];
  onUpdate: (newLocations: RentalLocation[]) => void;
}

const ManageLocationsView: React.FC<ManageLocationsViewProps> = ({ locations, onUpdate }) => {
  const [localLocations, setLocalLocations] = useState<RentalLocation[]>(locations);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationAddress, setNewLocationAddress] = useState('');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);

  const handleAdd = () => {
    if (newLocationName.trim() && newLocationAddress.trim()) {
      const newLocation: RentalLocation = {
        id: `loc-${Date.now()}`,
        name: newLocationName.trim(),
        address: newLocationAddress.trim(),
      };
      setLocalLocations(prev => [...prev, newLocation]);
      setNewLocationName('');
      setNewLocationAddress('');
    }
  };

  const handleDelete = (id: string) => {
    setLocalLocations(prev => prev.filter(loc => loc.id !== id));
  };

  const handleUpdateField = (id: string, field: 'name' | 'address', value: string) => {
    setLocalLocations(prev => prev.map(loc => (loc.id === id ? { ...loc, [field]: value } : loc)));
  };

  const handleSaveAttempt = () => setIsKeyModalOpen(true);

  const handleKeySuccess = () => {
    onUpdate(localLocations);
    setIsKeyModalOpen(false);
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
        <header className="mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Manage Rental Locations</h2>
          <p className="text-sm text-gray-500 mt-1">Add, edit, or remove your company's pickup and drop-off branches.</p>
        </header>

        <div className="p-4 bg-gray-50 rounded-lg border mb-6 space-y-3">
            <h3 className="font-semibold text-gray-700">Add New Location</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div>
                    <label htmlFor="new-loc-name" className="text-xs font-medium text-gray-600">Location Name</label>
                    <input
                        id="new-loc-name" type="text" value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)}
                        placeholder="e.g., Airport Office"
                        className="w-full p-2 border border-gray-300 rounded-md text-sm"
                    />
                 </div>
                 <div>
                    <label htmlFor="new-loc-address" className="text-xs font-medium text-gray-600">Address</label>
                    <input
                       id="new-loc-address" type="text" value={newLocationAddress} onChange={(e) => setNewLocationAddress(e.target.value)}
                       placeholder="e.g., Queen Alia Intl Airport, Arrivals"
                       className="w-full p-2 border border-gray-300 rounded-md text-sm"
                    />
                 </div>
            </div>
            <div className="text-right">
                <button onClick={handleAdd} className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-md hover:bg-primary text-sm ml-auto">
                    <PlusIcon /> Add
                </button>
            </div>
        </div>
        
        <div className="space-y-2">
            {localLocations.map(loc => (
                <div key={loc.id} className="grid grid-cols-[1fr_2fr_auto] items-center gap-2 bg-gray-50 p-2 rounded-md">
                    <input
                        type="text" value={loc.name} onChange={e => handleUpdateField(loc.id, 'name', e.target.value)}
                        className="w-full p-1 border border-gray-200 rounded-md text-sm"
                    />
                    <input
                        type="text" value={loc.address} onChange={e => handleUpdateField(loc.id, 'address', e.target.value)}
                        className="w-full p-1 border border-gray-200 rounded-md text-sm"
                    />
                    <button onClick={() => handleDelete(loc.id)} className="text-gray-400 hover:text-red-600 p-1">
                        <TrashIcon />
                    </button>
                </div>
            ))}
            {localLocations.length === 0 && (
                <p className="text-center py-4 text-gray-500">No locations configured.</p>
            )}
        </div>

        <footer className="mt-6 flex justify-end gap-2">
            <button onClick={() => setLocalLocations(locations)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">
                Cancel
            </button>
            <button onClick={handleSaveAttempt} className="px-6 py-2 bg-primary text-white rounded-md hover:bg-secondary flex items-center gap-2">
                <SaveIcon /> Save Changes
            </button>
        </footer>
      </div>
      {isKeyModalOpen && <SecurityKeyModal onSuccess={handleKeySuccess} onClose={() => setIsKeyModalOpen(false)} />}
    </>
  );
};

export default ManageLocationsView;
