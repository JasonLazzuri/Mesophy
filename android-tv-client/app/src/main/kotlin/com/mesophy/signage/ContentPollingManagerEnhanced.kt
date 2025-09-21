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
import java.util.concurrent.TimeUnit

/**
 * Enhanced Content Polling Manager - Restaurant-Hours Adaptive Polling
 * 
 * Supports dynamic polling intervals based on restaurant operating hours:
 * - 6 AM - 10 AM: 15-second polling (prep time)
 * - 10 AM - 12 PM: 30-45 second polling (setup time)  
 * - 12 PM - 6 AM: 15-minute polling (service + overnight)
 * - Emergency override: 15-second polling for urgent updates
 */
class ContentPollingManagerEnhanced(private val context: Context) {
    
    companion object {
        private const val TAG = "ContentPollingManagerEnhanced"
        private const val PREFS_NAME = "mesophy_config"
        private const val DEFAULT_POLL_INTERVAL_MS = 15000L // 15 seconds fallback
        private const val ERROR_POLL_INTERVAL_MS = 30000L   // 30 seconds on error
        private const val MAX_ERROR_BACKOFF_MS = 120000L    // 2 minutes max
        private const val SCHEDULE_CHECK_INTERVAL_MS = 1800000L // 30 minutes
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
        val polling_interval_seconds: Int? = null,
        val method: String
    )
    
    @Serializable
    data class NotificationItem(
        val id: String,
        val change_type: String,
        val change_timestamp: String,
        val change_data: kotlinx.serialization.json.JsonObject
    )
    
    @Serializable
    data class PollingScheduleResponse(
        val success: Boolean,
        val polling_schedule: PollingSchedule,
        val device_id: String,
        val timestamp: String,
        val fallback_mode: Boolean
    )
    
    @Serializable
    data class PollingSchedule(
        val interval_seconds: Int,
        val is_emergency: Boolean,
        val current_period_name: String,
        val timezone: String,
        val next_schedule_check: String? = null
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
    private var scheduleCheckJob: Job? = null
    private var isRunning = false
    private var currentPollInterval = DEFAULT_POLL_INTERVAL_MS
    private var errorCount = 0
    private var lastSuccessfulPoll: Long = 0
    private var lastScheduleCheck: Long = 0
    private var currentSchedule: PollingSchedule? = null
    private var listeners = mutableListOf<NotificationListener>()
    
    /**
     * Interface for notification callbacks
     */
    interface NotificationListener {
        fun onNotificationReceived(type: String, data: String)
        fun onConnectionStatusChanged(isConnected: Boolean)
        fun onError(error: String)
        fun onScheduleChanged(newInterval: Int, periodName: String, isEmergency: Boolean)
    }
    
    /**
     * Start adaptive content polling
     */
    fun start() {
        if (isRunning) {
            Timber.w("Enhanced content polling already running")
            return
        }
        
        val deviceToken = getDeviceToken()
        val screenId = getScreenId()
        val apiBase = getApiBase()
        
        if (deviceToken == null || screenId == null || apiBase == null) {
            Timber.e("❌ CRITICAL: Missing configuration for adaptive polling")
            Timber.e("  - Device Token: ${if (deviceToken != null) "✅" else "❌"}")
            Timber.e("  - Screen ID: ${if (screenId != null) "✅" else "❌"}")
            Timber.e("  - API Base: ${if (apiBase != null) "✅" else "❌"}")
            notifyError("Adaptive polling not configured")
            return
        }
        
        isRunning = true
        errorCount = 0
        currentPollInterval = DEFAULT_POLL_INTERVAL_MS
        
        Timber.i("🚀 STARTING ADAPTIVE CONTENT POLLING")
        Timber.i("  - Screen: $screenId")
        Timber.i("  - API Base: $apiBase")
        Timber.i("  - Features: Restaurant-hours scheduling, Emergency override")
        
        // Start schedule checking coroutine
        scheduleCheckJob = CoroutineScope(Dispatchers.IO).launch {
            while (isActive && isRunning) {
                try {
                    fetchPollingSchedule(apiBase, deviceToken, screenId)
                    delay(SCHEDULE_CHECK_INTERVAL_MS)
                } catch (e: Exception) {
                    Timber.w(e, "Schedule check failed, will retry in ${SCHEDULE_CHECK_INTERVAL_MS}ms")
                    delay(SCHEDULE_CHECK_INTERVAL_MS)
                }
            }
        }
        
        // Start polling coroutine
        pollingJob = CoroutineScope(Dispatchers.IO).launch {
            // Initial schedule fetch
            try {
                fetchPollingSchedule(apiBase, deviceToken, screenId)
            } catch (e: Exception) {
                Timber.w(e, "Initial schedule fetch failed, using default interval")
            }
            
            while (isActive && isRunning) {
                try {
                    pollForUpdates(apiBase, deviceToken, screenId)
                    
                    // Reset error count on success
                    if (errorCount > 0) {
                        errorCount = 0
                        Timber.i("✅ Polling recovered, reset error count")
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
     * Stop adaptive content polling
     */
    fun stop() {
        isRunning = false
        pollingJob?.cancel()
        scheduleCheckJob?.cancel()
        pollingJob = null
        scheduleCheckJob = null
        
        notifyConnectionStatus(false)
        Timber.i("⏹️ Adaptive content polling stopped")
    }
    
    /**
     * Fetch current polling schedule from server
     */
    private suspend fun fetchPollingSchedule(apiBase: String, deviceToken: String, screenId: String) {
        val url = "$apiBase/api/devices/polling-schedule"
        
        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $deviceToken")
            .header("X-Screen-ID", screenId)
            .header("Accept", "application/json")
            .build()
        
        Timber.d("📅 Fetching polling schedule: $url")
        
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Schedule fetch HTTP ${response.code}: ${response.message}")
            }
            
            val responseBody = response.body?.string()
            if (responseBody.isNullOrEmpty()) {
                throw IOException("Empty schedule response from server")
            }
            
            val scheduleResponse = json.decodeFromString<PollingScheduleResponse>(responseBody)
            
            if (!scheduleResponse.success) {
                throw IOException("Server returned schedule error")
            }
            
            val newSchedule = scheduleResponse.polling_schedule
            val newIntervalMs = newSchedule.interval_seconds * 1000L
            
            // Check if schedule changed
            val scheduleChanged = currentSchedule?.let { current ->
                current.interval_seconds != newSchedule.interval_seconds ||
                current.is_emergency != newSchedule.is_emergency ||
                current.current_period_name != newSchedule.current_period_name
            } ?: true
            
            if (scheduleChanged) {
                val oldInterval = currentPollInterval
                currentPollInterval = newIntervalMs
                currentSchedule = newSchedule
                lastScheduleCheck = System.currentTimeMillis()
                
                Timber.i("📅 SCHEDULE UPDATE:")
                Timber.i("  - Period: ${newSchedule.current_period_name}")
                Timber.i("  - Interval: ${newSchedule.interval_seconds}s (was ${oldInterval/1000}s)")
                Timber.i("  - Emergency: ${newSchedule.is_emergency}")
                Timber.i("  - Timezone: ${newSchedule.timezone}")
                
                if (scheduleResponse.fallback_mode) {
                    Timber.w("⚠️ Server using fallback mode")
                }
                
                notifyScheduleChanged(
                    newSchedule.interval_seconds, 
                    newSchedule.current_period_name, 
                    newSchedule.is_emergency
                )
            } else {
                Timber.d("📅 Schedule unchanged: ${newSchedule.current_period_name} (${newSchedule.interval_seconds}s)")
            }
        }
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
            
            // Server can still override interval via polling response for quick adjustments
            pollingResponse.polling_interval_seconds?.let { serverInterval ->
                val serverIntervalMs = serverInterval * 1000L
                if (serverIntervalMs != currentPollInterval) {
                    Timber.d("🔄 Server override: updating interval to ${serverInterval}s")
                    currentPollInterval = serverIntervalMs
                }
            }
            
            // Process notifications
            if (pollingResponse.has_updates && pollingResponse.notifications.isNotEmpty()) {
                val emergencyTag = if (currentSchedule?.is_emergency == true) " [EMERGENCY]" else ""
                val periodTag = currentSchedule?.current_period_name?.let { " [$it]" } ?: ""
                
                Timber.i("🔔 RECEIVED ${pollingResponse.notifications.size} NOTIFICATIONS${emergencyTag}${periodTag}")
                
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
        
        // Use error backoff only, don't override scheduled intervals
        val errorInterval = minOf(
            ERROR_POLL_INTERVAL_MS * (1 shl minOf(errorCount - 1, 3)),
            MAX_ERROR_BACKOFF_MS
        )
        
        // Temporarily use error interval, but restore scheduled interval on next success
        val originalInterval = currentPollInterval
        currentPollInterval = errorInterval
        
        Timber.w("⚠️ Using error backoff interval: ${currentPollInterval}ms (scheduled: ${originalInterval}ms)")
        
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
        notifyError("Adaptive polling failed: ${error.message}")
        
        // Log warning for many consecutive errors but keep polling
        if (errorCount >= 10) {
            Timber.w("⚠️ Many consecutive errors (${errorCount}) - network may be down, continuing adaptive polling...")
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
        
        val timeSinceScheduleCheck = if (lastScheduleCheck > 0) {
            (System.currentTimeMillis() - lastScheduleCheck) / 1000
        } else {
            -1
        }
        
        return buildString {
            appendLine("=== ADAPTIVE CONTENT POLLING STATUS ===")
            appendLine("Running: $isRunning")
            appendLine("Job Active: ${pollingJob?.isActive}")
            appendLine("Schedule Job Active: ${scheduleCheckJob?.isActive}")
            appendLine("Current Interval: ${currentPollInterval}ms")
            appendLine("Error Count: $errorCount")
            appendLine("Last Poll: ${if (timeSinceLastPoll >= 0) "${timeSinceLastPoll}s ago" else "Never"}")
            appendLine("Last Schedule Check: ${if (timeSinceScheduleCheck >= 0) "${timeSinceScheduleCheck}s ago" else "Never"}")
            appendLine("Current Schedule: ${currentSchedule?.let { "${it.current_period_name} (${it.interval_seconds}s, emergency=${it.is_emergency})" } ?: "Not loaded"}")
            appendLine("Screen ID: ${getScreenId() ?: "Not configured"}")
            appendLine("API Base: ${getApiBase() ?: "Not configured"}")
            appendLine("Listeners: ${listeners.size}")
        }
    }
    
    /**
     * Force schedule refresh (for testing)
     */
    fun refreshSchedule() {
        CoroutineScope(Dispatchers.IO).launch {
            val deviceToken = getDeviceToken()
            val screenId = getScreenId()
            val apiBase = getApiBase()
            
            if (deviceToken != null && screenId != null && apiBase != null) {
                try {
                    fetchPollingSchedule(apiBase, deviceToken, screenId)
                    Timber.i("🔄 Manual schedule refresh completed")
                } catch (e: Exception) {
                    Timber.e(e, "❌ Manual schedule refresh failed")
                }
            }
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
    
    private fun notifyScheduleChanged(intervalSeconds: Int, periodName: String, isEmergency: Boolean) {
        listeners.forEach { listener ->
            try {
                listener.onScheduleChanged(intervalSeconds, periodName, isEmergency)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying listener of schedule change")
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