'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import MobileNavigation from './MobileNavigation';
import PWAInstallPrompt from './PWAInstallPrompt';
import { registerServiceWorker } from '../utils/pwaRegister';
import { onConnectionChange, getDeviceInfo } from '../utils/mobileUtils';

interface MobileAppWrapperProps {
  children: React.ReactNode;
  currentUser?: {
    name: string;
    email: string;
    avatar?: string;
    role: string;
  };
}

export default function MobileAppWrapper({ children, currentUser }: MobileAppWrapperProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [showOfflineNotification, setShowOfflineNotification] = useState(false);
  const [deviceInfo] = useState(() => getDeviceInfo());
  const pathname = usePathname();

  useEffect(() => {
    // Register service worker
    registerServiceWorker({
      onUpdate: () => {
        setShowUpdateNotification(true);
      },
      onOfflineReady: () => {
        console.log('App ready for offline use');
      },
      enableNotifications: true,
      enableBackgroundSync: true,
    });

    // Monitor connection status
    const cleanup = onConnectionChange((online) => {
      setIsOnline(online);
      if (!online) {
        setShowOfflineNotification(true);
        setTimeout(() => setShowOfflineNotification(false), 3000);
      }
    });

    // Listen for PWA events
    const handlePWAUpdate = () => setShowUpdateNotification(true);
    const handlePWAOffline = () => setShowOfflineNotification(true);

    window.addEventListener('pwa-update-available', handlePWAUpdate);
    window.addEventListener('pwa-offline', handlePWAOffline);

    // Set CSS variables for safe area insets
    const updateSafeAreaInsets = () => {
      const root = document.documentElement;
      root.style.setProperty('--sat', 'env(safe-area-inset-top)');
      root.style.setProperty('--sar', 'env(safe-area-inset-right)');
      root.style.setProperty('--sab', 'env(safe-area-inset-bottom)');
      root.style.setProperty('--sal', 'env(safe-area-inset-left)');
    };

    updateSafeAreaInsets();

    // Add device class to body
    document.body.classList.add(
      deviceInfo.isMobile ? 'is-mobile' : 'is-desktop',
      deviceInfo.isIOS ? 'is-ios' : deviceInfo.isAndroid ? 'is-android' : 'is-other',
      deviceInfo.isPWA ? 'is-pwa' : 'is-browser'
    );

    return () => {
      cleanup();
      window.removeEventListener('pwa-update-available', handlePWAUpdate);
      window.removeEventListener('pwa-offline', handlePWAOffline);
    };
  }, [deviceInfo]);

  const handleUpdateApp = () => {
    window.location.reload();
  };

  return (
    <div className="mobile-app-wrapper min-h-screen bg-gray-50">
      {/* Mobile Navigation */}
      {deviceInfo.isMobile && <MobileNavigation currentUser={currentUser} />}

      {/* Main Content */}
      <main className={`${deviceInfo.isMobile ? 'pt-14 pb-16' : ''}`}>
        {children}
      </main>

      {/* PWA Install Prompt */}
      {deviceInfo.isMobile && <PWAInstallPrompt />}

      {/* Update Notification */}
      {showUpdateNotification && (
        <div className="fixed top-20 left-4 right-4 z-50 animate-slide-down">
          <div className="bg-blue-600 text-white rounded-lg shadow-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-sm font-semibold mb-1">Update Available</h3>
                <p className="text-xs text-blue-100">
                  A new version is ready. Refresh to update.
                </p>
              </div>
              <button
                onClick={() => setShowUpdateNotification(false)}
                className="ml-3 p-1 text-white hover:bg-blue-700 rounded-lg transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <button
              onClick={handleUpdateApp}
              className="mt-3 w-full px-4 py-2 bg-white text-blue-600 text-sm font-medium rounded-lg active:bg-blue-50 transition-colors touch-manipulation"
            >
              Refresh Now
            </button>
          </div>
        </div>
      )}

      {/* Offline Notification */}
      {showOfflineNotification && (
        <div className="fixed top-20 left-4 right-4 z-50 animate-slide-down">
          <div className="bg-gray-900 text-white rounded-lg shadow-lg p-4 backdrop-blur-lg bg-opacity-90">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <svg
                  className="w-6 h-6 text-yellow-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold">You're Offline</h3>
                <p className="text-xs text-gray-300 mt-0.5">
                  Some features may be limited
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Online Status Indicator */}
      {!isOnline && (
        <div className="fixed bottom-20 left-4 right-4 z-40">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
              <p className="text-sm text-yellow-800 font-medium">
                Working in offline mode
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading Indicator for Route Changes */}
      <RouteChangeIndicator pathname={pathname} />
    </div>
  );
}

// Route change loading indicator
function RouteChangeIndicator({ pathname }: { pathname: string }) {
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    setIsChanging(true);
    const timer = setTimeout(() => setIsChanging(false), 300);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (!isChanging) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-blue-600 animate-pulse">
      <div className="h-full bg-blue-400 animate-slide-right" />
    </div>
  );
}
