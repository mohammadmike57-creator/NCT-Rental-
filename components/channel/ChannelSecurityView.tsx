import React, { useCallback, useEffect, useState } from 'react';
import { Aggregator } from '../../types';
import { ChannelSecurityInfo, fetchChannelSecurity, rotateWebhookSecret, unlockChannelAddress } from '../../services/api';
import { Panel, Badge, Button, StatGrid, EmptyState, table, inputCls } from '../ui/Crm';
import { CheckCircleIcon } from '../icons';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const daysSince = (s?: string) => (s ? Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / 86400000)) : null);

interface Check { label: string; detail: string; ok: boolean; weight: number }

/** Security of one broker connection: what protects it, who is calling, failed sign-ins and locked addresses. */
const ChannelSecurityView: React.FC<{ aggregator: Aggregator; onUpdate: (a: Aggregator) => void; showConfirmation: (m: string) => void }> =
  ({ aggregator: a, onUpdate, showConfirmation }) => {
    const [info, setInfo] = useState<ChannelSecurityInfo | null>(null);
    const [failed, setFailed] = useState(false);
    const [secret, setSecret] = useState<string | null>(null);
    const [newIp, setNewIp] = useState('');
    const rules = a.bookingRules || {};
    const allow = rules.ipAllowlist || [];

    const load = useCallback(() => {
      setFailed(false);
      fetchChannelSecurity(a.id).then(setInfo).catch(() => setFailed(true));
    }, [a.id]);
    useEffect(() => { setInfo(null); load(); }, [load]);

    const saveRules = (patch: Partial<typeof rules>, msg: string) => { onUpdate({ ...a, bookingRules: { ...rules, ...patch } }); showConfirmation(msg); };
    const setAllow = (list: string[]) => saveRules({ ipAllowlist: list }, list.length ? `IP allow-list for ${a.name}: ${list.length} address${list.length === 1 ? '' : 'es'}.` : `IP allow-list for ${a.name} removed: any address with the key is accepted.`);
    const addIp = (ip: string) => {
      const v = ip.trim();
      if (!/^[0-9a-fA-F:.]+$/.test(v)) { window.alert('Enter an IPv4 or IPv6 address, e.g. 203.0.113.10'); return; }
      if (!allow.includes(v)) setAllow([...allow, v]);
      setNewIp('');
    };
    const toggleSignature = (on: boolean) => {
      if (on && !info?.signingSecretCreatedAt) { window.alert('Create the signing secret first and give it to the broker.'); return; }
      if (on && !window.confirm(`Require signed requests from ${a.name}?\n\nRequests without a valid X-URD-Signature are refused from now on. Only switch this on once the broker has confirmed they sign every request.`)) return;
      saveRules({ requireSignature: on }, on ? `${a.name} must now sign every request.` : `Signed requests are no longer required for ${a.name}.`);
    };
    const createSecret = async () => {
      if (info?.signingSecretCreatedAt && !window.confirm('Replace the signing secret?\n\nWebhook signatures and signed requests made with the old secret stop working at once.')) return;
      try { const s = await rotateWebhookSecret(a.id); setSecret(s.secret); load(); } catch (e) { window.alert((e as Error).message); }
    };
    const unlock = async (ip: string) => {
      try { await unlockChannelAddress(a.id, ip); showConfirmation(`${ip} unlocked.`); load(); } catch (e) { window.alert((e as Error).message); }
    };

    const keyAge = daysSince(a.feedKeyCreatedAt);
    const graceLeft = a.previousKeyExpiresAt && new Date(a.previousKeyExpiresAt).getTime() > Date.now() ? a.previousKeyExpiresAt : null;
    const checks: Check[] = [
      { label: 'Live API key', detail: a.feedKeyHash ? `…${a.feedKeyHint}, ${keyAge ?? '?'} day${keyAge === 1 ? '' : 's'} old${keyAge != null && keyAge > 365 ? ': replace it, keys should be renewed yearly' : ''}` : 'No key: the broker cannot connect', ok: !!a.feedKeyHash && (keyAge == null || keyAge <= 365), weight: 25 },
      { label: 'IP allow-list', detail: allow.length ? `Only ${allow.join(', ')}` : 'Any address with the key is accepted. Ask the broker for their server addresses.', ok: allow.length > 0, weight: 25 },
      { label: 'Signed requests', detail: rules.requireSignature ? 'Every request must carry a valid signature (HMAC SHA-256, 5-minute window, no replays)' : 'Off: the key alone authenticates. Switch on when the broker supports it.', ok: !!rules.requireSignature, weight: 20 },
      { label: 'Signing secret', detail: info?.signingSecretCreatedAt ? `Created ${fmt(info.signingSecretCreatedAt)}` : 'Not created (needed for webhooks and signed requests)', ok: !!info?.signingSecretCreatedAt, weight: 10 },
      { label: 'Webhook address uses HTTPS', detail: rules.webhookUrl ? rules.webhookUrl : 'No webhooks configured', ok: !rules.webhookUrl || rules.webhookUrl.startsWith('https://'), weight: 10 },
      { label: 'No sign-in attacks', detail: info ? `${info.authFailures24h} failed sign-in${info.authFailures24h === 1 ? '' : 's'} in 24 h, ${info.locked.length} address${info.locked.length === 1 ? '' : 'es'} locked` : '…', ok: !!info && info.authFailures24h < 10 && info.locked.length === 0, weight: 10 },
    ];
    const score = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);

    return (
      <div className="space-y-4">
        <StatGrid items={[
          { label: 'Security score', value: `${score} / 100`, sub: score >= 90 ? 'strong' : score >= 60 ? 'good, can be stronger' : 'weak', tone: score >= 90 ? 'success' : score >= 60 ? 'warning' : 'danger' },
          { label: 'Failed sign-ins', value: info ? info.authFailures24h : '…', sub: info ? `${info.authFailures7d} in 7 days` : '', tone: info && info.authFailures24h >= 10 ? 'danger' : 'default' },
          { label: 'Locked addresses', value: info ? info.locked.length : '…', sub: info ? `${info.lockoutPolicy.maxFailures} failures in ${info.lockoutPolicy.windowMinutes} min → ${info.lockoutPolicy.lockMinutes} min lock` : '', tone: info?.locked.length ? 'warning' : 'default' },
          { label: 'Calling addresses', value: info ? info.addresses.length : '…', sub: 'last 7 days' },
        ]} />
        {failed && <p className="text-xs text-rose-600">Could not load the security log from the server.</p>}

        <Panel title="Protection" subtitle="Always on for every broker: HTTPS only, keys stored as fingerprints only, constant-time key checks, the same answer for unknown channels and wrong keys, rate limit, brute-force lockout, XML with external entities disabled, 64 KB request limit, every call logged with secrets masked.">
          <ul className="divide-y divide-slate-100">
            {checks.map(c => (
              <li key={c.label} className="px-4 py-2.5 flex items-center gap-3">
                <span className={`w-6 h-6 shrink-0 rounded-full inline-flex items-center justify-center ${c.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-50 text-amber-600 ring-1 ring-amber-200'}`}>
                  {c.ok ? <CheckCircleIcon className="w-4 h-4" /> : <span className="text-xs font-bold">!</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-slate-900">{c.label}</p>
                  <p className="text-xs text-slate-500 break-words">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          {graceLeft && <p className="px-4 py-2 text-xs text-amber-700 border-t border-slate-100">The previous key still works until {fmt(graceLeft)} (switch-over period).</p>}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="IP allow-list" subtitle="When set, only these addresses can call with this broker's key.">
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {allow.length === 0 ? <span className="text-xs text-slate-400">Not set</span> : allow.map(ip => (
                  <span key={ip} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-slate-200 bg-slate-50 font-mono text-xs">
                    {ip}<button type="button" aria-label={`Remove ${ip}`} onClick={() => setAllow(allow.filter(x => x !== ip))} className="text-slate-400 hover:text-rose-600">×</button>
                  </span>
                ))}
              </div>
              <form className="flex gap-2" onSubmit={e => { e.preventDefault(); addIp(newIp); }}>
                <input value={newIp} onChange={e => setNewIp(e.target.value)} placeholder="203.0.113.10" className={`${inputCls} font-mono`} aria-label="IP address" />
                <Button type="submit" disabled={!newIp.trim()}>Add</Button>
              </form>
              <p className="text-[11px] text-slate-400">Add the broker's addresses before go-live; you can pick them from "Calling addresses" once they have tested.</p>
            </div>
          </Panel>

          <Panel title="Signed requests" subtitle="Optional extra layer: the broker signs each request with the shared secret, so a stolen key alone is useless.">
            <div className="p-4 space-y-3">
              <label className="flex items-start gap-2 text-[13px] text-slate-700 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={!!rules.requireSignature} onChange={e => toggleSignature(e.target.checked)} />
                <span>Require signed requests<span className="block text-xs text-slate-400">Headers X-URD-Timestamp (Unix seconds) and X-URD-Signature: sha256=HMAC(secret, timestamp + "." + body). At most 5 minutes old; each signature is accepted once. Brokers already sending X-NCT-* keep working.</span></span>
              </label>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => void createSecret()}>{info?.signingSecretCreatedAt ? 'Replace signing secret' : 'Create signing secret'}</Button>
                <span className="text-xs text-slate-500">{info?.signingSecretCreatedAt ? `Created ${fmt(info.signingSecretCreatedAt)}` : 'No secret yet'}</span>
              </div>
              {secret && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-xs font-semibold text-amber-900">Copy it now and send it to the broker securely. It will not be shown again.</p>
                  <code className="block mt-1 break-all text-xs font-mono text-slate-800">{secret}</code>
                </div>
              )}
            </div>
          </Panel>
        </div>

        <Panel title="Calling addresses" subtitle="Every address that used this broker's channel code in the last 7 days (most recent 500 requests)." actions={<Button size="sm" onClick={load}>Refresh</Button>}>
          {!info ? <p className="px-4 py-8 text-center text-[13px] text-slate-500">{failed ? 'Not available' : 'Loading…'}</p> : info.addresses.length === 0 ? (
            <EmptyState title="No requests yet" hint="Addresses appear here once the broker starts calling." />
          ) : (
            <div className="overflow-x-auto">
              <table className={`${table.wrap} min-w-[640px]`}>
                <thead className={table.head}><tr>{['Address', 'Requests', 'Failed sign-ins', 'Last seen', 'Status', ''].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
                <tbody className={table.body}>
                  {info.addresses.map(x => {
                    const locked = info.locked.find(l => l.ip === x.ip);
                    const listed = allow.includes(x.ip);
                    return (
                      <tr key={x.ip} className={table.row}>
                        <td className={`${table.td} font-mono text-xs`}>{x.ip}</td>
                        <td className={`${table.td} tabular-nums`}>{x.requests}</td>
                        <td className={`${table.td} tabular-nums ${x.authFailures ? 'text-rose-600 font-semibold' : ''}`}>{x.authFailures}</td>
                        <td className={`${table.td} text-xs`}>{fmt(x.lastSeen)}</td>
                        <td className={table.td}>
                          {locked ? <Badge tone="danger">Locked until {fmt(locked.until)}</Badge> : listed ? <Badge tone="success">Allowed</Badge> : allow.length ? <Badge tone="warning">Not on the list</Badge> : <Badge tone="muted">Any address</Badge>}
                        </td>
                        <td className={`${table.td} text-right whitespace-nowrap`}>
                          {locked && <Button size="sm" variant="ghost" onClick={() => void unlock(x.ip)}>Unlock</Button>}
                          {!listed && x.authFailures < x.requests && <Button size="sm" onClick={() => addIp(x.ip)}>Allow</Button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {info && info.locked.filter(l => !info.addresses.some(x => x.ip === l.ip)).map(l => (
            <div key={l.ip} className="px-4 py-2 border-t border-slate-100 flex items-center gap-3 text-xs">
              <Badge tone="danger">Locked</Badge><span className="font-mono">{l.ip}</span><span className="text-slate-500">until {fmt(l.until)}</span>
              <Button size="sm" variant="ghost" onClick={() => void unlock(l.ip)}>Unlock</Button>
            </div>
          ))}
        </Panel>
      </div>
    );
  };

export default ChannelSecurityView;
