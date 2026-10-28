import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Aggregator, ChannelBookingRules, ChannelBookingLocation, Fleet, RentalLocation } from '../../types';
import { API_URL, fetchChannelWebhooks, rotateWebhookSecret, sendTestWebhook, replayWebhook, ChannelWebhookRow } from '../../firebase/api';
import { partnerEndpoints } from '../../services/channelManager';
import { Panel, Button, Badge, inputCls, selectCls, labelCls } from '../ui/Crm';
import { LocationDetails, VehicleDetailsSection, PricingSection, AllotmentsSection, OperationsSection, CancellationSchedule, CurrenciesSection } from './CommercialRules';

/** Defaults the server uses when a rule is not set (see ChannelRules.java). */
export const RULE_DEFAULTS: Required<Omit<ChannelBookingRules, 'locations' | 'allowedGroups' | 'ipAllowlist' | 'webhookUrl' | 'webhookEvents'
  | 'pricing' | 'groupDetails' | 'allotments' | 'noShowAfterHours' | 'noShowFeePercent' | 'inventoryPushDays' | 'cancellationTiers' | 'currencies'>> = {
  bookingsEnabled: true, paymentModel: 'PAY_AT_COUNTER', freeCancellationHours: 48, lateCancellationFeePercent: 100, modificationFee: 0,
  minLeadHours: 2, maxRentalDays: 60, maxHorizonDays: 365, minDriverAge: 21, maxDriverAge: 0, offerValidityMinutes: 30, holdMinutes: 15,
  operationalBuffer: 0, oneWayFee: 0, rateLimitPerMinute: 120,
};

export const WEBHOOK_EVENTS: [string, string][] = [
  ['reservation.created', 'Booking created'], ['reservation.confirmed', 'Booking confirmed'], ['reservation.modified', 'Booking changed'],
  ['reservation.cancelled', 'Booking cancelled'], ['reservation.no_show', 'No-show'], ['reservation.picked_up', 'Car picked up'],
  ['agreement.created', 'Agreement opened'], ['agreement.closed', 'Car returned, agreement closed'],
  ['inventory.updated', 'Inventory changed (free cars per day)'],
];
/** Events sent when no list is saved: everything except the inventory push, which must be picked. */
const DEFAULT_EVENTS = WEBHOOK_EVENTS.map(e => e[0]).filter(e => e !== 'inventory.updated');

interface Props {
  aggregator: Aggregator;
  fleet: Fleet;
  rentalLocations: RentalLocation[];
  onUpdate: (a: Aggregator) => void;
  showConfirmation?: (m: string) => void;
}

export const Section: React.FC<{ title: string; subtitle: string; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, subtitle, actions, children }) => (
  <Panel title={title} subtitle={subtitle} actions={actions} bodyClassName="p-4 space-y-4">{children}</Panel>
);

export const NumberField: React.FC<{ label: string; hint?: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; suffix?: string }> =
  ({ label, hint, value, onChange, min = 0, max, step = 1, suffix }) => (
    <label className="block">
      <span className={labelCls}>{label}{hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}</span>
      <div className="relative">
        <input type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? value : ''} onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className={`${inputCls} tabular-nums ${suffix ? 'pr-14' : ''}`} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
      </div>
    </label>
  );

const statusTone = (s: ChannelWebhookRow['status']) => (s === 'DELIVERED' ? 'success' : s === 'FAILED' ? 'danger' : 'warning');

const BookingApiView: React.FC<Props> = ({ aggregator, fleet, rentalLocations, onUpdate, showConfirmation }) => {
  const saved = aggregator.bookingRules || {};
  const [rules, setRules] = useState<ChannelBookingRules>(saved);
  const [copied, setCopied] = useState<string | null>(null);
  const [hooks, setHooks] = useState<{ secretCreatedAt?: string; deliveries: ChannelWebhookRow[] } | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hookError, setHookError] = useState<string | null>(null);
  const [openLoc, setOpenLoc] = useState<number | null>(null);
  useEffect(() => { setRules(aggregator.bookingRules || {}); setNewSecret(null); }, [aggregator.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const r = { ...RULE_DEFAULTS, ...rules };
  const set = <K extends keyof ChannelBookingRules>(k: K, v: ChannelBookingRules[K]) => setRules(prev => ({ ...prev, [k]: v }));
  const dirty = JSON.stringify(rules) !== JSON.stringify(saved);
  const ep = partnerEndpoints(API_URL || window.location.origin, aggregator);

  const loadHooks = useCallback(() => {
    fetchChannelWebhooks(aggregator.id).then(setHooks).catch(() => setHooks({ deliveries: [] }));
  }, [aggregator.id]);
  useEffect(() => { loadHooks(); }, [loadHooks]);

  const groups = useMemo(() => Array.from(new Set(fleet.map(v => (v.sippCode || '').toUpperCase()).filter(Boolean))).sort(), [fleet]);
  const locations: ChannelBookingLocation[] = rules.locations && rules.locations.length
    ? rules.locations
    : [{ code: aggregator.locationCode || 'AMM', name: rentalLocations[0]?.name || '', pickup: true, dropOff: true }];

  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1500); }).catch(() => undefined);
  };
  const save = () => {
    const p = rules.pricing;
    const clean: ChannelBookingRules = {
      ...rules,
      locations: locations.filter(l => l.code.trim()).map(l => ({ ...l, code: l.code.trim().toUpperCase() })),
      ...(p ? { pricing: { ...p, coverages: (p.coverages || []).filter(c => c.code.trim()), promotions: (p.promotions || []).filter(c => c.code.trim()) } } : {}),
      ...(rules.allotments ? { allotments: rules.allotments.filter(a => a.group && a.from && a.to) } : {}),
    };
    onUpdate({ ...aggregator, bookingRules: clean });
    showConfirmation?.(`Booking rules saved for ${aggregator.name}.`);
  };
  const setLocation = (i: number, patch: Partial<ChannelBookingLocation>) => set('locations', locations.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const createSecret = async () => {
    if (hooks?.secretCreatedAt && !window.confirm('Replace the signing secret? The broker must update it, or it will reject new events.')) return;
    setBusy('secret'); setHookError(null);
    try { const s = await rotateWebhookSecret(aggregator.id); setNewSecret(s.secret); loadHooks(); }
    catch (e: any) { setHookError(e.message); } finally { setBusy(null); }
  };
  const test = async () => {
    setBusy('test'); setHookError(null);
    try { await sendTestWebhook(aggregator.id); loadHooks(); }
    catch (e: any) { setHookError(e.message); } finally { setBusy(null); }
  };
  const replay = async (id: number) => {
    setBusy(`r${id}`);
    try { await replayWebhook(aggregator.id, id); loadHooks(); } finally { setBusy(null); }
  };

  const endpointRows: [string, string, string][] = [
    ['Locations', 'POST', ep.locSearch], ['Availability & offers', 'POST', ep.availRate], ['Book', 'POST', ep.vehRes],
    ['Retrieve', 'POST', ep.retRes], ['Modify', 'POST', ep.modify], ['Cancel', 'POST', ep.cancel],
    ['Rate rules (terms before booking)', 'POST', ep.rateRule], ['Location detail', 'POST', ep.locDetail], ['Ping', 'POST', ep.otaPing],
    ['SOAP 1.1 / 1.2 (all OTA messages)', 'POST', ep.soap], ['WSDL', 'GET', ep.wsdl], ['Native XML schema (XSD)', 'GET', ep.nativeXsd],
  ];

  return (
    <div className="space-y-4">
      {dirty && (
        <div className="sticky top-0 z-10 rounded-xl border border-indigo-200 bg-indigo-50/95 backdrop-blur px-4 py-2.5 flex items-center gap-3">
          <p className="flex-1 text-[13px] text-indigo-900">You have unsaved changes to the booking rules.</p>
          <Button size="sm" onClick={() => setRules(saved)}>Discard</Button>
          <Button size="sm" variant="primary" onClick={save}>Save rules</Button>
        </div>
      )}

      <Section title="Booking API" subtitle="The broker searches, books, changes and cancels through these addresses with its feed key (Connection tab)."
        actions={<label className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-700 cursor-pointer">
          <input type="checkbox" checked={r.bookingsEnabled} onChange={e => set('bookingsEnabled', e.target.checked)} /> Accept bookings
        </label>}>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ['OpenTravel XML (OTA 2003/05)', 'Recommended for brokers and GDS', ep.availRate.replace(/\/OTA_VehAvailRate$/, '/{OTA message}')],
            ['Native XML', 'Header + Credentials, one address per operation', `${ep.nativeXml}/{Operation}`],
            ['REST / JSON', 'snake_case JSON, Idempotency-Key header', ep.rest],
          ].map(([t, s, url]) => (
            <div key={t} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[13px] font-semibold text-slate-900">{t}</p>
              <p className="text-xs text-slate-500">{s}</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="text-[11px] font-mono text-slate-700 truncate flex-1" title={url}>{url}</code>
                <Button size="sm" variant="ghost" onClick={() => copy(t, url)}>{copied === t ? 'Copied' : 'Copy'}</Button>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          {endpointRows.map(([label, method, url]) => (
            <div key={url} className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0 border-slate-100">
              <span className="text-xs text-slate-500 w-52 shrink-0">{label}</span>
              <span className="text-[10px] font-semibold font-mono px-1.5 py-px rounded border border-slate-200 bg-slate-50 text-slate-600">{method}</span>
              <code className="text-xs font-mono text-slate-800 truncate flex-1" title={url}>{url}</code>
              <Button size="sm" variant="ghost" onClick={() => copy(url, url)}>{copied === url ? 'Copied' : 'Copy'}</Button>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          While the channel is in <b>Testing</b> (or the connection environment is Test) every booking is a <b>sandbox</b> booking: it is answered normally but never added to Reservations.
          A broker can also send <span className="font-mono">X-Environment: sandbox</span> on any request.
        </p>
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Payment & cancellation" subtitle="Agreed with the broker; returned with every offer and booking.">
          <label className="block">
            <span className={labelCls}>Payment model</span>
            <select value={r.paymentModel} onChange={e => set('paymentModel', e.target.value as ChannelBookingRules['paymentModel'])} className={`${selectCls} w-full`}>
              <option value="PAY_AT_COUNTER">Pay at the counter — the customer pays us at pick-up</option>
              <option value="BROKER_PREPAID">Broker prepaid — the broker collects and settles with us</option>
            </select>
          </label>
          <CancellationSchedule rules={rules} set={set} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Modification fee" value={r.modificationFee} onChange={v => set('modificationFee', v)} step={0.5} suffix={aggregator.currency || 'USD'} />
            <NumberField label="One-way fee" hint="different return location" value={r.oneWayFee} onChange={v => set('oneWayFee', v)} step={0.5} suffix={aggregator.currency || 'USD'} />
          </div>
        </Section>

        <Section title="Booking limits" subtitle="Requests outside these limits get INVALID_DATE or POLICY_VIOLATION.">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Booking cut-off" value={r.minLeadHours} onChange={v => set('minLeadHours', v)} suffix="h before" />
            <NumberField label="Book up to" value={r.maxHorizonDays} onChange={v => set('maxHorizonDays', v)} min={1} suffix="days ahead" />
            <NumberField label="Longest rental" value={r.maxRentalDays} onChange={v => set('maxRentalDays', v)} min={1} suffix="days" />
            <NumberField label="Cars kept back" hint="per group" value={r.operationalBuffer} onChange={v => set('operationalBuffer', v)} suffix="cars" />
            <NumberField label="Minimum driver age" value={r.minDriverAge} onChange={v => set('minDriverAge', v)} min={16} suffix="years" />
            <NumberField label="Maximum driver age" hint="0 = none" value={r.maxDriverAge} onChange={v => set('maxDriverAge', v)} suffix="years" />
            <NumberField label="Offer valid for" value={r.offerValidityMinutes} onChange={v => set('offerValidityMinutes', v)} min={5} suffix="minutes" />
            <NumberField label="Hold a car for" hint="after a quote" value={r.holdMinutes} onChange={v => set('holdMinutes', v)} min={5} max={60} suffix="minutes" />
          </div>
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Locations" subtitle="The codes this broker sends, mapped to your branches."
          actions={<Button size="sm" onClick={() => set('locations', [...locations, { code: '', name: rentalLocations[0]?.name || '', pickup: true, dropOff: true }])}>Add location</Button>}>
          <div className="space-y-2">
            {locations.map((l, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-2.5 space-y-2">
                <div className="grid grid-cols-[6.5rem_1fr] gap-2">
                  <input value={l.code} onChange={e => setLocation(i, { code: e.target.value.toUpperCase() })} placeholder="AMM" className={`${inputCls} font-mono uppercase`} aria-label="Broker location code" />
                  <select value={l.name} onChange={e => setLocation(i, { name: e.target.value })} className={`${selectCls} w-full`} aria-label="Branch">
                    {!rentalLocations.some(x => x.name === l.name) && <option value={l.name}>{l.name || 'Choose a branch'}</option>}
                    {rentalLocations.map(x => <option key={x.id} value={x.name}>{x.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-600 px-0.5">
                  <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={l.pickup} onChange={e => setLocation(i, { pickup: e.target.checked })} />Pick-ups</label>
                  <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={l.dropOff} onChange={e => setLocation(i, { dropOff: e.target.checked })} />Returns</label>
                  <button type="button" onClick={() => setOpenLoc(openLoc === i ? null : i)} className="ml-auto text-indigo-600 font-semibold hover:underline">
                    {openLoc === i ? 'Hide details' : `Details${l.phone && l.latitude != null && l.openingHours && Object.keys(l.openingHours).length ? ' ✓' : ''}`}</button>
                  {locations.length > 1 && <button type="button" onClick={() => set('locations', locations.filter((_, j) => j !== i))} className="text-rose-600 font-semibold hover:underline">Remove</button>}
                </div>
                {openLoc === i && <LocationDetails loc={l} currency={aggregator.currency || 'USD'} onChange={p => setLocation(i, p)} />}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Vehicle groups sold" subtitle="Brokers book a group (SIPP); the car is assigned at pick-up.">
          <div className="flex flex-wrap gap-2">
            {groups.map(g => {
              const on = !(rules.allowedGroups && rules.allowedGroups.length) || rules.allowedGroups.includes(g);
              const count = fleet.filter(v => (v.sippCode || '').toUpperCase() === g).length;
              return (
                <button key={g} type="button" onClick={() => {
                  const cur = rules.allowedGroups && rules.allowedGroups.length ? rules.allowedGroups : groups;
                  const next = on ? cur.filter(x => x !== g) : [...cur, g];
                  set('allowedGroups', next.length === groups.length ? [] : next);
                }} className={`h-8 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-2 ${on ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-400 line-through'}`}>
                  <span className="font-mono">{g}</span><span className="font-normal">{count} car{count === 1 ? '' : 's'}</span>
                </button>
              );
            })}
            {!groups.length && <p className="text-xs text-slate-500">Give your cars SIPP codes in Fleet Management first.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Rate limit" value={r.rateLimitPerMinute} onChange={v => set('rateLimitPerMinute', v)} min={10} suffix="req / min" />
            <label className="block">
              <span className={labelCls}>IP allow-list <span className="font-normal text-slate-400">optional</span></span>
              <input value={(rules.ipAllowlist || []).join(', ')} onChange={e => set('ipAllowlist', e.target.value.split(/[\s,]+/).filter(Boolean))} placeholder="203.0.113.10, 203.0.113.11" className={`${inputCls} font-mono`} />
            </label>
          </div>
        </Section>
      </div>

      <Section title="Webhooks" subtitle="Signed status updates pushed to the broker; failed deliveries retry for 24 hours."
        actions={<div className="flex gap-2">
          <Button size="sm" onClick={createSecret} disabled={busy === 'secret'}>{hooks?.secretCreatedAt ? 'Rotate signing secret' : 'Create signing secret'}</Button>
          <Button size="sm" variant="primary" onClick={test} disabled={busy === 'test' || !saved.webhookUrl}>{busy === 'test' ? 'Sending…' : 'Send test event'}</Button>
        </div>}>
        <label className="block">
          <span className={labelCls}>Webhook URL <span className="font-normal text-slate-400">public HTTPS address of the broker</span></span>
          <input type="url" value={rules.webhookUrl || ''} onChange={e => set('webhookUrl', e.target.value.trim())} placeholder="https://api.broker.com/webhooks/nct" className={`${inputCls} font-mono`} />
        </label>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {WEBHOOK_EVENTS.map(([ev, label]) => {
            const on = rules.webhookEvents && rules.webhookEvents.length ? rules.webhookEvents.includes(ev) : DEFAULT_EVENTS.includes(ev);
            return (
              <label key={ev} className="inline-flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
                <input type="checkbox" checked={on} onChange={() => {
                  const cur = rules.webhookEvents && rules.webhookEvents.length ? rules.webhookEvents : DEFAULT_EVENTS;
                  const next = on ? cur.filter(x => x !== ev) : [...cur, ev];
                  const same = next.length === DEFAULT_EVENTS.length && DEFAULT_EVENTS.every(x => next.includes(x));
                  set('webhookEvents', same ? [] : next);
                }} />
                {label} <span className="font-mono text-[11px] text-slate-400">{ev}</span>
              </label>
            );
          })}
        </div>
        {newSecret ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-[13px] font-semibold text-amber-900">Signing secret — copy it now, it will not be shown again</p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-slate-900 break-all">{newSecret}</code>
              <Button size="sm" onClick={() => copy('secret', newSecret)}>{copied === 'secret' ? 'Copied' : 'Copy'}</Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            {hooks?.secretCreatedAt ? <>Signing secret created {new Date(hooks.secretCreatedAt).toLocaleString('en-GB')}. </> : <>No signing secret yet — create one before going live. </>}
            Each event is signed: <span className="font-mono">X-NCT-Signature: sha256=HMAC(secret, X-NCT-Timestamp + "." + body)</span>.
          </p>
        )}
        {hookError && <p className="text-xs text-rose-600">{hookError}</p>}
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Recent deliveries</span>
            <button type="button" onClick={loadHooks} className="text-xs font-semibold text-indigo-600 hover:underline">Refresh</button>
          </div>
          {hooks && hooks.deliveries.length ? (
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {hooks.deliveries.map(d => (
                <div key={d.id} className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <Badge tone={statusTone(d.status) as any}>{d.status === 'DELIVERED' ? 'Delivered' : d.status === 'FAILED' ? 'Failed' : 'Retrying'}</Badge>
                  <span className="font-mono text-slate-800">{d.eventType}</span>
                  {d.reservationNumber && <span className="font-mono text-slate-500">{d.reservationNumber}{d.brokerReference ? ` · ${d.brokerReference}` : ''}</span>}
                  <span className="text-slate-400 tabular-nums">{new Date(d.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-slate-400">{d.attempts} attempt{d.attempts === 1 ? '' : 's'}{d.lastHttpStatus ? ` · HTTP ${d.lastHttpStatus}` : ''}</span>
                  {d.lastError && d.status !== 'DELIVERED' && <span className="text-rose-600 truncate max-w-[18rem]" title={d.lastError}>{d.lastError}</span>}
                  <button type="button" onClick={() => replay(d.id)} disabled={busy === `r${d.id}`} className="ml-auto text-indigo-600 font-semibold hover:underline">{busy === `r${d.id}` ? 'Sending…' : 'Send again'}</button>
                </div>
              ))}
            </div>
          ) : <p className="px-3 py-4 text-xs text-slate-500">No webhook events yet.</p>}
        </div>
      </Section>

      <VehicleDetailsSection groups={groups} fleet={fleet} details={rules.groupDetails || {}} onChange={d => set('groupDetails', d)} />
      <PricingSection pricing={rules.pricing || {}} currency={aggregator.currency || 'USD'} groups={groups} onChange={p => set('pricing', p)} />
      <CurrenciesSection base={aggregator.currency || 'USD'} currencies={rules.currencies || {}} onChange={c => set('currencies', c)} />
      <AllotmentsSection allotments={rules.allotments || []} groups={groups} onChange={a => set('allotments', a)} />
      <OperationsSection aggregator={aggregator} rules={rules} set={set} saved={saved} showConfirmation={showConfirmation} />

      {dirty && <div className="flex justify-end"><Button variant="primary" onClick={save}>Save rules</Button></div>}
    </div>
  );
};

export default BookingApiView;
