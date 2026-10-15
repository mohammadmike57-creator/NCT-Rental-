import React, { useState, useMemo, useEffect } from 'react';
import { User, UserPermission, UserStatus } from '../types';
import {
  PlusIcon, TrashIcon, SaveIcon, EditIcon, CancelIcon, UserIcon,
  ChevronDownIcon, ChevronUpIcon, SearchIcon, FilterIcon, CheckCircleIcon,
  CloseIcon, MailIcon, KeyIcon, ShieldCheckIcon, ExportIcon, LockClosedIcon
} from './icons';
import { registerUser } from '../firebase/api';
import jsPDF from 'jspdf';

interface ProfessionalUserManagementProps {
  users: User[];
  onUpdateUsers: (users: User[]) => void;
  currentUser: User | null;
}

type SortField = 'fullName' | 'email' | 'username' | 'status' | 'position';
type SortDirection = 'asc' | 'desc';

interface UserStats {
  total: number;
  active: number;
  inactive: number;
  suspended: number;
  avgSalary: number;
}

const PERMISSION_GROUPS = [
  {
    title: 'Core Operations',
    permissions: ['VIEW_HOME_DASHBOARD', 'VIEW_RESERVATIONS', 'VIEW_TODAYS_RESERVATIONS', 'VIEW_INTERNAL_MESSAGES', 'VIEW_FLEET_AVAILABILITY', 'VIEW_MY_PROFILE'],
    icon: '🏠',
    color: 'blue'
  },
  {
    title: 'Reservation Actions',
    permissions: ['ACTION_RESERVATIONS_ADD', 'ACTION_RESERVATIONS_EDIT', 'ACTION_RESERVATIONS_DELETE', 'ACTION_RESERVATIONS_EXTEND'],
    icon: '📝',
    color: 'green'
  },
  {
    title: 'Reports',
    permissions: ['VIEW_REPORTS_YEARLY_SUMMARY', 'VIEW_REPORTS_SOURCE_PERFORMANCE', 'VIEW_REPORTS_INVOICE_GENERATION'],
    icon: '📊',
    color: 'purple'
  },
  {
    title: 'Financials',
    permissions: ['VIEW_FINANCIALS_ACCOUNTING', 'VIEW_FINANCIALS_PAYMENT_APPROVALS', 'VIEW_FINANCIALS_DEFERRED_PAYMENTS', 'VIEW_FINANCIALS_LATE_RETURNS'],
    icon: '💰',
    color: 'yellow'
  },
  {
    title: 'Incidents',
    permissions: ['VIEW_TRAFFIC_TICKETS', 'VIEW_VEHICLE_DAMAGES'],
    icon: '⚠️',
    color: 'orange'
  },
  {
    title: 'Administration',
    permissions: ['VIEW_ADMIN_PANEL', 'ACTION_ADMIN_MANAGE_USERS', 'ACTION_ADMIN_MANAGE_FLEET', 'ACTION_ADMIN_MANAGE_SOURCES', 'ACTION_ADMIN_MANAGE_EXTRAS', 'ACTION_ADMIN_MANAGE_LOCATIONS', 'ACTION_ADMIN_MANAGE_COMPANY_DETAILS', 'ACTION_ADMIN_MANAGE_YEARS', 'VIEW_SYSTEM_ACTIVITY_LOG'],
    icon: '⚙️',
    color: 'red'
  },
  {
    title: 'OTA Integration',
    permissions: ['VIEW_AGGREGATOR_SETUP'],
    icon: '🔌',
    color: 'indigo'
  }
];

const ProfessionalUserManagement: React.FC<ProfessionalUserManagementProps> = ({ users, onUpdateUsers, currentUser }) => {
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
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<UserStatus | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('fullName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLocalUsers(JSON.parse(JSON.stringify(users)));
  }, [users]);

  // Calculate user statistics
  const userStats: UserStats = useMemo(() => {
    const stats: UserStats = {
      total: localUsers.length,
      active: 0,
      inactive: 0,
      suspended: 0,
      avgSalary: 0
    };

    let totalSalary = 0;
    localUsers.forEach(user => {
      if (user.status === UserStatus.ACTIVE) stats.active++;
      else if (user.status === UserStatus.INACTIVE) stats.inactive++;
      else if (user.status === UserStatus.SUSPENDED) stats.suspended++;

      totalSalary += user.baseSalaryJOD || 0;
    });

    stats.avgSalary = localUsers.length > 0 ? totalSalary / localUsers.length : 0;

    return stats;
  }, [localUsers]);

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    let filtered = [...localUsers];

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(user =>
        user.fullName?.toLowerCase().includes(search) ||
        user.email?.toLowerCase().includes(search) ||
        user.username?.toLowerCase().includes(search) ||
        user.position?.toLowerCase().includes(search) ||
        user.nationalId?.toLowerCase().includes(search)
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(user => user.status === filterStatus);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any = a[sortField] || '';
      let bVal: any = b[sortField] || '';

      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [localUsers, searchTerm, filterStatus, sortField, sortDirection]);

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
      await registerUser({
        email: newUser.email!,
        password: newUser.password!,
        username: newUser.username!,
        fullName: newUser.fullName!,
        permissions: newUser.permissions,
      });

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
      alert('User created successfully!');
    } catch (error: any) {
      alert(`Error creating user: ${error.message || 'Unknown error'}`);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDeleteUser = (userId: string) => {
    if (currentUser?.id === userId) {
      alert('You cannot delete your own account.');
      return;
    }
    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      const updatedUsers = localUsers.filter(u => u.id !== userId);
      setLocalUsers(updatedUsers);
      onUpdateUsers(updatedUsers);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const togglePermission = (user: Partial<User>, perm: string, isNewUser: boolean = false) => {
    const currentPerms = (isNewUser ? newUser.permissions : editForm.permissions) || [];
    const hasPermission = currentPerms.includes(perm as UserPermission);
    let newPermissions: UserPermission[];

    if (hasPermission) {
      newPermissions = currentPerms.filter(p => p !== perm);
    } else {
      newPermissions = [...currentPerms, perm as UserPermission];
    }

    if (isNewUser) {
      setNewUser({ ...newUser, permissions: newPermissions });
    } else {
      setEditForm({ ...editForm, permissions: newPermissions });
    }
  };

  const toggleGroupPermissions = (group: typeof PERMISSION_GROUPS[0], isNewUser: boolean = false) => {
    const currentPerms = (isNewUser ? newUser.permissions : editForm.permissions) || [];
    const allPermissions = group.permissions as UserPermission[];
    const hasAll = allPermissions.every(p => currentPerms.includes(p as UserPermission));

    let newPermissions: UserPermission[];
    if (hasAll) {
      newPermissions = currentPerms.filter(p => !allPermissions.includes(p));
    } else {
      const toAdd = allPermissions.filter(p => !currentPerms.includes(p as UserPermission));
      newPermissions = [...currentPerms, ...toAdd];
    }

    if (isNewUser) {
      setNewUser({ ...newUser, permissions: newPermissions });
    } else {
      setEditForm({ ...editForm, permissions: newPermissions });
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('User Management Report', 14, 20);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(`Total Users: ${userStats.total} | Active: ${userStats.active} | Inactive: ${userStats.inactive}`, 14, 34);

    let yPos = 45;
    doc.setFontSize(9);

    filteredUsers.forEach((user, index) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      doc.text(`${index + 1}. ${user.fullName} (${user.username})`, 14, yPos);
      doc.text(`Email: ${user.email} | Status: ${user.status} | Position: ${user.position || 'N/A'}`, 20, yPos + 5);
      doc.text(`Permissions: ${user.permissions?.length || 0} assigned`, 20, yPos + 10);
      yPos += 18;
    });

    doc.save(`user-management-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const getStatusBadge = (status: UserStatus) => {
    const badges = {
      [UserStatus.ACTIVE]: <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 border border-green-200">Active</span>,
      [UserStatus.INACTIVE]: <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 border border-gray-200">Inactive</span>,
      [UserStatus.SUSPENDED]: <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 border border-red-200">Suspended</span>,
    };
    return badges[status] || badges[UserStatus.INACTIVE];
  };

  const renderPermissionsEditor = (user: Partial<User>, isNewUser: boolean = false) => {
    const currentPermissions = (isNewUser ? newUser.permissions : editForm.permissions) || [];

    return (
      <div className="space-y-4">
        {PERMISSION_GROUPS.map((group) => {
          const groupPerms = group.permissions as UserPermission[];
          const hasAll = groupPerms.every(p => currentPermissions.includes(p as UserPermission));
          const hasSome = groupPerms.some(p => currentPermissions.includes(p as UserPermission)) && !hasAll;

          return (
            <div key={group.title} className={`border-2 border-${group.color}-200 rounded-lg bg-${group.color}-50/50`}>
              <div
                className={`px-4 py-3 bg-gradient-to-r from-${group.color}-100 to-${group.color}-50 cursor-pointer hover:from-${group.color}-200 hover:to-${group.color}-100 transition-colors flex items-center justify-between`}
                onClick={() => setExpandedPermissions({
                  ...expandedPermissions,
                  [group.title]: !expandedPermissions[group.title]
                })}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{group.icon}</span>
                  <div>
                    <h4 className={`font-bold text-${group.color}-900`}>{group.title}</h4>
                    <p className={`text-xs text-${group.color}-700`}>
                      {groupPerms.filter(p => currentPermissions.includes(p as UserPermission)).length} / {groupPerms.length} permissions
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroupPermissions(group, isNewUser);
                    }}
                    className={`px-3 py-1 text-xs font-semibold rounded ${
                      hasAll ? `bg-${group.color}-600 text-white` : hasSome ? `bg-${group.color}-300 text-${group.color}-900` : `bg-white text-${group.color}-600 border border-${group.color}-300`
                    } hover:opacity-80 transition-opacity`}
                  >
                    {hasAll ? 'Deselect All' : 'Select All'}
                  </button>
                  {expandedPermissions[group.title] ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
                </div>
              </div>

              {expandedPermissions[group.title] && (
                <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {groupPerms.map(perm => (
                    <label key={perm} className="flex items-center gap-2 p-2 hover:bg-white rounded cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={currentPermissions.includes(perm as UserPermission)}
                        onChange={() => togglePermission(user, perm, isNewUser)}
                        className={`w-4 h-4 rounded border-${group.color}-300 text-${group.color}-600 focus:ring-${group.color}-500`}
                      />
                      <span className="text-sm text-slate-700 select-none">{perm.replace(/_/g, ' ')}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-slate-100 p-6">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center gap-3">
              <UserIcon className="w-10 h-10 text-purple-600" />
              User Management
            </h1>
            <p className="text-slate-600 mt-2">Comprehensive user access control and administration</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={exportToPDF}
              className="px-4 py-2 bg-white border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm font-semibold"
            >
              <ExportIcon className="w-5 h-5" />
              Export PDF
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all flex items-center gap-2 shadow-lg font-semibold"
            >
              <PlusIcon className="w-5 h-5" />
              Add User
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-purple-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Total Users</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{userStats.total}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <UserIcon className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-green-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Active Users</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{userStats.active}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircleIcon className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-red-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Inactive/Suspended</p>
                <p className="text-3xl font-bold text-red-600 mt-1">{userStats.inactive + userStats.suspended}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <LockClosedIcon className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-blue-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Avg. Salary (JOD)</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">{userStats.avgSalary.toFixed(0)}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-bold text-lg">💵</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl p-6 shadow-md mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[300px]">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search users by name, email, username, position, national ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
              />
            </div>
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as UserStatus | 'all')}
            className="px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all font-medium"
          >
            <option value="all">All Status ({localUsers.length})</option>
            <option value={UserStatus.ACTIVE}>Active ({userStats.active})</option>
            <option value={UserStatus.INACTIVE}>Inactive ({userStats.inactive})</option>
            <option value={UserStatus.SUSPENDED}>Suspended ({userStats.suspended})</option>
          </select>

          <div className="text-sm text-slate-600 font-medium">
            Showing <span className="font-bold text-purple-600">{filteredUsers.length}</span> of {localUsers.length} users
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2 border-slate-200">
              <tr>
                <th
                  className="px-4 py-4 text-left text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => toggleSort('fullName')}
                >
                  <div className="flex items-center gap-2">
                    Full Name
                    {sortField === 'fullName' && (
                      sortDirection === 'asc' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-4 text-left text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => toggleSort('email')}
                >
                  <div className="flex items-center gap-2">
                    Email
                    {sortField === 'email' && (
                      sortDirection === 'asc' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-4 text-left text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => toggleSort('username')}
                >
                  <div className="flex items-center gap-2">
                    Username
                    {sortField === 'username' && (
                      sortDirection === 'asc' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-4 text-left text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => toggleSort('position')}
                >
                  <div className="flex items-center gap-2">
                    Position
                    {sortField === 'position' && (
                      sortDirection === 'asc' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-4 text-left text-sm font-bold text-slate-700">Permissions</th>
                <th
                  className="px-4 py-4 text-left text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => toggleSort('status')}
                >
                  <div className="flex items-center gap-2">
                    Status
                    {sortField === 'status' && (
                      sortDirection === 'asc' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-4 text-center text-sm font-bold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <UserIcon className="w-16 h-16 text-slate-300" />
                      <p className="text-slate-500 text-lg font-medium">No users found</p>
                      <p className="text-slate-400 text-sm">Try adjusting your search or filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user, index) => {
                  const isEditing = editingId === user.id;

                  return (
                    <tr key={user.id} className={`hover:bg-purple-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      <td className="px-4 py-4">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.fullName || ''}
                            onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                            className="w-full px-3 py-1.5 border-2 border-purple-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                          />
                        ) : (
                          <div>
                            <div className="font-semibold text-slate-800">{user.fullName}</div>
                            {user.nationalId && (
                              <div className="text-xs text-slate-500">ID: {user.nationalId}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {isEditing ? (
                          <input
                            type="email"
                            value={editForm.email || ''}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            className="w-full px-3 py-1.5 border-2 border-purple-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                          />
                        ) : (
                          <span className="text-slate-700">{user.email}</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono text-sm bg-slate-100 px-2 py-1 rounded">{user.username}</span>
                      </td>
                      <td className="px-4 py-4">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.position || ''}
                            onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                            className="w-full px-3 py-1.5 border-2 border-purple-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                          />
                        ) : (
                          <span className="text-slate-700">{user.position || 'N/A'}</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {isEditing ? (
                          <button
                            onClick={() => setExpandedPermissions({ [user.id]: !expandedPermissions[user.id] })}
                            className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-semibold"
                          >
                            Edit Permissions ({editForm.permissions?.length || 0})
                          </button>
                        ) : (
                          <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-lg text-xs font-semibold border border-purple-200">
                            {user.permissions?.length || 0} permissions
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {isEditing ? (
                          <select
                            value={editForm.status || UserStatus.ACTIVE}
                            onChange={(e) => setEditForm({ ...editForm, status: e.target.value as UserStatus })}
                            className="px-3 py-1.5 border-2 border-purple-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                          >
                            <option value={UserStatus.ACTIVE}>Active</option>
                            <option value={UserStatus.INACTIVE}>Inactive</option>
                            <option value={UserStatus.SUSPENDED}>Suspended</option>
                          </select>
                        ) : (
                          getStatusBadge(user.status || UserStatus.INACTIVE)
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2">
                          {isEditing ? (
                            <>
                              <button
                                onClick={handleSaveEdit}
                                className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                                title="Save"
                              >
                                <SaveIcon className="w-5 h-5" />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                title="Cancel"
                              >
                                <CancelIcon className="w-5 h-5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleEdit(user)}
                                className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <EditIcon className="w-5 h-5" />
                              </button>
                              {currentUser?.id !== user.id && (
                                <button
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                  title="Delete"
                                >
                                  <TrashIcon className="w-5 h-5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Permissions Editor Modal (appears when editing and clicking "Edit Permissions") */}
      {editingId && expandedPermissions[editingId] && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm" onClick={() => setExpandedPermissions({})} />

            <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-5 flex items-center justify-between">
                <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                  <ShieldCheckIcon className="w-7 h-7" />
                  Edit Permissions
                </h3>
                <button
                  onClick={() => setExpandedPermissions({})}
                  className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
                >
                  <CloseIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 max-h-[calc(90vh-140px)] overflow-y-auto">
                {renderPermissionsEditor(editForm, false)}
              </div>

              <div className="bg-slate-100 px-6 py-4 flex items-center justify-end gap-3">
                <button
                  onClick={() => setExpandedPermissions({})}
                  className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-semibold shadow-lg"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm" onClick={() => setShowAddForm(false)} />

            <div className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-5 flex items-center justify-between">
                <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                  <UserIcon className="w-7 h-7" />
                  Create New User
                </h3>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
                >
                  <CloseIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 max-h-[calc(90vh-200px)] overflow-y-auto bg-slate-50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <h4 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b-2 border-purple-200">Basic Information</h4>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name *</label>
                    <input
                      type="text"
                      value={newUser.fullName || ''}
                      onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                      placeholder="John Doe"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Email *</label>
                    <input
                      type="email"
                      value={newUser.email || ''}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                      placeholder="john.doe@company.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Username *</label>
                    <input
                      type="text"
                      value={newUser.username || ''}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                      placeholder="johndoe"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Password *</label>
                    <input
                      type="password"
                      value={newUser.password || ''}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                      placeholder="••••••••"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Position</label>
                    <input
                      type="text"
                      value={newUser.position || ''}
                      onChange={(e) => setNewUser({ ...newUser, position: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                      placeholder="Sales Manager"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">National ID</label>
                    <input
                      type="text"
                      value={newUser.nationalId || ''}
                      onChange={(e) => setNewUser({ ...newUser, nationalId: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                      placeholder="1234567890"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Hire Date</label>
                    <input
                      type="date"
                      value={newUser.hireDate || ''}
                      onChange={(e) => setNewUser({ ...newUser, hireDate: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Base Salary (JOD)</label>
                    <input
                      type="number"
                      value={newUser.baseSalaryJOD || 0}
                      onChange={(e) => setNewUser({ ...newUser, baseSalaryJOD: Number(e.target.value) })}
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                      min="0"
                    />
                  </div>

                  <div className="col-span-2 mt-4">
                    <h4 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b-2 border-purple-200">Permissions & Access</h4>
                  </div>

                  <div className="col-span-2">
                    {renderPermissionsEditor(newUser, true)}
                  </div>
                </div>
              </div>

              <div className="bg-slate-100 px-6 py-4 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-6 py-2.5 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-200 transition-all font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddUser}
                  disabled={isRegistering}
                  className="px-8 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all flex items-center gap-2 shadow-lg font-semibold disabled:opacity-50"
                >
                  {isRegistering ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <SaveIcon className="w-5 h-5" />
                      Create User
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfessionalUserManagement;
