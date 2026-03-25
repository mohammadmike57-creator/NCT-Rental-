import React, { useState } from 'react';
import { User, UserPermission } from '../types';
import { MailIcon, KeyIcon } from './icons';

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
      const response = await fetch('https://www.nctrental.com/auth/change-password', {
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

  return (
    <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">My Profile</h2>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <MailIcon className="w-5 h-5 text-gray-500" />
          <div>
            <div className="text-sm text-gray-500">Email</div>
            <div className="font-medium">{currentUser.email}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <KeyIcon className="w-5 h-5 text-gray-500" />
          <div>
            <div className="text-sm text-gray-500">Role</div>
            <div className="font-medium capitalize">
              {currentUser.permissions?.includes(UserPermission.VIEW_ADMIN_PANEL) ? 'Admin' : 'Staff'}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t">
          <h3 className="text-lg font-semibold mb-4">Change Password</h3>
          <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700">Current Password</label>
              <input
                type="password"
                value={passwordForm.current}
                onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                required
                className="mt-1 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">New Password</label>
              <input
                type="password"
                value={passwordForm.new}
                onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                required
                className="mt-1 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
              <input
                type="password"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                required
                className="mt-1 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
            {passwordSuccess && <p className="text-sm text-green-600">{passwordSuccess}</p>}
            <button
              type="submit"
              disabled={isChangingPassword}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isChangingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileView;
