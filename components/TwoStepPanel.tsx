import React, { useEffect, useState } from 'react';
import { confirmTwoStep, getTwoStepStatus, resetTwoStepFor, startTwoStepSetup, turnOffTwoStep, TwoStepStatus } from '../firebase/api';
import { Panel, Badge, Button, Field, inputCls } from './ui/Crm';

const errorText = (err: any, fallback: string) =>
  (typeof err?.response?.data?.error === 'string' && err.response.data.error) || (!err?.response ? 'Cannot reach the server.' : fallback);

/**
 * Profile → Two-step sign-in. Optional for each person: after the password, a code from an authenticator app.
 * Administrators can also turn it off for someone who lost their phone.
 */
const TwoStepPanel: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const [status, setStatus] = useState<TwoStepStatus | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [turningOff, setTurningOff] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetNote, setResetNote] = useState('');

  const load = () => getTwoStepStatus().then(setStatus).catch(() => setStatus(null));
  useEffect(() => { load(); }, []);

  const run = async (work: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError('');
    try { await work(); } catch (err) { setError(errorText(err, fallback)); } finally { setBusy(false); }
  };

  const begin = () => run(async () => {
    const s = await startTwoStepSetup();
    setSetup({ secret: s.secret, qrSvg: s.qrSvg });
    setCode('');
  }, 'Could not start. Please try again.');

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      setBackupCodes(await confirmTwoStep(code.trim()));
      setSetup(null);
      setCode('');
      await load();
    }, 'That code is not right. Use the newest code in the app.');
  };

  const off = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await turnOffTwoStep(password, code.trim());
      setTurningOff(false);
      setPassword('');
      setCode('');
      setBackupCodes(null);
      await load();
    }, 'The password or the code is not right.');
  };

  const reset = (e: React.FormEvent) => {
    e.preventDefault();
    setResetNote('');
    run(async () => {
      await resetTwoStepFor(resetEmail.trim());
      setResetNote(`Two-step sign-in is off for ${resetEmail.trim()}. They sign in with their password and can set it up again.`);
      setResetEmail('');
    }, 'Could not turn it off for that account.');
  };

  const copyCodes = () => { if (backupCodes) navigator.clipboard?.writeText(backupCodes.join('\n')).catch(() => undefined); };

  return (
    <Panel
      title="Two-step sign-in"
      subtitle="After your password, a 6-digit code from an app on your phone. Protects your account if your password becomes known."
      actions={status ? <Badge tone={status.on ? 'success' : 'muted'}>{status.on ? 'On' : 'Off'}</Badge> : undefined}
    >
      <div className="p-4 space-y-4 text-[13px] text-slate-700">
        {error && <p className="text-rose-600" role="alert">{error}</p>}

        {backupCodes && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="font-semibold text-amber-900">Your backup codes — shown only now</p>
            <p className="mt-1 text-amber-900">Keep them somewhere safe (printed, or in a password manager). Each one signs you in once if you do not have your phone.</p>
            <ul className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-[13px]" data-testid="backup-codes">
              {backupCodes.map(c => <li key={c} className="rounded bg-white px-2 py-1 text-center ring-1 ring-amber-200">{c}</li>)}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={copyCodes}>Copy</Button>
              <Button size="sm" onClick={() => window.print()}>Print</Button>
              <Button size="sm" variant="primary" onClick={() => setBackupCodes(null)}>I have saved them</Button>
            </div>
          </div>
        )}

        {status && !status.on && !setup && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>Not turned on. You sign in with your password only.</p>
            <Button variant="primary" onClick={begin} disabled={busy}>Turn on</Button>
          </div>
        )}

        {setup && (
          <form onSubmit={confirm} className="grid gap-4 sm:grid-cols-[180px_1fr] items-start">
            <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qrSvg)}`} alt="QR code for the authenticator app"
              className="w-[180px] h-[180px] rounded-lg ring-1 ring-slate-200" />
            <div className="space-y-3">
              <ol className="list-decimal pl-5 space-y-1">
                <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or similar).</li>
                <li>Add an account and scan this QR code.</li>
                <li>Type the 6-digit code the app shows.</li>
              </ol>
              <p className="text-slate-500">Cannot scan? Enter this key in the app instead: <span className="font-mono text-slate-800 break-all select-all" data-testid="two-step-key">{(setup.secret.match(/.{1,4}/g) || []).join(' ')}</span></p>
              <Field label="Code from the app" required>
                <input className={inputCls} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Code from the app" />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" variant="primary" disabled={busy || code.length !== 6}>Confirm and turn on</Button>
                <Button onClick={() => { setSetup(null); setError(''); }} disabled={busy}>Cancel</Button>
              </div>
            </div>
          </form>
        )}

        {status?.on && !turningOff && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>On. Backup codes left: <b>{status.backupCodesLeft}</b>{status.backupCodesLeft <= 2 && ' — turn it off and on again for new codes.'}</p>
            <Button variant="danger" onClick={() => { setTurningOff(true); setError(''); }}>Turn off</Button>
          </div>
        )}

        {status?.on && turningOff && (
          <form onSubmit={off} className="grid gap-3 sm:grid-cols-2">
            <Field label="Your password" required>
              <input type="password" className={inputCls} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            <Field label="Code from the app (or a backup code)" required>
              <input className={inputCls} value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" />
            </Field>
            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit" variant="danger" disabled={busy || !password || !code}>Turn off two-step sign-in</Button>
              <Button onClick={() => { setTurningOff(false); setError(''); }} disabled={busy}>Cancel</Button>
            </div>
          </form>
        )}

        {isAdmin && (
          <form onSubmit={reset} className="border-t border-slate-100 pt-4 grid gap-2">
            <p className="font-medium text-slate-900">Someone lost their phone and backup codes?</p>
            <div className="flex flex-wrap gap-2">
              <input className={`${inputCls} flex-1 min-w-[220px]`} type="email" placeholder="Their email" value={resetEmail}
                onChange={e => setResetEmail(e.target.value)} aria-label="Email of the person" />
              <Button type="submit" disabled={busy || !resetEmail.trim()}>Turn off for them</Button>
            </div>
            {resetNote && <p className="text-emerald-700">{resetNote}</p>}
          </form>
        )}
      </div>
    </Panel>
  );
};

export default TwoStepPanel;
