Cinny mobile wrapper (Android)
=================================

This folder contains a minimal Capacitor wrapper to package the Cinny web app as an Android app.

Quick steps
-----------

1. From the repo root build the web app:

   npm install
   npm run build

2. Prepare web assets for the wrapper and copy to Android project:

   cd cinny-mobile
   npm install
   npm run prepare:web
   npx cap add android
   npx cap copy android
   npx cap open android

3. Configure Firebase Cloud Messaging (FCM) if you want push notifications:
   - Create an Android app in Firebase and download `google-services.json`.
   - Put `google-services.json` into `cinny-mobile/android/app/`.
   - Follow Capacitor Push Notifications plugin docs to configure credentials.

Notes and integration
---------------------

- The web app's `dist` should be copied to `cinny-mobile/www` (see `prepare:web`).
- A small `native-bridge.js` file is provided to bridge the Capacitor PushNotifications token to the service worker used by the web app.
- To avoid keyboard overlay issues, we register the Capacitor Keyboard plugin and set resize mode to 'body' (see Android project settings in Android Studio: `windowSoftInputMode`).

Injecting the bridge into the web build
--------------------------------------

After you run the web build and `npm run prepare:web`, copy `native-bridge.js` into the `www/` directory so the built `index.html` can include it. A helper script is provided:

   node scripts/inject-native-bridge.js

Then open `cinny-mobile/www/index.html` and add this line inside the `<head>` or just before the closing `</body>` so it runs on native devices only (or conditionally check for Capacitor):

   <script src="/native-bridge.js"></script>

Android-specific notes
----------------------

- FCM: Place `google-services.json` into `cinny-mobile/android/app/` and follow Firebase docs.
- Keyboard: In AndroidManifest or in the activity, set `windowSoftInputMode="adjustResize"` and in Android Studio check the WebView/Keyboard plugin settings. Capacitor's Keyboard plugin provides APIs to tune behavior; we try to set a resize mode to 'body' from the bridge.

Automated injection from web build
---------------------------------

To keep the web repo changes minimal, I added a post-build step that automatically copies `cinny-mobile/native-bridge.js` into your `dist/` and injects a loader into `dist/index.html` whenever you run the normal web build:

   npm run build

This runs `vite build` and then `node ./scripts/postbuild-inject-bridge.js`. The injected loader ensures the bridge is only loaded on native (Capacitor) platforms.

About `google-services.json` (FCM)
---------------------------------

`google-services.json` is a configuration file provided by Firebase for Android apps. It contains your Firebase project ID, application ID, API key and other metadata that allow your Android app to connect to Firebase services such as Cloud Messaging (FCM).

How to obtain it:

1. Go to console.firebase.google.com and sign in with your Google account.
2. Create a new project or open an existing one.
3. In the project overview click the Android icon to register a new Android app.
4. Provide your Android package name (must match `appId` in `capacitor.config.json`, e.g. `app.cinny.mobile`) and optionally provide a nickname and the debug signing certificate SHA-1 if needed.
5. Download the generated `google-services.json` and place it in `cinny-mobile/android/app/`.

You will then need to sync the Android project in Android Studio so Gradle applies the Firebase plugin and the app can use FCM.



Limitations and next steps
--------------------------

- You must configure FCM (google-services.json) yourself; credentials aren't stored here.
- Consider using a remote URL in dev by changing `server.url` in `capacitor.config.json` or using `Capacitor.setServerBasePath()` during development.
