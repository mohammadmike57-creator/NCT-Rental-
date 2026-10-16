# Mobile Development Guide - NCT Rental

Complete guide for developing and maintaining the mobile-responsive NCT Rental application.

## Table of Contents

1. [Overview](#overview)
2. [Mobile Architecture](#mobile-architecture)
3. [Components](#components)
4. [PWA Features](#pwa-features)
5. [Mobile Utilities](#mobile-utilities)
6. [Styling Guide](#styling-guide)
7. [Performance Optimization](#performance-optimization)
8. [Testing](#testing)
9. [Best Practices](#best-practices)

---

## Overview

NCT Rental is built with a mobile-first approach, providing a native app-like experience on iOS and Android devices. The application includes:

- **Progressive Web App (PWA)** capabilities
- **Offline-first** architecture
- **Touch-optimized** UI components
- **Native features** integration (camera, GPS, notifications)
- **60fps animations**
- **iOS and Android** specific styling

### Key Features

- 📱 Native app-like UI/UX
- 🔄 Pull-to-refresh
- ↔️ Swipe gestures
- 📳 Haptic feedback
- 🌐 Offline support
- 🔔 Push notifications
- 📷 Camera integration
- 📍 Geolocation
- 🚀 Fast performance (<2s load on 3G)

---

## Mobile Architecture

### File Structure

```
NCT-Rental/
├── components/
│   ├── MobileNavigation.tsx          # Bottom nav, drawer, top bar
│   ├── MobileDashboard.tsx           # Mobile dashboard
│   ├── MobileDataTable.tsx           # Mobile list/table view
│   ├── MobileFormComponents.tsx      # Form components
│   ├── MobileReservationsPage.tsx    # Example page
│   └── PWAInstallPrompt.tsx          # PWA install banner
├── utils/
│   ├── mobileUtils.ts                # Mobile utilities
│   └── pwaRegister.ts                # PWA registration
├── styles/
│   └── mobile.css                    # Mobile-specific styles
├── public/
│   ├── manifest.json                 # PWA manifest
│   ├── service-worker.js             # Service worker
│   └── offline.html                  # Offline page
└── tailwind.config.mobile.js         # Mobile Tailwind config
```

### Technology Stack

- **Next.js 14+** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first CSS
- **PWA** - Progressive Web App
- **Service Workers** - Offline support
- **Web APIs** - Native features

---

## Components

### MobileNavigation

Full navigation system with bottom nav, drawer menu, and top bar.

```tsx
import MobileNavigation from '@/components/MobileNavigation';

<MobileNavigation
  currentUser={{
    name: 'John Smith',
    email: 'john@example.com',
    role: 'Manager',
    avatar: '/avatar.jpg'
  }}
/>
```

**Features:**
- Bottom navigation (4 items)
- Slide-out drawer menu
- Search bar
- Notifications
- Profile menu

### MobileDashboard

Mobile-optimized dashboard with cards, stats, and quick actions.

```tsx
import MobileDashboard from '@/components/MobileDashboard';

<MobileDashboard />
```

**Features:**
- Horizontal scrolling KPI cards
- Pull-to-refresh
- Quick action buttons
- Recent activity feed
- FAB menu

### MobileDataTable

Touch-optimized data display with swipe actions.

```tsx
import MobileDataTable from '@/components/MobileDataTable';

<MobileDataTable
  data={reservations}
  columns={columns}
  primaryKey="id"
  onEdit={handleEdit}
  onDelete={handleDelete}
  onView={handleView}
  searchable
  filterable
  selectable
  pagination
/>
```

**Features:**
- Card-based list view
- Swipe left/right for actions
- Expandable rows
- Long press for selection
- Search & filter
- Pagination

### MobileFormComponents

Collection of mobile-optimized form components.

#### BottomSheet

```tsx
import { BottomSheet } from '@/components/MobileFormComponents';

<BottomSheet
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="New Reservation"
  height="auto" // or "half" or "full"
>
  {/* Form content */}
</BottomSheet>
```

#### MobileDatePicker

```tsx
import { MobileDatePicker } from '@/components/MobileFormComponents';

<MobileDatePicker
  label="Pickup Date"
  value={date}
  onChange={setDate}
  min="2024-01-01"
  required
/>
```

#### MobileAutocomplete

```tsx
import { MobileAutocomplete } from '@/components/MobileFormComponents';

<MobileAutocomplete
  label="Select Vehicle"
  options={vehicleOptions}
  value={selectedVehicle}
  onChange={setSelectedVehicle}
  required
/>
```

#### MobileFileUpload

```tsx
import { MobileFileUpload } from '@/components/MobileFormComponents';

<MobileFileUpload
  label="Upload Photos"
  accept="image/*"
  multiple
  onFileSelect={handleFiles}
  allowCamera
/>
```

#### SignaturePad

```tsx
import { SignaturePad } from '@/components/MobileFormComponents';

<SignaturePad
  label="Customer Signature"
  onSave={handleSignature}
  required
/>
```

#### FormStepper

```tsx
import { FormStepper } from '@/components/MobileFormComponents';

<FormStepper
  steps={[
    { id: 'step1', title: 'Customer Info', component: <Step1 /> },
    { id: 'step2', title: 'Vehicle Selection', component: <Step2 /> },
    { id: 'step3', title: 'Payment', component: <Step3 /> },
  ]}
  onComplete={handleComplete}
/>
```

---

## PWA Features

### Installation

The app automatically detects when it can be installed and shows a custom install prompt.

**Manual Installation:**

#### iOS
1. Open in Safari
2. Tap Share button
3. Tap "Add to Home Screen"
4. Tap "Add"

#### Android
1. Open in Chrome
2. Tap menu (3 dots)
3. Tap "Install app" or "Add to Home Screen"
4. Tap "Install"

### Service Worker

Service worker handles:
- **Offline caching** - Static assets and API responses
- **Background sync** - Queue actions when offline
- **Push notifications** - Real-time updates
- **Update management** - Automatic updates

```typescript
import { registerServiceWorker } from '@/utils/pwaRegister';

// Register on app start
registerServiceWorker({
  onSuccess: (registration) => {
    console.log('Service Worker registered');
  },
  onUpdate: (registration) => {
    console.log('Update available');
    // Show update notification
  },
  onOfflineReady: () => {
    console.log('App ready for offline use');
  },
  enableNotifications: true,
  enableBackgroundSync: true,
});
```

### Offline Support

The app works offline with cached data. When offline:
- ✅ View cached reservations
- ✅ Access fleet data
- ✅ Review customer info
- ✅ Create offline bookings (synced later)
- ❌ Real-time updates

### Push Notifications

```typescript
// Request permission
const permission = await Notification.requestPermission();

if (permission === 'granted') {
  // Subscribe to push notifications
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: VAPID_PUBLIC_KEY,
  });

  // Send subscription to server
  await fetch('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription),
  });
}
```

---

## Mobile Utilities

Complete set of mobile utilities in `/utils/mobileUtils.ts`.

### Device Detection

```typescript
import { getDeviceInfo, isMobileDevice, isIOSDevice } from '@/utils/mobileUtils';

// Get full device info
const device = getDeviceInfo();
console.log(device.isIOS, device.isAndroid, device.isPWA);

// Quick checks
if (isMobileDevice()) {
  // Mobile-specific code
}

if (isIOSDevice()) {
  // iOS-specific code
}
```

### Touch Handlers

```typescript
import { createTouchHandlers } from '@/utils/mobileUtils';

const handlers = createTouchHandlers({
  onSwipe: (event) => {
    console.log('Swiped:', event.direction);
  },
  onLongPress: (event) => {
    console.log('Long pressed');
  },
  onDoubleTap: (event) => {
    console.log('Double tapped');
  },
  onPinch: (scale) => {
    console.log('Pinch scale:', scale);
  },
});

<div {...handlers}>Swipeable content</div>
```

### Haptic Feedback

```typescript
import { hapticFeedback, hapticSuccess, hapticError } from '@/utils/mobileUtils';

// Basic vibration
hapticFeedback(); // 10ms

// Success pattern
hapticSuccess(); // [10, 50, 10]

// Error pattern
hapticError(); // [50, 100, 50]

// Custom duration
hapticFeedback(20);
```

### Native Features

#### Camera

```typescript
import { capturePhoto } from '@/utils/mobileUtils';

const photo = await capturePhoto();
if (photo) {
  // Upload or process photo
}
```

#### Geolocation

```typescript
import { getCurrentLocation } from '@/utils/mobileUtils';

const location = await getCurrentLocation();
if (location) {
  console.log(location.latitude, location.longitude);
}
```

#### Share

```typescript
import { shareContent } from '@/utils/mobileUtils';

const shared = await shareContent({
  title: 'NCT Rental',
  text: 'Check out this reservation',
  url: window.location.href,
});
```

#### Copy to Clipboard

```typescript
import { copyToClipboard } from '@/utils/mobileUtils';

const copied = await copyToClipboard('Reservation ID: RES-12345');
if (copied) {
  // Show success message
}
```

### Viewport Utilities

```typescript
import { getViewportInfo, getSafeAreaInsets, onOrientationChange } from '@/utils/mobileUtils';

// Get viewport info
const viewport = getViewportInfo();
console.log(viewport.width, viewport.height, viewport.orientation);

// Get safe area insets (for notches)
const insets = getSafeAreaInsets();
console.log(insets.top, insets.bottom);

// Listen for orientation changes
const cleanup = onOrientationChange((orientation) => {
  console.log('Orientation:', orientation);
});

// Cleanup on unmount
cleanup();
```

---

## Styling Guide

### Tailwind Mobile Classes

Custom mobile-first Tailwind classes in `tailwind.config.mobile.js`.

#### Safe Area Classes

```html
<div class="safe-area-top">Top padding for notch</div>
<div class="safe-area-bottom">Bottom padding for home indicator</div>
<div class="safe-area-inset">All sides padding</div>
```

#### Touch Classes

```html
<button class="touch-manipulation">Better touch response</button>
<div class="scrollbar-hide">Hide scrollbar</div>
<div class="gpu-accelerated">Smooth animations</div>
```

#### Platform-Specific Cards

```html
<div class="ios-card">iOS-style card</div>
<div class="android-card">Android-style card</div>
```

#### Custom Breakpoints

```css
/* Extra small phones */
@media (min-width: 375px) { /* xs */ }

/* Standard phones */
@media (min-width: 640px) { /* sm */ }

/* Tablets portrait */
@media (min-width: 768px) { /* md */ }

/* Tablets landscape */
@media (min-width: 1024px) { /* lg */ }
```

#### Orientation-Specific

```html
<div class="portrait:hidden">Hide in portrait</div>
<div class="landscape:hidden">Hide in landscape</div>
```

#### Touch vs Mouse

```html
<div class="touch:p-4 mouse:p-2">Different padding</div>
<button class="hover:bg-blue-700">Only hover on mouse devices</button>
```

### Mobile-First Responsive Design

Always design for mobile first, then enhance for larger screens:

```tsx
// ✅ Good - Mobile first
<div className="flex flex-col md:flex-row">
  <div className="w-full md:w-1/2">Content</div>
</div>

// ❌ Bad - Desktop first
<div className="flex flex-row md:flex-col">
  <div className="w-1/2 md:w-full">Content</div>
</div>
```

### Touch Target Sizing

All interactive elements must be at least 44x44px:

```tsx
// ✅ Good
<button className="min-w-touch min-h-touch p-3">
  Click me
</button>

// ❌ Bad
<button className="p-1">
  Too small
</button>
```

---

## Performance Optimization

### Code Splitting

```tsx
// Lazy load heavy components
import dynamic from 'next/dynamic';

const MobileDataTable = dynamic(() => import('@/components/MobileDataTable'), {
  loading: () => <SkeletonLoader />,
});
```

### Image Optimization

```tsx
import Image from 'next/image';

<Image
  src="/vehicle.jpg"
  alt="Vehicle"
  width={400}
  height={300}
  loading="lazy"
  placeholder="blur"
/>
```

### Virtual Scrolling

For long lists, use virtual scrolling:

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 100,
});
```

### Debounce Search

```typescript
import { debounce } from '@/utils/mobileUtils';

const debouncedSearch = debounce((query: string) => {
  performSearch(query);
}, 300);
```

### Loading States

Always show loading states:

```tsx
{isLoading ? (
  <div className="skeleton w-full h-20 rounded-lg" />
) : (
  <div>{content}</div>
)}
```

---

## Testing

### Mobile Testing Tools

1. **Chrome DevTools**
   - Device emulation
   - Network throttling
   - Touch simulation

2. **BrowserStack**
   - Real device testing
   - iOS and Android

3. **Lighthouse**
   - PWA audit
   - Performance metrics

### Test Checklist

#### Functionality
- [ ] Touch gestures work (tap, swipe, pinch)
- [ ] Forms are easy to fill
- [ ] Navigation is accessible
- [ ] Offline mode works
- [ ] PWA installs correctly

#### Performance
- [ ] First Contentful Paint < 1.8s
- [ ] Time to Interactive < 3.8s
- [ ] Smooth 60fps animations
- [ ] No layout shifts

#### Accessibility
- [ ] Touch targets ≥ 44x44px
- [ ] Sufficient color contrast
- [ ] Text is readable
- [ ] Focus management works
- [ ] Screen reader compatible

#### Cross-Browser
- [ ] Safari (iOS)
- [ ] Chrome (Android)
- [ ] Firefox Mobile
- [ ] Samsung Internet

---

## Best Practices

### Do's ✅

1. **Use mobile-first design**
   ```tsx
   <div className="flex flex-col md:flex-row">
   ```

2. **Add haptic feedback**
   ```tsx
   onClick={() => {
     hapticFeedback();
     handleAction();
   }}
   ```

3. **Optimize images**
   ```tsx
   <Image loading="lazy" />
   ```

4. **Handle offline state**
   ```tsx
   if (!navigator.onLine) {
     // Queue for sync
   }
   ```

5. **Use safe area insets**
   ```html
   <div class="safe-area-bottom">
   ```

### Don'ts ❌

1. **Don't use hover-only interactions**
   ```tsx
   // ❌ Bad
   <div className="hover:bg-blue-500">

   // ✅ Good
   <div className="active:bg-blue-500 md:hover:bg-blue-500">
   ```

2. **Don't use small touch targets**
   ```tsx
   // ❌ Bad
   <button className="p-1">

   // ✅ Good
   <button className="p-3 min-w-touch min-h-touch">
   ```

3. **Don't forget loading states**
   ```tsx
   // ❌ Bad
   {data.map(item => ...)}

   // ✅ Good
   {isLoading ? <Skeleton /> : data.map(item => ...)}
   ```

4. **Don't use desktop-only features**
   ```tsx
   // ❌ Bad - tooltips on mobile don't work well
   <Tooltip />

   // ✅ Good - use bottom sheets instead
   <BottomSheet />
   ```

5. **Don't ignore orientation changes**
   ```tsx
   // ✅ Good
   useEffect(() => {
     return onOrientationChange(handleOrientation);
   }, []);
   ```

---

## Deployment

### PWA Requirements

1. **HTTPS** - Required for service workers
2. **Manifest** - `/public/manifest.json`
3. **Service Worker** - `/public/service-worker.js`
4. **Icons** - Multiple sizes in `/public/icons/`
5. **Offline page** - `/public/offline.html`

### Environment Variables

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
```

### Build Command

```bash
npm run build
```

### PWA Testing

```bash
# Serve production build
npm run start

# Open in browser and test:
# 1. Lighthouse PWA audit
# 2. Install app
# 3. Test offline mode
# 4. Test push notifications
```

---

## Support

For issues or questions:
- Check [GitHub Issues](https://github.com/nct-rental/issues)
- Read [Next.js PWA Guide](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)
- Review [Web.dev PWA](https://web.dev/progressive-web-apps/)

---

**Last Updated:** 2024-01-15
**Version:** 1.0.0
