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
     * Launch the main activity with appropriate flags for auto-start
     */
    private fun startMainActivity(context: Context) {
        try {
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                // Required flags for starting activity from broadcast receiver
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                       Intent.FLAG_ACTIVITY_CLEAR_TOP or
                       Intent.FLAG_ACTIVITY_SINGLE_TOP
                
                // Add extra to indicate this is an auto-start
                putExtra("auto_start", true)
                putExtra("start_reason", "boot_completed")
            }
            
            context.startActivity(launchIntent)
            Timber.i("✅ Auto-start launched successfully")
            
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to auto-start main activity")
        }
    }
}