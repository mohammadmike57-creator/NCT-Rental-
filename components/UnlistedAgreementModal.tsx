import React, { useMemo, useState } from 'react';
import { Bi } from './ui/Bi';
import { Fleet, RentalLocation, RentalSource } from '../types';
import { VehicleArt, vehicleKind, vehicleKindLabel } from './VehicleGraphics';
import { Panel, Badge, Plate, Button, DetailList, inputCls as kitInput, selectCls, textareaCls, labelCls } from './ui/Crm';

export interface UnlistedBookingDraft {
  personName: string;
  contactNumber: string;
  customerEmail: string;
  bookingId: string;
  source: string;
  carModel: string;
  licensePlate: string;
  startDate: string;
  endDate: string;
  locationName: string;
  amount: number;
  notes: string;
}

interface Props {
  fleet: Fleet;
  sources: RentalSource[];
  rentalLocations: RentalLocation[];
  existingBookingIds: Set<string>;
  onCancel: () => void;
  onSubmit: (draft: UnlistedBookingDraft) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const makeRef = () => `WALK-${Date.now().toString(36).slice(-4).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

const Field: React.FC<{ label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode; className?: string }> = ({ label, required, error, hint, children, className }) => (
  <label className={`block min-w-0 ${className || ''}`}>
    <span className={labelCls}><Bi en={label} />{required && <span className="text-rose-500"> *</span>}</span>
    {children}
    {error ? <span className="block text-xs text-rose-600 mt-1">{error}</span> : hint ? <span className="block text-xs text-slate-500 mt-1">{hint}</span> : null}
  </label>
);

const inputCls = (bad?: boolean) => `${kitInput}${bad ? ' !border-rose-300 focus:!ring-rose-500/20' : ''}`;
const selCls = `${selectCls} w-full`;

const UnlistedAgreementModal: React.FC<Props> = ({ fleet, sources, rentalLocations, existingBookingIds, onCancel, onSubmit }) => {
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  const later = new Date(now.getTime() + 3 * 86400000);

  const [d, setD] = useState<UnlistedBookingDraft>({
    personName: '', contactNumber: '', customerEmail: '', bookingId: makeRef(), source: sources[0]?.name || 'Walk-in',
    carModel: '', licensePlate: '', startDate: toLocalInput(now), endDate: toLocalInput(later),
    locationName: rentalLocations[0]?.name || '', amount: 0, notes: '',
  });
  const [vehicleId, setVehicleId] = useState('');
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof UnlistedBookingDraft>(k: K, v: UnlistedBookingDraft[K]) => setD(prev => ({ ...prev, [k]: v }));

  const days = useMemo(() => {
    const ms = new Date(d.endDate).getTime() - new Date(d.startDate).getTime();
    return Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.ceil(ms / 86400000)) : 0;
  }, [d.startDate, d.endDate]);

  const errors: Partial<Record<keyof UnlistedBookingDraft, string>> = {};
  if (!d.personName.trim()) errors.personName = 'Customer name is required';
  if (!d.contactNumber.trim()) errors.contactNumber = 'Phone number is required';
  if (d.customerEmail.trim() && !/^\S+@\S+\.\S+$/.test(d.customerEmail.trim())) errors.customerEmail = 'Enter a valid email address';
  if (!d.bookingId.trim()) errors.bookingId = 'A booking reference is required';
  else if (existingBookingIds.has(d.bookingId.trim())) errors.bookingId = 'This reference already exists — open it from the reservation list instead';
  if (!d.carModel.trim()) errors.carModel = 'Choose a vehicle or type the model';
  if (!d.startDate) errors.startDate = 'Required';
  if (!d.endDate) errors.endDate = 'Required';
  else if (days === 0) errors.endDate = 'Return must be after pick-up';
  if (!(d.amount > 0)) errors.amount = 'Enter the agreed rental amount';
  const valid = Object.keys(errors).length === 0;
  const err = (k: keyof UnlistedBookingDraft) => (touched ? errors[k] : undefined);

  const pickVehicle = (id: string) => {
    setVehicleId(id);
    const v = fleet.find(f => f.id === id);
    if (v) setD(prev => ({ ...prev, carModel: v.modelName, licensePlate: v.licensePlate || prev.licensePlate }));
  };

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onSubmit({
      ...d,
      personName: d.personName.trim(),
      contactNumber: d.contactNumber.trim(),
      customerEmail: d.customerEmail.trim(),
      bookingId: d.bookingId.trim(),
      carModel: d.carModel.trim(),
      licensePlate: d.licensePlate.trim().toUpperCase(),
      startDate: new Date(d.startDate).toISOString(),
      endDate: new Date(d.endDate).toISOString(),
    });
  };

  const kind = vehicleKind(d.carModel, fleet);

  return (
    <div className="bg-slate-50 -m-4 sm:m-0 h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-xl shadow-2xl overflow-hidden flex flex-col" role="dialog" aria-modal="true">
      <header className="px-5 py-4 bg-white border-b border-slate-200 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">Agreement without reservation<span lang="ar" dir="rtl" className="ar-ui block sm:inline sm:ml-2 !text-[15px] !text-slate-700">عقد بدون حجز</span></h3>
          <p className="text-xs text-slate-500 mt-0.5">
            For a customer whose booking (for example from the website) is not in the system yet. Saved as <Badge tone="warning" dot={false} className="align-middle">Unlisted</Badge> until the reservations team links it to the booking.
          </p>
        </div>
        <button onClick={onCancel} aria-label="Close" className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-3 gap-4 content-start">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <Panel title={<Bi en="Customer" />} padded>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Full name" required error={err('personName')} className="sm:col-span-2">
                <input className={inputCls(!!err('personName'))} value={d.personName} onChange={e => set('personName', e.target.value)} placeholder="As shown on driving licence" autoFocus />
              </Field>
              <Field label="Phone" required error={err('contactNumber')}>
                <input className={inputCls(!!err('contactNumber'))} value={d.contactNumber} onChange={e => set('contactNumber', e.target.value)} placeholder="+962 7…" inputMode="tel" />
              </Field>
              <Field label="Email" error={err('customerEmail')} hint="The signed agreement is emailed here">
                <input className={inputCls(!!err('customerEmail'))} value={d.customerEmail} onChange={e => set('customerEmail', e.target.value)} placeholder="name@example.com" inputMode="email" />
              </Field>
            </div>
          </Panel>

          <Panel title={<Bi en="Booking" />} padded>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Website / partner booking no." required error={err('bookingId')} hint="Enter it if the customer has it, so the booking is matched automatically. Otherwise keep the temporary number.">
                <input className={`${inputCls(!!err('bookingId'))} font-mono`} value={d.bookingId} onChange={e => set('bookingId', e.target.value)} />
              </Field>
              <Field label="Source">
                <select className={selCls} value={d.source} onChange={e => set('source', e.target.value)}>
                  {!sources.some(s => s.name === 'Walk-in') && <option value="Walk-in">Walk-in</option>}
                  {sources.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Pick-up" required error={err('startDate')}>
                <input type="datetime-local" className={inputCls(!!err('startDate'))} value={d.startDate} onChange={e => set('startDate', e.target.value)} />
              </Field>
              <Field label="Return" required error={err('endDate')}>
                <input type="datetime-local" className={inputCls(!!err('endDate'))} value={d.endDate} onChange={e => set('endDate', e.target.value)} />
              </Field>
              <Field label="Location">
                <select className={selCls} value={d.locationName} onChange={e => set('locationName', e.target.value)}>
                  <option value="">—</option>
                  {rentalLocations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                </select>
              </Field>
              <Field label="Agreed total (USD)" required error={err('amount')}>
                <input type="number" min={0} step="0.01" className={`${inputCls(!!err('amount'))} tabular-nums`} value={d.amount || ''} onChange={e => set('amount', parseFloat(e.target.value) || 0)} placeholder="0.00" />
              </Field>
            </div>
          </Panel>

          <Panel title={<Bi en="Vehicle" />} padded>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="From fleet" className="sm:col-span-2">
                <select className={selCls} value={vehicleId} onChange={e => pickVehicle(e.target.value)}>
                  <option value="">Select a vehicle…</option>
                  {[...fleet].sort((a, b) => a.modelName.localeCompare(b.modelName)).map(v => (
                    <option key={v.id} value={v.id}>{v.modelName}{v.licensePlate ? ` · ${v.licensePlate}` : ''}{v.category ? ` · ${v.category}` : ''}</option>
                  ))}
                </select>
              </Field>
              <Field label="Model" required error={err('carModel')}>
                <input className={inputCls(!!err('carModel'))} value={d.carModel} onChange={e => { set('carModel', e.target.value); setVehicleId(''); }} placeholder="e.g. Toyota Corolla" />
              </Field>
              <Field label="Plate" hint="Can also be entered on the agreement">
                <input className={`${inputCls()} uppercase font-mono`} value={d.licensePlate} onChange={e => set('licensePlate', e.target.value)} />
              </Field>
              <Field label="Notes" className="sm:col-span-2">
                <textarea rows={2} className={textareaCls} value={d.notes} onChange={e => set('notes', e.target.value)} placeholder="Why the booking was not listed, who authorised it, etc." />
              </Field>
            </div>
          </Panel>
        </div>

        <aside className="space-y-4 min-w-0">
          <Panel title={<Bi en="Summary" />} className="lg:sticky lg:top-0">
            <div className="h-24 bg-slate-50 border-b border-slate-200 flex items-center justify-center">
              <VehicleArt kind={kind} className="h-16 w-auto" />
            </div>
            <div className="p-4">
              <p className="text-[13px] font-semibold text-slate-900">{d.carModel || 'No vehicle selected'}</p>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">{vehicleKindLabel[kind]}{d.licensePlate ? <Plate value={d.licensePlate.toUpperCase()} /> : null}</p>
              <DetailList className="mt-2 border-t border-slate-100" rows={[
                { label: 'Customer', value: <span className="truncate block">{d.personName || '—'}</span> },
                { label: 'Duration', value: <span className="tabular-nums">{days ? `${days} day${days === 1 ? '' : 's'}` : '—'}</span> },
                { label: 'Per day', value: <span className="tabular-nums">{days && d.amount ? `$${(d.amount / days).toFixed(2)}` : '—'}</span> },
              ]} />
              <div className="border-t border-slate-200 pt-2.5 mt-1 flex justify-between items-baseline">
                <span className="text-[13px] font-semibold text-slate-700">Total</span>
                <span className="text-xl font-semibold text-slate-900 tabular-nums">${(d.amount || 0).toFixed(2)}</span>
              </div>
            </div>
          </Panel>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 leading-relaxed">
            <p className="font-semibold mb-1">What happens next</p>
            <ol className="list-decimal ml-4 space-y-0.5">
              <li>The rental agreement opens so you can inspect, sign and check out the car.</li>
              <li>It appears in <b>Unlisted agreements</b> for the reservations team.</li>
              <li>The team links it to the website booking once it is entered, or creates the reservation from it. The agreement stays fully usable meanwhile.</li>
            </ol>
          </div>
        </aside>
      </div>

      <footer className="px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500 hidden sm:block">{touched && !valid ? <span className="text-rose-600 font-semibold">Please fix the highlighted fields.</span> : 'Fields marked * are required.'}</p>
        <div className="flex gap-2 ml-auto max-sm:w-full [&>*]:max-sm:flex-1">
          <Button variant="secondary" onClick={onCancel}><Bi en="Cancel" /></Button>
          <Button variant="primary" onClick={submit}><Bi en="Open agreement" className="!text-white/80" /></Button>
        </div>
      </footer>
    </div>
  );
};

export default UnlistedAgreementModal;
