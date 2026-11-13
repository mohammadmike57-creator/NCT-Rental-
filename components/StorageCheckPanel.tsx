import React, { useEffect, useState } from 'react';
import { Panel, Button, Badge, inputCls } from './ui/Crm';
import { getBookingHistory, getDeletedBookings, getStorageCheck, StorageCheck, StoredVersion } from '../services/api';

const SECTION_LABEL: Record<string, string> = {
  reservations: 'Bookings', fleet: 'Fleet', invoices: 'Invoices', trafficTickets: 'Traffic tickets', vehicleDamages: 'Vehicle damages',
  expenses: 'Expenses', franchisePayments: 'Franchise payments', messages: 'Internal messages',
};
const MODE_LABEL: Record<string, string> = {
  document: 'One document (as before) — the tables are not used',
  dual: 'Step 1 · saved in the document and in the tables',
  tables: 'Step 2 · read from the tables, checked against the document',
  'tables-only': 'Step 3 · bookings and records in the tables',
};

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** The few fields staff recognise a booking by, from a stored copy. */
const summary = (previous: string) => {
  try {
    const r = JSON.parse(previous);
    return [r.bookingId, r.personName, r.carModel, r.startDate ? `from ${String(r.startDate).slice(0, 10)}` : '', r.amount != null ? `$${r.amount}` : '']
      .filter(Boolean).join(' · ');
  } catch { return 'Stored copy'; }
};

const statusTone = (status: string) => status === 'identical' || status === 'in tables only' ? 'success' : status === 'DIFFERENT' ? 'danger' : 'muted';

/**
 * Administrator check for the data storage (P11): whether the new tables match the saved document, earlier versions
 * of a booking, and recently deleted bookings. Read only: nothing here changes data.
 */
const StorageCheckPanel: React.FC = () => {
  const [check, setCheck] = useState<StorageCheck | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bookingId, setBookingId] = useState('');
  const [versions, setVersions] = useState<StoredVersion[] | null>(null);
  const [deleted, setDeleted] = useState<StoredVersion[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError('');
    try { setCheck(await getStorageCheck()); }
    catch (e: any) { setError(e?.response?.data?.error || 'The check could not be run.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { run(); }, []);

  const lookUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingId.trim()) return;
    try { setVersions(await getBookingHistory(bookingId.trim())); } catch { setVersions([]); }
  };
  const showDeleted = async () => { try { setDeleted(await getDeletedBookings()); } catch { setDeleted([]); } };

  const off = check?.mode === 'document' && !check?.tablesReady;
  const headline = !check ? null
    : check.error ? { tone: 'danger' as const, text: `The check could not read the data: ${check.error}` }
    : off ? { tone: 'muted' as const, text: 'Not switched on. All data is kept in one document, as before.' }
    : !check.tablesReady ? { tone: 'warning' as const, text: 'Switched on; the tables fill the first time the data is read.' }
    : check.allMatch ? { tone: 'success' as const, text: 'Everything matches. The tables hold exactly the same data as the document.' }
    : { tone: 'danger' as const, text: 'A difference was found. The system keeps using the document, so nothing is wrong on screen. Send this page to support.' };

  const bookings = check?.sections?.find(s => s.section === 'reservations');
  const versionList = (list: StoredVersion[]) => list.length === 0
    ? <p className="text-slate-500">Nothing kept yet.</p>
    : <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
        {list.map((v, i) => {
          const key = `${v.bookingId}-${v.changedAt}-${i}`;
          return (
            <li key={key} className="px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={v.action === 'DELETED' ? 'danger' : 'info'}>{v.action === 'DELETED' ? 'Deleted' : 'Changed'}</Badge>
                <span className="text-slate-500 tabular-nums">{when(v.changedAt)}</span>
                <span className="min-w-0 truncate">{summary(v.previous)}</span>
                <Button size="sm" className="ml-auto" onClick={() => setOpen(open === key ? null : key)}>{open === key ? 'Hide' : 'Show the copy'}</Button>
              </div>
              {open === key && <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-50 p-2 text-[11.5px] whitespace-pre-wrap break-all">{(() => { try { return JSON.stringify(JSON.parse(v.previous), null, 2); } catch { return v.previous; } })()}</pre>}
            </li>
          );
        })}
      </ul>;

  return (
    <Panel title="Data storage check" subtitle="Read only. Shows how bookings and records are stored and whether the copies match."
      actions={<Button size="sm" onClick={run} disabled={loading}>{loading ? 'Checking…' : 'Check again'}</Button>}>
      <div className="p-4 space-y-4 text-[13px] text-slate-700">
        {error && <p className="text-rose-600" role="alert">{error}</p>}
        {check && headline && (
          <div className="space-y-1">
            <p><span className="text-slate-500">Storage setting:</span> <b>{MODE_LABEL[check.mode] || check.mode}</b></p>
            <p data-testid="storage-headline"><Badge tone={headline.tone}>{headline.tone === 'success' ? 'OK' : headline.tone === 'danger' ? 'Check' : 'Info'}</Badge> <span className="ml-1">{headline.text}</span></p>
          </div>
        )}

        {check?.sections && !off && (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-[11px] uppercase tracking-wider text-slate-500 text-left border-b border-slate-200">
                <tr><th className="py-2 pr-3">Data</th><th className="py-2 pr-3">Items</th><th className="py-2">Result</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {check.sections.map(s => (
                  <tr key={s.section}>
                    <td className="py-2 pr-3 font-medium">{SECTION_LABEL[s.section] || s.section}</td>
                    <td className="py-2 pr-3 tabular-nums">{s.items ?? '—'}</td>
                    <td className="py-2"><Badge tone={statusTone(s.status)}>{s.status === 'identical' ? 'Identical' : s.status === 'DIFFERENT' ? 'Different' : s.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {bookings?.months && bookings.months.length > 0 && !off && (
          <details>
            <summary className="cursor-pointer font-medium text-slate-900">Bookings and totals per month</summary>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-[12.5px] tabular-nums">
                <thead className="text-[11px] uppercase tracking-wider text-slate-500 text-left border-b border-slate-200">
                  <tr><th className="py-1.5 pr-3">Month</th><th className="py-1.5 pr-3">Bookings (document / tables)</th><th className="py-1.5">Total (document / tables)</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bookings.months.map(m => {
                    const same = m.bookings === m.bookingsInTables && m.amount === m.amountInTables;
                    return (
                      <tr key={m.month} className={same ? '' : 'text-rose-700 font-semibold'}>
                        <td className="py-1.5 pr-3">{m.month}</td>
                        <td className="py-1.5 pr-3">{m.bookings} / {m.bookingsInTables}</td>
                        <td className="py-1.5">{m.amount.toFixed(2)} / {m.amountInTables.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {!off && (
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <form onSubmit={lookUp} className="flex flex-wrap gap-2 items-center">
              <label htmlFor="history-booking" className="font-medium text-slate-900">Earlier versions of a booking</label>
              <input id="history-booking" className={`${inputCls} flex-1 min-w-[180px]`} placeholder="Booking number" value={bookingId} onChange={e => setBookingId(e.target.value)} />
              <Button type="submit" disabled={!bookingId.trim()}>Show</Button>
            </form>
            {versions && versionList(versions)}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900">Recently deleted bookings</span>
              <span className="text-slate-500">({check?.deletedBookingsKept ?? 0} kept)</span>
              <Button size="sm" onClick={showDeleted}>Show</Button>
            </div>
            {deleted && versionList(deleted)}
          </div>
        )}
      </div>
    </Panel>
  );
};

export default StorageCheckPanel;
