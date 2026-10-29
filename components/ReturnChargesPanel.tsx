import React, { useRef, useState } from 'react';
import { damageSummary } from '../services/damageMarks';
import { CarView, DamageMarker, ReturnChargeItem, ReturnChargeKind, ReturnCharges } from '../types';
import SignaturePad from './SignaturePad';
import { compressImage } from '../services/imageCompress';
import { CHARGE_KIND_LABEL, PAYMENT_METHOD_LABEL, chargesTotal, formatMoney } from '../services/returnChargesDoc';
import { Badge, Button, SectionLabel, EmptyState, inputCls as kitInput, selectCls } from './ui/Crm';

interface Props {
  charges: ReturnCharges;
  onChange: (c: ReturnCharges) => void;
  editable: boolean;
  markers: DamageMarker[];
  customerName: string;
  onPreview: () => void;
}

const MAX_PHOTOS = 6;
const VIEWS: CarView[] = ['front', 'back', 'left', 'right'];
const KIND_TONE: Record<ReturnChargeKind, 'danger' | 'info' | 'warning' | 'muted' | 'default'> = {
  damage: 'danger',
  ticket: 'info',
  fuel: 'warning',
  cleaning: 'info',
  late: 'warning',
  other: 'muted',
};
const DEFAULT_TEXT: Partial<Record<ReturnChargeKind, string>> = {
  fuel: 'Fuel below pickup level',
  cleaning: 'Excessive dirt / smoking cleaning',
  late: 'Late return',
};

const inputCls = kitInput;
const selCls = `${selectCls} w-full disabled:bg-slate-50 disabled:text-slate-500`;

const CameraIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>
);

const PhotoStrip: React.FC<{ item: ReturnChargeItem; editable: boolean; onAdd: (files: FileList) => void; onRemove: (i: number) => void; onOpen: (src: string) => void; busy: boolean }> = ({ item, editable, onAdd, onRemove, onOpen, busy }) => {
  const cam = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  const photos = item.photos || [];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {photos.map((src, i) => (
        <div key={i} className="relative group">
          <button type="button" onClick={() => onOpen(src)} className="block w-14 h-14 rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-400">
            <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
          </button>
          {editable && (
            <button type="button" onClick={() => onRemove(i)} aria-label="Remove photo"
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-300 text-slate-500 shadow-sm flex items-center justify-center hover:text-rose-600 hover:border-rose-300"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
          )}
        </div>
      ))}
      {editable && photos.length < MAX_PHOTOS && (
        <>
          <button type="button" onClick={() => cam.current?.click()} disabled={busy}
            className="w-14 h-14 rounded-lg border border-dashed border-slate-300 bg-white text-slate-500 hover:border-indigo-400 hover:text-indigo-600 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold disabled:opacity-50">
            {busy ? <span className="w-4 h-4 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" /> : <CameraIcon />}
            {busy ? 'Saving' : 'Camera'}
          </button>
          <button type="button" onClick={() => pick.current?.click()} disabled={busy} className="text-xs font-semibold text-indigo-600 hover:underline disabled:opacity-50">Upload</button>
          <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { if (e.target.files?.length) onAdd(e.target.files); e.target.value = ''; }} />
          <input ref={pick} type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files?.length) onAdd(e.target.files); e.target.value = ''; }} />
        </>
      )}
      {!editable && photos.length === 0 && <span className="text-xs text-slate-400">No photos</span>}
    </div>
  );
};

const ReturnChargesPanel: React.FC<Props> = ({ charges, onChange, editable, markers, customerName, onPreview }) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const items = charges.items;
  const total = chargesTotal(items);
  const money = (n: number) => formatMoney(n, charges.currency);

  const set = (patch: Partial<ReturnCharges>) => onChange({ ...charges, ...patch });
  const setItem = (id: string, patch: Partial<ReturnChargeItem>) => set({ items: items.map(i => (i.id === id ? { ...i, ...patch } : i)) });
  const addItem = (kind: ReturnChargeKind) => set({
    items: [...items, { id: `rc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind, description: DEFAULT_TEXT[kind] || '', amount: 0, photos: [] }],
    customerSignature: undefined, signedAt: undefined,
  });
  const removeItem = (id: string) => set({ items: items.filter(i => i.id !== id), customerSignature: undefined, signedAt: undefined });

  const addPhotos = async (item: ReturnChargeItem, files: FileList) => {
    setBusyId(item.id);
    setPhotoError(null);
    try {
      const room = MAX_PHOTOS - (item.photos?.length || 0);
      const added = await Promise.all(Array.from(files).slice(0, room).map(f => compressImage(f)));
      setItem(item.id, { photos: [...(item.photos || []), ...added] });
    } catch (e: any) {
      setPhotoError(e?.message || 'Could not read the photo');
    } finally {
      setBusyId(null);
    }
  };

  // Any change to the amounts after signing invalidates the customer's signature.
  const changeAmount = (id: string, amount: number) => onChange({ ...charges, items: items.map(i => (i.id === id ? { ...i, amount } : i)), customerSignature: undefined, signedAt: undefined });

  const kindsToAdd: ReturnChargeKind[] = ['damage', 'ticket', 'fuel', 'cleaning', 'other'];

  return (
    <div className="space-y-4">
      {/* Items */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white">
          <EmptyState className="py-8" title="No charges — the car came back as it left" hint="If there is new damage, a traffic ticket, missing fuel or anything else to bill, add it below." />
        </div>
      ) : (
        <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
          {items.map((it, idx) => (
            <li key={it.id} className="p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 shrink-0 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold tabular-nums flex items-center justify-center mt-0.5">{idx + 1}</span>
                <div className="flex-1 min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={KIND_TONE[it.kind]}>{CHARGE_KIND_LABEL[it.kind]}</Badge>
                    {it.ticketId && <span className="text-[11px] text-slate-500">From Traffic Tickets</span>}
                    {editable && !it.ticketId && (
                      <button type="button" onClick={() => removeItem(it.id)} className="ml-auto h-7 px-2 rounded-md text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50">Remove</button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px] gap-2">
                    <input className={inputCls} value={it.description} disabled={!editable} onChange={e => setItem(it.id, { description: e.target.value })}
                      placeholder={it.kind === 'damage' ? 'e.g. Deep scratch on rear left door, 20 cm' : it.kind === 'ticket' ? 'e.g. Speeding 92 km/h in 60 zone — Amman' : 'Description'} />
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{charges.currency}</span>
                      <input type="number" min={0} step="0.001" className={`${inputCls} pl-12 text-right font-semibold tabular-nums`} disabled={!editable || !!it.ticketId}
                        value={it.amount || ''} placeholder="0.000" onChange={e => changeAmount(it.id, parseFloat(e.target.value) || 0)} aria-label="Amount" />
                    </div>
                  </div>
                  {it.kind === 'damage' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select className={selCls} disabled={!editable} value={it.view || ''} onChange={e => setItem(it.id, { view: (e.target.value || undefined) as CarView | undefined })}>
                        <option value="">Side of car…</option>
                        {VIEWS.map(v => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}
                      </select>
                      <select className={selCls} disabled={!editable || markers.length === 0} value={it.markerNumber || ''}
                        onChange={e => { const n = parseInt(e.target.value) || undefined; const mk = n ? markers[n - 1] : undefined; setItem(it.id, { markerNumber: n, view: mk ? mk.view : it.view, ...(mk && (!it.description || it.description === DEFAULT_TEXT[it.kind]) && (damageSummary(mk) || mk.note) ? { description: [damageSummary(mk), mk.note].filter(Boolean).join(' — ') } : {}) }); }}>
                        <option value="">{markers.length ? 'Link to diagram mark…' : 'No marks on diagram'}</option>
                        {markers.map((mk, i) => <option key={i} value={i + 1}>Mark #{i + 1} · {damageSummary(mk) || mk.view}</option>)}
                      </select>
                    </div>
                  )}
                  {it.kind === 'ticket' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input type="date" className={inputCls} disabled={!editable || !!it.ticketId} value={(it.ticketDate || '').slice(0, 10)} onChange={e => setItem(it.id, { ticketDate: e.target.value })} aria-label="Ticket date" />
                      <input className={inputCls} disabled={!editable || !!it.ticketId} value={it.ticketReference || ''} onChange={e => setItem(it.id, { ticketReference: e.target.value })} placeholder="Ticket / violation number" />
                    </div>
                  )}
                  {(it.kind === 'damage' || it.kind === 'ticket' || (it.photos?.length || 0) > 0 || editable) && (
                    <PhotoStrip item={it} editable={editable} busy={busyId === it.id} onAdd={files => addPhotos(it, files)}
                      onRemove={i => setItem(it.id, { photos: (it.photos || []).filter((_, j) => j !== i) })} onOpen={setLightbox} />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {photoError && <p className="text-xs text-rose-600">{photoError}</p>}

      {editable && (
        <div className="flex flex-wrap gap-2">
          {kindsToAdd.map(k => (
            <Button key={k} size="sm" variant="secondary" onClick={() => addItem(k)}>+ {CHARGE_KIND_LABEL[k]}</Button>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <>
          {/* Total */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <SectionLabel>Total charges</SectionLabel>
              {editable && (
                <select value={charges.currency} onChange={e => set({ currency: e.target.value as 'JOD' | 'USD' })} className="h-7 pl-2 pr-6 bg-white border border-slate-300 rounded-md text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" aria-label="Currency">
                  <option value="JOD">JOD</option>
                  <option value="USD">USD</option>
                </select>
              )}
            </div>
            <span className="text-xl font-semibold text-slate-900 tabular-nums">{money(total)}</span>
          </div>

          {/* Settlement */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([
              ['paid', 'Paid now', 'Customer pays at the counter — a paid invoice is issued', 'border-emerald-500 ring-2 ring-emerald-500/15 bg-emerald-50/50'],
              ['claim', 'Send as claim', 'Customer pays later — a claim with the amount due is issued', 'border-amber-500 ring-2 ring-amber-500/15 bg-amber-50/50'],
            ] as const).map(([key, title, sub, on]) => (
              <button key={key} type="button" disabled={!editable} onClick={() => set({ settlement: key })}
                className={`p-3 rounded-lg text-left border transition-colors disabled:cursor-default ${charges.settlement === key ? on : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <p className="text-[13px] font-semibold text-slate-900">{title}</p>
                <p className="text-xs text-slate-500">{sub}</p>
              </button>
            ))}
          </div>
          {charges.settlement === 'paid' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select className={selCls} disabled={!editable} value={charges.paymentMethod || ''} onChange={e => set({ paymentMethod: (e.target.value || undefined) as ReturnCharges['paymentMethod'] })}>
                <option value="">Payment method…</option>
                {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input className={inputCls} disabled={!editable} value={charges.paymentReference || ''} onChange={e => set({ paymentReference: e.target.value })} placeholder="Receipt / auth number (optional)" />
            </div>
          )}
          {charges.settlement === 'claim' && (
            <label className="block">
              <span className="block text-[13px] font-medium text-slate-700 mb-1">Payment due by</span>
              <input type="date" className={`${inputCls} sm:w-60`} disabled={!editable} value={charges.dueDate || ''} onChange={e => set({ dueDate: e.target.value })} />
            </label>
          )}

          {/* Customer acknowledgement */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Customer acknowledges the charges</h3>
                <p className="text-xs text-slate-500">{customerName} signs to confirm the {items.length} charge{items.length === 1 ? '' : 's'} totalling {money(total)}{charges.settlement === 'paid' ? ' were paid' : charges.settlement === 'claim' ? ' and agrees to pay them' : ''}.</p>
              </div>
              <Badge tone={charges.customerSignature ? 'success' : 'muted'}>{charges.customerSignature ? 'Signed' : 'Required'}</Badge>
            </div>
            <SignaturePad signature={charges.customerSignature} disabled={!editable}
              onSave={d => set({ customerSignature: d, signedAt: new Date().toISOString() })}
              onClear={() => set({ customerSignature: undefined, signedAt: undefined })} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">After check-in, the {charges.settlement === 'paid' ? 'paid invoice' : charges.settlement === 'claim' ? 'claim' : 'document'} is emailed to the customer as a PDF with the photos.</p>
            <Button size="sm" variant="secondary" onClick={onPreview}>Preview document</Button>
          </div>
        </>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-slate-900/90 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Damage photo" className="max-w-full max-h-full rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
};

export default ReturnChargesPanel;
