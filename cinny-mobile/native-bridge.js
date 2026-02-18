(function () {
  if (typeof window === 'undefined') return;

  // --- CONFIGURATION ---
  const SYGNAL_URL = "https://sygnal.moniz.pt/_matrix/push/v1/notify";
  const APP_ID = "app.cinny.mobile"; 
  const APP_NAME = "Cinny Mobile (Sygnal)";
  // ---------------------

  const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  let lastToken = null;
  let isPusherRegistered = false;

  async function init() {
    if (!isCapacitor) return;

    const { PushNotifications, Keyboard } = window.Capacitor.Plugins || window.Capacitor;

    try {
      // 1. Setup Keyboard logic
      if (Keyboard && Keyboard.setStyle) {
        try {
          if (Keyboard.setResizeMode) {
            Keyboard.setResizeMode({ mode: 'body' });
          }
        } catch (e) {
          console.warn('[NativeBridge] Failed to set keyboard resize mode', e);
        }
      }

      // 2. Push Notification Setup
      await PushNotifications.requestPermissions();
      await PushNotifications.register();

      PushNotifications.addListener('registration', (token) => {
        console.log('[NativeBridge] FCM Token received:', token.value);
        lastToken = token.value;

        // Notify Service Worker (Original logic)
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'pushToken', token: token.value });
        }

        // Start watching for Matrix session to register our custom pusher
        startSessionWatcher();
      });

      PushNotifications.addListener('pushNotificationReceived', async (notification) => {
        console.log('[NativeBridge] PN received in foreground:', notification);
      });

    } catch (e) {
      console.warn('[NativeBridge] Capacitor native bridge init failed', e);
    }
  }

  // 3. Matrix Session Watcher
  function startSessionWatcher() {
    const sessionInterval = setInterval(async () => {
      if (isPusherRegistered || !lastToken) return;

      // Direct lookup instead of looping
      const accessToken = localStorage.getItem("cinny_access_token");
      const homeserverUrl = localStorage.getItem("cinny_hs_base_url") || localStorage.getItem("mx_hs_url");

      console.log("Got access token?", !!accessToken, "Got homeserver URL?", !!homeserverUrl);
      if (accessToken && homeserverUrl) {
        console.log("[NativeBridge] Session found. Syncing pusher...");
        const success = await syncPusherWithHomeserver(homeserverUrl, accessToken, lastToken);
        if (success) {
          isPusherRegistered = true;
          clearInterval(sessionInterval); // Stop the timer forever
          console.log("[NativeBridge] Pusher active. Watcher stopped.");
        }
      }
    }, 5000); 
  }

  // 4. Pusher Sync Logic (Includes the "Already Exists" check)
  async function syncPusherWithHomeserver(hsUrl, token, pushKey) {
    // Standardize URL (ensure no trailing slash)
    const baseUrl = hsUrl.replace(/\/$/, "");

    try {
      // Step A: Check existing pushers to avoid duplicates
      const getResponse = await fetch(`${baseUrl}/_matrix/client/v3/pushers`, {
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (getResponse.ok) {
        const { pushers } = await getResponse.json();
        const existing = pushers.find(p => p.pushkey === pushKey && p.app_id === APP_ID);
        
        if (existing) {
          console.log("[NativeBridge] Pusher already registered on homeserver. All good!");
          return true;
        }
      }

      // Step B: Register the pusher if it doesn't exist
      console.log("[NativeBridge] Registering new pusher to Sygnal...");
      const setResponse = await fetch(`${baseUrl}/_matrix/client/v3/pushers/set`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          pushkey: pushKey,
          kind: "http",
          app_id: APP_ID,
          app_display_name: APP_NAME,
          device_display_name: "Android (Capacitor)",
          profile_tag: "mobile",
          lang: "en",
          data: {
            url: SYGNAL_URL,
            format: "event_id_only"
          }
        })
      });

      if (setResponse.ok) {
        console.log("[NativeBridge] ✅ Custom Sygnal pusher registered successfully.");
        return true;
      } else {
        console.error("[NativeBridge] ❌ Failed to register pusher:", await setResponse.text());
        return false;
      }
    } catch (err) {
      console.error("[NativeBridge] Error during pusher sync:", err);
      return false;
    }
  }

  // Initialize
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init);
  }

  // Service Worker listener (Original logic)
  navigator.serviceWorker?.addEventListener('message', (ev) => {
    const data = ev.data || {};
    if (data && data.type === 'requestPushToken' && lastToken) {
      navigator.serviceWorker.controller?.postMessage({ type: 'pushToken', token: lastToken });
    }
  });
})();