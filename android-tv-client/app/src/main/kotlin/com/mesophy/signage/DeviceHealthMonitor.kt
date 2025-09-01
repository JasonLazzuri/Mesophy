package com.mesophy.signage

import android.app.ActivityManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Environment
import android.os.StatFs
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import timber.log.Timber
import java.io.BufferedReader
import java.io.FileReader
import java.text.SimpleDateFormat
import java.util.*

/**
 * Device Health Monitor for Android TV digital signage client
 * 
 * Monitors system health metrics and reports to backend for operational visibility
 */
class DeviceHealthMonitor(
    private val context: Context
) {
    
    companion object {
        private const val TAG = "DeviceHealthMonitor"
        private const val HEALTH_CHECK_INTERVAL_MS = 300000L // 5 minutes
        private const val HEALTH_REPORT_INTERVAL_MS = 900000L // 15 minutes
        private const val CRITICAL_MEMORY_THRESHOLD = 0.1f // 10% free memory
        private const val CRITICAL_STORAGE_THRESHOLD = 0.05f // 5% free storage
        private const val HIGH_CPU_THRESHOLD = 80.0f // 80% CPU usage
        private const val MAX_HEALTH_RECORDS = 24 // Keep 24 records (6 hours at 15min intervals)
    }
    
    private val apiClient = ApiClient()
    private var monitorJob: Job? = null
    private var isRunning = false
    private var listeners = mutableListOf<HealthMonitorListener>()
    private val healthHistory = mutableListOf<DeviceHealthMetrics>()
    
    private val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    private val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    
    @Serializable
    data class DeviceHealthMetrics(
        val timestamp: Long = System.currentTimeMillis(),
        val deviceInfo: DeviceInfo,
        val memoryInfo: MemoryInfo,
        val storageInfo: StorageInfo,
        val networkInfo: NetworkInfo,
        val cpuInfo: CpuInfo,
        val temperatureInfo: TemperatureInfo? = null,
        val appInfo: AppInfo,
        val healthStatus: HealthStatus
    )
    
    @Serializable
    data class DeviceInfo(
        val model: String = Build.MODEL,
        val manufacturer: String = Build.MANUFACTURER,
        val androidVersion: String = Build.VERSION.RELEASE,
        val apiLevel: Int = Build.VERSION.SDK_INT,
        val serialNumber: String? = try { Build.getSerial() } catch (e: Exception) { null }
    )
    
    @Serializable
    data class MemoryInfo(
        val totalRAM: Long,
        val availableRAM: Long,
        val usedRAM: Long,
        val freeRAMPercentage: Float,
        val lowMemory: Boolean
    )
    
    @Serializable
    data class StorageInfo(
        val totalStorage: Long,
        val availableStorage: Long,
        val usedStorage: Long,
        val freeStoragePercentage: Float
    )
    
    @Serializable
    data class NetworkInfo(
        val isConnected: Boolean,
        val connectionType: String,
        val signalStrength: Int? = null,
        val ipAddress: String? = null
    )
    
    @Serializable
    data class CpuInfo(
        val cpuUsagePercentage: Float,
        val coreCount: Int,
        val currentFrequency: Long? = null
    )
    
    @Serializable
    data class TemperatureInfo(
        val cpuTemperature: Float? = null,
        val batteryTemperature: Float? = null
    )
    
    @Serializable
    data class AppInfo(
        val appVersion: String,
        val buildNumber: String,
        val uptimeMillis: Long,
        val lastRestartTime: Long,
        val memoryUsage: Long,
        val threadCount: Int
    )
    
    @Serializable
    data class HealthStatus(
        val overall: HealthLevel,
        val issues: List<String>,
        val warnings: List<String>
    )
    
    enum class HealthLevel {
        HEALTHY, WARNING, CRITICAL, UNKNOWN
    }
    
    interface HealthMonitorListener {
        fun onHealthMetricsUpdated(metrics: DeviceHealthMetrics)
        fun onHealthAlert(level: HealthLevel, message: String)
        fun onHealthReportSent(success: Boolean)
    }
    
    /**
     * Start health monitoring
     */
    fun start() {
        if (isRunning) {
            Timber.w("DeviceHealthMonitor already running")
            return
        }
        
        isRunning = true
        Timber.i("🏥 Starting Device Health Monitor...")
        
        monitorJob = CoroutineScope(Dispatchers.IO).launch {
            var lastReportTime = 0L
            
            while (isRunning) {
                try {
                    // Collect health metrics
                    val metrics = collectHealthMetrics()
                    
                    // Store in history
                    synchronized(healthHistory) {
                        healthHistory.add(metrics)
                        if (healthHistory.size > MAX_HEALTH_RECORDS) {
                            healthHistory.removeAt(0)
                        }
                    }
                    
                    // Notify listeners
                    notifyHealthMetricsUpdated(metrics)
                    
                    // Check for alerts
                    checkHealthAlerts(metrics)
                    
                    // Report to backend periodically
                    val currentTime = System.currentTimeMillis()
                    if (currentTime - lastReportTime >= HEALTH_REPORT_INTERVAL_MS) {
                        reportHealthToBackend(metrics)
                        lastReportTime = currentTime
                    }
                    
                    delay(HEALTH_CHECK_INTERVAL_MS)
                    
                } catch (e: Exception) {
                    Timber.e(e, "❌ Error in health monitoring cycle")
                    delay(HEALTH_CHECK_INTERVAL_MS)
                }
            }
        }
    }
    
    /**
     * Stop health monitoring
     */
    fun stop() {
        isRunning = false
        monitorJob?.cancel()
        Timber.i("⏹️ Device Health Monitor stopped")
    }
    
    /**
     * Add health monitor listener
     */
    fun addListener(listener: HealthMonitorListener) {
        listeners.add(listener)
    }
    
    /**
     * Remove health monitor listener
     */
    fun removeListener(listener: HealthMonitorListener) {
        listeners.remove(listener)
    }
    
    /**
     * Get current health metrics
     */
    fun getCurrentHealth(): DeviceHealthMetrics? {
        return synchronized(healthHistory) {
            healthHistory.lastOrNull()
        }
    }
    
    /**
     * Get health history
     */
    fun getHealthHistory(): List<DeviceHealthMetrics> {
        return synchronized(healthHistory) {
            healthHistory.toList()
        }
    }
    
    /**
     * Collect comprehensive health metrics
     */
    private fun collectHealthMetrics(): DeviceHealthMetrics {
        Timber.d("📊 Collecting device health metrics...")
        
        return DeviceHealthMetrics(
            deviceInfo = collectDeviceInfo(),
            memoryInfo = collectMemoryInfo(),
            storageInfo = collectStorageInfo(),
            networkInfo = collectNetworkInfo(),
            cpuInfo = collectCpuInfo(),
            temperatureInfo = collectTemperatureInfo(),
            appInfo = collectAppInfo(),
            healthStatus = evaluateHealthStatus()
        )
    }
    
    private fun collectDeviceInfo(): DeviceInfo {
        return DeviceInfo()
    }
    
    private fun collectMemoryInfo(): MemoryInfo {
        val memInfo = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memInfo)
        
        val totalRAM = memInfo.totalMem
        val availableRAM = memInfo.availMem
        val usedRAM = totalRAM - availableRAM
        val freePercentage = (availableRAM.toFloat() / totalRAM.toFloat())
        
        return MemoryInfo(
            totalRAM = totalRAM,
            availableRAM = availableRAM,
            usedRAM = usedRAM,
            freeRAMPercentage = freePercentage,
            lowMemory = memInfo.lowMemory
        )
    }
    
    private fun collectStorageInfo(): StorageInfo {
        val stat = StatFs(Environment.getDataDirectory().path)
        val bytesAvailable = stat.blockSizeLong * stat.availableBlocksLong
        val bytesTotal = stat.blockSizeLong * stat.blockCountLong
        val bytesUsed = bytesTotal - bytesAvailable
        val freePercentage = bytesAvailable.toFloat() / bytesTotal.toFloat()
        
        return StorageInfo(
            totalStorage = bytesTotal,
            availableStorage = bytesAvailable,
            usedStorage = bytesUsed,
            freeStoragePercentage = freePercentage
        )
    }
    
    private fun collectNetworkInfo(): NetworkInfo {
        val activeNetwork = connectivityManager.activeNetwork
        val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork)
        
        val isConnected = capabilities != null
        val connectionType = when {
            capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true -> "WiFi"
            capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true -> "Ethernet"
            capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "Cellular"
            else -> "Unknown"
        }
        
        return NetworkInfo(
            isConnected = isConnected,
            connectionType = connectionType,
            signalStrength = null // Would need more complex implementation for WiFi/cellular signal
        )
    }
    
    private fun collectCpuInfo(): CpuInfo {
        val cpuUsage = getCpuUsage()
        val coreCount = Runtime.getRuntime().availableProcessors()
        
        return CpuInfo(
            cpuUsagePercentage = cpuUsage,
            coreCount = coreCount,
            currentFrequency = null // Would need root access or different approach
        )
    }
    
    private fun collectTemperatureInfo(): TemperatureInfo? {
        // Temperature monitoring would require root access or manufacturer-specific APIs
        // Placeholder for future implementation
        return null
    }
    
    private fun collectAppInfo(): AppInfo {
        val runtime = Runtime.getRuntime()
        val memoryUsage = runtime.totalMemory() - runtime.freeMemory()
        
        // Get thread count
        val threadCount = Thread.activeCount()
        
        // App uptime (approximate)
        val uptimeMillis = System.currentTimeMillis() - getAppStartTime()
        
        return AppInfo(
            appVersion = getAppVersion(),
            buildNumber = getBuildNumber(),
            uptimeMillis = uptimeMillis,
            lastRestartTime = getAppStartTime(),
            memoryUsage = memoryUsage,
            threadCount = threadCount
        )
    }
    
    private fun evaluateHealthStatus(): HealthStatus {
        val issues = mutableListOf<String>()
        val warnings = mutableListOf<String>()
        
        // Memory checks
        val memInfo = collectMemoryInfo()
        if (memInfo.freeRAMPercentage < CRITICAL_MEMORY_THRESHOLD) {
            issues.add("Critical low memory: ${String.format("%.1f", memInfo.freeRAMPercentage * 100)}% free")
        } else if (memInfo.freeRAMPercentage < 0.2f) {
            warnings.add("Low memory warning: ${String.format("%.1f", memInfo.freeRAMPercentage * 100)}% free")
        }
        
        // Storage checks
        val storageInfo = collectStorageInfo()
        if (storageInfo.freeStoragePercentage < CRITICAL_STORAGE_THRESHOLD) {
            issues.add("Critical low storage: ${String.format("%.1f", storageInfo.freeStoragePercentage * 100)}% free")
        } else if (storageInfo.freeStoragePercentage < 0.1f) {
            warnings.add("Low storage warning: ${String.format("%.1f", storageInfo.freeStoragePercentage * 100)}% free")
        }
        
        // CPU checks
        val cpuInfo = collectCpuInfo()
        if (cpuInfo.cpuUsagePercentage > HIGH_CPU_THRESHOLD) {
            warnings.add("High CPU usage: ${String.format("%.1f", cpuInfo.cpuUsagePercentage)}%")
        }
        
        // Network checks
        val networkInfo = collectNetworkInfo()
        if (!networkInfo.isConnected) {
            issues.add("No network connection")
        }
        
        val overall = when {
            issues.isNotEmpty() -> HealthLevel.CRITICAL
            warnings.isNotEmpty() -> HealthLevel.WARNING
            else -> HealthLevel.HEALTHY
        }
        
        return HealthStatus(
            overall = overall,
            issues = issues,
            warnings = warnings
        )
    }
    
    /**
     * Check for health alerts and notify listeners
     */
    private fun checkHealthAlerts(metrics: DeviceHealthMetrics) {
        when (metrics.healthStatus.overall) {
            HealthLevel.CRITICAL -> {
                val message = "Critical issues: ${metrics.healthStatus.issues.joinToString(", ")}"
                Timber.e("🚨 Health Alert - CRITICAL: $message")
                notifyHealthAlert(HealthLevel.CRITICAL, message)
                
                // Send alert to server for critical issues
                CoroutineScope(Dispatchers.IO).launch {
                    sendPerformanceAlert(metrics)
                }
            }
            HealthLevel.WARNING -> {
                val message = "Warnings: ${metrics.healthStatus.warnings.joinToString(", ")}"
                Timber.w("⚠️ Health Alert - WARNING: $message")
                notifyHealthAlert(HealthLevel.WARNING, message)
                
                // Send alert to server for warnings that indicate performance issues
                if (metrics.memoryInfo.freeRAMPercentage < 15 || 
                    metrics.storageInfo.freeStoragePercentage < 15 ||
                    metrics.cpuInfo.cpuUsagePercentage > 75) {
                    CoroutineScope(Dispatchers.IO).launch {
                        sendPerformanceAlert(metrics)
                    }
                }
            }
            HealthLevel.HEALTHY -> {
                Timber.d("✅ Device health: All systems normal")
            }
            else -> {}
        }
    }
    
    /**
     * Report health metrics to backend
     */
    private suspend fun reportHealthToBackend(metrics: DeviceHealthMetrics) {
        try {
            // Get device token and screen ID from SharedPreferences
            val sharedPrefs = context.getSharedPreferences("mesophy_config", Context.MODE_PRIVATE)
            val deviceToken = sharedPrefs.getString("device_token", null)
            val screenId = sharedPrefs.getString("screen_id", null)
            
            if (deviceToken == null) {
                Timber.w("⚠️ No device token found, cannot report health metrics")
                notifyHealthReportSent(false)
                return
            }
            
            Timber.i("📊 Reporting health metrics to backend...")
            Timber.d("Health level: ${metrics.healthStatus.overall}")
            
            // Send health metrics to backend
            val response = apiClient.reportDeviceHealth(deviceToken, screenId, metrics)
            
            Timber.i("✅ Health metrics reported successfully: ${response.message}")
            if (response.alerts?.isNotEmpty() == true) {
                Timber.w("⚠️ Backend alerts: ${response.alerts.map { it.message }}")
            }
            
            notifyHealthReportSent(true)
            
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to report health to backend")
            notifyHealthReportSent(false)
        }
    }
    
    /**
     * Get CPU usage percentage
     */
    private fun getCpuUsage(): Float {
        return try {
            val reader = BufferedReader(FileReader("/proc/stat"))
            val load = reader.readLine()
            reader.close()
            
            val toks = load.split(" ".toRegex()).toTypedArray()
            val idle1 = toks[4].toLong()
            val cpu1 = toks[2].toLong() + toks[3].toLong() + toks[5].toLong() + toks[6].toLong() + toks[7].toLong() + toks[8].toLong()
            
            Thread.sleep(360)
            
            val reader2 = BufferedReader(FileReader("/proc/stat"))
            val load2 = reader2.readLine()
            reader2.close()
            
            val toks2 = load2.split(" ".toRegex()).toTypedArray()
            val idle2 = toks2[4].toLong()
            val cpu2 = toks2[2].toLong() + toks2[3].toLong() + toks2[5].toLong() + toks2[6].toLong() + toks2[7].toLong() + toks2[8].toLong()
            
            val cpuUsage = (cpu2 - cpu1).toFloat() / ((cpu2 + idle2) - (cpu1 + idle1)).toFloat() * 100f
            cpuUsage
        } catch (e: Exception) {
            Timber.w("Failed to get CPU usage: ${e.message}")
            0f
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
    
    private fun getBuildNumber(): String {
        return try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo.longVersionCode.toString()
            } else {
                @Suppress("DEPRECATION")
                packageInfo.versionCode.toString()
            }
        } catch (e: Exception) {
            "Unknown"
        }
    }
    
    private fun getAppStartTime(): Long {
        // This is a simplified implementation
        // In a real app, you'd store the actual start time
        return System.currentTimeMillis() - 60000L // Assume app started 1 minute ago for now
    }
    
    /**
     * Send alert to server for performance warnings
     */
    private suspend fun sendPerformanceAlert(metrics: DeviceHealthMetrics) {
        try {
            val deviceToken = getDeviceToken() ?: return
            
            val issues = mutableListOf<String>()
            var severity = "medium"
            
            // Check memory usage
            if (metrics.memoryInfo.freeRAMPercentage < 10) {
                issues.add("Low memory: ${100 - metrics.memoryInfo.freeRAMPercentage.toInt()}% used")
                severity = "high"
            }
            
            // Check storage usage
            if (metrics.storageInfo.freeStoragePercentage < 10) {
                issues.add("Low storage: ${100 - metrics.storageInfo.freeStoragePercentage.toInt()}% used")
                if (metrics.storageInfo.freeStoragePercentage < 5) {
                    severity = "critical"
                }
            }
            
            // Check CPU usage
            if (metrics.cpuInfo.cpuUsagePercentage > HIGH_CPU_THRESHOLD) {
                issues.add("High CPU: ${metrics.cpuInfo.cpuUsagePercentage.toInt()}% usage")
            }
            
            if (issues.isNotEmpty()) {
                val alertData = mapOf(
                    "device_id" to getDeviceId(),
                    "alert_type" to "performance_warning",
                    "severity" to severity,
                    "message" to "Performance issues detected: ${issues.joinToString(", ")}",
                    "details" to mapOf(
                        "memory_usage_percent" to (100 - metrics.memoryInfo.freeRAMPercentage),
                        "storage_usage_percent" to (100 - metrics.storageInfo.freeStoragePercentage), 
                        "cpu_usage_percent" to metrics.cpuInfo.cpuUsagePercentage,
                        "total_memory_mb" to (metrics.memoryInfo.totalRAM / 1024 / 1024),
                        "available_memory_mb" to (metrics.memoryInfo.availableRAM / 1024 / 1024),
                        "total_storage_gb" to (metrics.storageInfo.totalStorage / 1024 / 1024 / 1024),
                        "available_storage_gb" to (metrics.storageInfo.availableStorage / 1024 / 1024 / 1024)
                    ),
                    "metric_value" to maxOf(
                        100 - metrics.memoryInfo.freeRAMPercentage,
                        100 - metrics.storageInfo.freeStoragePercentage,
                        metrics.cpuInfo.cpuUsagePercentage
                    )
                )
                
                apiClient.sendAlert(deviceToken, alertData as Map<String, Any>)
                Timber.w("🚨 Performance alert sent: ${issues.joinToString(", ")}")
            }
            
        } catch (e: Exception) {
            Timber.e(e, "Failed to send performance alert")
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

    // Listener notification methods
    private fun notifyHealthMetricsUpdated(metrics: DeviceHealthMetrics) {
        listeners.forEach { listener ->
            try {
                listener.onHealthMetricsUpdated(metrics)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying health metrics listener")
            }
        }
    }
    
    private fun notifyHealthAlert(level: HealthLevel, message: String) {
        listeners.forEach { listener ->
            try {
                listener.onHealthAlert(level, message)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying health alert listener")
            }
        }
    }
    
    private fun notifyHealthReportSent(success: Boolean) {
        listeners.forEach { listener ->
            try {
                listener.onHealthReportSent(success)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying health report listener")
            }
        }
    }
}