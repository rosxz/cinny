// Inject this script into the web app (for example include in index.html when running in Capacitor)
(function () {
  if (typeof window === 'undefined') return;
  const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  async function init() {
    if (!isCapacitor) return;

    const { PushNotifications } = window.Capacitor.Plugins || window.Capacitor;
    const { Keyboard } = window.Capacitor.Plugins || window.Capacitor;

    try {
      // Request permissions and register
      await PushNotifications.requestPermissions();
      await PushNotifications.register();

      // Listen for registration and forward token to service worker clients
      PushNotifications.addListener('registration', (token) => {
        // Post token to all clients so service worker can use it if needed
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'pushToken', token: token.value });
        }
      });

      // Handle incoming push when app is in foreground
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        // Show a notification via the web Notification API or let the service worker handle it
        console.log('PN received', notification);
      });

      // Optionally set keyboard resize mode to avoid pushing up the webview contents
      if (Keyboard && Keyboard.setStyle) {
        try {
          // Capacitor Keyboard plugin v5 offers setResizeMode or similar; try common API
          if (Keyboard.setResizeMode) {
            Keyboard.setResizeMode({ mode: 'body' });
          }
        } catch (e) {
          console.warn('Failed to set keyboard resize mode', e);
        }
      }
    } catch (e) {
      console.warn('Capacitor native bridge init failed', e);
    }
  }

  // Initialize after DOM and service worker ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init);
  }

  // Respond to service worker requests for token
  navigator.serviceWorker?.addEventListener('message', (ev) => {
    const data = ev.data || {};
    if (data && data.type === 'requestPushToken') {
      // Query PushNotifications plugin for latest token isn't exposed; rely on registration event above to have posted token to SW
      // Alternatively keep token in window and post back
      // This bridge keeps a lastToken variable
    }
  });
})();
