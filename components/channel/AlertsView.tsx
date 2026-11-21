import React, { useEffect, useState } from 'react';
import { Aggregator } from '../../types';
import { ChannelAlertInfo, fetchChannelAlerts, sendTestAlert } from '../../services/api';
import { Badge, Button, Panel, inputCls } from '../ui/Crm';
import { BellIcon, CheckCircleIcon } from '../icons';

/**
 * Broker alerts: who is emailed for each live broker, what is wrong right now, and a test email. The server checks
 * every 5 minutes for many failed requests, failed bookings, a broker that stopped searching, failed status updates
 * and slow answers, and repeats the same alert no sooner than 6 hours later while it lasts.
 */
const AlertsView: React.FC<{ aggregators: Aggregator[]; onUpdate: (a: Aggregator) => void; onUpdateAll: (list: Aggregator[]) => void; notify: (m: string) => void }> = ({
  aggregators, onUpdate, onUpdateAll, notify,
}) => {
  const [info, setInfo] = useState<Record<string, ChannelAlertInfo | 'error'>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [all, setAll] = useState('');
  const [testing, setTesting] = useState<string | null>(null);
  const ids = aggregators.map(a => a.id).join(',');
  useEffect(() => {
    let live = true;
    aggregators.forEach(a => fetchChannelAlerts(a.id).then(r => live && setInfo(x => ({ ...x, [a.id]: r }))).catch(() => live && setInfo(x => ({ ...x, [a.id]: 'error' }))));
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  const clean = (v: string) => v.split(/[,;\s]+/).map(s => s.trim()).filter(s => s.includes('@')).join(', ');
  const valueOf = (a: Aggregator) => draft[a.id] ?? a.alertEmails ?? '';
  const saveOne = (a: Aggregator) => { const v = clean(valueOf(a)); onUpdate({ ...a, alertEmails: v || undefined }); setDraft(d => { const n = { ...d }; delete n[a.id]; return n; }); };
  const saveAll = () => {
    const v = clean(all);
    if (!v) return;
    onUpdateAll(aggregators.map(a => ({ ...a, alertEmails: v })));
    setDraft({}); setAll('');
    notify(`Alerts for every broker now go to ${v}.`);
  };
  const test = async (a: Aggregator) => {
    setTesting(a.id);
    try { const r = await sendTestAlert(a.id); notify(r.sent ? `Test alert for ${a.name}: ${r.result}` : `Test alert for ${a.name} not sent. ${r.result}`); }
    catch (e: any) { notify(e?.message || 'Could not send the test alert.'); }
    finally { setTesting(null); }
  };

  return (
    <div className="space-y-4">
      <div className="ota-pop rounded-2xl border border-slate-200/80 bg-white px-4 sm:px-5 py-4 flex flex-wrap items-center gap-4">
        <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 inline-flex items-center justify-center shrink-0"><BellIcon className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-semibold text-slate-900">Email alerts</h3>
          <p className="text-[12.5px] text-slate-500 max-w-3xl">Every 5 minutes each live broker is checked. You get an email when many requests fail, a booking fails, the broker stops searching, status updates do not reach it, or answers are slow. The same alert comes again no sooner than 6 hours later while it lasts. Emails go out with the email settings under Company Details.</p>
        </div>
        <div className="flex items-center gap-2 w-full lg:w-auto">
          <input className={`${inputCls} !h-9 lg:!w-72`} value={all} onChange={e => setAll(e.target.value)} placeholder="email@company.com, second@company.com" aria-label="Alert emails for every broker" />
          <Button onClick={saveAll} disabled={!clean(all)}>Use for every broker</Button>
        </div>
      </div>

      <Panel title="Brokers" subtitle="Who is emailed for each broker, and what is wrong right now. Only live brokers are checked.">
        <ul className="divide-y divide-slate-100">
          {aggregators.map((a, i) => {
            const st = info[a.id];
            const problems = st && st !== 'error' ? st.problems : [];
            const live = a.status === 'active' && a.connectionDetails?.environment !== 'test';
            const changed = (draft[a.id] ?? undefined) !== undefined && clean(draft[a.id]) !== (a.alertEmails || '');
            return (
              <li key={a.id} className="ota-row px-4 sm:px-5 py-3.5 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_auto] gap-3 items-start" style={{ animationDelay: `${80 + i * 50}ms` }}>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-slate-900 truncate">{a.name}</p>
                  <p className="mt-0.5">{live ? <Badge tone="success">Live · checked</Badge> : <Badge tone="muted">{a.status === 'paused' ? 'Paused' : 'Testing'} · not checked</Badge>}</p>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex gap-2">
                    <input className={`${inputCls} !h-9`} value={valueOf(a)} onChange={e => setDraft(d => ({ ...d, [a.id]: e.target.value }))}
                      placeholder={st && st !== 'error' && st.recipients.length && !a.alertEmails ? `Server default: ${st.recipients.join(', ')}` : 'Add the emails to alert, comma-separated'} aria-label={`Alert emails for ${a.name}`} />
                    {changed && <Button size="sm" variant="primary" onClick={() => saveOne(a)}>Save</Button>}
                  </div>
                  {st === 'error' ? <p className="text-[12px] text-slate-400">Could not check this broker right now.</p>
                    : !st ? <p className="text-[12px] text-slate-400">Checking…</p>
                    : problems.length === 0 ? <p className="text-[12px] text-emerald-700 inline-flex items-center gap-1"><CheckCircleIcon className="w-4 h-4" />Nothing wrong right now.</p>
                    : <ul className="space-y-1">{problems.map(p => <li key={p.type} className="text-[12px] rounded-md bg-rose-50 border border-rose-200 text-rose-800 px-2.5 py-1.5"><b>{p.title}.</b> {p.text}</li>)}</ul>}
                </div>
                <Button size="sm" onClick={() => test(a)} disabled={testing === a.id}>{testing === a.id ? 'Sending…' : 'Send test alert'}</Button>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
};

export default AlertsView;
