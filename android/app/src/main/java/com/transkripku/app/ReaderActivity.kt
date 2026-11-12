package com.transkripku.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent

/**
 * Tampilan web di dalam SiLengkap, dua mode:
 *  - "article": halaman berita sumber. Mode Baca (Readability, Mozilla) aktif otomatis bila halaman
 *    berisi artikel → isi bersih tanpa iklan. Tombol "Aa" untuk beralih ke halaman asli kapan saja.
 *  - "music": YouTube Music (music.youtube.com) sebagai menu Musik Online. Login Google tidak
 *    diizinkan Google di WebView, jadi "Masuk akun" membuka Chrome Custom Tab.
 */
class ReaderActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var titleView: TextView
    private lateinit var hostView: TextView
    private var readBtn: TextView? = null
    private lateinit var progress: ProgressBar
    private var readerOn = false
    private var music = false
    private var autoReader = true
    private var light = false
    private var userClosedReaderFor: String? = null
    private val readerJs by lazy {
        assets.open("vendor/readability/Readability.js").bufferedReader().use { it.readText() } + "\n" +
            assets.open("reader.js").bufferedReader().use { it.readText() }
    }

    private val bg get() = if (light) LIGHT_BG else DARK_BG
    private val fg get() = if (light) LIGHT_TEXT else DARK_TEXT
    private val surface get() = if (light) LIGHT_SURFACE else DARK_SURFACE

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        music = intent.getStringExtra(EXTRA_MODE) == MODE_MUSIC
        autoReader = intent.getBooleanExtra(EXTRA_AUTO_READER, true)
        light = intent.getBooleanExtra(EXTRA_LIGHT, false)
        val url = intent.getStringExtra(EXTRA_URL) ?: if (music) MUSIC_URL else return finish()
        window.statusBarColor = bg
        window.navigationBarColor = bg
        if (light && android.os.Build.VERSION.SDK_INT >= 23) {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        }

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(bg)
            setPadding(dp(4), dp(6), dp(8), dp(6))
        }
        bar.addView(iconButton(if (music) "‹" else "✕", "Tutup") { finish() })
        val titles = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(4), 0, dp(8), 0) }
        titleView = TextView(this).apply {
            setTextColor(fg); textSize = 15f; typeface = Typeface.DEFAULT_BOLD
            maxLines = 1; ellipsize = TextUtils.TruncateAt.END
            text = intent.getStringExtra(EXTRA_TITLE) ?: if (music) "Musik Online" else "Memuat…"
        }
        hostView = TextView(this).apply {
            setTextColor(MUTED); textSize = 12f; maxLines = 1; ellipsize = TextUtils.TruncateAt.END
            text = if (music) "YouTube Music" else Uri.parse(url).host?.removePrefix("www.") ?: ""
        }
        titles.addView(titleView); titles.addView(hostView)
        bar.addView(titles, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        if (music) {
            bar.addView(pill("Masuk akun") { openCustomTab(web.url ?: MUSIC_URL) })
        } else {
            readBtn = pill("Aa  Baca") { toggleReader() }
            bar.addView(readBtn)
        }
        bar.addView(iconButton("⋮", "Lainnya") { v -> showMenu(v) })

        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progressTintList = ColorStateList.valueOf(ACCENT)
            progressBackgroundTintList = ColorStateList.valueOf(bg)
        }

        web = WebView(this)
        web.setBackgroundColor(if (music) Color.BLACK else Color.WHITE)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = !music
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = !music
            // Situs (termasuk YouTube Music) menampilkan versi lengkapnya untuk Chrome seluler biasa.
            userAgentString = userAgentString.replace("; wv", "").replace(Regex("Version/\\d+\\.\\d+ "), "")
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        web.addJavascriptInterface(Host(), "SLHost")
        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, p: Int) {
                progress.progress = p
                progress.visibility = if (p >= 100) View.INVISIBLE else View.VISIBLE
            }
            override fun onReceivedTitle(view: WebView, title: String?) {
                if (!title.isNullOrBlank() && !title.startsWith("http")) titleView.text = title
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.scheme == "http" || u.scheme == "https") {
                    // Halaman login Google ditolak di WebView → buka lewat Chrome Custom Tab.
                    if (u.host == "accounts.google.com") { openCustomTab(u.toString()); return true }
                    return false
                }
                // Di mode musik jangan lompat otomatis ke aplikasi lain (intent://, market://).
                if (!music) try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: Exception) {}
                return true
            }
            override fun onPageStarted(view: WebView, u: String, favicon: android.graphics.Bitmap?) {
                setReader(false)
                if (!music) hostView.text = Uri.parse(u).host?.removePrefix("www.") ?: ""
            }
            override fun onPageFinished(view: WebView, u: String) {
                if (music || !autoReader || userClosedReaderFor == u) return
                // Mode Baca otomatis (diam-diam; bila halaman bukan artikel, halaman asli tetap tampil).
                view.postDelayed({ if (web.url == u && !readerOn) inject("SLReader.open(true)") }, 350)
            }
        }

        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(bg) }
        root.addView(bar)
        root.addView(progress, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)))
        root.addView(FrameLayout(this).apply { addView(web) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
        web.loadUrl(url)
    }

    private fun inject(call: String) {
        web.evaluateJavascript("(function(){ window.SL_READER_LIGHT=$light; if(!window.SLReader){ $readerJs\n } return $call; })()", null)
    }

    private fun toggleReader() {
        if (readerOn) userClosedReaderFor = web.url
        inject("SLReader.toggle()")
    }

    private fun setReader(on: Boolean) {
        readerOn = on
        val b = readBtn ?: return
        (b.background as GradientDrawable).setColor(if (on) ACCENT else surface)
        b.setTextColor(if (on) DARK_BG else fg)
    }

    private fun openCustomTab(url: String) {
        try {
            CustomTabsIntent.Builder()
                .setDefaultColorSchemeParams(CustomTabColorSchemeParams.Builder().setToolbarColor(bg).build())
                .setShowTitle(true)
                .build()
                .launchUrl(this, Uri.parse(url))
        } catch (_: Exception) {
            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
        }
    }

    private fun showMenu(anchor: View) {
        val url = web.url ?: return
        PopupMenu(this, anchor).apply {
            if (music) {
                menu.add(0, 5, 0, "Buka aplikasi YouTube Music")
                menu.add(0, 6, 1, "Masuk akun (Chrome)")
                menu.add(0, 4, 2, "Muat ulang")
            } else {
                menu.add(0, 1, 0, "Bagikan")
                menu.add(0, 2, 1, "Buka di browser")
                menu.add(0, 3, 2, "Salin tautan")
                menu.add(0, 4, 3, "Muat ulang")
            }
            setOnMenuItemClickListener {
                when (it.itemId) {
                    1 -> startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"; putExtra(Intent.EXTRA_TEXT, "${titleView.text}\n$url")
                    }, "Bagikan"))
                    2 -> try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
                    3 -> {
                        (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("tautan", url))
                        Toast.makeText(this@ReaderActivity, "Tautan tersalin", Toast.LENGTH_SHORT).show()
                    }
                    4 -> { userClosedReaderFor = null; web.reload() }
                    5 -> try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
                    6 -> openCustomTab(url)
                }
                true
            }
        }.show()
    }

    private fun iconButton(label: String, desc: String, onClick: (View) -> Unit) = TextView(this).apply {
        text = label; contentDescription = desc; setTextColor(fg); textSize = 22f; gravity = Gravity.CENTER
        minWidth = dp(44); minHeight = dp(44)
        setOnClickListener { it.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); onClick(it) }
    }

    private fun pill(label: String, onClick: () -> Unit) = TextView(this).apply {
        text = label; setTextColor(fg); textSize = 13f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER
        setPadding(dp(14), dp(7), dp(14), dp(7))
        background = GradientDrawable().apply { cornerRadius = dp(99).toFloat(); setColor(surface); setStroke(dp(1), ACCENT_DIM) }
        setOnClickListener { it.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); onClick() }
    }

    inner class Host {
        @JavascriptInterface
        fun onReader(on: Boolean, message: String) {
            runOnUiThread {
                setReader(on)
                if (!on && message.isNotBlank()) Toast.makeText(this@ReaderActivity, message, Toast.LENGTH_SHORT).show()
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        when {
            readerOn -> { userClosedReaderFor = web.url; web.evaluateJavascript("window.SLReader && SLReader.close()", null) }
            web.canGoBack() -> web.goBack()
            else -> super.onBackPressed()
        }
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_TITLE = "title"
        const val EXTRA_MODE = "mode"
        const val EXTRA_AUTO_READER = "autoReader"
        const val EXTRA_LIGHT = "light"
        const val MODE_MUSIC = "music"
        const val MUSIC_URL = "https://music.youtube.com/"
        private val DARK_BG = Color.parseColor("#12131d")
        private val DARK_SURFACE = Color.parseColor("#222536")
        private val DARK_TEXT = Color.parseColor("#e9e9ed")
        private val LIGHT_BG = Color.parseColor("#f7f6fb")
        private val LIGHT_SURFACE = Color.parseColor("#ffffff")
        private val LIGHT_TEXT = Color.parseColor("#1d1b29")
        private val MUTED = Color.parseColor("#8a8ea3")
        private val ACCENT = Color.parseColor("#9184d9")
        private val ACCENT_DIM = Color.parseColor("#5c5196")
    }
}
