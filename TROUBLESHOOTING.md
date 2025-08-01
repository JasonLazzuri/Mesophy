# Troubleshooting Guide

## Critical Issue: Supabase Admin Operations Failing

### Symptoms
- API routes exist and deploy correctly
- Environment variables are configured in Vercel  
- Service role key is valid and present
- But admin operations fail with errors like:
  - `"m.auth.admin.getUserByEmail is not a function"`
  - `"Admin client missing getUserByEmail method"`
  - Admin client only shows `["url", "headers", "fetch", "mfa"]` methods

### Root Cause
**The Supabase JavaScript client library fails to expose admin user management methods in Vercel's serverless environment, even with a valid service role key.**

This is a known issue where:
1. The service role key is valid (confirmed by direct REST API calls)
2. Environment variables are accessible 
3. But the JS client `adminClient.auth.admin` object lacks required methods
4. Methods like `getUserByEmail`, `createUser`, `deleteUser`, `inviteUserByEmail` are missing

### Diagnostic Steps
1. **Test direct REST API access:**
   ```javascript
   // This works - proves service key is valid
   const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
     headers: {
       'Authorization': `Bearer ${SERVICE_KEY}`,
       'apikey': SERVICE_KEY
     }
   })
   ```

2. **Check JS client admin methods:**
   ```javascript
   const adminClient = createClient(url, serviceKey)
   console.log('Available methods:', Object.keys(adminClient.auth.admin))
   // Shows: ["url", "headers", "fetch", "mfa"] instead of expected user methods
   ```

### Solution
**Replace all Supabase JavaScript client admin operations with direct REST API calls.**

#### Before (Broken):
```javascript
const adminClient = createClient(url, serviceKey)
const { data, error } = await adminClient.auth.admin.getUserByEmail(email)
```

#### After (Working):
```javascript
const response = await fetch(`${url}/auth/v1/admin/users`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'Content-Type': 'application/json'
  }
})
const users = await response.json()
const existingUser = users.users?.find(u => u.email === email)
```

### Complete API Replacements

#### 1. Check User Exists
```javascript
// OLD: adminClient.auth.admin.getUserByEmail(email)
const response = await fetch(`${url}/auth/v1/admin/users`)
const users = await response.json()
const existingUser = users.users?.find(u => u.email === email)
```

#### 2. Create User
```javascript
// OLD: adminClient.auth.admin.createUser({ email, ... })
const response = await fetch(`${url}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email,
    email_confirm: !sendInvitation,
    user_metadata: { full_name, role, organization_id }
  })
})
const newUser = await response.json()
```

#### 3. Delete User
```javascript
// OLD: adminClient.auth.admin.deleteUser(userId)
await fetch(`${url}/auth/v1/admin/users/${userId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey
  }
})
```

#### 4. Send Invitation
```javascript
// OLD: adminClient.auth.admin.inviteUserByEmail(email, options)
await fetch(`${url}/auth/v1/admin/users/${userId}/invite`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    redirect_to: callbackUrl
  })
})
```

### Additional RLS Issue
When creating user profiles in the database, use an admin Supabase client to bypass Row Level Security policies:

```javascript
// Use admin client for database operations that bypass RLS
const adminSupabase = createClient(url, serviceKey)
const { data } = await adminSupabase.from('user_profiles').insert(...)
```

### Prevention
1. **Always test admin operations with direct REST API first** to verify service key validity
2. **Use REST API for all admin user management operations** in serverless environments
3. **Keep JavaScript client for regular database operations** (with proper auth context)
4. **Use admin client for database operations that need to bypass RLS**

### Files Affected
- `/src/app/api/users/route.ts` - Main user creation endpoint
- Any other endpoints that need admin user management operations

This solution resolved persistent 500 errors and made user creation fully functional.

## Database Schema Alignment Issues

### Symptoms
- API returns `PGRST204` errors about missing columns
- Frontend form submits data but backend fails to create records
- Error messages like: `"Could not find the 'column_name' column of 'table_name' in the schema cache"`
- TypeScript types don't match actual database schema

### Root Cause
**Mismatch between frontend form fields, API expectations, and actual database schema.**

This commonly happens when:
1. Database schema is updated but TypeScript types aren't updated
2. Form fields reference non-existent database columns
3. API tries to insert data into columns that don't exist
4. Enum values in code don't match database enum definitions

### Diagnostic Steps
1. **Check actual database schema:**
   - Look at `supabase/schema.sql` for table definitions
   - Verify column names and data types
   - Check enum values defined in database

2. **Compare with TypeScript types:**
   - Check `src/types/database.ts` for type definitions
   - Ensure enum types match database enums
   - Verify table schemas match database tables

3. **Review API and form code:**
   - Check what fields the API is trying to insert
   - Verify form fields match database columns
   - Ensure validation uses correct enum values

### Example: Screens Table Schema Mismatch

#### Problem
- Database had: `last_seen`, enum `('ad_device', 'menu_board', 'employee_board')`
- API tried to insert: `last_heartbeat`, `ip_address`, `firmware_version`
- TypeScript types had: different enum values, wrong column names

#### Solution Steps

1. **Update TypeScript types to match database:**
```typescript
// Before: Wrong enum values
export type ScreenType = 'menu_board' | 'promotional' | 'queue_display' | 'outdoor_sign'

// After: Match database enum
export type ScreenType = 'ad_device' | 'menu_board' | 'employee_board'

// Before: Wrong column names
last_heartbeat: string | null
ip_address: string | null
firmware_version: string | null

// After: Match database schema
last_seen: string | null
// Remove non-existent columns
```

2. **Update API to only use existing columns:**
```javascript
// Before: Trying to insert non-existent columns
const screenData = {
  location_id,
  name,
  screen_type,
  device_id,
  ip_address: ip_address?.trim() || null,          // ❌ Column doesn't exist
  firmware_version: firmware_version?.trim() || null, // ❌ Column doesn't exist
  last_heartbeat: null                            // ❌ Wrong column name
}

// After: Only use existing columns
const screenData = {
  location_id,
  name,
  screen_type,
  device_id: device_id?.trim() || null,
  device_status: 'offline',
  resolution: screenResolution,
  orientation: screenOrientation,
  is_active: true,
  last_seen: null                                 // ✅ Correct column name
}
```

3. **Update frontend form to match:**
```typescript
// Remove form fields for non-existent columns
const [formData, setFormData] = useState({
  location_id: '',
  name: '',
  screen_type: 'menu_board' as ScreenType,
  device_id: '',
  resolution: '1920x1080',
  orientation: 'landscape' as Orientation
  // Removed: ip_address, firmware_version
})
```

4. **Update form options to use correct enum values:**
```tsx
{/* Before: Wrong enum values */}
<option value="promotional">📢 Promotional Display</option>
<option value="queue_display">👥 Queue Display</option>
<option value="outdoor_sign">🏪 Outdoor Sign</option>

{/* After: Match database enum */}
<option value="ad_device">📢 Advertisement Display</option>
<option value="employee_board">👥 Employee Board</option>
```

### Prevention
1. **Keep schema.sql as single source of truth** for database structure
2. **Update TypeScript types immediately** when database schema changes
3. **Validate API requests against actual database columns** before deployment
4. **Use database introspection tools** to generate types automatically when possible
5. **Test form submissions on development** before pushing to production

### Files Typically Affected
- `src/types/database.ts` - Type definitions
- `src/app/api/[entity]/route.ts` - API endpoints
- `src/app/dashboard/[entity]/add/page.tsx` - Form components
- `supabase/schema.sql` - Database schema reference

This systematic approach prevents PGRST204 column errors and ensures frontend-backend-database alignment.