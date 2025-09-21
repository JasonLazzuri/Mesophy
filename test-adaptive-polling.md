# Adaptive Polling System Testing Guide

## Overview
This guide helps you test the restaurant-hours adaptive polling system that reduces API calls by 79% while maintaining responsive content updates.

## Prerequisites

### 1. Database Setup
Run the database schema in Supabase SQL editor:
```sql
-- Execute this file first
supabase/polling-configuration-schema.sql
```

### 2. Build Android TV App
```bash
cd android-tv-client
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### 3. Verify User Role
Ensure your user profile has `super_admin` role to access polling configuration.

## Testing Steps

### Phase 1: Admin Configuration Access

1. **Login to Dashboard**
   - Navigate to `/dashboard`
   - Verify Emergency Override control appears for super admin users

2. **Access Polling Configuration**
   - Click Admin dropdown in sidebar
   - Navigate to "Polling Config"
   - URL: `/dashboard/admin/polling-config`

3. **Test Configuration Interface**
   - Verify timezone dropdown (default: PST)
   - Check time period sliders work
   - Modify intervals and save
   - Verify usage calculator updates

### Phase 2: Emergency Override Testing

1. **Activate Emergency Mode**
   - Use Emergency Override toggle on dashboard
   - Verify status changes to "ACTIVE"
   - Check timeout countdown

2. **Test Device Response**
   - Emergency should force 15-second polling on all devices
   - Check Android TV logs for interval changes
   - Verify faster content updates

3. **Auto-Timeout Test**
   - Wait for emergency timeout (default 4 hours, can set shorter for testing)
   - Verify automatic deactivation
   - Confirm return to normal schedule

### Phase 3: Android TV Device Testing

1. **Deploy Enhanced Polling Manager**
   - Replace `ContentPollingManager` with `ContentPollingManagerEnhanced`
   - Verify device authentication still works

2. **Monitor Adaptive Intervals**
   ```bash
   adb logcat -s "ContentPollingManagerEnhanced" | grep -E "(SCHEDULE|INTERVAL|EMERGENCY)"
   ```

3. **Test Schedule Changes**
   - **6 AM - 10 AM**: Should poll every 15 seconds
   - **10 AM - 12 PM**: Should poll every 30-45 seconds  
   - **12 PM - 6 AM**: Should poll every 15 minutes

4. **Verify API Calls**
   - Monitor network requests in Android logs
   - Confirm reduced call frequency during service hours
   - Check schedule fetching every 30 minutes

### Phase 4: Cost Validation

1. **Monitor API Usage**
   - Check Vercel dashboard for function invocations
   - Compare before/after polling optimization
   - Target: 79% reduction in API calls

2. **Calculate Monthly Usage**
   - Single device: ~36,720 calls/month (vs 172,800)
   - Should stay within free tier limits
   - 232 devices: ~$98/month total cost

## Expected Results

### Normal Operation (Restaurant Hours)
- **6-10 AM**: High frequency polling (prep time)
- **10 AM-12 PM**: Moderate frequency (setup)
- **12 PM-6 AM**: Low frequency (service/overnight)

### Emergency Mode
- **All periods**: 15-second polling
- **Auto-timeout**: Returns to normal after configured hours
- **Instant activation**: All devices switch immediately

### Cost Savings
- **79% reduction** in API calls
- **Free tier compliance** for small deployments
- **Linear scaling** costs for larger deployments

## Troubleshooting

### Database Issues
```sql
-- Check polling configuration exists
SELECT * FROM polling_configurations;

-- Test get_current_polling_interval function
SELECT * FROM get_current_polling_interval('your-org-id');

-- Verify emergency override functions
SELECT activate_emergency_override('your-org-id');
SELECT deactivate_emergency_override('your-org-id');
```

### Android TV Issues
- Check device authentication still works
- Verify network connectivity
- Monitor polling manager logs for errors
- Test schedule API endpoint manually

### API Issues
- Verify super admin authentication
- Check RLS policies allow configuration access
- Test endpoints with curl/Postman
- Monitor server logs for errors

## Rollback Plan

If issues occur, you can quickly rollback:

1. **Keep existing ContentPollingManager** alongside Enhanced version
2. **Switch back** by changing class instantiation
3. **Database rollback**: Remove polling_configurations table
4. **Return to 15-second** constant polling if needed

## Success Criteria

✅ Admin can configure polling schedules  
✅ Emergency override works instantly  
✅ Android TV adapts intervals correctly  
✅ 79% reduction in API calls achieved  
✅ Costs stay within projected limits  
✅ No disruption to content delivery  
✅ Restaurant operations unaffected  

The system should provide the same reliability as before while dramatically reducing infrastructure costs and providing emergency response capabilities.