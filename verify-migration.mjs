#!/usr/bin/env node

/**
 * Verification Script for calendar_oauth_sessions table
 * Checks if the migration has been successfully run
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gpsfsspeiuscpqmdyekt.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.log('   Run: export SUPABASE_SERVICE_ROLE_KEY="your-key-here"');
  process.exit(1);
}

async function verifyMigration() {
  try {
    console.log('🔵 Connecting to Supabase...');
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    console.log('🔵 Checking if calendar_oauth_sessions table exists...');

    // Try to query the table
    const { data, error } = await supabase
      .from('calendar_oauth_sessions')
      .select('session_id')
      .limit(1);

    if (error) {
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        console.log('');
        console.log('❌ TABLE NOT FOUND: calendar_oauth_sessions');
        console.log('');
        console.log('The migration has not been run yet.');
        console.log('');
        console.log('📋 To run the migration:');
        console.log('   1. The SQL is already in your clipboard');
        console.log('   2. Open: https://supabase.com/dashboard/project/gpsfsspeiuscpqmdyekt/sql');
        console.log('   3. Click "New Query"');
        console.log('   4. Paste the SQL (Cmd+V)');
        console.log('   5. Click "Run"');
        console.log('');
        return false;
      } else {
        throw error;
      }
    }

    console.log('');
    console.log('✅ SUCCESS: calendar_oauth_sessions table exists!');
    console.log('');
    console.log('Migration has been successfully run.');
    console.log('');
    console.log('📋 Next steps:');
    console.log('   1. Go to: https://mesophy.vercel.app/dashboard/media');
    console.log('   2. Click "Connect Calendar" button');
    console.log('   3. Authenticate with Microsoft');
    console.log('   4. Select a calendar and create media asset');
    console.log('');
    return true;

  } catch (error) {
    console.error('❌ Error verifying migration:', error.message);
    return false;
  }
}

verifyMigration().then(success => {
  process.exit(success ? 0 : 1);
});
