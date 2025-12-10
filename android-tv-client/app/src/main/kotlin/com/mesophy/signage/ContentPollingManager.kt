package com.mesophy.signage

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import timber.log.Timber
import java.io.IOException
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit

/**
 * Content Polling Manager - Reliable notification system for Android TV
 * 
 * Replaces the failing SSE system with battle-tested HTTP polling.
 * This approach is used by enterprise digital signage systems like
 * BrightSign, Samsung VXT, and LG webOS platforms.
 * 
 * Benefits over SSE:
 * - Works on any network configuration
 * - Survives Android TV sleep/wake cycles
 * - Simple error handling and retry logic
 * - No persistent connection management
 * - Guaranteed delivery within polling interval
 */
class ContentPollingManager(private val context: Context) {
    
    companion object {
        private const val TAG = "ContentPollingManager"
        private const val PREFS_NAME = "mesophy_config"
        private const val DEFAULT_POLL_INTERVAL_MS = 15000L // 15 seconds
        private const val ERROR_POLL_INTERVAL_MS = 30000L   // 30 seconds on error
        private const val MAX_ERROR_BACKOFF_MS = 120000L    // 2 minutes max
        private const val CONNECTION_TIMEOUT_SECONDS = 15L
        private const val READ_TIMEOUT_SECONDS = 15L
    }
    
    @Serializable
    data class PollingResponse(
        val success: Boolean,
        val timestamp: String,
        val screen_id: String,
        val notifications: List<NotificationItem>,
        val has_updates: Boolean,
        val processed_count: Int,
        val polling_interval_seconds: Int,
        val method: String
    )
    
    @Serializable
    data class NotificationItem(
        val id: String,
        val change_type: String,
        val change_timestamp: String,
        val change_data: kotlinx.serialization.json.JsonObject
    )
    
    private val sharedPrefs: SharedPreferences = 
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    
    private val json = Json { 
        ignoreUnknownKeys = true
        coerceInputValues = true
    }
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(CONNECTION_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .writeTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .build()
    
    private var pollingJob: Job? = null
    private var isRunning = false
    private var currentPollInterval = DEFAULT_POLL_INTERVAL_MS
    private var errorCount = 0
    private var lastSuccessfulPoll: Long = 0
    private var listeners = CopyOnWriteArrayList<NotificationListener>()
    
    /**
     * Interface for notification callbacks
     */
    interface NotificationListener {
        fun onNotificationReceived(type: String, data: String)
        fun onConnectionStatusChanged(isConnected: Boolean)
        fun onError(error: String)
    }
    
    /**
     * Start content polling
     */
    fun start() {
        if (isRunning) {
            Timber.w("Content polling already running")
            return
        }
        
        val deviceToken = getDeviceToken()
        val screenId = getScreenId()
        val apiBase = getApiBase()
        
        if (deviceToken == null || screenId == null || apiBase == null) {
            Timber.e("❌ CRITICAL: Missing configuration for content polling")
            Timber.e("  - Device Token: ${if (deviceToken != null) "✅" else "❌"}")
            Timber.e("  - Screen ID: ${if (screenId != null) "✅" else "❌"}")
            Timber.e("  - API Base: ${if (apiBase != null) "✅" else "❌"}")
            notifyError("Content notifications not configured")
            return
        }
        
        isRunning = true
        errorCount = 0
        currentPollInterval = DEFAULT_POLL_INTERVAL_MS
        
        Timber.i("🚀 STARTING CONTENT POLLING")
        Timber.i("  - Screen: $screenId")
        Timber.i("  - Interval: ${currentPollInterval}ms")
        Timber.i("  - API Base: $apiBase")
        
        // Start polling coroutine
        pollingJob = CoroutineScope(Dispatchers.IO).launch {
            while (isActive && isRunning) {
                try {
                    pollForUpdates(apiBase, deviceToken, screenId)
                    
                    // Reset error count on success
                    if (errorCount > 0) {
                        errorCount = 0
                        currentPollInterval = DEFAULT_POLL_INTERVAL_MS
                        Timber.i("✅ Polling recovered, reset to normal interval")
                        notifyConnectionStatus(true)
                    }
                    
                    lastSuccessfulPoll = System.currentTimeMillis()
                    
                } catch (e: Exception) {
                    handlePollingError(e)
                }
                
                // Wait for next poll with current interval
                delay(currentPollInterval)
            }
        }
    }
    
    /**
     * Stop content polling
     */
    fun stop() {
        isRunning = false
        pollingJob?.cancel()
        pollingJob = null
        
        notifyConnectionStatus(false)
        Timber.i("⏹️ Content polling stopped")
    }
    
    /**
     * Poll the server for content updates
     */
    private suspend fun pollForUpdates(apiBase: String, deviceToken: String, screenId: String) {
        val url = "$apiBase/api/devices/notifications/poll"
        
        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $deviceToken")
            .header("X-Screen-ID", screenId)
            .header("Accept", "application/json")
            .build()
        
        Timber.d("📡 Polling for updates: $url")
        
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("HTTP ${response.code}: ${response.message}")
            }
            
            val responseBody = response.body?.string()
            if (responseBody.isNullOrEmpty()) {
                throw IOException("Empty response from server")
            }
            
            val pollingResponse = json.decodeFromString<PollingResponse>(responseBody)
            
            Timber.d("📊 Poll response: ${pollingResponse.notifications.size} notifications")
            
            // Update polling interval based on server recommendation
            if (pollingResponse.polling_interval_seconds > 0) {
                val recommendedInterval = pollingResponse.polling_interval_seconds * 1000L
                if (recommendedInterval != currentPollInterval) {
                    currentPollInterval = recommendedInterval
                    Timber.d("🔄 Updated polling interval to ${currentPollInterval}ms")
                }
            }
            
            // Process notifications
            if (pollingResponse.has_updates && pollingResponse.notifications.isNotEmpty()) {
                Timber.i("🔔 RECEIVED ${pollingResponse.notifications.size} CONTENT NOTIFICATIONS")
                
                pollingResponse.notifications.forEach { notification ->
                    Timber.i("📲 Processing ${notification.change_type} notification")
                    Timber.d("  - ID: ${notification.id}")
                    Timber.d("  - Timestamp: ${notification.change_timestamp}")
                    Timber.d("  - Data: ${notification.change_data}")
                    
                    try {
                        notifyNotificationReceived(
                            notification.change_type,
                            notification.change_data.toString()
                        )
                        Timber.i("✅ Successfully processed notification ${notification.id}")
                    } catch (e: Exception) {
                        Timber.e(e, "❌ Failed to process notification ${notification.id}")
                    }
                }
            } else {
                Timber.d("📭 No new notifications")
            }
        }
    }
    
    /**
     * Handle polling errors with exponential backoff
     */
    private fun handlePollingError(error: Exception) {
        errorCount++
        
        Timber.e(error, "❌ Polling error #$errorCount")
        
        // Exponential backoff with max limit
        currentPollInterval = minOf(
            ERROR_POLL_INTERVAL_MS * (1 shl minOf(errorCount - 1, 3)), // 2^n with max 2^3
            MAX_ERROR_BACKOFF_MS
        )
        
        Timber.w("⚠️ Increased polling interval to ${currentPollInterval}ms")
        
        // Classify error type
        when {
            error.message?.contains("timeout") == true -> 
                Timber.e("🚨 NETWORK TIMEOUT detected")
            error.message?.contains("refused") == true -> 
                Timber.e("🚨 CONNECTION REFUSED - server may be down")
            error.message?.contains("401") == true -> 
                Timber.e("🚨 AUTHENTICATION FAILED - device token may be invalid")
            error.message?.contains("404") == true -> 
                Timber.e("🚨 ENDPOINT NOT FOUND - API may not be deployed")
            error is IOException -> 
                Timber.e("🚨 NETWORK IO ERROR: ${error.message}")
            else -> 
                Timber.e("🚨 UNKNOWN ERROR: ${error.javaClass.simpleName}")
        }
        
        notifyConnectionStatus(false)
        notifyError("Polling failed: ${error.message}")
        
        // Log warning for many consecutive errors but keep polling
        if (errorCount >= 10) {
            Timber.w("⚠️ Many consecutive errors (${errorCount}) - network may be down, continuing to poll...")
            // Don't stop - keep trying indefinitely with max backoff interval
        }
    }
    
    /**
     * Check if polling is active
     */
    fun isRunning(): Boolean {
        return isRunning && pollingJob?.isActive == true
    }
    
    /**
     * Get current status information
     */
    fun getStatus(): String {
        val timeSinceLastPoll = if (lastSuccessfulPoll > 0) {
            (System.currentTimeMillis() - lastSuccessfulPoll) / 1000
        } else {
            -1
        }
        
        return buildString {
            appendLine("=== CONTENT POLLING STATUS ===")
            appendLine("Running: $isRunning")
            appendLine("Job Active: ${pollingJob?.isActive}")
            appendLine("Poll Interval: ${currentPollInterval}ms")
            appendLine("Error Count: $errorCount")
            appendLine("Last Success: ${if (timeSinceLastPoll >= 0) "${timeSinceLastPoll}s ago" else "Never"}")
            appendLine("Screen ID: ${getScreenId() ?: "Not configured"}")
            appendLine("API Base: ${getApiBase() ?: "Not configured"}")
            appendLine("Listeners: ${listeners.size}")
        }
    }
    
    /**
     * Add notification listener
     */
    fun addListener(listener: NotificationListener) {
        listeners.add(listener)
    }
    
    /**
     * Remove notification listener  
     */
    fun removeListener(listener: NotificationListener) {
        listeners.remove(listener)
    }
    
    // Notification helper methods
    private fun notifyNotificationReceived(type: String, data: String) {
        listeners.forEach { listener ->
            try {
                listener.onNotificationReceived(type, data)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying listener of notification")
            }
        }
    }
    
    private fun notifyConnectionStatus(connected: Boolean) {
        listeners.forEach { listener ->
            try {
                listener.onConnectionStatusChanged(connected)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying listener of connection status")
            }
        }
    }
    
    private fun notifyError(error: String) {
        listeners.forEach { listener ->
            try {
                listener.onError(error)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying listener of error")
            }
        }
    }
    
    // Configuration helper methods
    private fun getDeviceToken(): String? {
        return sharedPrefs.getString("device_token", null)
    }
    
    private fun getScreenId(): String? {
        return sharedPrefs.getString("screen_id", null)
    }
    
    private fun getApiBase(): String? {
        return sharedPrefs.getString("api_base", "https://mesophy.vercel.app")
    }
}