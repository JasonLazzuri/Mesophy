# SSE Service Configuration Guide

The Android TV client now supports two SSE endpoints for maximum reliability:

## Service Options

### 1. Always-On Service (Recommended - Bulletproof)
- **URL**: `https://your-render-app.onrender.com/stream`  
- **Benefits**: No timeout limitations, persistent connections
- **Best for**: Production deployments with 100% reliability requirements

### 2. Vercel Serverless Service (Legacy)
- **URL**: `https://mesophy.vercel.app/api/devices/notifications/stream`
- **Benefits**: Simple deployment, part of main application
- **Limitation**: 5-minute timeout causes periodic disconnections

## Configuration

Edit `ServerSentEventsManager.kt`:

```kotlin
// Always-on SSE service configuration  
private const val ALWAYS_ON_SSE_BASE = "https://your-render-app.onrender.com"
private const val USE_ALWAYS_ON_SERVICE = true  // true = always-on, false = vercel
```

## Deployment Steps

1. **Deploy Always-On Service**:
   - Deploy `sse-service/` to Render
   - Copy your Render app URL
   - Update `ALWAYS_ON_SSE_BASE` with your URL

2. **Update Android TV Client**:
   - Set `USE_ALWAYS_ON_SERVICE = true`
   - Build and install updated APK

3. **Verify Configuration**:
   - Check Android logs for "always-on SSE connection opened"
   - Monitor `/health` endpoint on your Render service

## Testing

### Current Service Check
```kotlin
val sseManager = ServerSentEventsManager(context)
Log.i("SSE", "Using: ${sseManager.getServiceInfo()}")
```

### Switching Services
```kotlin
// For testing - switch between services
private const val USE_ALWAYS_ON_SERVICE = false  // Test Vercel
// or
private const val USE_ALWAYS_ON_SERVICE = true   // Test Always-on
```

## Expected Behavior

### Always-On Service
- ✅ Continuous connection (hours/days)
- ✅ Sub-second notification delivery
- ✅ Automatic catch-up on reconnection
- ✅ No 5-minute timeout issues

### Vercel Service  
- ⚠️ Connection drops every 5 minutes
- ⚠️ 30-60 second reconnection gaps
- ⚠️ Potential notification loss during gaps
- ✅ Automatic reconnection

## Troubleshooting

### Always-On Service Issues
1. Check Render deployment status
2. Verify environment variables in Render dashboard
3. Test health endpoint: `curl https://your-app.onrender.com/health`

### Connection Problems
1. Verify Android TV has internet access
2. Check SSL certificate validity
3. Monitor Android logs for connection errors

### Notification Delays
1. Always-on service: Should be instant when connected
2. Vercel service: May have 5-minute gaps during reconnection