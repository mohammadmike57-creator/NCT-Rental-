import React, { useState, useEffect, useRef } from 'react';
import { Aggregator, AggregatorConnectionDetails, ChannelStatus } from '../types';
import { SaveIcon, LockClosedIcon, EyeIcon, CheckCircleIcon, AlertIcon } from './icons';
import { SUPPORTED_CURRENCIES, acceptedVendorCodes, validateChannel, generateFeedKey, sha256Hex, partnerEndpoints } from '../services/channelManager';
import { API_URL } from '../services/api';
import { Panel, Button, inputCls, selectCls, labelCls } from './ui/Crm';
import { keyMessage } from './channel/ApiKeysView';
import { KNOWN_COVERAGE_TYPES, coverageTypeFor, isOtaCode } from '../services/otaCodes';

/** OpenTravel releases a broker's specification can name; all share the 2003/05 namespace this system answers in. */
const OTA_RELEASES = ['2003A', '2006B', '2008B', '2010B', '2012B', '2014B', '2015B', '2016B', '2017B', '2018A', '2019A', '2024A'];

interface ManageConnectionViewProps {
  aggregator: Aggregator;
  onUpdate: (updatedAggregator: Aggregator) => void;
  showConfirmation?: (message: string) => void;
}

type Draft = {
  connection: AggregatorConnectionDetails;
  channelCode: string;
  vendorCode: string;
  vendorName: string;
  locationCode: string;
  currency: string;
  status: ChannelStatus;
  commissionPercent: string;
  contactEmail: string;
  otaProfile: 'standard' | 'compatible';
  otaValidation: 'report' | 'strict';
  otaRelease: string;
  soapVersion: '' | '1.1' | '1.2';
  coverageCodes: Record<string, string>;
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
  vendorCode: agg.vendorCode || 'URD',
  vendorName: agg.vendorName || 'UR-Drive Jordan',
  locationCode: agg.locationCode || 'AMM',
  currency: agg.currency || 'USD',
  status: agg.status || 'active',
  commissionPercent: agg.commissionPercent != null ? String(agg.commissionPercent) : '',
  contactEmail: agg.contactEmail || '',
  otaProfile: agg.otaProfile === 'standard' ? 'standard' : 'compatible',
  otaValidation: agg.otaValidation === 'strict' ? 'strict' : 'report',
  otaRelease: agg.otaRelease || '',
  soapVersion: agg.soapVersion === '1.1' || agg.soapVersion === '1.2' ? agg.soapVersion : '',
  coverageCodes: { ...(agg.bookingRules?.otaCodes?.coverages || {}) },
});

const selCls = `${selectCls} w-full`;

/** Only filled-in coverage codes are kept, in capitals. */
const cleanCodes = (codes: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(codes).map(([k, v]) => [k.toUpperCase(), v.trim().toUpperCase()]).filter(([, v]) => v));
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

  // Start again from the saved settings only when another connection is opened (not on every save).
  const current = useRef(aggregator);
  current.current = aggregator;
  useEffect(() => {
    setDraft(toDraft(current.current));
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
      vendorName: draft.vendorName.trim() || undefined,
      locationCode: draft.locationCode.trim().toUpperCase() || undefined,
      currency: draft.currency,
      status: draft.status,
      commissionPercent: Number.isFinite(commission) ? commission : undefined,
      contactEmail: draft.contactEmail.trim() || undefined,
      otaProfile: draft.otaProfile,
      otaValidation: draft.otaValidation,
      otaRelease: draft.otaRelease || undefined,
      soapVersion: draft.soapVersion || undefined,
      bookingRules: { ...aggregator.bookingRules, otaCodes: { ...aggregator.bookingRules?.otaCodes, coverages: cleanCodes(draft.coverageCodes) } },
    };
  };

  const coverCodes = (aggregator.bookingRules?.pricing?.coverages || [])
    .map(c => ({ code: (c.code || '').trim().toUpperCase(), name: c.name }))
    .filter(c => c.code);

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

      <Section title="OpenTravel XML layout" subtitle="How this broker's XML answers are laid out. Prices, availability and bookings are the same in both.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="XML layout">
          {([
            ['standard', 'OpenTravel standard', 'Every answer is valid against the official OpenTravel 2017B schemas: official day names and times, codes from the OpenTravel code lists, booking details in their standard place. Recommended for every new connection.'],
            ['compatible', 'As connected', 'The layout this broker was built and certified against. Keep it until the broker confirms they read the standard layout, then switch.'],
          ] as const).map(([value, title, text]) => (
            <label key={value} className={`flex gap-3 rounded-lg p-3 cursor-pointer ring-1 ring-inset ${draft.otaProfile === value ? 'ring-indigo-500 bg-indigo-50/60' : 'ring-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name="otaProfile" className="mt-1" checked={draft.otaProfile === value} onChange={() => set('otaProfile', value)} />
              <span><span className="block text-[13px] font-semibold text-slate-900">{title}</span><span className="block text-xs text-slate-600 mt-0.5">{text}</span></span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200 px-3 py-2.5">
          <span className="text-[13px] font-semibold text-slate-900">Schema check of broker requests</span>
          {([['report', 'Report only (recommended)'], ['strict', 'Strict: refuse invalid requests']] as const).map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-1.5 text-[13px] text-slate-700 cursor-pointer">
              <input type="radio" name="otaValidation" checked={draft.otaValidation === v} onChange={() => set('otaValidation', v)} />{l}
            </label>
          ))}
          <span className="basis-full text-xs text-slate-500">Every request is checked against the official OpenTravel 2017B schema. Problems show in Traffic with a “Schema” label. Use Strict only after this broker's requests show no problems.</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>OpenTravel release in the broker's specification</span>
            <select value={draft.otaRelease} onChange={e => set('otaRelease', e.target.value)} className={selectCls} aria-label="OpenTravel release">
              <option value="">Not recorded</option>
              {OTA_RELEASES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>How they send messages</span>
            <select value={draft.soapVersion} onChange={e => set('soapVersion', e.target.value as Draft['soapVersion'])} className={selectCls} aria-label="SOAP version">
              <option value="">Plain XML over HTTPS</option>
              <option value="1.1">SOAP 1.1</option>
              <option value="1.2">SOAP 1.2</option>
            </select>
          </label>
          <span className="sm:col-span-2 text-xs text-slate-500">A record of what was agreed. Traffic → “What the broker sends” shows the release address, SOAP version and message Version they really use.</span>
        </div>
        {coverCodes.length > 0 && (
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-slate-900">Coverage codes <span className="font-normal text-slate-500">(OpenTravel coverage type, from the broker's specification)</span></p>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-[11px] uppercase tracking-wider text-slate-500 text-left border-b border-slate-200">
                  <tr><th className="py-2 pr-3">Cover</th><th className="py-2 pr-3">OpenTravel code</th><th className="py-2">Sent as</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {coverCodes.map(c => {
                    const own = draft.coverageCodes[c.code] || '';
                    const sent = coverageTypeFor(c.code, draft.coverageCodes);
                    const bad = own !== '' && !isOtaCode(own);
                    return (
                      <tr key={c.code}>
                        <td className="py-2 pr-3"><span className="font-mono font-semibold">{c.code}</span> <span className="text-slate-500">{c.name}</span></td>
                        <td className="py-2 pr-3">
                          <input value={own} aria-label={`OpenTravel code for ${c.code}`} placeholder={KNOWN_COVERAGE_TYPES[c.code] || 'e.g. 38'}
                            onChange={e => set('coverageCodes', { ...draft.coverageCodes, [c.code]: e.target.value.toUpperCase().slice(0, 12) })}
                            className={`${inputCls} w-28 font-mono ${bad ? 'border-rose-400' : ''}`} />
                        </td>
                        <td className="py-2 text-xs">
                          {bad ? <span className="text-rose-600">Not an OpenTravel code (digits, e.g. 7)</span>
                            : sent ? <span className="text-emerald-700">CoverageType {sent}</span>
                            : <span className="text-amber-700">In the extensions until a code is set</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      <Section title="XML identifiers & commercial terms" subtitle="Values written into every XML message for this channel.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-3">
            <Label hint="(Vendor name)">Supplier name shown to the broker</Label>
            <input value={draft.vendorName} onChange={e => set('vendorName', e.target.value.slice(0, 60))} className={inputCls} placeholder="UR-Drive Jordan" />
          </div>
          <div>
            <Label hint="(Vendor Code)">Supplier code</Label>
            <input value={draft.vendorCode} onChange={e => set('vendorCode', e.target.value.toUpperCase().slice(0, 8))} className={`${inputCls} font-mono`} placeholder="URD" />
          </div>
          <div className="sm:col-span-3 rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200 px-3 py-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Codes the broker may use:</span>{' '}
            {acceptedVendorCodes(draft.vendorCode, draft.vendorName).map(c => <span key={c} className="inline-block mx-0.5 px-1.5 py-px rounded bg-white ring-1 ring-inset ring-slate-200 font-mono font-semibold text-slate-800">{c}</span>)}
            <span className="block mt-1 text-slate-500">Each answer uses the code the broker sent in VendorPref. A broker that sends none gets {(draft.vendorCode || 'URD').toUpperCase()}.</span>
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
