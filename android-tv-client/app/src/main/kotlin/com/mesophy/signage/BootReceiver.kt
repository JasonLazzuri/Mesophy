package com.mesophy.signage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import timber.log.Timber

/**
 * Boot receiver to automatically start the Mesophy Digital Signage app
 * when the Android TV device boots up or restarts.
 * 
 * This is essential for digital signage deployments where devices need to
 * automatically display content without manual intervention.
 */
class BootReceiver : BroadcastReceiver() {
    
    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) {
            Timber.w("BootReceiver called with null context or intent")
            return
        }
        
        // Log device info for debugging
        Timber.i("📱 Device: ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
        Timber.i("📱 Android: ${android.os.Build.VERSION.RELEASE} (API ${android.os.Build.VERSION.SDK_INT})")
        
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
            Intent.ACTION_USER_PRESENT,
            Intent.ACTION_POWER_CONNECTED -> {
                Timber.i("🚀 TRIGGER RECEIVED (${intent.action}) - Auto-starting Mesophy Digital Signage")
                startMainActivity(context, intent.action ?: "unknown")
            }
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                Timber.i("📱 APP REPLACED - Auto-starting Mesophy Digital Signage")
                startMainActivity(context, "MY_PACKAGE_REPLACED")
            }
            Intent.ACTION_PACKAGE_REPLACED -> {
                // Only handle if it's our package
                if (intent.data?.schemeSpecificPart == context.packageName) {
                    Timber.i("🔄 PACKAGE UPDATED - Auto-starting Mesophy Digital Signage")
                    startMainActivity(context, "PACKAGE_REPLACED")
                } else {
                    Timber.d("Ignoring PACKAGE_REPLACED for other package: ${intent.data?.schemeSpecificPart}")
                }
            }
            else -> {
                Timber.w("⚠️ Unknown action received: ${intent.action}")
            }
        }
    }
    
    /**
     * Launch the main activity via foreground service
     *
     * On Android 10+, starting activities from background is restricted.
     * We use a foreground service to reliably start the app on boot.
     */
    private fun startMainActivity(context: Context, bootReason: String) {
        try {
            Timber.i("🚀 Starting BootStarterService (reason: $bootReason)")
            
            val serviceIntent = Intent(context, BootStarterService::class.java).apply {
                putExtra("boot_reason", bootReason)
                putExtra("boot_time", System.currentTimeMillis())
            }

            // Use startForegroundService on Android 8.0+
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
                Timber.i("✅ Foreground service started for auto-launch (API ${android.os.Build.VERSION.SDK_INT})")
            } else {
                context.startService(serviceIntent)
                Timber.i("✅ Service started for auto-launch (API ${android.os.Build.VERSION.SDK_INT})")
            }

        } catch (e: SecurityException) {
            Timber.e(e, "❌ Security exception - missing permissions for boot service")
        } catch (e: IllegalStateException) {
            Timber.e(e, "❌ Illegal state - cannot start foreground service from background")
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to start boot service: ${e.javaClass.simpleName}")
        }
    }
}