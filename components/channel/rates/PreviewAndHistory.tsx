import React, { useMemo, useState } from 'react';
import { Aggregator, Fleet, RatePlan } from '../../../types';
import { Badge, EmptyState, inputCls, selectCls } from '../../ui/Crm';
import { ChannelRateMode, DynamicPricingState, PriceChannelType, PriceResult, priceRental, rentalDayCount, summarise } from '../../../services/dynamicPricing';
import { Card, FieldLabel, Icons, Icons2, SectionHead, Seg, toneOf, toneText } from '../pricingKit';
import { findPlanForDate, findTier, tierLabel, vehiclesForSipp } from '../../../services/channelManager';
import { addDays, money, nowLocal, r2 } from './rateRulesKit';

/** Rate rules → Preview (price any rental) and History. */
// ---------------------------------------------------------------- preview

/** A labelled field (defined outside the panel so inputs keep focus while typing). */
export const F: React.FC<{ label: string; hint?: string; children: React.ReactNode; className?: string }> = ({ label, hint, children, className }) => <label className={`block min-w-0 ${className || ''}`}><FieldLabel hint={hint}>{label}</FieldLabel>{children}</label>;

export const PreviewPanel: React.FC<{ state: DynamicPricingState; aggregators: Aggregator[]; fleet: Fleet; groups: string[] }> = ({ state, aggregators, fleet, groups }) => {
  const [aggId, setAggId] = useState(aggregators[0]?.id || '');
  const agg = aggregators.find(a => a.id === aggId) || aggregators[0];
  const plans: RatePlan[] = useMemo(() => agg?.ratePlanHistory?.[0]?.ratePlans || [], [agg]);
  const aggGroups = useMemo(() => Array.from(new Set(plans.flatMap(p => p.sippRates.map(r => (r.sippCode || '').toUpperCase())).filter(Boolean))).sort(), [plans]);
  const locs = useMemo(() => agg?.bookingRules?.locations || [], [agg]);
  const [group, setGroup] = useState('');
  const [loc, setLoc] = useState('');
  const [ret, setRet] = useState('');
  const [pickup, setPickup] = useState(() => addDays(nowLocal(), 1).slice(0, 11) + '10:00');
  const [dropOff, setDropOff] = useState(() => addDays(nowLocal(), 4).slice(0, 11) + '10:00');
  const [bookedAt, setBookedAt] = useState(nowLocal());
  const [which, setWhich] = useState<'draft' | 'published'>('draft');
  const [modeOverride, setModeOverride] = useState<'' | ChannelRateMode>('');
  const [extras, setExtras] = useState<string[]>([]);
  const [promo, setPromo] = useState('');
  const g = group || aggGroups[0] || groups[0] || '';
  const l = loc || locs[0]?.code || agg?.locationCode || 'AMM';
  const r = ret || l;
  const mode: ChannelRateMode = modeOverride || (agg?.pricingMode && agg.pricingMode !== 'net' ? agg.pricingMode : 'dynamic');
  const cfg = which === 'draft' ? state.draft : state.published;


  const result: PriceResult | null = useMemo(() => {
    if (!agg || !cfg || !g || dropOff <= pickup) return null;
    return priceRental(cfg, {
      group: g, location: l, channel: (agg.channelType || 'broker') as PriceChannelType, pickup, dropOff, now: bookedAt, mode,
      graceMinutes: agg.bookingRules?.graceMinutes,
      baseDaily: (date, n) => {
        const plan = findPlanForDate(plans, date) || findPlanForDate(plans, pickup.slice(0, 10));
        const rate = plan?.sippRates.find(x => (x.sippCode || '').toUpperCase() === g);
        const tier = rate ? findTier(rate, n) : undefined;
        return tier?.dailyPrice ? Number(tier.dailyPrice) : null;
      },
    });
  }, [agg, cfg, g, l, pickup, dropOff, bookedAt, mode, plans]);

  const cur = agg?.currency || 'USD';
  const br = useMemo(() => agg?.bookingRules || {}, [agg]);
  const pr = useMemo(() => br.pricing || {}, [br]);
  const days = result?.days ?? rentalDayCount(pickup, dropOff, br.graceMinutes);
  const bandTier = (() => { const plan = findPlanForDate(plans, pickup.slice(0, 10)); const rate = plan?.sippRates.find(x => (x.sippCode || '').toUpperCase() === g); return rate ? findTier(rate, days) : undefined; })();
  const bandText = bandTier ? tierLabel(bandTier) : `${days} days`;
  const car = vehiclesForSipp(fleet, g)[0];
  // The booking engine's order after the rate rules: promotion, extras, fees, tax.
  const quote = useMemo(() => {
    if (!result?.bookable) return null;
    const lines: { label: string; amount: number; kind: 'rental' | 'discount' | 'extra' | 'fee' | 'tax' }[] = [{ label: `Rental, ${days} day${days === 1 ? '' : 's'}`, amount: result.total, kind: 'rental' }];
    let total = result.total;
    const p = (pr.promotions || []).find(x => x.code === promo);
    if (p && p.percentOff) { const off = Math.round(result.total * p.percentOff) / 100; lines.push({ label: `Promotion ${p.code} (${p.percentOff}% off)`, amount: -off, kind: 'discount' }); total -= off; }
    (agg?.extras || []).filter(x => extras.includes(x.id)).forEach(x => {
      let a = (x.price || 0) * days; if (x.maxPerRental && a > x.maxPerRental) a = x.maxPerRental;
      lines.push({ label: x.name, amount: a, kind: 'extra' }); total += a;
    });
    if (l !== r) {
      const route = (br.oneWayRoutes || []).find(x => (x.from === l && x.to === r) || (x.bothWays !== false && x.from === r && x.to === l));
      const fee = route ? route.fee : br.oneWayFee || 0;
      if (fee) { lines.push({ label: `One-way fee ${l} → ${r}`, amount: fee, kind: 'fee' }); total += fee; }
    }
    const fees = [l, r].map(code => locs.find(x => x.code === code)).filter(x => x && x.type === 'AIRPORT' && x.airportFeeCharged !== false).map(x => x!.stationFee || 0);
    const airport = Math.max(0, ...fees);
    if (airport) { lines.push({ label: 'Airport fee', amount: airport, kind: 'fee' }); total += airport; }
    let tax = 0;
    if (pr.taxPercent) {
      tax = pr.taxIncluded === false ? Math.round(total * pr.taxPercent) / 100 : Math.round((total * pr.taxPercent / (100 + pr.taxPercent)) * 100) / 100;
      if (pr.taxIncluded === false) { lines.push({ label: `${pr.taxName || 'Tax'} ${pr.taxPercent}%`, amount: tax, kind: 'tax' }); total += tax; }
    }
    return { lines, total: Math.round(total * 100) / 100, tax };
  }, [result, promo, extras, days, agg, l, r, br, pr, locs]);

  if (!agg) return <Card><EmptyState title="No channels yet" hint="Add a channel and publish its rates to preview prices." /></Card>;
  return (
    <div className="space-y-5">
      <SectionHead icon={<Icons2.beaker />} eyebrow="Rate rules" title="Try a price"
        description="Pick a channel, a car group and the dates. The price is worked out day by day, exactly as a broker will see it, and updates as soon as you change anything. Use Draft to test changes you have not published yet."
        actions={<Seg label="Rules to test" size="sm" value={which} onChange={v => (v === 'published' && !state.published ? undefined : setWhich(v))}
          options={[['draft', 'Draft'], ['published', state.published ? `Published v${state.version}` : 'Published (none)']]} />} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Booking" subtitle="What the broker asks for">
          <div className="px-5 py-4 grid gap-4 sm:grid-cols-2">
            <F label="Channel"><select value={agg.id} onChange={e => { setAggId(e.target.value); setGroup(''); setLoc(''); setRet(''); }} className={`${selectCls} w-full`}>{aggregators.map(a => <option key={a.id} value={a.id}>{a.name} ({a.channelCode})</option>)}</select></F>
            <F label="Car group"><select value={g} onChange={e => setGroup(e.target.value)} className={`${selectCls} w-full font-mono`}>{(aggGroups.length ? aggGroups : groups).map(x => <option key={x}>{x}</option>)}</select></F>
            <F label="Pick-up location"><select value={l} onChange={e => setLoc(e.target.value)} className={`${selectCls} w-full`}>{(locs.length ? locs.map(x => x.code) : [l]).map(x => <option key={x}>{x}</option>)}</select></F>
            <F label="Return location"><select value={r} onChange={e => setRet(e.target.value)} className={`${selectCls} w-full`}>{(locs.length ? locs.map(x => x.code) : [l]).map(x => <option key={x}>{x}</option>)}</select></F>
            <F label="Pick-up"><input type="datetime-local" value={pickup} onChange={e => setPickup(e.target.value)} className={inputCls} /></F>
            <F label="Return"><input type="datetime-local" value={dropOff} onChange={e => setDropOff(e.target.value)} className={inputCls} /></F>
          </div>
        </Card>
        <Card title="Conditions" subtitle="When it is booked, and what is added">
          <div className="px-5 py-4 grid gap-4 sm:grid-cols-2">
            <F label="Booked at" hint="for last minute"><input type="datetime-local" value={bookedAt} onChange={e => setBookedAt(e.target.value)} className={inputCls} /></F>
            <F label="Rate mode"><select value={modeOverride} onChange={e => setModeOverride(e.target.value as '' | ChannelRateMode)} className={`${selectCls} w-full`}>
              <option value="">{agg.pricingMode && agg.pricingMode !== 'net' ? `As the channel (${agg.pricingMode})` : 'Dynamic (channel is on net rates)'}</option>
              <option value="dynamic">Dynamic</option><option value="restricted">Restricted</option><option value="net">Net rates</option></select></F>
            <F label="Promotion code"><select value={promo} onChange={e => setPromo(e.target.value)} className={`${selectCls} w-full`}><option value="">None</option>{(pr.promotions || []).map(p => <option key={p.code}>{p.code}</option>)}</select></F>
            <div className="min-w-0"><FieldLabel>Extras</FieldLabel>
              <div className="flex flex-wrap gap-1.5">{(agg.extras || []).length === 0 ? <span className="inline-flex items-center h-9 text-[12px] text-slate-400">None on this channel</span> : (agg.extras || []).map(x => (
                <button key={x.id} type="button" aria-pressed={extras.includes(x.id)} onClick={() => setExtras(v => (v.includes(x.id) ? v.filter(y => y !== x.id) : [...v, x.id]))}
                  className={`h-8 px-2.5 rounded-md text-[12px] font-medium ring-1 ring-inset ${extras.includes(x.id) ? 'bg-indigo-50 text-indigo-700 ring-indigo-300' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}>{x.name}</button>))}</div>
            </div>
          </div>
        </Card>
      </div>

      {!cfg ? <Card><EmptyState title="Nothing published yet" hint="Choose the draft, or publish the rules first." /></Card>
        : !result ? <Card><EmptyState title="Check the dates" hint="The return must be after the pick-up." /></Card>
        : !result.bookable ? <Card><div className="px-5 py-4 flex items-center gap-3"><Badge tone="danger">Not offered</Badge><p className="text-[13px] text-slate-700">{result.reason}</p></div></Card>
        : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
            <Card title="Day by day" subtitle={`${result.days} rental day${result.days === 1 ? '' : 's'} · rate band ${bandText} · booked ${result.leadHours.toFixed(0)} h before pick-up · ${mode} mode`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead><tr className="bg-slate-50/70 border-b border-slate-200 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-2.5">Day</th><th className="px-3 py-2.5 text-right">Base</th><th className="px-3 py-2.5">Rules applied</th><th className="px-5 py-2.5 text-right">Rate</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.perDay.map(d => {
                      const diff = r2(d.rate - d.base);
                      return (
                        <tr key={d.date} className="hover:bg-slate-50/60 align-top">
                          <td className="px-5 py-2.5 whitespace-nowrap tabular-nums font-medium text-slate-800">{new Date(`${d.date}T12:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{money(d.base)}</td>
                          <td className="px-3 py-2.5 text-[12px]">
                            {d.steps.length === 0 ? <span className="text-slate-400">Base rate</span> : (
                              <ol className="space-y-1">{d.steps.map((s, i) => (
                                <li key={i} className="flex flex-wrap items-center gap-1.5">
                                  <span className={`px-1.5 py-px rounded text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${s.stage === 'season' ? 'bg-violet-50 text-violet-700 ring-violet-200' : s.stage === 'lead' ? 'bg-sky-50 text-sky-700 ring-sky-200' : 'bg-slate-50 text-slate-600 ring-slate-200'}`}>{s.stage === 'lead' ? 'last minute' : s.stage}</span>
                                  <span className="text-slate-700">{s.label}</span>
                                  <span className="text-slate-400 tabular-nums">{money(s.from)} → {money(s.to)}</span>
                                </li>))}</ol>
                            )}
                          </td>
                          <td className="px-5 py-2.5 text-right tabular-nums"><b className="text-slate-900">{money(d.rate)}</b>{diff !== 0 && <p className={`text-[11px] font-semibold ${toneText[toneOf(diff)]}`}>{diff > 0 ? '+' : '−'}{money(Math.abs(diff))}</p>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr className="border-t border-slate-200 bg-slate-50">
                    <td className="px-5 py-3 text-[12px] font-medium text-slate-600" colSpan={3}>{summarise(result.perDay).map(x => `${x.count} × ${money(x.rate)}${x.rule ? ` (${x.rule})` : ''}`).join(' + ')}</td>
                    <td className="px-5 py-3 text-right font-bold tabular-nums text-slate-900">{money(result.total)}</td>
                  </tr></tfoot>
                </table>
              </div>
              {result.notes.length > 0 && <ul className="px-5 py-2.5 border-t border-slate-100 text-[12px] text-slate-500 list-disc pl-9">{result.notes.map(n => <li key={n}>{n}</li>)}</ul>}
            </Card>

            <Card title="Price shown to the broker" subtitle={`${agg.name} · ${cur}`}>
              {quote && (
                <div className="p-2 text-[13px]">
                  <div className="flex items-baseline justify-between px-3 py-2"><span className="text-slate-500">Average daily rate</span><span className="font-semibold tabular-nums text-slate-900">{money(result.total / result.days)}</span></div>
                  <ul className="px-3 py-2 space-y-1.5 border-t border-slate-100">
                    {quote.lines.map((x, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3"><span className={x.kind === 'discount' ? 'text-emerald-700' : 'text-slate-600'}>{x.label}</span><span className="tabular-nums text-slate-800">{x.amount < 0 ? '−' : ''}{money(Math.abs(x.amount))}</span></li>
                    ))}
                  </ul>
                  <div className="flex items-baseline justify-between rounded-lg bg-slate-900 text-white px-3 py-3 mt-1"><span className="font-semibold">Total</span><span className="text-[20px] font-bold tabular-nums">{money(quote.total)} <span className="text-[12px] font-medium text-slate-300">{cur}</span></span></div>
                  {pr.taxPercent ? <p className="px-3 pt-2 text-[11px] text-slate-500">{pr.taxIncluded === false ? 'Tax added above.' : `Includes ${pr.taxName || 'tax'} ${pr.taxPercent}%: ${money(quote.tax)}.`}</p> : null}
                  <dl className="mx-3 mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-[12px]">
                    <div className="flex justify-between"><dt className="text-slate-500">Deposit</dt><dd className="tabular-nums">{car ? money(car.securityDeposit || 0) : '—'}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Excess</dt><dd className="tabular-nums">{car ? money(car.excess || 0) : '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Payment</dt><dd className="text-right">{br.paymentModel === 'BROKER_PREPAID' ? 'Prepaid to the broker' : 'Pay at the counter'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Cancellation</dt><dd className="text-right">{(br.cancellationTiers || []).length
                      ? br.cancellationTiers!.map(t => `<${t.hoursBefore} h: ${t.feePercent}%`).join(', ')
                      : `Free until ${br.freeCancellationHours ?? 48} h before, then ${br.lateCancellationFeePercent ?? 100}%`}</dd></div>
                  </dl>
                  <p className="px-3 pt-3 pb-1 text-[11px] text-slate-400">The broker's own terms (Price rules) are applied by the server on top of this net rental.</p>
                </div>
              )}
            </Card>
          </div>
        )}
    </div>
  );
};

// ---------------------------------------------------------------- history

export const HistoryPanel: React.FC<{ state: DynamicPricingState }> = ({ state }) => {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'published' | 'rules' | 'channels'>('all');
  const all = state.history || [];
  const list = all.filter(h => (kind === 'all' || (kind === 'published' ? h.action === 'Published' : kind === 'channels' ? /channel/i.test(h.action) : h.action !== 'Published' && !/channel/i.test(h.action)))
    && (!q.trim() || `${h.action} ${h.detail} ${h.by} ${h.before || ''} ${h.after || ''}`.toLowerCase().includes(q.trim().toLowerCase())));
  const tone = (a: string) => (a === 'Published' ? 'bg-emerald-500' : /deleted|off|discarded/i.test(a) ? 'bg-rose-500' : /channel/i.test(a) ? 'bg-sky-500' : 'bg-indigo-500');
  return (
    <div className="space-y-5">
      <SectionHead icon={<Icons.history />} eyebrow="Rate rules" title="Change history"
        description="Every change to the rules, who made it and when, with the old and new values. The last 500 changes are kept."
        actions={<span className="inline-flex items-center h-7 px-2.5 rounded-full bg-slate-50 ring-1 ring-inset ring-slate-200 text-[12px] font-semibold text-slate-600 tabular-nums">{all.length} change{all.length === 1 ? '' : 's'}</span>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-100">
          <Seg label="Filter changes" size="sm" value={kind} onChange={v => setKind(v)} options={[['all', 'All'], ['published', 'Publishes'], ['rules', 'Rules'], ['channels', 'Channels']]} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search changes, people or values" aria-label="Search history" className={`${inputCls} h-8 max-w-xs ml-auto`} />
        </div>
        {list.length === 0 ? <EmptyState title={all.length ? 'No changes match' : 'No changes yet'} hint={all.length ? 'Try another filter or search.' : 'Changes appear here as soon as you edit a rule.'} /> : (
          <ol className="px-5 py-4">
            {list.map((h, i) => (
              <li key={i} className="relative grid grid-cols-[150px_1fr] gap-5 pb-5 last:pb-0">
                <div className="text-right pt-0.5">
                  <p className="text-[12px] font-semibold text-slate-800 tabular-nums">{new Date(h.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  <p className="text-[11px] text-slate-500 tabular-nums">{new Date(h.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {h.by}</p>
                </div>
                <div className="relative pl-6 min-w-0">
                  {i < list.length - 1 && <span className="absolute left-[5px] top-4 bottom-[-20px] w-px bg-slate-200" />}
                  <span className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full ring-4 ring-white ${tone(h.action)}`} />
                  <p className="text-[13px]"><span className="font-semibold text-slate-900">{h.action}</span><span className="text-slate-500"> · {h.detail}</span></p>
                  {(h.before != null || h.after != null) && (
                    <div className="mt-1.5 grid gap-1.5 md:grid-cols-2 text-[12px]">
                      <div className="rounded-md bg-rose-50/60 ring-1 ring-inset ring-rose-100 px-2.5 py-1.5 min-w-0"><span className="text-[10px] font-semibold uppercase tracking-wider text-rose-600">Before</span><p className="text-slate-600 break-words">{h.before ?? '—'}</p></div>
                      <div className="rounded-md bg-emerald-50/60 ring-1 ring-inset ring-emerald-100 px-2.5 py-1.5 min-w-0"><span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">After</span><p className="text-slate-800 break-words">{h.after ?? '—'}</p></div>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
};
