import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Aggregator, Fleet, StopSale } from '../../types';
import type { ChannelTab } from '../AggregatorSetupView';
import { fetchChannelTraffic, fetchChannelTrafficMessage, ChannelTrafficRow } from '../../services/api';
import { findPlanForDate, findTier, fleetSippCodes, hasUnpublishedChanges, publishedView, todayIso, vehiclesForSipp } from '../../services/channelManager';
import { displayDay, displayStamp } from '../../services/displayDate';
import { Panel, Button } from '../ui/Crm';

type Tone = 'danger' | 'warning' | 'ok' | 'info';
interface Finding { tone: Tone; title: string; detail?: React.ReactNode; tab?: ChannelTab; action?: string }

/** What each error code means for the person fixing it. */
const ERROR_HELP: Record<string, { text: string; tab?: ChannelTab }> = {
  AUTH_FAILED: { text: 'The broker sends a wrong or old API key. Give them the current key from the API keys screen.', tab: 'Connection' },
  INVALID_LOCATION: { text: 'The broker asks for a branch code that is not set up. Add that code to the branch on the Booking API tab, or ask the broker to use your code.', tab: 'Booking API' },
  INVALID_DATE: { text: 'Dates outside the rules: lead time, opening hours, minimum or maximum rental length (Booking API tab).', tab: 'Booking API' },
  INVALID_VEHICLE_GROUP: { text: 'The broker asks for a car group (SIPP) you do not sell on this channel.', tab: 'Rates' },
  INVALID_REQUEST: { text: 'The broker\'s message is missing something or has a wrong value; the message log shows which.' },
  POLICY_VIOLATION: { text: 'The search or booking breaks a rental rule, such as the driver\'s age.', tab: 'Booking API' },
  PERMISSION_DENIED: { text: 'Live or test access is switched off for this broker, or the operation is not allowed.', tab: 'Connection' },
  RATE_LIMIT_EXCEEDED: { text: 'The broker sends more requests per minute than allowed (Booking API tab).', tab: 'Booking API' },
  NO_AVAILABILITY: { text: 'No free car or no published rate for those dates.', tab: 'Rates' },
  PRICE_CHANGED: { text: 'The broker booked with an old price; it should search again.' },
  OFFER_EXPIRED: { text: 'The broker booked an offer that had expired; it should search again.' },
  RESERVATION_NOT_FOUND: { text: 'The broker asked for a booking number we do not have.' },
  SYSTEM_ERROR: { text: 'An error on our side. Send the request ID from the message log to support.' },
};

const attr = (xml: string, name: string) => (new RegExp(`${name}="([^"]+)"`).exec(xml) || [])[1];
const inner = (xml: string, tag: string) => (new RegExp(`<(?:\\w+:)?${tag}>([^<]*)</`).exec(xml) || [])[1];

/** The broker's last real search and what our answer contained. */
interface LastSearch { at: string; location?: string; pickUp?: string; dropOff?: string; groups: number; available: number; warnings: string[]; closed: string[]; error?: string }

function readSearch(row: ChannelTrafficRow, req = '', res = ''): LastSearch {
  const pickUp = attr(req, 'PickUpDateTime') || inner(req, 'PickupDateTime') || (/"pickup_at"\s*:\s*"([^"]+)"/.exec(req) || [])[1];
  const dropOff = attr(req, 'ReturnDateTime') || inner(req, 'ReturnDateTime') || (/"return_at"\s*:\s*"([^"]+)"/.exec(req) || [])[1];
  const location = (/<(?:\w+:)?PickUpLocation[^>]*LocationCode="([^"]+)"/.exec(req) || [])[1] || inner(req, 'PickupLocationCode') || (/"pickup_location"\s*:\s*"([^"]+)"/.exec(req) || [])[1];
  const groups = (res.match(/<(?:\w+:)?VehAvail>/g) || []).length || (res.match(/"vehicle_group"/g) || []).length;
  const available = (res.match(/Status="Available"/g) || []).length || (res.match(/"status"\s*:\s*"Available"/g) || []).length;
  const warnings = [...res.matchAll(/<(?:\w+:)?Warning\b[^>]*ShortText="([^"]+)"/g)].map(m => m[1]);
  // Why each car group was closed (OTA ClosedReason, native ClosedReason, JSON closed_reason).
  const closed = Array.from(new Set([...res.matchAll(/<(?:\w+:)?ClosedReason>([^<]+)</g), ...res.matchAll(/"closed_reason"\s*:\s*"([^"]+)"/g)].map(m => m[1])));
  return { at: row.createdAt, location, pickUp, dropOff, groups, available, warnings, closed, error: row.success ? undefined : `${row.errorCode}: ${row.errorMessage || ''}` };
}

const TONE: Record<Tone, { dot: string; ring: string; label: string }> = {
  danger: { dot: 'bg-rose-500', ring: 'bg-rose-50/60', label: 'Fix' },
  warning: { dot: 'bg-amber-500', ring: 'bg-amber-50/50', label: 'Check' },
  info: { dot: 'bg-sky-500', ring: '', label: 'Note' },
  ok: { dot: 'bg-emerald-500', ring: '', label: 'OK' },
};

/**
 * "What the broker sees": checks the published rates, the fleet and the branches against what the broker
 * actually asked for in the last 7 days, and says in plain words why cars or rates may not show on its side.
 */
const BrokerVisibilityCheck: React.FC<{ aggregator: Aggregator; fleet: Fleet; stopSales: StopSale[]; onNavigate: (tab: ChannelTab) => void }> = ({ aggregator: a, fleet, stopSales, onNavigate }) => {
  const [traffic, setTraffic] = useState<ChannelTrafficRow[] | null>(null);
  const [last, setLast] = useState<LastSearch | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const rows = await fetchChannelTraffic(a.id, { hours: 168, limit: 500 });
      setTraffic(rows);
      const search = rows.find(r => !r.sandbox && /AvailRate|availability|Availability/i.test(r.operation));
      if (search) {
        try {
          const m = await fetchChannelTrafficMessage(a.id, search.id);
          setLast(readSearch(search, m.requestBody || '', m.responseBody || ''));
        } catch { setLast(readSearch(search)); }
      } else setLast(null);
    } catch { setLoadError(true); setTraffic([]); }
  }, [a.id]);
  useEffect(() => { load(); }, [load]);

  const findings = useMemo<Finding[]>(() => {
    const out: Finding[] = [];
    const published = publishedView(a).currentRatePlans || [];
    const today = todayIso();
    // 1. Published at all, and nothing waiting
    if (!(a.ratePlanHistory || []).length) out.push({ tone: 'danger', title: 'No rates are published', detail: 'The broker gets no cars until rates are published. Add rates and press Publish.', tab: 'Rates', action: 'Open Rates' });
    else if (hasUnpublishedChanges(a)) out.push({ tone: 'danger', title: 'Your latest rate changes are not published', detail: 'The broker still gets the previous version. Press Re-publish on the Rates tab.', tab: 'Rates', action: 'Open Rates' });
    // 2. Dates covered
    if (published.length) {
      const live = published.filter(p => p.endDate >= today);
      if (!live.length) out.push({ tone: 'danger', title: 'Every published rate period has ended', detail: `The last one ended ${displayDay(published.map(p => p.endDate).sort().slice(-1)[0])}. Add a period that covers the coming dates.`, tab: 'Rates', action: 'Open Rates' });
      else if (!findPlanForDate(published, today)) {
        const next = live.map(p => p.startDate).sort()[0];
        out.push({ tone: 'warning', title: 'No published rates for today', detail: `The first published period starts ${displayDay(next)}; searches for earlier dates get no cars.`, tab: 'Rates', action: 'Open Rates' });
      }
    }
    // 3. Car groups: rates without cars, and prices
    const groups = Array.from(new Set(published.flatMap(p => (p.sippRates || []).map(r => (r.sippCode || '').toUpperCase())).filter(Boolean)));
    const noCars = groups.filter(g => !vehiclesForSipp(fleet, g).length);
    if (groups.length && noCars.length) {
      out.push({ tone: noCars.length === groups.length ? 'danger' : 'warning', title: noCars.length === groups.length ? 'No car in your fleet matches the car groups in your rates' : `${noCars.length} of ${groups.length} car groups in your rates have no car in the fleet`,
        detail: <>Rates for <b>{noCars.join(', ')}</b>, but no car in Fleet Management has {noCars.length === 1 ? 'that SIPP code' : 'those SIPP codes'}, so {noCars.length === 1 ? 'it is' : 'they are'} sent as not available. Your fleet has: {fleetSippCodes(fleet).join(', ') || 'no SIPP codes'}.</> });
    }
    // Rental lengths (1–30 days) with no price: a broker searching for them gets no car.
    const ranges = (ds: number[]) => {
      const out2: string[] = [];
      for (let i = 0; i < ds.length; i++) { let j = i; while (j + 1 < ds.length && ds[j + 1] === ds[j] + 1) j++; out2.push(ds[j] === 30 ? `${ds[i]}+ days` : ds[i] === ds[j] ? `${ds[i]} day${ds[i] === 1 ? '' : 's'}` : `${ds[i]}–${ds[j]} days`); i = j; }
      return out2.join(', ');
    };
    const gaps = published.filter(p => p.endDate >= today).flatMap(p => (p.sippRates || []).map(r => {
      const missing = Array.from({ length: 30 }, (_, i) => i + 1).filter(d => { const t = findTier(r, d); return !t || !(Number(t.dailyPrice) > 0); });
      return missing.length ? `${(r.sippCode || '').toUpperCase()} in ${p.name}: ${ranges(missing)}` : '';
    })).filter(Boolean);
    if (gaps.length) out.push({ tone: 'danger', title: 'Some rental lengths have no price', detail: <>A broker searching for these lengths gets no car: {gaps.slice(0, 6).join(' · ')}{gaps.length > 6 ? ` and ${gaps.length - 6} more` : ''}. Fill in every rental-length band on the Rates tab, then publish.</>, tab: 'Rates', action: 'Open Rates' });
    // 4. Branches, key, status
    const branches = a.bookingRules?.locations || [];
    if (!branches.length) out.push({ tone: 'danger', title: 'No branches are set up for this broker', detail: 'Searches are refused until a branch with its code is added.', tab: 'Booking API', action: 'Open Booking API' });
    if (!a.feedKeyHash) out.push({ tone: 'danger', title: 'No live API key', detail: 'Create a key on the API keys screen and give it to the broker.' });
    if (a.status !== 'active') out.push({ tone: 'info', title: 'The channel is in Testing', detail: 'Searches are answered, but bookings are sandbox bookings until the channel goes live.', tab: 'Go-live', action: 'Open Go-live' });
    // 4b. The broker's own stop sales (Price rules): they close car groups even when cars are free.
    const brokerStops = (a.bookingRules?.commercial?.blackouts || []).filter(b => b.from && (b.to || b.from) >= today);
    if (brokerStops.length) out.push({ tone: 'danger', title: `${brokerStops.length} stop sale${brokerStops.length === 1 ? '' : 's'} in this broker's Price rules`,
      detail: <>These close cars for the broker even when they are free: {brokerStops.slice(0, 4).map((b, i) => <span key={i} className="block"><b>{displayDay(b.from)} → {displayDay(b.to || b.from)}</b> · {b.groups?.length ? b.groups.join(', ') : 'every car group'}{b.note ? <> · “{b.note}”</> : null}</span>)}Remove the stop sale under Price rules → Stop sales and publish, if it is not meant.</>,
      tab: 'Price rules', action: 'Open Price rules' });
    // 5. Stop sales today
    const stops = (stopSales || []).filter(s => s.startDate <= today && s.endDate >= today);
    if (stops.length) out.push({ tone: 'info', title: `${stops.length} stop sale${stops.length === 1 ? '' : 's'} active today`, detail: 'Stopped cars or categories are sent as not available.' });
    // 6. What the broker actually did
    if (traffic) {
      const live = traffic.filter(r => !r.sandbox);
      const searches = live.filter(r => /AvailRate|availability/i.test(r.operation));
      if (!searches.length) out.push({ tone: 'warning', title: 'The broker has not searched in the last 7 days', detail: live.length ? 'It only made other calls (for example a connection test). Ask the broker to run a search for your branch and dates.' : 'No live call at all: the connection test may have been made from the console. Ask the broker to search.' });
      if (last) {
        const when = `${displayStamp(last.at)}${last.location ? ` · ${last.location}` : ''}${last.pickUp ? ` · ${displayDay(last.pickUp.slice(0, 10), false)} → ${last.dropOff ? displayDay(last.dropOff.slice(0, 10), false) : '?'}` : ''}`;
        if (last.error) out.push({ tone: 'danger', title: 'The broker\'s last search was refused', detail: <><span className="tabular-nums">{when}</span>: {last.error}{last.location && branches.length && !branches.some(b => (b.code || '').toUpperCase() === last.location!.toUpperCase()) ? <> — <b>{last.location}</b> is not one of your branch codes ({branches.map(b => b.code).join(', ')}).</> : null}</> });
        else if (!last.available) out.push({ tone: 'danger', title: 'The broker\'s last search got no available car', detail: <><span className="tabular-nums">{when}</span>: {last.groups} car group{last.groups === 1 ? '' : 's'} in the answer, none available{last.closed.length ? <>, closed because: <b>{last.closed.join('; ')}</b></> : ''}{last.warnings.length ? <>. Our answer said: <i>{last.warnings.join('; ')}</i></> : ''}.</> });
        else out.push({ tone: 'ok', title: 'The broker\'s last search got cars', detail: <><span className="tabular-nums">{when}</span>: {last.available} of {last.groups} car group{last.groups === 1 ? '' : 's'} available. If they still do not show on the broker’s side, the broker must map your car groups and branch on its side.</> });
      }
      const codes = new Map<string, { n: number; msg?: string }>();
      live.filter(r => !r.success && r.errorCode).forEach(r => { const c = codes.get(r.errorCode!) || { n: 0, msg: r.errorMessage }; c.n++; codes.set(r.errorCode!, c); });
      [...codes.entries()].sort((x, y) => y[1].n - x[1].n).forEach(([code, c]) => {
        const help = ERROR_HELP[code];
        out.push({ tone: code === 'NO_AVAILABILITY' || code === 'PRICE_CHANGED' || code === 'OFFER_EXPIRED' ? 'warning' : 'danger', title: `${c.n} call${c.n === 1 ? '' : 's'} refused with ${code}`,
          detail: <>{c.msg && <>Last message: <i>{c.msg}</i>. </>}{help?.text}</>, tab: help?.tab, action: help?.tab ? `Open ${help.tab}` : undefined });
      });
    }
    if (!out.some(f => f.tone === 'danger' || f.tone === 'warning')) out.unshift({ tone: 'ok', title: 'Nothing on our side stops the broker from seeing your cars' });
    const order: Tone[] = ['danger', 'warning', 'info', 'ok'];
    return out.sort((x, y) => order.indexOf(x.tone) - order.indexOf(y.tone));
  }, [a, fleet, stopSales, traffic, last]);

  const problems = findings.filter(f => f.tone === 'danger').length;
  return (
    <Panel title="What the broker sees" subtitle={traffic === null ? 'Checking rates, fleet, branches and the broker\'s last 7 days…' : `Checked against the published rates and the broker's calls of the last 7 days${problems ? ` · ${problems} to fix` : ''}`}
      actions={<Button size="sm" variant="ghost" onClick={load}>Check again</Button>}>
      <ul className="divide-y divide-slate-100" data-testid="broker-visibility">
        {findings.map((f, i) => (
          <li key={i} className={`px-4 py-3 flex items-start gap-3 ${TONE[f.tone].ring}`}>
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${TONE[f.tone].dot}`} aria-label={TONE[f.tone].label} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-slate-900">{f.title}</p>
              {f.detail && <p className="mt-0.5 text-[12.5px] text-slate-600">{f.detail}</p>}
            </div>
            {f.tab && <Button size="sm" variant="ghost" onClick={() => onNavigate(f.tab!)} className="shrink-0">{f.action || 'Open'}</Button>}
          </li>
        ))}
        {loadError && <li className="px-4 py-2 text-[12px] text-slate-500">The broker's calls could not be loaded; the checks above use your settings only.</li>}
      </ul>
    </Panel>
  );
};

export default BrokerVisibilityCheck;
