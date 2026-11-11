package com.transkripku.app

import android.content.Context
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

/**
 * LLM kecil yang berjalan sepenuhnya di HP (offline) memakai MediaPipe LLM Inference.
 *
 * Model diunduh SEKALI dari Hugging Face lalu disimpan di penyimpanan aplikasi.
 * Model bawaan: Qwen2.5 0.5B Instruct (open-source, lisensi Apache 2.0).
 */
class LocalLlm(private val context: Context) {

    companion object {
        const val MODEL_URL = BuildConfigUrls.MODEL_URL
        const val MODEL_NAME = "Qwen2.5 0.5B (offline)"
        const val MAX_TOKENS = 1280 // batas konteks file model (ekv1280)
    }

    private val modelFile = File(context.filesDir, "model.task")
    private val partFile = File(context.filesDir, "model.task.part")
    private val cancel = AtomicBoolean(false)
    @Volatile var downloading = false
        private set
    private var llm: LlmInference? = null

    fun isReady() = modelFile.exists() && modelFile.length() > 0
    fun sizeBytes() = if (isReady()) modelFile.length() else 0L

    /** Unduh model dengan laporan progres (byteTerunduh, totalByte; total -1 bila tidak diketahui). */
    fun download(onProgress: (Long, Long) -> Unit) {
        if (downloading) throw IOException("Unduhan sedang berjalan.")
        downloading = true
        cancel.set(false)
        try {
            var url = URL(MODEL_URL)
            var conn: HttpURLConnection
            var redirects = 0
            // Ikuti redirect secara manual (Hugging Face -> CDN beda host).
            while (true) {
                conn = url.openConnection() as HttpURLConnection
                conn.instanceFollowRedirects = false
                conn.connectTimeout = 20000
                conn.readTimeout = 60000
                val existing = if (partFile.exists()) partFile.length() else 0L
                if (existing > 0) conn.setRequestProperty("Range", "bytes=$existing-")
                val code = conn.responseCode
                if (code in 300..399 && redirects < 10) {
                    url = URL(url, conn.getHeaderField("Location"))
                    redirects++
                    conn.disconnect()
                    continue
                }
                if (code >= 400) throw IOException("Gagal mengunduh model (HTTP $code).")
                break
            }
            val resumed = conn.responseCode == 206
            var done = if (resumed) partFile.length() else 0L
            val len = conn.getHeaderField("Content-Length")?.toLongOrNull() ?: -1L
            val total = if (len > 0) len + done else -1L
            conn.inputStream.use { input ->
                java.io.FileOutputStream(partFile, resumed).use { out ->
                    val buf = ByteArray(256 * 1024)
                    var last = 0L
                    while (true) {
                        if (cancel.get()) throw IOException("Unduhan dibatalkan.")
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        done += n
                        if (done - last > 2_000_000) { onProgress(done, total); last = done }
                    }
                }
            }
            if (total > 0 && done < total) throw IOException("Unduhan terputus. Coba lagi untuk melanjutkan.")
            if (!partFile.renameTo(modelFile)) throw IOException("Gagal menyimpan model.")
            onProgress(done, total)
        } finally {
            downloading = false
        }
    }

    fun cancelDownload() = cancel.set(true)

    fun delete() {
        close()
        modelFile.delete()
        partFile.delete()
    }

    @Synchronized
    private fun engine(): LlmInference {
        llm?.let { return it }
        if (!isReady()) throw IOException("Model AI belum diunduh.")
        val options = LlmInference.LlmInferenceOptions.builder()
            .setModelPath(modelFile.absolutePath)
            .setMaxTokens(MAX_TOKENS)
            .build()
        return LlmInference.createFromOptions(context, options).also { llm = it }
    }

    /** Jalankan model (memblokir thread pemanggil). */
    @Synchronized
    fun generate(system: String, user: String): String {
        // Format chat Qwen (ChatML).
        val prompt = "<|im_start|>system\n$system<|im_end|>\n" +
            "<|im_start|>user\n$user<|im_end|>\n" +
            "<|im_start|>assistant\n"
        return engine().generateResponse(prompt)
            .replace("<|im_end|>", "")
            .trim()
    }

    @Synchronized
    fun close() {
        try { llm?.close() } catch (_: Exception) {}
        llm = null
    }
}
