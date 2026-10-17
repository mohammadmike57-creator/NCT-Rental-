import React, { useRef, useState } from 'react';
import { CarView, DamageMarker, ReturnChargeItem, ReturnChargeKind, ReturnCharges } from '../types';
import SignaturePad from './SignaturePad';
import { compressImage } from '../services/imageCompress';
import { CHARGE_KIND_LABEL, PAYMENT_METHOD_LABEL, chargesTotal, formatMoney } from '../services/returnChargesDoc';

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
const KIND_STYLE: Record<ReturnChargeKind, string> = {
  damage: 'bg-rose-50 text-rose-700 ring-rose-200',
  ticket: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  fuel: 'bg-amber-50 text-amber-700 ring-amber-200',
  cleaning: 'bg-sky-50 text-sky-700 ring-sky-200',
  late: 'bg-orange-50 text-orange-700 ring-orange-200',
  other: 'bg-slate-100 text-slate-700 ring-slate-200',
};
const DEFAULT_TEXT: Partial<Record<ReturnChargeKind, string>> = {
  fuel: 'Fuel below pickup level',
  cleaning: 'Excessive dirt / smoking cleaning',
  late: 'Late return',
};

const inputCls = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-600';

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
          <button type="button" onClick={() => onOpen(src)} className="block w-16 h-16 rounded-lg overflow-hidden ring-1 ring-slate-200 hover:ring-indigo-400">
            <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
          </button>
          {editable && (
            <button type="button" onClick={() => onRemove(i)} aria-label="Remove photo"
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] leading-none flex items-center justify-center opacity-90 hover:bg-rose-600">✕</button>
          )}
        </div>
      ))}
      {editable && photos.length < MAX_PHOTOS && (
        <>
          <button type="button" onClick={() => cam.current?.click()} disabled={busy}
            className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold disabled:opacity-50">
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

  const kindsToAdd: ReturnChargeKind[] = ['damage', 'ticket', 'fuel', 'cleaning', 'late', 'other'];

  return (
    <div className="space-y-4">
      {/* Items */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-slate-700">No charges — the car came back as it left</p>
          <p className="text-xs text-slate-500 mt-0.5">If there is new damage, a traffic ticket, missing fuel or anything else to bill, add it below.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it, idx) => (
            <li key={it.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 shrink-0 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
                <div className="flex-1 min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset ${KIND_STYLE[it.kind]}`}>{CHARGE_KIND_LABEL[it.kind]}</span>
                    {it.ticketId && <span className="text-[11px] text-slate-500">From Traffic Tickets</span>}
                    {editable && !it.ticketId && (
                      <button type="button" onClick={() => removeItem(it.id)} className="ml-auto text-xs font-semibold text-slate-400 hover:text-rose-600">Remove</button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
                    <input className={inputCls} value={it.description} disabled={!editable} onChange={e => setItem(it.id, { description: e.target.value })}
                      placeholder={it.kind === 'damage' ? 'e.g. Deep scratch on rear left door, 20 cm' : it.kind === 'ticket' ? 'e.g. Speeding 92 km/h in 60 zone — Amman' : 'Description'} />
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{charges.currency}</span>
                      <input type="number" min={0} step="0.001" className={`${inputCls} pl-12 text-right font-semibold tabular-nums`} disabled={!editable || !!it.ticketId}
                        value={it.amount || ''} placeholder="0.000" onChange={e => changeAmount(it.id, parseFloat(e.target.value) || 0)} aria-label="Amount" />
                    </div>
                  </div>
                  {it.kind === 'damage' && (
                    <div className="grid grid-cols-2 gap-3">
                      <select className={inputCls} disabled={!editable} value={it.view || ''} onChange={e => setItem(it.id, { view: (e.target.value || undefined) as CarView | undefined })}>
                        <option value="">Side of car…</option>
                        {VIEWS.map(v => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}
                      </select>
                      <select className={inputCls} disabled={!editable || markers.length === 0} value={it.markerNumber || ''}
                        onChange={e => { const n = parseInt(e.target.value) || undefined; setItem(it.id, { markerNumber: n, view: n ? markers[n - 1]?.view : it.view }); }}>
                        <option value="">{markers.length ? 'Link to diagram mark…' : 'No marks on diagram'}</option>
                        {markers.map((mk, i) => <option key={i} value={i + 1}>Mark #{i + 1} · {mk.view}</option>)}
                      </select>
                    </div>
                  )}
                  {it.kind === 'ticket' && (
                    <div className="grid grid-cols-2 gap-3">
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
            <button key={k} type="button" onClick={() => addItem(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ring-1 ring-inset hover:brightness-95 ${KIND_STYLE[k]}`}>+ {CHARGE_KIND_LABEL[k]}</button>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <>
          {/* Total */}
          <div className="flex items-center justify-between rounded-xl bg-slate-900 text-white px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">Total charges</span>
              {editable && (
                <select value={charges.currency} onChange={e => set({ currency: e.target.value as 'JOD' | 'USD' })} className="bg-white/10 rounded-md text-xs px-1.5 py-1 outline-none" aria-label="Currency">
                  <option value="JOD" className="text-slate-900">JOD</option>
                  <option value="USD" className="text-slate-900">USD</option>
                </select>
              )}
            </div>
            <span className="text-xl font-bold tabular-nums">{money(total)}</span>
          </div>

          {/* Settlement */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              ['paid', 'Paid now', 'Customer pays at the counter — a paid invoice is issued', 'ring-emerald-500 bg-emerald-50/60'],
              ['claim', 'Send as claim', 'Customer pays later — a claim with the amount due is issued', 'ring-amber-500 bg-amber-50/60'],
            ] as const).map(([key, title, sub, on]) => (
              <button key={key} type="button" disabled={!editable} onClick={() => set({ settlement: key })}
                className={`p-3.5 rounded-xl text-left ring-1 transition-colors disabled:cursor-default ${charges.settlement === key ? `ring-2 ${on}` : 'ring-slate-200 bg-white hover:bg-slate-50'}`}>
                <p className="text-sm font-semibold text-slate-900">{title}</p>
                <p className="text-xs text-slate-500">{sub}</p>
              </button>
            ))}
          </div>
          {charges.settlement === 'paid' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select className={inputCls} disabled={!editable} value={charges.paymentMethod || ''} onChange={e => set({ paymentMethod: (e.target.value || undefined) as ReturnCharges['paymentMethod'] })}>
                <option value="">Payment method…</option>
                {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input className={inputCls} disabled={!editable} value={charges.paymentReference || ''} onChange={e => set({ paymentReference: e.target.value })} placeholder="Receipt / auth number (optional)" />
            </div>
          )}
          {charges.settlement === 'claim' && (
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">Payment due by</span>
              <input type="date" className={`${inputCls} sm:w-60`} disabled={!editable} value={charges.dueDate || ''} onChange={e => set({ dueDate: e.target.value })} />
            </label>
          )}

          {/* Customer acknowledgement */}
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Customer acknowledges the charges</h3>
                <p className="text-xs text-slate-500">{customerName} signs to confirm the {items.length} charge{items.length === 1 ? '' : 's'} totalling {money(total)}{charges.settlement === 'paid' ? ' were paid' : charges.settlement === 'claim' ? ' and agrees to pay them' : ''}.</p>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${charges.customerSignature ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{charges.customerSignature ? 'Signed' : 'Required'}</span>
            </div>
            <SignaturePad signature={charges.customerSignature} disabled={!editable}
              onSave={d => set({ customerSignature: d, signedAt: new Date().toISOString() })}
              onClear={() => set({ customerSignature: undefined, signedAt: undefined })} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">After check-in, the {charges.settlement === 'paid' ? 'paid invoice' : charges.settlement === 'claim' ? 'claim' : 'document'} is emailed to the customer as a PDF with the photos.</p>
            <button type="button" onClick={onPreview} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white ring-1 ring-slate-200 hover:bg-slate-50">Preview document</button>
          </div>
        </>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-slate-900/90 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Damage photo" className="max-w-full max-h-full rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
};

export default ReturnChargesPanel;
