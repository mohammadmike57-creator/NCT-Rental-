import React, { useState } from 'react';
import { Button, Dialog, Field, inputCls, selectCls, textareaCls } from '../../ui/Crm';
import { PRICE_CHANNELS, PriceChannelType, SEASON_KINDS, SeasonKind, SeasonRule, describeAdjust } from '../../../services/dynamicPricing';
import { AdjustInput, BaseInput, Chips, DayStrip, Explainer, NumOpt, Switch, exRate, fieldCls, fmtDate, kindTone, money, r2 } from './rateRulesKit';

/** Rate rules → Seasons: explainer, timeline and the rule dialog. */
// ---------------------------------------------------------------- seasons explainer

export const SeasonExplainer: React.FC<{ rules: SeasonRule[]; base: number; setBase: (n: number) => void }> = ({ rules, base, setBase }) => {
  const own = [...rules].filter(r => r.active && r.adjust.type !== 'none').sort((a, b) => a.priority - b.priority)[0];
  const rule = own || ({ name: 'Eid', adjust: { type: 'percent', value: 50 } } as SeasonRule);
  const seasonRate = exRate(base, rule.adjust);
  const days = Array.from({ length: 12 }, (_, i) => ({ label: `Day ${i + 1}`, rate: i >= 9 ? seasonRate : base, hit: i >= 9 }));
  const total = r2(9 * base + 3 * seasonRate);
  const high = exRate(base, { type: 'percent', value: 40 }), eid = exRate(base, { type: 'percent', value: 50 }), both = exRate(base, { type: 'percent', value: 90 });
  return (
    <Explainer title="Seasons & events: a different price on special dates" exampleTitle={own ? `Example with "${own.name}"` : 'Example'}
      example={<div className="space-y-2">
        <p className="text-[12px] text-slate-600">A 12-day rental. {rule.name} ({describeAdjust(rule.adjust)}) covers the last 3 days:</p>
        <DayStrip days={days} />
        <p className="text-[12px] text-slate-700 tabular-nums">9 days × {money(base)} + 3 days × {money(seasonRate)} = <b>{money(total)}</b></p>
        <BaseInput value={base} onChange={setBase} />
      </div>}>
      <p>Give a season or an event its dates and a change, for example <b>Eid Al-Fitr +50%</b>, <b>High season +40%</b> or <b>Low season −20%</b>. Only the rental days inside those dates change: <b>daily price = base rate × (1 + %)</b>.</p>
      <p>When two rules cover the same day, only the one with <b>priority 1</b> counts. Eid inside high season is charged at the Eid rate ({money(eid)}), never both together ({money(both)}). Days in high season only keep {money(high)}.</p>
      <p className="text-slate-500">Each rule can be limited to some car groups, branches or channels, a minimum or maximum rental length, and can skip blackout dates. Paused rules are kept but not used.</p>
    </Explainer>
  );
};

// ---------------------------------------------------------------- seasonal timeline

export const SeasonTimeline: React.FC<{ rules: SeasonRule[] }> = ({ rules }) => {
  const dates = rules.flatMap(r => [r.from, r.to]).sort();
  const start = new Date(`${dates[0].slice(0, 7)}-01T00:00`);
  const endD = new Date(`${dates[dates.length - 1]}T00:00`);
  const end = new Date(endD.getFullYear(), endD.getMonth() + 1, 1);
  const span = Math.max(1, end.getTime() - start.getTime());
  const pos = (s: string, plus = 0) => ((new Date(`${s}T00:00`).getTime() + plus - start.getTime()) / span) * 100;
  const months: Date[] = [];
  for (let d = new Date(start); d < end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);
  const sorted = [...rules].sort((a, b) => a.priority - b.priority || a.from.localeCompare(b.from));
  return (
    <div className="px-5 py-4">
      <div className="relative h-5 text-[10px] text-slate-400">
        {months.map(m => <span key={m.toISOString()} className="absolute top-0" style={{ left: `${pos(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`)}%` }}>{m.toLocaleDateString('en-GB', { month: 'short' })}{m.getMonth() === 0 || m === months[0] ? ` ${m.getFullYear()}` : ''}</span>)}
      </div>
      <div className="relative space-y-1">
        {months.map(m => <span key={m.toISOString()} className="absolute top-0 bottom-0 border-l border-slate-100" style={{ left: `${pos(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`)}%` }} />)}
        {sorted.map(r => {
          const left = pos(r.from), width = Math.max(1.2, pos(r.to, 86400000) - pos(r.from));
          const label = `${r.priority} · ${r.name}`;
          const inside = width >= 12;
          const flip = left + width > 70;   // near the right edge: put the name on the left of the bar
          return (
            <div key={r.id} className="relative h-5">
              <span title={`${r.name}: ${r.from} → ${r.to}, ${describeAdjust(r.adjust)}, priority ${r.priority}`}
                className={`absolute top-0 h-5 rounded ${kindTone(r.kind)} ${r.active ? '' : 'opacity-40'} text-white text-[10px] font-semibold px-1.5 leading-5 truncate`}
                style={{ left: `${left}%`, width: `${width}%` }}>
                {inside ? label : ''}
              </span>
              {!inside && (
                <span className={`absolute top-0 h-5 leading-5 text-[10px] font-semibold whitespace-nowrap ${r.active ? 'text-slate-700' : 'text-slate-400'}`}
                  style={flip ? { right: `${100 - left + 0.5}%` } : { left: `${left + width + 0.5}%` }}>{label}{r.active ? '' : ' (paused)'}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- rule dialog

export const RuleDialog: React.FC<{ base: number; rule: SeasonRule; groups: string[]; locations: string[]; onClose: () => void; onSave: (r: SeasonRule) => void }> = ({ base, rule, groups, locations, onClose, onSave }) => {
  const [r, setR] = useState<SeasonRule>(rule);
  const [blackout, setBlackout] = useState('');
  const set = (p: Partial<SeasonRule>) => setR(x => ({ ...x, ...p }));
  const invalid = !r.name.trim() ? 'Give the rule a name.' : !r.from || !r.to ? 'Set both dates.' : r.to < r.from ? 'The end date is before the start date.'
    : r.adjust.type === 'none' ? 'Choose how the rate changes.' : r.adjust.type === 'percent' && r.adjust.value <= -100 ? 'A decrease must be less than 100%.' : r.minDays && r.maxDays && r.maxDays < r.minDays ? 'Maximum days is below minimum days.' : '';
  return (
    <Dialog open onClose={onClose} title={rule.name ? `Edit ${rule.name}` : 'New seasonal rule'} subtitle="Dates are inclusive. The rule changes only the rental days that fall inside them." size="xl"
      footer={<><span className="mr-auto text-[12px] text-rose-600">{invalid}</span><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!!invalid} onClick={() => onSave({ ...r, name: r.name.trim() })}>Save rule</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Rule name" required><input value={r.name} onChange={e => set({ name: e.target.value })} placeholder="Eid Al-Fitr 2027" className={inputCls} autoFocus /></Field>
        <Field label="Type">
          <select value={r.kind} onChange={e => set({ kind: e.target.value as SeasonKind })} className={`${selectCls} w-full`}>
            {SEASON_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Start date" required><input type="date" value={r.from} onChange={e => set({ from: e.target.value })} className={inputCls} /></Field>
        <Field label="End date" required hint="inclusive"><input type="date" value={r.to} onChange={e => set({ to: e.target.value })} className={inputCls} /></Field>
        <Field label="Rate" hint="± percent of the base rate: daily price = base × (1 + %). Or a fixed daily rate, or ± amount a day (in each channel's currency)">
          <AdjustInput value={r.adjust} onChange={adjust => set({ adjust })} allowNone={false} label="Rate" />
        </Field>
        <div className="sm:col-span-2 rounded-md bg-violet-50 border border-violet-100 px-3 py-2 text-[13px] text-violet-900">
          <b>Example:</b> a car at <b>{base}</b> a day costs <b>{money(exRate(base, r.adjust))}</b> a day
          {r.from && r.to && r.to >= r.from ? <> from {fmtDate(r.from)} to {fmtDate(r.to)} ({Math.round((new Date(`${r.to}T12:00`).getTime() - new Date(`${r.from}T12:00`).getTime()) / 86400000) + 1} days)</> : ''}.
          Days outside these dates keep their normal rate.
        </div>
        <Field label="Priority" hint="1 = highest; it wins over every other rule on the same day">
          <input type="number" min={1} value={r.priority} onChange={e => set({ priority: Math.max(1, Number(e.target.value) || 1) })} className={`${inputCls} tabular-nums`} />
        </Field>
        <Field label="Minimum rental days" hint="optional"><NumOpt value={r.minDays} onChange={n => set({ minDays: n })} label="Minimum rental days" w="w-full" /></Field>
        <Field label="Maximum rental days" hint="optional"><NumOpt value={r.maxDays} onChange={n => set({ maxDays: n })} label="Maximum rental days" w="w-full" /></Field>
        <div className="sm:col-span-2"><Field label="Car groups"><Chips options={groups.map(g => [g, g])} value={r.groups} onChange={v => set({ groups: v })} allLabel="All groups" /></Field></div>
        <div className="sm:col-span-2"><Field label="Pick-up locations"><Chips options={locations.map(l => [l, l])} value={r.locations} onChange={v => set({ locations: v })} allLabel="All locations" /></Field></div>
        <div className="sm:col-span-2"><Field label="Sales channels"><Chips options={PRICE_CHANNELS} value={r.channels} onChange={v => set({ channels: v as PriceChannelType[] })} allLabel="All channels" /></Field></div>
        <div className="sm:col-span-2">
          <Field label="Blackout dates" hint="days inside the period the rule does not apply on">
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={blackout} onChange={e => setBlackout(e.target.value)} className={`${fieldCls} h-8 text-[12px]`} aria-label="Blackout date" />
              <Button size="sm" disabled={!blackout || r.blackout.includes(blackout)} onClick={() => { set({ blackout: [...r.blackout, blackout].sort() }); setBlackout(''); }}>Add</Button>
              {r.blackout.map(d => (
                <span key={d} className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-slate-100 text-[12px] tabular-nums">{d}
                  <button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => set({ blackout: r.blackout.filter(x => x !== d) })} aria-label={`Remove ${d}`}>×</button></span>
              ))}
            </div>
          </Field>
        </div>
        <div className="sm:col-span-2"><Field label="Notes" hint="optional"><textarea value={r.notes || ''} onChange={e => set({ notes: e.target.value || undefined })} rows={2} className={textareaCls} /></Field></div>
        <label className="sm:col-span-2 inline-flex items-center gap-2 text-[13px] text-slate-700"><Switch on={r.active} onChange={b => set({ active: b })} label="Active" /> Active</label>
      </div>
    </Dialog>
  );
};
