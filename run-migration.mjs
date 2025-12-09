#!/usr/bin/env node

/**
 * Migration Runner for calendar_oauth_sessions table
 * Runs the SQL migration using Supabase REST API
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gpsfsspeiuscpqmdyekt.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

async function runMigration() {
  try {
    console.log('🔵 Reading migration file...');
    const migrationSQL = readFileSync(
      join(__dirname, 'supabase', 'calendar_oauth_sessions.sql'),
      'utf-8'
    );

    console.log('🔵 Connecting to Supabase...');
    console.log(`📍 URL: ${SUPABASE_URL}`);

    // Use Supabase's SQL execution endpoint
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        query: migrationSQL
      })
    });

    if (!response.ok) {
      // Try alternative: Use PostgREST to check if table exists
      console.log('🔵 Trying alternative approach...');
      console.log('⚠️  Note: This migration needs to be run in Supabase SQL Editor');
      console.log('');
      console.log('📋 Copy the following SQL and run it in:');
      console.log('   https://supabase.com/dashboard/project/gpsfsspeiuscpqmdyekt/sql');
      console.log('');
      console.log('─'.repeat(80));
      console.log(migrationSQL);
      console.log('─'.repeat(80));
      console.log('');
      console.log('✅ After running the SQL, the calendar_oauth_sessions table will be ready');
      return;
    }

    const result = await response.json();
    console.log('✅ Migration executed successfully!');
    console.log('Result:', result);

  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    console.log('');
    console.log('📋 Please run this migration manually in Supabase SQL Editor:');
    console.log('   https://supabase.com/dashboard/project/gpsfsspeiuscpqmdyekt/sql');
    console.log('');
    console.log('Migration file location: supabase/calendar_oauth_sessions.sql');
    process.exit(1);
  }
}

runMigration();
