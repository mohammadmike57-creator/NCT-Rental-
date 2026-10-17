import React, { useMemo, useState } from 'react';
import { Fleet, RentalLocation, RentalSource } from '../types';
import { VehicleArt, vehicleKind, vehicleKindLabel } from './VehicleGraphics';

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
  <label className={`block ${className || ''}`}>
    <span className="block text-xs font-semibold text-slate-600 mb-1.5">{label}{required && <span className="text-rose-500"> *</span>}</span>
    {children}
    {error ? <span className="block text-xs text-rose-600 mt-1">{error}</span> : hint ? <span className="block text-xs text-slate-400 mt-1">{hint}</span> : null}
  </label>
);

const inputCls = (bad?: boolean) =>
  `w-full px-3 py-2.5 bg-white border rounded-xl text-sm text-slate-800 outline-none focus:ring-2 transition-shadow ${bad ? 'border-rose-300 focus:ring-rose-500/20' : 'border-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500'}`;

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
    <div className="bg-slate-50 rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Agreement for an unlisted booking</h2>
            <p className="text-sm text-slate-500">For walk-ins or bookings not yet in the list. It is saved as <span className="font-semibold text-amber-700">awaiting confirmation</span> until a supervisor confirms it.</p>
          </div>
        </div>
        <button onClick={onCancel} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <section className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-4">Customer</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-4">Booking</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Booking reference" required error={err('bookingId')} hint="Auto-generated — replace with the partner reference if there is one">
                <input className={`${inputCls(!!err('bookingId'))} font-mono`} value={d.bookingId} onChange={e => set('bookingId', e.target.value)} />
              </Field>
              <Field label="Source">
                <select className={inputCls()} value={d.source} onChange={e => set('source', e.target.value)}>
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
                <select className={inputCls()} value={d.locationName} onChange={e => set('locationName', e.target.value)}>
                  <option value="">—</option>
                  {rentalLocations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                </select>
              </Field>
              <Field label="Agreed total (USD)" required error={err('amount')}>
                <input type="number" min={0} step="0.01" className={`${inputCls(!!err('amount'))} tabular-nums`} value={d.amount || ''} onChange={e => set('amount', parseFloat(e.target.value) || 0)} placeholder="0.00" />
              </Field>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-4">Vehicle</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="From fleet" className="sm:col-span-2">
                <select className={inputCls()} value={vehicleId} onChange={e => pickVehicle(e.target.value)}>
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
                <textarea rows={2} className={inputCls()} value={d.notes} onChange={e => set('notes', e.target.value)} placeholder="Why the booking was not listed, who authorised it, etc." />
              </Field>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden sticky top-0">
            <div className="bg-gradient-to-br from-slate-100 to-slate-50 h-32 flex items-center justify-center">
              <VehicleArt kind={kind} className="h-24 w-auto" />
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div>
                <p className="font-bold text-slate-900">{d.carModel || 'No vehicle selected'}</p>
                <p className="text-xs text-slate-500">{vehicleKindLabel[kind]}{d.licensePlate ? ` · ${d.licensePlate.toUpperCase()}` : ''}</p>
              </div>
              <div className="border-t border-slate-100 pt-3 space-y-1.5">
                <div className="flex justify-between"><span className="text-slate-500">Customer</span><span className="font-semibold text-slate-800 truncate ml-3">{d.personName || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Duration</span><span className="font-semibold text-slate-800">{days ? `${days} day${days === 1 ? '' : 's'}` : '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Per day</span><span className="font-semibold text-slate-800 tabular-nums">{days && d.amount ? `$${(d.amount / days).toFixed(2)}` : '—'}</span></div>
              </div>
              <div className="border-t border-slate-200 pt-3 flex justify-between items-baseline">
                <span className="font-semibold text-slate-700">Total</span>
                <span className="text-2xl font-bold text-slate-900 tabular-nums">${(d.amount || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 leading-relaxed">
            <p className="font-semibold mb-1">What happens next</p>
            <ol className="list-decimal ml-4 space-y-0.5">
              <li>The rental agreement opens so you can inspect, sign and check out the car.</li>
              <li>The booking appears under <b>Awaiting confirmation</b> in the reservation list.</li>
              <li>A supervisor confirms or rejects it. The agreement stays fully usable meanwhile.</li>
            </ol>
          </div>
        </aside>
      </div>

      <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500 hidden sm:block">{touched && !valid ? <span className="text-rose-600 font-semibold">Please fix the highlighted fields.</span> : 'Fields marked * are required.'}</p>
        <div className="flex gap-2 ml-auto">
          <button onClick={onCancel} className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={submit} className="px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 shadow-sm">Open agreement</button>
        </div>
      </div>
    </div>
  );
};

export default UnlistedAgreementModal;
