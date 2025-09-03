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
        private const val USE_ALWAYS_ON_SERVICE = false  // DISABLED: Using HTTP polling instead for reliable notifications
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
        
        // Run diagnostics before attempting connection
        logConnectionDiagnostics()
        
        val deviceToken = getDeviceToken()
        val screenId = getScreenId()
        val apiBase = getApiBase()
        
        if (deviceToken == null || screenId == null || apiBase == null) {
            Timber.e("❌ CRITICAL: Missing required configuration for SSE connection")
            Timber.e("  - Device Token: ${if (deviceToken != null) "✅" else "❌"}")
            Timber.e("  - Screen ID: ${if (screenId != null) "✅" else "❌"}")
            Timber.e("  - API Base: ${if (apiBase != null) "✅" else "❌"}")
            notifyError("Real-time notifications not configured")
            return
        }
        
        isRunning = true
        reconnectAttempts = 0
        
        Timber.i("🚀 STARTING SSE CONNECTION")
        Timber.i("  - Screen: $screenId")
        Timber.i("  - Service: ${if (USE_ALWAYS_ON_SERVICE) "Always-On" else "Vercel"}")
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
            Timber.i("🔗 STARTING SSE CONNECTION ATTEMPT")
            Timber.d("🔍 Connection Parameters:")
            Timber.d("  - Service Type: $serviceType")
            Timber.d("  - URL: $sseUrl")
            Timber.d("  - Screen ID: $screenId")
            Timber.d("  - Device Token: ${if (deviceToken.length > 10) "${deviceToken.take(10)}..." else deviceToken}")
            Timber.d("  - API Base: $apiBase")
            Timber.d("  - Connection Timeout: ${CONNECTION_TIMEOUT_SECONDS}s")
            Timber.d("  - Read Timeout: Unlimited (for SSE)")
            Timber.d("  - Reconnect Attempts: $reconnectAttempts/$MAX_RECONNECT_ATTEMPTS")
            
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
                    Timber.d("🔍 SSE Response Details:")
                    Timber.d("  - Status: ${response.code} ${response.message}")
                    Timber.d("  - Headers: ${response.headers}")
                    Timber.d("  - URL: ${response.request.url}")
                    Timber.d("  - Content-Type: ${response.header("Content-Type")}")
                    Timber.d("  - Connection: ${response.header("Connection")}")
                    Timber.d("  - Cache-Control: ${response.header("Cache-Control")}")
                    Timber.d("🚀 SSE connection successfully established for screen: $screenId")
                    reconnectAttempts = 0
                    notifyConnectionStatus(true)
                }
                
                override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
                    val timestamp = System.currentTimeMillis()
                    Timber.i("📲 SSE EVENT RECEIVED at $timestamp")
                    Timber.d("🔍 Event Details:")
                    Timber.d("  - ID: ${id ?: "null"}")
                    Timber.d("  - Type: ${type ?: "null"}")
                    Timber.d("  - Data Length: ${data.length} chars")
                    Timber.d("  - Data: $data")
                    Timber.d("  - EventSource URL: ${eventSource.request().url}")
                    
                    when (type) {
                        "content_update" -> {
                            Timber.i("🔔 CONTENT UPDATE NOTIFICATION RECEIVED")
                            Timber.i("🔔 Payload: $data")
                            try {
                                notifyNotificationReceived("content_update", data)
                                Timber.i("✅ Content update notification successfully processed")
                            } catch (e: Exception) {
                                Timber.e(e, "❌ Failed to process content update notification")
                            }
                        }
                        "connected" -> {
                            Timber.i("🔌 SSE connection confirmation received")
                        }
                        "realtime_ready" -> {
                            Timber.i("🎯 Real-time system ready")
                        }
                        "ping" -> {
                            Timber.d("💓 SSE heartbeat received")
                        }
                        null, "" -> {
                            Timber.w("⚠️ SSE event with null/empty type received")
                            if (data.isNotEmpty()) {
                                notifyNotificationReceived("unknown", data)
                            }
                        }
                        else -> {
                            Timber.i("📨 SSE event type '$type' received")
                            notifyNotificationReceived(type, data)
                        }
                    }
                }
                
                override fun onClosed(eventSource: EventSource) {
                    val timestamp = System.currentTimeMillis()
                    Timber.w("🔌 SSE CONNECTION CLOSED at $timestamp")
                    Timber.d("🔍 Connection Close Details:")
                    Timber.d("  - URL: ${eventSource.request().url}")
                    Timber.d("  - Screen ID: $screenId")
                    Timber.d("  - Is Running: $isRunning")
                    Timber.d("  - Reconnect Attempts: $reconnectAttempts/$MAX_RECONNECT_ATTEMPTS")
                    notifyConnectionStatus(false)
                    
                    if (isRunning && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        Timber.i("📡 Scheduling reconnection...")
                        scheduleReconnect(apiBase, deviceToken, screenId)
                    } else {
                        Timber.e("⛔ Not reconnecting - Running: $isRunning, Attempts: $reconnectAttempts")
                    }
                }
                
                override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                    val timestamp = System.currentTimeMillis()
                    Timber.e("❌ SSE CONNECTION FAILURE at $timestamp")
                    Timber.e("🔍 Failure Details:")
                    Timber.e("  - URL: ${eventSource.request().url}")
                    Timber.e("  - Screen ID: $screenId")
                    Timber.e("  - Response Code: ${response?.code ?: "null"}")
                    Timber.e("  - Response Message: ${response?.message ?: "null"}")
                    Timber.e("  - Response Headers: ${response?.headers ?: "null"}")
                    Timber.e("  - Exception Type: ${t?.javaClass?.simpleName ?: "null"}")
                    Timber.e("  - Exception Message: ${t?.message ?: "null"}")
                    Timber.e("  - Exception Cause: ${t?.cause ?: "null"}")
                    Timber.e("  - Reconnect Attempts: $reconnectAttempts/$MAX_RECONNECT_ATTEMPTS")
                    
                    // Additional network diagnostics
                    if (t != null) {
                        when {
                            t.message?.contains("timeout") == true -> 
                                Timber.e("🚨 NETWORK TIMEOUT detected")
                            t.message?.contains("aborted") == true -> 
                                Timber.e("🚨 CONNECTION ABORTED detected")
                            t.message?.contains("reset") == true -> 
                                Timber.e("🚨 CONNECTION RESET detected")
                            t.message?.contains("refused") == true -> 
                                Timber.e("🚨 CONNECTION REFUSED detected")
                            t is java.net.UnknownHostException -> 
                                Timber.e("🚨 DNS/HOST RESOLUTION failed")
                            t is java.net.ConnectException -> 
                                Timber.e("🚨 CONNECTION ESTABLISHMENT failed")
                            t is java.net.SocketException -> 
                                Timber.e("🚨 SOCKET ERROR detected")
                            else -> 
                                Timber.e("🚨 UNKNOWN NETWORK ERROR: ${t.javaClass.simpleName}")
                        }
                    }
                    
                    notifyConnectionStatus(false)
                    notifyError("SSE connection failed: ${t?.message ?: "Unknown error"}")
                    
                    if (isRunning && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        Timber.w("📡 Attempting to recover from failure...")
                        scheduleReconnect(apiBase, deviceToken, screenId)
                    } else {
                        Timber.e("⛔ Max reconnection attempts reached or not running, stopping SSE")
                        stop()
                    }
                }
            }
            
            Timber.d("🚀 Creating EventSource with OkHttp client...")
            eventSource = EventSources.createFactory(client).newEventSource(request, eventSourceListener)
            Timber.i("✅ EventSource created successfully - waiting for connection...")
            
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
     * Get detailed connection status for debugging
     */
    fun getConnectionStatus(): String {
        val status = StringBuilder()
        status.appendLine("=== SSE CONNECTION STATUS ===")
        status.appendLine("Running: $isRunning")
        status.appendLine("EventSource: ${if (eventSource != null) "Created" else "Null"}")
        status.appendLine("Reconnect Attempts: $reconnectAttempts/$MAX_RECONNECT_ATTEMPTS")
        status.appendLine("Service Type: ${if (USE_ALWAYS_ON_SERVICE) "Always-On" else "Vercel"}")
        status.appendLine("Base URL: ${if (USE_ALWAYS_ON_SERVICE) ALWAYS_ON_SSE_BASE else getApiBase()}")
        status.appendLine("Screen ID: ${getScreenId() ?: "Not configured"}")
        status.appendLine("Device Token: ${if (getDeviceToken()?.isNotEmpty() == true) "Configured" else "Missing"}")
        status.appendLine("Active Listeners: ${listeners.size}")
        status.appendLine("OkHttp Client: ${client.javaClass.simpleName}")
        return status.toString()
    }
    
    /**
     * Log detailed connection diagnostics
     */
    fun logConnectionDiagnostics() {
        Timber.i("🔍 CONNECTION DIAGNOSTICS:")
        Timber.i(getConnectionStatus())
        
        // Additional runtime checks
        val screenId = getScreenId()
        val deviceToken = getDeviceToken()
        val apiBase = getApiBase()
        
        if (screenId == null) {
            Timber.e("❌ Screen ID not configured in SharedPreferences")
        }
        if (deviceToken == null) {
            Timber.e("❌ Device Token not configured in SharedPreferences")
        }
        if (apiBase == null) {
            Timber.e("❌ API Base not configured in SharedPreferences")
        }
        
        // Check network conditions
        try {
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) 
                as android.net.ConnectivityManager
            val networkInfo = connectivityManager.activeNetworkInfo
            Timber.i("📶 Network Status: ${if (networkInfo?.isConnected == true) "Connected" else "Disconnected"}")
            Timber.i("📶 Network Type: ${networkInfo?.typeName ?: "Unknown"}")
        } catch (e: Exception) {
            Timber.w("⚠️ Could not check network status: ${e.message}")
        }
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