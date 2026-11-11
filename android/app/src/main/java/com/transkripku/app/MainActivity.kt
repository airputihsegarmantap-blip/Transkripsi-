package com.transkripku.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Aplikasi menampilkan antarmuka HTML (assets/www) di WebView.
 * Pekerjaan yang tidak bisa dilakukan halaman web (mengambil subtitle YouTube,
 * menjalankan LLM) dikerjakan Kotlin lewat jembatan `window.Native`.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var llm: LocalLlm
    private val io = Executors.newCachedThreadPool()
    private val ai = Executors.newSingleThreadExecutor()
    private var pendingShare: String? = null
    private var pageReady = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        llm = LocalLlm(applicationContext)
        web = WebView(this)
        setContentView(web)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                if (url.startsWith("file:///android_asset/")) return false
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
        web.loadUrl("file:///android_asset/www/index.html")
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
        llm.close()
        io.shutdownNow()
        ai.shutdownNow()
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

    private fun keepScreenOn(on: Boolean) = runOnUiThread {
        if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

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

        @JavascriptInterface
        fun modelStatus(): String = JSONObject()
            .put("ready", llm.isReady())
            .put("downloading", llm.downloading)
            .put("sizeBytes", llm.sizeBytes())
            .put("name", LocalLlm.MODEL_NAME)
            .toString()

        @JavascriptInterface
        fun downloadModel(id: Int) {
            io.execute {
                keepScreenOn(true)
                try {
                    llm.download { done, total ->
                        emit("download", JSONObject().put("done", done).put("total", total))
                    }
                    resolve(id, modelStatus())
                } catch (e: Exception) {
                    reject(id, e.message ?: "Gagal mengunduh model.")
                } finally {
                    keepScreenOn(false)
                }
            }
        }

        @JavascriptInterface
        fun cancelDownload() = llm.cancelDownload()

        @JavascriptInterface
        fun deleteModel() {
            ai.execute { llm.delete() }
        }

        @JavascriptInterface
        fun generate(id: Int, system: String, user: String) {
            ai.execute {
                keepScreenOn(true)
                try {
                    resolve(id, llm.generate(system, user))
                } catch (e: Throwable) {
                    reject(id, "AI gagal berjalan: ${e.message ?: e.javaClass.simpleName}")
                } finally {
                    keepScreenOn(false)
                }
            }
        }

        @JavascriptInterface
        fun openVideo(videoId: String, seconds: Int) {
            val uri = Uri.parse("https://www.youtube.com/watch?v=$videoId&t=${seconds}s")
            runOnUiThread { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
        }

        @JavascriptInterface
        fun copy(text: String) {
            runOnUiThread {
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("TranskripKu", text))
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
