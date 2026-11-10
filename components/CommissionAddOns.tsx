import React, { useMemo, useState } from 'react';
import { MONTHS, COMMISSION_RATE } from '../constants';
import { RevenueEvent } from '../services/revenueByMonth';
import { Panel, StatGrid, Badge, Button, Dialog, EmptyState, selectCls, inputCls } from './ui/Crm';

/**
 * Yearly Summary → Add-ons: every amount added to a booking after it was made (extras, upgrades,
 * extensions, traffic tickets, damages, late return and other return charges), the 7.5% commission on
 * each, and the month it counts in. By default an add-on counts in the month it was added, so an
 * add-on entered on 3 November for an October booking is on the November statement. The action next
 * to each add-on moves it to another month; only the month changes, never the amount.
 */

type AddOnType = 'extras' | 'upgrade' | 'extension' | 'ticket' | 'damage' | 'other';
const TYPE_LABEL: Record<AddOnType, string> = { extras: 'Extras / price', upgrade: 'Upgrade', extension: 'Extension', ticket: 'Traffic ticket', damage: 'Damage', other: 'Other charge' };
const TYPE_TONE: Record<AddOnType, string> = {
  extras: 'bg-indigo-50 text-indigo-700 ring-indigo-200', upgrade: 'bg-violet-50 text-violet-700 ring-violet-200', extension: 'bg-sky-50 text-sky-700 ring-sky-200',
  ticket: 'bg-amber-50 text-amber-800 ring-amber-200', damage: 'bg-rose-50 text-rose-700 ring-rose-200', other: 'bg-slate-50 text-slate-600 ring-slate-200',
};
export const addOnType = (e: RevenueEvent): AddOnType => {
  const src = e.id.slice(e.id.indexOf(':') + 1);   // pc0, up0, ex0, late, vd:…, tt:…, rc:…
  if (e.kind === 'tickets') return 'ticket';
  if (e.kind === 'damages') return 'damage';
  if (e.kind === 'other') return 'other';
  if (src.startsWith('up')) return 'upgrade';
  if (src.startsWith('ex')) return 'extension';
  return 'extras';
};

const monthKey = (y: number, m: number) => y * 12 + m;
const monthName = (y: number, m: number) => `${MONTHS[m]} ${y}`;
const dateText = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00` : iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
};
/** Added in the first days of a month for a booking of an earlier month: the case staff most often want to check. */
const addedEarlyInNextMonth = (e: RevenueEvent) => {
  if (!e.at) return false;
  const d = new Date(e.at.length === 10 ? `${e.at}T12:00` : e.at);
  return d.getDate() <= 3 && monthKey(e.autoYear, e.autoMonth) > monthKey(e.bookingYear, e.bookingMonth);
};

const CommissionAddOns: React.FC<{
  events: RevenueEvent[];
  year: number;
  rate: number;
  money: (n: number) => string;
  canEdit: boolean;
  onMove: (e: RevenueEvent, to: { year: number; month: number } | null) => Promise<void> | void;
}> = ({ events, year, rate, money, canEdit, onMove }) => {
  const now = new Date();
  const [month, setMonth] = useState<number | 'all'>(now.getFullYear() === year ? now.getMonth() : 'all');
  const [type, setType] = useState<AddOnType | 'all'>('all');
  const [q, setQ] = useState('');
  const [moving, setMoving] = useState<RevenueEvent | null>(null);

  const addOns = useMemo(() => events.filter(e => e.kind !== 'rental'), [events]);
  // Shown in this year: the add-ons counting in it, plus the ones moved out of it (so a move can be undone from either side).
  const inYear = addOns.filter(e => e.year === year || (e.moved && e.autoYear === year));
  const list = inYear
    .filter(e => month === 'all' || (e.year === year && e.month === month) || (e.moved && e.autoYear === year && e.autoMonth === month))
    .filter(e => type === 'all' || addOnType(e) === type)
    .filter(e => !q.trim() || `${e.bookingId} ${e.customer || ''} ${e.label}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const counting = list.filter(e => e.year === year && (month === 'all' || e.month === month));
  const amount = counting.reduce((s, e) => s + e.amountUSD, 0);
  const moved = inYear.filter(e => e.moved).length;
  const early = counting.filter(addedEarlyInNextMonth).length;
  const typeCounts = (Object.keys(TYPE_LABEL) as AddOnType[]).map(t => [t, inYear.filter(e => addOnType(e) === t && e.year === year && (month === 'all' || e.month === month)).length] as const);

  return (
    <>
      <StatGrid items={[
        { label: 'Add-ons', value: String(counting.length), sub: month === 'all' ? `counting in ${year}` : `counting in ${MONTHS[month]} ${year}` },
        { label: 'Amount', value: money(amount * rate), sub: 'extras, upgrades, extensions, tickets, damages, charges' },
        { label: `Commission ${(COMMISSION_RATE * 100).toFixed(1)}%`, value: money(amount * COMMISSION_RATE * rate), sub: 'on these add-ons, in this month' },
        { label: 'Added on the 1st–3rd', value: String(early), sub: 'for last month’s bookings · counted this month', tone: early ? 'warning' : 'default' },
        { label: 'Moved by hand', value: String(moved), sub: moved ? 'to another month (see "Moved")' : 'all in the month they were added' },
      ]} />

      <section className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-[13px] text-slate-700 leading-relaxed">
        <p><b className="text-slate-900">How the month is chosen.</b> The {(COMMISSION_RATE * 100).toFixed(1)}% commission is charged on every add-on: extras, upgrades, extensions, traffic tickets, damages, late return and other return charges.
          Each add-on counts in the month it was <b>added</b>, not the month of the booking. Example: a ticket added on <b>3 November</b> for an <b>October</b> booking is November revenue, and its {(COMMISSION_RATE * 100).toFixed(1)}% is on the November statement.</p>
        <p className="mt-1 text-slate-500">To put an add-on in another month, use <b>Change month</b> next to it. Only the month moves: the amount and the commission stay the same, and the booking itself is not changed.</p>
      </section>

      <Panel title="Add-ons and commission" subtitle="Every amount added to a booking after it was made, with the month it counts in."
        footer={!canEdit ? 'You can view add-ons. Changing the month requires the “Franchise payments” permission.' : undefined}>
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <select value={String(month)} onChange={e => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="Month" className={`${selectCls} h-9`}>
            <option value="all">All of {year}</option>
            {MONTHS.map((m, i) => <option key={m} value={i}>{m} {year}</option>)}
          </select>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setType('all')} className={`h-8 px-2.5 rounded-md text-[12px] font-medium ring-1 ring-inset ${type === 'all' ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}>All types</button>
            {typeCounts.map(([t, n]) => (
              <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t}
                className={`h-8 px-2.5 rounded-md text-[12px] font-medium ring-1 ring-inset ${type === t ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}>
                {TYPE_LABEL[t]} <span className={`ml-1 tabular-nums ${type === t ? 'text-slate-300' : 'text-slate-400'}`}>{n}</span>
              </button>
            ))}
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Booking, customer or item" aria-label="Search add-ons" className={`${inputCls} h-9 sm:max-w-[240px] sm:ml-auto`} />
        </div>

        {list.length === 0 ? (
          <EmptyState title="No add-ons" hint={month === 'all' ? `Nothing was added to bookings in ${year}.` : `Nothing counts in ${MONTHS[month]} ${year}.`} />
        ) : (<>
          {/* phones */}
          <ul className="md:hidden divide-y divide-slate-100">
            {list.map(e => {
              const t = addOnType(e), out = e.year !== year || (month !== 'all' && e.month !== month);
              return (
                <li key={e.id} className={`px-4 py-3 ${out ? 'bg-slate-50/70' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className={`inline-flex px-1.5 py-px rounded text-[10.5px] font-semibold ring-1 ring-inset ${TYPE_TONE[t]}`}>{TYPE_LABEL[t]}</span>
                      <p className="mt-1 text-[13px] font-semibold text-slate-900 truncate">{e.label}</p>
                      <p className="text-[11.5px] text-slate-500 truncate">{e.bookingId}{e.customer ? ` · ${e.customer}` : ''} · {MONTHS[e.bookingMonth].slice(0, 3)} booking</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-semibold tabular-nums text-slate-900">{money(e.amountUSD * rate)}</p>
                      <p className="text-[11.5px] tabular-nums text-indigo-700">{(COMMISSION_RATE * 100).toFixed(1)}% · {money(e.amountUSD * COMMISSION_RATE * rate)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
                    <span className="text-slate-500">Added {dateText(e.at)}</span>
                    <MonthChip e={e} />
                    {canEdit && <Button size="sm" className="ml-auto" onClick={() => setMoving(e)}>Change month</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
          {/* md+ */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2.5">Added on</th><th className="px-3 py-2.5">Booking</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">Item</th>
                  <th className="px-3 py-2.5 text-right">Amount</th><th className="px-3 py-2.5 text-right">Commission {(COMMISSION_RATE * 100).toFixed(1)}%</th>
                  <th className="px-3 py-2.5">Counts in</th><th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map(e => {
                  const t = addOnType(e), out = e.year !== year || (month !== 'all' && e.month !== month);
                  return (
                    <tr key={e.id} className={`hover:bg-slate-50 ${out ? 'bg-slate-50/70 text-slate-500' : 'text-slate-700'}`}>
                      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{dateText(e.at)}
                        {addedEarlyInNextMonth(e) && <span className="block text-[11px] text-amber-700">after {MONTHS[e.bookingMonth].slice(0, 3)} closed</span>}</td>
                      <td className="px-3 py-2.5"><p className="font-mono text-[12px] font-semibold text-slate-900">{e.bookingId}</p>
                        <p className="text-[11.5px] text-slate-500">{e.customer ? `${e.customer} · ` : ''}{MONTHS[e.bookingMonth].slice(0, 3)} {e.bookingYear} booking</p></td>
                      <td className="px-3 py-2.5"><span className={`inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap ${TYPE_TONE[t]}`}>{TYPE_LABEL[t]}</span></td>
                      <td className="px-3 py-2.5 max-w-[260px]"><p className="truncate" title={e.label}>{e.label}</p></td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900">{money(e.amountUSD * rate)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-indigo-700">{money(e.amountUSD * COMMISSION_RATE * rate)}</td>
                      <td className="px-3 py-2.5"><MonthChip e={e} /></td>
                      <td className="px-4 py-2.5 text-right">{canEdit ? <Button size="sm" onClick={() => setMoving(e)}>Change month</Button> : <span className="text-[12px] text-slate-400">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-900">
                  <td className="px-4 py-2.5" colSpan={4}>Counting in {month === 'all' ? year : `${MONTHS[month]} ${year}`} · {counting.length} add-on{counting.length === 1 ? '' : 's'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(amount * rate)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-indigo-700">{money(amount * COMMISSION_RATE * rate)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>)}
      </Panel>

      {moving && <MoveDialog e={moving} money={money} rate={rate} onClose={() => setMoving(null)} onSave={async to => { await onMove(moving, to); setMoving(null); }} />}
    </>
  );
};

export const MonthChip: React.FC<{ e: RevenueEvent }> = ({ e }) => (
  <span className="inline-flex flex-col items-start">
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={e.moved ? 'info' : 'default'}>{MONTHS[e.month].slice(0, 3)} {e.year}</Badge>
      {e.moved && <span className="text-[10.5px] font-semibold uppercase tracking-wide text-sky-700">Moved</span>}
    </span>
    {e.moved && <span className="text-[11px] text-slate-500 mt-0.5">from {MONTHS[e.autoMonth].slice(0, 3)} {e.autoYear}{e.moved.by ? ` · ${e.moved.by}` : ''}</span>}
  </span>
);

export const MoveDialog: React.FC<{ e: RevenueEvent; money: (n: number) => string; rate: number; onClose: () => void; onSave: (to: { year: number; month: number } | null) => void }> = ({ e, money, rate, onClose, onSave }) => {
  // From the booking's month to twelve months after the month the add-on was added.
  const from = monthKey(e.bookingYear, e.bookingMonth), to = monthKey(e.autoYear, e.autoMonth) + 12;
  const options = Array.from({ length: to - from + 1 }, (_, i) => from + i).map(k => ({ year: Math.floor(k / 12), month: k % 12 }));
  const [pick, setPick] = useState(monthKey(e.year, e.month));
  const target = { year: Math.floor(pick / 12), month: pick % 12 };
  const isAuto = pick === monthKey(e.autoYear, e.autoMonth);
  const changed = pick !== monthKey(e.year, e.month);
  const commission = e.amountUSD * COMMISSION_RATE;
  return (
    <Dialog open onClose={onClose} size="md" title="Change the month of this add-on"
      subtitle={`${e.label} · ${e.bookingId}${e.customer ? ` · ${e.customer}` : ''}`}
      footer={<>
        {e.moved && <Button variant="ghost" className="mr-auto" onClick={() => onSave(null)}>Back to automatic ({monthName(e.autoYear, e.autoMonth)})</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!changed} onClick={() => onSave(isAuto ? null : target)}>Apply to {monthName(target.year, target.month)}</Button>
      </>}>
      <div className="space-y-4 text-[13px]">
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200 p-3">
          <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Amount</dt><dd className="font-semibold tabular-nums text-slate-900">{money(e.amountUSD * rate)}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Commission {(COMMISSION_RATE * 100).toFixed(1)}%</dt><dd className="font-semibold tabular-nums text-indigo-700">{money(commission * rate)}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Added on</dt><dd className="text-slate-800">{dateText(e.at)}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Booking month</dt><dd className="text-slate-800">{monthName(e.bookingYear, e.bookingMonth)}</dd></div>
        </dl>
        <label className="block">
          <span className="block text-[13px] font-medium text-slate-700 mb-1">Apply to month</span>
          <select value={pick} onChange={ev => setPick(Number(ev.target.value))} className={`${selectCls} w-full`}>
            {options.map(o => {
              const k = monthKey(o.year, o.month);
              const tags = [k === monthKey(e.autoYear, e.autoMonth) && 'month added (automatic)', k === from && 'booking month', k === monthKey(e.year, e.month) && 'now'].filter(Boolean).join(', ');
              return <option key={k} value={k}>{monthName(o.year, o.month)}{tags ? ` — ${tags}` : ''}</option>;
            })}
          </select>
        </label>
        {changed && (
          <p className="rounded-lg bg-indigo-50 ring-1 ring-inset ring-indigo-200 px-3 py-2 text-indigo-900">
            Moves <b>{money(e.amountUSD * rate)}</b> of revenue and <b>{money(commission * rate)}</b> commission from {monthName(e.year, e.month)} to <b>{monthName(target.year, target.month)}</b>. The booking is not changed.
          </p>
        )}
      </div>
    </Dialog>
  );
};

export default CommissionAddOns;
