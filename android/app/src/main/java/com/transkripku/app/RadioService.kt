package com.transkripku.app

import android.app.PendingIntent
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Metadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.extractor.metadata.icy.IcyInfo
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.SettableFuture
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Pemutar radio SiLengkap: ExoPlayer (Media3) di layanan latar belakang.
 *
 * - Tetap berbunyi saat layar mati, dengan notifikasi & kontrol di layar kunci/headset.
 * - Mendukung MP3, AAC/AAC+, OGG, HLS (.m3u8), serta daftar putar .pls/.m3u (diurai dulu).
 * - Aliran http:// tidak diblokir (berbeda dengan pemutar di WebView).
 * - Sambung ulang otomatis bila sinyal putus: coba ulang bertahap (1–15 dtk), pindah ke alamat
 *   cadangan stasiun, dan langsung menyambung lagi saat internet kembali.
 * - Judul lagu yang sedang diputar (metadata ICY) dikirim ke tampilan.
 */
@OptIn(UnstableApi::class)
class RadioService : MediaSessionService() {

    private var session: MediaSession? = null
    private lateinit var player: ExoPlayer
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private var attempt = 0
    private var urlIndex = 0
    private var status = "idle"
    private var nowPlaying = ""
    private var netCallback: ConnectivityManager.NetworkCallback? = null

    override fun onCreate() {
        super.onCreate()
        val http = DefaultHttpDataSource.Factory()
            .setUserAgent("SiLengkap/2.0 (Android; Radio)")
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(10_000)
            .setReadTimeoutMs(20_000)
        val sources = DefaultMediaSourceFactory(this)
            .setDataSourceFactory(DefaultDataSource.Factory(this, http))
            .setLoadErrorHandlingPolicy(DefaultLoadErrorHandlingPolicy(6))
        player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(sources)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .setLoadControl(DefaultLoadControl.Builder().setBufferDurationsMs(15_000, 60_000, 2_000, 4_000).build())
            .build()
        player.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) = recover(error)
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) { attempt = 0; publish("playing") }
                else if (player.playbackState == Player.STATE_READY && !player.playWhenReady) publish("paused")
            }
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_BUFFERING && status != "reconnecting") publish("buffering")
                if (state == Player.STATE_ENDED && player.playWhenReady) recover(null) // aliran "habis" = putus
            }
            override fun onMetadata(metadata: Metadata) {
                for (i in 0 until metadata.length()) {
                    val e = metadata.get(i)
                    if (e is IcyInfo && !e.title.isNullOrBlank()) { nowPlaying = e.title!!.trim(); publish(status) }
                }
            }
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) { nowPlaying = ""; attempt = 0; urlIndex = 0 }
        })

        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        session = MediaSession.Builder(this, player)
            .setSessionActivity(open)
            .setCallback(object : MediaSession.Callback {
                // Controller tidak boleh mengirim alamat langsung (dibuang Media3 demi keamanan),
                // jadi alamat dibawa di requestMetadata lalu dipasang di sini (+ urai .pls/.m3u).
                override fun onAddMediaItems(
                    mediaSession: MediaSession, controller: MediaSession.ControllerInfo, mediaItems: MutableList<MediaItem>,
                ): ListenableFuture<MutableList<MediaItem>> {
                    val f = SettableFuture.create<MutableList<MediaItem>>()
                    io.execute {
                        try { f.set(mediaItems.map { build(it, 0) }.toMutableList()) } catch (e: Exception) { f.setException(e) }
                    }
                    return f
                }
            })
            .build()
        watchNetwork()
    }

    private fun urlsOf(item: MediaItem): List<String> {
        val extras = item.mediaMetadata.extras ?: item.requestMetadata.extras
        val list = extras?.getStringArrayList("urls")?.filter { it.isNotBlank() }
        return if (!list.isNullOrEmpty()) list else listOfNotNull(item.requestMetadata.mediaUri?.toString() ?: item.localConfiguration?.uri?.toString())
    }

    /** Buat MediaItem yang bisa diputar dari alamat ke-[index] (dipanggil di thread latar). */
    private fun build(item: MediaItem, index: Int): MediaItem {
        val urls = urlsOf(item)
        val raw = urls.getOrElse(index) { urls.first() }
        val url = resolvePlaylist(raw)
        val hls = url.contains(".m3u8", true) || (item.mediaMetadata.extras?.getBoolean("hls") == true && index == 0)
        val extras = Bundle(item.mediaMetadata.extras ?: item.requestMetadata.extras ?: Bundle())
        extras.putStringArrayList("urls", ArrayList(urls))
        return item.buildUpon()
            .setUri(url)
            .setMimeType(if (hls) MimeTypes.APPLICATION_M3U8 else null)
            .setMediaMetadata(item.mediaMetadata.buildUpon().setExtras(extras).build())
            .build()
    }

    /** Alamat .pls / .m3u (bukan HLS) berisi daftar aliran: ambil aliran pertama. */
    private fun resolvePlaylist(url: String): String {
        val path = Uri.parse(url).path?.lowercase() ?: return url
        if (!(path.endsWith(".pls") || path.endsWith(".m3u"))) return url
        return try {
            val c = URL(url).openConnection() as HttpURLConnection
            c.connectTimeout = 6000; c.readTimeout = 6000
            c.setRequestProperty("User-Agent", "SiLengkap/2.0 (Android; Radio)")
            val body = c.inputStream.bufferedReader().use { it.readText().take(20_000) }
            c.disconnect()
            Regex("(?im)^(?:File\\d+=)?\\s*(https?://\\S+)").find(body)?.groupValues?.get(1) ?: url
        } catch (_: Exception) { url }
    }

    private fun recover(error: PlaybackException?) {
        val item = player.currentMediaItem ?: return publish("error", "Stasiun tidak bisa diputar.")
        if (error?.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
            player.seekToDefaultPosition(); player.prepare(); return
        }
        val urls = urlsOf(item)
        if (attempt >= MAX_ATTEMPTS) {
            return publish("error", when (error?.errorCode) {
                PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
                PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT -> "Koneksi terputus. Radio akan menyambung lagi saat internet kembali."
                PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS,
                PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND -> "Stasiun sedang tidak siaran. Coba stasiun lain."
                PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED,
                PlaybackException.ERROR_CODE_DECODER_INIT_FAILED -> "Format siaran stasiun ini tidak didukung."
                else -> "Stasiun tidak bisa diputar. Coba stasiun lain."
            })
        }
        attempt++
        // Setiap 2 kali gagal di alamat yang sama, pindah ke alamat cadangan (bila ada).
        if (attempt % 2 == 0 && urls.size > 1) urlIndex = (urlIndex + 1) % urls.size
        publish("reconnecting")
        val delay = BACKOFF_MS[minOf(attempt - 1, BACKOFF_MS.size - 1)]
        val idx = urlIndex
        main.postDelayed({
            if (player.currentMediaItem?.mediaId != item.mediaId || !player.playWhenReady) return@postDelayed
            io.execute {
                val next = try { build(item, idx) } catch (_: Exception) { item }
                main.post {
                    if (player.currentMediaItem?.mediaId != item.mediaId) return@post
                    player.setMediaItem(next)
                    player.prepare()
                    player.play()
                }
            }
        }, delay)
    }

    /** Saat internet kembali dan radio sedang menunggu, langsung sambung lagi. */
    private fun watchNetwork() {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                main.post {
                    if (player.playWhenReady && (status == "error" || status == "reconnecting") && player.currentMediaItem != null) {
                        attempt = 0
                        player.prepare(); player.play()
                        publish("reconnecting")
                    }
                }
            }
        }
        try { cm.registerDefaultNetworkCallback(cb); netCallback = cb } catch (_: Exception) {}
    }

    private fun publish(state: String, message: String = "") {
        status = state
        val b = Bundle()
        b.putString("state", state)
        b.putString("message", message)
        b.putString("nowPlaying", nowPlaying)
        b.putInt("attempt", attempt)
        b.putString("stationId", player.currentMediaItem?.mediaId ?: "")
        session?.setSessionExtras(b)
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val p = session?.player
        if (p == null || !p.playWhenReady || p.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        netCallback?.let { try { getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(it) } catch (_: Exception) {} }
        main.removeCallbacksAndMessages(null)
        session?.run { player.release(); release() }
        session = null
        io.shutdownNow()
        super.onDestroy()
    }

    companion object {
        private const val MAX_ATTEMPTS = 8
        private val BACKOFF_MS = longArrayOf(1_000, 2_000, 3_000, 5_000, 8_000, 12_000, 15_000, 15_000)
    }
}
