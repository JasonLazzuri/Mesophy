package com.mesophy.signage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import timber.log.Timber

/**
 * Test receiver for power management functionality
 * Allows external testing and configuration of power schedules
 */
class PowerTestReceiver : BroadcastReceiver() {
    
    companion object {
        const val ACTION_POWER_SCHEDULE_TEST = "com.mesophy.signage.POWER_SCHEDULE_TEST"
        const val ACTION_FORCE_POWER_ON = "com.mesophy.signage.FORCE_POWER_ON"  
        const val ACTION_FORCE_POWER_OFF = "com.mesophy.signage.FORCE_POWER_OFF"
        const val ACTION_GET_POWER_STATUS = "com.mesophy.signage.GET_POWER_STATUS"
    }
    
    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) return
        
        Timber.i("🔧 PowerTestReceiver: ${intent.action}")
        
        when (intent.action) {
            ACTION_POWER_SCHEDULE_TEST -> {
                val onTime = intent.getStringExtra("on_time") ?: "09:00"
                val offTime = intent.getStringExtra("off_time") ?: "18:00"
                val enabled = intent.getBooleanExtra("enabled", true)
                
                Timber.i("🔌 Testing power schedule: ON=$onTime, OFF=$offTime, enabled=$enabled")
                
                // Create test schedule
                val testSchedule = PowerScheduleManager.PowerSchedule(
                    enabled = enabled,
                    onTime = onTime,
                    offTime = offTime,
                    timezone = "UTC",
                    weekdaySchedule = PowerScheduleManager.WeekSchedule(),
                    energySavingMode = true,
                    gracefulShutdown = true,
                    preShutdownWarningMinutes = 2
                )
                
                // Find and update the power schedule manager
                // This would typically be done through a service or application reference
                broadcastPowerScheduleUpdate(context, testSchedule)
            }
            
            ACTION_FORCE_POWER_ON -> {
                Timber.i("🔆 Force power ON requested")
                broadcastForcePowerState(context, PowerScheduleManager.PowerState.ON)
            }
            
            ACTION_FORCE_POWER_OFF -> {
                Timber.i("🌙 Force power OFF requested") 
                broadcastForcePowerState(context, PowerScheduleManager.PowerState.OFF)
            }
            
            ACTION_GET_POWER_STATUS -> {
                Timber.i("📊 Power status requested")
                broadcastGetPowerStatus(context)
            }
        }
    }
    
    private fun broadcastPowerScheduleUpdate(context: Context, schedule: PowerScheduleManager.PowerSchedule) {
        val intent = Intent("com.mesophy.signage.INTERNAL_POWER_SCHEDULE_UPDATE")
        intent.putExtra("schedule_enabled", schedule.enabled)
        intent.putExtra("schedule_on_time", schedule.onTime)
        intent.putExtra("schedule_off_time", schedule.offTime)
        intent.putExtra("schedule_energy_saving", schedule.energySavingMode)
        intent.putExtra("schedule_warning_minutes", schedule.preShutdownWarningMinutes)
        context.sendBroadcast(intent)
        
        Timber.i("📡 Broadcasted power schedule update")
    }
    
    private fun broadcastForcePowerState(context: Context, state: PowerScheduleManager.PowerState) {
        val intent = Intent("com.mesophy.signage.INTERNAL_FORCE_POWER_STATE")
        intent.putExtra("power_state", state.name)
        context.sendBroadcast(intent)
        
        Timber.i("📡 Broadcasted force power state: $state")
    }
    
    private fun broadcastGetPowerStatus(context: Context) {
        val intent = Intent("com.mesophy.signage.INTERNAL_GET_POWER_STATUS")
        context.sendBroadcast(intent)
        
        Timber.i("📡 Broadcasted power status request")
    }
}