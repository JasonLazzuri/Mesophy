// Test script to debug schedule creation
// You can run this in the browser console when logged into the dashboard

async function testScheduleCreation() {
    try {
        console.log('Testing schedule creation...');
        
        // First, get available playlists
        const playlistsResponse = await fetch('/api/playlists');
        const playlistsData = await playlistsResponse.json();
        console.log('Available playlists:', playlistsData);
        
        if (!playlistsData.playlists || playlistsData.playlists.length === 0) {
            console.error('No playlists available - you need to create a playlist first');
            return;
        }
        
        // Get available screens  
        const screensResponse = await fetch('/api/screens');
        const screensData = await screensResponse.json();
        console.log('Available screens:', screensData);
        
        // Test schedule data
        const testSchedule = {
            name: 'Test Schedule ' + new Date().toISOString(),
            playlist_id: playlistsData.playlists[0].id,
            screen_id: screensData.screens?.[0]?.id || null, // Can be null for multi-screen
            start_date: new Date().toISOString().split('T')[0], // Today
            end_date: null,
            start_time: '09:00:00',
            end_time: '17:00:00',
            days_of_week: [0, 1, 2, 3, 4, 5, 6], // All days
            timezone: 'UTC',
            priority: 1
        };
        
        console.log('Creating schedule with data:', testSchedule);
        
        // Create schedule
        const response = await fetch('/api/schedules', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testSchedule)
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        const result = await response.json();
        console.log('Response body:', result);
        
        if (!response.ok) {
            console.error('❌ Schedule creation failed:', result);
        } else {
            console.log('✅ Schedule created successfully:', result);
        }
        
    } catch (error) {
        console.error('❌ Error during test:', error);
    }
}

// Run the test
testScheduleCreation();