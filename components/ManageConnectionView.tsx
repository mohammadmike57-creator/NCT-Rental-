import React, { useState, useEffect } from 'react';
import { Aggregator, AggregatorConnectionDetails, ChannelStatus } from '../types';
import { SaveIcon, LockClosedIcon, EyeIcon, CheckCircleIcon, AlertIcon } from './icons';
import { SUPPORTED_CURRENCIES, validateChannel } from '../services/channelManager';

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

const inputCls = 'w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white';
const Label: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <label className="block text-sm font-medium text-slate-700 mb-1">
    {children}
    {hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
  </label>
);

const Section: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
    <div className="px-5 py-4 border-b border-slate-100">
      <h4 className="font-bold text-slate-800">{title}</h4>
      <p className="text-xs text-slate-500">{subtitle}</p>
    </div>
    <div className="p-5 space-y-5">{children}</div>
  </section>
);

const ManageConnectionView: React.FC<ManageConnectionViewProps> = ({ aggregator, onUpdate, showConfirmation }) => {
  const [draft, setDraft] = useState<Draft>(() => toDraft(aggregator));
  const [showKey, setShowKey] = useState(false);
  const [checkResult, setCheckResult] = useState<string[] | null>(null);

  useEffect(() => {
    setDraft(toDraft(aggregator));
    setCheckResult(null);
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
    onUpdate(updated);
    showConfirmation?.(`Connection settings for ${aggregator.name} saved.`);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Connection & channel settings</h3>
          <p className="text-sm text-slate-500">Credentials and identifiers used when exchanging XML with {aggregator.name}.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={runCheck} className="px-4 py-2.5 text-sm font-semibold border border-slate-300 rounded-lg text-slate-700 bg-white hover:bg-slate-50">
            Check configuration
          </button>
          <button onClick={handleSave} disabled={!dirty} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark disabled:bg-slate-300 disabled:cursor-not-allowed">
            <SaveIcon className="w-4 h-4" /> Save
          </button>
        </div>
      </div>

      {checkResult && (
        <div className={`rounded-xl border p-4 text-sm ${checkResult.length === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
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
              className={`text-left p-3 rounded-lg border transition-all ${draft.status === value ? 'border-primary ring-2 ring-primary/15 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <p className="text-sm font-semibold text-slate-800">{label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Endpoint & credentials" subtitle="Provided by the partner during onboarding.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="sm:col-span-2">
            <Label>Endpoint URL</Label>
            <input type="url" value={draft.connection.apiUrl} onChange={e => setConn('apiUrl', e.target.value)} className={`${inputCls} font-mono`} placeholder="https://xml.partner.com/ota/v1" />
          </div>
          <div>
            <Label>Environment</Label>
            <select value={draft.connection.environment} onChange={e => setConn('environment', e.target.value as 'test' | 'production')} className={inputCls}>
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
              <LockClosedIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <button type="button" onClick={() => setShowKey(s => !s)} className="absolute right-2 top-2 p-1 text-slate-400 hover:text-slate-700" title={showKey ? 'Hide' : 'Show'}>
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

      <Section title="XML identifiers & commercial terms" subtitle="Values written into every XML message for this channel.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
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
            <select value={draft.currency} onChange={e => set('currency', e.target.value)} className={inputCls}>
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
