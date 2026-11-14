
import React from 'react';
import * as ReactDOM from 'react-dom/client';
// FIX: Use a default import for the App component.
// FIX: Changed to a named import to resolve the "no default export" error.
import { App } from './App';
import { adoptSupportLink } from './services/session';
import ErrorBoundary, { reloadOnce } from './components/ErrorBoundary';
import './index.css';

// FIX: Added service worker registration to enable PWA functionality.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      registration.update();
    }).catch(registrationError => {
      console.warn('Offline support is not available:', registrationError);
    });
  });

  // When an updated worker takes over, reload so an outdated page is replaced by the current
  // release. Limited to once a minute so it can never turn into a reload loop. Not on the very first
  // visit: there the page is already current, and a reload would clear what the person is typing.
  const hadWorker = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadWorker) reloadOnce(); });
}

// A new release replaced the code files this page was using: reload once to get the new ones.
window.addEventListener('vite:preloadError', () => reloadOnce());

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// The platform admin portal (/admin…) and the set-password page are separate from the workspace.
const AdminPortal = React.lazy(() => import('./components/platform/AdminPortal'));
const SetPasswordPage = React.lazy(() => import('./components/platform/SetPasswordPage'));
const path = window.location.pathname;
adoptSupportLink();   // a support view opened from the admin portal: this tab only

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary fullPage>
      {path === '/admin' || path.startsWith('/admin/')
        ? <React.Suspense fallback={null}><AdminPortal /></React.Suspense>
        : path === '/set-password'
          ? <React.Suspense fallback={null}><SetPasswordPage /></React.Suspense>
          : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
