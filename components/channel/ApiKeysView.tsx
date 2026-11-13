import React, { useEffect, useState } from 'react';
import { Aggregator } from '../../types';
import { API_URL, fetchChannelTraffic } from '../../services/api';
import { generateFeedKey, partnerEndpoints, partnerUrlCode, sha256Hex } from '../../services/channelManager';
import { Panel, Badge, Button, Dialog, EmptyState, Plate, table, textareaCls } from '../ui/Crm';
import { connectionStateOf } from './ConnectionProfileView';

const day = (s?: string) => (s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const ago = (s?: string) => {
  if (!s) return 'Never';
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  return m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

/** The text staff send the broker, separately from the integration guide, through a secure channel. */
export const keyMessage = (a: Aggregator, key: string, apiBase: string, kind: KeyKind = 'live') => {
  const ep = partnerEndpoints(apiBase, a);
  return [
    `${kind === 'test' ? 'TEST' : 'API'} credentials for ${a.name}`,
    '',
    `Channel code:   ${partnerUrlCode(a)}`,
    `Supplier code:  ${(a.vendorCode || 'URD').toUpperCase()}`,
    `${kind === 'test' ? 'Test key:' : 'API key: '}       ${key}`,
    `Environment:    ${kind === 'test' ? 'Sandbox only: this key never creates a real booking, also after go-live' : a.status === 'active' ? 'Production' : 'Sandbox (test bookings only, until go-live)'}`,
    '',
    'Send the key with every request in one of these ways:',
    '  HTTP header   X-Api-Key: <key>   or   Authorization: Bearer <key>',
    '  OTA / SOAP    POS/Source/RequestorID MessagePassword="<key>"',
    '  Native XML    Credentials/ApiKey',
    '',
    `OTA XML:     ${ep.availRate.replace(/\/OTA_VehAvailRate$/, '/{message}')}`,
    `OTA SOAP:    ${ep.soap}   (WSDL: ${ep.wsdl})`,
    `Native XML:  ${ep.nativeXml}/{operation}   (XSD: ${ep.nativeXsd})`,
    `REST/JSON:   ${ep.rest}`,
    '',
    'Keep this key secret. If it is exposed, tell us and we will replace it at once.',
  ].join('\n');
};

export type KeyKind = 'live' | 'test';
const FIELDS = {
  live: { hash: 'feedKeyHash', hint: 'feedKeyHint', at: 'feedKeyCreatedAt', label: 'API key', prefix: 'urd_' },
  test: { hash: 'testKeyHash', hint: 'testKeyHint', at: 'testKeyCreatedAt', label: 'test key', prefix: 'urd_test_' },
} as const;

/** Every broker's API key in one place: who has one, when it was made, whether the broker is using it. */
const ApiKeysView: React.FC<{
  aggregators: Aggregator[];
  onUpdate: (a: Aggregator) => void;
  showConfirmation: (m: string) => void;
  onOpenChannel: (id: string) => void;
}> = ({ aggregators, onUpdate, showConfirmation, onOpenChannel }) => {
  const [lastCall, setLastCall] = useState<Record<string, string | undefined | null>>({});
  const [issued, setIssued] = useState<{ a: Aggregator; key: string; kind: KeyKind } | null>(null);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    aggregators.forEach(a => {
      if (!a.feedKeyHash) return;
      fetchChannelTraffic(a.id, { hours: 24 * 30, limit: 1 })
        .then(rows => live && setLastCall(p => ({ ...p, [a.id]: rows[0]?.createdAt })))
        .catch(() => live && setLastCall(p => ({ ...p, [a.id]: null })));
    });
    return () => { live = false; };
  }, [aggregators]);

  const copy = (k: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(k); setTimeout(() => setCopied(''), 1500); }).catch(() => undefined);
  };

  const [replacing, setReplacing] = useState<Aggregator | null>(null);

  const create = async (a: Aggregator, kind: KeyKind, graceHours?: number) => {
    const f = FIELDS[kind];
    // Replacing a live key: choose how long the old one keeps working, so the broker can switch without downtime.
    if (kind === 'live' && a.feedKeyHash && graceHours === undefined) { setReplacing(a); return; }
    if (kind === 'test' && a[f.hash] && !window.confirm(`Replace the test key of ${a.name}?\n\nThe test key they use now stops working at once.`)) return;
    setError('');
    setReplacing(null);
    try {
      const key = kind === 'test' ? generateFeedKey().replace(/^urd_/, f.prefix) : generateFeedKey();
      const hash = await sha256Hex(key);
      const grace = kind === 'live' && graceHours && a.feedKeyHash
        ? { previousKeyHash: a.feedKeyHash, previousKeyExpiresAt: new Date(Date.now() + graceHours * 3600000).toISOString() }
        : kind === 'live' ? { previousKeyHash: undefined, previousKeyExpiresAt: undefined } : {};
      const next = { ...a, ...grace, [f.hash]: hash, [f.hint]: key.slice(-4), [f.at]: new Date().toISOString() };
      onUpdate(next);
      setIssued({ a: next, key, kind });
      showConfirmation(`New ${f.label} created for ${a.name}. Copy it now: it is shown only once.`);
    } catch {
      setError('This browser can only create keys over a secure (HTTPS) connection.');
    }
  };

  const revoke = (a: Aggregator, kind: KeyKind) => {
    const f = FIELDS[kind];
    if (!window.confirm(kind === 'test'
      ? `Revoke the test key of ${a.name}?\n\nTheir test system can no longer connect. The live key keeps working.`
      : `Revoke the API key of ${a.name}?\n\nAll their requests (search, book, change, cancel) are refused until you create a new key.`)) return;
    onUpdate({ ...a, [f.hash]: undefined, [f.hint]: undefined, [f.at]: undefined, ...(kind === 'live' ? { previousKeyHash: undefined, previousKeyExpiresAt: undefined } : {}) });
    showConfirmation(`${kind === 'test' ? 'Test key' : 'API key'} of ${a.name} revoked.`);
  };

  const keyCell = (a: Aggregator, kind: KeyKind) => {
    const f = FIELDS[kind];
    return (
      <div className="space-y-1">
        {a[f.hash]
          ? <p className="font-mono text-xs text-slate-800">••••{a[f.hint]}</p>
          : <Badge tone={kind === 'live' ? 'danger' : 'muted'}>{kind === 'live' ? 'No key' : 'None'}</Badge>}
        <p className="text-[11px] text-slate-400">{a[f.hash] ? `Created ${day(a[f.at])}` : kind === 'test' ? 'Optional' : 'Required to connect'}</p>
        {kind === 'live' && a.previousKeyExpiresAt && new Date(a.previousKeyExpiresAt).getTime() > Date.now() && (
          <p className="text-[11px] text-amber-700">Old key works until {new Date(a.previousKeyExpiresAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        )}
        <div className="flex gap-1">
          <Button size="sm" variant={a[f.hash] || kind === 'test' ? 'secondary' : 'primary'} onClick={() => void create(a, kind)}>{a[f.hash] ? 'Replace' : 'Create'}</Button>
          {a[f.hash] && <Button size="sm" variant="ghost" onClick={() => revoke(a, kind)}>Revoke</Button>}
        </div>
      </div>
    );
  };

  const withKey = aggregators.filter(a => a.feedKeyHash).length;

  return (
    <div className="space-y-4">
      <Panel title="API keys" subtitle={`Each broker has its own key. The broker sends it with every request; we keep only a fingerprint, so a key is shown once when it is created. ${withKey} of ${aggregators.length} broker${aggregators.length === 1 ? '' : 's'} have a key.`}>
        {error && <p className="px-4 py-2 text-xs text-rose-600 border-b border-slate-100">{error}</p>}
        {aggregators.length === 0 ? <EmptyState title="No brokers yet" hint="Add a channel for the broker first (Add Channel); then create its key here." /> : (
          <div className="overflow-x-auto">
            <table className={`${table.wrap} min-w-[820px]`}>
              <thead className={table.head}><tr>{['Broker', 'Channel', 'Connection', 'Live key', 'Test key (sandbox only)', 'Last request'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
              <tbody className={table.body}>
                {aggregators.map(a => {
                  const cs = connectionStateOf(a);
                  const lc = lastCall[a.id];
                  return (
                    <tr key={a.id} className={table.row}>
                      <td className={table.td}>
                        <button type="button" className="font-semibold text-slate-900 hover:text-indigo-600 text-left" onClick={() => onOpenChannel(a.id)}>{a.name}</button>
                        <p className="text-[11px] text-slate-500">{a.status === 'active' ? 'Live: real bookings' : a.status === 'paused' ? 'Paused' : 'Testing: sandbox bookings'}</p>
                      </td>
                      <td className={table.td}><Plate value={partnerUrlCode(a)} /></td>
                      <td className={table.td}><Badge tone={cs.tone}>{cs.label}</Badge></td>
                      <td className={`${table.td} align-top`}>{keyCell(a, 'live')}</td>
                      <td className={`${table.td} align-top`}>{keyCell(a, 'test')}</td>
                      <td className={`${table.td} text-xs whitespace-nowrap ${lc ? 'text-slate-700' : 'text-slate-400'}`}>
                        {!a.feedKeyHash ? '—' : lc === undefined && !(a.id in lastCall) ? '…' : lc === null ? 'Unknown' : ago(lc)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
          <p><b className="text-slate-700">How to send it:</b> never in the same email as the integration guide. Use a password-protected file, the broker's partner portal, or read it out on a call.</p>
          <p><b className="text-slate-700">Live key:</b> while the channel is in Testing its bookings are sandbox bookings; after go-live they are real reservations.</p>
          <p><b className="text-slate-700">Test key (optional):</b> for the broker's test system. It is always answered in the sandbox, also after go-live, so the broker can keep testing without creating real bookings.</p>
        </div>
      </Panel>

      {replacing && (
        <Dialog open onClose={() => setReplacing(null)} size="md" title={`Replace the API key of ${replacing.name}`}
          subtitle="A new key is created now. How long should the key they use today keep working?"
          footer={<Button variant="ghost" onClick={() => setReplacing(null)}>Cancel</Button>}>
          <div className="grid gap-2">
            {([[72, 'Keep the old key 3 days', 'Recommended: time for the broker to switch'], [24, 'Keep the old key 24 hours', ''], [168, 'Keep the old key 7 days', ''],
              [0, 'Stop the old key now', 'Use this if the key was exposed or stolen']] as [number, string, string][]).map(([h, label, hint]) => (
              <button key={h} type="button" onClick={() => void create(replacing, 'live', h)}
                className={`text-left rounded-lg border px-3 py-2.5 hover:bg-slate-50 ${h === 0 ? 'border-rose-200' : 'border-slate-200'}`}>
                <p className={`text-[13px] font-semibold ${h === 0 ? 'text-rose-700' : 'text-slate-900'}`}>{label}</p>
                {hint && <p className="text-xs text-slate-500">{hint}</p>}
              </button>
            ))}
          </div>
        </Dialog>
      )}

      {issued && (
        <Dialog open onClose={() => setIssued(null)} size="lg" title={`${issued.kind === 'test' ? 'Test key' : 'API key'} for ${issued.a.name}`}
          subtitle="Copy it now. It is not stored and will not be shown again."
          footer={<>
            <Button onClick={() => copy('msg', keyMessage(issued.a, issued.key, API_URL || window.location.origin, issued.kind))}>{copied === 'msg' ? 'Copied' : 'Copy message for the broker'}</Button>
            <Button variant="primary" onClick={() => setIssued(null)}>I have copied it</Button>
          </>}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 break-all text-[13px] font-mono bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-slate-900">{issued.key}</code>
              <Button size="sm" onClick={() => copy('key', issued.key)}>{copied === 'key' ? 'Copied' : 'Copy key'}</Button>
            </div>
            <p className="text-xs text-slate-500">Message with the key, channel code and addresses, ready to send securely:</p>
            <textarea readOnly rows={18} className={`${textareaCls} font-mono text-[11px]`} value={keyMessage(issued.a, issued.key, API_URL || window.location.origin, issued.kind)} />
          </div>
        </Dialog>
      )}
    </div>
  );
};

export default ApiKeysView;
