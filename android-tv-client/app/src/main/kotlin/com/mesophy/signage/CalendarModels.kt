package com.mesophy.signage

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * Data models for calendar integration
 */

@JsonClass(generateAdapter = true)
data class CalendarEvent(
    val id: String,
    val subject: String,
    val start: String,
    val end: String,
    val timezone: String,
    val organizer: Organizer?,
    val attendees: List<Attendee>?,
    val location: String?,
    val body: String?,
    @Json(name = "is_all_day") val isAllDay: Boolean,
    @Json(name = "is_private") val isPrivate: Boolean,
    @Json(name = "show_as") val showAs: String?,
    @Json(name = "is_cancelled") val isCancelled: Boolean
)

@JsonClass(generateAdapter = true)
data class Organizer(
    val name: String?,
    val email: String?
)

@JsonClass(generateAdapter = true)
data class Attendee(
    val name: String?,
    val email: String?,
    val status: String?
)

@JsonClass(generateAdapter = true)
data class CalendarDataResponse(
    @Json(name = "calendar_id") val calendarId: String,
    @Json(name = "calendar_name") val calendarName: String?,
    val timezone: String,
    val events: List<CalendarEvent>,
    @Json(name = "fetched_at") val fetchedAt: String,
    @Json(name = "token_refreshed") val tokenRefreshed: Boolean,
    @Json(name = "new_access_token") val newAccessToken: String?,
    @Json(name = "new_refresh_token") val newRefreshToken: String?
)
