# Deployment Guide

## Option 1: Deploy via Vercel CLI (Recommended)

### Step 1: Login to Vercel
```bash
vercel login
```

### Step 2: Deploy
```bash
vercel
```

The CLI will guide you through:
- Project name selection
- Framework detection (Next.js)
- Build settings confirmation

### Step 3: Set Environment Variables
After deployment, go to your Vercel dashboard:
1. Select your project
2. Go to Settings > Environment Variables
3. Add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key

### Step 4: Redeploy
```bash
vercel --prod
```

## Option 2: Deploy via GitHub Integration

### Step 1: Push to GitHub
```bash
# Create GitHub repository first, then:
git remote add origin https://github.com/yourusername/digital-signage-platform.git
git branch -M main
git push -u origin main
```

### Step 2: Connect to Vercel
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Import Project"
3. Select your GitHub repository
4. Configure environment variables during setup

## Supabase Setup

### Step 1: Create Project
1. Go to [Supabase](https://supabase.com)
2. Create new project
3. Wait for provisioning (2-3 minutes)

### Step 2: Run Database Schema
1. Go to SQL Editor in Supabase dashboard
2. Copy and run contents of `supabase/schema.sql`
3. Copy and run contents of `supabase/rls_policies.sql`

### Step 3: Get API Keys
1. Go to Settings > API
2. Copy Project URL and anon public key
3. Add to Vercel environment variables

## Testing Deployment

1. Visit your deployed URL
2. You should see a redirect to `/login`
3. The login page should load without errors
4. Create a test user via Supabase Auth dashboard
5. Login and verify dashboard loads

## Troubleshooting

**Build Errors:**
- Check TypeScript errors: `npm run type-check`
- Check for missing dependencies
- Verify environment variables are set

**Authentication Issues:**
- Verify Supabase URL and keys are correct
- Check RLS policies are applied
- Ensure auth callback URL is configured

**Runtime Errors:**
- Check Vercel Function logs
- Verify database schema is applied
- Check browser console for client-side errors