package com.mesophy.signage

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import timber.log.Timber
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import kotlin.system.exitProcess

/**
 * Error Recovery Manager for Android TV digital signage client
 * 
 * Handles application crashes, network reconnection, and automatic recovery mechanisms
 */
class ErrorRecoveryManager(
    private val context: Context
) : Thread.UncaughtExceptionHandler {
    
    companion object {
        private const val TAG = "ErrorRecoveryManager"
        private const val CRASH_LOG_DIR = "crash_logs"
        private const val MAX_CRASH_LOGS = 10
        private const val RECONNECT_INTERVAL_MS = 10000L // 10 seconds
        private const val MAX_RECONNECT_ATTEMPTS = 10
        private const val RESTART_DELAY_MS = 5000L // 5 seconds before restart
        private const val HEALTH_CHECK_INTERVAL_MS = 30000L // 30 seconds
        private const val MAX_ERROR_COUNT = 5 // Max errors before restart
        private const val ERROR_RESET_TIME_MS = 300000L // 5 minutes
    }
    
    @Serializable
    data class CrashReport(
        val timestamp: Long = System.currentTimeMillis(),
        val exception: String,
        val stackTrace: String,
        val deviceInfo: Map<String, String>,
        val appVersion: String,
        val memoryInfo: Map<String, Long>
    )
    
    @Serializable
    data class ErrorStats(
        val errorCount: Int = 0,  // General error count (non-critical)
        val criticalErrorCount: Int = 0,  // Critical errors that may trigger restart
        val lastErrorTime: Long = 0,
        val lastCriticalErrorTime: Long = 0,
        val consecutiveCrashes: Int = 0,
        val networkErrors: Int = 0,
        val memoryErrors: Int = 0,
        val totalRestarts: Int = 0
    )
    
    interface ErrorRecoveryListener {
        fun onErrorRecovered(errorType: String)
        fun onNetworkReconnected()
        fun onApplicationRestarting(reason: String)
        fun onCriticalError(error: String)
    }
    
    private val crashLogDir: File
    private val defaultHandler: Thread.UncaughtExceptionHandler?
    private val sharedPrefs = context.getSharedPreferences("error_recovery", Context.MODE_PRIVATE)
    
    private var listeners = mutableListOf<ErrorRecoveryListener>()
    private var healthCheckJob: Job? = null
    private var networkReconnectJob: Job? = null
    private var isRunning = false
    private var currentErrorStats = loadErrorStats()
    private val startTime = System.currentTimeMillis() // Track when the manager was created

    // Components to monitor and restart
    private var contentSyncManager: ContentSyncManager? = null
    private var sseManager: ServerSentEventsManager? = null
    
    init {
        crashLogDir = File(context.cacheDir, CRASH_LOG_DIR)
        if (!crashLogDir.exists()) {
            crashLogDir.mkdirs()
        }
        
        // Save the default uncaught exception handler
        defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        
        // Clean up old crash logs
        cleanupOldCrashLogs()
    }
    
    /**
     * Start error recovery monitoring
     */
    fun start() {
        if (isRunning) {
            Timber.w("ErrorRecoveryManager already running")
            return
        }
        
        isRunning = true
        
        // Set up global exception handler
        Thread.setDefaultUncaughtExceptionHandler(this)
        
        Timber.i("🛡️ Error Recovery Manager started")
        Timber.i("📊 Error stats: ${currentErrorStats.criticalErrorCount} critical, ${currentErrorStats.networkErrors} network, ${currentErrorStats.totalRestarts} restarts")
        
        // Start health monitoring
        startHealthMonitoring()
    }
    
    /**
     * Stop error recovery monitoring
     */
    fun stop() {
        isRunning = false
        healthCheckJob?.cancel()
        networkReconnectJob?.cancel()
        
        // Restore original exception handler
        Thread.setDefaultUncaughtExceptionHandler(defaultHandler)
        
        Timber.i("⏹️ Error Recovery Manager stopped")
    }
    
    /**
     * Add error recovery listener
     */
    fun addListener(listener: ErrorRecoveryListener) {
        listeners.add(listener)
    }
    
    /**
     * Remove error recovery listener
     */
    fun removeListener(listener: ErrorRecoveryListener) {
        listeners.remove(listener)
    }
    
    /**
     * Register components for monitoring and recovery
     */
    fun registerComponents(contentSync: ContentSyncManager?, sse: ServerSentEventsManager?) {
        this.contentSyncManager = contentSync
        this.sseManager = sse
        Timber.i("🔧 Components registered for error recovery")
    }
    
    /**
     * Handle uncaught exceptions (crashes)
     */
    override fun uncaughtException(thread: Thread, exception: Throwable) {
        try {
            Timber.e(exception, "💥 UNCAUGHT EXCEPTION in thread: ${thread.name}")

            // Special handling for OutOfMemoryError - DON'T restart the app
            if (exception is OutOfMemoryError) {
                Timber.e("💥 OutOfMemoryError detected - this should have been caught at media level")
                Timber.e("🔧 NOT restarting app - the problematic media should be skipped")

                // Create crash report for monitoring
                val crashReport = createCrashReport(exception)
                saveCrashReport(crashReport)

                // Update stats but don't schedule restart
                updateErrorStats("component") // Transient, not critical

                // Notify but don't restart
                notifyCriticalError("OutOfMemory: Media file too large (handled)")

                // DON'T call scheduleApplicationRestart for OOM
                // The media player should have caught this and skipped the file
                return
            }

            // For all other exceptions, proceed with normal crash handling
            // Create crash report
            val crashReport = createCrashReport(exception)
            saveCrashReport(crashReport)

            // Update error statistics
            updateErrorStats("crash")

            // Notify listeners
            notifyCriticalError("Application crashed: ${exception.message}")

            // Try to restart application gracefully
            scheduleApplicationRestart("Uncaught exception: ${exception.javaClass.simpleName}")

        } catch (e: Exception) {
            Timber.e(e, "Failed to handle uncaught exception")
        }

        // Call the default handler to ensure proper cleanup (except for OOM)
        if (exception !is OutOfMemoryError) {
            defaultHandler?.uncaughtException(thread, exception)
        }
    }
    
    /**
     * Handle network connection errors with automatic reconnection
     */
    fun handleNetworkError(error: String) {
        Timber.w("📡 Network error: $error")
        updateErrorStats("network")
        
        // Start network reconnection attempts
        if (networkReconnectJob?.isActive != true) {
            startNetworkReconnection()
        }
    }
    
    /**
     * Handle component errors and attempt recovery
     */
    fun handleComponentError(component: String, error: String) {
        Timber.w("⚠️ Component error in $component: $error")

        // Categorize error by severity
        val errorSeverity = categorizeError(error)

        when (errorSeverity) {
            ErrorSeverity.NETWORK -> {
                // Network errors: track separately, NEVER trigger restart
                updateErrorStats("network")
                Timber.i("📡 Network error detected - will retry when connection restored")
                // Don't send alerts for network errors - they're expected
            }

            ErrorSeverity.CRITICAL -> {
                // Critical errors: count toward restart threshold
                updateErrorStats("critical")
                Timber.e("🚨 CRITICAL error detected: $error")

                // Send alert to server
                CoroutineScope(Dispatchers.IO).launch {
                    sendCommandFailureAlert(component, error, "critical")
                }

                // Check if we should restart
                if (shouldRestartDueToErrors()) {
                    scheduleApplicationRestart("Critical error in $component: $error")
                }
            }

            ErrorSeverity.TRANSIENT -> {
                // Transient errors: track but don't count toward restart
                updateErrorStats("component")
                Timber.w("⚠️ Transient error - will retry")

                // Only send alert if error persists
                if (currentErrorStats.errorCount > 10) {
                    CoroutineScope(Dispatchers.IO).launch {
                        sendCommandFailureAlert(component, error)
                    }
                }
            }
        }

        // Attempt to recover specific components (for all error types)
        when (component.lowercase()) {
            "contentsyncmanager", "sync" -> {
                recoverContentSync()
            }
            "sse", "serversideevents", "notifications" -> {
                recoverSSE()
            }
            "memory" -> {
                recoverMemory()
            }
            else -> {
                Timber.w("Unknown component: $component, cannot auto-recover")
            }
        }
    }

    /**
     * Error severity levels
     */
    private enum class ErrorSeverity {
        NETWORK,    // Network/connection issues - never restart
        TRANSIENT,  // Temporary issues - retry without restart
        CRITICAL    // Serious issues - may need restart
    }

    /**
     * Categorize error by severity based on error message
     */
    private fun categorizeError(error: String): ErrorSeverity {
        val errorLower = error.lowercase()

        // Network errors - NEVER restart for these
        if (errorLower.contains("unable to resolve host") ||
            errorLower.contains("no address associated with hostname") ||
            errorLower.contains("network") ||
            errorLower.contains("connection") ||
            errorLower.contains("timeout") ||
            errorLower.contains("connect timed out") ||
            errorLower.contains("failed to connect") ||
            errorLower.contains("no internet") ||
            errorLower.contains("socket")) {
            return ErrorSeverity.NETWORK
        }

        // Critical errors - restart may be needed
        // NOTE: OutOfMemory is NOT critical - it's handled per-file, not app-wide
        if (errorLower.contains("securityexception") ||
            errorLower.contains("security exception") ||
            errorLower.contains("fatal") ||
            errorLower.contains("crashed") ||
            errorLower.contains("force close")) {
            return ErrorSeverity.CRITICAL
        }

        // Everything else is transient (including OutOfMemory - handled at media level)
        return ErrorSeverity.TRANSIENT
    }
    
    /**
     * Start health monitoring to detect stuck states
     */
    private fun startHealthMonitoring() {
        healthCheckJob = CoroutineScope(Dispatchers.IO).launch {
            while (isRunning) {
                try {
                    performHealthCheck()
                    delay(HEALTH_CHECK_INTERVAL_MS)
                } catch (e: Exception) {
                    Timber.e(e, "❌ Health check failed")
                    delay(HEALTH_CHECK_INTERVAL_MS)
                }
            }
        }
    }
    
    /**
     * Perform periodic health check
     */
    private suspend fun performHealthCheck() {
        try {
            // Check if error count is too high
            if (shouldRestartDueToErrors()) {
                scheduleApplicationRestart("Too many errors (${currentErrorStats.errorCount})")
                return
            }
            
            // Check component health
            val contentSyncHealthy = contentSyncManager?.getSyncStatus()?.isConnected ?: true
            val sseHealthy = sseManager != null // Placeholder for SSE health check
            
            if (!contentSyncHealthy) {
                Timber.w("🔄 Content sync unhealthy, attempting recovery...")
                recoverContentSync()
            }
            
            // Check memory pressure
            val runtime = Runtime.getRuntime()
            val freeMemory = runtime.freeMemory()
            val totalMemory = runtime.totalMemory()
            val maxMemory = runtime.maxMemory()
            
            val memoryUsagePercent = ((totalMemory - freeMemory).toDouble() / maxMemory * 100).toInt()
            
            if (memoryUsagePercent > 90) {
                Timber.w("🧠 High memory usage: $memoryUsagePercent%, triggering recovery")
                recoverMemory()
            }
            
        } catch (e: Exception) {
            Timber.e(e, "Health check error")
        }
    }
    
    /**
     * Start network reconnection attempts
     */
    private fun startNetworkReconnection() {
        networkReconnectJob = CoroutineScope(Dispatchers.IO).launch {
            var attempts = 0
            
            while (attempts < MAX_RECONNECT_ATTEMPTS && isRunning) {
                try {
                    attempts++
                    Timber.i("🔄 Network reconnection attempt $attempts/$MAX_RECONNECT_ATTEMPTS")
                    
                    // Try to restart SSE connection
                    sseManager?.let {
                        it.stop()
                        it.start()
                    }
                    
                    // Try to force a content sync
                    val syncSuccess = contentSyncManager?.forceSyncNow() ?: false
                    
                    if (syncSuccess) {
                        Timber.i("✅ Network reconnection successful")
                        notifyNetworkReconnected()
                        updateErrorStats("recovery")
                        break
                    }
                    
                    delay(RECONNECT_INTERVAL_MS * attempts) // Exponential backoff
                    
                } catch (e: Exception) {
                    Timber.w("Reconnection attempt $attempts failed: ${e.message}")
                    delay(RECONNECT_INTERVAL_MS)
                }
            }
            
            if (attempts >= MAX_RECONNECT_ATTEMPTS) {
                Timber.e("❌ Network reconnection failed after $attempts attempts")
                scheduleApplicationRestart("Network reconnection failed")
            }
        }
    }
    
    /**
     * Recover ContentSyncManager
     */
    private fun recoverContentSync() {
        try {
            Timber.i("🔄 Recovering ContentSyncManager...")
            
            // Stop and restart content sync
            contentSyncManager?.stop()
            contentSyncManager?.start()
            
            notifyErrorRecovered("ContentSyncManager")
            
        } catch (e: Exception) {
            Timber.e(e, "Failed to recover ContentSyncManager")
            handleComponentError("contentsync", "Recovery failed: ${e.message}")
        }
    }
    
    /**
     * Recover SSE Manager
     */
    private fun recoverSSE() {
        try {
            Timber.i("🔄 Recovering SSE Manager...")
            
            // Restart SSE connection
            sseManager?.let {
                it.stop()
                it.start()
            }
            
            notifyErrorRecovered("SSE Manager")
            
        } catch (e: Exception) {
            Timber.e(e, "Failed to recover SSE Manager")
            handleComponentError("sse", "Recovery failed: ${e.message}")
        }
    }
    
    /**
     * Recover from memory issues
     */
    private fun recoverMemory() {
        try {
            Timber.i("🧠 Recovering from memory issues...")
            
            // Force garbage collection
            System.gc()
            Runtime.getRuntime().gc()
            
            // Clear caches
            contentSyncManager?.clearCache()
            contentSyncManager?.performMemoryOptimization()
            
            notifyErrorRecovered("Memory")
            
        } catch (e: Exception) {
            Timber.e(e, "Failed to recover from memory issues")
        }
    }
    
    /**
     * Schedule application restart with delay
     */
    private fun scheduleApplicationRestart(reason: String) {
        Timber.w("🔄 Scheduling application restart: $reason")
        
        updateErrorStats("restart")
        notifyApplicationRestarting(reason)
        
        // Send critical command failure alert to server
        CoroutineScope(Dispatchers.IO).launch {
            sendCommandFailureAlert("application_restart", reason, "critical")
        }
        
        // Use main thread handler to restart after delay
        Handler(Looper.getMainLooper()).postDelayed({
            restartApplication()
        }, RESTART_DELAY_MS)
    }
    
    /**
     * Restart the application
     */
    private fun restartApplication() {
        try {
            Timber.i("🔄 RESTARTING APPLICATION")
            
            val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            intent?.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            
            // Force exit current process
            exitProcess(0)
            
        } catch (e: Exception) {
            Timber.e(e, "Failed to restart application")
            // Last resort - just exit
            exitProcess(1)
        }
    }
    
    /**
     * Create crash report from exception
     */
    private fun createCrashReport(exception: Throwable): CrashReport {
        val stringWriter = StringWriter()
        val printWriter = PrintWriter(stringWriter)
        exception.printStackTrace(printWriter)
        
        val runtime = Runtime.getRuntime()
        
        return CrashReport(
            exception = exception.javaClass.simpleName + ": " + (exception.message ?: "Unknown"),
            stackTrace = stringWriter.toString(),
            deviceInfo = mapOf(
                "model" to android.os.Build.MODEL,
                "manufacturer" to android.os.Build.MANUFACTURER,
                "android_version" to android.os.Build.VERSION.RELEASE,
                "api_level" to android.os.Build.VERSION.SDK_INT.toString(),
                "app_version" to getAppVersion()
            ),
            appVersion = getAppVersion(),
            memoryInfo = mapOf(
                "max_memory" to runtime.maxMemory(),
                "total_memory" to runtime.totalMemory(),
                "free_memory" to runtime.freeMemory(),
                "used_memory" to (runtime.totalMemory() - runtime.freeMemory())
            )
        )
    }
    
    /**
     * Save crash report to file
     */
    private fun saveCrashReport(crashReport: CrashReport) {
        try {
            val fileName = "crash_${System.currentTimeMillis()}.json"
            val file = File(crashLogDir, fileName)
            val json = Json.encodeToString(crashReport)
            file.writeText(json)
            
            Timber.i("💾 Crash report saved: ${file.absolutePath}")
            
        } catch (e: Exception) {
            Timber.e(e, "Failed to save crash report")
        }
    }
    
    /**
     * Update error statistics
     */
    private fun updateErrorStats(type: String) {
        val currentTime = System.currentTimeMillis()

        currentErrorStats = when (type) {
            "crash" -> currentErrorStats.copy(
                criticalErrorCount = currentErrorStats.criticalErrorCount + 1,
                lastCriticalErrorTime = currentTime,
                consecutiveCrashes = currentErrorStats.consecutiveCrashes + 1
            )
            "critical" -> currentErrorStats.copy(
                criticalErrorCount = currentErrorStats.criticalErrorCount + 1,
                lastCriticalErrorTime = currentTime
            )
            "network" -> currentErrorStats.copy(
                networkErrors = currentErrorStats.networkErrors + 1,
                lastErrorTime = currentTime
                // Note: Network errors do NOT increment criticalErrorCount
            )
            "restart" -> currentErrorStats.copy(
                totalRestarts = currentErrorStats.totalRestarts + 1
            )
            "recovery" -> currentErrorStats.copy(
                criticalErrorCount = maxOf(0, currentErrorStats.criticalErrorCount - 1),
                consecutiveCrashes = 0
            )
            "component" -> currentErrorStats.copy(
                errorCount = currentErrorStats.errorCount + 1,
                lastErrorTime = currentTime
                // Note: Component errors do NOT increment criticalErrorCount
            )
            else -> currentErrorStats.copy(
                errorCount = currentErrorStats.errorCount + 1,
                lastErrorTime = currentTime
            )
        }

        saveErrorStats()
    }
    
    /**
     * Check if application should restart due to too many errors
     * ONLY considers CRITICAL errors and crashes, NOT network or transient errors
     */
    private fun shouldRestartDueToErrors(): Boolean {
        val timeSinceLastCriticalError = System.currentTimeMillis() - currentErrorStats.lastCriticalErrorTime

        // Reset critical error count if enough time has passed (5 minutes)
        if (timeSinceLastCriticalError > ERROR_RESET_TIME_MS) {
            currentErrorStats = currentErrorStats.copy(
                criticalErrorCount = 0,
                consecutiveCrashes = 0
            )
            saveErrorStats()
            return false
        }

        // Only restart for CRITICAL errors (threshold: 5) or consecutive crashes (threshold: 3)
        // Network errors and transient errors do NOT trigger restarts
        val shouldRestart = currentErrorStats.criticalErrorCount >= MAX_ERROR_COUNT ||
                            currentErrorStats.consecutiveCrashes >= 3

        if (shouldRestart) {
            Timber.e("🚨 Restart threshold reached - criticalErrors: ${currentErrorStats.criticalErrorCount}, crashes: ${currentErrorStats.consecutiveCrashes}")
        }

        return shouldRestart
    }
    
    /**
     * Load error statistics from preferences
     */
    private fun loadErrorStats(): ErrorStats {
        return try {
            ErrorStats(
                errorCount = sharedPrefs.getInt("error_count", 0),
                criticalErrorCount = sharedPrefs.getInt("critical_error_count", 0),
                lastErrorTime = sharedPrefs.getLong("last_error_time", 0),
                lastCriticalErrorTime = sharedPrefs.getLong("last_critical_error_time", 0),
                consecutiveCrashes = sharedPrefs.getInt("consecutive_crashes", 0),
                networkErrors = sharedPrefs.getInt("network_errors", 0),
                memoryErrors = sharedPrefs.getInt("memory_errors", 0),
                totalRestarts = sharedPrefs.getInt("total_restarts", 0)
            )
        } catch (e: Exception) {
            Timber.w("Failed to load error stats: ${e.message}")
            ErrorStats()
        }
    }
    
    /**
     * Save error statistics to preferences
     */
    private fun saveErrorStats() {
        try {
            with(sharedPrefs.edit()) {
                putInt("error_count", currentErrorStats.errorCount)
                putInt("critical_error_count", currentErrorStats.criticalErrorCount)
                putLong("last_error_time", currentErrorStats.lastErrorTime)
                putLong("last_critical_error_time", currentErrorStats.lastCriticalErrorTime)
                putInt("consecutive_crashes", currentErrorStats.consecutiveCrashes)
                putInt("network_errors", currentErrorStats.networkErrors)
                putInt("memory_errors", currentErrorStats.memoryErrors)
                putInt("total_restarts", currentErrorStats.totalRestarts)
                apply()
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to save error stats")
        }
    }
    
    /**
     * Clean up old crash log files
     */
    private fun cleanupOldCrashLogs() {
        try {
            val files = crashLogDir.listFiles()?.sortedBy { it.lastModified() } ?: return
            
            if (files.size > MAX_CRASH_LOGS) {
                val toDelete = files.size - MAX_CRASH_LOGS
                files.take(toDelete).forEach { file ->
                    if (file.delete()) {
                        Timber.d("🗑️ Deleted old crash log: ${file.name}")
                    }
                }
            }
        } catch (e: Exception) {
            Timber.w("Failed to cleanup crash logs: ${e.message}")
        }
    }
    
    private fun getAppVersion(): String {
        return try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            packageInfo.versionName ?: "Unknown"
        } catch (e: Exception) {
            "Unknown"
        }
    }
    
    // Listener notification methods
    /**
     * Send command failure alert to server
     */
    private suspend fun sendCommandFailureAlert(component: String, error: String, severity: String = "high") {
        try {
            val deviceToken = getDeviceToken() ?: return
            val deviceId = getDeviceId() ?: return
            
            val alertData = mapOf(
                "device_id" to deviceId,
                "alert_type" to "command_failure",
                "severity" to severity,
                "message" to "Command/component failure in $component: $error",
                "details" to mapOf(
                    "component" to component,
                    "error_message" to error,
                    "error_stats" to mapOf(
                        "total_errors" to currentErrorStats.errorCount,
                        "network_errors" to currentErrorStats.networkErrors,
                        "memory_errors" to currentErrorStats.memoryErrors,
                        "total_restarts" to currentErrorStats.totalRestarts
                    ),
                    "timestamp" to System.currentTimeMillis()
                )
            )
            
            ApiClient().sendAlert(deviceToken, alertData)
            Timber.w("🚨 Command failure alert sent: $component - $error")
            
        } catch (e: Exception) {
            Timber.e(e, "Failed to send command failure alert")
        }
    }
    
    private fun getDeviceToken(): String? {
        return context.getSharedPreferences("device_prefs", Context.MODE_PRIVATE)
            .getString("device_token", null)
    }
    
    private fun getDeviceId(): String? {
        return context.getSharedPreferences("device_prefs", Context.MODE_PRIVATE)
            .getString("device_id", null)
    }

    private fun notifyErrorRecovered(errorType: String) {
        listeners.forEach { listener ->
            try {
                listener.onErrorRecovered(errorType)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying recovery listener")
            }
        }
    }
    
    private fun notifyNetworkReconnected() {
        listeners.forEach { listener ->
            try {
                listener.onNetworkReconnected()
            } catch (e: Exception) {
                Timber.e(e, "Error notifying network listener")
            }
        }
    }
    
    private fun notifyApplicationRestarting(reason: String) {
        listeners.forEach { listener ->
            try {
                listener.onApplicationRestarting(reason)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying restart listener")
            }
        }
    }
    
    private fun notifyCriticalError(error: String) {
        listeners.forEach { listener ->
            try {
                listener.onCriticalError(error)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying critical error listener")
            }
        }
    }
    
    /**
     * Get current error statistics
     */
    fun getErrorStats(): ErrorStats = currentErrorStats
    
    /**
     * Reset error statistics (for testing or manual reset)
     */
    fun resetErrorStats() {
        currentErrorStats = ErrorStats()
        saveErrorStats()
        Timber.i("📊 Error statistics reset")
    }
}