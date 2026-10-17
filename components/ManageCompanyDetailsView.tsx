import React, { useState } from 'react';
import { CompanyDetails } from '../types';
import { TrashIcon, SaveIcon } from './icons';
import { Page, PageHeader, Panel, Button, Field, inputCls } from './ui/Crm';

interface ManageCompanyDetailsViewProps {
  details: CompanyDetails;
  onUpdate: (newDetails: CompanyDetails) => void;
  onDeleteAllReservations: () => void;
}

/** Settings row: short description column on the left (lg), content on the right. */
const SettingsSection: React.FC<{ title: string; description: React.ReactNode; children: React.ReactNode; danger?: boolean }> = ({ title, description, children, danger }) => (
  <div className="lg:grid lg:grid-cols-3 lg:gap-6">
    <div className="mb-3 lg:mb-0 lg:pt-1">
      <h3 className={`text-sm font-semibold ${danger ? 'text-rose-700' : 'text-slate-900'}`}>{title}</h3>
      <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>
    </div>
    <div className="lg:col-span-2 min-w-0">{children}</div>
  </div>
);

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
    <Field label={label} className={opts.full ? 'sm:col-span-2' : ''}>
      <input
        type={opts.type || 'text'}
        value={(formData[key] as any) || ''}
        onChange={e => handleChange(key, e.target.value)}
        placeholder={opts.placeholder}
        className={inputCls}
      />
    </Field>
  );

  const saveBar = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <span>Changes apply to newly generated documents.</span>
      <Button variant="primary" size="sm" onClick={handleSave} icon={<SaveIcon className="w-4 h-4" />}>Save changes</Button>
    </div>
  );

  return (
    <Page>
      <PageHeader
        section="Administration"
        title="Company Details"
        subtitle="Business information printed on agreements, invoices and customer emails."
        actions={<Button variant="primary" onClick={handleSave} icon={<SaveIcon className="w-4 h-4" />}>Save changes</Button>}
      />

      <SettingsSection title="Identity" description="Legal name, trading name and tax registration shown on documents.">
        <Panel footer={saveBar}>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('Company name', 'name')}
            {field('Sub name', 'subName')}
            {field('Tax number', 'taxNumber')}
          </div>
        </Panel>
      </SettingsSection>

      <SettingsSection title="Contact" description="Address, phone and email customers use to reach you.">
        <Panel footer={saveBar}>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('Address', 'address', { full: true })}
            {field('Phone', 'phone', { type: 'tel' })}
            {field('Email', 'email', { type: 'email' })}
          </div>
        </Panel>
      </SettingsSection>

      <SettingsSection title="Payments" description="Controls for how pay-on-arrival reservations are finalised.">
        <Panel footer={saveBar}>
          <label htmlFor="requirePaymentApproval" className="flex items-start gap-3 p-4 hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              id="requirePaymentApproval"
              checked={formData.requirePaymentApproval || false}
              onChange={e => handleChange('requirePaymentApproval', e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-slate-900">Require payment approval</span>
              <span className="block text-xs text-slate-500 mt-0.5">Pay-on-arrival reservations need a payment approval before they are finalised.</span>
            </span>
          </label>
        </Panel>
      </SettingsSection>

      <SettingsSection title="Danger zone" description="Irreversible actions. Use with care." danger>
        <Panel className="border-rose-200">
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-slate-900">Delete all reservations</p>
              <p className="text-[13px] text-slate-500">Permanently removes every reservation in the system. This cannot be undone.</p>
            </div>
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete ALL reservations? This action cannot be undone.')) {
                  onDeleteAllReservations();
                }
              }}
              icon={<TrashIcon className="w-4 h-4" />}
              className="shrink-0"
            >
              Delete all reservations
            </Button>
          </div>
        </Panel>
      </SettingsSection>
    </Page>
  );
};

export default ManageCompanyDetailsView;
