import React, { useCallback, useEffect, useState } from 'react';
import { Aggregator } from '../types';
import { ChannelDeliveryLog, fetchChannelDeliveries } from '../firebase/api';
import { RefreshIcon, PaperAirplaneIcon } from './icons';
import { channelStatus, submissionVersion } from '../services/channelManager';

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
          <h3 className="text-lg font-bold text-slate-800">Delivery log</h3>
          <p className="text-sm text-slate-500">Every XML exchange with {aggregator.name}: rate pushes we sent and requests the partner made.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={load} disabled={loading} className="px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg text-slate-700 bg-white hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50">
            <RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={onSend} disabled={!canSend || sending} title={sendHint} className="px-3 py-2 text-sm font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-900 inline-flex items-center gap-1.5 whitespace-nowrap disabled:bg-slate-300 disabled:cursor-not-allowed">
            <PaperAirplaneIcon className="w-4 h-4" /> {sending ? 'Sending…' : 'Send rates now'}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</p>}

      {rows && rows.length === 0 && !error && (
        <p className="text-sm text-slate-500 text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">No XML exchanged with this channel yet.</p>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <th className="text-left px-4 py-2 font-semibold">When</th>
                <th className="text-left px-4 py-2 font-semibold">Direction</th>
                <th className="text-left px-4 py-2 font-semibold">Message</th>
                <th className="text-left px-4 py-2 font-semibold">Result</th>
                <th className="text-right px-4 py-2 font-semibold">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(r => (
                <React.Fragment key={r.id}>
                  <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <td className="px-4 py-2 whitespace-nowrap text-slate-600">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${r.direction === 'OUTBOUND' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>
                        {r.direction === 'OUTBOUND' ? 'Sent' : 'Received'}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-700 whitespace-nowrap">{r.messageType}{r.version ? ` · v${r.version}` : ''}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${r.success ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {r.success ? 'OK' : 'Failed'}{r.httpStatus ? ` · ${r.httpStatus}` : ''}
                      </span>
                      {r.error && <span className="ml-2 text-xs text-red-600">{r.error}</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500 whitespace-nowrap">{r.durationMs} ms</td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="px-4 py-3 text-xs text-slate-600 space-y-1">
                        <div><span className="font-semibold">By:</span> {r.actor || '—'} · <span className="font-semibold">Size:</span> {r.requestBytes} bytes</div>
                        {r.responseSnippet && <pre className="whitespace-pre-wrap break-all bg-white border border-slate-200 rounded p-2 font-mono text-[11px] max-h-40 overflow-auto">{r.responseSnippet}</pre>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ChannelDeliveryLogView;
