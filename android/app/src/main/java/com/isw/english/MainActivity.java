package com.isw.english;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private NativeAudioBridge nativeAudioBridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getBridge().getWebView().post(() -> {
            WebView webView = getBridge().getWebView();
            nativeAudioBridge = new NativeAudioBridge(this, webView);
            webView.addJavascriptInterface(nativeAudioBridge, "NativeAudio");
        });
    }

    @Override
    public void onDestroy() {
        if (nativeAudioBridge != null) {
            nativeAudioBridge.release();
        }
        super.onDestroy();
    }
}
