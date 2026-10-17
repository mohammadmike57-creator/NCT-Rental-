import React, { useEffect, useState } from 'react';
import { getMailSettings, MailSettingsView, saveMailSettings, sendTestEmail } from '../firebase/api';

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

const inputCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-50';

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
    ? { cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500', title: 'Sending is on', text: `Customers receive documents from ${loaded.fromName ? loaded.fromName + ' ' : ''}<${loaded.fromAddress || loaded.username}> via ${loaded.host}. ${loaded.replyTo ? `Replies go to ${loaded.replyTo}.` : 'Send-only: emails say replies are not received and give your phone number.'}${loaded.source === 'environment' ? ' (Set by the server environment — saving here takes over.)' : ''}` }
    : { cls: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500', title: 'Sending is not set up', text: 'Rental agreements, termination statements, claims and invoices cannot be emailed yet. Fill in the form below and save.' };
  const providerHelp = PROVIDERS.find(p => p.key === provider)?.help;

  return (
    <div className="space-y-5 mb-10 max-w-4xl">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Email settings</h2>
          <p className="text-sm text-slate-500">How the system sends rental agreements, termination statements, claims and invoices to customers. It only sends — it never receives or reads email, so no inbox is needed.</p>
        </div>
      </div>

      {loadError && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{loadError}</div>}
      {status && (
        <div className={`rounded-2xl border p-4 flex gap-3 ${status.cls}`}>
          <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${status.dot}`} />
          <div><p className="font-semibold text-sm">{status.title}</p><p className="text-sm">{status.text}</p>
            {loaded?.updatedBy && <p className="text-xs opacity-80 mt-1">Last changed by {loaded.updatedBy}{loaded.updatedAt ? ` on ${new Date(loaded.updatedAt).toLocaleString('en-GB')}` : ''}</p>}</div>
        </div>
      )}

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sending service</h3>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
            <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            Send documents to customers
          </label>
        </div>
        <p className="text-xs text-slate-500 -mt-2">Use your own domain email (any address on your domain), or an existing Google / Microsoft account. Sending services like Brevo or SendGrid are optional — useful only for very high volumes.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {PROVIDERS.map(p => (
            <button key={p.key} onClick={() => pick(p.key)} className={`p-3 rounded-xl text-left ring-1 ${provider === p.key ? 'ring-2 ring-indigo-600 bg-indigo-50/50' : 'ring-slate-200 hover:bg-slate-50'}`}>
              <p className="text-sm font-semibold text-slate-900">{p.label}</p>
              <p className="text-xs text-slate-500">{p.sub}</p>
            </button>
          ))}
        </div>
        {providerHelp && <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">{providerHelp}</p>}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_100px_180px] gap-3">
          <label className="block"><span className="block text-xs font-medium text-slate-500 mb-1">SMTP server</span>
            <input className={inputCls} value={form.host} onChange={e => { setForm(f => ({ ...f, host: e.target.value })); setProvider('custom'); }} placeholder="smtp.example.com" /></label>
          <label className="block"><span className="block text-xs font-medium text-slate-500 mb-1">Port</span>
            <input type="number" className={inputCls} value={form.port} onChange={e => setForm(f => ({ ...f, port: parseInt(e.target.value) || 587 }))} /></label>
          <label className="block"><span className="block text-xs font-medium text-slate-500 mb-1">Security</span>
            <select className={inputCls} value={form.security} onChange={e => setForm(f => ({ ...f, security: e.target.value as 'STARTTLS' | 'SSL' }))}><option value="STARTTLS">STARTTLS (587)</option><option value="SSL">SSL/TLS (465)</option></select></label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block"><span className="block text-xs font-medium text-slate-500 mb-1">SMTP username</span>
            <input className={inputCls} value={form.username} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, username: v, host: provider === 'domain' && (!f.host || f.host.startsWith('mail.')) && v.includes('@') ? `mail.${v.split('@')[1]}` : f.host, fromAddress: provider === 'domain' && (!f.fromAddress || f.fromAddress === f.username) ? v : f.fromAddress })); }}
              placeholder={provider === 'domain' ? 'bookings@yourcompany.com' : provider === 'sendgrid' ? 'apikey' : 'Login from your sending service'} autoComplete="off" /></label>
          <label className="block"><span className="block text-xs font-medium text-slate-500 mb-1">Password {loaded?.passwordSet && <span className="text-emerald-600">· saved (leave empty to keep)</span>}</span>
            <input type="password" className={inputCls} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={loaded?.passwordSet ? '••••••••••••' : provider === 'gmail' ? '16-character app password' : provider === 'domain' ? 'The email account\'s password' : provider === 'custom' || provider === 'outlook' ? 'Password' : 'SMTP key / API key'} autoComplete="new-password" /></label>
          <label className="block"><span className="block text-xs font-medium text-slate-500 mb-1">Sender name customers see</span>
            <input className={inputCls} value={form.fromName} onChange={e => setForm(f => ({ ...f, fromName: e.target.value }))} placeholder="UR-Drive Jordan" /></label>
          <label className="block"><span className="block text-xs font-medium text-slate-500 mb-1">Sender address <span className="text-slate-400">(normally the same email)</span></span>
            <input className={inputCls} value={form.fromAddress} onChange={e => setForm(f => ({ ...f, fromAddress: e.target.value }))} placeholder="bookings@yourcompany.com" /></label>
          <label className="block md:col-span-2"><span className="block text-xs font-medium text-slate-500 mb-1">Replies go to <span className="text-slate-400">(optional — leave empty for send-only)</span></span>
            <input className={inputCls} value={form.replyTo} onChange={e => setForm(f => ({ ...f, replyTo: e.target.value }))} placeholder="Leave empty: emails say replies are not received and show your phone number" />
            <span className="block text-xs text-slate-400 mt-1">Only fill this in if customers' replies should reach someone. The system itself never reads replies.</span></label>
        </div>
        <p className="text-xs text-slate-400">The password is stored encrypted on the server and is never shown again or sent back to the browser.</p>
        <div className="flex justify-end">
          <button onClick={save} disabled={!!busy} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 disabled:opacity-50">
            {busy === 'save' && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}Save settings
          </button>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Send a test email</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input className={`${inputCls} flex-1`} value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="you@yourcompany.com" />
          <button onClick={test} disabled={!!busy || !loaded?.configured} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-40">
            {busy === 'test' && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}Send test
          </button>
        </div>
        {!loaded?.configured && <p className="text-xs text-slate-400 mt-2">Save working settings first.</p>}
      </section>

      {msg && <div className={`rounded-2xl border p-4 text-sm ${msg.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{msg.text}</div>}
    </div>
  );
};

export default EmailSettingsView;
