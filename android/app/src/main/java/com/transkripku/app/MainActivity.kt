package com.transkripku.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * SiLengkap: antarmuka HTML (web/ + shared/ di assets) ditampilkan di WebView.
 * Kotlin hanya menyediakan akses jaringan yang diblokir CORS untuk halaman web
 * (subtitle YouTube, RSS berita, data pasar) lewat jembatan `window.Native`.
 * Pengolahan data dikerjakan RheusInterface & TranscriptBot (JavaScript).
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private val io = Executors.newCachedThreadPool()
    private var pendingShare: String? = null
    private var pageReady = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                if (url.startsWith("file:///android_asset/")) return false
                if (url.startsWith("https://fonts.")) return false
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                pageReady = true
                pendingShare?.let { emit("share", JSONObject().put("text", it)); pendingShare = null }
            }
        }
        web.addJavascriptInterface(Bridge(), "Native")
        handleIntent(intent)
        web.loadUrl("file:///android_asset/index.html")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND) return
        val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return
        if (pageReady) emit("share", JSONObject().put("text", text)) else pendingShare = text
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        io.shutdownNow()
        web.destroy()
        super.onDestroy()
    }

    // --- Mengirim hasil ke JavaScript -------------------------------------------------

    private fun js(code: String) = runOnUiThread { web.evaluateJavascript(code, null) }

    private fun resolve(id: Int, data: Any) =
        js("window.Bridge && Bridge.resolve($id, ${JSONObject.quote(data.toString())})")

    private fun reject(id: Int, message: String) =
        js("window.Bridge && Bridge.reject($id, ${JSONObject.quote(message)})")

    private fun emit(event: String, data: JSONObject) =
        js("window.Bridge && Bridge.emit(${JSONObject.quote(event)}, ${JSONObject.quote(data.toString())})")

    // --- Jembatan JavaScript -> Kotlin ------------------------------------------------

    inner class Bridge {
        @JavascriptInterface
        fun getTranscript(id: Int, input: String) {
            io.execute {
                try {
                    resolve(id, YouTubeTranscript.fetch(input))
                } catch (e: YouTubeTranscript.TranscriptException) {
                    reject(id, e.message ?: "Gagal mengambil transkrip.")
                } catch (e: java.net.UnknownHostException) {
                    reject(id, "Tidak ada koneksi internet.")
                } catch (e: Exception) {
                    reject(id, "Gagal mengambil transkrip: ${e.message}")
                }
            }
        }

        /** Ambil teks dari sumber data RheusInterface (hanya host yang diizinkan). */
        @JavascriptInterface
        fun httpGet(id: Int, url: String) {
            io.execute {
                try {
                    resolve(id, Net.get(url))
                } catch (e: java.net.UnknownHostException) {
                    reject(id, "Tidak ada koneksi internet.")
                } catch (e: Exception) {
                    reject(id, e.message ?: "Gagal mengambil data.")
                }
            }
        }

        @JavascriptInterface
        fun openUrl(url: String) {
            if (!url.startsWith("https://") && !url.startsWith("http://")) return
            runOnUiThread {
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
            }
        }

        @JavascriptInterface
        fun copy(text: String) {
            runOnUiThread {
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("SiLengkap", text))
                Toast.makeText(this@MainActivity, "Tersalin", Toast.LENGTH_SHORT).show()
            }
        }

        @JavascriptInterface
        fun share(title: String, text: String) {
            runOnUiThread {
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_SUBJECT, title)
                    putExtra(Intent.EXTRA_TEXT, text)
                }
                startActivity(Intent.createChooser(send, "Bagikan / simpan"))
            }
        }
    }
}
