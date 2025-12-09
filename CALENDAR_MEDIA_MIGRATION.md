# Calendar Media Migration Guide

## Overview

This document describes the migration of calendar integration from screen-specific configuration to media-based assets. Calendars are now managed as reusable media assets that can be added to playlists.

## What Was Changed

### 1. **Media Page Updates**
- ✅ Added "Connect Calendar" button next to "Add YouTube Video"
- ✅ Created `CalendarConnectModal` component for OAuth flow
- ✅ Calendars now appear in media library like other assets

### 2. **New API Endpoints**

#### OAuth Flow for Media Calendars
- `/api/calendar/microsoft/auth/media` - Initiates Microsoft OAuth for media calendar
- `/api/calendar/microsoft/callback/media` - Handles OAuth callback and stores tokens temporarily

#### Calendar Management
- `/api/calendar/media/calendars` - Lists available calendars from Microsoft
- `/api/calendar/media/create` - Creates calendar media asset from OAuth session

### 3. **Database Changes**

Created new table: `calendar_oauth_sessions`
- Stores temporary OAuth tokens during calendar connection
- Sessions expire after 30 minutes
- Automatically cleaned up after media asset creation

## Setup Instructions

### Step 1: Run Database Migration

Run the SQL migration in your Supabase SQL editor:

```bash
# File location: supabase/calendar_oauth_sessions.sql
```

Go to Supabase Dashboard → SQL Editor → New Query and run the contents of `calendar_oauth_sessions.sql`.

### Step 2: Deploy Changes

```bash
# Commit and push changes
git add .
git commit -m "Migrate calendar integration to media-based system"
git push

# Vercel will automatically deploy
```

### Step 3: Test the Flow

1. Go to `/dashboard/media`
2. Click "Connect Calendar" button
3. Sign in with Microsoft
4. Select a calendar from the dropdown
5. Give it a name (e.g., "Conference Room A Calendar")
6. Click "Create Calendar"
7. Calendar appears in media library

### Step 4: Use Calendar in Playlists

1. Go to Playlists
2. Create or edit a playlist
3. Add the calendar media asset like any other media
4. Set display duration (how long to show calendar before next item)
5. Assign playlist to screens

## How It Works

### OAuth Flow

```
User clicks "Connect Calendar"
    ↓
Redirect to Microsoft OAuth (/api/calendar/microsoft/auth/media?session_id=...)
    ↓
User authenticates with Microsoft
    ↓
Callback to /api/calendar/microsoft/callback/media
    ↓
Store OAuth tokens in calendar_oauth_sessions table
    ↓
Redirect back to media page with session_id
    ↓
Modal fetches available calendars (/api/calendar/media/calendars)
    ↓
User selects calendar and names it
    ↓
Create media asset (/api/calendar/media/create)
    ↓
Calendar appears in media library
    ↓
OAuth session cleaned up
```

### Data Storage

**Calendar Media Asset:**
```json
{
  "id": "uuid",
  "name": "Conference Room A Calendar",
  "media_type": "calendar",
  "mime_type": "application/calendar",
  "calendar_metadata": {
    "provider": "microsoft",
    "calendar_id": "...",
    "calendar_name": "...",
    "access_token": "...",
    "refresh_token": "...",
    "token_expires_at": "2025-12-15T...",
    "timezone": "America/Los_Angeles",
    "show_organizer": true,
    "show_attendees": false,
    "show_private_details": false
  }
}
```

**Temporary OAuth Session:**
```json
{
  "session_id": "media_1234567890_xyz",
  "user_id": "uuid",
  "access_token": "...",
  "refresh_token": "...",
  "microsoft_email": "user@company.com",
  "expires_at": "2025-12-08T19:00:00Z"  // 30 minutes
}
```

## Benefits

### ✅ Reusability
- One calendar can be used across multiple screens
- No need to re-connect for each screen

### ✅ Centralized Management
- All media (videos, images, calendars) in one place
- Consistent UI/UX for all media types

### ✅ Easier Maintenance
- Update calendar settings in one place
- Token refresh happens at media level, not screen level

### ✅ Flexible Scheduling
- Add calendars to playlists
- Mix with other content types
- Set display duration per calendar

## Token Management

### Auto-Refresh
The existing `/api/devices/calendar-data` endpoint handles token refresh automatically:
1. Checks if `token_expires_at` is in the past
2. Uses `refresh_token` to get new tokens
3. Updates `calendar_metadata` in media_assets table
4. Returns calendar events

### Manual Refresh
If auto-refresh fails (refresh token expired):
1. Go to Media page
2. Find the calendar asset
3. Click "Reconnect Calendar" (future feature)
4. Re-authenticate with Microsoft

## Migration Path

### Old System (Screen-Specific)
```
Screen → Calendar Connection → Microsoft OAuth → Store in screen metadata
```

### New System (Media-Based)
```
Media Library → Connect Calendar → Microsoft OAuth → Create Media Asset
Media Asset → Add to Playlist → Assign to Screens
```

### Backward Compatibility
- Existing screen-specific calendars continue to work
- Calendar metadata stored in `media_assets` table
- Android TV app reads from media_assets via sync endpoint

## Troubleshooting

### Calendar Not Loading (401 Error)
**Cause:** Microsoft OAuth tokens expired
**Solution:** Reconnect calendar in media library

### No Calendars Found
**Cause:** User doesn't have calendar access
**Solution:** Grant calendar permissions in Microsoft 365 admin

### Session Expired Error
**Cause:** OAuth session timeout (30 minutes)
**Solution:** Start over - click "Connect Calendar" again

### Calendar Events Not Syncing
**Cause:** Token refresh failure
**Solution:** Check Vercel logs for refresh errors, may need to reconnect

## Next Steps

### Recommended Enhancements
1. **Reconnect Button** - Add button to refresh expired calendar tokens
2. **Calendar Preview** - Show sample events before creating asset
3. **Bulk Import** - Connect multiple calendars at once
4. **Calendar Status** - Show token expiration status in media library
5. **Screen Migration Tool** - Migrate existing screen calendars to media assets

### Optional Features
- Calendar groups/folders
- Shared calendars across organizations
- Calendar templates with pre-configured settings

## Files Changed

### Frontend
- `src/app/dashboard/media/page.tsx` - Added Connect Calendar button
- `src/components/CalendarConnectModal.tsx` - New OAuth modal

### API Endpoints
- `src/app/api/calendar/microsoft/auth/media/route.ts` - OAuth initiation
- `src/app/api/calendar/microsoft/callback/media/route.ts` - OAuth callback
- `src/app/api/calendar/media/calendars/route.ts` - List calendars
- `src/app/api/calendar/media/create/route.ts` - Create media asset

### Database
- `supabase/calendar_oauth_sessions.sql` - New table migration

## Support

For issues or questions:
1. Check Vercel deployment logs
2. Check browser console for errors
3. Check Supabase logs for database errors
4. Review this guide for common issues
