package app.cinny.mobile;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.webkit.WebResourceResponse;
import com.getcapacitor.BridgeActivity;

import java.io.InputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import android.util.Log;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);

		// Make the webview debuggable so we can use chrome://inspect
		WebView.setWebContentsDebuggingEnabled(true);

		// Ensure ServiceWorker fetches are handled by the WebView's ServiceWorkerController.
		// Some WebView implementations require a ServiceWorkerClient to be set so that
		// service worker network requests (shouldInterceptRequest) are routed correctly.
		// This is best-effort and guarded by API level.
		try {
			if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
				// Use reflection so this compiles against older SDKs that may not
				// have the ServiceWorker* types available at compile time.
				Class<?> swControllerClass = Class.forName("android.webkit.ServiceWorkerController");
				java.lang.reflect.Method getInstance = swControllerClass.getMethod("getInstance");
				Object swController = getInstance.invoke(null);

				Class<?> swClientClass = Class.forName("android.webkit.ServiceWorkerClient");

				Object proxy = java.lang.reflect.Proxy.newProxyInstance(
					swClientClass.getClassLoader(),
					new Class<?>[] { swClientClass },
					new java.lang.reflect.InvocationHandler() {
						@Override
						public Object invoke(Object proxy, java.lang.reflect.Method method, Object[] args) throws Throwable {
							// Intercept shouldInterceptRequest and proxy it via Java networking so
							// the WebView's ServiceWorkerController receives a proper WebResourceResponse.
							try {
								if ("shouldInterceptRequest".equals(method.getName()) && args != null && args.length > 0 && args[0] != null) {
									Object swRequest = args[0];
									// Reflectively call getUrl, getMethod, getRequestHeaders on ServiceWorkerRequest
									String reqUrl = (String) swRequest.getClass().getMethod("getUrl").invoke(swRequest);
									String reqMethod = "GET";
									try {
										Object m = swRequest.getClass().getMethod("getMethod").invoke(swRequest);
										if (m != null) reqMethod = (String) m;
									} catch (NoSuchMethodException ignored) {}

									Map<String, String> reqHeaders = null;
									try {
										Object rh = swRequest.getClass().getMethod("getRequestHeaders").invoke(swRequest);
										if (rh instanceof Map) reqHeaders = (Map<String, String>) rh;
									} catch (NoSuchMethodException ignored) {}
									if (reqHeaders == null) reqHeaders = new HashMap<>();

									HttpURLConnection conn = null;
									InputStream is = null;
									try {
										Log.d("SWProxy", "proxying SW request: " + reqUrl);
										URL url = new URL(reqUrl);
										conn = (HttpURLConnection) url.openConnection();
										conn.setInstanceFollowRedirects(true);
										conn.setRequestMethod(reqMethod);
										// Copy request headers
										for (Map.Entry<String, String> h : reqHeaders.entrySet()) {
											if (h.getKey() != null && h.getValue() != null) {
												conn.setRequestProperty(h.getKey(), h.getValue());
											}
										}
										conn.connect();
										int status = conn.getResponseCode();
										is = (status >= 400) ? conn.getErrorStream() : conn.getInputStream();
										if (is == null) is = new java.io.ByteArrayInputStream(new byte[0]);

										String contentType = conn.getContentType();
										String mimeType = null;
										String encoding = null;
										if (contentType != null) {
											String[] parts = contentType.split(";");
											if (parts.length > 0) mimeType = parts[0].trim();
											for (int i = 1; i < parts.length; i++) {
												String p = parts[i];
												int idx = p.indexOf("charset=");
												if (idx != -1) {
													encoding = p.substring(idx + 8).trim();
													break;
												}
											}
										}

										// Build response headers map (first value for each header)
										Map<String, String> respHeaders = new HashMap<>();
										try {
											Map<String, List<String>> hf = conn.getHeaderFields();
											if (hf != null) {
												for (Map.Entry<String, List<String>> e : hf.entrySet()) {
													String key = e.getKey();
													List<String> vals = e.getValue();
													if (key != null && vals != null && !vals.isEmpty()) {
														respHeaders.put(key, vals.get(0));
													}
												}
											}
										} catch (Exception ignored) {}

										// Ensure Service-Worker-Allowed exists (helps with scope issues)
										if (!respHeaders.containsKey("Service-Worker-Allowed")) {
											respHeaders.put("Service-Worker-Allowed", "/");
										}

										// Default mimeType when missing
										if (mimeType == null) {
											mimeType = "application/javascript";
										}
										if (encoding == null) {
											encoding = "UTF-8";
										}

										Log.d("SWProxy", "proxied response status=" + conn.getResponseCode() + " mime=" + mimeType);

										// Prefer the newer WebResourceResponse constructor with status when available
										try {
											int respStatus = conn.getResponseCode();
											String reason = conn.getResponseMessage();
											return new WebResourceResponse(mimeType, encoding, respStatus, reason, respHeaders, is);
										} catch (NoSuchMethodError e) {
											// Fallback to simpler constructor when the newer constructor isn't available
											return new WebResourceResponse(mimeType, encoding, is);
										}
									} catch (IOException ioe) {
										// network error while proxying: return null to fall back
										return null;
									}
								}
							} catch (Throwable t) {
								// Don't let any reflection or network exception crash the app; fallback
								return null;
							}
							return null;
						}
					}
				);

				java.lang.reflect.Method setClient = swControllerClass.getMethod("setServiceWorkerClient", swClientClass);
				setClient.invoke(swController, proxy);
			}
		} catch (Exception ignored) {
			// ignore; this is a best-effort compatibility enhancement
		}

		// Ensure the WebView resizes when the keyboard appears (helps chat input)
		getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

		// Accept cookies and third-party cookies where possible so media requests that rely
		// on cookies/credentials (if any) work inside the WebView.
		try {
			CookieManager cookieManager = CookieManager.getInstance();
			cookieManager.setAcceptCookie(true);

			// Try to find the WebView instance. Capacitor's internal API may vary between
			// versions; instead of calling internal getters we walk the view hierarchy and
			// pick the first android.webkit.WebView we find.
			View foundWebView = findWebView(getWindow().getDecorView());
			if (foundWebView instanceof WebView) {
				WebView webView = (WebView) foundWebView;
				// Accept third-party cookies on L+.
				if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
					cookieManager.setAcceptThirdPartyCookies(webView, true);
				}

				// Tune WebView settings to improve compatibility with the app being served
				// from the local Capacitor web server (http://localhost) and to allow the
				// service worker to fetch authenticated media or attach headers where needed.
				android.webkit.WebSettings ws = webView.getSettings();
				ws.setJavaScriptEnabled(true);
				ws.setDomStorageEnabled(true);
				ws.setAllowFileAccess(true);
				ws.setAllowContentAccess(true);
				// Allow universal access from file URLs (best-effort; helpful when assets
				// are loaded from file:// origins on some devices / setups).
				if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
					ws.setAllowUniversalAccessFromFileURLs(true);
				}
				// Allow mixed content in compatibility mode so HTTP resources don't get
				// blocked when the app origin is HTTPS (or vice-versa). Prefer fixing
				// servers to use HTTPS in production.
				if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
					ws.setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
				}
			}
		} catch (Exception ignored) {
			// Best-effort only; if APIs differ across Capacitor versions this will safely fail.
		}
	}

	private View findWebView(View root) {
		if (root == null) return null;
		if (root instanceof WebView) return root;
		if (!(root instanceof android.view.ViewGroup)) return null;
		android.view.ViewGroup vg = (android.view.ViewGroup) root;
		for (int i = 0; i < vg.getChildCount(); i++) {
			View child = vg.getChildAt(i);
			View result = findWebView(child);
			if (result != null) return result;
		}
		return null;
	}
}
