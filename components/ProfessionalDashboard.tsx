import React from 'react';
import {
  ChartBarIcon,
  CurrencyDollarIcon,
  CarIcon,
  UsersIcon,
  TrendingUpIcon,
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon
} from './icons';

interface DashboardProps {
  totalRevenue: number;
  totalReservations: number;
  activeRentals: number;
  availableVehicles: number;
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: string;
    user: string;
  }>;
  upcomingPickups: number;
  upcomingReturns: number;
  todayRevenue: number;
}

const ProfessionalDashboard: React.FC<DashboardProps> = ({
  totalRevenue,
  totalReservations,
  activeRentals,
  availableVehicles,
  recentActivity,
  upcomingPickups,
  upcomingReturns,
  todayRevenue
}) => {
  return (
    <div className="space-y-6 p-6 animate-fade-in">
      {/* Welcome Header */}
      <div className="professional-card">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              Welcome to NCT Rental
            </h1>
            <p className="text-slate-600">
              Here's what's happening with your business today
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
            <p className="text-2xl font-bold text-sky-600 mt-1">
              {new Date().toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Revenue */}
        <div className="professional-card group">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600 mb-1">Total Revenue</p>
              <p className="text-3xl font-bold text-slate-900">
                ${totalRevenue.toLocaleString()}
              </p>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUpIcon className="w-4 h-4 text-emerald-500" />
                <span className="text-sm text-emerald-600 font-medium">+12.5%</span>
                <span className="text-xs text-slate-500">vs last month</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform bg-slate-900">
              <CurrencyDollarIcon className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {/* Total Reservations */}
        <div className="professional-card group">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600 mb-1">Total Reservations</p>
              <p className="text-3xl font-bold text-slate-900">
                {totalReservations.toLocaleString()}
              </p>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUpIcon className="w-4 h-4 text-emerald-500" />
                <span className="text-sm text-emerald-600 font-medium">+8.2%</span>
                <span className="text-xs text-slate-500">vs last month</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform bg-slate-900">
              <CalendarIcon className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {/* Active Rentals */}
        <div className="professional-card group">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600 mb-1">Active Rentals</p>
              <p className="text-3xl font-bold text-slate-900">
                {activeRentals}
              </p>
              <div className="flex items-center gap-1 mt-2">
                <ClockIcon className="w-4 h-4 text-sky-500" />
                <span className="text-sm text-sky-600 font-medium">In Progress</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform bg-slate-900">
              <CheckCircleIcon className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {/* Available Vehicles */}
        <div className="professional-card group">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600 mb-1">Available Vehicles</p>
              <p className="text-3xl font-bold text-slate-900">
                {availableVehicles}
              </p>
              <div className="flex items-center gap-1 mt-2">
                <span className="text-sm text-slate-600 font-medium">Ready to Rent</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform bg-slate-900">
              <CarIcon className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions & Today's Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Overview */}
        <div className="lg:col-span-1 professional-card">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Today's Overview</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-sky-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center">
                  <CalendarIcon className="w-5 h-5 text-sky-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Pickups</p>
                  <p className="text-2xl font-bold text-slate-900">{upcomingPickups}</p>
                </div>
              </div>
              <button className="btn-professional-primary btn-sm">View</button>
            </div>

            <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Returns</p>
                  <p className="text-2xl font-bold text-slate-900">{upcomingReturns}</p>
                </div>
              </div>
              <button className="btn-professional-success btn-sm">View</button>
            </div>

            <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <CurrencyDollarIcon className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Today's Revenue</p>
                  <p className="text-2xl font-bold text-slate-900">${todayRevenue.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-2 professional-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900">Recent Activity</h3>
            <button className="text-sm text-sky-600 hover:text-sky-700 font-medium">
              View All
            </button>
          </div>
          <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-hide">
            {recentActivity.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p>No recent activity</p>
              </div>
            ) : (
              recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <div className="w-2 h-2 rounded-full bg-sky-500 mt-2 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{activity.description}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {activity.user} • {new Date(activity.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <span className="badge-info">{activity.type}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats Bar */}
      <div className="glass-card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-sky-600 mb-1">98%</div>
            <div className="text-sm text-slate-600">Fleet Utilization</div>
          </div>
          <div className="text-center border-l border-slate-200">
            <div className="text-3xl font-bold text-emerald-600 mb-1">4.8/5</div>
            <div className="text-sm text-slate-600">Customer Rating</div>
          </div>
          <div className="text-center border-l border-slate-200">
            <div className="text-3xl font-bold text-emerald-600 mb-1">24/7</div>
            <div className="text-sm text-slate-600">Support Available</div>
          </div>
          <div className="text-center border-l border-slate-200">
            <div className="text-3xl font-bold text-amber-600 mb-1">45min</div>
            <div className="text-sm text-slate-600">Avg Response Time</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalDashboard;
