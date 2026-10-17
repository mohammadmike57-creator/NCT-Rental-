import React, { useState } from 'react';
import { CompanyDetails } from '../types';
import { TrashIcon, BuildingOfficeIcon, SaveIcon, AlertIcon } from './icons';

interface ManageCompanyDetailsViewProps {
  details: CompanyDetails;
  onUpdate: (newDetails: CompanyDetails) => void;
  onDeleteAllReservations: () => void;
}

const inputCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none';

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

  const field = (label: string, key: keyof CompanyDetails, opts: { type?: string; placeholder?: string; full?: boolean } = {}) => (
    <label className={`block ${opts.full ? 'sm:col-span-2' : ''}`}>
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <input
        type={opts.type || 'text'}
        value={(formData[key] as any) || ''}
        onChange={e => handleChange(key, e.target.value)}
        placeholder={opts.placeholder}
        className={inputCls}
      />
    </label>
  );

  return (
    <div className="space-y-5 mb-10 max-w-4xl">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <BuildingOfficeIcon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Company details</h2>
            <p className="text-sm text-slate-500">Business information printed on agreements, invoices and customer emails.</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 w-full sm:w-auto shrink-0"
        >
          <SaveIcon className="w-4 h-4" />
          Save changes
        </button>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 space-y-6">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Identity</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('Company name', 'name')}
              {field('Sub name', 'subName')}
              {field('Tax number', 'taxNumber')}
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('Address', 'address', { full: true })}
              {field('Phone', 'phone', { type: 'tel' })}
              {field('Email', 'email', { type: 'email' })}
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Payments</h3>
            <label htmlFor="requirePaymentApproval" className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                id="requirePaymentApproval"
                checked={formData.requirePaymentApproval || false}
                onChange={e => handleChange('requirePaymentApproval', e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900">Require payment approval</span>
                <span className="block text-xs text-slate-500 mt-0.5">Pay-on-arrival reservations need a payment approval before they are finalised.</span>
              </span>
            </label>
          </div>
        </div>

        <div className="sticky bottom-0 px-5 py-4 bg-slate-50/95 backdrop-blur border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-slate-500">Changes apply to newly generated documents.</p>
          <button
            onClick={handleSave}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700"
          >
            <SaveIcon className="w-4 h-4" />
            Save changes
          </button>
        </div>
      </section>

      {/* Danger zone */}
      <section className="bg-white rounded-2xl border border-rose-200 shadow-sm p-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-rose-600 mb-3">Danger zone</h3>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <AlertIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Delete all reservations</p>
              <p className="text-sm text-slate-500">Permanently removes every reservation in the system. This cannot be undone.</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to delete ALL reservations? This action cannot be undone.')) {
                onDeleteAllReservations();
              }
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700 w-full sm:w-auto shrink-0"
          >
            <TrashIcon className="w-4 h-4" />
            Delete all reservations
          </button>
        </div>
      </section>
    </div>
  );
};

export default ManageCompanyDetailsView;
