import React, { useState } from 'react';
import { PlusIcon, TrashIcon } from './icons';
import { RentalSource, PaymentType } from '../types';

interface ManageSourcesViewProps {
  sources: RentalSource[];
  onAdd: (source: RentalSource) => void;
  onDelete: (sourceId: string) => void;
  onUpdate: (source: RentalSource) => void;
}

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

  return (
    <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
      <header className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Manage Rental Sources</h2>
        <p className="text-sm text-gray-500 mt-1">Configure sources and specify if they are prepaid to auto-generate invoices.</p>
      </header>
      
      {/* Add New Source Form */}
      <div className="p-4 bg-gray-50 rounded-lg border mb-6">
        <h3 className="font-semibold text-gray-700 mb-2">Add New Source</h3>
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-2">
            <div className="flex-grow w-full">
                <label htmlFor="new-source-name" className="text-xs font-medium text-gray-600">Source Name</label>
                <input
                    id="new-source-name"
                    type="text"
                    value={newSourceName}
                    onChange={(e) => setNewSourceName(e.target.value)}
                    placeholder="e.g., Corporate Partner"
                    className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
                />
            </div>
            <div className="w-full sm:w-auto">
                 <label htmlFor="new-source-type" className="text-xs font-medium text-gray-600">Payment Type</label>
                <select 
                    id="new-source-type"
                    value={newSourceType} 
                    onChange={e => setNewSourceType(e.target.value as PaymentType)}
                    className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
                >
                    <option value={PaymentType.PAY_ON_ARRIVAL}>Pay on Arrival</option>
                    <option value={PaymentType.PREPAID}>Prepaid</option>
                </select>
            </div>
            <button
                onClick={handleAddClick}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-secondary text-white rounded-md hover:bg-primary transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary text-sm font-medium w-full sm:w-auto"
                aria-label="Add source"
            >
                <PlusIcon />
                Add
            </button>
        </div>
      </div>

      {/* Existing Sources Table */}
       <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Type</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                {sources.map((source) => (
                    <tr key={source.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-800">{source.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <select 
                            value={source.paymentType} 
                            onChange={e => handleTypeChange(source, e.target.value as PaymentType)}
                            className="w-full p-1.5 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary bg-white"
                        >
                            <option value={PaymentType.PAY_ON_ARRIVAL}>Pay on Arrival</option>
                            <option value={PaymentType.PREPAID}>Prepaid</option>
                        </select>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                        <button
                            onClick={() => onDelete(source.id)}
                            className="text-gray-400 hover:text-red-600 transition-colors p-1"
                            aria-label={`Delete ${source.name}`}
                        >
                            <TrashIcon />
                        </button>
                    </td>
                    </tr>
                ))}
                {sources.length === 0 && (
                    <tr>
                        <td colSpan={3} className="text-center py-6 text-gray-500">No rental sources configured.</td>
                    </tr>
                )}
                </tbody>
            </table>
        </div>
    </div>
  );
};

export default ManageSourcesView;