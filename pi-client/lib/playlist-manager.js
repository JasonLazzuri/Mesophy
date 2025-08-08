const MediaPlayer = require('./media-player');
const path = require('path');
const fs = require('fs-extra');

class PlaylistManager {
  constructor(config, displayInfo, db, contentPath) {
    this.config = config;
    this.displayInfo = displayInfo;
    this.db = db;
    this.contentPath = contentPath;
    this.mediaPlayer = new MediaPlayer(config, displayInfo);
    
    this.currentPlaylist = null;
    this.currentMediaIndex = 0;
    this.isPlaying = false;
    this.playbackLoop = null;
    this.transitionTimer = null;
    this.playbackHistory = [];
    
    this.onPlaybackEvent = null; // Callback for playback events
  }

  async loadPlaylist(playlistData) {
    try {
      console.log('Loading playlist:', playlistData.name);
      
      // Validate playlist
      if (!playlistData.media || playlistData.media.length === 0) {
        throw new Error('Playlist contains no media items');
      }
      
      // Check if all media files exist locally
      const availableMedia = [];
      for (const mediaItem of playlistData.media) {
        const mediaPath = await this.getLocalMediaPath(mediaItem);
        if (mediaPath && await fs.pathExists(mediaPath)) {
          availableMedia.push({
            ...mediaItem,
            local_path: mediaPath
          });
        } else {
          console.warn(`Media file not found: ${mediaItem.name}`);
        }
      }
      
      if (availableMedia.length === 0) {
        throw new Error('No media files available for playlist');
      }
      
      this.currentPlaylist = {
        ...playlistData,
        media: availableMedia
      };
      
      this.currentMediaIndex = 0;
      console.log(`Playlist loaded with ${availableMedia.length} media items`);
      
      return true;
    } catch (error) {
      console.error('Error loading playlist:', error);
      return false;
    }
  }

  async startPlayback(loop = true) {
    if (!this.currentPlaylist || this.isPlaying) {
      return false;
    }
    
    console.log('Starting playlist playback');
    this.isPlaying = true;
    
    // Start with first media item
    await this.playCurrentMedia();
    
    return true;
  }

  async stopPlayback() {
    console.log('Stopping playlist playback');
    
    this.isPlaying = false;
    
    // Clear any pending transitions
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    
    // Stop current media
    await this.mediaPlayer.stop();
  }

  async pausePlayback() {
    if (!this.isPlaying) return;
    
    console.log('Pausing playlist playback');
    this.isPlaying = false;
    
    // Clear transition timer
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    
    // Stop current media
    await this.mediaPlayer.stop();
  }

  async resumePlayback() {
    if (this.isPlaying || !this.currentPlaylist) return;
    
    console.log('Resuming playlist playback');
    this.isPlaying = true;
    
    // Resume from current media item
    await this.playCurrentMedia();
  }

  async playCurrentMedia() {
    if (!this.isPlaying || !this.currentPlaylist) {
      return;
    }
    
    const mediaItem = this.currentPlaylist.media[this.currentMediaIndex];
    if (!mediaItem) {
      console.error('No media item at current index');
      return;
    }
    
    console.log(`Playing media ${this.currentMediaIndex + 1}/${this.currentPlaylist.media.length}: ${mediaItem.name}`);
    
    // Log playback start
    await this.logPlaybackStart(mediaItem);
    
    // Determine playback duration
    let duration = null;
    if (mediaItem.mime_type?.startsWith('image/')) {
      duration = mediaItem.display_duration || this.config.media.defaultImageDuration;
    } else if (mediaItem.duration) {
      duration = mediaItem.duration / 1000; // Convert ms to seconds
    }
    
    // Start media playback
    const success = await this.mediaPlayer.playMedia(
      mediaItem,
      duration,
      (error, result) => this.onMediaComplete(error, result)
    );
    
    if (!success) {
      console.error('Failed to play media, skipping to next');
      await this.nextMedia();
    }
  }

  async onMediaComplete(error, result) {
    if (error) {
      console.error('Media playback error:', error);
    }
    
    // Log playback end
    if (result) {
      await this.logPlaybackEnd(result.media, result.duration, !error);
    }
    
    // Add to playback history
    if (result && result.media) {
      this.playbackHistory.push({
        media: result.media,
        playedAt: new Date(),
        duration: result.duration,
        success: !error
      });
      
      // Keep only last 100 items in history
      if (this.playbackHistory.length > 100) {
        this.playbackHistory = this.playbackHistory.slice(-100);
      }
    }
    
    // Notify listeners
    if (this.onPlaybackEvent) {
      this.onPlaybackEvent('media_complete', {
        error,
        result,
        playlistProgress: {
          current: this.currentMediaIndex + 1,
          total: this.currentPlaylist?.media?.length || 0
        }
      });
    }
    
    // Move to next media after transition delay
    if (this.isPlaying) {
      const transitionDelay = this.config.device.mediaTransitionDelay || 1000;
      this.transitionTimer = setTimeout(() => {
        this.nextMedia();
      }, transitionDelay);
    }
  }

  async nextMedia() {
    if (!this.currentPlaylist || !this.isPlaying) {
      return;
    }
    
    this.currentMediaIndex++;
    
    // Check if we've reached the end of the playlist
    if (this.currentMediaIndex >= this.currentPlaylist.media.length) {
      console.log('End of playlist reached');
      
      if (this.currentPlaylist.loop !== false) {
        // Loop back to beginning
        console.log('Looping playlist');
        this.currentMediaIndex = 0;
        await this.playCurrentMedia();
      } else {
        // Stop playback
        console.log('Playlist completed, stopping');
        await this.stopPlayback();
        
        if (this.onPlaybackEvent) {
          this.onPlaybackEvent('playlist_complete', {
            playlist: this.currentPlaylist
          });
        }
      }
    } else {
      // Play next media item
      await this.playCurrentMedia();
    }
  }

  async previousMedia() {
    if (!this.currentPlaylist || !this.isPlaying) {
      return;
    }
    
    this.currentMediaIndex--;
    
    if (this.currentMediaIndex < 0) {
      this.currentMediaIndex = this.currentPlaylist.media.length - 1;
    }
    
    // Stop current media and play previous
    await this.mediaPlayer.stop();
    await this.playCurrentMedia();
  }

  async jumpToMedia(index) {
    if (!this.currentPlaylist || index < 0 || index >= this.currentPlaylist.media.length) {
      return false;
    }
    
    this.currentMediaIndex = index;
    
    if (this.isPlaying) {
      await this.mediaPlayer.stop();
      await this.playCurrentMedia();
    }
    
    return true;
  }

  async getLocalMediaPath(mediaItem) {
    // First check if we have a cached version
    const cachedPath = await this.getCachedMediaPath(mediaItem.id);
    if (cachedPath) {
      return cachedPath;
    }
    
    // Fallback: construct expected path
    const fileName = `${mediaItem.id}_${this.sanitizeFileName(mediaItem.name)}`;
    const extension = mediaItem.mime_type ? this.getFileExtension(mediaItem.mime_type) : '';
    const fullFileName = extension ? `${fileName}.${extension}` : fileName;
    
    return path.join(this.contentPath, fullFileName);
  }

  async getCachedMediaPath(mediaId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT local_path FROM media_cache WHERE id = ?',
        [mediaId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row ? row.local_path : null);
          }
        }
      );
    });
  }

  sanitizeFileName(fileName) {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  getFileExtension(mimeType) {
    const extensions = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/ogg': 'ogv',
      'video/quicktime': 'mov',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg'
    };
    
    return extensions[mimeType.toLowerCase()] || '';
  }

  async logPlaybackStart(mediaItem) {
    return new Promise((resolve) => {
      const stmt = this.db.prepare(`
        INSERT INTO playback_log (media_id, playlist_id, schedule_id, started_at, status)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        mediaItem.id,
        this.currentPlaylist?.id || null,
        this.currentPlaylist?.schedule_id || null,
        new Date().toISOString(),
        'playing'
      );
      
      stmt.finalize(() => resolve());
    });
  }

  async logPlaybackEnd(mediaItem, durationMs, success) {
    return new Promise((resolve) => {
      const stmt = this.db.prepare(`
        UPDATE playback_log 
        SET ended_at = ?, duration_ms = ?, status = ?
        WHERE media_id = ? AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
      `);
      
      stmt.run(
        new Date().toISOString(),
        durationMs,
        success ? 'completed' : 'error',
        mediaItem.id
      );
      
      stmt.finalize(() => resolve());
    });
  }

  getCurrentStatus() {
    const mediaPlayerStatus = this.mediaPlayer.getStatus();
    
    return {
      isPlaying: this.isPlaying,
      playlist: this.currentPlaylist ? {
        id: this.currentPlaylist.id,
        name: this.currentPlaylist.name,
        mediaCount: this.currentPlaylist.media?.length || 0
      } : null,
      currentMediaIndex: this.currentMediaIndex,
      currentMedia: this.currentPlaylist?.media?.[this.currentMediaIndex] || null,
      mediaPlayer: mediaPlayerStatus,
      playbackHistory: this.playbackHistory.slice(-10) // Last 10 items
    };
  }

  async getPlaybackStats() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          DATE(started_at) as play_date,
          COUNT(*) as plays,
          SUM(duration_ms) as total_duration,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_plays
        FROM playback_log 
        WHERE started_at >= datetime('now', '-7 days')
        GROUP BY DATE(started_at)
        ORDER BY play_date DESC
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  setPlaybackEventHandler(callback) {
    this.onPlaybackEvent = callback;
  }
}

module.exports = PlaylistManager;