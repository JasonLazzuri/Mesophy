package com.mesophy.signage

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import kotlinx.serialization.Serializable

/**
 * Data models for content synchronization and management
 */

@Serializable
@JsonClass(generateAdapter = true)
data class SyncResponse(
    @Json(name = "device_id") val deviceId: String?, // Nullable - may not be set in some screens
    @Json(name = "screen_id") val screenId: String,
    @Json(name = "screen_name") val screenName: String,
    @Json(name = "screen_type") val screenType: String,
    val location: Location,
    @Json(name = "sync_timestamp") val syncTimestamp: String,
    @Json(name = "schedule_changed") val scheduleChanged: Boolean,
    @Json(name = "media_changed") val mediaChanged: Boolean,
    @Json(name = "current_schedule") val currentSchedule: Schedule?,
    @Json(name = "all_schedules") val allSchedules: List<Schedule>,
    @Json(name = "power_schedule") val powerSchedule: PowerSchedule?,
    @Json(name = "next_sync_recommended") val nextSyncRecommended: Int // seconds
)

@Serializable
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

@Serializable
@JsonClass(generateAdapter = true)
data class PowerSchedule(
    val enabled: Boolean,
    @Json(name = "on_time") val onTime: String,
    @Json(name = "off_time") val offTime: String,
    val timezone: String,
    @Json(name = "energy_saving") val energySaving: Boolean,
    @Json(name = "warning_minutes") val warningMinutes: Int,
    @Json(name = "last_updated") val lastUpdated: String?
)

@Serializable
@JsonClass(generateAdapter = true)
data class Playlist(
    val id: String,
    val name: String,
    val items: List<PlaylistItem>
)

@Serializable
@JsonClass(generateAdapter = true)
data class PlaylistItem(
    val id: String,
    @Json(name = "display_order") val displayOrder: Int,
    @Json(name = "display_duration") val displayDuration: Int,
    val media: MediaAsset?
)

@Serializable
@JsonClass(generateAdapter = true)
data class CalendarMetadata(
    val provider: String,
    val timezone: String,
    @Json(name = "calendar_id") val calendarId: String,
    @Json(name = "calendar_name") val calendarName: String,
    @Json(name = "sync_status") val syncStatus: String,
    @Json(name = "access_token") val accessToken: String,
    @Json(name = "refresh_token") val refreshToken: String,
    @Json(name = "token_expires_at") val tokenExpiresAt: String,
    @Json(name = "last_token_refresh") val lastTokenRefresh: String? = null,
    @Json(name = "microsoft_user_id") val microsoftUserId: String? = null,
    @Json(name = "microsoft_email") val microsoftEmail: String? = null,
    @Json(name = "show_organizer") val showOrganizer: Boolean? = null,
    @Json(name = "show_attendees") val showAttendees: Boolean? = null,
    @Json(name = "show_private_details") val showPrivateDetails: Boolean? = null,
    @Json(name = "business_hours_start") val businessHoursStart: String? = null,
    @Json(name = "business_hours_end") val businessHoursEnd: String? = null,
    @Json(name = "migration_date") val migrationDate: String? = null,
    @Json(name = "migrated_from_screen_id") val migratedFromScreenId: String? = null
)

@Serializable
@JsonClass(generateAdapter = true)
data class MediaAsset(
    val id: String,
    val name: String,
    val url: String?,  // Nullable - calendar media doesn't have URLs
    @Json(name = "thumbnail_url") val thumbnailUrl: String?,
    @Json(name = "mime_type") val mimeType: String,
    @Json(name = "file_size") val fileSize: Long?,
    val duration: Int?,
    val width: Int?,
    val height: Int?,
    @Json(name = "youtube_url") val youtubeUrl: String? = null,
    @Json(name = "media_type") val mediaType: String? = null,  // Type of media (image, video, youtube, calendar)
    @Json(name = "calendar_metadata") val calendarMetadata: CalendarMetadata? = null  // Calendar-specific configuration
)

@Serializable
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