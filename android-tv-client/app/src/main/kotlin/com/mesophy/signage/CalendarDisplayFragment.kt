package com.mesophy.signage

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import timber.log.Timber
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.abs

/**
 * CalendarDisplayFragment displays live calendar events from Microsoft Graph
 *
 * Shows current meeting (if any) and upcoming events for the day
 * Updates every 60 seconds to keep data fresh
 */
class CalendarDisplayFragment : Fragment() {

    companion object {
        private const val TAG = "CalendarDisplayFragment"
        private const val REFRESH_INTERVAL_MS = 60000L // 1 minute
        private const val TIME_UPDATE_INTERVAL_MS = 1000L // 1 second
    }

    private val handler = Handler(Looper.getMainLooper())
    private val moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()
    private val client = OkHttpClient()

    private lateinit var calendarNameText: TextView
    private lateinit var currentDateTimeText: TextView
    private lateinit var currentEventSection: LinearLayout
    private lateinit var currentEventTitle: TextView
    private lateinit var currentEventTime: TextView
    private lateinit var currentEventOrganizer: TextView
    private lateinit var noCurrentEventText: TextView
    private lateinit var upcomingEventsList: LinearLayout
    private lateinit var noUpcomingEventsText: TextView
    private lateinit var loadingText: TextView
    private lateinit var errorText: TextView

    private var calendarMetadata: CalendarMetadata? = null
    private var baseUrl: String = ""
    private var deviceToken: String = ""

    private var refreshRunnable: Runnable? = null
    private var timeUpdateRunnable: Runnable? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_calendar_display, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // Initialize views
        calendarNameText = view.findViewById(R.id.calendarName)
        currentDateTimeText = view.findViewById(R.id.currentDateTime)
        currentEventSection = view.findViewById(R.id.currentEventSection)
        currentEventTitle = view.findViewById(R.id.currentEventTitle)
        currentEventTime = view.findViewById(R.id.currentEventTime)
        currentEventOrganizer = view.findViewById(R.id.currentEventOrganizer)
        noCurrentEventText = view.findViewById(R.id.noCurrentEventText)
        upcomingEventsList = view.findViewById(R.id.upcomingEventsList)
        noUpcomingEventsText = view.findViewById(R.id.noUpcomingEventsText)
        loadingText = view.findViewById(R.id.loadingText)
        errorText = view.findViewById(R.id.errorText)

        Timber.i("📅 CalendarDisplayFragment initialized")

        // Start updating current time
        startTimeUpdates()
    }

    /**
     * Set calendar metadata and start fetching events
     */
    fun setCalendarData(metadata: CalendarMetadata, url: String, token: String, screenName: String? = null, locationName: String? = null) {
        this.calendarMetadata = metadata
        this.baseUrl = url
        this.deviceToken = token

        // Set calendar name - prefer screenName if provided, otherwise use metadata
        val displayName = when {
            !screenName.isNullOrEmpty() && !locationName.isNullOrEmpty() -> "$locationName - $screenName"
            !screenName.isNullOrEmpty() -> screenName
            else -> metadata.calendarName
        }
        calendarNameText.text = displayName

        // Start fetching calendar data
        fetchCalendarEvents()
        startAutoRefresh()
    }

    /**
     * Start auto-refresh timer
     */
    private fun startAutoRefresh() {
        refreshRunnable = Runnable {
            fetchCalendarEvents()
            handler.postDelayed(refreshRunnable!!, REFRESH_INTERVAL_MS)
        }
        handler.postDelayed(refreshRunnable!!, REFRESH_INTERVAL_MS)
    }

    /**
     * Start updating current date/time display
     */
    private fun startTimeUpdates() {
        timeUpdateRunnable = Runnable {
            updateCurrentTime()
            handler.postDelayed(timeUpdateRunnable!!, TIME_UPDATE_INTERVAL_MS)
        }
        handler.post(timeUpdateRunnable!!)
    }

    /**
     * Update current date/time display
     */
    private fun updateCurrentTime() {
        val sdf = SimpleDateFormat("EEEE, MMMM d, yyyy h:mm a", Locale.getDefault())
        currentDateTimeText.text = sdf.format(Date())
    }

    /**
     * Fetch calendar events from API
     */
    private fun fetchCalendarEvents() {
        if (calendarMetadata == null || baseUrl.isEmpty()) {
            Timber.w("⚠️ Calendar data not set, skipping fetch")
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                Timber.i("📅 Fetching calendar events...")
                withContext(Dispatchers.Main) {
                    showLoading(true)
                }

                // Create request body with calendar metadata
                val requestMap = mapOf("calendar_metadata" to calendarMetadata)
                val requestBodyJson = moshi.adapter<Map<String, CalendarMetadata?>>(
                    com.squareup.moshi.Types.newParameterizedType(
                        Map::class.java,
                        String::class.java,
                        CalendarMetadata::class.java
                    )
                ).toJson(requestMap)

                val apiUrl = "$baseUrl/api/devices/calendar-data"
                Timber.d("📡 Fetching from: $apiUrl")
                Timber.d("🔑 Device token: ${if (deviceToken.isNotEmpty()) deviceToken.take(20) + "..." else "EMPTY"}")

                val request = Request.Builder()
                    .url(apiUrl)
                    .addHeader("Authorization", "Bearer $deviceToken")
                    .addHeader("Content-Type", "application/json")
                    .post(requestBodyJson.toRequestBody("application/json".toMediaType()))
                    .build()

                val response = client.newCall(request).execute()

                Timber.d("📡 Response code: ${response.code}")
                if (response.isSuccessful) {
                    val responseBody = response.body?.string()
                    if (responseBody != null) {
                        val adapter = moshi.adapter(CalendarDataResponse::class.java)
                        val calendarData = adapter.fromJson(responseBody)

                        if (calendarData != null) {
                            Timber.i("✅ Fetched ${calendarData.events.size} events")
                            withContext(Dispatchers.Main) {
                                displayCalendarEvents(calendarData)
                                showLoading(false)
                            }
                        }
                    }
                } else {
                    Timber.e("❌ Calendar fetch failed: ${response.code} ${response.message}")
                    withContext(Dispatchers.Main) {
                        showError("Failed to load calendar")
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "❌ Error fetching calendar events")
                withContext(Dispatchers.Main) {
                    showError("Error loading calendar: ${e.message}")
                }
            }
        }
    }

    /**
     * Display calendar events in UI
     */
    private fun displayCalendarEvents(calendarData: CalendarDataResponse) {
        val now = Date()
        val events = calendarData.events.filter { !it.isCancelled }

        // Find current event
        var currentEvent: CalendarEvent? = null
        val upcomingEvents = mutableListOf<CalendarEvent>()

        for (event in events) {
            val startTime = parseIsoDateTime(event.start)
            val endTime = parseIsoDateTime(event.end)

            if (startTime != null && endTime != null) {
                when {
                    startTime <= now && endTime > now -> {
                        // Event is happening now
                        currentEvent = event
                    }
                    startTime > now -> {
                        // Event is upcoming
                        upcomingEvents.add(event)
                    }
                }
            }
        }

        // Display current event
        if (currentEvent != null) {
            displayCurrentEvent(currentEvent)
        } else {
            showNoCurrentEvent()
        }

        // Display upcoming events
        if (upcomingEvents.isNotEmpty()) {
            displayUpcomingEvents(upcomingEvents)
        } else {
            showNoUpcomingEvents()
        }
    }

    /**
     * Display current event
     */
    private fun displayCurrentEvent(event: CalendarEvent) {
        currentEventSection.visibility = View.VISIBLE
        noCurrentEventText.visibility = View.GONE

        currentEventTitle.text = if (event.isPrivate) "Private Meeting" else event.subject

        val startTime = parseIsoDateTime(event.start)
        val endTime = parseIsoDateTime(event.end)
        if (startTime != null && endTime != null) {
            val timeFormat = SimpleDateFormat("h:mm a", Locale.getDefault())
            currentEventTime.text = "${timeFormat.format(startTime)} - ${timeFormat.format(endTime)}"
        }

        if (event.organizer != null && !event.isPrivate) {
            currentEventOrganizer.text = "Organizer: ${event.organizer.name ?: event.organizer.email}"
            currentEventOrganizer.visibility = View.VISIBLE
        } else {
            currentEventOrganizer.visibility = View.GONE
        }
    }

    /**
     * Show no current event message
     */
    private fun showNoCurrentEvent() {
        currentEventSection.visibility = View.GONE
        noCurrentEventText.visibility = View.VISIBLE
    }

    /**
     * Display upcoming events list
     */
    private fun displayUpcomingEvents(events: List<CalendarEvent>) {
        upcomingEventsList.removeAllViews()
        upcomingEventsList.visibility = View.VISIBLE
        noUpcomingEventsText.visibility = View.GONE

        for (event in events.take(5)) { // Show max 5 upcoming events
            val eventView = layoutInflater.inflate(R.layout.item_calendar_event, upcomingEventsList, false)

            val eventTime = eventView.findViewById<TextView>(R.id.eventTime)
            val eventTitle = eventView.findViewById<TextView>(R.id.eventTitle)
            val eventDuration = eventView.findViewById<TextView>(R.id.eventDuration)
            val eventOrganizer = eventView.findViewById<TextView>(R.id.eventOrganizer)

            // Set event time
            val startTime = parseIsoDateTime(event.start)
            if (startTime != null) {
                val timeFormat = SimpleDateFormat("h:mm a", Locale.getDefault())
                eventTime.text = timeFormat.format(startTime)
            }

            // Set event title
            eventTitle.text = if (event.isPrivate) "Private Meeting" else event.subject

            // Calculate and set duration
            val startTimeDate = parseIsoDateTime(event.start)
            val endTimeDate = parseIsoDateTime(event.end)
            if (startTimeDate != null && endTimeDate != null) {
                val durationMinutes = ((endTimeDate.time - startTimeDate.time) / 60000).toInt()
                eventDuration.text = when {
                    durationMinutes < 60 -> "$durationMinutes minutes"
                    durationMinutes == 60 -> "1 hour"
                    durationMinutes % 60 == 0 -> "${durationMinutes / 60} hours"
                    else -> "${durationMinutes / 60}h ${durationMinutes % 60}m"
                }
            }

            // Set organizer
            if (event.organizer != null && !event.isPrivate) {
                eventOrganizer.text = "with ${event.organizer.name ?: event.organizer.email}"
                eventOrganizer.visibility = View.VISIBLE
            } else {
                eventOrganizer.visibility = View.GONE
            }

            upcomingEventsList.addView(eventView)
        }
    }

    /**
     * Show no upcoming events message
     */
    private fun showNoUpcomingEvents() {
        upcomingEventsList.visibility = View.GONE
        noUpcomingEventsText.visibility = View.VISIBLE
    }

    /**
     * Show/hide loading indicator
     */
    private fun showLoading(show: Boolean) {
        loadingText.visibility = if (show) View.VISIBLE else View.GONE
        errorText.visibility = View.GONE
    }

    /**
     * Show error message
     */
    private fun showError(message: String) {
        loadingText.visibility = View.GONE
        errorText.visibility = View.VISIBLE
        errorText.text = message
    }

    /**
     * Parse ISO 8601 datetime string
     * The API returns times in UTC, so we need to parse them as UTC
     * and they will automatically display in the device's local timezone
     */
    private fun parseIsoDateTime(dateTimeStr: String): Date? {
        return try {
            val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
            sdf.timeZone = TimeZone.getTimeZone("UTC")  // Parse as UTC
            sdf.parse(dateTimeStr)
        } catch (e: Exception) {
            Timber.e(e, "Failed to parse datetime: $dateTimeStr")
            null
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()

        // Cancel refresh timers
        refreshRunnable?.let { handler.removeCallbacks(it) }
        timeUpdateRunnable?.let { handler.removeCallbacks(it) }

        Timber.i("🗑️ CalendarDisplayFragment destroyed")
    }
}
