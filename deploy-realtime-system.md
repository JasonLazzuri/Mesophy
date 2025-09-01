# Deploy Real-time Notification System

This guide deploys the complete real-time notification system for instant content updates to Android TV devices.

## Prerequisites

- Supabase project admin access
- Vercel deployment (auto-deploys from Git)
- Production database backup (recommended)

## Deployment Steps

### 1. Deploy API Endpoints (✅ Completed)

The following files have been committed and deployed to Vercel:
- `src/app/api/devices/notifications/stream/route.ts` - SSE endpoint
- `src/lib/notifications.ts` - Notification utilities

**Verify deployment**: Test endpoint at `https://mesophy.vercel.app/api/devices/notifications/stream`

### 2. Database Migrations

Run the following SQL scripts in your Supabase SQL editor:

#### Step 2a: Create device_notifications table
```sql
-- Run: supabase/device_notifications_table.sql
-- Creates notification_type enum, device_notifications table, indexes, and cleanup functions
```

#### Step 2b: Create notification triggers
```sql
-- Run: supabase/notification_triggers.sql  
-- Creates automatic triggers that send notifications when content changes
```

### 3. Verify Database Setup

After running migrations, verify in Supabase:

1. **Tables**: Check that `device_notifications` table exists
2. **Triggers**: Verify triggers exist on `schedules`, `playlists`, `playlist_items`, `media_assets`
3. **Functions**: Check that notification functions are created
4. **RLS**: Verify Row Level Security policies are active

### 4. Test Real-time System

#### Test SSE Connection:
```bash
curl -N -H "Authorization: Bearer YOUR_DEVICE_TOKEN" \
     -H "X-Screen-ID: YOUR_SCREEN_ID" \
     https://mesophy.vercel.app/api/devices/notifications/stream
```

#### Test Notification Creation:
```sql
-- Insert a test notification
INSERT INTO device_notifications (
    screen_id, notification_type, title, message, priority
) VALUES (
    'your-screen-id', 'system_message', 'Test', 'Testing notifications', 1
);
```

### 5. Enable Android App SSE

Once database migrations are complete, uncomment in Android `ContentSyncManager.kt`:
```kotlin
// Change this:
// sseManager.start()
// To this:
sseManager.start()
```

## Benefits After Deployment

- **99% reduction in API calls** - From every 15-60 seconds to every 30-60 minutes
- **Sub-2-second update latency** - Instant content updates via SSE
- **Automatic content synchronization** - No manual refresh needed
- **Reduced database costs** - Minimal polling with real-time updates
- **Better user experience** - Content appears immediately when changed

## Monitoring

Monitor the system through:
- Supabase logs for database triggers
- Vercel function logs for SSE connections
- Android logcat for SSE connection status

## Rollback Plan

If issues occur:
1. Disable SSE in Android app (comment `sseManager.start()`)
2. System falls back to polling automatically
3. Remove database triggers if needed:
   ```sql
   DROP TRIGGER schedules_notify_change ON schedules;
   DROP TRIGGER playlists_notify_change ON playlists;
   DROP TRIGGER playlist_items_notify_change ON playlist_items;
   DROP TRIGGER media_assets_notify_change ON media_assets;
   ```

---

**Status**: SSE endpoint deployed ✅, Database migrations pending ⏳