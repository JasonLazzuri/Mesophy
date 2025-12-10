# OAuth Callback Debugging Guide

## Current Issue
The OAuth callback is failing with generic error: "Failed to connect calendar"

## Most Likely Causes

### 1. Session Lost After OAuth Redirect
**Problem**: After Microsoft redirects back, the user's Supabase session cookies might be lost.

**How to Check**:
- Open Dev Tools → Application tab → Cookies
- Before clicking "Connect Calendar", note the `sb-` cookies
- After OAuth redirect, check if the same cookies are still there
- If cookies are gone → session lost

**Fix**: Need to use service role key in callback for upsert, or store session differently

### 2. RLS Policy Blocking Insert
**Problem**: Row Level Security might be preventing the OAuth session insert

**How to Check**: Look for "new row violates row-level security policy" in Vercel logs

**Fix**: The policy requires `auth.uid() = user_id`, but if session is lost, auth.uid() returns null

### 3. Token Exchange Failure
**Problem**: Microsoft token exchange might be failing

**How to Check**: Vercel logs will show "Failed to exchange code for token"

**Fix**: Verify MICROSOFT_CLIENT_SECRET is correct in Vercel

## Immediate Solution

Add console.log at each step in the callback to narrow down where it fails:

```typescript
console.log('1. Got code and state')
console.log('2. User authenticated:', user.id)
console.log('3. Token exchanged')
console.log('4. User profile fetched')
console.log('5. About to insert OAuth session')
console.log('6. OAuth session inserted')
```

Then check Vercel logs to see which step fails.

## Quick Fix to Try

If the issue is session loss, modify the callback to use service role for the OAuth session insert:

```typescript
// Use service role client for OAuth session storage
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

await supabaseAdmin.from('calendar_oauth_sessions').upsert(...)
```

This bypasses RLS and ensures the session is stored even if user auth cookies are lost.
