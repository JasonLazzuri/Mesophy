# CDN Setup Guide

This guide explains how to set up CDN integration for faster media delivery.

## Environment Variables

Add these environment variables to your `.env.local` file:

```env
# CDN Configuration (Optional)
NEXT_PUBLIC_CDN_DOMAIN=your-cdn-domain.com

# If using CloudFlare
CLOUDFLARE_ZONE_ID=your_zone_id
CLOUDFLARE_API_TOKEN=your_api_token

# If using AWS CloudFront
CLOUDFRONT_DISTRIBUTION_ID=your_distribution_id
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
```

## CDN Provider Setup

### Option 1: CloudFlare (Recommended)

1. **Create CloudFlare Account**
   - Sign up at https://cloudflare.com
   - Add your domain to CloudFlare

2. **Configure CloudFlare for Supabase Storage**
   - Go to Rules → Transform Rules → Modify Request Header
   - Create rule to proxy requests to Supabase storage
   - Set up caching rules for media files

3. **Update DNS**
   - Add CNAME record: `cdn.yourdomain.com` → `your-project.supabase.co`
   - Enable "Proxied" status (orange cloud)

4. **Configure Caching**
   - Go to Caching → Configuration
   - Set Browser Cache TTL to 1 year for media files
   - Edge Cache TTL to 1 month

### Option 2: AWS CloudFront

1. **Create CloudFront Distribution**
   - Origin Domain: `your-project.supabase.co`
   - Origin Path: `/storage/v1/object/public/media-assets`

2. **Configure Behaviors**
   - Cache Policy: Managed-CachingOptimized
   - Origin Request Policy: Managed-CORS-S3Origin
   - TTL: 31536000 seconds (1 year)

3. **Set up Custom Domain**
   - Add alternate domain name (CNAME)
   - Upload SSL certificate or use ACM

### Option 3: No CDN (Development)

If `NEXT_PUBLIC_CDN_DOMAIN` is not set, the system automatically falls back to Supabase storage URLs.

## Testing CDN Integration

1. **Upload a test image**
2. **Check network tab** - URLs should use your CDN domain
3. **Verify caching** - Second request should be cached
4. **Test failover** - CDN failures should fallback to Supabase

## Benefits

With CDN enabled, you should see:
- 60-80% faster image loading
- Reduced bandwidth costs
- Better global performance
- Automatic optimization delivery

## Cache Purging

### CloudFlare
```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

### AWS CloudFront
```bash
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

## Monitoring

Monitor CDN performance through:
- CloudFlare Analytics Dashboard
- AWS CloudWatch (for CloudFront)
- Media upload success rates in application logs

## Troubleshooting

**Images not loading:**
- Check CDN domain configuration
- Verify CORS headers
- Check network tab for 403/404 errors

**Slow performance:**
- Verify caching headers
- Check TTL settings
- Monitor cache hit ratios

**Optimization not working:**
- Check Sharp library installation
- Verify thumbnail generation in upload logs
- Check storage bucket permissions