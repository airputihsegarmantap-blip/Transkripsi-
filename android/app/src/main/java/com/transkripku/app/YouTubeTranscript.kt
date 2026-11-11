package com.transkripku.app

import android.text.Html
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Mengambil transkrip (subtitle) video YouTube langsung dari perangkat, tanpa server.
 *
 * Alurnya sama dengan pustaka Python youtube-transcript-api:
 * halaman video -> INNERTUBE_API_KEY -> endpoint player (klien ANDROID) -> daftar
 * captionTracks -> unduh XML subtitle.
 *
 * Prioritas: subtitle Indonesia manual -> Indonesia otomatis -> bahasa lain
 * diterjemahkan YouTube ke Indonesia.
 */
object YouTubeTranscript {

    class TranscriptException(message: String) : Exception(message)

    private const val UA =
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
    private val ID_LANGS = listOf("id", "in")
    private val ID_RE = Regex("^[A-Za-z0-9_-]{11}$")

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
        var cookie = ""
        var html = httpGet("https://www.youtube.com/watch?v=$videoId", cookie)
        if (html.contains("action=\"https://consent.youtube.com/s\"")) {
            val v = Regex("name=\"v\" value=\"(.*?)\"").find(html)?.groupValues?.get(1)
                ?: throw TranscriptException("Gagal melewati halaman persetujuan cookie YouTube.")
            cookie = "CONSENT=YES+$v"
            html = httpGet("https://www.youtube.com/watch?v=$videoId", cookie)
        }

        val apiKey = Regex("\"INNERTUBE_API_KEY\":\\s*\"([a-zA-Z0-9_-]+)\"").find(html)?.groupValues?.get(1)
            ?: throw TranscriptException(
                if (html.contains("class=\"g-recaptcha\"")) "YouTube memblokir permintaan (captcha). Coba lagi nanti."
                else "Gagal membaca halaman video YouTube."
            )
        val title = Regex("<meta name=\"title\" content=\"(.*?)\"").find(html)?.groupValues?.get(1)
            ?.let { unescape(it) }

        val body = JSONObject()
            .put("context", JSONObject().put("client", JSONObject()
                .put("clientName", "ANDROID").put("clientVersion", "20.10.38")))
            .put("videoId", videoId)
        val player = JSONObject(httpPost("https://www.youtube.com/youtubei/v1/player?key=$apiKey", body.toString(), cookie))

        val status = player.optJSONObject("playabilityStatus")
        val st = status?.optString("status")
        if (st != null && st.isNotEmpty() && st != "OK") {
            val reason = status.optString("reason")
            throw TranscriptException(
                when {
                    reason.contains("bot", true) -> "YouTube mendeteksi permintaan otomatis. Coba lagi nanti atau ganti jaringan."
                    st == "LOGIN_REQUIRED" -> "Video ini butuh login (mungkin dibatasi usia)."
                    else -> "Video tidak dapat diputar: ${reason.ifEmpty { st }}"
                }
            )
        }

        val captions = player.optJSONObject("captions")?.optJSONObject("playerCaptionsTracklistRenderer")
        val tracks = captions?.optJSONArray("captionTracks")
        if (tracks == null || tracks.length() == 0) {
            throw TranscriptException("Video ini tidak punya subtitle, jadi belum bisa ditranskripsi.")
        }

        data class Track(val url: String, val lang: String, val asr: Boolean, val translatable: Boolean)
        val list = (0 until tracks.length()).map {
            val t = tracks.getJSONObject(it)
            Track(
                t.getString("baseUrl").replace("&fmt=srv3", ""),
                t.optString("languageCode"),
                t.optString("kind") == "asr",
                t.optBoolean("isTranslatable", false),
            )
        }

        var url: String
        var lang: String
        var source: String
        val manualId = list.firstOrNull { !it.asr && it.lang in ID_LANGS }
        val autoId = list.firstOrNull { it.asr && it.lang in ID_LANGS }
        when {
            manualId != null -> { url = manualId.url; lang = manualId.lang; source = "manual" }
            autoId != null -> { url = autoId.url; lang = autoId.lang; source = "otomatis" }
            else -> {
                val base = list.firstOrNull { !it.asr } ?: list.first()
                if (base.translatable) {
                    url = base.url + "&tlang=id"; lang = "id"; source = "terjemahan"
                } else {
                    url = base.url; lang = base.lang; source = if (base.asr) "otomatis" else "manual"
                }
            }
        }
        if (url.contains("&exp=xpe")) {
            throw TranscriptException("YouTube meminta verifikasi tambahan untuk video ini. Coba lagi nanti.")
        }

        val xml = httpGet(url, cookie)
        val segments = JSONArray()
        val textRe = Regex("<text start=\"([\\d.]+)\"(?: dur=\"([\\d.]+)\")?[^>]*>(.*?)</text>", RegexOption.DOT_MATCHES_ALL)
        val noise = Regex("\\[(?:musik|music|tepuk tangan|applause)]", RegexOption.IGNORE_CASE)
        for (m in textRe.findAll(xml)) {
            val text = unescape(unescape(m.groupValues[3]))
                .replace(Regex("<[^>]*>"), "")
                .replace(noise, " ")
                .replace(Regex("\\s+"), " ")
                .trim()
            if (text.isEmpty()) continue
            segments.put(JSONObject()
                .put("start", m.groupValues[1].toDouble())
                .put("duration", m.groupValues[2].ifEmpty { "0" }.toDouble())
                .put("text", text))
        }
        if (segments.length() == 0) throw TranscriptException("Transkrip kosong — video mungkin tidak berisi ucapan.")

        return JSONObject()
            .put("video_id", videoId)
            .put("title", title)
            .put("language", lang)
            .put("source", source)
            .put("segments", segments)
    }

    @Suppress("DEPRECATION")
    private fun unescape(s: String): String =
        if (android.os.Build.VERSION.SDK_INT >= 24) Html.fromHtml(s, Html.FROM_HTML_MODE_LEGACY).toString()
        else Html.fromHtml(s).toString()

    private fun open(url: String, cookie: String): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15000
        c.readTimeout = 30000
        c.setRequestProperty("User-Agent", UA)
        c.setRequestProperty("Accept-Language", "id-ID,id;q=0.9,en;q=0.8")
        if (cookie.isNotEmpty()) c.setRequestProperty("Cookie", cookie)
        return c
    }

    private fun read(c: HttpURLConnection): String {
        val code = c.responseCode
        if (code == 429) throw TranscriptException("YouTube membatasi permintaan (429). Tunggu sebentar lalu coba lagi.")
        if (code >= 400) throw IOException("HTTP $code dari YouTube")
        return c.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    private fun httpGet(url: String, cookie: String): String = read(open(url, cookie))

    private fun httpPost(url: String, json: String, cookie: String): String {
        val c = open(url, cookie)
        c.requestMethod = "POST"
        c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.outputStream.use { it.write(json.toByteArray(Charsets.UTF_8)) }
        return read(c)
    }
}
