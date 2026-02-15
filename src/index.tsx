/* eslint-disable import/first */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { enableMapSet } from 'immer';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { configClass, varsClass } from 'folds';

enableMapSet();

import './index.css';

import { trimTrailingSlash } from './app/utils/common';
import App from './app/pages/App';

// import i18n (needs to be bundled ;))
import './app/i18n';
import { pushSessionToSW } from './sw-session';
import { getFallbackSession } from './app/state/sessions';

document.body.classList.add(configClass, varsClass);

// Register Service Worker
if ('serviceWorker' in navigator) {
  const swUrl = '/sw.js';
  navigator.serviceWorker.register(swUrl, { scope: '/' }).then(() => {
    const session = getFallbackSession();
    pushSessionToSW(session?.baseUrl, session?.accessToken);
  });

  // Pre-flight fetch check: attempt to fetch the SW script and log status + headers
  // This helps diagnose cases where the WebView cannot fetch the script (404, CORS, MIME, local server not running, etc.)
  (async () => {
    try {
      const resp = await fetch(swUrl, { cache: 'no-store', credentials: 'same-origin' });
      console.log('[SW] fetch check', swUrl, 'status=', resp.status, 'content-type=', resp.headers.get('content-type'));
      // Log all response headers (helps diagnose server misconfigurations)
      try {
        resp.headers.forEach((v, k) => {
          console.log(`[SW] header ${k}: ${v}`);
        });
      } catch (e) {
        console.log('[SW] unable to enumerate headers', e);
      }

      // Read a small preview of the body for debugging (avoid huge logs)
      if (resp.ok) {
        try {
          const txt = await resp.text();
          console.log('[SW] sw.js preview:', txt.slice(0, 512));
        } catch (e) {
          console.log('[SW] sw.js preview: <unable to read body>', e);
        }
      } else {
        console.warn('[SW] sw.js fetch returned non-ok', resp.status);
      }
    } catch (err) {
      console.error('[SW] fetch check failed', swUrl, err);
    }

    // Log runtime/environment details that can affect SW registration in WebView
    try {
      console.log('[SW] location.href=', location.href);
      console.log('[SW] location.origin=', location.origin);
      console.log('[SW] location.protocol=', location.protocol);
      console.log('[SW] navigator.userAgent=', navigator.userAgent);
      console.log('[SW] navigator.platform=', navigator.platform);
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        console.log('[SW] existing registrations:', regs.map((r) => r.scope));
      } catch (e) {
        console.log('[SW] unable to list existing registrations', e);
      }
    } catch (e) {
      console.log('[SW] error while logging runtime details', e);
    }

    // Attempt registration afterwards and log the full error if it fails
    try {
      const reg = await navigator.serviceWorker.register(swUrl);
      console.log('[SW] registered', swUrl, reg);
      if (navigator.serviceWorker.controller) {
        console.log('[SW] controller present');
      } else {
        console.log('[SW] no controller yet');
      }
    } catch (err: any) {
      console.error('[SW] registration failed', swUrl, err);
      try {
        // Try registering with an absolute URL (in case relative resolution fails in this WebView)
        const abs = new URL(swUrl, location.href).href;
        if (abs !== swUrl) {
          try {
            console.log('[SW] attempting register with absolute url', abs);
            const reg2 = await navigator.serviceWorker.register(abs);
            console.log('[SW] registered with absolute url', abs, reg2);
          } catch (err2) {
            console.error('[SW] registration with absolute url failed', abs, err2);
          }
        }
      } catch (inner) {
        console.log('[SW] absolute-url fallback failed', inner);
      }
    }
  })();

  navigator.serviceWorker.addEventListener('message', (event) => {
    try {
      console.log('[SW] message from SW:', event.data);
      if (event.data?.type === 'token' && event.data?.responseKey) {
        // Get the token for SW and echo it back (masked in logs)
        const token = localStorage.getItem('cinny_access_token') ?? undefined;
        try {
          console.log('[SW] replying with token present=', !!token);
        } catch (e) {
          // ignore logging errors
        }
        event.source!.postMessage({
          responseKey: event.data.responseKey,
          token,
        });
      }
    } catch (e) {
      console.error('[SW] message handler error', e);
    }
  });
}

// Conditionally initialize native bridge (Capacitor)
try {
  if ((window as any).Capacitor && (window as any).Capacitor.isNativePlatform && (window as any).Capacitor.isNativePlatform()) {
    // Import the native bridge to initialize PushNotifications & keyboard handling
    import('./native-bridge').then((m) => m.initNativeBridge()).catch(() => {});
  }
} catch (e) {
  // ignore
}

const mountApp = () => {
  const rootContainer = document.getElementById('root');

  if (rootContainer === null) {
    console.error('Root container element not found!');
    return;
  }

  const root = createRoot(rootContainer);
  root.render(<App />);
};

mountApp();
