// Building blocks of the rental agreement screen (Voucher): layout parts, fuel gauge,
// checklist, damage board and register, signature block.
import React, { useState, useEffect, useRef } from 'react';
import { CarView, DamageMarker } from '../../types';
import SignaturePad from '../SignaturePad';
import { InspectionDiagram, INSPECTION_LABEL } from '../VehicleGraphics';
import { Bi } from '../ui/Bi';
import { arOf } from '../../services/uiArabic';
import { Badge, Button, SectionLabel, inputCls as kitInputCls, textareaCls, labelCls } from '../ui/Crm';
import { DAMAGE_PARTS, DAMAGE_SEVERITIES, DAMAGE_SIZES, DAMAGE_TYPES, DAMAGE_TYPE_AR, DAMAGE_SEVERITY_AR, damageSeverityLabel, damageSummary, isDescribed } from '../../services/damageMarks';


export const inputCls = kitInputCls;
export const areaCls = `${textareaCls} disabled:bg-slate-50 disabled:text-slate-500`;

export const InfoBlock: React.FC<{ title: string; children: React.ReactNode; className?: string; icon?: React.ReactNode }> = ({ title, children, className, icon }) => (
  <section className={`bg-white border border-slate-200 rounded-xl shadow-sm overflow-clip min-w-0 ${className || ''}`}>
    <h3 className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">
      {icon && <span className="text-slate-400">{icon}</span>}
      {title}
    </h3>
    <div className="p-4 space-y-2.5 text-[13px]">{children}</div>
  </section>
);

export const InfoPair: React.FC<{ label: string; value?: string | React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4">
    <p className="text-[13px] text-slate-500 shrink-0"><Bi en={label} /></p>
    <div className="font-medium text-slate-900 text-right break-words whitespace-pre-wrap text-[13px] tabular-nums min-w-0">{value || '—'}</div>
  </div>
);

/** Numbered, titled card used for each step of the inspection. */
export const StepSection: React.FC<{ step?: number; title: string; subtitle?: string; children: React.ReactNode; aside?: React.ReactNode }> = ({ step, title, subtitle, children, aside }) => (
  <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-clip min-w-0">
    <header className="px-4 py-3 border-b border-slate-200 flex items-center gap-3">
      {step !== undefined && (
        <span className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200 text-xs font-semibold tabular-nums flex items-center justify-center shrink-0">{step}</span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      {arOf(title) && (
        <div lang="ar" dir="rtl" className="min-w-0 max-w-[48%] text-right">
          <p className="ar-ui !text-[14px] !font-bold !text-slate-800 leading-5">{arOf(title)}</p>
          {subtitle && arOf(subtitle) && <p className="ar-ui !text-[11.5px] !font-normal !text-slate-500 leading-4 truncate">{arOf(subtitle)}</p>}
        </div>
      )}
      {aside}
    </header>
    <div className="p-4">{children}</div>
  </section>
);

export const FuelGauge: React.FC<{ level?: number; pickupLevel?: number; onLevelChange: (level: number) => void; disabled?: boolean }> = ({ level = 0, pickupLevel, onLevelChange, disabled = false }) => {
  const segments = Array.from({ length: 8 }, (_, i) => i + 1);
  const hasPickupLevel = typeof pickupLevel === 'number';
  const color = level <= 2 ? 'bg-rose-500' : level <= 4 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <p className="text-xl font-semibold text-slate-900 tabular-nums">{level}<span className="text-[13px] font-medium text-slate-400">/8</span></p>
        {hasPickupLevel && (
          <p className={`text-xs font-medium ${level < (pickupLevel as number) ? 'text-rose-600' : 'text-slate-500'}`}>
            Pickup level {pickupLevel}/8{level < (pickupLevel as number) ? ` · ${(pickupLevel as number) - level} short` : ''}
          </p>
        )}
      </div>
      <div className="relative">
        <div className="flex gap-1">
          {segments.map(s => (
            <button
              type="button"
              key={s}
              onClick={() => !disabled && onLevelChange(s)}
              disabled={disabled}
              aria-label={`Fuel ${s} of 8`}
              className={`flex-1 h-8 rounded transition-colors ${level >= s ? color : 'bg-slate-100'} ${!disabled ? 'hover:ring-2 hover:ring-slate-300 cursor-pointer' : 'cursor-default'}`}
            />
          ))}
        </div>
        {hasPickupLevel && (
          <div className="absolute -top-1 -bottom-1 w-0.5 bg-slate-900 rounded" style={{ left: `calc(${((pickupLevel as number) / 8) * 100}% - 1px)` }} title={`Pickup level ${pickupLevel}/8`} />
        )}
      </div>
      <div className="flex justify-between text-[10px] font-semibold text-slate-400 mt-1"><span>EMPTY · <span className="ar-ui">فارغ</span></span><span>½</span><span><span className="ar-ui">ممتلئ</span> · FULL</span></div>
    </div>
  );
};

export const CHECK_ICON = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
);

/** Inspection checklist as tappable tiles; shows the pickup result next to each item when comparing. */
export const ChecklistGrid: React.FC<{
  items: string[];
  checked: { [item: string]: boolean };
  onToggle: (item: string, value: boolean) => void;
  disabled?: boolean;
  compareWith?: { [item: string]: boolean };
}> = ({ items, checked, onToggle, disabled, compareWith }) => {
  const done = items.filter(i => checked[i]).length;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-500 tabular-nums">{done} of {items.length} items confirmed <span lang="ar" dir="rtl" className="ar-ui ml-1">تم تأكيد {done} من {items.length}</span></p>
        <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-600" style={{ width: `${(done / items.length) * 100}%` }} /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {items.map(item => {
          const on = !!checked[item];
          const before = compareWith ? !!compareWith[item] : undefined;
          return (
            <button
              type="button"
              key={item}
              disabled={disabled}
              onClick={() => onToggle(item, !on)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left text-[13px] transition-colors ${on ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900' : 'border-slate-200 bg-white text-slate-700'} ${disabled ? 'cursor-default' : 'hover:border-slate-300'}`}
            >
              <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${on ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white'}`}>{on && CHECK_ICON}</span>
              <span className="flex-1 font-medium"><Bi en={item} block /></span>
              {before !== undefined && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ring-1 ring-inset whitespace-nowrap shrink-0 ${before ? 'bg-slate-100 text-slate-500 ring-slate-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>pickup {before ? 'OK' : '—'}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** Four-view damage map with a numbered damage register below it. Markers are stored as % of each square view. */
export const DamageBoard: React.FC<{
  markers: DamageMarker[];
  priorMarkers?: DamageMarker[];
  editable: boolean;
  onMark: (e: React.MouseEvent<HTMLDivElement>, view: CarView) => void;
  onRemove: (index: number) => void;
  onUpdate?: (index: number, patch: Partial<DamageMarker>) => void;
  priorLabel?: string;
}> = ({ markers, priorMarkers, editable, onMark, onRemove, onUpdate, priorLabel = 'Recorded at pickup' }) => {
  const [active, setActive] = useState<number | null>(null);
  const prevCount = useRef(markers.length);
  useEffect(() => {
    // A new mark opens its details so the agent describes it straight away.
    if (markers.length > prevCount.current) setActive(markers.length - 1);
    prevCount.current = markers.length;
  }, [markers.length]);
  const described = markers.filter(isDescribed).length;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {(['front', 'back', 'left', 'right'] as CarView[]).map(view => (
          <div key={view}>
            <SectionLabel className="mb-1.5"><Bi en={INSPECTION_LABEL[view]} /></SectionLabel>
            <div
              className={`relative w-full aspect-square rounded-lg border border-slate-200 bg-slate-50/50 p-1 overflow-hidden ${editable ? 'cursor-crosshair hover:border-indigo-300' : ''}`}
              onClick={e => editable && onMark(e, view)}
            >
              <InspectionDiagram view={view} className="w-full h-full" />
              {(priorMarkers || []).map((m, i) => m.view === view && (
                <span key={`p${i}`} title={damageSummary(m) || priorLabel}
                  className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border-2 border-sky-500 bg-sky-100/80 text-sky-700 text-[9px] font-bold flex items-center justify-center pointer-events-none"
                  style={{ left: `${m.x}%`, top: `${m.y}%` }}>{i + 1}</span>
              ))}
              {markers.map((m, i) => m.view === view && (
                <button type="button" key={i} title={damageSummary(m) || 'Damage mark'}
                  onClick={e => { e.stopPropagation(); setActive(i); }}
                  className={`absolute w-6 h-6 -ml-3 -mt-3 rounded-full text-white text-[10px] font-bold flex items-center justify-center shadow-md ring-2 ${active === i ? 'bg-indigo-600 ring-indigo-200 scale-110' : 'bg-rose-600 ring-white'} transition-transform`}
                  style={{ left: `${m.x}%`, top: `${m.y}%` }}>{i + 1}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {priorMarkers && <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full border-2 border-sky-500 bg-sky-100" /> {priorLabel} ({priorMarkers.length})</span>}
        <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full bg-rose-600" /> {priorMarkers ? 'New damage' : 'Damage'} ({markers.length})</span>
        {editable && <span className="text-slate-400">Tap the car where the damage is · tap a mark to describe it</span>}
      </div>

      <DamageRegister
        title={priorMarkers ? 'New damage register' : 'Damage register'}
        markers={markers} editable={editable && !!onUpdate} active={active} onActivate={setActive}
        onUpdate={(i, patch) => onUpdate?.(i, patch)}
        onRemove={i => { onRemove(i); setActive(null); }}
        described={described}
      />
      {priorMarkers && priorMarkers.length > 0 && (
        <div className="mt-4">
          <SectionLabel><Bi en={priorLabel} /></SectionLabel>
          <ul className="mt-1.5 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/50">
            {priorMarkers.map((m, i) => (
              <li key={i} className="flex items-start gap-2.5 px-3 py-2 text-[13px]">
                <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full border-2 border-sky-500 bg-white text-sky-700 text-[9px] font-bold flex items-center justify-center">{i + 1}</span>
                <span className="min-w-0">
                  <span className="font-medium text-slate-800">{damageSummary(m) || 'Not described'}</span>
                  <span className="text-slate-400"> · {INSPECTION_LABEL[m.view]}</span>
                  {m.note && <span className="block text-xs text-slate-500">{m.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/** One row per diagram mark: what the damage is, where, how big and how bad — printed on the agreement. */
export const DamageRegister: React.FC<{
  title: string;
  markers: DamageMarker[];
  editable: boolean;
  active: number | null;
  described: number;
  onActivate: (i: number | null) => void;
  onUpdate: (index: number, patch: Partial<DamageMarker>) => void;
  onRemove: (index: number) => void;
}> = ({ title, markers, editable, active, described, onActivate, onUpdate, onRemove }) => (
  <div className="mt-5 pt-4 border-t border-slate-100">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <SectionLabel><Bi en={title} /></SectionLabel>
        <p className="text-xs text-slate-500 mt-0.5">Describe each mark. The list is printed on the rental agreement next to the diagram.</p>
      </div>
      {markers.length > 0 && (described === markers.length
        ? <Badge tone="success">All {markers.length} described</Badge>
        : <Badge tone="warning">{markers.length - described} of {markers.length} not described</Badge>)}
    </div>
    {markers.length === 0 ? (
      <div className="mt-2 rounded-lg border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-500">
        No damage marked. {editable ? 'Tap the diagram where you see a scratch, dent or chip.' : ''}
      </div>
    ) : (
      <ol className="mt-2 space-y-2">
        {markers.map((m, i) => {
          const open = editable && active === i;
          return (
            <li key={i} className={`rounded-xl border bg-white transition-shadow ${open ? 'border-indigo-300 shadow-sm ring-1 ring-indigo-100' : 'border-slate-200'}`}>
              <button type="button" onClick={() => onActivate(open ? null : i)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                <span className={`w-7 h-7 shrink-0 rounded-full text-white text-[11px] font-bold flex items-center justify-center ${open ? 'bg-indigo-600' : 'bg-rose-600'}`}>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] font-semibold truncate ${isDescribed(m) ? 'text-slate-900' : 'text-amber-700'}`}>{damageSummary(m) || 'Describe this damage'}</span>
                  <span className="block text-xs text-slate-500 truncate">{INSPECTION_LABEL[m.view]}{m.note ? ` · ${m.note}` : ''}</span>
                </span>
                {m.severity && <Badge tone={m.severity === 'major' ? 'danger' : m.severity === 'moderate' ? 'warning' : 'muted'}>{damageSeverityLabel(m.severity)}</Badge>}
                {editable && <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>}
              </button>
              {open && (
                <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3">
                  <div>
                    <span className={labelCls}><Bi en="Type of damage" /></span>
                    <div className="flex flex-wrap gap-1.5">
                      {DAMAGE_TYPES.map(t => (
                        <button type="button" key={t.value} onClick={() => onUpdate(i, { type: m.type === t.value ? undefined : t.value })}
                          className={`h-8 px-3 rounded-full text-xs font-semibold border transition-colors ${m.type === t.value ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>{t.label}<span lang="ar" dir="rtl" className={`ar-ui ml-1.5 ${m.type === t.value ? '!text-white/75' : ''}`}>{DAMAGE_TYPE_AR[t.value]}</span></button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block min-w-0">
                      <span className={labelCls}><Bi en="Part / location" /></span>
                      <input className={inputCls} list={`damage-parts-${m.view}`} value={m.part || ''} placeholder="e.g. Front bumper"
                        onChange={e => onUpdate(i, { part: e.target.value })} />
                      <datalist id={`damage-parts-${m.view}`}>{DAMAGE_PARTS[m.view].map(p => <option key={p} value={p} />)}</datalist>
                    </label>
                    <label className="block min-w-0">
                      <span className={labelCls}><Bi en="Size" /></span>
                      <select className={`${inputCls} w-full`} value={m.size || ''} onChange={e => onUpdate(i, { size: e.target.value || undefined })}>
                        <option value="">Not measured</option>
                        {DAMAGE_SIZES.map(z => <option key={z} value={z}>{z}</option>)}
                      </select>
                    </label>
                  </div>
                  <div>
                    <span className={labelCls}><Bi en="Severity" /></span>
                    <div className="grid grid-cols-3 rounded-lg bg-slate-100 p-0.5">
                      {DAMAGE_SEVERITIES.map(s => (
                        <button type="button" key={s.value} onClick={() => onUpdate(i, { severity: m.severity === s.value ? undefined : s.value })}
                          className={`h-8 rounded-md text-xs font-semibold transition-colors ${m.severity === s.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{s.label}<span lang="ar" dir="rtl" className="ar-ui ml-1">{DAMAGE_SEVERITY_AR[s.value]}</span></button>
                      ))}
                    </div>
                  </div>
                  <label className="block">
                    <span className={labelCls}><Bi en="Description" /></span>
                    <textarea className={areaCls} rows={2} value={m.note || ''} placeholder="e.g. Light scratch through the clear coat, paint not broken"
                      onChange={e => onUpdate(i, { note: e.target.value })} />
                  </label>
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => onRemove(i)} className="h-9 px-3 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50"><Bi en="Delete mark" className="!text-rose-400" /></button>
                    <Button size="sm" variant="primary" onClick={() => onActivate(null)}><Bi en="Done" className="!text-white/80" /></Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    )}
  </div>
);

export const SignatureBlock: React.FC<{ title: string; subtitle?: string; signature?: string; onSave: (d: string) => void; onClear: () => void; disabled: boolean; onPaper?: boolean; children?: React.ReactNode }> = ({ title, subtitle, signature, onSave, onClear, disabled, onPaper, children }) => (
  <div className="rounded-lg border border-slate-200 p-3 sm:p-4 min-w-0">
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-slate-900"><Bi en={title} block /></h3>
        {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
      </div>
      <Badge tone={signature ? 'success' : onPaper ? 'info' : 'muted'}>{signature ? 'Signed' : onPaper ? 'On paper' : 'Optional'}</Badge>
    </div>
    {children}
    <SignaturePad signature={signature} onSave={onSave} onClear={onClear} disabled={disabled} />
  </div>
);

