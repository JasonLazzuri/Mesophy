package com.mesophy.signage

import android.app.ActivityManager
import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import timber.log.Timber
import java.io.File

/**
 * Content synchronization manager for Android TV digital signage client
 * 
 * Handles content sync with Mesophy backend, similar to Pi client architecture.
 * Manages schedules, playlists, and media downloads with offline capability.
 */
class ContentSyncManager(
    private val context: Context,
    private val mediaDownloadManager: MediaDownloadManager
) {
    
    companion object {
        private const val TAG = "ContentSyncManager"
        // Smart sync intervals with real-time support - much longer fallback intervals
        private const val INITIAL_SYNC_INTERVAL_MS = 60000L // 1 minute initially
        private const val REGULAR_SYNC_INTERVAL_MS = 1800000L // 30 minutes for regular fallback
        private const val MAX_SYNC_INTERVAL_MS = 3600000L // 1 hour maximum
        private const val RETRY_DELAY_MS = 30000L // 30 second retry delay
        private const val REALTIME_TRIGGER_SYNC_DELAY_MS = 2000L // 2 second delay after realtime notification
        private const val PREFS_NAME = "mesophy_config"
        // Number of syncs before moving to less frequent interval
        private const val SYNCS_BEFORE_BACKOFF = 2
        
        // Offline caching constants
        private const val CACHE_DIR = "content_cache"
        private const val SCHEDULES_CACHE_FILE = "schedules.json"
        private const val CURRENT_CONTENT_CACHE_FILE = "current_content.json"
        private const val CACHE_MAX_AGE_MS = 2592000000L // 30 days - allow device to work offline for weeks
        
        // Performance optimization constants
        private const val MEMORY_CLEANUP_INTERVAL_MS = 600000L // 10 minutes
        private const val LOW_MEMORY_THRESHOLD = 0.15f // 15% free memory threshold
        private const val CRITICAL_MEMORY_THRESHOLD = 0.10f // 10% critical threshold
    }
    
    private val apiClient = ApiClient()
    private val sharedPrefs: SharedPreferences = 
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val pollingManager = ContentPollingManager(context)
    
    private var syncJob: Job? = null
    private var isRunning = false
    private var isUnpairing = false
    private var listeners = mutableListOf<ContentSyncListener>()
    private var isPollingActive = false
    private var isOnline = true
    private var cacheDir: File
    
    // Content sync state
    private var lastSyncTime: Long = 0
    private var currentSchedules: List<Schedule> = emptyList()
    private var currentSyncStatus = ContentSyncStatus(
        isConnected = false,
        lastSyncTime = 0,
        schedulesCount = 0,
        mediaItemsCount = 0,
        downloadQueue = emptyList(),
        currentSchedule = null
    )
    
    // Smart sync state
    private var syncCount = 0
    private var currentSyncInterval = INITIAL_SYNC_INTERVAL_MS
    private var lastContentHash = ""
    private var consecutiveNoChanges = 0
    
    init {
        cacheDir = File(context.cacheDir, CACHE_DIR)
        if (!cacheDir.exists()) {
            cacheDir.mkdirs()
        }
        Timber.d("💾 Cache directory initialized: ${cacheDir.absolutePath}")
    }
    
    /**
     * Interface for content sync status updates
     */
    interface ContentSyncListener {
        fun onSyncStatusChanged(status: ContentSyncStatus)
        fun onContentAvailable(content: CurrentContentResponse)
        fun onSyncError(error: String)
    }
    
    /**
     * Reset unpairing state when device is successfully paired
     */
    fun resetUnpairingState() {
        isUnpairing = false
        Timber.d("🔄 Unpairing state reset - ContentSyncManager ready to start")
    }
    
    /**
     * Start content synchronization process
     */
    fun start() {
        if (isRunning) {
            Timber.w("ContentSyncManager already running")
            return
        }
        
        if (isUnpairing) {
            Timber.w("Device is being unpaired - ignoring start request")
            return
        }
        
        val deviceToken = getDeviceToken()
        if (deviceToken == null || deviceToken.isBlank()) {
            Timber.e("No device token found - device not paired")
            
            // Check if we have is_paired flag but missing token (corruption case)
            val isPaired = sharedPrefs.getBoolean("is_paired", false)
            if (isPaired) {
                Timber.e("🚨 DEVICE TOKEN CORRUPTION DETECTED - Device marked as paired but token is missing")
                // This indicates SharedPreferences corruption, not server-side unpairing
                // Reset pairing state to prevent confusion
                sharedPrefs.edit().putBoolean("is_paired", false).apply()
                
                // Notify listeners that device needs to be re-paired due to corruption
                listeners.forEach { listener ->
                    try {
                        listener.onSyncError("DEVICE_TOKEN_CORRUPTED")
                    } catch (e: Exception) {
                        Timber.e(e, "Error notifying listener of device token corruption")
                    }
                }
            } else {
                // Device was never paired or properly unpaired
                Timber.i("Device not paired - normal state")
            }
            return
        }
        
        isRunning = true
        Timber.i("🚀 Starting ContentSyncManager with polling-based notifications...")
        
        // Set up polling notification listener
        pollingManager.addListener(object : ContentPollingManager.NotificationListener {
            override fun onNotificationReceived(type: String, data: String) {
                handlePollingNotification(type, data)
            }
            
            override fun onConnectionStatusChanged(connected: Boolean) {
                isPollingActive = connected
                Timber.i("📡 Polling connection: ${if (connected) "Active" else "Inactive"}")
                
                if (connected) {
                    // Reset sync backoff when polling is active
                    consecutiveNoChanges = 0
                } 
            }
            
            override fun onError(error: String) {
                Timber.w("⚠️ Polling error: $error")
            }
        })
        
        // Start polling for real-time updates (15-30 second intervals)
        pollingManager.start()
        Timber.i("📡 Content polling enabled - reliable notification delivery active")
        
        // Start continuous sync loop with dynamic intervals (now as fallback)
        syncJob = CoroutineScope(Dispatchers.IO).launch {
            while (isRunning) {
                try {
                    performContentSync(deviceToken)
                    
                    // Calculate next sync interval based on activity
                    val nextInterval = calculateNextSyncInterval()
                    Timber.d("🕐 Next sync in ${nextInterval / 1000}s (consecutive no-changes: $consecutiveNoChanges)")
                    
                    delay(nextInterval)
                } catch (e: Exception) {
                    Timber.e(e, "❌ Error in sync loop")
                    notifyError("Sync error: ${e.message}")
                    delay(RETRY_DELAY_MS)
                }
            }
        }
    }
    
    /**
     * Stop content synchronization
     */
    fun stop() {
        isRunning = false
        syncJob?.cancel()
        pollingManager.stop()
        isPollingActive = false
        Timber.i("⏹️ ContentSyncManager stopped")
    }
    
    /**
     * Add content sync listener
     */
    fun addListener(listener: ContentSyncListener) {
        listeners.add(listener)
    }
    
    /**
     * Remove content sync listener
     */
    fun removeListener(listener: ContentSyncListener) {
        listeners.remove(listener)
    }
    
    /**
     * Get current sync status
     */
    fun getSyncStatus(): ContentSyncStatus = currentSyncStatus
    
    /**
     * Handle polling notification from server
     */
    private fun handlePollingNotification(type: String, data: String) {
        Timber.i("🔔 Polling notification: type=$type")
        Timber.d("   Data: $data")
        
        // Trigger immediate content sync after a short delay for any content-related updates
        if (type == "content_update" || type == "playlist_change" || type == "schedule_change" || type == "media_change") {
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    delay(REALTIME_TRIGGER_SYNC_DELAY_MS)
                    
                    val deviceToken = getDeviceToken() ?: return@launch
                    Timber.i("🚀 Triggering sync due to polling notification...")
                    
                    performContentSync(deviceToken)
                    
                    // Reset consecutive no-changes since we have new content
                    consecutiveNoChanges = 0
                    
                } catch (e: Exception) {
                    Timber.e(e, "❌ Failed to sync after polling notification")
                }
            }
        }
    }
    
    /**
     * Perform a single content synchronization cycle with offline fallback
     */
    private suspend fun performContentSync(deviceToken: String) {
        try {
            Timber.d("🔄 Starting content sync cycle...")
            
            // Try to sync with server
            val syncResponse = try {
                val response = apiClient.syncDeviceContent(deviceToken)
                isOnline = true
                updateSyncStatus(currentSyncStatus.copy(isConnected = true))

                // Cache successful response
                cacheSchedulesData(response)
                Timber.d("💾 Schedules cached successfully")

                response
            } catch (e: Exception) {
                Timber.w("⚠️ Network sync failed: ${e.message}")
                isOnline = false
                updateSyncStatus(currentSyncStatus.copy(isConnected = false))

                // ONLY unpair if device was explicitly deleted from database (404 error)
                // All other errors (401, network timeouts, server errors) should keep device paired
                val errorMessage = e.message?.lowercase() ?: ""
                val originalMessage = e.message ?: ""

                Timber.d("🔍 Error analysis: '$errorMessage'")

                when {
                    // 404 = Device token not found in database (device was deleted from portal)
                    errorMessage.contains("404") || errorMessage.contains("not found") -> {
                        Timber.e("🚨 DEVICE DELETED FROM DATABASE - HTTP 404 received")
                        Timber.e("   Device was removed from admin portal - unpairing device")
                        handleAuthenticationFailure()
                        throw e
                    }
                    // 401 with "invalid device token" or "unpaired" = pairing code was deleted/device was unpaired
                    errorMessage.contains("401") && (errorMessage.contains("invalid device token") || errorMessage.contains("unpaired")) -> {
                        Timber.e("🚨 DEVICE TOKEN INVALID OR UNPAIRED - HTTP 401 received")
                        Timber.e("   Pairing code was deleted or device_id was cleared - returning to pairing screen")
                        handleAuthenticationFailure()
                        throw e
                    }
                    // All other errors: stay paired and use cache
                    else -> {
                        when {
                            errorMessage.contains("401") ->
                                Timber.w("⚠️ 401 error - possible RLS policy issue, staying paired and using cache")
                            errorMessage.contains("403") ->
                                Timber.w("⚠️ 403 error - authorization issue, staying paired and using cache")
                            errorMessage.contains("timeout") ->
                                Timber.w("⚠️ Network timeout - staying paired and using cache")
                            errorMessage.contains("refused") ->
                                Timber.w("⚠️ Connection refused - server may be down, staying paired and using cache")
                            errorMessage.contains("500") ->
                                Timber.w("⚠️ Server error 500 - staying paired and using cache")
                            else ->
                                Timber.w("⚠️ Network error: $originalMessage - staying paired and using cache")
                        }

                        // Try to use cached content for offline operation
                        val cachedResponse = loadCachedSchedules()
                        if (cachedResponse != null) {
                            Timber.i("📱 OFFLINE MODE: Using cached schedules")
                            Timber.i("   Cache age: ${(System.currentTimeMillis() - File(cacheDir, SCHEDULES_CACHE_FILE).lastModified()) / 60000} minutes")
                            cachedResponse
                        } else {
                            Timber.w("❌ No cached data available - will retry on next sync cycle")
                            throw e
                        }
                    }
                }
            }
            
            // Successful sync - device is properly connected
            
            Timber.i("📊 Sync response received:")
            Timber.i("  • Screen: ${syncResponse.screenName}")
            Timber.i("  • Schedules: ${syncResponse.allSchedules.size}")
            Timber.i("  • Schedule changed: ${syncResponse.scheduleChanged}")
            Timber.i("  • Media changed: ${syncResponse.mediaChanged}")
            Timber.i("  • Power schedule: ${if (syncResponse.powerSchedule?.enabled == true) "enabled" else "disabled"}")
            
            // 2. Process power schedule updates
            syncResponse.powerSchedule?.let { powerSchedule ->
                processPowerScheduleUpdate(powerSchedule)
            }
            
            // 3. Check if content actually changed by comparing hash
            val contentHash = generateContentHash(syncResponse)
            val hasRealChanges = contentHash != lastContentHash
            
            if (hasRealChanges) {
                Timber.i("🔄 Content changes detected")
                consecutiveNoChanges = 0
                lastContentHash = contentHash
                
                // Update local schedules
                currentSchedules = syncResponse.allSchedules
                Timber.i("📅 Updated ${currentSchedules.size} schedules")
            } else {
                consecutiveNoChanges++
                Timber.d("➡️ No content changes (consecutive: $consecutiveNoChanges)")
            }
            
            // 3. Download any new/changed media only if there are real changes
            if (hasRealChanges && (syncResponse.mediaChanged || syncResponse.scheduleChanged)) {
                downloadScheduleMedia(syncResponse.allSchedules, deviceToken)
            }
            
            // 4. Get current content to display
            val screenId = getScreenId()
            if (screenId == null) {
                Timber.e("No screen ID found - device not properly paired")
                return
            }
            
            val currentContent = try {
                val content = apiClient.getCurrentContent(deviceToken, screenId)
                
                // Cache current content if online
                if (isOnline) {
                    cacheCurrentContent(content)
                    Timber.d("💾 Current content cached successfully")
                }
                
                content
            } catch (e: Exception) {
                if (!isOnline) {
                    // Try to load cached current content
                    val cachedContent = loadCachedCurrentContent()
                    if (cachedContent != null) {
                        Timber.i("📱 Using cached current content (offline mode)")
                        cachedContent
                    } else {
                        Timber.e("❌ No cached current content available")
                        throw e
                    }
                } else {
                    throw e
                }
            }
            
            Timber.i("🎬 Current content:")
            Timber.i("  • Schedule: ${currentContent.scheduleName ?: "None"}")
            Timber.i("  • Playlist: ${currentContent.playlist?.name ?: "None"}")
            Timber.i("  • Media items: ${currentContent.mediaAssets.size}")
            
            // 5. Update sync status
            val downloadQueue = mediaDownloadManager.getDownloadQueue()
            updateSyncStatus(ContentSyncStatus(
                isConnected = isOnline,
                lastSyncTime = System.currentTimeMillis(),
                schedulesCount = syncResponse.allSchedules.size,
                mediaItemsCount = currentContent.mediaAssets.size,
                downloadQueue = downloadQueue,
                currentSchedule = syncResponse.currentSchedule
            ))
            
            // 6. Notify listeners of available content
            notifyContentAvailable(currentContent)
            
            lastSyncTime = System.currentTimeMillis()
            
        } catch (e: Exception) {
            Timber.e(e, "❌ Content sync failed")
            isOnline = false
            updateSyncStatus(currentSyncStatus.copy(
                isConnected = false,
                error = e.message
            ))
            throw e
        }
    }
    
    /**
     * Cache schedules data to local storage
     */
    private fun cacheSchedulesData(syncResponse: SyncResponse) {
        try {
            val cacheFile = File(cacheDir, SCHEDULES_CACHE_FILE)
            val json = Json.encodeToString(syncResponse)
            cacheFile.writeText(json)
            Timber.d("💾 Schedules cached to: ${cacheFile.absolutePath}")
        } catch (e: Exception) {
            Timber.w("⚠️ Failed to cache schedules: ${e.message}")
        }
    }
    
    /**
     * Load cached schedules from local storage
     */
    private fun loadCachedSchedules(): SyncResponse? {
        return try {
            val cacheFile = File(cacheDir, SCHEDULES_CACHE_FILE)
            if (!cacheFile.exists()) {
                Timber.d("📱 No cached schedules found")
                return null
            }
            
            val ageMs = System.currentTimeMillis() - cacheFile.lastModified()
            val ageDays = ageMs / (1000 * 60 * 60 * 24)

            if (ageMs > CACHE_MAX_AGE_MS) {
                Timber.w("⏰ Cached schedules too old (${ageDays} days), ignoring")
                return null
            }

            Timber.i("📱 Cache age: ${ageDays} days old (max ${CACHE_MAX_AGE_MS / (1000 * 60 * 60 * 24)} days)")
            
            val json = cacheFile.readText()
            val cachedData = Json.decodeFromString<SyncResponse>(json)
            Timber.i("📱 Loaded cached schedules (age: ${ageMs / 60000} minutes)")
            cachedData
        } catch (e: Exception) {
            Timber.w("⚠️ Failed to load cached schedules: ${e.message}")
            null
        }
    }
    
    /**
     * Cache current content to local storage
     */
    private fun cacheCurrentContent(content: CurrentContentResponse) {
        try {
            val cacheFile = File(cacheDir, CURRENT_CONTENT_CACHE_FILE)
            val json = Json.encodeToString(content)
            cacheFile.writeText(json)
            Timber.d("💾 Current content cached to: ${cacheFile.absolutePath}")
        } catch (e: Exception) {
            Timber.w("⚠️ Failed to cache current content: ${e.message}")
        }
    }
    
    /**
     * Load cached current content from local storage
     */
    private fun loadCachedCurrentContent(): CurrentContentResponse? {
        return try {
            val cacheFile = File(cacheDir, CURRENT_CONTENT_CACHE_FILE)
            if (!cacheFile.exists()) {
                Timber.d("📱 No cached current content found")
                return null
            }
            
            val ageMs = System.currentTimeMillis() - cacheFile.lastModified()
            val ageDays = ageMs / (1000 * 60 * 60 * 24)

            if (ageMs > CACHE_MAX_AGE_MS) {
                Timber.w("⏰ Cached current content too old (${ageDays} days), ignoring")
                return null
            }

            Timber.i("📱 Cache age: ${ageDays} days old (max ${CACHE_MAX_AGE_MS / (1000 * 60 * 60 * 24)} days)")
            
            val json = cacheFile.readText()
            val cachedData = Json.decodeFromString<CurrentContentResponse>(json)
            Timber.i("📱 Loaded cached current content (age: ${ageMs / 60000} minutes)")
            cachedData
        } catch (e: Exception) {
            Timber.w("⚠️ Failed to load cached current content: ${e.message}")
            null
        }
    }
    
    /**
     * Get cached content for offline display
     */
    suspend fun getCachedContentForOfflineDisplay(): CurrentContentResponse? {
        return loadCachedCurrentContent()
    }
    
    /**
     * Check if app is currently in offline mode
     */
    fun isOfflineMode(): Boolean {
        return !isOnline
    }
    
    /**
     * Clear all cached data
     */
    fun clearCache() {
        try {
            val files = cacheDir.listFiles()
            files?.forEach { file ->
                file.delete()
                Timber.d("🗑️ Deleted cache file: ${file.name}")
            }
            Timber.i("🗑️ Cache cleared successfully")
        } catch (e: Exception) {
            Timber.w("⚠️ Failed to clear cache: ${e.message}")
        }
    }
    
    /**
     * Wipe all cached media files before downloading new playlist
     * This implements smart cache management - only current playlist media is kept
     */
    private fun wipeAllCachedMedia() {
        try {
            mediaDownloadManager.clearAllCachedMedia()
            Timber.i("🧹 Wiped all cached media files - preparing for fresh playlist download")
        } catch (e: Exception) {
            Timber.w("⚠️ Failed to wipe cached media: ${e.message}")
        }
    }
    
    /**
     * Download media for all schedules
     */
    private suspend fun downloadScheduleMedia(schedules: List<Schedule>, deviceToken: String) {
        try {
            // Smart cache management: wipe all cached media before downloading new playlist
            wipeAllCachedMedia()
            
            val allMediaAssets = mutableListOf<MediaAsset>()
            
            // Collect all media assets from all playlists
            schedules.forEach { schedule ->
                schedule.playlist?.items?.forEach { playlistItem ->
                    playlistItem.media?.let { media ->
                        allMediaAssets.add(media)
                    }
                }
            }
            
            if (allMediaAssets.isEmpty()) {
                Timber.w("No media assets found in schedules")
                return
            }
            
            Timber.i("📥 Queuing ${allMediaAssets.size} media assets for download")
            
            // Queue downloads with MediaDownloadManager
            allMediaAssets.forEach { mediaAsset ->
                mediaDownloadManager.queueDownload(mediaAsset, deviceToken)
            }
            
            // Start download process
            mediaDownloadManager.startDownloads()
            
        } catch (e: Exception) {
            Timber.e(e, "❌ Error downloading schedule media")
            throw e
        }
    }
    
    /**
     * Force immediate content sync
     */
    suspend fun forceSyncNow(): Boolean {
        return try {
            val deviceToken = getDeviceToken() ?: return false
            performContentSync(deviceToken)
            true
        } catch (e: Exception) {
            Timber.e(e, "❌ Force sync failed")
            false
        }
    }
    
    /**
     * Get current content for display with offline fallback
     */
    suspend fun getCurrentDisplayContent(): CurrentContentResponse? {
        return try {
            val deviceToken = getDeviceToken() ?: return getCachedContentForOfflineDisplay()
            val screenId = getScreenId() ?: return getCachedContentForOfflineDisplay()
            
            try {
                val content = apiClient.getCurrentContent(deviceToken, screenId)
                isOnline = true
                cacheCurrentContent(content)
                content
            } catch (e: Exception) {
                Timber.w("⚠️ Failed to get live content, trying cache: ${e.message}")
                isOnline = false
                getCachedContentForOfflineDisplay() ?: throw e
            }
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to get current content (live and cached)")
            null
        }
    }
    
    /**
     * Update sync status and notify listeners
     */
    private fun updateSyncStatus(status: ContentSyncStatus) {
        currentSyncStatus = status
        notifyStatusChanged(status)
    }
    
    /**
     * Notify listeners of status change
     */
    private fun notifyStatusChanged(status: ContentSyncStatus) {
        listeners.forEach { listener ->
            try {
                listener.onSyncStatusChanged(status)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying listener of status change")
            }
        }
    }
    
    /**
     * Notify listeners of available content
     */
    private fun notifyContentAvailable(content: CurrentContentResponse) {
        listeners.forEach { listener ->
            try {
                listener.onContentAvailable(content)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying listener of content")
            }
        }
    }
    
    /**
     * Notify listeners of sync error
     */
    private fun notifyError(error: String) {
        listeners.forEach { listener ->
            try {
                listener.onSyncError(error)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying listener of error")
            }
        }
    }
    
    /**
     * Handle authentication failure by clearing stored credentials and notifying MainActivity
     */
    private fun handleAuthenticationFailure() {
        Timber.i("🔧 AUTHENTICATION FAILURE DETECTED - Clearing credentials and returning to pairing mode")
        
        // Set flag to prevent recursive starts during unpairing process
        isUnpairing = true
        
        // Clear all stored authentication data immediately
        sharedPrefs.edit()
            .remove("device_token")
            .remove("screen_id")
            .remove("device_id")
            .remove("screen_name")
            .remove("api_base")
            .remove("is_paired")
            .apply()
        
        Timber.i("🗑️ Device credentials cleared successfully")
        
        // Clear any cached content
        try {
            val cacheDir = java.io.File(context.cacheDir, "content_cache")
            if (cacheDir.exists()) {
                cacheDir.deleteRecursively()
                Timber.d("🗑️ Content cache cleared")
            }
        } catch (e: Exception) {
            Timber.w("Failed to clear cache: ${e.message}")
        }
        
        // Stop the sync manager
        stop()
        
        // Notify listeners that device has been unpaired (MainActivity will handle transition)
        listeners.forEach { listener ->
            try {
                listener.onSyncError("DEVICE_UNPAIRED")
            } catch (e: Exception) {
                Timber.e(e, "Error notifying listener of device unpaired")
            }
        }
        
        Timber.i("📡 DEVICE UNPAIRED - MainActivity should now show pairing screen")
    }
    
    /**
     * Get saved device token from SharedPreferences
     */
    private fun getDeviceToken(): String? {
        return sharedPrefs.getString("device_token", null)
    }
    
    /**
     * Get saved screen ID from SharedPreferences
     */
    fun getScreenId(): String? {
        return sharedPrefs.getString("screen_id", null)
    }
    
    /**
     * Check if device is paired
     */
    fun isPaired(): Boolean {
        return sharedPrefs.getBoolean("is_paired", false) && getDeviceToken() != null
    }
    
    /**
     * Clear device configuration (unpair)
     */
    fun unpair() {
        with(sharedPrefs.edit()) {
            clear()
            apply()
        }
        stop()
        Timber.i("📱 Device unpaired - configuration cleared")
    }
    
    /**
     * Generate a hash of the content to detect real changes
     */
    private fun generateContentHash(syncResponse: SyncResponse): String {
        val hashContent = buildString {
            append("schedules:")
            syncResponse.allSchedules.forEach { schedule ->
                append("${schedule.id}:${schedule.name}:${schedule.startTime}:${schedule.endTime}:")
                schedule.playlist?.items?.forEach { item ->
                    append("${item.id}:${item.displayDuration}:${item.media?.id}:${item.media?.url}:")
                }
            }
            append("current:${syncResponse.currentSchedule?.id}")
        }
        return hashContent.hashCode().toString()
    }
    
    /**
     * Calculate next sync interval using exponential backoff and real-time status
     */
    private fun calculateNextSyncInterval(): Long {
        syncCount++
        
        return when {
            // If polling is active, use much longer intervals since it handles updates
            isPollingActive && consecutiveNoChanges >= 1 -> {
                Timber.d("Content polling active - using long fallback interval")
                MAX_SYNC_INTERVAL_MS // 1 hour fallback when polling is working
            }
            
            // First few syncs - check frequently for initial setup
            syncCount <= SYNCS_BEFORE_BACKOFF -> INITIAL_SYNC_INTERVAL_MS
            
            // Recent changes detected - sync more frequently
            consecutiveNoChanges == 0 -> INITIAL_SYNC_INTERVAL_MS
            
            // No polling active and no changes - use regular sync intervals
            consecutiveNoChanges <= 2 -> REGULAR_SYNC_INTERVAL_MS
            
            // No changes for 3+ syncs - exponential backoff
            else -> {
                val backoffMultiplier = minOf(consecutiveNoChanges - 2, 4) // Cap at 4x
                minOf(
                    REGULAR_SYNC_INTERVAL_MS * backoffMultiplier,
                    MAX_SYNC_INTERVAL_MS
                )
            }
        }.also { interval ->
            currentSyncInterval = interval
        }
    }
    
    /**
     * Perform memory optimization and cleanup
     */
    fun performMemoryOptimization() {
        try {
            Timber.i("🧠 Performing memory optimization...")
            
            // Force garbage collection
            System.gc()
            Runtime.getRuntime().gc()
            
            // Clean old cache files (older than 1 hour)
            val currentTime = System.currentTimeMillis()
            val files = cacheDir.listFiles()
            files?.forEach { file ->
                if (currentTime - file.lastModified() > 3600000L) { // 1 hour
                    file.delete()
                    Timber.d("🗑️ Deleted old cache file: ${file.name}")
                }
            }
            
            // Get memory info for logging
            val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val memInfo = ActivityManager.MemoryInfo()
            activityManager.getMemoryInfo(memInfo)
            val freeMemoryMB = memInfo.availMem / (1024 * 1024)
            val totalMemoryMB = memInfo.totalMem / (1024 * 1024)
            
            Timber.i("🧠 Memory optimization complete: ${freeMemoryMB}MB free of ${totalMemoryMB}MB total")
            
        } catch (e: Exception) {
            Timber.e(e, "❌ Memory optimization failed")
        }
    }
    
    /**
     * Check if device is in low memory state
     */
    fun isLowMemory(): Boolean {
        return try {
            val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val memInfo = ActivityManager.MemoryInfo()
            activityManager.getMemoryInfo(memInfo)
            
            val freePercentage = memInfo.availMem.toFloat() / memInfo.totalMem.toFloat()
            freePercentage < LOW_MEMORY_THRESHOLD || memInfo.lowMemory
        } catch (e: Exception) {
            Timber.w("Failed to check memory state: ${e.message}")
            false
        }
    }
    
    /**
     * Process power schedule updates from the server
     */
    private fun processPowerScheduleUpdate(powerSchedule: PowerSchedule) {
        try {
            Timber.i("🔌 Processing power schedule update:")
            Timber.i("  • Enabled: ${powerSchedule.enabled}")
            Timber.i("  • ON time: ${powerSchedule.onTime}")
            Timber.i("  • OFF time: ${powerSchedule.offTime}")
            Timber.i("  • Timezone: ${powerSchedule.timezone}")
            Timber.i("  • Energy saving: ${powerSchedule.energySaving}")
            Timber.i("  • Warning minutes: ${powerSchedule.warningMinutes}")
            
            // Update PowerScheduleManager via internal broadcast
            val intent = android.content.Intent("com.mesophy.signage.INTERNAL_POWER_SCHEDULE_UPDATE").apply {
                putExtra("schedule_enabled", powerSchedule.enabled)
                putExtra("schedule_on_time", powerSchedule.onTime)
                putExtra("schedule_off_time", powerSchedule.offTime)
                putExtra("schedule_timezone", powerSchedule.timezone)
                putExtra("schedule_energy_saving", powerSchedule.energySaving)
                putExtra("schedule_warning_minutes", powerSchedule.warningMinutes)
                putExtra("source", "content_sync")
                putExtra("last_updated", powerSchedule.lastUpdated)
            }
            context.sendBroadcast(intent)
            
            Timber.i("🔌 Power schedule broadcast sent successfully")
            
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to process power schedule update")
        }
    }
    
    /**
     * Check if ContentSyncManager is currently running
     */
    fun isRunning(): Boolean {
        return this.isRunning
    }
}