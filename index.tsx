
import React from 'react';
import * as ReactDOM from 'react-dom/client';
// FIX: Use a default import for the App component.
// FIX: Changed to a named import to resolve the "no default export" error.
import { App } from './App';
import './index.css';

// FIX: Added service worker registration to enable PWA functionality.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);