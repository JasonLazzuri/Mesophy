package com.mesophy.signage

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import timber.log.Timber
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

/**
 * API Client for Mesophy Digital Signage Backend
 */
class ApiClient(private val baseUrl: String = "https://mesophy.vercel.app") {
    
    private val moshi = Moshi.Builder()
        .addLast(KotlinJsonAdapterFactory())
        .build()
        
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(HttpLoggingInterceptor { message ->
            Timber.d("HTTP: $message")
        }.apply {
            level = HttpLoggingInterceptor.Level.BODY
        })
        .build()

    /**
     * Request a new pairing code from the backend
     */
    suspend fun generatePairingCode(deviceInfo: Map<String, Any>): PairingCodeResponse {
        val requestBody = mapOf(
            "device_info" to deviceInfo,
            "device_ip" to null
        )
        
        val json = moshi.adapter(Map::class.java).toJson(requestBody)
        val body = json.toRequestBody("application/json".toMediaTypeOrNull())
        
        val request = Request.Builder()
            .url("$baseUrl/api/devices/generate-code")
            .post(body)
            .build()
            
        return suspendCoroutine { continuation ->
            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    continuation.resumeWithException(e)
                }
                
                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        if (!response.isSuccessful) {
                            continuation.resumeWithException(
                                IOException("HTTP ${response.code}: ${response.message}")
                            )
                            return
                        }
                        
                        val responseBody = response.body?.string()
                        if (responseBody == null) {
                            continuation.resumeWithException(IOException("Empty response"))
                            return
                        }
                        
                        try {
                            val adapter = moshi.adapter(PairingCodeResponse::class.java)
                            val result = adapter.fromJson(responseBody)
                            if (result != null) {
                                continuation.resume(result)
                            } else {
                                continuation.resumeWithException(IOException("Failed to parse response"))
                            }
                        } catch (e: Exception) {
                            continuation.resumeWithException(e)
                        }
                    }
                }
            })
        }
    }
    
    /**
     * Check pairing status for a given code
     */
    suspend fun checkPairingStatus(code: String): PairingStatusResponse {
        val request = Request.Builder()
            .url("$baseUrl/api/devices/check-pairing/$code")
            .get()
            .build()
            
        return suspendCoroutine { continuation ->
            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    continuation.resumeWithException(e)
                }
                
                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        val responseBody = response.body?.string()
                        if (responseBody == null) {
                            continuation.resumeWithException(IOException("Empty response"))
                            return
                        }
                        
                        try {
                            val adapter = moshi.adapter(PairingStatusResponse::class.java)
                            val result = adapter.fromJson(responseBody)
                            if (result != null) {
                                continuation.resume(result)
                            } else {
                                continuation.resumeWithException(IOException("Failed to parse response"))
                            }
                        } catch (e: Exception) {
                            continuation.resumeWithException(e)
                        }
                    }
                }
            })
        }
    }
    
    /**
     * Sync device content with backend
     */
    suspend fun syncDeviceContent(deviceToken: String): SyncResponse {
        val request = Request.Builder()
            .url("$baseUrl/api/devices/sync")
            .header("Authorization", "Bearer $deviceToken")
            .get()
            .build()
            
        return suspendCoroutine { continuation ->
            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    continuation.resumeWithException(e)
                }
                
                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        if (!response.isSuccessful) {
                            continuation.resumeWithException(
                                IOException("HTTP ${response.code}: ${response.message}")
                            )
                            return
                        }
                        
                        val responseBody = response.body?.string()
                        if (responseBody == null) {
                            continuation.resumeWithException(IOException("Empty response"))
                            return
                        }
                        
                        try {
                            val adapter = moshi.adapter(SyncResponse::class.java)
                            val result = adapter.fromJson(responseBody)
                            if (result != null) {
                                continuation.resume(result)
                            } else {
                                continuation.resumeWithException(IOException("Failed to parse sync response"))
                            }
                        } catch (e: Exception) {
                            continuation.resumeWithException(e)
                        }
                    }
                }
            })
        }
    }
    
    /**
     * Get current content to display
     */
    suspend fun getCurrentContent(deviceToken: String, screenId: String): CurrentContentResponse {
        val request = Request.Builder()
            .url("$baseUrl/api/screens/$screenId/current-content")
            .header("Authorization", "Bearer $deviceToken")
            .get()
            .build()
            
        return suspendCoroutine { continuation ->
            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    continuation.resumeWithException(e)
                }
                
                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        if (!response.isSuccessful) {
                            continuation.resumeWithException(
                                IOException("HTTP ${response.code}: ${response.message}")
                            )
                            return
                        }
                        
                        val responseBody = response.body?.string()
                        if (responseBody == null) {
                            continuation.resumeWithException(IOException("Empty response"))
                            return
                        }
                        
                        try {
                            val adapter = moshi.adapter(CurrentContentResponse::class.java)
                            val result = adapter.fromJson(responseBody)
                            if (result != null) {
                                continuation.resume(result)
                            } else {
                                continuation.resumeWithException(IOException("Failed to parse content response"))
                            }
                        } catch (e: Exception) {
                            continuation.resumeWithException(e)
                        }
                    }
                }
            })
        }
    }
    
    /**
     * Report device health metrics to backend
     */
    suspend fun reportDeviceHealth(
        deviceToken: String, 
        screenId: String?, 
        healthMetrics: Any // Using Any since DeviceHealthMonitor.DeviceHealthMetrics may not be directly accessible
    ): HealthReportResponse {
        val json = moshi.adapter(Any::class.java).toJson(healthMetrics)
        val body = json.toRequestBody("application/json".toMediaTypeOrNull())
        
        val requestBuilder = Request.Builder()
            .url("$baseUrl/api/devices/health")
            .post(body)
            .header("Authorization", "Bearer $deviceToken")
            
        if (screenId != null) {
            requestBuilder.header("X-Screen-ID", screenId)
        }
        
        val request = requestBuilder.build()
            
        return suspendCoroutine { continuation ->
            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    Timber.e(e, "Failed to report health metrics")
                    continuation.resumeWithException(e)
                }
                
                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        if (!response.isSuccessful) {
                            Timber.e("Health report failed: HTTP ${response.code}")
                            continuation.resumeWithException(
                                IOException("HTTP ${response.code}: ${response.message}")
                            )
                            return
                        }
                        
                        val responseBody = response.body?.string()
                        if (responseBody == null) {
                            continuation.resumeWithException(IOException("Empty health response"))
                            return
                        }
                        
                        try {
                            val adapter = moshi.adapter(HealthReportResponse::class.java)
                            val result = adapter.fromJson(responseBody)
                            if (result != null) {
                                Timber.i("Health metrics reported successfully: ${result.message}")
                                continuation.resume(result)
                            } else {
                                continuation.resumeWithException(IOException("Failed to parse health response"))
                            }
                        } catch (e: Exception) {
                            continuation.resumeWithException(e)
                        }
                    }
                }
            })
        }
    }

    /**
     * Send alert to backend for device performance issues or failures
     */
    suspend fun sendAlert(deviceToken: String, alertData: Map<String, Any>): AlertResponse {
        val json = moshi.adapter(Map::class.java).toJson(alertData)
        val body = json.toRequestBody("application/json".toMediaTypeOrNull())
        
        val request = Request.Builder()
            .url("$baseUrl/api/devices/alerts")
            .post(body)
            .addHeader("Authorization", "Bearer $deviceToken")
            .addHeader("Content-Type", "application/json")
            .build()
        
        return suspendCoroutine { continuation ->
            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    Timber.e(e, "Failed to send alert")
                    continuation.resumeWithException(e)
                }
                
                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        if (!response.isSuccessful) {
                            val error = IOException("Alert failed: ${response.code}")
                            Timber.e(error, "Alert request failed: ${response.body?.string()}")
                            continuation.resumeWithException(error)
                            return
                        }
                        
                        try {
                            val responseBody = response.body?.string()
                            val adapter = moshi.adapter(AlertResponse::class.java)
                            val alertResponse = adapter.fromJson(responseBody!!)
                            Timber.i("Alert sent successfully: ${alertData["alert_type"]}")
                            continuation.resume(alertResponse!!)
                        } catch (e: Exception) {
                            Timber.e(e, "Failed to parse alert response")
                            continuation.resumeWithException(e)
                        }
                    }
                }
            })
        }
    }
}

// Data classes for API responses
@JsonClass(generateAdapter = true)
data class PairingCodeResponse(
    val success: Boolean,
    @Json(name = "pairing_code") val pairingCode: String,
    @Json(name = "expires_at") val expiresAt: String,
    @Json(name = "expires_in_minutes") val expiresInMinutes: Int,
    val instructions: Instructions,
    @Json(name = "check_pairing_url") val checkPairingUrl: String,
    @Json(name = "dashboard_url") val dashboardUrl: String
)

@JsonClass(generateAdapter = true)
data class Instructions(
    val step1: String,
    val step2: String,
    val step3: String,
    val step4: String
)

@JsonClass(generateAdapter = true)
data class PairingStatusResponse(
    val paired: Boolean,
    val status: String,
    val message: String,
    @Json(name = "device_config") val deviceConfig: DeviceConfig? = null,
    @Json(name = "expires_at") val expiresAt: String? = null,
    @Json(name = "time_remaining") val timeRemaining: Int? = null
)

@JsonClass(generateAdapter = true)
data class DeviceConfig(
    @Json(name = "device_token") val deviceToken: String,
    @Json(name = "screen_id") val screenId: String,
    @Json(name = "screen_name") val screenName: String,
    @Json(name = "screen_type") val screenType: String,
    val resolution: String,
    val orientation: String,
    val location: Location,
    @Json(name = "api_base") val apiBase: String,
    @Json(name = "sync_interval") val syncInterval: Int,
    @Json(name = "heartbeat_interval") val heartbeatInterval: Int,
    @Json(name = "api_endpoints") val apiEndpoints: ApiEndpoints
)

@JsonClass(generateAdapter = true)
data class Location(
    val id: String,
    val name: String,
    val timezone: String
)

@JsonClass(generateAdapter = true)
data class ApiEndpoints(
    val sync: String,
    val heartbeat: String,
    val logs: String
)

@JsonClass(generateAdapter = true)
data class HealthReportResponse(
    val success: Boolean,
    val message: String,
    @Json(name = "device_name") val deviceName: String? = null,
    @Json(name = "health_level") val healthLevel: String? = null,
    val alerts: List<HealthAlert>? = null,
    val timestamp: String? = null
)

@JsonClass(generateAdapter = true)
data class HealthAlert(
    val type: String,
    val message: String,
    val details: String? = null
)

@JsonClass(generateAdapter = true)
data class AlertResponse(
    val success: Boolean,
    val message: String,
    @Json(name = "alert_id") val alertId: String? = null,
    @Json(name = "alerts_triggered") val alertsTriggered: Int? = null,
    val timestamp: String? = null
)