import React, { useState } from 'react';
import { PlusIcon, TrashIcon, GlobeAltIcon } from './icons';
import { RentalSource, PaymentType } from '../types';
import { Page, PageHeader, StatGrid, Panel, Badge, Button, Field, inputCls, selectCls, table, EmptyState } from './ui/Crm';

interface ManageSourcesViewProps {
  sources: RentalSource[];
  onAdd: (source: RentalSource) => void;
  onDelete: (sourceId: string) => void;
  onUpdate: (source: RentalSource) => void;
}

/** Settings row: short description column on the left (lg), content on the right. */
const SettingsSection: React.FC<{ title: string; description: React.ReactNode; children: React.ReactNode }> = ({ title, description, children }) => (
  <div className="lg:grid lg:grid-cols-3 lg:gap-6">
    <div className="mb-3 lg:mb-0 lg:pt-1">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>
    </div>
    <div className="lg:col-span-2 min-w-0">{children}</div>
  </div>
);

const PaymentPill: React.FC<{ type: PaymentType }> = ({ type }) => (
  type === PaymentType.PREPAID ? <Badge tone="success">Prepaid</Badge>
    : type === PaymentType.BOTH ? <Badge tone="info">Both · set per booking</Badge>
    : <Badge tone="warning">Pay on arrival</Badge>
);

const TypeOptions = () => (
  <>
    <option value={PaymentType.PAY_ON_ARRIVAL}>Pay on arrival</option>
    <option value={PaymentType.PREPAID}>Prepaid</option>
    <option value={PaymentType.BOTH}>Both (choose per booking)</option>
  </>
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
  const bothCount = sources.filter(s => s.paymentType === PaymentType.BOTH).length;

  const typeSelect = (source: RentalSource, cls: string) => (
    <select
      value={source.paymentType}
      onChange={e => handleTypeChange(source, e.target.value as PaymentType)}
      aria-label={`Payment type for ${source.name}`}
      className={cls}
    >
      <TypeOptions />
    </select>
  );

  return (
    <Page>
      <PageHeader
        section="Administration"
        title="Website Sources"
        subtitle="Booking channels and how they are paid. Prepaid bookings are invoiced to the partner. Choose Both for a channel that sends prepaid and pay-on-arrival bookings; each booking then says which."
      />

      <StatGrid items={[
        { label: 'Sources', value: sources.length },
        { label: 'Prepaid', value: prepaidCount, tone: 'success' },
        { label: 'Pay on arrival', value: sources.length - prepaidCount - bothCount, tone: 'warning' },
        { label: 'Both ways', value: bothCount, tone: 'info' },
      ]} />

      <SettingsSection title="Add a source" description="Create a new booking channel and choose whether customers pay upfront, at the counter, or either (Both: you pick on each booking).">
        <Panel
          footer={
            <div className="flex items-center justify-between gap-2">
              <span>Name is required.</span>
              <Button variant="primary" size="sm" onClick={handleAddClick} disabled={!newSourceName.trim()} aria-label="Add source" icon={<PlusIcon className="w-4 h-4" />}>
                Add source
              </Button>
            </div>
          }
        >
          <div className="p-4 grid grid-cols-1 sm:grid-cols-[1fr_230px] gap-3">
            <Field label="Source name" required>
              <input
                id="new-source-name"
                type="text"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddClick(); }}
                placeholder="e.g. Corporate Partner"
                className={inputCls}
              />
            </Field>
            <Field label="Payment type">
              <select
                id="new-source-type"
                value={newSourceType}
                onChange={e => setNewSourceType(e.target.value as PaymentType)}
                className={`${selectCls} w-full`}
              >
                <TypeOptions />
              </select>
            </Field>
          </div>
        </Panel>
      </SettingsSection>

      <SettingsSection title="Configured sources" description="Change a channel's payment type or remove channels you no longer use.">
        <Panel title="Sources" subtitle={`${sources.length} configured`}>
          {sources.length === 0 ? (
            <EmptyState icon={<GlobeAltIcon />} title="No sources yet" hint="Add your first booking channel using the form above." />
          ) : (
            <>
              <table className={`${table.wrap} hidden md:table`}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Source</th>
                    <th className={table.th}>Status</th>
                    <th className={table.th}>Payment type</th>
                    <th className={`${table.th} text-right`}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {sources.map(source => (
                    <tr key={source.id} className={table.row}>
                      <td className={`${table.td} font-medium text-slate-900 break-words`}>{source.name}</td>
                      <td className={table.td}><PaymentPill type={source.paymentType} /></td>
                      <td className={table.td}>{typeSelect(source, `${selectCls} h-8 w-56`)}</td>
                      <td className={`${table.td} text-right`}>
                        <button
                          onClick={() => onDelete(source.id)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          aria-label={`Delete ${source.name}`}
                          title="Delete source"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="md:hidden divide-y divide-slate-100">
                {sources.map(source => (
                  <li key={source.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-slate-900 break-words">{source.name}</p>
                        <div className="mt-1"><PaymentPill type={source.paymentType} /></div>
                      </div>
                      <button
                        onClick={() => onDelete(source.id)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                        aria-label={`Delete ${source.name}`}
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                    {typeSelect(source, `${selectCls} w-full`)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </SettingsSection>
    </Page>
  );
};

export default ManageSourcesView;
