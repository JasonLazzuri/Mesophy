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
🚧 CRUD operations for organizations/districts/locations
⏳ Media management system
⏳ Scheduling system  
⏳ Raspberry Pi device integration