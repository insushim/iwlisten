package com.isw.english;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import java.io.IOException;

public class NativeAudioBridge {
    private static final String TAG = "NativeAudioBridge";
    private final Context context;
    private final WebView webView;
    private final Handler mainHandler;
    private MediaPlayer mediaPlayer;
    private boolean isReady = false;
    private boolean isPaused = false;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;

    public NativeAudioBridge(Context context, WebView webView) {
        this.context = context;
        this.webView = webView;
        this.mainHandler = new Handler(Looper.getMainLooper());
        this.audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attrs)
                    .setOnAudioFocusChangeListener(focusChange -> {
                        if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
                            pause();
                        }
                    })
                    .build();
        }

        isReady = true;
        Log.d(TAG, "NativeAudioBridge initialized");
    }

    @JavascriptInterface
    public boolean isReady() {
        return isReady;
    }

    @JavascriptInterface
    public void play(String assetPath) {
        mainHandler.post(() -> {
            try {
                Log.d(TAG, "play: " + assetPath);

                if (mediaPlayer != null) {
                    try {
                        mediaPlayer.stop();
                        mediaPlayer.release();
                    } catch (Exception e) {
                        Log.e(TAG, "Error releasing previous player", e);
                    }
                    mediaPlayer = null;
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
                    audioManager.requestAudioFocus(focusRequest);
                }

                mediaPlayer = new MediaPlayer();
                mediaPlayer.setWakeMode(context, PowerManager.PARTIAL_WAKE_LOCK);

                AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build();
                mediaPlayer.setAudioAttributes(attrs);

                AssetFileDescriptor afd = context.getAssets().openFd(assetPath);
                mediaPlayer.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
                afd.close();

                mediaPlayer.setOnCompletionListener(mp -> {
                    Log.d(TAG, "Playback complete");
                    mainHandler.post(() -> {
                        webView.evaluateJavascript(
                            "if(window.onNativeAudioComplete) window.onNativeAudioComplete();",
                            null
                        );
                    });
                });

                mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                    Log.e(TAG, "MediaPlayer error: " + what + ", " + extra);
                    return false;
                });

                isPaused = false;
                mediaPlayer.prepare();
                mediaPlayer.start();
                Log.d(TAG, "Playing: " + assetPath);

            } catch (IOException e) {
                Log.e(TAG, "Failed to play: " + assetPath, e);
            }
        });
    }

    @JavascriptInterface
    public void pause() {
        mainHandler.post(() -> {
            if (mediaPlayer != null && mediaPlayer.isPlaying()) {
                mediaPlayer.pause();
                isPaused = true;
            }
        });
    }

    @JavascriptInterface
    public void resume() {
        mainHandler.post(() -> {
            if (mediaPlayer != null && isPaused) {
                mediaPlayer.start();
                isPaused = false;
            }
        });
    }

    @JavascriptInterface
    public void stop() {
        mainHandler.post(() -> {
            if (mediaPlayer != null) {
                try {
                    if (mediaPlayer.isPlaying()) {
                        mediaPlayer.stop();
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error stopping", e);
                }
                isPaused = false;
            }
        });
    }

    public void release() {
        if (mediaPlayer != null) {
            try {
                mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception e) {
                Log.e(TAG, "Error releasing", e);
            }
            mediaPlayer = null;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
            audioManager.abandonAudioFocusRequest(focusRequest);
        }

        isReady = false;
    }
}
