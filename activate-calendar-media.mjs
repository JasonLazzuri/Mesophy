#!/usr/bin/env node

/**
 * Activate calendar media assets
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gpsfsspeiuscpqmdyekt.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

async function activateCalendarMedia() {
  try {
    console.log('🔵 Connecting to Supabase...');
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    console.log('🔵 Activating all calendar media assets...');

    // Update all calendar media to active
    const { data, error } = await supabase
      .from('media_assets')
      .update({ is_active: true })
      .eq('media_type', 'calendar')
      .eq('is_active', false)
      .select();

    if (error) {
      throw error;
    }

    console.log('');
    if (!data || data.length === 0) {
      console.log('ℹ️  No inactive calendar media assets found');
    } else {
      console.log(`✅ Activated ${data.length} calendar media asset(s):`);
      console.log('');
      data.forEach((cal, index) => {
        console.log(`   ${index + 1}. ${cal.name} (ID: ${cal.id})`);
      });
    }
    console.log('');
    console.log('📋 Next: Refresh the media page to see the calendars!');
    console.log('');

  } catch (error) {
    console.error('❌ Error activating calendar media:', error.message);
    process.exit(1);
  }
}

activateCalendarMedia();
