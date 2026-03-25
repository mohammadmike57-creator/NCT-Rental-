import React, { useState } from 'react';
import { CompanyDetails } from '../types';
import { TrashIcon } from './icons';

interface ManageCompanyDetailsViewProps {
  details: CompanyDetails;
  onUpdate: (newDetails: CompanyDetails) => void;
  onDeleteAllReservations: () => void;
}

const ManageCompanyDetailsView: React.FC<ManageCompanyDetailsViewProps> = ({
  details,
  onUpdate,
  onDeleteAllReservations,
}) => {
  const [formData, setFormData] = useState<CompanyDetails>(details);

  const handleChange = (field: keyof CompanyDetails, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onUpdate(formData);
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800">Company Details</h2>
        <button
          onClick={handleSave}
          className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
        >
          Save Changes
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Company Name</label>
          <input
            type="text"
            value={formData.name || ''}
            onChange={e => handleChange('name', e.target.value)}
            className="mt-1 w-full px-3 py-2 border rounded-md"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Sub Name</label>
          <input
            type="text"
            value={formData.subName || ''}
            onChange={e => handleChange('subName', e.target.value)}
            className="mt-1 w-full px-3 py-2 border rounded-md"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Address</label>
          <input
            type="text"
            value={formData.address || ''}
            onChange={e => handleChange('address', e.target.value)}
            className="mt-1 w-full px-3 py-2 border rounded-md"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Phone</label>
          <input
            type="text"
            value={formData.phone || ''}
            onChange={e => handleChange('phone', e.target.value)}
            className="mt-1 w-full px-3 py-2 border rounded-md"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            value={formData.email || ''}
            onChange={e => handleChange('email', e.target.value)}
            className="mt-1 w-full px-3 py-2 border rounded-md"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Tax Number</label>
          <input
            type="text"
            value={formData.taxNumber || ''}
            onChange={e => handleChange('taxNumber', e.target.value)}
            className="mt-1 w-full px-3 py-2 border rounded-md"
          />
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            id="requirePaymentApproval"
            checked={formData.requirePaymentApproval || false}
            onChange={e => handleChange('requirePaymentApproval', e.target.checked)}
            className="h-4 w-4 text-primary rounded border-gray-300"
          />
          <label htmlFor="requirePaymentApproval" className="ml-2 block text-sm text-gray-700">
            Require payment approval for pay‑on‑arrival reservations
          </label>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to delete ALL reservations? This action cannot be undone.')) {
                onDeleteAllReservations();
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            <TrashIcon className="w-4 h-4" />
            Delete All Reservations
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManageCompanyDetailsView;
