import React, { useState } from 'react';
import { User } from '../types';
import { signInUser } from '../firebase/api';
import { NCT_LOGIN_LOGO_B64 } from '../constants';
import { UserCircleIcon, LockClosedIcon } from './icons';

interface LoginScreenProps {
  users: User[];
}

const LoginScreen: React.FC<LoginScreenProps> = ({ users }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const enteredInput = username.trim();
    if (!enteredInput || !password) {
      setError('Enter your username or email and your password.');
      setIsLoading(false);
      return;
    }

    try {
      // The server accepts either email or username and checks the account is active.
      await signInUser(enteredInput, password);
      window.location.reload();
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) setError(typeof err.response.data === 'string' ? err.response.data : 'This account has been disabled.');
      else if (!err?.response) setError('Cannot reach the server. Check your connection and try again.');
      else setError('Invalid username/email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const year = new Date().getFullYear();
  const inputCls = 'block w-full h-12 pl-11 pr-3 bg-white border border-slate-300 rounded-xl text-[15px] text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:outline-none focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-500';
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(!!e.getModifierState && e.getModifierState('CapsLock'));

  const Logo = ({ dark }: { dark?: boolean }) => (
    <div className="flex items-center gap-3">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${dark ? 'bg-white/10 ring-1 ring-white/15' : 'bg-slate-900'}`}>
        <img src={NCT_LOGIN_LOGO_B64} alt="" className="w-8 h-8 rounded-md" />
      </div>
      <div className="leading-tight">
        <p className={`text-[17px] font-semibold tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`}>NCT Rental</p>
        <p className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Rental management system</p>
      </div>
    </div>
  );

  const features = [
    { t: 'Digital rental agreements', d: 'Inspection, signatures and PDF in one flow', p: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
    { t: 'Fleet planning board', d: 'Every car, every day, at a glance', p: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5' },
    { t: 'Damage, fines and claims', d: 'Photo evidence and invoices to the customer', p: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z' },
  ];

  return (
    <div className="min-h-[100dvh] bg-slate-50 lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel (desktop) */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[#0b1220] text-white px-14 py-12">
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(60rem 30rem at 0% 0%, rgba(99,102,241,.28), transparent 60%), radial-gradient(40rem 26rem at 100% 100%, rgba(14,165,233,.18), transparent 60%)' }} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
        <div className="relative"><Logo dark /></div>

        <div className="relative max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Staff workspace</p>
          <h1 className="mt-3 text-[34px] leading-[1.15] font-semibold tracking-tight">Run every rental, from booking to return.</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-400">Reservations, counter agreements, fleet planning and claims in one secure system for your team.</p>

          {/* Product preview */}
          <div className="mt-8 rounded-2xl bg-white/[0.06] ring-1 ring-white/10 backdrop-blur p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-white">Today</p>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Live</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[['Pickups', '12'], ['Returns', '9'], ['On rent', '34']].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white/[0.05] ring-1 ring-white/10 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">{k}</p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-end gap-1.5 h-16">
              {[38, 52, 44, 70, 58, 82, 64, 90, 72, 60, 76, 88].map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-indigo-500/70 to-sky-400/80" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>

          <ul className="mt-8 space-y-4">
            {features.map(f => (
              <li key={f.t} className="flex items-start gap-3">
                <span className="mt-0.5 w-9 h-9 rounded-lg bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center shrink-0">
                  <svg className="w-[18px] h-[18px] text-indigo-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={f.p} /></svg>
                </span>
                <span><span className="block text-[14px] font-medium text-white">{f.t}</span><span className="block text-[13px] text-slate-400">{f.d}</span></span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between text-xs text-slate-500">
          <span>&copy; {year} NCT Rental</span>
          <span className="inline-flex items-center gap-1.5"><LockClosedIcon className="w-3.5 h-3.5" />Encrypted connection</span>
        </div>
      </aside>

      {/* Sign-in */}
      <main className="relative flex flex-col min-h-[100dvh] lg:min-h-0">
        {/* Phone header */}
        <div className="lg:hidden relative overflow-hidden bg-[#0b1220] px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-20">
          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(30rem 16rem at 0% 0%, rgba(99,102,241,.35), transparent 60%), radial-gradient(24rem 14rem at 100% 100%, rgba(14,165,233,.22), transparent 60%)' }} />
          <div className="relative"><Logo dark /></div>
          <p className="relative mt-6 text-[22px] font-semibold text-white tracking-tight leading-snug">Welcome back</p>
          <p className="relative mt-1 text-sm text-slate-400">Sign in to your staff workspace.</p>
        </div>

        <div className="relative z-10 flex-1 flex items-start lg:items-center justify-center px-4 sm:px-8 -mt-12 lg:mt-0 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-xl shadow-slate-900/5 ring-1 ring-slate-200 p-6 sm:p-8 lg:shadow-none lg:ring-0 lg:bg-transparent lg:p-0">
            <div className="hidden lg:block mb-8">
              <h2 className="text-[28px] font-semibold text-slate-900 tracking-tight">Welcome back</h2>
              <p className="mt-1.5 text-[15px] text-slate-500">Sign in to your NCT Rental workspace.</p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit} noValidate>
              <div>
                <label htmlFor="username-input" className="block text-[13px] font-medium text-slate-700 mb-1.5">Username or email</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none"><UserCircleIcon className="h-5 w-5" /></span>
                  <input id="username-input" name="username" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required
                    value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} placeholder="name@company.com" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password-input" className="block text-[13px] font-medium text-slate-700">Password</label>
                  {capsLock && <span className="text-[11px] font-semibold text-amber-600">Caps Lock is on</span>}
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none"><LockClosedIcon className="h-5 w-5" /></span>
                  <input id="password-input" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                    value={password} onChange={(e) => setPassword(e.target.value)} onKeyUp={onKey} onKeyDown={onKey}
                    className={`${inputCls} pr-16`} placeholder="Enter your password" />
                  <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-1.5 right-1.5 px-3 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100">
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] text-rose-700" role="alert">
                  <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" disabled={isLoading}
                className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white text-[15px] font-semibold shadow-lg shadow-indigo-600/25 hover:bg-indigo-700 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-indigo-500/25 disabled:opacity-60 transition">
                {isLoading && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                {isLoading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 space-y-2 text-[12px] text-slate-500">
              <p>Forgot your password? Ask an administrator to reset it in User &amp; Staff Management.</p>
              <p className="inline-flex items-center gap-1.5"><LockClosedIcon className="w-3.5 h-3.5 text-slate-400" />Authorised staff only · encrypted connection</p>
            </div>
          </div>
        </div>

        <p className="lg:hidden text-center text-[11px] text-slate-400 pb-[max(1rem,env(safe-area-inset-bottom))]">&copy; {year} NCT Rental</p>
      </main>
    </div>
  );
};

export default LoginScreen;
