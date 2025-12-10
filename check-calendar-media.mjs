#!/usr/bin/env node

/**
 * Check for calendar media assets in the database
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gpsfsspeiuscpqmdyekt.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

async function checkCalendarMedia() {
  try {
    console.log('🔵 Connecting to Supabase...');
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    console.log('🔵 Checking for calendar media assets...');

    // Query for calendar media
    const { data: calendars, error } = await supabase
      .from('media_assets')
      .select('*')
      .eq('media_type', 'calendar');

    if (error) {
      throw error;
    }

    console.log('');
    if (!calendars || calendars.length === 0) {
      console.log('❌ NO CALENDAR MEDIA ASSETS FOUND');
      console.log('');
      console.log('This means the calendar creation failed.');
      console.log('');
      console.log('📋 Check:');
      console.log('   1. Browser console for errors');
      console.log('   2. Vercel logs: https://vercel.com/dashboard');
      console.log('   3. Try connecting calendar again at /dashboard/media');
      console.log('');
    } else {
      console.log(`✅ FOUND ${calendars.length} CALENDAR MEDIA ASSET(S)`);
      console.log('');
      calendars.forEach((cal, index) => {
        console.log(`📅 Calendar ${index + 1}:`);
        console.log(`   ID: ${cal.id}`);
        console.log(`   Name: ${cal.name}`);
        console.log(`   Type: ${cal.media_type}`);
        console.log(`   MIME Type: ${cal.mime_type}`);
        console.log(`   Active: ${cal.is_active}`);
        console.log(`   Created: ${cal.created_at}`);
        if (cal.calendar_metadata) {
          console.log(`   Provider: ${cal.calendar_metadata.provider}`);
          console.log(`   Calendar ID: ${cal.calendar_metadata.calendar_id}`);
        }
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error checking calendar media:', error.message);
    process.exit(1);
  }
}

checkCalendarMedia();
