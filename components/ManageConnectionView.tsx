import React, { useState, useEffect } from 'react';
import { Aggregator, AggregatorConnectionDetails, ChannelStatus } from '../types';
import { SaveIcon, LockClosedIcon, EyeIcon, CheckCircleIcon, AlertIcon } from './icons';
import { SUPPORTED_CURRENCIES, validateChannel, generateFeedKey, sha256Hex, partnerEndpoints } from '../services/channelManager';
import { API_URL } from '../firebase/api';
import { Panel, Button, inputCls, selectCls, labelCls } from './ui/Crm';
import { keyMessage } from './channel/ApiKeysView';

interface ManageConnectionViewProps {
  aggregator: Aggregator;
  onUpdate: (updatedAggregator: Aggregator) => void;
  showConfirmation?: (message: string) => void;
}

type Draft = {
  connection: AggregatorConnectionDetails;
  channelCode: string;
  vendorCode: string;
  locationCode: string;
  currency: string;
  status: ChannelStatus;
  commissionPercent: string;
  contactEmail: string;
};

const toDraft = (agg: Aggregator): Draft => ({
  connection: {
    apiUrl: agg.connectionDetails?.apiUrl || '',
    username: agg.connectionDetails?.username || '',
    apiKey: agg.connectionDetails?.apiKey || '',
    environment: agg.connectionDetails?.environment || 'production',
    timeoutSeconds: agg.connectionDetails?.timeoutSeconds ?? 30,
  },
  channelCode: agg.channelCode || '',
  vendorCode: agg.vendorCode || 'NCT',
  locationCode: agg.locationCode || 'AMM',
  currency: agg.currency || 'USD',
  status: agg.status || 'active',
  commissionPercent: agg.commissionPercent != null ? String(agg.commissionPercent) : '',
  contactEmail: agg.contactEmail || '',
});

const selCls = `${selectCls} w-full`;
const Label: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <label className={labelCls}>
    {children}
    {hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
  </label>
);

const Section: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <Panel title={title} subtitle={subtitle} bodyClassName="p-4 space-y-4">{children}</Panel>
);

const ManageConnectionView: React.FC<ManageConnectionViewProps> = ({ aggregator, onUpdate, showConfirmation }) => {
  const [draft, setDraft] = useState<Draft>(() => toDraft(aggregator));
  const [showKey, setShowKey] = useState(false);
  const [checkResult, setCheckResult] = useState<string[] | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setDraft(toDraft(aggregator));
    setCheckResult(null);
    setNewKey(null);
  }, [aggregator.id]);

  const setConn = <K extends keyof AggregatorConnectionDetails>(field: K, value: AggregatorConnectionDetails[K]) =>
    setDraft(d => ({ ...d, connection: { ...d.connection, [field]: value } }));
  const set = <K extends keyof Draft>(field: K, value: Draft[K]) => setDraft(d => ({ ...d, [field]: value }));

  const build = (): Aggregator => {
    const commission = parseFloat(draft.commissionPercent);
    return {
      ...aggregator,
      connectionDetails: { ...draft.connection, apiUrl: draft.connection.apiUrl.trim(), username: draft.connection.username.trim() },
      channelCode: draft.channelCode.trim().toUpperCase() || undefined,
      vendorCode: draft.vendorCode.trim().toUpperCase() || undefined,
      locationCode: draft.locationCode.trim().toUpperCase() || undefined,
      currency: draft.currency,
      status: draft.status,
      commissionPercent: Number.isFinite(commission) ? commission : undefined,
      contactEmail: draft.contactEmail.trim() || undefined,
    };
  };

  const dirty = JSON.stringify(toDraft(build())) !== JSON.stringify(toDraft(aggregator));

  const runCheck = () => {
    const result = validateChannel(build(), []);
    setCheckResult(result.issues.filter(i => i.area === 'Connection' && i.level !== 'info').map(i => i.message));
  };

  const handleSave = () => {
    const updated = build();
    const problems = validateChannel(updated, []).issues.filter(i => i.area === 'Connection' && i.level === 'error');
    if (updated.status === 'active' && problems.length > 0) {
      setCheckResult(problems.map(p => p.message));
      return;
    }
    const cs = aggregator.connectionProfile?.state;
    if (updated.status === 'active' && aggregator.status !== 'active' && cs !== 'broker_certified' && cs !== 'live'
      && !window.confirm(`${aggregator.name} has not approved the connection yet (Connection profile).\n\nSet the channel Live anyway? Bookings it makes become real reservations.`)) return;
    onUpdate(updated);
    showConfirmation?.(`Connection settings for ${aggregator.name} saved.`);
  };

  const endpoints = partnerEndpoints(API_URL, aggregator);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const handleGenerateKey = async () => {
    if (aggregator.feedKeyHash && !window.confirm(`Replace the API key of ${aggregator.name}? The key they use now stops working immediately.`)) return;
    try {
      const key = generateFeedKey();
      const hash = await sha256Hex(key);
      onUpdate({ ...aggregator, feedKeyHash: hash, feedKeyHint: key.slice(-4), feedKeyCreatedAt: new Date().toISOString() });
      setNewKey(key);
      showConfirmation?.(`New API key created for ${aggregator.name}. Copy it now: it will not be shown again.`);
    } catch {
      setCheckResult(['Could not create a key: this browser requires a secure (HTTPS) connection for key generation.']);
    }
  };

  const handleRevokeKey = () => {
    if (!window.confirm(`Revoke the API key of ${aggregator.name}? All their requests are refused until you create a new key.`)) return;
    onUpdate({ ...aggregator, feedKeyHash: undefined, feedKeyHint: undefined, feedKeyCreatedAt: undefined });
    setNewKey(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">Connection & channel settings</h3>
          <p className="text-xs text-slate-500">Credentials and identifiers used when exchanging XML with {aggregator.name}.</p>
        </div>
        <div className="flex gap-2 [&>*]:max-sm:flex-1">
          <Button onClick={runCheck}>Check configuration</Button>
          <Button variant="primary" onClick={handleSave} disabled={!dirty} icon={<SaveIcon className="w-4 h-4" />}>Save</Button>
        </div>
      </div>

      {checkResult && (
        <div className={`rounded-xl border px-4 py-3 text-[13px] ${checkResult.length === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
          <p className="font-semibold flex items-center gap-2">
            {checkResult.length === 0 ? <CheckCircleIcon className="w-4 h-4" /> : <AlertIcon className="w-4 h-4" />}
            {checkResult.length === 0 ? 'Configuration looks complete.' : 'Configuration needs attention:'}
          </p>
          {checkResult.length > 0 && <ul className="mt-2 ml-6 list-disc space-y-1">{checkResult.map(m => <li key={m}>{m}</li>)}</ul>}
          <p className="mt-2 text-xs opacity-75">This checks the settings only; the partner's endpoint is contacted by the server when rates are delivered.</p>
        </div>
      )}

      <Section title="Channel status" subtitle="Controls whether this partner should receive live inventory.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            ['active', 'Live', 'Rates and availability are distributed.'],
            ['testing', 'Testing', 'Certification with the partner in progress.'],
            ['paused', 'Paused', 'Distribution temporarily suspended.'],
          ] as [ChannelStatus, string, string][]).map(([value, label, desc]) => (
            <button
              key={value}
              onClick={() => set('status', value)}
              className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${draft.status === value ? 'border-indigo-500 ring-2 ring-indigo-500/15 bg-indigo-50/40' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <p className="text-[13px] font-semibold text-slate-900">{label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Endpoint & credentials" subtitle="Provided by the partner during onboarding.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Label>Endpoint URL</Label>
            <input type="url" value={draft.connection.apiUrl} onChange={e => setConn('apiUrl', e.target.value)} className={`${inputCls} font-mono`} placeholder="https://xml.partner.com/ota/v1" />
          </div>
          <div>
            <Label>Environment</Label>
            <select value={draft.connection.environment} onChange={e => setConn('environment', e.target.value as 'test' | 'production')} className={selCls}>
              <option value="test">Test / sandbox</option>
              <option value="production">Production</option>
            </select>
          </div>
          <div>
            <Label>Username / requestor ID</Label>
            <input type="text" value={draft.connection.username} onChange={e => setConn('username', e.target.value)} className={inputCls} autoComplete="off" />
          </div>
          <div>
            <Label>API key / secret</Label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={draft.connection.apiKey}
                onChange={e => setConn('apiKey', e.target.value)}
                className={`${inputCls} pl-9 pr-10 font-mono`}
                autoComplete="new-password"
              />
              <LockClosedIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <button type="button" onClick={() => setShowKey(s => !s)} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700" title={showKey ? 'Hide' : 'Show'}>
                <EyeIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div>
            <Label hint="seconds">Request timeout</Label>
            <input type="number" min={5} max={120} value={draft.connection.timeoutSeconds ?? 30} onChange={e => setConn('timeoutSeconds', Math.max(5, Math.min(120, parseInt(e.target.value) || 30)))} className={inputCls} />
          </div>
        </div>
      </Section>

      <Section title="API key (broker access)" subtitle="The broker sends this key with every request: search, book, change and cancel. All brokers' keys are also under API keys at the top of the page.">
        <div className="space-y-2">
          {([
            ['Availability & rates (OTA_VehAvailRateRQ → RS)', 'POST', endpoints.availRate],
            ['Rate sheet', 'GET', endpoints.rateSheet],
            ['Connectivity check', 'GET', endpoints.ping],
          ] as [string, string, string][]).map(([label, method, url]) => (
            <div key={url} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
              <span className="text-xs text-slate-500 sm:w-64 shrink-0">{label}</span>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[10px] font-semibold font-mono px-1.5 py-px rounded border border-slate-200 bg-slate-50 text-slate-600">{method}</span>
                <code className="text-xs font-mono text-slate-800 truncate flex-1" title={url}>{url}</code>
                <Button size="sm" variant="ghost" onClick={() => copy(url, url)} className="shrink-0">{copied === url ? 'Copied' : 'Copy'}</Button>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-slate-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-900">API key</p>
            <p className="text-xs text-slate-500">
              {aggregator.feedKeyHash
                ? <>Active key ending in <span className="font-mono font-semibold">…{aggregator.feedKeyHint}</span>{aggregator.feedKeyCreatedAt && <> · created {new Date(aggregator.feedKeyCreatedAt).toLocaleDateString()}</>}. Sent as <span className="font-mono">Authorization: Bearer &lt;key&gt;</span> or <span className="font-mono">X-Api-Key</span>.</>
                : 'No key yet. The broker\'s requests are refused until you create one.'}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {aggregator.feedKeyHash && (
              <Button variant="danger" onClick={handleRevokeKey}>Revoke</Button>
            )}
            <Button variant="primary" onClick={handleGenerateKey}>
              {aggregator.feedKeyHash ? 'Rotate key' : 'Create key'}
            </Button>
          </div>
        </div>
        {newKey && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[13px] font-semibold text-amber-900">Copy this key now and send it to the partner securely. It will not be shown again.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 min-w-0 break-all text-xs font-mono bg-white border border-amber-200 rounded-md px-2 py-1.5 text-slate-800">{newKey}</code>
              <Button size="sm" onClick={() => copy('key', newKey)} className="shrink-0">{copied === 'key' ? 'Copied' : 'Copy'}</Button>
              <Button size="sm" onClick={() => copy('msg', keyMessage(aggregator, newKey, API_URL || window.location.origin))} className="shrink-0">{copied === 'msg' ? 'Copied' : 'Copy message for the broker'}</Button>
            </div>
          </div>
        )}
      </Section>

      <Section title="XML identifiers & commercial terms" subtitle="Values written into every XML message for this channel.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label hint="(Vendor Code)">Supplier code</Label>
            <input value={draft.vendorCode} onChange={e => set('vendorCode', e.target.value.toUpperCase().slice(0, 8))} className={`${inputCls} font-mono`} placeholder="NCT" />
          </div>
          <div>
            <Label hint="(IATA / partner)">Location code</Label>
            <input value={draft.locationCode} onChange={e => set('locationCode', e.target.value.toUpperCase().slice(0, 8))} className={`${inputCls} font-mono`} placeholder="AMM" />
          </div>
          <div>
            <Label>Channel code</Label>
            <input value={draft.channelCode} onChange={e => set('channelCode', e.target.value.toUpperCase().slice(0, 8))} className={`${inputCls} font-mono`} placeholder="BKG" />
          </div>
          <div>
            <Label>Rate currency</Label>
            <select value={draft.currency} onChange={e => set('currency', e.target.value)} className={selCls}>
              {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <Label hint="%">Commission</Label>
            <input type="number" min={0} max={100} step="0.5" value={draft.commissionPercent} onChange={e => set('commissionPercent', e.target.value)} className={inputCls} placeholder="e.g. 15" />
          </div>
          <div>
            <Label>Partner contact email</Label>
            <input type="email" value={draft.contactEmail} onChange={e => set('contactEmail', e.target.value)} className={inputCls} placeholder="connectivity@partner.com" />
          </div>
        </div>
      </Section>
    </div>
  );
};

export default ManageConnectionView;
