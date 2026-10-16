'use client';

import React, { useState } from 'react';
import MobileDashboard from '@/components/MobileDashboard';
import MobileReservationsPage from '@/components/MobileReservationsPage';
import { getDeviceInfo } from '@/utils/mobileUtils';

/**
 * Mobile Demo Page
 *
 * This page demonstrates all mobile components and features:
 * - Responsive navigation
 * - Mobile dashboard
 * - Data tables
 * - Forms
 * - PWA features
 *
 * To use this page:
 * 1. Navigate to /mobile-demo
 * 2. Test on mobile device or Chrome DevTools
 * 3. Try all interactions (swipe, tap, pull-to-refresh)
 * 4. Test offline mode
 * 5. Install as PWA
 */

export default function MobileDemoPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reservations'>('dashboard');
  const deviceInfo = getDeviceInfo();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Tab Navigation */}
      <div className="sticky top-14 z-20 bg-white border-b border-gray-200 safe-area-top">
        <div className="flex">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors touch-manipulation ${
              activeTab === 'dashboard'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('reservations')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors touch-manipulation ${
              activeTab === 'reservations'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600'
            }`}
          >
            Reservations
          </button>
        </div>
      </div>

      {/* Device Info Banner (only in demo) */}
      <div className="bg-blue-600 text-white px-4 py-3">
        <div className="text-xs font-semibold mb-1">Device Information:</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="opacity-75">Type: </span>
            <span className="font-semibold">
              {deviceInfo.isMobile ? 'Mobile' : 'Desktop'}
              {deviceInfo.isTablet && ' (Tablet)'}
            </span>
          </div>
          <div>
            <span className="opacity-75">OS: </span>
            <span className="font-semibold">
              {deviceInfo.isIOS ? 'iOS' : deviceInfo.isAndroid ? 'Android' : 'Other'}
            </span>
          </div>
          <div>
            <span className="opacity-75">PWA: </span>
            <span className="font-semibold">
              {deviceInfo.isPWA ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span className="opacity-75">Browser: </span>
            <span className="font-semibold">{deviceInfo.browserName}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="pb-16">
        {activeTab === 'dashboard' && <MobileDashboard />}
        {activeTab === 'reservations' && <MobileReservationsPage />}
      </div>

      {/* Demo Instructions (fixed at bottom) */}
      <div className="fixed bottom-20 left-4 right-4 z-30 pointer-events-none">
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg shadow-lg p-3 pointer-events-auto">
          <div className="flex items-start space-x-2">
            <svg
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1 text-xs">
              <p className="font-semibold mb-1">Try These Features:</p>
              <ul className="space-y-0.5 opacity-90">
                <li>• Pull down to refresh</li>
                <li>• Swipe cards left/right</li>
                <li>• Tap + button for actions</li>
                <li>• Long press for selection</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
