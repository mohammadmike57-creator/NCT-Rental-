'use client';

import React, { useState, useEffect } from 'react';
import { XMarkIcon, ArrowDownTrayIcon, ShareIcon } from '@heroicons/react/24/outline';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed or dismissed
    const isDismissed = localStorage.getItem('pwa-prompt-dismissed') === 'true';
    setDismissed(isDismissed);

    // Check if running in standalone mode
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone ||
      document.referrer.includes('android-app://');
    setIsStandalone(standalone);

    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(iOS);

    // Listen for install prompt (Android/Desktop)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      if (!isDismissed && !standalone) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Show iOS prompt after a delay if conditions are met
    if (iOS && !standalone && !isDismissed) {
      setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;

    // Show native install prompt
    await installPrompt.prompt();

    // Wait for user choice
    const { outcome } = await installPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('PWA installed');
    }

    setInstallPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDismissed(true);
    localStorage.setItem('pwa-prompt-dismissed', 'true');
  };

  // Don't show if already installed or dismissed
  if (isStandalone || !showPrompt) {
    return null;
  }

  // iOS Install Prompt
  if (isIOS) {
    return (
      <div className="fixed bottom-20 left-0 right-0 z-50 px-4 safe-area-bottom">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-slide-up">
          <div className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center">
                  <ArrowDownTrayIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    Install NCT Rental
                  </h3>
                  <p className="text-sm text-gray-600">Add to Home Screen</p>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-blue-50 rounded-lg p-3 mb-3">
              <p className="text-sm text-gray-700 mb-3">
                Install this app for a better experience with offline access and
                notifications.
              </p>

              <div className="space-y-2 text-sm">
                <div className="flex items-start space-x-2">
                  <span className="text-blue-600 font-semibold">1.</span>
                  <span className="text-gray-700">
                    Tap the{' '}
                    <ShareIcon className="w-4 h-4 inline text-blue-600" />{' '}
                    Share button below
                  </span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-blue-600 font-semibold">2.</span>
                  <span className="text-gray-700">
                    Scroll down and tap "Add to Home Screen"
                  </span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-blue-600 font-semibold">3.</span>
                  <span className="text-gray-700">Tap "Add" to confirm</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg active:bg-gray-200 transition-colors touch-manipulation"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Android/Desktop Install Prompt
  return (
    <div className="fixed bottom-20 left-0 right-0 z-50 px-4 safe-area-bottom">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-slide-up">
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center">
                <ArrowDownTrayIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Install NCT Rental
                </h3>
                <p className="text-sm text-gray-600">Get the full app experience</p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-4">
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start space-x-2">
                <svg
                  className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>Works offline - access anywhere</span>
              </li>
              <li className="flex items-start space-x-2">
                <svg
                  className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>Get instant notifications</span>
              </li>
              <li className="flex items-start space-x-2">
                <svg
                  className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>Faster performance</span>
              </li>
            </ul>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={handleDismiss}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg active:bg-gray-200 transition-colors touch-manipulation"
            >
              Not Now
            </button>
            <button
              onClick={handleInstall}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg active:from-blue-700 active:to-blue-800 transition-colors touch-manipulation flex items-center justify-center space-x-2"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
              <span>Install</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
