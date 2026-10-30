import React, { useEffect, useState } from 'react';
import { Aggregator } from '../../types';
import { API_URL, fetchChannelTraffic } from '../../firebase/api';
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
export const keyMessage = (a: Aggregator, key: string, apiBase: string) => {
  const ep = partnerEndpoints(apiBase, a);
  return [
    `API credentials for ${a.name}`,
    '',
    `Channel code:   ${partnerUrlCode(a)}`,
    `Supplier code:  ${(a.vendorCode || 'NCT').toUpperCase()}`,
    `API key:        ${key}`,
    `Environment:    ${a.status === 'active' ? 'Production' : 'Sandbox (test bookings only, until go-live)'}`,
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

/** Every broker's API key in one place: who has one, when it was made, whether the broker is using it. */
const ApiKeysView: React.FC<{
  aggregators: Aggregator[];
  onUpdate: (a: Aggregator) => void;
  showConfirmation: (m: string) => void;
  onOpenChannel: (id: string) => void;
}> = ({ aggregators, onUpdate, showConfirmation, onOpenChannel }) => {
  const [lastCall, setLastCall] = useState<Record<string, string | undefined | null>>({});
  const [issued, setIssued] = useState<{ a: Aggregator; key: string } | null>(null);
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

  const create = async (a: Aggregator) => {
    if (a.feedKeyHash && !window.confirm(`Replace the API key of ${a.name}?\n\nThe key they use now stops working at once. Agree a time with the broker first.`)) return;
    setError('');
    try {
      const key = generateFeedKey();
      const hash = await sha256Hex(key);
      const next = { ...a, feedKeyHash: hash, feedKeyHint: key.slice(-4), feedKeyCreatedAt: new Date().toISOString() };
      onUpdate(next);
      setIssued({ a: next, key });
      showConfirmation(`New API key created for ${a.name}. Copy it now: it is shown only once.`);
    } catch {
      setError('This browser can only create keys over a secure (HTTPS) connection.');
    }
  };

  const revoke = (a: Aggregator) => {
    if (!window.confirm(`Revoke the API key of ${a.name}?\n\nAll their requests (search, book, change, cancel) are refused until you create a new key.`)) return;
    onUpdate({ ...a, feedKeyHash: undefined, feedKeyHint: undefined, feedKeyCreatedAt: undefined });
    showConfirmation(`API key of ${a.name} revoked.`);
  };

  const withKey = aggregators.filter(a => a.feedKeyHash).length;

  return (
    <div className="space-y-4">
      <Panel title="API keys" subtitle={`Each broker has its own key. The broker sends it with every request; we keep only a fingerprint, so a key is shown once when it is created. ${withKey} of ${aggregators.length} broker${aggregators.length === 1 ? '' : 's'} have a key.`}>
        {error && <p className="px-4 py-2 text-xs text-rose-600 border-b border-slate-100">{error}</p>}
        {aggregators.length === 0 ? <EmptyState title="No brokers yet" hint="Add a channel for the broker first (Add Channel); then create its key here." /> : (
          <div className="overflow-x-auto">
            <table className={`${table.wrap} min-w-[820px]`}>
              <thead className={table.head}><tr>{['Broker', 'Channel', 'Connection', 'API key', 'Created', 'Last request', ''].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
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
                      <td className={table.td}>
                        {a.feedKeyHash
                          ? <span className="font-mono text-xs text-slate-800">nct_••••••••{a.feedKeyHint}</span>
                          : <Badge tone="danger">No key</Badge>}
                      </td>
                      <td className={`${table.td} text-xs text-slate-600 whitespace-nowrap`}>{day(a.feedKeyCreatedAt)}</td>
                      <td className={`${table.td} text-xs whitespace-nowrap ${lc ? 'text-slate-700' : 'text-slate-400'}`}>
                        {!a.feedKeyHash ? '—' : lc === undefined && !(a.id in lastCall) ? '…' : lc === null ? 'Unknown' : ago(lc)}
                      </td>
                      <td className={`${table.td} text-right whitespace-nowrap`}>
                        {a.feedKeyHash && <Button size="sm" variant="ghost" onClick={() => revoke(a)}>Revoke</Button>}
                        <Button size="sm" variant={a.feedKeyHash ? 'secondary' : 'primary'} onClick={() => void create(a)}>{a.feedKeyHash ? 'Replace key' : 'Create key'}</Button>
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
          <p><b className="text-slate-700">Testing and live use the same key.</b> While the channel is in Testing its bookings are sandbox bookings; after go-live they are real reservations.</p>
        </div>
      </Panel>

      {issued && (
        <Dialog open onClose={() => setIssued(null)} size="lg" title={`API key for ${issued.a.name}`}
          subtitle="Copy it now. It is not stored and will not be shown again."
          footer={<>
            <Button onClick={() => copy('msg', keyMessage(issued.a, issued.key, API_URL || window.location.origin))}>{copied === 'msg' ? 'Copied' : 'Copy message for the broker'}</Button>
            <Button variant="primary" onClick={() => setIssued(null)}>I have copied it</Button>
          </>}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 break-all text-[13px] font-mono bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-slate-900">{issued.key}</code>
              <Button size="sm" onClick={() => copy('key', issued.key)}>{copied === 'key' ? 'Copied' : 'Copy key'}</Button>
            </div>
            <p className="text-xs text-slate-500">Message with the key, channel code and addresses, ready to send securely:</p>
            <textarea readOnly rows={18} className={`${textareaCls} font-mono text-[11px]`} value={keyMessage(issued.a, issued.key, API_URL || window.location.origin)} />
          </div>
        </Dialog>
      )}
    </div>
  );
};

export default ApiKeysView;
