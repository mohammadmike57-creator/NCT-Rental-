import React, { useMemo, useState } from 'react';
import { Aggregator, Fleet, StopSale, AvailableExtra } from '../types';
import { PlusIcon, TrashIcon, GlobeAltIcon, StopIcon, ShieldCheckIcon, CloudIcon, BoltIcon, AlertIcon } from './icons';
import ManageRatePlansView from './ManageRatePlansView';
import ManageTermsView from './ManageTermsView';
import ManageConnectionView from './ManageConnectionView';
import ManageAggregatorExtrasView from './ManageAggregatorExtrasView';
import ManageStopSaleView from './ManageStopSaleView';
import XMLPreviewView from './XMLPreviewView';
import RateHistoryView from './RateHistoryView';
import ChannelOverviewView from './ChannelOverviewView';
import ChannelDeliveryLogView from './ChannelDeliveryLogView';
import { saveAllData, deliverChannelRates } from '../firebase/api';
import { channelStatus, hasUnpublishedChanges, submissionVersion, validateChannel, todayIso } from '../services/channelManager';

interface AggregatorSetupViewProps {
  aggregators: Aggregator[];
  onUpdateAggregators: (aggregators: Aggregator[]) => void;
  fleet: Fleet;
  availableExtras: AvailableExtra[];
  stopSales: StopSale[];
  onUpdateStopSales: (stopSales: StopSale[]) => void;
  showConfirmation: (message: string) => void;
  currentUserName?: string;
}

export type ChannelTab = 'Overview' | 'Connection' | 'Rates' | 'Extras' | 'Terms & Conditions' | 'Publish History' | 'XML Feed';
const CHANNEL_TABS: ChannelTab[] = ['Overview', 'Rates', 'Connection', 'Extras', 'Terms & Conditions', 'Publish History', 'XML Feed'];

const STATUS_STYLE: Record<string, { dot: string; label: string; pill: string }> = {
  active: { dot: 'bg-emerald-400', label: 'Live', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  testing: { dot: 'bg-amber-400', label: 'Testing', pill: 'bg-amber-50 text-amber-700 border-amber-200' },
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

const Kpi: React.FC<{ label: string; value: React.ReactNode; hint?: string; icon: React.ReactNode; tone?: string }> = ({ label, value, hint, icon, tone = 'text-slate-500 bg-slate-100' }) => (
  <div className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl min-w-0">
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>{icon}</div>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">{label}</p>
      <p className="text-lg font-bold text-slate-800 leading-tight">{value}</p>
      {hint && <p className="text-[11px] text-slate-400 truncate">{hint}</p>}
    </div>
  </div>
);

const AggregatorSetupView: React.FC<AggregatorSetupViewProps> = ({
  aggregators, onUpdateAggregators, fleet, availableExtras, stopSales, onUpdateStopSales, showConfirmation, currentUserName,
}) => {
  const [selectedAggregatorId, setSelectedAggregatorId] = useState<string | null>(aggregators.length > 0 ? aggregators[0].id : null);
  const [isAddingPartner, setIsAddingPartner] = useState(false);
  const [newAggregatorName, setNewAggregatorName] = useState('');
  const [newChannelCode, setNewChannelCode] = useState('');
  const [activeTab, setActiveTab] = useState<ChannelTab>('Overview');
  const [showStopSale, setShowStopSale] = useState(false);
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
    };
    onUpdateAggregators([...aggregators, newAggregator]);
    setNewAggregatorName('');
    setNewChannelCode('');
    setIsAddingPartner(false);
    setSelectedAggregatorId(newAggregator.id);
    setActiveTab('Connection');
    showConfirmation(`Channel ${name} created in testing mode. Configure the connection to go live.`);
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

  const selectChannel = (id: string) => {
    setSelectedAggregatorId(id);
    setShowStopSale(false);
    setActiveTab('Overview');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] bg-slate-50 border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 shrink-0 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <GlobeAltIcon className="text-primary w-6 h-6" /> Channel Manager
            </h2>
            <p className="text-xs text-slate-500 mt-1">OTA XML distribution — rates, availability, extras and stop sales for every partner.</p>
          </div>
          <button
            onClick={() => setShowStopSale(s => !s)}
            className={`self-start sm:self-auto flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all border ${showStopSale ? 'bg-red-600 text-white border-red-600 shadow' : 'bg-white text-slate-600 border-slate-200 hover:border-red-300 hover:text-red-600'}`}
          >
            <StopIcon className="w-4 h-4" /> Global Stop Sale
            {activeStopSales > 0 && <span className={`ml-1 px-1.5 rounded-full text-[11px] ${showStopSale ? 'bg-white/20' : 'bg-red-100 text-red-700'}`}>{activeStopSales}</span>}
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Live channels" value={`${liveChannels} / ${aggregators.length}`} hint="connected partners" icon={<CloudIcon className="w-5 h-5" />} tone="text-emerald-600 bg-emerald-50" />
          <Kpi label="Unpublished" value={pendingChannels} hint={pendingChannels ? 'channels with rate changes' : 'all channels in sync'} icon={<BoltIcon className="w-5 h-5" />} tone={pendingChannels ? 'text-amber-600 bg-amber-50' : 'text-slate-500 bg-slate-100'} />
          <Kpi label="Needs attention" value={attention} hint={attention ? 'channels with blocking errors' : 'no blocking errors'} icon={<AlertIcon className="w-5 h-5" />} tone={attention ? 'text-red-600 bg-red-50' : 'text-slate-500 bg-slate-100'} />
          <Kpi label="Last publish" value={relativeTime(lastPublish)} hint={`${activeStopSales} stop sale${activeStopSales === 1 ? '' : 's'} active today`} icon={<ShieldCheckIcon className="w-5 h-5" />} tone="text-blue-600 bg-blue-50" />
        </div>
      </div>

      {showStopSale ? (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
          <div className="max-w-6xl mx-auto">
            <ManageStopSaleView stopSales={stopSales} onUpdate={onUpdateStopSales} fleet={fleet} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Channel list */}
          <aside className="w-full md:w-72 bg-white border-b md:border-b-0 md:border-r border-slate-200 flex flex-col shrink-0 max-h-64 md:max-h-none">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Channels</h3>
              <span className="text-[11px] text-slate-400">{aggregators.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {aggregators.map(agg => {
                const selected = selectedAggregator?.id === agg.id;
                const st = STATUS_STYLE[channelStatus(agg)];
                const h = health[agg.id];
                const pending = hasUnpublishedChanges(agg);
                const latest = (agg.ratePlanHistory || [])[0];
                return (
                  <div
                    key={agg.id}
                    onClick={() => selectChannel(agg.id)}
                    className={`group relative p-3 rounded-lg cursor-pointer transition-all border ${selected ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-700 border-slate-100 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center gap-2 pr-6">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.dot}`} title={st.label}></span>
                      <span className="font-semibold truncate text-sm">{agg.name}</span>
                      {agg.channelCode && <span className={`ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded ${selected ? 'bg-white/10 text-slate-200' : 'bg-slate-100 text-slate-500'}`}>{agg.channelCode}</span>}
                    </div>
                    <div className={`mt-1.5 flex items-center gap-2 text-[11px] ${selected ? 'text-slate-300' : 'text-slate-400'}`}>
                      <span>{latest ? `v${submissionVersion(agg, 0)} · ${relativeTime(latest.submittedAt)}` : 'never published'}</span>
                      {pending && <span className="px-1.5 rounded bg-amber-400/20 text-amber-500 font-semibold">changes</span>}
                      {h && h.errors > 0 && <span className="px-1.5 rounded bg-red-500/15 text-red-500 font-semibold">{h.errors} error{h.errors > 1 ? 's' : ''}</span>}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteAggregator(agg); }}
                      title={`Delete ${agg.name}`}
                      className={`absolute right-2 top-2.5 p-1.5 rounded-md transition-all ${selected ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-300 hover:text-red-600 hover:bg-red-50 md:opacity-0 md:group-hover:opacity-100'}`}
                    >
                      <TrashIcon className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}

              {isAddingPartner ? (
                <div className="p-3 bg-slate-50 border border-blue-200 rounded-lg space-y-2">
                  <input
                    type="text"
                    value={newAggregatorName}
                    onChange={e => setNewAggregatorName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddAggregator()}
                    placeholder="Channel name, e.g. Rentalcars"
                    className="w-full p-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={newChannelCode}
                    onChange={e => setNewChannelCode(e.target.value.toUpperCase().slice(0, 8))}
                    placeholder="Code (optional), e.g. RCS"
                    className="w-full p-2 text-sm font-mono border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddAggregator} disabled={!newAggregatorName.trim()} className="flex-1 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 disabled:bg-slate-300">Create</button>
                    <button onClick={() => setIsAddingPartner(false)} className="flex-1 py-1.5 bg-white border border-slate-300 text-slate-600 text-xs font-bold rounded hover:bg-slate-100">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingPartner(true)}
                  className="w-full py-3 border border-dashed border-slate-300 rounded-lg text-slate-500 text-sm font-medium hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
                >
                  <PlusIcon className="w-4 h-4" /> Add Channel
                </button>
              )}
            </div>
          </aside>

          {/* Channel workspace */}
          <main className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
            {selectedAggregator ? (
              <>
                <div className="bg-white border-b border-slate-200 px-4 sm:px-6 pt-3 shrink-0">
                  <div className="flex items-center gap-2 mb-2 min-w-0">
                    <h3 className="text-base font-bold text-slate-800 truncate">{selectedAggregator.name}</h3>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[channelStatus(selectedAggregator)].pill}`}>
                      {STATUS_STYLE[channelStatus(selectedAggregator)].label}
                    </span>
                    {hasUnpublishedChanges(selectedAggregator) && (
                      <button onClick={() => setActiveTab('Rates')} className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100">
                        Unpublished changes
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mb-px">
                    {CHANNEL_TABS.map(tab => {
                      const count = tab === 'Overview' ? health[selectedAggregator.id]?.errors : undefined;
                      return (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`px-3 sm:px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all border-b-2 ${activeTab === tab ? 'border-primary text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                        >
                          {tab}
                          {!!count && <span className="ml-1.5 px-1.5 rounded-full bg-red-100 text-red-700 text-[11px]">{count}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                  <div className="max-w-6xl mx-auto space-y-6">
                    {activeTab === 'Overview' && (
                      <ChannelOverviewView
                        aggregator={selectedAggregator}
                        fleet={fleet}
                        stopSales={stopSales}
                        validation={health[selectedAggregator.id]}
                        onNavigate={setActiveTab}
                      />
                    )}
                    {activeTab === 'Connection' && (
                      <ManageConnectionView aggregator={selectedAggregator} onUpdate={handleUpdateAggregator} showConfirmation={showConfirmation} />
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
                        <div className="bg-white p-4 sm:p-8 rounded-xl shadow-sm border border-slate-200">
                          <ChannelDeliveryLogView
                            aggregator={selectedAggregator}
                            refreshKey={deliveryRefresh}
                            sending={sending}
                            onSend={() => sendRates(selectedAggregator)}
                          />
                        </div>
                        <div className="bg-white p-4 sm:p-8 rounded-xl shadow-sm border border-slate-200">
                          <RateHistoryView aggregator={selectedAggregator} />
                        </div>
                      </>
                    )}
                    {activeTab === 'Extras' && (
                      <div className="bg-white p-4 sm:p-8 rounded-xl shadow-sm border border-slate-200">
                        <ManageAggregatorExtrasView aggregator={selectedAggregator} onUpdate={handleUpdateAggregator} globalExtras={availableExtras} />
                      </div>
                    )}
                    {activeTab === 'Terms & Conditions' && (
                      <div className="bg-white p-4 sm:p-8 rounded-xl shadow-sm border border-slate-200">
                        <ManageTermsView terms={selectedAggregator.termsAndConditions} onUpdate={terms => handleUpdateAggregator({ ...selectedAggregator, termsAndConditions: terms })} />
                      </div>
                    )}
                    {activeTab === 'XML Feed' && (
                      <XMLPreviewView aggregator={selectedAggregator} fleet={fleet} stopSales={stopSales} />
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                  <GlobeAltIcon className="w-10 h-10 text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-700">No channels yet</h3>
                <p className="text-sm mt-2 max-w-xs">Add your first distribution partner to start publishing rates over XML.</p>
                <button onClick={() => setIsAddingPartner(true)} className="mt-4 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark">Add Channel</button>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
};

export default AggregatorSetupView;
