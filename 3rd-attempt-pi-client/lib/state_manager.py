"""
State Manager for Mesophy Pi Client
Simple state machine: NOT_PAIRED → WAITING_FOR_MEDIA → PLAYING_CONTENT
"""

import logging

class StateManager:
    def __init__(self, config):
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # States
        self.NOT_PAIRED = "NOT_PAIRED"
        self.WAITING_FOR_MEDIA = "WAITING_FOR_MEDIA" 
        self.PLAYING_CONTENT = "PLAYING_CONTENT"
    
    def get_current_state(self):
        """Determine current state based on configuration"""
        
        # Check if device is paired
        device_id = self.config.get('device_id')
        screen_id = self.config.get('screen_id')
        
        if not device_id or not screen_id:
            return self.NOT_PAIRED
        
        # Device is paired, check if content is available
        # This will be determined by ContentManager
        # For now, assume we need to check with content manager
        return self.WAITING_FOR_MEDIA  # ContentManager will determine if content is available
    
    def is_paired(self):
        """Check if device is paired"""
        return bool(self.config.get('device_id') and self.config.get('screen_id'))
    
    def set_paired(self, device_id, screen_id):
        """Mark device as paired"""
        self.config['device_id'] = device_id
        self.config['screen_id'] = screen_id
        self.config['pairing_code'] = None
        self.logger.info(f"Device paired: {device_id} -> {screen_id}")
    
    def clear_pairing(self):
        """Clear pairing information"""
        self.config['device_id'] = None
        self.config['screen_id'] = None
        self.config['pairing_code'] = None
        self.logger.info("Device pairing cleared")