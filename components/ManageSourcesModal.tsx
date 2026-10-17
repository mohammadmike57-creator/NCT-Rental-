import React, { useState } from 'react';
import { PlusIcon, TrashIcon, GlobeAltIcon } from './icons';
import { RentalSource, PaymentType } from '../types';

interface ManageSourcesViewProps {
  sources: RentalSource[];
  onAdd: (source: RentalSource) => void;
  onDelete: (sourceId: string) => void;
  onUpdate: (source: RentalSource) => void;
}

const inputCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none';

const PaymentPill: React.FC<{ type: PaymentType }> = ({ type }) => (
  type === PaymentType.PREPAID
    ? <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset bg-emerald-50 text-emerald-700 ring-emerald-600/20">Prepaid</span>
    : <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset bg-amber-50 text-amber-700 ring-amber-600/20">Pay on arrival</span>
);

const ManageSourcesView: React.FC<ManageSourcesViewProps> = ({ sources, onAdd, onDelete, onUpdate }) => {
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceType, setNewSourceType] = useState<PaymentType>(PaymentType.PAY_ON_ARRIVAL);

  const handleAddClick = () => {
    if (newSourceName.trim()) {
      const newSource: RentalSource = {
        id: `src-${Date.now()}`,
        name: newSourceName.trim(),
        paymentType: newSourceType,
      };
      onAdd(newSource);
      setNewSourceName('');
      setNewSourceType(PaymentType.PAY_ON_ARRIVAL);
    }
  };

  const handleTypeChange = (source: RentalSource, newPaymentType: PaymentType) => {
    onUpdate({ ...source, paymentType: newPaymentType });
  };

  const prepaidCount = sources.filter(s => s.paymentType === PaymentType.PREPAID).length;

  return (
    <div className="space-y-5 mb-10 max-w-4xl">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
          <GlobeAltIcon className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Website sources</h2>
          <p className="text-sm text-slate-500">
            Booking channels and how they are paid. Prepaid sources auto-generate invoices.
            {sources.length > 0 && <span className="text-slate-400"> · {sources.length} source{sources.length === 1 ? '' : 's'}, {prepaidCount} prepaid</span>}
          </p>
        </div>
      </div>

      {/* Add form */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Add a source</h3>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px_auto] gap-3 sm:items-end">
          <label className="block" htmlFor="new-source-name">
            <span className="block text-sm font-medium text-slate-700 mb-1">Source name</span>
            <input
              id="new-source-name"
              type="text"
              value={newSourceName}
              onChange={(e) => setNewSourceName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddClick(); }}
              placeholder="e.g. Corporate Partner"
              className={inputCls}
            />
          </label>
          <label className="block" htmlFor="new-source-type">
            <span className="block text-sm font-medium text-slate-700 mb-1">Payment type</span>
            <select
              id="new-source-type"
              value={newSourceType}
              onChange={e => setNewSourceType(e.target.value as PaymentType)}
              className={inputCls}
            >
              <option value={PaymentType.PAY_ON_ARRIVAL}>Pay on arrival</option>
              <option value={PaymentType.PREPAID}>Prepaid</option>
            </select>
          </label>
          <button
            onClick={handleAddClick}
            disabled={!newSourceName.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-40 w-full sm:w-auto"
            aria-label="Add source"
          >
            <PlusIcon className="w-4 h-4" />
            Add source
          </button>
        </div>
      </section>

      {/* List */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Configured sources</h3>
          <span className="text-xs text-slate-400">{sources.length}</span>
        </div>
        {sources.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
              <GlobeAltIcon className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-900">No sources yet</p>
            <p className="text-sm text-slate-500 mt-1">Add your first booking channel using the form above.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sources.map((source) => (
              <li key={source.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-start sm:items-center justify-between gap-3 flex-1 min-w-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 break-words">{source.name}</p>
                    <div className="mt-1"><PaymentPill type={source.paymentType} /></div>
                  </div>
                  <button
                    onClick={() => onDelete(source.id)}
                    className="sm:hidden p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                    aria-label={`Delete ${source.name}`}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={source.paymentType}
                    onChange={e => handleTypeChange(source, e.target.value as PaymentType)}
                    aria-label={`Payment type for ${source.name}`}
                    className={`${inputCls} sm:w-48`}
                  >
                    <option value={PaymentType.PAY_ON_ARRIVAL}>Pay on arrival</option>
                    <option value={PaymentType.PREPAID}>Prepaid</option>
                  </select>
                  <button
                    onClick={() => onDelete(source.id)}
                    className="hidden sm:inline-flex p-2.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                    aria-label={`Delete ${source.name}`}
                    title="Delete source"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default ManageSourcesView;
