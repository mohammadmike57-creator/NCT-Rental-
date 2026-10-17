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
  const inputCls = 'block w-full h-11 pl-10 pr-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500';

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-white">
      {/* Brand side */}
      <div className="relative hidden lg:flex flex-col justify-between bg-slate-900 text-white p-12 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div className="relative flex items-center gap-3">
          <img src={NCT_LOGIN_LOGO_B64} alt="" className="w-10 h-10 rounded-lg bg-white/5" />
          <div className="leading-tight">
            <p className="text-lg font-semibold tracking-tight">NCT Rental</p>
            <p className="text-xs text-slate-400">Rental management system</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight leading-tight">Reservations, agreements and fleet in one place.</h1>
          <p className="mt-3 text-slate-400 text-sm leading-relaxed">Check cars out and in with signed digital agreements, track damages and traffic fines, and keep every booking channel in sync.</p>
          <ul className="mt-8 grid grid-cols-2 gap-3 text-sm">
            {['Digital rental agreements', 'Fleet availability', 'Damage and fine claims', 'Channel bookings'].map(f => (
              <li key={f} className="flex items-center gap-2 text-slate-300">
                <svg className="w-4 h-4 text-indigo-400 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">&copy; {new Date().getFullYear()} NCT Rental</p>
      </div>

      {/* Sign-in side */}
      <div className="flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <img src={NCT_LOGIN_LOGO_B64} alt="" className="w-10 h-10" />
            <div className="leading-tight">
              <p className="text-lg font-semibold text-slate-900 tracking-tight">NCT Rental</p>
              <p className="text-xs text-slate-500">Rental management system</p>
            </div>
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your staff username or email address.</p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="username-input" className="block text-[13px] font-medium text-slate-700 mb-1.5">Username or email</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none"><UserCircleIcon className="h-5 w-5" /></span>
                <input id="username-input" name="username" type="text" autoComplete="username" required autoFocus
                  value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} placeholder="name@company.com" />
              </div>
            </div>

            <div>
              <label htmlFor="password-input" className="block text-[13px] font-medium text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none"><LockClosedIcon className="h-5 w-5" /></span>
                <input id="password-input" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} pr-16`} placeholder="Your password" />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-slate-500 hover:text-slate-800">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700" role="alert">
                <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={isLoading}
              className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 transition-colors">
              {isLoading && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-xs text-slate-500">Forgot your password? Ask an administrator to reset it from User &amp; Staff Management.</p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
