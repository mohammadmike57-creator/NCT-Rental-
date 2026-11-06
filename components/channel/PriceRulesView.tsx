import React, { useMemo, useState } from 'react';
import { Aggregator, ChannelCommercialTerms, ChannelWeekday, Fleet } from '../../types';
import { Panel, Badge, Button, Dialog, EmptyState, table, inputCls, selectCls } from '../ui/Crm';
import { WEEKDAYS } from './CommercialRules';

/**
 * The broker's commercial terms on top of the published rates: markup or discount, car-group terms,
 * pick-up day prices, early-booking and last-minute rules, minimum rental length, closed dates and stop
 * sales. Changes are a draft until published; every published version is kept and can be restored.
 * The server reads only the published version (bookingRules.commercial, see ChannelCommercial.java).
 */

type Terms = ChannelCommercialTerms;
const fieldCls = inputCls.replace('w-full ', '');
const n = (v: string) => (v === '' || v === '-' ? undefined : Number(v));
const pctText = (v?: number) => (v == null || v === 0 ? '0 %' : `${v > 0 ? '+' : ''}${v} %`);
const when = (s?: string) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const DAY_INDEX: ChannelWeekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Only the commercial fields, without empty values, so drafts compare cleanly. */
export const cleanTerms = (t: Terms = {}): Terms => {
  const out: Terms = {};
  if (t.markupPercent) out.markupPercent = t.markupPercent;
  if (t.markupPerDay) out.markupPerDay = t.markupPerDay;
  if (t.roundTo) out.roundTo = t.roundTo;
  const groups = Object.entries(t.groups || {}).filter(([g, v]) => g && (v.markupPercent != null || (v.minDays || 1) > 1));
  if (groups.length) out.groups = Object.fromEntries(groups.map(([g, v]) => [g.toUpperCase(), { ...(v.markupPercent != null ? { markupPercent: v.markupPercent } : {}), ...((v.minDays || 1) > 1 ? { minDays: v.minDays } : {}) }]));
  const dow = Object.entries(t.pickupDayPercent || {}).filter(([, v]) => v);
  if (dow.length) out.pickupDayPercent = Object.fromEntries(dow);
  if (t.earlyBooking?.days && t.earlyBooking.percent) out.earlyBooking = { days: t.earlyBooking.days, percent: t.earlyBooking.percent };
  if (t.lastMinute?.hours && t.lastMinute.percent) out.lastMinute = { hours: t.lastMinute.hours, percent: t.lastMinute.percent };
  if ((t.minRentalDays || 1) > 1) out.minRentalDays = t.minRentalDays;
  if (t.closedToArrival?.length) out.closedToArrival = [...new Set(t.closedToArrival)].sort();
  if (t.closedToDeparture?.length) out.closedToDeparture = [...new Set(t.closedToDeparture)].sort();
  const bl = (t.blackouts || []).filter(b => b.from);
  if (bl.length) out.blackouts = bl.map(b => ({ from: b.from, to: b.to && b.to >= b.from ? b.to : b.from, ...(b.groups?.length ? { groups: b.groups } : {}), ...(b.note?.trim() ? { note: b.note.trim() } : {}) }));
  return out;
};
const same = (a: Terms, b: Terms) => JSON.stringify(cleanTerms(a)) === JSON.stringify(cleanTerms(b));

/** The terms as sentences, for the publish summary and the history. */
export const describeTerms = (t: Terms, currency: string): string[] => {
  const c = cleanTerms(t), out: string[] = [];
  if (c.markupPercent) out.push(`${c.markupPercent > 0 ? 'Markup' : 'Discount'} ${Math.abs(c.markupPercent)} % on every car group`);
  if (c.markupPerDay) out.push(`${c.markupPerDay > 0 ? 'Plus' : 'Minus'} ${Math.abs(c.markupPerDay)} ${currency} per day`);
  if (c.roundTo) out.push(`Daily rate rounded to ${c.roundTo === 1 ? 'whole units' : `the nearest ${c.roundTo}`}`);
  Object.entries(c.groups || {}).forEach(([g, v]) => {
    if (v.markupPercent != null) out.push(`${g}: ${pctText(v.markupPercent)} instead of the channel markup`);
    if (v.minDays) out.push(`${g}: at least ${v.minDays} days`);
  });
  Object.entries(c.pickupDayPercent || {}).forEach(([d, v]) => out.push(`Pick-up on ${WEEKDAYS.find(w => w[0] === d)?.[1]}: ${pctText(v)}`));
  if (c.earlyBooking) out.push(`Booked ${c.earlyBooking.days}+ days ahead: ${pctText(c.earlyBooking.percent)}`);
  if (c.lastMinute) out.push(`Booked less than ${c.lastMinute.hours} h ahead: ${pctText(c.lastMinute.percent)}`);
  if (c.minRentalDays) out.push(`Shortest rental ${c.minRentalDays} days`);
  if (c.closedToArrival) out.push(`No pick-ups on ${c.closedToArrival.join(', ')}`);
  if (c.closedToDeparture) out.push(`No returns on ${c.closedToDeparture.join(', ')}`);
  (c.blackouts || []).forEach(b => out.push(`Stop sale ${b.from}${b.to !== b.from ? ` → ${b.to}` : ''}${b.groups?.length ? ` (${b.groups.join(', ')})` : ' (all groups)'}${b.note ? `: ${b.note}` : ''}`));
  return out;
};

/** The same calculation as ChannelCommercial.java, for the example on screen. */
export const brokerDaily = (t: Terms, group: string, daily: number, pickup: Date, bookedAt: Date) => {
  const c = cleanTerms(t);
  let pct = c.groups?.[group.toUpperCase()]?.markupPercent ?? c.markupPercent ?? 0;
  pct += c.pickupDayPercent?.[DAY_INDEX[pickup.getDay()]] ?? 0;
  const hoursAhead = Math.floor((pickup.getTime() - bookedAt.getTime()) / 3600000);
  if (c.earlyBooking && hoursAhead >= c.earlyBooking.days! * 24) pct += c.earlyBooking.percent!;
  if (c.lastMinute && hoursAhead < c.lastMinute.hours!) pct += c.lastMinute.percent!;
  pct = Math.max(-90, Math.min(500, pct));
  let v = (daily * (100 + pct)) / 100 + (c.markupPerDay || 0);
  if (c.roundTo) v = Math.round(v / c.roundTo) * c.roundTo;
  return { pct, daily: Math.max(0.01, Math.round(v * 100) / 100) };
};

const PctInput: React.FC<{ value?: number; onChange: (v?: number) => void; label: string; w?: string }> = ({ value, onChange, label, w = 'w-20' }) => (
  <span className="inline-flex items-center gap-1">
    <input type="number" step={0.5} min={-90} max={500} value={value ?? ''} placeholder="0" aria-label={label}
      onChange={e => onChange(n(e.target.value))} className={`${fieldCls} ${w} tabular-nums px-2`} />
    <span className="text-xs text-slate-500">%</span>
  </span>
);

const DateList: React.FC<{ dates: string[]; onChange: (d: string[]) => void; label: string }> = ({ dates, onChange, label }) => {
  const [add, setAdd] = useState('');
  return (
    <div>
      <div className="flex items-center gap-2">
        <input type="date" value={add} onChange={e => setAdd(e.target.value)} aria-label={label} className={`${fieldCls} flex-1 min-w-0`} />
        <Button size="sm" disabled={!add || dates.includes(add)} onClick={() => { onChange([...dates, add].sort()); setAdd(''); }}>Add</Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {dates.length === 0 && <span className="text-xs text-slate-400">None</span>}
        {dates.map(d => (
          <span key={d} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 tabular-nums">
            {d}<button type="button" aria-label={`Remove ${d}`} onClick={() => onChange(dates.filter(x => x !== d))} className="text-slate-400 hover:text-rose-600">×</button>
          </span>
        ))}
      </div>
    </div>
  );
};

const PriceRulesView: React.FC<{
  aggregator: Aggregator; fleet: Fleet; currentUserName?: string;
  onUpdate: (a: Aggregator) => void; showConfirmation?: (m: string) => void;
}> = ({ aggregator, fleet, currentUserName, onUpdate, showConfirmation }) => {
  const published: Terms = aggregator.bookingRules?.commercial || {};
  const [t, setT] = useState<Terms>(aggregator.commercialDraft || published);
  const [publishing, setPublishing] = useState(false);
  const [note, setNote] = useState('');
  const cur = aggregator.currency || 'JOD';
  const history = aggregator.commercialHistory || [];
  const version = published.version || 0;

  const groups = useMemo(() => Array.from(new Set(fleet.map(v => (v.sippCode || '').toUpperCase()).filter(Boolean))).sort(), [fleet]);
  const set = <K extends keyof Terms>(k: K, v: Terms[K]) => setT(p => ({ ...p, [k]: v }));
  const setGroup = (g: string, p: { markupPercent?: number; minDays?: number }) => setT(x => ({ ...x, groups: { ...(x.groups || {}), [g]: { ...(x.groups?.[g] || {}), ...p } } }));
  const draftSaved = aggregator.commercialDraft ? same(aggregator.commercialDraft, t) : same(published, t);
  const changed = !same(published, t);

  // Example: the first published rate of the first group, a pick-up 14 days from now.
  const [exGroup, setExGroup] = useState(groups[0] || 'CDAR');
  const [exDaily, setExDaily] = useState(40);
  const [exAhead, setExAhead] = useState(14);
  const [exDay, setExDay] = useState<ChannelWeekday>('fri');
  const example = useMemo(() => {
    const booked = new Date(2027, 0, 4, 10);    // a fixed Monday, so the example never changes by itself
    const pickup = new Date(booked.getTime() + exAhead * 86400000);
    while (DAY_INDEX[pickup.getDay()] !== exDay) pickup.setDate(pickup.getDate() + 1);
    const ahead = Math.round((pickup.getTime() - booked.getTime()) / 86400000);
    return { ...brokerDaily(t, exGroup, exDaily || 0, pickup, booked), ahead };
  }, [t, exGroup, exDaily, exAhead, exDay]);

  const saveDraft = () => {
    onUpdate({ ...aggregator, commercialDraft: changed ? cleanTerms(t) : undefined });
    showConfirmation?.(changed ? 'Draft saved. Brokers still see the published version.' : 'Nothing to save: the terms match the published version.');
  };
  const discard = () => {
    if (!window.confirm('Discard the draft and go back to the published terms?')) return;
    setT(published);
    onUpdate({ ...aggregator, commercialDraft: undefined });
  };
  const publish = (terms: Terms, why: string) => {
    const next = version + 1, at = new Date().toISOString();
    const clean = { ...cleanTerms(terms), version: next, publishedAt: at, ...(currentUserName ? { publishedBy: currentUserName } : {}) };
    const entry = { version: next, publishedAt: at, publishedBy: currentUserName, note: why || undefined, terms: cleanTerms(terms) };
    onUpdate({
      ...aggregator,
      bookingRules: { ...(aggregator.bookingRules || {}), commercial: clean },
      commercialDraft: undefined,
      commercialHistory: [entry, ...history].slice(0, 30),
    });
    setT(clean); setPublishing(false); setNote('');
    showConfirmation?.(`Version ${next} of ${aggregator.name}'s price rules is live. The next search uses it.`);
  };
  const rollBack = (v: number) => {
    const old = history.find(h => h.version === v);
    if (!old || !window.confirm(`Publish version ${v} again as version ${version + 1}?\n\n${describeTerms(old.terms, cur).join('\n') || 'No adjustments (published rates only).'}`)) return;
    publish(old.terms, `Rolled back to version ${v}`);
  };

  const now = describeTerms(t, cur), before = describeTerms(published, cur);
  const added = now.filter(x => !before.includes(x)), removed = before.filter(x => !now.includes(x));
  const bl = t.blackouts || [];

  return (
    <div className="space-y-4">
      <Panel title="Price rules for this broker" subtitle="On top of the published rates. Built into the daily rate the broker receives (a net rate); never shown as a separate line."
        actions={<div className="flex items-center gap-2">
          {changed && <Button variant="ghost" size="sm" onClick={discard}>Discard changes</Button>}
          <Button size="sm" onClick={saveDraft} disabled={draftSaved}>Save draft</Button>
          <Button variant="primary" size="sm" onClick={() => setPublishing(true)} disabled={!changed}>Publish…</Button>
        </div>}>
        <div className="px-4 py-3 flex flex-wrap items-center gap-2 text-[13px]">
          {version ? <Badge tone="success">Live: version {version}</Badge> : <Badge tone="muted">No price rules: published rates</Badge>}
          {version > 0 && <span className="text-xs text-slate-500">published {when(published.publishedAt)}{published.publishedBy ? ` by ${published.publishedBy}` : ''}</span>}
          {changed && <Badge tone="warning">{aggregator.commercialDraft && draftSaved ? 'Draft saved, not published' : 'Unsaved changes'}</Badge>}
        </div>
      </Panel>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4 min-w-0">
          <Panel title="Markup or discount" subtitle="Applies to every car group unless a group has its own below. Use a minus for a discount.">
            <div className="px-4 py-4 grid gap-4 sm:grid-cols-3">
              <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">On the daily rate</span>
                <PctInput value={t.markupPercent} onChange={v => set('markupPercent', v)} label="Markup percent" w="w-24" /></label>
              <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">Fixed per day</span>
                <span className="inline-flex items-center gap-1"><input type="number" step={0.5} value={t.markupPerDay ?? ''} placeholder="0" onChange={e => set('markupPerDay', n(e.target.value))}
                  aria-label="Fixed amount per day" className={`${fieldCls} w-24 tabular-nums px-2`} /><span className="text-xs text-slate-500">{cur}</span></span></label>
              <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">Round the daily rate</span>
                <select className={`${selectCls} w-full`} value={t.roundTo || 0} onChange={e => set('roundTo', Number(e.target.value) as Terms['roundTo'])}>
                  <option value={0}>No rounding (cents)</option><option value={1}>Whole units</option><option value={5}>Nearest 5</option><option value={10}>Nearest 10</option>
                </select></label>
            </div>
          </Panel>

          <Panel title="Car groups" subtitle="A group's own markup replaces the one above. Minimum days closes shorter rentals for that group only.">
            {groups.length === 0 ? <EmptyState title="No car groups in the fleet" hint="Car groups come from the SIPP codes of the fleet." /> : (
              <div className="overflow-x-auto">
                <table className={`${table.wrap} min-w-[460px]`}>
                  <thead className={table.head}><tr>{['Group', 'Own markup', 'Minimum days'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
                  <tbody className={table.body}>
                    {groups.map(g => (
                      <tr key={g} className={table.row}>
                        <td className={`${table.td} font-mono text-xs font-semibold text-slate-900`}>{g}</td>
                        <td className={table.td}><PctInput value={t.groups?.[g]?.markupPercent} onChange={v => setGroup(g, { markupPercent: v })} label={`${g} markup`} /></td>
                        <td className={table.td}><input type="number" min={1} max={365} value={t.groups?.[g]?.minDays ?? ''} placeholder="1" aria-label={`${g} minimum days`}
                          onChange={e => setGroup(g, { minDays: n(e.target.value) })} className={`${fieldCls} w-20 tabular-nums px-2`} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Pick-up day and booking window" subtitle="Added to the markup. Example: Friday +15 % and early booking -8 % makes a 10 % markup 17 %.">
            <div className="px-4 py-4 space-y-4">
              <div>
                <p className="text-[12px] font-semibold text-slate-600 mb-1.5">By pick-up day <span className="font-normal text-slate-400">percent</span></p>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {WEEKDAYS.map(([d, label]) => (
                    <label key={d} className="block"><span className="block text-[11px] text-slate-500 mb-0.5">{label}</span>
                      <input type="number" step={0.5} min={-90} max={500} value={t.pickupDayPercent?.[d] ?? ''} placeholder="0" aria-label={`${label} percent`}
                        onChange={e => set('pickupDayPercent', { ...(t.pickupDayPercent || {}), [d]: n(e.target.value) })} className={`${inputCls} tabular-nums px-2`} /></label>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[13px] font-semibold text-slate-900">Early booking</p>
                  <p className="text-xs text-slate-500 mb-2">Booked at least this many days before pick-up.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block"><span className="block text-[11px] text-slate-500 mb-0.5">Days ahead (at least)</span>
                      <input type="number" min={0} value={t.earlyBooking?.days ?? ''} placeholder="60" aria-label="Early booking days"
                        onChange={e => set('earlyBooking', { ...(t.earlyBooking || {}), days: n(e.target.value) })} className={`${inputCls} tabular-nums px-2`} /></label>
                    <label className="block"><span className="block text-[11px] text-slate-500 mb-0.5">Change (%)</span>
                      <input type="number" step={0.5} min={-90} max={500} value={t.earlyBooking?.percent ?? ''} placeholder="0" aria-label="Early booking percent"
                        onChange={e => set('earlyBooking', { ...(t.earlyBooking || {}), percent: n(e.target.value) })} className={`${inputCls} tabular-nums px-2`} /></label>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[13px] font-semibold text-slate-900">Last minute</p>
                  <p className="text-xs text-slate-500 mb-2">Booked less than this many hours before pick-up.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block"><span className="block text-[11px] text-slate-500 mb-0.5">Hours ahead (less than)</span>
                      <input type="number" min={0} value={t.lastMinute?.hours ?? ''} placeholder="48" aria-label="Last minute hours"
                        onChange={e => set('lastMinute', { ...(t.lastMinute || {}), hours: n(e.target.value) })} className={`${inputCls} tabular-nums px-2`} /></label>
                    <label className="block"><span className="block text-[11px] text-slate-500 mb-0.5">Change (%)</span>
                      <input type="number" step={0.5} min={-90} max={500} value={t.lastMinute?.percent ?? ''} placeholder="0" aria-label="Last minute percent"
                        onChange={e => set('lastMinute', { ...(t.lastMinute || {}), percent: n(e.target.value) })} className={`${inputCls} tabular-nums px-2`} /></label>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Rental length and closed dates" subtitle="The broker gets a clear error with the reason; nothing can be booked around these rules.">
            <div className="px-4 py-4 grid gap-5 sm:grid-cols-[150px_1fr_1fr]">
              <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">Shortest rental (all groups)</span>
                <span className="inline-flex items-center gap-1"><input type="number" min={1} max={365} value={t.minRentalDays ?? ''} placeholder="1" aria-label="Shortest rental days"
                  onChange={e => set('minRentalDays', n(e.target.value))} className={`${fieldCls} w-20 tabular-nums px-2`} /><span className="text-xs text-slate-500">days</span></span></label>
              <div><p className="text-[12px] font-semibold text-slate-600 mb-1">No pick-ups on</p><DateList dates={t.closedToArrival || []} onChange={d => set('closedToArrival', d)} label="Closed to pick-up" /></div>
              <div><p className="text-[12px] font-semibold text-slate-600 mb-1">No returns on</p><DateList dates={t.closedToDeparture || []} onChange={d => set('closedToDeparture', d)} label="Closed to return" /></div>
            </div>
          </Panel>

          <Panel title="Stop sales" subtitle="No rental may touch these days. Leave groups empty to close every group for this broker."
            actions={<Button size="sm" onClick={() => set('blackouts', [...bl, { from: '', to: '', groups: [], note: '' }])}>Add stop sale</Button>}>
            {bl.length === 0 ? <EmptyState title="No stop sales" hint="Use one for events, fleet shortages or dates this broker may not sell." /> : (
              <div className="overflow-x-auto">
                <table className={`${table.wrap} min-w-[720px]`}>
                  <thead className={table.head}><tr>{['From', 'To', 'Groups', 'Reason shown to the broker', ''].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
                  <tbody className={table.body}>
                    {bl.map((b, i) => {
                      const upd = (p: Partial<typeof b>) => set('blackouts', bl.map((x, j) => (j === i ? { ...x, ...p } : x)));
                      return (
                        <tr key={i} className={table.row}>
                          <td className={table.td}><input type="date" value={b.from} aria-label="Stop sale from" onChange={e => upd({ from: e.target.value })} className={`${fieldCls} w-36`} /></td>
                          <td className={table.td}><input type="date" value={b.to} min={b.from} aria-label="Stop sale to" onChange={e => upd({ to: e.target.value })} className={`${fieldCls} w-36`} /></td>
                          <td className={table.td}>
                            <div className="flex flex-wrap gap-1 w-52">
                              {groups.map(g => {
                                const on = (b.groups || []).includes(g);
                                return <button key={g} type="button" onClick={() => upd({ groups: on ? (b.groups || []).filter(x => x !== g) : [...(b.groups || []), g] })}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${on ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{g}</button>;
                              })}
                              {!(b.groups || []).length && <span className="text-[11px] text-slate-400">All groups</span>}
                            </div>
                          </td>
                          <td className={table.td}><input value={b.note || ''} placeholder="Not sold for these dates" aria-label="Reason" onChange={e => upd({ note: e.target.value })} className={`${fieldCls} w-56`} /></td>
                          <td className={`${table.td} text-right`}><button type="button" onClick={() => set('blackouts', bl.filter((_, j) => j !== i))} className="h-8 px-2.5 rounded-md text-xs font-semibold text-rose-600 hover:bg-rose-50">Remove</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-1 content-start">
          <Panel title="Example" subtitle="What the broker receives with the terms on screen (draft included).">
            <div className="px-4 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className="block text-[11px] text-slate-500 mb-0.5">Group</span>
                  <select className={`${selectCls} w-full`} value={exGroup} onChange={e => setExGroup(e.target.value)}>{(groups.length ? groups : ['CDAR']).map(g => <option key={g}>{g}</option>)}</select></label>
                <label className="block"><span className="block text-[11px] text-slate-500 mb-0.5">Published daily rate</span>
                  <input type="number" min={0} step={0.5} value={exDaily} onChange={e => setExDaily(Number(e.target.value))} className={`${inputCls} tabular-nums`} /></label>
                <label className="block"><span className="block text-[11px] text-slate-500 mb-0.5">Pick-up day</span>
                  <select className={`${selectCls} w-full`} value={exDay} onChange={e => setExDay(e.target.value as ChannelWeekday)}>{WEEKDAYS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select></label>
                <label className="block"><span className="block text-[11px] text-slate-500 mb-0.5">Booked days ahead</span>
                  <input type="number" min={0} max={730} value={exAhead} onChange={e => setExAhead(Number(e.target.value))} className={`${inputCls} tabular-nums`} /></label>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="flex items-baseline justify-between"><span className="text-xs text-slate-500">Published</span><span className="tabular-nums text-[13px] text-slate-700">{(exDaily || 0).toFixed(2)} {cur}</span></div>
                <div className="flex items-baseline justify-between mt-1"><span className="text-xs text-slate-500">Adjustment</span><span className="tabular-nums text-[13px] text-slate-700">{pctText(example.pct)}{t.markupPerDay ? ` ${t.markupPerDay > 0 ? '+' : ''}${t.markupPerDay}` : ''}</span></div>
                <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-slate-200"><span className="text-[13px] font-semibold text-slate-900">Broker daily rate</span><span className="tabular-nums text-lg font-bold text-slate-900">{example.daily.toFixed(2)} {cur}</span></div>
                <p className="mt-1 text-[11px] text-slate-400">{exGroup}, pick-up on a {WEEKDAYS.find(w => w[0] === exDay)?.[1]}, booked {example.ahead} days ahead.</p>
              </div>
            </div>
          </Panel>

          <Panel title="Version history" subtitle="Every published version. Rolling back publishes the old terms as a new version.">
            {history.length === 0 ? <p className="px-4 py-6 text-center text-[13px] text-slate-500">Nothing published yet.</p> : (
              <ul className="divide-y divide-slate-100">
                {history.map(h => (
                  <li key={h.version} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-slate-900">Version {h.version}</span>
                      {h.version === version && <Badge tone="success">Live</Badge>}
                      <span className="flex-1" />
                      {h.version !== version && <Button size="sm" onClick={() => rollBack(h.version)}>Roll back</Button>}
                    </div>
                    <p className="text-[11px] text-slate-500">{when(h.publishedAt)}{h.publishedBy ? ` · ${h.publishedBy}` : ''}{h.note ? ` · ${h.note}` : ''}</p>
                    <ul className="mt-1 list-disc pl-4 text-[11px] text-slate-600">
                      {(describeTerms(h.terms, cur).length ? describeTerms(h.terms, cur) : ['Published rates, no adjustments']).map(x => <li key={x}>{x}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {publishing && (
        <Dialog open onClose={() => setPublishing(false)} size="md" title={`Publish version ${version + 1} for ${aggregator.name}?`}
          subtitle="The broker's next search uses these terms. Bookings already made keep their price."
          footer={<><Button variant="ghost" onClick={() => setPublishing(false)}>Cancel</Button><Button variant="primary" onClick={() => publish(t, note.trim())}>Publish now</Button></>}>
          <div className="space-y-3 text-[13px]">
            {added.length > 0 && <div><p className="font-semibold text-emerald-700 mb-1">New or changed</p><ul className="list-disc pl-5 text-slate-700">{added.map(x => <li key={x}>{x}</li>)}</ul></div>}
            {removed.length > 0 && <div><p className="font-semibold text-rose-700 mb-1">Removed</p><ul className="list-disc pl-5 text-slate-500 line-through">{removed.map(x => <li key={x}>{x}</li>)}</ul></div>}
            {!added.length && !removed.length && <p className="text-slate-500">No adjustments: the broker gets the published rates.</p>}
            <label className="block"><span className="block text-[12px] font-semibold text-slate-600 mb-1">Note <span className="font-normal text-slate-400">optional, kept in the history</span></span>
              <input className={inputCls} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Agreed with the broker on 6 Nov" /></label>
          </div>
        </Dialog>
      )}
    </div>
  );
};

export default PriceRulesView;
