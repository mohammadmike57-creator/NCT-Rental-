import React, { useEffect, useState } from 'react';
import { Aggregator, ChannelConnectionProfile, ConnectionState, Fleet } from '../../types';
import { Panel, Button, Badge, inputCls, selectCls, labelCls, textareaCls } from '../ui/Crm';

/** The connection states, in order. A new channel is Not connected until the broker has actually built and approved it. */
export const CONNECTION_STATES: { id: ConnectionState; label: string; hint: string; tone: 'muted' | 'info' | 'warning' | 'success' | 'danger' }[] = [
  { id: 'not_connected', label: 'Not connected', hint: 'Channel set up on our side only; the broker has not connected.', tone: 'muted' },
  { id: 'in_development', label: 'In development', hint: 'The broker has our specification (or we have theirs) and is building the connection.', tone: 'info' },
  { id: 'broker_testing', label: 'Broker testing', hint: 'The broker is sending test requests to our sandbox.', tone: 'warning' },
  { id: 'broker_certified', label: 'Certified by broker', hint: 'The broker has approved the connection (evidence below).', tone: 'info' },
  { id: 'live', label: 'Live', hint: 'Real bookings are flowing.', tone: 'success' },
  { id: 'suspended', label: 'Suspended', hint: 'Connection stopped by either side.', tone: 'danger' },
];
export const connectionStateOf = (a: Aggregator) => CONNECTION_STATES.find(s => s.id === (a.connectionProfile?.state || 'not_connected'))!;

const DIRECTIONS: [NonNullable<ChannelConnectionProfile['direction']>, string][] = [
  ['broker_calls_us', 'The broker calls our API (search, book, modify, cancel)'],
  ['we_call_broker', 'We send rates and availability to the broker\'s system'],
  ['both', 'Both: the broker books through our API and we push rates / inventory'],
];
const FORMATS: [NonNullable<ChannelConnectionProfile['format']>, string][] = [
  ['OTA_XML', 'OpenTravel XML over HTTPS'], ['OTA_SOAP', 'OpenTravel XML over SOAP'], ['NATIVE_XML', 'Native XML'],
  ['REST_JSON', 'REST / JSON'], ['BROKER_OWN', 'The broker\'s own format (needs an adapter)'],
];
const AUTH: [NonNullable<ChannelConnectionProfile['auth']>, string][] = [
  ['API_KEY_HEADER', 'API key in the Authorization / X-Api-Key header'], ['OTA_POS', 'OTA POS / RequestorID MessagePassword'],
  ['WS_SECURITY', 'SOAP WS-Security UsernameToken'], ['BROKER_CREDENTIALS', 'Credentials the broker issued to us'],
];
const UPDATES: [NonNullable<ChannelConnectionProfile['statusUpdates']>, string][] = [
  ['WEBHOOKS', 'Our signed webhooks to the broker'], ['BROKER_POLLS', 'The broker reads them (retrieve / reservation list)'], ['NONE', 'No status updates'],
];
const SETTLEMENT: [NonNullable<ChannelConnectionProfile['settlement']>, string][] = [
  ['COUNTER', 'Customer pays us at the counter'], ['BROKER_VOUCHER', 'Broker prepaid: voucher, broker pays us'],
  ['VIRTUAL_CARD', 'Broker prepaid: virtual card charged by us'], ['INVOICE', 'We invoice the broker'],
];

interface Props {
  aggregator: Aggregator;
  fleet: Fleet;
  currentUserName?: string;
  onUpdate: (a: Aggregator) => void;
  showConfirmation?: (m: string) => void;
}

/**
 * The real connection with one broker: who calls whom, the agreed format and message version,
 * which operations the broker uses (the server refuses the others), settlement, contacts,
 * limitations and the broker's own certification. Adding a channel does not connect a broker.
 */
const ConnectionProfileView: React.FC<Props> = ({ aggregator: a, fleet, currentUserName, onUpdate, showConfirmation }) => {
  const saved = a.connectionProfile || {};
  const savedOps = a.bookingRules?.operations || {};
  const [p, setP] = useState<ChannelConnectionProfile>(saved);
  const [ops, setOps] = useState(savedOps);
  const [note, setNote] = useState('');
  useEffect(() => { setP(a.connectionProfile || {}); setOps(a.bookingRules?.operations || {}); setNote(''); }, [a.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof ChannelConnectionProfile>(k: K, v: ChannelConnectionProfile[K]) => setP(prev => ({ ...prev, [k]: v }));
  const state = p.state || 'not_connected';
  const dirty = JSON.stringify(p) !== JSON.stringify(saved) || JSON.stringify(ops) !== JSON.stringify(savedOps);
  const on = (k: 'retrieve' | 'modify' | 'cancel') => ops[k] !== false;

  const save = () => {
    if ((state === 'broker_certified' || state === 'live') && !(p.certifiedAt && p.certifiedBy)) {
      alert('Enter the broker\'s certification: the date and who approved it on their side.');
      return;
    }
    const changedState = state !== (saved.state || 'not_connected');
    const history = changedState
      ? [{ at: new Date().toISOString(), by: currentUserName || 'Staff', state, ...(note.trim() ? { note: note.trim() } : {}) }, ...(saved.history || [])].slice(0, 50)
      : saved.history;
    const next = { ...p, state, history };
    onUpdate({ ...a, connectionProfile: next, bookingRules: { ...(a.bookingRules || {}), operations: ops } });
    setP(next);
    setNote('');
    showConfirmation?.(`Connection profile saved for ${a.name}.`);
  };

  // What is mapped on our side (the codes the broker will use).
  const mapped: [string, boolean, string][] = [
    ['Locations', !!a.bookingRules?.locations?.length || !!a.locationCode, `${a.bookingRules?.locations?.length || (a.locationCode ? 1 : 0)} location code(s)`],
    ['Vehicle groups', fleet.some(v => !!v.sippCode), `${new Set(fleet.map(v => (v.sippCode || '').toUpperCase()).filter(Boolean)).size} SIPP group(s)`],
    ['Extras', (a.extras || []).every(e => !!e.otaEquipType), `${(a.extras || []).filter(e => !!e.otaEquipType).length} of ${(a.extras || []).length} with codes`],
    ['Rates', (a.ratePlanHistory || []).length > 0, (a.ratePlanHistory || []).length ? `version ${(a.ratePlanHistory || []).length} published` : 'not published'],
  ];
  const st = CONNECTION_STATES.find(s => s.id === state)!;

  return (
    <Panel title={<span className="flex items-center gap-2">Connection profile <Badge tone={st.tone}>{st.label}</Badge></span>}
      subtitle="The real connection with this broker. Adding a channel does not connect it: it stays Not connected until the broker has built, tested and approved the connection."
      actions={dirty ? <div className="flex gap-2"><Button size="sm" onClick={() => { setP(saved); setOps(savedOps); }}>Discard</Button><Button size="sm" variant="primary" onClick={save}>Save profile</Button></div> : undefined}
      bodyClassName="p-4 space-y-5">
      {/* State */}
      <div>
        <p className={labelCls}>Connection state</p>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {CONNECTION_STATES.map(s => (
            <button key={s.id} type="button" onClick={() => set('state', s.id)} aria-pressed={state === s.id} title={s.hint}
              className={`text-left rounded-lg border px-3 py-2 ${state === s.id ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500' : 'border-slate-200 hover:bg-slate-50'}`}>
              <p className="text-[13px] font-semibold text-slate-900">{s.label}</p>
              <p className="text-[11px] text-slate-500 leading-snug">{s.hint}</p>
            </button>
          ))}
        </div>
        {state !== (saved.state || 'not_connected') && (
          <input className={`${inputCls} mt-2`} placeholder="Note for the history (optional): e.g. spec v2.3 received from the broker" value={note} onChange={e => setNote(e.target.value)} />
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Technical contract */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Technical contract</p>
          <label className="block"><span className={labelCls}>Connection direction</span>
            <select className={`${selectCls} w-full`} value={p.direction || ''} onChange={e => set('direction', (e.target.value || undefined) as ChannelConnectionProfile['direction'])}>
              <option value="">Not agreed yet</option>{DIRECTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={labelCls}>Format</span>
              <select className={`${selectCls} w-full`} value={p.format || ''} onChange={e => set('format', (e.target.value || undefined) as ChannelConnectionProfile['format'])}>
                <option value="">Not agreed yet</option>{FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            <label className="block"><span className={labelCls}>Message version <span className="font-normal text-slate-400">OTA Version</span></span>
              <input className={`${inputCls} font-mono`} placeholder="2.000" value={p.messageVersion || ''} onChange={e => set('messageVersion', e.target.value)} /></label>
          </div>
          <label className="block"><span className={labelCls}>Authentication</span>
            <select className={`${selectCls} w-full`} value={p.auth || ''} onChange={e => set('auth', (e.target.value || undefined) as ChannelConnectionProfile['auth'])}>
              <option value="">Not agreed yet</option>{AUTH.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></label>
          <label className="block"><span className={labelCls}>Broker's specification <span className="font-normal text-slate-400">name, version, date</span></span>
            <input className={inputCls} placeholder="e.g. Partner XML spec v4.2, 12 Oct 2026 (or: uses our integration guide)" value={p.brokerSpec || ''} onChange={e => set('brokerSpec', e.target.value)} /></label>
          {p.format === 'BROKER_OWN' && (
            <p className="text-xs rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">The broker's own format needs an adapter built and tested against its specification before this connection can work.</p>
          )}
          <div>
            <p className={labelCls}>Operations the broker uses <span className="font-normal text-slate-400">the server refuses the others</span></p>
            <div className="grid grid-cols-2 gap-2">
              <span className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-500"><input type="checkbox" checked disabled /> Search &amp; book</span>
              {(['retrieve', 'modify', 'cancel'] as const).map(k => (
                <label key={k} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 cursor-pointer">
                  <input type="checkbox" checked={on(k)} onChange={e => setOps(o => ({ ...o, [k]: e.target.checked }))} />
                  {k === 'retrieve' ? 'Retrieve' : k === 'modify' ? 'Modify' : 'Cancel'}
                </label>
              ))}
            </div>
          </div>
          <label className="block"><span className={labelCls}>Status updates to the broker</span>
            <select className={`${selectCls} w-full`} value={p.statusUpdates || ''} onChange={e => set('statusUpdates', (e.target.value || undefined) as ChannelConnectionProfile['statusUpdates'])}>
              <option value="">Not agreed yet</option>{UPDATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></label>
          <div>
            <p className={labelCls}>Our codes for this broker</p>
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
              {mapped.map(([l, ok, detail]) => (
                <div key={l} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
                  <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className="text-slate-800 w-32">{l}</span><span className="text-slate-500">{detail}</span>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Locations, groups and payment rules: Booking API tab · extras: Extras tab · rates: Rates tab.</p>
          </div>
        </div>

        {/* Commercial, contacts, certification */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Commercial &amp; settlement</p>
          <label className="block"><span className={labelCls}>Who collects the rental payment</span>
            <select className={`${selectCls} w-full`} value={p.settlement || ''} onChange={e => set('settlement', (e.target.value || undefined) as ChannelConnectionProfile['settlement'])}>
              <option value="">Not agreed yet</option>{SETTLEMENT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={labelCls}>Settlement period</span>
              <select className={`${selectCls} w-full`} value={p.settlementPeriod || ''} onChange={e => set('settlementPeriod', (e.target.value || undefined) as ChannelConnectionProfile['settlementPeriod'])}>
                <option value="">Not agreed yet</option><option value="PER_BOOKING">Per booking</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option>
              </select></label>
            <label className="block"><span className={labelCls}>Commission on</span>
              <select className={`${selectCls} w-full`} value={p.commissionBasis || ''} onChange={e => set('commissionBasis', (e.target.value || undefined) as ChannelConnectionProfile['commissionBasis'])}>
                <option value="">Not agreed yet</option><option value="GROSS">Gross price (incl. tax)</option><option value="NET">Net price (excl. tax)</option>
              </select></label>
          </div>
          <p className="text-[11px] text-slate-400">Commission rate: Overview tab ({a.commissionPercent ?? 0}%). The security deposit is always separate from the rental payment.</p>

          <p className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Contacts</p>
          {([['technicalContact', 'Technical contact'], ['operationsContact', 'Operations / escalation contact'], ['invoicingContact', 'Invoicing contact']] as const).map(([k, l]) => (
            <label key={k} className="block"><span className={labelCls}>{l}</span>
              <input className={inputCls} placeholder="Name · email · phone" value={p[k] || ''} onChange={e => set(k, e.target.value)} /></label>
          ))}

          <p className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Broker certification</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={labelCls}>Approved on</span>
              <input type="date" className={inputCls} value={p.certifiedAt || ''} onChange={e => set('certifiedAt', e.target.value)} /></label>
            <label className="block"><span className={labelCls}>Approved by <span className="font-normal text-slate-400">at the broker</span></span>
              <input className={inputCls} value={p.certifiedBy || ''} onChange={e => set('certifiedBy', e.target.value)} /></label>
          </div>
          <label className="block"><span className={labelCls}>Evidence <span className="font-normal text-slate-400">email, ticket or document reference</span></span>
            <input className={inputCls} value={p.certificationReference || ''} onChange={e => set('certificationReference', e.target.value)} /></label>
          <label className="block"><span className={labelCls}>Limitations agreed</span>
            <textarea rows={2} className={textareaCls} placeholder="e.g. no modifications: the broker cancels and re-books; airport station only" value={p.limitations || ''} onChange={e => set('limitations', e.target.value)} /></label>
        </div>
      </div>

      {(saved.history || []).length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">History</p>
          <ul className="text-xs text-slate-600 space-y-0.5">
            {(saved.history || []).slice(0, 8).map((h, i) => (
              <li key={i}><span className="tabular-nums text-slate-400">{new Date(h.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                {' · '}{h.by} set <b>{CONNECTION_STATES.find(s => s.id === h.state)?.label || h.state}</b>{h.note ? ` — ${h.note}` : ''}</li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
};

export default ConnectionProfileView;
