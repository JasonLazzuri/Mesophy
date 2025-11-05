package com.mesophy.signage

import android.graphics.drawable.Drawable
import android.media.MediaPlayer
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ImageView
import android.widget.VideoView
import androidx.fragment.app.Fragment
import com.bumptech.glide.Glide
import com.bumptech.glide.load.DataSource
import com.bumptech.glide.load.engine.GlideException
import com.bumptech.glide.request.RequestListener
import com.bumptech.glide.request.target.Target
import timber.log.Timber
import java.io.File

/**
 * MediaPlayerFragment handles playback of digital signage content
 * 
 * Supports images and videos with automatic transitions based on 
 * display duration from the playlist.
 */
class MediaPlayerFragment : Fragment() {
    
    companion object {
        private const val TAG = "MediaPlayerFragment"
        private const val DEFAULT_IMAGE_DURATION = 10000L // 10 seconds
        private const val TRANSITION_DELAY = 500L // 0.5 second fade transition
    }
    
    private lateinit var imageView: ImageView
    private lateinit var videoView: VideoView
    private lateinit var youtubeWebView: WebView

    private var currentPlaylist: List<PlaylistItem> = emptyList()
    private var currentIndex = 0
    private var isPlaying = false
    private var retryAttempted = false

    private val handler = Handler(Looper.getMainLooper())
    private var nextMediaRunnable: Runnable? = null
    
    // Listener for media playback events
    interface MediaPlaybackListener {
        fun onMediaStarted(item: PlaylistItem)
        fun onMediaCompleted(item: PlaylistItem)
        fun onPlaylistCompleted()
        fun onMediaError(item: PlaylistItem, error: String)
    }
    
    private var listener: MediaPlaybackListener? = null
    
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_media_player, container, false)
    }
    
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        imageView = view.findViewById(R.id.imageView)
        videoView = view.findViewById(R.id.videoView)
        youtubeWebView = view.findViewById(R.id.youtubeWebView)

        // Configure video view
        videoView.setOnPreparedListener { mediaPlayer ->
            mediaPlayer.setVideoScalingMode(MediaPlayer.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING)
            mediaPlayer.isLooping = false
        }

        videoView.setOnCompletionListener {
            onCurrentMediaCompleted()
        }

        videoView.setOnErrorListener { _, what, extra ->
            val currentItem = getCurrentPlaylistItem()
            if (currentItem != null) {
                listener?.onMediaError(currentItem, "Video error: $what, $extra")
                Timber.e("❌ Video playback error: $what, $extra")
            }
            // Try to continue to next media
            playNextMedia()
            true
        }

        // Configure WebView for YouTube playback
        youtubeWebView.settings.apply {
            javaScriptEnabled = true
            mediaPlaybackRequiresUserGesture = false
            domStorageEnabled = true
            databaseEnabled = true
            javaScriptCanOpenWindowsAutomatically = true
            allowFileAccess = true
            allowContentAccess = true
            setSupportMultipleWindows(false)
            loadsImagesAutomatically = true

            // Enable hardware acceleration for better video performance
            setRenderPriority(android.webkit.WebSettings.RenderPriority.HIGH)

            // Set user agent to make YouTube think we're a normal browser
            userAgentString = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

        // Enhanced WebChromeClient to capture JavaScript console messages
        youtubeWebView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: android.webkit.ConsoleMessage?): Boolean {
                consoleMessage?.let {
                    Timber.d("📺 WebView Console [${it.messageLevel()}]: ${it.message()} (${it.sourceId()}:${it.lineNumber()})")
                }
                return true
            }
        }

        // Enhanced WebViewClient to capture page load events and errors
        youtubeWebView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                Timber.d("📺 WebView page loaded: $url")
            }

            override fun onReceivedError(
                view: WebView?,
                errorCode: Int,
                description: String?,
                failingUrl: String?
            ) {
                Timber.e("📺 WebView error: code=$errorCode, desc=$description, url=$failingUrl")
            }
        }

        // Add JavaScript interface to detect video end
        youtubeWebView.addJavascriptInterface(object {
            @JavascriptInterface
            fun onVideoEnded() {
                handler.post {
                    Timber.d("📺 YouTube video ended")
                    onCurrentMediaCompleted()
                }
            }

            @JavascriptInterface
            fun onVideoError(error: String) {
                handler.post {
                    val currentItem = getCurrentPlaylistItem()
                    if (currentItem != null) {
                        listener?.onMediaError(currentItem, "YouTube error: $error")
                        Timber.e("❌ YouTube playback error: $error")
                        handleYouTubeError(currentItem)
                    }
                }
            }
        }, "Android")

        Timber.i("🎬 MediaPlayerFragment initialized")
    }
    
    /**
     * Start playing a playlist of playlist items
     */
    fun startPlaylist(playlist: List<PlaylistItem>) {
        // Filter out calendar items until calendar UI is implemented
        val filteredPlaylist = playlist.filter { item ->
            item.media?.mimeType != "application/calendar"
        }

        Timber.i("🎬 Starting playlist with ${filteredPlaylist.size} playlist items (filtered from ${playlist.size} total)")

        currentPlaylist = filteredPlaylist
        currentIndex = 0
        isPlaying = true

        if (filteredPlaylist.isNotEmpty()) {
            playCurrentMedia()
        } else {
            Timber.w("⚠️ Empty playlist after filtering calendar items")
            listener?.onPlaylistCompleted()
        }
    }
    
    /**
     * Update the playlist with new content while playing
     */
    fun updatePlaylist(content: CurrentContentResponse) {
        // Sort playlist items by displayOrder to ensure correct sequence
        // Filter out calendar items until calendar UI is implemented
        val allItems = (content.playlist?.items ?: emptyList())
            .sortedBy { it.displayOrder }

        val newPlaylist = allItems.filter { item ->
            item.media?.mimeType != "application/calendar"
        }

        Timber.i("🔄 Updating playlist with ${newPlaylist.size} playlist items (filtered from ${allItems.size} total)")

        // Debug logging for playlist order
        allItems.forEachIndexed { index, item ->
            val status = if (item.media?.mimeType == "application/calendar") "FILTERED" else "INCLUDED"
            Timber.d("  $index: displayOrder=${item.displayOrder}, name=${item.media?.name}, type=${item.media?.mimeType} [$status]")
        }

        // Check if playlist actually changed to avoid unnecessary updates
        if (playlistsAreEqual(currentPlaylist, newPlaylist)) {
            Timber.d("Playlist unchanged, skipping update")
            return
        }
        
        val wasPlaying = isPlaying
        currentPlaylist = newPlaylist
        
        if (wasPlaying && newPlaylist.isNotEmpty()) {
            // If we're currently playing and have new content, continue smoothly
            // Reset to beginning of new playlist after current media finishes
            Timber.i("📝 Playlist updated, will restart from beginning after current media")
        } else if (newPlaylist.isNotEmpty()) {
            // Start playing new playlist if we weren't playing before
            startPlaylist(newPlaylist)
        } else {
            // Stop if new playlist is empty
            stopPlayback()
        }
    }
    
    /**
     * Compare two playlists to see if they're functionally equivalent
     */
    private fun playlistsAreEqual(oldPlaylist: List<PlaylistItem>, newPlaylist: List<PlaylistItem>): Boolean {
        if (oldPlaylist.size != newPlaylist.size) return false
        
        return oldPlaylist.zip(newPlaylist).all { (old, new) ->
            old.id == new.id && 
            old.displayDuration == new.displayDuration &&
            old.media?.id == new.media?.id &&
            old.media?.url == new.media?.url
        }
    }
    
    /**
     * Stop playback and clear resources
     */
    fun stopPlayback() {
        Timber.i("⏹️ Stopping media playback")

        isPlaying = false

        // Cancel any pending transitions
        nextMediaRunnable?.let { handler.removeCallbacks(it) }
        nextMediaRunnable = null

        // Stop video if playing
        if (videoView.isPlaying) {
            videoView.stopPlayback()
        }

        // Stop WebView playback
        youtubeWebView.loadUrl("about:blank")

        // Hide all views
        imageView.visibility = View.GONE
        videoView.visibility = View.GONE
        youtubeWebView.visibility = View.GONE

        // Clear image cache
        Glide.with(this).clear(imageView)
    }
    
    /**
     * Set media playback listener
     */
    fun setMediaPlaybackListener(listener: MediaPlaybackListener?) {
        this.listener = listener
    }
    
    /**
     * Play the current media item
     */
    private fun playCurrentMedia() {
        if (!isPlaying || currentIndex >= currentPlaylist.size) {
            return
        }
        
        val playlistItem = currentPlaylist[currentIndex]
        val asset = playlistItem.media
        if (asset == null) {
            Timber.e("❌ No media asset in playlist item")
            playNextMedia()
            return
        }

        Timber.i("🎵 Playing media: ${asset.name} (${currentIndex + 1}/${currentPlaylist.size})")

        listener?.onMediaStarted(playlistItem)

        // Check if this is a calendar media type (skip for now, not yet implemented)
        if (asset.mimeType == "application/calendar") {
            Timber.w("⚠️ Calendar media type not yet supported, skipping: ${asset.name}")
            listener?.onMediaCompleted(playlistItem)
            playNextMedia()
            return
        }

        // Check if this is a YouTube video (doesn't need local file)
        if (asset.mimeType == "video/youtube" || asset.youtubeUrl != null) {
            playYouTube(playlistItem)
            return
        }

        // For non-YouTube media, find the local file path
        val mediaDownloadManager = (activity as? MainActivity)?.getMediaDownloadManager()
        Timber.d("🔍 mediaDownloadManager for ${asset.name}: ${if (mediaDownloadManager == null) "NULL" else "NOT NULL"}")

        // If MediaDownloadManager is not ready yet, retry after a short delay
        if (mediaDownloadManager == null) {
            Timber.w("⚠️ MediaDownloadManager not ready for ${asset.name}, retrying in 500ms...")
            handler.postDelayed({
                if (isPlaying) {
                    playCurrentMedia()
                }
            }, 500)
            return
        }

        val localPath = mediaDownloadManager.getCachedFilePath(asset)

        Timber.d("🔍 Checking file for ${asset.name}: localPath=$localPath")
        if (localPath != null) {
            val file = File(localPath)
            Timber.d("🔍 File exists: ${file.exists()}, path: ${file.absolutePath}")
        }

        if (localPath == null || !File(localPath).exists()) {
            Timber.e("❌ Media file not found: ${asset.name} (localPath=$localPath)")
            listener?.onMediaError(playlistItem, "Media file not found locally")
            playNextMedia()
            return
        }

        when {
            asset.mimeType.startsWith("image/") -> {
                playImage(playlistItem, localPath)
            }
            asset.mimeType.startsWith("video/") -> {
                playVideo(playlistItem, localPath)
            }
            else -> {
                Timber.w("⚠️ Unsupported media type: ${asset.mimeType}")
                listener?.onMediaError(playlistItem, "Unsupported media type: ${asset.mimeType}")
                playNextMedia()
            }
        }
    }
    
    /**
     * Play an image with specified duration
     */
    private fun playImage(playlistItem: PlaylistItem, localPath: String) {
        val asset = playlistItem.media ?: return
        Timber.d("📸 Displaying image: ${asset.name} for ${playlistItem.displayDuration} seconds")

        // Hide other views and show image view
        youtubeWebView.visibility = View.GONE
        videoView.visibility = View.GONE
        imageView.visibility = View.VISIBLE
        
        // Load image with Glide (simplified)
        try {
            Glide.with(this)
                .load(File(localPath))
                .into(imageView)
                
            Timber.d("✅ Image loaded successfully: ${asset.name}")
            scheduleNextMedia(playlistItem)
            
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to load image: ${asset.name}")
            listener?.onMediaError(playlistItem, "Failed to load image: ${e.message}")
            playNextMedia()
        }
    }
    
    /**
     * Play a video
     */
    private fun playVideo(playlistItem: PlaylistItem, localPath: String) {
        val asset = playlistItem.media ?: return
        Timber.d("🎥 Playing video: ${asset.name}")

        // Hide other views and show video view
        youtubeWebView.visibility = View.GONE
        imageView.visibility = View.GONE
        videoView.visibility = View.VISIBLE
        
        try {
            val uri = Uri.fromFile(File(localPath))
            videoView.setVideoURI(uri)
            videoView.start()
            
            Timber.d("✅ Video started: ${asset.name}")
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to start video: ${asset.name}")
            listener?.onMediaError(playlistItem, "Failed to start video: ${e.message}")
            playNextMedia()
        }
    }
    
    /**
     * Schedule the next media item based on duration
     */
    private fun scheduleNextMedia(playlistItem: PlaylistItem) {
        // Use displayDuration from playlist item (in seconds), convert to milliseconds
        val duration = playlistItem.displayDuration * 1000L
        
        Timber.d("⏱️ Scheduling next media in ${duration}ms (${playlistItem.displayDuration}s)")
        
        nextMediaRunnable = Runnable {
            if (isPlaying) {
                onCurrentMediaCompleted()
            }
        }
        
        handler.postDelayed(nextMediaRunnable!!, duration)
    }
    
    /**
     * Handle completion of current media
     */
    private fun onCurrentMediaCompleted() {
        val currentItem = getCurrentPlaylistItem()
        if (currentItem != null) {
            listener?.onMediaCompleted(currentItem)
            Timber.d("✅ Media completed: ${currentItem.media?.name ?: "Unknown"}")
        }
        
        playNextMedia()
    }
    
    /**
     * Move to next media in playlist
     */
    private fun playNextMedia() {
        if (!isPlaying) return
        
        currentIndex++
        
        if (currentIndex >= currentPlaylist.size) {
            // Playlist completed, restart from beginning
            Timber.i("🔄 Playlist completed, restarting...")
            currentIndex = 0
            listener?.onPlaylistCompleted()
            
            // Add small delay before restarting
            handler.postDelayed({
                if (isPlaying) {
                    playCurrentMedia()
                }
            }, TRANSITION_DELAY)
        } else {
            // Play next item with small transition delay
            handler.postDelayed({
                if (isPlaying) {
                    playCurrentMedia()
                }
            }, TRANSITION_DELAY)
        }
    }
    
    /**
     * Play a YouTube video
     */
    private fun playYouTube(playlistItem: PlaylistItem) {
        val asset = playlistItem.media ?: return
        val youtubeUrl = asset.youtubeUrl

        if (youtubeUrl == null) {
            Timber.e("❌ YouTube URL is null for media: ${asset.name}")
            listener?.onMediaError(playlistItem, "YouTube URL is missing")
            playNextMedia()
            return
        }

        Timber.d("📺 Playing YouTube video: ${asset.name}")
        Timber.d("📺 YouTube URL: $youtubeUrl")

        // Hide other views and show WebView
        imageView.visibility = View.GONE
        videoView.visibility = View.GONE
        youtubeWebView.visibility = View.VISIBLE

        Timber.d("📺 View visibility: imageView=${imageView.visibility}, videoView=${videoView.visibility}, youtubeWebView=${youtubeWebView.visibility}")

        // Extract video ID from YouTube URL
        val videoId = extractYouTubeVideoId(youtubeUrl)
        if (videoId == null) {
            Timber.e("❌ Invalid YouTube URL: $youtubeUrl")
            listener?.onMediaError(playlistItem, "Invalid YouTube URL")
            playNextMedia()
            return
        }

        Timber.d("📺 Extracted video ID: $videoId")

        // Use youtube-nocookie domain for better compatibility
        val embedUrl = "https://www.youtube-nocookie.com/embed/$videoId?autoplay=1&controls=0&modestbranding=1&rel=0&fs=0&playsinline=1"

        try {
            Timber.d("📺 Loading YouTube URL with referer header: $embedUrl")

            // Add HTTP Referer header to fix Error 153
            // YouTube requires proper client identification via Referer header
            val headers = mutableMapOf<String, String>()
            val packageName = requireContext().packageName
            headers["Referer"] = "https://$packageName"

            youtubeWebView.loadUrl(embedUrl, headers)

            // Since we can't detect video end with direct iframe, use display duration from playlist
            // Default to 60 seconds if not specified
            val duration = if (playlistItem.displayDuration > 0) {
                playlistItem.displayDuration * 1000L
            } else {
                60000L // 60 seconds default for YouTube videos
            }

            Timber.d("📺 YouTube video will play for ${duration/1000} seconds")
            scheduleNextMedia(playlistItem)

            Timber.d("✅ YouTube video loaded: ${asset.name}")
        } catch (e: Exception) {
            Timber.e(e, "❌ Failed to load YouTube video: ${asset.name}")
            listener?.onMediaError(playlistItem, "Failed to load YouTube video: ${e.message}")
            playNextMedia()
        }
    }

    /**
     * Extract YouTube video ID from various URL formats
     */
    private fun extractYouTubeVideoId(url: String): String? {
        return try {
            when {
                url.contains("youtube.com/watch?v=") -> {
                    url.substringAfter("v=").substringBefore("&")
                }
                url.contains("youtu.be/") -> {
                    url.substringAfter("youtu.be/").substringBefore("?")
                }
                url.contains("youtube.com/embed/") -> {
                    url.substringAfter("embed/").substringBefore("?")
                }
                else -> null
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to extract video ID from URL: $url")
            null
        }
    }

    /**
     * Handle YouTube playback errors with retry logic
     */
    private fun handleYouTubeError(playlistItem: PlaylistItem) {
        if (!retryAttempted) {
            Timber.w("⚠️ YouTube error, attempting retry...")
            retryAttempted = true
            handler.postDelayed({
                playYouTube(playlistItem)
            }, 2000) // Retry after 2 seconds
        } else {
            Timber.e("❌ YouTube playback failed after retry, skipping to next media")
            retryAttempted = false
            playNextMedia()
        }
    }

    /**
     * Get current playlist item
     */
    private fun getCurrentPlaylistItem(): PlaylistItem? {
        return if (currentIndex < currentPlaylist.size) {
            currentPlaylist[currentIndex]
        } else null
    }

    override fun onDestroy() {
        super.onDestroy()
        stopPlayback()
        Timber.i("🗑️ MediaPlayerFragment destroyed")
    }
}