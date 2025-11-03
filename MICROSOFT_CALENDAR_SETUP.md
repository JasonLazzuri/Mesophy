# Microsoft Outlook Calendar Integration Setup

This document explains how to configure Microsoft Outlook calendar integration for the Mesophy Digital Signage platform.

## Overview

The calendar integration allows screens to display real-time room availability, meeting schedules, and countdown timers for conference rooms and event spaces.

## Azure AD App Registration

To enable Microsoft Calendar integration, you need to register an application in Azure Active Directory.

### Step 1: Create Azure AD App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Configure the app:
   - **Name**: Mesophy Digital Signage
   - **Supported account types**: Accounts in any organizational directory (Any Azure AD directory - Multitenant)
   - **Redirect URI**:
     - Platform: Web
     - URI: `https://your-domain.com/api/calendar/microsoft/callback`
     - For local development: `http://localhost:3000/api/calendar/microsoft/callback`

5. Click **Register**

### Step 2: Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph** > **Delegated permissions**
4. Add the following permissions:
   - `openid`
   - `profile`
   - `email`
   - `offline_access`
   - `Calendars.Read`
   - `Calendars.Read.Shared`

5. Click **Add permissions**
6. Click **Grant admin consent** (if you're an admin) or request admin consent

### Step 3: Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Description: "Mesophy Production Secret"
4. Expires: Choose expiration period (recommended: 24 months)
5. Click **Add**
6. **IMPORTANT**: Copy the secret value immediately - you won't be able to see it again!

### Step 4: Note Your Credentials

You'll need these values for your environment variables:
- **Application (client) ID**: Found on the app's Overview page
- **Client secret**: The value you just copied
- **Redirect URI**: Must match what you configured in Step 1

## Environment Variables

Add these to your `.env.local` file:

```bash
# Microsoft Calendar Integration
MICROSOFT_CLIENT_ID=your-application-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret-value
```

The redirect URI is automatically constructed as: `${NEXT_PUBLIC_SITE_URL}/api/calendar/microsoft/callback`

## Database Setup

Run the calendar integration SQL schema:

```bash
# Using Supabase SQL Editor, run:
supabase/calendar_integration.sql
```

This creates:
- `calendar_connections` table - Stores OAuth credentials per screen
- `calendar_events_cache` table - Caches events to reduce API calls
- RLS policies for multi-tenant security
- Indexes for performance

## How It Works

### 1. Dashboard Configuration Flow

1. User goes to Screen details page in dashboard
2. Clicks "Connect Microsoft Calendar"
3. Redirected to Microsoft login to authorize
4. After authorization, user selects which calendar to use (e.g., "Conference Room A")
5. Calendar is now connected to that specific screen

### 2. Device Display Flow

1. Android TV device calls `/api/devices/[deviceId]/calendar`
2. API fetches current and next events from Microsoft Graph
3. Events are cached in database for performance
4. Device displays:
   - **If room is available**: "Room Available - Open until [time]"
   - **If meeting in progress**: Organizer name, end time, countdown
   - **If back-to-back**: Shows next meeting details

### 3. Token Refresh

- Access tokens expire after 1 hour
- System automatically refreshes using refresh token
- If refresh fails, admin is notified to reconnect

## API Endpoints

### For Dashboard

- `GET /api/calendar/microsoft/auth?screen_id={id}` - Initiate OAuth flow
- `GET /api/calendar/microsoft/callback` - OAuth callback handler
- `GET /api/calendar/connections/[screenId]` - Get calendar connection status
- `PATCH /api/calendar/connections/[screenId]` - Update calendar settings
- `DELETE /api/calendar/connections/[screenId]` - Disconnect calendar
- `GET /api/calendar/connections/[screenId]/calendars` - List available calendars

### For Devices

- `GET /api/devices/[deviceId]/calendar` - Get today's events and room status

## Security Considerations

### Token Storage

- Access tokens and refresh tokens are stored in the database
- **TODO**: Implement encryption at rest for sensitive tokens
- Consider using a secrets management service (e.g., HashiCorp Vault)

### Row Level Security

- Calendar connections are protected by RLS policies
- Users can only access calendars for screens in their organization
- Devices can only access their own screen's calendar

### Privacy Settings

Calendar connections support privacy controls:
- `show_organizer` - Show or hide meeting organizer names
- `show_attendees` - Show or hide attendee list
- `show_private_details` - Show or hide details of private meetings

## Troubleshooting

### "Failed to refresh access token"

**Cause**: Refresh token expired or revoked
**Solution**: Reconnect the calendar from dashboard

### "Calendar connected but no calendar selected"

**Cause**: User authorized but didn't select a specific calendar
**Solution**: Go to screen settings and select a calendar

### "No active calendar connection"

**Cause**: Calendar was disconnected or deactivated
**Solution**: Reconnect calendar from screen settings

## Rate Limits

Microsoft Graph API has rate limits:
- 10,000 requests per 10 minutes per app
- Recommendation: Fetch calendar every 5-10 minutes per screen
- Cache events locally to reduce API calls

## Next Steps

1. Register Azure AD app
2. Configure environment variables
3. Run database migration
4. Build dashboard UI for calendar management
5. Build Android TV calendar display widget
6. Test with real conference room calendar

## Future Enhancements

- Support for Google Calendar
- Support for multiple calendars per screen
- Calendar event creation from displays
- Integration with room booking systems
- Analytics on room utilization
