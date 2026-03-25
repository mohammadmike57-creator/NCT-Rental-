import React, { useState, useEffect } from 'react';
import { AvailableExtra } from '../types';
import { PlusIcon, TrashIcon, SaveIcon } from './icons';

interface ManageExtrasViewProps {
  extras: AvailableExtra[];
  onUpdate: (newExtras: AvailableExtra[]) => void;
}

const ManageExtrasView: React.FC<ManageExtrasViewProps> = ({ extras, onUpdate }) => {
  const [localExtras, setLocalExtras] = useState<AvailableExtra[]>([]);
  const [newExtraName, setNewExtraName] = useState('');
  const [newExtraPrice, setNewExtraPrice] = useState(0);
  const [extraToDelete, setExtraToDelete] = useState<AvailableExtra | null>(null);

  useEffect(() => {
    console.log('ManageExtrasView: extras prop changed', extras);
    setLocalExtras(JSON.parse(JSON.stringify(extras)));
  }, [extras]);

  const handleAdd = () => {
    if (newExtraName.trim() && newExtraPrice >= 0) {
      const newExtra: AvailableExtra = {
        id: `extra-${Date.now()}`,
        name: newExtraName.trim(),
        defaultDailyPrice: newExtraPrice,
        pricePerDay: newExtraPrice,
      };
      setLocalExtras(prev => [...prev, newExtra]);
      setNewExtraName('');
      setNewExtraPrice(0);
    }
  };

  const handleDelete = (id: string) => {
    const toDelete = localExtras.find(ext => ext.id === id);
    if (toDelete) setExtraToDelete(toDelete);
  };

  const confirmDelete = () => {
    if (extraToDelete) {
      setLocalExtras(prev => prev.filter(ext => ext.id !== extraToDelete.id));
      setExtraToDelete(null);
    }
  };

  const handleUpdateField = (id: string, field: 'name' | 'defaultDailyPrice', value: string | number) => {
    setLocalExtras(prev =>
      prev.map(ext => (ext.id === id ? { ...ext, [field]: value, pricePerDay: value } : ext))
    );
  };

  const handleSave = () => {
    console.log('ManageExtrasView: handleSave called, localExtras:', localExtras);
    onUpdate(localExtras);
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
        <header className="mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Manage Rental Extras</h2>
          <p className="text-sm text-gray-500 mt-1">Add, edit, or remove available extras and their default prices.</p>
        </header>

        <div className="p-4 bg-gray-50 rounded-lg border mb-6 space-y-3">
          <h3 className="font-semibold text-gray-700">Add New Extra</h3>
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto] gap-4 items-end">
            <div>
              <label htmlFor="new-extra-name" className="text-xs font-medium text-gray-600">Extra Name</label>
              <input
                id="new-extra-name" type="text" value={newExtraName} onChange={e => setNewExtraName(e.target.value)}
                placeholder="e.g., Full Insurance"
                className="w-full p-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label htmlFor="new-extra-price" className="text-xs font-medium text-gray-600">Default Daily Price ($)</label>
              <input
                id="new-extra-price" type="number" value={newExtraPrice || ''} onChange={e => setNewExtraPrice(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full p-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <button onClick={handleAdd} className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-md hover:bg-primary text-sm h-[42px]">
              <PlusIcon /> Add
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {localExtras.map(ext => (
            <div key={ext.id} className="grid grid-cols-[2fr_1fr_auto] items-center gap-2 bg-gray-50 p-2 rounded-md">
              <input
                type="text" value={ext.name} onChange={e => handleUpdateField(ext.id, 'name', e.target.value)}
                className="w-full p-1 border border-gray-200 rounded-md text-sm"
              />
              <input
                type="number" value={ext.defaultDailyPrice} onChange={e => handleUpdateField(ext.id, 'defaultDailyPrice', parseFloat(e.target.value) || 0)}
                className="w-full p-1 border border-gray-200 rounded-md text-sm"
              />
              <button onClick={() => handleDelete(ext.id)} className="text-gray-400 hover:text-red-600 p-1">
                <TrashIcon />
              </button>
            </div>
          ))}
          {localExtras.length === 0 && <p className="text-center py-4 text-gray-500">No extras configured.</p>}
        </div>

        <footer className="mt-6 flex justify-end gap-2">
          <button onClick={() => setLocalExtras(extras)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">
            Cancel
          </button>
          <button onClick={handleSave} className="px-6 py-2 bg-primary text-white rounded-md hover:bg-secondary flex items-center gap-2">
            <SaveIcon /> Save Changes
          </button>
        </footer>
      </div>

      {extraToDelete && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold mb-4">Delete Extra</h3>
            <p>Are you sure you want to delete "{extraToDelete.name}"?</p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setExtraToDelete(null)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white rounded">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ManageExtrasView;
