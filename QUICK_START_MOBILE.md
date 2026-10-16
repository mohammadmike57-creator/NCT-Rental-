# Quick Start - Mobile System

Get your NCT Rental mobile system running in 5 minutes!

## 1. Installation (1 minute)

```bash
# Install dependencies (if not already done)
npm install

# Install additional PWA dependencies (optional)
npm install @tailwindcss/aspect-ratio @tailwindcss/forms @tailwindcss/line-clamp
```

## 2. Configuration (2 minutes)

### Update `tailwind.config.js`

Add or merge mobile configuration:

```javascript
// Either replace your config with tailwind.config.mobile.js
// OR add these essential parts:

module.exports = {
  theme: {
    extend: {
      screens: {
        'xs': '375px',
        'touch': { 'raw': '(pointer: coarse)' },
      },
    },
  },
};
```

### Update `app/layout.tsx`

Add mobile styles and metadata:

```tsx
import type { Metadata, Viewport } from 'next';
import '@/styles/mobile.css'; // Add this import

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'NCT Rental',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'NCT Rental',
  },
};
```

## 3. Wrap Your App (1 minute)

Update your main layout:

```tsx
import MobileAppWrapper from '@/components/MobileAppWrapper';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <MobileAppWrapper
          currentUser={{
            name: 'John Doe',
            email: 'john@example.com',
            role: 'Manager',
          }}
        >
          {children}
        </MobileAppWrapper>
      </body>
    </html>
  );
}
```

## 4. Test It! (1 minute)

```bash
# Start development server
npm run dev

# Open in browser
# Desktop: http://localhost:3000
# Mobile: http://YOUR_IP:3000
```

### Chrome DevTools Testing

1. Press `F12` to open DevTools
2. Press `Ctrl+Shift+M` (or `Cmd+Shift+M` on Mac)
3. Select "iPhone 14 Pro" or "Pixel 7"
4. Navigate to your app
5. Test mobile features!

## 5. Optional: Generate Icons

```bash
# Install PWA asset generator
npx pwa-asset-generator logo.png public/icons --background "#2563eb"
```

---

## Usage Examples

### Basic Page with Mobile Table

```tsx
'use client';

import { MobileDataTable } from '@/components/mobile';

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
    <MobileDataTable
      data={data}
      columns={columns}
      primaryKey="id"
      searchable
      pagination
    />
  );
}
```

### Mobile Form

```tsx
'use client';

import { useState } from 'react';
import { BottomSheet, MobileInput, hapticFeedback } from '@/components/mobile';

export default function MyForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');

  const handleSubmit = () => {
    hapticFeedback();
    console.log('Submit:', name);
    setIsOpen(false);
  };

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
          value={name}
          onChange={setName}
          required
        />

        <button
          onClick={handleSubmit}
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

import { hapticFeedback, getCurrentLocation, shareContent } from '@/components/mobile';

export default function MyComponent() {
  const handleClick = async () => {
    // Haptic feedback
    hapticFeedback();

    // Get location
    const location = await getCurrentLocation();
    if (location) {
      console.log(location.latitude, location.longitude);
    }

    // Share content
    await shareContent({
      title: 'NCT Rental',
      text: 'Check this out!',
      url: window.location.href,
    });
  };

  return (
    <button onClick={handleClick}>
      Click Me
    </button>
  );
}
```

---

## Test Checklist

Quick tests to verify everything works:

### Mobile UI
- [ ] Bottom navigation appears on mobile
- [ ] Drawer menu opens/closes smoothly
- [ ] Touch targets are large enough (44×44px)
- [ ] Animations are smooth (60fps)
- [ ] Safe area (notch) is handled

### Interactions
- [ ] Tap/click works
- [ ] Swipe gestures work
- [ ] Pull-to-refresh works
- [ ] Long-press selection works
- [ ] Haptic feedback works

### PWA
- [ ] Install prompt appears
- [ ] App installs correctly
- [ ] Works offline
- [ ] Updates automatically
- [ ] Lighthouse score > 90

### Forms
- [ ] Bottom sheets open/close
- [ ] Date picker works
- [ ] Autocomplete searches
- [ ] File upload accesses camera
- [ ] Form validation works

---

## Common Issues & Solutions

### Issue: Components not found

**Solution:**
```bash
# Check file paths in import
import MobileNavigation from '@/components/MobileNavigation';
# or use the index
import { MobileNavigation } from '@/components/mobile';
```

### Issue: Styles not applying

**Solution:**
```tsx
// Make sure mobile.css is imported
// In app/layout.tsx or app/globals.css
import '@/styles/mobile.css';
```

### Issue: Touch events not working

**Solution:**
```tsx
// Add touch-manipulation class
<button className="touch-manipulation">
  Click me
</button>
```

### Issue: PWA not installing

**Solution:**
1. Must use HTTPS (or localhost)
2. Verify manifest.json exists
3. Check service-worker.js path
4. Clear browser cache

---

## Next Steps

1. **Customize Components**
   - Update colors in tailwind.config.js
   - Modify navigation items
   - Add your branding

2. **Add Your Data**
   - Connect to your API
   - Update data models
   - Implement CRUD operations

3. **Test on Real Devices**
   - iOS Safari
   - Android Chrome
   - Install as PWA

4. **Deploy**
   - Build production version
   - Test PWA on live site
   - Monitor performance

---

## Resources

- 📖 [Full Documentation](./MOBILE_DEVELOPMENT.md)
- 📖 [Setup Guide](./MOBILE_SETUP.md)
- 📖 [System Overview](./MOBILE_SYSTEM_OVERVIEW.md)
- 🎮 [Demo Page](/mobile-demo)

---

## Support

Need help?
- Check documentation files
- Review component source code
- Test with mobile-demo page
- Use Chrome DevTools for debugging

---

**You're ready to go!** 🚀

Start building amazing mobile experiences with NCT Rental!
