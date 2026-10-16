/**
 * PWA Service Worker Registration
 * Handles service worker registration, updates, and lifecycle
 */

export interface PWAConfig {
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  onOfflineReady?: () => void;
  onNeedRefresh?: () => void;
  enableNotifications?: boolean;
  enableBackgroundSync?: boolean;
}

/**
 * Register service worker
 */
export function registerServiceWorker(config: PWAConfig = {}): void {
  if (typeof window === 'undefined') {
    console.log('Service Worker: Not in browser environment');
    return;
  }

  if (!('serviceWorker' in navigator)) {
    console.log('Service Worker: Not supported');
    return;
  }

  window.addEventListener('load', () => {
    const swUrl = '/service-worker.js';

    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => {
        console.log('Service Worker: Registered', registration);

        // Check for updates
        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (installingWorker == null) {
            return;
          }

          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // New update available
                console.log('Service Worker: New content available');
                config.onUpdate?.(registration);
                config.onNeedRefresh?.();
              } else {
                // Content cached for offline use
                console.log('Service Worker: Content cached for offline');
                config.onOfflineReady?.();
              }
            }
          };
        };

        config.onSuccess?.(registration);

        // Request notification permission if enabled
        if (config.enableNotifications) {
          requestNotificationPermission(registration);
        }

        // Register background sync if enabled
        if (config.enableBackgroundSync) {
          registerBackgroundSync(registration);
        }
      })
      .catch((error) => {
        console.error('Service Worker: Registration failed', error);
      });

    // Listen for service worker messages
    navigator.serviceWorker.addEventListener('message', (event) => {
      console.log('Service Worker: Message received', event.data);
      handleServiceWorkerMessage(event.data);
    });
  });
}

/**
 * Unregister service worker
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.unregister();
    console.log('Service Worker: Unregistered');
    return true;
  } catch (error) {
    console.error('Service Worker: Unregister failed', error);
    return false;
  }
}

/**
 * Update service worker
 */
export async function updateServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
    console.log('Service Worker: Update check triggered');
  } catch (error) {
    console.error('Service Worker: Update failed', error);
  }
}

/**
 * Skip waiting and activate new service worker
 */
export function skipWaiting(): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker.ready.then((registration) => {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  });
}

/**
 * Request notification permission
 */
async function requestNotificationPermission(
  registration: ServiceWorkerRegistration
): Promise<void> {
  if (!('Notification' in window)) {
    console.log('Notifications: Not supported');
    return;
  }

  if (Notification.permission === 'granted') {
    console.log('Notifications: Already granted');
    subscribeToPushNotifications(registration);
    return;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.log('Notifications: Permission granted');
      subscribeToPushNotifications(registration);
    }
  }
}

/**
 * Subscribe to push notifications
 */
async function subscribeToPushNotifications(
  registration: ServiceWorkerRegistration
): Promise<void> {
  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
      ),
    });

    console.log('Push Notifications: Subscribed', subscription);

    // Send subscription to server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subscription),
    });
  } catch (error) {
    console.error('Push Notifications: Subscribe failed', error);
  }
}

/**
 * Register background sync
 */
async function registerBackgroundSync(
  registration: ServiceWorkerRegistration
): Promise<void> {
  if (!('sync' in registration)) {
    console.log('Background Sync: Not supported');
    return;
  }

  try {
    await (registration as any).sync.register('sync-reservations');
    console.log('Background Sync: Registered');
  } catch (error) {
    console.error('Background Sync: Registration failed', error);
  }
}

/**
 * Handle service worker messages
 */
function handleServiceWorkerMessage(data: any): void {
  switch (data.type) {
    case 'UPDATE_AVAILABLE':
      console.log('Service Worker: Update available');
      showUpdateNotification();
      break;

    case 'OFFLINE':
      console.log('Service Worker: Offline mode');
      showOfflineNotification();
      break;

    case 'ONLINE':
      console.log('Service Worker: Online mode');
      showOnlineNotification();
      break;

    case 'SYNC_COMPLETE':
      console.log('Service Worker: Sync complete');
      break;

    default:
      console.log('Service Worker: Unknown message type', data.type);
  }
}

/**
 * Show update notification
 */
function showUpdateNotification(): void {
  if (typeof window === 'undefined') return;

  // Create a custom event that components can listen to
  const event = new CustomEvent('pwa-update-available', {
    detail: {
      message: 'A new version is available. Refresh to update.',
      action: () => {
        skipWaiting();
        window.location.reload();
      },
    },
  });

  window.dispatchEvent(event);
}

/**
 * Show offline notification
 */
function showOfflineNotification(): void {
  if (typeof window === 'undefined') return;

  const event = new CustomEvent('pwa-offline', {
    detail: {
      message: 'You are offline. Some features may be limited.',
    },
  });

  window.dispatchEvent(event);
}

/**
 * Show online notification
 */
function showOnlineNotification(): void {
  if (typeof window === 'undefined') return;

  const event = new CustomEvent('pwa-online', {
    detail: {
      message: 'You are back online!',
    },
  });

  window.dispatchEvent(event);
}

/**
 * Helper function to convert VAPID key
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

/**
 * Cache specific URLs
 */
export async function cacheUrls(urls: string[]): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({
      type: 'CACHE_URLS',
      urls,
    });
    console.log('Service Worker: URLs cached', urls);
  } catch (error) {
    console.error('Service Worker: Cache URLs failed', error);
  }
}

/**
 * Clear all caches
 */
export async function clearAllCaches(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({
      type: 'CLEAR_CACHE',
    });
    console.log('Service Worker: All caches cleared');
  } catch (error) {
    console.error('Service Worker: Clear caches failed', error);
  }
}

/**
 * Get cache size
 */
export async function getCacheSize(): Promise<number> {
  if (!('caches' in window)) {
    return 0;
  }

  try {
    const cacheNames = await caches.keys();
    let totalSize = 0;

    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();

      for (const request of requests) {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          totalSize += blob.size;
        }
      }
    }

    return totalSize;
  } catch (error) {
    console.error('Service Worker: Get cache size failed', error);
    return 0;
  }
}

/**
 * Format cache size for display
 */
export function formatCacheSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Check if app is running as PWA
 */
export function isPWA(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone ||
    document.referrer.includes('android-app://')
  );
}

/**
 * Check if service worker is supported
 */
export function isServiceWorkerSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * Get service worker status
 */
export async function getServiceWorkerStatus(): Promise<{
  supported: boolean;
  registered: boolean;
  active: boolean;
  waiting: boolean;
}> {
  if (!isServiceWorkerSupported()) {
    return {
      supported: false,
      registered: false,
      active: false,
      waiting: false,
    };
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();

    return {
      supported: true,
      registered: !!registration,
      active: !!registration?.active,
      waiting: !!registration?.waiting,
    };
  } catch (error) {
    console.error('Service Worker: Get status failed', error);
    return {
      supported: true,
      registered: false,
      active: false,
      waiting: false,
    };
  }
}
