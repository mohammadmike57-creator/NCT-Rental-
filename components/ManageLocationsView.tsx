import React, { useState } from 'react';
import { RentalLocation } from '../types';
import { PlusIcon, TrashIcon, SaveIcon, MapPinIcon } from './icons';
import SecurityKeyModal from './SecurityKeyModal';
import { Page, PageHeader, StatGrid, Panel, Badge, Button, Field, inputCls, table, EmptyState } from './ui/Crm';

interface ManageLocationsViewProps {
  locations: RentalLocation[];
  onUpdate: (newLocations: RentalLocation[]) => void;
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

  const deleteBtn = (loc: RentalLocation) => (
    <button onClick={() => handleDelete(loc.id)} className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0" aria-label={`Delete ${loc.name}`} title="Delete location">
      <TrashIcon className="w-4 h-4" />
    </button>
  );

  return (
    <>
      <Page>
        <PageHeader
          section="Administration"
          title="Rental Locations"
          subtitle="Your pickup and drop-off branches. Saving requires the security key."
          actions={isDirty ? <Badge tone="warning">Unsaved changes</Badge> : undefined}
        />

        <StatGrid items={[
          { label: 'Branches', value: localLocations.length },
          { label: 'Saved', value: locations.length, tone: 'muted' },
          { label: 'Status', value: isDirty ? 'Unsaved' : 'Saved', tone: isDirty ? 'warning' : 'success' },
        ]} />

        <SettingsSection title="Add a location" description="Branches appear in pickup and drop-off selectors once saved.">
          <Panel
            footer={
              <div className="flex items-center justify-between gap-2">
                <span>Name and address are required.</span>
                <Button variant="primary" size="sm" onClick={handleAdd} disabled={!newLocationName.trim() || !newLocationAddress.trim()} icon={<PlusIcon className="w-4 h-4" />}>
                  Add location
                </Button>
              </div>
            }
          >
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Location name" required>
                <input
                  id="new-loc-name" type="text" value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)}
                  placeholder="e.g. Airport Office"
                  className={inputCls}
                />
              </Field>
              <Field label="Address" required>
                <input
                  id="new-loc-address" type="text" value={newLocationAddress} onChange={(e) => setNewLocationAddress(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                  placeholder="e.g. Queen Alia Intl Airport, Arrivals"
                  className={inputCls}
                />
              </Field>
            </div>
          </Panel>
        </SettingsSection>

        <SettingsSection title="Branches" description="Edit names and addresses inline. Saving asks for the security key.">
          <Panel
            title="Branches"
            subtitle={`${localLocations.length} configured`}
            footer={
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
                <span>{isDirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
                <div className="flex gap-2 [&>*]:max-sm:flex-1">
                  <Button size="sm" onClick={() => setLocalLocations(locations)}>Cancel</Button>
                  <Button variant="primary" size="sm" onClick={handleSaveAttempt} icon={<SaveIcon className="w-4 h-4" />}>Save changes</Button>
                </div>
              </div>
            }
          >
            {localLocations.length === 0 ? (
              <EmptyState icon={<MapPinIcon />} title="No locations configured" hint="Add your first pickup or drop-off branch above." />
            ) : (
              <>
                <table className={`${table.wrap} hidden md:table table-fixed`}>
                  <thead className={table.head}>
                    <tr>
                      <th className={`${table.th} w-1/3`}>Name</th>
                      <th className={table.th}>Address</th>
                      <th className={`${table.th} w-12`}><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className={table.body}>
                    {localLocations.map(loc => (
                      <tr key={loc.id} className={table.row}>
                        <td className={`${table.td} py-2`}>
                          <input type="text" value={loc.name} onChange={e => handleUpdateField(loc.id, 'name', e.target.value)} aria-label="Location name" className={`${inputCls} h-8`} />
                        </td>
                        <td className={`${table.td} py-2`}>
                          <input type="text" value={loc.address} onChange={e => handleUpdateField(loc.id, 'address', e.target.value)} aria-label="Location address" className={`${inputCls} h-8`} />
                        </td>
                        <td className={`${table.td} py-2 text-right`}>{deleteBtn(loc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="md:hidden divide-y divide-slate-100">
                  {localLocations.map(loc => (
                    <li key={loc.id} className="px-4 py-3 space-y-2">
                      <div className="flex items-end gap-2">
                        <Field label="Name" className="flex-1">
                          <input type="text" value={loc.name} onChange={e => handleUpdateField(loc.id, 'name', e.target.value)} aria-label="Location name" className={inputCls} />
                        </Field>
                        <div className="pb-1">{deleteBtn(loc)}</div>
                      </div>
                      <Field label="Address">
                        <input type="text" value={loc.address} onChange={e => handleUpdateField(loc.id, 'address', e.target.value)} aria-label="Location address" className={inputCls} />
                      </Field>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </SettingsSection>
      </Page>
      {isKeyModalOpen && <SecurityKeyModal onSuccess={handleKeySuccess} onClose={() => setIsKeyModalOpen(false)} />}
    </>
  );
};

export default ManageLocationsView;
