'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  TruckIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  PlusIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface KPICard {
  id: string;
  title: string;
  value: string;
  change: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  subtitle: string;
}

interface QuickAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  action: () => void;
}

export default function MobileDashboard() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [showFAB, setShowFAB] = useState(false);
  const [fabExpanded, setFabExpanded] = useState(false);
  const touchStartY = useRef(0);
  const scrollableRef = useRef<HTMLDivElement>(null);

  // KPI Data
  const kpiCards: KPICard[] = [
    {
      id: '1',
      title: 'Active Rentals',
      value: '42',
      change: 12.5,
      icon: TruckIcon,
      color: 'blue',
      subtitle: 'Currently on road',
    },
    {
      id: '2',
      title: "Today's Revenue",
      value: '$8,450',
      change: 8.3,
      icon: CurrencyDollarIcon,
      color: 'green',
      subtitle: '+$650 from yesterday',
    },
    {
      id: '3',
      title: 'Reservations',
      value: '28',
      change: -3.2,
      icon: CalendarIcon,
      color: 'purple',
      subtitle: 'Pending pickups',
    },
    {
      id: '4',
      title: 'Fleet Utilization',
      value: '87%',
      change: 5.1,
      icon: ChartBarIcon,
      color: 'orange',
      subtitle: '65 of 75 vehicles',
    },
  ];

  // Quick Actions
  const quickActions: QuickAction[] = [
    {
      id: '1',
      label: 'New Reservation',
      icon: CalendarIcon,
      color: 'blue',
      action: () => console.log('New Reservation'),
    },
    {
      id: '2',
      label: 'Add Vehicle',
      icon: TruckIcon,
      color: 'green',
      action: () => console.log('Add Vehicle'),
    },
    {
      id: '3',
      label: 'New Customer',
      icon: UserGroupIcon,
      color: 'purple',
      action: () => console.log('New Customer'),
    },
    {
      id: '4',
      label: 'Create Invoice',
      icon: CurrencyDollarIcon,
      color: 'orange',
      action: () => console.log('Create Invoice'),
    },
  ];

  // Recent Activity
  const recentActivity = [
    {
      id: '1',
      type: 'pickup',
      title: 'Vehicle Pickup',
      description: 'Toyota Camry - John Smith',
      time: '5 min ago',
      icon: CheckCircleIcon,
      color: 'green',
    },
    {
      id: '2',
      type: 'reservation',
      title: 'New Reservation',
      description: 'Honda Accord - Sarah Johnson',
      time: '15 min ago',
      icon: CalendarIcon,
      color: 'blue',
    },
    {
      id: '3',
      type: 'maintenance',
      title: 'Maintenance Alert',
      description: 'Ford Explorer - Service Due',
      time: '1 hour ago',
      icon: ExclamationTriangleIcon,
      color: 'orange',
    },
    {
      id: '4',
      type: 'return',
      title: 'Vehicle Return',
      description: 'Tesla Model 3 - Mike Wilson',
      time: '2 hours ago',
      icon: ClockIcon,
      color: 'gray',
    },
  ];

  // Pull to Refresh
  const handleTouchStart = (e: React.TouchEvent) => {
    if (scrollableRef.current?.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (scrollableRef.current?.scrollTop === 0) {
      const currentY = e.touches[0].clientY;
      const distance = currentY - touchStartY.current;
      if (distance > 0 && distance < 100) {
        setPullDistance(distance);
      }
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 60) {
      handleRefresh();
    }
    setPullDistance(0);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simulate refresh
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsRefreshing(false);
    showToast('Dashboard refreshed');
  };

  const showToast = (message: string) => {
    // Implement toast notification
    console.log('Toast:', message);
  };

  // Haptic feedback (vibration)
  const hapticFeedback = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  };

  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700',
    orange: 'bg-orange-50 text-orange-700',
    gray: 'bg-gray-50 text-gray-700',
  };

  return (
    <div className="relative min-h-screen bg-gray-50 pb-20">
      {/* Pull to Refresh Indicator */}
      {pullDistance > 0 && (
        <div
          className="fixed top-14 left-0 right-0 flex justify-center transition-all duration-200 z-30"
          style={{ transform: `translateY(${Math.min(pullDistance, 60)}px)` }}
        >
          <div className="bg-white rounded-full shadow-lg p-3">
            <div
              className={`w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full ${
                isRefreshing ? 'animate-spin' : ''
              }`}
              style={{
                transform: `rotate(${pullDistance * 6}deg)`,
              }}
            />
          </div>
        </div>
      )}

      {/* Scrollable Content */}
      <div
        ref={scrollableRef}
        className="overflow-y-auto h-full"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 pt-6 pb-8 safe-area-top">
          <h1 className="text-2xl font-bold text-white mb-2">Dashboard</h1>
          <p className="text-blue-100">Welcome back! Here's your overview</p>
        </div>

        {/* KPI Cards - Horizontal Scroll */}
        <div className="px-4 -mt-4 mb-6">
          <div className="flex space-x-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2">
            {kpiCards.map((card) => (
              <div
                key={card.id}
                className="flex-shrink-0 w-64 bg-white rounded-xl shadow-sm p-4 snap-start"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-3 rounded-lg ${colorClasses[card.color as keyof typeof colorClasses]}`}>
                    <card.icon className="w-6 h-6" />
                  </div>
                  <div
                    className={`flex items-center space-x-1 text-sm font-semibold ${
                      card.change >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {card.change >= 0 ? (
                      <ArrowTrendingUpIcon className="w-4 h-4" />
                    ) : (
                      <ArrowTrendingDownIcon className="w-4 h-4" />
                    )}
                    <span>{Math.abs(card.change)}%</span>
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-1">
                  {card.value}
                </h3>
                <p className="text-sm font-medium text-gray-600 mb-1">{card.title}</p>
                <p className="text-xs text-gray-500">{card.subtitle}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="px-4 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <button
                key={action.id}
                onClick={() => {
                  hapticFeedback();
                  action.action();
                }}
                className={`p-4 rounded-xl ${colorClasses[action.color as keyof typeof colorClasses]} active:scale-95 transition-transform touch-manipulation`}
              >
                <action.icon className="w-6 h-6 mb-2" />
                <span className="text-sm font-medium">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="px-4 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Recent Activity</h2>
          <div className="space-y-3">
            {recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="bg-white rounded-xl shadow-sm p-4 active:bg-gray-50 transition-colors touch-manipulation"
              >
                <div className="flex items-start space-x-3">
                  <div
                    className={`p-2 rounded-lg ${
                      colorClasses[activity.color as keyof typeof colorClasses]
                    }`}
                  >
                    <activity.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {activity.title}
                      </h3>
                      <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                        {activity.time}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {activity.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Load More */}
        <div className="px-4 pb-6">
          <button className="w-full py-3 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg active:bg-blue-100 transition-colors touch-manipulation">
            Load More Activity
          </button>
        </div>
      </div>

      {/* Floating Action Button (FAB) */}
      <div className="fixed bottom-20 right-4 z-30">
        {/* Quick Action Buttons */}
        <div
          className={`flex flex-col space-y-3 mb-3 transition-all duration-300 ${
            fabExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        >
          {quickActions.slice(0, 3).map((action, index) => (
            <button
              key={action.id}
              onClick={() => {
                hapticFeedback();
                action.action();
                setFabExpanded(false);
              }}
              className={`flex items-center justify-end space-x-2 transition-all duration-300`}
              style={{ transitionDelay: `${index * 50}ms` }}
            >
              <span className="bg-white px-3 py-2 rounded-lg shadow-lg text-sm font-medium text-gray-700 whitespace-nowrap">
                {action.label}
              </span>
              <div
                className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center ${
                  colorClasses[action.color as keyof typeof colorClasses]
                }`}
              >
                <action.icon className="w-6 h-6" />
              </div>
            </button>
          ))}
        </div>

        {/* Main FAB */}
        <button
          onClick={() => {
            hapticFeedback();
            setFabExpanded(!fabExpanded);
          }}
          className={`w-14 h-14 bg-blue-600 rounded-full shadow-lg flex items-center justify-center text-white active:scale-95 transition-all ${
            fabExpanded ? 'rotate-45' : 'rotate-0'
          }`}
        >
          <PlusIcon className="w-7 h-7" />
        </button>
      </div>

      {/* FAB Backdrop */}
      {fabExpanded && (
        <div
          className="fixed inset-0 bg-black bg-opacity-20 z-20"
          onClick={() => setFabExpanded(false)}
        />
      )}
    </div>
  );
}
