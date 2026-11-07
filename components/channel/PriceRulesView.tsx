import React, { useMemo, useState } from 'react';
import { Aggregator, ChannelCommercialTerms, ChannelWeekday, Fleet } from '../../types';
import { Badge, Button, Dialog, EmptyState, inputCls, selectCls } from '../ui/Crm';
import { BuildStep, BuildUp, Delta, Icons, RuleCard, Seg, StateChip, Stepper, Toggle, money2, signed, toneOf, toneText } from './pricingKit';
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

const fmtDay = (s: string) => new Date(`${s}T12:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const nights = (from: string, to: string) => (from && to ? Math.max(1, Math.round((new Date(`${to}T12:00`).getTime() - new Date(`${from}T12:00`).getTime()) / 86400000) + 1) : 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const DateList: React.FC<{ dates: string[]; onChange: (d: string[]) => void; label: string; empty: string }> = ({ dates, onChange, label, empty }) => {
  const [add, setAdd] = useState('');
  return (
    <div>
      <div className="flex items-center gap-2">
        <input type="date" value={add} onChange={e => setAdd(e.target.value)} aria-label={label} className={`${fieldCls} flex-1 min-w-0`} />
        <Button size="sm" disabled={!add || dates.includes(add)} onClick={() => { onChange([...dates, add].sort()); setAdd(''); }}>Add date</Button>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5 min-h-[28px]">
        {dates.length === 0 && <span className="inline-flex items-center h-7 text-[12px] text-slate-400">{empty}</span>}
        {dates.map(d => (
          <span key={d} className="inline-flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-md bg-white ring-1 ring-inset ring-slate-200 text-[12px] font-medium text-slate-700 tabular-nums shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />{fmtDay(d)}
            <button type="button" aria-label={`Remove ${d}`} onClick={() => onChange(dates.filter(x => x !== d))} className="grid place-items-center w-5 h-5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 [&>svg]:w-3 [&>svg]:h-3"><Icons.x /></button>
          </span>
        ))}
      </div>
    </div>
  );
};

/** The label above a control. */
const Lbl: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <span className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{children}{hint && <span className="ml-1 normal-case tracking-normal font-normal text-slate-400">{hint}</span>}</span>
);

const AHEAD: [number, string][] = [[12, '12 h'], [36, '36 h'], [24 * 7, '7 days'], [24 * 30, '30 days'], [24 * 90, '90 days']];

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

  // Simulator
  const [exGroup, setExGroup] = useState(groups[0] || 'CDAR');
  const [exDaily, setExDaily] = useState(40);
  const [exAhead, setExAhead] = useState(24 * 7);
  const [exDay, setExDay] = useState<ChannelWeekday>('fri');
  const sim = useMemo(() => {
    const pickup = new Date(2027, 0, 4, 10);           // a fixed Monday 10:00, moved to the chosen day: the example never changes by itself
    while (DAY_INDEX[pickup.getDay()] !== exDay) pickup.setDate(pickup.getDate() + 1);
    const booked = new Date(pickup.getTime() - exAhead * 3600000);
    const res = brokerDaily(t, exGroup, exDaily || 0, pickup, booked);
    const c = cleanTerms(t), base = exDaily || 0;
    const own = c.groups?.[exGroup]?.markupPercent;
    const mk = own ?? c.markupPercent ?? 0;
    const dow = c.pickupDayPercent?.[exDay] ?? 0;
    const early = c.earlyBooking && exAhead >= c.earlyBooking.days! * 24 ? c.earlyBooking.percent! : 0;
    const last = c.lastMinute && exAhead < c.lastMinute.hours! ? c.lastMinute.percent! : 0;
    const steps: BuildStep[] = [{ label: 'Published daily rate', detail: `${exGroup} · Rates tab`, amount: base, kind: 'base' }];
    let run = base;
    const add = (label: string, detail: string, pct: number) => { const d = r2((base * pct) / 100); run = r2(run + d); steps.push({ label, detail, delta: d, amount: run, kind: pct ? 'step' : 'muted' }); };
    add(own != null ? `${exGroup} markup` : 'Channel markup', own != null ? `${signed(own)} · group's own` : mk ? signed(mk) : 'Not set', mk);
    add(`Pick-up on ${WEEKDAYS.find(w => w[0] === exDay)?.[1]}`, dow ? signed(dow) : 'No change', dow);
    if (c.lastMinute && exAhead < c.lastMinute.hours!) add('Last minute', `Booked < ${c.lastMinute.hours} h ahead · ${signed(last)}`, last);
    else add('Early booking', c.earlyBooking ? (early ? `Booked ${c.earlyBooking.days}+ days ahead · ${signed(early)}` : `Needs ${c.earlyBooking.days}+ days ahead`) : 'Not set', early);
    const sum = mk + dow + early + last;
    if (sum !== res.pct) { const target = r2((base * (100 + res.pct)) / 100); steps.push({ label: 'Limit', detail: `Total change capped at ${signed(res.pct)}`, delta: r2(target - run), amount: target, kind: 'step' }); run = target; }
    if (c.markupPerDay) { run = r2(run + c.markupPerDay); steps.push({ label: 'Fixed per day', detail: `${signed(c.markupPerDay, cur)}`, delta: c.markupPerDay, amount: run, kind: 'step' }); }
    if (c.roundTo && r2(res.daily) !== run) steps.push({ label: 'Rounding', detail: c.roundTo === 1 ? 'Whole units' : `Nearest ${c.roundTo}`, delta: r2(res.daily - run), amount: res.daily, kind: 'step' });
    steps.push({ label: 'Broker net daily rate', detail: `${signed(res.pct)} in total${c.markupPerDay ? ` ${signed(c.markupPerDay, cur)}` : ''}`, amount: res.daily, kind: 'final' });
    return { ...res, steps };
  }, [t, exGroup, exDaily, exAhead, exDay, cur]);

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
  const diffCount = added.length + removed.length;
  const bl = t.blackouts || [];
  const c = cleanTerms(t);
  const overrides = Object.values(c.groups || {}).filter(v => v.markupPercent != null).length;
  const groupMins = Object.values(c.groups || {}).filter(v => v.minDays).length;
  const dowSet = Object.keys(c.pickupDayPercent || {}).length;
  const restrictions = (c.minRentalDays ? 1 : 0) + (c.closedToArrival?.length || 0) + (c.closedToDeparture?.length || 0);
  const mkSign = (t.markupPercent ?? 0) > 0 ? 'up' : (t.markupPercent ?? 0) < 0 ? 'down' : 'none';
  const quick = (pct: number, perDay = 0) => { let v = (exDaily * (100 + pct)) / 100 + perDay; if (c.roundTo) v = Math.round(v / c.roundTo) * c.roundTo; return Math.max(0.01, r2(v)); };

  const kpis = [
    { id: 'pr-markup', label: 'Channel markup', value: c.markupPercent ? signed(c.markupPercent) : '0%', sub: c.markupPerDay ? `${signed(c.markupPerDay, cur)} per day` : 'on every car group', on: !!(c.markupPercent || c.markupPerDay) },
    { id: 'pr-groups', label: 'Car groups', value: `${overrides} of ${groups.length}`, sub: overrides ? 'with their own markup' : 'follow the channel markup', on: overrides + groupMins > 0 },
    { id: 'pr-window', label: 'Day & booking window', value: `${dowSet + (c.earlyBooking ? 1 : 0) + (c.lastMinute ? 1 : 0)} rules`, sub: [c.earlyBooking && `early ${signed(c.earlyBooking.percent!)}`, c.lastMinute && `last minute ${signed(c.lastMinute.percent!)}`].filter(Boolean).join(' · ') || 'none set', on: dowSet > 0 || !!c.earlyBooking || !!c.lastMinute },
    { id: 'pr-closed', label: 'Restrictions', value: `${restrictions + bl.length}`, sub: `${c.minRentalDays ? `min ${c.minRentalDays} days · ` : ''}${bl.length} stop sale${bl.length === 1 ? '' : 's'}`, on: restrictions + bl.length > 0 },
  ];

  return (
    <div className="space-y-5">
      {/* Command bar */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-clip">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 px-5 py-4">
          <div className="min-w-[260px] flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-600">Commercial terms</p>
            <h2 className="mt-0.5 text-[17px] font-semibold tracking-[-0.01em] text-slate-900">Price rules for {aggregator.name}</h2>
            <p className="text-[12.5px] text-slate-500">Built into the net daily rate this broker receives, on top of your published rates. Never shown as a separate line.</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
              <span className="inline-flex items-center gap-1.5 text-slate-500"><span className={`w-1.5 h-1.5 rounded-full ${version ? 'bg-emerald-500' : 'bg-slate-300'}`} />Live: <b className="font-semibold text-slate-900">{version ? `version ${version}` : 'published rates only'}</b></span>
              {version > 0 && <span className="text-slate-500 tabular-nums">Published {when(published.publishedAt)}{published.publishedBy ? ` by ${published.publishedBy}` : ''}</span>}
              {changed
                ? <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-amber-50 ring-1 ring-inset ring-amber-200 font-semibold text-amber-800"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{diffCount} change{diffCount === 1 ? '' : 's'} in draft{aggregator.commercialDraft && draftSaved ? ' · saved' : ' · not saved'}</span>
                : <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-emerald-50 ring-1 ring-inset ring-emerald-200 font-semibold text-emerald-800"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Draft = live</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {changed && <Button variant="ghost" size="sm" onClick={discard}>Discard</Button>}
            <Button size="sm" onClick={saveDraft} disabled={draftSaved}>Save draft</Button>
            <Button variant="primary" size="sm" onClick={() => setPublishing(true)} disabled={!changed}>Publish{changed ? ` ${diffCount} change${diffCount === 1 ? '' : 's'}` : ''}</Button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-100 divide-x divide-slate-100 bg-slate-50/50">
          {kpis.map(k => (
            <button key={k.id} type="button" onClick={() => scrollTo(k.id)} className="group text-left px-5 py-3 hover:bg-white transition-colors">
              <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                <span className={`w-1.5 h-1.5 rounded-full ${k.on ? 'bg-indigo-500' : 'bg-slate-300'}`} />{k.label}
              </p>
              <p className="mt-1 text-[18px] font-semibold tabular-nums text-slate-900 leading-6">{k.value}</p>
              <p className="text-[11.5px] text-slate-500 truncate group-hover:text-indigo-600">{k.sub}</p>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px] items-start">
          <section className="2xl:col-start-2 2xl:row-start-1 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-clip lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:block">
            <div className="lg:border-r 2xl:border-r-0 border-slate-100"><header className="px-4 py-3.5 border-b border-slate-100 flex items-center gap-2.5">
              <span className="grid place-items-center w-8 h-8 rounded-lg bg-slate-900 text-white [&>svg]:w-4 [&>svg]:h-4"><Icons.calc /></span>
              <div><h3 className="text-[13.5px] font-semibold text-slate-900">Rate build-up</h3><p className="text-[11.5px] text-slate-500">What the broker receives with the terms on screen</p></div>
            </header>
            <div className="px-4 py-3.5 space-y-3 border-b border-slate-100 bg-slate-50/40">
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><Lbl>Car group</Lbl>
                  <select className={`${selectCls} w-full font-mono`} value={exGroup} onChange={e => setExGroup(e.target.value)}>{(groups.length ? groups : ['CDAR']).map(g => <option key={g}>{g}</option>)}</select></label>
                <div><Lbl>Published rate</Lbl><Stepper label="Published daily rate" step={1} min={0} max={100000} value={exDaily} onChange={v => setExDaily(v || 0)} signedTone={false} width="w-12" /></div>
              </div>
              <div><Lbl>Pick-up day</Lbl>
                <div className="grid grid-cols-7 gap-1">{WEEKDAYS.map(([d, l]) => (
                  <button key={d} type="button" aria-pressed={exDay === d} onClick={() => setExDay(d)}
                    className={`h-7 rounded-md text-[11px] font-semibold ring-1 ring-inset ${exDay === d ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}>{l}</button>
                ))}</div></div>
              <div><Lbl>Booked before pick-up</Lbl>
                <div className="grid grid-cols-5 gap-1">{AHEAD.map(([h, l]) => (
                  <button key={h} type="button" aria-pressed={exAhead === h} onClick={() => setExAhead(h)}
                    className={`h-7 rounded-md text-[11px] font-semibold ring-1 ring-inset ${exAhead === h ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}>{l}</button>
                ))}</div></div>
            </div>
            </div>
            <div className="p-2"><BuildUp steps={sim.steps} currency={cur} /></div>
          </section>

        <div className="space-y-5 min-w-0 2xl:col-start-1 2xl:row-start-1 2xl:row-span-2">
          {/* 1. Markup */}
          <RuleCard id="pr-markup" step={1} icon={<Icons.percent />} title="Channel markup or discount"
            description="One change for every car group of this broker. A car group with its own markup (step 2) uses that instead."
            summary={<StateChip on={!!(c.markupPercent || c.markupPerDay)}>{c.markupPercent ? signed(c.markupPercent) : c.markupPerDay ? signed(c.markupPerDay, cur) : 'Published rates'}</StateChip>}>
            <div className="flex flex-wrap gap-x-8 gap-y-5">
              <div>
                <Lbl>On the daily rate</Lbl>
                <div className="flex flex-wrap items-center gap-2">
                  <Seg label="Markup or discount" value={mkSign} onChange={s => set('markupPercent', s === 'none' ? undefined : (s === 'up' ? 1 : -1) * (Math.abs(t.markupPercent || 0) || 10))}
                    options={[['up', 'Markup'], ['down', 'Discount'], ['none', 'None']]} />
                  {mkSign !== 'none' && <Stepper label="Markup percent" unit="%" min={0} max={mkSign === 'down' ? 90 : 500} step={0.5} value={Math.abs(t.markupPercent || 0) || undefined}
                    onChange={v => set('markupPercent', v ? (mkSign === 'down' ? -v : v) : undefined)} signedTone={false} />}
                </div>
              </div>
              <div>
                <Lbl hint="optional">Fixed amount per day</Lbl>
                <Stepper label="Fixed amount per day" unit={cur} step={0.5} min={-1000} max={1000} value={t.markupPerDay} onChange={v => set('markupPerDay', v)} width="w-16" />
              </div>
              <div>
                <Lbl>Round the daily rate</Lbl>
                <Seg label="Rounding" value={t.roundTo || 0} onChange={v => set('roundTo', (v || undefined) as Terms['roundTo'])}
                  options={[[0, 'Cents'], [1, 'Whole'], [5, 'Nearest 5'], [10, 'Nearest 10']]} />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200 px-3 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mr-1">Impact</span>
              {[0.6, 1, 1.9].map(f => { const b = r2(exDaily * f); const pct = c.markupPercent || 0; let v = (b * (100 + pct)) / 100 + (c.markupPerDay || 0); if (c.roundTo) v = Math.round(v / c.roundTo) * c.roundTo; v = Math.max(0.01, r2(v));
                return (
                  <span key={f} className="inline-flex items-center gap-2 h-7 px-2.5 rounded-md bg-white ring-1 ring-inset ring-slate-200 text-[12px] tabular-nums">
                    <span className="text-slate-500">{money2(b)}</span><span className="text-slate-300">→</span><span className="font-semibold text-slate-900">{money2(v)}</span>
                    <span className={`text-[11px] font-semibold ${toneText[toneOf(r2(v - b))]}`}>{v !== b ? `${v > b ? '+' : '−'}${money2(Math.abs(r2(v - b)))}` : ''}</span>
                  </span>
                ); })}
              <span className="text-[11.5px] text-slate-400">{cur} per day, before day and booking-window rules</span>
            </div>
          </RuleCard>

          {/* 2. Car groups */}
          <RuleCard id="pr-groups" step={2} icon={<Icons.cars />} title="Car groups" flush
            description="Give a group its own markup instead of the channel one, or a minimum rental length for that group only."
            summary={<StateChip on={overrides + groupMins > 0}>{overrides + groupMins > 0 ? `${overrides} own markup · ${groupMins} minimum` : 'All follow the channel'}</StateChip>}>
            {groups.length === 0 ? <EmptyState title="No car groups in the fleet" hint="Car groups come from the SIPP codes of the fleet." /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-[13px]">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-200 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-2.5">Group</th><th className="px-3 py-2.5">Markup</th><th className="px-3 py-2.5">Applied</th>
                      <th className="px-3 py-2.5 text-right">On {money2(exDaily)}</th><th className="px-5 py-2.5 text-right">Minimum rental</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {groups.map(g => {
                      const own = t.groups?.[g]?.markupPercent;
                      const pct = own ?? (c.markupPercent || 0);
                      const v = quick(pct, c.markupPerDay || 0);
                      return (
                        <tr key={g} className="hover:bg-slate-50/60">
                          <td className="px-5 py-2.5"><span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-900 text-white font-mono text-[11px] font-semibold tracking-wide">{g}</span></td>
                          <td className="px-3 py-2.5">
                            {own == null ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="inline-flex items-center h-8 px-2.5 rounded-lg border border-dashed border-slate-300 text-[12px] text-slate-500">Channel · {c.markupPercent ? signed(c.markupPercent) : '0%'}</span>
                                <button type="button" onClick={() => setGroup(g, { markupPercent: c.markupPercent || 0 })} className="text-[12px] font-semibold text-indigo-600 hover:text-indigo-800">Set own</button>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2">
                                <Stepper size="sm" label={`${g} markup`} unit="%" step={0.5} value={own} onChange={x => setGroup(g, { markupPercent: x ?? 0 })} />
                                <button type="button" onClick={() => setGroup(g, { markupPercent: undefined })} className="text-[12px] font-medium text-slate-500 hover:text-rose-600">Reset</button>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5"><Delta value={pct} /></td>
                          <td className="px-3 py-2.5 text-right tabular-nums"><span className="font-semibold text-slate-900">{money2(v)}</span><span className="ml-1 text-[11px] text-slate-400">{cur}</span></td>
                          <td className="px-5 py-2.5 text-right">
                            <Stepper size="sm" label={`${g} minimum days`} unit="days" min={1} max={365} placeholder="1" signedTone={false} width="w-10"
                              value={t.groups?.[g]?.minDays} onChange={x => setGroup(g, { minDays: x && x > 1 ? x : undefined })} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </RuleCard>

          {/* 3. Pick-up day and booking window */}
          <RuleCard id="pr-window" step={3} icon={<Icons.calendar />} title="Pick-up day and booking window"
            description="Added to the markup. Example: markup +10%, Friday +15% and early booking −8% gives +17% on the published rate."
            summary={<StateChip on={dowSet > 0 || !!c.earlyBooking || !!c.lastMinute}>{dowSet + (c.earlyBooking ? 1 : 0) + (c.lastMinute ? 1 : 0) || 'No'} rule{dowSet + (c.earlyBooking ? 1 : 0) + (c.lastMinute ? 1 : 0) === 1 ? '' : 's'}</StateChip>}>
            <div className="flex items-center justify-between mb-2">
              <Lbl>By pick-up day</Lbl>
              {dowSet > 0 && <button type="button" onClick={() => set('pickupDayPercent', {})} className="text-[12px] font-medium text-slate-500 hover:text-rose-600">Clear days</button>}
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {WEEKDAYS.map(([d, label]) => {
                const v = t.pickupDayPercent?.[d] ?? 0, tone = toneOf(v);
                const setV = (x?: number) => set('pickupDayPercent', { ...(t.pickupDayPercent || {}), [d]: x || undefined });
                return (
                  <div key={d} className={`rounded-xl ring-1 ring-inset p-2 text-center transition-colors ${tone === 'up' ? 'bg-amber-50/70 ring-amber-200' : tone === 'down' ? 'bg-emerald-50/70 ring-emerald-200' : 'bg-white ring-slate-200'}`}>
                    <p className={`text-[11px] font-semibold uppercase tracking-wider ${d === 'fri' || d === 'sat' ? 'text-slate-700' : 'text-slate-500'}`}>{label}</p>
                    <div className="mt-1 flex items-center justify-center">
                      <input type="number" step={0.5} min={-90} max={500} value={t.pickupDayPercent?.[d] ?? ''} placeholder="0" aria-label={`${label} percent`}
                        onChange={e => setV(n(e.target.value))} className={`w-12 bg-transparent text-center text-[16px] font-semibold tabular-nums outline-none ${toneText[tone].replace('text-slate-400', 'text-slate-400')}`} />
                      <span className="text-[11px] text-slate-400">%</span>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-1">
                      <button type="button" aria-label={`${label}: less`} onClick={() => setV(Math.max(-90, v - 5))} className="h-6 rounded-md bg-white ring-1 ring-inset ring-slate-200 text-[12px] text-slate-500 hover:text-slate-900">−5</button>
                      <button type="button" aria-label={`${label}: more`} onClick={() => setV(Math.min(500, v + 5))} className="h-6 rounded-md bg-white ring-1 ring-inset ring-slate-200 text-[12px] text-slate-500 hover:text-slate-900">+5</button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6">
              <Lbl>By booking window</Lbl>
              {/* The window as a timeline: pick-up is on the left */}
              <div className="relative mt-1 mb-1 flex min-h-[36px] rounded-lg overflow-hidden ring-1 ring-inset ring-slate-200 text-[10.5px] sm:text-[11.5px] font-medium leading-tight text-center">
                <div className={`flex items-center justify-center px-2 py-1 basis-[30%] sm:basis-[24%] ${c.lastMinute ? (c.lastMinute.percent! > 0 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900') : 'bg-slate-50 text-slate-400'}`}>
                  Last minute {c.lastMinute ? `· ${signed(c.lastMinute.percent!)}` : '· off'}</div>
                <div className="flex items-center justify-center px-2 py-1 flex-1 bg-white text-slate-500 border-x border-slate-200">Standard<span className="hidden sm:inline">&nbsp;· markup only</span></div>
                <div className={`flex items-center justify-center px-2 py-1 basis-[30%] sm:basis-[28%] ${c.earlyBooking ? (c.earlyBooking.percent! > 0 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900') : 'bg-slate-50 text-slate-400'}`}>
                  Early booking {c.earlyBooking ? `· ${signed(c.earlyBooking.percent!)}` : '· off'}</div>
              </div>
              <div className="flex text-[10.5px] font-mono text-slate-400 mb-3">
                <span className="basis-[30%] sm:basis-[24%] flex justify-between pr-1"><span>pick-up</span><span>{c.lastMinute ? `${c.lastMinute.hours} h` : ''}</span></span>
                <span className="flex-1" />
                <span className="basis-[30%] sm:basis-[28%] text-left pl-1">{c.earlyBooking ? `${c.earlyBooking.days} days before →` : ''}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {([
                  ['lastMinute', 'Last minute', 'Booked less than this many hours before pick-up.', 'hours', 'h', 48, 10, 720] as const,
                  ['earlyBooking', 'Early booking', 'Booked at least this many days before pick-up.', 'days', 'days', 60, -8, 730] as const,
                ]).map(([k, title, hint, field, unit, defN, defPct, maxN]) => {
                  const val = t[k] as { hours?: number; days?: number; percent?: number } | undefined;
                  const on = !!(val && (val as Record<string, number | undefined>)[field] && val.percent);
                  return (
                    <div key={k} className={`rounded-xl ring-1 ring-inset p-4 ${on ? 'ring-indigo-200 bg-indigo-50/30' : 'ring-slate-200 bg-white'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="text-[13px] font-semibold text-slate-900">{title}</p><p className="text-[12px] text-slate-500">{hint}</p></div>
                        <Toggle on={on} label={title} onChange={b => set(k, b ? { [field]: defN, percent: defPct } as never : undefined)} />
                      </div>
                      {on && (
                        <div className="mt-3 flex flex-wrap items-end gap-3">
                          <div><Lbl>{k === 'lastMinute' ? 'Less than' : 'At least'}</Lbl>
                            <Stepper size="sm" label={`${title} ${field}`} unit={unit} min={1} max={maxN} signedTone={false} width="w-12"
                              value={(val as Record<string, number | undefined>)[field]} onChange={x => set(k, { ...(val || {}), [field]: x } as never)} /></div>
                          <div><Lbl>Change</Lbl>
                            <Stepper size="sm" label={`${title} percent`} unit="%" step={0.5} value={val?.percent} onChange={x => set(k, { ...(val || {}), percent: x } as never)} /></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {aggregator.pricingMode === 'dynamic' && (
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-sky-50 ring-1 ring-inset ring-sky-200 px-3 py-2 text-[12px] text-sky-900">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />This channel uses dynamic rates. When Rate rules → Last minute is on for its channel type, that grid prices the booking window instead of these two rules.
                </p>
              )}
            </div>
          </RuleCard>

          {/* 4. Restrictions */}
          <RuleCard id="pr-closed" step={4} icon={<Icons.lock />} title="Rental length and closed dates"
            description="The broker gets a clear error with the reason. Nothing can be booked around these rules."
            summary={<StateChip on={restrictions > 0}>{restrictions ? `${restrictions} restriction${restrictions === 1 ? '' : 's'}` : 'Open'}</StateChip>}>
            <div className="grid gap-5 lg:grid-cols-[180px_1fr_1fr]">
              <div><Lbl>Shortest rental</Lbl>
                <Stepper label="Shortest rental days" unit="days" min={1} max={365} placeholder="1" signedTone={false} width="w-10" value={t.minRentalDays} onChange={x => set('minRentalDays', x && x > 1 ? x : undefined)} />
                <p className="mt-1.5 text-[11.5px] text-slate-400">All car groups</p></div>
              <div><Lbl>No pick-ups on</Lbl><DateList dates={t.closedToArrival || []} onChange={d => set('closedToArrival', d)} label="Closed to pick-up" empty="Pick-ups allowed every day" /></div>
              <div><Lbl>No returns on</Lbl><DateList dates={t.closedToDeparture || []} onChange={d => set('closedToDeparture', d)} label="Closed to return" empty="Returns allowed every day" /></div>
            </div>
          </RuleCard>

          {/* 5. Stop sales */}
          <RuleCard id="pr-stop" step={5} icon={<Icons.stop />} title="Stop sales" flush
            description="No rental may touch these days. Leave the groups empty to close every group for this broker."
            summary={<StateChip on={bl.length > 0}>{bl.length ? `${bl.length} active` : 'None'}</StateChip>}
            actions={<Button size="sm" icon={<span className="[&>svg]:w-3.5 [&>svg]:h-3.5"><Icons.plus /></span>} onClick={() => set('blackouts', [...bl, { from: '', to: '', groups: [], note: '' }])}>Add stop sale</Button>}>
            {bl.length === 0 ? (
              <p className="px-5 py-6 text-center text-[12.5px] text-slate-500">No stop sales. Use one for events, fleet shortages or dates this broker may not sell.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {bl.map((b, i) => {
                  const upd = (p: Partial<typeof b>) => set('blackouts', bl.map((x, j) => (j === i ? { ...x, ...p } : x)));
                  const len = nights(b.from, b.to || b.from);
                  return (
                    <li key={i} className="px-5 py-3.5 grid gap-3 lg:grid-cols-[auto_1fr_auto] items-start">
                      <div className="flex items-center gap-2">
                        <input type="date" value={b.from} aria-label="Stop sale from" onChange={e => upd({ from: e.target.value })} className={`${fieldCls} w-[150px]`} />
                        <span className="text-slate-300">→</span>
                        <input type="date" value={b.to} min={b.from} aria-label="Stop sale to" onChange={e => upd({ to: e.target.value })} className={`${fieldCls} w-[150px]`} />
                        <span className="inline-flex items-center h-6 px-2 rounded-full bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 text-[11px] font-semibold tabular-nums whitespace-nowrap">{len ? `${len} day${len === 1 ? '' : 's'}` : 'Set dates'}</span>
                      </div>
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap gap-1">
                          <button type="button" onClick={() => upd({ groups: [] })} className={`h-6 px-2 rounded-md text-[11px] font-semibold ring-1 ring-inset ${!(b.groups || []).length ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-500 ring-slate-200 hover:ring-slate-300'}`}>All groups</button>
                          {groups.map(g => {
                            const on = (b.groups || []).includes(g);
                            return <button key={g} type="button" onClick={() => upd({ groups: on ? (b.groups || []).filter(x => x !== g) : [...(b.groups || []), g] })}
                              className={`h-6 px-2 rounded-md text-[11px] font-mono font-semibold ring-1 ring-inset ${on ? 'bg-indigo-50 ring-indigo-300 text-indigo-700' : 'bg-white ring-slate-200 text-slate-500 hover:ring-slate-300'}`}>{g}</button>;
                          })}
                        </div>
                        <input value={b.note || ''} placeholder="Reason shown to the broker, e.g. Not sold for these dates" aria-label="Reason" onChange={e => upd({ note: e.target.value })} className={`${fieldCls} w-full`} />
                      </div>
                      <button type="button" onClick={() => set('blackouts', bl.filter((_, j) => j !== i))} aria-label="Remove stop sale"
                        className="justify-self-end grid place-items-center w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 [&>svg]:w-4 [&>svg]:h-4"><Icons.x /></button>
                    </li>
                  );
                })}
              </ul>
            )}
          </RuleCard>
        </div>

          <section className="2xl:col-start-2 2xl:row-start-2 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-clip">
            <header className="px-4 py-3.5 border-b border-slate-100 flex items-center gap-2.5">
              <span className="grid place-items-center w-8 h-8 rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200 text-slate-500 [&>svg]:w-4 [&>svg]:h-4"><Icons.history /></span>
              <div><h3 className="text-[13.5px] font-semibold text-slate-900">Version history</h3><p className="text-[11.5px] text-slate-500">Roll back publishes the old terms as a new version</p></div>
            </header>
            {history.length === 0 ? <p className="px-4 py-6 text-center text-[12.5px] text-slate-500">Nothing published yet.</p> : (
              <ol className="px-4 py-3 max-h-[420px] overflow-y-auto">
                {history.map((h, i) => (
                  <li key={h.version} className="relative pl-6 pb-4 last:pb-0">
                    {i < history.length - 1 && <span className="absolute left-[7px] top-4 bottom-0 w-px bg-slate-200" />}
                    <span className={`absolute left-0 top-1 w-[15px] h-[15px] rounded-full ring-4 ring-white ${h.version === version ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-slate-900">v{h.version}</span>
                      {h.version === version && <Badge tone="success">Live</Badge>}
                      <span className="flex-1" />
                      {h.version !== version && <button type="button" onClick={() => rollBack(h.version)} className="text-[12px] font-semibold text-indigo-600 hover:text-indigo-800">Roll back</button>}
                    </div>
                    <p className="text-[11px] text-slate-500 tabular-nums">{when(h.publishedAt)}{h.publishedBy ? ` · ${h.publishedBy}` : ''}</p>
                    {h.note && <p className="text-[11.5px] text-slate-600 italic">“{h.note}”</p>}
                    <ul className="mt-1 space-y-0.5 text-[11.5px] text-slate-600">
                      {(describeTerms(h.terms, cur).length ? describeTerms(h.terms, cur) : ['Published rates, no adjustments']).map(x => <li key={x} className="flex gap-1.5"><span className="text-slate-300">–</span>{x}</li>)}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </section>
      </div>

      {publishing && (
        <Dialog open onClose={() => setPublishing(false)} size="md" title={`Publish version ${version + 1} for ${aggregator.name}?`}
          subtitle="The broker's next search uses these terms. Bookings already made keep their price."
          footer={<><Button variant="ghost" onClick={() => setPublishing(false)}>Cancel</Button><Button variant="primary" onClick={() => publish(t, note.trim())}>Publish now</Button></>}>
          <div className="space-y-4 text-[13px]">
            {added.length > 0 && <div className="rounded-lg ring-1 ring-inset ring-emerald-200 bg-emerald-50/50 p-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 mb-1.5">New or changed</p><ul className="space-y-1 text-slate-800">{added.map(x => <li key={x} className="flex gap-2"><span className="text-emerald-600 font-bold">+</span>{x}</li>)}</ul></div>}
            {removed.length > 0 && <div className="rounded-lg ring-1 ring-inset ring-rose-200 bg-rose-50/50 p-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700 mb-1.5">Removed</p><ul className="space-y-1 text-slate-500">{removed.map(x => <li key={x} className="flex gap-2"><span className="text-rose-600 font-bold">−</span><span className="line-through">{x}</span></li>)}</ul></div>}
            {!added.length && !removed.length && <p className="text-slate-500">No adjustments: the broker gets the published rates.</p>}
            <label className="block"><Lbl hint="optional, kept in the history">Note</Lbl>
              <input className={inputCls} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Agreed with the broker on 6 Nov" /></label>
          </div>
        </Dialog>
      )}
    </div>
  );
};

export default PriceRulesView;
