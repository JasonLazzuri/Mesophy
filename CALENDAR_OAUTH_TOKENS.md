# Calendar OAuth Token Management

## Overview

The Microsoft Outlook calendar integration uses OAuth 2.0 for authentication. This document explains how tokens work and what happens when they expire.

## Token Types

### Access Token
- **Lifespan**: 60-90 minutes
- **Purpose**: Used to make API calls to Microsoft Graph
- **Behavior**: Automatically refreshed using the refresh token

### Refresh Token
- **Lifespan**: 90 days (with inactivity expiration)
- **Purpose**: Used to obtain new access tokens
- **Behavior**: Can become invalid and require re-authentication

## Token Expiration Scenarios

### Scenario 1: Access Token Expires (Normal)
✅ **Handled Automatically**
1. Android TV detects expired access token
2. API calls `refreshMicrosoftToken()` with refresh token
3. New access token obtained
4. Calendar data fetched successfully

### Scenario 2: Refresh Token Expires (Requires Action)
❌ **Requires Re-Authentication**

Refresh tokens expire due to:
- **90 days of inactivity** - Not used for 90 days
- **Password changes** - User changed Microsoft account password
- **Security policy** - Organization admin enforced re-auth
- **Manual revocation** - User revoked app permissions

**Symptoms:**
- Android TV shows "Failed to load calendar" error
- API logs show: `❌ Failed to refresh token`
- API returns 401 with `OAUTH_TOKEN_EXPIRED` error code

**Solution:**
1. Portal admin visits Media Assets page
2. Finds the calendar media asset
3. Clicks "Re-authenticate Calendar"
4. Completes Microsoft OAuth flow
5. New tokens saved to database
6. Android TV automatically fetches events on next sync

## Error Response Format

When refresh token expires, API returns:

```json
{
  "error": "Calendar authentication expired",
  "error_code": "OAUTH_TOKEN_EXPIRED",
  "details": "Please re-authenticate this calendar in the portal",
  "message": "The calendar connection has expired and needs to be re-authorized. Please visit the portal to reconnect."
}
```

## Implementation Details

### Token Storage
Tokens are stored in `media_assets.calendar_metadata`:
```json
{
  "access_token": "eyJ0...",
  "refresh_token": "0.AX...",
  "token_expires_at": "2025-11-06T15:30:00Z",
  "calendar_id": "AQMk...",
  "calendar_name": "Conference Room A",
  "timezone": "America/Los_Angeles"
}
```

### Automatic Refresh Flow
1. Android TV fetches content from `/api/screens/[id]/current-content`
2. Calendar metadata includes `token_expires_at`
3. Android TV calls `/api/devices/calendar-data` with metadata
4. API checks if `token_expires_at` is in the past
5. If expired, API attempts refresh:
   ```typescript
   const tokens = await refreshMicrosoftToken(calendar_metadata.refresh_token)
   ```
6. If successful, new tokens used for this request
7. If failed, returns 401 with re-auth instructions

### Future Improvements

**TODO: Automatic Token Update in Database**
Currently, refreshed tokens are only used for the current request. They should be:
1. Saved back to `media_assets.calendar_metadata`
2. Propagated to all devices on next sync
3. Prevents repeated refresh attempts

**TODO: Portal Notification System**
When refresh token expires:
1. Set flag in database: `calendar_metadata.needs_reauth = true`
2. Show warning in portal UI: "Calendar authentication expired"
3. Provide one-click re-authentication button

**TODO: Token Refresh Testing**
- Test token refresh with expired access tokens
- Test graceful failure with expired refresh tokens
- Test re-authentication flow in portal

## Best Practices

### For Developers
- Always check `token_expires_at` before making Graph API calls
- Handle 401 errors gracefully with user-friendly messages
- Log token refresh attempts for debugging

### For Portal Users
- Re-authenticate calendars every 60-90 days
- Watch for "Failed to load calendar" errors on displays
- Keep calendar connections active with regular use

### For System Administrators
- Monitor token refresh failures in logs
- Set up alerts for repeated 401 errors
- Document re-authentication process for end users

## Troubleshooting

### "Failed to load calendar" on Android TV
1. Check API logs for token refresh errors
2. Verify `token_expires_at` timestamp in database
3. Confirm refresh token is not expired
4. Re-authenticate calendar in portal

### Token refresh succeeds but events don't load
1. Check Microsoft Graph API permissions
2. Verify calendar_id is still valid
3. Confirm user still has access to calendar
4. Check for network/firewall issues

### Re-authentication doesn't work
1. Verify Microsoft OAuth app is configured correctly
2. Check redirect URIs match portal domain
3. Confirm API permissions include `Calendars.Read`
4. Test OAuth flow in browser developer tools
