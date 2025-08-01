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