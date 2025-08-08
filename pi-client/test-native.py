#!/usr/bin/env python3
"""
Test script for Mesophy Native Display System
"""

import os
import sys
import time

def test_imports():
    """Test that all required modules can be imported"""
    print("Testing imports...")
    
    try:
        from PIL import Image, ImageDraw, ImageFont
        print("✓ PIL (Pillow) import successful")
    except ImportError as e:
        print(f"✗ PIL (Pillow) import failed: {e}")
        return False
    
    try:
        import requests
        print("✓ requests import successful")
    except ImportError as e:
        print(f"✗ requests import failed: {e}")
        return False
    
    try:
        import psutil
        print("✓ psutil import successful")
    except ImportError as e:
        print(f"✗ psutil import failed: {e}")
        return False
    
    # Test local modules
    try:
        from api_client import MesophyAPIClient
        print("✓ api_client import successful")
    except ImportError as e:
        print(f"✗ api_client import failed: {e}")
    
    try:
        from media_player import NativeMediaPlayer
        print("✓ media_player import successful")
    except ImportError as e:
        print(f"✗ media_player import failed: {e}")
    
    try:
        from native_display import NativeDisplayManager
        print("✗ Should not import native_display (it's the main script)")
    except ImportError:
        print("✓ native_display correctly not importable")
    
    return True

def test_commands():
    """Test that required system commands are available"""
    print("\nTesting system commands...")
    
    commands = {
        'fbi': 'Framebuffer image viewer',
        'fbset': 'Framebuffer configuration',
        'omxplayer': 'Hardware video player (optional)',
        'vlc': 'VLC media player (fallback)',
        'python3': 'Python interpreter'
    }
    
    for cmd, desc in commands.items():
        if os.system(f"which {cmd} > /dev/null 2>&1") == 0:
            print(f"✓ {cmd} - {desc}")
        else:
            if cmd in ['omxplayer', 'vlc']:
                print(f"⚠ {cmd} - {desc} (optional, install if needed)")
            else:
                print(f"✗ {cmd} - {desc} (REQUIRED)")

def test_permissions():
    """Test file and device permissions"""
    print("\nTesting permissions...")
    
    # Test framebuffer access
    if os.path.exists('/dev/fb0'):
        if os.access('/dev/fb0', os.R_OK | os.W_OK):
            print("✓ Framebuffer /dev/fb0 accessible")
        else:
            print("⚠ Framebuffer /dev/fb0 not writable (may need to be in video group)")
    else:
        print("✗ Framebuffer /dev/fb0 not found")
    
    # Test directory creation
    test_dirs = ['/opt/mesophy/test', '/tmp/mesophy_test']
    
    for test_dir in test_dirs:
        try:
            os.makedirs(test_dir, exist_ok=True)
            os.rmdir(test_dir)
            print(f"✓ Can create directories in {os.path.dirname(test_dir)}")
        except PermissionError:
            print(f"✗ Cannot create directories in {os.path.dirname(test_dir)}")

def test_display():
    """Test basic display functionality"""
    print("\nTesting display functionality...")
    
    try:
        from PIL import Image, ImageDraw
        
        # Create test image
        img = Image.new('RGB', (640, 480), color='black')
        draw = ImageDraw.Draw(img)
        draw.text((50, 50), "Mesophy Test", fill='white')
        
        # Save test image
        test_path = '/tmp/mesophy_test.png'
        img.save(test_path)
        print(f"✓ Created test image: {test_path}")
        
        # Clean up
        os.unlink(test_path)
        print("✓ Basic image generation works")
        
    except Exception as e:
        print(f"✗ Display test failed: {e}")

def main():
    print("Mesophy Native Display System - Test Script")
    print("=" * 50)
    
    # Run tests
    test_imports()
    test_commands()
    test_permissions()
    test_display()
    
    print("\n" + "=" * 50)
    print("Test complete!")
    print("\nNext steps:")
    print("1. If tests passed, try running: sudo ./install-native-simple.sh")
    print("2. After installation: sudo systemctl start mesophy-native-display")
    print("3. Check logs: journalctl -u mesophy-native-display -f")

if __name__ == "__main__":
    main()