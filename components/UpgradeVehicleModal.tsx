import React, { useMemo, useState } from 'react';
import CarPicture from './CarPicture';
import { AppData, Fleet, Reservation, ReservationStatus } from '../types';
import { VehicleArt, vehicleKind, vehicleKindLabel } from './VehicleGraphics';
import { Panel, SectionLabel, Toolbar, Segmented, Plate, Button, Field, EmptyState, DetailList, inputCls } from './ui/Crm';

export interface UpgradeDetails {
  pricing: 'free' | 'daily' | 'flat';
  fee: number;
  dailyRate?: number;
  days: number;
  licensePlate?: string;
  reason?: string;
}

interface Props {
  reservation: Reservation;
  fleet: Fleet;
  allData: AppData;
  onCancel: () => void;
  onConfirm: (newCarId: string, details: UpgradeDetails) => void;
}

const DAY = 86400000;
const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

const UpgradeVehicleModal: React.FC<Props> = ({ reservation, fleet, allData, onCancel, onConfirm }) => {
  const [carId, setCarId] = useState('');
  const [query, setQuery] = useState('');
  const [showBusy, setShowBusy] = useState(false);
  const [pricing, setPricing] = useState<UpgradeDetails['pricing']>('daily');
  const [dailyRate, setDailyRate] = useState(0);
  const [flatFee, setFlatFee] = useState(0);
  const [reason, setReason] = useState('');

  const onRent = !!reservation.voucherSubmitted && !reservation.dropOffCompleted;
  const startMs = new Date(reservation.startDate).getTime();
  const endMs = new Date(reservation.endDate).getTime();
  // On rent the supplement only applies to the days still left; otherwise to the whole booking.
  const days = Math.max(1, Math.ceil((endMs - (onRent ? Math.max(Date.now(), startMs) : startMs)) / DAY) || 1);

  // Cars that are physically out with another customer for an overlapping period.
  const busyPlates = useMemo(() => {
    const map = new Map<string, string>();
    Object.values(allData || {}).forEach((months: any) => Object.values(months || {}).forEach((list: any) => (list as Reservation[]).forEach(r => {
      if (r.id === reservation.id || !r.licensePlate || r.status === ReservationStatus.CANCELLED) return;
      if (!r.voucherSubmitted || r.dropOffCompleted) return;
      const s = new Date(r.startDate).getTime();
      const e = new Date(r.endDate).getTime();
      if (s < endMs && e > startMs) map.set(r.licensePlate.trim().toUpperCase(), `${r.personName} · #${r.bookingId}`);
    })));
    return map;
  }, [allData, reservation.id, startMs, endMs]);

  const cars = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fleet
      .filter(c => c.licensePlate?.trim().toUpperCase() !== reservation.licensePlate?.trim().toUpperCase())
      .filter(c => !q || `${c.modelName} ${c.licensePlate} ${c.category}`.toLowerCase().includes(q))
      .map(c => ({ car: c, busy: busyPlates.get((c.licensePlate || '').trim().toUpperCase()) }))
      .filter(x => showBusy || !x.busy)
      .sort((a, b) => (a.car.category || '').localeCompare(b.car.category || '') || a.car.modelName.localeCompare(b.car.modelName));
  }, [fleet, query, busyPlates, showBusy, reservation.licensePlate]);

  const busyCount = fleet.filter(c => busyPlates.has((c.licensePlate || '').trim().toUpperCase())).length;
  const selected = fleet.find(c => c.id === carId);
  const currentCar = fleet.find(c => c.licensePlate && c.licensePlate === reservation.licensePlate) || fleet.find(c => c.modelName === reservation.carModel);
  const fee = pricing === 'free' ? 0 : pricing === 'daily' ? Math.round(dailyRate * days * 100) / 100 : flatFee;
  const newTotal = (reservation.amount || 0) + fee;
  const canSave = !!selected && (pricing === 'free' || fee > 0);

  const confirm = () => {
    if (!selected || !canSave) return;
    onConfirm(selected.id, {
      pricing, fee, days, reason: reason.trim() || undefined,
      dailyRate: pricing === 'daily' ? dailyRate : undefined,
      licensePlate: onRent ? undefined : selected.licensePlate,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onCancel} />
      <div className="relative bg-slate-50 w-full sm:max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-3 px-5 py-4 bg-white border-b border-slate-200">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">Upgrade vehicle</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">#{reservation.bookingId} · {reservation.personName} · {days} day{days === 1 ? '' : 's'}{onRent ? ' remaining' : ''}</p>
          </div>
          <button onClick={onCancel} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-5 gap-4 content-start">
          <div className="lg:col-span-3 space-y-4 min-w-0">
            {/* From → to */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-3 text-center min-w-0">
                <div className="flex justify-center"><CarPicture fleet={fleet} plate={reservation.licensePlate} model={reservation.carModel} className="w-24 h-14" artClassName="h-10 w-auto mx-auto" /></div>
                <SectionLabel className="mt-1">Current</SectionLabel>
                <p className="text-[13px] font-semibold text-slate-800 truncate">{reservation.carModel || '—'}</p>
                <p className="text-xs text-slate-500 truncate">{currentCar?.category || ''}{reservation.licensePlate ? ` · ${reservation.licensePlate}` : ''}</p>
              </div>
              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
              <div className={`rounded-xl border p-3 text-center min-w-0 ${selected ? 'bg-indigo-50/60 border-indigo-200' : 'bg-white border-dashed border-slate-300'}`}>
                {selected ? <div className="flex justify-center"><CarPicture fleet={fleet} plate={selected.licensePlate} model={selected.modelName} className="w-24 h-14" artClassName="h-10 w-auto mx-auto" /></div> : <div className="h-14" />}
                <SectionLabel className="mt-1 !text-indigo-600">Upgrade to</SectionLabel>
                <p className="text-[13px] font-semibold text-slate-800 truncate">{selected?.modelName || 'Choose below'}</p>
                <p className="text-xs text-slate-500 truncate">{selected ? `${selected.category} · ${selected.licensePlate}` : ' '}</p>
              </div>
            </div>

            <Panel title="Available vehicles" subtitle={`${cars.length} shown`}>
              <Toolbar className="md:flex-nowrap">
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search model, plate or category" className={inputCls} />
                {busyCount > 0 && (
                  <label className="flex items-center gap-2 text-xs text-slate-600 whitespace-nowrap px-1">
                    <input type="checkbox" checked={showBusy} onChange={e => setShowBusy(e.target.checked)} className="rounded border-slate-300 text-indigo-600" /> Show {busyCount} in use
                  </label>
                )}
              </Toolbar>
              <ul className="max-h-[340px] overflow-y-auto divide-y divide-slate-100">
                {cars.length === 0 && <li><EmptyState title="No available vehicles match." className="py-10" /></li>}
                {cars.map(({ car, busy }) => {
                  const kind = vehicleKind(car.modelName, fleet);
                  const active = car.id === carId;
                  return (
                    <li key={car.id}>
                      <button onClick={() => setCarId(car.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${active ? 'bg-indigo-50/70' : 'hover:bg-slate-50'}`}>
                        <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${active ? 'border-indigo-600 bg-indigo-600 ring-2 ring-indigo-100' : 'border-slate-300'}`} />
                        <CarPicture fleet={fleet} plate={car.licensePlate} model={car.modelName} className="w-14 h-9 hidden sm:block" artClassName="w-12 h-7 shrink-0 hidden sm:block" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-semibold text-slate-900 truncate">{car.modelName}</span>
                          <span className="block text-xs text-slate-500 truncate">{car.category || vehicleKindLabel[kind]} · {car.transmission}{car.sippCode ? ` · ${car.sippCode}` : ''}</span>
                        </span>
                        <span className="text-right shrink-0 space-y-0.5">
                          <span className="block"><Plate value={car.licensePlate} /></span>
                          {busy ? <span className="block text-[11px] text-rose-600 truncate max-w-[140px]">Out · {busy}</span> : <span className="block text-[11px] text-emerald-600">Available</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>

          <aside className="lg:col-span-2 space-y-4 min-w-0">
            <Panel title="Charge" padded bodyClassName="space-y-3">
              <Segmented className="w-full"
                options={([['free', 'Free'], ['daily', `Per day × ${days}`], ['flat', 'Flat fee']] as const).map(([key, label]) => ({ key, label }))}
                value={pricing} onChange={k => setPricing(k as UpgradeDetails['pricing'])} />
              {pricing !== 'free' && (
                <Field label={pricing === 'daily' ? 'Supplement per day' : 'Upgrade fee'}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-slate-400">$</span>
                    <input type="number" min={0} step="0.01" className={`${inputCls} pl-7 tabular-nums`} placeholder="0.00"
                      value={(pricing === 'daily' ? dailyRate : flatFee) || ''}
                      onChange={e => (pricing === 'daily' ? setDailyRate : setFlatFee)(parseFloat(e.target.value) || 0)} />
                  </div>
                </Field>
              )}
              <Field label={<>Reason <span className="font-normal text-slate-400">(optional)</span></>}>
                <input value={reason} onChange={e => setReason(e.target.value)} className={inputCls} placeholder="Customer request, booked car unavailable…" />
              </Field>
            </Panel>

            <Panel title="Summary" padded>
              <DetailList rows={[
                { label: 'Current total', value: <span className="tabular-nums">{money(reservation.amount || 0)}</span> },
                { label: `Upgrade${pricing === 'daily' && dailyRate ? ` · ${days} × ${money(dailyRate)}` : ''}`, value: <span className="tabular-nums text-indigo-700">{pricing === 'free' ? 'Free' : `+${money(fee)}`}</span> },
              ]} />
              <div className="flex justify-between items-baseline border-t border-slate-200 pt-2.5 mt-1">
                <span className="text-[13px] font-semibold text-slate-700">New total</span>
                <span className="text-xl font-semibold text-slate-900 tabular-nums">{money(newTotal)}</span>
              </div>
            </Panel>

            {onRent && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
                This car is on rent. The booking is moved to the new model; to swap the physical car, use <b>Exchange vehicle</b> on the agreement so both cars are inspected and signed.
              </p>
            )}
          </aside>
        </div>

        <footer className="px-5 py-3 bg-white border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs text-slate-500 truncate">{!selected ? 'Select a vehicle to continue.' : pricing !== 'free' && fee <= 0 ? 'Enter the upgrade charge or choose Free.' : `${reservation.carModel} → ${selected.modelName}`}</p>
          <div className="flex gap-2 [&>*]:max-sm:flex-1">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button variant="primary" onClick={confirm} disabled={!canSave}>Confirm upgrade</Button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default UpgradeVehicleModal;
