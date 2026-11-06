import React, { useCallback, useEffect, useState } from 'react';
import { Aggregator } from '../../types';
import { API_URL, OAuthClientRow, createOAuthClient, fetchOAuthClients, revokeOAuthClient } from '../../firebase/api';
import { partnerUrlCode } from '../../services/channelManager';
import { Panel, Badge, Button, Dialog, EmptyState, table, inputCls, selectCls } from '../ui/Crm';

const SCOPE_TEXT: Record<string, string> = {
  'locations:read': 'Locations', 'fleet:read': 'Car groups, extras, covers', 'availability:read': 'Search availability',
  'quotes:read': 'Quotes and rules', 'reservations:read': 'Read bookings', 'reservations:write': 'Book, change, cancel',
  'inventory:read': 'Inventory', 'webhooks:manage': 'Manage webhooks',
};
const when = (s?: string) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/** The channel's REST/JSON v3 access: OAuth clients (secret shown once) and the addresses of every API version. */
const ApiV3View: React.FC<{ aggregator: Aggregator; showConfirmation?: (m: string) => void }> = ({ aggregator, showConfirmation }) => {
  const [rows, setRows] = useState<OAuthClientRow[] | null>(null);
  const [allScopes, setAllScopes] = useState<string[]>(Object.keys(SCOPE_TEXT));
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [env, setEnv] = useState<'sandbox' | 'production'>('sandbox');
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(Object.keys(SCOPE_TEXT));
  const [made, setMade] = useState<OAuthClientRow | null>(null);
  const [copied, setCopied] = useState('');
  const base = (API_URL || window.location.origin).replace(/\/$/, '');
  const code = partnerUrlCode(aggregator);

  const load = useCallback(() => {
    setError('');
    fetchOAuthClients(aggregator.id).then(r => { setRows(r.clients); if (r.scopes?.length) setAllScopes(r.scopes); })
      .catch(() => { setRows([]); setError('Could not load the OAuth clients from the server.'); });
  }, [aggregator.id]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      const c = await createOAuthClient(aggregator.id, { environment: env, name: name.trim() || undefined, scopes });
      setMade(c); setCreating(false); setName(''); load();
    } catch (e: any) { alert(e.message || 'Could not create the OAuth client.'); }
  };
  const revoke = async (c: OAuthClientRow) => {
    if (!window.confirm(`Revoke ${c.clientId}?\n\nIts tokens stop working at once. ${aggregator.name} must use another client.`)) return;
    try { await revokeOAuthClient(aggregator.id, c.clientId); showConfirmation?.(`${c.clientId} revoked.`); load(); }
    catch (e: any) { alert(e.message || 'Could not revoke the OAuth client.'); }
  };
  const copy = (k: string, v: string) => { navigator.clipboard?.writeText(v).then(() => { setCopied(k); setTimeout(() => setCopied(''), 1500); }).catch(() => {}); };

  const addresses: [string, string, string][] = [
    ['OTA XML 2024A', 'New XML brokers (default)', `${base}/ota/2024A/${code}/{Message}`],
    ['OTA XML 2018A', 'Legacy OpenTravel brokers', `${base}/ota/2018A/${code}/{Message}`],
    ['OTA XML v1', 'Current integrations (HOG, AUE), unchanged', `${base}/ota/v1/${code}/{Message}`],
    ['SOAP 1.1 / 1.2', 'WSDL at ?wsdl', `${base}/ota/${code}/soap`],
    ['REST/JSON v3', 'OAuth 2.0 below; OpenAPI 3.1', `${base}/api/v3`],
    ['OAuth token', 'client_credentials, 30-minute tokens', `${base}/oauth/token`],
  ];

  return (
    <div className="space-y-4">
      <Panel title="Addresses for this channel" subtitle={`Every API version ${aggregator.name} can use. XML and SOAP use the channel's API key; REST v3 uses OAuth.`}>
        <div className="overflow-x-auto">
          <table className={`${table.wrap} min-w-[680px]`}>
            <thead className={table.head}><tr>{['Version', 'For', 'Address', ''].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
            <tbody className={table.body}>
              {addresses.map(([v, f, url]) => (
                <tr key={v} className={table.row}>
                  <td className={`${table.td} font-semibold text-slate-900 whitespace-nowrap`}>{v}</td>
                  <td className={`${table.td} text-xs text-slate-500`}>{f}</td>
                  <td className={table.td}><code className="text-[12px] font-mono text-slate-800 break-all">{url}</code></td>
                  <td className={`${table.td} text-right`}><Button size="sm" onClick={() => copy(v, url)}>{copied === v ? 'Copied' : 'Copy'}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="OAuth clients (REST/JSON v3)" subtitle="One client per environment is usual. The secret is shown once when created; the server keeps only its fingerprint."
        actions={<Button variant="primary" size="sm" onClick={() => setCreating(true)}>Create OAuth client</Button>}>
        {error && <p className="px-4 py-3 text-xs text-rose-600">{error}</p>}
        {rows === null ? <p className="px-4 py-8 text-center text-[13px] text-slate-500">Loading…</p> : rows.length === 0 ? (
          <EmptyState title="No OAuth clients yet" hint="Create one when the broker connects with REST/JSON v3. XML brokers use API keys instead." />
        ) : (
          <div className="overflow-x-auto">
            <table className={`${table.wrap} min-w-[760px]`}>
              <thead className={table.head}><tr>{['Client', 'Environment', 'Scopes', 'Created', 'Last token', 'Status', ''].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
              <tbody className={table.body}>
                {rows.map(c => (
                  <tr key={c.clientId} className={table.row}>
                    <td className={table.td}>
                      <p className="font-mono text-xs font-semibold text-slate-900">{c.clientId}</p>
                      <p className="text-[11px] text-slate-500">{c.name || '—'}{c.secretHint ? ` · secret …${c.secretHint}` : ''}</p>
                    </td>
                    <td className={table.td}><Badge tone={c.environment === 'production' ? 'success' : 'warning'}>{c.environment === 'production' ? 'Production' : 'Sandbox'}</Badge></td>
                    <td className={`${table.td} text-[11px] text-slate-600 max-w-[16rem]`}>{c.scopes.length === allScopes.length ? 'All scopes' : c.scopes.map(s => SCOPE_TEXT[s] || s).join(', ')}</td>
                    <td className={`${table.td} text-xs whitespace-nowrap`}>{when(c.createdAt)}<p className="text-[11px] text-slate-400">{c.createdBy || ''}</p></td>
                    <td className={`${table.td} text-xs whitespace-nowrap`}>{when(c.lastUsedAt)}</td>
                    <td className={table.td}><Badge tone={c.status === 'ACTIVE' ? 'success' : 'muted'}>{c.status === 'ACTIVE' ? 'Active' : 'Revoked'}</Badge></td>
                    <td className={`${table.td} text-right`}>{c.status === 'ACTIVE' && <button type="button" onClick={() => revoke(c)} className="h-8 px-2.5 rounded-md text-xs font-semibold text-rose-600 hover:bg-rose-50">Revoke</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {creating && (
        <Dialog open onClose={() => setCreating(false)} size="md" title={`New OAuth client for ${aggregator.name}`}
          subtitle="For brokers using REST/JSON v3. Start with sandbox; create a production client after certification."
          footer={<><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" onClick={create} disabled={!scopes.length}>Create client</Button></>}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">Environment</span>
                <select className={`${selectCls} w-full`} value={env} onChange={e => setEnv(e.target.value as typeof env)}>
                  <option value="sandbox">Sandbox (tests only)</option><option value="production">Production (real bookings)</option>
                </select></label>
              <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">Name <span className="font-normal text-slate-400">optional</span></span>
                <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Booking engine" /></label>
            </div>
            <fieldset>
              <legend className="text-[12px] font-semibold text-slate-600 mb-1.5">What the client may do</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {allScopes.map(s => (
                  <label key={s} className="flex items-center gap-2 text-[13px] text-slate-700">
                    <input type="checkbox" checked={scopes.includes(s)} onChange={e => setScopes(x => (e.target.checked ? [...x, s] : x.filter(y => y !== s)))} />
                    {SCOPE_TEXT[s] || s}<code className="text-[10px] text-slate-400">{s}</code>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Dialog>
      )}

      {made && (
        <Dialog open onClose={() => setMade(null)} size="lg" title="OAuth client created"
          subtitle="Copy the secret now: it is not shown again. Send the client ID and the secret to the broker separately, never in one email."
          footer={<Button variant="primary" onClick={() => setMade(null)}>Done</Button>}>
          <div className="space-y-3">
            {([['Client ID', made.clientId], ['Client secret', made.clientSecret || ''], ['Token URL', `${base}/oauth/token`]] as const).map(([l, v]) => (
              <div key={l}>
                <p className="text-[12px] font-semibold text-slate-600 mb-1">{l}</p>
                <div className="flex items-center gap-2">
                  <code className={`flex-1 min-w-0 break-all text-[13px] font-mono rounded-md px-3 py-2 ${l === 'Client secret' ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-200'} text-slate-900`}>{v}</code>
                  <Button size="sm" onClick={() => copy(l, v)}>{copied === l ? 'Copied' : 'Copy'}</Button>
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-500">Environment: <b>{made.environment === 'production' ? 'Production' : 'Sandbox'}</b> · Scopes: {made.scopes.join(' ')}</p>
          </div>
        </Dialog>
      )}
    </div>
  );
};

export default ApiV3View;
