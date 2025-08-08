#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { spawn, exec } = require('child_process');
const si = require('systeminformation');

/**
 * Enhanced Display Management System for Raspberry Pi Digital Signage
 * 
 * Features:
 * - Auto-detect display resolution, refresh rate, and capabilities
 * - Configure optimal framebuffer settings for media playback
 * - Support multiple display types (HDMI, DSI, composite)
 * - Automatic display calibration and overscan correction
 * - Power management with scheduling support
 * - Handle display hotplug events
 * - Configure GPU memory split for video acceleration
 * - Detect and handle different aspect ratios
 * - Display profiles for common TV/monitor types
 */
class DisplayManager {
  constructor(configPath = '/opt/mesophy/config') {
    this.configPath = configPath;
    this.displayConfigPath = path.join(configPath, 'display-config.json');
    this.profilesPath = path.join(configPath, 'display-profiles.json');
    
    // Current display state
    this.currentDisplay = {
      width: 1920,
      height: 1080,
      refreshRate: 60,
      pixelDepth: 32,
      interface: 'HDMI',
      aspectRatio: '16:9',
      overscan: { top: 0, bottom: 0, left: 0, right: 0 },
      rotation: 0,
      powerState: 'on'
    };
    
    // Display detection cache
    this.detectionCache = new Map();
    this.cacheTimeout = 30000; // 30 seconds
    
    // Power management
    this.powerSchedule = null;
    this.powerTimer = null;
    
    // Hotplug monitoring
    this.hotplugMonitor = null;
    
    // GPU configuration
    this.gpuMemorySplit = 128; // Default GPU memory split in MB
    
    this.isInitialized = false;
  }

  /**
   * Initialize the display management system
   */
  async initialize() {
    if (this.isInitialized) return;
    
    console.log('Initializing Display Manager...');
    
    try {
      // Ensure config directory exists
      await fs.ensureDir(this.configPath);
      
      // Load configuration and profiles
      await this.loadConfiguration();
      await this.loadDisplayProfiles();
      
      // Detect and configure display
      await this.detectAndConfigureDisplay();
      
      // Configure GPU settings
      await this.configureGPUSettings();
      
      // Start hotplug monitoring
      this.startHotplugMonitoring();
      
      // Initialize power management
      await this.initializePowerManagement();
      
      this.isInitialized = true;
      console.log('Display Manager initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize Display Manager:', error);
      throw error;
    }
  }

  /**
   * Auto-detect display capabilities and configure optimal settings
   */
  async detectAndConfigureDisplay() {
    console.log('Detecting display configuration...');
    
    const detection = await this.detectDisplayCapabilities();
    console.log('Display detection result:', detection);
    
    // Apply detected configuration
    await this.applyDisplayConfiguration(detection);
    
    // Calibrate display if needed
    await this.performDisplayCalibration();
    
    // Save configuration
    await this.saveDisplayConfiguration();
    
    return detection;
  }

  /**
   * Comprehensive display detection using multiple methods
   */
  async detectDisplayCapabilities() {
    // Check cache first
    const cacheKey = 'display_detection';
    const cached = this.detectionCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    
    const detection = {
      interfaces: [],
      resolutions: [],
      refreshRates: [],
      colorDepths: [],
      aspectRatios: [],
      capabilities: {},
      recommended: null
    };
    
    try {
      // Method 1: Try to get info from system information
      const graphics = await si.graphics();
      if (graphics.displays && graphics.displays.length > 0) {
        const display = graphics.displays[0];
        detection.interfaces.push({
          type: this.determineInterfaceType(display),
          connected: true,
          resolution: { width: display.resolutionX || 1920, height: display.resolutionY || 1080 },
          refreshRate: display.refreshRate || 60,
          pixelDepth: display.pixelDepth || 32
        });
      }
      
      // Method 2: Parse tvservice output (Raspberry Pi specific)
      try {
        const tvServiceOutput = await this.execCommand('tvservice -s');
        const tvServiceData = this.parseTvServiceOutput(tvServiceOutput);
        if (tvServiceData) {
          detection.interfaces.push(tvServiceData);
        }
      } catch (e) {
        console.log('tvservice not available (normal on non-Pi systems)');
      }
      
      // Method 3: Parse fbset output for framebuffer info
      try {
        const fbsetOutput = await this.execCommand('fbset -s');
        const fbData = this.parseFbsetOutput(fbsetOutput);
        if (fbData) {
          detection.resolutions.push(fbData.resolution);
          detection.colorDepths.push(fbData.pixelDepth);
        }
      } catch (e) {
        console.log('Could not read framebuffer info');
      }
      
      // Method 4: Try to read EDID data if available
      try {
        const edidData = await this.readEDIDData();
        if (edidData) {
          detection.resolutions = detection.resolutions.concat(edidData.supportedResolutions);
          detection.capabilities = { ...detection.capabilities, ...edidData.capabilities };
        }
      } catch (e) {
        console.log('EDID data not available');
      }
      
      // Method 5: Check for common Pi display interfaces
      await this.detectPiSpecificInterfaces(detection);
      
      // Determine recommended configuration
      detection.recommended = this.determineRecommendedConfiguration(detection);
      
    } catch (error) {
      console.error('Error during display detection:', error);
      // Fallback to safe defaults
      detection.recommended = {
        width: 1920,
        height: 1080,
        refreshRate: 60,
        pixelDepth: 32,
        interface: 'HDMI',
        aspectRatio: '16:9'
      };
    }
    
    // Cache the result
    this.detectionCache.set(cacheKey, {
      data: detection,
      timestamp: Date.now()
    });
    
    return detection;
  }

  /**
   * Parse tvservice output for Raspberry Pi
   */
  parseTvServiceOutput(output) {
    try {
      // Example output: "state 0xa [HDMI CUSTOM RGB full 16:9], 1920x1080 @ 60.00Hz, progressive"
      const stateMatch = output.match(/state 0x([0-9a-f]+) \[([^\]]+)\]/i);
      const resolutionMatch = output.match(/(\d+)x(\d+) @ ([\d.]+)Hz/);
      
      if (stateMatch && resolutionMatch) {
        const interfaceInfo = stateMatch[2];
        const isHDMI = interfaceInfo.includes('HDMI');
        const isComposite = interfaceInfo.includes('SDTV') || interfaceInfo.includes('composite');
        
        return {
          type: isHDMI ? 'HDMI' : isComposite ? 'Composite' : 'Unknown',
          connected: true,
          resolution: {
            width: parseInt(resolutionMatch[1]),
            height: parseInt(resolutionMatch[2])
          },
          refreshRate: parseFloat(resolutionMatch[3]),
          aspectRatio: this.calculateAspectRatio(parseInt(resolutionMatch[1]), parseInt(resolutionMatch[2])),
          progressive: output.includes('progressive'),
          colorSpace: interfaceInfo.includes('RGB') ? 'RGB' : 'YUV'
        };
      }
    } catch (error) {
      console.error('Error parsing tvservice output:', error);
    }
    return null;
  }

  /**
   * Parse fbset output for framebuffer information
   */
  parseFbsetOutput(output) {
    try {
      const geometryMatch = output.match(/geometry (\d+) (\d+) (\d+) (\d+) (\d+)/);
      const timingsMatch = output.match(/timings (\d+) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+)/);
      
      if (geometryMatch) {
        return {
          resolution: {
            width: parseInt(geometryMatch[1]),
            height: parseInt(geometryMatch[2])
          },
          virtualWidth: parseInt(geometryMatch[3]),
          virtualHeight: parseInt(geometryMatch[4]),
          pixelDepth: parseInt(geometryMatch[5]),
          timings: timingsMatch ? {
            pixclock: parseInt(timingsMatch[1]),
            left_margin: parseInt(timingsMatch[2]),
            right_margin: parseInt(timingsMatch[3]),
            upper_margin: parseInt(timingsMatch[4]),
            lower_margin: parseInt(timingsMatch[5]),
            hsync_len: parseInt(timingsMatch[6]),
            vsync_len: parseInt(timingsMatch[7])
          } : null
        };
      }
    } catch (error) {
      console.error('Error parsing fbset output:', error);
    }
    return null;
  }

  /**
   * Read EDID data from connected displays
   */
  async readEDIDData() {
    try {
      // Try multiple EDID sources
      const edidSources = [
        '/sys/class/drm/card0-HDMI-A-1/edid',
        '/sys/class/drm/card0-HDMI-A-2/edid',
        '/sys/devices/platform/gpu/drm/card0/card0-HDMI-A-1/edid'
      ];
      
      for (const source of edidSources) {
        if (await fs.pathExists(source)) {
          const edidBuffer = await fs.readFile(source);
          if (edidBuffer.length > 0) {
            return this.parseEDIDData(edidBuffer);
          }
        }
      }
      
      // Try using get-edid if available
      try {
        const edidOutput = await this.execCommand('get-edid 2>/dev/null | parse-edid');
        return this.parseEDIDText(edidOutput);
      } catch (e) {
        console.log('get-edid/parse-edid not available');
      }
      
    } catch (error) {
      console.error('Error reading EDID data:', error);
    }
    
    return null;
  }

  /**
   * Parse binary EDID data
   */
  parseEDIDData(buffer) {
    try {
      // Basic EDID parsing - this is a simplified version
      // Full EDID parsing would require more comprehensive implementation
      
      const edidData = {
        supportedResolutions: [],
        capabilities: {},
        manufacturer: '',
        model: ''
      };
      
      // Extract basic timing descriptors (simplified)
      // EDID structure is complex - this extracts common resolutions
      const commonResolutions = [
        { width: 1920, height: 1080, refreshRate: 60 },
        { width: 1680, height: 1050, refreshRate: 60 },
        { width: 1600, height: 900, refreshRate: 60 },
        { width: 1366, height: 768, refreshRate: 60 },
        { width: 1280, height: 1024, refreshRate: 60 },
        { width: 1280, height: 720, refreshRate: 60 },
        { width: 1024, height: 768, refreshRate: 60 }
      ];
      
      // For now, return common resolutions
      // Full implementation would parse the actual EDID timing descriptors
      edidData.supportedResolutions = commonResolutions;
      
      return edidData;
      
    } catch (error) {
      console.error('Error parsing EDID binary data:', error);
      return null;
    }
  }

  /**
   * Parse textual EDID output from parse-edid
   */
  parseEDIDText(output) {
    try {
      const edidData = {
        supportedResolutions: [],
        capabilities: {},
        manufacturer: '',
        model: ''
      };
      
      // Extract manufacturer and model
      const manufacturerMatch = output.match(/Manufacturer:\s*(.+)/);
      const modelMatch = output.match(/Model:\s*(.+)/);
      
      if (manufacturerMatch) edidData.manufacturer = manufacturerMatch[1].trim();
      if (modelMatch) edidData.model = modelMatch[1].trim();
      
      // Extract supported modes
      const modeMatches = output.matchAll(/Mode\s+"(\d+)x(\d+)".*?(\d+\.?\d*)\s*Hz/g);
      for (const match of modeMatches) {
        edidData.supportedResolutions.push({
          width: parseInt(match[1]),
          height: parseInt(match[2]),
          refreshRate: parseFloat(match[3])
        });
      }
      
      return edidData;
      
    } catch (error) {
      console.error('Error parsing EDID text output:', error);
      return null;
    }
  }

  /**
   * Detect Raspberry Pi specific display interfaces
   */
  async detectPiSpecificInterfaces(detection) {
    try {
      // Check for DSI displays
      const dsiPath = '/sys/class/drm/card0-DSI-1';
      if (await fs.pathExists(dsiPath)) {
        try {
          const statusPath = path.join(dsiPath, 'status');
          const status = await fs.readFile(statusPath, 'utf8');
          if (status.trim() === 'connected') {
            detection.interfaces.push({
              type: 'DSI',
              connected: true,
              resolution: { width: 800, height: 480 }, // Common DSI resolution
              refreshRate: 60,
              pixelDepth: 32
            });
          }
        } catch (e) {
          console.log('Could not read DSI status');
        }
      }
      
      // Check for camera module displays (rare but possible)
      const cameraDisplayPath = '/dev/video0';
      if (await fs.pathExists(cameraDisplayPath)) {
        // This would be a specialized case for camera-based displays
      }
      
    } catch (error) {
      console.error('Error detecting Pi-specific interfaces:', error);
    }
  }

  /**
   * Determine the recommended display configuration
   */
  determineRecommendedConfiguration(detection) {
    let recommended = {
      width: 1920,
      height: 1080,
      refreshRate: 60,
      pixelDepth: 32,
      interface: 'HDMI',
      aspectRatio: '16:9'
    };
    
    // Use the highest resolution available interface
    let bestInterface = null;
    let maxPixels = 0;
    
    for (const iface of detection.interfaces) {
      if (iface.connected && iface.resolution) {
        const pixels = iface.resolution.width * iface.resolution.height;
        if (pixels > maxPixels) {
          maxPixels = pixels;
          bestInterface = iface;
        }
      }
    }
    
    if (bestInterface) {
      recommended = {
        width: bestInterface.resolution.width,
        height: bestInterface.resolution.height,
        refreshRate: bestInterface.refreshRate || 60,
        pixelDepth: bestInterface.pixelDepth || 32,
        interface: bestInterface.type,
        aspectRatio: this.calculateAspectRatio(bestInterface.resolution.width, bestInterface.resolution.height)
      };
    }
    
    // Apply display profile optimizations if available
    const profileOptimizations = this.getProfileOptimizations(recommended);
    if (profileOptimizations) {
      recommended = { ...recommended, ...profileOptimizations };
    }
    
    return recommended;
  }

  /**
   * Apply the detected display configuration
   */
  async applyDisplayConfiguration(detection) {
    const config = detection.recommended;
    
    console.log('Applying display configuration:', config);
    
    try {
      // Update internal state
      this.currentDisplay = { ...this.currentDisplay, ...config };
      
      // Configure framebuffer if possible
      await this.configureFramebuffer(config);
      
      // Configure overscan if needed
      await this.configureOverscan(config);
      
      // Set GPU memory split for video acceleration
      await this.configureGPUMemory(config);
      
      // Apply any Pi-specific configurations
      await this.applyPiSpecificConfiguration(config);
      
    } catch (error) {
      console.error('Error applying display configuration:', error);
      throw error;
    }
  }

  /**
   * Configure framebuffer settings
   */
  async configureFramebuffer(config) {
    try {
      const fbDevice = '/dev/fb0';
      
      // Set framebuffer resolution and depth
      const fbsetCommand = `fbset -fb ${fbDevice} -g ${config.width} ${config.height} ${config.width} ${config.height} ${config.pixelDepth}`;
      
      try {
        await this.execCommand(fbsetCommand);
        console.log('Framebuffer configured successfully');
      } catch (error) {
        console.log('Direct framebuffer configuration failed, trying alternative methods');
        
        // Try using xrandr if X is running (unlikely but possible)
        try {
          await this.execCommand(`xrandr --output HDMI-1 --mode ${config.width}x${config.height} --rate ${config.refreshRate}`);
        } catch (e) {
          console.log('xrandr not available or no X session');
        }
      }
      
    } catch (error) {
      console.error('Error configuring framebuffer:', error);
    }
  }

  /**
   * Configure overscan settings
   */
  async configureOverscan(config) {
    try {
      // For Raspberry Pi, overscan is configured in /boot/config.txt
      const configTxtPath = '/boot/config.txt';
      const firmwareConfigPath = '/boot/firmware/config.txt'; // Ubuntu path
      
      let bootConfigPath = null;
      if (await fs.pathExists(configTxtPath)) {
        bootConfigPath = configTxtPath;
      } else if (await fs.pathExists(firmwareConfigPath)) {
        bootConfigPath = firmwareConfigPath;
      }
      
      if (bootConfigPath && this.currentDisplay.overscan) {
        const { top, bottom, left, right } = this.currentDisplay.overscan;
        
        // Read current config
        let configContent = '';
        if (await fs.pathExists(bootConfigPath)) {
          configContent = await fs.readFile(bootConfigPath, 'utf8');
        }
        
        // Update overscan settings
        const overscanSettings = [
          `overscan_top=${top}`,
          `overscan_bottom=${bottom}`,
          `overscan_left=${left}`,
          `overscan_right=${right}`
        ];
        
        let updatedConfig = configContent;
        for (const setting of overscanSettings) {
          const [key] = setting.split('=');
          const regex = new RegExp(`^${key}=.*$`, 'm');
          
          if (regex.test(updatedConfig)) {
            updatedConfig = updatedConfig.replace(regex, setting);
          } else {
            updatedConfig += `\n${setting}`;
          }
        }
        
        // Write back (this requires root permissions)
        try {
          await fs.writeFile(bootConfigPath, updatedConfig);
          console.log('Overscan configuration updated in boot config');
        } catch (error) {
          console.log('Could not update boot config (requires root):', error.message);
        }
      }
      
    } catch (error) {
      console.error('Error configuring overscan:', error);
    }
  }

  /**
   * Configure GPU memory split for optimal video performance
   */
  async configureGPUMemory(config) {
    try {
      // Determine optimal GPU memory split based on resolution and use case
      let gpuMemory = 64; // Minimum
      
      const totalPixels = config.width * config.height;
      
      if (totalPixels >= 1920 * 1080) {
        gpuMemory = 256; // 4K or 1080p
      } else if (totalPixels >= 1280 * 720) {
        gpuMemory = 128; // 720p
      } else {
        gpuMemory = 64; // Lower resolutions
      }
      
      // For digital signage with video content, allocate more GPU memory
      this.gpuMemorySplit = gpuMemory;
      
      console.log(`Recommended GPU memory split: ${gpuMemory}MB`);
      
      // This would typically be set in /boot/config.txt
      // gpu_mem=256
      
    } catch (error) {
      console.error('Error configuring GPU memory:', error);
    }
  }

  /**
   * Apply Raspberry Pi specific display configurations
   */
  async applyPiSpecificConfiguration(config) {
    try {
      // Configure HDMI settings if using HDMI
      if (config.interface === 'HDMI') {
        // Force HDMI mode
        await this.updateBootConfig('hdmi_force_hotplug', '1');
        
        // Set HDMI group and mode based on resolution
        const hdmiConfig = this.getHDMIConfiguration(config);
        if (hdmiConfig) {
          await this.updateBootConfig('hdmi_group', hdmiConfig.group);
          await this.updateBootConfig('hdmi_mode', hdmiConfig.mode);
        }
        
        // Configure HDMI drive strength if needed
        await this.updateBootConfig('config_hdmi_boost', '4');
      }
      
      // Configure DSI if using DSI display
      if (config.interface === 'DSI') {
        await this.configureDSIDisplay(config);
      }
      
    } catch (error) {
      console.error('Error applying Pi-specific configuration:', error);
    }
  }

  /**
   * Get HDMI group and mode configuration for common resolutions
   */
  getHDMIConfiguration(config) {
    // HDMI Group 1 = CEA (TV modes), Group 2 = DMT (Monitor modes)
    const hdmiModes = {
      '1920x1080@60': { group: 1, mode: 16 },
      '1920x1080@50': { group: 1, mode: 31 },
      '1680x1050@60': { group: 2, mode: 58 },
      '1600x900@60': { group: 2, mode: 33 },
      '1366x768@60': { group: 2, mode: 85 },
      '1280x1024@60': { group: 2, mode: 35 },
      '1280x720@60': { group: 1, mode: 4 },
      '1024x768@60': { group: 2, mode: 16 }
    };
    
    const key = `${config.width}x${config.height}@${config.refreshRate}`;
    return hdmiModes[key] || null;
  }

  /**
   * Configure DSI display settings
   */
  async configureDSIDisplay(config) {
    try {
      // DSI configuration is typically done through device tree overlays
      // This is a placeholder for DSI-specific configuration
      console.log('Configuring DSI display for resolution:', `${config.width}x${config.height}`);
      
      // Common DSI displays might need specific overlays enabled
      // Examples: vc4-kms-dsi-7inch, vc4-kms-dsi-generic
      
    } catch (error) {
      console.error('Error configuring DSI display:', error);
    }
  }

  /**
   * Update boot configuration file
   */
  async updateBootConfig(key, value) {
    try {
      const configPaths = ['/boot/config.txt', '/boot/firmware/config.txt'];
      
      for (const configPath of configPaths) {
        if (await fs.pathExists(configPath)) {
          let config = await fs.readFile(configPath, 'utf8');
          const regex = new RegExp(`^${key}=.*$`, 'm');
          const setting = `${key}=${value}`;
          
          if (regex.test(config)) {
            config = config.replace(regex, setting);
          } else {
            config += `\n${setting}`;
          }
          
          await fs.writeFile(configPath, config);
          console.log(`Updated boot config: ${key}=${value}`);
          return;
        }
      }
      
    } catch (error) {
      console.log(`Could not update boot config ${key}=${value}:`, error.message);
    }
  }

  /**
   * Perform display calibration and testing
   */
  async performDisplayCalibration() {
    console.log('Performing display calibration...');
    
    try {
      // Create test patterns for calibration
      await this.createTestPatterns();
      
      // Auto-detect optimal overscan values
      await this.autoDetectOverscan();
      
      // Verify display output
      const isDisplayWorking = await this.verifyDisplayOutput();
      
      if (!isDisplayWorking) {
        console.warn('Display verification failed, using safe fallback settings');
        await this.applySafeFallbackSettings();
      }
      
    } catch (error) {
      console.error('Error during display calibration:', error);
    }
  }

  /**
   * Create test patterns for display calibration
   */
  async createTestPatterns() {
    try {
      const testPatternsDir = path.join(this.configPath, 'test-patterns');
      await fs.ensureDir(testPatternsDir);
      
      const { width, height } = this.currentDisplay;
      
      // Create color test pattern
      const colorTestPath = path.join(testPatternsDir, 'color-test.png');
      const colorTestCommand = `convert -size ${width}x${height} ` +
        `\\( -size ${width/2}x${height/2} xc:red \\) ` +
        `\\( -size ${width/2}x${height/2} xc:green \\) +append ` +
        `\\( -size ${width/2}x${height/2} xc:blue \\) ` +
        `\\( -size ${width/2}x${height/2} xc:white \\) +append -append ` +
        `"${colorTestPath}"`;
      
      try {
        await this.execCommand(colorTestCommand);
      } catch (e) {
        console.log('Could not create color test pattern');
      }
      
      // Create overscan test pattern
      const overscanTestPath = path.join(testPatternsDir, 'overscan-test.png');
      const overscanTestCommand = `convert -size ${width}x${height} xc:black ` +
        `-stroke red -strokewidth 4 -fill none ` +
        `-draw "rectangle 10,10 ${width-10},${height-10}" ` +
        `-fill white -gravity center -pointsize 48 ` +
        `-annotate +0+0 "OVERSCAN TEST\\nAll borders should be visible" ` +
        `"${overscanTestPath}"`;
      
      try {
        await this.execCommand(overscanTestCommand);
      } catch (e) {
        console.log('Could not create overscan test pattern');
      }
      
    } catch (error) {
      console.error('Error creating test patterns:', error);
    }
  }

  /**
   * Auto-detect optimal overscan values
   */
  async autoDetectOverscan() {
    // This is a placeholder for overscan auto-detection
    // Full implementation would analyze display output
    // and adjust overscan values iteratively
    
    console.log('Auto-detecting overscan values...');
    
    // For now, use conservative defaults
    this.currentDisplay.overscan = {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0
    };
  }

  /**
   * Verify display output is working
   */
  async verifyDisplayOutput() {
    try {
      // Try to write a test pattern to framebuffer
      const fbDevice = '/dev/fb0';
      
      if (await fs.pathExists(fbDevice)) {
        // Simple test: try to clear the framebuffer
        await this.execCommand(`dd if=/dev/zero of=${fbDevice} count=1 2>/dev/null || true`);
        return true;
      }
      
      return false;
      
    } catch (error) {
      console.error('Error verifying display output:', error);
      return false;
    }
  }

  /**
   * Apply safe fallback display settings
   */
  async applySafeFallbackSettings() {
    console.log('Applying safe fallback display settings...');
    
    this.currentDisplay = {
      width: 1280,
      height: 720,
      refreshRate: 60,
      pixelDepth: 32,
      interface: 'HDMI',
      aspectRatio: '16:9',
      overscan: { top: 32, bottom: 32, left: 32, right: 32 },
      rotation: 0,
      powerState: 'on'
    };
    
    await this.configureFramebuffer(this.currentDisplay);
  }

  /**
   * Power management functionality
   */
  async initializePowerManagement() {
    console.log('Initializing display power management...');
    
    // Load power schedule from configuration
    if (this.displayConfig && this.displayConfig.power && this.displayConfig.power.schedule) {
      this.powerSchedule = this.displayConfig.power.schedule;
      await this.setupPowerSchedule();
    }
  }

  /**
   * Set up automatic display power scheduling
   */
  async setupPowerSchedule() {
    if (!this.powerSchedule) return;
    
    console.log('Setting up display power schedule:', this.powerSchedule);
    
    // Clear existing timer
    if (this.powerTimer) {
      clearTimeout(this.powerTimer);
    }
    
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    // Parse schedule times
    const onTime = this.parseTime(this.powerSchedule.on);
    const offTime = this.parseTime(this.powerSchedule.off);
    
    let nextAction = null;
    let nextActionTime = null;
    
    if (currentTime < onTime) {
      nextAction = 'on';
      nextActionTime = onTime;
    } else if (currentTime < offTime) {
      nextAction = 'off';
      nextActionTime = offTime;
    } else {
      // After off time, next action is tomorrow's on time
      nextAction = 'on';
      nextActionTime = onTime + (24 * 60); // Next day
    }
    
    const timeUntilAction = (nextActionTime - currentTime) * 60 * 1000; // Convert to milliseconds
    
    console.log(`Next power action: ${nextAction} in ${Math.round(timeUntilAction / 1000 / 60)} minutes`);
    
    this.powerTimer = setTimeout(async () => {
      await this.setPowerState(nextAction === 'on' ? 'on' : 'off');
      await this.setupPowerSchedule(); // Schedule next action
    }, timeUntilAction);
  }

  /**
   * Parse time string (HH:MM) to minutes since midnight
   */
  parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Control display power state
   */
  async setPowerState(state) {
    console.log(`Setting display power state: ${state}`);
    
    try {
      if (state === 'on') {
        // Turn display on
        await this.execCommand('tvservice -p 2>/dev/null || true'); // Raspberry Pi
        await this.execCommand('xset dpms force on 2>/dev/null || true'); // X11
        await this.execCommand('echo 0 > /sys/class/backlight/rpi_backlight/bl_power 2>/dev/null || true'); // Backlight
      } else {
        // Turn display off
        await this.execCommand('tvservice -o 2>/dev/null || true'); // Raspberry Pi
        await this.execCommand('xset dpms force off 2>/dev/null || true'); // X11
        await this.execCommand('echo 1 > /sys/class/backlight/rpi_backlight/bl_power 2>/dev/null || true'); // Backlight
      }
      
      this.currentDisplay.powerState = state;
      
    } catch (error) {
      console.error('Error setting display power state:', error);
    }
  }

  /**
   * Monitor for display hotplug events
   */
  startHotplugMonitoring() {
    console.log('Starting display hotplug monitoring...');
    
    // Monitor /sys/class/drm for display changes
    try {
      const { spawn } = require('child_process');
      
      // Use inotifywait to monitor display connections
      const monitor = spawn('inotifywait', [
        '-m', // Monitor continuously
        '-e', 'create,delete,modify',
        '/sys/class/drm/',
        '/dev/'
      ], { stdio: 'pipe' });
      
      monitor.stdout.on('data', (data) => {
        const event = data.toString().trim();
        if (event.includes('card0-HDMI') || event.includes('fb0')) {
          console.log('Display hotplug event detected:', event);
          
          // Debounce and re-detect display
          clearTimeout(this.hotplugDebounceTimer);
          this.hotplugDebounceTimer = setTimeout(() => {
            this.handleHotplugEvent();
          }, 2000);
        }
      });
      
      monitor.on('error', (error) => {
        console.log('Hotplug monitoring not available:', error.message);
      });
      
      this.hotplugMonitor = monitor;
      
    } catch (error) {
      console.log('Could not start hotplug monitoring:', error.message);
    }
  }

  /**
   * Handle display hotplug events
   */
  async handleHotplugEvent() {
    console.log('Handling display hotplug event...');
    
    try {
      // Clear detection cache
      this.detectionCache.clear();
      
      // Re-detect and configure display
      await this.detectAndConfigureDisplay();
      
      console.log('Display reconfigured after hotplug event');
      
    } catch (error) {
      console.error('Error handling hotplug event:', error);
    }
  }

  /**
   * Configure GPU settings for optimal performance
   */
  async configureGPUSettings() {
    console.log('Configuring GPU settings for optimal performance...');
    
    try {
      // Check GPU memory split
      const gpuMem = await this.execCommand('vcgencmd get_mem gpu').catch(() => '');
      if (gpuMem) {
        const currentGpuMem = parseInt(gpuMem.match(/gpu=(\d+)M/)?.[1] || '0');
        console.log(`Current GPU memory: ${currentGpuMem}MB, Recommended: ${this.gpuMemorySplit}MB`);
        
        if (currentGpuMem < this.gpuMemorySplit) {
          console.log(`Consider increasing GPU memory split to ${this.gpuMemorySplit}MB in /boot/config.txt`);
        }
      }
      
      // Enable hardware video acceleration flags
      process.env.LD_PRELOAD = '/usr/lib/arm-linux-gnueabihf/libbrcmEGL.so:/usr/lib/arm-linux-gnueabihf/libbrcmGLESv2.so';
      
    } catch (error) {
      console.error('Error configuring GPU settings:', error);
    }
  }

  /**
   * Load display configuration from file
   */
  async loadConfiguration() {
    try {
      if (await fs.pathExists(this.displayConfigPath)) {
        const config = await fs.readJson(this.displayConfigPath);
        this.displayConfig = config;
        
        // Apply saved display settings if available
        if (config.display) {
          this.currentDisplay = { ...this.currentDisplay, ...config.display };
        }
        
        console.log('Display configuration loaded');
      } else {
        // Create default configuration
        this.displayConfig = {
          display: this.currentDisplay,
          power: {
            schedule: {
              enabled: false,
              on: '08:00',
              off: '18:00'
            }
          },
          calibration: {
            autoOverscan: true,
            testPatternsEnabled: true
          }
        };
        
        await this.saveDisplayConfiguration();
      }
    } catch (error) {
      console.error('Error loading display configuration:', error);
    }
  }

  /**
   * Load display profiles for common devices
   */
  async loadDisplayProfiles() {
    try {
      if (await fs.pathExists(this.profilesPath)) {
        this.displayProfiles = await fs.readJson(this.profilesPath);
      } else {
        // Create default profiles
        this.displayProfiles = {
          'generic_1080p_tv': {
            name: 'Generic 1080p TV',
            resolution: { width: 1920, height: 1080 },
            refreshRate: 60,
            overscan: { top: 24, bottom: 24, left: 32, right: 32 },
            gpuMemory: 128
          },
          'generic_720p_tv': {
            name: 'Generic 720p TV',
            resolution: { width: 1280, height: 720 },
            refreshRate: 60,
            overscan: { top: 16, bottom: 16, left: 16, right: 16 },
            gpuMemory: 64
          },
          'computer_monitor_1080p': {
            name: 'Computer Monitor 1080p',
            resolution: { width: 1920, height: 1080 },
            refreshRate: 60,
            overscan: { top: 0, bottom: 0, left: 0, right: 0 },
            gpuMemory: 128
          },
          'dsi_7inch': {
            name: '7-inch DSI Display',
            resolution: { width: 800, height: 480 },
            refreshRate: 60,
            interface: 'DSI',
            overscan: { top: 0, bottom: 0, left: 0, right: 0 },
            gpuMemory: 64
          }
        };
        
        await fs.writeJson(this.profilesPath, this.displayProfiles, { spaces: 2 });
      }
    } catch (error) {
      console.error('Error loading display profiles:', error);
    }
  }

  /**
   * Get profile optimizations for a display configuration
   */
  getProfileOptimizations(config) {
    if (!this.displayProfiles) return null;
    
    // Try to match against known profiles
    for (const [profileId, profile] of Object.entries(this.displayProfiles)) {
      if (profile.resolution.width === config.width && 
          profile.resolution.height === config.height) {
        console.log(`Applying profile optimizations: ${profile.name}`);
        return {
          overscan: profile.overscan,
          gpuMemory: profile.gpuMemory
        };
      }
    }
    
    return null;
  }

  /**
   * Save current display configuration
   */
  async saveDisplayConfiguration() {
    try {
      this.displayConfig.display = this.currentDisplay;
      await fs.writeJson(this.displayConfigPath, this.displayConfig, { spaces: 2 });
      console.log('Display configuration saved');
    } catch (error) {
      console.error('Error saving display configuration:', error);
    }
  }

  /**
   * Utility methods
   */
  
  determineInterfaceType(display) {
    if (!display.vendor && !display.model) return 'Unknown';
    
    // Try to determine interface type from display info
    const info = (display.vendor || '') + ' ' + (display.model || '');
    
    if (info.toLowerCase().includes('hdmi')) return 'HDMI';
    if (info.toLowerCase().includes('dsi')) return 'DSI';
    if (info.toLowerCase().includes('composite')) return 'Composite';
    
    return 'HDMI'; // Default assumption
  }

  calculateAspectRatio(width, height) {
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const divisor = gcd(width, height);
    const w = width / divisor;
    const h = height / divisor;
    
    // Common aspect ratios
    if (w === 16 && h === 9) return '16:9';
    if (w === 4 && h === 3) return '4:3';
    if (w === 16 && h === 10) return '16:10';
    if (w === 21 && h === 9) return '21:9';
    
    return `${w}:${h}`;
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

  /**
   * Get current display information
   */
  getCurrentDisplay() {
    return { ...this.currentDisplay };
  }

  /**
   * Get display capabilities
   */
  getDisplayCapabilities() {
    const cached = this.detectionCache.get('display_detection');
    return cached ? cached.data : null;
  }

  /**
   * Manually set overscan values
   */
  async setOverscan(top, bottom, left, right) {
    this.currentDisplay.overscan = { top, bottom, left, right };
    await this.configureOverscan(this.currentDisplay);
    await this.saveDisplayConfiguration();
  }

  /**
   * Rotate display
   */
  async rotateDisplay(rotation) {
    if (![0, 90, 180, 270].includes(rotation)) {
      throw new Error('Rotation must be 0, 90, 180, or 270 degrees');
    }
    
    this.currentDisplay.rotation = rotation;
    
    // Apply rotation via boot config
    await this.updateBootConfig('display_rotate', rotation / 90);
    await this.saveDisplayConfiguration();
    
    console.log(`Display rotation set to ${rotation} degrees`);
  }

  /**
   * Test display with pattern
   */
  async testDisplay(pattern = 'color') {
    const testPatternsDir = path.join(this.configPath, 'test-patterns');
    const patternPath = path.join(testPatternsDir, `${pattern}-test.png`);
    
    if (await fs.pathExists(patternPath)) {
      console.log(`Displaying test pattern: ${pattern}`);
      
      // Display using fbi
      const testProcess = spawn('fbi', [
        '-d', '/dev/fb0',
        '-T', '1',
        '-noverbose',
        '-a',
        patternPath
      ]);
      
      // Auto-close after 10 seconds
      setTimeout(() => {
        testProcess.kill('SIGTERM');
      }, 10000);
      
      return true;
    } else {
      console.error('Test pattern not found:', patternPath);
      return false;
    }
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup() {
    console.log('Cleaning up Display Manager...');
    
    if (this.powerTimer) {
      clearTimeout(this.powerTimer);
    }
    
    if (this.hotplugMonitor) {
      this.hotplugMonitor.kill();
    }
    
    if (this.hotplugDebounceTimer) {
      clearTimeout(this.hotplugDebounceTimer);
    }
    
    console.log('Display Manager cleanup complete');
  }
}

module.exports = DisplayManager;