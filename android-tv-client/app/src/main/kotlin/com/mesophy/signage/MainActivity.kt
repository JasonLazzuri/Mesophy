package com.mesophy.signage

import android.app.AlertDialog
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * MainActivity with real API pairing system
 * 
 * Communicates with Mesophy backend to get valid pairing codes
 * and poll for pairing completion.
 */
class MainActivity : FragmentActivity() {
    
    companion object {
        private const val TAG = "MainActivity"
        private const val POLLING_INTERVAL_MS = 3000L // Poll every 3 seconds
        private const val INITIAL_PAIRING_RETRY_DELAY_MS = 5000L // 5 seconds initial
        private const val MAX_PAIRING_RETRY_DELAY_MS = 120000L // 2 minutes max
    }

    private lateinit var pairingCodeText: TextView
    private lateinit var deviceInfoText: TextView
    private lateinit var statusText: TextView
    private lateinit var connectionStatus: TextView
    private lateinit var statusIndicator: android.view.View
    private lateinit var connectionIndicator: android.view.View

    private val apiClient = ApiClient()
    private var currentPairingCode: String? = null
    private var isPolling = false
    private var pairingRetryCount = 0
    private var mediaDownloadManager: MediaDownloadManager? = null
    private var mediaPlayerFragment: MediaPlayerFragment? = null
    private var deviceHealthMonitor: DeviceHealthMonitor? = null
    private var powerScheduleManager: PowerScheduleManager? = null
    private var errorRecoveryManager: ErrorRecoveryManager? = null
    private var contentSyncManager: ContentSyncManager? = null
    private var isMediaPlaying = false
    private var wakeLock: PowerManager.WakeLock? = null

    // Internal broadcast receiver for power management commands
    private val powerCommandReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                "com.mesophy.signage.INTERNAL_POWER_SCHEDULE_UPDATE" -> {
                    handlePowerScheduleUpdate(intent)
                }
                "com.mesophy.signage.INTERNAL_FORCE_POWER_STATE" -> {
                    handleForcePowerState(intent)
                }
                "com.mesophy.signage.INTERNAL_GET_POWER_STATUS" -> {
                    handleGetPowerStatus()
                }
            }
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Keep screen on for digital signage - prevent sleep
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Acquire wake lock to ensure screen stays on
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "MesophySignage:ScreenOnWakeLock"
        )
        wakeLock?.acquire()

        // Initialize Timber logging for debug
        if (!Timber.forest().isNotEmpty()) {
            Timber.plant(Timber.DebugTree())
        }

        Timber.i("🚀 Mesophy Digital Signage - MainActivity created")
        Timber.d("Running on Android ${android.os.Build.VERSION.RELEASE}")
        Timber.d("Device: ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
        Timber.i("💡 Screen wake lock acquired - screen will stay on")
        
        // Check if this is an auto-start from boot
        val isAutoStart = intent?.getBooleanExtra("auto_start", false) ?: false
        val startReason = intent?.getStringExtra("start_reason") ?: "manual"
        
        if (isAutoStart) {
            Timber.i("🔄 AUTO-START DETECTED - Launched via $startReason")
        }
        
        // Initialize views
        pairingCodeText = findViewById(R.id.pairingCodeText)
        deviceInfoText = findViewById(R.id.deviceInfo)
        statusText = findViewById(R.id.statusText)
        connectionStatus = findViewById(R.id.connectionStatus)
        statusIndicator = findViewById(R.id.statusIndicator)
        connectionIndicator = findViewById(R.id.connectionIndicator)

        // Update device info
        val deviceInfo = "Android TV • ${android.os.Build.MODEL}"
        deviceInfoText.text = deviceInfo

        // Update app version
        val versionText = findViewById<TextView>(R.id.appVersion)
        try {
            val packageInfo = packageManager.getPackageInfo(packageName, 0)
            versionText.text = "v${packageInfo.versionName}"
        } catch (e: Exception) {
            versionText.text = "v1.0.0"
            Timber.w("Failed to get app version: ${e.message}")
        }
        
        // Initialize status indicators
        updateConnectionStatus("Initializing...")
        updateStatusIndicator(StatusType.CONNECTING)
        
        // Register internal broadcast receiver for power commands
        val powerCommandFilter = IntentFilter().apply {
            addAction("com.mesophy.signage.INTERNAL_POWER_SCHEDULE_UPDATE")
            addAction("com.mesophy.signage.INTERNAL_FORCE_POWER_STATE")
            addAction("com.mesophy.signage.INTERNAL_GET_POWER_STATUS")
        }
        // Android 14+ requires explicit RECEIVER_EXPORTED or RECEIVER_NOT_EXPORTED flag
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(powerCommandReceiver, powerCommandFilter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(powerCommandReceiver, powerCommandFilter)
        }
        
        // Check for SYSTEM_ALERT_WINDOW permission (required for background starts on Android 10+)
        checkSystemAlertWindowPermission()
        
        // Check if device is already paired
        checkPairingStatusAndProceed()
    }

    /**
     * Check and request "Display over other apps" permission
     * This is CRITICAL for the app to start automatically from the background on boot
     */
    private fun checkSystemAlertWindowPermission() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(this)) {
                Timber.w("⚠️ SYSTEM_ALERT_WINDOW permission missing - requesting user grant")
                
                AlertDialog.Builder(this)
                    .setTitle("Permission Required")
                    .setMessage("For the app to start automatically after a power outage, you must grant the 'Display over other apps' permission.\n\nPlease enable this in the next screen.")
                    .setPositiveButton("Grant Permission") { _, _ ->
                        try {
                            val intent = Intent(
                                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                android.net.Uri.parse("package:$packageName")
                            )
                            startActivityForResult(intent, 1001)
                        } catch (e: Exception) {
                            Timber.e(e, "Failed to open overlay permission settings")
                            Toast.makeText(this, "Please enable 'Display over other apps' in Settings", Toast.LENGTH_LONG).show()
                        }
                    }
                    .setCancelable(false)
                    .show()
            } else {
                Timber.i("✅ SYSTEM_ALERT_WINDOW permission already granted")
            }
        }
    }
    
    override fun onResume() {
        super.onResume()
        Timber.d("MainActivity resumed - ready for digital signage functionality")
        
        // Health check: ensure services are still running
        lifecycleScope.launch {
            delay(5000) // Wait 5 seconds after resume
            healthCheckServices()
        }
    }
    
    /**
     * Health check to ensure critical services are running
     */
    private fun healthCheckServices() {
        try {
            val sharedPrefs = getSharedPreferences("mesophy_config", MODE_PRIVATE)
            val isPaired = sharedPrefs.getBoolean("is_paired", false)
            
            if (isPaired) {
                // Check if ContentSyncManager is running
                if (contentSyncManager?.isRunning() != true) {
                    Timber.w("🔧 ContentSyncManager stopped - restarting...")
                    startContentSyncManager()
                }
                
                Timber.d("✅ Health check completed - all services running")
            }
        } catch (e: Exception) {
            Timber.e(e, "Health check failed")
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        isPolling = false
        deviceHealthMonitor?.stop()
        powerScheduleManager?.stop()
        contentSyncManager?.stop()
        errorRecoveryManager?.stop()

        // Release wake lock
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
                Timber.i("💡 Screen wake lock released")
            }
        }

        // Unregister internal broadcast receiver
        try {
            unregisterReceiver(powerCommandReceiver)
        } catch (e: Exception) {
            Timber.w("Failed to unregister power command receiver: ${e.message}")
        }

        Timber.i("MainActivity destroyed")
    }
    
    /**
     * Check if device is already paired and proceed accordingly
     */
    private fun checkPairingStatusAndProceed() {
        val sharedPrefs = getSharedPreferences("mesophy_config", MODE_PRIVATE)
        val isPaired = sharedPrefs.getBoolean("is_paired", false)
        val deviceToken = sharedPrefs.getString("device_token", null)
        
        if (isPaired && !deviceToken.isNullOrEmpty()) {
            Timber.i("✅ Device already paired, skipping pairing process")
            
            // Load saved device configuration
            val deviceConfig = DeviceConfig(
                deviceToken = deviceToken,
                screenId = sharedPrefs.getString("screen_id", "") ?: "",
                screenName = sharedPrefs.getString("screen_name", "Unknown Screen") ?: "Unknown Screen",
                screenType = sharedPrefs.getString("screen_type", "android_tv") ?: "android_tv",
                resolution = sharedPrefs.getString("resolution", "1920x1080") ?: "1920x1080",
                orientation = sharedPrefs.getString("orientation", "landscape") ?: "landscape",
                location = Location(
                    id = sharedPrefs.getString("location_id", "") ?: "",
                    name = sharedPrefs.getString("location_name", "Unknown Location") ?: "Unknown Location",
                    timezone = sharedPrefs.getString("location_timezone", "UTC") ?: "UTC"
                ),
                apiBase = sharedPrefs.getString("api_base", "https://mesophy.vercel.app") ?: "https://mesophy.vercel.app",
                syncInterval = sharedPrefs.getInt("sync_interval", 120),
                heartbeatInterval = sharedPrefs.getInt("heartbeat_interval", 300),
                apiEndpoints = ApiEndpoints(
                    sync = sharedPrefs.getString("api_sync", "/api/devices/sync") ?: "/api/devices/sync",
                    heartbeat = sharedPrefs.getString("api_heartbeat", "/api/devices/heartbeat") ?: "/api/devices/heartbeat",
                    logs = sharedPrefs.getString("api_logs", "/api/devices/logs") ?: "/api/devices/logs"
                )
            )
            
            // Go directly to content loading
            transitionToContentLoading(deviceConfig)
        } else {
            Timber.i("🔗 Device not paired, starting pairing process")
            startPairingProcess()
        }
    }
    
    /**
     * Start the real pairing process with API backend
     */
    private fun startPairingProcess() {
        lifecycleScope.launch {
            try {
                // Update UI for requesting code
                statusText.text = "Requesting pairing code..."
                pairingCodeText.text = "•••"
                updateConnectionStatus("Connecting to server...")
                updateStatusIndicator(StatusType.CONNECTING)
                
                Timber.i("Requesting pairing code from backend...")
                
                // Collect device info
                val deviceInfo = mapOf(
                    "manufacturer" to android.os.Build.MANUFACTURER,
                    "model" to android.os.Build.MODEL,
                    "device" to android.os.Build.DEVICE,
                    "product" to android.os.Build.PRODUCT,
                    "android_version" to android.os.Build.VERSION.RELEASE,
                    "api_level" to android.os.Build.VERSION.SDK_INT,
                    "brand" to android.os.Build.BRAND,
                    "app_version" to "1.0.0",
                    "client_type" to "android_tv"
                )
                
                // Request pairing code from backend
                val response = apiClient.generatePairingCode(deviceInfo)
                
                // Clean and update UI with pairing code
                val cleanCode = cleanPairingCode(response.pairingCode)
                currentPairingCode = cleanCode
                pairingCodeText.text = cleanCode
                statusText.text = "Code expires in ${response.expiresInMinutes} minutes"
                updateConnectionStatus("Connected")
                updateStatusIndicator(StatusType.ONLINE)

                // Reset retry count on success
                pairingRetryCount = 0

                Timber.i("✅ Received pairing code: ${response.pairingCode}")
                Timber.d("Dashboard URL: ${response.dashboardUrl}")

                // Start polling for pairing completion
                startPairingPolling()
                
            } catch (e: Exception) {
                Timber.e(e, "❌ Failed to request pairing code (attempt ${pairingRetryCount + 1})")

                // Calculate exponential backoff delay
                pairingRetryCount++
                val retryDelay = minOf(
                    INITIAL_PAIRING_RETRY_DELAY_MS * (1 shl minOf(pairingRetryCount - 1, 4)), // 2^n with max 2^4
                    MAX_PAIRING_RETRY_DELAY_MS
                )

                statusText.text = "Connection failed - retry in ${retryDelay / 1000}s..."
                pairingCodeText.text = "ERROR"
                updateConnectionStatus("Network error - attempt ${pairingRetryCount}")
                updateStatusIndicator(StatusType.ERROR)

                Timber.w("⏱️ Retrying pairing after ${retryDelay}ms (attempt ${pairingRetryCount})")

                // Retry after exponential backoff delay
                delay(retryDelay)
                startPairingProcess()
            }
        }
    }
    
    /**
     * Poll the backend to check if pairing is complete
     */
    private fun startPairingPolling() {
        val code = currentPairingCode ?: return
        
        isPolling = true
        
        lifecycleScope.launch {
            while (isPolling) {
                try {
                    Timber.d("🔄 Checking pairing status for code: $code")
                    
                    val status = apiClient.checkPairingStatus(code)
                    
                    when (status.status) {
                        "paired" -> {
                            // SUCCESS! Device is paired
                            isPolling = false
                            onPairingSuccess(status.deviceConfig!!)
                            return@launch
                        }
                        "waiting" -> {
                            // Still waiting for user to enter code
                            val remaining = status.timeRemaining ?: 0
                            statusText.text = "Waiting for pairing... (${remaining}s remaining)"
                            Timber.d("⏱️ Still waiting for pairing (${remaining}s left)")
                        }
                        "code_not_found" -> {
                            // Code expired or invalid
                            isPolling = false
                            statusText.text = "Code expired - generating new code..."
                            Timber.w("⚠️ Code expired, requesting new one...")
                            delay(2000)
                            startPairingProcess()
                            return@launch
                        }
                        "expired" -> {
                            // Code explicitly expired
                            isPolling = false
                            statusText.text = "Code expired - generating new code..."
                            Timber.w("⚠️ Code expired, requesting new one...")
                            delay(2000)
                            startPairingProcess()
                            return@launch
                        }
                    }
                    
                } catch (e: Exception) {
                    Timber.e(e, "❌ Error checking pairing status")
                    statusText.text = "Connection error - retrying..."
                }
                
                // Wait before next poll
                delay(POLLING_INTERVAL_MS)
            }
        }
    }
    
    /**
     * Handle successful pairing
     */
    private fun onPairingSuccess(deviceConfig: DeviceConfig) {
        Timber.i("🎉 PAIRING SUCCESS!")
        Timber.i("Screen: ${deviceConfig.screenName}")
        Timber.i("Location: ${deviceConfig.location.name}")
        Timber.i("Device Token: ${deviceConfig.deviceToken}")
        
        // Update UI for successful pairing
        statusText.text = "✅ Successfully paired!"
        pairingCodeText.text = "PAIRED"
        updateConnectionStatus("Paired to ${deviceConfig.screenName}")
        updateStatusIndicator(StatusType.PAIRED)
        
        // Save device configuration
        saveDeviceConfiguration(deviceConfig)
        
        // Short delay to show success, then transition to content loading
        lifecycleScope.launch {
            delay(2000) // Show success for 2 seconds
            transitionToContentLoading(deviceConfig)
        }
    }
    
    /**
     * Save device configuration for later use
     */
    private fun saveDeviceConfiguration(deviceConfig: DeviceConfig) {
        try {
            val sharedPrefs = getSharedPreferences("mesophy_config", MODE_PRIVATE)
            with(sharedPrefs.edit()) {
                putString("device_token", deviceConfig.deviceToken)
                putString("screen_id", deviceConfig.screenId)
                putString("screen_name", deviceConfig.screenName)
                putString("screen_type", deviceConfig.screenType)
                putString("resolution", deviceConfig.resolution)
                putString("orientation", deviceConfig.orientation)
                putString("location_id", deviceConfig.location.id)
                putString("location_name", deviceConfig.location.name)
                putString("location_timezone", deviceConfig.location.timezone)
                putString("api_base", deviceConfig.apiBase)
                putInt("sync_interval", deviceConfig.syncInterval)
                putInt("heartbeat_interval", deviceConfig.heartbeatInterval)
                putString("api_sync", deviceConfig.apiEndpoints.sync)
                putString("api_heartbeat", deviceConfig.apiEndpoints.heartbeat)
                putString("api_logs", deviceConfig.apiEndpoints.logs)
                putBoolean("is_paired", true)
                apply()
            }
            Timber.i("✅ Device configuration saved")
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to save device configuration")
        }
    }
    
    /**
     * Transition from pairing screen to content loading
     */
    private fun transitionToContentLoading(deviceConfig: DeviceConfig) {
        Timber.i("🔄 Transitioning to content loading screen...")
        
        // Update UI to show content loading state
        statusText.text = "Loading content..."
        pairingCodeText.text = "LOADING"
        updateConnectionStatus("Downloading content...")
        updateStatusIndicator(StatusType.CONNECTING)
        
        // Start content loading process
        startContentSyncManager()
        
        Timber.i("🚀 Content loading process started!")
    }
    
    /**
     * Transition back to pairing mode when device becomes unpaired
     */
    private fun transitionBackToPairingMode() {
        Timber.i("🔄 TRANSITIONING BACK TO PAIRING MODE")
        
        try {
            // Stop all running services
            errorRecoveryManager?.stop()
            deviceHealthMonitor?.stop()  
            powerScheduleManager?.stop()
            contentSyncManager?.stop()
            mediaDownloadManager?.stopDownloads()
            
            // Stop and hide media playback
            if (isMediaPlaying) {
                mediaPlayerFragment?.stopPlayback()
                isMediaPlaying = false
            }
            
            // Show the pairing UI again
            findViewById<View>(R.id.headerSection).visibility = View.VISIBLE
            findViewById<View>(R.id.mainCard).visibility = View.VISIBLE
            findViewById<View>(R.id.footerSection).visibility = View.VISIBLE
            
            // Remove media fragment if it exists
            mediaPlayerFragment?.let { fragment ->
                supportFragmentManager.beginTransaction()
                    .remove(fragment)
                    .commit()
                mediaPlayerFragment = null
            }
            
            // Reset UI to pairing state
            statusText.text = "Device unpaired - generating new code..."
            pairingCodeText.text = "..."
            updateConnectionStatus("Preparing to pair...")
            updateStatusIndicator(StatusType.CONNECTING)
            
            // Clear any stored configuration (should already be cleared by ContentSyncManager)
            val sharedPrefs = getSharedPreferences("mesophy_config", MODE_PRIVATE)
            with(sharedPrefs.edit()) {
                clear()
                apply()
            }
            
            // Reset internal state
            currentPairingCode = null
            isPolling = false
            
            // Start fresh pairing process after a short delay
            lifecycleScope.launch {
                delay(1000) // Brief delay to show unpaired message
                startPairingProcess()
            }
            
            Timber.i("✅ Successfully transitioned back to pairing mode")
            
        } catch (e: Exception) {
            Timber.e(e, "❌ Error during transition to pairing mode")
            updateConnectionStatus("Error returning to pairing mode")
            updateStatusIndicator(StatusType.ERROR)
        }
    }
    
    /**
     * Initialize and start ContentSyncManager
     */
    private fun startContentSyncManager() {
        try {
            // Create and start ErrorRecoveryManager first
            errorRecoveryManager = ErrorRecoveryManager(this)
            errorRecoveryManager!!.addListener(object : ErrorRecoveryManager.ErrorRecoveryListener {
                override fun onErrorRecovered(errorType: String) {
                    runOnUiThread {
                        Timber.i("✅ Error recovered: $errorType")
                        updateConnectionStatus("Recovered from $errorType error")
                    }
                }
                
                override fun onNetworkReconnected() {
                    runOnUiThread {
                        Timber.i("🌐 Network reconnected")
                        updateConnectionStatus("Network reconnected")
                        updateStatusIndicator(StatusType.ONLINE)
                    }
                }
                
                override fun onApplicationRestarting(reason: String) {
                    runOnUiThread {
                        Timber.w("🔄 Application restarting: $reason")
                        updateConnectionStatus("Restarting: $reason")
                        updateStatusIndicator(StatusType.ERROR)
                        statusText.text = "Restarting app..."
                        pairingCodeText.text = "RESTART"
                    }
                }
                
                override fun onCriticalError(error: String) {
                    runOnUiThread {
                        Timber.e("🚨 Critical error: $error")
                        updateConnectionStatus("Critical error: $error")
                        updateStatusIndicator(StatusType.ERROR)
                    }
                }
            })
            errorRecoveryManager!!.start()
            Timber.i("🛡️ Error Recovery Manager started")
            
            // Create MediaDownloadManager
            mediaDownloadManager = MediaDownloadManager(this)
            
            // TEMPORARILY DISABLED: Create and start DeviceHealthMonitor
            // Health monitoring disabled for local development due to missing database table
            // TODO: Re-enable after creating device_health_metrics table in Supabase
            /*
            deviceHealthMonitor = DeviceHealthMonitor(this)
            deviceHealthMonitor!!.addListener(object : DeviceHealthMonitor.HealthMonitorListener {
                override fun onHealthMetricsUpdated(metrics: DeviceHealthMonitor.DeviceHealthMetrics) {
                    // Log health metrics periodically
                    if (metrics.healthStatus.overall != DeviceHealthMonitor.HealthLevel.HEALTHY) {
                        Timber.w("🏥 Health: ${metrics.healthStatus.overall} - RAM: ${String.format("%.1f", metrics.memoryInfo.freeRAMPercentage * 100)}%")
                    }
                }

                override fun onHealthAlert(level: DeviceHealthMonitor.HealthLevel, message: String) {
                    runOnUiThread {
                        when (level) {
                            DeviceHealthMonitor.HealthLevel.CRITICAL -> {
                                updateConnectionStatus("⚠️ Critical: $message")
                                updateStatusIndicator(StatusType.ERROR)
                            }
                            DeviceHealthMonitor.HealthLevel.WARNING -> {
                                // Only update status if not already in error state
                                if (statusIndicator.tag != StatusType.ERROR) {
                                    updateConnectionStatus("⚠️ Warning: $message")
                                }
                            }
                            else -> {}
                        }
                    }
                }

                override fun onHealthReportSent(success: Boolean) {
                    if (!success) {
                        Timber.w("📊 Failed to send health report to backend")
                    }
                }
            })
            deviceHealthMonitor!!.start()
            */
            Timber.i("⚠️ Device Health Monitor DISABLED for local development")
            
            // Create and start PowerScheduleManager
            powerScheduleManager = PowerScheduleManager(this)
            powerScheduleManager!!.addListener(object : PowerScheduleManager.PowerScheduleListener {
                override fun onPowerStateChanged(state: PowerScheduleManager.PowerState, scheduledChange: Boolean) {
                    runOnUiThread {
                        val stateText = when (state) {
                            PowerScheduleManager.PowerState.ON -> "Display ON"
                            PowerScheduleManager.PowerState.OFF -> "Display OFF"
                            PowerScheduleManager.PowerState.TRANSITIONING -> "Transitioning..."
                            PowerScheduleManager.PowerState.UNKNOWN -> "Unknown state"
                        }
                        val changeType = if (scheduledChange) " (scheduled)" else " (manual)"
                        Timber.i("🔌 Power: $stateText$changeType")
                    }
                }
                
                override fun onScheduleUpdated(schedule: PowerScheduleManager.PowerSchedule) {
                    Timber.i("🔌 Power schedule updated: ${schedule.onTime} - ${schedule.offTime}")
                }
                
                override fun onPreShutdownWarning(minutesRemaining: Int) {
                    runOnUiThread {
                        val warningMessage = "⏰ Display will turn off in $minutesRemaining minute${if (minutesRemaining != 1) "s" else ""}"

                        // Update status text
                        updateConnectionStatus(warningMessage)

                        // Show prominent Toast notification
                        Toast.makeText(
                            this@MainActivity,
                            warningMessage,
                            Toast.LENGTH_LONG
                        ).show()

                        Timber.w("⏰ Pre-shutdown warning: $minutesRemaining minutes remaining")
                        Timber.w("🔔 Toast notification displayed: $warningMessage")
                    }
                }
                
                override fun onPowerError(error: String) {
                    runOnUiThread {
                        Timber.e("❌ Power management error: $error")
                        // Only show power errors if not in critical state
                        if (statusIndicator.tag != StatusType.ERROR) {
                            updateConnectionStatus("Power error: $error")
                        }
                    }
                }
            })

            // Check for WRITE_SETTINGS permission before starting PowerScheduleManager
            checkPowerManagementPermissions()

            powerScheduleManager!!.start()
            Timber.i("🔌 Power Schedule Manager started")
            
            // Create ContentSyncManager 
            contentSyncManager = ContentSyncManager(this, mediaDownloadManager!!)
            
            // Reset unpairing state from any previous authentication failures
            contentSyncManager!!.resetUnpairingState()
            
            // Register components with error recovery manager
            errorRecoveryManager!!.registerComponents(contentSyncManager!!, null) // SSE manager will be registered separately
            
            // Add content sync listener
            contentSyncManager!!.addListener(object : ContentSyncManager.ContentSyncListener {
                override fun onSyncStatusChanged(status: ContentSyncStatus) {
                    runOnUiThread {
                        updateContentSyncStatus(status)
                    }
                }
                
                override fun onContentAvailable(content: CurrentContentResponse) {
                    runOnUiThread {
                        handleContentAvailable(content)
                    }
                }
                
                override fun onSyncError(error: String) {
                    runOnUiThread {
                        handleContentSyncError(error)
                        // Only report to error recovery manager if NOT a device unpaired error
                        if (error != "DEVICE_UNPAIRED" && !error.contains("Device not paired")) {
                            errorRecoveryManager?.handleComponentError("ContentSyncManager", error)
                        }
                    }
                }
            })
            
            // Add download progress listener
            mediaDownloadManager!!.addListener(object : MediaDownloadManager.DownloadListener {
                override fun onDownloadStarted(mediaId: String, fileName: String) {
                    runOnUiThread {
                        updateConnectionStatus("Downloading $fileName...")
                    }
                }

                override fun onDownloadProgress(progress: DownloadProgress) {
                    runOnUiThread {
                        val percentage = if (progress.totalBytes > 0) {
                            ((progress.bytesDownloaded.toDouble() / progress.totalBytes) * 100).toInt()
                        } else 0

                        updateConnectionStatus("Downloading ${progress.fileName}... $percentage%")
                    }
                }

                override fun onDownloadCompleted(mediaId: String, localPath: String) {
                    runOnUiThread {
                        Timber.i("✅ Media downloaded: $localPath")
                    }
                }

                override fun onDownloadFailed(mediaId: String, error: String) {
                    runOnUiThread {
                        Timber.e("❌ Download failed: $error")
                        updateConnectionStatus("Download failed: $error")
                    }
                }

                override fun onAllDownloadsCompleted() {
                    runOnUiThread {
                        Timber.i("🎉 All media files downloaded - ready for playback!")
                        updateConnectionStatus("All media downloaded - ready to play")
                    }
                }
            })
            
            // Start content synchronization
            contentSyncManager!!.start()
            
            Timber.i("🚀 ContentSyncManager started successfully")
            
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to start ContentSyncManager")
            updateConnectionStatus("Content sync failed: ${e.message}")
            updateStatusIndicator(StatusType.ERROR)
        }
    }
    
    /**
     * Handle content sync status updates
     */
    private fun updateContentSyncStatus(status: ContentSyncStatus) {
        Timber.d("📊 Content sync status: connected=${status.isConnected}, schedules=${status.schedulesCount}")
        
        if (status.isConnected) {
            updateStatusIndicator(StatusType.ONLINE)
            
            if (status.schedulesCount > 0) {
                statusText.text = "Content synchronized"
                updateConnectionStatus("${status.schedulesCount} schedules, ${status.mediaItemsCount} media items")
                
                // Show current schedule info if available
                status.currentSchedule?.let { schedule ->
                    pairingCodeText.text = schedule.name.uppercase()
                }
            } else {
                statusText.text = "No content scheduled"
                updateConnectionStatus("Waiting for content...")
                pairingCodeText.text = "WAITING"
            }
        } else {
            updateStatusIndicator(StatusType.ERROR)
            statusText.text = status.error ?: "Connection lost"
            updateConnectionStatus("Reconnecting...")
        }
        
        // Update download queue status
        if (status.downloadQueue.isNotEmpty()) {
            val downloading = status.downloadQueue.count { it.status == DownloadStatus.DOWNLOADING }
            val queued = status.downloadQueue.count { it.status == DownloadStatus.QUEUED }
            val failed = status.downloadQueue.count { it.status == DownloadStatus.FAILED }
            
            if (downloading > 0 || queued > 0) {
                updateConnectionStatus("Downloads: $downloading active, $queued queued")
            } else if (failed > 0) {
                updateConnectionStatus("$failed downloads failed")
            }
        }
    }
    
    /**
     * Handle when content becomes available for display
     */
    private fun handleContentAvailable(content: CurrentContentResponse) {
        Timber.i("🎬 Content available for display:")
        Timber.i("  • Schedule: ${content.scheduleName ?: "Default"}")
        Timber.i("  • Media items: ${content.mediaAssets.size}")
        
        if (content.mediaAssets.isNotEmpty()) {
            if (!isMediaPlaying) {
                // First time - start media playback
                statusText.text = "Content ready"
                pairingCodeText.text = "READY"
                updateConnectionStatus("Playing ${content.scheduleName ?: "content"}")
                updateStatusIndicator(StatusType.PAIRED)
                
                Timber.i("🎬 Starting initial media playback!")
                startMediaPlayback(content)
            } else {
                // Already playing - update playlist
                Timber.i("🔄 Updating media playlist while playing")
                mediaPlayerFragment?.updatePlaylist(content)
                
                // Update connection status to show current schedule name
                updateConnectionStatus("Playing ${content.scheduleName ?: "content"}")
            }
            
        } else {
            statusText.text = "No media to display"
            pairingCodeText.text = "EMPTY"
            updateConnectionStatus("Waiting for media...")
            updateStatusIndicator(StatusType.ERROR)
            
            // Stop playback if currently playing
            if (isMediaPlaying) {
                mediaPlayerFragment?.stopPlayback()
                isMediaPlaying = false
            }
        }
    }
    
    /**
     * Handle content sync errors
     */
    private fun handleContentSyncError(error: String) {
        Timber.e("❌ Content sync error: $error")
        
        // Check if this is a device unpaired error
        if (error == "DEVICE_UNPAIRED") {
            Timber.i("🔧 DEVICE UNPAIRED DETECTED - Returning to pairing screen")
            transitionBackToPairingMode()
            return
        }
        
        // Handle other sync errors normally
        statusText.text = "Sync error"
        updateConnectionStatus(error)
        updateStatusIndicator(StatusType.ERROR)
    }
    
    /**
     * Update connection status text
     */
    private fun updateConnectionStatus(status: String) {
        connectionStatus.text = status
    }
    
    /**
     * Update status indicator color based on current state
     */
    private fun updateStatusIndicator(statusType: StatusType) {
        val colorResId = when (statusType) {
            StatusType.CONNECTING -> R.color.warning
            StatusType.ONLINE -> R.color.accent
            StatusType.PAIRED -> R.color.success
            StatusType.ERROR -> R.color.error
            StatusType.OFFLINE -> R.color.light_gray
        }
        
        statusIndicator.setBackgroundResource(getStatusDrawable(statusType))
        connectionIndicator.setBackgroundResource(getStatusDrawable(statusType))
    }
    
    /**
     * Get appropriate drawable for status type
     */
    private fun getStatusDrawable(statusType: StatusType): Int {
        return when (statusType) {
            StatusType.CONNECTING -> R.drawable.status_connecting
            StatusType.ONLINE -> R.drawable.status_online
            StatusType.PAIRED -> R.drawable.status_paired
            StatusType.ERROR -> R.drawable.status_error
            StatusType.OFFLINE -> R.drawable.status_offline
        }
    }
    
    /**
     * Start media playback using MediaPlayerFragment
     */
    private fun startMediaPlayback(content: CurrentContentResponse) {
        try {
            // Get playlist items and sort by display_order to ensure correct playback sequence
            val playlistItems = (content.playlist?.items ?: emptyList())
                .sortedBy { it.displayOrder }

            Timber.i("🎬 Starting media playback with ${playlistItems.size} playlist items")

            // Debug logging for playlist order
            playlistItems.forEachIndexed { index, item ->
                Timber.d("  $index: displayOrder=${item.displayOrder}, name=${item.media?.name}, type=${item.media?.mimeType}")
            }
            
            // Hide the pairing UI and show media content
            findViewById<View>(R.id.headerSection).visibility = View.GONE
            findViewById<View>(R.id.mainCard).visibility = View.GONE
            findViewById<View>(R.id.footerSection).visibility = View.GONE
            
            // Create and show MediaPlayerFragment
            mediaPlayerFragment = MediaPlayerFragment()
            
            // Set up media playback listener
            mediaPlayerFragment?.setMediaPlaybackListener(object : MediaPlayerFragment.MediaPlaybackListener {
                override fun onMediaStarted(item: PlaylistItem) {
                    Timber.d("🎵 Media started: ${item.media?.name ?: "Unknown"}")
                }
                
                override fun onMediaCompleted(item: PlaylistItem) {
                    Timber.d("✅ Media completed: ${item.media?.name ?: "Unknown"}")
                }
                
                override fun onPlaylistCompleted() {
                    Timber.i("🔄 Playlist completed, restarting...")
                }
                
                override fun onMediaError(item: PlaylistItem, error: String) {
                    Timber.e("❌ Media error: ${item.media?.name ?: "Unknown"} - $error")
                }
            })
            
            // Add fragment to container
            supportFragmentManager.beginTransaction()
                .replace(android.R.id.content, mediaPlayerFragment!!)
                .commit()

            // Wait for fragment to be fully initialized before starting playlist
            // Post to message queue to ensure onViewCreated has been called
            supportFragmentManager.executePendingTransactions()

            // Start playing the playlist items
            mediaPlayerFragment?.view?.post {
                mediaPlayerFragment?.startPlaylist(playlistItems)
            }
            
            // Mark media as playing
            isMediaPlaying = true
            
            Timber.i("✅ Media playback started successfully!")
            
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to start media playback")
            // Show error and return to status screen
            findViewById<View>(R.id.headerSection).visibility = View.VISIBLE
            findViewById<View>(R.id.mainCard).visibility = View.VISIBLE
            findViewById<View>(R.id.footerSection).visibility = View.VISIBLE
            
            statusText.text = "Playback error"
            updateConnectionStatus("Error: ${e.message}")
            updateStatusIndicator(StatusType.ERROR)
            isMediaPlaying = false
        }
    }
    
    /**
     * Get MediaDownloadManager instance for fragments
     */
    fun getMediaDownloadManager(): MediaDownloadManager? {
        return mediaDownloadManager
    }

    /**
     * Get device token for API authentication
     */
    fun getDeviceToken(): String? {
        val sharedPrefs = getSharedPreferences("mesophy_config", MODE_PRIVATE)
        return sharedPrefs.getString("device_token", null)
    }

    /**
     * Get API base URL
     */
    fun getBaseUrl(): String {
        // Production code:
        val sharedPrefs = getSharedPreferences("mesophy_config", MODE_PRIVATE)
        return sharedPrefs.getString("api_base", "https://mesophy.vercel.app") ?: "https://mesophy.vercel.app"

        // For local development, uncomment the line below:
        // return "http://192.168.29.216:3000"
    }
    
    /**
     * Clean pairing code to ensure only alphanumeric characters
     * The backend already generates clean codes, so we just sanitize and validate
     */
    private fun cleanPairingCode(code: String): String {
        // Remove any non-alphanumeric characters and uppercase
        // Backend already avoids confusing characters (0, O, 1, I, L), so no need to replace
        val cleanCode = code.replace(Regex("[^A-Za-z0-9]"), "").uppercase()

        // Return the code as-is from backend (should already be 6 characters)
        return cleanCode
    }

    /**
     * Check for power management permissions and request if needed
     */
    private fun checkPowerManagementPermissions() {
        try {
            // Check if WRITE_SETTINGS permission is granted
            if (!Settings.System.canWrite(this)) {
                Timber.w("🔐 WRITE_SETTINGS permission not granted")

                // Check if device recently booted (within last 5 minutes)
                // During boot, we can't reliably launch Settings screen due to Android restrictions
                val bootTime = System.currentTimeMillis() - android.os.SystemClock.elapsedRealtime()
                val timeSinceBoot = System.currentTimeMillis() - bootTime
                val isRecentBoot = timeSinceBoot < 300000 // 5 minutes

                // If recently booted, skip permission request entirely
                // Power schedules will work with HDMI-CEC fallback
                // User can grant permission later when they manually interact with the app
                if (isRecentBoot) {
                    Timber.i("🔐 Skipping permission request during boot - power schedules will use HDMI-CEC fallback")
                    Timber.i("💡 User can grant WRITE_SETTINGS permission later for full functionality")
                    return
                }

                // Show dialog only if NOT during recent boot
                showPermissionDialog()
            } else {
                Timber.i("✅ WRITE_SETTINGS permission already granted")
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to check power management permissions")
        }
    }

    /**
     * Show the permission request dialog
     */
    private fun showPermissionDialog() {
        try {
            // Check again if permission is still needed
            if (Settings.System.canWrite(this)) {
                Timber.i("✅ WRITE_SETTINGS permission already granted")
                return
            }

            // Show dialog explaining why we need this permission
            AlertDialog.Builder(this)
                .setTitle("Power Schedule Permission")
                .setMessage(
                    "To automatically turn the display on/off at scheduled times, " +
                    "this app needs permission to modify system settings.\n\n" +
                    "This allows the app to:\n" +
                    "• Control screen brightness for tablets\n" +
                    "• Manage power schedules for energy efficiency\n\n" +
                    "Would you like to grant this permission now?"
                )
                .setPositiveButton("Grant Permission") { _, _ ->
                    try {
                        val intent = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS).apply {
                            data = android.net.Uri.parse("package:$packageName")
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        startActivity(intent)
                        Timber.i("🔐 Opened WRITE_SETTINGS permission screen")

                        Toast.makeText(
                            this,
                            "Please enable 'Modify system settings' and return to the app",
                            Toast.LENGTH_LONG
                        ).show()
                    } catch (e: Exception) {
                        Timber.e(e, "Failed to open WRITE_SETTINGS permission screen")
                        Toast.makeText(
                            this,
                            "Failed to open settings. Power schedules may not work properly.",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }
                .setNegativeButton("Skip") { dialog, _ ->
                    Timber.w("🔐 User skipped WRITE_SETTINGS permission")
                    Toast.makeText(
                        this,
                        "Power schedules will use limited functionality (HDMI-CEC only)",
                        Toast.LENGTH_LONG
                    ).show()
                    dialog.dismiss()
                }
                .setCancelable(false)
                .show()
        } catch (e: Exception) {
            Timber.e(e, "Failed to show permission dialog")
        }
    }

    /**
     * Handle power schedule update command
     */
    private fun handlePowerScheduleUpdate(intent: Intent) {
        try {
            val enabled = intent.getBooleanExtra("schedule_enabled", true)
            val onTime = intent.getStringExtra("schedule_on_time") ?: "09:00"
            val offTime = intent.getStringExtra("schedule_off_time") ?: "18:00"
            val energySaving = intent.getBooleanExtra("schedule_energy_saving", true)
            val warningMinutes = intent.getIntExtra("schedule_warning_minutes", 5)
            
            Timber.i("🔌 Updating power schedule: ON=$onTime, OFF=$offTime, enabled=$enabled")
            
            val newSchedule = PowerScheduleManager.PowerSchedule(
                enabled = enabled,
                onTime = onTime,
                offTime = offTime,
                timezone = "UTC",
                weekdaySchedule = PowerScheduleManager.WeekSchedule(),
                energySavingMode = energySaving,
                gracefulShutdown = true,
                preShutdownWarningMinutes = warningMinutes
            )
            
            powerScheduleManager?.updateSchedule(newSchedule)
            updateConnectionStatus("Power schedule updated: $onTime - $offTime")
            
        } catch (e: Exception) {
            Timber.e(e, "Failed to update power schedule")
        }
    }
    
    /**
     * Handle force power state command
     */
    private fun handleForcePowerState(intent: Intent) {
        try {
            val stateString = intent.getStringExtra("power_state") ?: "ON"
            val powerState = PowerScheduleManager.PowerState.valueOf(stateString)
            
            Timber.i("🔌 Forcing power state: $powerState")
            
            powerScheduleManager?.forcePowerState(powerState)
            
            val statusText = when (powerState) {
                PowerScheduleManager.PowerState.ON -> "Display forced ON"
                PowerScheduleManager.PowerState.OFF -> "Display forced OFF"
                else -> "Power state: $powerState"
            }
            updateConnectionStatus(statusText)
            
        } catch (e: Exception) {
            Timber.e(e, "Failed to force power state")
            updateConnectionStatus("Power control failed")
        }
    }
    
    /**
     * Handle get power status command
     */
    private fun handleGetPowerStatus() {
        try {
            val currentState = powerScheduleManager?.getCurrentPowerState() ?: PowerScheduleManager.PowerState.UNKNOWN
            val currentSchedule = powerScheduleManager?.getCurrentSchedule()
            
            Timber.i("📊 Current power state: $currentState")
            if (currentSchedule != null) {
                Timber.i("📊 Current schedule: ${currentSchedule.onTime} - ${currentSchedule.offTime} (enabled: ${currentSchedule.enabled})")
            }
            
            updateConnectionStatus("Power status: $currentState")
            
        } catch (e: Exception) {
            Timber.e(e, "Failed to get power status")
        }
    }
}

/**
 * Status types for visual indicators
 */
enum class StatusType {
    CONNECTING,
    ONLINE,
    PAIRED,
    ERROR,
    OFFLINE
}