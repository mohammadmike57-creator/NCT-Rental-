import React, { useMemo, useState } from 'react';
import { Aggregator, Fleet, StopSale } from '../types';
import { CodeBracketIcon, DownloadIcon } from './icons';
import { Panel, Toolbar, Segmented, Badge, Field, EmptyState, inputCls, selectCls, table } from './ui/Crm';
import {
  buildQuote, channelCurrency, checkWellFormed, fingerprint, formatMoney, generateRateSheetXml,
  generateVehAvailRateXml, publishedView, rentalDays, submissionVersion, todayIso,
} from '../services/channelManager';

interface XMLPreviewViewProps {
  aggregator: Aggregator;
  fleet: Fleet;
  stopSales: StopSale[];
}

type MessageType = 'availrate' | 'ratesheet';

const MESSAGE_INFO: Record<MessageType, { title: string; standard: string; description: string }> = {
  availrate: {
    title: 'Availability & rates',
    standard: 'OTA 2003/05 · OTA_VehAvailRateRS',
    description: 'The response a partner receives for a search: every vehicle group with status, price for the rental length, and selected extras.',
  },
  ratesheet: {
    title: 'Rate sheet',
    standard: 'NCT RateSheet 1.0',
    description: 'Complete seasonal rate file (seasons × SIPP × length of rental) with extras, stop sales and terms, for partners that load rate files.',
  },
};

// --- lightweight XML syntax highlighting -----------------------------------
const TOKEN = /(<!--[\s\S]*?-->)|(<!\[CDATA\[[\s\S]*?\]\]>)|(<\?[\s\S]*?\?>)|(<\/?[\w:.-]+)|([\w:.-]+)(=)("[^"]*")|(\/?>)/g;

const highlight = (xml: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let inTag = false;
  let m: RegExpExecArray | null;
  let key = 0;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(xml))) {
    if (m.index > last) nodes.push(<span key={key++} className="text-slate-200">{xml.slice(last, m.index)}</span>);
    if (m[1]) nodes.push(<span key={key++} className="text-slate-500 italic">{m[1]}</span>);
    else if (m[2]) nodes.push(<span key={key++} className="text-amber-200">{m[2]}</span>);
    else if (m[3]) nodes.push(<span key={key++} className="text-slate-500">{m[3]}</span>);
    else if (m[4]) { inTag = true; nodes.push(<span key={key++} className="text-sky-400">{m[4]}</span>); }
    else if (m[5] && inTag) {
      nodes.push(<span key={key++} className="text-violet-300">{m[5]}</span>);
      nodes.push(<span key={key++} className="text-slate-500">{m[6]}</span>);
      nodes.push(<span key={key++} className="text-emerald-300">{m[7]}</span>);
    } else if (m[5]) nodes.push(<span key={key++} className="text-slate-200">{m[0]}</span>);
    else if (m[8]) { inTag = false; nodes.push(<span key={key++} className="text-sky-400">{m[8]}</span>); }
    last = TOKEN.lastIndex;
  }
  if (last < xml.length) nodes.push(<span key={key++} className="text-slate-200">{xml.slice(last)}</span>);
  return nodes;
};

const defaultPickUp = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return `${d.toISOString().slice(0, 10)}T10:00`;
};
const plusDays = (local: string, days: number) => {
  const d = new Date(`${local}:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 16);
};

const XMLPreviewView: React.FC<XMLPreviewViewProps> = ({ aggregator: channel, fleet, stopSales }) => {
  const [type, setType] = useState<MessageType>('availrate');
  const hasPublished = (channel.ratePlanHistory || []).length > 0;
  const [source, setSource] = useState<'published' | 'draft'>(hasPublished ? 'published' : 'draft');
  const aggregator = useMemo(() => (source === 'published' ? publishedView(channel) : channel), [source, channel]);
  const [pickUp, setPickUp] = useState(defaultPickUp);
  const [dropOff, setDropOff] = useState(() => plusDays(defaultPickUp(), 3));
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const currency = channelCurrency(aggregator);
  const request = { pickUp: `${pickUp}:00`, dropOff: `${dropOff}:00`, extraIds };
  const days = rentalDays(request.pickUp, request.dropOff);
  const invalidRange = new Date(dropOff) <= new Date(pickUp);

  const xml = useMemo(() => (
    type === 'availrate'
      ? generateVehAvailRateXml(aggregator, fleet, stopSales, request)
      : generateRateSheetXml(aggregator, stopSales, fleet, source === 'published' ? { version: submissionVersion(channel, 0) } : {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [type, aggregator, channel, source, fleet, stopSales, pickUp, dropOff, extraIds.join(',')]);

  const quote = useMemo(
    () => (type === 'availrate' ? buildQuote(aggregator, fleet, stopSales, request) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, aggregator, fleet, stopSales, pickUp, dropOff, extraIds.join(',')],
  );
  const parseError = useMemo(() => checkWellFormed(xml), [xml]);
  const highlighted = useMemo(() => highlight(xml), [xml]);
  const sizeKb = (new Blob([xml]).size / 1024).toFixed(1);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(xml);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (e.g. insecure context) */
    }
  };

  const download = () => {
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const code = (aggregator.channelCode || aggregator.name).replace(/[^A-Za-z0-9]+/g, '_');
    a.href = url;
    a.download = `${code}_${type === 'availrate' ? 'VehAvailRateRS' : 'RateSheet'}_${todayIso()}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleExtra = (id: string) => setExtraIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));
  const info = MESSAGE_INFO[type];

  const statusTone = (s: string) => (s === 'Available' ? 'success' : s === 'OnRequest' ? 'warning' : 'danger') as 'success' | 'warning' | 'danger';
  const money = (line: typeof quote[number], v: number) => (line.status === 'Closed' ? '—' : formatMoney(v, currency));

  return (
    <div className="space-y-4">
      <Panel
        title={<span className="flex items-center gap-2"><CodeBracketIcon className="w-4 h-4 text-slate-400" /> XML feed</span>}
        subtitle={source === 'published'
          ? <>Exactly what {aggregator.name} receives: published version v{submissionVersion(channel, 0)}.</>
          : <>Preview of the current draft rates — partners keep receiving the published version until you publish.</>}
      >
        <Toolbar className="!border-b-0">
          <select value={source} onChange={e => setSource(e.target.value as 'published' | 'draft')} className={`${selectCls} w-full md:w-auto`}>
            <option value="published" disabled={!hasPublished}>Published rates{hasPublished ? ` (v${submissionVersion(channel, 0)})` : ' (none)'}</option>
            <option value="draft">Current draft</option>
          </select>
          <Segmented
            className="w-full md:w-auto"
            options={(Object.keys(MESSAGE_INFO) as MessageType[]).map(t => ({ key: t, label: MESSAGE_INFO[t].title }))}
            value={type}
            onChange={k => setType(k as MessageType)}
          />
          <div className="md:ml-auto flex flex-wrap items-center gap-2 text-xs">
            {parseError ? (
              <span title={parseError}><Badge tone="danger">Not well-formed</Badge></span>
            ) : (
              <Badge tone="success">Well-formed</Badge>
            )}
            <span className="text-slate-400 font-mono">{sizeKb} KB · #{fingerprint(xml)}</span>
          </div>
        </Toolbar>
        <div className="px-4 py-3 border-t border-slate-100">
          <span className="inline-block text-[11px] font-mono bg-slate-50 text-slate-600 px-1.5 py-px rounded border border-slate-200">{info.standard}</span>
          <p className="text-xs text-slate-500 mt-1">{info.description}</p>
        </div>
      </Panel>

      {type === 'availrate' && (
        <Panel title="Test search" subtitle="Simulate a partner search to see the response and quoted prices.">
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 border-b border-slate-100">
            <Field label="Pick-up">
              <input type="datetime-local" value={pickUp} onChange={e => e.target.value && setPickUp(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Return">
              <input type="datetime-local" value={dropOff} onChange={e => e.target.value && setDropOff(e.target.value)} className={`${inputCls} ${invalidRange ? '!border-rose-400' : ''}`} />
            </Field>
            <div className="flex items-end">
              <p className="text-[13px] text-slate-600">
                <span className="text-xl font-semibold text-slate-900 tabular-nums">{days}</span> rental day{days === 1 ? '' : 's'}
                {invalidRange && <span className="block text-xs text-rose-600">Return must be after pick-up.</span>}
              </p>
            </div>
            {(aggregator.extras || []).length > 0 && (
              <div className="sm:col-span-3 flex flex-wrap gap-1.5">
                {(aggregator.extras || []).map(e => (
                  <button key={e.id} onClick={() => toggleExtra(e.id)} aria-pressed={extraIds.includes(e.id)} className={`h-7 px-2.5 text-xs font-semibold rounded-md ring-1 ring-inset transition-colors ${extraIds.includes(e.id) ? 'bg-indigo-50 text-indigo-700 ring-indigo-200' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
                    {e.name} · {formatMoney(e.price, currency)}/day
                  </button>
                ))}
              </div>
            )}
          </div>
          {quote.length === 0 ? (
            <EmptyState className="!py-8" title="No vehicles would be returned" hint={`No rate period covers ${pickUp.slice(0, 10)} — the partner would receive no vehicles.`} />
          ) : (
            <>
              <table className={`hidden md:table ${table.wrap}`}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Vehicle</th>
                    <th className={table.th}>Status</th>
                    <th className={`${table.th} text-right`}>Daily</th>
                    <th className={`${table.th} text-right`}>Base</th>
                    <th className={`${table.th} text-right`}>Extras</th>
                    <th className={`${table.th} text-right`}>Total</th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {quote.map(line => (
                    <tr key={line.sippCode} className={table.row}>
                      <td className={table.td}><span className="font-mono font-semibold text-slate-800">{line.sippCode}</span> <span className="text-slate-500">{line.model}</span></td>
                      <td className={table.td}>
                        <span title={line.closedReason}><Badge tone={statusTone(line.status)}>{line.status}</Badge></span>
                        {line.closedReason && <span className="ml-2 text-xs text-slate-400">{line.closedReason}</span>}
                      </td>
                      <td className={`${table.td} text-right tabular-nums`}>{money(line, line.dailyRate)}</td>
                      <td className={`${table.td} text-right tabular-nums`}>{money(line, line.baseTotal)}</td>
                      <td className={`${table.td} text-right tabular-nums`}>{money(line, line.total - line.baseTotal)}</td>
                      <td className={`${table.td} text-right tabular-nums font-semibold text-slate-900`}>{money(line, line.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="md:hidden divide-y divide-slate-100">
                {quote.map(line => (
                  <li key={line.sippCode} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[13px]"><span className="font-mono font-semibold text-slate-800">{line.sippCode}</span> <span className="text-slate-500">{line.model}</span></span>
                      <span className="text-[13px] font-semibold text-slate-900 tabular-nums">{money(line, line.total)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                      <Badge tone={statusTone(line.status)}>{line.status}</Badge>
                      {line.status !== 'Closed' && <span>{formatMoney(line.dailyRate, currency)}/day · base {formatMoney(line.baseTotal, currency)} · extras {formatMoney(line.total - line.baseTotal, currency)}</span>}
                      {line.closedReason && <span>{line.closedReason}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      )}

      <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-sm">
        <div className="bg-slate-800/80 px-4 py-2 flex items-center justify-between gap-2">
          <span className="text-xs font-mono text-slate-400 truncate">{type === 'availrate' ? 'OTA_VehAvailRateRS.xml' : 'RateSheet.xml'}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={copy} className="h-7 px-2.5 text-xs font-semibold text-slate-200 bg-slate-700 rounded-md hover:bg-slate-600 hover:text-white">{copied ? 'Copied' : 'Copy'}</button>
            <button onClick={download} className="h-7 px-2.5 text-xs font-semibold text-slate-200 bg-slate-700 rounded-md hover:bg-slate-600 hover:text-white inline-flex items-center gap-1"><DownloadIcon className="w-3.5 h-3.5" /> Download</button>
          </div>
        </div>
        <pre className="p-4 max-h-[600px] overflow-auto text-xs font-mono leading-relaxed"><code>{highlighted}</code></pre>
      </div>
    </div>
  );
};

export default XMLPreviewView;
