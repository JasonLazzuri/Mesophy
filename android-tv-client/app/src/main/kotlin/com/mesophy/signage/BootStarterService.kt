package com.mesophy.signage

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import timber.log.Timber

/**
 * Foreground service that launches the main app on boot.
 *
 * Required for Android 10+ to reliably start activities from background.
 * The service:
 * 1. Starts as a foreground service (shows notification)
 * 2. Launches MainActivity
 * 3. Stops itself after a short delay
 *
 * This is the standard Android pattern for boot-launched digital signage apps.
 */
class BootStarterService : Service() {

    companion object {
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "boot_channel"
        private const val CHANNEL_NAME = "Boot Notifications"
        private const val SERVICE_STOP_DELAY_MS = 3000L // Stop service after 3 seconds
    }

    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate() {
        super.onCreate()

        // Initialize Timber if not already initialized
        if (!Timber.forest().isNotEmpty()) {
            Timber.plant(Timber.DebugTree())
        }

        Timber.i("🚀 BootStarterService created")

        // Create notification channel for Android 8.0+
        createNotificationChannel()

        // Start as foreground service (required on Android 8.0+)
        val notification = createNotification()
        startForeground(NOTIFICATION_ID, notification)

        Timber.i("📢 Foreground service started with notification")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Timber.i("🎬 BootStarterService onStartCommand - launching MainActivity")

        try {
            // Launch MainActivity
            val launchIntent = Intent(this, MainActivity::class.java).apply {
                // Required flags for starting activity from service
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)

                // Add extra to indicate this is an auto-start
                putExtra("auto_start", true)
                putExtra("start_reason", "boot_service")
            }

            startActivity(launchIntent)
            Timber.i("✅ MainActivity launched successfully from service")

        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to launch MainActivity from service")
        }

        // Schedule service to stop itself after a short delay
        handler.postDelayed({
            Timber.i("⏹️ Stopping BootStarterService after delay")
            stopSelf()
        }, SERVICE_STOP_DELAY_MS)

        // If service is killed, don't restart it
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        // This service doesn't support binding
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        Timber.i("🗑️ BootStarterService destroyed")
        handler.removeCallbacksAndMessages(null)
    }

    /**
     * Create notification channel for Android 8.0+
     */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW // Low importance = minimal UI
            ).apply {
                description = "Notifications shown when app starts on boot"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)

            Timber.d("📺 Notification channel created: $CHANNEL_ID")
        }
    }

    /**
     * Create notification for foreground service
     */
    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Mesophy Digital Signage")
            .setContentText("Starting application...")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .build()
    }
}
