#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { spawn, exec } = require('child_process');
const QRCode = require('qrcode');

/**
 * Advanced Pairing Overlay System for Raspberry Pi Digital Signage
 * 
 * Features:
 * - Direct framebuffer text rendering without browser/GUI dependencies
 * - Large, clear pairing code display with professional styling
 * - QR code generation and display for easier pairing
 * - Animated/pulsing effects to draw attention
 * - Multi-language support for pairing instructions
 * - Automatic screen blanking when paired
 * - Error state display for network issues
 * - Progress indicators for pairing process
 * - Auto-refresh pairing codes when expired
 */
class PairingOverlay {
  constructor(displayManager, configPath = '/opt/mesophy/config') {
    this.displayManager = displayManager;
    this.configPath = configPath;
    this.overlayConfigPath = path.join(configPath, 'pairing-overlay.json');
    
    // Current pairing state
    this.currentCode = null;
    this.codeExpiry = null;
    this.pairingUrl = 'https://mesophy.vercel.app/dashboard/devices/pair';
    this.isDisplayed = false;
    this.isPaired = false;
    
    // Animation state
    this.animationFrame = 0;
    this.animationTimer = null;
    this.pulseTimer = null;
    
    // Display configuration
    this.overlayConfig = {
      theme: {
        backgroundColor: '#000000',
        primaryColor: '#4f46e5',
        secondaryColor: '#6b7280',
        textColor: '#ffffff',
        accentColor: '#10b981',
        errorColor: '#ef4444',
        warningColor: '#f59e0b'
      },
      fonts: {
        titleSize: 120,
        codeSize: 200,
        instructionSize: 60,
        urlSize: 48,
        statusSize: 40
      },
      layout: {
        margin: 80,
        spacing: 60,
        qrCodeSize: 300,
        progressBarHeight: 12
      },
      animations: {
        pulseEnabled: true,
        pulseInterval: 2000,
        fadeEnabled: true,
        progressEnabled: true
      },
      languages: {
        default: 'en',
        available: ['en', 'es', 'fr', 'de']
      },
      autoRefresh: {
        enabled: true,
        interval: 300000, // 5 minutes
        warningTime: 60000 // Warn 1 minute before expiry
      }
    };
    
    // Multi-language strings
    this.strings = {
      en: {
        title: 'MESOPHY DIGITAL SIGNAGE',
        subtitle: 'Device Setup Required',
        instructions: 'Enter this code at:',
        url: 'mesophy.vercel.app',
        orScan: 'Or scan this QR code:',
        connecting: 'Connecting...',
        paired: 'Device Paired Successfully!',
        error: 'Connection Error',
        networkError: 'Check Network Connection',
        codeExpired: 'Code Expired - Generating New Code...',
        progress: 'Pairing Progress'
      },
      es: {
        title: 'MESOPHY SEÑALIZACIÓN DIGITAL',
        subtitle: 'Configuración de Dispositivo Requerida',
        instructions: 'Ingrese este código en:',
        url: 'mesophy.vercel.app',
        orScan: 'O escanee este código QR:',
        connecting: 'Conectando...',
        paired: '¡Dispositivo Emparejado Exitosamente!',
        error: 'Error de Conexión',
        networkError: 'Verificar Conexión de Red',
        codeExpired: 'Código Expirado - Generando Nuevo Código...',
        progress: 'Progreso de Emparejamiento'
      },
      fr: {
        title: 'MESOPHY AFFICHAGE NUMÉRIQUE',
        subtitle: 'Configuration du Périphérique Requise',
        instructions: 'Entrez ce code sur:',
        url: 'mesophy.vercel.app',
        orScan: 'Ou scannez ce code QR:',
        connecting: 'Connexion...',
        paired: 'Périphérique Jumelé avec Succès!',
        error: 'Erreur de Connexion',
        networkError: 'Vérifier la Connexion Réseau',
        codeExpired: 'Code Expiré - Génération Nouveau Code...',
        progress: 'Progrès de Jumelage'
      },
      de: {
        title: 'MESOPHY DIGITALE BESCHILDERUNG',
        subtitle: 'Geräte-Setup Erforderlich',
        instructions: 'Geben Sie diesen Code ein auf:',
        url: 'mesophy.vercel.app',
        orScan: 'Oder scannen Sie diesen QR-Code:',
        connecting: 'Verbindung wird hergestellt...',
        paired: 'Gerät Erfolgreich Gekoppelt!',
        error: 'Verbindungsfehler',
        networkError: 'Netzwerkverbindung Prüfen',
        codeExpired: 'Code Abgelaufen - Generiere Neuen Code...',
        progress: 'Kopplung-Fortschritt'
      }
    };
    
    // Framebuffer info
    this.fbInfo = {
      device: '/dev/fb0',
      width: 1920,
      height: 1080,
      pixelDepth: 32,
      lineLength: null,
      bufferSize: null
    };
    
    // Current overlay state
    this.overlayState = {
      status: 'waiting', // waiting, connecting, paired, error, expired
      progress: 0,
      message: null,
      networkStatus: 'unknown',
      lastUpdate: null
    };
    
    // Generated assets cache
    this.assetsCache = new Map();
    this.assetsCacheDir = path.join(configPath, 'pairing-assets');
  }

  /**
   * Initialize the pairing overlay system
   */
  async initialize() {
    console.log('Initializing Pairing Overlay System...');
    
    try {
      // Ensure directories exist
      await fs.ensureDir(this.assetsCacheDir);
      
      // Load configuration
      await this.loadConfiguration();
      
      // Initialize framebuffer info
      await this.initializeFramebuffer();
      
      // Set up auto-refresh timer
      if (this.overlayConfig.autoRefresh.enabled) {
        this.setupAutoRefresh();
      }
      
      console.log('Pairing Overlay System initialized');
      
    } catch (error) {
      console.error('Failed to initialize Pairing Overlay System:', error);
      throw error;
    }
  }

  /**
   * Display the pairing overlay with the given code
   */
  async showPairingOverlay(pairingCode, expiryTime = null) {
    console.log(`Showing pairing overlay with code: ${pairingCode}`);
    
    try {
      // Update state
      this.currentCode = pairingCode;
      this.codeExpiry = expiryTime || new Date(Date.now() + 300000); // 5 minutes default
      this.overlayState.status = 'waiting';
      this.overlayState.lastUpdate = new Date();
      this.isDisplayed = true;
      
      // Generate the pairing overlay image
      const overlayImagePath = await this.generatePairingOverlay();
      
      // Display the overlay
      await this.displayOverlayImage(overlayImagePath);
      
      // Start animations if enabled
      if (this.overlayConfig.animations.pulseEnabled) {
        this.startPulseAnimation();
      }
      
      // Set up expiry monitoring
      this.setupExpiryMonitoring();
      
    } catch (error) {
      console.error('Error showing pairing overlay:', error);
      await this.showErrorOverlay('Failed to display pairing screen');
    }
  }

  /**
   * Generate the complete pairing overlay image
   */
  async generatePairingOverlay() {
    const cacheKey = `pairing_${this.currentCode}_${this.overlayState.status}_${this.animationFrame}`;
    
    if (this.assetsCache.has(cacheKey)) {
      return this.assetsCache.get(cacheKey);
    }
    
    try {
      const display = this.displayManager.getCurrentDisplay();
      const { width, height } = display;
      
      const overlayPath = path.join(this.assetsCacheDir, `pairing-overlay-${Date.now()}.png`);
      const strings = this.getStrings();
      const theme = this.overlayConfig.theme;
      const fonts = this.overlayConfig.fonts;
      const layout = this.overlayConfig.layout;
      
      // Calculate positions
      const centerX = width / 2;
      let currentY = layout.margin + 100;
      
      // Build ImageMagick command for creating the overlay
      let command = `convert -size ${width}x${height} xc:"${theme.backgroundColor}" `;
      
      // Add subtle gradient background
      command += `-fill "gradient:${theme.backgroundColor}-#1a1a2e" -draw "rectangle 0,0 ${width},${height/3}" `;
      
      // Title
      command += `-fill "${theme.textColor}" -gravity center -font Arial-Bold ` +
        `-pointsize ${fonts.titleSize} -annotate +0+${currentY - height/2} "${strings.title}" `;
      currentY += fonts.titleSize + layout.spacing;
      
      // Subtitle
      command += `-fill "${theme.secondaryColor}" -pointsize ${fonts.instructionSize} ` +
        `-annotate +0+${currentY - height/2} "${strings.subtitle}" `;
      currentY += fonts.instructionSize + layout.spacing * 1.5;
      
      // Pairing code with emphasis
      const pulseColor = this.animationFrame % 2 === 0 ? theme.primaryColor : theme.accentColor;
      command += `-fill "${pulseColor}" -pointsize ${fonts.codeSize} -font Arial-Bold ` +
        `-stroke "${theme.textColor}" -strokewidth 4 ` +
        `-annotate +0+${currentY - height/2} "${this.currentCode}" `;
      currentY += fonts.codeSize + layout.spacing;
      
      // Instructions
      command += `-fill "${theme.textColor}" -pointsize ${fonts.instructionSize} ` +
        `-annotate +0+${currentY - height/2} "${strings.instructions}" `;
      currentY += fonts.instructionSize + layout.spacing * 0.5;
      
      // URL
      command += `-fill "${theme.primaryColor}" -pointsize ${fonts.urlSize} -font Arial-Bold ` +
        `-annotate +0+${currentY - height/2} "${strings.url}" `;
      currentY += fonts.urlSize + layout.spacing * 1.5;
      
      // Add QR code placeholder (we'll composite it separately)
      const qrCodePath = await this.generateQRCode();
      if (qrCodePath) {
        command += ` "(" "${qrCodePath}" -resize ${layout.qrCodeSize}x${layout.qrCodeSize} ")" ` +
          `-geometry +${centerX - layout.qrCodeSize/2}+${currentY} -composite `;
        currentY += layout.qrCodeSize + layout.spacing;
        
        // QR code label
        command += `-fill "${theme.secondaryColor}" -pointsize ${fonts.statusSize} ` +
          `-annotate +0+${currentY - height/2} "${strings.orScan}" `;
        currentY += fonts.statusSize + layout.spacing;
      }
      
      // Status and progress
      if (this.overlayState.status === 'connecting') {
        // Progress bar
        const progressWidth = width * 0.6;
        const progressX = centerX - progressWidth / 2;
        const progressY = currentY;
        
        command += `-fill "${theme.secondaryColor}" -draw "rectangle ${progressX},${progressY} ` +
          `${progressX + progressWidth},${progressY + layout.progressBarHeight}" `;
        
        const fillWidth = progressWidth * (this.overlayState.progress / 100);
        command += `-fill "${theme.accentColor}" -draw "rectangle ${progressX},${progressY} ` +
          `${progressX + fillWidth},${progressY + layout.progressBarHeight}" `;
        
        currentY += layout.progressBarHeight + layout.spacing * 0.5;
        
        command += `-fill "${theme.accentColor}" -pointsize ${fonts.statusSize} ` +
          `-annotate +0+${currentY - height/2} "${strings.connecting} ${Math.round(this.overlayState.progress)}%" `;
      }
      
      // Network status indicator
      const networkColor = this.getNetworkStatusColor();
      const networkY = height - layout.margin - fonts.statusSize;
      command += `-fill "${networkColor}" -pointsize ${fonts.statusSize} ` +
        `-gravity southeast -annotate +${layout.margin}+${layout.margin} "● Network: ${this.overlayState.networkStatus}" `;
      
      // Timestamp
      const timestamp = new Date().toLocaleString();
      command += `-fill "${theme.secondaryColor}" -pointsize ${fonts.statusSize * 0.8} ` +
        `-gravity southwest -annotate +${layout.margin}+${layout.margin} "Last updated: ${timestamp}" `;
      
      // Code expiry warning
      if (this.codeExpiry && this.isCodeExpiringSoon()) {
        const timeLeft = Math.ceil((this.codeExpiry.getTime() - Date.now()) / 1000 / 60);
        command += `-fill "${theme.warningColor}" -pointsize ${fonts.statusSize} ` +
          `-gravity north -annotate +0+${layout.margin} "Code expires in ${timeLeft} minute(s)" `;
      }
      
      // Finalize command
      command += ` "${overlayPath}"`;
      
      // Execute the command
      await this.execCommand(command);
      
      // Cache the result
      this.assetsCache.set(cacheKey, overlayPath);
      
      // Clean up old cache entries
      if (this.assetsCache.size > 20) {
        const oldestKey = this.assetsCache.keys().next().value;
        const oldPath = this.assetsCache.get(oldestKey);
        this.assetsCache.delete(oldestKey);
        try {
          await fs.unlink(oldPath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      
      return overlayPath;
      
    } catch (error) {
      console.error('Error generating pairing overlay:', error);
      throw error;
    }
  }

  /**
   * Generate QR code for the pairing URL
   */
  async generateQRCode() {
    try {
      const qrCodePath = path.join(this.assetsCacheDir, `qr-${this.currentCode}.png`);
      
      // Check if already exists
      if (await fs.pathExists(qrCodePath)) {
        return qrCodePath;
      }
      
      // Generate QR code data
      const qrData = `${this.pairingUrl}?code=${this.currentCode}`;
      
      // Generate QR code using the qrcode library
      await QRCode.toFile(qrCodePath, qrData, {
        color: {
          dark: '#000000',
          light: '#ffffff'
        },
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'M'
      });
      
      console.log('QR code generated:', qrCodePath);
      return qrCodePath;
      
    } catch (error) {
      console.error('Error generating QR code:', error);
      return null;
    }
  }

  /**
   * Display the overlay image on the framebuffer
   */
  async displayOverlayImage(imagePath) {
    try {
      // Method 1: Try using fbi (framebuffer image viewer)
      try {
        const fbiProcess = spawn('fbi', [
          '-d', this.fbInfo.device,
          '-T', '1', // Use terminal 1
          '-noverbose',
          '-a', // Autozoom
          imagePath
        ], {
          stdio: 'ignore',
          detached: false
        });
        
        // Store reference to current process
        this.currentDisplayProcess = fbiProcess;
        
        return;
      } catch (error) {
        console.log('fbi not available, trying alternative method');
      }
      
      // Method 2: Try direct framebuffer write using ImageMagick
      try {
        const display = this.displayManager.getCurrentDisplay();
        const convertCommand = `convert "${imagePath}" -resize ${display.width}x${display.height}! ` +
          `-depth ${display.pixelDepth} RGB:- | dd of="${this.fbInfo.device}" 2>/dev/null`;
        
        await this.execCommand(convertCommand);
        return;
      } catch (error) {
        console.log('Direct framebuffer write failed, trying display method');
      }
      
      // Method 3: Try using display command (if X is available)
      try {
        const displayProcess = spawn('display', [
          '-window', 'root',
          imagePath
        ], {
          stdio: 'ignore',
          detached: false
        });
        
        this.currentDisplayProcess = displayProcess;
        return;
      } catch (error) {
        console.log('X display not available');
      }
      
      throw new Error('No suitable display method available');
      
    } catch (error) {
      console.error('Error displaying overlay image:', error);
      throw error;
    }
  }

  /**
   * Show error overlay
   */
  async showErrorOverlay(errorMessage) {
    console.log('Showing error overlay:', errorMessage);
    
    try {
      this.overlayState.status = 'error';
      this.overlayState.message = errorMessage;
      
      const display = this.displayManager.getCurrentDisplay();
      const { width, height } = display;
      const theme = this.overlayConfig.theme;
      const fonts = this.overlayConfig.fonts;
      const layout = this.overlayConfig.layout;
      const strings = this.getStrings();
      
      const errorOverlayPath = path.join(this.assetsCacheDir, `error-overlay-${Date.now()}.png`);
      
      let command = `convert -size ${width}x${height} xc:"${theme.backgroundColor}" `;
      
      // Error background gradient
      command += `-fill "gradient:${theme.errorColor}-${theme.backgroundColor}" ` +
        `-draw "rectangle 0,0 ${width},${height/4}" `;
      
      // Error icon (simple exclamation mark)
      const iconSize = 150;
      const centerX = width / 2;
      const iconY = height / 2 - 200;
      
      command += `-fill "${theme.errorColor}" -stroke "${theme.textColor}" -strokewidth 8 ` +
        `-pointsize ${iconSize} -font Arial-Bold -gravity center ` +
        `-annotate +0+${iconY - height/2} "⚠" `;
      
      // Error title
      command += `-fill "${theme.errorColor}" -pointsize ${fonts.titleSize} -font Arial-Bold ` +
        `-annotate +0+${iconY + iconSize - height/2} "${strings.error}" `;
      
      // Error message
      command += `-fill "${theme.textColor}" -pointsize ${fonts.instructionSize} ` +
        `-annotate +0+${iconY + iconSize + layout.spacing - height/2} "${errorMessage}" `;
      
      // Network troubleshooting
      if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('connection')) {
        command += `-fill "${theme.warningColor}" -pointsize ${fonts.statusSize} ` +
          `-annotate +0+${iconY + iconSize + layout.spacing * 2 - height/2} "${strings.networkError}" `;
      }
      
      // Retry instructions
      command += `-fill "${theme.secondaryColor}" -pointsize ${fonts.statusSize} ` +
        `-annotate +0+${iconY + iconSize + layout.spacing * 3 - height/2} "Retrying automatically..." `;
      
      command += ` "${errorOverlayPath}"`;
      
      await this.execCommand(command);
      await this.displayOverlayImage(errorOverlayPath);
      
    } catch (error) {
      console.error('Error showing error overlay:', error);
    }
  }

  /**
   * Show pairing success overlay
   */
  async showPairingSuccess() {
    console.log('Showing pairing success overlay');
    
    try {
      this.overlayState.status = 'paired';
      this.isPaired = true;
      
      const display = this.displayManager.getCurrentDisplay();
      const { width, height } = display;
      const theme = this.overlayConfig.theme;
      const fonts = this.overlayConfig.fonts;
      const strings = this.getStrings();
      
      const successOverlayPath = path.join(this.assetsCacheDir, `success-overlay-${Date.now()}.png`);
      
      let command = `convert -size ${width}x${height} xc:"${theme.backgroundColor}" `;
      
      // Success background gradient
      command += `-fill "gradient:${theme.accentColor}-${theme.backgroundColor}" ` +
        `-draw "rectangle 0,0 ${width},${height/3}" `;
      
      // Success icon (checkmark)
      const iconSize = 200;
      const centerX = width / 2;
      const iconY = height / 2 - 100;
      
      command += `-fill "${theme.accentColor}" -stroke "${theme.textColor}" -strokewidth 12 ` +
        `-pointsize ${iconSize} -font Arial-Bold -gravity center ` +
        `-annotate +0+${iconY - height/2} "✓" `;
      
      // Success message
      command += `-fill "${theme.accentColor}" -pointsize ${fonts.titleSize} -font Arial-Bold ` +
        `-annotate +0+${iconY + iconSize - height/2} "${strings.paired}" `;
      
      // Additional info
      command += `-fill "${theme.textColor}" -pointsize ${fonts.instructionSize} ` +
        `-annotate +0+${iconY + iconSize + fonts.instructionSize - height/2} "Starting content playback..." `;
      
      command += ` "${successOverlayPath}"`;
      
      await this.execCommand(command);
      await this.displayOverlayImage(successOverlayPath);
      
      // Auto-hide after 3 seconds
      setTimeout(() => {
        this.hidePairingOverlay();
      }, 3000);
      
    } catch (error) {
      console.error('Error showing pairing success overlay:', error);
    }
  }

  /**
   * Update pairing progress
   */
  async updatePairingProgress(progress, message = null) {
    console.log(`Updating pairing progress: ${progress}%`, message);
    
    this.overlayState.status = 'connecting';
    this.overlayState.progress = Math.min(100, Math.max(0, progress));
    this.overlayState.message = message;
    
    if (this.isDisplayed && !this.isPaired) {
      const overlayImagePath = await this.generatePairingOverlay();
      await this.displayOverlayImage(overlayImagePath);
    }
  }

  /**
   * Hide the pairing overlay
   */
  async hidePairingOverlay() {
    console.log('Hiding pairing overlay');
    
    try {
      this.isDisplayed = false;
      
      // Stop animations
      this.stopAnimations();
      
      // Kill current display process
      if (this.currentDisplayProcess) {
        this.currentDisplayProcess.kill('SIGTERM');
        this.currentDisplayProcess = null;
      }
      
      // Clear framebuffer
      await this.clearFramebuffer();
      
    } catch (error) {
      console.error('Error hiding pairing overlay:', error);
    }
  }

  /**
   * Start pulse animation for attention-grabbing effect
   */
  startPulseAnimation() {
    if (this.pulseTimer) {
      clearInterval(this.pulseTimer);
    }
    
    this.pulseTimer = setInterval(async () => {
      if (this.isDisplayed && !this.isPaired) {
        this.animationFrame = (this.animationFrame + 1) % 4;
        
        try {
          const overlayImagePath = await this.generatePairingOverlay();
          await this.displayOverlayImage(overlayImagePath);
        } catch (error) {
          console.error('Error updating pulse animation:', error);
        }
      }
    }, this.overlayConfig.animations.pulseInterval);
  }

  /**
   * Stop all animations
   */
  stopAnimations() {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }
    
    if (this.pulseTimer) {
      clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
  }

  /**
   * Set up automatic code refresh
   */
  setupAutoRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    
    const refreshInterval = this.overlayConfig.autoRefresh.interval;
    
    this.refreshTimer = setTimeout(() => {
      if (this.isDisplayed && !this.isPaired) {
        console.log('Auto-refreshing pairing code');
        this.requestNewPairingCode();
      }
    }, refreshInterval);
  }

  /**
   * Set up code expiry monitoring
   */
  setupExpiryMonitoring() {
    if (!this.codeExpiry) return;
    
    const warningTime = this.overlayConfig.autoRefresh.warningTime;
    const timeUntilWarning = this.codeExpiry.getTime() - Date.now() - warningTime;
    
    if (timeUntilWarning > 0) {
      setTimeout(() => {
        if (this.isDisplayed && !this.isPaired) {
          console.log('Pairing code expiring soon, showing warning');
          this.showExpiryWarning();
        }
      }, timeUntilWarning);
    }
    
    const timeUntilExpiry = this.codeExpiry.getTime() - Date.now();
    if (timeUntilExpiry > 0) {
      setTimeout(() => {
        if (this.isDisplayed && !this.isPaired) {
          console.log('Pairing code expired, requesting new code');
          this.handleCodeExpiry();
        }
      }, timeUntilExpiry);
    }
  }

  /**
   * Show code expiry warning
   */
  async showExpiryWarning() {
    // This will be reflected in the next overlay generation
    // The warning is already handled in generatePairingOverlay()
    if (this.isDisplayed && !this.isPaired) {
      const overlayImagePath = await this.generatePairingOverlay();
      await this.displayOverlayImage(overlayImagePath);
    }
  }

  /**
   * Handle code expiry
   */
  async handleCodeExpiry() {
    console.log('Handling pairing code expiry');
    
    this.overlayState.status = 'expired';
    
    try {
      // Show expiry message
      await this.showExpiryOverlay();
      
      // Request new code
      setTimeout(() => {
        this.requestNewPairingCode();
      }, 2000);
      
    } catch (error) {
      console.error('Error handling code expiry:', error);
    }
  }

  /**
   * Show code expired overlay
   */
  async showExpiryOverlay() {
    const display = this.displayManager.getCurrentDisplay();
    const { width, height } = display;
    const theme = this.overlayConfig.theme;
    const fonts = this.overlayConfig.fonts;
    const strings = this.getStrings();
    
    const expiryOverlayPath = path.join(this.assetsCacheDir, `expiry-overlay-${Date.now()}.png`);
    
    let command = `convert -size ${width}x${height} xc:"${theme.backgroundColor}" `;
    
    // Warning background
    command += `-fill "gradient:${theme.warningColor}-${theme.backgroundColor}" ` +
      `-draw "rectangle 0,0 ${width},${height/4}" `;
    
    // Warning icon
    const iconSize = 150;
    const iconY = height / 2 - 100;
    
    command += `-fill "${theme.warningColor}" -pointsize ${iconSize} -font Arial-Bold -gravity center ` +
      `-annotate +0+${iconY - height/2} "⏱" `;
    
    // Expiry message
    command += `-fill "${theme.warningColor}" -pointsize ${fonts.titleSize} -font Arial-Bold ` +
      `-annotate +0+${iconY + iconSize - height/2} "${strings.codeExpired}" `;
    
    command += ` "${expiryOverlayPath}"`;
    
    await this.execCommand(command);
    await this.displayOverlayImage(expiryOverlayPath);
  }

  /**
   * Request new pairing code (callback to main daemon)
   */
  requestNewPairingCode() {
    // This should be called by the main daemon
    if (this.onCodeRefreshRequest) {
      this.onCodeRefreshRequest();
    }
  }

  /**
   * Set callback for code refresh requests
   */
  setCodeRefreshCallback(callback) {
    this.onCodeRefreshRequest = callback;
  }

  /**
   * Update network status
   */
  updateNetworkStatus(status) {
    const validStatuses = ['online', 'offline', 'limited', 'unknown'];
    this.overlayState.networkStatus = validStatuses.includes(status) ? status : 'unknown';
    
    // Refresh display if currently showing
    if (this.isDisplayed && !this.isPaired) {
      setTimeout(async () => {
        const overlayImagePath = await this.generatePairingOverlay();
        await this.displayOverlayImage(overlayImagePath);
      }, 100);
    }
  }

  /**
   * Initialize framebuffer information
   */
  async initializeFramebuffer() {
    try {
      // Get framebuffer info
      const fbsetOutput = await this.execCommand('fbset -s').catch(() => '');
      
      if (fbsetOutput) {
        const geometryMatch = fbsetOutput.match(/geometry (\d+) (\d+) (\d+) (\d+) (\d+)/);
        if (geometryMatch) {
          this.fbInfo.width = parseInt(geometryMatch[1]);
          this.fbInfo.height = parseInt(geometryMatch[2]);
          this.fbInfo.pixelDepth = parseInt(geometryMatch[5]);
        }
      }
      
      // Use display manager info as fallback
      const display = this.displayManager.getCurrentDisplay();
      this.fbInfo.width = display.width;
      this.fbInfo.height = display.height;
      this.fbInfo.pixelDepth = display.pixelDepth || 32;
      
      // Calculate buffer size
      this.fbInfo.lineLength = this.fbInfo.width * (this.fbInfo.pixelDepth / 8);
      this.fbInfo.bufferSize = this.fbInfo.lineLength * this.fbInfo.height;
      
      console.log('Framebuffer info:', this.fbInfo);
      
    } catch (error) {
      console.error('Error initializing framebuffer:', error);
    }
  }

  /**
   * Clear framebuffer
   */
  async clearFramebuffer() {
    try {
      await this.execCommand(`dd if=/dev/zero of=${this.fbInfo.device} bs=1024 count=1024 2>/dev/null || true`);
    } catch (error) {
      console.log('Could not clear framebuffer directly');
    }
  }

  /**
   * Load configuration
   */
  async loadConfiguration() {
    try {
      if (await fs.pathExists(this.overlayConfigPath)) {
        const config = await fs.readJson(this.overlayConfigPath);
        this.overlayConfig = { ...this.overlayConfig, ...config };
        console.log('Pairing overlay configuration loaded');
      } else {
        // Save default configuration
        await this.saveConfiguration();
      }
    } catch (error) {
      console.error('Error loading overlay configuration:', error);
    }
  }

  /**
   * Save configuration
   */
  async saveConfiguration() {
    try {
      await fs.writeJson(this.overlayConfigPath, this.overlayConfig, { spaces: 2 });
    } catch (error) {
      console.error('Error saving overlay configuration:', error);
    }
  }

  /**
   * Get localized strings
   */
  getStrings() {
    const language = this.overlayConfig.languages.default;
    return this.strings[language] || this.strings.en;
  }

  /**
   * Set language for overlay
   */
  setLanguage(languageCode) {
    if (this.strings[languageCode]) {
      this.overlayConfig.languages.default = languageCode;
      this.saveConfiguration();
      
      // Refresh display if showing
      if (this.isDisplayed && !this.isPaired) {
        setTimeout(async () => {
          const overlayImagePath = await this.generatePairingOverlay();
          await this.displayOverlayImage(overlayImagePath);
        }, 100);
      }
    }
  }

  /**
   * Get network status color
   */
  getNetworkStatusColor() {
    const colors = {
      online: this.overlayConfig.theme.accentColor,
      limited: this.overlayConfig.theme.warningColor,
      offline: this.overlayConfig.theme.errorColor,
      unknown: this.overlayConfig.theme.secondaryColor
    };
    
    return colors[this.overlayState.networkStatus] || colors.unknown;
  }

  /**
   * Check if code is expiring soon
   */
  isCodeExpiringSoon() {
    if (!this.codeExpiry) return false;
    
    const timeLeft = this.codeExpiry.getTime() - Date.now();
    const warningTime = this.overlayConfig.autoRefresh.warningTime;
    
    return timeLeft <= warningTime && timeLeft > 0;
  }

  /**
   * Utility method to execute shell commands
   */
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
   * Get current overlay state
   */
  getOverlayState() {
    return {
      ...this.overlayState,
      isDisplayed: this.isDisplayed,
      isPaired: this.isPaired,
      currentCode: this.currentCode,
      codeExpiry: this.codeExpiry
    };
  }

  /**
   * Set pairing URL for QR codes
   */
  setPairingUrl(url) {
    this.pairingUrl = url;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('Cleaning up Pairing Overlay System...');
    
    this.stopAnimations();
    
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    
    if (this.currentDisplayProcess) {
      this.currentDisplayProcess.kill('SIGTERM');
    }
    
    // Clean up cache files
    try {
      await fs.emptyDir(this.assetsCacheDir);
    } catch (error) {
      console.log('Error cleaning up cache:', error.message);
    }
    
    console.log('Pairing Overlay System cleanup complete');
  }
}

module.exports = PairingOverlay;