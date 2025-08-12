"""
API Client for Mesophy Pi Client
Handles all communication with the Mesophy backend API
"""

import requests
import json
import logging
import socket
import uuid
import random
import string
from datetime import datetime

class APIClient:
    def __init__(self, config):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.base_url = config.get('api_base_url', 'https://mesophy.vercel.app')
        self.timeout = 30
        
        # Generate unique device identifier
        self.device_id = self._get_device_id()
    
    def generate_pairing_code(self):
        """Generate a new 6-digit alphanumeric pairing code"""
        try:
            # Generate 6-character alphanumeric code (uppercase letters and numbers only)
            characters = string.ascii_uppercase + string.digits
            pairing_code = ''.join(random.choice(characters) for _ in range(6))
            
            device_info = {
                "device_id": self.device_id,
                "hostname": socket.gethostname(),
                "ip_address": self._get_local_ip(),
                "mac_address": self._get_mac_address(),
                "timestamp": datetime.utcnow().isoformat(),
                "pairing_code": pairing_code
            }
            
            # Try to register with backend, but don't fail if backend is unavailable
            try:
                response = requests.post(
                    f"{self.base_url}/api/devices/generate-code",
                    json={
                        "device_info": device_info,
                        "device_ip": self._get_local_ip(),
                        "pairing_code": pairing_code
                    },
                    timeout=self.timeout
                )
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    if data.get('success'):
                        # Use backend-provided code if available
                        backend_code = data.get('pairing_code')
                        if backend_code and all(c in characters for c in backend_code):
                            pairing_code = backend_code
                        self.logger.info(f"Backend registration successful: {pairing_code}")
                    else:
                        self.logger.warning(f"Backend registration failed, using local code: {pairing_code}")
                else:
                    self.logger.warning(f"Backend unavailable ({response.status_code}), using local code: {pairing_code}")
                    
            except requests.exceptions.RequestException as e:
                self.logger.warning(f"Backend unavailable (network error), using local code: {pairing_code}")
            
            self.logger.info(f"Generated pairing code: {pairing_code}")
            return pairing_code
                
        except Exception as e:
            self.logger.error(f"Unexpected error generating pairing code: {e}")
        
        return None
    
    def check_pairing_status(self, pairing_code):
        """Check if device has been paired using the pairing code"""
        try:
            response = requests.get(
                f"{self.base_url}/api/devices/check-pairing/{pairing_code}",
                timeout=self.timeout
            )
            
            if response.status_code in [200, 201]:
                data = response.json()
                if data.get('paired'):
                    self.logger.info("Device has been paired!")
                    # Store pairing response data for get_device_info()
                    self._last_pairing_response = data
                    return True
                else:
                    self.logger.debug("Device not yet paired")
                    return False
            else:
                self.logger.error(f"Pairing check failed: {response.status_code}")
                
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Network error checking pairing: {e}")
        except Exception as e:
            self.logger.error(f"Unexpected error checking pairing: {e}")
        
        return False
    
    def get_device_info(self):
        """Get device information after pairing"""
        try:
            # Use cached pairing response if available
            if hasattr(self, '_last_pairing_response') and self._last_pairing_response:
                data = self._last_pairing_response
                device_info = {
                    'device_id': data.get('device_id', self.device_id),
                    'screen_id': data.get('screen_id'),
                    'location_id': data.get('location_id'),
                    'organization_id': data.get('organization_id')
                }
                self.logger.info(f"Device info from pairing response: {device_info}")
                return device_info
            
            # Fallback: try to get info from API
            pairing_code = self.config.get('pairing_code')
            if not pairing_code:
                self.logger.warning("No pairing code available for device info lookup")
                return None
            
            response = requests.get(
                f"{self.base_url}/api/devices/check-pairing/{pairing_code}",
                timeout=self.timeout
            )
            
            if response.status_code in [200, 201]:
                data = response.json()
                if data.get('paired'):
                    device_info = {
                        'device_id': data.get('device_id', self.device_id),
                        'screen_id': data.get('screen_id'),
                        'location_id': data.get('location_id'),
                        'organization_id': data.get('organization_id')
                    }
                    self.logger.info(f"Device info from API: {device_info}")
                    return device_info
                    
        except Exception as e:
            self.logger.error(f"Error getting device info: {e}")
        
        return None
    
    def get_schedule(self, screen_id):
        """Get schedule for the assigned screen"""
        try:
            response = requests.get(
                f"{self.base_url}/api/screens/{screen_id}/current-content",
                timeout=self.timeout
            )
            
            if response.status_code in [200, 201]:
                data = response.json()
                return data.get('schedule', [])
            else:
                self.logger.error(f"Failed to get schedule: {response.status_code}")
                
        except Exception as e:
            self.logger.error(f"Error getting schedule: {e}")
        
        return []
    
    def get_media_list(self, screen_id):
        """Get list of media files for the screen"""
        try:
            response = requests.get(
                f"{self.base_url}/api/screens/{screen_id}/current-content",
                timeout=self.timeout
            )
            
            if response.status_code in [200, 201]:
                data = response.json()
                return data.get('media', [])
            else:
                self.logger.error(f"Failed to get media list: {response.status_code}")
                
        except Exception as e:
            self.logger.error(f"Error getting media list: {e}")
        
        return []
    
    def download_media(self, media_url, local_path):
        """Download media file to local cache"""
        try:
            response = requests.get(media_url, stream=True, timeout=self.timeout)
            
            if response.status_code in [200, 201]:
                with open(local_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                self.logger.info(f"Downloaded media: {local_path}")
                return True
            else:
                self.logger.error(f"Failed to download media: {response.status_code}")
                
        except Exception as e:
            self.logger.error(f"Error downloading media: {e}")
        
        return False
    
    def send_heartbeat(self):
        """Send heartbeat to indicate device is online"""
        try:
            device_id = self.config.get('device_id')
            if not device_id:
                return False
            
            response = requests.post(
                f"{self.base_url}/api/devices/{device_id}/heartbeat",
                json={
                    "timestamp": datetime.utcnow().isoformat(),
                    "status": "online",
                    "ip_address": self._get_local_ip()
                },
                timeout=self.timeout
            )
            
            return response.status_code == 200
            
        except Exception as e:
            self.logger.error(f"Error sending heartbeat: {e}")
            return False
    
    def _get_device_id(self):
        """Generate unique device identifier"""
        try:
            # Try to get CPU serial number (Pi specific)
            with open('/proc/cpuinfo', 'r') as f:
                for line in f:
                    if line.startswith('Serial'):
                        serial = line.split(':')[1].strip()
                        return f"pi-{serial}"
        except:
            pass
        
        # Fallback to MAC address
        try:
            import uuid
            mac = uuid.getnode()
            return f"device-{mac:012x}"
        except:
            pass
        
        # Ultimate fallback
        return f"device-{uuid.uuid4().hex[:12]}"
    
    def _get_local_ip(self):
        """Get local IP address"""
        try:
            # Connect to remote server to determine local IP
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))
                return s.getsockname()[0]
        except:
            return "unknown"
    
    def _get_mac_address(self):
        """Get MAC address"""
        try:
            import uuid
            mac = uuid.getnode()
            return ':'.join(f'{mac:012x}'[i:i+2] for i in range(0, 12, 2))
        except:
            return "unknown"