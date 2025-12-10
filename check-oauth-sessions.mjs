#!/usr/bin/env node

/**
 * Check OAuth sessions in calendar_oauth_sessions table
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gpsfsspeiuscpqmdyekt.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

async function checkOAuthSessions() {
  try {
    console.log('🔵 Connecting to Supabase...');
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    console.log('🔵 Checking calendar OAuth sessions...');

    // Query for OAuth sessions
    const { data: sessions, error } = await supabase
      .from('calendar_oauth_sessions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    console.log('');
    if (!sessions || sessions.length === 0) {
      console.log('❌ NO OAUTH SESSIONS FOUND');
      console.log('');
      console.log('This means:');
      console.log('   1. The OAuth flow didn\'t complete, OR');
      console.log('   2. Sessions expired and were cleaned up, OR');
      console.log('   3. The callback endpoint failed to store the session');
      console.log('');
    } else {
      console.log(`✅ FOUND ${sessions.length} OAUTH SESSION(S)`);
      console.log('');
      sessions.forEach((session, index) => {
        const now = new Date();
        const expiresAt = new Date(session.expires_at);
        const isExpired = expiresAt < now;

        console.log(`📋 Session ${index + 1}:`);
        console.log(`   Session ID: ${session.session_id}`);
        console.log(`   User ID: ${session.user_id}`);
        console.log(`   Microsoft Email: ${session.microsoft_email}`);
        console.log(`   Created: ${session.created_at}`);
        console.log(`   Expires: ${session.expires_at} ${isExpired ? '⚠️ EXPIRED' : '✅ VALID'}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error checking OAuth sessions:', error.message);
    process.exit(1);
  }
}

checkOAuthSessions();
