const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const mime = require('mime-types');

class MediaPlayer {
  constructor(config, displayInfo) {
    this.config = config;
    this.displayInfo = displayInfo;
    this.currentProcess = null;
    this.currentMedia = null;
    this.isPlaying = false;
    this.playbackStartTime = null;
    this.playbackCallback = null;
  }

  async playMedia(mediaFile, duration = null, callback = null) {
    try {
      // Stop any current playback
      await this.stop();
      
      this.currentMedia = mediaFile;
      this.playbackCallback = callback;
      this.playbackStartTime = Date.now();
      
      const mimeType = mime.lookup(mediaFile.local_path) || 'unknown';
      const mediaType = this.getMediaType(mimeType);
      
      console.log(`Playing ${mediaType}: ${mediaFile.name} (${mimeType})`);
      
      switch (mediaType) {
        case 'video':
          await this.playVideo(mediaFile, duration);
          break;
        case 'image':
          await this.playImage(mediaFile, duration);
          break;
        case 'audio':
          await this.playAudio(mediaFile, duration);
          break;
        default:
          throw new Error(`Unsupported media type: ${mimeType}`);
      }
      
      this.isPlaying = true;
      return true;
      
    } catch (error) {
      console.error('Error playing media:', error);
      if (this.playbackCallback) {
        this.playbackCallback(error);
      }
      return false;
    }
  }

  async playVideo(mediaFile, duration = null) {
    const videoPath = mediaFile.local_path;
    
    // Try omxplayer first (best for Pi hardware acceleration)
    if (await this.commandExists('omxplayer')) {
      console.log('Using omxplayer for video playback');
      await this.playWithOmxplayer(videoPath, duration);
    }
    // Fallback to VLC
    else if (await this.commandExists('vlc')) {
      console.log('Using VLC for video playback');
      await this.playWithVLC(videoPath, duration);
    }
    // Final fallback to mpv
    else if (await this.commandExists('mpv')) {
      console.log('Using mpv for video playback');
      await this.playWithMpv(videoPath, duration);
    }
    else {
      throw new Error('No suitable video player found. Install omxplayer, vlc, or mpv.');
    }
  }

  async playWithOmxplayer(videoPath, duration) {
    const args = [
      '--no-osd',          // No on-screen display
      '--no-keys',         // Disable keyboard input
      '--aspect-mode', 'letterbox', // Maintain aspect ratio
      '--vol', '0',        // Start muted (adjust as needed)
      videoPath
    ];

    // Add hardware acceleration if enabled
    if (this.config.media.videoHardwareAcceleration) {
      args.unshift('--hw');
    }

    this.currentProcess = spawn('omxplayer', args, {
      stdio: 'ignore',
      detached: false
    });

    this.setupProcessHandlers(duration || mediaFile.duration);
  }

  async playWithVLC(videoPath, duration) {
    const args = [
      '--intf', 'dummy',              // No interface
      '--no-video-title-show',        // Don't show title
      '--fullscreen',                 // Fullscreen mode
      '--no-mouse-events',            // Disable mouse
      '--no-keyboard-events',         // Disable keyboard
      '--no-osd',                     // No on-screen display
      videoPath,
      'vlc://quit'                    // Auto-quit when done
    ];

    this.currentProcess = spawn('vlc', args, {
      stdio: 'ignore',
      detached: false
    });

    this.setupProcessHandlers(duration || mediaFile.duration);
  }

  async playWithMpv(videoPath, duration) {
    const args = [
      '--no-terminal',        // No terminal output
      '--no-osc',            // No on-screen controls
      '--no-input-default-bindings', // Disable default key bindings
      '--fullscreen',         // Fullscreen mode
      '--loop-file=no',      // Don't loop
      videoPath
    ];

    this.currentProcess = spawn('mpv', args, {
      stdio: 'ignore',
      detached: false
    });

    this.setupProcessHandlers(duration || mediaFile.duration);
  }

  async playImage(mediaFile, duration = null) {
    const imagePath = mediaFile.local_path;
    const displayDuration = duration || this.config.media.defaultImageDuration || 10;

    // Try fbi first (framebuffer image viewer)
    if (await this.commandExists('fbi')) {
      console.log('Using fbi for image display');
      await this.playWithFbi(imagePath, displayDuration);
    }
    // Fallback to fim
    else if (await this.commandExists('fim')) {
      console.log('Using fim for image display');
      await this.playWithFim(imagePath, displayDuration);
    }
    else {
      throw new Error('No suitable image viewer found. Install fbi or fim.');
    }
  }

  async playWithFbi(imagePath, duration) {
    const framebuffer = this.config.system.framebufferDevice || '/dev/fb0';
    
    const args = [
      '-d', framebuffer,      // Framebuffer device
      '-T', '1',              // Use terminal 1
      '-noverbose',           // Quiet output
      '-a',                   // Auto-zoom to fit screen
      '--once',               // Display once
      imagePath
    ];

    this.currentProcess = spawn('fbi', args, {
      stdio: 'ignore',
      detached: false
    });

    // Set up timer to stop after duration
    this.setupProcessHandlers(duration * 1000);
  }

  async playWithFim(imagePath, duration) {
    const framebuffer = this.config.system.framebufferDevice || '/dev/fb0';
    
    const args = [
      '--device', framebuffer, // Framebuffer device
      '--quiet',               // Quiet output
      '--autozoom',           // Auto-zoom to fit
      '--no-etc-fimrc',       // Don't load config
      '--no-commandline',     // Disable command line
      imagePath
    ];

    this.currentProcess = spawn('fim', args, {
      stdio: 'ignore',
      detached: false
    });

    // Set up timer to stop after duration
    this.setupProcessHandlers(duration * 1000);
  }

  async playAudio(mediaFile, duration = null) {
    // For audio files, we can use aplay for WAV or mpg123 for MP3
    const audioPath = mediaFile.local_path;
    const mimeType = mime.lookup(audioPath);
    
    if (mimeType.includes('wav')) {
      if (await this.commandExists('aplay')) {
        console.log('Using aplay for audio playback');
        this.currentProcess = spawn('aplay', [audioPath], {
          stdio: 'ignore',
          detached: false
        });
      }
    } else if (mimeType.includes('mp3')) {
      if (await this.commandExists('mpg123')) {
        console.log('Using mpg123 for audio playback');
        this.currentProcess = spawn('mpg123', ['-q', audioPath], {
          stdio: 'ignore',
          detached: false
        });
      }
    } else {
      // Fallback to VLC for other audio formats
      if (await this.commandExists('vlc')) {
        console.log('Using VLC for audio playback');
        await this.playWithVLC(audioPath, duration);
        return;
      }
    }

    if (this.currentProcess) {
      this.setupProcessHandlers(duration || mediaFile.duration);
    } else {
      throw new Error(`No suitable audio player found for ${mimeType}`);
    }
  }

  setupProcessHandlers(timeoutMs = null) {
    if (!this.currentProcess) return;

    // Handle process exit
    this.currentProcess.on('exit', (code, signal) => {
      console.log(`Media process exited with code ${code}, signal ${signal}`);
      this.handlePlaybackEnd(code === 0 ? null : new Error(`Process exit code: ${code}`));
    });

    this.currentProcess.on('error', (error) => {
      console.error('Media process error:', error);
      this.handlePlaybackEnd(error);
    });

    // Set up timeout if specified
    if (timeoutMs && timeoutMs > 0) {
      setTimeout(() => {
        if (this.currentProcess && this.isPlaying) {
          console.log(`Stopping media after ${timeoutMs}ms timeout`);
          this.stop();
        }
      }, timeoutMs);
    }
  }

  handlePlaybackEnd(error = null) {
    const playbackDuration = this.playbackStartTime ? Date.now() - this.playbackStartTime : 0;
    
    this.isPlaying = false;
    this.currentProcess = null;
    
    console.log(`Playback ended after ${playbackDuration}ms`);
    
    if (this.playbackCallback) {
      this.playbackCallback(error, {
        media: this.currentMedia,
        duration: playbackDuration,
        completedNormally: !error
      });
    }
    
    this.currentMedia = null;
    this.playbackStartTime = null;
    this.playbackCallback = null;
  }

  async stop() {
    if (!this.currentProcess || !this.isPlaying) {
      return;
    }

    console.log('Stopping current media playback');

    try {
      // Try graceful termination first
      this.currentProcess.kill('SIGTERM');
      
      // Wait a bit for graceful exit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Force kill if still running
      if (this.currentProcess && !this.currentProcess.killed) {
        this.currentProcess.kill('SIGKILL');
      }
      
    } catch (error) {
      console.error('Error stopping media process:', error);
    }

    this.handlePlaybackEnd();
  }

  getMediaType(mimeType) {
    if (mimeType.startsWith('video/')) {
      return 'video';
    } else if (mimeType.startsWith('image/')) {
      return 'image';
    } else if (mimeType.startsWith('audio/')) {
      return 'audio';
    }
    return 'unknown';
  }

  async commandExists(command) {
    try {
      const { exec } = require('child_process');
      await new Promise((resolve, reject) => {
        exec(`which ${command}`, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  getStatus() {
    return {
      isPlaying: this.isPlaying,
      currentMedia: this.currentMedia,
      playbackStartTime: this.playbackStartTime,
      playbackDuration: this.playbackStartTime ? Date.now() - this.playbackStartTime : 0
    };
  }
}

module.exports = MediaPlayer;