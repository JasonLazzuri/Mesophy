# Mesophy Always-On SSE Service

A dedicated Server-Sent Events service for real-time notifications to Android TV devices. This service runs on always-on infrastructure (Render) to eliminate the 5-minute timeout limitations of Vercel serverless functions.

## Features

✅ **Always-On Connections** - No timeout limitations  
✅ **Real-Time Push Notifications** - Sub-second delivery via Supabase real-time  
✅ **Automatic Catch-Up** - Missed notifications delivered on reconnection  
✅ **Multi-Device Support** - Scalable to 1000+ concurrent connections  
✅ **Health Monitoring** - Built-in health checks and connection monitoring  

## Quick Start

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase credentials
   ```

3. **Start the service**:
   ```bash
   npm run dev
   ```

4. **Test the service**:
   ```bash
   curl http://localhost:3001/health
   ```

### Deploy to Render

1. **Connect your GitHub repo** to Render
2. **Select the `sse-service` directory** as the root directory
3. **Set environment variables** in Render dashboard:
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_SERVICE_KEY` - Your Supabase service role key
4. **Deploy** - Render will automatically use the `render.yaml` configuration

## API Endpoints

### `GET /stream`
Server-Sent Events endpoint for real-time notifications.

**Headers Required**:
- `Authorization: Bearer <device-token>`
- `X-Screen-ID: <screen-uuid>`

**Events Sent**:
- `connected` - Initial connection confirmation
- `realtime_ready` - Real-time push system active
- `content_update` - Playlist/content update notification
- `ping` - Heartbeat to maintain connection

### `GET /health`
Health check endpoint returning service status and active connections.

### `GET /`
Service information and feature overview.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3001) | No |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | Yes |
| `NODE_ENV` | Node environment | No |

## Architecture

```
Android TV Device ←→ Always-On SSE Service ←→ Supabase Real-time
                                ↓
                          Database Triggers
                                ↓
                        device_notifications table
```

## Monitoring

The service provides real-time monitoring through:
- `/health` endpoint with connection statistics
- Console logs with timestamps for all events
- Active connection tracking
- Notification delivery metrics

## Scaling

The service is designed to scale horizontally:
- **Starter Plan**: 1 instance, ~50 concurrent connections
- **Standard Plan**: Multiple instances, 1000+ connections with load balancing
- **Enterprise**: Custom scaling based on device count

## Troubleshooting

### Connection Issues
1. Check Android TV logs for SSE connection status
2. Verify `/health` endpoint shows active connections
3. Ensure Supabase credentials are correct

### Missing Notifications
1. Check database triggers are installed and working
2. Verify `device_notifications` table has recent entries
3. Monitor real-time subscription status in logs

### Performance
1. Monitor `/health` endpoint for connection count
2. Check memory usage doesn't exceed plan limits
3. Scale horizontally if connection count grows

## Development

### Testing Locally
```bash
# Start the service
npm run dev

# In another terminal, test SSE connection
curl -H "Authorization: Bearer test-token" \
     -H "X-Screen-ID: 003a361b-681d-4299-8337-bd7e5c09d1ed" \
     http://localhost:3001/stream
```

### Integration with Main App
Update Android TV client to point to the new SSE endpoint:
```kotlin
private val sseUrl = "https://your-render-app.onrender.com/stream"
```