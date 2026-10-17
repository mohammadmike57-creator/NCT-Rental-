import React, { useState, useEffect } from 'react';
import { AvailableExtra } from '../types';
import { PlusIcon, TrashIcon, SaveIcon, PlusCircleIcon } from './icons';

interface ManageExtrasViewProps {
  extras: AvailableExtra[];
  onUpdate: (newExtras: AvailableExtra[]) => void;
}

const inputCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none';

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

  const isDirty = JSON.stringify(localExtras) !== JSON.stringify(extras);

  return (
    <>
      <div className="space-y-5 mb-10 max-w-4xl">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <PlusCircleIcon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Rental extras</h2>
            <p className="text-sm text-slate-500">Add-ons offered with a rental and their default daily price.</p>
          </div>
        </div>

        {/* Add form */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Add an extra</h3>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-3 sm:items-end">
            <label className="block" htmlFor="new-extra-name">
              <span className="block text-sm font-medium text-slate-700 mb-1">Extra name</span>
              <input
                id="new-extra-name" type="text" value={newExtraName} onChange={e => setNewExtraName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                placeholder="e.g. Full Insurance"
                className={inputCls}
              />
            </label>
            <label className="block" htmlFor="new-extra-price">
              <span className="block text-sm font-medium text-slate-700 mb-1">Default daily price ($)</span>
              <input
                id="new-extra-price" type="number" inputMode="decimal" value={newExtraPrice || ''} onChange={e => setNewExtraPrice(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className={inputCls}
              />
            </label>
            <button onClick={handleAdd} disabled={!newExtraName.trim()} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-40 w-full sm:w-auto">
              <PlusIcon className="w-4 h-4" /> Add extra
            </button>
          </div>
        </section>

        {/* List + save bar */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Configured extras</h3>
            <span className="text-xs text-slate-400">{localExtras.length}</span>
          </div>

          {localExtras.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                <PlusCircleIcon className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-900">No extras configured</p>
              <p className="text-sm text-slate-500 mt-1">Add items like insurance, child seats or GPS above.</p>
            </div>
          ) : (
            <>
              <div className="hidden sm:grid grid-cols-[1fr_180px_44px] gap-3 px-5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <span>Name</span><span>Daily price ($)</span><span />
              </div>
              <ul className="divide-y divide-slate-100 sm:divide-y-0">
                {localExtras.map(ext => (
                  <li key={ext.id} className="px-5 py-4 sm:py-2 grid grid-cols-1 sm:grid-cols-[1fr_180px_44px] gap-3 sm:items-center">
                    <label className="block">
                      <span className="sm:hidden block text-xs font-medium text-slate-500 mb-1">Name</span>
                      <input
                        type="text" value={ext.name} onChange={e => handleUpdateField(ext.id, 'name', e.target.value)}
                        aria-label="Extra name"
                        className={inputCls}
                      />
                    </label>
                    <div className="flex items-end gap-2">
                      <label className="block flex-1">
                        <span className="sm:hidden block text-xs font-medium text-slate-500 mb-1">Daily price ($)</span>
                        <input
                          type="number" inputMode="decimal" value={ext.defaultDailyPrice} onChange={e => handleUpdateField(ext.id, 'defaultDailyPrice', parseFloat(e.target.value) || 0)}
                          aria-label="Default daily price"
                          className={inputCls}
                        />
                      </label>
                      <button onClick={() => handleDelete(ext.id)} className="sm:hidden p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200" aria-label={`Delete ${ext.name}`}>
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <button onClick={() => handleDelete(ext.id)} className="hidden sm:inline-flex justify-center p-2.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50" aria-label={`Delete ${ext.name}`} title="Delete extra">
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
              <button onClick={() => setLocalExtras(extras)} className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleSave} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700">
                <SaveIcon className="w-4 h-4" /> Save changes
              </button>
            </div>
          </div>
        </section>
      </div>

      {extraToDelete && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setExtraToDelete(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
              <TrashIcon className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Delete extra</h3>
            <p className="text-sm text-slate-500 mt-1">Remove "{extraToDelete.name}" from the list? Click Save changes afterwards to apply.</p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6">
              <button onClick={() => setExtraToDelete(null)} className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2.5 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ManageExtrasView;
