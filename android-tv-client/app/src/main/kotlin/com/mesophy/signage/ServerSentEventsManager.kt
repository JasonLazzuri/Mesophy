package com.mesophy.signage

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import timber.log.Timber

/**
 * Server-Sent Events manager for real-time content notifications
 * 
 * Uses SSE to receive instant notifications when content changes,
 * providing much better efficiency than polling while being simpler
 * than WebSockets. Now supports both:
 * - Vercel serverless endpoint (5-minute timeout limitation)  
 * - Always-on dedicated SSE service (no timeout, bulletproof)
 */
class ServerSentEventsManager(private val context: Context) {
    
    companion object {
        private const val TAG = "ServerSentEventsManager"
        private const val PREFS_NAME = "mesophy_config"
        private const val CONNECTION_TIMEOUT_SECONDS = 30L
        private const val RECONNECT_DELAY_MS = 5000L
        private const val MAX_RECONNECT_ATTEMPTS = 5
        
        // Always-on SSE service configuration
        private const val ALWAYS_ON_SSE_BASE = "https://mesophy.onrender.com"
        private const val USE_ALWAYS_ON_SERVICE = true  // Set to true for bulletproof notifications
    }
    
    private val sharedPrefs: SharedPreferences = 
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(CONNECTION_TIMEOUT_SECONDS, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(0, java.util.concurrent.TimeUnit.SECONDS) // SSE needs unlimited read timeout
        .build()
    
    private var eventSource: EventSource? = null
    private var isRunning = false
    private var reconnectAttempts = 0
    private var reconnectJob: Job? = null
    private var listeners = mutableListOf<NotificationListener>()
    
    /**
     * Interface for real-time notification callbacks
     */
    interface NotificationListener {
        fun onNotificationReceived(type: String, data: String)
        fun onConnectionStatusChanged(isConnected: Boolean)
        fun onError(error: String)
    }
    
    /**
     * Start SSE connection
     */
    fun start() {
        if (isRunning) {
            Timber.w("$TAG already running")
            return
        }
        
        val deviceToken = getDeviceToken()
        val screenId = getScreenId()
        val apiBase = getApiBase()
        
        if (deviceToken == null || screenId == null || apiBase == null) {
            Timber.e("Missing required configuration for SSE connection")
            notifyError("Real-time notifications not configured")
            return
        }
        
        isRunning = true
        reconnectAttempts = 0
        
        Timber.i("🚀 Starting SSE connection for screen: $screenId")
        connectToSSE(apiBase, deviceToken, screenId)
    }
    
    /**
     * Stop SSE connection
     */
    fun stop() {
        isRunning = false
        reconnectJob?.cancel()
        reconnectJob = null
        
        eventSource?.cancel()
        eventSource = null
        
        notifyConnectionStatus(false)
        Timber.i("⏹️ SSE connection stopped")
    }
    
    /**
     * Connect to Server-Sent Events endpoint
     * Uses either the always-on dedicated service (bulletproof) or Vercel endpoint
     */
    private fun connectToSSE(apiBase: String, deviceToken: String, screenId: String) {
        try {
            val sseUrl = if (USE_ALWAYS_ON_SERVICE) {
                "$ALWAYS_ON_SSE_BASE/stream"  // Always-on service (no timeout)
            } else {
                "$apiBase/api/devices/notifications/stream"  // Vercel endpoint (5-minute timeout)
            }
            
            val serviceType = if (USE_ALWAYS_ON_SERVICE) "always-on" else "vercel"
            Timber.i("🔗 Connecting to $serviceType SSE service: $sseUrl")
            
            val request = Request.Builder()
                .url(sseUrl)
                .header("Authorization", "Bearer $deviceToken")
                .header("X-Screen-ID", screenId)
                .header("Accept", "text/event-stream")
                .header("Cache-Control", "no-cache")
                .build()
            
            val eventSourceListener = object : EventSourceListener() {
                override fun onOpen(eventSource: EventSource, response: Response) {
                    val serviceType = if (USE_ALWAYS_ON_SERVICE) "always-on" else "vercel"
                    Timber.i("✅ $serviceType SSE connection opened")
                    reconnectAttempts = 0
                    notifyConnectionStatus(true)
                }
                
                override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
                    Timber.d("📲 SSE event received: type=$type, data=$data")
                    
                    when (type) {
                        "content_update" -> {
                            Timber.i("🔔 Content update notification: $data")
                            notifyNotificationReceived("content_update", data)
                        }
                        "ping" -> {
                            Timber.d("💓 SSE heartbeat")
                        }
                        else -> {
                            Timber.d("📨 SSE event: type=$type")
                            notifyNotificationReceived(type ?: "unknown", data)
                        }
                    }
                }
                
                override fun onClosed(eventSource: EventSource) {
                    Timber.i("🔌 SSE connection closed")
                    notifyConnectionStatus(false)
                    
                    if (isRunning && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        scheduleReconnect(apiBase, deviceToken, screenId)
                    }
                }
                
                override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                    Timber.e(t, "❌ SSE connection failed: ${response?.code}")
                    notifyConnectionStatus(false)
                    notifyError("SSE connection failed: ${t?.message ?: "Unknown error"}")
                    
                    if (isRunning && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        scheduleReconnect(apiBase, deviceToken, screenId)
                    } else {
                        Timber.e("Max reconnection attempts reached, stopping SSE")
                        stop()
                    }
                }
            }
            
            eventSource = EventSources.createFactory(client).newEventSource(request, eventSourceListener)
            
        } catch (e: Exception) {
            Timber.e(e, "Failed to create SSE connection")
            notifyError("Failed to create SSE connection: ${e.message}")
            
            if (isRunning && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                scheduleReconnect(apiBase, deviceToken, screenId)
            }
        }
    }
    
    /**
     * Schedule reconnection with exponential backoff
     */
    private fun scheduleReconnect(apiBase: String, deviceToken: String, screenId: String) {
        reconnectAttempts++
        val delay = RECONNECT_DELAY_MS * (1 shl minOf(reconnectAttempts - 1, 4)) // Exponential backoff, max 16x
        
        Timber.d("📡 Scheduling SSE reconnection attempt $reconnectAttempts in ${delay}ms")
        
        reconnectJob = CoroutineScope(Dispatchers.IO).launch {
            delay(delay)
            
            if (isRunning) {
                Timber.d("🔄 Reconnecting SSE...")
                connectToSSE(apiBase, deviceToken, screenId)
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
    
    /**
     * Check if SSE is connected
     */
    fun isConnected(): Boolean {
        return eventSource != null
    }
    
    /**
     * Get current SSE service configuration info
     */
    fun getServiceInfo(): String {
        val serviceType = if (USE_ALWAYS_ON_SERVICE) "Always-On" else "Vercel"
        val endpoint = if (USE_ALWAYS_ON_SERVICE) ALWAYS_ON_SSE_BASE else getApiBase()
        return "$serviceType service at $endpoint"
    }
    
    // Notification methods
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
    
    // Helper methods for getting configuration
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