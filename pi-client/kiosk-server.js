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

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;
const DEVICE_CONFIG_PATH = '/opt/mesophy/config/device.json';
const DATABASE_PATH = '/opt/mesophy/data/kiosk.db';

// Global state
let deviceConfig = null;
let isPaired = false;
let currentPairingCode = null;
let connectedClients = new Set();

/**
 * Initialize SQLite database for local storage
 */
async function initDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DATABASE_PATH, (err) => {
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
        
        console.log('✅ Device paired successfully:', config.screen_name);
        
        // Notify connected clients
        broadcastToClients({
            type: 'pairing_success',
            device_config: config
        });
        
        return true;
    } catch (error) {
        console.error('❌ Error saving device config:', error);
        return false;
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