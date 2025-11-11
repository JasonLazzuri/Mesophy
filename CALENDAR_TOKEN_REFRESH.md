# Calendar OAuth Token Refresh System

## Overview

This system ensures **uninterrupted calendar access** by automatically refreshing Microsoft OAuth tokens before they expire. Users authenticate once and never need to log in again.

## Problem We're Solving

Microsoft OAuth tokens have limited lifespans:
- **Access Token**: Expires in 60-90 minutes
- **Refresh Token**: Lasts 90 days (but can be rotated indefinitely)

Without automatic refresh, users would need to re-authenticate:
- ❌ Every 60-90 minutes if we only used access tokens
- ❌ Every 90 days if we didn't rotate refresh tokens
- ✅ **Never** with our automatic refresh system

## Solution Architecture

### 1. Reactive Token Refresh (On-Demand)
**File**: `src/app/api/devices/calendar-data/route.ts`

When an Android TV device requests calendar data:
1. Check if access token is expired
2. If expired, use refresh token to get new access token
3. **Save new tokens to database immediately**
4. Return calendar events using fresh token

```typescript
// Lines 37-93 in route.ts
if (needsRefresh) {
  const tokens = await refreshMicrosoftToken(refresh_token)

  // Save to database (NEW - previously was just a TODO comment)
  await updateMediaAsset({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    token_expires_at: new Date(Date.now() + 60 * 60 * 1000)
  })
}
```

### 2. Proactive Token Refresh (Background Job)
**File**: `src/app/api/calendar/refresh-tokens/route.ts`

Runs automatically every 30 minutes via Vercel Cron:
1. Fetch all active calendar integrations
2. Check which tokens expire within 10 minutes
3. Refresh those tokens proactively
4. Save updated tokens to database
5. Report success/failure for each calendar

**Benefits**:
- Tokens never expire during active use
- Refresh tokens get rotated regularly (maintaining indefinite access)
- No interruption to calendar display on devices

### 3. Automated Scheduling
**File**: `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/calendar/refresh-tokens",
      "schedule": "*/30 * * * *"  // Every 30 minutes
    }
  ]
}
```

Vercel automatically calls the refresh endpoint every 30 minutes in production.

## Token Lifecycle

```
User authenticates → Initial tokens saved
         ↓
Every 30 minutes: Background job checks expiration
         ↓
Token expiring soon? → Refresh and save new tokens
         ↓
Refresh token rotated → New 90-day window begins
         ↓
Repeat indefinitely (user never needs to re-authenticate)
```

## Database Schema

Tokens are stored in `media_assets.calendar_metadata`:

```json
{
  "access_token": "eyJ0eXAi...",           // 60-90 min lifespan
  "refresh_token": "1.AScAD4Ld...",        // 90 day lifespan (rotates)
  "token_expires_at": "2025-11-07T12:00:00Z",
  "last_token_refresh": "2025-11-07T11:30:00Z",
  "calendar_id": "AQMkADlk...",
  "provider": "microsoft",
  // ... other calendar metadata
}
```

## Manual Testing

### Test On-Demand Refresh
Trigger a calendar data request from Android TV or use curl:

```bash
curl -X POST https://your-domain.vercel.app/api/devices/calendar-data \
  -H "Content-Type: application/json" \
  -d '{"calendar_metadata": {...}}'
```

Check logs for:
- `🔄 Access token expired, refreshing...`
- `✅ Token refreshed successfully`
- `💾 Saving refreshed tokens to database...`
- `✅ Successfully saved refreshed tokens to database`

### Test Background Refresh Job
Manually trigger the cron job:

```bash
curl https://your-domain.vercel.app/api/calendar/refresh-tokens
```

Response shows refresh status for all calendars:

```json
{
  "success": true,
  "summary": {
    "total": 3,
    "refreshed": 1,
    "skipped": 2,
    "failed": 0,
    "details": [
      {
        "calendar": "Conference Room A",
        "status": "refreshed",
        "new_expires_at": "2025-11-07T13:00:00Z"
      },
      {
        "calendar": "Reception Display",
        "status": "skipped",
        "reason": "token_still_valid",
        "minutes_remaining": "45.2"
      }
    ]
  }
}
```

## Monitoring

### Production Logs
View token refresh activity in Vercel logs:

```
🔄 Starting proactive token refresh for all calendars...
📅 Found 5 active calendar(s) to refresh
🔍 Processing calendar: Conference Room A
⏰ Token expires at: 2025-11-07T12:05:00Z
⏰ Minutes until expiry: 8.3
🔄 Refreshing token for Conference Room A...
💾 Saving refreshed tokens for Conference Room A...
✅ Successfully refreshed tokens for Conference Room A
```

### Failure Scenarios

**Refresh Token Expired (90 days)**:
```
❌ Failed to refresh token for Conference Room A
Error: invalid_grant - Refresh token has expired
```
**Action Required**: User must re-authenticate in portal

**Database Update Failed**:
```
✅ Token refreshed successfully
❌ Failed to save tokens to database: 500
```
**Impact**: Temporary - token will be refreshed again in 30 minutes

## Deployment

### 1. Deploy to Vercel
```bash
git add .
git commit -m "Add automatic calendar token refresh system"
git push
```

Vercel automatically:
- Deploys the new API endpoints
- Enables the cron job (requires Pro plan or higher)
- Starts refreshing tokens every 30 minutes

### 2. Verify Cron Job Setup
1. Go to Vercel Dashboard → Project → Settings → Cron Jobs
2. Confirm `/api/calendar/refresh-tokens` appears with schedule `*/30 * * * *`
3. Check "Last Run" timestamp after deployment

### 3. First-Time Setup
After deployment, users with existing calendars need to:
1. Re-authenticate once in the portal (Settings → Calendar Connections)
2. This initializes fresh tokens with proper expiration tracking
3. From then on, tokens refresh automatically forever

## Vercel Cron Job Requirements

**Important**: Vercel Cron Jobs require:
- **Pro Plan** ($20/month) or higher
- **Production deployments only** (does not run in development)
- **Reliable execution** every 30 minutes

### Alternative for Hobby Plan
If you're on Vercel's Hobby plan, use an external cron service:

**Option 1: Cron-job.org** (Free)
1. Sign up at https://cron-job.org
2. Create job: `https://your-domain.vercel.app/api/calendar/refresh-tokens`
3. Schedule: Every 30 minutes

**Option 2: EasyCron** (Free tier available)
1. Sign up at https://www.easycron.com
2. Create job with your endpoint
3. Schedule: `*/30 * * * *`

**Option 3: GitHub Actions** (Free)
Create `.github/workflows/refresh-tokens.yml`:

```yaml
name: Refresh Calendar Tokens
on:
  schedule:
    - cron: '*/30 * * * *'  # Every 30 minutes
  workflow_dispatch:  # Manual trigger

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Token Refresh
        run: |
          curl -X POST https://your-domain.vercel.app/api/calendar/refresh-tokens
```

## Security Considerations

1. **Tokens stored securely** in Supabase (RLS policies enforce access control)
2. **API endpoint is public** but requires valid calendar data to work
3. **Refresh tokens are single-use** (Microsoft rotates them on each refresh)
4. **Service role key required** for database updates (not exposed to clients)

## Troubleshooting

### Tokens Still Expiring
**Check**:
1. Is cron job running? (Vercel Dashboard → Cron Jobs → Last Run)
2. Are logs showing refresh attempts? (Check Vercel Function Logs)
3. Are database updates succeeding? (Look for `✅ Successfully saved`)

### Re-authentication Required
**When This Happens**:
- Refresh token expired (90 days without rotation)
- Microsoft revoked access (user changed password, security policy)
- Calendar connection was deleted and recreated

**Solution**: User must reconnect calendar in portal

### High API Usage
Each calendar refreshes every 30 minutes:
- 1 calendar = ~48 refreshes/day = 1,440/month
- 10 calendars = ~480 refreshes/day = 14,400/month

Vercel function invocations are generous, but monitor usage if you have many calendars.

## Future Improvements

1. **Configurable Refresh Interval**: Allow per-calendar refresh schedules
2. **Exponential Backoff**: Reduce refresh frequency for calendars that rarely change
3. **Webhook Support**: Use Microsoft Graph change notifications instead of polling
4. **Multi-Provider Support**: Extend to Google Calendar, Apple Calendar, etc.

## Summary

✅ **Users authenticate once**
✅ **Tokens refresh automatically every 30 minutes**
✅ **Refresh tokens rotate to maintain indefinite access**
✅ **No manual re-authentication required (unless tokens revoked)**
✅ **Runs in background without user intervention**

**Result**: Calendar integrations work forever without user maintenance.
