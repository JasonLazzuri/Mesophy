#!/usr/bin/env python3
"""
Debug script to test Pi display methods and identify issues
"""

import os
import subprocess
import time
import sys
from pathlib import Path

def run_command(cmd, timeout=5):
    """Run a command and return result safely"""
    try:
        if isinstance(cmd, str):
            result = subprocess.run(cmd, shell=True, capture_output=True, timeout=timeout, text=True)
        else:
            result = subprocess.run(cmd, capture_output=True, timeout=timeout, text=True)
        return result.returncode == 0, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return False, "", "Command timed out"
    except Exception as e:
        return False, "", str(e)

def check_system():
    """Check basic system info"""
    print("=" * 60)
    print("SYSTEM DIAGNOSTICS")
    print("=" * 60)
    
    # Basic system info
    print("🖥️  Display Environment:")
    print(f"DISPLAY env var: {os.environ.get('DISPLAY', 'Not set')}")
    
    success, out, err = run_command("echo $DISPLAY")
    print(f"Shell DISPLAY: {out.strip() if out.strip() else 'Not set'}")
    
    # Check if X11 is running
    success, out, err = run_command("ps aux | grep -E '(X|x11|xinit|startx)' | grep -v grep")
    print(f"X11 processes: {'Found' if success and out.strip() else 'None found'}")
    if out.strip():
        print(f"  {out.strip()}")
    
    # Check framebuffer
    print(f"\n📺 Framebuffer:")
    print(f"/dev/fb0 exists: {os.path.exists('/dev/fb0')}")
    if os.path.exists('/dev/fb0'):
        try:
            stat = os.stat('/dev/fb0')
            print(f"/dev/fb0 permissions: {oct(stat.st_mode)[-3:]}")
        except:
            print("/dev/fb0 permissions: Cannot read")
    
    # Check VNC
    print(f"\n🔍 VNC:")
    success, out, err = run_command("ps aux | grep vnc | grep -v grep")
    print(f"VNC processes: {'Found' if success and out.strip() else 'None found'}")
    if out.strip():
        print(f"  {out.strip()}")

def check_tools():
    """Check available display tools"""
    print("\n" + "=" * 60)
    print("DISPLAY TOOLS CHECK")
    print("=" * 60)
    
    tools = [
        ('feh', 'Image viewer'),
        ('eog', 'GNOME image viewer'),
        ('gpicview', 'Lightweight image viewer'), 
        ('fbi', 'Framebuffer image viewer'),
        ('convert', 'ImageMagick converter'),
        ('xdg-open', 'Default file opener')
    ]
    
    for tool, desc in tools:
        success, out, err = run_command(['which', tool])
        status = "✅" if success else "❌"
        location = out.strip() if success else "Not found"
        print(f"{status} {tool:12} - {desc:25} - {location}")

def test_image_generation():
    """Test if we can create a simple test image"""
    print("\n" + "=" * 60)
    print("IMAGE GENERATION TEST")
    print("=" * 60)
    
    try:
        from PIL import Image, ImageDraw, ImageFont
        print("✅ PIL (Python Imaging Library) available")
        
        # Create a simple test image
        img = Image.new('RGB', (800, 600), color='red')
        draw = ImageDraw.Draw(img)
        
        # Try to use a font
        try:
            font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 48)
            print("✅ TrueType fonts available")
        except:
            font = ImageFont.load_default()
            print("⚠️  Using default font (TrueType fonts not found)")
        
        draw.text((50, 50), "TEST IMAGE", fill='white', font=font)
        draw.text((50, 150), "If you can see this,", fill='yellow', font=font)
        draw.text((50, 250), "image generation works!", fill='yellow', font=font)
        draw.text((50, 350), "Display method is the issue", fill='cyan', font=font)
        
        test_image_path = '/opt/mesophy/temp/test_display.png'
        os.makedirs(os.path.dirname(test_image_path), exist_ok=True)
        img.save(test_image_path)
        print(f"✅ Test image created: {test_image_path}")
        print(f"   Image size: {os.path.getsize(test_image_path)} bytes")
        
        return test_image_path
        
    except ImportError:
        print("❌ PIL not available - cannot create test images")
        return None
    except Exception as e:
        print(f"❌ Error creating test image: {e}")
        return None

def test_existing_images():
    """Look for existing pairing screen images"""
    print("\n" + "=" * 60) 
    print("EXISTING IMAGES CHECK")
    print("=" * 60)
    
    temp_dir = Path('/opt/mesophy/temp')
    if not temp_dir.exists():
        print("❌ /opt/mesophy/temp directory does not exist")
        return []
    
    # Look for pairing screen images
    pairing_images = list(temp_dir.glob('pairing_screen_*.png'))
    print(f"Found {len(pairing_images)} pairing screen images:")
    
    images_to_test = []
    for img_path in pairing_images:
        size = img_path.stat().st_size
        print(f"  📄 {img_path.name} ({size} bytes)")
        images_to_test.append(str(img_path))
    
    return images_to_test

def test_display_methods(image_path):
    """Test different ways to display an image"""
    if not image_path or not os.path.exists(image_path):
        print(f"❌ Image not found: {image_path}")
        return
    
    print(f"\n" + "=" * 60)
    print(f"DISPLAY METHODS TEST - {os.path.basename(image_path)}")
    print("=" * 60)
    
    # Test methods
    methods = [
        {
            'name': 'feh (fullscreen)',
            'cmd': ['feh', '--fullscreen', '--auto-zoom', '--no-menus', image_path],
            'env': {'DISPLAY': ':0'},
            'needs': 'X11 display'
        },
        {
            'name': 'feh (windowed)',  
            'cmd': ['feh', '--geometry', '800x600', image_path],
            'env': {'DISPLAY': ':0'},
            'needs': 'X11 display'
        },
        {
            'name': 'eog (GNOME)',
            'cmd': ['eog', image_path],
            'env': {'DISPLAY': ':0'},
            'needs': 'X11 display + GNOME'
        },
        {
            'name': 'fbi (framebuffer)',
            'cmd': ['fbi', '-d', '/dev/fb0', '-T', '1', '-noverbose', '-a', image_path],
            'env': {},
            'needs': 'framebuffer access'
        },
        {
            'name': 'fbi (auto-detect)',
            'cmd': ['fbi', '-T', '1', '-noverbose', '-a', image_path], 
            'env': {},
            'needs': 'framebuffer access'
        }
    ]
    
    for method in methods:
        print(f"\n🧪 Testing: {method['name']}")
        print(f"   Needs: {method['needs']}")
        print(f"   Command: {' '.join(method['cmd'])}")
        print(f"   Environment: {method['env']}")
        
        # Check if the tool exists
        tool = method['cmd'][0]
        success, _, _ = run_command(['which', tool])
        if not success:
            print(f"   ❌ {tool} not found - skipping")
            continue
        
        # Try to run it
        try:
            env = os.environ.copy()
            env.update(method['env'])
            
            proc = subprocess.Popen(
                method['cmd'],
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            print(f"   ⏳ Started process PID {proc.pid}, waiting 2 seconds...")
            time.sleep(2)
            
            if proc.poll() is None:
                print(f"   ✅ Process running! Terminating after test...")
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                    print(f"   ✅ Process terminated cleanly")
                except:
                    proc.kill()
                    print(f"   ⚠️  Process killed (didn't terminate gracefully)")
            else:
                stdout, stderr = proc.communicate()
                print(f"   ❌ Process exited immediately")
                if stderr.strip():
                    print(f"   Error: {stderr.strip()}")
                if stdout.strip():
                    print(f"   Output: {stdout.strip()}")
                    
        except Exception as e:
            print(f"   ❌ Exception: {e}")

def main():
    print("🔍 Pi Display Diagnostic Tool")
    print("This will help identify why pairing screens aren't displaying")
    
    # Check if running as root
    if os.geteuid() != 0:
        print("⚠️  Not running as root - some tests may fail")
        print("   Consider running: sudo python3 debug_display.py")
    
    # Run diagnostics
    check_system()
    check_tools()
    
    # Test image creation
    test_image = test_image_generation()
    
    # Find existing images
    existing_images = test_existing_images()
    
    # Test display methods
    if test_image:
        print(f"\n🎯 Testing with generated test image...")
        test_display_methods(test_image)
    
    if existing_images:
        for img in existing_images[:1]:  # Test just the first existing image
            print(f"\n🎯 Testing with existing pairing image...")  
            test_display_methods(img)
    
    print("\n" + "=" * 60)
    print("DIAGNOSTIC COMPLETE")
    print("=" * 60)
    print("👆 Check the results above to identify the display issue")
    print("💡 Common fixes:")
    print("   - Install missing tools: sudo apt install feh fbi imagemagick")
    print("   - Fix permissions: sudo usermod -a -G video pi")
    print("   - Start X11: startx (for VNC/desktop display)")
    print("   - Check VNC settings for proper display forwarding")

if __name__ == "__main__":
    main()