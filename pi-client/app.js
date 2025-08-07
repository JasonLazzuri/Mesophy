#!/usr/bin/env node

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const fetch = require('node-fetch');
const Database = require('sqlite3').Database;

// Configuration
const CONFIG_PATH = '/opt/mesophy/config/config.json';
const DB_PATH = '/opt/mesophy/data/client.db';
const CONTENT_PATH = '/opt/mesophy/content';
const LOG_PATH = '/opt/mesophy/logs';

let config = {};
let db = null;
let currentPairingCode = null;
let deviceConfig = null;
let syncInterval = null;
let heartbeatInterval = null;

// Load configuration
async function loadConfig() {
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
          displayTimeout: 30000
        },
        display: {
          width: 1920,
          height: 1080,
          fullscreen: true
        },
        system: {
          logLevel: "info",
          maxLogFiles: 10
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

// Initialize SQLite database
async function initDatabase() {
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

// Get system information
function getSystemInfo() {
  try {
    const os = require('os');
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      total_memory: os.totalmem(),
      free_memory: os.freemem(),
      uptime: os.uptime(),
      load_average: os.loadavg(),
      node_version: process.version,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Failed to get system info:', error);
    return {};
  }
}

// Generate pairing code
async function generatePairingCode() {
  try {
    const systemInfo = getSystemInfo();
    const response = await fetch(`${config.api.baseUrl}${config.api.endpoints.generateCode}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        device_info: systemInfo
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      currentPairingCode = data.pairing_code;
      console.log('Pairing code generated:', currentPairingCode);
      return data;
    } else {
      throw new Error(`Failed to generate pairing code: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error generating pairing code:', error);
    return null;
  }
}

// Check pairing status
async function checkPairingStatus() {
  if (!currentPairingCode) return null;
  
  try {
    const response = await fetch(`${config.api.baseUrl}${config.api.endpoints.checkPairing}/${currentPairingCode}`);
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
      
      // Start sync and heartbeat intervals
      startSyncService();
      startHeartbeatService();
      
      return deviceConfig;
    }
    
    return data;
  } catch (error) {
    console.error('Error checking pairing status:', error);
    return null;
  }
}

// Load saved device config
async function loadDeviceConfig() {
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

// Sync schedules and content
async function syncContent() {
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
          await new Promise((resolve, reject) => {
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
      }
      
      // Log sync
      await new Promise((resolve) => {
        const stmt = db.prepare('INSERT INTO sync_log (sync_type, success, message) VALUES (?, ?, ?)');
        stmt.run('content', true, `Synced ${syncData.all_schedules?.length || 0} schedules`);
        stmt.finalize(() => resolve());
      });
      
      return syncData;
    } else {
      throw new Error(`Sync failed: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Sync error:', error);
    
    // Log failed sync
    await new Promise((resolve) => {
      const stmt = db.prepare('INSERT INTO sync_log (sync_type, success, message) VALUES (?, ?, ?)');
      stmt.run('content', false, error.message);
      stmt.finalize(() => resolve());
    });
  }
}

// Send heartbeat
async function sendHeartbeat() {
  if (!deviceConfig) return;
  
  try {
    const systemInfo = getSystemInfo();
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
          resolution: `${config.display.width}x${config.display.height}`,
          fullscreen: config.display.fullscreen
        }
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.sync_recommended) {
        console.log('Sync recommended by server');
        await syncContent();
      }
    }
  } catch (error) {
    console.error('Heartbeat error:', error);
  }
}

// Start sync service
function startSyncService() {
  if (syncInterval) clearInterval(syncInterval);
  
  // Initial sync
  syncContent();
  
  // Set up interval
  syncInterval = setInterval(() => {
    syncContent();
  }, (config.device.syncInterval || 120) * 1000);
  
  console.log('Sync service started');
}

// Start heartbeat service
function startHeartbeatService() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  
  // Initial heartbeat
  sendHeartbeat();
  
  // Set up interval
  heartbeatInterval = setInterval(() => {
    sendHeartbeat();
  }, (config.device.heartbeatInterval || 300) * 1000);
  
  console.log('Heartbeat service started');
}

// Create Express app for local web interface
const app = express();

app.get('/', async (req, res) => {
  let html = '';
  
  if (!deviceConfig) {
    // Show pairing screen
    html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Mesophy Digital Signage</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            margin: 0; padding: 0; background: #000; color: #fff; 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            overflow: hidden;
          }
          .container { 
            height: 100vh; display: flex; flex-direction: column; 
            justify-content: center; align-items: center; text-align: center;
          }
          .logo { font-size: 3rem; margin-bottom: 2rem; color: #4f46e5; font-weight: bold; }
          .code { 
            font-size: 5rem; font-weight: bold; background: #1f2937; 
            padding: 1rem 2rem; border-radius: 1rem; margin: 2rem; 
            border: 3px solid #4f46e5; letter-spacing: 0.5rem;
          }
          .instructions { 
            font-size: 1.5rem; max-width: 800px; line-height: 1.6; 
            margin: 2rem; opacity: 0.9;
          }
          .status { 
            margin-top: 3rem; color: #6b7280; font-size: 1.2rem;
            display: flex; align-items: center; gap: 1rem;
          }
          .pulse { 
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: .5; }
          }
          .step { margin: 1rem 0; }
        </style>
        <script>
          // Auto-refresh every 10 seconds to check pairing status
          setTimeout(() => location.reload(), 10000);
        </script>
      </head>
      <body>
        <div class="container">
          <div class="logo">MESOPHY DIGITAL SIGNAGE</div>
          <div style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.8;">Device Setup Required</div>
          <div class="code pulse">${currentPairingCode || 'LOADING'}</div>
          <div class="instructions">
            <div class="step"><strong>1.</strong> Go to <strong>mesophy.vercel.app</strong></div>
            <div class="step"><strong>2.</strong> Login and navigate to <strong>Screens</strong></div>
            <div class="step"><strong>3.</strong> Click <strong>"Pair Device"</strong></div>
            <div class="step"><strong>4.</strong> Enter the code: <strong>${currentPairingCode || 'LOADING'}</strong></div>
          </div>
          <div class="status">
            <span>Status: Waiting for setup...</span>
            <span style="color: #10b981;">WiFi: Connected ✓</span>
          </div>
        </div>
      </body>
      </html>
    `;
  } else {
    // Show content display (placeholder for now)
    html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Mesophy - ${deviceConfig.screen_name}</title>
        <style>
          body { margin: 0; padding: 0; background: #000; color: #fff; font-family: Arial; }
          .display { height: 100vh; display: flex; align-items: center; justify-content: center; }
          .content { text-align: center; }
        </style>
      </head>
      <body>
        <div class="display">
          <div class="content">
            <h1>${deviceConfig.screen_name}</h1>
            <p>Content display will be implemented here</p>
            <p>Screen Type: ${deviceConfig.screen_type}</p>
            <p>Location: ${deviceConfig.location?.name}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  
  res.send(html);
});

// Status endpoint for debugging
app.get('/status', (req, res) => {
  res.json({
    paired: !!deviceConfig,
    pairing_code: currentPairingCode,
    device_config: deviceConfig,
    system_info: getSystemInfo(),
    uptime: process.uptime()
  });
});

// Main initialization
async function main() {
  console.log('Mesophy Pi Client starting...');
  
  await loadConfig();
  await initDatabase();
  
  // Try to load saved device config
  try {
    await loadDeviceConfig();
    if (deviceConfig) {
      startSyncService();
      startHeartbeatService();
    }
  } catch (error) {
    console.log('No saved device config found');
  }
  
  // If not paired, start pairing process
  if (!deviceConfig) {
    console.log('Device not paired, starting pairing process...');
    await generatePairingCode();
    
    // Check pairing status every 30 seconds
    setInterval(async () => {
      if (!deviceConfig) {
        await checkPairingStatus();
      }
    }, 30000);
  }
  
  // Start web server
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Pi Client web interface running on http://localhost:${port}`);
    if (currentPairingCode) {
      console.log(`Pairing code: ${currentPairingCode}`);
    }
  });
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  if (syncInterval) clearInterval(syncInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (db) db.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  if (syncInterval) clearInterval(syncInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (db) db.close();
  process.exit(0);
});

// Start the application
main().catch(console.error);