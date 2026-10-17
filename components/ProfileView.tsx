import React, { useState } from 'react';
import { User, UserPermission } from '../types';
import { MailIcon, KeyIcon } from './icons';
import { API_URL } from '../firebase/api';
import { Page, PageHeader, Panel, Badge, Button, Field, DetailList, inputCls } from './ui/Crm';

interface ProfileViewProps {
  currentUser: User;
  firebaseUser?: { uid: string; email: string };
  onUserUpdate: (user: User) => void;
}

const ProfileView: React.FC<ProfileViewProps> = ({ currentUser, firebaseUser, onUserUpdate }) => {
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.new !== passwordForm.confirm) {
      setPasswordError('New passwords do not match');
      return;
    }

    setIsChangingPassword(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: passwordForm.current,
          newPassword: passwordForm.new,
        }),
      });
      const data = await response.text();
      if (!response.ok) throw new Error(data);
      setPasswordSuccess('Password changed successfully!');
      setPasswordForm({ current: '', new: '', confirm: '' });
      // Optionally update local user with new password (optional)
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const isAdmin = currentUser.permissions?.includes(UserPermission.VIEW_ADMIN_PANEL);
  const initials = (currentUser.username || currentUser.email || '?').slice(0, 2).toUpperCase();

  return (
    <Page className="max-w-3xl">
      <PageHeader section="Account" title="My Profile" subtitle="Your sign-in details and password." />

      <Panel title="Account details">
        <div className="px-4 py-4 flex items-center gap-3 border-b border-slate-100">
          <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-sm font-semibold shrink-0">{initials}</div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{currentUser.username || currentUser.email}</p>
            <p className="text-[13px] text-slate-500 truncate">{currentUser.email}</p>
          </div>
          <div className="ml-auto"><Badge tone={isAdmin ? 'info' : 'muted'}>{isAdmin ? 'Admin' : 'Staff'}</Badge></div>
        </div>
        <div className="px-4">
          <DetailList rows={[
            { label: <span className="inline-flex items-center gap-2"><MailIcon className="w-4 h-4 text-slate-400" />Email</span>, value: currentUser.email },
            { label: <span className="inline-flex items-center gap-2"><KeyIcon className="w-4 h-4 text-slate-400" />Role</span>, value: <span className="capitalize">{isAdmin ? 'Admin' : 'Staff'}</span> },
          ]} />
        </div>
      </Panel>

      <form onSubmit={handlePasswordChange}>
        <Panel
          title="Change password"
          subtitle="Enter your current password, then choose a new one."
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                {passwordError && <p className="text-[13px] text-rose-600">{passwordError}</p>}
                {passwordSuccess && <p className="text-[13px] text-emerald-700">{passwordSuccess}</p>}
              </div>
              <Button type="submit" variant="primary" disabled={isChangingPassword}>
                {isChangingPassword ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          }
        >
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Current Password" required>
              <input type="password" value={passwordForm.current} onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })} required className={inputCls} />
            </Field>
            <Field label="New Password" required>
              <input type="password" value={passwordForm.new} onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })} required className={inputCls} />
            </Field>
            <Field label="Confirm New Password" required>
              <input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} required className={inputCls} />
            </Field>
          </div>
        </Panel>
      </form>
    </Page>
  );
};

export default ProfileView;
