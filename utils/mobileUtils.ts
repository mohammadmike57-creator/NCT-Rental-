/**
 * Mobile Utilities
 * Comprehensive utilities for mobile device detection, touch handling, and native features
 */

// ============================================================================
// Device Detection
// ============================================================================

export interface DeviceInfo {
  isIOS: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isPWA: boolean;
  browserName: string;
  osVersion: string;
  deviceModel: string;
}

export function getDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isAndroid = /Android/.test(ua);
  const isMobile = /Mobile/.test(ua) || isIOS || isAndroid;
  const isTablet = /iPad|Android(?!.*Mobile)/.test(ua);
  const isDesktop = !isMobile && !isTablet;
  const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone ||
    document.referrer.includes('android-app://');

  // Detect browser
  let browserName = 'Unknown';
  if (/Chrome/.test(ua) && !/Edge|Edg/.test(ua)) browserName = 'Chrome';
  else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browserName = 'Safari';
  else if (/Firefox/.test(ua)) browserName = 'Firefox';
  else if (/Edge|Edg/.test(ua)) browserName = 'Edge';

  // Extract OS version
  let osVersion = 'Unknown';
  if (isIOS) {
    const match = ua.match(/OS (\d+)_(\d+)_?(\d+)?/);
    if (match) osVersion = `${match[1]}.${match[2]}${match[3] ? `.${match[3]}` : ''}`;
  } else if (isAndroid) {
    const match = ua.match(/Android (\d+)\.?(\d+)?\.?(\d+)?/);
    if (match) osVersion = `${match[1]}${match[2] ? `.${match[2]}` : ''}`;
  }

  // Extract device model
  let deviceModel = 'Unknown';
  if (isIOS) {
    if (/iPhone/.test(ua)) deviceModel = 'iPhone';
    else if (/iPad/.test(ua)) deviceModel = 'iPad';
    else if (/iPod/.test(ua)) deviceModel = 'iPod';
  } else if (isAndroid) {
    const match = ua.match(/Android.*;\s([^)]+)\)/);
    if (match) deviceModel = match[1];
  }

  return {
    isIOS,
    isAndroid,
    isMobile,
    isTablet,
    isDesktop,
    isPWA,
    browserName,
    osVersion,
    deviceModel,
  };
}

export function isMobileDevice(): boolean {
  return getDeviceInfo().isMobile;
}

export function isIOSDevice(): boolean {
  return getDeviceInfo().isIOS;
}

export function isAndroidDevice(): boolean {
  return getDeviceInfo().isAndroid;
}

export function isTabletDevice(): boolean {
  return getDeviceInfo().isTablet;
}

export function isStandalonePWA(): boolean {
  return getDeviceInfo().isPWA;
}

// ============================================================================
// Touch Handlers
// ============================================================================

export interface SwipeEvent {
  direction: 'left' | 'right' | 'up' | 'down';
  distance: number;
  duration: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface TouchHandlers {
  onSwipe?: (event: SwipeEvent) => void;
  onLongPress?: (event: TouchEvent) => void;
  onDoubleTap?: (event: TouchEvent) => void;
  onPinch?: (scale: number) => void;
}

export function createTouchHandlers(handlers: TouchHandlers) {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let lastTapTime = 0;
  let longPressTimer: NodeJS.Timeout | null = null;
  let initialPinchDistance = 0;

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();

    // Long press detection
    if (handlers.onLongPress) {
      longPressTimer = setTimeout(() => {
        handlers.onLongPress?.(e);
        hapticFeedback(20);
      }, 500);
    }

    // Pinch detection
    if (e.touches.length === 2 && handlers.onPinch) {
      initialPinchDistance = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    // Cancel long press if moved
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    // Pinch gesture
    if (e.touches.length === 2 && handlers.onPinch && initialPinchDistance) {
      const currentDistance = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      const scale = currentDistance / initialPinchDistance;
      handlers.onPinch(scale);
    }
  };

  const handleTouchEnd = (e: TouchEvent) => {
    // Cancel long press
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const touchEndTime = Date.now();

    // Swipe detection
    if (handlers.onSwipe) {
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const duration = touchEndTime - touchStartTime;

      // Minimum swipe distance and maximum duration
      if (distance > 50 && duration < 500) {
        let direction: SwipeEvent['direction'];
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          direction = deltaX > 0 ? 'right' : 'left';
        } else {
          direction = deltaY > 0 ? 'down' : 'up';
        }

        handlers.onSwipe({
          direction,
          distance,
          duration,
          startX: touchStartX,
          startY: touchStartY,
          endX: touchEndX,
          endY: touchEndY,
        });

        hapticFeedback();
      }
    }

    // Double tap detection
    if (handlers.onDoubleTap) {
      const currentTime = Date.now();
      if (currentTime - lastTapTime < 300) {
        handlers.onDoubleTap(e);
        hapticFeedback();
        lastTapTime = 0;
      } else {
        lastTapTime = currentTime;
      }
    }

    // Reset pinch
    initialPinchDistance = 0;
  };

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}

// ============================================================================
// Viewport Utilities
// ============================================================================

export interface ViewportInfo {
  width: number;
  height: number;
  safeAreaInsets: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  hasNotch: boolean;
  orientation: 'portrait' | 'landscape';
}

export function getViewportInfo(): ViewportInfo {
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Get safe area insets (for notches)
  const safeAreaInsets = {
    top: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0'),
    right: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sar') || '0'),
    bottom: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0'),
    left: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sal') || '0'),
  };

  const hasNotch = safeAreaInsets.top > 20 || safeAreaInsets.bottom > 20;
  const orientation = width > height ? 'landscape' : 'portrait';

  return {
    width,
    height,
    safeAreaInsets,
    hasNotch,
    orientation,
  };
}

export function getSafeAreaInsets() {
  return getViewportInfo().safeAreaInsets;
}

export function hasNotch(): boolean {
  return getViewportInfo().hasNotch;
}

export function getOrientation(): 'portrait' | 'landscape' {
  return getViewportInfo().orientation;
}

export function onOrientationChange(callback: (orientation: 'portrait' | 'landscape') => void) {
  const handleOrientationChange = () => {
    callback(getOrientation());
  };

  window.addEventListener('resize', handleOrientationChange);
  window.addEventListener('orientationchange', handleOrientationChange);

  return () => {
    window.removeEventListener('resize', handleOrientationChange);
    window.removeEventListener('orientationchange', handleOrientationChange);
  };
}

// ============================================================================
// Haptic Feedback
// ============================================================================

export function hapticFeedback(duration: number = 10): void {
  if ('vibrate' in navigator) {
    navigator.vibrate(duration);
  }
}

export function hapticSuccess(): void {
  hapticFeedback([10, 50, 10]);
}

export function hapticError(): void {
  hapticFeedback([50, 100, 50]);
}

export function hapticWarning(): void {
  hapticFeedback([30, 50, 30]);
}

// ============================================================================
// Native Features
// ============================================================================

// Camera Access
export async function capturePhoto(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';

    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0] || null;
      resolve(file);
    };

    input.click();
  });
}

// GPS Location
export interface GeolocationPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  altitudeAccuracy?: number;
  heading?: number;
  speed?: number;
}

export async function getCurrentLocation(): Promise<GeolocationPosition | null> {
  if (!('geolocation' in navigator)) {
    console.error('Geolocation not supported');
    return null;
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude || undefined,
          altitudeAccuracy: position.coords.altitudeAccuracy || undefined,
          heading: position.coords.heading || undefined,
          speed: position.coords.speed || undefined,
        });
      },
      (error) => {
        console.error('Geolocation error:', error);
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}

// Native Sharing
export async function shareContent(data: {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
}): Promise<boolean> {
  if (!('share' in navigator)) {
    console.error('Web Share API not supported');
    return false;
  }

  try {
    await navigator.share(data);
    return true;
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      console.error('Share error:', error);
    }
    return false;
  }
}

// Copy to Clipboard
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if ('clipboard' in navigator) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    hapticSuccess();
    return true;
  } catch (error) {
    console.error('Copy error:', error);
    return false;
  }
}

// Wake Lock (prevent screen sleep)
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  if (!('wakeLock' in navigator)) {
    console.error('Wake Lock API not supported');
    return null;
  }

  try {
    const wakeLock = await (navigator as any).wakeLock.request('screen');
    console.log('Wake Lock activated');
    return wakeLock;
  } catch (error) {
    console.error('Wake Lock error:', error);
    return null;
  }
}

// ============================================================================
// Performance Utilities
// ============================================================================

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

// Throttle function
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Check if element is in viewport
export function isInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

// Smooth scroll to element
export function scrollToElement(element: HTMLElement, offset: number = 0): void {
  const top = element.getBoundingClientRect().top + window.pageYOffset - offset;
  window.scrollTo({
    top,
    behavior: 'smooth',
  });
}

// ============================================================================
// Connection Status
// ============================================================================

export function isOnline(): boolean {
  return navigator.onLine;
}

export function onConnectionChange(callback: (isOnline: boolean) => void) {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

export interface ConnectionInfo {
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';
  downlink: number;
  rtt: number;
  saveData: boolean;
}

export function getConnectionInfo(): ConnectionInfo | null {
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

  if (!connection) {
    return null;
  }

  return {
    effectiveType: connection.effectiveType || 'unknown',
    downlink: connection.downlink || 0,
    rtt: connection.rtt || 0,
    saveData: connection.saveData || false,
  };
}

// ============================================================================
// Local Storage Helpers
// ============================================================================

export function getLocalStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('LocalStorage get error:', error);
    return defaultValue;
  }
}

export function setLocalStorage<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('LocalStorage set error:', error);
    return false;
  }
}

export function removeLocalStorage(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error('LocalStorage remove error:', error);
    return false;
  }
}
