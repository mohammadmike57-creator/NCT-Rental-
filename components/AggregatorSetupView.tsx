import React, { useEffect, useMemo, useState } from 'react';
import { Aggregator, Fleet, StopSale, AvailableExtra, RentalLocation, CompanyDetails } from '../types';
import { PlusIcon, TrashIcon, GlobeAltIcon, StopIcon, InboxIcon, KeyIcon, ChartBarIcon, PencilIcon, ServerIcon, CodeBracketIcon, CurrencyDollarIcon } from './icons';
import RateRulesView from './channel/RateRulesView';
import BookingApiView from './channel/BookingApiView';
import ChannelBookingsView from './channel/ChannelBookingsView';
import GoLiveView from './channel/GoLiveView';
import TrafficView from './channel/TrafficView';
import ConsoleView from './channel/ConsoleView';
import { Page, Panel, Badge, Plate, Button, Field, EmptyState, Dialog, inputCls } from './ui/Crm';
import ManageRatePlansView from './ManageRatePlansView';
import ManageTermsView from './ManageTermsView';
import ManageConnectionView from './ManageConnectionView';
import ManageAggregatorExtrasView from './ManageAggregatorExtrasView';
import ManageStopSaleView from './ManageStopSaleView';
import XMLPreviewView from './XMLPreviewView';
import RateHistoryView from './RateHistoryView';
import ChannelOverviewView from './ChannelOverviewView';
import ChannelDeliveryLogView from './ChannelDeliveryLogView';
import MultiChannelEditor, { BulkResult } from './channel/MultiChannelEditor';
import XmlReservationsView from './channel/XmlReservationsView';
import ApiKeysView from './channel/ApiKeysView';
import ChannelReadiness from './channel/ChannelReadiness';
import ChannelDashboardView from './channel/ChannelDashboardView';
import ChannelSecurityView from './channel/ChannelSecurityView';
import ApiV3View from './channel/ApiV3View';
import PriceRulesView from './channel/PriceRulesView';
import LanguagesView from './channel/LanguagesView';
import OutboundView from './channel/OutboundView';
import DeveloperView from './channel/DeveloperView';
import ConnectionProfileView, { connectionStateOf } from './channel/ConnectionProfileView';
import { saveAllData, deliverChannelRates, recordActivity, fetchChannelWebhooks } from '../firebase/api';
import { channelStatus, hasUnpublishedChanges, submissionVersion, validateChannel, todayIso, stopSalesFor } from '../services/channelManager';

interface AggregatorSetupViewProps {
  aggregators: Aggregator[];
  onUpdateAggregators: (aggregators: Aggregator[]) => void;
  fleet: Fleet;
  availableExtras: AvailableExtra[];
  stopSales: StopSale[];
  onUpdateStopSales: (stopSales: StopSale[]) => void;
  showConfirmation: (message: string) => void;
  currentUserName?: string;
  rentalLocations?: RentalLocation[];
  companyDetails?: CompanyDetails;
}

export type ChannelTab = 'Overview' | 'Connection' | 'Security' | 'API v3' | 'Rates' | 'Extras' | 'Terms & Conditions' | 'Publish History' | 'XML Feed' | 'Booking API' | 'Price rules' | 'Languages' | 'Outbound' | 'Bookings' | 'Traffic' | 'Test console' | 'Go-live';
/** A channel's screens, grouped by job and in the order they are set up. */
const TAB_GROUPS: { label: string; tabs: ChannelTab[] }[] = [
  { label: 'Overview', tabs: ['Overview', 'Go-live'] },
  { label: 'Pricing', tabs: ['Rates', 'Price rules', 'Extras', 'Terms & Conditions'] },
  { label: 'Connection', tabs: ['Connection', 'Booking API', 'Outbound', 'Languages', 'Security', 'API v3'] },
  { label: 'Operations', tabs: ['Bookings', 'Traffic', 'Test console'] },
  { label: 'Publishing', tabs: ['Publish History', 'XML Feed'] },
];
const TAB_LABEL: Partial<Record<ChannelTab, string>> = { 'Terms & Conditions': 'Terms', 'Publish History': 'Publish history', 'XML Feed': 'XML feed' };
const groupOf = (t: ChannelTab) => TAB_GROUPS.find(g => g.tabs.includes(t)) || TAB_GROUPS[0];

/** What a new channel takes over from an existing one: the supplier's own setup, nothing that belongs to the other broker. */
const copiedSetup = (src: Aggregator): Partial<Aggregator> => {
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? null));
  const rules = clone(src.bookingRules) || undefined;
  if (rules) { delete rules.webhookUrl; delete rules.webhookEvents; delete rules.ipAllowlist; delete rules.allotments; delete rules.commercial; }
  const latest = (src.ratePlanHistory || [])[0]?.ratePlans;
  return {
    vendorCode: src.vendorCode, locationCode: src.locationCode, currency: src.currency,
    bookingRules: rules,
    currentRatePlans: clone(latest?.length ? latest : src.currentRatePlans || []),
    extras: clone(src.extras || []),
    termsAndConditions: src.termsAndConditions,
  };
};

const STATUS_STYLE: Record<string, { dot: string; label: string; pill: string }> = {
  active: { dot: 'bg-emerald-500', label: 'Live', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  testing: { dot: 'bg-amber-500', label: 'Testing', pill: 'bg-amber-50 text-amber-700 border-amber-200' },
  paused: { dot: 'bg-slate-400', label: 'Paused', pill: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export const relativeTime = (iso?: string) => {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

const AggregatorSetupView: React.FC<AggregatorSetupViewProps> = ({
  aggregators, onUpdateAggregators, fleet, availableExtras, stopSales, onUpdateStopSales, showConfirmation, currentUserName,
  rentalLocations = [], companyDetails,
}) => {
  const [selectedAggregatorId, setSelectedAggregatorId] = useState<string | null>(aggregators.length > 0 ? aggregators[0].id : null);
  const [isAddingPartner, setIsAddingPartner] = useState(false);
  const [newAggregatorName, setNewAggregatorName] = useState('');
  const [newChannelCode, setNewChannelCode] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  // Status updates that could not be delivered to a broker, checked when the page opens.
  const [failedUpdates, setFailedUpdates] = useState<{ id: string; name: string; count: number }[]>([]);
  const hookChannels = aggregators.filter(a => a.bookingRules?.webhookUrl).map(a => `${a.id}|${a.name}`).join(',');
  useEffect(() => {
    let live = true;
    const list = hookChannels ? hookChannels.split(',').map(s => { const [id, ...n] = s.split('|'); return { id, name: n.join('|') }; }) : [];
    Promise.all(list.map(c => fetchChannelWebhooks(c.id)
      .then(r => ({ ...c, count: (r?.deliveries || []).filter(d => d.status === 'FAILED').length }))
      .catch(() => ({ ...c, count: 0 }))))
      .then(r => live && setFailedUpdates(r.filter(x => x.count > 0)));
    return () => { live = false; };
  }, [hookChannels]);
  const openChannel = (id: string, tab: ChannelTab) => { setSelectedAggregatorId(id); setActiveTab(tab); setMode('channels'); };
  const [activeTab, setActiveTab] = useState<ChannelTab>('Overview');
  const [channelSearch, setChannelSearch] = useState('');
  // Which workspace is open: one channel, the global stop sales, the multi-channel editor, or the XML reservations of all brokers.
  const [mode, setMode] = useState<'channels' | 'stopsale' | 'multi' | 'reservations' | 'keys' | 'dashboard' | 'developer' | 'rates'>('channels');
  const showStopSale = mode === 'stopsale';
  const [sending, setSending] = useState(false);
  const [deliveryRefresh, setDeliveryRefresh] = useState(0);

  const selectedAggregator = aggregators.find(agg => agg.id === selectedAggregatorId) || aggregators[0];

  const health = useMemo(() => {
    const map: Record<string, ReturnType<typeof validateChannel>> = {};
    aggregators.forEach(a => { map[a.id] = validateChannel(a, fleet); });
    return map;
  }, [aggregators, fleet]);

  const today = todayIso();
  const activeStopSales = (stopSales || []).filter(s => s.startDate <= today && today <= s.endDate).length;
  const liveChannels = aggregators.filter(a => channelStatus(a) === 'active').length;
  const pendingChannels = aggregators.filter(hasUnpublishedChanges).length;
  const lastPublish = aggregators
    .map(a => (a.ratePlanHistory || [])[0]?.submittedAt)
    .filter(Boolean)
    .sort()
    .pop();
  const attention = aggregators.filter(a => (health[a.id]?.errors ?? 0) > 0).length;

  const handleAddAggregator = () => {
    const name = newAggregatorName.trim();
    if (!name) return;
    const code = (newChannelCode.trim() || name.replace(/[^A-Za-z]/g, '').slice(0, 3)).toUpperCase();
    if (aggregators.some(a => (a.channelCode || '').toUpperCase() === code)) {
      window.alert(`The channel code ${code} is already used by ${aggregators.find(a => (a.channelCode || '').toUpperCase() === code)!.name}. Choose another code.`);
      return;
    }
    const source = aggregators.find(a => a.id === copyFrom);
    const newAggregator: Aggregator = {
      id: `agg-${Date.now()}`,
      name,
      channelCode: code,
      vendorCode: 'URD',
      vendorName: companyDetails?.name || 'UR-Drive Jordan',
      locationCode: 'AMM',
      currency: 'USD',
      status: 'testing',
      connectionDetails: { apiUrl: '', username: '', apiKey: '', environment: 'test' },
      currentRatePlans: [],
      ratePlanHistory: [],
      extras: [],
      termsAndConditions: `Default terms for ${name}.`,
      ...(source ? copiedSetup(source) : {}),
    };
    onUpdateAggregators([...aggregators, newAggregator]);
    setNewAggregatorName('');
    setNewChannelCode('');
    setCopyFrom('');
    setIsAddingPartner(false);
    setSelectedAggregatorId(newAggregator.id);
    setActiveTab(source ? 'Overview' : 'Connection');
    showConfirmation(source
      ? `Channel ${name} created from ${source.name}: branches, rules, covers, extras, terms and draft rates copied. Review and publish the rates, then create its API key.`
      : `Channel ${name} created in testing mode. Configure the connection to go live.`);
  };

  const handleDeleteAggregator = (agg: Aggregator) => {
    if (window.confirm(`Delete ${agg.name} and all its rates, extras and publish history? This cannot be undone.`)) {
      const remaining = aggregators.filter(a => a.id !== agg.id);
      onUpdateAggregators(remaining);
      if (selectedAggregatorId === agg.id) setSelectedAggregatorId(remaining[0]?.id ?? null);
      showConfirmation(`${agg.name} deleted.`);
    }
  };

  const handleUpdateAggregator = (updated: Aggregator) => {
    onUpdateAggregators(aggregators.map(a => (a.id === updated.id ? updated : a)));
  };

  const sendRates = async (agg: Aggregator) => {
    setSending(true);
    try {
      const result = await deliverChannelRates(agg.id);
      showConfirmation(result.success
        ? `Rates v${result.version} delivered to ${agg.name} (HTTP ${result.httpStatus}).`
        : `Delivery to ${agg.name} failed: ${result.error || 'unknown error'}. See the delivery log.`);
    } catch (e: any) {
      showConfirmation(`Could not reach the server to deliver rates to ${agg.name}.`);
    } finally {
      setSending(false);
      setDeliveryRefresh(n => n + 1);
    }
  };

  /** Publish = persist the new version first (the server reads saved state), then push if the partner has an endpoint. */
  const handlePublished = async (updated: Aggregator) => {
    const list = aggregators.map(a => (a.id === updated.id ? updated : a));
    onUpdateAggregators(list);
    try {
      await saveAllData({ aggregators: list });
    } catch {
      showConfirmation(`Version saved locally but could not be stored on the server yet; it will sync automatically. Delivery to ${updated.name} was not attempted.`);
      return;
    }
    if (updated.connectionDetails?.apiUrl && channelStatus(updated) !== 'paused') {
      await sendRates(updated);
    }
  };

  /** Multi-channel editor: saves every changed channel (and new stop sales) at once, then delivers the published ones. */
  const applyBulk = async (updated: Aggregator[], newStopSales: StopSale[], deliverIds: string[], summary: string): Promise<BulkResult[]> => {
    const byId = new Map(updated.map(a => [a.id, a]));
    const list = aggregators.map(a => byId.get(a.id) || a);
    const stops = newStopSales.length ? [...stopSales, ...newStopSales] : stopSales;
    onUpdateAggregators(list);
    if (newStopSales.length) onUpdateStopSales(stops);
    recordActivity('CHANNELS_BULK_UPDATED', 'settings', summary);
    try {
      await saveAllData({ aggregators: list, ...(newStopSales.length ? { stopSales: stops } : {}) });
    } catch {
      return updated.map(a => ({ id: a.id, name: a.name, ok: false, message: 'Saved in this browser; the server could not be reached yet (it syncs automatically). Nothing was sent.' }));
    }
    const out: BulkResult[] = [];
    for (const a of updated) {
      const published = (a.ratePlanHistory || [])[0];
      const isNew = published && !aggregators.find(x => x.id === a.id)?.ratePlanHistory?.some(h => h.id === published.id);
      if (!deliverIds.includes(a.id)) {
        out.push({ id: a.id, name: a.name, ok: true, message: isNew ? `Saved · rate version ${published.version} published` : 'Saved' });
        continue;
      }
      try {
        const r = await deliverChannelRates(a.id);
        out.push({ id: a.id, name: a.name, ok: r.success, message: r.success ? `Saved · v${r.version} delivered (HTTP ${r.httpStatus})` : `Saved · delivery failed: ${r.error || 'unknown error'}` });
      } catch {
        out.push({ id: a.id, name: a.name, ok: false, message: 'Saved · the server could not be reached to deliver the rates' });
      }
    }
    setDeliveryRefresh(n => n + 1);
    showConfirmation(`Multi-channel update applied to ${updated.length} channel${updated.length === 1 ? '' : 's'}.`);
    return out;
  };

  const selectChannel = (id: string) => {
    setSelectedAggregatorId(id);
    setMode('channels');
    setActiveTab('Overview');
  };

  const statusTone = (a: Aggregator) => {
    const st = channelStatus(a);
    return st === 'active' ? 'success' : st === 'testing' ? 'warning' : 'muted';
  };

  const sel = selectedAggregator;
  const filteredChannels = aggregators.filter(a => !channelSearch.trim()
    || `${a.name} ${a.channelCode || ''}`.toLowerCase().includes(channelSearch.trim().toLowerCase()));
  const failingUpdates = failedUpdates.reduce((n, f) => n + f.count, 0);
  const MODULES = [
    ['channels', 'Channels', ServerIcon, aggregators.length],
    ['dashboard', 'Dashboard', ChartBarIcon, undefined],
    ['reservations', 'XML reservations', InboxIcon, undefined],
    ['rates', 'Rate rules', CurrencyDollarIcon, undefined],
    ['keys', 'API keys', KeyIcon, undefined],
    ['multi', 'Bulk editor', PencilIcon, undefined],
    ['stopsale', 'Stop sales', StopIcon, activeStopSales || undefined],
    ['developer', 'Developer', CodeBracketIcon, undefined],
  ] as const;
  const statusCells: { label: string; value: React.ReactNode; tone: 'ok' | 'warn' | 'bad' | 'plain' }[] = [
    { label: 'Broker updates', value: failingUpdates ? `${failingUpdates} failing` : 'Operational', tone: failingUpdates ? 'bad' : 'ok' },
    { label: 'Live channels', value: `${liveChannels} / ${aggregators.length}`, tone: liveChannels ? 'ok' : 'plain' },
    { label: 'Unpublished', value: pendingChannels ? `${pendingChannels} channel${pendingChannels === 1 ? '' : 's'}` : 'In sync', tone: pendingChannels ? 'warn' : 'ok' },
    { label: 'Blocking errors', value: attention ? `${attention} channel${attention === 1 ? '' : 's'}` : 'None', tone: attention ? 'bad' : 'ok' },
    { label: 'Stop sales today', value: activeStopSales, tone: activeStopSales ? 'warn' : 'plain' },
    { label: 'Last publish', value: relativeTime(lastPublish), tone: 'plain' },
  ];
  const cellDot = { ok: 'bg-emerald-400', warn: 'bg-amber-400', bad: 'bg-rose-400', plain: 'bg-slate-500' } as const;

  return (
    <Page className="ota-console">
      {/* Console header: identity, live system status and the module menu */}
      <header className="rounded-xl bg-slate-900 text-white shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-lg bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/30 inline-flex items-center justify-center shrink-0">
              <GlobeAltIcon className="w-5 h-5 text-indigo-300" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-300">OTA XML · Distribution</p>
              <h2 className="text-lg font-semibold leading-tight">Channel Manager</h2>
              <p className="text-[12px] text-slate-400 truncate">{companyDetails?.name || 'UR-Drive Jordan'} · rates, availability and bookings for every broker</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-white/5 ring-1 ring-inset ring-white/10 text-[11px] font-medium text-slate-300">
              <span className="font-mono">OTA 2003/05 · 2018A · 2024A</span><span className="text-slate-600">|</span><span className="font-mono">REST v3</span>
            </span>
            <button type="button" onClick={() => setIsAddingPartner(true)}
              className="h-9 px-3.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-[13px] font-semibold inline-flex items-center gap-2 shadow-sm">
              <PlusIcon className="w-4 h-4" />Add channel
            </button>
          </div>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 border-t border-white/10 divide-x divide-white/10">
          {statusCells.map(c => (
            <div key={c.label} className="px-5 py-2.5 min-w-0 max-xl:border-b max-xl:border-white/10">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">{c.label}</dt>
              <dd className="mt-0.5 flex items-center gap-2 text-[14px] font-semibold tabular-nums truncate">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cellDot[c.tone]}`} />{c.value}
              </dd>
            </div>
          ))}
        </dl>
        <nav className="px-3 flex gap-0.5 overflow-x-auto no-scrollbar border-t border-white/10 bg-slate-950/40" aria-label="OTA XML sections">
          {MODULES.map(([key, label, Icon, count]) => (
            <button key={key} type="button" onClick={() => setMode(key)} aria-current={mode === key ? 'page' : undefined}
              className={`h-11 px-3 inline-flex items-center gap-2 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ${mode === key ? 'border-indigo-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-100'}`}>
              <Icon className="w-4 h-4" />{label}
              {count !== undefined && <span className={`px-1.5 py-px rounded text-[10px] font-semibold tabular-nums ${key === 'stopsale' ? 'bg-rose-500/20 text-rose-200' : 'bg-white/10 text-slate-300'}`}>{count}</span>}
            </button>
          ))}
        </nav>
      </header>

      {failedUpdates.length > 0 && mode !== 'dashboard' && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2" role="alert">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          <p className="text-[13px] text-rose-800 flex-1 min-w-0">
            <b>Status updates are failing</b> for {failedUpdates.map(f => `${f.name} (${f.count})`).join(', ')}. The broker does not know about those changes until they are delivered.
          </p>
          {failedUpdates.map(f => <Button key={f.id} size="sm" onClick={() => openChannel(f.id, 'Booking API')}>Open {f.name}</Button>)}
        </div>
      )}

      {mode === 'developer' ? (
        <DeveloperView />
      ) : mode === 'rates' ? (
        <RateRulesView aggregators={aggregators} fleet={fleet} currentUserName={currentUserName} onUpdateAggregator={handleUpdateAggregator} showConfirmation={showConfirmation} />
      ) : mode === 'dashboard' ? (
        <ChannelDashboardView aggregators={aggregators} onOpenChannel={openChannel} />
      ) : mode === 'reservations' ? (
        <XmlReservationsView aggregators={aggregators} />
      ) : mode === 'keys' ? (
        <ApiKeysView aggregators={aggregators} onUpdate={handleUpdateAggregator} showConfirmation={showConfirmation}
          onOpenChannel={id => openChannel(id, 'Connection')} />
      ) : mode === 'multi' ? (
        <MultiChannelEditor aggregators={aggregators} fleet={fleet} availableExtras={availableExtras} stopSales={stopSales}
          currentUserName={currentUserName} onApply={applyBulk} />
      ) : showStopSale ? (
        <ManageStopSaleView stopSales={stopSales} onUpdate={onUpdateStopSales} fleet={fleet} channels={aggregators.map(a => ({ id: a.id, name: a.name }))} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)] gap-4 items-start">
          {/* Navigator: the brokers, then the sections of the selected one */}
          <aside className="space-y-3">
            <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Channels <span className="ml-1 text-slate-400 tabular-nums">{aggregators.length}</span></h3>
                <button type="button" onClick={() => setIsAddingPartner(true)} className="w-6 h-6 inline-flex items-center justify-center rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50" aria-label="Add channel" title="Add channel">
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
              {aggregators.length > 4 && (
                <div className="px-3 pb-2">
                  <input value={channelSearch} onChange={e => setChannelSearch(e.target.value)} placeholder="Find a channel" aria-label="Find a channel"
                    className="w-full h-8 px-2.5 rounded-md border border-slate-200 bg-slate-50 text-[12px] focus:bg-white focus:border-indigo-400 outline-none" />
                </div>
              )}
              {aggregators.length === 0 ? (
                <p className="px-3 pb-4 text-[12px] text-slate-500">No channels yet.</p>
              ) : (
                <ul className="max-h-56 lg:max-h-[38vh] overflow-y-auto border-t border-slate-100">
                  {filteredChannels.map(agg => {
                    const selected = sel?.id === agg.id;
                    const st = STATUS_STYLE[channelStatus(agg)];
                    const h = health[agg.id];
                    const pending = hasUnpublishedChanges(agg);
                    const latest = (agg.ratePlanHistory || [])[0];
                    return (
                      <li key={agg.id} onClick={() => selectChannel(agg.id)}
                        className={`group relative pl-3 pr-8 py-2 cursor-pointer border-l-2 transition-colors ${selected ? 'bg-indigo-50/70 border-indigo-600' : 'border-transparent hover:bg-slate-50'}`}>
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} title={st.label} />
                          <span className={`text-[13px] font-semibold truncate ${selected ? 'text-indigo-900' : 'text-slate-800'}`}>{agg.name}</span>
                          {agg.channelCode && <span className="ml-auto font-mono text-[10px] font-semibold text-slate-500">{agg.channelCode}</span>}
                        </div>
                        <div className="mt-0.5 pl-3.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                          <span className="tabular-nums">{latest ? `v${submissionVersion(agg, 0)} · ${relativeTime(latest.submittedAt)}` : 'never published'}</span>
                          {pending && <span className="text-amber-600 font-medium">changes</span>}
                          {h && h.errors > 0 && <span className="text-rose-600 font-medium">{h.errors} error{h.errors > 1 ? 's' : ''}</span>}
                        </div>
                        <button onClick={e => { e.stopPropagation(); handleDeleteAggregator(agg); }} title={`Delete ${agg.name}`} aria-label={`Delete ${agg.name}`}
                          className="absolute right-1.5 top-1.5 w-6 h-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100">
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    );
                  })}
                  {filteredChannels.length === 0 && <li className="px-3 py-3 text-[12px] text-slate-500">No channel matches.</li>}
                </ul>
              )}
            </section>

            {sel && (
              <>
                <nav className="hidden lg:block bg-white rounded-lg border border-slate-200 py-2" aria-label="Channel sections">
                  {TAB_GROUPS.map(g => {
                    const errors = g.label === 'Overview' ? health[sel.id]?.errors : undefined;
                    return (
                      <div key={g.label} className="px-2 pb-1.5">
                        <p className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{g.label}</p>
                        {g.tabs.map(t => {
                          const on = activeTab === t;
                          return (
                            <button key={t} type="button" onClick={() => setActiveTab(t)} aria-current={on ? 'page' : undefined}
                              className={`w-full h-8 px-2 rounded-md flex items-center gap-2 text-[13px] text-left transition-colors ${on ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                              <span className={`w-1 h-4 rounded-full ${on ? 'bg-indigo-600' : 'bg-transparent'}`} />
                              <span className="truncate">{TAB_LABEL[t] || t}</span>
                              {t === 'Overview' && errors ? <span className="ml-auto px-1.5 py-px rounded bg-rose-100 text-rose-700 text-[10px] font-semibold tabular-nums">{errors}</span> : null}
                              {t === 'Rates' && hasUnpublishedChanges(sel) ? <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-500" title="Unpublished changes" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </nav>
                <select className="lg:hidden w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13px]" value={activeTab}
                  onChange={e => setActiveTab(e.target.value as ChannelTab)} aria-label="Channel section">
                  {TAB_GROUPS.map(g => (
                    <optgroup key={g.label} label={g.label}>
                      {g.tabs.map(t => <option key={t} value={t}>{TAB_LABEL[t] || t}</option>)}
                    </optgroup>
                  ))}
                </select>
              </>
            )}
          </aside>

          {/* Workspace */}
          {sel ? (
            <div className="min-w-0 space-y-4">
              <section className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-500">
                    {groupOf(activeTab).label !== activeTab && <>{groupOf(activeTab).label} <span className="text-slate-300 mx-1">/</span> </>}<span className="text-slate-700 font-medium">{TAB_LABEL[activeTab] || activeTab}</span>
                  </p>
                  <h3 className="mt-0.5 flex flex-wrap items-center gap-2 text-[17px] font-semibold text-slate-900">
                    {sel.name}
                    {sel.channelCode && <Plate value={sel.channelCode} />}
                    <Badge tone={statusTone(sel)}>{STATUS_STYLE[channelStatus(sel)].label}</Badge>
                    {(() => { const cs = connectionStateOf(sel); return <Badge tone={cs.tone} dot={false}>{cs.label}</Badge>; })()}
                  </h3>
                </div>
                <dl className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
                  {[
                    ['Supplier', `${sel.vendorCode || 'URD'} · ${sel.locationCode || 'AMM'}`],
                    ['Currency', sel.currency || 'USD'],
                    ['Rates', (sel.ratePlanHistory || [])[0] ? `v${submissionVersion(sel, 0)} · ${relativeTime((sel.ratePlanHistory || [])[0].submittedAt)}` : 'not published'],
                    ['Environment', sel.connectionDetails?.environment === 'production' ? 'Production' : 'Test'],
                  ].map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{k}</dt>
                      <dd className="font-medium text-slate-700 tabular-nums whitespace-nowrap">{v}</dd>
                    </div>
                  ))}
                  {hasUnpublishedChanges(sel) && (
                    <Button size="sm" className="!text-amber-700 !border-amber-200 !bg-amber-50 hover:!bg-amber-100" onClick={() => setActiveTab('Rates')}>Unpublished changes</Button>
                  )}
                </dl>
              </section>

              <div className="space-y-4">
                {activeTab === 'Overview' && (
                  <ChannelReadiness aggregator={sel} fleet={fleet} validation={health[sel.id]}
                    onNavigate={t => (t === 'API keys' ? setMode('keys') : setActiveTab(t))} />
                )}
                {activeTab === 'Overview' && (
                  <ChannelOverviewView
                    aggregator={sel}
                    fleet={fleet}
                    stopSales={stopSalesFor(stopSales, sel.id)}
                    validation={health[sel.id]}
                    onNavigate={setActiveTab}
                  />
                )}
                {activeTab === 'Connection' && (
                  <>
                    <ConnectionProfileView aggregator={sel} fleet={fleet} currentUserName={currentUserName}
                      onUpdate={handleUpdateAggregator} showConfirmation={showConfirmation} />
                    <ManageConnectionView aggregator={sel} onUpdate={handleUpdateAggregator} showConfirmation={showConfirmation} />
                  </>
                )}
                {activeTab === 'Rates' && (
                  <ManageRatePlansView
                    aggregator={sel}
                    onUpdateAggregator={handleUpdateAggregator}
                    fleet={fleet}
                    stopSales={stopSales}
                    showConfirmation={showConfirmation}
                    currentUserName={currentUserName}
                    onPublished={handlePublished}
                  />
                )}
                {activeTab === 'Publish History' && (
                  <>
                    <Panel padded>
                      <ChannelDeliveryLogView
                        aggregator={sel}
                        refreshKey={deliveryRefresh}
                        sending={sending}
                        onSend={() => sendRates(sel)}
                      />
                    </Panel>
                    <Panel padded>
                      <RateHistoryView aggregator={sel} />
                    </Panel>
                  </>
                )}
                {activeTab === 'Extras' && (
                  <Panel padded>
                    <ManageAggregatorExtrasView aggregator={sel} onUpdate={handleUpdateAggregator} globalExtras={availableExtras} />
                  </Panel>
                )}
                {activeTab === 'Terms & Conditions' && (
                  <Panel padded>
                    <ManageTermsView terms={sel.termsAndConditions} onUpdate={terms => handleUpdateAggregator({ ...sel, termsAndConditions: terms })} />
                  </Panel>
                )}
                {activeTab === 'Booking API' && (
                  <BookingApiView aggregator={sel} fleet={fleet} rentalLocations={rentalLocations} onUpdate={handleUpdateAggregator} showConfirmation={showConfirmation} />
                )}
                {activeTab === 'Price rules' && (
                  <PriceRulesView key={sel.id} aggregator={sel} fleet={fleet} currentUserName={currentUserName}
                    onUpdate={handleUpdateAggregator} showConfirmation={showConfirmation} />
                )}
                {activeTab === 'Outbound' && <OutboundView key={sel.id} aggregator={sel} showConfirmation={showConfirmation} />}
                {activeTab === 'Languages' && (
                  <LanguagesView key={sel.id} aggregator={sel} fleet={fleet} onUpdate={handleUpdateAggregator} showConfirmation={showConfirmation} />
                )}
                {activeTab === 'API v3' && <ApiV3View aggregator={sel} showConfirmation={showConfirmation} />}
                {activeTab === 'Security' && <ChannelSecurityView aggregator={sel} onUpdate={handleUpdateAggregator} showConfirmation={showConfirmation} />}
                {activeTab === 'Bookings' && <ChannelBookingsView aggregator={sel} />}
                {activeTab === 'Traffic' && <TrafficView aggregator={sel} />}
                {activeTab === 'Test console' && <ConsoleView aggregator={sel} fleet={fleet} />}
                {activeTab === 'Go-live' && (
                  <GoLiveView aggregator={sel} fleet={fleet} company={companyDetails || ({ name: 'NCT Rental' } as CompanyDetails)}
                    currentUserName={currentUserName} onUpdate={handleUpdateAggregator} showConfirmation={showConfirmation} />
                )}
                {activeTab === 'XML Feed' && (
                  <XMLPreviewView aggregator={sel} fleet={fleet} stopSales={stopSalesFor(stopSales, sel.id)} />
                )}
              </div>
            </div>
          ) : (
            <Panel>
              <EmptyState
                icon={<GlobeAltIcon />}
                title="No channels yet"
                hint="Add your first distribution partner to start publishing rates over XML."
                action={<Button variant="primary" icon={<PlusIcon className="w-4 h-4" />} onClick={() => setIsAddingPartner(true)}>Add channel</Button>}
              />
            </Panel>
          )}
        </div>
      )}

      <Dialog
        open={isAddingPartner}
        onClose={() => setIsAddingPartner(false)}
        title="Add channel"
        subtitle="New channels start in testing mode. Configure the connection to go live."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsAddingPartner(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAddAggregator} disabled={!newAggregatorName.trim()}>Create</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Channel name" required>
            <input
              type="text"
              value={newAggregatorName}
              onChange={e => setNewAggregatorName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddAggregator()}
              placeholder="Channel name, e.g. Rentalcars"
              className={inputCls}
              autoFocus
            />
          </Field>
          {aggregators.length > 0 && (
            <Field label="Copy setup from" hint="Copies branches, booking rules, covers, car details, extras, terms and the rates (as a draft to publish). Never copies keys, webhooks, the broker's contacts or bookings.">
              <select value={copyFrom} onChange={e => setCopyFrom(e.target.value)} className={inputCls} aria-label="Copy setup from">
                <option value="">Start empty</option>
                {aggregators.map(a => <option key={a.id} value={a.id}>{a.name} ({a.channelCode || a.id})</option>)}
              </select>
            </Field>
          )}
          <Field label="Channel code" hint="Optional. Defaults to the first letters of the name.">
            <input
              type="text"
              value={newChannelCode}
              onChange={e => setNewChannelCode(e.target.value.toUpperCase().slice(0, 8))}
              placeholder="Code (optional), e.g. RCS"
              className={`${inputCls} font-mono`}
            />
          </Field>
        </div>
      </Dialog>
    </Page>
  );
};

export default AggregatorSetupView;
