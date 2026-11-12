import React from 'react';
import { Aggregator, Fleet } from '../../types';
import { hasUnpublishedChanges, ValidationResult } from '../../services/channelManager';
import type { ChannelTab } from '../AggregatorSetupView';
import { Panel, Badge } from '../ui/Crm';
import { CheckCircleIcon } from '../icons';

export interface ReadinessStep { id: string; label: string; detail: string; done: boolean; required: boolean; tab: ChannelTab | 'API keys' }

/** What still has to be done before the integration guide and key go to the broker, and before go-live. */
export function readinessSteps(a: Aggregator, fleet: Fleet, validation: ValidationResult): ReadinessStep[] {
  const r = a.bookingRules;
  const locs = r?.locations || [];
  const published = (a.ratePlanHistory || [])[0]?.ratePlans || [];
  const groups = [...new Set(published.flatMap(p => (p.sippRates || []).map(s => s.sippCode.toUpperCase())))];
  const pictured = groups.filter(g => r?.groupDetails?.[g]?.pictureUrl || fleet.some(v => (v.sippCode || '').toUpperCase() === g && (v as { imageUrl?: string }).imageUrl));
  const cp = a.connectionProfile?.state || 'not_connected';
  const locDetail = locs.filter(l => l.phone && l.latitude != null && l.longitude != null);
  return [
    { id: 'identity', label: 'Codes and currency', detail: `Channel ${a.channelCode || '—'}, supplier ${a.vendorCode || 'URD'}, ${a.currency || 'USD'}${a.commissionPercent != null ? `, ${a.commissionPercent}% commission` : ''}`,
      done: !!a.channelCode && !!a.currency, required: true, tab: 'Connection' },
    { id: 'contact', label: 'Broker contact and connection profile', detail: a.contactEmail ? `${a.contactEmail} · ${cp.replace(/_/g, ' ')}` : 'Add the broker\'s connectivity email and fill the connection profile',
      done: !!a.contactEmail && !!a.connectionProfile?.format, required: false, tab: 'Connection' },
    { id: 'branches', label: 'Branches', detail: locs.length ? `${locs.length} branch${locs.length === 1 ? '' : 'es'}: ${locs.map(l => l.code).join(', ')}` : 'Add the branches this broker sells',
      done: locs.length > 0, required: true, tab: 'Booking API' },
    { id: 'branch-details', label: 'Branch phone, map position and hours', detail: locs.length ? `${locDetail.length} of ${locs.length} complete` : 'After adding branches',
      done: locs.length > 0 && locDetail.length === locs.length, required: false, tab: 'Booking API' },
    { id: 'rules', label: 'Booking rules saved', detail: r ? `Free cancellation ${r.freeCancellationHours ?? 48} h · age ${r.minDriverAge ?? 21}+ · ${r.timeZone || 'Asia/Amman'}` : 'Open Booking API and click Save',
      done: !!r, required: true, tab: 'Booking API' },
    { id: 'rates', label: 'Rates published', detail: published.length ? `${published.length} period${published.length === 1 ? '' : 's'}, ${groups.length} car group${groups.length === 1 ? '' : 's'}${hasUnpublishedChanges(a) ? ' · unpublished changes waiting' : ''}` : 'Build and publish rates',
      done: published.length > 0 && !hasUnpublishedChanges(a) && validation.errors === 0, required: true, tab: 'Rates' },
    { id: 'pictures', label: 'Car pictures', detail: groups.length ? `${pictured.length} of ${groups.length} groups have a picture` : 'After publishing rates',
      done: groups.length > 0 && pictured.length === groups.length, required: false, tab: 'Booking API' },
    { id: 'terms', label: 'Rental terms and extras', detail: `${(a.termsAndConditions || '').trim().length >= 20 ? 'Terms set' : 'Terms missing'} · ${(a.extras || []).length} extra${(a.extras || []).length === 1 ? '' : 's'}`,
      done: (a.termsAndConditions || '').trim().length >= 20, required: false, tab: 'Terms & Conditions' },
    { id: 'key', label: 'API key created', detail: a.feedKeyHash ? `Key …${a.feedKeyHint}${a.testKeyHash ? ` · test key …${a.testKeyHint}` : ''}` : 'Create the key (API keys) and send it securely',
      done: !!a.feedKeyHash, required: true, tab: 'API keys' },
    { id: 'certified', label: 'Broker certified', detail: a.connectionProfile?.certifiedAt ? `By ${a.connectionProfile.certifiedBy} on ${a.connectionProfile.certifiedAt.slice(0, 10)}` : 'After the broker has tested in the sandbox',
      done: cp === 'broker_certified' || cp === 'live', required: false, tab: 'Connection' },
    { id: 'live', label: 'Live', detail: a.goLive?.approvedAt ? `Approved by ${a.goLive.approvedBy} on ${a.goLive.approvedAt.slice(0, 10)}` : 'Go-live tab: checklist, certification, approve',
      done: a.status === 'active' && !!a.goLive?.approvedAt, required: false, tab: 'Go-live' },
  ];
}

/** Setup progress for one channel, with a link to the tab for each step. */
const ChannelReadiness: React.FC<{ aggregator: Aggregator; fleet: Fleet; validation: ValidationResult; onNavigate: (tab: ChannelTab | 'API keys') => void }> =
  ({ aggregator, fleet, validation, onNavigate }) => {
    const steps = readinessSteps(aggregator, fleet, validation);
    const required = steps.filter(s => s.required);
    const readyToSend = required.every(s => s.done);
    const done = steps.filter(s => s.done).length;
    return (
      <Panel title={<span className="flex items-center gap-2">Setup <Badge tone={readyToSend ? 'success' : 'warning'}>{readyToSend ? 'Ready to send to the broker' : `${required.filter(s => !s.done).length} required step${required.filter(s => !s.done).length === 1 ? '' : 's'} left`}</Badge></span>}
        subtitle={`${done} of ${steps.length} done. Required steps come first; the others make the listing complete.`}>
        <div className="h-1.5 bg-slate-100"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
        <ol className="divide-y divide-slate-100">
          {steps.map((s, i) => (
            <li key={s.id} className="px-4 py-2.5 flex items-center gap-3">
              <span className={`w-6 h-6 shrink-0 rounded-full inline-flex items-center justify-center text-[11px] font-semibold ${s.done ? 'bg-emerald-100 text-emerald-700' : s.required ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200' : 'bg-slate-100 text-slate-500'}`}>
                {s.done ? <CheckCircleIcon className="w-4 h-4" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-slate-900">{s.label}{s.required && !s.done && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-rose-600">required</span>}</p>
                <p className="text-xs text-slate-500 truncate">{s.detail}</p>
              </div>
              <button type="button" onClick={() => onNavigate(s.tab)} className="text-xs font-semibold text-indigo-600 hover:underline shrink-0">{s.done ? 'View' : 'Open'}</button>
            </li>
          ))}
        </ol>
      </Panel>
    );
  };

export default ChannelReadiness;
