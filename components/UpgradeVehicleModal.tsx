import React, { useMemo, useState } from 'react';
import { AppData, Fleet, Reservation, ReservationStatus } from '../types';
import { VehicleArt, vehicleKind, vehicleKindLabel } from './VehicleGraphics';

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

  const inputCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 px-6 py-5 bg-white border-b border-slate-200">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" /></svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Upgrade vehicle</h2>
              <p className="text-sm text-slate-500">#{reservation.bookingId} · {reservation.personName} · {days} day{days === 1 ? '' : 's'}{onRent ? ' remaining' : ''}</p>
            </div>
          </div>
          <button onClick={onCancel} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 space-y-4">
            {/* From → to */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="bg-white rounded-2xl border border-slate-200 p-3 text-center">
                <VehicleArt kind={vehicleKind(reservation.carModel, fleet)} className="h-12 w-auto mx-auto" color="#94a3b8" />
                <p className="text-[11px] uppercase tracking-wider text-slate-400 mt-1">Current</p>
                <p className="text-sm font-semibold text-slate-800 truncate">{reservation.carModel || '—'}</p>
                <p className="text-xs text-slate-500">{currentCar?.category || ''}{reservation.licensePlate ? ` · ${reservation.licensePlate}` : ''}</p>
              </div>
              <svg className="w-6 h-6 text-orange-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
              <div className={`rounded-2xl border p-3 text-center ${selected ? 'bg-orange-50 border-orange-200' : 'bg-white border-dashed border-slate-300'}`}>
                {selected ? <VehicleArt kind={vehicleKind(selected.modelName, fleet)} className="h-12 w-auto mx-auto" color="#ea580c" /> : <div className="h-12" />}
                <p className="text-[11px] uppercase tracking-wider text-orange-500 mt-1">Upgrade to</p>
                <p className="text-sm font-semibold text-slate-800 truncate">{selected?.modelName || 'Choose below'}</p>
                <p className="text-xs text-slate-500">{selected ? `${selected.category} · ${selected.licensePlate}` : ' '}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200">
              <div className="p-3 border-b border-slate-100 flex items-center gap-2">
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search model, plate or category" className={inputCls} />
                {busyCount > 0 && (
                  <label className="flex items-center gap-2 text-xs text-slate-600 whitespace-nowrap px-2">
                    <input type="checkbox" checked={showBusy} onChange={e => setShowBusy(e.target.checked)} className="rounded border-slate-300" /> Show {busyCount} in use
                  </label>
                )}
              </div>
              <ul className="max-h-[340px] overflow-y-auto divide-y divide-slate-100">
                {cars.length === 0 && <li className="p-8 text-center text-sm text-slate-500">No available vehicles match.</li>}
                {cars.map(({ car, busy }) => {
                  const kind = vehicleKind(car.modelName, fleet);
                  const active = car.id === carId;
                  return (
                    <li key={car.id}>
                      <button onClick={() => setCarId(car.id)} className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${active ? 'bg-orange-50' : 'hover:bg-slate-50'}`}>
                        <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${active ? 'border-orange-600 bg-orange-600 ring-2 ring-orange-100' : 'border-slate-300'}`} />
                        <VehicleArt kind={kind} className="w-14 h-8 shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-slate-900 truncate">{car.modelName}</span>
                          <span className="block text-xs text-slate-500 truncate">{car.category || vehicleKindLabel[kind]} · {car.transmission}{car.sippCode ? ` · ${car.sippCode}` : ''}</span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className="block font-mono text-xs text-slate-700">{car.licensePlate}</span>
                          {busy ? <span className="block text-[11px] text-rose-600 truncate max-w-[140px]">Out · {busy}</span> : <span className="block text-[11px] text-emerald-600">Available</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <aside className="lg:col-span-2 space-y-4">
            <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Charge</h3>
              <div className="grid grid-cols-3 gap-2">
                {([['free', 'Free', 'Courtesy'], ['daily', 'Per day', `× ${days} days`], ['flat', 'Flat fee', 'One-off']] as const).map(([key, title, sub]) => (
                  <button key={key} onClick={() => setPricing(key)}
                    className={`p-2.5 rounded-xl text-left ring-1 ${pricing === key ? 'ring-2 ring-orange-500 bg-orange-50/60' : 'ring-slate-200 hover:bg-slate-50'}`}>
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                    <p className="text-[11px] text-slate-500">{sub}</p>
                  </button>
                ))}
              </div>
              {pricing !== 'free' && (
                <label className="block">
                  <span className="block text-xs font-semibold text-slate-600 mb-1.5">{pricing === 'daily' ? 'Supplement per day' : 'Upgrade fee'}</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                    <input type="number" min={0} step="0.01" className={`${inputCls} pl-7 tabular-nums`} placeholder="0.00"
                      value={(pricing === 'daily' ? dailyRate : flatFee) || ''}
                      onChange={e => (pricing === 'daily' ? setDailyRate : setFlatFee)(parseFloat(e.target.value) || 0)} />
                  </div>
                </label>
              )}
              <label className="block">
                <span className="block text-xs font-semibold text-slate-600 mb-1.5">Reason <span className="font-normal text-slate-400">(optional)</span></span>
                <input value={reason} onChange={e => setReason(e.target.value)} className={inputCls} placeholder="Customer request, booked car unavailable…" />
              </label>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Current total</span><span className="tabular-nums">{money(reservation.amount || 0)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Upgrade{pricing === 'daily' && dailyRate ? ` · ${days} × ${money(dailyRate)}` : ''}</span><span className="font-semibold text-orange-700 tabular-nums">{pricing === 'free' ? 'Free' : `+${money(fee)}`}</span></div>
              <div className="flex justify-between items-baseline border-t border-slate-200 pt-3">
                <span className="font-semibold text-slate-700">New total</span>
                <span className="text-2xl font-bold text-slate-900 tabular-nums">{money(newTotal)}</span>
              </div>
            </section>

            {onRent && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
                This car is on rent. The booking is moved to the new model; to swap the physical car, use <b>Exchange vehicle</b> on the agreement so both cars are inspected and signed.
              </p>
            )}
          </aside>
        </div>

        <footer className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{!selected ? 'Select a vehicle to continue.' : pricing !== 'free' && fee <= 0 ? 'Enter the upgrade charge or choose Free.' : `${reservation.carModel} → ${selected.modelName}`}</p>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
            <button onClick={confirm} disabled={!canSave} className="px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 rounded-xl hover:bg-orange-700 disabled:opacity-40">Confirm upgrade</button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default UpgradeVehicleModal;
