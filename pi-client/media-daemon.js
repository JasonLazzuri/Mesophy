#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const fetch = require('node-fetch');
const Database = require('sqlite3').Database;
const { spawn, exec } = require('child_process');
const schedule = require('node-schedule');
const mime = require('mime-types');
const lockfile = require('lockfile');
const si = require('systeminformation');

// Import our custom modules
const PlaylistManager = require('./lib/playlist-manager');
const ContentDownloader = require('./lib/content-downloader');
const ScheduleManager = require('./lib/schedule-manager');
const ResourceMonitor = require('./lib/resource-monitor');
const DisplayManager = require('./lib/display-manager');
const PairingOverlay = require('./lib/pairing-overlay');
const DisplayConfig = require('./lib/display-config');

// Configuration
const CONFIG_PATH = '/opt/mesophy/config/config.json';
const DB_PATH = '/opt/mesophy/data/client.db';
const CONTENT_PATH = '/opt/mesophy/content';
const LOG_PATH = '/opt/mesophy/logs';
const LOCK_FILE = '/opt/mesophy/media-daemon.lock';

let config = {};
let db = null;
let currentPairingCode = null;
let deviceConfig = null;
let syncInterval = null;
let heartbeatInterval = null;
let currentMediaProcess = null;
let displayInfo = null;

class MediaDaemon {
  constructor() {
    this.isRunning = false;
    this.displayResolution = { width: 1920, height: 1080 };
    
    // Initialize our managers
    this.playlistManager = null;
    this.contentDownloader = null;
    this.scheduleManager = null;
    this.resourceMonitor = null;
    this.displayManager = null;
    this.pairingOverlay = null;
    this.displayConfig = null;
    
    // Error recovery
    this.errorCount = 0;
    this.lastError = null;
    this.recoveryAttempts = 0;
    this.maxRecoveryAttempts = 3;
  }

  async start() {
    console.log('Mesophy Media Daemon starting...');
    
    // Create lock file to prevent multiple instances
    try {
      lockfile.lockSync(LOCK_FILE);
      process.on('exit', () => {
        try {
          lockfile.unlockSync(LOCK_FILE);
        } catch (e) {
          // Ignore cleanup errors
        }
      });
    } catch (error) {
      console.error('Another instance is already running');
      process.exit(1);
    }

    await this.loadConfig();
    await this.initDatabase();
    await this.initAdvancedDisplaySystem();
    
    // Try to load saved device config
    try {
      await this.loadDeviceConfig();
      if (deviceConfig) {
        await this.startPairedServices();
      }
    } catch (error) {
      console.log('No saved device config found');
    }
    
    // If not paired, start pairing process
    if (!deviceConfig) {
      await this.startPairingProcess();
    }

    this.isRunning = true;
    this.setupSignalHandlers();
  }

  async loadConfig() {
    try {
      await fs.ensureDir(path.dirname(CONFIG_PATH));
      await fs.ensureDir(CONTENT_PATH);
      await fs.ensureDir(LOG_PATH);
      
      if (await fs.pathExists(CONFIG_PATH)) {
        config = await fs.readJson(CONFIG_PATH);
      } else {
        // Create default config
        config = {
          api: {
            baseUrl: "https://mesophy.vercel.app",
            endpoints: {
              generateCode: "/api/devices/generate-code",
              checkPairing: "/api/devices/check-pairing",
              sync: "/api/devices/sync", 
              heartbeat: "/api/devices/heartbeat"
            }
          },
          device: {
            syncInterval: 120,
            heartbeatInterval: 300,
            mediaTransitionDelay: 1000
          },
          media: {
            videoPlayer: 'omxplayer',
            imageViewer: 'fbi',
            fallbackPlayer: 'vlc',
            defaultImageDuration: 10,
            videoHardwareAcceleration: true
          },
          system: {
            logLevel: "info",
            maxLogFiles: 10,
            framebufferDevice: '/dev/fb0'
          },
          monitoring: {
            interval: 30000,
            memoryThreshold: 85,
            cpuThreshold: 90,
            diskThreshold: 90,
            tempThreshold: 75
          }
        };
        await fs.writeJson(CONFIG_PATH, config, { spaces: 2 });
      }
      console.log('Configuration loaded');
    } catch (error) {
      console.error('Failed to load configuration:', error);
      process.exit(1);
    }
  }

  async initDatabase() {
    try {
      await fs.ensureDir(path.dirname(DB_PATH));
      
      db = new Database(DB_PATH);
      
      // Create tables
      await new Promise((resolve, reject) => {
        db.serialize(() => {
          db.run(`CREATE TABLE IF NOT EXISTS device_config (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`);
          
          db.run(`CREATE TABLE IF NOT EXISTS schedules (
            id TEXT PRIMARY KEY,
            name TEXT,
            playlist_id TEXT,
            start_time TEXT,
            end_time TEXT,
            days_of_week TEXT,
            priority INTEGER,
            data TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`);
          
          db.run(`CREATE TABLE IF NOT EXISTS media_cache (
            id TEXT PRIMARY KEY,
            name TEXT,
            url TEXT,
            local_path TEXT,
            mime_type TEXT,
            file_size INTEGER,
            duration INTEGER,
            downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`);
          
          db.run(`CREATE TABLE IF NOT EXISTS playback_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id TEXT,
            playlist_id TEXT,
            schedule_id TEXT,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME,
            duration_ms INTEGER,
            status TEXT
          )`);
          
          db.run(`CREATE TABLE IF NOT EXISTS sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_type TEXT,
            success BOOLEAN,
            message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
      
      console.log('Database initialized');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      process.exit(1);
    }
  }

  async initAdvancedDisplaySystem() {
    try {
      console.log('Initializing advanced display management system...');
      
      // Initialize display manager
      this.displayManager = new DisplayManager(path.dirname(CONFIG_PATH));
      await this.displayManager.initialize();
      
      // Initialize display configuration system
      this.displayConfig = new DisplayConfig(path.dirname(CONFIG_PATH));
      await this.displayConfig.initialize();
      
      // Auto-detect and configure optimal display settings
      const detectedCapabilities = await this.displayManager.detectAndConfigureDisplay();
      console.log('Display capabilities detected:', detectedCapabilities);
      
      // Apply recommended profile if no user config exists
      const currentConfig = this.displayConfig.getCurrentConfig();
      if (!currentConfig.profile) {
        const recommendedProfile = this.displayConfig.getRecommendedProfile(detectedCapabilities);
        console.log('Applying recommended display profile:', recommendedProfile.name);
        await this.displayConfig.applyProfile(recommendedProfile.id);
      }
      
      // Initialize pairing overlay system
      this.pairingOverlay = new PairingOverlay(this.displayManager, path.dirname(CONFIG_PATH));
      await this.pairingOverlay.initialize();
      
      // Set up pairing overlay callbacks
      this.pairingOverlay.setCodeRefreshCallback(() => {
        console.log('Pairing code refresh requested');
        this.generatePairingCode();
      });
      
      // Update display info for legacy compatibility
      displayInfo = this.displayManager.getCurrentDisplay();
      this.displayResolution = { width: displayInfo.width, height: displayInfo.height };
      
      console.log('Advanced display system initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize advanced display system:', error);
      // Fallback to basic display initialization
      await this.initBasicDisplay();
    }
  }
  
  async initBasicDisplay() {
    try {
      console.log('Falling back to basic display initialization...');
      // Detect display resolution
      displayInfo = await this.detectDisplay();
      console.log('Display detected:', displayInfo);
      
      // Clear screen and set up framebuffer
      await this.clearDisplay();
      
    } catch (error) {
      console.error('Failed to initialize display:', error);
      // Use default resolution as fallback
      displayInfo = { width: 1920, height: 1080 };
    }
  }

  async detectDisplay() {
    try {
      // Try to get display info from system
      const graphics = await si.graphics();
      const display = graphics.displays[0];
      
      if (display) {
        return {
          width: display.resolutionX || 1920,
          height: display.resolutionY || 1080,
          pixelDepth: display.pixelDepth || 32
        };
      }
    } catch (error) {
      console.log('Could not detect display automatically, using defaults');
    }

    // Fallback: try to read from framebuffer
    try {
      const fbinfo = await this.execCommand('fbset -s');
      const widthMatch = fbinfo.match(/geometry (\d+)/);
      const heightMatch = fbinfo.match(/geometry \d+ (\d+)/);
      
      if (widthMatch && heightMatch) {
        return {
          width: parseInt(widthMatch[1]),
          height: parseInt(heightMatch[1]),
          pixelDepth: 32
        };
      }
    } catch (error) {
      console.log('Could not read framebuffer info');
    }

    return { width: 1920, height: 1080, pixelDepth: 32 };
  }

  async clearDisplay() {
    try {
      if (this.displayManager) {
        // Use display manager's clear method
        const currentDisplay = this.displayManager.getCurrentDisplay();
        await this.execCommand(`dd if=/dev/zero of=/dev/fb0 bs=1024 count=1024 2>/dev/null || true`);
      } else {
        // Fallback to basic clear
        await this.execCommand(`dd if=/dev/zero of=${config.system.framebufferDevice} 2>/dev/null || true`);
      }
    } catch (error) {
      console.log('Could not clear display directly');
    }
  }

  async startPairingProcess() {
    console.log('Device not paired, starting pairing process...');
    await this.generatePairingCode();
    await this.showAdvancedPairingScreen();
    
    // Check pairing status every 30 seconds
    setInterval(async () => {
      if (!deviceConfig) {
        const pairingResult = await this.checkPairingStatus();
        if (pairingResult && pairingResult.paired) {
          // Show pairing success if using advanced overlay
          if (this.pairingOverlay) {
            await this.pairingOverlay.showPairingSuccess();
            // Give time for success message to be seen
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          await this.hidePairingScreen();
          await this.startPairedServices();
        } else if (pairingResult && pairingResult.error) {
          // Show error in overlay if available
          if (this.pairingOverlay) {
            await this.pairingOverlay.showErrorOverlay(pairingResult.error);
          }
        }
      }
    }, 30000);
  }

  async startPairedServices() {
    console.log('Starting paired device services...');
    
    // Initialize managers
    this.playlistManager = new PlaylistManager(config, displayInfo, db, CONTENT_PATH);
    this.contentDownloader = new ContentDownloader(config, db, CONTENT_PATH);
    this.scheduleManager = new ScheduleManager(db, this.playlistManager, this.contentDownloader, deviceConfig.device_token);
    this.resourceMonitor = new ResourceMonitor(config, (alert) => this.handleResourceAlert(alert));
    
    // Set up event handlers
    this.setupEventHandlers();
    
    // Start resource monitoring
    this.resourceMonitor.start();
    
    // Start services
    this.startSyncService();
    this.startHeartbeatService();
    await this.startMediaPlayback();
  }

  async showAdvancedPairingScreen() {
    try {
      // Kill any existing display processes
      await this.stopCurrentMedia();
      
      // Update network status for the overlay
      const networkStatus = await this.checkNetworkStatus();
      if (this.pairingOverlay) {
        this.pairingOverlay.updateNetworkStatus(networkStatus);
      }
      
      if (this.pairingOverlay && currentPairingCode) {
        // Use advanced pairing overlay system
        const expiryTime = new Date(Date.now() + 300000); // 5 minutes
        await this.pairingOverlay.showPairingOverlay(currentPairingCode, expiryTime);
      } else {
        // Fallback to basic pairing screen
        await this.showBasicPairingScreen();
      }

      console.log('Advanced pairing screen displayed');
    } catch (error) {
      console.error('Failed to show advanced pairing screen:', error);
      // Fallback to basic implementation
      await this.showBasicPairingScreen();
    }
  }
  
  async showBasicPairingScreen() {
    try {
      // Create pairing display using fbi with text overlay
      const pairingImagePath = await this.createPairingImage();
      
      // Display pairing screen
      currentMediaProcess = spawn('fbi', [
        '-d', config.system.framebufferDevice,
        '-T', '1',
        '-noverbose',
        '-a',
        pairingImagePath
      ], {
        stdio: 'ignore',
        detached: false
      });

      console.log('Basic pairing screen displayed');
    } catch (error) {
      console.error('Failed to show basic pairing screen:', error);
    }
  }

  async hidePairingScreen() {
    if (this.pairingOverlay) {
      await this.pairingOverlay.hidePairingOverlay();
    } else {
      await this.stopCurrentMedia();
      await this.clearDisplay();
    }
  }

  async createPairingImage() {
    try {
      const imagePath = path.join(CONTENT_PATH, 'pairing-screen.png');
      
      // Create a simple text-based pairing screen using ImageMagick
      const code = currentPairingCode || 'LOADING';
      const command = `convert -size ${displayInfo.width}x${displayInfo.height} xc:black ` +
        `-fill white -gravity center ` +
        `-pointsize 120 -annotate +0-200 "MESOPHY DIGITAL SIGNAGE" ` +
        `-pointsize 80 -annotate +0-50 "Device Setup Required" ` +
        `-fill "#4f46e5" -pointsize 200 -annotate +0+100 "${code}" ` +
        `-fill white -pointsize 60 -annotate +0+250 "Enter this code at mesophy.vercel.app" ` +
        `"${imagePath}"`;
      
      await this.execCommand(command);
      return imagePath;
    } catch (error) {
      console.error('Failed to create pairing image:', error);
      // Return a fallback method - create simple text file
      const textPath = path.join(CONTENT_PATH, 'pairing.txt');
      await fs.writeFile(textPath, `PAIRING CODE: ${currentPairingCode || 'LOADING'}`);
      return textPath;
    }
  }

  async generatePairingCode() {
    try {
      // Update pairing progress if overlay is active
      if (this.pairingOverlay && this.pairingOverlay.getOverlayState().isDisplayed) {
        await this.pairingOverlay.updatePairingProgress(10, 'Generating new pairing code...');
      }
      
      const systemInfo = await this.getSystemInfo();
      
      if (this.pairingOverlay && this.pairingOverlay.getOverlayState().isDisplayed) {
        await this.pairingOverlay.updatePairingProgress(30, 'Contacting server...');
      }
      
      const response = await fetch(`${config.api.baseUrl}${config.api.endpoints.generateCode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          device_info: systemInfo
        })
      });
      
      if (this.pairingOverlay && this.pairingOverlay.getOverlayState().isDisplayed) {
        await this.pairingOverlay.updatePairingProgress(70, 'Processing response...');
      }
      
      if (response.ok) {
        const data = await response.json();
        currentPairingCode = data.pairing_code;
        console.log('Pairing code generated:', currentPairingCode);
        
        if (this.pairingOverlay && this.pairingOverlay.getOverlayState().isDisplayed) {
          await this.pairingOverlay.updatePairingProgress(100, 'Code ready!');
          // Refresh the overlay with new code
          setTimeout(async () => {
            const expiryTime = new Date(Date.now() + 300000); // 5 minutes
            await this.pairingOverlay.showPairingOverlay(currentPairingCode, expiryTime);
          }, 1000);
        }
        
        return data;
      } else {
        throw new Error(`Failed to generate pairing code: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error generating pairing code:', error);
      if (this.pairingOverlay) {
        await this.pairingOverlay.showErrorOverlay(`Failed to generate code: ${error.message}`);
      }
      return null;
    }
  }

  async checkPairingStatus() {
    if (!currentPairingCode) return null;
    
    try {
      const response = await fetch(`${config.api.baseUrl}${config.api.endpoints.checkPairing}/${currentPairingCode}`);
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.paired && data.device_config) {
        deviceConfig = data.device_config;
        
        // Save device config to database
        await new Promise((resolve, reject) => {
          const stmt = db.prepare('INSERT OR REPLACE INTO device_config (key, value) VALUES (?, ?)');
          stmt.run('device_token', deviceConfig.device_token);
          stmt.run('screen_id', deviceConfig.screen_id);
          stmt.run('config', JSON.stringify(deviceConfig));
          stmt.finalize((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        console.log('Device successfully paired to:', deviceConfig.screen_name);
        currentPairingCode = null;
        
        return data;
      }
      
      return data;
    } catch (error) {
      console.error('Error checking pairing status:', error);
      return { error: error.message };
    }
  }

  async loadDeviceConfig() {
    return new Promise((resolve, reject) => {
      db.get('SELECT value FROM device_config WHERE key = ?', ['config'], (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          try {
            deviceConfig = JSON.parse(row.value);
            console.log('Loaded saved device config for:', deviceConfig.screen_name);
            resolve(deviceConfig);
          } catch (error) {
            reject(error);
          }
        } else {
          resolve(null);
        }
      });
    });
  }

  startSyncService() {
    if (syncInterval) clearInterval(syncInterval);
    
    // Initial sync
    this.syncContent();
    
    // Set up interval
    syncInterval = setInterval(() => {
      this.syncContent();
    }, (config.device.syncInterval || 120) * 1000);
    
    console.log('Sync service started');
  }

  startHeartbeatService() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    
    // Initial heartbeat
    this.sendHeartbeat();
    
    // Set up interval
    heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, (config.device.heartbeatInterval || 300) * 1000);
    
    console.log('Heartbeat service started');
  }

  async syncContent() {
    if (!deviceConfig) return;
    
    try {
      const response = await fetch(`${config.api.baseUrl}${config.api.endpoints.sync}`, {
        headers: {
          'Authorization': `Bearer ${deviceConfig.device_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const syncData = await response.json();
        console.log('Sync completed:', {
          scheduleChanged: syncData.schedule_changed,
          mediaChanged: syncData.media_changed,
          currentSchedule: syncData.current_schedule?.name || 'None'
        });
        
        // Update local schedules
        if (syncData.all_schedules) {
          for (const schedule of syncData.all_schedules) {
            await this.saveSchedule(schedule);
          }
          
          // Reload schedules in the scheduler
          if (this.scheduleManager) {
            await this.scheduleManager.loadSchedules();
          }
        }
        
        // Download new media if needed
        if (syncData.media_changed && syncData.current_schedule?.playlist?.media && this.contentDownloader) {
          console.log('Downloading new media for current schedule...');
          await this.contentDownloader.downloadPlaylistMedia(
            syncData.current_schedule.playlist, 
            deviceConfig.device_token
          );
        }
        
        // Log sync
        await this.logSync('content', true, `Synced ${syncData.all_schedules?.length || 0} schedules`);
        
        return syncData;
      } else {
        throw new Error(`Sync failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Sync error:', error);
      await this.logSync('content', false, error.message);
    }
  }

  async sendHeartbeat() {
    if (!deviceConfig) return;
    
    try {
      const systemInfo = await this.getSystemInfo();
      const response = await fetch(`${config.api.baseUrl}${config.api.endpoints.heartbeat}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${deviceConfig.device_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'online',
          system_info: systemInfo,
          display_info: {
            resolution: `${displayInfo.width}x${displayInfo.height}`,
            current_media: this.getCurrentMediaInfo(),
            display_config: this.displayConfig ? this.displayConfig.getCurrentConfig() : null,
            display_capabilities: this.displayManager ? this.displayManager.getDisplayCapabilities() : null
          }
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.sync_recommended) {
          console.log('Sync recommended by server');
          await this.syncContent();
        }
      }
    } catch (error) {
      console.error('Heartbeat error:', error);
    }
  }

  async getSystemInfo() {
    try {
      const cpu = await si.cpu();
      const mem = await si.mem();
      const osInfo = await si.osInfo();
      const currentLoad = await si.currentLoad();
      
      return {
        hostname: osInfo.hostname,
        platform: osInfo.platform,
        arch: osInfo.arch,
        cpu_model: cpu.manufacturer + ' ' + cpu.brand,
        cpu_cores: cpu.cores,
        cpu_load: Math.round(currentLoad.currentLoad),
        total_memory: mem.total,
        free_memory: mem.free,
        uptime: osInfo.uptime,
        node_version: process.version,
        daemon_uptime: process.uptime(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get system info:', error);
      // Fallback to basic info
      const os = require('os');
      return {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        cpu_cores: os.cpus().length,
        total_memory: os.totalmem(),
        free_memory: os.freemem(),
        uptime: os.uptime(),
        node_version: process.version,
        daemon_uptime: process.uptime(),
        timestamp: new Date().toISOString()
      };
    }
  }

  getCurrentMediaInfo() {
    if (this.playlistManager) {
      const status = this.playlistManager.getCurrentStatus();
      if (status.isPlaying && status.currentMedia) {
        return {
          media_id: status.currentMedia.id,
          media_name: status.currentMedia.name,
          media_type: status.currentMedia.mime_type,
          playlist_position: status.currentMediaIndex + 1,
          playlist_length: status.playlist?.mediaCount || 0,
          playlist_name: status.playlist?.name || 'Unknown',
          schedule_name: this.scheduleManager?.getCurrentScheduleInfo()?.currentSchedule?.name || 'Default'
        };
      }
    }
    return null;
  }

  setupSignalHandlers() {
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      this.handleCriticalError('uncaughtException', error);
    });
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
      this.handleCriticalError('unhandledRejection', reason);
    });
  }

  handleResourceAlert(alert) {
    console.warn(`Resource Alert: ${alert.type} - ${alert.metric} at ${alert.value}${alert.unit} (threshold: ${alert.threshold}${alert.unit})`);
    
    // Log the alert
    this.logError('resource_alert', `${alert.metric} exceeded threshold: ${alert.value}${alert.unit}`);
    
    // Take action based on severity
    if (alert.severity === 'high') {
      console.warn('High severity resource alert - considering recovery actions');
      this.attemptRecovery('resource_pressure');
    }
  }

  async handleCriticalError(type, error) {
    this.errorCount++;
    this.lastError = { type, error: error.message || error.toString(), timestamp: new Date().toISOString() };
    
    console.error(`Critical error (${this.errorCount}):`, error);
    
    // Log the error
    await this.logError('critical_error', `${type}: ${error.message || error.toString()}`);
    
    // Attempt recovery if we haven't exceeded max attempts
    if (this.recoveryAttempts < this.maxRecoveryAttempts) {
      console.log(`Attempting recovery (attempt ${this.recoveryAttempts + 1}/${this.maxRecoveryAttempts})`);
      await this.attemptRecovery(type);
    } else {
      console.error('Max recovery attempts exceeded, shutting down');
      this.shutdown('maxRecoveryAttemptsExceeded');
    }
  }

  async attemptRecovery(errorType) {
    this.recoveryAttempts++;
    
    try {
      console.log(`Starting recovery procedure for: ${errorType}`);
      
      switch (errorType) {
        case 'uncaughtException':
        case 'unhandledRejection':
          await this.recoverFromCriticalError();
          break;
          
        case 'resource_pressure':
          await this.recoverFromResourcePressure();
          break;
          
        case 'media_playback_failure':
          await this.recoverFromMediaFailure();
          break;
          
        default:
          await this.generalRecovery();
          break;
      }
      
      console.log('Recovery procedure completed');
      
      // Reset error count on successful recovery
      setTimeout(() => {
        this.errorCount = Math.max(0, this.errorCount - 1);
      }, 60000); // Reduce error count after 1 minute of stability
      
    } catch (recoveryError) {
      console.error('Recovery procedure failed:', recoveryError);
      await this.logError('recovery_failed', recoveryError.message);
      
      // If recovery fails, wait a bit and try shutdown
      setTimeout(() => {
        this.shutdown('recoveryFailed');
      }, 5000);
    }
  }

  async recoverFromCriticalError() {
    // Stop all current operations
    await this.stopCurrentMedia();
    
    if (this.playlistManager) {
      await this.playlistManager.stopPlayback();
    }
    
    // Clear display
    await this.clearDisplay();
    
    // Wait for things to settle
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Try to restart media playback
    if (this.scheduleManager) {
      await this.scheduleManager.forceScheduleCheck();
    }
  }

  async recoverFromResourcePressure() {
    // Clear any cached data
    if (this.contentDownloader) {
      await this.contentDownloader.cleanupOldCache(1); // Clean files older than 1 day
    }
    
    // Restart media playback with fresh state
    await this.stopCurrentMedia();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    // Wait and restart
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    if (this.scheduleManager) {
      await this.scheduleManager.forceScheduleCheck();
    }
  }

  async recoverFromMediaFailure() {
    console.log('Recovering from media playback failure...');
    
    // Stop current media
    await this.stopCurrentMedia();
    
    // Show no content screen temporarily
    await this.showNoContentScreen();
    
    // Wait and try to restart
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    if (this.scheduleManager) {
      await this.scheduleManager.forceScheduleCheck();
    }
  }

  async generalRecovery() {
    console.log('Performing general recovery...');
    
    // Stop all media
    await this.stopCurrentMedia();
    
    // Clear display
    await this.clearDisplay();
    
    // Restart core services
    if (this.playlistManager && this.scheduleManager) {
      await this.scheduleManager.loadSchedules();
    }
  }

  async logError(errorType, message) {
    try {
      const errorLog = {
        type: errorType,
        message: message,
        timestamp: new Date().toISOString(),
        system_info: await this.getBasicSystemInfo()
      };
      
      // Log to file
      const logPath = path.join(LOG_PATH, `error-${new Date().toISOString().split('T')[0]}.log`);
      await fs.appendFile(logPath, JSON.stringify(errorLog) + '\n');
      
      // Also log to database if available
      if (db) {
        await new Promise((resolve) => {
          const stmt = db.prepare('INSERT INTO sync_log (sync_type, success, message) VALUES (?, ?, ?)');
          stmt.run('error', false, `${errorType}: ${message}`);
          stmt.finalize(() => resolve());
        });
      }
      
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
  }

  async getBasicSystemInfo() {
    try {
      const os = require('os');
      return {
        uptime: os.uptime(),
        load_average: os.loadavg(),
        free_memory: os.freemem(),
        total_memory: os.totalmem(),
        daemon_uptime: process.uptime(),
        error_count: this.errorCount,
        recovery_attempts: this.recoveryAttempts
      };
    } catch (error) {
      return { error: 'Failed to get system info' };
    }
  }

  async checkNetworkStatus() {
    try {
      // Test internet connectivity
      const testResponse = await fetch('https://8.8.8.8', { 
        method: 'HEAD', 
        timeout: 5000 
      }).catch(() => null);
      
      if (testResponse) {
        return 'online';
      }
      
      // Check local connectivity
      const localResponse = await fetch('http://192.168.1.1', { 
        method: 'HEAD', 
        timeout: 3000 
      }).catch(() => null);
      
      if (localResponse) {
        return 'limited';
      }
      
      return 'offline';
    } catch (error) {
      console.error('Error checking network status:', error);
      return 'unknown';
    }
  }

  async shutdown(signal) {
    console.log(`Received ${signal}, shutting down gracefully`);
    
    this.isRunning = false;
    
    // Stop media playback
    await this.stopCurrentMedia();
    
    // Stop playlist manager
    if (this.playlistManager) {
      await this.playlistManager.stopPlayback();
    }
    
    // Stop schedule manager
    if (this.scheduleManager) {
      this.scheduleManager.destroy();
    }
    
    // Stop resource monitor
    if (this.resourceMonitor) {
      this.resourceMonitor.stop();
    }
    
    // Stop display management systems
    if (this.pairingOverlay) {
      await this.pairingOverlay.cleanup();
    }
    
    if (this.displayManager) {
      await this.displayManager.cleanup();
    }
    
    if (this.displayConfig) {
      await this.displayConfig.cleanup();
    }
    
    // Clear intervals
    if (syncInterval) clearInterval(syncInterval);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    
    // Close database
    if (db) {
      db.close();
    }
    
    // Clear display
    await this.clearDisplay();
    
    // Remove lock file
    try {
      lockfile.unlockSync(LOCK_FILE);
    } catch (e) {
      // Ignore cleanup errors
    }
    
    console.log('Shutdown complete');
    process.exit(0);
  }

  async execCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  }

  // Placeholder methods for media functionality that will be implemented next
  setupEventHandlers() {
    // Set up playlist manager events
    if (this.playlistManager) {
      this.playlistManager.setPlaybackEventHandler((eventType, data) => {
        console.log(`Playlist event: ${eventType}`, data);
        
        switch (eventType) {
          case 'media_complete':
            // Log media playback completion
            break;
          case 'playlist_complete':
            // Handle playlist completion
            break;
        }
      });
    }
    
    // Set up schedule manager events
    if (this.scheduleManager) {
      this.scheduleManager.setScheduleChangeCallback((eventType, data) => {
        console.log(`Schedule event: ${eventType}`, data?.name || '');
        
        switch (eventType) {
          case 'schedule_activated':
            console.log(`Schedule activated: ${data.name}`);
            break;
          case 'schedule_deactivated':
            console.log(`Schedule deactivated: ${data.name}`);
            break;
          case 'default_playlist_activated':
            console.log('Default playlist activated');
            break;
          case 'no_content':
            console.log('No content to display');
            this.showNoContentScreen();
            break;
        }
      });
    }
    
    // Set up content downloader progress tracking
    if (this.contentDownloader) {
      this.contentDownloader.setProgressCallback((progress) => {
        if (progress.progress > 0) {
          console.log(`Download progress: ${progress.mediaItem.name} - ${Math.round(progress.progress)}%`);
        }
      });
    }
  }

  async startMediaPlayback() {
    console.log('Starting media playback system...');
    
    if (this.scheduleManager) {
      // Load all schedules and start the scheduler
      const scheduleCount = await this.scheduleManager.loadSchedules();
      console.log(`Loaded ${scheduleCount} schedules`);
      
      // Set up default playlist if no schedules are active
      // This could be a fallback playlist or just show pairing screen
    } else {
      console.error('Schedule manager not initialized');
    }
  }

  async showNoContentScreen() {
    try {
      // Stop any current playback
      await this.stopCurrentMedia();
      
      // Create a simple "no content" image
      const noContentPath = await this.createNoContentImage();
      
      // Display it using fbi
      if (noContentPath) {
        currentMediaProcess = spawn('fbi', [
          '-d', config.system.framebufferDevice || '/dev/fb0',
          '-T', '1',
          '-noverbose',
          '-a',
          noContentPath
        ], {
          stdio: 'ignore',
          detached: false
        });
      }
      
    } catch (error) {
      console.error('Error showing no content screen:', error);
    }
  }

  async createNoContentImage() {
    try {
      const imagePath = path.join(CONTENT_PATH, 'no-content.png');
      
      const command = `convert -size ${displayInfo.width}x${displayInfo.height} xc:black ` +
        `-fill white -gravity center ` +
        `-pointsize 120 -annotate +0-100 "MESOPHY DIGITAL SIGNAGE" ` +
        `-pointsize 80 -annotate +0+50 "No Content Scheduled" ` +
        `-pointsize 60 -annotate +0+150 "Content will appear when scheduled" ` +
        `"${imagePath}"`;
      
      await this.execCommand(command);
      return imagePath;
    } catch (error) {
      console.error('Failed to create no content image:', error);
      return null;
    }
  }

  async stopCurrentMedia() {
    if (currentMediaProcess) {
      try {
        currentMediaProcess.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!currentMediaProcess.killed) {
          currentMediaProcess.kill('SIGKILL');
        }
      } catch (error) {
        console.error('Error stopping media process:', error);
      }
      currentMediaProcess = null;
    }
  }

  async saveSchedule(schedule) {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`INSERT OR REPLACE INTO schedules 
        (id, name, playlist_id, start_time, end_time, days_of_week, priority, data) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      stmt.run(
        schedule.id,
        schedule.name,
        schedule.playlist?.id,
        schedule.start_time,
        schedule.end_time,
        JSON.stringify(schedule.days_of_week),
        schedule.priority,
        JSON.stringify(schedule)
      );
      stmt.finalize((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async logSync(syncType, success, message) {
    return new Promise((resolve) => {
      const stmt = db.prepare('INSERT INTO sync_log (sync_type, success, message) VALUES (?, ?, ?)');
      stmt.run(syncType, success, message);
      stmt.finalize(() => resolve());
    });
  }

  // This method is now handled by the ContentDownloader class
  // Left here for backward compatibility if needed
  async downloadPlaylistMedia(playlist) {
    if (this.contentDownloader && deviceConfig?.device_token) {
      return await this.contentDownloader.downloadPlaylistMedia(playlist, deviceConfig.device_token);
    } else {
      console.warn('Content downloader not available or device not configured');
      return { success: false, error: 'Content downloader not available' };
    }
  }
}

// Main execution
async function main() {
  const daemon = new MediaDaemon();
  await daemon.start();
}

// Start the daemon
if (require.main === module) {
  main().catch(console.error);
}

module.exports = MediaDaemon;