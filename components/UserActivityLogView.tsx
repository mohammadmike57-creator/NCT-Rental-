import React, { useState, useMemo } from 'react';
import { ActivityLog, User } from '../types';
import { SearchIcon, ClearIcon } from './icons';

interface UserActivityLogViewProps {
  activityLog: ActivityLog[];
  users: User[];
}

const UserActivityLogView: React.FC<UserActivityLogViewProps> = ({ activityLog, users }) => {
  const [userFilter, setUserFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  const filteredLog = useMemo(() => {
    return activityLog
      .filter(log => {
        const userMatch = !userFilter || log.userId === userFilter;
        const timestamp = new Date(log.timestamp);
        const startMatch = !startDateFilter || timestamp >= new Date(startDateFilter);
        const endMatch = !endDateFilter || timestamp <= new Date(new Date(endDateFilter).setHours(23, 59, 59, 999));
        return userMatch && startMatch && endMatch;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [activityLog, userFilter, startDateFilter, endDateFilter]);

  const handleClearFilters = () => {
    setUserFilter('');
    setStartDateFilter('');
    setEndDateFilter('');
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <header className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">User Activity Log</h2>
        <p className="text-sm text-gray-500 mt-1">Review all actions performed by users within the system.</p>
      </header>

      <div className="p-4 bg-gray-50 rounded-lg border mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="text-xs font-medium text-gray-600">Filter by User</label>
          <select value={userFilter} onChange={e => setUserFilter(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm">
            <option value="">All Users</option>
            {users.map(user => <option key={user.id} value={user.id}>{user.fullName}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Start Date</label>
          <input type="date" value={startDateFilter} onChange={e => setStartDateFilter(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">End Date</label>
          <input type="date" value={endDateFilter} onChange={e => setEndDateFilter(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm" />
        </div>
        <button onClick={handleClearFilters} className="flex items-center gap-1.5 px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 h-[42px]">
            <ClearIcon /> Clear
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredLog.length > 0 ? filteredLog.map(log => (
              <tr key={log.id}>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-800">{log.userName}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{log.action}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{log.details}</td>
              </tr>
            )) : (
                <tr>
                    <td colSpan={4} className="text-center py-10 text-gray-500">No activity found for the selected filters.</td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserActivityLogView;
