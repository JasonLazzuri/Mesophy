# Calendar Media Migration - Current Status

**Date**: December 8, 2025
**Status**: ⚠️ **MIGRATION READY - REQUIRES MANUAL STEP**

## ✅ Completed Steps

1. ✅ Added "Connect Calendar" button to `/dashboard/media` page
2. ✅ Created `CalendarConnectModal` component with OAuth flow
3. ✅ Implemented 4 new API endpoints:
   - `/api/calendar/microsoft/auth/media` - OAuth initiation
   - `/api/calendar/microsoft/callback/media` - OAuth callback
   - `/api/calendar/media/calendars` - List available calendars
   - `/api/calendar/media/create` - Create calendar media asset
4. ✅ Created database migration file: `supabase/calendar_oauth_sessions.sql`
5. ✅ Created comprehensive migration guide: `CALENDAR_MEDIA_MIGRATION.md`
6. ✅ Migration SQL copied to clipboard

## ⏳ Pending Step - ACTION REQUIRED

### Run Database Migration (2 minutes)

The migration SQL is **already in your clipboard**. Just paste it into Supabase SQL Editor:

1. **Open Supabase SQL Editor:**
   https://supabase.com/dashboard/project/gpsfsspeiuscpqmdyekt/sql

2. **Click "New Query"**

3. **Paste the SQL** (Cmd+V or Ctrl+V)
   _The SQL is already in your clipboard_

4. **Click "Run"**

5. **Verify success** - You should see:
   ```
   ✓ CREATE TABLE
   ✓ ALTER TABLE
   ✓ CREATE POLICY (4 policies)
   ✓ CREATE FUNCTION
   ```

### If You Need to Copy SQL Again

```bash
cat supabase/calendar_oauth_sessions.sql | pbcopy
```

Or view the SQL:
```bash
cat supabase/calendar_oauth_sessions.sql
```

### Verify Migration Success

After running the migration in Supabase, verify it worked:

```bash
SUPABASE_SERVICE_ROLE_KEY="your-key" node verify-migration.mjs
```

## 📋 Next Steps (After Migration)

1. **Test Calendar Connection Flow:**
   - Go to https://mesophy.vercel.app/dashboard/media
   - Click "Connect Calendar" button
   - Sign in with Microsoft
   - Select a calendar from dropdown
   - Name the calendar media asset
   - Click "Create Calendar"
   - Verify calendar appears in media library

2. **Add Calendar to Playlist:**
   - Create/edit a playlist
   - Add the calendar media asset
   - Set display duration
   - Assign to screens

3. **Verify on Android TV:**
   - Ensure calendar displays correctly
   - Check event data is showing
   - Verify auto-refresh works

## 📁 Files Created/Modified

### Frontend
- `src/app/dashboard/media/page.tsx` - Added Connect Calendar button
- `src/components/CalendarConnectModal.tsx` - New OAuth modal

### API Endpoints (New)
- `src/app/api/calendar/microsoft/auth/media/route.ts`
- `src/app/api/calendar/microsoft/callback/media/route.ts`
- `src/app/api/calendar/media/calendars/route.ts`
- `src/app/api/calendar/media/create/route.ts`

### Database
- `supabase/calendar_oauth_sessions.sql` - Migration file

### Documentation
- `CALENDAR_MEDIA_MIGRATION.md` - Complete migration guide
- `MIGRATION_STATUS.md` - This file

### Helper Scripts
- `run-migration.mjs` - Automated migration runner (requires manual step)
- `run-calendar-migration.sh` - Interactive migration helper
- `verify-migration.mjs` - Verification script

## 🎯 Benefits of This Migration

✅ **Reusability** - One calendar can be used across multiple screens
✅ **Centralized Management** - All media in one place
✅ **Easier Maintenance** - Update calendar settings once
✅ **Flexible Scheduling** - Add calendars to playlists with other content
✅ **Better Token Management** - Auto-refresh at media level

## ⚠️ Important Notes

1. **Existing Calendars Still Work** - Screen-specific calendars continue to function
2. **Token Expiration** - The existing screen calendar has expired OAuth tokens (Nov 23) and needs reconnection
3. **30-Minute Session Timeout** - OAuth sessions expire after 30 minutes, designed for security
4. **Automatic Cleanup** - Expired sessions are automatically cleaned up

## 🔍 Troubleshooting

### Table Already Exists Error
If you get "table already exists", the migration was already run. Verify with:
```bash
node verify-migration.mjs
```

### Session Expired During Connection
If OAuth session expires (30 min), just click "Connect Calendar" again and start over.

### Calendar Not Loading (401)
Means Microsoft OAuth tokens expired. Reconnect calendar in media library.

## 📞 Support

For issues:
1. Check Vercel deployment logs
2. Check browser console
3. Check Supabase logs
4. Review `CALENDAR_MEDIA_MIGRATION.md` for detailed troubleshooting

---

**Quick Copy Commands:**

```bash
# Copy migration SQL to clipboard
cat supabase/calendar_oauth_sessions.sql | pbcopy

# Verify migration after running in Supabase
SUPABASE_SERVICE_ROLE_KEY="your-key" node verify-migration.mjs

# View migration guide
cat CALENDAR_MEDIA_MIGRATION.md
```
