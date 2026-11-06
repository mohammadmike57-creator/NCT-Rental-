import React, { useCallback, useEffect, useState } from 'react';
import { Aggregator } from '../../types';
import {
  ConnectorSendRow, ConnectorType, OutboundConnectorRow, deleteConnector, fetchConnectorSends, fetchConnectors, saveConnector, testConnector,
} from '../../firebase/api';
import { Panel, Badge, Button, Dialog, EmptyState, inputCls, selectCls, table } from '../ui/Crm';

/**
 * Connections where we call the broker's own system: rate files, availability push and booking
 * notifications. Credentials are stored encrypted on the server and never shown again.
 */
const TYPES: Record<ConnectorType, { label: string; hint: string; formats: string[] }> = {
  RATE_FILE: { label: 'Rate file', hint: 'The rate sheet with this broker\'s price rules, sent when rates are published and daily.', formats: ['XML', 'CSV'] },
  ARI_PUSH: { label: 'Availability push', hint: 'Free cars per group per day as JSON, sent when it changes and once a day in full.', formats: ['JSON'] },
  RES_NOTIFY: { label: 'Booking notifications', hint: 'Every live booking created, changed or cancelled, sent to the broker as it happens.', formats: ['XML', 'JSON'] },
};
const AUTH: Record<string, string> = { NONE: 'None', BASIC: 'Username and password', BEARER: 'Bearer token', HEADER: 'API key in a header', OAUTH2: 'OAuth 2.0 client credentials' };
const when = (s?: string) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const KIND: Record<string, string> = {
  'rates.published': 'Rates published', 'rates.daily': 'Daily rates', 'availability.changed': 'Availability changed', 'availability.daily': 'Daily availability',
  'reservation.created': 'Booking created', 'reservation.confirmed': 'Booking confirmed', 'reservation.modified': 'Booking changed',
  'reservation.cancelled': 'Booking cancelled', 'reservation.no_show': 'No-show', 'connector.test': 'Test',
};

type Draft = {
  type: ConnectorType; name: string; url: string; method: 'POST' | 'PUT'; format: string; authType: string; authUser: string; secret: string;
  tokenUrl: string; scope: string; dailyHour: number; days: number; minIntervalSeconds: number; onPublish: boolean; enabled: boolean; fieldMap: string;
};
const blank = (type: ConnectorType = 'RES_NOTIFY'): Draft => ({
  type, name: '', url: '', method: 'POST', format: TYPES[type].formats[0], authType: 'NONE', authUser: '', secret: '', tokenUrl: '', scope: '',
  dailyHour: 3, days: 60, minIntervalSeconds: 300, onPublish: true, enabled: true, fieldMap: '',
});

const OutboundView: React.FC<{ aggregator: Aggregator; showConfirmation?: (m: string) => void }> = ({ aggregator, showConfirmation }) => {
  const [rows, setRows] = useState<OutboundConnectorRow[] | null>(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<{ id?: string; d: Draft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [sends, setSends] = useState<Record<string, ConnectorSendRow[]>>({});
  const [test, setTest] = useState<{ name: string; ok: boolean; httpStatus?: number; error?: string; preview: string } | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    fetchConnectors(aggregator.id).then(r => { setRows(r); setError(''); }).catch(() => { setRows([]); setError('Could not load the connections from the server.'); });
  }, [aggregator.id]);
  useEffect(() => { load(); }, [load]);
  const loadSends = (id: string) => fetchConnectorSends(aggregator.id, id).then(s => setSends(x => ({ ...x, [id]: s }))).catch(() => undefined);

  const startEdit = (c?: OutboundConnectorRow) => {
    setFormError('');
    setEdit(c ? {
      id: c.id, d: {
        type: c.type, name: c.name, url: c.url, method: c.method, format: c.format, authType: c.authType, authUser: c.authUser || '', secret: '',
        tokenUrl: c.tokenUrl || '', scope: c.scope || '', dailyHour: c.dailyHour, days: c.days, minIntervalSeconds: c.minIntervalSeconds,
        onPublish: c.onPublish, enabled: c.enabled, fieldMap: Object.entries(c.fieldMap || {}).map(([k, v]) => `${k} = ${v}`).join('\n'),
      },
    } : { d: blank() });
  };
  const set = (p: Partial<Draft>) => setEdit(e => (e ? { ...e, d: { ...e.d, ...p } } : e));

  const save = async () => {
    if (!edit) return;
    const d = edit.d;
    const map: Record<string, string> = {};
    for (const line of d.fieldMap.split('\n').map(l => l.trim()).filter(Boolean)) {
      const m = line.match(/^([\w.$-]+)\s*(?:=|->|→|:)\s*([\w.$-]+)$/);
      if (!m) { setFormError(`Field mapping line "${line}" should look like: vehicle_group = sipp`); return; }
      map[m[1]] = m[2];
    }
    setSaving(true); setFormError('');
    try {
      await saveConnector(aggregator.id, {
        ...(edit.id ? {} : { type: d.type }), name: d.name.trim(), url: d.url.trim(), method: d.method, format: d.format, authType: d.authType,
        authUser: d.authUser.trim(), tokenUrl: d.tokenUrl.trim(), scope: d.scope.trim(), ...(d.secret.trim() ? { secret: d.secret.trim() } : {}),
        dailyHour: d.dailyHour, days: d.days, minIntervalSeconds: d.minIntervalSeconds, onPublish: d.onPublish, enabled: d.enabled,
        ...(d.type === 'ARI_PUSH' ? { fieldMap: map } : {}),
      }, edit.id);
      showConfirmation?.(`${d.name || TYPES[d.type].label} saved.`);
      setEdit(null); load();
    } catch (e: any) { setFormError(e.message); } finally { setSaving(false); }
  };
  const remove = async (c: OutboundConnectorRow) => {
    if (!window.confirm(`Delete "${c.name}"?\n\nNothing more is sent to ${c.url}. Messages already sent are not affected.`)) return;
    await deleteConnector(aggregator.id, c.id); showConfirmation?.(`${c.name} deleted.`); load();
  };
  const toggle = async (c: OutboundConnectorRow) => { await saveConnector(aggregator.id, { enabled: !c.enabled }, c.id); load(); };
  const runTest = async (c: OutboundConnectorRow) => {
    setBusy(c.id);
    try { const r = await testConnector(aggregator.id, c.id); setTest({ name: c.name, ...r }); load(); if (open === c.id) loadSends(c.id); }
    catch (e: any) { alert(e.message); } finally { setBusy(''); }
  };

  const d = edit?.d;
  return (
    <div className="space-y-4">
      <Panel title="Outbound connections" subtitle={`Where we send to ${aggregator.name}'s own system. Brokers that only call us need none. Only public HTTPS addresses; test bookings are never sent.`}
        actions={<Button variant="primary" size="sm" onClick={() => startEdit()}>Add connection</Button>}>
        {error && <p className="px-4 py-3 text-xs text-rose-600">{error}</p>}
        {rows === null ? <p className="px-4 py-8 text-center text-[13px] text-slate-500">Loading…</p> : rows.length === 0 ? (
          <EmptyState title="No outbound connections" hint="Add one when the broker asks us to send rates, availability or bookings to their system." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(c => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold text-slate-900">{c.name}</p>
                      <Badge tone="info">{TYPES[c.type].label}</Badge>
                      <Badge tone="muted">{c.format}</Badge>
                      {!c.enabled ? <Badge tone="muted">Off</Badge> : c.lastResult ? <Badge tone={c.lastOk ? 'success' : 'danger'}>{c.lastOk ? 'Working' : 'Failing'}</Badge> : <Badge tone="warning">Not used yet</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs font-mono text-slate-600 break-all">{c.method} {c.url}</p>
                    <p className="text-[11px] text-slate-500">
                      Login: {AUTH[c.authType]}{c.authUser ? ` (${c.authUser})` : ''}{c.hasSecret ? ' · secret stored' : ''}
                      {c.type !== 'RES_NOTIFY' && (c.dailyHour >= 0 ? ` · daily at ${String(c.dailyHour).padStart(2, '0')}:00` : ' · no daily send')}
                      {c.type === 'RATE_FILE' && c.onPublish ? ' · on every publish' : ''}
                      {c.type === 'ARI_PUSH' ? ` · ${c.days} days ahead, at most every ${Math.round(c.minIntervalSeconds / 60)} min` : ''}
                    </p>
                    {c.lastResult && <p className={`text-[11px] ${c.lastOk ? 'text-slate-500' : 'text-rose-600'}`}>{c.lastResult}{c.lastSentAt ? ` · ${when(c.lastSentAt)}` : ''}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" onClick={() => runTest(c)} disabled={busy === c.id || !c.enabled}>{busy === c.id ? 'Sending…' : 'Send test'}</Button>
                    <Button size="sm" onClick={() => { const n = open === c.id ? null : c.id; setOpen(n); if (n) loadSends(n); }}>{open === c.id ? 'Hide log' : 'Log'}</Button>
                    <Button size="sm" onClick={() => startEdit(c)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggle(c)}>{c.enabled ? 'Switch off' : 'Switch on'}</Button>
                    <button type="button" onClick={() => remove(c)} className="h-8 px-2.5 rounded-md text-xs font-semibold text-rose-600 hover:bg-rose-50">Delete</button>
                  </div>
                </div>
                {open === c.id && (
                  <div className="mt-3 overflow-x-auto">
                    {!sends[c.id] ? <p className="text-xs text-slate-500">Loading…</p> : sends[c.id].length === 0 ? <p className="text-xs text-slate-500">Nothing sent yet.</p> : (
                      <table className={`${table.wrap} min-w-[640px]`}>
                        <thead className={table.head}><tr>{['Message', 'Booking', 'Status', 'Tries', 'Answer', 'Queued'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
                        <tbody className={table.body}>
                          {sends[c.id].map(s => (
                            <tr key={s.id} className={table.row}>
                              <td className={`${table.td} text-xs`}>{KIND[s.kind] || s.kind}<span className="block text-[11px] text-slate-400">{(s.bytes / 1024).toFixed(1)} KB</span></td>
                              <td className={`${table.td} font-mono text-[11px]`}>{s.reservationNumber || '—'}</td>
                              <td className={table.td}><Badge tone={s.status === 'SENT' ? 'success' : s.status === 'FAILED' ? 'danger' : 'warning'}>{s.status === 'SENT' ? 'Sent' : s.status === 'FAILED' ? 'Gave up' : 'Retrying'}</Badge></td>
                              <td className={`${table.td} tabular-nums text-xs`}>{s.attempts}</td>
                              <td className={`${table.td} text-[11px] text-slate-600 max-w-[16rem]`}>{s.lastHttpStatus ? `HTTP ${s.lastHttpStatus}` : ''}{s.lastError ? ` ${s.lastError}` : ''}{s.status === 'PENDING' && s.nextAttemptAt ? ` · next ${when(s.nextAttemptAt)}` : ''}</td>
                              <td className={`${table.td} text-[11px] whitespace-nowrap`}>{when(s.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">Failed sends are retried after 1, 5, 15, 60, 180 and 360 minutes, then every 6 hours, for 24 hours. Every send is in the delivery log. Sending files by SFTP and importing bookings from the broker's extranet come in a later step.</p>
      </Panel>

      {edit && d && (
        <Dialog open onClose={() => setEdit(null)} size="lg" title={edit.id ? `Edit ${d.name || TYPES[d.type].label}` : `New outbound connection for ${aggregator.name}`}
          subtitle={TYPES[d.type].hint}
          footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving || !d.url.trim()}>{saving ? 'Saving…' : 'Save'}</Button></>}>
          <div className="space-y-4">
            {!edit.id && (
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(TYPES) as ConnectorType[]).map(t => (
                  <button key={t} type="button" onClick={() => setEdit({ d: { ...blank(t), url: d.url, name: d.name } })}
                    className={`rounded-lg border px-3 py-2 text-left ${d.type === t ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <p className="text-[13px] font-semibold text-slate-900">{TYPES[t].label}</p>
                    <p className="text-[11px] text-slate-500 leading-snug">{TYPES[t].hint}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem_7rem]">
              <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">Broker address (HTTPS)</span>
                <input className={`${inputCls} font-mono text-xs`} value={d.url} onChange={e => set({ url: e.target.value })} placeholder="https://api.broker.com/v1/bookings" /></label>
              <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">Method</span>
                <select className={`${selectCls} w-full`} value={d.method} onChange={e => set({ method: e.target.value as Draft['method'] })}><option>POST</option><option>PUT</option></select></label>
              <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">Format</span>
                <select className={`${selectCls} w-full`} value={d.format} onChange={e => set({ format: e.target.value })}>{TYPES[d.type].formats.map(f => <option key={f}>{f}</option>)}</select></label>
            </div>
            <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">Name <span className="font-normal text-slate-400">optional</span></span>
              <input className={inputCls} value={d.name} onChange={e => set({ name: e.target.value })} placeholder={TYPES[d.type].label} /></label>

            <fieldset className="rounded-lg border border-slate-200 p-3 space-y-3">
              <legend className="px-1 text-[12px] font-semibold text-slate-600">How we log in to the broker</legend>
              <select className={`${selectCls} w-full`} value={d.authType} onChange={e => set({ authType: e.target.value })}>{Object.entries(AUTH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {d.authType !== 'NONE' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {d.authType !== 'BEARER' && (
                    <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">{d.authType === 'BASIC' ? 'Username' : d.authType === 'HEADER' ? 'Header name' : 'Client ID'}</span>
                      <input className={inputCls} value={d.authUser} onChange={e => set({ authUser: e.target.value })} placeholder={d.authType === 'HEADER' ? 'X-Api-Key' : ''} /></label>
                  )}
                  <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">{d.authType === 'BASIC' ? 'Password' : d.authType === 'OAUTH2' ? 'Client secret' : d.authType === 'HEADER' ? 'Key' : 'Token'}</span>
                    <input type="password" autoComplete="new-password" className={inputCls} value={d.secret} onChange={e => set({ secret: e.target.value })}
                      placeholder={edit.id ? 'Leave empty to keep the stored one' : ''} /></label>
                  {d.authType === 'OAUTH2' && (<>
                    <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">Token address</span>
                      <input className={`${inputCls} font-mono text-xs`} value={d.tokenUrl} onChange={e => set({ tokenUrl: e.target.value })} placeholder="https://auth.broker.com/oauth/token" /></label>
                    <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">Scope <span className="font-normal text-slate-400">optional</span></span>
                      <input className={inputCls} value={d.scope} onChange={e => set({ scope: e.target.value })} /></label>
                  </>)}
                </div>
              )}
              <p className="text-[11px] text-slate-500">Stored encrypted on the server. It cannot be shown again; type a new one to replace it.</p>
            </fieldset>

            {d.type !== 'RES_NOTIFY' && (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">Daily send</span>
                  <select className={`${selectCls} w-full`} value={d.dailyHour} onChange={e => set({ dailyHour: Number(e.target.value) })}>
                    <option value={-1}>No daily send</option>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00 Amman time</option>)}
                  </select></label>
                {d.type === 'RATE_FILE' ? (
                  <label className="flex items-end gap-2 pb-2 text-[13px] text-slate-700"><input type="checkbox" checked={d.onPublish} onChange={e => set({ onPublish: e.target.checked })} />Also when rates are published</label>
                ) : (<>
                  <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">Days ahead</span>
                    <input type="number" min={1} max={365} className={`${inputCls} tabular-nums`} value={d.days} onChange={e => set({ days: Number(e.target.value) })} /></label>
                  <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">At most every (minutes)</span>
                    <input type="number" min={1} max={1440} className={`${inputCls} tabular-nums`} value={Math.round(d.minIntervalSeconds / 60)} onChange={e => set({ minIntervalSeconds: Number(e.target.value) * 60 })} /></label>
                </>)}
              </div>
            )}
            {d.type === 'ARI_PUSH' && (
              <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">Field names in the broker's specification <span className="font-normal text-slate-400">optional, one per line: ours = theirs</span></span>
                <textarea rows={3} className={`${inputCls} h-auto py-2 font-mono text-xs`} value={d.fieldMap} onChange={e => set({ fieldMap: e.target.value })} placeholder={'vehicle_group = sipp\navailable = qty'} />
                <span className="text-[11px] text-slate-500">Our fields: supplier, channel_code, currency, from, to, groups, vehicle_group, name, fleet_size, days, date, available, status, reason.</span></label>
            )}
            {d.type === 'RATE_FILE' && <p className="text-[11px] text-slate-500">The file carries this broker's price rules (markup, group markup, amount per day, rounding). Day-of-week and booking-window rules cannot be expressed in a flat file and apply only to live searches.</p>}
            {formError && <p className="text-xs text-rose-600">{formError}</p>}
          </div>
        </Dialog>
      )}

      {test && (
        <Dialog open onClose={() => setTest(null)} size="lg" title={test.ok ? `Test sent to ${test.name}` : `Test to ${test.name} failed`}
          subtitle={test.ok ? `The broker answered HTTP ${test.httpStatus}.` : (test.error || `The broker answered HTTP ${test.httpStatus}.`)}
          footer={<Button variant="primary" onClick={() => setTest(null)}>Done</Button>}>
          <p className="text-[12px] font-semibold text-slate-600 mb-1">What was sent</p>
          <pre className="max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100 whitespace-pre-wrap break-all">{test.preview}</pre>
        </Dialog>
      )}
    </div>
  );
};

export default OutboundView;
