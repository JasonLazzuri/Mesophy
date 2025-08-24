package com.mesophy.signage

import android.os.Bundle
import android.widget.TextView
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
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        // Initialize Timber logging for debug
        if (!Timber.forest().isNotEmpty()) {
            Timber.plant(Timber.DebugTree())
        }
        
        Timber.i("🚀 Mesophy Digital Signage - MainActivity created")
        Timber.d("Running on Android ${android.os.Build.VERSION.RELEASE}")
        Timber.d("Device: ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
        
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
        
        // Initialize status indicators
        updateConnectionStatus("Initializing...")
        updateStatusIndicator(StatusType.CONNECTING)
        
        // Check if device is already paired
        checkPairingStatusAndProceed()
    }
    
    override fun onResume() {
        super.onResume()
        Timber.d("MainActivity resumed - ready for digital signage functionality")
    }
    
    override fun onDestroy() {
        super.onDestroy()
        isPolling = false
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
                
                Timber.i("✅ Received pairing code: ${response.pairingCode}")
                Timber.d("Dashboard URL: ${response.dashboardUrl}")
                
                // Start polling for pairing completion
                startPairingPolling()
                
            } catch (e: Exception) {
                Timber.e(e, "❌ Failed to request pairing code")
                statusText.text = "Connection failed - retrying..."
                pairingCodeText.text = "ERROR"
                updateConnectionStatus("Connection failed")
                updateStatusIndicator(StatusType.ERROR)
                
                // Retry after delay
                delay(5000)
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
     * Initialize and start ContentSyncManager
     */
    private fun startContentSyncManager() {
        try {
            // Create MediaDownloadManager
            val mediaDownloadManager = MediaDownloadManager(this)
            
            // Create ContentSyncManager 
            val contentSyncManager = ContentSyncManager(this, mediaDownloadManager)
            
            // Add content sync listener
            contentSyncManager.addListener(object : ContentSyncManager.ContentSyncListener {
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
                    }
                }
            })
            
            // Add download progress listener
            mediaDownloadManager.addListener(object : MediaDownloadManager.DownloadListener {
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
            })
            
            // Start content synchronization
            contentSyncManager.start()
            
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
            statusText.text = "Content ready"
            pairingCodeText.text = "READY"
            updateConnectionStatus("Playing ${content.scheduleName ?: "content"}")
            updateStatusIndicator(StatusType.PAIRED)
            
            // TODO: Transition to media playback
            // This would typically start the MediaPlayerFragment or DigitalSignageService
            Timber.i("🎬 Ready to start media playback!")
            
        } else {
            statusText.text = "No media to display"
            pairingCodeText.text = "EMPTY"
            updateConnectionStatus("Waiting for media...")
            updateStatusIndicator(StatusType.ERROR)
        }
    }
    
    /**
     * Handle content sync errors
     */
    private fun handleContentSyncError(error: String) {
        Timber.e("❌ Content sync error: $error")
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
     * Clean pairing code to ensure only alphanumeric characters
     * Removes any problematic characters like /, +, =
     */
    private fun cleanPairingCode(code: String): String {
        // Remove any non-alphanumeric characters and ensure 6 characters
        var cleanCode = code.replace(Regex("[^A-Za-z0-9]"), "").uppercase()
        
        // Replace confusing characters with safe alternatives
        cleanCode = cleanCode
            .replace("0", "2")  // Zero -> 2
            .replace("O", "3")  // O -> 3  
            .replace("1", "4")  // 1 -> 4
            .replace("I", "5")  // I -> 5
            .replace("L", "6")  // L -> 6
        
        // Ensure exactly 6 characters
        return when {
            cleanCode.length >= 6 -> cleanCode.substring(0, 6)
            cleanCode.length < 6 -> {
                // Pad with random alphanumeric chars if too short
                val padding = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
                cleanCode + (1..6-cleanCode.length).map { 
                    padding.random() 
                }.joinToString("")
            }
            else -> cleanCode
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