import React, { useMemo, useState } from 'react';

/**
 * Readable view of a broker message: the same XML or JSON shown as a business document.
 * Availability answers become a price table, bookings a confirmation card, errors an error card;
 * any other message is shown as a labelled outline. Display only: nothing is changed or sent.
 */

const kids = (el: Element) => Array.from(el.children);
const find = (el: Element | null | undefined, ...names: string[]): Element | null => {
  if (!el) return null;
  for (const n of names) { const x = el.getElementsByTagNameNS('*', n)[0] || el.getElementsByTagName(n)[0]; if (x) return x; }
  return null;
};
const findAll = (el: Element | null | undefined, name: string) => (el ? Array.from(el.getElementsByTagNameNS('*', name)) : []);
const attr = (el: Element | null | undefined, ...names: string[]) => { for (const n of names) { const v = el?.getAttribute(n); if (v) return v; } return ''; };
const txt = (el: Element | null | undefined) => el?.textContent?.trim() || '';

/** "VehRentalCore" → "Vehicle rental core", "PickUpDateTime" → "Pick-up date & time". */
const WORDS: Record<string, string> = { Veh: 'Vehicle', RQ: 'request', RS: 'answer', Res: 'reservation', Ret: 'retrieve', Loc: 'location', Avail: 'availability', Pref: 'preference', Prefs: 'preferences', ID: 'ID', Conf: 'confirmation', Equip: 'equipment', TPA: 'TPA', OTA: 'OTA', Pickup: 'Pick-up', DOB: 'date of birth' };
export const humanize = (s: string) => {
  const name = s.replace(/^OTA_/, '').replace(/PickUp/g, 'Pickup ').replace(/DateTime/g, 'date & time ');
  const parts = name.match(/[A-Z]{2,}(?=[A-Z][a-z]|$|\s)|[A-Z]?[a-z]+|[A-Z]+|\d+|&/g) || [name];
  return parts.map((p, i) => { const w = WORDS[p] || p; return i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w.toLowerCase().replace(/^id$/, 'ID'); })
    .join(' ').replace(/\s+/g, ' ').trim();
};
const when = (s: string) => {
  if (!s) return '—';
  const d = new Date(s.length === 10 ? `${s}T12:00` : s);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', ...(s.length > 10 ? { hour: '2-digit', minute: '2-digit' } : {}) }) : s;
};
const money = (amount: string, cur: string) => (amount ? `${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`.trim() : '—');

// ---------------------------------------------------------------- building blocks

const Card: React.FC<{ title: string; tone?: 'ok' | 'bad' | 'neutral'; badge?: React.ReactNode; children: React.ReactNode }> = ({ title, tone = 'neutral', badge, children }) => (
  <section className={`rounded-xl ring-1 ring-inset overflow-hidden ${tone === 'bad' ? 'ring-rose-200 bg-rose-50/40' : 'ring-slate-200 bg-white'}`}>
    <header className={`flex flex-wrap items-center gap-2 px-4 py-2.5 border-b ${tone === 'bad' ? 'border-rose-200' : 'border-slate-100 bg-slate-50/60'}`}>
      <h4 className="text-[13px] font-semibold text-slate-900">{title}</h4>{badge}
    </header>
    <div className="px-4 py-3">{children}</div>
  </section>
);
const Facts: React.FC<{ rows: [string, React.ReactNode][] }> = ({ rows }) => (
  <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
    {rows.filter(([, v]) => v !== '' && v != null).map(([k, v]) => (
      <div key={k} className="min-w-0"><dt className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{k}</dt><dd className="text-[13px] text-slate-900 break-words">{v}</dd></div>
    ))}
  </dl>
);
const Pill: React.FC<{ tone: 'ok' | 'bad' | 'warn' | 'neutral'; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`inline-flex items-center gap-1.5 h-5 px-2 rounded-full text-[11px] font-semibold ring-1 ring-inset ${{ ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200', bad: 'bg-rose-50 text-rose-700 ring-rose-200', warn: 'bg-amber-50 text-amber-800 ring-amber-200', neutral: 'bg-slate-50 text-slate-600 ring-slate-200' }[tone]}`}>{children}</span>
);

// ---------------------------------------------------------------- known OTA messages

const Errors: React.FC<{ root: Element }> = ({ root }) => {
  const errs = [...findAll(root, 'Error'), ...findAll(root, 'Fault')];
  const warns = findAll(root, 'Warning');
  if (!errs.length && !warns.length) return null;
  return (
    <Card title={errs.length ? 'The request was refused' : 'Warnings'} tone={errs.length ? 'bad' : 'neutral'} badge={errs.length ? <Pill tone="bad">{errs.length} error{errs.length === 1 ? '' : 's'}</Pill> : <Pill tone="warn">{warns.length}</Pill>}>
      <ul className="space-y-2">
        {[...errs, ...warns].map((e, i) => (
          <li key={i} className="flex gap-3 text-[13px]">
            <span className={`shrink-0 mt-0.5 font-mono text-[11.5px] font-semibold px-1.5 rounded ${e.localName === 'Warning' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700'}`}>{attr(e, 'Code') || txt(find(e, 'faultcode')) || '—'}</span>
            <span className="text-slate-800">{attr(e, 'ShortText') || txt(find(e, 'faultstring')) || txt(e)}{attr(e, 'Type') && <span className="text-slate-400"> · OTA error type {attr(e, 'Type')}</span>}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
};

const Trip: React.FC<{ root: Element }> = ({ root }) => {
  const core = find(root, 'VehRentalCore');
  if (!core) return null;
  const pu = find(core, 'PickUpLocation'), rt = find(core, 'ReturnLocation');
  const days = (() => { const a = new Date(attr(core, 'PickUpDateTime')).getTime(), b = new Date(attr(core, 'ReturnDateTime')).getTime(); return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.ceil((b - a) / 86400000) : 0; })();
  const age = attr(find(root, 'DriverType'), 'Age');
  return (
    <Card title="Trip">
      <Facts rows={[
        ['Pick-up', <>{when(attr(core, 'PickUpDateTime'))}{attr(pu, 'LocationCode') && <span className="ml-1.5 font-mono text-[12px] text-slate-500">{attr(pu, 'LocationCode')}</span>}</>],
        ['Return', <>{when(attr(core, 'ReturnDateTime'))}{attr(rt, 'LocationCode') && <span className="ml-1.5 font-mono text-[12px] text-slate-500">{attr(rt, 'LocationCode')}</span>}</>],
        ['Rental length', days ? `${days} day${days === 1 ? '' : 's'}` : ''],
        ['Driver age', age],
      ]} />
    </Card>
  );
};

const Availability: React.FC<{ root: Element }> = ({ root }) => {
  const vendor = find(root, 'Vendor');
  const cars = findAll(root, 'VehAvail').map(va => {
    const core = find(va, 'VehAvailCore'), v = find(va, 'Vehicle'), tc = find(va, 'TotalCharge'), ch = find(va, 'VehicleCharge');
    const unit = find(va, 'Calculation');
    return {
      sipp: attr(v, 'Code'), model: attr(find(va, 'VehMakeModel'), 'Name'), status: attr(core, 'Status'),
      gear: attr(v, 'TransmissionType'), ac: attr(v, 'AirConditionInd') === 'true',
      daily: attr(unit, 'UnitCharge'), total: attr(tc, 'RateTotalAmount', 'EstimatedTotalAmount') || attr(ch, 'Amount'),
      cur: attr(tc, 'CurrencyCode') || attr(ch, 'CurrencyCode'), offer: findAll(va, 'Reference').map(r => attr(r, 'ID')).find(Boolean) || '',
      unlimited: attr(find(va, 'RateDistance'), 'Unlimited') === 'true',
    };
  });
  const open = cars.filter(c => /avail|onrequest/i.test(c.status) || !c.status).length;
  return (
    <Card title="Cars offered" badge={<><Pill tone={open ? 'ok' : 'warn'}>{open} of {cars.length} available</Pill>{vendor && <span className="text-[12px] text-slate-500">by {txt(vendor) || attr(vendor, 'Code')}{attr(vendor, 'Code') && <span className="ml-1 font-mono">({attr(vendor, 'Code')})</span>}</span>}</>}>
      {cars.length === 0 ? <p className="text-[13px] text-slate-500">No cars in this answer.</p> : (<>
        <ul className="sm:hidden -mx-4 divide-y divide-slate-100">
          {cars.map((c, i) => (
            <li key={i} className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-slate-900"><span className="inline-flex px-1.5 py-0.5 mr-1.5 rounded bg-slate-900 text-white font-mono text-[10.5px] font-semibold">{c.sipp || '—'}</span>{c.model}</p>
                  <p className="mt-1 text-[11.5px] text-slate-500">{[c.gear, c.ac ? 'A/C' : '', c.unlimited ? 'Unlimited km' : ''].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13.5px] font-semibold tabular-nums text-slate-900">{money(c.total, c.cur)}</p>
                  {c.daily && <p className="text-[11px] tabular-nums text-slate-500">{money(c.daily, c.cur)} / day</p>}
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <Pill tone={/avail/i.test(c.status) ? 'ok' : /request/i.test(c.status) ? 'warn' : c.status ? 'bad' : 'neutral'}>{c.status || '—'}</Pill>
                {c.offer && <span className="font-mono text-[11px] text-slate-400 truncate">{c.offer}</span>}
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden sm:block overflow-x-auto -mx-4">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead><tr className="text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="px-4 py-2">Car</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Features</th><th className="px-3 py-2 text-right">Per day</th><th className="px-3 py-2 text-right">Total</th><th className="px-4 py-2">Offer</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {cars.map((c, i) => (
                <tr key={i}>
                  <td className="px-4 py-2"><span className="inline-flex px-1.5 py-0.5 mr-2 rounded bg-slate-900 text-white font-mono text-[10.5px] font-semibold">{c.sipp || '—'}</span>{c.model}</td>
                  <td className="px-3 py-2"><Pill tone={/avail/i.test(c.status) ? 'ok' : /request/i.test(c.status) ? 'warn' : c.status ? 'bad' : 'neutral'}>{c.status || '—'}</Pill></td>
                  <td className="px-3 py-2 text-[12px] text-slate-600">{[c.gear, c.ac ? 'A/C' : '', c.unlimited ? 'Unlimited km' : ''].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{c.daily ? money(c.daily, c.cur) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">{money(c.total, c.cur)}</td>
                  <td className="px-4 py-2 font-mono text-[11.5px] text-slate-500">{c.offer || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
    </Card>
  );
};

const Booking: React.FC<{ root: Element; kind: string }> = ({ root, kind }) => {
  const conf = findAll(root, 'ConfID').concat(findAll(root, 'UniqueID')).find(x => attr(x, 'ID'));
  const res = find(root, 'VehReservation');
  const status = attr(res, 'ReservationStatus') || attr(find(root, 'VehCancelRSCore'), 'CancelStatus') || (kind === 'cancel' ? 'Cancelled' : '');
  const person = find(root, 'PersonName');
  const name = [txt(find(person, 'GivenName')), txt(find(person, 'Surname'))].filter(Boolean).join(' ');
  const tc = find(root, 'TotalCharge');
  const v = find(root, 'Vehicle');
  const title = { book: 'Booking confirmed', retrieve: 'Booking', modify: 'Booking changed', cancel: 'Booking cancelled' }[kind] || 'Booking';
  return (
    <Card title={title} badge={status && <Pill tone={/cancel/i.test(status) ? 'warn' : 'ok'}>{status}</Pill>}>
      <Facts rows={[
        ['Confirmation number', conf ? <span className="font-mono font-semibold">{attr(conf, 'ID')}</span> : ''],
        ['Customer', name],
        ['Car', v ? `${attr(v, 'Code')} ${attr(find(root, 'VehMakeModel'), 'Name')}`.trim() : ''],
        ['Total', tc ? <span className="font-semibold tabular-nums">{money(attr(tc, 'RateTotalAmount', 'EstimatedTotalAmount'), attr(tc, 'CurrencyCode'))}</span> : ''],
        ['Email', txt(find(root, 'Email'))],
        ['Phone', attr(find(root, 'Telephone'), 'PhoneNumber')],
        ['Broker reference', txt(find(root, 'BrokerReference'))],
        ['Offer', attr(findAll(root, 'Reference').find(r => attr(r, 'Type') === '16'), 'ID')],
      ]} />
    </Card>
  );
};

const Locations: React.FC<{ root: Element }> = ({ root }) => {
  const list = findAll(root, 'VehMatchedLoc').length ? findAll(root, 'VehMatchedLoc') : findAll(root, 'LocationDetail');
  if (!list.length) return null;
  return (
    <Card title="Branches" badge={<Pill tone="neutral">{list.length}</Pill>}>
      <ul className="divide-y divide-slate-100 -my-1">
        {list.map((l, i) => {
          const d = l.localName === 'LocationDetail' ? l : find(l, 'LocationDetail') || l;
          return (
            <li key={i} className="py-2 flex flex-wrap items-baseline gap-x-3 text-[13px]">
              <span className="font-mono font-semibold text-slate-900">{attr(d, 'Code', 'LocationCode')}</span>
              <span className="text-slate-800">{attr(d, 'Name')}</span>
              <span className="text-[12px] text-slate-500">{[txt(find(d, 'AddressLine')), txt(find(d, 'CityName')), attr(find(d, 'Telephone'), 'PhoneNumber')].filter(Boolean).join(' · ')}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

// ---------------------------------------------------------------- generic outline

const Outline: React.FC<{ el: Element; depth?: number }> = ({ el, depth = 0 }) => {
  const [open, setOpen] = useState(depth < 3);
  const children = kids(el);
  const text = children.length ? '' : txt(el);
  const attrs = Array.from(el.attributes).filter(a => !a.name.startsWith('xmlns'));
  return (
    <div className={depth ? 'pl-4 border-l border-slate-200 ml-1.5' : ''}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-1">
        {children.length > 0 ? (
          <button type="button" onClick={() => setOpen(o => !o)} className="text-[13px] font-semibold text-slate-900 hover:text-indigo-700">
            <span className="inline-block w-3 text-slate-400">{open ? '▾' : '▸'}</span>{humanize(el.localName)}
          </button>
        ) : <span className="text-[13px] font-semibold text-slate-900 pl-3">{humanize(el.localName)}</span>}
        {text && <span className="text-[13px] text-slate-700">{text}</span>}
        {attrs.map(a => (
          <span key={a.name} className="inline-flex items-baseline gap-1 px-1.5 py-px rounded bg-slate-50 ring-1 ring-inset ring-slate-200 text-[11.5px]">
            <span className="text-slate-500">{humanize(a.name)}</span><span className="font-medium text-slate-900">{a.value}</span>
          </span>
        ))}
        {!open && children.length > 0 && <span className="text-[11.5px] text-slate-400">{children.length} part{children.length === 1 ? '' : 's'}</span>}
      </div>
      {open && children.map((c, i) => <Outline key={i} el={c} depth={depth + 1} />)}
    </div>
  );
};

const JsonOutline: React.FC<{ value: unknown; name?: string; depth?: number }> = ({ value, name, depth = 0 }) => {
  const [open, setOpen] = useState(depth < 3);
  const label = name ? humanize(name.replace(/_(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, c => c.toUpperCase())) : 'Message';
  if (value === null || typeof value !== 'object') return (
    <div className="flex gap-2 py-0.5 pl-3 text-[13px]"><span className="font-semibold text-slate-900">{label}</span><span className="text-slate-700 break-all">{String(value)}</span></div>
  );
  const entries = Array.isArray(value) ? value.map((v, i) => [`${i + 1}`, v] as const) : Object.entries(value as Record<string, unknown>);
  return (
    <div className={depth ? 'pl-4 border-l border-slate-200 ml-1.5' : ''}>
      <button type="button" onClick={() => setOpen(o => !o)} className="py-1 text-[13px] font-semibold text-slate-900 hover:text-indigo-700">
        <span className="inline-block w-3 text-slate-400">{open ? '▾' : '▸'}</span>{label}<span className="ml-2 text-[11.5px] font-normal text-slate-400">{entries.length} {Array.isArray(value) ? 'items' : 'fields'}</span>
      </button>
      {open && entries.map(([k, v]) => <JsonOutline key={k} name={Array.isArray(value) ? `Item ${k}` : k} value={v} depth={depth + 1} />)}
    </div>
  );
};

// ---------------------------------------------------------------- reader

const TITLES: [RegExp, string][] = [
  [/VehAvailRate/, 'Availability & rates'], [/VehRateRule|RateRules/, 'Rate rules'], [/VehRetRes|ReservationRetrieve/, 'Booking look-up'],
  [/VehModify|ReservationModify/, 'Booking change'], [/VehCancel|ReservationCancel/, 'Cancellation'], [/VehRes|ReservationCreate/, 'Booking'],
  [/VehLocSearch/, 'Branch search'], [/VehLocDetail/, 'Branch details'], [/Ping/, 'Connection check'], [/ReservationList/, 'Booking list'],
  [/Availability/, 'Availability & rates'], [/RateSheet/, 'Rate sheet'], [/Error/, 'Error'],
];
/** "OTA_VehAvailRateRS" → "Availability & rates · answer". */
export const friendlyTitle = (root: string) => {
  const hit = TITLES.find(([re]) => re.test(root));
  const side = /RS$|Response$/.test(root) ? ' · answer' : /RQ$|Request$/.test(root) ? ' · request' : '';
  return hit ? `${hit[1]}${hit[1] === 'Error' ? '' : side}` : humanize(root);
};

const MessageReader: React.FC<{ code?: string }> = ({ code }) => {
  const parsed = useMemo(() => {
    const t = (code || '').trim();
    if (!t) return { kind: 'empty' as const };
    if (t.startsWith('{') || t.startsWith('[')) { try { return { kind: 'json' as const, value: JSON.parse(t) }; } catch { return { kind: 'bad' as const }; } }
    if (!t.startsWith('<') || typeof DOMParser === 'undefined') return { kind: 'text' as const };
    const doc = new DOMParser().parseFromString(t, 'application/xml');
    if (doc.getElementsByTagName('parsererror')[0]) return { kind: 'bad' as const };
    let root: Element = doc.documentElement;
    const soap = /Envelope$/.test(root.localName);
    if (soap) { const b = kids(root).find(c => c.localName === 'Body'); if (b?.firstElementChild) root = b.firstElementChild; }
    return { kind: 'xml' as const, root, soap };
  }, [code]);

  if (parsed.kind === 'empty') return <p className="px-4 py-10 text-center text-[12.5px] text-slate-400">Nothing to show yet.</p>;
  if (parsed.kind === 'bad') return <p className="px-4 py-6 text-[13px] text-rose-700">This message is not well-formed, so it can only be shown as code.</p>;
  if (parsed.kind === 'text') return <p className="px-4 py-6 text-[13px] text-slate-500">This message is plain text; see the code view.</p>;
  if (parsed.kind === 'json') return <div className="p-4"><JsonOutline value={parsed.value} /></div>;

  const { root, soap } = parsed;
  const n = root.localName;
  const isRS = /RS$|Response$/.test(n);
  const ok = !!find(root, 'Success') || (isRS && !findAll(root, 'Error').length);
  const kind = /VehAvailRate/.test(n) ? 'avail' : /VehRes(RS|RQ)$/.test(n) ? 'book' : /VehRetRes/.test(n) ? 'retrieve' : /VehModify/.test(n) ? 'modify' : /VehCancel/.test(n) ? 'cancel' : /VehLoc/.test(n) ? 'loc' : 'other';
  const known = kind !== 'other';
  const echo = attr(root, 'EchoToken'), ts = attr(root, 'TimeStamp'), target = attr(root, 'Target');
  return (
    <div className="p-4 space-y-3 bg-slate-50/40">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-semibold text-slate-900">{friendlyTitle(n)}</h3>
        {isRS ? (findAll(root, 'Error').length ? <Pill tone="bad">Refused</Pill> : ok ? <Pill tone="ok">Success</Pill> : null) : <Pill tone="neutral">Request</Pill>}
        {soap && <Pill tone="neutral">SOAP</Pill>}
        {target && <Pill tone={target === 'Production' ? 'warn' : 'neutral'}>{target}</Pill>}
        <span className="ml-auto text-[11.5px] text-slate-500">{[echo && `EchoToken ${echo}`, ts && when(ts)].filter(Boolean).join(' · ')}</span>
      </div>
      <Errors root={root} />
      {(kind === 'avail' || kind === 'book' || kind === 'modify') && <Trip root={root} />}
      {kind === 'avail' && isRS && <Availability root={root} />}
      {['book', 'retrieve', 'modify', 'cancel'].includes(kind) && (isRS ? <Booking root={root} kind={kind} /> : (
        <Card title={({ book: 'Booking request', retrieve: 'Look-up request', modify: 'Change request', cancel: 'Cancellation request' } as Record<string, string>)[kind] || 'Request'}>
          <Facts rows={[
            ['Customer', [txt(find(root, 'GivenName')), txt(find(root, 'Surname'))].filter(Boolean).join(' ')],
            ['Booking', attr(findAll(root, 'UniqueID')[0], 'ID')], ['Offer', attr(findAll(root, 'Reference').find(r => attr(r, 'Type') === '16'), 'ID')],
            ['Email', txt(find(root, 'Email'))], ['Broker reference', txt(find(root, 'BrokerReference'))],
          ]} />
        </Card>
      ))}
      {kind === 'loc' && <Locations root={root} />}
      <details className="group rounded-xl ring-1 ring-inset ring-slate-200 bg-white" open={!known}>
        <summary className="cursor-pointer list-none px-4 py-2.5 text-[13px] font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
          <span className="inline-block w-3 text-slate-400 group-open:rotate-90 transition-transform">▸</span>{known ? 'Every part of the message' : 'Message'}
        </summary>
        <div className="px-4 pb-3"><Outline el={root} /></div>
      </details>
    </div>
  );
};

export default MessageReader;
