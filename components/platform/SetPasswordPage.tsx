import React, { useEffect, useState } from 'react';
import { checkPasswordLink, problem, submitPasswordLink } from '../../services/platformApi';
import { Btn, ErrorNote, Field, Icon, input } from './ui';

/** /set-password?token=…: the page an invitation or password link opens. */
const SetPasswordPage: React.FC = () => {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [who, setWho] = useState<{ email: string; name: string; company: string } | null>(null);
  const [state, setState] = useState<'checking' | 'form' | 'invalid' | 'done'>('checking');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Choose your password';
    if (!token) { setState('invalid'); return; }
    checkPasswordLink(token).then(w => { setWho(w); setState('form'); }).catch(() => setState('invalid'));
  }, [token]);

  const rules = [
    { ok: pw.length >= 8, text: 'At least 8 characters' },
    { ok: /[A-Za-z]/.test(pw) && /\d/.test(pw), text: 'Letters and numbers' },
    { ok: pw.length > 0 && pw === again, text: 'Both entries match' },
  ];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rules.every(r => r.ok)) { setError('Check the password rules below.'); return; }
    setBusy(true); setError('');
    try { await submitPasswordLink(token, pw); setState('done'); }
    catch (err) { setError(problem(err, 'The password could not be set.')); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center p-4 font-sans-ui">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-[0_24px_60px_-20px_rgba(15,23,42,0.25)] border border-slate-200/70 p-8" data-testid="set-password">
        {state === 'checking' && <p className="text-center text-[13px] text-slate-500 py-10">Checking your link…</p>}
        {state === 'invalid' && (
          <div className="text-center py-4">
            <span className="inline-flex w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 items-center justify-center">{Icon.alert('w-6 h-6')}</span>
            <h1 className="mt-4 text-[19px] font-semibold text-slate-900">This link no longer works</h1>
            <p className="mt-2 text-[13.5px] text-slate-600">It has expired or was already used. Ask your administrator for a new link.</p>
            <a href="/" className="mt-6 inline-flex items-center h-10 px-4 rounded-lg ring-1 ring-inset ring-slate-300 text-[13px] font-medium text-slate-700 hover:bg-slate-50">Go to sign in</a>
          </div>
        )}
        {state === 'form' && who && (
          <form onSubmit={submit} noValidate>
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-teal-700">{who.company}</p>
            <h1 className="mt-2 text-[22px] font-semibold text-slate-900">Choose your password</h1>
            <p className="mt-1.5 text-[13.5px] text-slate-600">Hello {who.name.split(' ')[0] || 'there'}. You will sign in as <b className="text-slate-900">{who.email}</b>.</p>
            <div className="mt-6 space-y-4">
              <Field label="New password" htmlFor="sp-pw"><input id="sp-pw" type="password" autoComplete="new-password" autoFocus className={input} value={pw} onChange={e => setPw(e.target.value)} /></Field>
              <Field label="Repeat the password" htmlFor="sp-again"><input id="sp-again" type="password" autoComplete="new-password" className={input} value={again} onChange={e => setAgain(e.target.value)} /></Field>
              <ul className="space-y-1.5">{rules.map(r => (
                <li key={r.text} className={`flex items-center gap-2 text-[12.5px] ${r.ok ? 'text-emerald-700' : 'text-slate-500'}`}>
                  <span className={`w-4 h-4 rounded-full inline-flex items-center justify-center ${r.ok ? 'bg-emerald-500 text-white' : 'ring-1 ring-slate-300'}`}>{r.ok && Icon.check('w-2.5 h-2.5')}</span>{r.text}
                </li>))}</ul>
              <ErrorNote text={error} />
              <Btn type="submit" kind="primary" className="w-full h-11" disabled={busy}>{busy ? 'Saving…' : 'Set password'}</Btn>
            </div>
          </form>
        )}
        {state === 'done' && (
          <div className="text-center py-4">
            <span className="inline-flex w-12 h-12 rounded-full bg-emerald-500 text-white items-center justify-center shadow-lg shadow-emerald-500/30">{Icon.check('w-6 h-6')}</span>
            <h1 className="mt-4 text-[20px] font-semibold text-slate-900">Your password is set</h1>
            <p className="mt-2 text-[13.5px] text-slate-600">Sign in with {who?.email} and your new password.</p>
            <a href="/" className="mt-6 inline-flex items-center justify-center h-11 px-6 rounded-lg bg-teal-700 text-white text-[13.5px] font-medium hover:bg-teal-800">Sign in</a>
          </div>
        )}
      </div>
    </div>
  );
};

export default SetPasswordPage;
