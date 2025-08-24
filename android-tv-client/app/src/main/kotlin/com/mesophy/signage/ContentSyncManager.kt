package com.mesophy.signage

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.*
import timber.log.Timber

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
        private const val SYNC_INTERVAL_MS = 60000L // 1 minute sync interval
        private const val RETRY_DELAY_MS = 30000L // 30 second retry delay
        private const val PREFS_NAME = "mesophy_config"
    }
    
    private val apiClient = ApiClient()
    private val sharedPrefs: SharedPreferences = 
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    
    private var syncJob: Job? = null
    private var isRunning = false
    private var listeners = mutableListOf<ContentSyncListener>()
    
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
    
    /**
     * Interface for content sync status updates
     */
    interface ContentSyncListener {
        fun onSyncStatusChanged(status: ContentSyncStatus)
        fun onContentAvailable(content: CurrentContentResponse)
        fun onSyncError(error: String)
    }
    
    /**
     * Start content synchronization process
     */
    fun start() {
        if (isRunning) {
            Timber.w("ContentSyncManager already running")
            return
        }
        
        val deviceToken = getDeviceToken()
        if (deviceToken == null) {
            Timber.e("No device token found - device not paired")
            notifyError("Device not paired - please restart pairing process")
            return
        }
        
        isRunning = true
        Timber.i("🚀 Starting ContentSyncManager...")
        
        // Start continuous sync loop
        syncJob = CoroutineScope(Dispatchers.IO).launch {
            while (isRunning) {
                try {
                    performContentSync(deviceToken)
                    delay(SYNC_INTERVAL_MS)
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
     * Perform a single content synchronization cycle
     */
    private suspend fun performContentSync(deviceToken: String) {
        try {
            Timber.d("🔄 Starting content sync cycle...")
            
            // Update connection status
            updateSyncStatus(currentSyncStatus.copy(isConnected = true))
            
            // 1. Sync device schedules and content
            val syncResponse = apiClient.syncDeviceContent(deviceToken)
            
            Timber.i("📊 Sync response received:")
            Timber.i("  • Screen: ${syncResponse.screenName}")
            Timber.i("  • Schedules: ${syncResponse.allSchedules.size}")
            Timber.i("  • Schedule changed: ${syncResponse.scheduleChanged}")
            Timber.i("  • Media changed: ${syncResponse.mediaChanged}")
            
            // 2. Update local schedules if changed
            if (syncResponse.scheduleChanged || currentSchedules.isEmpty()) {
                currentSchedules = syncResponse.allSchedules
                Timber.i("📅 Updated ${currentSchedules.size} schedules")
            }
            
            // 3. Download any new/changed media
            if (syncResponse.mediaChanged || syncResponse.scheduleChanged) {
                downloadScheduleMedia(syncResponse.allSchedules, deviceToken)
            }
            
            // 4. Get current content to display
            val screenId = getScreenId()
            if (screenId == null) {
                Timber.e("No screen ID found - device not properly paired")
                return
            }
            val currentContent = apiClient.getCurrentContent(deviceToken, screenId)
            
            Timber.i("🎬 Current content:")
            Timber.i("  • Schedule: ${currentContent.scheduleName ?: "None"}")
            Timber.i("  • Playlist: ${currentContent.playlist?.name ?: "None"}")
            Timber.i("  • Media items: ${currentContent.mediaAssets.size}")
            
            // 5. Update sync status
            val downloadQueue = mediaDownloadManager.getDownloadQueue()
            updateSyncStatus(ContentSyncStatus(
                isConnected = true,
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
            updateSyncStatus(currentSyncStatus.copy(
                isConnected = false,
                error = e.message
            ))
            throw e
        }
    }
    
    /**
     * Download media for all schedules
     */
    private suspend fun downloadScheduleMedia(schedules: List<Schedule>, deviceToken: String) {
        try {
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
     * Get current content for display
     */
    suspend fun getCurrentDisplayContent(): CurrentContentResponse? {
        return try {
            val deviceToken = getDeviceToken() ?: return null
            val screenId = getScreenId()
            if (screenId != null) {
                apiClient.getCurrentContent(deviceToken, screenId)
            } else {
                null
            }
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to get current content")
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
}