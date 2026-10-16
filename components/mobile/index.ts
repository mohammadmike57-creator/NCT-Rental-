/**
 * NCT Rental - Mobile Components Index
 *
 * Centralized exports for all mobile components and utilities
 *
 * Usage:
 * import { MobileNavigation, MobileDashboard, hapticFeedback } from '@/components/mobile';
 */

// Navigation & Layout
export { default as MobileNavigation } from '../MobileNavigation';
export { default as MobileAppWrapper } from '../MobileAppWrapper';

// Data Display
export { default as MobileDashboard } from '../MobileDashboard';
export { default as MobileDataTable } from '../MobileDataTable';

// Forms
export {
  BottomSheet,
  MobileDatePicker,
  MobileAutocomplete,
  MobileFileUpload,
  SignaturePad,
  FormStepper,
  MobileInput,
  MobileTextarea,
} from '../MobileFormComponents';

// Pages
export { default as MobileReservationsPage } from '../MobileReservationsPage';

// PWA
export { default as PWAInstallPrompt } from '../PWAInstallPrompt';

// Utilities
export {
  // Device Detection
  getDeviceInfo,
  isMobileDevice,
  isIOSDevice,
  isAndroidDevice,
  isTabletDevice,
  isStandalonePWA,

  // Touch Handlers
  createTouchHandlers,

  // Viewport
  getViewportInfo,
  getSafeAreaInsets,
  hasNotch,
  getOrientation,
  onOrientationChange,

  // Haptic Feedback
  hapticFeedback,
  hapticSuccess,
  hapticError,
  hapticWarning,

  // Native Features
  capturePhoto,
  getCurrentLocation,
  shareContent,
  copyToClipboard,
  requestWakeLock,

  // Performance
  debounce,
  throttle,
  isInViewport,
  scrollToElement,

  // Connection
  isOnline,
  onConnectionChange,
  getConnectionInfo,

  // Storage
  getLocalStorage,
  setLocalStorage,
  removeLocalStorage,
} from '../../utils/mobileUtils';

// PWA Registration
export {
  registerServiceWorker,
  unregisterServiceWorker,
  updateServiceWorker,
  skipWaiting,
  cacheUrls,
  clearAllCaches,
  getCacheSize,
  formatCacheSize,
  isPWA,
  isServiceWorkerSupported,
  getServiceWorkerStatus,
} from '../../utils/pwaRegister';

// Type exports
export type {
  DeviceInfo,
  SwipeEvent,
  TouchHandlers,
  ViewportInfo,
  GeolocationPosition,
  ConnectionInfo,
  PWAConfig,
} from '../../utils/mobileUtils';
