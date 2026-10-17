import React, { useCallback, useEffect, useState } from 'react';
import { Aggregator } from '../types';
import { ChannelDeliveryLog, fetchChannelDeliveries } from '../firebase/api';
import { RefreshIcon, PaperAirplaneIcon } from './icons';
import { channelStatus, submissionVersion } from '../services/channelManager';
import { Badge, Button, EmptyState, table } from './ui/Crm';

interface ChannelDeliveryLogViewProps {
  aggregator: Aggregator;
  refreshKey: number;
  sending: boolean;
  onSend: () => void;
}

const ChannelDeliveryLogView: React.FC<ChannelDeliveryLogViewProps> = ({ aggregator, refreshKey, sending, onSend }) => {
  const [rows, setRows] = useState<ChannelDeliveryLog[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchChannelDeliveries(aggregator.id));
    } catch (e: any) {
      setError(e?.response?.status === 404 ? 'The server does not support delivery logs yet (backend not updated).' : 'Could not load the delivery log.');
    } finally {
      setLoading(false);
    }
  }, [aggregator.id]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const published = (aggregator.ratePlanHistory || []).length > 0;
  const canSend = published && !!aggregator.connectionDetails?.apiUrl && channelStatus(aggregator) !== 'paused';
  const sendHint = !published ? 'Publish rates first'
    : !aggregator.connectionDetails?.apiUrl ? 'No endpoint URL — partner pulls rates instead'
    : channelStatus(aggregator) === 'paused' ? 'Channel is paused' : `Send v${submissionVersion(aggregator, 0)} to ${aggregator.name}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Delivery log</h3>
          <p className="text-xs text-slate-500">Every XML exchange with {aggregator.name}: rate pushes we sent and requests the partner made.</p>
        </div>
        <div className="flex gap-2 shrink-0 [&>*]:max-sm:flex-1">
          <Button onClick={load} disabled={loading} icon={<RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}>Refresh</Button>
          <Button variant="primary" onClick={onSend} disabled={!canSend || sending} title={sendHint} icon={<PaperAirplaneIcon className="w-4 h-4" />}>{sending ? 'Sending…' : 'Send rates now'}</Button>
        </div>
      </div>

      {error && <p className="text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</p>}

      {rows && rows.length === 0 && !error && (
        <EmptyState className="!py-8 rounded-lg border border-dashed border-slate-200" title="No XML exchanged with this channel yet." />
      )}

      {rows && rows.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className={`hidden md:table ${table.wrap}`}>
            <thead className={table.head}>
              <tr>
                <th className={table.th}>When</th>
                <th className={table.th}>Direction</th>
                <th className={table.th}>Message</th>
                <th className={table.th}>Result</th>
                <th className={`${table.th} text-right`}>Time</th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {rows.map(r => (
                <React.Fragment key={r.id}>
                  <tr className={`${table.row} cursor-pointer`} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <td className={`${table.td} whitespace-nowrap text-slate-600 tabular-nums`}>{new Date(r.createdAt).toLocaleString()}</td>
                    <td className={table.td}>
                      <Badge tone={r.direction === 'OUTBOUND' ? 'info' : 'muted'}>{r.direction === 'OUTBOUND' ? 'Sent' : 'Received'}</Badge>
                    </td>
                    <td className={`${table.td} font-mono text-xs text-slate-700 whitespace-nowrap`}>{r.messageType}{r.version ? ` · v${r.version}` : ''}</td>
                    <td className={table.td}>
                      <Badge tone={r.success ? 'success' : 'danger'}>{r.success ? 'OK' : 'Failed'}{r.httpStatus ? ` · ${r.httpStatus}` : ''}</Badge>
                      {r.error && <span className="ml-2 text-xs text-rose-600">{r.error}</span>}
                    </td>
                    <td className={`${table.td} text-right tabular-nums text-slate-500 whitespace-nowrap`}>{r.durationMs} ms</td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="px-4 py-3 text-xs text-slate-600 space-y-1">
                        <div><span className="font-semibold">By:</span> {r.actor || '—'} · <span className="font-semibold">Size:</span> {r.requestBytes} bytes</div>
                        {r.responseSnippet && <pre className="whitespace-pre-wrap break-all bg-white border border-slate-200 rounded-md p-2 font-mono text-[11px] max-h-40 overflow-auto">{r.responseSnippet}</pre>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <ul className="md:hidden divide-y divide-slate-100">
            {rows.map(r => (
              <li key={r.id} className="px-3 py-2.5">
                <button type="button" className="w-full text-left" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-800 truncate">{r.messageType}{r.version ? ` · v${r.version}` : ''}</span>
                    <Badge tone={r.success ? 'success' : 'danger'}>{r.success ? 'OK' : 'Failed'}{r.httpStatus ? ` · ${r.httpStatus}` : ''}</Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                    <Badge tone={r.direction === 'OUTBOUND' ? 'info' : 'muted'} dot={false} className="!px-1.5 !py-0 !text-[10px]">{r.direction === 'OUTBOUND' ? 'Sent' : 'Received'}</Badge>
                    <span className="tabular-nums">{new Date(r.createdAt).toLocaleString()}</span>
                    <span className="ml-auto tabular-nums">{r.durationMs} ms</span>
                  </div>
                  {r.error && <p className="mt-1 text-xs text-rose-600 break-words">{r.error}</p>}
                </button>
                {expanded === r.id && (
                  <div className="mt-2 text-xs text-slate-600 space-y-1">
                    <div><span className="font-semibold">By:</span> {r.actor || '—'} · <span className="font-semibold">Size:</span> {r.requestBytes} bytes</div>
                    {r.responseSnippet && <pre className="whitespace-pre-wrap break-all bg-slate-50 border border-slate-200 rounded-md p-2 font-mono text-[11px] max-h-40 overflow-auto">{r.responseSnippet}</pre>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ChannelDeliveryLogView;
