import React, { useEffect, useState } from 'react';
import { Aggregator, CompanyDetails, Fleet } from '../../types';
import { API_URL, fetchChannelWebhooks, runChannelCertification } from '../../firebase/api';
import { openIntegrationGuide } from '../../services/integrationGuide';
import { Panel, Button, Badge } from '../ui/Crm';

interface Props {
  aggregator: Aggregator;
  fleet: Fleet;
  company: CompanyDetails;
  currentUserName?: string;
  onUpdate: (a: Aggregator) => void;
  showConfirmation?: (m: string) => void;
}

/** Commercial items agreed with the broker (ticked by staff). */
const COMMERCIAL: [string, string][] = [
  ['agreement', 'Signed distribution agreement'], ['markets', 'Markets / countries agreed'], ['pricing', 'Gross, net or commission model agreed'],
  ['tax', 'Tax responsibility agreed'], ['payment', 'Payment model agreed'], ['deposit', 'Deposit and prepayment rules agreed'],
  ['cancellation', 'Cancellation and no-show policy agreed'], ['amendment', 'Amendment policy agreed'], ['cutoff', 'Booking cut-off and maximum rental agreed'],
  ['allotment', 'Allotment / free-sale model agreed'], ['settlement', 'Commission settlement frequency agreed'], ['sla', 'Support SLA agreed'],
];

/** Technical items: the ones the system can check are ticked automatically. */
type Tech = { id: string; label: string; auto?: (a: Aggregator, f: Fleet, secret: boolean) => boolean };
const TECHNICAL: Tech[] = [
  { id: 'code', label: 'Channel and supplier codes set', auto: a => !!a.channelCode && !!a.vendorCode },
  { id: 'key', label: 'API key issued (Connection tab)', auto: a => !!a.feedKeyHash },
  { id: 'rates', label: 'Rates published', auto: a => (a.ratePlanHistory || []).length > 0 },
  { id: 'locations', label: 'Location codes mapped', auto: a => !!a.bookingRules?.locations?.length || !!a.locationCode },
  { id: 'groups', label: 'Vehicle groups mapped (cars have SIPP codes)', auto: (a, f) => f.some(v => !!v.sippCode) },
  { id: 'extras', label: 'Extra codes mapped', auto: a => (a.extras || []).every(e => !!e.otaEquipType) },
  { id: 'rules', label: 'Payment and cancellation rules saved', auto: a => !!a.bookingRules?.paymentModel },
  { id: 'webhook', label: 'Webhook URL registered', auto: a => !!a.bookingRules?.webhookUrl },
  { id: 'secret', label: 'Webhook secret exchanged', auto: (_a, _f, s) => s },
  { id: 'guide', label: 'Integration guide and sample messages sent to the broker' },
  { id: 'ip', label: 'IP allow-list configured, if required by the broker' },
  { id: 'certified', label: 'Certification tests passed', auto: a => !!a.goLive?.certification && a.goLive.certification.passed === a.goLive.certification.total },
  { id: 'load', label: 'Load test agreed and passed' },
  { id: 'security', label: 'Security review passed' },
];

const Check: React.FC<{ on: boolean; auto?: boolean; label: string; onToggle?: () => void }> = ({ on, auto, label, onToggle }) => (
  <button type="button" onClick={onToggle} disabled={auto} className={`w-full text-left flex items-start gap-3 px-3 py-2 rounded-lg ${auto ? 'cursor-default' : 'hover:bg-slate-50'}`}>
    <span className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-[11px] font-bold ${on ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300 bg-white'}`}>{on ? '✓' : ''}</span>
    <span className={`text-[13px] ${on ? 'text-slate-900' : 'text-slate-600'}`}>{label}</span>
    {auto && <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-slate-400 shrink-0 pt-1">Checked by system</span>}
  </button>
);

const GoLiveView: React.FC<Props> = ({ aggregator: a, fleet, company, currentUserName, onUpdate, showConfirmation }) => {
  const [secret, setSecret] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetchChannelWebhooks(a.id).then(w => setSecret(!!w.secretCreatedAt)).catch(() => setSecret(false)); }, [a.id]);

  const ticks = a.goLive?.checklist || {};
  const toggle = (id: string) => onUpdate({ ...a, goLive: { ...a.goLive, checklist: { ...ticks, [id]: !ticks[id] } } });
  const techState = TECHNICAL.map(t => ({ ...t, on: t.auto ? t.auto(a, fleet, secret) : !!ticks[t.id] }));
  const commercialDone = COMMERCIAL.filter(([id]) => ticks[id]).length;
  const techDone = techState.filter(t => t.on).length;
  const total = COMMERCIAL.length + TECHNICAL.length;
  const done = commercialDone + techDone;
  const ready = done === total;
  const cert = a.goLive?.certification;

  const certify = async () => {
    setRunning(true); setError(null);
    try {
      const report = await runChannelCertification(a.id);
      onUpdate({ ...a, goLive: { ...a.goLive, certification: report } });
      showConfirmation?.(`Certification: ${report.passed} of ${report.total} tests passed.`);
    } catch (e: any) { setError(e.message); } finally { setRunning(false); }
  };
  const approve = () => {
    if (!window.confirm(`Approve ${a.name} for production? The channel will be set Live: bookings become real reservations.`)) return;
    onUpdate({ ...a, status: 'active', connectionDetails: { ...a.connectionDetails, environment: 'production' },
      goLive: { ...a.goLive, approvedBy: currentUserName || 'Staff', approvedAt: new Date().toISOString() } });
    showConfirmation?.(`${a.name} is live.`);
  };

  return (
    <div className="space-y-4">
      <Panel padded>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3.5" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke={ready ? '#10b981' : '#6366f1'} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(done / total) * 97.4} 97.4`} /></svg>
            <span className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold tabular-nums">{Math.round((done / total) * 100)}%</span>
          </div>
          <div className="flex-1 min-w-[220px]">
            <p className="text-[15px] font-semibold text-slate-900">{a.goLive?.approvedAt ? 'Live in production' : ready ? 'Ready for go-live' : 'Go-live checklist'}</p>
            <p className="text-[13px] text-slate-500">
              {a.goLive?.approvedAt ? `Approved by ${a.goLive.approvedBy} on ${new Date(a.goLive.approvedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}.`
                : `${done} of ${total} items complete. Every item must be done before the broker sells live.`}
            </p>
          </div>
          <Button onClick={() => openIntegrationGuide(a, company, API_URL || window.location.origin) || alert('Allow pop-ups to open the guide.')}>Integration guide (PDF)</Button>
          <Button variant="primary" onClick={approve} disabled={!ready || !!a.goLive?.approvedAt}>{a.goLive?.approvedAt ? 'Approved' : 'Approve go-live'}</Button>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Commercial" subtitle={`${commercialDone} of ${COMMERCIAL.length} agreed`} bodyClassName="p-2">
          {COMMERCIAL.map(([id, label]) => <Check key={id} on={!!ticks[id]} label={label} onToggle={() => toggle(id)} />)}
        </Panel>
        <Panel title="Technical" subtitle={`${techDone} of ${TECHNICAL.length} complete`} bodyClassName="p-2">
          {techState.map(t => <Check key={t.id} on={t.on} auto={!!t.auto} label={t.label} onToggle={t.auto ? undefined : () => toggle(t.id)} />)}
        </Panel>
      </div>

      <Panel title="Certification tests" subtitle="Runs every broker test case against this channel in the sandbox. Nothing is booked for real and no webhooks are sent."
        actions={<Button variant="primary" size="sm" onClick={certify} disabled={running}>{running ? 'Running…' : cert ? 'Run again' : 'Run certification'}</Button>}>
        {error && <p className="px-4 py-3 text-xs text-rose-600">{error}</p>}
        {cert ? (
          <>
            <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-100">
              <Badge tone={cert.passed === cert.total ? 'success' : 'warning'}>{cert.passed} / {cert.total} passed</Badge>
              <span className="text-xs text-slate-500">Last run {new Date(cert.ranAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {cert.results.map(t => (
                <li key={t.id} className="px-4 py-2.5 flex items-start gap-3">
                  <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${t.passed ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{t.passed ? '✓' : '✕'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-slate-900">{t.name}</p>
                    <p className={`text-xs ${t.passed ? 'text-slate-500' : 'text-rose-600'} break-words`}>{t.detail}</p>
                  </div>
                  <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{t.ms} ms</span>
                </li>
              ))}
            </ul>
          </>
        ) : <p className="px-4 py-8 text-center text-[13px] text-slate-500">Not run yet. Run it after publishing rates and saving the booking rules.</p>}
      </Panel>
    </div>
  );
};

export default GoLiveView;
