package no.gamingcoins.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Gaming Coins for Android: en fullskjerm-app som viser Gaming Coins-serveren i hjemmenettet.
 * Første gang finner appen serveren selv (eller du skriver inn adressen).
 */
public class MainActivity extends Activity {
    private static final int REQ_FILE = 41;
    private static final String SETUP = "file:///android_asset/setup.html";
    private static final int[] PORTS = {8012, 8080};

    private WebView web;
    private SharedPreferences prefs;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("gc", MODE_PRIVATE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#1A1FAE"));
        setContentView(web);
        fullscreen();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " GamingCoinsApp/" + BuildConfigVersion());
        web.addJavascriptInterface(new Bridge(), "GCNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) view.loadUrl(SETUP + "#offline");
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String server = prefs.getString("server", "");
                if ("file".equals(u.getScheme()) || (!server.isEmpty() && u.toString().startsWith(server))) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                openPicker(params != null && params.isCaptureEnabled());
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.deny(); // kamera brukes via bildevelgeren, ikke direkte
            }
        });

        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                int r = tts.setLanguage(new Locale("nb", "NO"));
                if (r < 0) r = tts.setLanguage(new Locale("no", "NO"));
                if (r < 0) tts.setLanguage(Locale.getDefault());
                tts.setPitch(1.2f);
                tts.setSpeechRate(0.95f);
                ttsReady = true;
            }
        });

        String server = prefs.getString("server", "");
        if (state != null) web.restoreState(state);
        else web.loadUrl(server.isEmpty() ? SETUP : server);
    }

    private String BuildConfigVersion() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "1"; }
    }

    private void fullscreen() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) fullscreen();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    protected void onPause() { web.onPause(); super.onPause(); }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        web.destroy();
        super.onDestroy();
    }

    /* ---------- bilder: kamera eller galleri ---------- */
    private void openPicker(boolean captureOnly) {
        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        cameraUri = null;
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Images.Media.DISPLAY_NAME, "gaming-coins-" + System.currentTimeMillis() + ".jpg");
                v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                v.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Gaming Coins");
                cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (cameraUri != null) camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            } catch (Exception ignored) { cameraUri = null; }
        }
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType("image/*");
        Intent launch;
        if (captureOnly) launch = camera;
        else {
            launch = Intent.createChooser(pick, "Velg bilde");
            launch.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
        }
        try { startActivityForResult(launch, REQ_FILE); }
        catch (ActivityNotFoundException e) {
            try { startActivityForResult(Intent.createChooser(pick, "Velg bilde"), REQ_FILE); }
            catch (Exception e2) { finishPick(null); }
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_FILE) return;
        Uri result = null;
        if (res == RESULT_OK) {
            if (data != null && data.getData() != null) result = data.getData();
            else if (cameraUri != null) result = cameraUri;
            else if (data != null && data.getExtras() != null && data.getExtras().get("data") instanceof Bitmap) {
                // eldre Android: kameraet gir bare et lite bilde tilbake
                try {
                    File f = new File(getCacheDir(), "face.jpg");
                    try (FileOutputStream o = new FileOutputStream(f)) { ((Bitmap) data.getExtras().get("data")).compress(Bitmap.CompressFormat.JPEG, 92, o); }
                    result = Uri.fromFile(f);
                } catch (Exception ignored) { }
            }
        } else if (cameraUri != null) {
            try { getContentResolver().delete(cameraUri, null, null); } catch (Exception ignored) { }
        }
        finishPick(result);
    }

    private void finishPick(Uri u) {
        if (fileCallback != null) fileCallback.onReceiveValue(u == null ? null : new Uri[]{u});
        fileCallback = null;
    }

    /* ---------- finne serveren ---------- */
    private static String hello(String base) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(base + "/api/hello").openConnection();
            c.setConnectTimeout(700);
            c.setReadTimeout(1200);
            if (c.getResponseCode() != 200) return null;
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) {
                String line; while ((line = r.readLine()) != null && sb.length() < 4000) sb.append(line);
            }
            JSONObject j = new JSONObject(sb.toString());
            return "gaming-coins".equals(j.optString("app")) ? sb.toString() : null;
        } catch (Exception e) {
            return null;
        } finally { if (c != null) c.disconnect(); }
    }

    private static String normalize(String raw) {
        String u = raw == null ? "" : raw.trim();
        if (u.isEmpty()) return "";
        if (!u.startsWith("http://") && !u.startsWith("https://")) u = "http://" + u;
        while (u.endsWith("/")) u = u.substring(0, u.length() - 1);
        Uri p = Uri.parse(u);
        if (p.getPort() == -1 && "http".equals(p.getScheme())) u = u + ":8012";
        return u;
    }

    private List<Inet4Address> localAddresses() {
        List<Inet4Address> out = new ArrayList<>();
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            for (Network n : cm.getAllNetworks()) {
                LinkProperties lp = cm.getLinkProperties(n);
                if (lp == null) continue;
                for (LinkAddress la : lp.getLinkAddresses()) {
                    InetAddress a = la.getAddress();
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) out.add((Inet4Address) a);
                }
            }
        } catch (Exception ignored) { }
        return out;
    }

    private void js(String code) {
        ui.post(() -> web.evaluateJavascript(code, null));
    }

    private class Bridge {
        @JavascriptInterface
        public boolean isApp() { return true; }

        @JavascriptInterface
        public String version() { return BuildConfigVersion(); }

        @JavascriptInterface
        public String getServer() { return prefs.getString("server", ""); }

        @JavascriptInterface
        public void speak(String text) {
            if (ttsReady && text != null) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "gc");
        }

        @JavascriptInterface
        public void stopSpeaking() { if (ttsReady) tts.stop(); }

        /** Tester adressen og kobler til hvis den svarer som en Gaming Coins-server. */
        @JavascriptInterface
        public void connect(String raw) {
            final String url = normalize(raw);
            new Thread(() -> {
                String ok = url.isEmpty() ? null : hello(url);
                if (ok != null) {
                    prefs.edit().putString("server", url).apply();
                    ui.post(() -> { web.clearHistory(); web.loadUrl(url); });
                } else {
                    js("window.onConnect && window.onConnect(false, " + JSONObject.quote(url) + ")");
                }
            }).start();
        }

        /** Søker gjennom hjemmenettet etter Gaming Coins-servere. */
        @JavascriptInterface
        public void scan() {
            new Thread(() -> {
                List<Inet4Address> mine = localAddresses();
                List<String> found = Collections.synchronizedList(new ArrayList<>());
                String saved = prefs.getString("server", "");
                if (!saved.isEmpty() && hello(saved) != null) found.add(saved);
                ExecutorService pool = Executors.newFixedThreadPool(48);
                for (Inet4Address a : mine) {
                    byte[] b = a.getAddress();
                    String prefix = (b[0] & 255) + "." + (b[1] & 255) + "." + (b[2] & 255) + ".";
                    for (int i = 1; i < 255; i++) {
                        for (int port : PORTS) {
                            final String base = "http://" + prefix + i + ":" + port;
                            pool.submit(() -> { if (hello(base) != null && !found.contains(base)) found.add(base); });
                        }
                    }
                }
                pool.shutdown();
                try { pool.awaitTermination(40, TimeUnit.SECONDS); } catch (InterruptedException ignored) { }
                JSONArray arr = new JSONArray();
                for (String f : found) arr.put(f);
                js("window.onScan && window.onScan(" + arr + ", " + mine.size() + ")");
            }).start();
        }

        /** Tilbake til oppsettet for å bytte server. */
        @JavascriptInterface
        public void changeServer() {
            ui.post(() -> new AlertDialog.Builder(MainActivity.this)
                    .setTitle("Bytte server?")
                    .setMessage("Du kan velge en annen Gaming Coins-server. Barna og coinsene ligger på serveren og påvirkes ikke.")
                    .setPositiveButton("Bytt server", (d, w) -> web.loadUrl(SETUP + "#change"))
                    .setNegativeButton("Avbryt", null)
                    .show());
        }

        @JavascriptInterface
        public void openSaved() {
            String s = prefs.getString("server", "");
            ui.post(() -> web.loadUrl(s.isEmpty() ? SETUP : s));
        }
    }
}
