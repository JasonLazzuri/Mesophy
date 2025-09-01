package com.mesophy.signage

import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import timber.log.Timber
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.*

/**
 * Power Schedule Manager for Android TV digital signage client
 * 
 * Manages display power scheduling based on business hours and energy efficiency policies
 */
class PowerScheduleManager(
    private val context: Context
) {
    
    companion object {
        private const val TAG = "PowerScheduleManager"
        private const val SCHEDULE_CHECK_INTERVAL_MS = 60000L // 1 minute
        private const val PREFS_NAME = "mesophy_power_config"
        private const val DEFAULT_ON_TIME = "06:00"
        private const val DEFAULT_OFF_TIME = "22:00"
    }
    
    @Serializable
    data class PowerSchedule(
        val enabled: Boolean = true,
        val onTime: String = DEFAULT_ON_TIME,
        val offTime: String = DEFAULT_OFF_TIME,
        val timezone: String = "UTC",
        val weekdaySchedule: WeekSchedule = WeekSchedule(),
        val energySavingMode: Boolean = true,
        val gracefulShutdown: Boolean = true,
        val preShutdownWarningMinutes: Int = 5
    )
    
    @Serializable
    data class WeekSchedule(
        val monday: Boolean = true,
        val tuesday: Boolean = true,
        val wednesday: Boolean = true,
        val thursday: Boolean = true,
        val friday: Boolean = true,
        val saturday: Boolean = true,
        val sunday: Boolean = false
    )
    
    enum class PowerState {
        ON, OFF, TRANSITIONING, UNKNOWN
    }
    
    interface PowerScheduleListener {
        fun onPowerStateChanged(state: PowerState, scheduledChange: Boolean)
        fun onScheduleUpdated(schedule: PowerSchedule)
        fun onPreShutdownWarning(minutesRemaining: Int)
        fun onPowerError(error: String)
    }
    
    private val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    private val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    
    private var scheduleJob: Job? = null
    private var isRunning = false
    private var listeners = mutableListOf<PowerScheduleListener>()
    private var currentSchedule = loadScheduleFromPrefs()
    private var lastPowerState = PowerState.UNKNOWN
    private var preShutdownWarningShown = false
    
    // Broadcast receiver for system power events
    private val powerReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                Intent.ACTION_SCREEN_ON -> {
                    Timber.i("🔌 Screen turned ON (system event)")
                    handlePowerStateChange(PowerState.ON, false)
                }
                Intent.ACTION_SCREEN_OFF -> {
                    Timber.i("🔌 Screen turned OFF (system event)")
                    handlePowerStateChange(PowerState.OFF, false)
                }
                PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED -> {
                    val isIdle = powerManager.isDeviceIdleMode
                    Timber.d("🔋 Device idle mode changed: $isIdle")
                }
            }
        }
    }
    
    /**
     * Start power schedule monitoring
     */
    fun start() {
        if (isRunning) {
            Timber.w("PowerScheduleManager already running")
            return
        }
        
        isRunning = true
        Timber.i("🔌 Starting Power Schedule Manager...")
        
        // Register power event receivers
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED)
        }
        context.registerReceiver(powerReceiver, filter)
        
        // Start schedule monitoring loop
        scheduleJob = CoroutineScope(Dispatchers.IO).launch {
            while (isRunning) {
                try {
                    checkPowerSchedule()
                    delay(SCHEDULE_CHECK_INTERVAL_MS)
                } catch (e: Exception) {
                    Timber.e(e, "❌ Error in power schedule loop")
                    notifyPowerError("Schedule check error: ${e.message}")
                    delay(SCHEDULE_CHECK_INTERVAL_MS)
                }
            }
        }
        
        // Initial state check
        val currentState = getCurrentPowerState()
        handlePowerStateChange(currentState, false)
    }
    
    /**
     * Stop power schedule monitoring
     */
    fun stop() {
        isRunning = false
        scheduleJob?.cancel()
        
        try {
            context.unregisterReceiver(powerReceiver)
        } catch (e: Exception) {
            Timber.w("Failed to unregister power receiver: ${e.message}")
        }
        
        Timber.i("⏹️ Power Schedule Manager stopped")
    }
    
    /**
     * Add power schedule listener
     */
    fun addListener(listener: PowerScheduleListener) {
        listeners.add(listener)
    }
    
    /**
     * Remove power schedule listener
     */
    fun removeListener(listener: PowerScheduleListener) {
        listeners.remove(listener)
    }
    
    /**
     * Update power schedule configuration
     */
    fun updateSchedule(schedule: PowerSchedule) {
        this.currentSchedule = schedule
        saveScheduleToPrefs(schedule)
        preShutdownWarningShown = false
        notifyScheduleUpdated(schedule)
        
        Timber.i("🔌 Power schedule updated: ${schedule.onTime} - ${schedule.offTime}")
        
        // Immediately check if schedule change requires power state change
        CoroutineScope(Dispatchers.IO).launch {
            checkPowerSchedule()
        }
    }
    
    /**
     * Get current power schedule
     */
    fun getCurrentSchedule(): PowerSchedule = currentSchedule
    
    /**
     * Get current power state
     */
    fun getCurrentPowerState(): PowerState {
        return try {
            val isScreenOn = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH) {
                powerManager.isInteractive
            } else {
                @Suppress("DEPRECATION")
                powerManager.isScreenOn
            }
            
            if (isScreenOn) PowerState.ON else PowerState.OFF
        } catch (e: Exception) {
            Timber.w("Failed to get power state: ${e.message}")
            PowerState.UNKNOWN
        }
    }
    
    /**
     * Force display on/off (if permissions allow)
     */
    fun forcePowerState(state: PowerState) {
        try {
            when (state) {
                PowerState.ON -> {
                    turnDisplayOn()
                }
                PowerState.OFF -> {
                    turnDisplayOff()
                }
                else -> {
                    Timber.w("Cannot force power state: $state")
                    return
                }
            }
            
            handlePowerStateChange(state, true)
            Timber.i("🔌 Forced power state: $state")
            
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to force power state: $state")
            notifyPowerError("Failed to change power state: ${e.message}")
        }
    }
    
    /**
     * Check if display should be on or off based on current schedule
     */
    private suspend fun checkPowerSchedule() {
        if (!currentSchedule.enabled) {
            return
        }
        
        val calendar = Calendar.getInstance()
        val currentDay = calendar.get(Calendar.DAY_OF_WEEK)
        val currentTime = LocalTime.now()
        
        // Check if current day is enabled in schedule
        val isDayEnabled = when (currentDay) {
            Calendar.MONDAY -> currentSchedule.weekdaySchedule.monday
            Calendar.TUESDAY -> currentSchedule.weekdaySchedule.tuesday
            Calendar.WEDNESDAY -> currentSchedule.weekdaySchedule.wednesday
            Calendar.THURSDAY -> currentSchedule.weekdaySchedule.thursday
            Calendar.FRIDAY -> currentSchedule.weekdaySchedule.friday
            Calendar.SATURDAY -> currentSchedule.weekdaySchedule.saturday
            Calendar.SUNDAY -> currentSchedule.weekdaySchedule.sunday
            else -> true
        }
        
        if (!isDayEnabled) {
            Timber.d("🔌 Current day not enabled in schedule")
            return
        }
        
        val onTime = LocalTime.parse(currentSchedule.onTime, DateTimeFormatter.ofPattern("HH:mm"))
        val offTime = LocalTime.parse(currentSchedule.offTime, DateTimeFormatter.ofPattern("HH:mm"))
        
        val shouldBeOn = if (offTime.isAfter(onTime)) {
            // Normal schedule (e.g., 6:00 AM to 10:00 PM)
            currentTime.isAfter(onTime) && currentTime.isBefore(offTime)
        } else {
            // Overnight schedule (e.g., 6:00 PM to 6:00 AM)
            currentTime.isAfter(onTime) || currentTime.isBefore(offTime)
        }
        
        val currentPowerState = getCurrentPowerState()
        val shouldChangeState = (shouldBeOn && currentPowerState == PowerState.OFF) ||
                              (!shouldBeOn && currentPowerState == PowerState.ON)
        
        // Pre-shutdown warning
        if (!shouldBeOn && currentPowerState == PowerState.ON && !preShutdownWarningShown) {
            val minutesToShutdown = getMinutesToShutdown(currentTime, offTime)
            if (minutesToShutdown <= currentSchedule.preShutdownWarningMinutes && minutesToShutdown > 0) {
                preShutdownWarningShown = true
                notifyPreShutdownWarning(minutesToShutdown)
                Timber.i("⚠️ Pre-shutdown warning: $minutesToShutdown minutes remaining")
            }
        }
        
        if (shouldChangeState) {
            val newState = if (shouldBeOn) PowerState.ON else PowerState.OFF
            Timber.i("🔌 Schedule change required: $newState (time: ${currentTime.format(DateTimeFormatter.ofPattern("HH:mm"))})")
            
            if (currentSchedule.gracefulShutdown && newState == PowerState.OFF) {
                // Give a brief delay for graceful shutdown
                delay(2000)
            }
            
            forcePowerState(newState)
        }
    }
    
    /**
     * Turn display on
     */
    private fun turnDisplayOn() {
        try {
            // Different approaches based on Android version and available permissions
            when {
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.P -> {
                    // Modern approach using Settings
                    try {
                        Settings.System.putInt(context.contentResolver, Settings.System.SCREEN_BRIGHTNESS, 255)
                        Timber.d("🔌 Display brightness set to maximum")
                    } catch (e: Exception) {
                        Timber.w("Failed to set brightness: ${e.message}")
                    }
                }
                else -> {
                    // Legacy approach
                    @Suppress("DEPRECATION")
                    Settings.System.putInt(context.contentResolver, Settings.System.SCREEN_BRIGHTNESS, 255)
                }
            }
            
            // Wake up the device using PowerManager WakeLock
            val wakeLock = powerManager.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "$TAG:PowerScheduleWakeLock"
            )
            wakeLock.acquire(5000) // Hold for 5 seconds
            wakeLock.release()
            
            Timber.d("🔌 Display wake sequence completed")
            
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to turn display on")
            throw e
        }
    }
    
    /**
     * Turn display off
     */
    private fun turnDisplayOff() {
        try {
            // Note: On most Android TV devices, apps cannot directly turn off the display
            // This would typically require system-level permissions or device admin
            
            if (currentSchedule.energySavingMode) {
                // Lower brightness as much as possible
                try {
                    Settings.System.putInt(context.contentResolver, Settings.System.SCREEN_BRIGHTNESS, 1)
                    Timber.d("🔋 Display brightness minimized for energy saving")
                } catch (e: Exception) {
                    Timber.w("Failed to minimize brightness: ${e.message}")
                }
            }
            
            // On Android TV, we may need to request the device to go into standby
            // This is a placeholder for device-specific implementations
            Timber.d("🔌 Display shutdown sequence completed (brightness minimized)")
            
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to turn display off")
            throw e
        }
    }
    
    /**
     * Calculate minutes until shutdown time
     */
    private fun getMinutesToShutdown(currentTime: LocalTime, offTime: LocalTime): Int {
        return try {
            val minutesUntil = if (offTime.isAfter(currentTime)) {
                offTime.toSecondOfDay() - currentTime.toSecondOfDay()
            } else {
                // Next day
                (24 * 3600) - currentTime.toSecondOfDay() + offTime.toSecondOfDay()
            }
            minutesUntil / 60
        } catch (e: Exception) {
            0
        }
    }
    
    /**
     * Handle power state changes
     */
    private fun handlePowerStateChange(newState: PowerState, scheduledChange: Boolean) {
        if (newState != lastPowerState) {
            lastPowerState = newState
            notifyPowerStateChanged(newState, scheduledChange)
            
            val changeType = if (scheduledChange) "scheduled" else "manual/system"
            Timber.i("🔌 Power state changed to $newState ($changeType)")
        }
    }
    
    /**
     * Load schedule from SharedPreferences
     */
    private fun loadScheduleFromPrefs(): PowerSchedule {
        return try {
            PowerSchedule(
                enabled = sharedPrefs.getBoolean("enabled", true),
                onTime = sharedPrefs.getString("on_time", DEFAULT_ON_TIME) ?: DEFAULT_ON_TIME,
                offTime = sharedPrefs.getString("off_time", DEFAULT_OFF_TIME) ?: DEFAULT_OFF_TIME,
                timezone = sharedPrefs.getString("timezone", "UTC") ?: "UTC",
                weekdaySchedule = WeekSchedule(
                    monday = sharedPrefs.getBoolean("monday", true),
                    tuesday = sharedPrefs.getBoolean("tuesday", true),
                    wednesday = sharedPrefs.getBoolean("wednesday", true),
                    thursday = sharedPrefs.getBoolean("thursday", true),
                    friday = sharedPrefs.getBoolean("friday", true),
                    saturday = sharedPrefs.getBoolean("saturday", true),
                    sunday = sharedPrefs.getBoolean("sunday", false)
                ),
                energySavingMode = sharedPrefs.getBoolean("energy_saving", true),
                gracefulShutdown = sharedPrefs.getBoolean("graceful_shutdown", true),
                preShutdownWarningMinutes = sharedPrefs.getInt("warning_minutes", 5)
            )
        } catch (e: Exception) {
            Timber.w("Failed to load schedule from prefs: ${e.message}")
            PowerSchedule() // Return default schedule
        }
    }
    
    /**
     * Save schedule to SharedPreferences
     */
    private fun saveScheduleToPrefs(schedule: PowerSchedule) {
        try {
            with(sharedPrefs.edit()) {
                putBoolean("enabled", schedule.enabled)
                putString("on_time", schedule.onTime)
                putString("off_time", schedule.offTime)
                putString("timezone", schedule.timezone)
                putBoolean("monday", schedule.weekdaySchedule.monday)
                putBoolean("tuesday", schedule.weekdaySchedule.tuesday)
                putBoolean("wednesday", schedule.weekdaySchedule.wednesday)
                putBoolean("thursday", schedule.weekdaySchedule.thursday)
                putBoolean("friday", schedule.weekdaySchedule.friday)
                putBoolean("saturday", schedule.weekdaySchedule.saturday)
                putBoolean("sunday", schedule.weekdaySchedule.sunday)
                putBoolean("energy_saving", schedule.energySavingMode)
                putBoolean("graceful_shutdown", schedule.gracefulShutdown)
                putInt("warning_minutes", schedule.preShutdownWarningMinutes)
                apply()
            }
            Timber.d("✅ Power schedule saved to preferences")
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to save schedule to prefs")
        }
    }
    
    /**
     * Check if app has required permissions for power management
     */
    fun hasRequiredPermissions(): Boolean {
        return try {
            // Check if we can write to system settings
            Settings.System.canWrite(context)
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * Request required permissions for power management
     */
    fun requestPermissions() {
        try {
            if (!hasRequiredPermissions()) {
                val intent = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS).apply {
                    data = android.net.Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            }
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to request power management permissions")
            notifyPowerError("Failed to request permissions: ${e.message}")
        }
    }
    
    // Listener notification methods
    private fun notifyPowerStateChanged(state: PowerState, scheduledChange: Boolean) {
        listeners.forEach { listener ->
            try {
                listener.onPowerStateChanged(state, scheduledChange)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying power state listener")
            }
        }
    }
    
    private fun notifyScheduleUpdated(schedule: PowerSchedule) {
        listeners.forEach { listener ->
            try {
                listener.onScheduleUpdated(schedule)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying schedule update listener")
            }
        }
    }
    
    private fun notifyPreShutdownWarning(minutesRemaining: Int) {
        listeners.forEach { listener ->
            try {
                listener.onPreShutdownWarning(minutesRemaining)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying pre-shutdown warning listener")
            }
        }
    }
    
    private fun notifyPowerError(error: String) {
        listeners.forEach { listener ->
            try {
                listener.onPowerError(error)
            } catch (e: Exception) {
                Timber.e(e, "Error notifying power error listener")
            }
        }
    }
}