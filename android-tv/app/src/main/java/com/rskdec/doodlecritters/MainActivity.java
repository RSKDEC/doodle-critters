package com.rskdec.doodlecritters;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.Locale;

/**
 * Full-screen TV screen for Doodle Critters. Kids play on phones; the leader's
 * phone starts the game, so the remote is only needed to open and close the app.
 */
public class MainActivity extends Activity {
    static final String GAME_URL = "https://doodle-critters.onrender.com/tv";
    // Bundled loading screen: shown while the free server wakes up, and on errors.
    static final String SPLASH = "file:///android_asset/splash.html";

    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady;

    /** WebView has no speech, so the game reads instructions aloud through Android's voice. */
    public class Voice {
        @JavascriptInterface
        public void speak(String text) {
            if (ttsReady) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "critters");
        }

        @JavascriptInterface
        public void stop() {
            if (ttsReady) tts.stop();
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) return;
            tts.setLanguage(Locale.US);
            tts.setPitch(1.25f);
            tts.setSpeechRate(0.95f);
            ttsReady = true;
        });

        web = new WebView(this);
        web.setBackgroundColor(0xFF8FD3FF);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // Let the game's sound effects and music start without a click.
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " DoodleCrittersTV/" + BuildConfig.VERSION_NAME);
        web.addJavascriptInterface(new Voice(), "AndroidTTS");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) view.loadUrl(splash(true));
            }
        });

        setContentView(web);
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(splash(false));
    }

    static String splash(boolean error) {
        return SPLASH + "?url=" + Uri.encode(GAME_URL) + (error ? "&error=1" : "");
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        if (ttsReady) tts.stop();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        tts.shutdown();
        super.onDestroy();
    }
}
