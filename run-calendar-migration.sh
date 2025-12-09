#!/bin/bash

# Calendar OAuth Sessions Migration Script
# This script helps run the database migration for calendar media integration

echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo "  📅 Calendar OAuth Sessions Table Migration"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "This migration creates the 'calendar_oauth_sessions' table required for"
echo "the new media-based calendar integration system."
echo ""
echo "📍 Migration Status: READY TO RUN"
echo "📁 Migration File: supabase/calendar_oauth_sessions.sql"
echo ""
echo "────────────────────────────────────────────────────────────────────────────"
echo "  🚀 HOW TO RUN THIS MIGRATION"
echo "────────────────────────────────────────────────────────────────────────────"
echo ""
echo "Option 1: Supabase SQL Editor (RECOMMENDED)"
echo "  1. Open: https://supabase.com/dashboard/project/gpsfsspeiuscpqmdyekt/sql"
echo "  2. Click 'New Query'"
echo "  3. Copy the contents of: supabase/calendar_oauth_sessions.sql"
echo "  4. Paste into the SQL editor"
echo "  5. Click 'Run'"
echo ""
echo "Option 2: Copy SQL Now (Quick)"
echo "  Run this command to copy the SQL to your clipboard:"
echo "  $ cat supabase/calendar_oauth_sessions.sql | pbcopy"
echo ""
echo "Option 3: View SQL"
echo "  Run this command to view the SQL:"
echo "  $ cat supabase/calendar_oauth_sessions.sql"
echo ""
echo "────────────────────────────────────────────────────────────────────────────"
echo "  ✅ AFTER RUNNING THE MIGRATION"
echo "────────────────────────────────────────────────────────────────────────────"
echo ""
echo "The following will be created:"
echo "  • calendar_oauth_sessions table"
echo "  • Row Level Security (RLS) policies"
echo "  • Indexes for performance"
echo "  • Auto-cleanup function for expired sessions"
echo ""
echo "Next steps:"
echo "  1. Test the calendar connection flow at: /dashboard/media"
echo "  2. Click 'Connect Calendar' button"
echo "  3. Authenticate with Microsoft"
echo "  4. Select a calendar and create media asset"
echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo ""

# Offer to copy SQL to clipboard
read -p "Would you like to copy the SQL to clipboard now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]
then
    cat supabase/calendar_oauth_sessions.sql | pbcopy
    echo "✅ SQL copied to clipboard!"
    echo "📋 Now paste it into Supabase SQL Editor:"
    echo "   https://supabase.com/dashboard/project/gpsfsspeiuscpqmdyekt/sql"
else
    echo "📝 Migration file location: supabase/calendar_oauth_sessions.sql"
fi

echo ""
