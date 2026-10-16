# Mobile Setup Guide - NCT Rental

Complete setup guide for the mobile-responsive NCT Rental application.

## Quick Start

### 1. Install Dependencies

```bash
npm install
# or
yarn install
```

### 2. Update Tailwind Config

Replace or merge your `tailwind.config.js` with `tailwind.config.mobile.js`:

```bash
# Backup existing config
cp tailwind.config.js tailwind.config.backup.js

# Use mobile config
cp tailwind.config.mobile.js tailwind.config.js
```

Or manually merge the mobile-first breakpoints and utilities.

### 3. Import Mobile Styles

Add mobile styles to your global CSS (`app/globals.css` or `styles/globals.css`):

```css
/* Import mobile styles */
@import './mobile.css';

/* Or copy the mobile.css content here */
```

### 4. Setup PWA

#### Update `next.config.js`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable static exports for better PWA support
  output: 'standalone',

  // Add PWA headers
  async headers() {
    return [
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
        ],
      },
      {
        source: '/service-worker.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

#### Update `app/layout.tsx`

```tsx
import type { Metadata, Viewport } from 'next';
import MobileAppWrapper from '@/components/MobileAppWrapper';
import '@/styles/globals.css';
import '@/styles/mobile.css';

export const metadata: Metadata = {
  title: 'NCT Rental - Professional Fleet Management',
  description: 'Professional car rental management system',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'NCT Rental',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'NCT Rental',
    title: 'NCT Rental - Professional Fleet Management',
    description: 'Professional car rental management system',
  },
  twitter: {
    card: 'summary',
    title: 'NCT Rental',
    description: 'Professional car rental management system',
  },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get current user from your auth system
  const currentUser = {
    name: 'John Smith',
    email: 'john@example.com',
    role: 'Manager',
    avatar: '/avatar.jpg',
  };

  return (
    <html lang="en">
      <head>
        {/* PWA Icons */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-192x192.png" />

        {/* iOS Splash Screens */}
        <link
          rel="apple-touch-startup-image"
          href="/splash/iPhone_15_Pro_Max_portrait.png"
          media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/iPhone_15_Pro_portrait.png"
          media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />

        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
      </head>
      <body className="antialiased">
        <MobileAppWrapper currentUser={currentUser}>
          {children}
        </MobileAppWrapper>
      </body>
    </html>
  );
}
```

### 5. Generate App Icons

You need icons in multiple sizes. Use a tool like [PWA Asset Generator](https://github.com/elegantapp/pwa-asset-generator):

```bash
npx pwa-asset-generator logo.png public/icons --background "#2563eb" --index public/manifest.json
```

Required icon sizes:
- 72x72
- 96x96
- 128x128
- 144x144
- 152x152
- 192x192
- 384x384
- 512x512

### 6. Register Service Worker

Add to your main app component or layout:

```tsx
'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/utils/pwaRegister';

export default function App() {
  useEffect(() => {
    registerServiceWorker({
      onSuccess: (registration) => {
        console.log('SW registered:', registration);
      },
      onUpdate: (registration) => {
        console.log('SW updated:', registration);
        // Show update notification
      },
      enableNotifications: true,
      enableBackgroundSync: true,
    });
  }, []);

  return (
    // Your app
  );
}
```

---

## Project Structure

After setup, your project should have:

```
NCT-Rental/
├── app/
│   ├── layout.tsx                    # Updated with PWA metadata
│   ├── page.tsx                      # Homepage
│   └── globals.css                   # Global styles
├── components/
│   ├── MobileNavigation.tsx          # ✅ Mobile navigation
│   ├── MobileDashboard.tsx           # ✅ Mobile dashboard
│   ├── MobileDataTable.tsx           # ✅ Mobile data table
│   ├── MobileFormComponents.tsx      # ✅ Form components
│   ├── MobileReservationsPage.tsx    # ✅ Example page
│   ├── MobileAppWrapper.tsx          # ✅ App wrapper
│   └── PWAInstallPrompt.tsx          # ✅ PWA install prompt
├── utils/
│   ├── mobileUtils.ts                # ✅ Mobile utilities
│   └── pwaRegister.ts                # ✅ PWA registration
├── styles/
│   ├── globals.css                   # Global styles
│   └── mobile.css                    # ✅ Mobile styles
├── public/
│   ├── manifest.json                 # ✅ PWA manifest
│   ├── service-worker.js             # ✅ Service worker
│   ├── offline.html                  # ✅ Offline page
│   └── icons/                        # ✅ App icons
│       ├── icon-72x72.png
│       ├── icon-192x192.png
│       └── icon-512x512.png
├── tailwind.config.js                # Updated with mobile config
├── next.config.js                    # Updated for PWA
└── MOBILE_DEVELOPMENT.md             # ✅ Documentation
```

---

## Usage Examples

### Basic Mobile Page

```tsx
'use client';

import MobileDataTable from '@/components/MobileDataTable';

export default function MyPage() {
  const data = [
    { id: 1, name: 'Item 1', status: 'active' },
    { id: 2, name: 'Item 2', status: 'pending' },
  ];

  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'status', label: 'Status' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <MobileDataTable
        data={data}
        columns={columns}
        primaryKey="id"
        searchable
        pagination
      />
    </div>
  );
}
```

### Mobile Form with Bottom Sheet

```tsx
'use client';

import { useState } from 'react';
import { BottomSheet, MobileInput, MobileDatePicker } from '@/components/MobileFormComponents';

export default function MyForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    date: '',
  });

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Open Form
      </button>

      <BottomSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="New Entry"
      >
        <MobileInput
          label="Name"
          value={formData.name}
          onChange={(value) => setFormData({ ...formData, name: value })}
          required
        />

        <MobileDatePicker
          label="Date"
          value={formData.date}
          onChange={(value) => setFormData({ ...formData, date: value })}
          required
        />

        <button
          onClick={() => {
            console.log('Submit:', formData);
            setIsOpen(false);
          }}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg"
        >
          Submit
        </button>
      </BottomSheet>
    </>
  );
}
```

### Using Mobile Utilities

```tsx
'use client';

import { useEffect } from 'react';
import { getDeviceInfo, hapticFeedback, getCurrentLocation } from '@/utils/mobileUtils';

export default function MyComponent() {
  useEffect(() => {
    const device = getDeviceInfo();
    console.log('Device:', device);
  }, []);

  const handleClick = async () => {
    hapticFeedback();

    const location = await getCurrentLocation();
    if (location) {
      console.log('Location:', location);
    }
  };

  return (
    <button onClick={handleClick}>
      Click me
    </button>
  );
}
```

---

## Testing

### Local Testing

1. **Start development server:**
   ```bash
   npm run dev
   ```

2. **Open in browser:**
   - Desktop: `http://localhost:3000`
   - Mobile (same network): `http://YOUR_IP:3000`

3. **Test PWA:**
   ```bash
   npm run build
   npm run start
   ```

### Chrome DevTools Testing

1. Open Chrome DevTools (F12)
2. Click "Toggle device toolbar" (Ctrl+Shift+M)
3. Select device (iPhone, Pixel, etc.)
4. Test features:
   - Responsive layout
   - Touch interactions
   - PWA installation
   - Offline mode
   - Service worker

### Real Device Testing

#### iOS (Safari)
1. Connect iPhone via USB
2. Enable Web Inspector (Settings > Safari > Advanced)
3. Open Safari on Mac > Develop > [Your iPhone]
4. Navigate to your site

#### Android (Chrome)
1. Connect Android via USB
2. Enable USB debugging
3. Open Chrome on PC > `chrome://inspect`
4. Navigate to your site

### PWA Audit

1. Open Chrome DevTools
2. Go to "Lighthouse" tab
3. Select "Progressive Web App"
4. Click "Generate report"
5. Fix any issues

---

## Environment Variables

Create `.env.local`:

```env
# PWA Push Notifications (optional)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key

# API Base URL
NEXT_PUBLIC_API_URL=https://api.nctrental.com

# App URL
NEXT_PUBLIC_APP_URL=https://nctrental.com
```

Generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

---

## Deployment

### Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production deployment
vercel --prod
```

### Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy

# Production deployment
netlify deploy --prod
```

### Custom Server

1. Build the app:
   ```bash
   npm run build
   ```

2. Copy files to server:
   - `.next` directory
   - `public` directory
   - `package.json`
   - `next.config.js`

3. Install dependencies and start:
   ```bash
   npm install --production
   npm start
   ```

---

## Troubleshooting

### Service Worker Not Registering

**Issue:** Service worker fails to register

**Solution:**
1. Check HTTPS (required for SW)
2. Verify file path: `/public/service-worker.js`
3. Check browser console for errors
4. Clear browser cache and reload

### PWA Not Installing

**Issue:** Install prompt doesn't show

**Solution:**
1. Verify manifest.json is valid
2. Check all required icons exist
3. Ensure HTTPS
4. Test with Lighthouse PWA audit
5. Clear cache and hard reload

### Touch Events Not Working

**Issue:** Swipe/tap doesn't work

**Solution:**
1. Add `touch-action: manipulation` CSS
2. Use `onTouchStart/Move/End` instead of mouse events
3. Check for `preventDefault()` blocking events
4. Add `-webkit-tap-highlight-color: transparent`

### Layout Issues on iPhone

**Issue:** Content hidden by notch or home indicator

**Solution:**
1. Use safe area classes: `safe-area-top`, `safe-area-bottom`
2. Add `viewport-fit=cover` to viewport meta
3. Test on real device or simulator

### Offline Mode Not Working

**Issue:** App doesn't work offline

**Solution:**
1. Verify service worker is registered
2. Check cache strategy in service-worker.js
3. Test in DevTools offline mode
4. Check Network tab for failed requests

---

## Performance Tips

### 1. Code Splitting

```tsx
import dynamic from 'next/dynamic';

const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <div>Loading...</div>,
});
```

### 2. Image Optimization

```tsx
import Image from 'next/image';

<Image
  src="/image.jpg"
  width={400}
  height={300}
  loading="lazy"
  quality={75}
/>
```

### 3. Font Optimization

```tsx
// app/layout.tsx
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

<body className={inter.className}>
```

### 4. Reduce JavaScript

- Remove unused dependencies
- Use tree shaking
- Minimize client-side code
- Use server components where possible

### 5. Cache Static Assets

```javascript
// next.config.js
{
  headers: [
    {
      source: '/icons/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
  ],
}
```

---

## Updates & Maintenance

### Updating Service Worker

1. Edit `/public/service-worker.js`
2. Update cache version:
   ```javascript
   const CACHE_NAME = 'nct-rental-v2'; // Increment version
   ```
3. Deploy changes
4. Users will be prompted to update

### Adding New Features

1. Create mobile component
2. Add to mobile utilities if needed
3. Update documentation
4. Test on real devices
5. Deploy

### Monitoring

Track PWA metrics:
- Install rate
- Offline usage
- Load performance
- Error rates

Use tools:
- Google Analytics
- Sentry (error tracking)
- Web Vitals

---

## Support

Need help?

- 📖 Read [MOBILE_DEVELOPMENT.md](./MOBILE_DEVELOPMENT.md)
- 🐛 Check [GitHub Issues](https://github.com/nct-rental/issues)
- 💬 Join our Discord community
- 📧 Email: support@nctrental.com

---

**Setup Complete!** 🎉

Your NCT Rental app is now mobile-ready with PWA support!
