import React, { useState, useEffect } from 'react';
import { User, UserPermission, UserStatus } from '../types';
import { ChevronDownIcon, ChevronUpIcon, PlusIcon, TrashIcon, SaveIcon, EditIcon, CancelIcon } from './icons';
import { registerUser } from '../firebase/api';

interface UserManagementProps {
  users: User[];
  onUpdateUsers: (users: User[]) => void;
  currentUser: User | null;
}

const PERMISSION_GROUPS = [
  { title: 'Core Operations', permissions: ['VIEW_HOME_DASHBOARD', 'VIEW_RESERVATIONS', 'VIEW_TODAYS_RESERVATIONS', 'VIEW_INTERNAL_MESSAGES', 'VIEW_FLEET_AVAILABILITY', 'VIEW_MY_PROFILE'] },
  { title: 'Reservation Actions', permissions: ['ACTION_RESERVATIONS_ADD', 'ACTION_RESERVATIONS_EDIT', 'ACTION_RESERVATIONS_DELETE', 'ACTION_RESERVATIONS_EXTEND'] },
  { title: 'Reports', permissions: ['VIEW_REPORTS_YEARLY_SUMMARY', 'VIEW_REPORTS_SOURCE_PERFORMANCE', 'VIEW_REPORTS_INVOICE_GENERATION'] },
  { title: 'Financials', permissions: ['VIEW_FINANCIALS_ACCOUNTING', 'VIEW_FINANCIALS_PAYMENT_APPROVALS', 'VIEW_FINANCIALS_DEFERRED_PAYMENTS', 'VIEW_FINANCIALS_LATE_RETURNS'] },
  { title: 'Incidents', permissions: ['VIEW_TRAFFIC_TICKETS', 'VIEW_VEHICLE_DAMAGES'] },
  { title: 'Administration', permissions: ['VIEW_ADMIN_PANEL', 'ACTION_ADMIN_MANAGE_USERS', 'ACTION_ADMIN_MANAGE_FLEET', 'ACTION_ADMIN_MANAGE_SOURCES', 'ACTION_ADMIN_MANAGE_EXTRAS', 'ACTION_ADMIN_MANAGE_LOCATIONS', 'ACTION_ADMIN_MANAGE_COMPANY_DETAILS', 'ACTION_ADMIN_MANAGE_YEARS', 'VIEW_SYSTEM_ACTIVITY_LOG'] },
  { title: 'OTA Integration', permissions: ['VIEW_AGGREGATOR_SETUP'] }
];

const UserManagement: React.FC<UserManagementProps> = ({ users, onUpdateUsers, currentUser }) => {
  const [localUsers, setLocalUsers] = useState<User[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<User>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState<Partial<User>>({
    email: '',
    fullName: '',
    username: '',
    password: '',
    permissions: [],
    status: UserStatus.ACTIVE,
    webAppAccess: true,
  });
  const [expandedPermissions, setExpandedPermissions] = useState<Record<string, boolean>>({});
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    setLocalUsers(JSON.parse(JSON.stringify(users)));
  }, [users]);

  const handleEdit = (user: User) => {
    setEditingId(user.id);
    setEditForm({ ...user });
    setExpandedPermissions({});
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSaveEdit = () => {
    if (editingId) {
      const updatedUsers = localUsers.map(u => u.id === editingId ? { ...u, ...editForm } : u);
      setLocalUsers(updatedUsers);
      setEditingId(null);
      setEditForm({});
      onUpdateUsers(updatedUsers);
    }
  };

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.fullName || !newUser.username || !newUser.password) {
      alert('Please fill in all required fields (Email, Full Name, Username, Password).');
      return;
    }

    setIsRegistering(true);
    try {
      // Register the user in the backend authentication system
      await registerUser({
        email: newUser.email!,
        password: newUser.password!,
        username: newUser.username!,
        fullName: newUser.fullName!,
        permissions: newUser.permissions,
      });

      // After successful registration, add to local users list
      const newId = `user-${Date.now()}`;
      const userToAdd: User = {
        id: newId,
        email: newUser.email!,
        fullName: newUser.fullName!,
        username: newUser.username!,
        password: newUser.password!,
        permissions: newUser.permissions || [],
        status: newUser.status || UserStatus.ACTIVE,
        webAppAccess: newUser.webAppAccess ?? true,
        nationalId: newUser.nationalId || '',
        hireDate: newUser.hireDate || '',
        position: newUser.position || '',
        baseSalaryJOD: newUser.baseSalaryJOD || 0,
      };
      const updatedUsers = [...localUsers, userToAdd];
      setLocalUsers(updatedUsers);
      setShowAddForm(false);
      setNewUser({ email: '', fullName: '', username: '', password: '', permissions: [], status: UserStatus.ACTIVE, webAppAccess: true });
      onUpdateUsers(updatedUsers);
      alert('User created successfully! They can now log in.');
    } catch (err: any) {
      console.error('Registration error:', err);
      alert(err.response?.data?.message || 'Failed to create user. Please check that the email/username is unique.');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDelete = (id: string) => {
    const updatedUsers = localUsers.filter(u => u.id !== id);
    setLocalUsers(updatedUsers);
    onUpdateUsers(updatedUsers);
  };

  const handleToggleExpand = (userId: string) => {
    setExpandedPermissions(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  const renderPermissionsSection = (userId: string, userPermissions: UserPermission[], isEditing: boolean) => {
    const isExpanded = expandedPermissions[userId];
    return (
      <div className="mt-2 border-t pt-2">
        <button
          onClick={() => handleToggleExpand(userId)}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          {isExpanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
          {isExpanded ? 'Hide permissions' : 'Show permissions'}
        </button>
        {isExpanded && (
          <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
            {PERMISSION_GROUPS.map(group => {
              const allChecked = group.permissions.every(p => userPermissions.includes(p as UserPermission));
              const someChecked = group.permissions.some(p => userPermissions.includes(p as UserPermission));
              return (
                <div key={group.title} className="border rounded p-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                      onChange={(e) => {
                        if (!isEditing) return;
                        const groupPerms = group.permissions as UserPermission[];
                        if (userId === 'new') {
                          const newPerms = e.target.checked
                            ? Array.from(new Set([...userPermissions, ...groupPerms]))
                            : userPermissions.filter(p => !groupPerms.includes(p));
                          setNewUser(prev => ({ ...prev, permissions: newPerms }));
                        } else {
                          const newPerms = e.target.checked
                            ? Array.from(new Set([...userPermissions, ...groupPerms]))
                            : userPermissions.filter(p => !groupPerms.includes(p));
                          setEditForm(prev => ({ ...prev, permissions: newPerms }));
                        }
                      }}
                      disabled={!isEditing}
                      className="rounded"
                    />
                    <span>{group.title}</span>
                  </label>
                  <div className="ml-6 mt-1 grid grid-cols-2 gap-1">
                    {group.permissions.map(perm => (
                      <label key={perm} className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={userPermissions.includes(perm as UserPermission)}
                          onChange={(e) => {
                            if (!isEditing) return;
                            if (userId === 'new') {
                              const currentPerms = newUser.permissions || [];
                              const newPerms = e.target.checked
                                ? [...currentPerms, perm as UserPermission]
                                : currentPerms.filter(p => p !== perm);
                              setNewUser(prev => ({ ...prev, permissions: newPerms }));
                            } else {
                              const currentPerms = editForm.permissions || [];
                              const newPerms = e.target.checked
                                ? [...currentPerms, perm as UserPermission]
                                : currentPerms.filter(p => p !== perm);
                              setEditForm(prev => ({ ...prev, permissions: newPerms }));
                            }
                          }}
                          disabled={!isEditing}
                          className="rounded"
                        />
                        <span className="truncate">{perm.replace(/_/g, ' ')}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const getStatusBadgeClass = (status: UserStatus) => {
    switch (status) {
      case UserStatus.ACTIVE: return 'bg-green-100 text-green-800';
      case UserStatus.INACTIVE: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800">User & Staff Management</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
        >
          <PlusIcon className="w-4 h-4" /> Add User
        </button>
      </div>

      {showAddForm && (
        <div className="mb-6 border rounded-lg p-4 bg-gray-50">
          <h3 className="text-md font-semibold mb-3">Add New User</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input type="email" placeholder="Email *" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} className="border rounded px-3 py-2" />
            <input type="text" placeholder="Full Name *" value={newUser.fullName} onChange={e => setNewUser({ ...newUser, fullName: e.target.value })} className="border rounded px-3 py-2" />
            <input type="text" placeholder="Username *" value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} className="border rounded px-3 py-2" />
            <input type="password" placeholder="Password *" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} className="border rounded px-3 py-2" />
            <div className="col-span-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={newUser.webAppAccess} onChange={e => setNewUser({ ...newUser, webAppAccess: e.target.checked })} />
                <span>Web App Access</span>
              </label>
            </div>
          </div>
          {renderPermissionsSection('new', newUser.permissions || [], true)}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 border rounded text-gray-700">Cancel</button>
            <button onClick={handleAddUser} disabled={isRegistering} className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50">
              {isRegistering ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {localUsers.map(user => {
          const isEditing = editingId === user.id;
          return (
            <div key={user.id} className="border rounded-lg p-4 bg-white shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  {isEditing ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                      <input type="email" value={editForm.email || ''} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="border rounded px-2 py-1" />
                      <input type="text" value={editForm.fullName || ''} onChange={e => setEditForm({ ...editForm, fullName: e.target.value })} className="border rounded px-2 py-1" />
                      <input type="text" value={editForm.username || ''} onChange={e => setEditForm({ ...editForm, username: e.target.value })} className="border rounded px-2 py-1" />
                      <input type="password" placeholder="New password (leave blank to keep)" value={editForm.password || ''} onChange={e => setEditForm({ ...editForm, password: e.target.value })} className="border rounded px-2 py-1" />
                      <div className="col-span-2 flex gap-4">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={editForm.webAppAccess ?? user.webAppAccess} onChange={e => setEditForm({ ...editForm, webAppAccess: e.target.checked })} />
                          <span>Web App Access</span>
                        </label>
                        <select value={editForm.status || user.status} onChange={e => setEditForm({ ...editForm, status: e.target.value as UserStatus })} className="border rounded px-2 py-1">
                          <option value={UserStatus.ACTIVE}>Active</option>
                          <option value={UserStatus.INACTIVE}>Inactive</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-lg font-medium">{user.fullName}</span>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusBadgeClass(user.status)}`}>{user.status}</span>
                        {!user.webAppAccess && <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded-full">No Web Access</span>}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        <div>Email: {user.email}</div>
                        <div>Username: {user.username}</div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 ml-4">
                  {isEditing ? (
                    <>
                      <button onClick={handleSaveEdit} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Save"><SaveIcon className="w-5 h-5" /></button>
                      <button onClick={handleCancelEdit} className="p-1 text-gray-600 hover:bg-gray-50 rounded" title="Cancel"><CancelIcon className="w-5 h-5" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleEdit(user)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Edit"><EditIcon className="w-5 h-5" /></button>
                      {user.id !== currentUser?.id && (
                        <button onClick={() => handleDelete(user.id)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Delete"><TrashIcon className="w-5 h-5" /></button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {renderPermissionsSection(user.id, user.permissions, isEditing)}
            </div>
          );
        })}
        {localUsers.length === 0 && <p className="text-center text-gray-500 py-4">No users found.</p>}
      </div>
    </div>
  );
};

export default UserManagement;
