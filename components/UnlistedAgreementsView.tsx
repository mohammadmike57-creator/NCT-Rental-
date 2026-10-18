import React, { useMemo, useState } from 'react';
import { AppData, Fleet, RentalLocation, RentalSource, Reservation, ReservationStatus, User } from '../types';
import { Page, PageHeader, StatGrid, Panel, Tabs, Toolbar, Badge, Button, Plate, EmptyState, Dialog, Field, Segmented, inputCls, selectCls, textareaCls, table } from './ui/Crm';
import { matchScore } from '../services/agreementLink';
import { DocumentReportIcon, PlusIcon, SearchIcon } from './icons';

type Located = { res: Reservation; year: number; month: string };

interface Props {
  allData: AppData;
  sources: RentalSource[];
  rentalLocations: RentalLocation[];
  fleet: Fleet;
  currentUser: User | null;
  canEdit: boolean;
  onOpenAgreement: (res: Reservation, year: number, month: string) => void;
  onList: (updated: Reservation, original: Reservation) => Promise<void>;
  onSaveDraft: (updated: Reservation) => Promise<void>;
  /** Moves the agreement onto a reservation that is already in the system and removes the temporary record. */
  onLink: (target: Reservation, agreement: Reservation) => Promise<void>;
  onReject: (res: Reservation) => void;
  onNewWalkIn: () => void;
}

const WALK_REF = /^WALK-/i;
const money = (n?: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const ago = (iso?: string) => {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
};

/** Booking details still missing before an unlisted agreement can become a normal reservation. */
export function missingDetails(r: Reservation, sources: RentalSource[]): { key: string; label: string; blocking: boolean }[] {
  const out: { key: string; label: string; blocking: boolean }[] = [];
  const sourceKnown = !!r.source && sources.some(s => s.id === r.source || s.name === r.source);
  if (!r.bookingId?.trim() || WALK_REF.test(r.bookingId)) out.push({ key: 'bookingId', label: 'Booking ref.', blocking: false });
  if (!sourceKnown) out.push({ key: 'source', label: 'Source', blocking: true });
  if (!(r.amount > 0)) out.push({ key: 'amount', label: 'Amount', blocking: true });
  if (!r.customerEmail?.trim()) out.push({ key: 'customerEmail', label: 'Email', blocking: false });
  if (!r.contactNumber?.trim()) out.push({ key: 'contactNumber', label: 'Phone', blocking: false });
  if (!r.locationName?.trim()) out.push({ key: 'locationName', label: 'Branch', blocking: true });
  if (!r.carModel?.trim()) out.push({ key: 'carModel', label: 'Vehicle', blocking: true });
  return out;
}

const agreementState = (r: Reservation) =>
  r.dropOffCompleted ? { label: 'Returned', tone: 'muted' as const } : r.voucherSubmitted ? { label: 'On rent', tone: 'success' as const } : { label: 'Not checked out', tone: 'info' as const };

const UnlistedAgreementsView: React.FC<Props> = ({ allData, sources, rentalLocations, fleet, currentUser, canEdit, onOpenAgreement, onList, onSaveDraft, onLink, onReject, onNewWalkIn }) => {
  const [tab, setTab] = useState<'waiting' | 'listed' | 'rejected'>('waiting');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Located | null>(null);

  const all: Located[] = useMemo(() => {
    const list: Located[] = [];
    Object.entries(allData || {}).forEach(([y, months]) => Object.entries(months || {}).forEach(([m, items]) => {
      (Array.isArray(items) ? items : []).forEach((res: Reservation) => {
        if (res.awaitingConfirmation || res.unlistedCreatedAt || res.uploadBatchId === 'UNLISTED') list.push({ res, year: Number(y), month: m });
      });
    }));
    return list.sort((a, b) => (b.res.unlistedCreatedAt || b.res.createdAt || '').localeCompare(a.res.unlistedCreatedAt || a.res.createdAt || ''));
  }, [allData]);

  const groups = useMemo(() => ({
    waiting: all.filter(x => x.res.awaitingConfirmation && x.res.status !== ReservationStatus.CANCELLED),
    listed: all.filter(x => !x.res.awaitingConfirmation && x.res.status !== ReservationStatus.CANCELLED),
    rejected: all.filter(x => x.res.status === ReservationStatus.CANCELLED),
  }), [all]);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const waiting = groups.waiting;
  const stats = {
    waiting: waiting.length,
    onRent: waiting.filter(x => x.res.voucherSubmitted && !x.res.dropOffCompleted).length,
    returned: waiting.filter(x => x.res.dropOffCompleted).length,
    missing: waiting.filter(x => missingDetails(x.res, sources).some(m => m.blocking)).length,
    listedMonth: groups.listed.filter(x => (x.res.confirmedAt || '').slice(0, 7) === thisMonth).length,
  };

  const term = q.trim().toLowerCase();
  const rows = groups[tab].filter(({ res }) => !term || [res.bookingId, res.personName, res.contactNumber, res.licensePlate, res.carModel].some(v => (v || '').toLowerCase().includes(term)));
  const sourceName = (s?: string) => sources.find(x => x.id === s)?.name || s || '—';

  const Actions: React.FC<{ item: Located }> = ({ item }) => (
    <div className="flex items-center justify-end gap-1.5">
      <Button size="sm" icon={<DocumentReportIcon className="w-3.5 h-3.5" />} onClick={() => onOpenAgreement(item.res, item.year, item.month)}>Agreement</Button>
      {tab === 'waiting' && canEdit && (
        <>
          <Button size="sm" variant="primary" icon={<PlusIcon className="w-3.5 h-3.5" />} onClick={() => setEditing(item)}>Add reservation</Button>
          <button onClick={() => onReject(item.res)} className="h-8 px-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50">Reject</button>
        </>
      )}
    </div>
  );

  return (
    <Page>
      <PageHeader
        section="Core Operations"
        title="Unlisted agreements"
        subtitle="Agreements opened at the counter before the booking was entered in the system. The reservations team links each one to its booking, or creates the reservation from it."
        actions={<Button variant="primary" icon={<PlusIcon className="w-4 h-4" />} onClick={onNewWalkIn}>Open agreement without reservation</Button>}
      />

      <StatGrid items={[
        { label: 'Waiting to be listed', value: stats.waiting, sub: 'agreements without a reservation', tone: stats.waiting ? 'warning' : 'default', active: tab === 'waiting', onClick: () => setTab('waiting') },
        { label: 'On rent', value: stats.onRent, sub: 'car is with the customer' },
        { label: 'Returned', value: stats.returned, sub: 'closed, still not listed', tone: stats.returned ? 'danger' : 'default' },
        { label: 'Missing details', value: stats.missing, sub: 'source, amount, branch or car', tone: stats.missing ? 'warning' : 'default' },
        { label: 'Listed this month', value: stats.listedMonth, sub: 'now normal reservations', tone: 'success', active: tab === 'listed', onClick: () => setTab('listed') },
      ]} />

      <Panel>
        <Tabs value={tab} onChange={k => setTab(k as typeof tab)} tabs={[
          { key: 'waiting', label: 'Waiting', count: groups.waiting.length },
          { key: 'listed', label: 'Listed', count: groups.listed.length },
          { key: 'rejected', label: 'Rejected', count: groups.rejected.length },
        ]} />
        <Toolbar>
          <div className="relative w-full md:w-80">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search customer, reference, phone or plate" className={`${inputCls} pl-9`} />
          </div>
          <span className="md:ml-auto text-xs text-slate-500">{rows.length} agreement{rows.length === 1 ? '' : 's'}</span>
        </Toolbar>

        {rows.length === 0 ? (
          <EmptyState icon={<DocumentReportIcon />}
            title={tab === 'waiting' ? 'Nothing waiting to be listed' : tab === 'listed' ? 'No listed agreements yet' : 'No rejected agreements'}
            hint={tab === 'waiting' ? 'When the counter opens an agreement for a booking that is not in the system yet, it appears here until the reservations team lists it.' : undefined} />
        ) : (
          <>
            <table className={`hidden lg:table ${table.wrap}`}>
              <thead><tr className={table.head}>
                <th className={table.th}>Reference</th><th className={table.th}>Customer</th><th className={table.th}>Vehicle</th>
                <th className={table.th}>Period</th><th className={table.th}>Agreement</th>
                <th className={table.th}>{tab === 'waiting' ? 'Missing details' : tab === 'listed' ? 'Listed' : 'Rejected'}</th>
                <th className={table.th}><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody className={table.body}>
                {rows.map(item => {
                  const { res } = item;
                  const miss = missingDetails(res, sources);
                  const st = agreementState(res);
                  return (
                    <tr key={res.id} className={table.row}>
                      <td className={table.td}>
                        <p className="font-mono font-semibold text-slate-900 whitespace-nowrap">{res.bookingId}</p>
                        <p className="text-[11px] text-slate-500">{sourceName(res.source)} · by {res.unlistedCreatedBy || res.createdBy || 'staff'} {ago(res.unlistedCreatedAt || res.createdAt)}</p>
                      </td>
                      <td className={table.td}>
                        <p className="font-medium text-slate-900 truncate max-w-[12rem]">{res.personName}</p>
                        <p className="text-[11px] text-slate-500 truncate max-w-[12rem]">{res.contactNumber || res.customerEmail || '—'}</p>
                      </td>
                      <td className={table.td}>
                        <p className="text-slate-800 truncate max-w-[10rem]">{res.carModel || '—'}</p>
                        <Plate value={res.licensePlate} />
                      </td>
                      <td className={`${table.td} whitespace-nowrap`}>
                        <p className="text-slate-800">{dt(res.startDate)}</p>
                        <p className="text-[11px] text-slate-500">→ {dt(res.endDate)}</p>
                      </td>
                      <td className={table.td}>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        <p className="mt-1 text-[11px] font-semibold text-slate-700 tabular-nums">{money(res.amount)}</p>
                      </td>
                      <td className={table.td}>
                        {tab === 'waiting' ? (
                          miss.length ? <div className="flex flex-wrap gap-1 max-w-[14rem]">{miss.map(m => <Badge key={m.key} tone={m.blocking ? 'warning' : 'muted'} dot={false}>{m.label}</Badge>)}</div>
                            : <Badge tone="success">Ready to list</Badge>
                        ) : (
                          <p className="text-[12px] text-slate-600">{res.confirmedBy || '—'}<span className="block text-[11px] text-slate-400">{dt(res.confirmedAt)}</span></p>
                        )}
                      </td>
                      <td className={table.td}><Actions item={item} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <ul className="lg:hidden divide-y divide-slate-100">
              {rows.map(item => {
                const { res } = item;
                const miss = missingDetails(res, sources);
                const st = agreementState(res);
                return (
                  <li key={res.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[13px] font-semibold text-slate-900">{res.bookingId}</p>
                        <p className="text-sm font-medium text-slate-900 truncate">{res.personName}</p>
                        <p className="text-xs text-slate-500 truncate">{res.carModel} {res.licensePlate ? `· ${res.licensePlate}` : ''} · {dt(res.startDate)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums">{money(res.amount)}</p>
                        <div className="mt-1"><Badge tone={st.tone}>{st.label}</Badge></div>
                      </div>
                    </div>
                    {tab === 'waiting' && miss.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{miss.map(m => <Badge key={m.key} tone={m.blocking ? 'warning' : 'muted'} dot={false}>{m.label}</Badge>)}</div>}
                    <div className="mt-2.5"><Actions item={item} /></div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>

      {editing && (
        <ListReservationDialog
          item={editing}
          allData={allData}
          sources={sources}
          rentalLocations={rentalLocations}
          fleet={fleet}
          currentUser={currentUser}
          onClose={() => setEditing(null)}
          onSaveDraft={async r => { await onSaveDraft(r); setEditing(null); }}
          onList={async r => { await onList(r, editing.res); setEditing(null); setTab('listed'); }}
          onLink={async target => { await onLink(target, editing.res); setEditing(null); setTab('listed'); }}
        />
      )}
    </Page>
  );
};

/* ------------------------------------------------------------------ */

const ListReservationDialog: React.FC<{
  item: Located;
  allData: AppData;
  sources: RentalSource[];
  rentalLocations: RentalLocation[];
  fleet: Fleet;
  currentUser: User | null;
  onClose: () => void;
  onSaveDraft: (r: Reservation) => Promise<void>;
  onList: (r: Reservation) => Promise<void>;
  onLink: (target: Reservation) => Promise<void>;
}> = ({ item, allData, sources, rentalLocations, fleet, currentUser, onClose, onSaveDraft, onList, onLink }) => {
  const original = item.res;
  const [mode, setMode] = useState<'create' | 'link'>('create');
  const [linkQ, setLinkQ] = useState('');
  const [linkId, setLinkId] = useState<string | null>(null);
  // Reservations already in the system that this agreement could belong to (no agreement of their own yet).
  const candidates = useMemo(() => {
    const list: { res: Reservation; score: number }[] = [];
    Object.values(allData || {}).forEach(months => Object.values(months || {}).forEach(items => (Array.isArray(items) ? items : []).forEach((r: Reservation) => {
      if (r.id === original.id || r.awaitingConfirmation || r.voucherSubmitted || r.status === ReservationStatus.CANCELLED) return;
      list.push({ res: r, score: matchScore(r, original) });
    })));
    return list.sort((a, b) => b.score - a.score);
  }, [allData, original]);
  const lt = linkQ.trim().toLowerCase();
  const shownCandidates = (lt
    ? candidates.filter(c => [c.res.bookingId, c.res.personName, c.res.contactNumber, c.res.customerEmail].some(v => (v || '').toLowerCase().includes(lt)))
    : candidates.filter(c => c.score >= 25)).slice(0, 8);
  const linkTarget = candidates.find(c => c.res.id === linkId)?.res;
  // Unlisted agreements store the source by name; normal reservations store its id.
  const initialSource = sources.find(s => s.id === original.source)?.id || sources.find(s => s.name === original.source)?.id || '';
  const [f, setF] = useState({
    bookingId: original.bookingId || '',
    source: initialSource,
    bookingDate: original.bookingDate || new Date().toISOString().slice(0, 10),
    personName: original.personName || '',
    contactNumber: original.contactNumber || '',
    customerEmail: original.customerEmail || '',
    carModel: original.carModel || '',
    licensePlate: original.licensePlate || '',
    startDate: (original.startDate || '').slice(0, 16),
    endDate: (original.endDate || '').slice(0, 16),
    locationName: original.locationName || '',
    amount: original.amount || 0,
    notes: original.notes || '',
  });
  const [busy, setBusy] = useState<null | 'draft' | 'list'>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(p => ({ ...p, [k]: v }));

  const otherIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(allData || {}).forEach(months => Object.values(months || {}).forEach(items => (Array.isArray(items) ? items : []).forEach((r: Reservation) => { if (r.id !== original.id && r.bookingId) ids.add(r.bookingId.trim().toLowerCase()); })));
    return ids;
  }, [allData, original.id]);
  const models = useMemo(() => Array.from(new Set((fleet || []).map((v: any) => v.modelName).filter(Boolean))).sort() as string[], [fleet]);
  const plates = useMemo(() => (fleet || []).filter((v: any) => !f.carModel || v.modelName === f.carModel).map((v: any) => v.plateNumber || v.licensePlate).filter(Boolean) as string[], [fleet, f.carModel]);

  const errors: Record<string, string> = {};
  if (!f.bookingId.trim()) errors.bookingId = 'Enter the booking reference';
  else if (otherIds.has(f.bookingId.trim().toLowerCase())) errors.bookingId = 'Another reservation already uses this reference';
  if (!f.source) errors.source = 'Choose where the booking came from';
  if (!f.personName.trim()) errors.personName = 'Enter the customer name';
  if (!f.carModel.trim()) errors.carModel = 'Choose the vehicle';
  if (!f.startDate) errors.startDate = 'Enter the pickup date';
  if (!f.endDate) errors.endDate = 'Enter the return date';
  else if (f.startDate && f.endDate <= f.startDate) errors.endDate = 'Return must be after pickup';
  if (!f.locationName) errors.locationName = 'Choose the branch';
  if (!(f.amount > 0)) errors.amount = 'Enter the rental amount';
  const warnings: string[] = [];
  if (WALK_REF.test(f.bookingId)) warnings.push('The booking still has the temporary counter reference. Replace it with the website or partner booking number.');
  if (!f.customerEmail.trim()) warnings.push('No customer email: the customer will not receive documents by email.');
  const canList = Object.keys(errors).length === 0;

  const build = (listed: boolean): Reservation => ({
    ...original,
    ...f,
    amount: Number(f.amount) || 0,
    customer: f.personName, invoice: f.bookingId, pickupDate: f.startDate, dropoffDate: f.endDate, vehicle: f.carModel,
    ...(listed ? {
      awaitingConfirmation: false,
      status: ReservationStatus.CONFIRMED,
      confirmedBy: currentUser?.fullName,
      confirmedAt: new Date().toISOString(),
    } : {}),
  });

  const fieldCls = (k: string) => `${inputCls} ${errors[k] ? 'border-amber-400 bg-amber-50/40 focus:border-amber-500 focus:ring-amber-500/20' : ''}`;
  const selCls = (k: string) => `${selectCls} w-full ${errors[k] ? 'border-amber-400 bg-amber-50/40' : ''}`;
  const Err = ({ k }: { k: string }) => errors[k] ? <span className="block mt-1 text-xs font-medium text-amber-700">{errors[k]}</span> : null;
  const missingCount = Object.keys(errors).length;
  const days = f.startDate && f.endDate ? Math.max(1, Math.ceil((new Date(f.endDate).getTime() - new Date(f.startDate).getTime()) / 86400000)) : 0;

  return (
    <Dialog open onClose={onClose} size="xl"
      title="Add to reservations"
      subtitle={<>Agreement <span className="font-mono">{original.bookingId}</span> · {original.personName} · opened by {original.unlistedCreatedBy || original.createdBy || 'staff'}</>}
      footer={mode === 'link' ? <>
        <span className="mr-auto self-center text-xs text-slate-500">{linkTarget ? <>The agreement moves to <b className="font-mono">{linkTarget.bookingId}</b>; the temporary record <span className="font-mono">{original.bookingId}</span> is removed.</> : 'Choose the reservation this agreement belongs to.'}</span>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!linkTarget || !!busy} onClick={async () => {
          if (!linkTarget) return;
          if (!window.confirm(`Link agreement ${original.bookingId} to reservation ${linkTarget.bookingId} (${linkTarget.personName})?`)) return;
          setBusy('list'); try { await onLink(linkTarget); } finally { setBusy(null); }
        }}>{busy === 'list' ? 'Linking…' : 'Link agreement'}</Button>
      </> : <>
        <span className="mr-auto self-center text-xs text-slate-500">{canList ? 'All required details are complete.' : `${missingCount} required detail${missingCount === 1 ? '' : 's'} missing`}</span>
        <Button onClick={onClose}>Cancel</Button>
        <Button disabled={!!busy} onClick={async () => { setBusy('draft'); try { await onSaveDraft(build(false)); } finally { setBusy(null); } }}>{busy === 'draft' ? 'Saving…' : 'Save without listing'}</Button>
        <Button variant="primary" disabled={!canList || !!busy} onClick={async () => { setBusy('list'); try { await onList(build(true)); } finally { setBusy(null); } }}>{busy === 'list' ? 'Listing…' : 'List reservation'}</Button>
      </>}>
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <Segmented value={mode} onChange={k => setMode(k as 'create' | 'link')} options={[
          { key: 'create', label: 'Create a new reservation' },
          { key: 'link', label: `Link to an existing reservation${candidates.some(c => c.score >= 60) ? ' · match found' : ''}` },
        ]} />
        <p className="text-xs text-slate-500">{mode === 'create' ? 'Use when the booking is not in the system yet.' : 'Use when the website or partner booking has since been entered or imported.'}</p>
      </div>
      {mode === 'link' ? (
        <div className="space-y-3">
          <div className="relative max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={linkQ} onChange={e => setLinkQ(e.target.value)} placeholder="Search booking number, customer, phone or email" className={`${inputCls} pl-9`} />
          </div>
          {shownCandidates.length === 0 ? (
            <EmptyState title={lt ? 'No reservation matches your search' : 'No likely match found'}
              hint={lt ? 'Check the booking number, or create a new reservation instead.' : 'Search for the booking, or use “Create a new reservation” if it has not been entered yet.'} />
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
              {shownCandidates.map(({ res: c, score }) => (
                <li key={c.id}>
                  <label className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${linkId === c.id ? 'bg-indigo-50/60' : 'hover:bg-slate-50'}`}>
                    <input type="radio" name="link-target" checked={linkId === c.id} onChange={() => setLinkId(c.id)} className="text-indigo-600 focus:ring-indigo-500" />
                    <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 items-center text-[13px]">
                      <div className="min-w-0"><p className="font-mono font-semibold text-slate-900">{c.bookingId}</p><p className="text-[11px] text-slate-500 truncate">{sources.find(s => s.id === c.source)?.name || c.source || '—'}</p></div>
                      <div className="min-w-0"><p className="font-medium text-slate-900 truncate">{c.personName}</p><p className="text-[11px] text-slate-500 truncate">{c.contactNumber || c.customerEmail || '—'}</p></div>
                      <div className="min-w-0"><p className="text-slate-800 truncate">{c.carModel || '—'}</p><p className="text-[11px] text-slate-500">{dt(c.startDate)} → {dt(c.endDate)}</p></div>
                      <div className="sm:text-right">{c.bookingId && c.bookingId.trim().toLowerCase() === (original.bookingId || '').trim().toLowerCase() ? <Badge tone="success">Same booking no.</Badge> : score >= 60 ? <Badge tone="success">Strong match</Badge> : score >= 25 ? <Badge tone="info">Possible match</Badge> : <Badge tone="muted">Search result</Badge>}<p className="text-[11px] text-slate-500 tabular-nums mt-0.5">{money(c.amount)}</p></div>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <b className="text-slate-800">What moves to the reservation:</b> check-out and check-in records, signatures, damage marks, checklist, fuel and km, driver documents, payment details, emails sent and return charges. The car actually handed over replaces the booked model. Booking details (number, source, price) stay as the reservation has them.
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Booking</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Booking reference" required>
                <input className={`${fieldCls('bookingId')} font-mono`} value={f.bookingId} onChange={e => set('bookingId', e.target.value)} />
                <Err k="bookingId" />
              </Field>
              <Field label="Source" required>
                <select className={selCls('source')} value={f.source} onChange={e => set('source', e.target.value)}>
                  <option value="">Select source</option>
                  {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <Err k="source" />
              </Field>
              <Field label="Booking date">
                <input type="date" className={inputCls} value={f.bookingDate} onChange={e => set('bookingDate', e.target.value)} />
              </Field>
            </div>
          </section>

          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Customer</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Name" required><input className={fieldCls('personName')} value={f.personName} onChange={e => set('personName', e.target.value)} /><Err k="personName" /></Field>
              <Field label="Phone"><input className={inputCls} value={f.contactNumber} onChange={e => set('contactNumber', e.target.value)} /></Field>
              <Field label="Email"><input type="email" className={inputCls} value={f.customerEmail} onChange={e => set('customerEmail', e.target.value)} /></Field>
            </div>
          </section>

          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Vehicle &amp; rental period</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Vehicle" required>
                <input list="ul-models" className={fieldCls('carModel')} value={f.carModel} onChange={e => set('carModel', e.target.value)} placeholder="Model" />
                <datalist id="ul-models">{models.map(m => <option key={m} value={m} />)}</datalist>
                <Err k="carModel" />
              </Field>
              <Field label="Plate">
                <input list="ul-plates" className={`${inputCls} font-mono`} value={f.licensePlate} onChange={e => set('licensePlate', e.target.value.toUpperCase())} />
                <datalist id="ul-plates">{plates.map(p => <option key={p} value={p} />)}</datalist>
              </Field>
              <Field label="Pickup" required><input type="datetime-local" className={fieldCls('startDate')} value={f.startDate} onChange={e => set('startDate', e.target.value)} /><Err k="startDate" /></Field>
              <Field label="Return" required><input type="datetime-local" className={fieldCls('endDate')} value={f.endDate} onChange={e => set('endDate', e.target.value)} /><Err k="endDate" /></Field>
              <Field label="Branch" required className="sm:col-span-2">
                <select className={selCls('locationName')} value={f.locationName} onChange={e => set('locationName', e.target.value)}>
                  <option value="">Select branch</option>
                  {rentalLocations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                  {f.locationName && !rentalLocations.some(l => l.name === f.locationName) && <option value={f.locationName}>{f.locationName}</option>}
                </select>
                <Err k="locationName" />
              </Field>
            </div>
          </section>

          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Price &amp; notes</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Rental amount (USD)" required>
                <input type="number" min={0} step="0.01" className={`${fieldCls('amount')} tabular-nums`} value={f.amount || ''} onChange={e => set('amount', parseFloat(e.target.value) || 0)} />
                <Err k="amount" />
              </Field>
              <Field label="Notes" className="sm:col-span-2"><textarea rows={2} className={textareaCls} value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
            </div>
          </section>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[13px]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Will be listed as</p>
            <p className="mt-2 font-mono font-semibold text-slate-900">{f.bookingId || '—'}</p>
            <p className="text-slate-900 font-medium">{f.personName || '—'}</p>
            <p className="text-slate-500">{f.carModel || 'No vehicle'}{f.licensePlate ? ` · ${f.licensePlate}` : ''}</p>
            <div className="mt-3 pt-3 border-t border-slate-200 space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Rental days</span><span className="font-medium tabular-nums">{days || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Status</span><span className="font-medium">Confirmed</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Agreement</span><span className="font-medium">{agreementState(original).label}</span></div>
              <div className="flex justify-between pt-1"><span className="font-semibold text-slate-900">Total</span><span className="font-semibold tabular-nums">{money(f.amount)}</span></div>
            </div>
          </div>
          {warnings.map(w => <p key={w} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{w}</p>)}
          <p className="text-xs text-slate-500">Listing moves the agreement into Reservations under its pickup month. The agreement, signatures and documents stay attached.</p>
        </aside>
      </div>
      )}
    </Dialog>
  );
};

export default UnlistedAgreementsView;
