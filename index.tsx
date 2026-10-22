
import React from 'react';
import * as ReactDOM from 'react-dom/client';
// FIX: Use a default import for the App component.
// FIX: Changed to a named import to resolve the "no default export" error.
import { App } from './App';
import ErrorBoundary, { reloadOnce } from './components/ErrorBoundary';
import './index.css';

// FIX: Added service worker registration to enable PWA functionality.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
      registration.update();
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });

  // When an updated worker takes over, reload so an outdated page is replaced by the current
  // release. Limited to once a minute so it can never turn into a reload loop.
  navigator.serviceWorker.addEventListener('controllerchange', () => reloadOnce());
}

// A new release replaced the code files this page was using: reload once to get the new ones.
window.addEventListener('vite:preloadError', () => reloadOnce());

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary fullPage>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
