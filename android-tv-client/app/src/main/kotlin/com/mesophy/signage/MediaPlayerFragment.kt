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
    
    private var currentPlaylist: List<PlaylistItem> = emptyList()
    private var currentIndex = 0
    private var isPlaying = false
    
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
        
        Timber.i("🎬 MediaPlayerFragment initialized")
    }
    
    /**
     * Start playing a playlist of playlist items
     */
    fun startPlaylist(playlist: List<PlaylistItem>) {
        Timber.i("🎬 Starting playlist with ${playlist.size} playlist items")
        
        currentPlaylist = playlist
        currentIndex = 0
        isPlaying = true
        
        if (playlist.isNotEmpty()) {
            playCurrentMedia()
        } else {
            Timber.w("⚠️ Empty playlist provided")
            listener?.onPlaylistCompleted()
        }
    }
    
    /**
     * Update the playlist with new content while playing
     */
    fun updatePlaylist(content: CurrentContentResponse) {
        val newPlaylist = content.playlist?.items ?: emptyList()
        Timber.i("🔄 Updating playlist with ${newPlaylist.size} playlist items")
        
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
        
        // Hide both views
        imageView.visibility = View.GONE
        videoView.visibility = View.GONE
        
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
        
        // Find the local file path for this asset
        val mediaDownloadManager = (activity as? MainActivity)?.getMediaDownloadManager()
        val localPath = mediaDownloadManager?.getCachedFilePath(asset)
        
        if (localPath == null || !File(localPath).exists()) {
            Timber.e("❌ Media file not found: ${asset.name}")
            listener?.onMediaError(playlistItem, "Media file not found locally")
            playNextMedia()
            return
        }
        
        listener?.onMediaStarted(playlistItem)
        
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
        
        // Hide video view and show image view
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
        
        // Hide image view and show video view
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