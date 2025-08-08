const si = require('systeminformation');
const fs = require('fs-extra');

class ResourceMonitor {
  constructor(config, onAlert = null) {
    this.config = config;
    this.onAlert = onAlert;
    this.monitoringInterval = null;
    this.alertCooldowns = new Map();
    
    // Thresholds for alerts
    this.thresholds = {
      memory: config.monitoring?.memoryThreshold || 85, // Percentage
      cpu: config.monitoring?.cpuThreshold || 90,       // Percentage
      diskSpace: config.monitoring?.diskThreshold || 90, // Percentage
      temperature: config.monitoring?.tempThreshold || 75 // Celsius
    };
    
    this.monitoringInterval = config.monitoring?.interval || 30000; // 30 seconds
  }

  start() {
    if (this.monitoringInterval) {
      console.log('Starting resource monitoring...');
      
      // Initial check
      this.checkResources();
      
      // Set up periodic monitoring
      this.intervalId = setInterval(() => {
        this.checkResources();
      }, this.monitoringInterval);
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Resource monitoring stopped');
    }
  }

  async checkResources() {
    try {
      const [cpu, memory, disk, temperature] = await Promise.all([
        this.getCPUUsage(),
        this.getMemoryUsage(),
        this.getDiskUsage(),
        this.getTemperature()
      ]);

      // Check each metric against thresholds
      this.checkThreshold('cpu', cpu.usage, this.thresholds.cpu, '%');
      this.checkThreshold('memory', memory.usage, this.thresholds.memory, '%');
      this.checkThreshold('disk', disk.usage, this.thresholds.diskSpace, '%');
      
      if (temperature.temp > 0) {
        this.checkThreshold('temperature', temperature.temp, this.thresholds.temperature, '°C');
      }

      // Log resource status periodically (every 5 minutes)
      if (Date.now() % (5 * 60 * 1000) < this.monitoringInterval) {
        console.log(`Resources - CPU: ${cpu.usage}%, Memory: ${memory.usage}%, Disk: ${disk.usage}%, Temp: ${temperature.temp}°C`);
      }

      return {
        cpu,
        memory,
        disk,
        temperature,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error checking system resources:', error);
      return null;
    }
  }

  async getCPUUsage() {
    try {
      const currentLoad = await si.currentLoad();
      return {
        usage: Math.round(currentLoad.currentLoad || 0),
        cores: currentLoad.cpus?.length || 0,
        loadAvg: currentLoad.avgLoad || 0
      };
    } catch (error) {
      console.error('Error getting CPU usage:', error);
      return { usage: 0, cores: 0, loadAvg: 0 };
    }
  }

  async getMemoryUsage() {
    try {
      const memory = await si.mem();
      const usage = Math.round(((memory.total - memory.free) / memory.total) * 100);
      
      return {
        usage,
        total: memory.total,
        free: memory.free,
        used: memory.used || (memory.total - memory.free)
      };
    } catch (error) {
      console.error('Error getting memory usage:', error);
      return { usage: 0, total: 0, free: 0, used: 0 };
    }
  }

  async getDiskUsage() {
    try {
      const disks = await si.fsSize();
      const rootDisk = disks.find(disk => disk.mount === '/') || disks[0];
      
      if (rootDisk) {
        const usage = Math.round((rootDisk.used / rootDisk.size) * 100);
        return {
          usage,
          total: rootDisk.size,
          used: rootDisk.used,
          free: rootDisk.available
        };
      }
      
      return { usage: 0, total: 0, used: 0, free: 0 };
    } catch (error) {
      console.error('Error getting disk usage:', error);
      return { usage: 0, total: 0, used: 0, free: 0 };
    }
  }

  async getTemperature() {
    try {
      const temperature = await si.cpuTemperature();
      return {
        temp: Math.round(temperature.main || 0),
        max: Math.round(temperature.max || 0)
      };
    } catch (error) {
      // Fallback: try to read from Pi-specific temperature file
      try {
        const tempStr = await fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8');
        const temp = parseInt(tempStr.trim()) / 1000; // Convert millicelsius to celsius
        return { temp: Math.round(temp), max: 0 };
      } catch (fallbackError) {
        return { temp: 0, max: 0 };
      }
    }
  }

  checkThreshold(metric, value, threshold, unit) {
    if (value > threshold) {
      const alertKey = `${metric}_${threshold}`;
      const now = Date.now();
      const lastAlert = this.alertCooldowns.get(alertKey) || 0;
      const cooldownPeriod = 5 * 60 * 1000; // 5 minutes cooldown
      
      if (now - lastAlert > cooldownPeriod) {
        console.warn(`⚠️  High ${metric} usage: ${value}${unit} (threshold: ${threshold}${unit})`);
        
        this.alertCooldowns.set(alertKey, now);
        
        if (this.onAlert) {
          this.onAlert({
            type: 'threshold_exceeded',
            metric,
            value,
            threshold,
            unit,
            severity: value > threshold * 1.1 ? 'high' : 'medium',
            timestamp: new Date().toISOString()
          });
        }
        
        // Take corrective action for critical resources
        this.handleCriticalResource(metric, value, threshold);
      }
    }
  }

  async handleCriticalResource(metric, value, threshold) {
    switch (metric) {
      case 'memory':
        if (value > 95) {
          console.warn('Critical memory usage detected, attempting cleanup...');
          await this.emergencyCleanup();
        }
        break;
        
      case 'disk':
        if (value > 95) {
          console.warn('Critical disk space detected, cleaning cache...');
          await this.cleanupCache();
        }
        break;
        
      case 'temperature':
        if (value > 80) {
          console.warn('High temperature detected, reducing CPU frequency...');
          await this.reduceCPUFreq();
        }
        break;
    }
  }

  async emergencyCleanup() {
    try {
      // Force garbage collection if possible
      if (global.gc) {
        global.gc();
        console.log('Forced garbage collection');
      }
      
      // Clear any cached images that might be in memory
      // This would be implemented based on specific application needs
      
    } catch (error) {
      console.error('Error during emergency cleanup:', error);
    }
  }

  async cleanupCache() {
    try {
      const cacheDir = '/opt/mesophy/content';
      
      // Get cache statistics
      const files = await fs.readdir(cacheDir);
      const stats = await Promise.all(
        files.map(async (file) => {
          const filePath = require('path').join(cacheDir, file);
          try {
            const stat = await fs.stat(filePath);
            return { file, path: filePath, size: stat.size, mtime: stat.mtime };
          } catch (error) {
            return null;
          }
        })
      );
      
      // Sort by modification time (oldest first)
      const validStats = stats.filter(Boolean).sort((a, b) => a.mtime - b.mtime);
      
      // Remove oldest files until we free up some space
      let freedSpace = 0;
      const targetSpace = 100 * 1024 * 1024; // 100MB
      
      for (const stat of validStats) {
        try {
          await fs.remove(stat.path);
          freedSpace += stat.size;
          console.log(`Removed cached file: ${stat.file} (${Math.round(stat.size / 1024)}KB)`);
          
          if (freedSpace >= targetSpace) {
            break;
          }
        } catch (error) {
          console.error(`Failed to remove ${stat.file}:`, error);
        }
      }
      
      console.log(`Cache cleanup completed. Freed ${Math.round(freedSpace / 1024 / 1024)}MB`);
      
    } catch (error) {
      console.error('Error during cache cleanup:', error);
    }
  }

  async reduceCPUFreq() {
    try {
      // This is Pi-specific and requires appropriate permissions
      const { exec } = require('child_process');
      
      // Reduce CPU governor to powersave mode temporarily
      exec('echo powersave | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor', (error) => {
        if (error) {
          console.error('Failed to reduce CPU frequency:', error);
        } else {
          console.log('Reduced CPU frequency to manage temperature');
          
          // Restore performance after 2 minutes
          setTimeout(() => {
            exec('echo ondemand | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor', (restoreError) => {
              if (!restoreError) {
                console.log('Restored CPU frequency');
              }
            });
          }, 2 * 60 * 1000);
        }
      });
      
    } catch (error) {
      console.error('Error reducing CPU frequency:', error);
    }
  }

  async getResourceSummary() {
    const resources = await this.checkResources();
    if (!resources) return null;
    
    return {
      status: 'healthy',
      cpu: {
        usage: resources.cpu.usage,
        status: resources.cpu.usage > this.thresholds.cpu ? 'warning' : 'ok'
      },
      memory: {
        usage: resources.memory.usage,
        status: resources.memory.usage > this.thresholds.memory ? 'warning' : 'ok'
      },
      disk: {
        usage: resources.disk.usage,
        status: resources.disk.usage > this.thresholds.diskSpace ? 'warning' : 'ok'
      },
      temperature: {
        temp: resources.temperature.temp,
        status: resources.temperature.temp > this.thresholds.temperature ? 'warning' : 'ok'
      },
      lastChecked: resources.timestamp
    };
  }
}

module.exports = ResourceMonitor;