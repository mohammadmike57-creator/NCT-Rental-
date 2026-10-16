import React, { useState } from 'react';
import {
  GlobeAltIcon,
  ChartBarIcon,
  CogIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlusIcon,
  EditIcon,
  ClockIcon
} from './icons';

interface Channel {
  id: string;
  channelName: string;
  channelType: string;
  isActive: boolean;
  totalBookings: number;
  totalRevenue: number;
  commissionValue: number;
  commissionType: string;
  syncStatus: string;
  lastSyncAt: string;
}

const ChannelManagement: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([
    {
      id: '1',
      channelName: 'Skyscanner',
      channelType: 'METASEARCH',
      isActive: true,
      totalBookings: 245,
      totalRevenue: 128500,
      commissionValue: 15,
      commissionType: 'PERCENTAGE',
      syncStatus: 'SUCCESS',
      lastSyncAt: new Date().toISOString()
    },
    {
      id: '2',
      channelName: 'DiscoverCars',
      channelType: 'AGGREGATOR',
      isActive: true,
      totalBookings: 189,
      totalRevenue: 95400,
      commissionValue: 12,
      commissionType: 'PERCENTAGE',
      syncStatus: 'SUCCESS',
      lastSyncAt: new Date().toISOString()
    },
    {
      id: '3',
      channelName: 'Booking.com',
      channelType: 'OTA',
      isActive: true,
      totalBookings: 312,
      totalRevenue: 156000,
      commissionValue: 18,
      commissionType: 'PERCENTAGE',
      syncStatus: 'SUCCESS',
      lastSyncAt: new Date().toISOString()
    },
    {
      id: '4',
      channelName: 'Rentalcars.com',
      channelType: 'AGGREGATOR',
      isActive: true,
      totalBookings: 267,
      totalRevenue: 142300,
      commissionValue: 14,
      commissionType: 'PERCENTAGE',
      syncStatus: 'SUCCESS',
      lastSyncAt: new Date().toISOString()
    },
    {
      id: '5',
      channelName: 'Expedia',
      channelType: 'OTA',
      isActive: false,
      totalBookings: 156,
      totalRevenue: 78200,
      commissionValue: 16,
      commissionType: 'PERCENTAGE',
      syncStatus: 'DISABLED',
      lastSyncAt: new Date(Date.now() - 86400000 * 7).toISOString()
    }
  ]);

  const [showAddModal, setShowAddModal] = useState(false);

  const getChannelTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      METASEARCH: 'bg-sky-100 text-sky-700 border-sky-200',
      AGGREGATOR: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      OTA: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      CORPORATE: 'bg-amber-100 text-amber-700 border-amber-200',
      DIRECT: 'bg-slate-100 text-slate-700 border-slate-200'
    };
    return colors[type] || 'bg-slate-100 text-slate-700';
  };

  const getSyncStatusIcon = (status: string) => {
    if (status === 'SUCCESS') {
      return <CheckCircleIcon className="w-5 h-5 text-emerald-500" />;
    } else if (status === 'FAILED') {
      return <XCircleIcon className="w-5 h-5 text-rose-500" />;
    } else if (status === 'IN_PROGRESS') {
      return <ClockIcon className="w-5 h-5 text-amber-500 animate-spin" />;
    }
    return <ClockIcon className="w-5 h-5 text-slate-400" />;
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="professional-card">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              Distribution Channel Management
            </h1>
            <p className="text-slate-600">
              Manage your connections to Skyscanner, DiscoverCars, Booking.com, and more
            </p>
          </div>
          <button
            className="btn-professional-primary flex items-center gap-2"
            onClick={() => setShowAddModal(true)}
          >
            <PlusIcon className="w-5 h-5" />
            Add Channel
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="professional-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Active Channels</p>
              <p className="text-3xl font-bold text-slate-900">
                {channels.filter(c => c.isActive).length}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-900">
              <GlobeAltIcon className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="professional-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Total Bookings</p>
              <p className="text-3xl font-bold text-slate-900">
                {channels.reduce((sum, c) => sum + c.totalBookings, 0).toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-900">
              <ChartBarIcon className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="professional-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Total Revenue</p>
              <p className="text-3xl font-bold text-slate-900">
                ${channels.reduce((sum, c) => sum + c.totalRevenue, 0).toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-900">
              <span className="text-white text-2xl font-bold">$</span>
            </div>
          </div>
        </div>

        <div className="professional-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Avg Commission</p>
              <p className="text-3xl font-bold text-slate-900">
                {(channels.reduce((sum, c) => sum + c.commissionValue, 0) / channels.length).toFixed(1)}%
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-900">
              <span className="text-white text-xl font-bold">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Channels List */}
      <div className="professional-card">
        <h2 className="text-xl font-bold text-slate-900 mb-6">Connected Channels</h2>

        <div className="space-y-4">
          {channels.map((channel) => (
            <div
              key={channel.id}
              className="flex items-center justify-between p-6 bg-slate-50 rounded-xl hover:bg-slate-100 transition-all duration-200 border-2 border-transparent hover:border-sky-200"
            >
              {/* Channel Info */}
              <div className="flex items-center gap-6 flex-1">
                <div className="w-16 h-16 rounded-xl bg-white shadow-md flex items-center justify-center">
                  <GlobeAltIcon className="w-8 h-8 text-sky-600" />
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-slate-900">{channel.channelName}</h3>
                    <span className={`badge-professional ${getChannelTypeColor(channel.channelType)}`}>
                      {channel.channelType}
                    </span>
                    {channel.isActive ? (
                      <span className="badge-success">Active</span>
                    ) : (
                      <span className="badge-gray">Inactive</span>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-6">
                    <div>
                      <p className="text-xs text-slate-500">Bookings</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {channel.totalBookings.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Revenue</p>
                      <p className="text-sm font-semibold text-slate-900">
                        ${channel.totalRevenue.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Commission</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {channel.commissionValue}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Last Sync</p>
                      <div className="flex items-center gap-1">
                        {getSyncStatusIcon(channel.syncStatus)}
                        <p className="text-xs text-slate-600">
                          {new Date(channel.lastSyncAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button className="btn-professional-secondary px-4 py-2 text-sm flex items-center gap-2">
                  <ChartBarIcon className="w-4 h-4" />
                  View Stats
                </button>
                <button className="btn-professional-secondary px-4 py-2 text-sm flex items-center gap-2">
                  <CogIcon className="w-4 h-4" />
                  Configure
                </button>
                <button className="btn-professional-secondary px-4 py-2 text-sm flex items-center gap-2">
                  <EditIcon className="w-4 h-4" />
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Supported Channels */}
      <div className="professional-card">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Supported Distribution Channels</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            'Skyscanner', 'DiscoverCars', 'Booking.com', 'Expedia',
            'Rentalcars.com', 'Kayak', 'Priceline', 'Agoda',
            'TripAdvisor', 'CarRentals.com', 'EconomyCarRentals', 'AutoEurope'
          ].map((name) => (
            <div
              key={name}
              className="p-4 bg-slate-50 rounded-xl text-center hover:bg-sky-50 transition-colors cursor-pointer border-2 border-transparent hover:border-sky-300"
            >
              <GlobeAltIcon className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">{name}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChannelManagement;
