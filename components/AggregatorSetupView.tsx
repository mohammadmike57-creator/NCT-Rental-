import React, { useEffect, useMemo, useState } from 'react';
import { Aggregator, Fleet, StopSale, AvailableExtra, RentalLocation, CompanyDetails } from '../types';
import { PlusIcon, TrashIcon, GlobeAltIcon, StopIcon, InboxIcon, KeyIcon, ChartBarIcon, PencilIcon, ServerIcon, CodeBracketIcon, CurrencyDollarIcon,
  ChartPieIcon, BoltIcon, SearchIcon, PlusCircleIcon, DocumentTextIcon, CloudIcon, PaperAirplaneIcon, ShieldCheckIcon, CalendarCheckIcon, ArrowPathIcon, DesktopComputerIcon, ClockIcon, DocumentReportIcon } from './icons';
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
import { saveAllData, deliverChannelRates, recordActivity, fetchChannelWebhooks, fetchChannelTrafficStats, fetchChannelBookings } from '../firebase/api';
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

type IconC = React.FC<{ className?: string }>;
/** Icon and one plain line for every channel section. */
const SECTION_INFO: Record<ChannelTab, { icon: IconC; text: string }> = {
  'Overview': { icon: ChartPieIcon, text: 'Setup progress, what the broker gets and anything that still needs attention.' },
  'Go-live': { icon: BoltIcon, text: 'Checklist, certification test and approval before the broker goes live.' },
  'Rates': { icon: CurrencyDollarIcon, text: 'Seasons, car groups and rental-length bands the broker is quoted.' },
  'Price rules': { icon: ChartBarIcon, text: 'This broker\'s own terms: markup or discount, minimum days, closed dates.' },
  'Extras': { icon: PlusCircleIcon, text: 'Extras sold on this channel, such as GPS, child seats or an extra driver.' },
  'Terms & Conditions': { icon: DocumentTextIcon, text: 'The rental terms sent with every quote and booking.' },
  'Connection': { icon: CloudIcon, text: 'The broker\'s contacts, connection profile and how they reach us.' },
  'Booking API': { icon: ServerIcon, text: 'Branches, booking rules, fees, cancellation and status updates to the broker.' },
  'Outbound': { icon: PaperAirplaneIcon, text: 'Rates, availability and bookings we send to the broker\'s own system.' },
  'Languages': { icon: GlobeAltIcon, text: 'Arabic texts for brokers that ask in Arabic.' },
  'Security': { icon: ShieldCheckIcon, text: 'Who is calling, failed sign-ins, IP limits and signed requests.' },
  'API v3': { icon: CodeBracketIcon, text: 'REST v3 clients with OAuth 2.0 and webhook subscriptions.' },
  'Bookings': { icon: CalendarCheckIcon, text: 'Every booking this broker made, live and sandbox.' },
  'Traffic': { icon: ArrowPathIcon, text: 'Every call with its request, answer and time taken.' },
  'Test console': { icon: DesktopComputerIcon, text: 'Send real test messages as the broker would.' },
  'Publish History': { icon: ClockIcon, text: 'Every published rate version and its delivery to the broker.' },
  'XML Feed': { icon: DocumentReportIcon, text: 'The rate sheet and messages exactly as the broker receives them.' },
};
/** Title band for the console-wide pages. */
const MODULE_INFO: Record<string, { icon: IconC; title: string; text: string }> = {
  dashboard: { icon: ChartBarIcon, title: 'Dashboard', text: 'Requests, bookings, revenue, errors and alerts across every broker.' },
  reservations: { icon: InboxIcon, title: 'XML reservations', text: 'Every booking received from the brokers, kept apart from your own reservations.' },
  rates: { icon: CurrencyDollarIcon, title: 'Rate rules', text: 'Seasons, events and last-minute pricing, calculated day by day.' },
  keys: { icon: KeyIcon, title: 'API keys', text: 'One key per broker. Only a fingerprint is stored; a key is shown once.' },
  multi: { icon: PencilIcon, title: 'Bulk editor', text: 'Change rates, extras, terms and policies for several brokers at once.' },
  stopsale: { icon: StopIcon, title: 'Stop sales', text: 'Close a car or a car group for some dates, for every broker or chosen ones.' },
  developer: { icon: CodeBracketIcon, title: 'Developer', text: 'Addresses, formats and samples for the brokers\' developers.' },
};
const AVATAR = ['bg-indigo-600', 'bg-sky-600', 'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-violet-600', 'bg-teal-600', 'bg-fuchsia-600'];
const avatarOf = (a: Aggregator) => {
  const key = a.channelCode || a.name;
  let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { bg: AVATAR[h % AVATAR.length], text: (a.channelCode || a.name).replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?' };
};
const Monogram: React.FC<{ a: Aggregator; size?: 'sm' | 'md' }> = ({ a, size = 'sm' }) => {
  const av = avatarOf(a);
  return <span className={`${av.bg} ${size === 'md' ? 'w-10 h-10 text-[13px]' : 'w-7 h-7 text-[10px]'} rounded-lg text-white font-bold inline-flex items-center justify-center shrink-0 tracking-wide`}>{av.text}</span>;
};

/** Live figures for one broker, last 7 days (shown in its header). */
const ChannelKpis: React.FC<{ a: Aggregator }> = ({ a }) => {
  const [k, setK] = useState<{ calls: number; errors: number; bookings: number; value: Record<string, number> } | null>(null);
  useEffect(() => {
    let on = true; setK(null);
    const since = Date.now() - 7 * 86400000;
    Promise.all([fetchChannelTrafficStats(a.id, 168).catch(() => null), fetchChannelBookings(a.id).catch(() => [])]).then(([st, bk]) => {
      if (!on) return;
      const live = (Array.isArray(bk) ? bk : []).filter(b => !b.sandbox && new Date(b.createdAt || 0).getTime() >= since);
      const value: Record<string, number> = {};
      live.filter(b => b.status !== 'CANCELLED' && b.status !== 'NO_SHOW').forEach(b => { value[b.currency || 'USD'] = (value[b.currency || 'USD'] || 0) + (b.total || 0); });
      setK({ calls: st && typeof st.calls === 'number' ? st.calls : 0, errors: st && typeof st.errors === 'number' ? st.errors : 0, bookings: live.length, value });
    });
    return () => { on = false; };
  }, [a.id]);
  const cells = [
    { l: 'Requests', v: k ? k.calls.toLocaleString() : '…' },
    { l: 'Bookings', v: k ? String(k.bookings) : '…' },
    { l: 'Booked value', v: k ? (Object.entries(k.value).map(([c, n]) => `${Math.round(n).toLocaleString()} ${c}`)[0] || '0') : '…' },
    { l: 'Error rate', v: k ? (k.calls ? `${((k.errors / k.calls) * 100).toFixed(1)}%` : '—') : '…', bad: !!k && k.calls > 0 && k.errors / k.calls > 0.05 },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100 border-t border-slate-100">
      {cells.map(c => (
        <div key={c.l} className="px-4 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{c.l} <span className="normal-case tracking-normal font-normal">· 7 days</span></p>
          <p className={`text-[16px] font-semibold tabular-nums ${c.bad ? 'text-rose-600' : 'text-slate-900'}`}>{c.v}</p>
        </div>
      ))}
    </div>
  );
};

type JumpItem = { id: string; label: string; hint: string; group: string; icon: IconC; run: () => void };
/** Ctrl/⌘ K: jump to any broker, section or page by typing. */
const QuickJump: React.FC<{ open: boolean; onClose: () => void; items: JumpItem[] }> = ({ open, onClose, items }) => {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  useEffect(() => { if (open) { setQ(''); setI(0); } }, [open]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = items.filter(it => words.every(w => `${it.label} ${it.hint} ${it.group}`.toLowerCase().includes(w))).slice(0, 12);
  if (!open) return null;
  const go = (it?: JumpItem) => { if (!it) return; it.run(); onClose(); };
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-[2px] flex items-start justify-center pt-[12vh] px-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden" onClick={e => e.stopPropagation()} role="dialog" aria-label="Quick search">
        <div className="flex items-center gap-2 px-4 border-b border-slate-100">
          <SearchIcon className="w-4 h-4 text-slate-400" />
          <input autoFocus value={q} onChange={e => { setQ(e.target.value); setI(0); }} placeholder="Search brokers, sections and pages…  e.g. “rates booking”"
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(list.length - 1, x + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(0, x - 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); go(list[i]); }
              else if (e.key === 'Escape') onClose();
            }}
            className="flex-1 h-12 text-[14px] outline-none bg-transparent" aria-label="Search" />
          <kbd className="text-[10px] font-mono text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul className="max-h-[55vh] overflow-y-auto py-1.5">
          {list.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-slate-500">Nothing matches “{q}”.</li>}
          {list.map((it, k) => { const I = it.icon; return (
            <li key={it.id}>
              <button type="button" onMouseEnter={() => setI(k)} onClick={() => go(it)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left ${k === i ? 'bg-indigo-50' : ''}`}>
                <span className={`w-8 h-8 rounded-lg inline-flex items-center justify-center ${k === i ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}><I className="w-4 h-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-slate-900 truncate">{it.label}</span><span className="block text-[11px] text-slate-500 truncate">{it.hint}</span></span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{it.group}</span>
              </button>
            </li>
          ); })}
        </ul>
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 flex gap-4"><span>↑ ↓ to move</span><span>Enter to open</span><span>Ctrl K / ⌘ K anywhere in OTA XML</span></div>
      </div>
    </div>
  );
};

const AmmanClock: React.FC = () => {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 30000); return () => clearInterval(i); }, []);
  return <span className="font-mono tabular-nums">{t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' })} Amman</span>;
};

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
  const [jumpOpen, setJumpOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setJumpOpen(o => !o); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Which workspace is open: one channel, the global stop sales, the multi-channel editor, or the XML reservations of all brokers.
  const [mode, setMode] = useState<'channels' | 'stopsale' | 'multi' | 'reservations' | 'keys' | 'dashboard' | 'developer' | 'rates'>('channels');
  /** Opens a section; on a phone also scrolls to it, so the content is not hidden below the header. */
  const openModule = (key: typeof mode) => {
    setMode(key);
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches) {
      setTimeout(() => document.getElementById('ota-module-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  };
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
  const jumpItems: JumpItem[] = [
    ...Object.entries(MODULE_INFO).map(([k, m]) => ({ id: `m-${k}`, label: m.title, hint: m.text, group: 'Page', icon: m.icon, run: () => setMode(k as typeof mode) })),
    ...aggregators.flatMap(a => [
      { id: `c-${a.id}`, label: a.name, hint: `${a.channelCode || ''} · ${STATUS_STYLE[channelStatus(a)].label} · open the broker`, group: 'Broker', icon: ServerIcon, run: () => openChannel(a.id, 'Overview') },
      ...TAB_GROUPS.flatMap(g => g.tabs.map(t => ({ id: `t-${a.id}-${t}`, label: `${TAB_LABEL[t] || t} — ${a.name}`, hint: SECTION_INFO[t].text, group: g.label, icon: SECTION_INFO[t].icon, run: () => openChannel(a.id, t) }))),
    ]),
    { id: 'add', label: 'Add channel', hint: 'Create a new broker connection', group: 'Action', icon: PlusIcon, run: () => setIsAddingPartner(true) },
  ];
  /** Small status hint next to a section in the broker menu. */
  const sectionHint = (a: Aggregator, t: ChannelTab): { text: string; tone: string } | null => {
    if (t === 'Go-live') return a.goLive?.approvedAt ? { text: 'Done', tone: 'bg-emerald-100 text-emerald-700' } : channelStatus(a) === 'active' ? null : { text: 'To do', tone: 'bg-slate-100 text-slate-500' };
    if (t === 'Connection') { const cs = connectionStateOf(a); return cs.tone === 'success' ? null : { text: cs.label.replace('Not connected', 'Not set'), tone: 'bg-slate-100 text-slate-500' }; }
    if (t === 'Booking API') return (a.bookingRules?.locations || []).length ? null : { text: 'No branches', tone: 'bg-amber-100 text-amber-700' };
    if (t === 'Extras') return (a.extras || []).length ? { text: String(a.extras!.length), tone: 'bg-slate-100 text-slate-500' } : null;
    return null;
  };
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
      <header className="rounded-xl bg-slate-900 text-white shadow-sm overflow-hidden relative"
        style={{ backgroundImage: 'radial-gradient(1200px 260px at 85% -40%, rgba(99,102,241,0.35), transparent 60%), radial-gradient(600px 200px at 0% 120%, rgba(14,165,233,0.18), transparent 60%), linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)', backgroundSize: 'auto, auto, 28px 28px, 28px 28px' }}>
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
            <span className="hidden xl:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-white/5 ring-1 ring-inset ring-white/10 text-[11px] font-medium text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /><AmmanClock />
            </span>
            <span className="hidden 2xl:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-white/5 ring-1 ring-inset ring-white/10 text-[11px] font-medium text-slate-300">
              <span className="font-mono">OTA 2003/05 · 2018A · 2024A</span><span className="text-slate-600">|</span><span className="font-mono">REST v3</span>
            </span>
            <button type="button" onClick={() => setJumpOpen(true)} aria-label="Quick search"
              className="h-9 pl-3 pr-2 rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-inset ring-white/15 text-slate-200 text-[13px] hidden sm:inline-flex items-center gap-2 min-w-[180px]">
              <SearchIcon className="w-4 h-4 text-slate-400" /><span className="flex-1 text-left text-slate-400">Jump to…</span>
              <kbd className="text-[10px] font-mono text-slate-400 border border-white/15 rounded px-1.5 py-0.5">Ctrl K</kbd>
            </button>
            <button type="button" onClick={() => setIsAddingPartner(true)}
              className="h-9 px-3.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-[13px] font-semibold inline-flex items-center gap-2 shadow-sm whitespace-nowrap">
              <PlusIcon className="w-4 h-4" />Add channel
            </button>
          </div>
        </div>
        <dl className="grid grid-cols-3 xl:grid-cols-6 border-t border-white/10 divide-x divide-white/10">
          {statusCells.map(c => (
            <div key={c.label} className="px-2.5 py-2 sm:px-5 sm:py-2.5 min-w-0 max-xl:border-b max-xl:border-white/10">
              <dt className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">{c.label}</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 sm:gap-2 text-[12px] sm:text-[14px] font-semibold tabular-nums truncate">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cellDot[c.tone]}`} />{c.value}
              </dd>
            </div>
          ))}
        </dl>
        {/* Phones: every section visible at once, no sideways scrolling */}
        <nav className="md:hidden grid grid-cols-4 gap-1 p-2 border-t border-white/10 bg-slate-950/40" aria-label="OTA XML sections (phone)">
          {MODULES.map(([key, label, Icon, count]) => (
            <button key={key} type="button" onClick={() => openModule(key)} aria-current={mode === key ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 h-14 rounded-lg px-1 text-[10.5px] font-medium leading-tight text-center transition-colors ${mode === key ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-white/10'}`}>
              <Icon className="w-[18px] h-[18px]" /><span className="line-clamp-2">{label}</span>
              {count !== undefined && <span className={`absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold leading-4 tabular-nums ${key === 'stopsale' ? 'bg-rose-500 text-white' : 'bg-white/20 text-white'}`}>{count}</span>}
            </button>
          ))}
        </nav>
        <nav className="hidden md:flex px-3 gap-0.5 overflow-x-auto no-scrollbar border-t border-white/10 bg-slate-950/40" aria-label="OTA XML sections">
          {MODULES.map(([key, label, Icon, count]) => (
            <button key={key} type="button" onClick={() => openModule(key)} aria-current={mode === key ? 'page' : undefined}
              className={`h-11 px-3 inline-flex items-center gap-2 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ${mode === key ? 'border-indigo-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-100'}`}>
              <Icon className="w-4 h-4" />{label}
              {count !== undefined && <span className={`px-1.5 py-px rounded text-[10px] font-semibold tabular-nums ${key === 'stopsale' ? 'bg-rose-500/20 text-rose-200' : 'bg-white/10 text-slate-300'}`}>{count}</span>}
            </button>
          ))}
        </nav>
      </header>

      {failedUpdates.length > 0 && mode !== 'dashboard' && (
        <div className="rounded-lg border border-rose-200 bg-white px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2 shadow-sm" role="alert">
          <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-rose-600 text-white text-[11px] font-bold uppercase tracking-wide">Action needed</span>
          <p className="text-[13px] text-slate-700 flex-1 min-w-[200px] basis-full sm:basis-auto">
            Status updates are not reaching {failedUpdates.map(f => `${f.name} (${f.count})`).join(', ')}.
          </p>
          {failedUpdates.map(f => <Button key={f.id} size="sm" onClick={() => openChannel(f.id, 'Booking API')}>Fix in {f.name} →</Button>)}
        </div>
      )}

      <div id="ota-module-top" className="scroll-mt-20" />
      {mode !== 'channels' && mode !== 'rates' && MODULE_INFO[mode] && (() => { const m = MODULE_INFO[mode]; const I = m.icon; return (
        <section className="flex items-center gap-3 px-1">
          <span className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm inline-flex items-center justify-center text-indigo-600"><I className="w-5 h-5" /></span>
          <div className="min-w-0"><h3 className="text-[18px] font-semibold text-slate-900 leading-tight">{m.title}</h3><p className="text-[13px] text-slate-500">{m.text}</p></div>
        </section>
      ); })()}

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
                        <div className="flex items-center gap-2.5">
                          <span className="relative"><Monogram a={agg} /><span className={`absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${st.dot}`} title={st.label} /></span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[13px] font-semibold truncate ${selected ? 'text-indigo-900' : 'text-slate-800'}`}>{agg.name}</span>
                            <span className="block text-[11px] text-slate-500 truncate">{st.label}{agg.channelCode ? ` · ${agg.channelCode}` : ''}</span>
                          </span>
                        </div>
                        <div className="mt-1 pl-[38px] flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
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
                              {(() => { const I = SECTION_INFO[t].icon; return <I className={`w-4 h-4 shrink-0 ${on ? 'text-indigo-600' : 'text-slate-400'}`} />; })()}
                              <span className="truncate">{TAB_LABEL[t] || t}</span>
                              {t === 'Overview' && errors ? <span className="ml-auto px-1.5 py-px rounded bg-rose-100 text-rose-700 text-[10px] font-semibold tabular-nums">{errors}</span> : null}
                              {t === 'Rates' && hasUnpublishedChanges(sel) ? <span className="ml-auto px-1.5 py-px rounded bg-amber-100 text-amber-700 text-[10px] font-semibold">Draft</span> : null}
                              {(() => { const h = sectionHint(sel, t); return h ? <span className={`ml-auto px-1.5 py-px rounded text-[10px] font-semibold ${h.tone}`}>{h.text}</span> : null; })()}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </nav>
                <label className="lg:hidden block rounded-xl border border-slate-200 bg-white px-3 pt-2 pb-2.5 shadow-sm">
                <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Section of {sel?.name || 'this channel'} · tap to change</span>
                <select className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-[14px] font-semibold text-slate-900" value={activeTab}
                  onChange={e => setActiveTab(e.target.value as ChannelTab)} aria-label="Channel section">
                  {TAB_GROUPS.map(g => (
                    <optgroup key={g.label} label={g.label}>
                      {g.tabs.map(t => <option key={t} value={t}>{TAB_LABEL[t] || t}</option>)}
                    </optgroup>
                  ))}
                </select>
                </label>
              </>
            )}
          </aside>

          {/* Workspace */}
          {sel ? (
            <div className="min-w-0 space-y-4">
              <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                <Monogram a={sel} size="md" />
                <div className="min-w-0">
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
              </div>
              <div className="px-4 py-2 border-t border-slate-100 flex flex-wrap items-center gap-2 bg-slate-50/60">
                <nav className="flex items-center gap-1.5 text-[12px] text-slate-500 min-w-0 flex-1 basis-full sm:basis-auto overflow-hidden whitespace-nowrap" aria-label="Breadcrumb">
                  <button type="button" className="hover:text-indigo-700" onClick={() => setMode('channels')}>Channels</button><span className="text-slate-300">›</span>
                  <button type="button" className="hover:text-indigo-700 truncate" onClick={() => setActiveTab('Overview')}>{sel.name}</button><span className="text-slate-300">›</span>
                  <span>{groupOf(activeTab).label}</span>{groupOf(activeTab).label !== activeTab && <><span className="text-slate-300">›</span><span className="font-semibold text-slate-800">{TAB_LABEL[activeTab] || activeTab}</span></>}
                </nav>
                {([['Rates', 'Rates'], ['Test console', 'Test console'], ['Traffic', 'Traffic'], ['Go-live', 'Go-live']] as [ChannelTab, string][]).filter(([t]) => t !== activeTab).map(([t, l]) => {
                  const I = SECTION_INFO[t].icon;
                  return <button key={t} type="button" onClick={() => setActiveTab(t)} className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700 inline-flex items-center gap-1.5"><I className="w-3.5 h-3.5" />{l}</button>;
                })}
              </div>
              <ChannelKpis a={sel} />
              </section>

              {(() => { const info = SECTION_INFO[activeTab]; const I = info.icon; return (
                <div className="flex items-center gap-3 px-1">
                  <span className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 inline-flex items-center justify-center"><I className="w-5 h-5" /></span>
                  <div className="min-w-0"><p className="text-[16px] font-semibold text-slate-900 leading-tight">{TAB_LABEL[activeTab] || activeTab}</p><p className="text-[12px] text-slate-500">{info.text}</p></div>
                </div>
              ); })()}

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

      <QuickJump open={jumpOpen} onClose={() => setJumpOpen(false)} items={jumpItems} />

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
