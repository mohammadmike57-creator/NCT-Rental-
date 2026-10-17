import React, { useState } from 'react';
import { RentalLocation } from '../types';
import { PlusIcon, TrashIcon, SaveIcon, MapPinIcon } from './icons';
import SecurityKeyModal from './SecurityKeyModal';

interface ManageLocationsViewProps {
  locations: RentalLocation[];
  onUpdate: (newLocations: RentalLocation[]) => void;
}

const inputCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none';

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

  const isDirty = JSON.stringify(localLocations) !== JSON.stringify(locations);

  return (
    <>
      <div className="space-y-5 mb-10 max-w-4xl">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <MapPinIcon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Rental locations</h2>
            <p className="text-sm text-slate-500">Your pickup and drop-off branches. Saving requires the security key.</p>
          </div>
        </div>

        {/* Add form */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Add a location</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block" htmlFor="new-loc-name">
              <span className="block text-sm font-medium text-slate-700 mb-1">Location name</span>
              <input
                id="new-loc-name" type="text" value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)}
                placeholder="e.g. Airport Office"
                className={inputCls}
              />
            </label>
            <label className="block" htmlFor="new-loc-address">
              <span className="block text-sm font-medium text-slate-700 mb-1">Address</span>
              <input
                id="new-loc-address" type="text" value={newLocationAddress} onChange={(e) => setNewLocationAddress(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                placeholder="e.g. Queen Alia Intl Airport, Arrivals"
                className={inputCls}
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={handleAdd} disabled={!newLocationName.trim() || !newLocationAddress.trim()} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-40 w-full sm:w-auto">
              <PlusIcon className="w-4 h-4" /> Add location
            </button>
          </div>
        </section>

        {/* List + save bar */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Branches</h3>
            <span className="text-xs text-slate-400">{localLocations.length}</span>
          </div>

          {localLocations.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                <MapPinIcon className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-900">No locations configured</p>
              <p className="text-sm text-slate-500 mt-1">Add your first pickup or drop-off branch above.</p>
            </div>
          ) : (
            <>
              <div className="hidden md:grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_44px] gap-3 px-5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <span>Name</span><span>Address</span><span />
              </div>
              <ul className="divide-y divide-slate-100 md:divide-y-0">
                {localLocations.map(loc => (
                  <li key={loc.id} className="px-5 py-4 md:py-2 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_44px] gap-3 md:items-center">
                    <div className="flex items-end gap-2">
                      <label className="block flex-1 min-w-0">
                        <span className="md:hidden block text-xs font-medium text-slate-500 mb-1">Name</span>
                        <input
                          type="text" value={loc.name} onChange={e => handleUpdateField(loc.id, 'name', e.target.value)}
                          aria-label="Location name"
                          className={inputCls}
                        />
                      </label>
                      <button onClick={() => handleDelete(loc.id)} className="md:hidden p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200" aria-label={`Delete ${loc.name}`}>
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <label className="block min-w-0">
                      <span className="md:hidden block text-xs font-medium text-slate-500 mb-1">Address</span>
                      <input
                        type="text" value={loc.address} onChange={e => handleUpdateField(loc.id, 'address', e.target.value)}
                        aria-label="Location address"
                        className={inputCls}
                      />
                    </label>
                    <button onClick={() => handleDelete(loc.id)} className="hidden md:inline-flex justify-center p-2.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50" aria-label={`Delete ${loc.name}`} title="Delete location">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="sticky bottom-0 mt-2 px-5 py-4 bg-slate-50/95 backdrop-blur border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-slate-500">{isDirty ? 'You have unsaved changes.' : 'All changes saved.'}</p>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button onClick={() => setLocalLocations(locations)} className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleSaveAttempt} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700">
                <SaveIcon className="w-4 h-4" /> Save changes
              </button>
            </div>
          </div>
        </section>
      </div>
      {isKeyModalOpen && <SecurityKeyModal onSuccess={handleKeySuccess} onClose={() => setIsKeyModalOpen(false)} />}
    </>
  );
};

export default ManageLocationsView;
