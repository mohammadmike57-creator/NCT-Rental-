import React from 'react';
import { AdditionalDriver, DriverDetails } from '../../types';
import { Bi } from '../ui/Bi';
import { Badge, Button, SectionLabel, inputCls, labelCls, selectCls } from '../ui/Crm';

interface Props {
  driver: DriverDetails;
  additionalDrivers: AdditionalDriver[];
  editable: boolean;
  /** Return date (YYYY-MM-DD…) used to warn when the licence expires during the rental. */
  rentalEnd?: string;
  onChange: (driver: DriverDetails) => void;
  onChangeAdditional: (drivers: AdditionalDriver[]) => void;
  /**
   * After check-out: the details as saved. Only the ones still empty there can be filled in;
   * what was recorded stays as it is.
   */
  fillMissing?: { driver: DriverDetails; additionalDrivers: AdditionalDriver[] };
}

const ID_TYPES: { value: NonNullable<DriverDetails['idType']>; label: string }[] = [
  { value: 'passport', label: 'Passport' },
  { value: 'national_id', label: 'National ID' },
  { value: 'residence', label: 'Residence permit' },
];

const ageOn = (dob?: string, on = new Date()) => {
  if (!dob) return null;
  const d = new Date(dob + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  let a = on.getFullYear() - d.getFullYear();
  if (on < new Date(on.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
};

/** Main driver's licence / ID details and additional drivers, printed on the rental agreement. */
const DriverDetailsForm: React.FC<Props> = ({ driver, additionalDrivers, editable, rentalEnd, onChange, onChangeAdditional, fillMissing }) => {
  const canEdit = (key: keyof DriverDetails) => editable || (!!fillMissing && !fillMissing.driver[key]);
  const canEditExtra = (i: number, key: keyof AdditionalDriver) => editable || (!!fillMissing && !!fillMissing.additionalDrivers[i] && !fillMissing.additionalDrivers[i][key]);
  const set = (patch: Partial<DriverDetails>) => onChange({ ...driver, ...patch });
  const licenceExpiresDuringRental = !!(driver.licenseExpiry && rentalEnd && driver.licenseExpiry < rentalEnd.slice(0, 10));
  const age = ageOn(driver.dateOfBirth);
  const field = (label: string, key: keyof DriverDetails, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block min-w-0">
      <span className={labelCls}><Bi en={label} /></span>
      {canEdit(key)
        ? <input className={inputCls} value={(driver[key] as string) || ''} onChange={e => set({ [key]: e.target.value } as Partial<DriverDetails>)} {...props} />
        : <span className="block h-9 leading-9 text-[13px] text-slate-800 truncate">{(driver[key] as string) || '—'}</span>}
    </label>
  );

  return (
    <div className="mt-5 pt-5 border-t border-slate-100 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <SectionLabel><Bi en="Main driver documents" /></SectionLabel>
          <p className="text-xs text-slate-500 mt-0.5">Printed on the rental agreement. Check the original documents at the counter.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {driver.licenseNumber ? <Badge tone="success">Licence recorded</Badge> : <Badge tone="warning">Licence not recorded</Badge>}
          {licenceExpiresDuringRental && <Badge tone="danger">Licence expires before return</Badge>}
          {age !== null && age < 21 && <Badge tone="warning">Driver under 21</Badge>}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {field('Driving licence no.', 'licenseNumber', { placeholder: 'e.g. 48213977' })}
        {field('Issuing country', 'licenseCountry', { placeholder: 'e.g. Jordan' })}
        {field('Licence expiry', 'licenseExpiry', { type: 'date' })}
        {field('Date of birth', 'dateOfBirth', { type: 'date' })}
        {field('Nationality', 'nationality', { placeholder: 'e.g. Jordanian' })}
        <label className="block min-w-0">
          <span className={labelCls}><Bi en="ID type" /></span>
          {canEdit('idNumber') ? (
            <select className={`${selectCls} w-full`} value={driver.idType || 'passport'} onChange={e => set({ idType: e.target.value as DriverDetails['idType'] })}>
              {ID_TYPES.map(t => <option key={t.value} value={t.value}>{t.label} · {({ passport: 'جواز السفر', national_id: 'الهوية الوطنية', residence: 'الإقامة' } as Record<string, string>)[t.value]}</option>)}
            </select>
          ) : <span className="block h-9 leading-9 text-[13px] text-slate-800">{ID_TYPES.find(t => t.value === driver.idType)?.label || '—'}</span>}
        </label>
        {field('ID / passport number', 'idNumber')}
        <div className="sm:col-span-2 lg:col-span-2">{field('Home address', 'address', { placeholder: 'Street, city, country' })}</div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <SectionLabel><Bi en="Additional drivers" /></SectionLabel>
          {editable && (
            <Button size="sm" onClick={() => onChangeAdditional([...additionalDrivers, { name: '' }])}><Bi en="+ Add driver" /></Button>
          )}
        </div>
        {additionalDrivers.length === 0 ? (
          <p className="mt-1.5 text-xs text-slate-500">None. Only the main driver may drive the vehicle.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {additionalDrivers.map((d, i) => (
              <li key={i} className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-2 items-end rounded-lg border border-slate-200 p-2.5">
                {(['name', 'licenseNumber', 'dateOfBirth'] as const).map(k => (
                  <label key={k} className="block min-w-0">
                    <span className={labelCls}><Bi en={k === 'name' ? 'Full name' : k === 'licenseNumber' ? 'Licence no.' : 'Date of birth'} /></span>
                    {canEditExtra(i, k)
                      ? <input className={inputCls} type={k === 'dateOfBirth' ? 'date' : 'text'} value={d[k] || ''}
                          onChange={e => onChangeAdditional(additionalDrivers.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
                      : <span className="block h-9 leading-9 text-[13px] text-slate-800 truncate">{d[k] || '—'}</span>}
                  </label>
                ))}
                {editable && (
                  <button type="button" onClick={() => onChangeAdditional(additionalDrivers.filter((_, j) => j !== i))}
                    className="h-9 px-2.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50">Remove</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default DriverDetailsForm;
