#!/usr/bin/env python3
"""
Mesophy Pi Client - API Communication Module
Handles background API operations (pairing, sync, heartbeat)
"""

import json
import time
import threading
import requests
import os
from datetime import datetime

class MesophyAPIClient:
    def __init__(self, config_path='/opt/mesophy/config/config.json'):
        self.config = self.load_config(config_path)
        self.device_config = None
        self.api_base = self.config.get('api', {}).get('baseUrl', 'https://mesophy.vercel.app')
        self.endpoints = self.config.get('api', {}).get('endpoints', {})
        
        # Threading
        self.sync_thread = None
        self.heartbeat_thread = None
        self.running = False
        
        # Load device config if exists
        self.load_device_config()

    def load_config(self, config_path):
        """Load configuration file"""
        try:
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    return json.load(f)
            return {}
        except Exception as e:
            print(f"Error loading config: {e}")
            return {}

    def load_device_config(self):
        """Load device configuration"""
        device_config_path = '/opt/mesophy/config/device.json'
        try:
            if os.path.exists(device_config_path):
                with open(device_config_path, 'r') as f:
                    self.device_config = json.load(f)
                    return True
        except Exception as e:
            print(f"No device config loaded: {e}")
        
        self.device_config = None
        return False

    def generate_pairing_code(self):
        """Generate pairing code"""
        try:
            system_info = {
                'hostname': os.uname().nodename,
                'platform': 'linux',
                'arch': os.uname().machine,
                'timestamp': datetime.now().isoformat()
            }
            
            url = f"{self.api_base}{self.endpoints.get('generateCode', '/api/devices/generate-code')}"
            response = requests.post(url, json={'device_info': system_info}, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                return data.get('pairing_code')
            else:
                print(f"Failed to generate pairing code: {response.status_code}")
                return None
                
        except Exception as e:
            print(f"Error generating pairing code: {e}")
            return None

    def check_pairing_status(self, pairing_code):
        """Check pairing status"""
        try:
            url = f"{self.api_base}{self.endpoints.get('checkPairing', '/api/devices/check-pairing')}/{pairing_code}"
            response = requests.get(url, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                return data
            return None
            
        except Exception as e:
            print(f"Error checking pairing status: {e}")
            return None

    def sync_content(self):
        """Sync content and schedules"""
        if not self.device_config or not self.device_config.get('device_token'):
            print("No device token available for sync")
            return None
            
        try:
            url = f"{self.api_base}{self.endpoints.get('sync', '/api/devices/sync')}"
            headers = {
                'Authorization': f"Bearer {self.device_config['device_token']}",
                'Content-Type': 'application/json'
            }
            
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                print(f"Content sync completed: {data.get('message', 'Success')}")
                return data
            else:
                print(f"Content sync failed: {response.status_code}")
                return None
                
        except Exception as e:
            print(f"Error syncing content: {e}")
            return None

    def send_heartbeat(self):
        """Send heartbeat to server"""
        if not self.device_config or not self.device_config.get('device_token'):
            return False
            
        try:
            # Gather system info
            import psutil
            
            system_info = {
                'status': 'online',
                'timestamp': datetime.now().isoformat(),
                'system_info': {
                    'cpu_percent': psutil.cpu_percent(interval=1),
                    'memory_percent': psutil.virtual_memory().percent,
                    'disk_usage': psutil.disk_usage('/').percent,
                    'temperature': self.get_cpu_temperature(),
                    'uptime': time.time() - psutil.boot_time()
                },
                'display_info': {
                    'resolution': f"{self.config.get('display', {}).get('width', 1920)}x{self.config.get('display', {}).get('height', 1080)}",
                    'mode': 'native_display'
                }
            }
            
            url = f"{self.api_base}{self.endpoints.get('heartbeat', '/api/devices/heartbeat')}"
            headers = {
                'Authorization': f"Bearer {self.device_config['device_token']}",
                'Content-Type': 'application/json'
            }
            
            response = requests.post(url, json=system_info, headers=headers, timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('sync_recommended'):
                    print("Server recommends content sync")
                    threading.Thread(target=self.sync_content, daemon=True).start()
                return True
            else:
                print(f"Heartbeat failed: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"Error sending heartbeat: {e}")
            return False

    def get_cpu_temperature(self):
        """Get CPU temperature (Pi specific)"""
        try:
            with open('/sys/class/thermal/thermal_zone0/temp', 'r') as f:
                temp = int(f.read().strip()) / 1000.0
                return round(temp, 1)
        except:
            return None

    def start_sync_service(self):
        """Start background sync service"""
        if self.sync_thread and self.sync_thread.is_alive():
            return
            
        def sync_worker():
            sync_interval = self.config.get('device', {}).get('syncInterval', 120)
            print(f"Starting sync service (interval: {sync_interval}s)")
            
            # Initial sync
            self.sync_content()
            
            while self.running:
                time.sleep(sync_interval)
                if self.running:
                    self.sync_content()
        
        self.running = True
        self.sync_thread = threading.Thread(target=sync_worker, daemon=True)
        self.sync_thread.start()

    def start_heartbeat_service(self):
        """Start background heartbeat service"""
        if self.heartbeat_thread and self.heartbeat_thread.is_alive():
            return
            
        def heartbeat_worker():
            heartbeat_interval = self.config.get('device', {}).get('heartbeatInterval', 300)
            print(f"Starting heartbeat service (interval: {heartbeat_interval}s)")
            
            # Initial heartbeat
            self.send_heartbeat()
            
            while self.running:
                time.sleep(heartbeat_interval)
                if self.running:
                    self.send_heartbeat()
        
        self.running = True
        self.heartbeat_thread = threading.Thread(target=heartbeat_worker, daemon=True)
        self.heartbeat_thread.start()

    def stop_services(self):
        """Stop all background services"""
        print("Stopping API services...")
        self.running = False
        
        if self.sync_thread:
            self.sync_thread.join(timeout=5)
        if self.heartbeat_thread:
            self.heartbeat_thread.join(timeout=5)

    def is_paired(self):
        """Check if device is paired"""
        return self.device_config is not None and self.device_config.get('device_token') is not None


# Example usage
if __name__ == "__main__":
    api_client = MesophyAPIClient()
    
    if api_client.is_paired():
        print("Device is paired, starting services...")
        api_client.start_sync_service()
        api_client.start_heartbeat_service()
        
        try:
            while True:
                time.sleep(10)
        except KeyboardInterrupt:
            print("Shutting down...")
            api_client.stop_services()
    else:
        print("Device not paired yet")