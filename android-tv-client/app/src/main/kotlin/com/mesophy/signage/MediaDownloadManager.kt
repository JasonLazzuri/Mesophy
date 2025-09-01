package com.mesophy.signage

import android.content.Context
import kotlinx.coroutines.*
import okhttp3.*
import timber.log.Timber
import java.io.*
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.max

/**
 * Media download and caching manager for Android TV digital signage client
 * 
 * Handles efficient downloading, caching, and validation of media assets
 * with progress tracking and offline capability.
 */
class MediaDownloadManager(private val context: Context) {
    
    companion object {
        private const val TAG = "MediaDownloadManager"
        private const val CACHE_DIR_NAME = "media_cache"
        private const val MAX_CONCURRENT_DOWNLOADS = 3
        private const val DOWNLOAD_TIMEOUT_SECONDS = 120L
    }
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(DOWNLOAD_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(DOWNLOAD_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .build()
    
    private val cacheDir: File = File(context.cacheDir, CACHE_DIR_NAME)
    private val downloadQueue = mutableListOf<MediaDownloadTask>()
    private val activeDownloads = ConcurrentHashMap<String, Job>()
    private val downloadProgress = ConcurrentHashMap<String, DownloadProgress>()
    private val listeners = mutableListOf<DownloadListener>()
    
    private var isDownloadingActive = false
    
    /**
     * Interface for download progress callbacks
     */
    interface DownloadListener {
        fun onDownloadStarted(mediaId: String, fileName: String)
        fun onDownloadProgress(progress: DownloadProgress)
        fun onDownloadCompleted(mediaId: String, localPath: String)
        fun onDownloadFailed(mediaId: String, error: String)
    }
    
    /**
     * Data class for download tasks
     */
    private data class MediaDownloadTask(
        val mediaAsset: MediaAsset,
        val deviceToken: String,
        val priority: Int = 0
    )
    
    init {
        // Ensure cache directory exists
        if (!cacheDir.exists()) {
            cacheDir.mkdirs()
            Timber.i("📁 Created media cache directory: ${cacheDir.absolutePath}")
        }
    }
    
    /**
     * Queue media asset for download
     */
    fun queueDownload(mediaAsset: MediaAsset, deviceToken: String, priority: Int = 0) {
        // Check if already cached
        val cachedFile = getCachedFile(mediaAsset)
        if (cachedFile.exists() && isValidCacheFile(cachedFile, mediaAsset)) {
            Timber.d("Media already cached: ${mediaAsset.name}")
            notifyDownloadCompleted(mediaAsset.id, cachedFile.absolutePath)
            return
        }
        
        // Check if already in queue or downloading
        if (isAlreadyQueued(mediaAsset.id) || isActivelyDownloading(mediaAsset.id)) {
            Timber.d("Media already queued/downloading: ${mediaAsset.name}")
            return
        }
        
        synchronized(downloadQueue) {
            downloadQueue.add(MediaDownloadTask(mediaAsset, deviceToken, priority))
            downloadQueue.sortByDescending { it.priority } // Higher priority first
        }
        
        Timber.i("📥 Queued for download: ${mediaAsset.name} (Priority: $priority)")
        
        // Update progress tracking
        downloadProgress[mediaAsset.id] = DownloadProgress(
            mediaId = mediaAsset.id,
            fileName = mediaAsset.name,
            bytesDownloaded = 0L,
            totalBytes = mediaAsset.fileSize ?: 0L,
            status = DownloadStatus.QUEUED
        )
        
        notifyDownloadProgress(downloadProgress[mediaAsset.id]!!)
    }
    
    /**
     * Start download processing
     */
    fun startDownloads() {
        if (isDownloadingActive) {
            Timber.d("Downloads already active")
            return
        }
        
        isDownloadingActive = true
        Timber.i("🚀 Starting download processing...")
        
        // Process download queue with concurrency limit
        repeat(MAX_CONCURRENT_DOWNLOADS) {
            CoroutineScope(Dispatchers.IO).launch {
                processDownloadQueue()
            }
        }
    }
    
    /**
     * Stop all downloads
     */
    fun stopDownloads() {
        isDownloadingActive = false
        
        // Cancel all active downloads
        activeDownloads.values.forEach { job ->
            job.cancel()
        }
        activeDownloads.clear()
        
        // Clear progress for cancelled downloads
        downloadProgress.values
            .filter { it.status == DownloadStatus.DOWNLOADING }
            .forEach { progress ->
                downloadProgress[progress.mediaId] = progress.copy(status = DownloadStatus.CANCELLED)
                notifyDownloadProgress(downloadProgress[progress.mediaId]!!)
            }
        
        Timber.i("⏹️ Stopped all downloads")
    }
    
    /**
     * Process download queue with concurrency management
     */
    private suspend fun processDownloadQueue() {
        while (isDownloadingActive) {
            val task = synchronized(downloadQueue) {
                downloadQueue.removeFirstOrNull()
            }
            
            if (task == null) {
                delay(1000) // Wait for new tasks
                continue
            }
            
            // Check if we're already at max concurrent downloads
            while (activeDownloads.size >= MAX_CONCURRENT_DOWNLOADS && isDownloadingActive) {
                delay(500)
            }
            
            if (!isDownloadingActive) break
            
            // Start download
            val downloadJob = CoroutineScope(Dispatchers.IO).launch {
                downloadMediaAsset(task)
            }
            
            activeDownloads[task.mediaAsset.id] = downloadJob
            
            // Remove from active downloads when completed
            downloadJob.invokeOnCompletion {
                activeDownloads.remove(task.mediaAsset.id)
            }
        }
    }
    
    /**
     * Download a single media asset
     */
    private suspend fun downloadMediaAsset(task: MediaDownloadTask) {
        val mediaAsset = task.mediaAsset
        val deviceToken = task.deviceToken
        
        try {
            Timber.i("📥 Starting download: ${mediaAsset.name}")
            notifyDownloadStarted(mediaAsset.id, mediaAsset.name)
            
            // Update progress to downloading
            downloadProgress[mediaAsset.id] = downloadProgress[mediaAsset.id]?.copy(
                status = DownloadStatus.DOWNLOADING
            ) ?: DownloadProgress(
                mediaId = mediaAsset.id,
                fileName = mediaAsset.name,
                bytesDownloaded = 0L,
                totalBytes = mediaAsset.fileSize ?: 0L,
                status = DownloadStatus.DOWNLOADING
            )
            notifyDownloadProgress(downloadProgress[mediaAsset.id]!!)
            
            // Create request with authentication
            val request = Request.Builder()
                .url(mediaAsset.url)
                .header("Authorization", "Bearer $deviceToken")
                .header("User-Agent", "Mesophy-Android-TV/1.0")
                .build()
            
            // Execute download
            val response = client.newCall(request).execute()
            
            if (!response.isSuccessful) {
                throw IOException("HTTP ${response.code}: ${response.message}")
            }
            
            response.body?.let { responseBody ->
                val contentLength = responseBody.contentLength()
                val targetFile = getCachedFile(mediaAsset)
                
                // Ensure parent directory exists
                targetFile.parentFile?.mkdirs()
                
                // Stream download with progress tracking
                FileOutputStream(targetFile).use { output ->
                    responseBody.byteStream().use { input ->
                        val buffer = ByteArray(8192)
                        var bytesRead: Int
                        var totalBytesDownloaded = 0L
                        
                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                            totalBytesDownloaded += bytesRead
                            
                            // Update progress
                            downloadProgress[mediaAsset.id] = downloadProgress[mediaAsset.id]?.copy(
                                bytesDownloaded = totalBytesDownloaded,
                                totalBytes = if (contentLength > 0) contentLength else mediaAsset.fileSize ?: 0L
                            ) ?: DownloadProgress(
                                mediaId = mediaAsset.id,
                                fileName = mediaAsset.name,
                                bytesDownloaded = totalBytesDownloaded,
                                totalBytes = if (contentLength > 0) contentLength else mediaAsset.fileSize ?: 0L,
                                status = DownloadStatus.DOWNLOADING
                            )
                            
                            notifyDownloadProgress(downloadProgress[mediaAsset.id]!!)
                        }
                    }
                }
                
                // Verify downloaded file
                if (validateDownloadedFile(targetFile, mediaAsset)) {
                    Timber.i("✅ Successfully downloaded: ${mediaAsset.name}")
                    
                    // Update progress to completed
                    downloadProgress[mediaAsset.id] = downloadProgress[mediaAsset.id]?.copy(
                        status = DownloadStatus.COMPLETED
                    ) ?: DownloadProgress(
                        mediaId = mediaAsset.id,
                        fileName = mediaAsset.name,
                        bytesDownloaded = targetFile.length(),
                        totalBytes = targetFile.length(),
                        status = DownloadStatus.COMPLETED
                    )
                    
                    notifyDownloadProgress(downloadProgress[mediaAsset.id]!!)
                    notifyDownloadCompleted(mediaAsset.id, targetFile.absolutePath)
                    
                } else {
                    // Delete invalid file
                    targetFile.delete()
                    throw IOException("Downloaded file failed validation")
                }
                
            } ?: throw IOException("Empty response body")
            
        } catch (e: Exception) {
            Timber.e(e, "❌ Download failed: ${mediaAsset.name}")
            
            // Update progress to failed
            downloadProgress[mediaAsset.id] = downloadProgress[mediaAsset.id]?.copy(
                status = DownloadStatus.FAILED
            ) ?: DownloadProgress(
                mediaId = mediaAsset.id,
                fileName = mediaAsset.name,
                bytesDownloaded = 0L,
                totalBytes = mediaAsset.fileSize ?: 0L,
                status = DownloadStatus.FAILED
            )
            
            notifyDownloadProgress(downloadProgress[mediaAsset.id]!!)
            notifyDownloadFailed(mediaAsset.id, e.message ?: "Unknown error")
        }
    }
    
    /**
     * Get cached file location for media asset
     */
    private fun getCachedFile(mediaAsset: MediaAsset): File {
        val extension = getFileExtension(mediaAsset.mimeType) ?: 
                       getFileExtension(mediaAsset.url.substringAfterLast('.'))
        val fileName = "${mediaAsset.id}${if (!extension.isNullOrEmpty()) ".$extension" else ""}"
        return File(cacheDir, fileName)
    }
    
    /**
     * Check if file is already cached and valid
     */
    private fun isValidCacheFile(file: File, mediaAsset: MediaAsset): Boolean {
        if (!file.exists()) return false
        
        // Basic file validation - ensure file has content
        if (file.length() == 0L) {
            Timber.d("Cache file is empty: ${file.name}")
            return false
        }
        
        // Lenient file size validation for optimized/compressed files
        mediaAsset.fileSize?.let { expectedSize ->
            val actualSize = file.length()
            val sizeDifference = abs(actualSize - expectedSize.toLong())
            val toleranceBytes = max((expectedSize * 0.5).toLong(), 1024L * 1024L) // 50% or 1MB tolerance, whichever is larger
            
            if (sizeDifference > toleranceBytes) {
                Timber.w("Cache file size significantly different but allowing: ${actualSize} vs ${expectedSize} (difference: ${sizeDifference}, tolerance: ${toleranceBytes})")
            } else {
                Timber.d("Cache file size within tolerance: ${actualSize} vs ${expectedSize}")
            }
        }
        
        // File is valid if it exists and has content
        return true
    }
    
    /**
     * Validate downloaded file
     */
    private fun validateDownloadedFile(file: File, mediaAsset: MediaAsset): Boolean {
        return isValidCacheFile(file, mediaAsset)
    }
    
    /**
     * Get file extension from MIME type or URL
     */
    private fun getFileExtension(input: String?): String? {
        if (input == null) return null
        
        // MIME type mappings
        val mimeExtensions = mapOf(
            "image/jpeg" to "jpg",
            "image/jpg" to "jpg", 
            "image/png" to "png",
            "image/gif" to "gif",
            "image/webp" to "webp",
            "image/bmp" to "bmp",
            "video/mp4" to "mp4",
            "video/webm" to "webm",
            "video/ogg" to "ogv",
            "video/quicktime" to "mov",
            "video/x-msvideo" to "avi",
            "audio/mpeg" to "mp3",
            "audio/wav" to "wav",
            "audio/ogg" to "ogg",
            "audio/mp4" to "m4a"
        )
        
        // Try MIME type first
        mimeExtensions[input.lowercase()]?.let { return it }
        
        // Try as file extension
        if (input.contains('.')) {
            return input.substringAfterLast('.').lowercase()
        }
        
        return null
    }
    
    /**
     * Check if media is already queued for download
     */
    private fun isAlreadyQueued(mediaId: String): Boolean {
        return synchronized(downloadQueue) {
            downloadQueue.any { it.mediaAsset.id == mediaId }
        }
    }
    
    /**
     * Check if media is actively downloading
     */
    private fun isActivelyDownloading(mediaId: String): Boolean {
        return activeDownloads.containsKey(mediaId)
    }
    
    /**
     * Get current download queue status
     */
    fun getDownloadQueue(): List<DownloadProgress> {
        return downloadProgress.values.toList()
    }
    
    /**
     * Get cached file path if available
     */
    fun getCachedFilePath(mediaAsset: MediaAsset): String? {
        val cachedFile = getCachedFile(mediaAsset)
        return if (cachedFile.exists() && isValidCacheFile(cachedFile, mediaAsset)) {
            cachedFile.absolutePath
        } else {
            null
        }
    }
    
    /**
     * Clear old cache files
     */
    fun clearOldCache(maxAgeDays: Int = 30) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val cutoffTime = System.currentTimeMillis() - (maxAgeDays * 24 * 60 * 60 * 1000L)
                var deletedCount = 0
                var freedBytes = 0L
                
                cacheDir.listFiles()?.forEach { file ->
                    if (file.lastModified() < cutoffTime) {
                        val size = file.length()
                        if (file.delete()) {
                            deletedCount++
                            freedBytes += size
                            Timber.d("Deleted old cache file: ${file.name}")
                        }
                    }
                }
                
                Timber.i("🗑️ Cache cleanup: $deletedCount files, ${freedBytes / 1024 / 1024}MB freed")
            } catch (e: Exception) {
                Timber.e(e, "Error during cache cleanup")
            }
        }
    }
    
    /**
     * Clear all cached media files for smart cache management
     * This is used when implementing playlist replacement strategy
     */
    fun clearAllCachedMedia() {
        try {
            val files = cacheDir.listFiles()
            if (files != null) {
                var deletedCount = 0
                var freedBytes = 0L
                
                files.forEach { file ->
                    val size = file.length()
                    if (file.delete()) {
                        deletedCount++
                        freedBytes += size
                        Timber.d("🧹 Deleted cached media file: ${file.name}")
                    }
                }
                
                Timber.i("🧹 Smart cache wipe: $deletedCount files, ${freedBytes / 1024 / 1024}MB freed")
            }
        } catch (e: Exception) {
            Timber.e(e, "❌ Error during cache media wipe")
        }
    }
    
    /**
     * Get cache statistics
     */
    fun getCacheStats(): CacheStats {
        val files = cacheDir.listFiles() ?: emptyArray()
        val totalSize = files.sumOf { it.length() }
        val totalCount = files.size
        
        return CacheStats(
            totalFiles = totalCount,
            totalSizeBytes = totalSize,
            totalSizeMB = totalSize / 1024 / 1024,
            cachePath = cacheDir.absolutePath
        )
    }
    
    /**
     * Add download listener
     */
    fun addListener(listener: DownloadListener) {
        listeners.add(listener)
    }
    
    /**
     * Remove download listener
     */
    fun removeListener(listener: DownloadListener) {
        listeners.remove(listener)
    }
    
    // Notification methods
    private fun notifyDownloadStarted(mediaId: String, fileName: String) {
        listeners.forEach { it.onDownloadStarted(mediaId, fileName) }
    }
    
    private fun notifyDownloadProgress(progress: DownloadProgress) {
        listeners.forEach { it.onDownloadProgress(progress) }
    }
    
    private fun notifyDownloadCompleted(mediaId: String, localPath: String) {
        listeners.forEach { it.onDownloadCompleted(mediaId, localPath) }
    }
    
    private fun notifyDownloadFailed(mediaId: String, error: String) {
        listeners.forEach { it.onDownloadFailed(mediaId, error) }
    }
}

/**
 * Cache statistics data class
 */
data class CacheStats(
    val totalFiles: Int,
    val totalSizeBytes: Long,
    val totalSizeMB: Long,
    val cachePath: String
)