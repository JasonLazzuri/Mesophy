/**
 * Mesophy Digital Signage Kiosk App
 * Main JavaScript application for the kiosk interface
 */

class MesophyKioskApp {
    constructor() {
        this.ws = null;
        this.currentState = 'loading';
        this.deviceConfig = null;
        this.pairingCode = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        
        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log('🚀 Initializing Mesophy Kiosk App');
        
        // Register service worker for offline capabilities
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('/sw.js');
                console.log('✅ Service worker registered');
            } catch (error) {
                console.warn('⚠️ Service worker registration failed:', error);
            }
        }
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Get device information
        await this.getDeviceInfo();
        
        // Connect to WebSocket
        this.connectWebSocket();
        
        // Start the application
        setTimeout(() => this.checkInitialState(), 1000);
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Refresh pairing code button
        const refreshButton = document.getElementById('refresh-code');
        refreshButton?.addEventListener('click', () => {
            this.generatePairingCode();
        });

        // Retry connection button
        const retryButton = document.getElementById('retry-button');
        retryButton?.addEventListener('click', () => {
            this.reconnectWebSocket();
        });

        // Prevent context menu in kiosk mode
        document.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Prevent text selection in kiosk mode
        document.addEventListener('selectstart', (e) => e.preventDefault());
        
        // Handle keyboard shortcuts for debugging (only in development)
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey) {
                switch(e.key) {
                    case 'D':
                        this.toggleDebugOverlay();
                        break;
                    case 'R':
                        location.reload();
                        break;
                }
            }
        });
    }

    /**
     * Get device information
     */
    async getDeviceInfo() {
        try {
            const hostname = await this.getHostname();
            const networkInfo = await this.getNetworkInfo();
            
            // Update device info in UI
            const deviceHostname = document.getElementById('device-hostname');
            if (deviceHostname) {
                deviceHostname.textContent = hostname;
            }
            
            const networkInfoElement = document.getElementById('network-info');
            if (networkInfoElement) {
                networkInfoElement.textContent = networkInfo;
            }
        } catch (error) {
            console.warn('⚠️ Could not get device info:', error);
        }
    }

    /**
     * Get hostname from server or generate one
     */
    async getHostname() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            return data.hostname || 'Pi-Display';
        } catch (error) {
            return 'Pi-Display';
        }
    }

    /**
     * Get network information
     */
    async getNetworkInfo() {
        try {
            // This is a simplified version - in a real implementation,
            // you might want to get this from the server
            if (navigator.onLine) {
                return 'Connected';
            } else {
                return 'Offline';
            }
        } catch (error) {
            return 'Unknown';
        }
    }

    /**
     * Connect to WebSocket server
     */
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log('🔌 Connecting to WebSocket:', wsUrl);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('✅ WebSocket connected');
            this.reconnectAttempts = 0;
            this.updateConnectionStatus(true);
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            } catch (error) {
                console.error('❌ Error parsing WebSocket message:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.warn('🔌 WebSocket disconnected');
            this.updateConnectionStatus(false);
            this.scheduleReconnect();
        };
        
        this.ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            this.updateConnectionStatus(false);
        };
    }

    /**
     * Handle WebSocket messages
     */
    handleWebSocketMessage(data) {
        console.log('📨 WebSocket message:', data);
        
        switch (data.type) {
            case 'state_update':
                this.handleStateUpdate(data);
                break;
                
            case 'pairing_code_generated':
                this.updatePairingCode(data.code);
                break;
                
            case 'pairing_status':
                if (data.paired) {
                    this.handlePairingSuccess(data.device_config);
                }
                break;
                
            case 'pairing_success':
                this.handlePairingSuccess(data.device_config);
                break;
                
            case 'content_update':
                this.handleContentUpdate(data);
                break;
                
            case 'pong':
                // Handle ping response
                break;
                
            default:
                console.warn('Unknown WebSocket message type:', data.type);
        }
    }

    /**
     * Handle state update from server
     */
    handleStateUpdate(data) {
        if (data.is_paired && data.device_config) {
            this.deviceConfig = data.device_config;
            this.setState('success');
        } else if (data.pairing_code) {
            this.updatePairingCode(data.pairing_code);
            this.setState('pairing');
        } else {
            this.setState('pairing');
            this.generatePairingCode();
        }
    }

    /**
     * Check initial state
     */
    async checkInitialState() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            
            if (data.is_paired && data.device_config) {
                this.deviceConfig = data.device_config;
                this.setState('success');
            } else {
                this.setState('pairing');
                if (data.pairing_code) {
                    this.updatePairingCode(data.pairing_code);
                } else {
                    this.generatePairingCode();
                }
            }
        } catch (error) {
            console.error('❌ Error checking initial state:', error);
            this.setState('error', 'Unable to connect to the system. Please check your network connection.');
        }
    }

    /**
     * Generate pairing code
     */
    generatePairingCode() {
        console.log('📞 Generating pairing code...');
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'generate_pairing_code' }));
        } else {
            // Fallback to HTTP request
            this.generatePairingCodeHTTP();
        }
    }

    /**
     * Generate pairing code via HTTP
     */
    async generatePairingCodeHTTP() {
        try {
            const response = await fetch('/api/generate-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.updatePairingCode(data.pairing_code);
            } else {
                console.error('❌ Failed to generate pairing code via HTTP');
            }
        } catch (error) {
            console.error('❌ Error generating pairing code:', error);
        }
    }

    /**
     * Update pairing code in UI
     */
    updatePairingCode(code) {
        console.log('🔢 Updating pairing code:', code);
        this.pairingCode = code;
        
        const pairingCodeElement = document.getElementById('pairing-code');
        const inlineCodeElement = document.getElementById('inline-code');
        
        if (pairingCodeElement) {
            pairingCodeElement.innerHTML = `<span>${code}</span>`;
        }
        
        if (inlineCodeElement) {
            inlineCodeElement.textContent = code;
        }
        
        // Generate QR code
        this.generateQRCode(code);
        
        // Start checking for pairing
        this.startPairingCheck();
    }

    /**
     * Generate QR code
     */
    generateQRCode(code) {
        const qrCodeElement = document.getElementById('qr-code');
        if (qrCodeElement && window.QRCode) {
            // Clear existing QR code
            qrCodeElement.innerHTML = '';
            
            try {
                new QRCode(qrCodeElement, {
                    text: `https://mesophy.vercel.app/pair?code=${code}`,
                    width: 200,
                    height: 200,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M
                });
            } catch (error) {
                console.warn('⚠️ Could not generate QR code:', error);
                qrCodeElement.innerHTML = '<div style="color: #666;">QR code unavailable</div>';
            }
        }
    }

    /**
     * Start checking for pairing status
     */
    startPairingCheck() {
        // Clear existing interval
        if (this.pairingCheckInterval) {
            clearInterval(this.pairingCheckInterval);
        }
        
        // Check every 5 seconds
        this.pairingCheckInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'check_pairing' }));
            } else {
                this.checkPairingHTTP();
            }
        }, 5000);
    }

    /**
     * Check pairing status via HTTP
     */
    async checkPairingHTTP() {
        if (!this.pairingCode) return;
        
        try {
            const response = await fetch(`/api/check-pairing/${this.pairingCode}`);
            if (response.ok) {
                const data = await response.json();
                if (data.paired) {
                    // Refresh to get device config
                    location.reload();
                }
            }
        } catch (error) {
            console.error('❌ Error checking pairing status:', error);
        }
    }

    /**
     * Handle pairing success
     */
    handlePairingSuccess(deviceConfig) {
        console.log('🎉 Pairing successful!', deviceConfig);
        
        if (this.pairingCheckInterval) {
            clearInterval(this.pairingCheckInterval);
        }
        
        this.deviceConfig = deviceConfig;
        this.setState('success');
        
        // Update success screen with device info
        const screenName = document.getElementById('screen-name');
        const screenLocation = document.getElementById('screen-location');
        const screenType = document.getElementById('screen-type');
        
        if (screenName) screenName.textContent = deviceConfig.screen_name || 'Unknown';
        if (screenLocation) screenLocation.textContent = deviceConfig.location?.name || 'Unknown';
        if (screenType) screenType.textContent = deviceConfig.screen_type || 'Unknown';
        
        // Transition to content after a few seconds
        setTimeout(() => {
            this.setState('content');
        }, 5000);
    }

    /**
     * Handle content updates
     */
    handleContentUpdate(data) {
        console.log('📺 Content update:', data);
        // TODO: Implement content playback
    }

    /**
     * Update connection status indicator
     */
    updateConnectionStatus(connected) {
        const statusDot = document.getElementById('connection-status');
        const statusText = document.getElementById('connection-text');
        
        if (statusDot) {
            statusDot.className = connected ? 'status-dot connected' : 'status-dot';
        }
        
        if (statusText) {
            statusText.textContent = connected ? 'Connected' : 'Disconnected';
        }
    }

    /**
     * Schedule WebSocket reconnection
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnection attempts reached');
            this.setState('error', 'Unable to maintain connection to the system.');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`🔄 Scheduling reconnection in ${delay}ms (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            this.connectWebSocket();
        }, delay);
    }

    /**
     * Reconnect WebSocket
     */
    reconnectWebSocket() {
        this.reconnectAttempts = 0;
        this.connectWebSocket();
    }

    /**
     * Set application state
     */
    setState(newState, errorMessage = null) {
        if (this.currentState === newState) return;
        
        console.log(`🔄 State change: ${this.currentState} → ${newState}`);
        
        // Hide current state
        const currentStateElement = document.getElementById(`${this.currentState}-state`);
        if (currentStateElement) {
            currentStateElement.classList.remove('active');
        }
        
        // Show new state
        const newStateElement = document.getElementById(`${newState}-state`);
        if (newStateElement) {
            setTimeout(() => {
                newStateElement.classList.add('active');
            }, 100);
        }
        
        // Update error message if needed
        if (newState === 'error' && errorMessage) {
            const errorMessageElement = document.getElementById('error-message');
            if (errorMessageElement) {
                errorMessageElement.textContent = errorMessage;
            }
        }
        
        this.currentState = newState;
    }

    /**
     * Toggle debug overlay
     */
    toggleDebugOverlay() {
        const overlay = document.getElementById('content-overlay');
        if (overlay) {
            overlay.classList.toggle('show');
            
            if (overlay.classList.contains('show')) {
                overlay.innerHTML = `
                    <div>
                        <strong>Debug Info</strong><br>
                        State: ${this.currentState}<br>
                        Paired: ${this.deviceConfig ? 'Yes' : 'No'}<br>
                        Code: ${this.pairingCode || 'None'}<br>
                        WebSocket: ${this.ws?.readyState === WebSocket.OPEN ? 'Connected' : 'Disconnected'}
                    </div>
                `;
            }
        }
    }
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.mesophyApp = new MesophyKioskApp();
});

// Handle page visibility changes (for power management)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log('📺 Page visible - resuming activities');
        if (window.mesophyApp && window.mesophyApp.ws?.readyState !== WebSocket.OPEN) {
            window.mesophyApp.reconnectWebSocket();
        }
    }
});