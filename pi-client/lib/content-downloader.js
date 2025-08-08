const fs = require('fs-extra');
const path = require('path');
const fetch = require('node-fetch');
const mime = require('mime-types');
const crypto = require('crypto');

class ContentDownloader {
  constructor(config, db, contentPath) {
    this.config = config;
    this.db = db;
    this.contentPath = contentPath;
    this.activeDownloads = new Map();
    this.downloadQueue = [];
    this.maxConcurrentDownloads = 3;
    this.onProgressCallback = null;
  }

  async downloadPlaylistMedia(playlist, deviceToken) {
    if (!playlist || !playlist.media || playlist.media.length === 0) {
      return { success: true, downloaded: 0, errors: [] };
    }

    console.log(`Starting download for playlist: ${playlist.name}`);
    console.log(`Media items to process: ${playlist.media.length}`);

    const results = {
      success: true,
      downloaded: 0,
      skipped: 0,
      errors: []
    };

    // Process each media item
    for (const mediaItem of playlist.media) {
      try {
        const downloadResult = await this.downloadMediaItem(mediaItem, deviceToken);
        
        if (downloadResult.success) {
          if (downloadResult.wasDownloaded) {
            results.downloaded++;
          } else {
            results.skipped++;
          }
        } else {
          results.errors.push({
            media: mediaItem.name,
            error: downloadResult.error
          });
        }
      } catch (error) {
        console.error(`Error processing media ${mediaItem.name}:`, error);
        results.errors.push({
          media: mediaItem.name,
          error: error.message
        });
      }
    }

    if (results.errors.length > 0) {
      results.success = false;
    }

    console.log(`Download completed. Downloaded: ${results.downloaded}, Skipped: ${results.skipped}, Errors: ${results.errors.length}`);
    
    return results;
  }

  async downloadMediaItem(mediaItem, deviceToken) {
    try {
      // Check if we already have this file
      const existingFile = await this.checkExistingFile(mediaItem);
      if (existingFile.exists && existingFile.isValid) {
        console.log(`Media already cached: ${mediaItem.name}`);
        return { success: true, wasDownloaded: false, localPath: existingFile.path };
      }

      // Generate local file path
      const localPath = await this.generateLocalPath(mediaItem);
      await fs.ensureDir(path.dirname(localPath));

      console.log(`Downloading: ${mediaItem.name}`);

      // Download the file
      const downloadSuccess = await this.performDownload(mediaItem, localPath, deviceToken);
      
      if (downloadSuccess) {
        // Verify the downloaded file
        const isValid = await this.verifyDownloadedFile(localPath, mediaItem);
        
        if (isValid) {
          // Cache the media information
          await this.cacheMediaInfo(mediaItem, localPath);
          console.log(`Successfully downloaded: ${mediaItem.name}`);
          
          return { success: true, wasDownloaded: true, localPath };
        } else {
          // Clean up invalid file
          await fs.remove(localPath).catch(() => {});
          throw new Error('Downloaded file failed verification');
        }
      } else {
        throw new Error('Download failed');
      }
      
    } catch (error) {
      console.error(`Failed to download ${mediaItem.name}:`, error);
      return { success: false, error: error.message };
    }
  }

  async checkExistingFile(mediaItem) {
    try {
      // Check database for cached file info
      const cachedInfo = await this.getCachedMediaInfo(mediaItem.id);
      
      if (cachedInfo && cachedInfo.local_path) {
        const exists = await fs.pathExists(cachedInfo.local_path);
        
        if (exists) {
          // Verify file integrity if we have size info
          if (mediaItem.file_size) {
            const stats = await fs.stat(cachedInfo.local_path);
            if (stats.size === mediaItem.file_size) {
              return { exists: true, isValid: true, path: cachedInfo.local_path };
            } else {
              console.log(`File size mismatch for ${mediaItem.name}, will re-download`);
              return { exists: false, isValid: false };
            }
          } else {
            // No size info, assume valid if file exists
            return { exists: true, isValid: true, path: cachedInfo.local_path };
          }
        }
      }
      
      return { exists: false, isValid: false };
    } catch (error) {
      console.error(`Error checking existing file for ${mediaItem.name}:`, error);
      return { exists: false, isValid: false };
    }
  }

  async performDownload(mediaItem, localPath, deviceToken) {
    try {
      // Create headers with authentication
      const headers = {
        'User-Agent': 'Mesophy-Pi-Client/1.0'
      };
      
      if (deviceToken) {
        headers['Authorization'] = `Bearer ${deviceToken}`;
      }

      // Start download
      const response = await fetch(mediaItem.url, {
        method: 'GET',
        headers: headers,
        timeout: 60000 // 60 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get content length for progress tracking
      const contentLength = parseInt(response.headers.get('content-length') || '0');
      
      // Create write stream
      const fileStream = fs.createWriteStream(localPath);
      let downloadedBytes = 0;
      
      // Track download progress
      response.body.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        
        if (this.onProgressCallback) {
          this.onProgressCallback({
            mediaItem,
            downloadedBytes,
            totalBytes: contentLength,
            progress: contentLength > 0 ? (downloadedBytes / contentLength) * 100 : 0
          });
        }
      });

      // Pipe response to file
      response.body.pipe(fileStream);

      // Wait for download to complete
      await new Promise((resolve, reject) => {
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
        response.body.on('error', reject);
      });

      return true;
      
    } catch (error) {
      console.error(`Download error for ${mediaItem.name}:`, error);
      
      // Clean up partial file
      try {
        await fs.remove(localPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      return false;
    }
  }

  async verifyDownloadedFile(localPath, mediaItem) {
    try {
      const stats = await fs.stat(localPath);
      
      // Check file size if available
      if (mediaItem.file_size && stats.size !== mediaItem.file_size) {
        console.log(`Size mismatch: expected ${mediaItem.file_size}, got ${stats.size}`);
        return false;
      }
      
      // Basic file type verification
      if (mediaItem.mime_type) {
        const detectedType = mime.lookup(localPath);
        if (detectedType && !this.mimeTypesMatch(detectedType, mediaItem.mime_type)) {
          console.log(`MIME type mismatch: expected ${mediaItem.mime_type}, detected ${detectedType}`);
          return false;
        }
      }
      
      // Check minimum file size (avoid empty files)
      if (stats.size < 100) {
        console.log('File too small, likely corrupted');
        return false;
      }
      
      return true;
      
    } catch (error) {
      console.error('File verification error:', error);
      return false;
    }
  }

  mimeTypesMatch(detected, expected) {
    // Normalize MIME types for comparison
    const normalize = (type) => type.toLowerCase().split(';')[0].trim();
    
    const detectedNorm = normalize(detected);
    const expectedNorm = normalize(expected);
    
    // Exact match
    if (detectedNorm === expectedNorm) {
      return true;
    }
    
    // Handle common variations
    const variations = {
      'image/jpg': 'image/jpeg',
      'video/quicktime': 'video/mov'
    };
    
    return variations[detectedNorm] === expectedNorm || 
           variations[expectedNorm] === detectedNorm;
  }

  async generateLocalPath(mediaItem) {
    // Create safe filename
    const sanitizedName = this.sanitizeFileName(mediaItem.name);
    const extension = this.getFileExtension(mediaItem.mime_type) || 
                     path.extname(mediaItem.name).slice(1);
    
    const fileName = `${mediaItem.id}_${sanitizedName}`;
    const fullFileName = extension ? `${fileName}.${extension}` : fileName;
    
    return path.join(this.contentPath, fullFileName);
  }

  sanitizeFileName(fileName) {
    return fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 100); // Limit length
  }

  getFileExtension(mimeType) {
    if (!mimeType) return '';
    
    const extensions = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/bmp': 'bmp',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/ogg': 'ogv',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/mp4': 'm4a'
    };
    
    return extensions[mimeType.toLowerCase()] || '';
  }

  async cacheMediaInfo(mediaItem, localPath) {
    try {
      const stats = await fs.stat(localPath);
      
      await new Promise((resolve, reject) => {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO media_cache 
          (id, name, url, local_path, mime_type, file_size, duration, downloaded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run(
          mediaItem.id,
          mediaItem.name,
          mediaItem.url,
          localPath,
          mediaItem.mime_type,
          stats.size,
          mediaItem.duration || null,
          new Date().toISOString()
        );
        
        stmt.finalize((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
    } catch (error) {
      console.error('Error caching media info:', error);
    }
  }

  async getCachedMediaInfo(mediaId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM media_cache WHERE id = ?',
        [mediaId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  async cleanupOldCache(maxAgeDays = 30) {
    try {
      // Get list of old cached files
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
      
      const oldFiles = await new Promise((resolve, reject) => {
        this.db.all(
          'SELECT * FROM media_cache WHERE downloaded_at < ?',
          [cutoffDate.toISOString()],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });
      
      console.log(`Cleaning up ${oldFiles.length} old cached files`);
      
      // Remove files and database entries
      for (const file of oldFiles) {
        try {
          // Remove physical file
          if (await fs.pathExists(file.local_path)) {
            await fs.remove(file.local_path);
            console.log(`Removed old cache file: ${file.name}`);
          }
          
          // Remove from database
          await new Promise((resolve) => {
            this.db.run('DELETE FROM media_cache WHERE id = ?', [file.id], () => resolve());
          });
          
        } catch (error) {
          console.error(`Error cleaning up ${file.name}:`, error);
        }
      }
      
      return oldFiles.length;
      
    } catch (error) {
      console.error('Error during cache cleanup:', error);
      return 0;
    }
  }

  async getCacheStats() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          COUNT(*) as total_files,
          SUM(file_size) as total_size,
          AVG(file_size) as avg_file_size,
          MIN(downloaded_at) as oldest_file,
          MAX(downloaded_at) as newest_file
        FROM media_cache
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows[0]);
        }
      });
    });
  }

  setProgressCallback(callback) {
    this.onProgressCallback = callback;
  }
}

module.exports = ContentDownloader;