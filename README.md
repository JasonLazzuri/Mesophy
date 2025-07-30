# Digital Signage Platform

Enterprise digital signage management system for restaurant chains. Built with Next.js, Supabase, and designed for Vercel deployment.

## 🚀 Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/digital-signage-platform)

## 📋 Setup Instructions

### 1. Create Supabase Project
1. Go to [Supabase](https://supabase.com) and create a new project
2. Wait for the project to be ready (2-3 minutes)

### 2. Set up Database
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run the contents of `supabase/schema.sql` first
4. Then run the contents of `supabase/rls_policies.sql`

### 3. Configure Environment Variables
1. In Supabase, go to **Settings** > **API**
2. Copy your **Project URL** and **anon public key**
3. Set these as environment variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 4. Deploy to Vercel
```bash
# Login to Vercel
vercel login

# Deploy
vercel

# Or deploy directly from GitHub
# Push to GitHub and connect in Vercel dashboard
```

## 🏗️ Architecture

**Hierarchical Structure:**
- Organizations → Districts → Locations → Screens

**User Roles:**
- `super_admin` - Full organization access
- `district_manager` - Manages 50+ locations
- `location_manager` - Single location access

**Tech Stack:**
- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS
- **Database**: Supabase (PostgreSQL + Row Level Security)  
- **Auth**: Supabase Auth with role-based permissions
- **Deployment**: Vercel

## 🎯 Features

- ✅ Multi-tenant architecture with data isolation
- ✅ Role-based authentication and permissions
- ✅ Responsive dashboard interface
- ✅ Real-time data synchronization
- 🚧 Media management system
- 🚧 Scheduling system
- ⏳ Raspberry Pi device integration

## 🛠️ Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Type checking
npm run type-check

# Linting
npm run lint
```

## 📚 Documentation

See [CLAUDE.md](./CLAUDE.md) for detailed development guidance and architecture information.

## 🔐 Security

- Row Level Security (RLS) policies enforce data isolation
- JWT-based authentication via Supabase
- Role-based access control throughout the application
- Secure API routes with middleware protection

## 📱 Device Integration

Designed for Raspberry Pi devices that will:
- Authenticate via Supabase API
- Receive real-time content updates
- Report device status and logs
- Play scheduled media content

---

Built with ❤️ using modern web technologies for enterprise-scale digital signage management.
