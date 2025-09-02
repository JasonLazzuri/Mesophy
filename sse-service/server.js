require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { createClient } = require('@supabase/supabase-js')

const app = express()
const PORT = process.env.PORT || 3001

// Enable CORS for all routes
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'X-Screen-ID', 'Content-Type']
}))

// Track active connections for monitoring
const activeConnections = new Map()

/**
 * GET /stream - Server-Sent Events endpoint for real-time notifications
 * Always-on service with no timeout limitations (unlike Vercel)
 */
app.get('/stream', async (req, res) => {
  try {
    // Get device authentication
    const deviceToken = req.headers.authorization?.replace('Bearer ', '')
    const screenId = req.headers['x-screen-id']
    
    if (!deviceToken) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    
    if (!screenId) {
      return res.status(400).json({ error: 'Screen ID required' })
    }
    
    console.log(`[${new Date().toISOString()}] SSE: Starting ALWAYS-ON stream for screen: ${screenId}`)
    
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, X-Screen-ID',
      'X-Accel-Buffering': 'no', // Nginx: disable buffering for SSE
    })
    
    // Track this connection
    activeConnections.set(screenId, {
      response: res,
      connectedAt: new Date(),
      notificationsSent: 0,
      lastNotification: null
    })
    
    // Send initial connection confirmation
    res.write('event: connected\\n')
    res.write(`data: {"status":"connected","timestamp":"${new Date().toISOString()}","service":"always-on"}\\n\\n`)
    
    // Set up database listener for content changes
    await setupDatabaseListener(res, screenId)
    
    // Handle client disconnect
    req.on('close', () => {
      console.log(`[${new Date().toISOString()}] SSE: Client disconnected for screen: ${screenId}`)
      activeConnections.delete(screenId)
    })
    
    req.on('error', (error) => {
      console.error(`[${new Date().toISOString()}] SSE: Connection error for screen ${screenId}:`, error)
      activeConnections.delete(screenId)
    })
    
  } catch (error) {
    console.error('SSE: Error starting stream:', error)
    res.status(500).json({ error: 'Internal Server Error' })
  }
})

/**
 * Set up database listener for real-time notifications
 * This is the core of our always-on push notification system
 */
async function setupDatabaseListener(res, screenId) {
  try {
    // Get Supabase configuration
    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY
    
    if (!supabaseUrl || !serviceKey) {
      console.error('SSE: Missing Supabase configuration')
      return
    }
    
    const supabase = createClient(supabaseUrl, serviceKey)
    
    console.log(`[${new Date().toISOString()}] SSE: Setting up ALWAYS-ON real-time push for screen: ${screenId}`)
    
    // Track connection stats
    const connection = activeConnections.get(screenId)
    if (!connection) return
    
    // Function to deliver a single notification via SSE
    const deliverNotification = async (notification) => {
      try {
        const connection = activeConnections.get(screenId)
        if (!connection) return
        
        connection.notificationsSent++
        connection.lastNotification = new Date()
        
        // Send content update notification via SSE
        res.write('event: content_update\\n')
        res.write(`data: ${JSON.stringify({
          id: notification.id,
          type: notification.notification_type,
          title: notification.title,
          message: notification.message,
          scheduleId: notification.schedule_id,
          playlistId: notification.playlist_id,
          mediaAssetId: notification.media_asset_id,
          priority: notification.priority,
          timestamp: notification.created_at
        })}\\n\\n`)
        
        console.log(`[${new Date().toISOString()}] SSE: 🚀 ALWAYS-ON push delivered to screen: ${screenId} - "${notification.title}" (${notification.notification_type})`)
        
        // Mark notification as delivered
        const { error } = await supabase
          .from('device_notifications')
          .update({ delivered_at: new Date().toISOString() })
          .eq('id', notification.id)
        
        if (error) {
          console.error('SSE: Error marking notification as delivered:', error)
        }
        
      } catch (error) {
        console.error('SSE: Error delivering push notification:', error)
      }
    }
    
    // Get any existing undelivered notifications first (catch-up)
    const catchUpMissedNotifications = async () => {
      try {
        console.log(`[${new Date().toISOString()}] SSE: Checking for missed notifications for screen: ${screenId}`)
        const { data: notifications, error } = await supabase
          .from('device_notifications')
          .select('*')
          .eq('screen_id', screenId)
          .is('delivered_at', null)
          .order('created_at', { ascending: true })
        
        if (error) {
          console.error('SSE: Error during notification catch-up:', error)
          return
        }
        
        if (notifications && notifications.length > 0) {
          console.log(`[${new Date().toISOString()}] SSE: 📦 Catching up ${notifications.length} missed notifications for screen: ${screenId}`)
          for (const notification of notifications) {
            await deliverNotification(notification)
          }
        } else {
          console.log(`[${new Date().toISOString()}] SSE: ✅ No missed notifications for screen: ${screenId}`)
        }
      } catch (error) {
        console.error('SSE: Error in notification catch-up:', error)
      }
    }
    
    // Set up TRUE REAL-TIME push notifications (no polling!)
    console.log(`[${new Date().toISOString()}] SSE: 🎯 Setting up ALWAYS-ON real-time subscription for screen: ${screenId}`)
    
    const realtimeChannel = supabase
      .channel(`notifications-${screenId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'device_notifications',
          filter: `screen_id=eq.${screenId}`
        },
        (payload) => {
          console.log(`[${new Date().toISOString()}] SSE: 🔥 REAL-TIME notification received for screen: ${screenId}`, payload.new)
          deliverNotification(payload.new)
        }
      )
      .subscribe((status) => {
        console.log(`[${new Date().toISOString()}] SSE: Real-time subscription status for screen: ${screenId} - ${status}`)
      })
    
    // Catch up on any missed notifications first
    await catchUpMissedNotifications()
    
    // Send minimal heartbeat for connection health (much longer interval for always-on)
    let heartbeatCount = 0
    const healthHeartbeat = setInterval(() => {
      heartbeatCount++
      const connection = activeConnections.get(screenId)
      if (!connection) {
        clearInterval(healthHeartbeat)
        return
      }
      
      try {
        res.write("event: ping\\n")
        res.write(`data: {"timestamp":"${new Date().toISOString()}","heartbeat":${heartbeatCount},"notifications_sent":${connection.notificationsSent},"last_notification":"${connection.lastNotification ? connection.lastNotification.toISOString() : 'none'}","service":"always-on"}\\n\\n`)
        console.log(`[${new Date().toISOString()}] SSE: ❤️  ALWAYS-ON health heartbeat #${heartbeatCount} for screen: ${screenId} (${connection.notificationsSent} notifications sent)`)
      } catch (error) {
        console.error(`[${new Date().toISOString()}] SSE: Health heartbeat failed for screen: ${screenId}`, error)
        clearInterval(healthHeartbeat)
        activeConnections.delete(screenId)
      }
    }, 60000) // 60 second heartbeat - longer for always-on connections
    
    // Send confirmation that ALWAYS-ON real-time push notifications are active
    res.write("event: realtime_ready\\n")
    res.write(`data: {"status":"always_on_push_active","screen_id":"${screenId}","method":"supabase_realtime","polling":"disabled","service":"always-on","no_timeouts":true}\\n\\n`)
    
    // Store cleanup function
    connection.cleanup = () => {
      console.log(`[${new Date().toISOString()}] SSE: 🧹 Cleaning up ALWAYS-ON subscription for screen: ${screenId} (${connection.notificationsSent} notifications sent)`)
      clearInterval(healthHeartbeat)
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel)
        console.log(`[${new Date().toISOString()}] SSE: ALWAYS-ON real-time channel unsubscribed for screen: ${screenId}`)
      }
    }
    
  } catch (error) {
    console.error('SSE: Error setting up ALWAYS-ON database listener:', error)
  }
}

/**
 * GET /health - Health check endpoint for monitoring
 */
app.get('/health', (req, res) => {
  const stats = {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    activeConnections: activeConnections.size,
    connections: Array.from(activeConnections.entries()).map(([screenId, conn]) => ({
      screenId,
      connectedAt: conn.connectedAt,
      notificationsSent: conn.notificationsSent,
      lastNotification: conn.lastNotification
    }))
  }
  
  console.log(`[${new Date().toISOString()}] Health check: ${activeConnections.size} active connections`)
  res.json(stats)
})

/**
 * GET / - Root endpoint with service info
 */
app.get('/', (req, res) => {
  res.json({
    service: 'Mesophy Always-On SSE Service',
    version: '1.0.0',
    status: 'running',
    uptime: process.uptime(),
    activeConnections: activeConnections.size,
    endpoints: {
      stream: '/stream',
      health: '/health'
    },
    features: [
      'Always-on connections (no timeouts)',
      'Real-time push notifications',
      'Automatic reconnection handling',
      'Notification catch-up system'
    ]
  })
})

// Error handling
app.use((error, req, res, next) => {
  console.error('Express error:', error)
  res.status(500).json({ error: 'Internal Server Error' })
})

// Start server
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] 🚀 Mesophy Always-On SSE Service started on port ${PORT}`)
  console.log(`[${new Date().toISOString()}] ✨ Features: No timeouts, Real-time push, Auto-reconnection`)
  console.log(`[${new Date().toISOString()}] 🌐 Endpoints:`)
  console.log(`[${new Date().toISOString()}]   • Stream: http://localhost:${PORT}/stream`)
  console.log(`[${new Date().toISOString()}]   • Health: http://localhost:${PORT}/health`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`[${new Date().toISOString()}] 🛑 Received SIGTERM, shutting down gracefully`)
  
  // Clean up all connections
  for (const [screenId, connection] of activeConnections) {
    if (connection.cleanup) {
      connection.cleanup()
    }
  }
  
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log(`[${new Date().toISOString()}] 🛑 Received SIGINT, shutting down gracefully`)
  
  // Clean up all connections
  for (const [screenId, connection] of activeConnections) {
    if (connection.cleanup) {
      connection.cleanup()
    }
  }
  
  process.exit(0)
})