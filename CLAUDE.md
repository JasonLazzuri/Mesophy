# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Digital Signage Platform - A cloud-first enterprise solution for managing restaurant digital signage networks. Built with Next.js, Supabase, and designed for deployment on Vercel/Render.

**Architecture:** Hierarchical multi-tenant structure: Organizations → Districts → Locations → Screens

**Tech Stack:**
- Frontend: Next.js 15 with TypeScript, Tailwind CSS
- Database & Auth: Supabase (PostgreSQL + Row Level Security)
- Deployment: Vercel (frontend) + Render (backend services if needed)
- Hardware: Raspberry Pi devices for media playback

## Key Development Commands

```bash
# Development
npm run dev

# Build and deployment check
npm run build

# Type checking
npm run type-check    # Check if this command exists in package.json

# Linting
npm run lint
```

## Database Setup

1. **Schema Setup:** Run `supabase/schema.sql` in Supabase SQL editor
2. **RLS Policies:** Run `supabase/rls_policies.sql` in Supabase SQL editor
3. **Environment Variables:** Configure `.env.local` with Supabase credentials

## Architecture & Data Model

**Core Entities:**
- `organizations` - Top-level restaurant chains
- `districts` - Regional divisions within organizations  
- `locations` - Individual restaurant locations
- `screens` - Physical display devices (3-4 types per location)
- `user_profiles` - Extends Supabase auth.users with roles and hierarchy
- `media_assets` - Videos/images for display
- `playlists` - Organized media collections
- `schedules` - Time-based content scheduling

**User Roles & Permissions:**
- `super_admin` - Full organization access
- `district_manager` - District-level access (50+ locations)
- `location_manager` - Single location access

**Security:** Row Level Security (RLS) enforces multi-tenant data isolation based on user roles and organizational hierarchy.

## File Structure

```
src/
├── app/                    # Next.js App Router
│   ├── dashboard/         # Protected dashboard pages
│   ├── login/             # Authentication
│   └── auth/              # Auth callbacks
├── components/            # Reusable UI components
├── hooks/                 # Custom React hooks (useAuth)
├── lib/                   # Utilities and configurations
│   └── supabase/         # Supabase client configs
└── types/                 # TypeScript definitions
supabase/                  # Database schema and policies
```

## Development Guidelines

**Authentication Flow:**
- Middleware redirects unauthenticated users to `/login`
- `useAuth` hook provides user state and role-based permissions
- `ProtectedRoute` component wraps protected pages

**Data Access Patterns:**
- All database queries automatically filtered by RLS policies
- Use Supabase client for real-time subscriptions
- Helper functions in RLS policies determine user access levels

**Component Architecture:**
- Dashboard uses responsive sidebar layout
- Role-based navigation rendering
- Loading states for all async operations

## Deployment Notes

**Vercel Deployment:**
- Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Automatic deployments from Git pushes
- Middleware handles authentication redirects

**Future Raspberry Pi Integration:**
- Devices authenticate via Supabase API
- Real-time content updates using Supabase subscriptions
- Device status monitoring through `device_logs` table

## Current Implementation Status

✅ Core infrastructure (auth, database, RLS)
✅ Dashboard layout and navigation  
✅ CRUD operations for organizations/districts/locations/users/screens/media/playlists/schedules
✅ **SECURITY HARDENING COMPLETED** (August 2025)
🚧 Media management system
⏳ Scheduling system  
⏳ Raspberry Pi device integration

## Security Improvements (August 2025)

**CRITICAL SECURITY ISSUES RESOLVED:**

1. **✅ Row Level Security (RLS) Policies Fixed**
   - File: `supabase/secure_rls_policies.sql`
   - Fixed infinite recursion in helper functions
   - Restored proper multi-tenant data isolation
   - Implemented role-based access controls

2. **✅ Authentication Standardization**
   - Fixed Users API inconsistent authentication (was using service keys directly)
   - All API endpoints now use standard Supabase authentication
   - Consistent 401 Unauthorized responses across all endpoints

3. **✅ Debug Endpoint Security**
   - Secured `/api/debug/*` endpoints with authentication and authorization
   - Production-disabled (return 404 in production)
   - Super admin access required
   - No sensitive data exposure

4. **✅ Missing Organizations API**
   - Implemented complete Organizations CRUD API
   - `/api/organizations` (GET, POST)
   - `/api/organizations/[id]` (GET, PUT, DELETE)

5. **✅ Middleware Security Enabled**
   - Restored middleware with proper authentication
   - Request validation and security headers
   - Role-based access control
   - API access logging and bot protection

6. **✅ Secure Authentication System**
   - Replaced insecure `simple-auth` bypass mechanism
   - Created `src/lib/secure-auth.ts` with proper JWT validation
   - Deprecated dangerous authentication patterns

7. **✅ Standardized Error Handling**
   - Created `src/lib/api-responses.ts`
   - Consistent error response formats
   - Pre-defined error types and success responses
   - Comprehensive validation helpers

**SECURITY STATUS:** ✅ **PRODUCTION READY**

**Files Added:**
- `supabase/secure_rls_policies.sql` - Fixed RLS policies
- `src/lib/secure-auth.ts` - Secure authentication system
- `src/lib/api-responses.ts` - Standardized API responses
- `src/app/api/organizations/route.ts` - Organizations API
- `src/app/api/organizations/[id]/route.ts` - Individual organization API
- `SECURITY_NOTES.md` - Security documentation

**Files Updated:**
- `middleware.ts` - Enabled security middleware
- `src/app/api/users/route.ts` - Standardized authentication
- `src/app/api/screens/route.ts` - Removed insecure simple-auth
- `src/app/api/debug/*/route.ts` - Secured debug endpoints
- `src/lib/simple-auth.ts` - Deprecated with secure replacement