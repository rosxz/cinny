// This file is included in the web bundle but will only run when loaded on a native platform.
declare const window: any;

export async function initNativeBridge() {
  try {
    if (!window || !window.Capacitor) return;

    const isNative = window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    if (!isNative) return;

    // Dynamically require plugins to avoid bundling errors in web-only builds
    const plugins = window.Capacitor.Plugins || window.Capacitor;
    const PushNotifications = plugins.PushNotifications;
    const Keyboard = plugins.Keyboard;

    if (PushNotifications) {
      await PushNotifications.requestPermissions();
      await PushNotifications.register();

      PushNotifications.addListener('registration', (token: any) => {
        // Store token so service worker can request it via postMessage
        try {
          localStorage.setItem('cinny_push_token', token.value);
        } catch (e) {
          // ignore
        }
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'pushToken', token: token.value });
        }
      });

      PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
        console.log('Push received (native):', notification);
      });
    }

    if (Keyboard) {
      // Try to set resize mode to body to prevent webview from being pushed up
      if (Keyboard.setResizeMode) {
        try {
          Keyboard.setResizeMode({ mode: 'body' });
        } catch (e) {
          // ignore
        }
      }
    }
  } catch (e) {
    console.warn('Native bridge init failed', e);
  }
}
