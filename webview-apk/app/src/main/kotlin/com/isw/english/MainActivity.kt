package com.isw.english

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.*
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private val APP_URL = "https://iwlisten.pages.dev"
    private val GITHUB_REPO = "insushim/iwlisten"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Full screen
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let {
                it.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            )
        }

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.allowFileAccess = false
            settings.allowContentAccess = false

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url.toString()
                    // Keep app URL in WebView, open external links in browser
                    return if (url.startsWith(APP_URL) || url.startsWith("https://iwlisten.pages.dev")) {
                        false
                    } else {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        true
                    }
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onJsAlert(view: WebView, url: String, message: String, result: JsResult): Boolean {
                    AlertDialog.Builder(this@MainActivity)
                        .setMessage(message)
                        .setPositiveButton("확인") { _, _ -> result.confirm() }
                        .setCancelable(false)
                        .show()
                    return true
                }

                override fun onJsConfirm(view: WebView, url: String, message: String, result: JsResult): Boolean {
                    AlertDialog.Builder(this@MainActivity)
                        .setMessage(message)
                        .setPositiveButton("확인") { _, _ -> result.confirm() }
                        .setNegativeButton("취소") { _, _ -> result.cancel() }
                        .setCancelable(false)
                        .show()
                    return true
                }
            }

            loadUrl(APP_URL)
        }

        setContentView(webView)
        checkForUpdate()
    }

    private fun checkForUpdate() {
        Thread {
            try {
                val url = java.net.URL("https://api.github.com/repos/$GITHUB_REPO/releases/latest")
                val conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "GET"
                conn.setRequestProperty("Accept", "application/vnd.github.v3+json")
                conn.connectTimeout = 5000

                if (conn.responseCode == 200) {
                    val response = conn.inputStream.bufferedReader().readText()
                    // Simple JSON parsing for tag_name
                    val tagMatch = Regex("\"tag_name\"\\s*:\\s*\"v?([^\"]+)\"").find(response)
                    val latestVersion = tagMatch?.groupValues?.get(1) ?: return@Thread
                    val currentVersion = packageManager
                        .getPackageInfo(packageName, 0)
                        .versionName ?: "0.0.0"

                    if (latestVersion != currentVersion && compareVersions(latestVersion, currentVersion) > 0) {
                        // Find APK download URL
                        val apkMatch = Regex("\"browser_download_url\"\\s*:\\s*\"([^\"]+\\.apk)\"").find(response)
                        val downloadUrl = apkMatch?.groupValues?.get(1)
                            ?: "https://github.com/$GITHUB_REPO/releases/latest"

                        runOnUiThread {
                            AlertDialog.Builder(this)
                                .setTitle("업데이트 가능")
                                .setMessage("새 버전 v$latestVersion 이 있습니다.\n다운로드하시겠습니까?")
                                .setPositiveButton("다운로드") { _, _ ->
                                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(downloadUrl)))
                                }
                                .setNegativeButton("나중에", null)
                                .show()
                        }
                    }
                }
            } catch (e: Exception) {
                // Silently fail - network might not be available
            }
        }.start()
    }

    private fun compareVersions(a: String, b: String): Int {
        val pa = a.split(".").map { it.toIntOrNull() ?: 0 }
        val pb = b.split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(pa.size, pb.size)) {
            val na = pa.getOrElse(i) { 0 }
            val nb = pb.getOrElse(i) { 0 }
            if (na > nb) return 1
            if (na < nb) return -1
        }
        return 0
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
