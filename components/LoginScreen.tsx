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

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 z-0 animate-gradient-move bg-gradient-to-br from-slate-900 via-primary-dark to-secondary bg-[length:200%_200%]"></div>
      <div className="relative z-10 w-full max-w-lg bg-slate-100/50 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8 sm:p-10">
        <div className="flex flex-col items-center mb-8">
          <img src={NCT_LOGIN_LOGO_B64} alt="NCT Rental Logo" className="w-24 h-24 mb-4" />
          <h2 className="text-3xl font-bold font-serif-professional text-slate-900">NCT Rental</h2>
          <p className="mt-2 text-slate-700">Drive your journey forward</p>
        </div>
      
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="username-input" className="block text-sm font-medium text-slate-800 mb-1">
              Username or Email
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 pointer-events-none">
                <UserCircleIcon className="h-5 w-5" />
              </span>
              <input
                id="username-input" name="username" type="text" autoComplete="username" required
                value={username} onChange={(e) => setUsername(e.target.value)}
                className="appearance-none block w-full pl-10 px-3 py-3 bg-white/70 border border-slate-300 rounded-lg shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                placeholder="Username or email@address.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password-input" className="block text-sm font-medium text-slate-800 mb-1">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 pointer-events-none">
                <LockClosedIcon className="h-5 w-5" />
              </span>
              <input
                id="password-input" name="password" type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="appearance-none block w-full pl-10 px-3 py-3 bg-white/70 border border-slate-300 rounded-lg shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-center font-semibold text-red-600 bg-red-100 p-2 rounded-md" role="alert">
              {error}
            </p>
          )}

          <div>
            <button
              type="submit" disabled={isLoading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-dark disabled:bg-slate-400 transition-colors"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;
