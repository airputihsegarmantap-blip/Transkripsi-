package com.transkripku.app

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Akses jaringan untuk RheusInterface — hanya ke sumber data yang diizinkan. */
object Net {
    private val ALLOWED_HOSTS = setOf(
        "news.google.com",
        "www.cnbcindonesia.com",
        "feeds.bbci.co.uk",
        "www.reddit.com",
        "api.kraken.com",
        "api.coingecko.com",
        "api.alternative.me",
        "www.okx.com",
    )
    private const val MAX_BYTES = 3_000_000
    private const val UA =
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"

    fun get(url: String): String {
        var target = URL(url)
        repeat(5) {
            if (target.protocol != "https" || target.host !in ALLOWED_HOSTS) {
                throw IOException("Sumber tidak diizinkan: ${target.host}")
            }
            val c = target.openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.connectTimeout = 15000
            c.readTimeout = 30000
            c.setRequestProperty("User-Agent", UA)
            c.setRequestProperty("Accept-Language", "id-ID,id;q=0.9,en;q=0.8")
            val code = c.responseCode
            if (code in 300..399) {
                target = URL(target, c.getHeaderField("Location"))
                c.disconnect()
                return@repeat
            }
            if (code >= 400) throw IOException("Sumber membalas HTTP $code")
            c.inputStream.use { input ->
                val out = ByteArrayOutputStream()
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    if (out.size() > MAX_BYTES) throw IOException("Respons terlalu besar")
                }
                return out.toString("UTF-8")
            }
        }
        throw IOException("Terlalu banyak redirect")
    }
}
