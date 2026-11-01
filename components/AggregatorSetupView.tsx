import React, { useEffect, useMemo, useState } from 'react';
import { Aggregator, Fleet, StopSale, AvailableExtra, RentalLocation, CompanyDetails } from '../types';
import { PlusIcon, TrashIcon, GlobeAltIcon, StopIcon, InboxIcon, KeyIcon, ChartBarIcon } from './icons';
import BookingApiView from './channel/BookingApiView';
import ChannelBookingsView from './channel/ChannelBookingsView';
import GoLiveView from './channel/GoLiveView';
import TrafficView from './channel/TrafficView';
import ConsoleView from './channel/ConsoleView';
import { Page, PageHeader, StatGrid, Panel, Tabs, Badge, Plate, Button, Field, EmptyState, Dialog, inputCls } from './ui/Crm';
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

export type ChannelTab = 'Overview' | 'Connection' | 'Security' | 'Rates' | 'Extras' | 'Terms & Conditions' | 'Publish History' | 'XML Feed' | 'Booking API' | 'Bookings' | 'Traffic' | 'Test console' | 'Go-live';
const CHANNEL_TABS: ChannelTab[] = ['Overview', 'Rates', 'Connection', 'Booking API', 'Security', 'Bookings', 'Traffic', 'Test console', 'Go-live', 'Extras', 'Terms & Conditions', 'Publish History', 'XML Feed'];

/** What a new channel takes over from an existing one: the supplier's own setup, nothing that belongs to the other broker. */
const copiedSetup = (src: Aggregator): Partial<Aggregator> => {
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? null));
  const rules = clone(src.bookingRules) || undefined;
  if (rules) { delete rules.webhookUrl; delete rules.webhookEvents; delete rules.ipAllowlist; delete rules.allotments; }
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
  // Which workspace is open: one channel, the global stop sales, the multi-channel editor, or the XML reservations of all brokers.
  const [mode, setMode] = useState<'channels' | 'stopsale' | 'multi' | 'reservations' | 'keys' | 'dashboard'>('channels');
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
      vendorCode: 'NCT',
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

  return (
    <Page>
      <PageHeader
        section="OTA XML"
        title="Channel Manager"
        subtitle="OTA XML distribution — rates, availability, extras and stop sales for every partner."
        actions={
          <>
            <Button
              variant={mode === 'dashboard' ? 'primary' : 'secondary'}
              icon={<ChartBarIcon className="w-4 h-4" />}
              onClick={() => setMode(m => (m === 'dashboard' ? 'channels' : 'dashboard'))}
              aria-pressed={mode === 'dashboard'}
            >
              Dashboard
            </Button>
            <Button
              variant={mode === 'reservations' ? 'primary' : 'secondary'}
              icon={<InboxIcon className="w-4 h-4" />}
              onClick={() => setMode(m => (m === 'reservations' ? 'channels' : 'reservations'))}
              aria-pressed={mode === 'reservations'}
            >
              XML reservations
            </Button>
            <Button
              variant={mode === 'keys' ? 'primary' : 'secondary'}
              icon={<KeyIcon className="w-4 h-4" />}
              onClick={() => setMode(m => (m === 'keys' ? 'channels' : 'keys'))}
              aria-pressed={mode === 'keys'}
            >
              API keys
            </Button>
            <Button
              variant={mode === 'multi' ? 'primary' : 'secondary'}
              icon={<GlobeAltIcon className="w-4 h-4" />}
              onClick={() => setMode(m => (m === 'multi' ? 'channels' : 'multi'))}
              aria-pressed={mode === 'multi'}
            >
              Multi-channel editor
            </Button>
            <Button
              variant={showStopSale ? 'danger' : 'secondary'}
              className={showStopSale ? '!bg-rose-50' : ''}
              icon={<StopIcon className="w-4 h-4" />}
              onClick={() => setMode(m => (m === 'stopsale' ? 'channels' : 'stopsale'))}
              aria-pressed={showStopSale}
            >
              Global Stop Sale
              {activeStopSales > 0 && <span className="ml-1 px-1.5 py-px rounded bg-rose-100 text-rose-700 text-[11px] tabular-nums">{activeStopSales}</span>}
            </Button>
            <Button variant="primary" icon={<PlusIcon className="w-4 h-4" />} onClick={() => setIsAddingPartner(true)}>Add Channel</Button>
          </>
        }
      />

      <StatGrid items={[
        { label: 'Live channels', value: `${liveChannels} / ${aggregators.length}`, sub: 'connected partners', tone: liveChannels ? 'success' : 'default' },
        { label: 'Unpublished', value: pendingChannels, sub: pendingChannels ? 'channels with rate changes' : 'all channels in sync', tone: pendingChannels ? 'warning' : 'default' },
        { label: 'Needs attention', value: attention, sub: attention ? 'channels with blocking errors' : 'no blocking errors', tone: attention ? 'danger' : 'default' },
        { label: 'Last publish', value: relativeTime(lastPublish), sub: `${activeStopSales} stop sale${activeStopSales === 1 ? '' : 's'} active today` },
      ]} />

      {failedUpdates.length > 0 && mode !== 'dashboard' && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2" role="alert">
          <p className="text-[13px] text-rose-800 flex-1 min-w-0">
            <b>Status updates are failing</b> for {failedUpdates.map(f => `${f.name} (${f.count})`).join(', ')}. The broker does not know about those changes until they are delivered.
          </p>
          {failedUpdates.map(f => <Button key={f.id} size="sm" onClick={() => openChannel(f.id, 'Booking API')}>Open {f.name}</Button>)}
        </div>
      )}

      {mode === 'dashboard' ? (
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
        <div className="grid grid-cols-1 lg:grid-cols-[272px_minmax(0,1fr)] gap-4 items-start">
          {/* Channel list */}
          <Panel title="Channels" subtitle={`${aggregators.length} partner${aggregators.length === 1 ? '' : 's'}`} className="lg:sticky lg:top-4">
            {aggregators.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-slate-500 text-center">No channels yet.</p>
            ) : (
              <ul className="max-h-64 lg:max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
                {aggregators.map(agg => {
                  const selected = selectedAggregator?.id === agg.id;
                  const st = STATUS_STYLE[channelStatus(agg)];
                  const h = health[agg.id];
                  const pending = hasUnpublishedChanges(agg);
                  const latest = (agg.ratePlanHistory || [])[0];
                  return (
                    <li
                      key={agg.id}
                      onClick={() => selectChannel(agg.id)}
                      className={`group relative px-4 py-2.5 cursor-pointer border-l-2 transition-colors ${selected ? 'bg-indigo-50/60 border-indigo-600' : 'border-transparent hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center gap-2 pr-7">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} title={st.label}></span>
                        <span className="text-[13px] font-semibold text-slate-900 truncate">{agg.name}</span>
                        {agg.channelCode && <span className="ml-auto"><Plate value={agg.channelCode} /></span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="tabular-nums">{latest ? `v${submissionVersion(agg, 0)} · ${relativeTime(latest.submittedAt)}` : 'never published'}</span>
                        {(() => { const cs = connectionStateOf(agg); return <Badge tone={cs.tone} dot={false} className="!px-1.5 !py-0 !text-[10px]">{cs.label}</Badge>; })()}
                        {pending && <Badge tone="warning" dot={false} className="!px-1.5 !py-0 !text-[10px]">changes</Badge>}
                        {h && h.errors > 0 && <Badge tone="danger" dot={false} className="!px-1.5 !py-0 !text-[10px]">{h.errors} error{h.errors > 1 ? 's' : ''}</Badge>}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteAggregator(agg); }}
                        title={`Delete ${agg.name}`}
                        aria-label={`Delete ${agg.name}`}
                        className="absolute right-2 top-2 w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="p-3 border-t border-slate-100">
              <Button className="w-full" icon={<PlusIcon className="w-4 h-4" />} onClick={() => setIsAddingPartner(true)}>Add Channel</Button>
            </div>
          </Panel>

          {/* Channel workspace */}
          {selectedAggregator ? (
            <Panel
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {selectedAggregator.name}
                  {selectedAggregator.channelCode && <Plate value={selectedAggregator.channelCode} />}
                  <Badge tone={statusTone(selectedAggregator)}>{STATUS_STYLE[channelStatus(selectedAggregator)].label}</Badge>
                </span>
              }
              actions={hasUnpublishedChanges(selectedAggregator) ? (
                <Button size="sm" className="!text-amber-700 !border-amber-200 !bg-amber-50 hover:!bg-amber-100" onClick={() => setActiveTab('Rates')}>Unpublished changes</Button>
              ) : undefined}
            >
              <Tabs
                tabs={CHANNEL_TABS.map(tab => {
                  const count = tab === 'Overview' ? health[selectedAggregator.id]?.errors : undefined;
                  return { key: tab, label: tab, count: count ? count : undefined };
                })}
                value={activeTab}
                onChange={k => setActiveTab(k as ChannelTab)}
              />
              <div className="p-4 bg-slate-50/60 space-y-4">
                {activeTab === 'Overview' && (
                  <ChannelReadiness aggregator={selectedAggregator} fleet={fleet} validation={health[selectedAggregator.id]}
                    onNavigate={t => (t === 'API keys' ? setMode('keys') : setActiveTab(t))} />
                )}
                {activeTab === 'Overview' && (
                  <ChannelOverviewView
                    aggregator={selectedAggregator}
                    fleet={fleet}
                    stopSales={stopSalesFor(stopSales, selectedAggregator.id)}
                    validation={health[selectedAggregator.id]}
                    onNavigate={setActiveTab}
                  />
                )}
                {activeTab === 'Connection' && (
                  <>
                    <ConnectionProfileView aggregator={selectedAggregator} fleet={fleet} currentUserName={currentUserName}
                      onUpdate={handleUpdateAggregator} showConfirmation={showConfirmation} />
                    <ManageConnectionView aggregator={selectedAggregator} onUpdate={handleUpdateAggregator} showConfirmation={showConfirmation} />
                  </>
                )}
                {activeTab === 'Rates' && (
                  <ManageRatePlansView
                    aggregator={selectedAggregator}
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
                        aggregator={selectedAggregator}
                        refreshKey={deliveryRefresh}
                        sending={sending}
                        onSend={() => sendRates(selectedAggregator)}
                      />
                    </Panel>
                    <Panel padded>
                      <RateHistoryView aggregator={selectedAggregator} />
                    </Panel>
                  </>
                )}
                {activeTab === 'Extras' && (
                  <Panel padded>
                    <ManageAggregatorExtrasView aggregator={selectedAggregator} onUpdate={handleUpdateAggregator} globalExtras={availableExtras} />
                  </Panel>
                )}
                {activeTab === 'Terms & Conditions' && (
                  <Panel padded>
                    <ManageTermsView terms={selectedAggregator.termsAndConditions} onUpdate={terms => handleUpdateAggregator({ ...selectedAggregator, termsAndConditions: terms })} />
                  </Panel>
                )}
                {activeTab === 'Booking API' && (
                  <BookingApiView aggregator={selectedAggregator} fleet={fleet} rentalLocations={rentalLocations} onUpdate={handleUpdateAggregator} showConfirmation={showConfirmation} />
                )}
                {activeTab === 'Security' && <ChannelSecurityView aggregator={selectedAggregator} onUpdate={handleUpdateAggregator} showConfirmation={showConfirmation} />}
                {activeTab === 'Bookings' && <ChannelBookingsView aggregator={selectedAggregator} />}
                {activeTab === 'Traffic' && <TrafficView aggregator={selectedAggregator} />}
                {activeTab === 'Test console' && <ConsoleView aggregator={selectedAggregator} fleet={fleet} />}
                {activeTab === 'Go-live' && (
                  <GoLiveView aggregator={selectedAggregator} fleet={fleet} company={companyDetails || ({ name: 'NCT Rental' } as CompanyDetails)}
                    currentUserName={currentUserName} onUpdate={handleUpdateAggregator} showConfirmation={showConfirmation} />
                )}
                {activeTab === 'XML Feed' && (
                  <XMLPreviewView aggregator={selectedAggregator} fleet={fleet} stopSales={stopSalesFor(stopSales, selectedAggregator.id)} />
                )}
              </div>
            </Panel>
          ) : (
            <Panel>
              <EmptyState
                icon={<GlobeAltIcon />}
                title="No channels yet"
                hint="Add your first distribution partner to start publishing rates over XML."
                action={<Button variant="primary" icon={<PlusIcon className="w-4 h-4" />} onClick={() => setIsAddingPartner(true)}>Add Channel</Button>}
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
