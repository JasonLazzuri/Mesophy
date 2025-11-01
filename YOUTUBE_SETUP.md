# YouTube Video Download Setup

This guide explains how to enable YouTube video downloading in your digital signage platform.

## Why This Is Needed

YouTube has bot detection that blocks automated video downloads. To bypass this, you need to provide authentication tokens that make your requests appear as legitimate user activity.

## Quick Setup (5 minutes)

### Step 1: Generate Tokens

Use the YouTube Trusted Session Generator to create authentication tokens:

1. **Visit the generator**: https://github.com/iv-org/youtube-trusted-session-generator

2. **Follow their instructions** to generate:
   - `poToken` - Authentication token
   - `visitorData` - Session identifier

3. **Copy both tokens** - You'll need them in the next step

### Step 2: Add Tokens to Environment Variables

#### For Local Development:

Create or edit `.env.local` in your project root:

```bash
YOUTUBE_PO_TOKEN=your_po_token_here
YOUTUBE_VISITOR_DATA=your_visitor_data_here
```

#### For Production (Vercel):

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add two new variables:
   - Name: `YOUTUBE_PO_TOKEN`, Value: (paste your token)
   - Name: `YOUTUBE_VISITOR_DATA`, Value: (paste your visitor data)
4. Click **Save**
5. **Redeploy** your application for changes to take effect

### Step 3: Test

1. Go to your media library
2. Click "Add YouTube Video"
3. Paste any YouTube URL (including embedding-disabled videos)
4. Click "Validate" then "Add to Library"
5. Video should download successfully (30-60 seconds)

## How It Works

```
Your App → ytdl-core (with poToken) → YouTube API → Video Download → Supabase Storage
```

The tokens authenticate your requests to YouTube, bypassing bot detection and allowing downloads of:
- ✅ Embedding-disabled videos
- ✅ Age-restricted content
- ✅ Any public YouTube video

## Token Lifespan

- **poToken**: Valid for several months
- **visitorData**: Paired with poToken

Tokens are automatically refreshed by the ytdl-core library, so you typically only need to set them up once.

## Troubleshooting

### "Sign in to confirm you're not a bot" Error

**Cause**: Missing or expired tokens

**Solution**:
1. Generate new tokens using the generator above
2. Update your environment variables
3. Redeploy (for production)

### Video Download Fails

**Possible causes**:
- Video is private or removed
- Video is region-blocked
- Tokens are expired (rare)

**Solution**: Try a different video first to confirm tokens are working

## Legal Disclaimer

This functionality downloads videos from YouTube, which may violate YouTube's Terms of Service.

**Recommendations**:
- Use for personal/private digital signage only
- Do not use for commercial purposes without proper licensing
- Respect copyright and obtain necessary permissions for public performance
- Consider this a development/testing feature

## Alternative: Embedding Only

If you prefer to avoid downloading, you can:
1. Only use videos that allow embedding
2. Remove the download functionality
3. Stick with standard YouTube iframe embeds

This is more restrictive but fully compliant with YouTube's ToS.
