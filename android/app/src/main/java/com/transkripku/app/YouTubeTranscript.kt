package com.transkripku.app

import android.text.Html
import org.json.JSONArray
import org.json.JSONObject
import android.content.Context
import java.io.File
import java.io.IOException
import java.net.CookieHandler
import java.net.CookieManager
import java.net.CookiePolicy
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL

/**
 * Mengambil subtitle video YouTube langsung dari HP — cepat & hemat kuota.
 *
 * Jalur utama (2 permintaan kecil, ±1–3 detik):
 *   1. POST ke endpoint player YouTube (klien ANDROID) → daftar subtitle + judul,
 *   2. unduh file subtitle (XML).
 * Jalur cadangan (bila jalur utama ditolak): baca halaman video untuk kunci API, lalu sama.
 * Semua permintaan punya batas waktu ketat sehingga proses tidak pernah "macet".
 * Hasil disimpan di cache memori: membuka video yang sama lagi langsung selesai.
 *
 * Prioritas subtitle: Indonesia manual → Indonesia otomatis → bahasa lain diterjemahkan ke Indonesia.
 *
 * Mengatasi "429 Too Many Requests" (YouTube membatasi IP; sering terjadi di data seluler karena
 * banyak pengguna berbagi satu IP):
 *   - hasil disimpan di disk → video yang sama tidak pernah meminta ke YouTube lagi,
 *   - cookie & visitorData dipertahankan seperti aplikasi sungguhan,
 *   - bila dibatasi: hormati Retry-After, lalu ganti klien (ANDROID → iOS → halaman web),
 *   - bila tetap dibatasi: galat diawali "RATE_LIMIT|" sehingga aplikasi mencoba lewat Rheus Cloud.
 */
object YouTubeTranscript {

    class TranscriptException(message: String) : Exception(message)
    private class RateLimited(val retryAfterMs: Long) : IOException("429")

    private data class Client(val name: String, val id: String, val version: String, val ua: String, val extra: Map<String, Any>)
    private val CLIENTS = listOf(
        Client("ANDROID", "3", "20.10.38", "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
            mapOf("androidSdkVersion" to 34, "osName" to "Android", "osVersion" to "14")),
        Client("IOS", "5", "20.10.4", "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
            mapOf("deviceMake" to "Apple", "deviceModel" to "iPhone16,2", "osName" to "iPhone", "osVersion" to "18.3.2.22D82")),
    )
    @Volatile private var visitorData = ""
    private var diskDir: File? = null

    /** Dipanggil sekali dari MainActivity: cache disk + cookie persisten. */
    fun init(context: Context) {
        diskDir = File(context.filesDir, "transcripts").apply { mkdirs() }
        if (CookieHandler.getDefault() == null) CookieHandler.setDefault(CookieManager(null, CookiePolicy.ACCEPT_ALL))
    }

    private fun diskGet(id: String): JSONObject? = try {
        diskDir?.let { File(it, "$id.json") }?.takeIf { it.exists() }?.let { JSONObject(it.readText()) }
    } catch (_: Exception) { null }

    private fun diskPut(id: String, data: JSONObject) {
        val dir = diskDir ?: return
        try {
            File(dir, "$id.json").writeText(data.toString())
            dir.listFiles()?.sortedByDescending { it.lastModified() }?.drop(80)?.forEach { it.delete() }
        } catch (_: Exception) {}
    }

    private const val WEB_UA =
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
    private val ID_LANGS = listOf("id", "in")
    private val ID_RE = Regex("^[A-Za-z0-9_-]{11}$")
    private val cache = object : LinkedHashMap<String, JSONObject>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, JSONObject>?) = size > 20
    }

    fun extractVideoId(input: String): String {
        val s = input.trim()
        if (ID_RE.matches(s)) return s
        val patterns = listOf(
            Regex("(?:v=|vi=)([A-Za-z0-9_-]{11})"),
            Regex("youtu\\.be/([A-Za-z0-9_-]{11})"),
            Regex("/(?:embed|shorts|live|v)/([A-Za-z0-9_-]{11})"),
        )
        for (p in patterns) p.find(s)?.let { return it.groupValues[1] }
        throw TranscriptException("Link YouTube tidak valid. Contoh: https://www.youtube.com/watch?v=XXXXXXXXXXX")
    }

    fun fetch(input: String): JSONObject {
        val videoId = extractVideoId(input)
        synchronized(cache) { cache[videoId]?.let { return it } }
        diskGet(videoId)?.let { d -> synchronized(cache) { cache[videoId] = d }; return d.put("cached", true) }
        val t0 = System.currentTimeMillis()

        var limited = false
        var lastError: TranscriptException? = null
        // Coba setiap klien; jalur halaman web sebagai cadangan terakhir.
        val attempts: List<() -> JSONObject> = CLIENTS.map { c -> { player(c, videoId) } } + listOf({ playerViaPage(videoId) })
        for (attempt in attempts) {
            try {
                val player = withRetry { attempt() }
                if (!hasCaptions(player)) { checkPlayable(player); continue }
                checkPlayable(player)
                val tracks = player.getJSONObject("captions").getJSONObject("playerCaptionsTracklistRenderer").getJSONArray("captionTracks")
                val (url, lang, source) = chooseTrack(tracks)
                val segments = parseXml(withRetry { httpGet(url, WEB_UA) })
                if (segments.length() == 0) { lastError = TranscriptException("Transkrip kosong — video mungkin tidak berisi ucapan."); continue }
                val title = player.optJSONObject("videoDetails")?.optString("title")?.takeIf { it.isNotBlank() }
                val result = JSONObject()
                    .put("video_id", videoId)
                    .put("title", title)
                    .put("language", lang)
                    .put("source", source)
                    .put("segments", segments)
                    .put("fetchMs", System.currentTimeMillis() - t0)
                synchronized(cache) { cache[videoId] = result }
                diskPut(videoId, result)
                return result
            } catch (e: RateLimited) {
                limited = true
            } catch (e: TranscriptException) {
                lastError = e
                if (e.message?.startsWith("Video") == true) throw e // video privat/dihapus: tidak perlu coba klien lain
            } catch (e: SocketTimeoutException) {
                lastError = TranscriptException("Koneksi ke YouTube terlalu lambat. Periksa internet lalu coba lagi.")
            } catch (e: java.net.UnknownHostException) {
                throw e
            } catch (e: Exception) {
                if (lastError == null) lastError = TranscriptException("Gagal mengambil subtitle: ${e.message}")
            }
        }
        if (limited) throw TranscriptException("RATE_LIMIT|YouTube sedang membatasi permintaan dari jaringan ini (429).")
        throw lastError ?: TranscriptException("Video ini tidak punya subtitle, jadi belum bisa ditranskripsi.")
    }

    /** Ulangi sekali bila dibatasi (429) dengan jeda Retry-After (maks. 4 detik). */
    private fun <T> withRetry(block: () -> T): T = try {
        block()
    } catch (e: RateLimited) {
        Thread.sleep(e.retryAfterMs.coerceIn(1500, 4000))
        block()
    }

    // ---------------------------------------------------------------- player
    private fun playerBody(c: Client, videoId: String): String {
        val client = JSONObject().put("clientName", c.name).put("clientVersion", c.version).put("hl", "id").put("gl", "ID")
        c.extra.forEach { (k, v) -> client.put(k, v) }
        if (visitorData.isNotEmpty()) client.put("visitorData", visitorData)
        return JSONObject()
            .put("context", JSONObject().put("client", client))
            .put("videoId", videoId)
            .put("contentCheckOk", true).put("racyCheckOk", true)
            .toString()
    }

    /** Jalur cepat: langsung ke endpoint player tanpa membuka halaman video. */
    private fun player(c: Client, videoId: String): JSONObject {
        val conn = open("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", c.ua)
        conn.requestMethod = "POST"
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json")
        conn.setRequestProperty("X-YouTube-Client-Name", c.id)
        conn.setRequestProperty("X-YouTube-Client-Version", c.version)
        if (visitorData.isNotEmpty()) conn.setRequestProperty("X-Goog-Visitor-Id", visitorData)
        conn.outputStream.use { it.write(playerBody(c, videoId).toByteArray(Charsets.UTF_8)) }
        val json = JSONObject(read(conn))
        json.optJSONObject("responseContext")?.optString("visitorData")?.takeIf { it.isNotEmpty() }?.let { visitorData = it }
        return json
    }

    /** Jalur cadangan: ambil kunci API dari halaman video lalu panggil endpoint player. */
    private fun playerViaPage(videoId: String): JSONObject {
        var html = httpGet("https://www.youtube.com/watch?v=$videoId&hl=id", WEB_UA)
        var cookie = ""
        if (html.contains("action=\"https://consent.youtube.com/s\"")) {
            val v = Regex("name=\"v\" value=\"(.*?)\"").find(html)?.groupValues?.get(1)
                ?: throw TranscriptException("Gagal melewati halaman persetujuan cookie YouTube.")
            cookie = "CONSENT=YES+$v"
            html = httpGet("https://www.youtube.com/watch?v=$videoId&hl=id", WEB_UA, cookie)
        }
        val apiKey = Regex("\"INNERTUBE_API_KEY\":\\s*\"([a-zA-Z0-9_-]+)\"").find(html)?.groupValues?.get(1)
            ?: throw TranscriptException(
                if (html.contains("class=\"g-recaptcha\"")) "YouTube meminta verifikasi (captcha). Coba lagi sebentar lagi."
                else "Gagal membaca halaman video YouTube."
            )
        val c = open("https://www.youtube.com/youtubei/v1/player?key=$apiKey&prettyPrint=false", CLIENTS[0].ua, cookie)
        c.requestMethod = "POST"
        c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.outputStream.use { it.write(playerBody(CLIENTS[0], videoId).toByteArray(Charsets.UTF_8)) }
        return JSONObject(read(c))
    }

    private fun hasCaptions(p: JSONObject) =
        (p.optJSONObject("captions")?.optJSONObject("playerCaptionsTracklistRenderer")?.optJSONArray("captionTracks")?.length() ?: 0) > 0

    private fun checkPlayable(player: JSONObject) {
        val status = player.optJSONObject("playabilityStatus") ?: return
        val st = status.optString("status")
        if (st.isEmpty() || st == "OK") return
        val reason = status.optString("reason")
        throw TranscriptException(
            when {
                reason.contains("bot", true) -> "YouTube mendeteksi permintaan otomatis. Coba lagi sebentar lagi atau ganti jaringan."
                st == "LOGIN_REQUIRED" -> "Video ini butuh login (mungkin dibatasi usia atau privat)."
                st == "UNPLAYABLE" || st == "ERROR" -> "Video tidak tersedia: ${reason.ifEmpty { st }}"
                else -> "Video tidak dapat diputar: ${reason.ifEmpty { st }}"
            }
        )
    }

    private fun chooseTrack(tracks: JSONArray): Triple<String, String, String> {
        data class Track(val url: String, val lang: String, val asr: Boolean, val translatable: Boolean)
        val list = (0 until tracks.length()).map {
            val t = tracks.getJSONObject(it)
            Track(t.getString("baseUrl").replace("&fmt=srv3", ""), t.optString("languageCode"),
                t.optString("kind") == "asr", t.optBoolean("isTranslatable", false))
        }
        list.firstOrNull { !it.asr && it.lang in ID_LANGS }?.let { return Triple(it.url, it.lang, "manual") }
        list.firstOrNull { it.asr && it.lang in ID_LANGS }?.let { return Triple(it.url, it.lang, "otomatis") }
        val base = list.firstOrNull { !it.asr } ?: list.first()
        return if (base.translatable) Triple(base.url + "&tlang=id", "id", "terjemahan")
        else Triple(base.url, base.lang, if (base.asr) "otomatis" else "manual")
    }

    // ---------------------------------------------------------------- subtitle
    private val TEXT_RE = Regex("<text start=\"([\\d.]+)\"(?: dur=\"([\\d.]+)\")?[^>]*>(.*?)</text>", RegexOption.DOT_MATCHES_ALL)
    private val P_RE = Regex("<p t=\"(\\d+)\"(?: d=\"(\\d+)\")?[^>]*>(.*?)</p>", RegexOption.DOT_MATCHES_ALL)
    private val NOISE = Regex("\\[(?:musik|music|tepuk tangan|applause)]", RegexOption.IGNORE_CASE)

    private fun parseXml(xml: String): JSONArray {
        val segments = JSONArray()
        fun add(start: Double, dur: Double, raw: String) {
            val text = unescape(unescape(raw)).replace(Regex("<[^>]*>"), "").replace(NOISE, " ").replace(Regex("\\s+"), " ").trim()
            if (text.isNotEmpty()) segments.put(JSONObject().put("start", start).put("duration", dur).put("text", text))
        }
        for (m in TEXT_RE.findAll(xml)) add(m.groupValues[1].toDouble(), m.groupValues[2].ifEmpty { "0" }.toDouble(), m.groupValues[3])
        if (segments.length() == 0) {
            // Format srv3 (<p t="ms" d="ms">) yang dipakai sebagian klien.
            for (m in P_RE.findAll(xml)) add(m.groupValues[1].toDouble() / 1000, m.groupValues[2].ifEmpty { "0" }.toDouble() / 1000, m.groupValues[3])
        }
        return segments
    }

    @Suppress("DEPRECATION")
    private fun unescape(s: String): String =
        if (android.os.Build.VERSION.SDK_INT >= 24) Html.fromHtml(s, Html.FROM_HTML_MODE_LEGACY).toString()
        else Html.fromHtml(s).toString()

    // ---------------------------------------------------------------- HTTP
    private fun open(url: String, ua: String, cookie: String = ""): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 7000
        c.readTimeout = 12000
        c.setRequestProperty("User-Agent", ua)
        c.setRequestProperty("Accept-Language", "id-ID,id;q=0.9,en;q=0.8")
        if (cookie.isNotEmpty()) c.setRequestProperty("Cookie", cookie)
        return c
    }

    private fun read(c: HttpURLConnection): String {
        try {
            val code = c.responseCode
            if (code == 429) throw RateLimited((c.getHeaderField("Retry-After")?.trim()?.toLongOrNull() ?: 2) * 1000)
            if (code >= 400) throw IOException("HTTP $code dari YouTube")
            return c.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } catch (e: SocketTimeoutException) {
            throw TranscriptException("Koneksi ke YouTube terlalu lambat. Periksa internet lalu coba lagi.")
        } finally {
            c.disconnect()
        }
    }

    private fun httpGet(url: String, ua: String, cookie: String = ""): String = read(open(url, ua, cookie))
}
