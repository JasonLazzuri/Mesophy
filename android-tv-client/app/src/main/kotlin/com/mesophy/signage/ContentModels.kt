package com.mesophy.signage

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * Data models for content synchronization and management
 */

@JsonClass(generateAdapter = true)
data class SyncResponse(
    @Json(name = "device_id") val deviceId: String,
    @Json(name = "screen_id") val screenId: String,
    @Json(name = "screen_name") val screenName: String,
    @Json(name = "screen_type") val screenType: String,
    val location: Location,
    @Json(name = "sync_timestamp") val syncTimestamp: String,
    @Json(name = "schedule_changed") val scheduleChanged: Boolean,
    @Json(name = "media_changed") val mediaChanged: Boolean,
    @Json(name = "current_schedule") val currentSchedule: Schedule?,
    @Json(name = "all_schedules") val allSchedules: List<Schedule>,
    @Json(name = "next_sync_recommended") val nextSyncRecommended: Int // seconds
)

@JsonClass(generateAdapter = true)
data class Schedule(
    val id: String,
    val name: String,
    @Json(name = "start_date") val startDate: String?,
    @Json(name = "end_date") val endDate: String?,
    @Json(name = "start_time") val startTime: String,
    @Json(name = "end_time") val endTime: String,
    @Json(name = "days_of_week") val daysOfWeek: List<Int>,
    val priority: Int,
    val playlist: Playlist?
)

@JsonClass(generateAdapter = true)
data class Playlist(
    val id: String,
    val name: String,
    val items: List<PlaylistItem>
)

@JsonClass(generateAdapter = true)
data class PlaylistItem(
    val id: String,
    @Json(name = "display_order") val displayOrder: Int,
    @Json(name = "display_duration") val displayDuration: Int,
    val media: MediaAsset?
)

@JsonClass(generateAdapter = true)
data class MediaAsset(
    val id: String,
    val name: String,
    val url: String,
    @Json(name = "thumbnail_url") val thumbnailUrl: String?,
    @Json(name = "mime_type") val mimeType: String,
    @Json(name = "file_size") val fileSize: Long?,
    val duration: Int?,
    val width: Int?,
    val height: Int?
)

@JsonClass(generateAdapter = true)
data class CurrentContentResponse(
    @Json(name = "schedule_id") val scheduleId: String?,
    @Json(name = "schedule_name") val scheduleName: String?,
    @Json(name = "screen_id") val screenId: String,
    @Json(name = "screen_name") val screenName: String,
    val playlist: Playlist?,
    @Json(name = "media_assets") val mediaAssets: List<MediaAsset>,
    @Json(name = "current_time") val currentTime: String,
    @Json(name = "current_day") val currentDay: String,
    @Json(name = "schedule_time_range") val scheduleTimeRange: String?
)

/**
 * Local cache entry for downloaded media
 */
data class CacheEntry(
    val mediaId: String,
    val fileName: String,
    val localPath: String,
    val url: String,
    val mimeType: String,
    val fileSize: Long,
    val downloadedAt: Long,
    val lastAccessed: Long,
    val checksum: String? = null
)

/**
 * Download progress tracking
 */
data class DownloadProgress(
    val mediaId: String,
    val fileName: String,
    val bytesDownloaded: Long,
    val totalBytes: Long,
    val status: DownloadStatus
)

enum class DownloadStatus {
    QUEUED,
    DOWNLOADING,
    COMPLETED,
    FAILED,
    CANCELLED
}

/**
 * Content sync status
 */
data class ContentSyncStatus(
    val isConnected: Boolean,
    val lastSyncTime: Long,
    val schedulesCount: Int,
    val mediaItemsCount: Int,
    val downloadQueue: List<DownloadProgress>,
    val currentSchedule: Schedule?,
    val error: String? = null
)