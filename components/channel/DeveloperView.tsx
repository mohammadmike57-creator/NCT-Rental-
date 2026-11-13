import React, { useEffect, useState } from 'react';
import { API_URL, RetentionPolicy, fetchRetentionPolicy } from '../../services/api';
import { Panel, Badge, Button, table } from '../ui/Crm';
import CodeView from './CodeView';

/**
 * Developer hub of the distribution platform: every API version and its status, the documents brokers download,
 * a quick start for REST v3 and how to verify webhooks v2. Read-only: nothing here changes a channel.
 */
const DeveloperView: React.FC = () => {
  const base = (API_URL || window.location.origin).replace(/\/$/, '');
  const [copied, setCopied] = useState('');
  const [retention, setRetention] = useState<RetentionPolicy | null>(null);
  useEffect(() => { fetchRetentionPolicy().then(setRetention).catch(() => setRetention(null)); }, []);
  const copy = (k: string, v: string) => { navigator.clipboard?.writeText(v).then(() => { setCopied(k); setTimeout(() => setCopied(''), 1500); }).catch(() => {}); };

  const versions: [string, string, string, 'success' | 'info' | 'muted' | 'warning', string][] = [
    ['OTA XML 2024A', `/ota/2024A/{CODE}/{Message}`, 'API key, optional HMAC', 'success', 'Default for new XML brokers'],
    ['OTA XML 2018A', `/ota/2018A/{CODE}/{Message}`, 'API key, optional HMAC', 'success', 'Legacy OpenTravel brokers'],
    ['OTA XML v1', `/ota/v1/{CODE}/{Message}`, 'API key', 'info', 'Frozen for HOG and AUE; no changes'],
    ['SOAP 1.1 / 1.2', `/ota/{CODE}/soap (?wsdl)`, 'API key or MessagePassword', 'success', 'Same messages, WSDL provided'],
    ['REST/JSON v3', `/api/v3/…`, 'OAuth 2.0 client credentials', 'success', 'Modern API, OpenAPI 3.1'],
    ['REST partner v1', `/partner/v1/{CODE}/…`, 'API key', 'warning', 'Kept; use v3 for new brokers'],
  ];
  const docs: [string, string, string][] = [
    ['Developer portal', `${base}/ota/developers`, 'The full guide for brokers: every API, code samples, webhooks, errors, go-live steps'],
    ['Postman collection', `${base}/api/v3/postman.json`, 'Every REST and XML request, ready to run in the sandbox'],
    ['OpenAPI 3.1 (REST v3)', `${base}/api/v3/openapi.yaml`, 'Import into Postman, Swagger or code generators'],
    ['Error catalogue', `${base}/ota/errors`, 'Every error code with HTTP status, OTA code and what to do'],
    ['Platform health', `${base}/ota/health`, 'Database check, time zone, API versions'],
    ['REST v3 health', `${base}/api/v3/health`, 'v3 envelope check, no login needed'],
  ];
  const quick = `# 1. Get a token (client ID and secret from the channel's API v3 tab)
curl -s -X POST ${base}/oauth/token -u "$CLIENT_ID:$CLIENT_SECRET" \\
  -d grant_type=client_credentials

# 2. Search (times are Asia/Amman local time)
curl -s -X POST ${base}/api/v3/availability/search \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"pickUp":{"location":"AMM","local":"2027-03-10T10:00"},"return":{"location":"AMM","local":"2027-03-14T10:00"}}'

# 3. Book the quote (the same Idempotency-Key never books twice)
curl -s -X POST ${base}/api/v3/reservations \\
  -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: hog-7731904" -H "Content-Type: application/json" \\
  -d '{"quoteId":"OFF-…","brokerReference":"HOG-7731904","customer":{"firstName":"Omar","lastName":"Haddad"}}'`;
  const verify = `// Node.js: verify a UR-Drive webhook v2 (Express, raw body)
const crypto = require('crypto');
function verify(req, secret) {
  const id = req.get('URD-Webhook-Id'), ts = req.get('URD-Webhook-Timestamp'), nonce = req.get('URD-Webhook-Nonce');
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;          // 5-minute window
  const expected = crypto.createHmac('sha256', secret).update(\`\${id}.\${ts}.\${nonce}.\${req.rawBody}\`).digest('hex');
  return req.get('URD-Webhook-Signature').split(',')                          // two signatures during a rotation
    .some(s => s.trim() === 'v1=' + expected);
}
// Answer 2xx within 10 seconds; store URD-Webhook-Id and ignore repeats.`;

  return (
    <div className="space-y-4">
      <Panel title="API versions" subtitle="Older versions keep working; new ones are added next to them. Breaking changes only in a new major version, announced 12 months ahead.">
        <div className="overflow-x-auto">
          <table className={`${table.wrap} min-w-[720px]`}>
            <thead className={table.head}><tr>{['Version', 'Address', 'Login', 'Status'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
            <tbody className={table.body}>
              {versions.map(([v, path, login, tone, note]) => (
                <tr key={v} className={table.row}>
                  <td className={`${table.td} font-semibold text-slate-900 whitespace-nowrap`}>{v}</td>
                  <td className={table.td}><code className="text-[12px] font-mono text-slate-800">{path}</code></td>
                  <td className={`${table.td} text-xs text-slate-600`}>{login}</td>
                  <td className={table.td}><Badge tone={tone}>{note}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 pb-3 text-[11px] text-slate-500">Nine OTA messages on every XML address: Ping, VehLocSearch, VehLocDetail, VehAvailRate, VehRateRule, VehRes, VehRetRes, VehModify, VehCancel. Every response carries X-Correlation-ID and X-API-Version.</p>
      </Panel>

      <Panel title="Documents for brokers" subtitle="Public addresses: they contain no keys or channel data, so they can be sent to any broker.">
        <ul className="divide-y divide-slate-100">
          {docs.map(([t, url, hint]) => (
            <li key={t} className="px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-slate-900">{t}</p>
                <p className="text-xs text-slate-500">{hint}</p>
                <code className="text-[11px] font-mono text-slate-600 break-all">{url}</code>
              </div>
              <Button size="sm" onClick={() => copy(t, url)}>{copied === t ? 'Copied' : 'Copy link'}</Button>
              <a href={url} target="_blank" rel="noreferrer" className="h-8 px-2.5 inline-flex items-center rounded-md text-xs font-semibold text-indigo-600 hover:bg-indigo-50">Open</a>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Data retention" subtitle="The gateway's own working records are cleaned up daily. Reservations, agreements and live broker bookings are never removed by this.">
        <div className="overflow-x-auto">
          <table className={`${table.wrap} min-w-[560px]`}>
            <thead className={table.head}><tr>{['Record', 'Kept for', 'Why'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
            <tbody className={table.body}>
              {([
                ['XML traffic log (requests and answers)', retention?.trafficLogDays ?? 30, 'Support and disputes; contains customer names'],
                ['Quotes not booked', retention?.quoteDays ?? 3, 'Only needed while the broker may book them'],
                ['Delivered webhooks', retention?.deliveredWebhookDays ?? 90, 'Proof of delivery'],
                ['Failed webhooks (dead letter)', retention?.deadLetterDays ?? 180, 'Time to replay'],
                ['Rate sheet delivery log', retention?.deliveryLogDays ?? 180, 'History of what was sent'],
                ['Test (sandbox) bookings', retention?.sandboxBookingDays ?? 90, 'Certification evidence; never in the reservations list'],
              ] as [string, number, string][]).map(([r, d, w]) => (
                <tr key={r} className={table.row}>
                  <td className={`${table.td} text-[13px] font-medium text-slate-900`}>{r}</td>
                  <td className={`${table.td} tabular-nums`}>{d} days</td>
                  <td className={`${table.td} text-xs text-slate-500`}>{w}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-slate-500">{retention?.lastRun?.ranAt ? `Last clean-up ${new Date(retention.lastRun.ranAt).toLocaleString('en-GB')}: ${retention.lastRun.sandboxBookings ?? 0} test bookings, ${(retention.lastRun.deliveredWebhooks ?? 0) + (retention.lastRun.deadLetterWebhooks ?? 0)} webhooks, ${retention.lastRun.deliveryLog ?? 0} log rows removed.` : 'The first clean-up runs a few minutes after the server starts, then every 24 hours.'}</p>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Quick start: REST/JSON v3" subtitle="Three calls from login to booking." bodyClassName="p-3">
          <CodeView code={quick} lang="text" title="quick-start.sh" format={false} height="24rem" download="quick-start.sh" />
        </Panel>
        <Panel title="Verifying webhooks v2" subtitle="HMAC-SHA256 over id.timestamp.nonce.body; 72 h retries, then the dead-letter list." bodyClassName="p-3">
          <CodeView code={verify} lang="text" title="verify-webhook" format={false} height="24rem" download="verify-webhook.txt" />
        </Panel>
      </div>
    </div>
  );
};

export default DeveloperView;
