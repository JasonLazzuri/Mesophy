"""
Command Executor for Mesophy Pi Client
Handles execution of remote commands from the portal
"""

import os
import sys
import subprocess
import logging
import time
import json
import shutil
import psutil
from datetime import datetime

class CommandExecutor:
    def __init__(self, config, api_client):
        self.config = config
        self.api = api_client
        self.logger = logging.getLogger(__name__)
        self.cache_dir = config.get('cache_dir', '/opt/mesophy/content')
        
    def execute_command(self, command):
        """Execute a single command and return result"""
        command_id = command.get('id')
        command_type = command.get('command_type')
        command_data = command.get('command_data', {})
        
        self.logger.info(f"Executing command {command_id}: {command_type}")
        
        # Update status to executing
        self.api.update_command_status(command_id, 'executing')
        
        try:
            # Route to appropriate handler
            if command_type == 'restart':
                result = self._handle_restart(command_data)
            elif command_type == 'restart_content':
                result = self._handle_restart_content(command_data)
            elif command_type == 'reboot':
                result = self._handle_reboot(command_data)
            elif command_type == 'shutdown':
                result = self._handle_shutdown(command_data)
            elif command_type == 'sync_content':
                result = self._handle_sync_content(command_data)
            elif command_type == 'clear_cache':
                result = self._handle_clear_cache(command_data)
            elif command_type == 'health_check':
                result = self._handle_health_check(command_data)
            elif command_type == 'update_config':
                result = self._handle_update_config(command_data)
            elif command_type == 'get_logs':
                result = self._handle_get_logs(command_data)
            elif command_type == 'test_display':
                result = self._handle_test_display(command_data)
            elif command_type == 'emergency_message':
                result = self._handle_emergency_message(command_data)
            else:
                raise ValueError(f"Unknown command type: {command_type}")
            
            # Command completed successfully
            self.api.update_command_status(command_id, 'completed', result)
            self.logger.info(f"Command {command_id} completed successfully")
            return True
            
        except Exception as e:
            error_message = str(e)
            self.logger.error(f"Command {command_id} failed: {error_message}")
            self.api.update_command_status(command_id, 'failed', None, error_message)
            return False
    
    def _handle_restart(self, data):
        """Restart the Pi client service"""
        self.logger.info("Executing service restart command")
        
        try:
            # Try systemctl restart first
            result = subprocess.run(
                ['sudo', 'systemctl', 'restart', 'mesophy-pi-client'],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                return {
                    'method': 'systemctl',
                    'status': 'restarted',
                    'message': 'Service restarted successfully'
                }
            else:
                # Fallback: try to restart via process management
                self.logger.warning("systemctl restart failed, attempting process restart")
                
                # Kill current process (this will cause systemd to restart it)
                os.kill(os.getpid(), 15)  # SIGTERM
                
                return {
                    'method': 'process_kill',
                    'status': 'restarting',
                    'message': 'Process terminated for restart'
                }
                
        except subprocess.TimeoutExpired:
            raise Exception("Service restart timed out")
        except Exception as e:
            raise Exception(f"Failed to restart service: {e}")
    
    def _handle_restart_content(self, data):
        """Restart digital signage content/software only (no device reboot)"""
        self.logger.info("Executing content restart command")
        
        try:
            # Import content manager for cache operations
            import sys
            import os
            sys.path.append(os.path.dirname(os.path.dirname(__file__)))
            from lib.content_manager import ContentManager
            
            # Clear content cache to force fresh download
            content_manager = ContentManager(self.config)
            cache_stats_before = content_manager.get_cache_stats()
            
            # Clear cache
            cache_dir = self.config.get('cache_dir', '/opt/mesophy/content')
            if os.path.exists(cache_dir):
                for item in os.listdir(cache_dir):
                    item_path = os.path.join(cache_dir, item)
                    if item.endswith('.json'):
                        continue  # Keep config files
                    try:
                        if os.path.isfile(item_path):
                            os.remove(item_path)
                        elif os.path.isdir(item_path):
                            shutil.rmtree(item_path)
                    except Exception as e:
                        self.logger.warning(f"Failed to remove {item_path}: {e}")
            
            # Force content sync before restart
            self.logger.info("Syncing fresh content before restart...")
            content_manager.sync_content()
            
            cache_stats_after = content_manager.get_cache_stats()
            
            self.logger.info("Content cleared and synced, initiating graceful restart")
            
            # Schedule the restart for 3 seconds later to allow response to be sent
            import threading
            def delayed_restart():
                time.sleep(3)
                self.logger.info("Executing delayed content restart")
                os.kill(os.getpid(), 15)  # SIGTERM - systemd will restart the service
            
            restart_thread = threading.Thread(target=delayed_restart)
            restart_thread.daemon = True
            restart_thread.start()
            
            return {
                'method': 'content_restart',
                'status': 'restarting',
                'message': 'Content system restarting with fresh cache',
                'cache_cleared': {
                    'files_before': cache_stats_before.get('total_files', 0),
                    'files_after': cache_stats_after.get('total_files', 0),
                    'size_freed_mb': cache_stats_before.get('total_size_mb', 0) - cache_stats_after.get('total_size_mb', 0)
                },
                'restart_delay': '3 seconds'
            }
            
        except Exception as e:
            raise Exception(f"Failed to restart content: {e}")
    
    def _handle_reboot(self, data):
        """Reboot the Pi device"""
        self.logger.info("Executing device reboot command")
        
        try:
            # Schedule reboot in 10 seconds to allow response to be sent
            result = subprocess.run(
                ['sudo', 'shutdown', '-r', '+1', 'Remote reboot requested'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                return {
                    'status': 'rebooting',
                    'message': 'Device reboot scheduled',
                    'reboot_time': 'in 1 minute'
                }
            else:
                raise Exception(f"Reboot command failed: {result.stderr}")
                
        except subprocess.TimeoutExpired:
            raise Exception("Reboot command timed out")
        except Exception as e:
            raise Exception(f"Failed to reboot device: {e}")
    
    def _handle_shutdown(self, data):
        """Shutdown the Pi device"""
        self.logger.info("Executing device shutdown command")
        
        try:
            result = subprocess.run(
                ['sudo', 'shutdown', '-h', '+1', 'Remote shutdown requested'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                return {
                    'status': 'shutting_down',
                    'message': 'Device shutdown scheduled',
                    'shutdown_time': 'in 1 minute'
                }
            else:
                raise Exception(f"Shutdown command failed: {result.stderr}")
                
        except subprocess.TimeoutExpired:
            raise Exception("Shutdown command timed out")
        except Exception as e:
            raise Exception(f"Failed to shutdown device: {e}")
    
    def _handle_sync_content(self, data):
        """Force content synchronization"""
        self.logger.info("Executing force content sync command")
        
        try:
            # Import here to avoid circular imports
            sys.path.append(os.path.dirname(os.path.dirname(__file__)))
            from lib.content_manager import ContentManager
            
            content_manager = ContentManager(self.config)
            success = content_manager.sync_content()
            
            if success:
                stats = content_manager.get_cache_stats()
                return {
                    'status': 'synced',
                    'message': 'Content synchronized successfully',
                    'cache_stats': stats,
                    'sync_time': datetime.utcnow().isoformat()
                }
            else:
                return {
                    'status': 'no_content',
                    'message': 'No content available to sync',
                    'sync_time': datetime.utcnow().isoformat()
                }
                
        except Exception as e:
            raise Exception(f"Failed to sync content: {e}")
    
    def _handle_clear_cache(self, data):
        """Clear media cache"""
        self.logger.info("Executing clear cache command")
        
        try:
            cache_size_before = 0
            files_removed = 0
            
            if os.path.exists(self.cache_dir):
                # Calculate cache size before
                for root, dirs, files in os.walk(self.cache_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        if os.path.exists(file_path):
                            cache_size_before += os.path.getsize(file_path)
                            files_removed += 1
                
                # Remove all cached content except config files
                for item in os.listdir(self.cache_dir):
                    item_path = os.path.join(self.cache_dir, item)
                    if item.endswith('.json'):
                        continue  # Keep config files
                    
                    try:
                        if os.path.isfile(item_path):
                            os.remove(item_path)
                        elif os.path.isdir(item_path):
                            shutil.rmtree(item_path)
                    except Exception as e:
                        self.logger.warning(f"Failed to remove {item_path}: {e}")
            
            # Force content sync after clearing cache
            try:
                sys.path.append(os.path.dirname(os.path.dirname(__file__)))
                from lib.content_manager import ContentManager
                content_manager = ContentManager(self.config)
                content_manager.sync_content()
            except Exception as e:
                self.logger.warning(f"Failed to sync content after cache clear: {e}")
            
            return {
                'status': 'cleared',
                'message': 'Cache cleared successfully',
                'files_removed': files_removed,
                'size_freed_mb': round(cache_size_before / (1024 * 1024), 2),
                'clear_time': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            raise Exception(f"Failed to clear cache: {e}")
    
    def _handle_health_check(self, data):
        """Perform system health check"""
        self.logger.info("Executing health check command")
        
        try:
            health_data = {
                'timestamp': datetime.utcnow().isoformat(),
                'system': {},
                'services': {},
                'storage': {},
                'network': {},
                'overall_status': 'healthy'
            }
            
            # System metrics
            try:
                health_data['system'] = {
                    'cpu_percent': psutil.cpu_percent(interval=1),
                    'memory_percent': psutil.virtual_memory().percent,
                    'disk_usage': psutil.disk_usage('/').percent,
                    'temperature': self._get_cpu_temperature(),
                    'uptime_seconds': time.time() - psutil.boot_time(),
                    'load_average': os.getloadavg() if hasattr(os, 'getloadavg') else None
                }
            except Exception as e:
                self.logger.warning(f"Failed to get system metrics: {e}")
            
            # Service status
            try:
                service_result = subprocess.run(
                    ['systemctl', 'is-active', 'mesophy-pi-client'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                health_data['services']['mesophy_client'] = service_result.stdout.strip()
            except Exception as e:
                health_data['services']['mesophy_client'] = 'unknown'
            
            # Storage check
            try:
                cache_stats = self._get_cache_stats()
                health_data['storage'] = cache_stats
            except Exception as e:
                self.logger.warning(f"Failed to get storage info: {e}")
            
            # Network connectivity
            try:
                network_result = subprocess.run(
                    ['ping', '-c', '1', '-W', '5', '8.8.8.8'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                health_data['network']['internet'] = network_result.returncode == 0
                
                # API connectivity
                api_test = self.api.send_heartbeat()
                health_data['network']['api_server'] = api_test
                
            except Exception as e:
                health_data['network']['internet'] = False
                health_data['network']['api_server'] = False
            
            # Determine overall status
            issues = []
            if health_data['system'].get('cpu_percent', 0) > 90:
                issues.append('High CPU usage')
            if health_data['system'].get('memory_percent', 0) > 90:
                issues.append('High memory usage')
            if health_data['system'].get('disk_usage', 0) > 90:
                issues.append('Low disk space')
            if health_data['system'].get('temperature', 0) > 80:
                issues.append('High temperature')
            if not health_data['network'].get('internet', True):
                issues.append('No internet connectivity')
            if not health_data['network'].get('api_server', True):
                issues.append('API server unreachable')
            
            if issues:
                health_data['overall_status'] = 'warning' if len(issues) <= 2 else 'critical'
                health_data['issues'] = issues
            
            return health_data
            
        except Exception as e:
            raise Exception(f"Failed to perform health check: {e}")
    
    def _handle_update_config(self, data):
        """Update Pi client configuration"""
        self.logger.info("Executing config update command")
        
        try:
            config_updates = data.get('config_updates', {})
            if not config_updates:
                raise ValueError("No configuration updates provided")
            
            # Backup current config
            import json
            config_path = self.config.get('config_path', '/opt/mesophy/config/client.conf')
            backup_path = f"{config_path}.backup.{int(time.time())}"
            
            if os.path.exists(config_path):
                shutil.copy2(config_path, backup_path)
            
            # Update configuration
            current_config = self.config.copy()
            current_config.update(config_updates)
            
            # Save updated config
            os.makedirs(os.path.dirname(config_path), exist_ok=True)
            with open(config_path, 'w') as f:
                json.dump(current_config, f, indent=2)
            
            return {
                'status': 'updated',
                'message': 'Configuration updated successfully',
                'updated_keys': list(config_updates.keys()),
                'backup_path': backup_path,
                'restart_required': True
            }
            
        except Exception as e:
            raise Exception(f"Failed to update configuration: {e}")
    
    def _handle_get_logs(self, data):
        """Retrieve system logs"""
        self.logger.info("Executing get logs command")
        
        try:
            lines = data.get('lines', 100)
            log_type = data.get('log_type', 'service')
            
            if log_type == 'service':
                # Get service logs
                result = subprocess.run(
                    ['journalctl', '-u', 'mesophy-pi-client', '-n', str(lines), '--no-pager'],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if result.returncode == 0:
                    return {
                        'status': 'retrieved',
                        'log_type': 'service',
                        'lines': lines,
                        'logs': result.stdout,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                else:
                    raise Exception(f"Failed to get service logs: {result.stderr}")
            
            elif log_type == 'system':
                # Get system logs
                result = subprocess.run(
                    ['journalctl', '-n', str(lines), '--no-pager'],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if result.returncode == 0:
                    return {
                        'status': 'retrieved',
                        'log_type': 'system',
                        'lines': lines,
                        'logs': result.stdout,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                else:
                    raise Exception(f"Failed to get system logs: {result.stderr}")
            
            else:
                raise ValueError(f"Unknown log type: {log_type}")
                
        except subprocess.TimeoutExpired:
            raise Exception("Log retrieval timed out")
        except Exception as e:
            raise Exception(f"Failed to retrieve logs: {e}")
    
    def _handle_test_display(self, data):
        """Test display functionality"""
        self.logger.info("Executing display test command")
        
        try:
            test_type = data.get('test_type', 'image')
            duration = data.get('duration', 10)
            
            # Import display manager
            sys.path.append(os.path.dirname(os.path.dirname(__file__)))
            from lib.display_manager import DisplayManager
            
            display = DisplayManager(self.config)
            
            if test_type == 'image':
                # Show a test pattern or default image
                test_content = {
                    'type': 'test_pattern',
                    'message': f'Display Test - {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}',
                    'duration': duration
                }
                display.show_test_pattern(test_content)
                
            elif test_type == 'color':
                # Show solid color
                color = data.get('color', 'blue')
                display.show_solid_color(color, duration)
            
            return {
                'status': 'tested',
                'test_type': test_type,
                'duration': duration,
                'message': 'Display test completed successfully',
                'timestamp': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            raise Exception(f"Failed to test display: {e}")
    
    def _handle_emergency_message(self, data):
        """Display emergency message"""
        self.logger.info("Executing emergency message command")
        
        try:
            message = data.get('message', 'EMERGENCY ALERT')
            duration = data.get('duration', 300)  # 5 minutes default
            priority = data.get('priority', 'high')
            
            # Import display manager
            sys.path.append(os.path.dirname(os.path.dirname(__file__)))
            from lib.display_manager import DisplayManager
            
            display = DisplayManager(self.config)
            
            emergency_content = {
                'type': 'emergency',
                'message': message,
                'priority': priority,
                'duration': duration,
                'timestamp': datetime.utcnow().isoformat()
            }
            
            display.show_emergency_message(emergency_content)
            
            return {
                'status': 'displayed',
                'message': message,
                'duration': duration,
                'priority': priority,
                'timestamp': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            raise Exception(f"Failed to display emergency message: {e}")
    
    def _get_cpu_temperature(self):
        """Get CPU temperature"""
        try:
            with open('/sys/class/thermal/thermal_zone0/temp', 'r') as f:
                temp = int(f.read().strip()) / 1000.0
                return round(temp, 1)
        except:
            return None
    
    def _get_cache_stats(self):
        """Get cache statistics"""
        try:
            if not os.path.exists(self.cache_dir):
                return {'total_files': 0, 'total_size_mb': 0}
            
            total_size = 0
            total_files = 0
            
            for root, dirs, files in os.walk(self.cache_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    if os.path.exists(file_path):
                        total_size += os.path.getsize(file_path)
                        total_files += 1
            
            return {
                'total_files': total_files,
                'total_size_mb': round(total_size / (1024 * 1024), 2),
                'cache_dir': self.cache_dir
            }
        except Exception as e:
            self.logger.warning(f"Failed to get cache stats: {e}")
            return {'total_files': 0, 'total_size_mb': 0}