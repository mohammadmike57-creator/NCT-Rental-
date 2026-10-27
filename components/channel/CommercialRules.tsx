import React, { useState } from 'react';
import {
  Aggregator, ChannelAllotment, ChannelBookingLocation, ChannelBookingRules, ChannelCoverage, ChannelGroupDetail,
  ChannelLocationType, ChannelPricingRules, ChannelPromotion, ChannelWeekday, Fleet,
} from '../../types';
import { fetchChannelInventory, pushChannelInventory, ChannelInventory } from '../../firebase/api';
import { Panel, Button, Badge, inputCls, selectCls, labelCls } from '../ui/Crm';

/* The broker-facing commercial rules: vehicle and station details, tax, mileage, insurance covers,
   promotions, driver-age fees, allotments, no-shows and the inventory push. Saved with the other
   booking rules; ChannelRules.java reads the same fields. */

type Set = <K extends keyof ChannelBookingRules>(k: K, v: ChannelBookingRules[K]) => void;

export const WEEKDAYS: [ChannelWeekday, string][] = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
const LOCATION_TYPES: [ChannelLocationType, string][] = [['AIRPORT', 'Airport'], ['CITY', 'City / downtown'], ['HOTEL', 'Hotel'], ['RAILWAY', 'Railway station'], ['PORT', 'Port']];
const FUELS = ['Unspecified', 'Petrol', 'Diesel', 'Hybrid', 'Electric', 'LPGCompressedGas', 'MultiFuel', 'Ethanol', 'Hydrogen'];

/** Typical seats, doors, bags and fuel from a SIPP code (same table as Sipp.java), shown as placeholders. */
export const sippSpec = (code: string) => {
  const c = (code || '').toUpperCase();
  const cat = c[0] || 'C', type = c[1] || 'D', fuel = c[3] || 'R';
  let seats = 5, large = 2, small = 1;
  if ('MN'.includes(cat)) { seats = 4; large = 1; small = 1; }
  else if ('EH'.includes(cat)) { large = 1; small = 2; }
  else if ('IJ'.includes(cat)) { large = 2; small = 2; }
  else if ('SR'.includes(cat)) { large = 3; small = 1; }
  else if ('FGPULWOX'.includes(cat)) { large = 3; small = 2; }
  const doors = 'BSTN'.includes(type) ? 2 : 'WVFJGKPQ'.includes(type) ? 5 : 4;
  if (type === 'V') { seats = 'MEC'.includes(cat) ? 7 : 9; large = 4; small = 2; }
  if ('STN'.includes(type)) seats = Math.min(seats, 4);
  const f = 'DQ'.includes(fuel) ? 'Diesel' : 'HI'.includes(fuel) ? 'Hybrid' : 'EC'.includes(fuel) ? 'Electric' : 'LS'.includes(fuel) ? 'LPGCompressedGas'
    : 'AB'.includes(fuel) ? 'Hydrogen' : 'MF'.includes(fuel) ? 'MultiFuel' : 'VZ'.includes(fuel) ? 'Petrol' : 'UX'.includes(fuel) ? 'Ethanol' : 'Unspecified';
  return { seats, doors, largeBags: large, smallBags: small, fuel: f };
};

/** Input styling without the full width, for fields sized inside sentences and tables. */
const fieldCls = inputCls.replace('w-full ', '');
const num = (v: string) => (v === '' ? undefined : Number(v));
const Small: React.FC<{ value?: number; placeholder?: string | number; onChange: (n?: number) => void; step?: number; w?: string; label: string }> =
  ({ value, placeholder, onChange, step = 1, w = 'w-20', label }) => (
    <input type="number" min={0} step={step} value={value ?? ''} placeholder={placeholder === undefined ? '' : String(placeholder)} aria-label={label}
      onChange={e => onChange(num(e.target.value))} className={`${fieldCls} ${w} tabular-nums px-2`} />
  );

const Toggle: React.FC<{ on: boolean; onChange: (b: boolean) => void; label: string; hint?: string }> = ({ on, onChange, label, hint }) => (
  <label className="inline-flex items-start gap-2 text-[13px] text-slate-700 cursor-pointer">
    <input type="checkbox" className="mt-0.5" checked={on} onChange={e => onChange(e.target.checked)} />
    <span>{label}{hint && <span className="block text-xs text-slate-400">{hint}</span>}</span>
  </label>
);

// ===================================================================== station details

/** Phone, position, type, weekly hours and after-hours rules for one station (inside the Locations card). */
export const LocationDetails: React.FC<{ loc: ChannelBookingLocation; currency: string; onChange: (p: Partial<ChannelBookingLocation>) => void }> = ({ loc, currency, onChange }) => {
  const hours = loc.openingHours || {};
  const anyHours = Object.keys(hours).length > 0;
  const setDay = (d: ChannelWeekday, p: Partial<{ open: string; close: string; closed: boolean }>) =>
    onChange({ openingHours: { ...hours, [d]: { open: '08:00', close: '20:00', ...hours[d], ...p } } });
  const allDays = (open: string, close: string) => onChange({ openingHours: Object.fromEntries(WEEKDAYS.map(([d]) => [d, { open, close }])) });
  return (
    <div className="mt-1 space-y-3 rounded-lg bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block"><span className={labelCls}>Station type</span>
          <select value={loc.type || (loc.name.toLowerCase().includes('airport') ? 'AIRPORT' : 'CITY')} onChange={e => onChange({ type: e.target.value as ChannelLocationType })} className={`${selectCls} w-full`}>
            {LOCATION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></label>
        <label className="block"><span className={labelCls}>Phone</span>
          <input value={loc.phone || ''} onChange={e => onChange({ phone: e.target.value })} placeholder="+962 6 400 0000" className={inputCls} /></label>
        <label className="block"><span className={labelCls}>Latitude</span>
          <input type="number" step="0.000001" value={loc.latitude ?? ''} onChange={e => onChange({ latitude: num(e.target.value) })} placeholder="31.722600" className={`${inputCls} tabular-nums`} /></label>
        <label className="block"><span className={labelCls}>Longitude</span>
          <input type="number" step="0.000001" value={loc.longitude ?? ''} onChange={e => onChange({ longitude: num(e.target.value) })} placeholder="35.993200" className={`${inputCls} tabular-nums`} /></label>
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span className={`${labelCls} mb-0`}>Opening hours</span>
          <span className="text-xs text-slate-400">{anyHours ? 'Pick-ups and returns outside these hours are refused unless after-hours is allowed.' : 'Not set: open around the clock.'}</span>
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={() => allDays('08:00', '20:00')} className="text-xs font-semibold text-indigo-600 hover:underline">Every day 08–20</button>
            <button type="button" onClick={() => allDays('00:00', '23:59')} className="text-xs font-semibold text-indigo-600 hover:underline">24 hours</button>
            {anyHours && <button type="button" onClick={() => onChange({ openingHours: {} })} className="text-xs font-semibold text-slate-500 hover:underline">Clear</button>}
          </span>
        </div>
        {anyHours && (
          <div className="grid gap-1.5">
            {WEEKDAYS.map(([d, label]) => {
              const h = hours[d];
              const closed = !h || h.closed;
              return (
                <div key={d} className="flex items-center gap-2 text-xs">
                  <span className="w-9 font-semibold text-slate-600">{label}</span>
                  <input type="time" value={h?.open || ''} disabled={closed} onChange={e => setDay(d, { open: e.target.value, closed: false })} className={`${fieldCls} h-8 w-[8rem] px-2 tabular-nums`} aria-label={`${label} opens`} />
                  <span className="text-slate-400">–</span>
                  <input type="time" value={h?.close || ''} disabled={closed} onChange={e => setDay(d, { close: e.target.value, closed: false })} className={`${fieldCls} h-8 w-[8rem] px-2 tabular-nums`} aria-label={`${label} closes`} />
                  <label className="inline-flex items-center gap-1 text-slate-500"><input type="checkbox" checked={closed} onChange={e => setDay(d, { closed: e.target.checked })} />Closed</label>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Toggle on={!!loc.afterHoursPickup} onChange={b => onChange({ afterHoursPickup: b })} label="After-hours pick-up" />
        <Toggle on={!!loc.afterHoursReturn} onChange={b => onChange({ afterHoursReturn: b })} label="After-hours return (key box)" />
        <span className="inline-flex items-center gap-2 text-xs text-slate-600">Fee each time
          <Small value={loc.afterHoursFee} onChange={n => onChange({ afterHoursFee: n })} step={0.5} w="w-20" label="After-hours fee" /> {currency}</span>
      </div>
    </div>
  );
};

// ===================================================================== vehicle details

export const VehicleDetailsSection: React.FC<{ groups: string[]; fleet: Fleet; details: Record<string, ChannelGroupDetail>; onChange: (d: Record<string, ChannelGroupDetail>) => void }> =
  ({ groups, fleet, details, onChange }) => {
    const set = (g: string, p: Partial<ChannelGroupDetail>) => {
      const next = { ...details, [g]: { ...details[g], ...p } };
      Object.keys(next[g]).forEach(k => { const v = (next[g] as any)[k]; if (v === undefined || v === '') delete (next[g] as any)[k]; });
      if (!Object.keys(next[g]).length) delete next[g];
      onChange(next);
    };
    return (
      <Panel title="Vehicle details" subtitle="What brokers show for each group. Empty fields use the typical values for the SIPP code (shown in grey) and the fleet photo.">
        {groups.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                {['Group', 'Picture', 'Seats', 'Doors', 'Large bags', 'Small bags', 'Fuel', 'Picture URL'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {groups.map(g => {
                  const d = details[g] || {};
                  const def = sippSpec(g);
                  const car = fleet.find(v => (v.sippCode || '').toUpperCase() === g && v.imageUrl && !v.imageUrl.startsWith('data:'));
                  const pic = d.pictureUrl || car?.imageUrl;
                  const model = fleet.find(v => (v.sippCode || '').toUpperCase() === g)?.modelName;
                  return (
                    <tr key={g}>
                      <td className="px-3 py-2"><p className="font-mono font-semibold text-slate-900">{g}</p><p className="text-[11px] text-slate-500">{model || '—'}</p></td>
                      <td className="px-3 py-2">{pic ? <img src={pic} alt={model || g} className="w-16 h-10 rounded object-cover border border-slate-200 bg-white" /> :
                        <span className="inline-flex w-16 h-10 items-center justify-center rounded border border-dashed border-amber-300 bg-amber-50 text-[10px] font-semibold text-amber-700">No photo</span>}</td>
                      <td className="px-3 py-2"><Small value={d.seats} placeholder={def.seats} onChange={n => set(g, { seats: n })} label={`${g} seats`} /></td>
                      <td className="px-3 py-2"><Small value={d.doors} placeholder={def.doors} onChange={n => set(g, { doors: n })} label={`${g} doors`} /></td>
                      <td className="px-3 py-2"><Small value={d.largeBags} placeholder={def.largeBags} onChange={n => set(g, { largeBags: n })} label={`${g} large bags`} /></td>
                      <td className="px-3 py-2"><Small value={d.smallBags} placeholder={def.smallBags} onChange={n => set(g, { smallBags: n })} label={`${g} small bags`} /></td>
                      <td className="px-3 py-2">
                        <select value={d.fuel || ''} onChange={e => set(g, { fuel: e.target.value || undefined })} className={`${selectCls} h-9 w-36`} aria-label={`${g} fuel`}>
                          <option value="">{def.fuel} (SIPP)</option>
                          {FUELS.map(f => <option key={f} value={f}>{f === 'LPGCompressedGas' ? 'LPG / CNG' : f === 'MultiFuel' ? 'Multi-fuel' : f}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2"><input value={d.pictureUrl || ''} onChange={e => set(g, { pictureUrl: e.target.value.trim() || undefined })}
                        placeholder={car ? 'Fleet photo is used' : 'https://…/car.jpg'} className={`${fieldCls} h-9 w-56 font-mono text-xs`} aria-label={`${g} picture URL`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="px-4 py-6 text-[13px] text-slate-500">Give your cars SIPP codes in Fleet Management first.</p>}
      </Panel>
    );
  };

// ===================================================================== pricing

export const PricingSection: React.FC<{ pricing: ChannelPricingRules; currency: string; groups: string[]; onChange: (p: ChannelPricingRules) => void }> =
  ({ pricing: p, currency, groups, onChange }) => {
    const set = (patch: Partial<ChannelPricingRules>) => onChange({ ...p, ...patch });
    const covers = p.coverages || [];
    const promos = p.promotions || [];
    const setCover = (i: number, c: Partial<ChannelCoverage>) => set({ coverages: covers.map((x, j) => (j === i ? { ...x, ...c } : x)) });
    const setPromo = (i: number, c: Partial<ChannelPromotion>) => set({ promotions: promos.map((x, j) => (j === i ? { ...x, ...c } : x)) });
    const unlimited = p.unlimitedMileage !== false;
    const included = p.taxIncluded !== false;
    return (
      <>
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Tax & mileage" subtitle="Sent with every price so the broker shows the same total the customer pays." bodyClassName="p-4 space-y-4">
            <div className="grid grid-cols-[1fr_7rem] gap-3 items-end">
              <label className="block"><span className={labelCls}>Tax name</span>
                <input value={p.taxName ?? ''} placeholder="VAT" onChange={e => set({ taxName: e.target.value })} className={inputCls} /></label>
              <label className="block"><span className={labelCls}>Rate</span>
                <div className="relative"><input type="number" min={0} max={50} step={0.5} value={p.taxPercent ?? ''} placeholder="0" onChange={e => set({ taxPercent: num(e.target.value) })} className={`${inputCls} pr-7 tabular-nums`} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span></div></label>
            </div>
            <div className="flex gap-2">
              {[[true, 'Prices include tax'], [false, 'Tax is added on top']].map(([v, l]) => (
                <button key={String(v)} type="button" onClick={() => set({ taxIncluded: v as boolean })}
                  className={`flex-1 h-9 rounded-lg border text-[13px] font-medium ${included === v ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>{l as string}</button>
              ))}
            </div>
            <div className="border-t border-slate-100 pt-3 space-y-3">
              <Toggle on={unlimited} onChange={b => set({ unlimitedMileage: b })} label="Unlimited kilometres" />
              {!unlimited && (
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
                  <Small value={p.kmPerDay} placeholder={250} onChange={n => set({ kmPerDay: n })} w="w-20" label="Km per day" /> km a day included, then
                  <Small value={p.extraKmPrice} placeholder={0.2} step={0.05} onChange={n => set({ extraKmPrice: n })} w="w-20" label="Price per extra km" /> {currency} per extra km
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Young & senior drivers" subtitle="A daily surcharge added when the driver's age (or date of birth) is in the range." bodyClassName="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
              Drivers under <Small value={p.youngDriverUnder} placeholder={25} onChange={n => set({ youngDriverUnder: n })} label="Young driver age" /> pay
              <Small value={p.youngDriverFee} placeholder={0} step={0.5} onChange={n => set({ youngDriverFee: n })} w="w-20" label="Young driver fee" /> {currency} a day
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
              Drivers aged <Small value={p.seniorDriverFrom} placeholder={70} onChange={n => set({ seniorDriverFrom: n })} label="Senior driver age" /> or over pay
              <Small value={p.seniorDriverFee} placeholder={0} step={0.5} onChange={n => set({ seniorDriverFee: n })} w="w-20" label="Senior driver fee" /> {currency} a day
            </div>
            <p className="text-xs text-slate-500">Leave the fee empty for no surcharge. The minimum and maximum ages are under Booking limits.</p>
          </Panel>
        </div>

        <Panel title="Insurance covers" subtitle="Included covers are shown as part of the rate; optional ones are sold per day and lower the excess."
          actions={<Button size="sm" onClick={() => set({ coverages: [...covers, { code: '', name: '', included: false }] })}>Add cover</Button>}>
          {covers.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  {['Code', 'Name', 'In the rate', `Daily price (${currency})`, `Excess with it`, 'Deposit with it', ''].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {covers.map((c, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2"><input value={c.code} onChange={e => setCover(i, { code: e.target.value.toUpperCase() })} placeholder="SCDW" className={`${fieldCls} h-9 w-24 font-mono uppercase`} aria-label="Cover code" /></td>
                      <td className="px-3 py-2"><input value={c.name} onChange={e => setCover(i, { name: e.target.value })} placeholder="Super collision damage waiver" className={`${fieldCls} h-9 w-52`} aria-label="Cover name" /></td>
                      <td className="px-3 py-2"><input type="checkbox" checked={c.included} onChange={e => setCover(i, { included: e.target.checked })} aria-label="Included in the rate" /></td>
                      <td className="px-3 py-2">{c.included ? <span className="text-xs text-slate-400">included</span> :
                        <Small value={c.dailyPrice} placeholder={0} step={0.5} w="w-20" onChange={n => setCover(i, { dailyPrice: n })} label="Daily price" />}</td>
                      <td className="px-3 py-2"><Small value={c.excess} placeholder="car's" step={50} w="w-20" onChange={n => setCover(i, { excess: n })} label="Excess" /></td>
                      <td className="px-3 py-2"><Small value={c.deposit} placeholder="car's" step={50} w="w-20" onChange={n => setCover(i, { deposit: n })} label="Deposit" /></td>
                      <td className="px-3 py-2 text-right"><button type="button" onClick={() => set({ coverages: covers.filter((_, j) => j !== i) })} className="text-xs font-semibold text-rose-600 hover:underline">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="px-4 py-6 text-[13px] text-slate-500">No covers listed. Brokers see the car's own excess and deposit. Typical: CDW and TP included, SCDW sold per day.</p>}
        </Panel>

        <Panel title="Promotion codes" subtitle="A percentage off the rental rate for pick-ups in the dates; the broker sends the code with the search."
          actions={<Button size="sm" onClick={() => set({ promotions: [...promos, { code: '', percentOff: 10 }] })}>Add promotion</Button>}>
          {promos.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  {['Code', '% off', 'Pick-ups from', 'to', 'Groups', ''].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {promos.map((c, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2"><input value={c.code} onChange={e => setPromo(i, { code: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="SUMMER10" className={`${fieldCls} h-9 w-32 font-mono uppercase`} aria-label="Promotion code" /></td>
                      <td className="px-3 py-2"><Small value={c.percentOff} onChange={n => setPromo(i, { percentOff: Math.min(90, n || 0) })} label="Percent off" /></td>
                      <td className="px-3 py-2"><input type="date" value={c.from || ''} onChange={e => setPromo(i, { from: e.target.value || undefined })} className={`${fieldCls} h-9 w-40`} aria-label="From" /></td>
                      <td className="px-3 py-2"><input type="date" value={c.to || ''} onChange={e => setPromo(i, { to: e.target.value || undefined })} className={`${fieldCls} h-9 w-40`} aria-label="To" /></td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {groups.map(g => {
                            const on = (c.groups || []).includes(g);
                            return <button key={g} type="button" onClick={() => setPromo(i, { groups: on ? (c.groups || []).filter(x => x !== g) : [...(c.groups || []), g] })}
                              className={`h-6 px-1.5 rounded border text-[11px] font-mono ${on ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-400'}`}>{g}</button>;
                          })}
                          {!(c.groups || []).length && <span className="text-[11px] text-slate-400 self-center">all groups</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right"><button type="button" onClick={() => set({ promotions: promos.filter((_, j) => j !== i) })} className="text-xs font-semibold text-rose-600 hover:underline">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="px-4 py-6 text-[13px] text-slate-500">No promotions. An unknown or expired code is refused with POLICY_VIOLATION.</p>}
        </Panel>
      </>
    );
  };

// ===================================================================== allotments, no-shows, inventory

export const AllotmentsSection: React.FC<{ allotments: ChannelAllotment[]; groups: string[]; onChange: (a: ChannelAllotment[]) => void }> = ({ allotments, groups, onChange }) => {
  const setA = (i: number, p: Partial<ChannelAllotment>) => onChange(allotments.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Panel title="Allotments & stop-sell" subtitle="Limit how many cars of a group this broker may have booked at the same time, or close a group for this broker only."
      actions={<Button size="sm" onClick={() => onChange([...allotments, { group: groups[0] || '', from: today, to: today, quantity: 2, releaseDays: 0 }])} disabled={!groups.length}>Add allotment</Button>}>
      {allotments.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              {['Group', 'Pick-ups from', 'to', 'Cars', 'Release', 'Stop sell', ''].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {allotments.map((a, i) => (
                <tr key={i} className={a.stopSell ? 'bg-rose-50/50' : ''}>
                  <td className="px-3 py-2"><select value={a.group} onChange={e => setA(i, { group: e.target.value })} className={`${selectCls} h-9 w-28 font-mono`} aria-label="Group">
                    {!groups.includes(a.group) && <option value={a.group}>{a.group || '—'}</option>}
                    {groups.map(g => <option key={g} value={g}>{g}</option>)}</select></td>
                  <td className="px-3 py-2"><input type="date" value={a.from} onChange={e => setA(i, { from: e.target.value })} className={`${fieldCls} h-9 w-40`} aria-label="From" /></td>
                  <td className="px-3 py-2"><input type="date" value={a.to} onChange={e => setA(i, { to: e.target.value })} className={`${fieldCls} h-9 w-40`} aria-label="To" /></td>
                  <td className="px-3 py-2">{a.stopSell ? <span className="text-xs text-rose-600 font-semibold">closed</span> : <Small value={a.quantity} onChange={n => setA(i, { quantity: n || 0 })} label="Cars" />}</td>
                  <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Small value={a.releaseDays} placeholder={0} onChange={n => setA(i, { releaseDays: n })} w="w-14" label="Release days" /> days before</span></td>
                  <td className="px-3 py-2"><input type="checkbox" checked={!!a.stopSell} onChange={e => setA(i, { stopSell: e.target.checked })} aria-label="Stop sell" /></td>
                  <td className="px-3 py-2 text-right"><button type="button" onClick={() => onChange(allotments.filter((_, j) => j !== i))} className="text-xs font-semibold text-rose-600 hover:underline">Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2.5 text-xs text-slate-500 border-t border-slate-100">Release: within this many days of pick-up the cap lifts and the broker sells from your general availability (free sale). Everything else is free sale already.</p>
        </div>
      ) : <p className="px-4 py-6 text-[13px] text-slate-500">No allotments: the broker sells from your general availability (free sale), less the cars kept back.</p>}
    </Panel>
  );
};

export const OperationsSection: React.FC<{ aggregator: Aggregator; rules: ChannelBookingRules; set: Set; saved: ChannelBookingRules; showConfirmation?: (m: string) => void }> =
  ({ aggregator, rules, set, saved, showConfirmation }) => {
    const [inv, setInv] = useState<ChannelInventory | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const inventoryOn = (saved.webhookEvents || []).includes('inventory.updated');
    const preview = async () => {
      setBusy('preview'); setError(null);
      try { setInv(await fetchChannelInventory(aggregator.id, 14)); } catch (e: any) { setError(e.message); } finally { setBusy(null); }
    };
    const push = async () => {
      setBusy('push'); setError(null);
      try { await pushChannelInventory(aggregator.id); showConfirmation?.('Inventory sent to the broker.'); } catch (e: any) { setError(e.message); } finally { setBusy(null); }
    };
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="No-shows" subtitle="Bookings not picked up in time are closed automatically and the broker is told (reservation.no_show)." bodyClassName="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
            Mark as no-show <Small value={rules.noShowAfterHours} placeholder={0} onChange={n => set('noShowAfterHours', n)} label="Hours after pick-up" /> hours after the pick-up time,
            with a fee of <Small value={rules.noShowFeePercent} placeholder={100} onChange={n => set('noShowFeePercent', n === undefined ? undefined : Math.min(100, n))} label="No-show fee" /> % of the booking
          </div>
          <p className="text-xs text-slate-500">{rules.noShowAfterHours ? <>Checked every 5 minutes for live bookings. A booking staff checked out is never marked.</> : <>Off (0 hours): staff mark no-shows by hand in Reservations.</>}</p>
        </Panel>
        <Panel title="Inventory push" subtitle="Free cars per group per day, sent as inventory.updated whenever it changes (checked every 15 minutes, and daily)."
          actions={<div className="flex gap-2">
            <Button size="sm" onClick={preview} disabled={busy === 'preview'}>{busy === 'preview' ? 'Loading…' : 'Preview'}</Button>
            <Button size="sm" variant="primary" onClick={push} disabled={!inventoryOn || !saved.webhookUrl || busy === 'push'}>{busy === 'push' ? 'Sending…' : 'Send now'}</Button>
          </div>} bodyClassName="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
            Send the next <Small value={rules.inventoryPushDays} placeholder={60} onChange={n => set('inventoryPushDays', n)} label="Days ahead" /> days
            <Badge tone={inventoryOn ? 'success' : 'muted'}>{inventoryOn ? 'inventory.updated is on' : 'Tick inventory.updated under Webhooks'}</Badge>
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          {inv && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="text-[11px] tabular-nums">
                <thead><tr className="bg-slate-50"><th className="px-2 py-1.5 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50">Group</th>
                  {inv.groups[0]?.days.map(d => <th key={d.date} className="px-1.5 py-1.5 font-semibold text-slate-500 whitespace-nowrap">{d.date.slice(8)}/{d.date.slice(5, 7)}</th>)}</tr></thead>
                <tbody>
                  {inv.groups.map(g => (
                    <tr key={g.vehicle_group} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-mono font-semibold text-slate-800 sticky left-0 bg-white">{g.vehicle_group}</td>
                      {g.days.map(d => <td key={d.date} title={d.reason || ''} className={`px-1.5 py-1.5 text-center ${d.available > 0 ? 'text-emerald-700' : 'text-rose-600 bg-rose-50'}`}>{d.available}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    );
  };

// ===================================================================== cancellation schedule, currencies

type Tier = { hoursBefore: number; feePercent: number };

/** The policy code the server sends (ChannelRules.cancellationPolicyCode). */
export const policyCode = (tiers: Tier[]) => {
  const paid = tiers.filter(t => t.feePercent > 0);
  if (!paid.length) return 'FREE';
  return `${paid.length > 1 ? 'TIERED' : 'FLEX'}${Math.max(...paid.map(t => t.hoursBefore))}`;
};

const hoursText = (h: number) => (h === 0 ? 'at pick-up time' : h % 24 === 0 ? `${h / 24} day${h === 24 ? '' : 's'} before` : `${h} h before`);

/** Penalty steps: "cancelled less than X hours before pick-up → Y% of the booking". */
export const CancellationSchedule: React.FC<{ rules: ChannelBookingRules; set: Set }> = ({ rules, set }) => {
  const tiers: Tier[] = rules.cancellationTiers?.length ? rules.cancellationTiers
    : [{ hoursBefore: rules.freeCancellationHours ?? 48, feePercent: rules.lateCancellationFeePercent ?? 100 }];
  const save = (t: Tier[]) => set('cancellationTiers', [...t].sort((a, b) => b.hoursBefore - a.hoursBefore));
  const sorted = [...tiers].sort((a, b) => b.hoursBefore - a.hoursBefore);
  const firstPaid = sorted.filter(t => t.feePercent > 0).map(t => t.hoursBefore);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`${labelCls} mb-0`}>Cancellation schedule</span>
        <button type="button" onClick={() => save([...tiers, { hoursBefore: 24, feePercent: 100 }])} className="text-xs font-semibold text-indigo-600 hover:underline">Add step</button>
      </div>
      <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
        <div className="px-3 py-2 text-[13px] text-slate-600 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />Free cancellation {firstPaid.length ? `until ${hoursText(Math.max(...firstPaid))} pick-up` : 'at any time'}
        </div>
        {sorted.map((t, i) => (
          <div key={i} className="px-3 py-2 flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
            <span className={`w-2 h-2 rounded-full ${t.feePercent >= 100 ? 'bg-rose-500' : t.feePercent > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            Less than <Small value={t.hoursBefore} onChange={n => save(sorted.map((x, j) => (j === i ? { ...x, hoursBefore: n ?? 0 } : x)))} label="Hours before pick-up" /> hours before:
            <Small value={t.feePercent} onChange={n => save(sorted.map((x, j) => (j === i ? { ...x, feePercent: Math.min(100, n ?? 0) } : x)))} label="Fee percent" /> % of the booking
            <span className="text-xs text-slate-400">({hoursText(t.hoursBefore)})</span>
            {sorted.length > 1 && <button type="button" onClick={() => save(sorted.filter((_, j) => j !== i))} className="ml-auto text-xs font-semibold text-rose-600 hover:underline">Remove</button>}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">Policy code sent to the broker: <span className="font-mono font-semibold text-slate-700">{policyCode(sorted)}</span>.
        Every offer and booking carries this schedule with exact deadlines; a booking keeps the schedule it was made under.</p>
    </div>
  );
};

const COMMON_CURRENCIES = ['EUR', 'GBP', 'JOD', 'SAR', 'AED', 'USD', 'CHF', 'SEK', 'NOK', 'DKK', 'KWD', 'QAR', 'EGP', 'TRY'];

export const CurrenciesSection: React.FC<{ base: string; currencies: Record<string, number>; onChange: (c: Record<string, number>) => void }> = ({ base, currencies, onChange }) => {
  const [code, setCode] = useState('');
  const entries = Object.entries(currencies);
  const add = () => {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(c) || c === base || currencies[c] !== undefined) return;
    onChange({ ...currencies, [c]: 1 });
    setCode('');
  };
  return (
    <Panel title="Sell currencies" subtitle={`Brokers may ask for prices in these currencies (OTA POS ISOCurrency, native <Currency>, JSON "currency"). Bookings, fees and statements stay in ${base}.`}
      bodyClassName="p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className="h-8 px-3 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 text-xs font-semibold font-mono inline-flex items-center">{base} · channel currency</span>
        {entries.map(([c, rate]) => (
          <span key={c} className="h-8 pl-3 pr-1 rounded-lg border border-slate-200 bg-white text-xs inline-flex items-center gap-2">
            <span className="font-mono font-semibold text-slate-800">{c}</span>
            <span className="text-slate-400">1 {base} =</span>
            <input type="number" min={0} step="0.0001" value={rate} onChange={e => onChange({ ...currencies, [c]: Number(e.target.value) })}
              className="h-6 w-20 rounded border border-slate-200 px-1.5 tabular-nums text-xs" aria-label={`${c} rate`} />
            <button type="button" onClick={() => { const n = { ...currencies }; delete n[c]; onChange(n); }} className="w-6 h-6 rounded text-slate-400 hover:text-rose-600" aria-label={`Remove ${c}`}>×</button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input list="ccy" value={code} onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && add()} placeholder="EUR" maxLength={3}
          className={`${fieldCls} w-24 font-mono uppercase`} aria-label="Currency code" />
        <datalist id="ccy">{COMMON_CURRENCIES.filter(c => c !== base && currencies[c] === undefined).map(c => <option key={c} value={c} />)}</datalist>
        <Button size="sm" onClick={add}>Add currency</Button>
        <span className="text-xs text-slate-500">Update the rates when they move; each booking keeps the rate it was made at.</span>
      </div>
    </Panel>
  );
};
