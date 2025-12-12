# Local Development Setup Guide

This document explains how to run the digital signage platform locally for testing, and how to revert changes for production deployment.

## What We Changed for Local Development

### 1. Modified Android App API URL
**File**: `android-tv-client/app/src/main/kotlin/com/mesophy/signage/ApiClient.kt`

**Change Made** (Line 21):
```kotlin
// BEFORE (Production):
class ApiClient(private val baseUrl: String = "https://mesophy.vercel.app") {

// AFTER (Local Development):
class ApiClient(private val baseUrl: String = "http://192.168.29.216:3000") {
```

**File**: `android-tv-client/app/src/main/kotlin/com/mesophy/signage/MainActivity.kt`

**Change Made** (Line 957-965):
```kotlin
// BEFORE (Production):
fun getBaseUrl(): String? {
    val sharedPrefs = getSharedPreferences("mesophy_config", MODE_PRIVATE)
    return sharedPrefs.getString("api_base", null)
}

// AFTER (Local Development):
fun getBaseUrl(): String {
    // For local development, return the hardcoded local URL
    return "http://192.168.29.216:3000"
}
```

**Purpose**: Points the Android app to your local development server instead of production. This affects both regular API calls (through ApiClient) and calendar data fetching (through MainActivity.getBaseUrl()).

### 2. Added Network Security Configuration
**File**: `android-tv-client/app/src/main/res/xml/network_security_config.xml` (NEW FILE)

**Content**:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Allow all cleartext (HTTP) traffic for development -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
```

**Purpose**: Android 9+ blocks HTTP traffic by default. This configuration allows HTTP connections to localhost for development.

### 3. Updated Android Manifest
**File**: `android-tv-client/app/src/main/AndroidManifest.xml`

**Change Made** (Line 46):
```xml
<!-- BEFORE: -->
<application
    android:allowBackup="true"
    android:icon="@mipmap/ic_launcher"
    android:banner="@drawable/tv_banner"
    android:label="@string/app_name"
    android:supportsRtl="true"
    android:theme="@style/Theme.MesophySignage">

<!-- AFTER: -->
<application
    android:allowBackup="true"
    android:icon="@mipmap/ic_launcher"
    android:banner="@drawable/tv_banner"
    android:label="@string/app_name"
    android:supportsRtl="true"
    android:theme="@style/Theme.MesophySignage"
    android:networkSecurityConfig="@xml/network_security_config">
```

**Purpose**: References the network security configuration to enable HTTP traffic.

### 4. Calendar Token Refresh System (Production-Ready)
**Files Added**:
- `src/app/api/calendar/refresh-tokens/route.ts` - Background job to refresh tokens
- `CALENDAR_TOKEN_REFRESH.md` - Documentation
- Updated `vercel.json` with cron job configuration

**Changes Made to Existing Files**:
- `src/app/api/devices/calendar-data/route.ts` - Now saves refreshed tokens to database

**Purpose**: Automatically refreshes Microsoft OAuth tokens before they expire, so users never need to re-authenticate.

---

## How to Run Locally

### 1. Set Up Local Environment Variables
**File**: `.env.local` (in project root)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://gpsfsspeiuscpqmdyekt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

MICROSOFT_CLIENT_ID=3743c305-2ed7-4b53-b97b-5538ee400fb9
MICROSOFT_CLIENT_SECRET=dBn8Q~db...
MICROSOFT_TENANT_ID=common
```

### 2. Start the Development Server
```bash
cd /Users/ttadmin/Mesophy/digital-signage-platform
npm run dev
```

The server will start on:
- Local: `http://localhost:3000`
- Network: `http://192.168.29.216:3000` (your current IP)

### 3. Build and Install Android App
```bash
cd android-tv-client
./gradlew assembleDebug
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### 4. Connect Android Device via ADB (Wireless)
```bash
# On your Android device: Settings → Developer Options → Wireless Debugging
# Note the pairing code and IP:PORT

# Pair with device:
echo "PAIRING_CODE" | ~/Library/Android/sdk/platform-tools/adb pair <IP>:<PAIRING_PORT>

# Connect to device:
~/Library/Android/sdk/platform-tools/adb connect <IP>:<CONNECTION_PORT>
```

### 5. Test the App
- Open Mesophy app on Android device
- App will connect to local server at `http://192.168.29.216:3000`
- Generate pairing code in app
- Go to `http://192.168.29.216:3000/dashboard/screens` in browser
- Pair the device using the code
- App should sync and display media from your local database

---

## Reverting to Production

### Step 1: Revert Android App API URL
**File**: `android-tv-client/app/src/main/kotlin/com/mesophy/signage/ApiClient.kt`

**Change Line 21 back to**:
```kotlin
class ApiClient(private val baseUrl: String = "https://mesophy.vercel.app") {
```

**File**: `android-tv-client/app/src/main/kotlin/com/mesophy/signage/MainActivity.kt`

**Change Lines 957-965 back to**:
```kotlin
fun getBaseUrl(): String? {
    val sharedPrefs = getSharedPreferences("mesophy_config", MODE_PRIVATE)
    return sharedPrefs.getString("api_base", "https://mesophy.vercel.app")
}
```

### Step 2: Remove HTTP Cleartext Permission
**Delete File**: `android-tv-client/app/src/main/res/xml/network_security_config.xml`

**OR** Update it to only allow specific production domains:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Production: Only allow HTTPS -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
```

### Step 3: Revert Android Manifest
**File**: `android-tv-client/app/src/main/AndroidManifest.xml`

**Remove the networkSecurityConfig line** (Line 46):
```xml
<application
    android:allowBackup="true"
    android:icon="@mipmap/ic_launcher"
    android:banner="@drawable/tv_banner"
    android:label="@string/app_name"
    android:supportsRtl="true"
    android:theme="@style/Theme.MesophySignage">
    <!-- networkSecurityConfig line removed -->
```

### Step 4: Build Production APK
```bash
cd android-tv-client

# For debug build:
./gradlew assembleDebug

# For production release (signed):
./gradlew assembleRelease
```

### Step 5: Deploy Backend to Vercel
```bash
cd /Users/ttadmin/Mesophy/digital-signage-platform

# Commit all changes (including token refresh system)
git add .
git commit -m "Add calendar token refresh system"

# Push to trigger Vercel deployment
git push
```

**Note**: The token refresh system (`src/app/api/calendar/refresh-tokens/route.ts` and `vercel.json` cron job) is already production-ready and should be deployed.

---

## Production Deployment Checklist

### Backend (Next.js API)
- [ ] Environment variables set in Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `MICROSOFT_CLIENT_ID`
  - `MICROSOFT_CLIENT_SECRET`
  - `MICROSOFT_TENANT_ID`
- [ ] Verify Vercel Cron Job is enabled (Settings → Cron Jobs)
- [ ] Test token refresh endpoint: `https://mesophy.vercel.app/api/calendar/refresh-tokens`
- [ ] Check Vercel logs for successful token refreshes

### Android App
- [ ] Revert API URL to `https://mesophy.vercel.app`
- [ ] Remove or update network security config (no HTTP allowed)
- [ ] Update manifest to remove `networkSecurityConfig` reference
- [ ] Build signed release APK
- [ ] Test on physical device with production backend
- [ ] Verify calendar displays work without token expiration

### Database (Supabase)
- [ ] Verify `media_assets.calendar_metadata` has:
  - `access_token`
  - `refresh_token`
  - `token_expires_at`
  - `last_token_refresh`
- [ ] Test calendar OAuth flow end-to-end
- [ ] Verify tokens are being refreshed in database

---

## Testing the Token Refresh System

### Local Testing
```bash
# Manually trigger token refresh:
curl http://192.168.29.216:3000/api/calendar/refresh-tokens

# Expected response:
{
  "success": true,
  "summary": {
    "total": 1,
    "refreshed": 1,
    "skipped": 0,
    "failed": 0,
    "details": [...]
  }
}
```

### Production Testing
```bash
# Manually trigger token refresh:
curl https://mesophy.vercel.app/api/calendar/refresh-tokens

# Check Vercel logs for:
# ✅ Token refreshed successfully
# ✅ Successfully saved refreshed tokens to database
```

### Automated Testing
The Vercel Cron Job runs every 30 minutes automatically. Check Vercel Dashboard → Cron Jobs to see execution history.

---

## Network Configuration Notes

### Local Development IP Address
The Android app is currently hardcoded to `http://192.168.29.216:3000`. If your Mac's IP address changes (e.g., different WiFi network), you'll need to:

1. Check your current IP:
   ```bash
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```

2. Update `ApiClient.kt` with new IP
3. Rebuild and reinstall the Android app

### Wireless ADB Connection
If you switch networks or restart devices, you may need to re-pair:
```bash
# Check connected devices:
~/Library/Android/sdk/platform-tools/adb devices

# If disconnected, re-connect:
~/Library/Android/sdk/platform-tools/adb connect <IP>:<PORT>
```

---

## Troubleshooting

### "Request interrupted by user" Error
**Cause**: Android is blocking HTTP traffic.

**Solution**:
1. Verify `network_security_config.xml` exists and has `cleartextTrafficPermitted="true"`
2. Verify `AndroidManifest.xml` references the network config
3. Rebuild and reinstall the app

### No requests in dev server logs
**Cause**: Android device is on different network or using wrong IP.

**Solution**:
1. Verify Mac and Android device are on same WiFi
2. Check Mac IP with `ifconfig | grep "inet " | grep -v 127.0.0.1`
3. Update `ApiClient.kt` if IP changed
4. Rebuild and reinstall

### Calendar tokens still expiring
**Cause**: Cron job not running or database not being updated.

**Solution**:
1. Check Vercel Cron Job status (Dashboard → Cron Jobs)
2. Manually trigger refresh: `curl https://mesophy.vercel.app/api/calendar/refresh-tokens`
3. Check Supabase database for updated `token_expires_at` values
4. Review Vercel function logs for errors

---

## Important Files Summary

### Android App
- `android-tv-client/app/src/main/kotlin/com/mesophy/signage/ApiClient.kt` - API base URL
- `android-tv-client/app/src/main/res/xml/network_security_config.xml` - HTTP permission
- `android-tv-client/app/src/main/AndroidManifest.xml` - Network config reference

### Backend (Token Refresh System)
- `src/app/api/calendar/refresh-tokens/route.ts` - Background refresh job
- `src/app/api/devices/calendar-data/route.ts` - On-demand refresh + save
- `vercel.json` - Cron job configuration
- `CALENDAR_TOKEN_REFRESH.md` - System documentation

### Configuration
- `.env.local` - Local development environment variables
- `.gitignore` - Ensures `.env.local` is not committed

---

## Summary

### What We Accomplished
1. ✅ Set up local development environment with localhost API server
2. ✅ Configured Android app to connect to localhost
3. ✅ Enabled HTTP traffic for local development
4. ✅ Implemented calendar token refresh system (production-ready)
5. ✅ Tested end-to-end: pairing, syncing, media playback

### What's Ready for Production
- Calendar token refresh system (automatic every 30 minutes)
- Database schema updates for token storage
- Reactive token refresh on calendar data requests
- Comprehensive documentation

### What Needs to Be Done for Production
1. Revert Android app API URL to `https://mesophy.vercel.app`
2. Remove/update network security config (disable HTTP)
3. Build signed release APK
4. Deploy backend changes to Vercel
5. Verify Vercel Cron Job is running
6. Test token refresh in production

---

## Next Steps

When you're ready to deploy to production:

1. **Follow the "Reverting to Production" steps above**
2. **Deploy the token refresh system** (it's already implemented)
3. **Test with a fresh device** to ensure everything works end-to-end
4. **Monitor Vercel logs** for the first few token refresh cycles

The token refresh system will ensure that calendar tokens last forever through automatic rotation, and users will never need to re-authenticate!
