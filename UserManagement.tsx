

import React, { useState, useMemo } from 'react';
import { User, UserPermission, UserStatus } from '../types';
import { PlusIcon, TrashIcon, EditIcon, SaveIcon, CancelIcon, DesktopComputerIcon, DevicePhoneMobileIcon, KeyIcon } from './icons';
import ConfirmationDialog from './ConfirmationDialog';
import SecurityKeyModal from './SecurityKeyModal';
import { registerUser, sendPasswordReset } from '../firebase/api';

interface UserManagementProps {
  users: User[];
  onUpdateUsers: React.Dispatch<React.SetStateAction<User[]>>;
  currentUser: User | null;
}

const emptyUser: Omit<User, 'id' | 'role'> = {
  fullName: '',
  username: '',
  email: '',
  password: '',
  permissions: [],
  nationalId: '',
  sscNumber: '',
  hireDate: new Date().toISOString().split('T')[0],
  position: '',
  baseSalaryJOD: 0,
  status: UserStatus.ACTIVE,
  isOnline: false,
  webAppAccess: true,
};

const permissionGroups: Record<string, { label: string; permissions: UserPermission[] }> = {
    CoreViews: {
        label: 'Core: Views',
        permissions: [UserPermission.VIEW_HOME_DASHBOARD, UserPermission.VIEW_RESERVATIONS, UserPermission.VIEW_TODAYS_RESERVATIONS, UserPermission.VIEW_FLEET_AVAILABILITY, UserPermission.VIEW_INTERNAL_MESSAGES, UserPermission.VIEW_MY_PROFILE]
    },
    ReservationActions: {
        label: 'Core: Reservation Actions',
        permissions: [UserPermission.ACTION_RESERVATIONS_ADD, UserPermission.ACTION_RESERVATIONS_EDIT, UserPermission.ACTION_RESERVATIONS_DELETE, UserPermission.ACTION_RESERVATIONS_EXTEND, UserPermission.ACTION_RESERVATIONS_STATUS_CHANGE, UserPermission.ACTION_VOUCHER_MANAGE]
    },
    ReportViews: {
        label: 'Reports: Views',
        permissions: [UserPermission.VIEW_REPORTS_YEARLY_SUMMARY, UserPermission.VIEW_REPORTS_SOURCE_PERFORMANCE, UserPermission.VIEW_REPORTS_INVOICE_GENERATION]
    },
    FinancialViews: {
        label: 'Financials & Incidents: Views',
        permissions: [
            UserPermission.VIEW_FINANCIALS_ACCOUNTING,
            UserPermission.VIEW_FINANCIALS_PAYMENT_APPROVALS,
            UserPermission.VIEW_FINANCIALS_DEFERRED_PAYMENTS,
            UserPermission.VIEW_FINANCIALS_LATE_RETURNS,
            UserPermission.VIEW_TRAFFIC_TICKETS,
            UserPermission.VIEW_VEHICLE_DAMAGES,
        ]
    },
    FinancialActions: {
        label: 'Financials & Incidents: Actions',
        permissions: [
            UserPermission.ACTION_FINANCIALS_MANAGE_EXPENSES,
            UserPermission.ACTION_FINANCIALS_MANAGE_FRANCHISE_PAYMENTS,
            UserPermission.ACTION_FINANCIALS_MANAGE_PAYMENT_APPROVALS,
            UserPermission.ACTION_FINANCIALS_MANAGE_DEFERRED_PAYMENTS,
            UserPermission.ACTION_FINANCIALS_MANAGE_LATE_RETURNS,
            UserPermission.ACTION_TRAFFIC_TICKETS_MANAGE,
            UserPermission.ACTION_VEHICLE_DAMAGES_MANAGE,
        ]
    },
    Administration: {
        label: 'Administration: Full Control',
        permissions: [
            UserPermission.VIEW_ADMIN_PANEL, 
            UserPermission.ACTION_ADMIN_MANAGE_USERS, 
            UserPermission.ACTION_ADMIN_MANAGE_FLEET, 
            UserPermission.ACTION_ADMIN_MANAGE_SOURCES,
            UserPermission.ACTION_ADMIN_MANAGE_EXTRAS, 
            UserPermission.ACTION_ADMIN_MANAGE_LOCATIONS, 
            UserPermission.ACTION_ADMIN_MANAGE_COMPANY_DETAILS, 
            UserPermission.ACTION_ADMIN_MANAGE_YEARS,
            // FIX: Add missing permission for viewing the system activity log.
            UserPermission.VIEW_SYSTEM_ACTIVITY_LOG,
        ]
    }
};

const formatPermission = (p: string) => p.replace(/_/g, ' ').replace('ACTION ', '').replace('VIEW ', '').toLowerCase();

const PermissionsEditor: React.FC<{
    permissions: UserPermission[];
    onChange: (newPermissions: UserPermission[]) => void;
}> = ({ permissions, onChange }) => {
    
    const handlePermissionChange = (permission: UserPermission, checked: boolean) => {
        // Ensure safe array operation
        const currentPermissions = Array.isArray(permissions) ? permissions : [];
        const newPermissions = checked
            ? [...currentPermissions, permission]
            : currentPermissions.filter(p => p !== permission);
        onChange(newPermissions);
    };

    const handleGroupToggle = (groupPermissions: UserPermission[], select: boolean) => {
        const currentPermissions = Array.isArray(permissions) ? permissions : [];
        const otherPermissions = currentPermissions.filter(p => !groupPermissions.includes(p));
        const newPermissions = select
            ? [...otherPermissions, ...groupPermissions]
            : otherPermissions;
        onChange(Array.from(new Set(newPermissions))); // Ensure uniqueness
    };

    // Guard against undefined permissions prop
    const safePermissions = Array.isArray(permissions) ? permissions : [];

    return (
        <div className="bg-gray-100 p-3 rounded-md border">
            <h4 className="font-semibold text-gray-700 mb-2">User Permissions</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.values(permissionGroups).map(group => (
                    <div key={group.label} className="p-3 border rounded-md bg-white shadow-sm">
                        <div className="flex justify-between items-center mb-2 pb-2 border-b">
                           <p className="font-semibold text-sm text-primary">{group.label}</p>
                           <div>
                               <button type="button" onClick={() => handleGroupToggle(group.permissions, true)} className="text-xs text-blue-600 hover:underline mr-2">All</button>
                               <button type="button" onClick={() => handleGroupToggle(group.permissions, false)} className="text-xs text-gray-500 hover:underline">None</button>
                           </div>
                        </div>
                        <div className="space-y-1.5">
                            {group.permissions.map(p => (
                                <label key={p} className="flex items-center text-sm" title={p}>
                                    <input
                                        type="checkbox"
                                        checked={safePermissions.includes(p)}
                                        onChange={e => handlePermissionChange(p, e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-secondary cursor-pointer"
                                    />
                                    <span className="ml-2 capitalize cursor-pointer">{formatPermission(p)}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};


const UserManagement: React.FC<UserManagementProps> = ({ users, onUpdateUsers, currentUser }) => {
  const [newUser, setNewUser] = useState<Omit<User, 'id' | 'role'>>(emptyUser);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalUser, setOriginalUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'edit' | 'delete' | 'add', payload?: any } | null>(null);
  const [userForPasswordReset, setUserForPasswordReset] = useState<User | null>(null);
  
  const hasManagePermission = useMemo(() => currentUser?.permissions?.includes(UserPermission.ACTION_ADMIN_MANAGE_USERS) ?? false, [currentUser]);

  const handleNewUserChange = (field: keyof Omit<User, 'id' | 'role'>, value: string | number | UserPermission[]) => {
    setNewUser(prev => ({ ...prev, [field]: value }));
  };

  const handleAddUserAttempt = () => {
    if (!newUser.fullName.trim() || !newUser.username.trim() || !newUser.email.trim()) {
      setError('Full Name, Username, and Email are required.');
      return;
    }
    if (!newUser.password || newUser.password.trim().length < 6) {
      setError('A password of at least 6 characters is required for new users.');
      return;
    }
     if (newUser.permissions.length === 0) {
      setError('A new user must have at least one permission.');
      return;
    }
    
    const cleanEmail = newUser.email.trim().toLowerCase();
    const emailExists = users.some(u => u.email.toLowerCase() === cleanEmail);
    if (emailExists) {
        setError('This email is already in use.');
        return;
    }
    setError('');
    setPendingAction({ type: 'add', payload: { ...newUser, email: cleanEmail } });
    setIsKeyModalOpen(true);
  };
  
  const handleEditAttempt = (user: User) => {
    setPendingAction({ type: 'edit', payload: user });
    setIsKeyModalOpen(true);
  };

  const handleDeleteAttempt = (user: User) => {
    setPendingAction({ type: 'delete', payload: user });
    setIsKeyModalOpen(true);
  };
  
  const handleKeySuccess = async () => {
    if (!pendingAction) return;

    try {
        switch (pendingAction.type) {
        case 'add':
            try {
                await registerUser(pendingAction.payload.email, pendingAction.payload.password);
            } catch (e: any) {
                alert(`Failed to create user in Authentication system: ${e.message}`);
                setIsKeyModalOpen(false);
                setPendingAction(null);
                return;
            }

            const { password, ...userData } = pendingAction.payload;
            const userToAdd: User = {
                id: `user-${Date.now()}`,
                ...userData,
                isOnline: false,
                webAppAccess: true,
                permissions: [...new Set([...userData.permissions, UserPermission.VIEW_MY_PROFILE, UserPermission.VIEW_FLEET_AVAILABILITY])],
            };
            onUpdateUsers(prev => [...prev, userToAdd]);
            setNewUser(emptyUser);
            setIsAdding(false);
            alert(`User ${userToAdd.fullName} created successfully. They can now log in.`);
            break;

        case 'edit':
            setOriginalUser(JSON.parse(JSON.stringify(pendingAction.payload)));
            setEditingId(pendingAction.payload.id);
            break;

        case 'delete':
            setUserToDelete(pendingAction.payload);
            break;
        }
    } catch (e) {
        console.error("Operation failed", e);
        alert("An unexpected error occurred.");
    }

    setIsKeyModalOpen(false);
    setPendingAction(null);
  };
  
  const handleSaveEdit = () => {
    const userToSave = users.find(u => u.id === editingId);
    if (!userToSave) return;

    if (!userToSave.fullName.trim() || !userToSave.username.trim() || !userToSave.email.trim()) {
        alert('Full Name, Username, and Email cannot be empty.');
        return;
    }
     if (userToSave.permissions.length === 0) {
      alert('A user must have at least one permission.');
      return;
    }
    
    const cleanEmail = userToSave.email.trim().toLowerCase();
    const emailExists = users.some(u => u.id !== userToSave.id && u.email.toLowerCase() === cleanEmail);
    if (emailExists) {
        alert('This email is already in use.');
        return;
    }

    onUpdateUsers(prev => prev.map(u => u.id === userToSave.id ? {...u, email: cleanEmail} : u));
    
    setEditingId(null);
    setOriginalUser(null);
  };

  const handleCancelEdit = () => {
    if (originalUser) {
        onUpdateUsers(prev => prev.map(u => u.id === originalUser.id ? originalUser : u));
    }
    setEditingId(null);
    setOriginalUser(null);
  };

  const handleConfirmDelete = () => {
    if (userToDelete) {
      onUpdateUsers(prev => prev.filter(u => u.id !== userToDelete.id));
    }
    setUserToDelete(null);
  };

  const handleUpdateChange = (id: string, field: keyof User, value: any) => {
      onUpdateUsers(prevUsers => prevUsers.map(user => {
          if (user.id === id) {
              return { ...user, [field]: value };
          }
          return user;
      }));
  };

  const toggleWebAppAccess = (userId: string) => {
      if (!hasManagePermission) {
        alert("You do not have permission to change user access.");
        return;
      }
      onUpdateUsers(prevUsers => prevUsers.map(user => {
          if (user.id === userId) {
              const currentAccess = user.webAppAccess ?? true;
              return { ...user, webAppAccess: !currentAccess };
          }
          return user;
      }));
  };

  const handlePasswordResetAttempt = (user: User) => {
    setUserForPasswordReset(user);
  };

  const handleConfirmPasswordReset = async () => {
    if (!userForPasswordReset) return;
    try {
        await sendPasswordReset(userForPasswordReset.email);
        alert(`Password reset email sent to ${userForPasswordReset.email}.`);
    } catch (error) {
        alert('Failed to send password reset email. Please check the email address and try again.');
        console.error(error);
    }
    setUserForPasswordReset(null);
  };

  const formatLastSeen = (dateString?: string) => {
      if (!dateString) return 'Never';
      return new Date(dateString).toLocaleString('en-US', { 
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
      });
  };

  const headers = ['Status', 'Device', 'Full Name', 'Username', 'Email', 'Position', 'Password Changed', 'App Access', 'Actions'];

  return (
    <div className="p-4 sm:p-6 bg-white">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-2xl font-bold text-gray-800">User Management & Activity</h3>
            {hasManagePermission && (
              <button onClick={() => setIsAdding(!isAdding)} className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-md hover:bg-primary">
                  {isAdding ? <CancelIcon /> : <PlusIcon />} {isAdding ? 'Cancel' : 'Add New User'}
              </button>
            )}
        </div>
        
        {isAdding && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 mb-6 space-y-4">
                <div className="p-4 bg-blue-50 border-l-4 border-blue-400 text-blue-800">
                    <h4 className="font-bold">Automated Account Creation</h4>
                    <p className="text-sm mt-1">
                        When you save this user, a login account will be automatically created. The email will be saved in lowercase to ensure consistent login access.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <InputField label="Full Name" value={newUser.fullName} onChange={v => handleNewUserChange('fullName', v)} required />
                    <InputField label="Username" value={newUser.username} onChange={v => handleNewUserChange('username', v)} required />
                    <InputField label="Email" type="email" value={newUser.email} onChange={v => handleNewUserChange('email', v)} required />
                    <InputField label="Initial Password" type="password" value={newUser.password || ''} onChange={v => handleNewUserChange('password', v)} required />
                    <InputField label="National ID" value={newUser.nationalId} onChange={v => handleNewUserChange('nationalId', v)} />
                    <InputField label="SSC Number" value={newUser.sscNumber || ''} onChange={v => handleNewUserChange('sscNumber', v)} />
                    <InputField label="Position" value={newUser.position} onChange={v => handleNewUserChange('position', v)} />
                    <InputField label="Base Salary (JOD)" type="number" value={newUser.baseSalaryJOD} onChange={v => handleNewUserChange('baseSalaryJOD', parseFloat(v) || 0)} placeholder="0.00" />
                    <InputField label="Hire Date" type="date" value={newUser.hireDate} onChange={v => handleNewUserChange('hireDate', v)} />
                    <SelectField label="Status" value={newUser.status} onChange={v => handleNewUserChange('status', v)} options={Object.values(UserStatus)} />
                </div>
                <PermissionsEditor permissions={newUser.permissions} onChange={p => handleNewUserChange('permissions', p)} />
                {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
                <div className="text-right">
                    <button onClick={handleAddUserAttempt} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-secondary">Save & Create User</button>
                </div>
            </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>{headers.map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>)}</tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {users.map(user => {
                        const isEditing = editingId === user.id;
                        return (
                           <React.Fragment key={user.id}>
                                <tr className={isEditing ? 'bg-yellow-50' : ''}>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <span className={`h-3 w-3 rounded-full mr-2 ${user.isOnline ? 'bg-green-500' : 'bg-gray-300'}`} title={user.isOnline ? 'Online' : 'Offline'}></span>
                                            <div className="text-xs text-gray-500 flex flex-col">
                                                <span>{user.isOnline ? 'Online' : 'Offline'}</span>
                                                <span className="text-[10px]">{formatLastSeen(user.lastSeen)}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-center text-gray-500">
                                        {user.deviceType === 'mobile' ? (
                                            <DevicePhoneMobileIcon className="h-5 w-5 mx-auto" />
                                        ) : user.deviceType === 'desktop' ? (
                                            <DesktopComputerIcon className="h-5 w-5 mx-auto" />
                                        ) : (
                                            <span className="text-xs">-</span>
                                        )}
                                    </td>
                                    <td className="p-2"><input type="text" value={user.fullName} disabled={!isEditing} onChange={e => handleUpdateChange(user.id, 'fullName', e.target.value)} className="w-full p-1 border rounded disabled:bg-transparent disabled:border-transparent" /></td>
                                    <td className="p-2"><input type="text" value={user.username} disabled={!isEditing} onChange={e => handleUpdateChange(user.id, 'username', e.target.value)} className="w-full p-1 border rounded disabled:bg-transparent disabled:border-transparent" /></td>
                                    <td className="p-2"><input type="email" value={user.email} disabled={!isEditing} onChange={e => handleUpdateChange(user.id, 'email', e.target.value)} className="w-full p-1 border rounded disabled:bg-transparent disabled:border-transparent" /></td>
                                    <td className="p-2"><input type="text" value={user.position} disabled={!isEditing} onChange={e => handleUpdateChange(user.id, 'position', e.target.value)} className="w-full p-1 border rounded disabled:bg-transparent disabled:border-transparent" /></td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                        {user.passwordLastChanged ? formatLastSeen(user.passwordLastChanged) : 'Never'}
                                    </td>
                                    <td className="p-2 text-center align-middle">
                                        <button 
                                            type="button"
                                            onClick={(e) => { 
                                                e.preventDefault();
                                                e.stopPropagation(); 
                                                toggleWebAppAccess(user.id); 
                                            }}
                                            disabled={!hasManagePermission || user.id === 'admin-user-01'}
                                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${user.webAppAccess !== false ? 'bg-green-500' : 'bg-red-500'} disabled:opacity-50 disabled:cursor-not-allowed z-10`}
                                            role="switch"
                                            aria-checked={user.webAppAccess !== false}
                                            title={user.id === 'admin-user-01' ? 'Admin access cannot be disabled' : (user.webAppAccess !== false ? 'Web access is allowed. Click to block.' : 'Web access is blocked. Click to allow.')}
                                        >
                                            <span className="sr-only">Toggle web access</span>
                                            <span
                                                aria-hidden="true"
                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${user.webAppAccess !== false ? 'translate-x-5' : 'translate-x-0'}`}
                                            />
                                        </button>
                                        <p className={`text-[10px] mt-1 font-medium ${user.webAppAccess !== false ? 'text-green-600' : 'text-red-600'}`}>
                                            {user.webAppAccess !== false ? 'Allowed' : 'Blocked'}
                                        </p>
                                    </td>
                                    <td className="p-2 text-center">
                                      {hasManagePermission && (
                                        <div className="flex items-center justify-center gap-2">
                                        {isEditing ? (
                                            <>
                                                <button onClick={handleSaveEdit} className="p-1 text-green-600 hover:text-green-700" title="Save"><SaveIcon /></button>
                                                <button onClick={handleCancelEdit} className="p-1 text-gray-500 hover:text-gray-700" title="Cancel"><CancelIcon /></button>
                                            </>
                                        ) : (
                                            <>
                                                <button onClick={() => handleEditAttempt(user)} className="p-1 text-blue-500 hover:text-blue-700" title="Edit"><EditIcon /></button>
                                                <button 
                                                    onClick={() => handlePasswordResetAttempt(user)} 
                                                    disabled={user.id === 'admin-user-01'}
                                                    className="p-1 text-orange-500 hover:text-orange-700 disabled:text-gray-300 disabled:cursor-not-allowed" 
                                                    title={user.id === 'admin-user-01' ? "Master admin password cannot be reset from here" : "Send Password Reset Email"}
                                                >
                                                    <KeyIcon />
                                                </button>
                                                <button onClick={() => handleDeleteAttempt(user)} className="p-1 text-red-500 hover:text-red-700" title="Delete User"><TrashIcon /></button>
                                            </>
                                        )}
                                        </div>
                                      )}
                                    </td>
                                </tr>
                                {isEditing && (
                                    <tr>
                                        <td colSpan={headers.length} className="p-3 bg-yellow-50">
                                            <div className="grid grid-cols-2 gap-4 mb-4">
                                                 <InputField label="National ID" value={user.nationalId} onChange={v => handleUpdateChange(user.id, 'nationalId', v)} />
                                                 <InputField label="SSC Number" value={user.sscNumber || ''} onChange={v => handleUpdateChange(user.id, 'sscNumber', v)} />
                                                 <InputField label="Base Salary (JOD)" type="number" value={user.baseSalaryJOD} onChange={v => handleUpdateChange(user.id, 'baseSalaryJOD', parseFloat(v) || 0)} />
                                                 <InputField label="Hire Date" type="date" value={user.hireDate} onChange={v => handleUpdateChange(user.id, 'hireDate', v)} />
                                                 <SelectField label="Status" value={user.status} onChange={v => handleUpdateChange(user.id, 'status', v)} options={Object.values(UserStatus)} />
                                                 <div>
                                                    <label className="block text-sm font-medium text-gray-700">Password Changed</label>
                                                    <p className="w-full p-2 mt-1 text-sm bg-gray-200 rounded-md">{user.passwordLastChanged ? new Date(user.passwordLastChanged).toLocaleString() : 'Never'}</p>
                                                 </div>
                                            </div>
                                            <PermissionsEditor permissions={user.permissions || []} onChange={p => handleUpdateChange(user.id, 'permissions', p)} />
                                        </td>
                                    </tr>
                                )}
                           </React.Fragment>
                        );
                    })}
                    {users.length === 0 && (
                        <tr>
                            <td colSpan={headers.length} className="text-center py-10 text-gray-500">No users have been added.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
        
        {userToDelete && (
            <ConfirmationDialog
                message={`Are you sure you want to delete user "${userToDelete.fullName}"? This action cannot be undone.`}
                onConfirm={handleConfirmDelete}
                onCancel={() => setUserToDelete(null)}
                confirmButtonText="Delete User"
            />
        )}
        {isKeyModalOpen && (
            <SecurityKeyModal
                onSuccess={handleKeySuccess}
                onClose={() => setIsKeyModalOpen(false)}
            />
        )}
         {userForPasswordReset && (
            <ConfirmationDialog
                message={`Are you sure you want to send a password reset email to ${userForPasswordReset.fullName}? They will receive a link to set a new password.`}
                onConfirm={handleConfirmPasswordReset}
                onCancel={() => setUserForPasswordReset(null)}
                confirmButtonText="Send Email"
            />
        )}
    </div>
  );
};

const InputField: React.FC<{ label: string, value: string | number, onChange: (value: string) => void, type?: string, placeholder?: string, required?: boolean }> = ({ label, value, onChange, type = 'text', placeholder, required }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500">*</span>}</label>
        <input 
            type={type} 
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full p-2 mt-1 border border-gray-300 rounded-md text-sm"
            required={required}
        />
    </div>
);

const SelectField: React.FC<{ label: string, value: string, onChange: (value: string) => void, options: string[] }> = ({ label, value, onChange, options }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <select value={value} onChange={e => onChange(e.target.value)} className="w-full p-2 mt-1 border border-gray-300 rounded-md text-sm">
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
    </div>
);

export default UserManagement;