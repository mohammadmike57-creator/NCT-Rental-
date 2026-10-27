import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Aggregator } from '../../types';
import { fetchChannelTraffic, fetchChannelTrafficMessage, fetchChannelTrafficStats, ChannelTrafficMessage, ChannelTrafficRow, ChannelTrafficStats } from '../../firebase/api';
import { Panel, Badge, Button, StatGrid, EmptyState, selectCls, inputCls, table } from '../ui/Crm';

/** Indents XML or JSON for reading; anything else is returned as it is. */
export const pretty = (s?: string) => {
  if (!s) return '';
  const t = s.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return s; }
  }
  if (!t.startsWith('<') || t.split('\n').length > 3) return s;          // already indented
  let depth = 0;
  return t.replace(/>\s*</g, '>\n<').split('\n').map(line => {
    if (/^<\//.test(line)) depth = Math.max(0, depth - 1);
    const out = '  '.repeat(depth) + line;
    if (/^<[^!?/][^>]*[^/]>$/.test(line) && !/<\/[^>]+>$/.test(line)) depth++;
    return out;
  }).join('\n');
};

const fmtTime = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
const RANGES: [number, string][] = [[1, 'Last hour'], [24, 'Last 24 hours'], [168, 'Last 7 days'], [720, 'Last 30 days']];
const FORMAT_TONE: Record<string, 'info' | 'success' | 'warning' | 'muted'> = { OTA: 'info', SOAP: 'warning', XML: 'success', REST: 'muted' };

const CodeBlock: React.FC<{ title: string; body?: string; meta?: string }> = ({ title, body, meta }) => {
  const [copied, setCopied] = useState(false);
  const text = pretty(body);
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden flex flex-col min-h-0">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</span>
        {meta && <span className="text-[11px] text-slate-400">{meta}</span>}
        <button type="button" onClick={() => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}
          className="ml-auto text-xs font-semibold text-indigo-600 hover:underline">{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre className="p-3 text-[11.5px] leading-[1.55] font-mono text-slate-800 bg-white overflow-auto max-h-[28rem] whitespace-pre">{text || '—'}</pre>
    </div>
  );
};

/** Every broker call in full (masked), with volume, error and speed statistics. */
const TrafficView: React.FC<{ aggregator: Aggregator }> = ({ aggregator }) => {
  const [hours, setHours] = useState(24);
  const [operation, setOperation] = useState('');
  const [result, setResult] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ChannelTrafficRow[] | null>(null);
  const [stats, setStats] = useState<ChannelTrafficStats | null>(null);
  const [open, setOpen] = useState<ChannelTrafficMessage | null>(null);
  const [auto, setAuto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      fetchChannelTraffic(aggregator.id, { hours, operation: operation || undefined, result: result || undefined, q: query || undefined, limit: 200 }),
      fetchChannelTrafficStats(aggregator.id, hours),
    ]).then(([r, s]) => { setRows(r); setStats(s); }).catch(() => { setRows([]); setError('Could not load the traffic log.'); });
  }, [aggregator.id, hours, operation, result, query]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [auto, load]);

  const tiles = useMemo(() => stats ? [
    { label: 'Calls', value: stats.calls.toLocaleString('en-GB'), sub: RANGES.find(r => r[0] === hours)?.[1].toLowerCase() },
    { label: 'Error rate', value: `${stats.errorRate}%`, sub: `${stats.errors} failed`, tone: stats.errorRate > 5 ? 'danger' as const : stats.errorRate > 1 ? 'warning' as const : 'default' as const },
    { label: 'Response time', value: `${stats.avgMs} ms`, sub: `p95 ${stats.p95Ms} ms · max ${stats.maxMs} ms`, tone: stats.p95Ms > 2000 ? 'warning' as const : 'default' as const },
    { label: 'Look-to-book', value: stats.lookToBook == null ? '—' : `${stats.lookToBook} : 1`, sub: `${stats.searches} searches · ${stats.bookings} bookings` },
  ] : [], [stats, hours]);
  const peak = Math.max(1, ...(stats?.series.map(s => s.calls) || [1]));

  const show = async (r: ChannelTrafficRow) => {
    try { setOpen(await fetchChannelTrafficMessage(aggregator.id, r.id)); } catch { setError('Could not load that message.'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={hours} onChange={e => setHours(Number(e.target.value))} className={selectCls} aria-label="Period">
          {RANGES.map(([h, l]) => <option key={h} value={h}>{l}</option>)}
        </select>
        <select value={operation} onChange={e => setOperation(e.target.value)} className={selectCls} aria-label="Operation">
          <option value="">All operations</option>
          {(stats?.operations || []).map(o => <option key={o.operation} value={o.operation}>{o.operation}</option>)}
        </select>
        <select value={result} onChange={e => setResult(e.target.value)} className={selectCls} aria-label="Result">
          <option value="">Successes and errors</option><option value="ok">Successes</option><option value="error">Errors only</option>
        </select>
        <form onSubmit={e => { e.preventDefault(); setQuery(q.trim()); }} className="flex-1 min-w-[220px]">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Request ID, RSV-…, error code or any text in the XML" className={inputCls} />
        </form>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />Live</label>
        <Button size="sm" onClick={load}>Refresh</Button>
      </div>

      {stats && <StatGrid items={tiles} />}

      {stats && (
        <div className="grid gap-4 xl:grid-cols-[3fr_2fr] items-start">
          <Panel title="Traffic" subtitle={`${hours <= 72 ? 'Calls per hour' : 'Calls per day'}; errors in red.`} bodyClassName="p-4">
            <div className="flex items-end gap-[3px] h-32">
              {stats.series.map(s => (
                <div key={s.at} className="flex-1 flex flex-col justify-end h-full group relative" title={`${fmtTime(s.at)}: ${s.calls} calls, ${s.errors} errors`}>
                  <div className="w-full rounded-t bg-rose-400" style={{ height: `${(s.errors / peak) * 100}%` }} />
                  <div className="w-full bg-indigo-400 group-hover:bg-indigo-500" style={{ height: `${((s.calls - s.errors) / peak) * 100}%`, borderTopLeftRadius: s.errors ? 0 : 3, borderTopRightRadius: s.errors ? 0 : 3 }} />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-slate-400 tabular-nums">
              <span>{fmtTime(stats.series[0]?.at || new Date().toISOString())}</span><span>now</span>
            </div>
          </Panel>
          <Panel title="By operation" subtitle={stats.errorCodes.length ? `Errors: ${stats.errorCodes.map(e => `${e.code} ×${e.count}`).join(', ')}` : 'No errors in this period.'}>
            {stats.operations.length ? (
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {stats.operations.slice(0, 10).map(o => (
                    <tr key={o.operation}>
                      <td className="px-4 py-1.5 font-mono text-slate-800">{o.operation}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{o.calls}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${o.errors ? 'text-rose-600' : 'text-slate-400'}`}>{o.errors} err</td>
                      <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap text-slate-500">{o.avgMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="px-4 py-6 text-xs text-slate-500">No calls yet.</p>}
          </Panel>
        </div>
      )}

      <Panel title="Message log" subtitle={`Each call with its full request and response. Keys, passwords and card numbers are masked. Kept ${stats?.retentionDays ?? 30} days.`}>
        {error && <p className="px-4 py-3 text-xs text-rose-600">{error}</p>}
        {rows === null ? <p className="px-4 py-10 text-center text-[13px] text-slate-500">Loading…</p> : rows.length === 0 ? (
          <EmptyState title="No calls in this period" hint="Broker requests and test-console messages appear here as soon as they arrive." />
        ) : (
          <div className="overflow-x-auto">
            <table className={`${table.wrap} min-w-[820px]`}>
              <thead className={table.head}><tr>{['Time', 'Operation', 'Result', 'Time taken', 'Request ID', 'Booking', 'From'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
              <tbody className={table.body}>
                {rows.map(r => (
                  <tr key={r.id} className={`${table.row} cursor-pointer`} onClick={() => show(r)}>
                    <td className={`${table.td} whitespace-nowrap text-xs tabular-nums text-slate-600`} title={`${kb(r.requestBytes)} sent · ${kb(r.responseBytes)} received`}>{fmtTime(r.createdAt)}</td>
                    <td className={table.td}>
                      <span className="inline-flex items-center gap-2"><Badge tone={FORMAT_TONE[r.format] || 'muted'}>{r.format}</Badge>
                        <span className="font-mono text-xs text-slate-900">{r.operation.replace(/^(XML|REST) /, '')}</span>{r.sandbox && <span className="text-[10px] font-semibold uppercase text-amber-600">sandbox</span>}</span>
                    </td>
                    <td className={table.td}>{r.success ? <Badge tone="success">{r.httpStatus} OK</Badge>
                      : <span title={r.errorMessage}><Badge tone="danger">{r.httpStatus} {r.errorCode}</Badge></span>}</td>
                    <td className={`${table.td} text-right tabular-nums text-xs whitespace-nowrap ${r.durationMs > 2000 ? 'text-amber-600 font-semibold' : ''}`}>{r.durationMs} ms</td>
                    <td className={`${table.td} font-mono text-[11px] text-slate-500 whitespace-nowrap`}>{r.requestId}</td>
                    <td className={`${table.td} font-mono text-[11px] whitespace-nowrap`}>{r.reservationNumber || '—'}</td>
                    <td className={`${table.td} text-[11px] text-slate-500 whitespace-nowrap`}>{r.remoteIp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={() => setOpen(null)}>
          <div className="w-full max-w-4xl h-full bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-slate-900 flex items-center gap-2"><Badge tone={FORMAT_TONE[open.format] || 'muted'}>{open.format}</Badge>
                  <span className="font-mono">{open.operation}</span></p>
                <p className="text-xs text-slate-500 mt-1">{fmtTime(open.createdAt)} · {open.durationMs} ms · HTTP {open.httpStatus} · {open.remoteIp}
                  {open.requestId && <> · <span className="font-mono">{open.requestId}</span></>}{open.reservationNumber && <> · <span className="font-mono">{open.reservationNumber}</span></>}</p>
                {!open.success && <p className="mt-2 text-xs text-rose-700 bg-rose-50 rounded px-2 py-1"><b>{open.errorCode}</b> {open.errorMessage}</p>}
              </div>
              <Button size="sm" onClick={() => setOpen(null)}>Close</Button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <CodeBlock title="Request" meta={kb(open.requestBytes)} body={open.requestBody} />
              <CodeBlock title="Response" meta={kb(open.responseBytes)} body={open.responseBody} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrafficView;
