const schedule = require('node-schedule');

class ScheduleManager {
  constructor(db, playlistManager, contentDownloader, deviceToken) {
    this.db = db;
    this.playlistManager = playlistManager;
    this.contentDownloader = contentDownloader;
    this.deviceToken = deviceToken;
    
    this.scheduledJobs = new Map();
    this.currentSchedule = null;
    this.defaultPlaylist = null;
    this.onScheduleChangeCallback = null;
  }

  async loadSchedules() {
    try {
      const schedules = await this.getAllSchedules();
      console.log(`Loading ${schedules.length} schedules`);
      
      // Clear existing scheduled jobs
      this.clearAllScheduledJobs();
      
      // Set up new scheduled jobs
      for (const scheduleData of schedules) {
        await this.setupScheduleJob(scheduleData);
      }
      
      // Find and activate current schedule
      await this.activateCurrentSchedule();
      
      return schedules.length;
      
    } catch (error) {
      console.error('Error loading schedules:', error);
      return 0;
    }
  }

  async setupScheduleJob(scheduleData) {
    try {
      const schedule_obj = JSON.parse(scheduleData.data);
      
      if (!schedule_obj || !schedule_obj.start_time || !schedule_obj.end_time) {
        console.warn(`Invalid schedule data for: ${scheduleData.name}`);
        return;
      }
      
      // Parse schedule timing
      const startTime = this.parseTime(schedule_obj.start_time);
      const endTime = this.parseTime(schedule_obj.end_time);
      const daysOfWeek = schedule_obj.days_of_week || [0, 1, 2, 3, 4, 5, 6]; // Default: all days
      
      if (!startTime || !endTime) {
        console.warn(`Invalid time format in schedule: ${scheduleData.name}`);
        return;
      }
      
      // Create start job
      const startJobName = `start_${scheduleData.id}`;
      const startCron = this.createCronExpression(startTime, daysOfWeek);
      
      const startJob = schedule.scheduleJob(startJobName, startCron, async () => {
        console.log(`Activating schedule: ${scheduleData.name}`);
        await this.activateSchedule(schedule_obj);
      });
      
      // Create end job
      const endJobName = `end_${scheduleData.id}`;
      const endCron = this.createCronExpression(endTime, daysOfWeek);
      
      const endJob = schedule.scheduleJob(endJobName, endCron, async () => {
        console.log(`Deactivating schedule: ${scheduleData.name}`);
        await this.deactivateSchedule(schedule_obj);
      });
      
      this.scheduledJobs.set(startJobName, startJob);
      this.scheduledJobs.set(endJobName, endJob);
      
      console.log(`Scheduled: ${scheduleData.name} (${schedule_obj.start_time} - ${schedule_obj.end_time})`);
      
    } catch (error) {
      console.error(`Error setting up schedule ${scheduleData.name}:`, error);
    }
  }

  parseTime(timeString) {
    try {
      // Support formats: "HH:MM", "HH:MM:SS", "H:MM AM/PM"
      const timeRegex = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i;
      const match = timeString.match(timeRegex);
      
      if (!match) {
        return null;
      }
      
      let hour = parseInt(match[1]);
      const minute = parseInt(match[2]);
      const second = parseInt(match[3] || '0');
      const ampm = match[4];
      
      // Handle AM/PM
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hour !== 12) {
          hour += 12;
        } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
          hour = 0;
        }
      }
      
      // Validate ranges
      if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
        return null;
      }
      
      return { hour, minute, second };
      
    } catch (error) {
      console.error('Error parsing time:', timeString, error);
      return null;
    }
  }

  createCronExpression(time, daysOfWeek) {
    // Convert days of week from Sunday=0 format to cron format (Sunday=0)
    const cronDays = daysOfWeek.sort().join(',');
    
    // Create cron expression: second minute hour dayOfMonth month dayOfWeek
    return `${time.second} ${time.minute} ${time.hour} * * ${cronDays}`;
  }

  async activateCurrentSchedule() {
    try {
      const currentSchedule = await this.findCurrentActiveSchedule();
      
      if (currentSchedule) {
        console.log(`Activating current schedule: ${currentSchedule.name}`);
        await this.activateSchedule(JSON.parse(currentSchedule.data));
      } else {
        console.log('No active schedule found, using default playlist');
        await this.activateDefaultPlaylist();
      }
      
    } catch (error) {
      console.error('Error activating current schedule:', error);
    }
  }

  async findCurrentActiveSchedule() {
    try {
      const schedules = await this.getAllSchedules();
      const now = new Date();
      const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const currentTime = {
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds()
      };
      
      let activeSchedules = [];
      
      for (const scheduleData of schedules) {
        try {
          const schedule_obj = JSON.parse(scheduleData.data);
          
          // Check if today is included in the schedule
          const daysOfWeek = schedule_obj.days_of_week || [0, 1, 2, 3, 4, 5, 6];
          if (!daysOfWeek.includes(currentDay)) {
            continue;
          }
          
          // Check if current time is within the schedule
          const startTime = this.parseTime(schedule_obj.start_time);
          const endTime = this.parseTime(schedule_obj.end_time);
          
          if (!startTime || !endTime) {
            continue;
          }
          
          if (this.isTimeInRange(currentTime, startTime, endTime)) {
            activeSchedules.push({
              ...scheduleData,
              schedule_obj,
              priority: schedule_obj.priority || 0
            });
          }
          
        } catch (error) {
          console.error(`Error processing schedule ${scheduleData.name}:`, error);
        }
      }
      
      // Return highest priority active schedule
      if (activeSchedules.length > 0) {
        activeSchedules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        return activeSchedules[0];
      }
      
      return null;
      
    } catch (error) {
      console.error('Error finding current active schedule:', error);
      return null;
    }
  }

  isTimeInRange(currentTime, startTime, endTime) {
    const current = currentTime.hour * 3600 + currentTime.minute * 60 + currentTime.second;
    const start = startTime.hour * 3600 + startTime.minute * 60 + startTime.second;
    const end = endTime.hour * 3600 + endTime.minute * 60 + endTime.second;
    
    // Handle schedules that cross midnight
    if (end < start) {
      return current >= start || current <= end;
    } else {
      return current >= start && current <= end;
    }
  }

  async activateSchedule(schedule_obj) {
    try {
      this.currentSchedule = schedule_obj;
      
      // Download playlist media if needed
      if (schedule_obj.playlist && schedule_obj.playlist.media) {
        console.log('Downloading playlist media...');
        const downloadResult = await this.contentDownloader.downloadPlaylistMedia(
          schedule_obj.playlist,
          this.deviceToken
        );
        
        if (!downloadResult.success && downloadResult.errors.length > 0) {
          console.warn('Some media downloads failed:', downloadResult.errors);
        }
      }
      
      // Load playlist into player
      if (schedule_obj.playlist) {
        const loaded = await this.playlistManager.loadPlaylist(schedule_obj.playlist);
        if (loaded) {
          await this.playlistManager.startPlayback(true);
          console.log(`Schedule activated: ${schedule_obj.name}`);
          
          // Notify callback
          if (this.onScheduleChangeCallback) {
            this.onScheduleChangeCallback('schedule_activated', schedule_obj);
          }
        } else {
          console.error('Failed to load playlist for schedule:', schedule_obj.name);
        }
      }
      
    } catch (error) {
      console.error('Error activating schedule:', error);
    }
  }

  async deactivateSchedule(schedule_obj) {
    try {
      if (this.currentSchedule && this.currentSchedule.id === schedule_obj.id) {
        console.log(`Deactivating schedule: ${schedule_obj.name}`);
        
        // Stop current playback
        await this.playlistManager.stopPlayback();
        
        this.currentSchedule = null;
        
        // Notify callback
        if (this.onScheduleChangeCallback) {
          this.onScheduleChangeCallback('schedule_deactivated', schedule_obj);
        }
        
        // Check if there's another active schedule or use default
        setTimeout(async () => {
          await this.activateCurrentSchedule();
        }, 1000);
      }
      
    } catch (error) {
      console.error('Error deactivating schedule:', error);
    }
  }

  async activateDefaultPlaylist() {
    try {
      if (this.defaultPlaylist) {
        console.log('Activating default playlist');
        
        const loaded = await this.playlistManager.loadPlaylist(this.defaultPlaylist);
        if (loaded) {
          await this.playlistManager.startPlayback(true);
          
          if (this.onScheduleChangeCallback) {
            this.onScheduleChangeCallback('default_playlist_activated', this.defaultPlaylist);
          }
        }
      } else {
        console.log('No default playlist configured');
        
        // Show blank screen or logo
        if (this.onScheduleChangeCallback) {
          this.onScheduleChangeCallback('no_content', null);
        }
      }
      
    } catch (error) {
      console.error('Error activating default playlist:', error);
    }
  }

  async getAllSchedules() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM schedules ORDER BY priority DESC, name ASC',
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  clearAllScheduledJobs() {
    for (const [jobName, job] of this.scheduledJobs) {
      try {
        job.cancel();
        console.log(`Cancelled scheduled job: ${jobName}`);
      } catch (error) {
        console.error(`Error cancelling job ${jobName}:`, error);
      }
    }
    this.scheduledJobs.clear();
  }

  async forceScheduleCheck() {
    console.log('Forcing schedule check...');
    await this.activateCurrentSchedule();
  }

  setDefaultPlaylist(playlist) {
    this.defaultPlaylist = playlist;
    console.log('Default playlist set:', playlist?.name || 'None');
  }

  setScheduleChangeCallback(callback) {
    this.onScheduleChangeCallback = callback;
  }

  getCurrentScheduleInfo() {
    return {
      currentSchedule: this.currentSchedule,
      activeJobs: Array.from(this.scheduledJobs.keys()),
      totalSchedules: this.scheduledJobs.size / 2 // Divide by 2 because each schedule has start and end jobs
    };
  }

  async getScheduleStatus() {
    try {
      const allSchedules = await this.getAllSchedules();
      const currentActive = await this.findCurrentActiveSchedule();
      
      const scheduleStatus = allSchedules.map(schedule => {
        try {
          const schedule_obj = JSON.parse(schedule.data);
          return {
            id: schedule.id,
            name: schedule.name,
            isActive: currentActive && currentActive.id === schedule.id,
            startTime: schedule_obj.start_time,
            endTime: schedule_obj.end_time,
            daysOfWeek: schedule_obj.days_of_week,
            priority: schedule_obj.priority || 0,
            playlistName: schedule_obj.playlist?.name || 'Unknown'
          };
        } catch (error) {
          return {
            id: schedule.id,
            name: schedule.name,
            isActive: false,
            error: 'Invalid schedule data'
          };
        }
      });
      
      return {
        schedules: scheduleStatus,
        currentActive: currentActive ? {
          id: currentActive.id,
          name: currentActive.name
        } : null,
        totalSchedules: allSchedules.length
      };
      
    } catch (error) {
      console.error('Error getting schedule status:', error);
      return {
        schedules: [],
        currentActive: null,
        totalSchedules: 0,
        error: error.message
      };
    }
  }

  destroy() {
    console.log('Destroying schedule manager...');
    this.clearAllScheduledJobs();
    this.currentSchedule = null;
    this.defaultPlaylist = null;
    this.onScheduleChangeCallback = null;
  }
}

module.exports = ScheduleManager;