import React, { useState, useEffect } from 'react';
import { AvailableExtra } from '../types';
import { PlusIcon, TrashIcon, SaveIcon, PlusCircleIcon } from './icons';
import { Page, PageHeader, StatGrid, Panel, Badge, Button, Field, Dialog, inputCls, table, EmptyState } from './ui/Crm';

interface ManageExtrasViewProps {
  extras: AvailableExtra[];
  onUpdate: (newExtras: AvailableExtra[]) => void;
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
      prev.map(ext => (ext.id === id ? { ...ext, [field]: value, ...(field === 'defaultDailyPrice' ? { pricePerDay: value } : {}) } : ext))
    );
  };

  const handleSave = () => {
    console.log('ManageExtrasView: handleSave called, localExtras:', localExtras);
    onUpdate(localExtras);
  };

  const isDirty = JSON.stringify(localExtras) !== JSON.stringify(extras);
  const avgPrice = localExtras.length
    ? localExtras.reduce((s, e) => s + (Number(e.defaultDailyPrice) || 0), 0) / localExtras.length
    : 0;

  const deleteBtn = (ext: AvailableExtra) => (
    <button onClick={() => handleDelete(ext.id)} className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0" aria-label={`Delete ${ext.name}`} title="Delete extra">
      <TrashIcon className="w-4 h-4" />
    </button>
  );

  return (
    <>
      <Page>
        <PageHeader
          section="Administration"
          title="Rental Extras"
          subtitle="Add-ons offered with a rental and their default daily price."
          actions={isDirty ? <Badge tone="warning">Unsaved changes</Badge> : undefined}
        />

        <StatGrid items={[
          { label: 'Extras', value: localExtras.length },
          { label: 'Avg. daily price', value: `$${avgPrice.toFixed(2)}`, tone: 'muted' },
          { label: 'Status', value: isDirty ? 'Unsaved' : 'Saved', tone: isDirty ? 'warning' : 'success' },
        ]} />

        <SettingsSection title="Add an extra" description="New extras are added to the list below. Click Save changes to apply them.">
          <Panel
            footer={
              <div className="flex items-center justify-between gap-2">
                <span>Price is per rental day.</span>
                <Button variant="primary" size="sm" onClick={handleAdd} disabled={!newExtraName.trim()} icon={<PlusIcon className="w-4 h-4" />}>
                  Add extra
                </Button>
              </div>
            }
          >
            <div className="p-4 grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
              <Field label="Extra name" required>
                <input
                  id="new-extra-name" type="text" value={newExtraName} onChange={e => setNewExtraName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                  placeholder="e.g. Full Insurance"
                  className={inputCls}
                />
              </Field>
              <Field label="Default daily price ($)">
                <input
                  id="new-extra-price" type="number" inputMode="decimal" value={newExtraPrice || ''} onChange={e => setNewExtraPrice(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className={`${inputCls} tabular-nums`}
                />
              </Field>
            </div>
          </Panel>
        </SettingsSection>

        <SettingsSection title="Configured extras" description="Edit names and prices inline. Changes are kept locally until saved.">
          <Panel
            title="Extras"
            subtitle={`${localExtras.length} configured`}
            footer={
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
                <span>{isDirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
                <div className="flex gap-2 [&>*]:max-sm:flex-1">
                  <Button size="sm" onClick={() => setLocalExtras(extras)}>Cancel</Button>
                  <Button variant="primary" size="sm" onClick={handleSave} icon={<SaveIcon className="w-4 h-4" />}>Save changes</Button>
                </div>
              </div>
            }
          >
            {localExtras.length === 0 ? (
              <EmptyState icon={<PlusCircleIcon />} title="No extras configured" hint="Add items like insurance, child seats or GPS above." />
            ) : (
              <>
                <table className={`${table.wrap} hidden md:table`}>
                  <thead className={table.head}>
                    <tr>
                      <th className={table.th}>Name</th>
                      <th className={`${table.th} w-44`}>Daily price ($)</th>
                      <th className={`${table.th} w-12`}><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className={table.body}>
                    {localExtras.map(ext => (
                      <tr key={ext.id} className={table.row}>
                        <td className={`${table.td} py-2`}>
                          <input type="text" value={ext.name} onChange={e => handleUpdateField(ext.id, 'name', e.target.value)} aria-label="Extra name" className={`${inputCls} h-8`} />
                        </td>
                        <td className={`${table.td} py-2`}>
                          <input type="number" inputMode="decimal" value={ext.defaultDailyPrice} onChange={e => handleUpdateField(ext.id, 'defaultDailyPrice', parseFloat(e.target.value) || 0)} aria-label="Default daily price" className={`${inputCls} h-8 tabular-nums`} />
                        </td>
                        <td className={`${table.td} py-2 text-right`}>{deleteBtn(ext)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="md:hidden divide-y divide-slate-100">
                  {localExtras.map(ext => (
                    <li key={ext.id} className="px-4 py-3 space-y-2">
                      <div className="flex items-end gap-2">
                        <Field label="Name" className="flex-1">
                          <input type="text" value={ext.name} onChange={e => handleUpdateField(ext.id, 'name', e.target.value)} aria-label="Extra name" className={inputCls} />
                        </Field>
                        <div className="pb-1">{deleteBtn(ext)}</div>
                      </div>
                      <Field label="Daily price ($)">
                        <input type="number" inputMode="decimal" value={ext.defaultDailyPrice} onChange={e => handleUpdateField(ext.id, 'defaultDailyPrice', parseFloat(e.target.value) || 0)} aria-label="Default daily price" className={`${inputCls} tabular-nums`} />
                      </Field>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </SettingsSection>
      </Page>

      <Dialog
        open={!!extraToDelete}
        onClose={() => setExtraToDelete(null)}
        title="Delete extra"
        size="md"
        footer={
          <>
            <Button onClick={() => setExtraToDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} icon={<TrashIcon className="w-4 h-4" />}>Delete</Button>
          </>
        }
      >
        <p className="text-[13px] text-slate-600">Remove "{extraToDelete?.name}" from the list? Click Save changes afterwards to apply.</p>
      </Dialog>
    </>
  );
};

export default ManageExtrasView;
