import React, { useState } from 'react';
import { Fleet, FleetVehicle } from '../types';
import { PlusIcon, PencilIcon, TrashIcon, CloseIcon, CarIcon, UploadIcon, SearchIcon } from './icons';
import FleetExcelUpload from './FleetExcelUpload';
import { Page, PageHeader, StatGrid, Panel, Toolbar, Badge, Button, Field, Dialog, Plate, EmptyState, inputCls, selectCls, table } from './ui/Crm';

interface ManageFleetViewProps {
  fleet: Fleet;
  onUpdate: (newFleet: Fleet) => void;
}

const money = (n?: number) => `$${(n || 0).toFixed(2)}`;

const ManageFleetView: React.FC<ManageFleetViewProps> = ({ fleet, onUpdate }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<FleetVehicle | null>(null);
  const [formData, setFormData] = useState<Partial<FleetVehicle>>({
    modelName: '',
    licensePlate: '',
    registrationExpiry: '',
    category: '',
    securityDeposit: 0,
    excess: 0,
    sippCode: '',
    transmission: '',
  });
  const [showImport, setShowImport] = useState(false);
  const [query, setQuery] = useState('');

  const openAddModal = () => {
    setEditingVehicle(null);
    setFormData({
      modelName: '',
      licensePlate: '',
      registrationExpiry: '',
      category: '',
      securityDeposit: 0,
      excess: 0,
      sippCode: '',
      transmission: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (vehicle: FleetVehicle) => {
    setEditingVehicle(vehicle);
    setFormData(vehicle);
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.modelName?.trim()) {
      alert('Model name is required');
      return;
    }
    if (!formData.licensePlate?.trim()) {
      alert('License plate is required');
      return;
    }

    const newVehicle: FleetVehicle = {
      id: editingVehicle?.id || `vehicle-${Date.now()}`,
      modelName: formData.modelName.trim(),
      licensePlate: formData.licensePlate.trim(),
      registrationExpiry: formData.registrationExpiry || '',
      category: formData.category || '',
      securityDeposit: formData.securityDeposit || 0,
      excess: formData.excess || 0,
      sippCode: formData.sippCode || '',
      transmission: formData.transmission || '',
    };

    let updatedFleet: Fleet;
    if (editingVehicle) {
      updatedFleet = fleet.map(v => v.id === editingVehicle.id ? newVehicle : v);
    } else {
      updatedFleet = [...fleet, newVehicle];
    }
    onUpdate(updatedFleet);
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this vehicle?')) {
      onUpdate(fleet.filter(v => v.id !== id));
    }
  };

  const handleImport = (newVehicles: FleetVehicle[]) => {
    onUpdate([...fleet, ...newVehicles]);
    setShowImport(false);
  };

  const handleChange = (field: keyof FleetVehicle, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const q = query.trim().toLowerCase();
  const visible: FleetVehicle[] = (fleet as FleetVehicle[]).filter(v => !q || [v.modelName, v.licensePlate, v.category, v.sippCode, v.transmission]
    .some(s => (s || '').toString().toLowerCase().includes(q)));

  const today = new Date().toISOString().slice(0, 10);
  const regBadge = (d?: string) => {
    if (!d) return <span className="text-slate-400">—</span>;
    const expired = d < today;
    return expired
      ? <Badge tone="danger"><span className="tabular-nums">Expired {d}</span></Badge>
      : <span className="tabular-nums text-slate-700">{d}</span>;
  };

  const expiredCount = (fleet as FleetVehicle[]).filter(v => v.registrationExpiry && v.registrationExpiry < today).length;
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const expiringCount = (fleet as FleetVehicle[]).filter(v => v.registrationExpiry && v.registrationExpiry >= today && v.registrationExpiry <= in30).length;
  const categoryCount = new Set((fleet as FleetVehicle[]).map(v => v.category).filter(Boolean)).size;

  const actionBtns = (vehicle: FleetVehicle) => (
    <div className="flex items-center gap-1 shrink-0">
      <button onClick={() => openEditModal(vehicle)} className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" title="Edit" aria-label={`Edit ${vehicle.modelName}`}>
        <PencilIcon className="w-4 h-4" />
      </button>
      <button onClick={() => handleDelete(vehicle.id)} className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="Delete" aria-label={`Delete ${vehicle.modelName}`}>
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <Page>
      <PageHeader
        section="Administration"
        title="Fleet Management"
        subtitle={`${fleet.length} vehicle${fleet.length === 1 ? '' : 's'} · deposits, excess and registration details`}
        actions={
          <>
            <Button
              onClick={() => setShowImport(!showImport)}
              aria-pressed={showImport}
              className={showImport ? '!border-indigo-300 !bg-indigo-50 !text-indigo-700' : ''}
              icon={<UploadIcon className="w-4 h-4" />}
            >
              Import Excel
            </Button>
            <Button variant="primary" onClick={openAddModal} icon={<PlusIcon className="w-4 h-4" />}>Add vehicle</Button>
          </>
        }
      />

      <StatGrid items={[
        { label: 'Vehicles', value: fleet.length },
        { label: 'Categories', value: categoryCount, tone: 'muted' },
        { label: 'Reg. expiring 30d', value: expiringCount, tone: expiringCount ? 'warning' : 'muted' },
        { label: 'Reg. expired', value: expiredCount, tone: expiredCount ? 'danger' : 'muted' },
      ]} />

      {showImport && (
        <Panel
          title="Import vehicles from Excel"
          subtitle="Imported vehicles are added to the existing fleet."
          actions={<button onClick={() => setShowImport(false)} aria-label="Close import" className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"><CloseIcon className="w-4 h-4" /></button>}
          padded
        >
          <FleetExcelUpload onFleetImported={handleImport} />
        </Panel>
      )}

      <Panel
        title="Vehicles"
        subtitle={q ? `${visible.length} of ${fleet.length} shown` : `${fleet.length} total`}
        footer={visible.length > 0 ? <span className="tabular-nums">{visible.length} vehicle{visible.length === 1 ? '' : 's'}</span> : undefined}
      >
        <Toolbar>
          <div className="relative w-full md:w-72">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search model, plate, category"
              aria-label="Search fleet" className={`${inputCls} pl-9`} />
          </div>
        </Toolbar>

        {fleet.length === 0 || visible.length === 0 ? (
          <EmptyState
            icon={<CarIcon />}
            title={fleet.length === 0 ? 'No vehicles in fleet' : 'No vehicles match your search'}
            hint={fleet.length === 0 ? 'Add a vehicle or import your fleet from an Excel sheet.' : 'Try a different model, plate or category.'}
            action={fleet.length === 0 ? <Button variant="primary" onClick={openAddModal} icon={<PlusIcon className="w-4 h-4" />}>Add vehicle</Button> : undefined}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className={table.wrap}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Vehicle</th>
                    <th className={table.th}>Category</th>
                    <th className={table.th}>SIPP</th>
                    <th className={table.th}>Transmission</th>
                    <th className={`${table.th} text-right`}>Deposit</th>
                    <th className={`${table.th} text-right`}>Excess</th>
                    <th className={table.th}>Reg. expiry</th>
                    <th className={table.th}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {visible.map(vehicle => (
                    <tr key={vehicle.id} className={table.row}>
                      <td className={table.td}>
                        <p className="font-medium text-slate-900">{vehicle.modelName}</p>
                        <div className="mt-0.5"><Plate value={vehicle.licensePlate} /></div>
                      </td>
                      <td className={`${table.td} text-slate-700`}>{vehicle.category || <span className="text-slate-400">—</span>}</td>
                      <td className={`${table.td} text-slate-700 font-mono text-xs`}>{vehicle.sippCode || <span className="text-slate-400">—</span>}</td>
                      <td className={`${table.td} text-slate-700`}>{vehicle.transmission || <span className="text-slate-400">—</span>}</td>
                      <td className={`${table.td} text-right tabular-nums text-slate-700`}>{money(vehicle.securityDeposit)}</td>
                      <td className={`${table.td} text-right tabular-nums text-slate-700`}>{money(vehicle.excess)}</td>
                      <td className={`${table.td} whitespace-nowrap`}>{regBadge(vehicle.registrationExpiry)}</td>
                      <td className={table.td}><div className="flex justify-end">{actionBtns(vehicle)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <ul className="md:hidden divide-y divide-slate-100">
              {visible.map(vehicle => (
                <li key={vehicle.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-900 break-words">{vehicle.modelName}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Plate value={vehicle.licensePlate} />
                        {vehicle.category && <Badge tone="info" dot={false}>{vehicle.category}</Badge>}
                        {vehicle.transmission && <Badge tone="muted" dot={false}>{vehicle.transmission}</Badge>}
                        {vehicle.sippCode && <Badge tone="muted" dot={false} className="font-mono">{vehicle.sippCode}</Badge>}
                      </div>
                    </div>
                    {actionBtns(vehicle)}
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div className="min-w-0"><dt className="text-slate-500">Deposit</dt><dd className="font-semibold text-slate-900 tabular-nums">{money(vehicle.securityDeposit)}</dd></div>
                    <div className="min-w-0"><dt className="text-slate-500">Excess</dt><dd className="font-semibold text-slate-900 tabular-nums">{money(vehicle.excess)}</dd></div>
                    <div className="min-w-0"><dt className="text-slate-500">Reg. expiry</dt><dd className="truncate">{regBadge(vehicle.registrationExpiry)}</dd></div>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      {/* Dialog for add/edit */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingVehicle ? 'Edit vehicle' : 'Add vehicle'}
        subtitle="Fields marked * are required"
        footer={
          <>
            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>{editingVehicle ? 'Save changes' : 'Add vehicle'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Model" required>
            <input type="text" value={formData.modelName || ''} onChange={e => handleChange('modelName', e.target.value)} className={inputCls} required />
          </Field>
          <Field label="License plate" required>
            <input type="text" value={formData.licensePlate || ''} onChange={e => handleChange('licensePlate', e.target.value)} className={inputCls} required />
          </Field>
          <Field label="Category">
            <input type="text" value={formData.category || ''} onChange={e => handleChange('category', e.target.value)} className={inputCls} />
          </Field>
          <Field label="SIPP code">
            <input type="text" value={formData.sippCode || ''} onChange={e => handleChange('sippCode', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Security deposit ($)">
            <input type="number" inputMode="decimal" value={formData.securityDeposit || 0} onChange={e => handleChange('securityDeposit', parseFloat(e.target.value) || 0)} className={`${inputCls} tabular-nums`} min="0" step="0.01" />
          </Field>
          <Field label="Excess ($)">
            <input type="number" inputMode="decimal" value={formData.excess || 0} onChange={e => handleChange('excess', parseFloat(e.target.value) || 0)} className={`${inputCls} tabular-nums`} min="0" step="0.01" />
          </Field>
          <Field label="Transmission">
            <select value={formData.transmission || ''} onChange={e => handleChange('transmission', e.target.value)} className={`${selectCls} w-full`}>
              <option value="">Select</option>
              <option value="Automatic">Automatic</option>
              <option value="Manual">Manual</option>
            </select>
          </Field>
          <Field label="Registration expiry">
            <input type="date" value={formData.registrationExpiry || ''} onChange={e => handleChange('registrationExpiry', e.target.value)} className={inputCls} />
          </Field>
        </div>
      </Dialog>
    </Page>
  );
};

export default ManageFleetView;
