#!/usr/bin/env node
/**
 * Mesophy Digital Signage Kiosk Server
 * Local web server that serves the digital signage app
 * Runs on Pi boot and serves localhost:3000
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs').promises;
const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;
const DEVICE_CONFIG_PATH = '/opt/mesophy/config/device.json';
const DATABASE_PATH = '/opt/mesophy/data/kiosk.db';
const CONTENT_DIR = '/opt/mesophy/content';
const API_BASE_URL = 'https://mesophy.vercel.app/api';

// Enhanced logging database reference
let db = null;

// Global state
let deviceConfig = null;
let isPaired = false;
let currentPairingCode = null;
let connectedClients = new Set();
let currentSchedule = null;
let contentCheckInterval = null;
let playingContent = null;

/**
 * Enhanced logging system
 */
function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;
    
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${logMessage}`);
    
    // Store in database if available
    if (db) {
        db.run(
            'INSERT INTO logs (level, message, timestamp) VALUES (?, ?, ?)',
            [level, logMessage, timestamp],
            (err) => {
                if (err) console.error('Failed to store log:', err);
            }
        );
    }
}

function logInfo(message, data = null) { log('info', message, data); }
function logWarn(message, data = null) { log('warn', message, data); }
function logError(message, data = null) { log('error', message, data); }
function logDebug(message, data = null) { log('debug', message, data); }

/**
 * Initialize SQLite database for local storage
 */
async function initDatabase() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DATABASE_PATH, (err) => {
            if (err) {
                console.error('Database connection error:', err);
                reject(err);
                return;
            }
            
            // Create tables
            db.serialize(() => {
                db.run(`
                    CREATE TABLE IF NOT EXISTS device_state (
                        key TEXT PRIMARY KEY,
                        value TEXT,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                
                db.run(`
                    CREATE TABLE IF NOT EXISTS content_cache (
                        id TEXT PRIMARY KEY,
                        type TEXT,
                        data TEXT,
                        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                
                db.run(`
                    CREATE TABLE IF NOT EXISTS logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        level TEXT,
                        message TEXT,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
            });
            
            logInfo('Database initialized successfully');
            resolve(db);
        });
    });
}

/**
 * Load device configuration
 */
async function loadDeviceConfig() {
    try {
        const configData = await fs.readFile(DEVICE_CONFIG_PATH, 'utf8');
        deviceConfig = JSON.parse(configData);
        isPaired = true;
        console.log('✅ Device is paired:', deviceConfig.screen_name);
        return true;
    } catch (error) {
        console.log('📱 Device not paired yet');
        deviceConfig = null;
        isPaired = false;
        return false;
    }
}

/**
 * Save device configuration
 */
async function saveDeviceConfig(config) {
    try {
        // Ensure config directory exists
        await fs.mkdir(path.dirname(DEVICE_CONFIG_PATH), { recursive: true });
        
        // Save config
        await fs.writeFile(DEVICE_CONFIG_PATH, JSON.stringify(config, null, 2));
        deviceConfig = config;
        isPaired = true;
        
        logInfo('Device paired successfully', { screen_name: config.screen_name });
        
        // Notify connected clients
        broadcastToClients({
            type: 'pairing_success',
            device_config: config
        });
        
        // Start content monitoring after successful pairing
        startContentMonitoring();
        
        return true;
    } catch (error) {
        console.error('❌ Error saving device config:', error);
        return false;
    }
}

/**
 * Content Management System
 */

/**
 * Start content monitoring (called after device pairing)
 */
function startContentMonitoring() {
    logInfo('Starting content monitoring system');
    
    // Immediately check for content
    checkForScheduledContent();
    
    // Set up periodic content checking (every 30 seconds)
    if (contentCheckInterval) {
        clearInterval(contentCheckInterval);
    }
    
    contentCheckInterval = setInterval(() => {
        checkForScheduledContent();
    }, 30000);
    
    logInfo('Content monitoring started - checking every 30 seconds');
}

/**
 * Check for scheduled content from the API
 */
async function checkForScheduledContent() {
    if (!isPaired || !deviceConfig) {
        logDebug('Device not paired - skipping content check');
        return;
    }
    
    try {
        logInfo('Checking for scheduled content', { screen_id: deviceConfig.screen_id });
        
        // Fetch current schedule from API
        const response = await fetch(`${API_BASE_URL}/screens/${deviceConfig.screen_id}/current-content`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${deviceConfig.api_key || 'device-token'}`
            }
        });
        
        if (!response.ok) {
            logWarn('Failed to fetch content from API', { 
                status: response.status, 
                statusText: response.statusText 
            });
            return;
        }
        
        const contentData = await response.json();
        logInfo('Content API response received', contentData);
        
        // Process the content response
        await processContentResponse(contentData);
        
    } catch (error) {
        logError('Error checking for scheduled content', { 
            error: error.message,
            stack: error.stack 
        });
    }
}

/**
 * Process content response from API
 */
async function processContentResponse(contentData) {
    logInfo('Processing content response', contentData);
    
    if (!contentData || (!contentData.media_assets && !contentData.playlist)) {
        logInfo('No content scheduled for current time');
        
        // Show "waiting for content" state
        broadcastToClients({
            type: 'content_update',
            content: null,
            message: 'No content scheduled for current time'
        });
        return;
    }
    
    // Extract media assets from response
    let mediaAssets = [];
    
    if (contentData.playlist && contentData.playlist.media_assets) {
        mediaAssets = contentData.playlist.media_assets;
        logInfo('Found playlist content', { 
            playlist_name: contentData.playlist.name,
            asset_count: mediaAssets.length 
        });
    } else if (contentData.media_assets) {
        mediaAssets = contentData.media_assets;
        logInfo('Found direct media assets', { asset_count: mediaAssets.length });
    }
    
    if (mediaAssets.length === 0) {
        logWarn('Content response contains no media assets');
        return;
    }
    
    // Download and cache media assets
    for (const asset of mediaAssets) {
        await downloadMediaAsset(asset);
    }
    
    // Update current schedule and start playback
    currentSchedule = {
        ...contentData,
        media_assets: mediaAssets,
        updated_at: new Date().toISOString()
    };
    
    logInfo('Content schedule updated', { 
        asset_count: mediaAssets.length,
        schedule_id: contentData.schedule_id 
    });
    
    // Notify frontend to start content playback
    broadcastToClients({
        type: 'content_update',
        content: currentSchedule
    });
}

/**
 * Download and cache media asset
 */
async function downloadMediaAsset(asset) {
    try {
        logInfo('Downloading media asset', { 
            id: asset.id, 
            name: asset.filename,
            type: asset.file_type 
        });
        
        // Ensure content directory exists
        await fs.mkdir(CONTENT_DIR, { recursive: true });
        
        const filePath = path.join(CONTENT_DIR, asset.filename);
        
        // Check if file already exists and is up to date
        try {
            const stats = await fs.stat(filePath);
            if (stats.size > 0) {
                logInfo('Media asset already cached', { filename: asset.filename });
                return filePath;
            }
        } catch (err) {
            // File doesn't exist, continue with download
        }
        
        // Download the file
        const response = await fetch(asset.file_url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const buffer = await response.buffer();
        await fs.writeFile(filePath, buffer);
        
        logInfo('Media asset downloaded successfully', { 
            filename: asset.filename,
            size: buffer.length 
        });
        
        return filePath;
        
    } catch (error) {
        logError('Failed to download media asset', { 
            asset_id: asset.id,
            filename: asset.filename,
            error: error.message 
        });
        throw error;
    }
}

/**
 * Stop content monitoring
 */
function stopContentMonitoring() {
    if (contentCheckInterval) {
        clearInterval(contentCheckInterval);
        contentCheckInterval = null;
        logInfo('Content monitoring stopped');
    }
}

/**
 * Generate pairing code from Mesophy API
 */
async function generatePairingCode() {
    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch('https://mesophy.vercel.app/api/devices/generate-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_info: { hostname: require('os').hostname() } })
        });
        
        if (response.ok) {
            const data = await response.json();
            currentPairingCode = data.pairing_code;
            console.log('📞 Generated pairing code:', currentPairingCode);
            return currentPairingCode;
        } else {
            console.error('❌ Failed to generate pairing code:', response.status);
            return null;
        }
    } catch (error) {
        console.error('❌ Error generating pairing code:', error);
        return null;
    }
}

/**
 * Check pairing status
 */
async function checkPairingStatus(code) {
    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(`https://mesophy.vercel.app/api/devices/check-pairing/${code}`);
        
        if (response.ok) {
            const data = await response.json();
            if (data.paired && data.device_config) {
                await saveDeviceConfig(data.device_config);
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error('❌ Error checking pairing status:', error);
        return false;
    }
}

/**
 * Broadcast message to all connected WebSocket clients
 */
function broadcastToClients(message) {
    const messageStr = JSON.stringify(message);
    connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
        }
    });
}

/**
 * WebSocket connection handler
 */
wss.on('connection', (ws) => {
    console.log('🔌 Client connected via WebSocket');
    connectedClients.add(ws);
    
    // Send current state to newly connected client
    ws.send(JSON.stringify({
        type: 'state_update',
        is_paired: isPaired,
        device_config: deviceConfig,
        pairing_code: currentPairingCode
    }));
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📨 WebSocket message:', data);
            
            switch (data.type) {
                case 'generate_pairing_code':
                    const code = await generatePairingCode();
                    ws.send(JSON.stringify({
                        type: 'pairing_code_generated',
                        code: code
                    }));
                    break;
                    
                case 'check_pairing':
                    if (currentPairingCode) {
                        const paired = await checkPairingStatus(currentPairingCode);
                        ws.send(JSON.stringify({
                            type: 'pairing_status',
                            paired: paired
                        }));
                    }
                    break;
                    
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
            }
        } catch (error) {
            console.error('❌ WebSocket message error:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('🔌 Client disconnected');
        connectedClients.delete(ws);
    });
});

// Express middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'kiosk-app')));

// Serve content files
app.use('/content', express.static(CONTENT_DIR));

// API Routes
app.get('/api/status', (req, res) => {
    res.json({
        is_paired: isPaired,
        device_config: deviceConfig,
        pairing_code: currentPairingCode,
        uptime: process.uptime()
    });
});

app.post('/api/generate-code', async (req, res) => {
    const code = await generatePairingCode();
    if (code) {
        res.json({ success: true, pairing_code: code });
    } else {
        res.status(500).json({ success: false, error: 'Failed to generate pairing code' });
    }
});

app.get('/api/check-pairing/:code', async (req, res) => {
    const paired = await checkPairingStatus(req.params.code);
    res.json({ paired: paired });
});

// Logs API for debugging
app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const level = req.query.level || null;
    
    let query = 'SELECT * FROM logs';
    let params = [];
    
    if (level) {
        query += ' WHERE level = ?';
        params.push(level);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ logs: rows });
    });
});

// Content status API
app.get('/api/content-status', (req, res) => {
    res.json({
        is_monitoring: contentCheckInterval !== null,
        current_schedule: currentSchedule,
        playing_content: playingContent,
        device_config: deviceConfig,
        last_check: new Date().toISOString()
    });
});

// Force content check API (for debugging)
app.post('/api/force-content-check', async (req, res) => {
    if (!isPaired) {
        return res.status(400).json({ error: 'Device not paired' });
    }
    
    try {
        logInfo('Manual content check requested via API');
        await checkForScheduledContent();
        res.json({ success: true, message: 'Content check initiated' });
    } catch (error) {
        logError('Manual content check failed', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Serve main app
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'kiosk-app', 'index.html'));
});

/**
 * Initialize and start server
 */
async function startServer() {
    try {
        console.log('🚀 Starting Mesophy Digital Signage Kiosk Server');
        
        // Ensure directories exist
        await fs.mkdir('/opt/mesophy/config', { recursive: true });
        await fs.mkdir('/opt/mesophy/data', { recursive: true });
        await fs.mkdir(CONTENT_DIR, { recursive: true });
        
        // Initialize database
        await initDatabase();
        
        // Load device config
        await loadDeviceConfig();
        
        // Start server
        server.listen(PORT, () => {
            console.log(`✅ Kiosk server running on http://localhost:${PORT}`);
            console.log(`📱 Device paired: ${isPaired}`);
            
            if (!isPaired) {
                // Auto-generate first pairing code
                generatePairingCode();
            } else {
                // Device is already paired - start content monitoring
                logInfo('Device already paired - starting content monitoring');
                startContentMonitoring();
            }
        });
        
    } catch (error) {
        console.error('💥 Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

// Start the server
startServer();