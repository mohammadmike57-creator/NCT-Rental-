import React, { useEffect, useState } from 'react';
import { getMailSettings, MailSettingsView, saveMailSettings, sendTestEmail } from '../firebase/api';
import { Page, PageHeader, StatGrid, Panel, Badge, Button, Field, inputCls, selectCls } from './ui/Crm';

const PROVIDERS: { key: string; label: string; sub: string; host: string; port: number; security: 'STARTTLS' | 'SSL'; user?: string; help: string }[] = [
  { key: 'domain', label: 'Your domain email', sub: 'e.g. bookings@yourcompany.com', host: '', port: 465, security: 'SSL', help: 'Use an address on your own domain (from your website hosting, cPanel, Plesk, Zoho, etc.). Your hosting panel shows the outgoing (SMTP) server — usually mail.yourdomain.com — with port 465 (SSL) or 587 (STARTTLS). Username is the full email address and the password is that email account\'s password. The system only sends from it; it never opens the inbox.' },
  { key: 'brevo', label: 'Brevo', sub: 'Optional sending service', host: 'smtp-relay.brevo.com', port: 587, security: 'STARTTLS', help: 'Free plan available. In Brevo: Senders & IP → add and verify your domain or sender address, then SMTP & API → create an SMTP key. Username = your Brevo SMTP login, password = the SMTP key.' },
  { key: 'sendgrid', label: 'SendGrid', sub: 'Optional sending service', host: 'smtp.sendgrid.net', port: 587, security: 'STARTTLS', user: 'apikey', help: 'In SendGrid: verify a sender or your domain, then create an API key with "Mail Send" permission. Username is the word apikey, password is the API key.' },
  { key: 'mailgun', label: 'Mailgun', sub: 'Optional sending service', host: 'smtp.mailgun.org', port: 587, security: 'STARTTLS', help: 'In Mailgun: add and verify your sending domain, then create SMTP credentials for it (e.g. postmaster@mg.yourdomain.com).' },
  { key: 'ses', label: 'Amazon SES', sub: 'Optional sending service', host: 'email-smtp.eu-west-1.amazonaws.com', port: 587, security: 'STARTTLS', help: 'In Amazon SES: verify your domain, then create SMTP credentials. Use the SMTP endpoint of your SES region.' },
  { key: 'gmail', label: 'Gmail / Workspace', sub: 'Existing Google account', host: 'smtp.gmail.com', port: 587, security: 'STARTTLS', help: 'Uses an existing Google account only to send. Turn on 2-Step Verification, create an App password (Google Account → Security → App passwords) and paste it as the password.' },
  { key: 'outlook', label: 'Outlook / 365', sub: 'Existing Microsoft account', host: 'smtp.office365.com', port: 587, security: 'STARTTLS', help: 'Uses an existing Microsoft 365 account only to send. SMTP AUTH must be allowed for it in Microsoft 365 admin.' },
  { key: 'custom', label: 'Other', sub: 'Any SMTP server', host: '', port: 587, security: 'STARTTLS', help: 'Ask your email or hosting provider for the SMTP server, port and login.' },
];

/** Settings row: short description column on the left (lg), content on the right. */
const SettingsSection: React.FC<{ title: string; description: React.ReactNode; children: React.ReactNode }> = ({ title, description, children }) => (
  <div className="lg:grid lg:grid-cols-3 lg:gap-6">
    <div className="mb-3 lg:mb-0 lg:pt-1">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-0.5 text-[13px] text-slate-500">{description}</div>
    </div>
    <div className="lg:col-span-2 min-w-0">{children}</div>
  </div>
);

const Spinner = () => <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />;


const EmailSettingsView: React.FC<{ defaultFromName?: string; defaultTestTo?: string }> = ({ defaultFromName, defaultTestTo }) => {
  const [loaded, setLoaded] = useState<MailSettingsView | null>(null);
  const [form, setForm] = useState({ enabled: true, host: '', port: 465, security: 'SSL' as 'STARTTLS' | 'SSL', username: '', password: '', fromAddress: '', fromName: defaultFromName || '', replyTo: '' });
  const [provider, setProvider] = useState('domain');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [testTo, setTestTo] = useState(defaultTestTo || '');
  const [loadError, setLoadError] = useState<string | null>(null);

  const apply = (s: MailSettingsView) => {
    setLoaded(s);
    setForm(f => ({ ...f, enabled: s.source === 'none' ? true : s.enabled, host: s.host || f.host, port: s.port || f.port, security: s.security || f.security,
      username: s.username || '', password: '', fromAddress: s.fromAddress || '', fromName: s.fromName || f.fromName, replyTo: s.replyTo || '' }));
    const p = PROVIDERS.find(x => x.host && x.host === s.host);
    setProvider(p ? p.key : s.host ? 'domain' : 'domain');
  };

  useEffect(() => { getMailSettings().then(apply).catch(e => setLoadError(e.message)); }, []);

  const pick = (key: string) => {
    setProvider(key);
    const p = PROVIDERS.find(x => x.key === key)!;
    if (key === 'domain') {
      const dom = (form.username.split('@')[1] || form.fromAddress.split('@')[1] || '').trim();
      setForm(f => ({ ...f, host: f.host && !PROVIDERS.some(x => x.host && x.host === f.host) ? f.host : dom ? `mail.${dom}` : '', port: 465, security: 'SSL' }));
    } else if (key !== 'custom') setForm(f => ({ ...f, host: p.host, port: p.port, security: p.security, username: p.user && !f.username ? p.user : f.username }));
  };

  const save = async () => {
    setBusy('save');
    setMsg(null);
    try {
      const s = await saveMailSettings({ ...form, password: form.password || undefined });
      apply(s);
      setMsg({ tone: 'ok', text: s.configured ? 'Saved. Customer emails will now be sent from ' + (s.fromAddress || s.username) + '. Send a test to confirm.' : 'Saved. Sending is switched off.' });
    } catch (e: any) {
      setMsg({ tone: 'err', text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    if (!/^\S+@\S+\.\S+$/.test(testTo.trim())) { setMsg({ tone: 'err', text: 'Enter the address to send the test to.' }); return; }
    setBusy('test');
    setMsg(null);
    try {
      await sendTestEmail(testTo.trim());
      setMsg({ tone: 'ok', text: `Test email sent to ${testTo.trim()}. Check the inbox (and the spam folder).` });
    } catch (e: any) {
      setMsg({ tone: 'err', text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const status = !loaded ? null : loaded.configured
    ? { tone: 'success' as const, cls: 'bg-emerald-50/60 text-emerald-900 border-emerald-200', dot: 'bg-emerald-500', title: 'Sending is on', text: `Customers receive documents from ${loaded.fromName ? loaded.fromName + ' ' : ''}<${loaded.fromAddress || loaded.username}> via ${loaded.host}. ${loaded.replyTo ? `Replies go to ${loaded.replyTo}.` : 'Send-only: emails say replies are not received and give your phone number.'}${loaded.source === 'environment' ? ' (Set by the server environment — saving here takes over.)' : ''}` }
    : { tone: 'warning' as const, cls: 'bg-amber-50/60 text-amber-900 border-amber-200', dot: 'bg-amber-500', title: 'Sending is not set up', text: 'Rental agreements, termination statements, claims and invoices cannot be emailed yet. Fill in the form below and save.' };
  const providerHelp = PROVIDERS.find(p => p.key === provider)?.help;

  return (
    <Page>
      <PageHeader
        section="Administration"
        title="Email Settings"
        subtitle="How the system sends rental agreements, termination statements, claims and invoices to customers. It only sends — it never receives or reads email, so no inbox is needed."
        actions={status ? <Badge tone={status.tone}>{status.title}</Badge> : undefined}
      />

      <StatGrid items={[
        { label: 'Status', value: !loaded ? '—' : loaded.configured ? 'Active' : 'Not set up', tone: !loaded ? 'muted' : loaded.configured ? 'success' : 'warning' },
        { label: 'Server', value: loaded?.host || '—', sub: loaded?.host ? `Port ${loaded.port || ''} · ${loaded.security || ''}` : undefined, tone: 'muted' },
        { label: 'Sender', value: loaded ? (loaded.fromAddress || loaded.username || '—') : '—', sub: loaded?.replyTo ? `Replies to ${loaded.replyTo}` : 'Send-only', tone: 'muted' },
      ]} />

      {loadError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{loadError}</div>}
      {status && (
        <div className={`rounded-xl border px-4 py-3 flex gap-3 ${status.cls}`}>
          <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${status.dot}`} />
          <div className="min-w-0"><p className="font-semibold text-[13px]">{status.title}</p><p className="text-[13px] break-words">{status.text}</p>
            {loaded?.updatedBy && <p className="text-xs opacity-80 mt-1">Last changed by {loaded.updatedBy}{loaded.updatedAt ? ` on ${new Date(loaded.updatedAt).toLocaleString('en-GB')}` : ''}</p>}</div>
        </div>
      )}

      <SettingsSection
        title="Sending service"
        description="Use your own domain email (any address on your domain), or an existing Google / Microsoft account. Sending services like Brevo or SendGrid are optional — useful only for very high volumes."
      >
        <Panel
          title="SMTP connection"
          actions={
            <label className="flex items-center gap-2 text-[13px] font-medium text-slate-700 cursor-pointer">
              <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              Send documents to customers
            </label>
          }
          footer={
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span>The password is stored encrypted on the server and is never shown again or sent back to the browser.</span>
              <Button variant="primary" size="sm" onClick={save} disabled={!!busy} icon={busy === 'save' ? <Spinner /> : undefined} className="shrink-0">Save settings</Button>
            </div>
          }
        >
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Provider</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {PROVIDERS.map(p => (
                  <button key={p.key} type="button" onClick={() => pick(p.key)} aria-pressed={provider === p.key}
                    className={`px-3 py-2 rounded-lg text-left border transition-colors min-w-0 ${provider === p.key ? 'border-indigo-500 ring-2 ring-indigo-500/15 bg-indigo-50/40' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <p className="text-[13px] font-semibold text-slate-900 truncate">{p.label}</p>
                    <p className="text-[11px] text-slate-500 truncate">{p.sub}</p>
                  </button>
                ))}
              </div>
              {providerHelp && <p className="mt-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">{providerHelp}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_100px_180px] gap-3">
              <Field label="SMTP server">
                <input className={inputCls} value={form.host} onChange={e => { setForm(f => ({ ...f, host: e.target.value })); setProvider('custom'); }} placeholder="smtp.example.com" />
              </Field>
              <Field label="Port">
                <input type="number" className={`${inputCls} tabular-nums`} value={form.port} onChange={e => setForm(f => ({ ...f, port: parseInt(e.target.value) || 587 }))} />
              </Field>
              <Field label="Security">
                <select className={`${selectCls} w-full`} value={form.security} onChange={e => setForm(f => ({ ...f, security: e.target.value as 'STARTTLS' | 'SSL' }))}><option value="STARTTLS">STARTTLS (587)</option><option value="SSL">SSL/TLS (465)</option></select>
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="SMTP username">
                <input className={inputCls} value={form.username} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, username: v, host: provider === 'domain' && (!f.host || f.host.startsWith('mail.')) && v.includes('@') ? `mail.${v.split('@')[1]}` : f.host, fromAddress: provider === 'domain' && (!f.fromAddress || f.fromAddress === f.username) ? v : f.fromAddress })); }}
                  placeholder={provider === 'domain' ? 'bookings@yourcompany.com' : provider === 'sendgrid' ? 'apikey' : 'Login from your sending service'} autoComplete="off" />
              </Field>
              <Field label={<>Password {loaded?.passwordSet && <span className="font-normal text-emerald-600">· saved (leave empty to keep)</span>}</>}>
                <input type="password" className={inputCls} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={loaded?.passwordSet ? '••••••••••••' : provider === 'gmail' ? '16-character app password' : provider === 'domain' ? 'The email account\'s password' : provider === 'custom' || provider === 'outlook' ? 'Password' : 'SMTP key / API key'} autoComplete="new-password" />
              </Field>
              <Field label="Sender name customers see">
                <input className={inputCls} value={form.fromName} onChange={e => setForm(f => ({ ...f, fromName: e.target.value }))} placeholder="UR-Drive Jordan" />
              </Field>
              <Field label={<>Sender address <span className="font-normal text-slate-400">(normally the same email)</span></>}>
                <input className={inputCls} value={form.fromAddress} onChange={e => setForm(f => ({ ...f, fromAddress: e.target.value }))} placeholder="bookings@yourcompany.com" />
              </Field>
              <Field className="md:col-span-2" label={<>Replies go to <span className="font-normal text-slate-400">(optional — leave empty for send-only)</span></>}
                hint="Only fill this in if customers' replies should reach someone. The system itself never reads replies.">
                <input className={inputCls} value={form.replyTo} onChange={e => setForm(f => ({ ...f, replyTo: e.target.value }))} placeholder="Leave empty: emails say replies are not received and show your phone number" />
              </Field>
            </div>
          </div>
        </Panel>
      </SettingsSection>

      <SettingsSection title="Send a test email" description="Confirm the saved settings work by sending a message to any address.">
        <Panel
          footer={
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span>{!loaded?.configured ? 'Save working settings first.' : 'Check the inbox and the spam folder.'}</span>
              <Button variant="primary" size="sm" onClick={test} disabled={!!busy || !loaded?.configured} icon={busy === 'test' ? <Spinner /> : undefined} className="shrink-0">Send test</Button>
            </div>
          }
        >
          <div className="p-4">
            <Field label="Recipient">
              <input className={inputCls} value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="you@yourcompany.com" />
            </Field>
          </div>
        </Panel>
      </SettingsSection>

      {msg && <div className={`rounded-xl border px-4 py-3 text-[13px] ${msg.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{msg.text}</div>}
    </Page>
  );
};

export default EmailSettingsView;
