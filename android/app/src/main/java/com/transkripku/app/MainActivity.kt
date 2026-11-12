package com.transkripku.app

import android.annotation.SuppressLint
import android.app.Activity
import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.HapticFeedbackConstants
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.webkit.WebViewAssetLoader
import android.widget.Toast
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * SiLengkap: antarmuka HTML (folder web/ di assets) ditampilkan di WebView lewat alamat https
 * internal (WebViewAssetLoader) — sehingga model TranscriptBot & data Rheus Cloud bisa dimuat cepat.
 * Kotlin mengambil subtitle YouTube langsung dari HP, memutar radio lewat RadioService (ExoPlayer),
 * membuka berita & YouTube Music di ReaderActivity, dan menyediakan salin/bagikan/getar.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private val io = Executors.newCachedThreadPool()
    private var pendingShare: String? = null
    private var pageReady = false
    private val main = Handler(Looper.getMainLooper())
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var controller: MediaController? = null
    private var lightTheme = false
    private var music: MusicPanel? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        YouTubeTranscript.init(this)
        web = WebView(this)
        val root = FrameLayout(this)
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(root)
        music = MusicPanel(this, root) { mode, h -> emit("music", JSONObject().put("mode", mode).put("h", h)) }
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.mediaPlaybackRequiresUserGesture = true
        web.webChromeClient = WebChromeClient()
        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assets.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                if (url.startsWith("https://appassets.androidplatform.net/")) return false
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
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html")
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
        val m = music
        when {
            m != null && m.isFull -> m.setFull(false)
            web.canGoBack() -> web.goBack()
            else -> super.onBackPressed()
        }
    }

    // Musik YouTube hanya berjalan selama aplikasi terlihat (putar di latar belakang = fitur Premium).
    override fun onPause() { music?.onBackground(); super.onPause() }
    override fun onResume() { super.onResume(); music?.onForeground() }

    override fun onDestroy() {
        controllerFuture?.let { MediaController.releaseFuture(it) }
        controller = null
        music?.close()
        music = null
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


    // --- Radio (RadioService) -----------------------------------------------------------

    private val playerListener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) = emitRadio()
        override fun onPlaybackStateChanged(playbackState: Int) = emitRadio()
        override fun onPlayerError(error: PlaybackException) = emitRadio()
    }

    private fun emitRadio(extras: Bundle? = null) {
        val c = controller ?: return
        val x = extras ?: c.sessionExtras
        val serviceState = x.getString("state") ?: ""
        val state = when {
            c.isPlaying -> "playing"
            serviceState == "reconnecting" -> "reconnecting"
            serviceState == "error" -> "error"
            c.playbackState == Player.STATE_BUFFERING -> "loading"
            c.playbackState == Player.STATE_IDLE && c.mediaItemCount == 0 -> "idle"
            !c.playWhenReady -> "paused"
            else -> "loading"
        }
        emit("radio", JSONObject()
            .put("state", state)
            .put("id", c.currentMediaItem?.mediaId ?: "")
            .put("nowPlaying", x.getString("nowPlaying") ?: "")
            .put("attempt", x.getInt("attempt", 0))
            .put("message", x.getString("message") ?: ""))
    }

    private fun withController(block: (MediaController) -> Unit) {
        controller?.let { block(it); return }
        val future = controllerFuture ?: MediaController.Builder(this, SessionToken(this, ComponentName(this, RadioService::class.java)))
            .setListener(object : MediaController.Listener {
                override fun onExtrasChanged(controller: MediaController, extras: Bundle) = emitRadio(extras)
            })
            .buildAsync().also { controllerFuture = it }
        future.addListener({
            try {
                val c = future.get()
                if (controller == null) { controller = c; c.addListener(playerListener) }
                block(c)
            } catch (e: Exception) {
                emit("radio", JSONObject().put("state", "error").put("message", "Pemutar radio gagal dimulai."))
            }
        }, { r -> main.post(r) })
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7)
        }
    }

    private fun applyTheme(light: Boolean) {
        lightTheme = light
        music?.light = light
        val bg = if (light) Color.parseColor("#f7f6fb") else Color.parseColor("#12131d")
        window.statusBarColor = bg
        window.navigationBarColor = bg
        web.setBackgroundColor(bg)
        if (Build.VERSION.SDK_INT >= 23) {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = if (light) View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR else 0
        }
    }

    // --- Jembatan JavaScript -> Kotlin ------------------------------------------------

    inner class Bridge {
        @JavascriptInterface
        fun getTranscript(id: Int, input: String, lang: String) {
            io.execute {
                try {
                    resolve(id, YouTubeTranscript.fetch(input, lang))
                } catch (e: YouTubeTranscript.TranscriptException) {
                    reject(id, e.message ?: "Gagal mengambil transkrip.")
                } catch (e: java.net.UnknownHostException) {
                    reject(id, "Tidak ada koneksi internet.")
                } catch (e: Exception) {
                    reject(id, "Gagal mengambil transkrip: ${e.message}")
                }
            }
        }

        /** station: {id, name, urls[], favicon, hls, tags} */
        @JavascriptInterface
        fun radioPlay(json: String) {
            val st = JSONObject(json)
            val urls = ArrayList<String>()
            st.optJSONArray("urls")?.let { a -> for (i in 0 until a.length()) urls.add(a.getString(i)) }
            if (urls.isEmpty()) return
            val extras = Bundle().apply { putStringArrayList("urls", urls); putBoolean("hls", st.optBoolean("hls")) }
            val meta = MediaMetadata.Builder()
                .setTitle(st.optString("name"))
                .setArtist("SiLengkap Radio")
                .setStation(st.optString("name"))
                .setExtras(extras)
                .apply { st.optString("favicon").takeIf { it.startsWith("http") }?.let { setArtworkUri(Uri.parse(it)) } }
                .build()
            val item = MediaItem.Builder()
                .setMediaId(st.optString("id"))
                .setMediaMetadata(meta)
                .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(Uri.parse(urls[0])).setExtras(extras).build())
                .build()
            main.post {
                askNotificationPermission()
                withController { c -> c.setMediaItem(item); c.prepare(); c.play() }
            }
        }

        @JavascriptInterface
        fun radioPause() { main.post { withController { it.pause() } } }

        @JavascriptInterface
        fun radioResume() { main.post { withController { c -> if (c.playbackState == Player.STATE_IDLE) c.prepare(); c.play() } } }

        @JavascriptInterface
        fun radioStop() { main.post { withController { c -> c.stop(); c.clearMediaItems() } } }

        /** Status radio saat ini (mis. setelah aplikasi dibuka lagi ketika radio masih berbunyi). */
        @JavascriptInterface
        fun radioSync() { main.post { withController { emitRadio() } } }

        @JavascriptInterface
        fun openArticle(url: String, title: String) {
            if (!url.startsWith("https://") && !url.startsWith("http://")) return
            runOnUiThread {
                startActivity(Intent(this@MainActivity, ReaderActivity::class.java)
                    .putExtra(ReaderActivity.EXTRA_URL, url)
                    .putExtra(ReaderActivity.EXTRA_TITLE, title)
                    .putExtra(ReaderActivity.EXTRA_LIGHT, lightTheme))
            }
        }

        /** Buka/pindahkan pemutar mini YouTube Music (panel melayang di dalam SiLengkap). */
        @JavascriptInterface
        fun openMusic(url: String) {
            val target = if (url.startsWith("https://music.youtube.com/")) url else MusicPanel.MUSIC_HOME
            runOnUiThread { music?.light = lightTheme; music?.open(target) }
        }

        /** mode: "mini" | "full" | "close" */
        @JavascriptInterface
        fun musicMode(mode: String) {
            runOnUiThread {
                when (mode) {
                    "mini" -> music?.setFull(false)
                    "full" -> music?.setFull(true)
                    "close" -> music?.close()
                }
            }
        }

        @JavascriptInterface
        fun setTheme(light: Boolean) { runOnUiThread { applyTheme(light) } }

        /** Getaran halus untuk umpan balik sentuhan. */
        @JavascriptInterface
        fun haptic() {
            runOnUiThread { web.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP) }
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
