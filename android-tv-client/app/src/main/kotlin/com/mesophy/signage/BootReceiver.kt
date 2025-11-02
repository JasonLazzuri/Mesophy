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
        
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED -> {
                Timber.i("🚀 BOOT COMPLETED - Auto-starting Mesophy Digital Signage")
                startMainActivity(context)
            }
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                Timber.i("📱 APP REPLACED - Auto-starting Mesophy Digital Signage")
                startMainActivity(context)
            }
            Intent.ACTION_PACKAGE_REPLACED -> {
                // Only handle if it's our package
                if (intent.data?.schemeSpecificPart == context.packageName) {
                    Timber.i("🔄 PACKAGE UPDATED - Auto-starting Mesophy Digital Signage")
                    startMainActivity(context)
                }
            }
        }
    }
    
    /**
     * Launch the main activity via foreground service
     *
     * On Android 10+, starting activities from background is restricted.
     * We use a foreground service to reliably start the app on boot.
     */
    private fun startMainActivity(context: Context) {
        try {
            val serviceIntent = Intent(context, BootStarterService::class.java)

            // Use startForegroundService on Android 8.0+
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
                Timber.i("✅ Foreground service started for auto-launch")
            } else {
                context.startService(serviceIntent)
                Timber.i("✅ Service started for auto-launch")
            }

        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to start boot service")
        }
    }
}