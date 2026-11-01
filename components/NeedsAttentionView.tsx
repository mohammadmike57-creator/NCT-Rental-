import React, { useMemo, useState } from 'react';
import { AppData, RentalSource, Reservation } from '../types';
import { Page, PageHeader, StatGrid, Panel, Badge, Button, EmptyState, table, inputCls, selectCls } from './ui/Crm';
import { BookingIssues, GROUP_LABEL, ISSUES, IssueCode, IssueGroup, findIssues } from '../services/reservationIssues';

const fmt = (s?: string) => {
  const d = s ? new Date(s) : null;
  return d && Number.isFinite(d.getTime()) ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
};
const money = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
const TONE: Record<IssueGroup, 'danger' | 'warning' | 'info'> = { summary: 'danger', operation: 'warning', details: 'info' };

/** Every booking that is not counted right in the summary, needs an action, or is missing details. */
const NeedsAttentionView: React.FC<{
  allData: AppData;
  sources: RentalSource[];
  /** Opens the booking in Reservations (its month, searched by number). */
  onOpenBooking: (r: Reservation, year: number, month: string) => void;
  onOpenAgreement: (r: Reservation, year: number, month: string) => void;
}> = ({ allData, sources, onOpenBooking, onOpenAgreement }) => {
  const all = useMemo(() => findIssues(allData, sources), [allData, sources]);
  const [group, setGroup] = useState<IssueGroup | ''>('');
  const [code, setCode] = useState<IssueCode | ''>('');
  const [year, setYear] = useState('');
  const [q, setQ] = useState('');

  const years = useMemo(() => [...new Set(all.map(x => x.year))].sort((a, b) => b - a), [all]);
  const inYear = all.filter(x => !year || String(x.year) === year);
  const term = q.trim().toLowerCase();
  const shown = inYear.filter(x =>
    (!group || x.issues.some(c => ISSUES[c].group === group))
    && (!code || x.issues.includes(code))
    && (!term || [x.r.bookingId, x.r.personName, x.r.source, x.r.carModel, x.r.licensePlate].some(v => String(v || '').toLowerCase().includes(term))));

  const countGroup = (g: IssueGroup) => inYear.filter(x => x.issues.some(c => ISSUES[c].group === g)).length;
  const countCode = (c: IssueCode) => inYear.filter(x => x.issues.includes(c) && (!group || ISSUES[c].group === group)).length;
  const missingFromSummary = inYear.filter(x => x.issues.some(c => c === 'PENDING' || c === 'NO_STATUS' || c === 'AWAITING_CONFIRMATION' || c === 'NO_AMOUNT' || c === 'NEGATIVE_AMOUNT'));
  const missingValue = missingFromSummary.reduce((s, x) => s + (typeof x.r.amount === 'number' && x.r.amount > 0 ? x.r.amount : 0), 0);

  const pickGroup = (g: IssueGroup) => { setGroup(prev => (prev === g ? '' : g)); setCode(''); };
  const codes = (Object.keys(ISSUES) as IssueCode[]).filter(c => countCode(c) > 0);

  return (
    <Page>
      <PageHeader section="Core Operations" title="Needs Attention"
        subtitle="Bookings that are not counted right in the Yearly Summary, need an action, or are missing details. Cancelled and no-show bookings are not listed." />
      <StatGrid items={[
        { label: 'Bookings to check', value: inYear.length, sub: year ? `in ${year}` : 'all years', tone: inYear.length ? 'warning' : 'success', active: !group, onClick: () => { setGroup(''); setCode(''); } },
        { label: GROUP_LABEL.summary, value: countGroup('summary'), sub: missingFromSummary.length ? `${missingFromSummary.length} not counted · ${money(missingValue)}` : 'all counted', tone: countGroup('summary') ? 'danger' : 'default', active: group === 'summary', onClick: () => pickGroup('summary') },
        { label: GROUP_LABEL.operation, value: countGroup('operation'), sub: 'check-out, check-in, payment type', tone: countGroup('operation') ? 'warning' : 'default', active: group === 'operation', onClick: () => pickGroup('operation') },
        { label: GROUP_LABEL.details, value: countGroup('details'), sub: 'name, dates, source, plate', active: group === 'details', onClick: () => pickGroup('details') },
      ]} />

      <Panel title="Bookings" subtitle={`${shown.length} shown`}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
          <input className={`${inputCls} !w-72 max-w-full`} placeholder="Search booking, customer, source, car…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
          <select className={selectCls} value={year} onChange={e => setYear(e.target.value)} aria-label="Year">
            <option value="">All years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {(group || code || q || year) && <Button size="sm" variant="ghost" onClick={() => { setGroup(''); setCode(''); setQ(''); setYear(''); }}>Clear</Button>}
        </div>
        {codes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-slate-100" role="group" aria-label="Problem">
            {codes.map(c => (
              <button key={c} type="button" onClick={() => setCode(prev => (prev === c ? '' : c))} aria-pressed={code === c} title={ISSUES[c].fix}
                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs font-medium ${code === c ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                {ISSUES[c].label} <span className="tabular-nums opacity-70">{countCode(c)}</span>
              </button>
            ))}
          </div>
        )}
        {shown.length === 0 ? (
          <EmptyState title={all.length === 0 ? 'Everything is in order' : 'No bookings match'}
            hint={all.length === 0 ? 'Every booking is confirmed, priced, filed in its pick-up month and up to date.' : 'Change the search or filters.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className={`${table.wrap} min-w-[960px]`}>
              <thead className={table.head}><tr>{['Booking', 'Customer', 'Rental', 'Amount', 'Status', 'What to fix', ''].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
              <tbody className={table.body}>
                {shown.slice(0, 500).map((x: BookingIssues) => (
                  <tr key={`${x.year}-${x.month}-${x.r.id}`} className={`${table.row} align-top`}>
                    <td className={`${table.td} whitespace-nowrap`}>
                      <p className="font-mono text-xs font-semibold text-slate-900">{x.r.bookingId || '—'}</p>
                      <p className="text-[11px] text-slate-500">{x.r.source || 'No source'} · filed {x.month.slice(0, 3)} {x.year}</p>
                    </td>
                    <td className={table.td}>
                      <p className="text-slate-900">{x.r.personName || '—'}</p>
                      <p className="text-[11px] text-slate-500">{[x.r.carModel, x.r.licensePlate].filter(Boolean).join(' · ') || 'No car'}</p>
                    </td>
                    <td className={`${table.td} whitespace-nowrap text-xs tabular-nums`}>
                      <p className="text-slate-800">{fmt(x.r.startDate)}</p>
                      <p className="text-slate-500">→ {fmt(x.r.endDate)}</p>
                    </td>
                    <td className={`${table.td} text-right tabular-nums whitespace-nowrap`}>{money(x.r.amount)}</td>
                    <td className={table.td}>
                      <Badge tone={x.r.dropOffCompleted ? 'muted' : x.r.voucherSubmitted ? 'success' : String(x.r.status) === 'CONFIRMED' ? 'info' : 'warning'}>
                        {x.r.dropOffCompleted ? 'Closed' : x.r.voucherSubmitted ? 'On rent' : String(x.r.status || 'No status').toLowerCase().replace(/^./, c => c.toUpperCase())}
                      </Badge>
                    </td>
                    <td className={`${table.td} min-w-[300px]`}>
                      <ul className="space-y-1">
                        {x.issues.map(c => (
                          <li key={c} className="text-xs text-slate-600">
                            <Badge tone={TONE[ISSUES[c].group]} className="mr-1.5">{ISSUES[c].label}</Badge>{ISSUES[c].fix}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className={`${table.td} text-right whitespace-nowrap`}>
                      {x.r.voucherSubmitted && <Button size="sm" variant="ghost" onClick={() => onOpenAgreement(x.r, x.year, x.month)}>Agreement</Button>}
                      <Button size="sm" onClick={() => onOpenBooking(x.r, x.year, x.month)}>Open</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length > 500 && <p className="px-4 py-2 text-xs text-slate-500">Showing the first 500. Narrow the list with the filters.</p>}
          </div>
        )}
      </Panel>
    </Page>
  );
};

export default NeedsAttentionView;
