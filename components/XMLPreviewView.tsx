import React, { useMemo, useState } from 'react';
import { Aggregator, Fleet, StopSale } from '../types';
import { CodeBracketIcon, DownloadIcon, CheckCircleIcon, AlertIcon } from './icons';
import {
  buildQuote, channelCurrency, checkWellFormed, fingerprint, formatMoney, generateRateSheetXml,
  generateVehAvailRateXml, rentalDays, todayIso,
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

const STATUS_CLS: Record<string, string> = {
  Available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  OnRequest: 'bg-amber-50 text-amber-700 border-amber-200',
  Closed: 'bg-red-50 text-red-700 border-red-200',
};

const XMLPreviewView: React.FC<XMLPreviewViewProps> = ({ aggregator, fleet, stopSales }) => {
  const [type, setType] = useState<MessageType>('availrate');
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
      : generateRateSheetXml(aggregator, stopSales, fleet)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [type, aggregator, fleet, stopSales, pickUp, dropOff, extraIds.join(',')]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><CodeBracketIcon /> XML feed</h3>
          <p className="text-sm text-slate-500">Exactly what {aggregator.name} receives, generated live from the current settings.</p>
        </div>
        <div className="inline-flex p-1 bg-slate-100 rounded-lg self-start">
          {(Object.keys(MESSAGE_INFO) as MessageType[]).map(t => (
            <button key={t} onClick={() => setType(t)} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${type === t ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
              {MESSAGE_INFO[t].title}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div className="min-w-0">
          <span className="text-[11px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">{info.standard}</span>
          <p className="text-xs text-slate-500 mt-1.5">{info.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-xs">
          {parseError ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200 font-semibold" title={parseError}><AlertIcon className="w-4 h-4" /> Not well-formed</span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold"><CheckCircleIcon className="w-4 h-4" /> Well-formed</span>
          )}
          <span className="text-slate-400 font-mono">{sizeKb} KB · #{fingerprint(xml)}</span>
        </div>
      </div>

      {type === 'availrate' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Pick-up</label>
              <input type="datetime-local" value={pickUp} onChange={e => e.target.value && setPickUp(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Return</label>
              <input type="datetime-local" value={dropOff} onChange={e => e.target.value && setDropOff(e.target.value)} className={`w-full p-2 border rounded-lg text-sm ${invalidRange ? 'border-red-400' : 'border-slate-300'}`} />
            </div>
            <div className="flex items-end">
              <p className="text-sm text-slate-600">
                <span className="text-2xl font-bold text-slate-800">{days}</span> rental day{days === 1 ? '' : 's'}
                {invalidRange && <span className="block text-xs text-red-600">Return must be after pick-up.</span>}
              </p>
            </div>
            {(aggregator.extras || []).length > 0 && (
              <div className="sm:col-span-3 flex flex-wrap gap-2">
                {(aggregator.extras || []).map(e => (
                  <button key={e.id} onClick={() => toggleExtra(e.id)} className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all ${extraIds.includes(e.id) ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}>
                    {e.name} · {formatMoney(e.price, currency)}/day
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            {quote.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">No rate period covers {pickUp.slice(0, 10)} — the partner would receive no vehicles.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50">
                    <th className="text-left px-4 py-2 font-semibold">Vehicle</th>
                    <th className="text-left px-4 py-2 font-semibold">Status</th>
                    <th className="text-right px-4 py-2 font-semibold">Daily</th>
                    <th className="text-right px-4 py-2 font-semibold">Base</th>
                    <th className="text-right px-4 py-2 font-semibold">Extras</th>
                    <th className="text-right px-4 py-2 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quote.map(line => (
                    <tr key={line.sippCode}>
                      <td className="px-4 py-2"><span className="font-mono font-bold text-slate-800">{line.sippCode}</span> <span className="text-slate-500">{line.model}</span></td>
                      <td className="px-4 py-2">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${STATUS_CLS[line.status]}`} title={line.closedReason}>{line.status}</span>
                        {line.closedReason && <span className="ml-2 text-xs text-slate-400">{line.closedReason}</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{line.status === 'Closed' ? '—' : formatMoney(line.dailyRate, currency)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{line.status === 'Closed' ? '—' : formatMoney(line.baseTotal, currency)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{line.status === 'Closed' ? '—' : formatMoney(line.total - line.baseTotal, currency)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-bold text-slate-800">{line.status === 'Closed' ? '—' : formatMoney(line.total, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <div className="bg-slate-900 rounded-xl overflow-hidden shadow-inner border border-slate-700">
        <div className="bg-slate-800 px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400 truncate">{type === 'availrate' ? 'OTA_VehAvailRateRS.xml' : 'RateSheet.xml'}</span>
          <div className="flex items-center gap-2">
            <button onClick={copy} className="px-3 py-1 text-xs font-semibold text-slate-300 bg-slate-700 rounded hover:bg-slate-600 hover:text-white">{copied ? 'Copied ✓' : 'Copy'}</button>
            <button onClick={download} className="px-3 py-1 text-xs font-semibold text-slate-300 bg-slate-700 rounded hover:bg-slate-600 hover:text-white inline-flex items-center gap-1"><DownloadIcon className="w-3.5 h-3.5" /> Download</button>
          </div>
        </div>
        <pre className="p-4 sm:p-6 max-h-[600px] overflow-auto text-xs sm:text-[13px] font-mono leading-relaxed"><code>{highlighted}</code></pre>
      </div>
    </div>
  );
};

export default XMLPreviewView;
