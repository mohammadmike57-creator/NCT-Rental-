import React from 'react';
import { Bi } from '../ui/Bi';
import { labelCls } from '../ui/Crm';
import { inputCls } from './AgreementParts';

/** A name or email on the agreement: an input while it can be changed, plain text after. */
export const TextField: React.FC<{ label: string; value: string; onChange: (val: string) => void; isEditable: boolean; isEmail?: boolean }> = ({ label, value, onChange, isEditable, isEmail = false }) => (
  <div className="w-full">
    <label className={labelCls}><Bi en={label} /></label>
    {isEditable ? (
      <input
        type={isEmail ? 'email' : 'text'}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className={inputCls}
        placeholder={isEmail ? 'name@example.com (required)' : 'Enter name'}
        required={isEmail}
      />
    ) : (
      <p className={`text-[13px] font-medium text-slate-900 py-1.5 ${isEmail ? 'break-all' : 'break-words'}`}>{value || '—'}</p>
    )}
  </div>
);

export interface KmFieldProps { label: string; value?: number; onChange: (v?: number) => void; editable: boolean; reference?: number; referenceLabel?: string; placeholder: string }

/** Odometer reading, with the distance driven (or a warning) against the reference reading. */
export const KmField: React.FC<KmFieldProps> = ({ label, value, onChange, editable, reference, referenceLabel, placeholder }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <label className="text-[13px] font-medium text-slate-700">{label}</label>
      {referenceLabel && <span className="text-xs text-slate-400">{referenceLabel}: {reference?.toLocaleString() ?? '—'} km</span>}
    </div>
    <div className="relative">
      <input type="number" inputMode="numeric" value={value ?? ''} onChange={e => onChange(parseInt(e.target.value) || undefined)}
        disabled={!editable} className={`${inputCls} pr-12 font-semibold tabular-nums`} placeholder={placeholder} />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">KM</span>
    </div>
    {reference !== undefined && value !== undefined && value > reference && (
      <p className="mt-1.5 text-xs font-semibold text-indigo-700">{(value - reference).toLocaleString()} km driven</p>
    )}
    {reference !== undefined && value !== undefined && value < reference && (
      <p className="mt-1.5 text-xs font-semibold text-rose-600">Lower than the pickup reading</p>
    )}
  </div>
);
