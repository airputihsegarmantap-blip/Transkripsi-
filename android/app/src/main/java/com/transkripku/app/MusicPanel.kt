package com.transkripku.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent

/**
 * Pemutar mini YouTube Music di dalam SiLengkap.
 *
 * Panel kecil yang melayang di atas tampilan SiLengkap (bagian bawah layar). Pengguna tetap bisa
 * berpindah menu, membaca berita, atau bermain gim sementara musik berjalan. Tombol ⤢ memperbesar panel
 * sampai hampir layar penuh, ✕ menutupnya (musik berhenti).
 *
 * Catatan kebijakan: musik hanya berjalan selama SiLengkap terlihat di layar. Begitu aplikasi ke latar
 * belakang atau layar mati, musik dijeda. Putar di latar belakang adalah fitur YouTube Premium, dan panel
 * ini tidak mencoba mengakalinya. Untuk musik yang tetap berbunyi saat layar mati, gunakan menu Radio.
 *
 * Login Google tidak diizinkan Google di WebView, jadi tombol "Masuk" membuka Chrome Custom Tab
 * (login itu tidak terbawa ke panel).
 */
class MusicPanel(
    private val activity: Activity,
    private val root: FrameLayout,
    private val notify: (mode: String, heightDp: Int) -> Unit,
) {
    private var panel: LinearLayout? = null
    private var web: WebView? = null
    private var titleView: TextView? = null
    private var toggleBtn: TextView? = null
    private var loginBtn: TextView? = null
    private var closeBtn: TextView? = null
    private var bar: LinearLayout? = null
    private var full = false

    var light = false
        set(value) { field = value; recolor() }

    val isOpen get() = panel != null
    val isFull get() = full

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), activity.resources.displayMetrics).toInt()

    private val bg get() = if (light) Color.parseColor("#FFFFFF") else Color.parseColor("#1B1D2B")
    private val fg get() = if (light) Color.parseColor("#1D1B29") else Color.parseColor("#E9E9ED")
    private val border get() = if (light) Color.parseColor("#D9D8E6") else Color.parseColor("#3A3D55")
    private val accent = Color.parseColor("#9184D9")

    /** Buka panel (atau pindahkan halamannya bila sudah terbuka, tanpa memutus lagu yang sedang berjalan). */
    fun open(url: String) {
        val w = web
        if (w != null) {
            if (w.url?.startsWith(url) != true && url != MUSIC_HOME) w.loadUrl(url)
            if (full) setFull(false)
            return
        }
        build(url)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun build(url: String) {
        val p = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            elevation = dp(14).toFloat()
            clipToOutline = true
        }
        p.background = GradientDrawable().apply { cornerRadius = dp(16).toFloat(); setColor(bg); setStroke(dp(1), border) }

        val b = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), 0, dp(4), 0)
        }
        val ico = TextView(activity).apply { text = "♪"; setTextColor(accent); textSize = 18f; setPadding(0, 0, dp(8), 0) }
        val title = TextView(activity).apply {
            text = "YouTube Music"; setTextColor(fg); textSize = 13f; typeface = Typeface.DEFAULT_BOLD
            maxLines = 1; ellipsize = TextUtils.TruncateAt.END
        }
        val loginB = chip("Masuk") { openCustomTab(web?.url ?: MUSIC_HOME) }
        val toggleB = iconBtn("⤢", "Perbesar") { setFull(!full) }
        val closeB = iconBtn("✕", "Tutup") { this.close() }
        b.addView(ico)
        b.addView(title, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        b.addView(loginB); b.addView(toggleB); b.addView(closeB)
        p.addView(b, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(BAR_H)))

        val w = WebView(activity)
        w.setBackgroundColor(Color.BLACK)
        w.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            // YouTube Music menampilkan versi seluler lengkap untuk Chrome biasa, bukan untuk "WebView".
            userAgentString = userAgentString.replace("; wv", "").replace(Regex("Version/\\d+\\.\\d+ "), "")
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, true)
        w.webChromeClient = object : WebChromeClient() {
            override fun onReceivedTitle(view: WebView, t: String?) {
                if (!t.isNullOrBlank() && !t.startsWith("http")) titleView?.text = t.removeSuffix(" - YouTube Music")
            }
        }
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.scheme == "http" || u.scheme == "https") {
                    if (u.host == "accounts.google.com") { openCustomTab(u.toString()); return true }
                    return false
                }
                return true // jangan lompat ke aplikasi lain (intent://, market://)
            }
        }
        p.addView(w, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        val lp = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(MINI_H)).apply {
            gravity = Gravity.BOTTOM
            setMargins(dp(8), 0, dp(8), dp(8))
        }
        root.addView(p, lp)
        panel = p; web = w; titleView = title; toggleBtn = toggleB; loginBtn = loginB; closeBtn = closeB; bar = b
        full = false
        recolor()
        w.loadUrl(url)
        notify("mini", MINI_H)
    }

    fun setFull(on: Boolean) {
        val p = panel ?: return
        full = on
        val lp = p.layoutParams as FrameLayout.LayoutParams
        lp.height = if (on) ViewGroup.LayoutParams.MATCH_PARENT else dp(MINI_H)
        lp.topMargin = if (on) dp(8) else 0
        p.layoutParams = lp
        toggleBtn?.text = if (on) "⤡" else "⤢"
        notify(if (on) "full" else "mini", MINI_H)
    }

    fun close() {
        val p = panel ?: return
        web?.let { it.stopLoading(); it.loadUrl("about:blank"); root.removeView(p); it.destroy() }
        panel = null; web = null; titleView = null; toggleBtn = null; loginBtn = null; closeBtn = null; bar = null; full = false
        notify("closed", 0)
    }

    /** Aplikasi keluar dari layar: jeda musik (lihat catatan kebijakan di atas). */
    fun onBackground() {
        web?.let {
            it.evaluateJavascript("document.querySelectorAll('video,audio').forEach(function(m){m.pause()})", null)
            it.onPause()
        }
    }

    fun onForeground() { web?.onResume() }

    private fun recolor() {
        val p = panel ?: return
        (p.background as? GradientDrawable)?.apply { setColor(bg); setStroke(dp(1), border) }
        titleView?.setTextColor(fg)
        toggleBtn?.setTextColor(fg); closeBtn?.setTextColor(fg)
        (loginBtn?.background as? GradientDrawable)?.setColor(if (light) Color.parseColor("#ECE9FB") else Color.parseColor("#262243"))
        loginBtn?.setTextColor(if (light) Color.parseColor("#5446AE") else Color.parseColor("#B9B0EC"))
    }

    private fun openCustomTab(url: String) {
        try {
            CustomTabsIntent.Builder()
                .setDefaultColorSchemeParams(CustomTabColorSchemeParams.Builder().setToolbarColor(bg).build())
                .setShowTitle(true)
                .build()
                .launchUrl(activity, Uri.parse(url))
        } catch (_: Exception) {
            try { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
        }
    }

    private fun iconBtn(label: String, desc: String, onClick: () -> Unit) = TextView(activity).apply {
        text = label; contentDescription = desc; setTextColor(fg); textSize = 18f; gravity = Gravity.CENTER
        minWidth = dp(40); minHeight = dp(40)
        setOnClickListener { it.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); onClick() }
    }

    private fun chip(label: String, onClick: () -> Unit) = TextView(activity).apply {
        text = label; textSize = 12f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER
        setPadding(dp(10), dp(5), dp(10), dp(5))
        background = GradientDrawable().apply { cornerRadius = dp(99).toFloat() }
        setOnClickListener { it.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); onClick() }
    }

    companion object {
        const val MUSIC_HOME = "https://music.youtube.com/"
        private const val MINI_H = 250
        private const val BAR_H = 42
    }
}
