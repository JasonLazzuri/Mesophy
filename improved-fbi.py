#!/usr/bin/env python3
"""
Improved FBI Image Display Manager
Provides multiple strategies for reliable image display timing on Raspberry Pi
"""
import subprocess
import time
import os
import sys
import signal
import threading

class FBIDisplayManager:
    def __init__(self):
        self.current_process = None
        self.display_active = False
    
    def kill_existing_fbi(self):
        """Kill any existing FBI processes"""
        try:
            subprocess.run(['sudo', 'pkill', '-f', 'fbi'], 
                          capture_output=True, check=False)
            time.sleep(0.5)  # Brief pause to ensure cleanup
        except:
            pass
    
    def display_image_method1_timeout(self, image_path, duration):
        """
        Method 1: FBI with built-in timeout (original approach)
        """
        print(f"Method 1: FBI with -t {duration} timeout")
        
        self.kill_existing_fbi()
        start_time = time.time()
        
        try:
            result = subprocess.run([
                'sudo', 'fbi', 
                '-a',                    # Autoscale
                '--noverbose',           # Quiet
                '-T', '1',               # Console 1
                '-t', str(duration),     # Built-in timeout
                image_path
            ], capture_output=True, text=True, timeout=duration + 5)
            
            elapsed = time.time() - start_time
            print(f"  FBI completed in {elapsed:.1f}s (return code: {result.returncode})")
            
            if elapsed < duration - 2:  # FBI exited too early
                remaining = duration - elapsed
                print(f"  FBI exited early, sleeping additional {remaining:.1f}s")
                time.sleep(remaining)
                return True
            
            return elapsed >= duration - 2  # Success if close to expected duration
            
        except subprocess.TimeoutExpired:
            elapsed = time.time() - start_time
            print(f"  FBI timeout after {elapsed:.1f}s")
            return True
        except Exception as e:
            elapsed = time.time() - start_time
            print(f"  FBI error after {elapsed:.1f}s: {e}")
            return False
    
    def display_image_method2_manual_control(self, image_path, duration):
        """
        Method 2: FBI without timeout, manual process control
        """
        print(f"Method 2: FBI with manual timing control for {duration}s")
        
        self.kill_existing_fbi()
        start_time = time.time()
        
        try:
            # Start FBI without timeout
            process = subprocess.Popen([
                'sudo', 'fbi', 
                '-a',                    # Autoscale
                '--noverbose',           # Quiet
                '-T', '1',               # Console 1
                image_path               # No timeout parameter
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            self.current_process = process
            
            # Wait for specified duration
            time.sleep(duration)
            
            # Graceful termination
            process.terminate()
            try:
                stdout, stderr = process.communicate(timeout=3)
                elapsed = time.time() - start_time
                print(f"  FBI terminated after {elapsed:.1f}s")
                
                if stderr:
                    stderr_text = stderr.decode().strip()
                    if stderr_text:
                        print(f"  FBI stderr: {stderr_text}")
                
                return True
                
            except subprocess.TimeoutExpired:
                print("  FBI didn't terminate gracefully, force killing...")
                process.kill()
                process.wait()
                return True
                
        except Exception as e:
            elapsed = time.time() - start_time
            print(f"  FBI error after {elapsed:.1f}s: {e}")
            return False
        finally:
            self.current_process = None
    
    def display_image_method3_enhanced_env(self, image_path, duration):
        """
        Method 3: FBI with enhanced environment and TTY handling
        """
        print(f"Method 3: FBI with enhanced environment for {duration}s")
        
        self.kill_existing_fbi()
        
        # Set up environment for framebuffer access
        env = os.environ.copy()
        env['TERM'] = 'linux'
        env['FRAMEBUFFER'] = '/dev/fb0'
        env.pop('DISPLAY', None)  # Remove X11 display
        env.pop('WAYLAND_DISPLAY', None)  # Remove Wayland display
        
        start_time = time.time()
        
        try:
            # Use sudo with preserved environment
            process = subprocess.Popen([
                'sudo', '-E', 'fbi',     # -E preserves environment
                '-a',                    # Autoscale
                '--noverbose',           # Quiet
                '-T', '1',               # Console 1
                '--vt', '1',             # Force VT 1
                image_path
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            
            self.current_process = process
            
            # Wait for duration
            time.sleep(duration)
            
            # Send SIGTERM
            process.terminate()
            try:
                stdout, stderr = process.communicate(timeout=3)
                elapsed = time.time() - start_time
                print(f"  FBI completed in {elapsed:.1f}s")
                return True
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
                return True
                
        except Exception as e:
            elapsed = time.time() - start_time
            print(f"  FBI error after {elapsed:.1f}s: {e}")
            return False
        finally:
            self.current_process = None
    
    def display_image_method4_fim_fallback(self, image_path, duration):
        """
        Method 4: FIM (Fbi IMproved) as alternative
        """
        print(f"Method 4: FIM fallback for {duration}s")
        
        # Check if fim is available
        if subprocess.run(['which', 'fim'], capture_output=True).returncode != 0:
            print("  FIM not available, skipping")
            return False
        
        try:
            # Kill any existing fim processes
            subprocess.run(['sudo', 'pkill', '-f', 'fim'], 
                          capture_output=True, check=False)
            
            start_time = time.time()
            
            process = subprocess.Popen([
                'sudo', 'fim',
                '-a',                    # Autoscale
                '-q',                    # Quiet
                '-T', '/dev/fb0',        # Explicit framebuffer
                image_path
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            time.sleep(duration)
            
            process.terminate()
            try:
                process.communicate(timeout=3)
                elapsed = time.time() - start_time
                print(f"  FIM completed in {elapsed:.1f}s")
                return True
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
                return True
                
        except Exception as e:
            print(f"  FIM error: {e}")
            return False
    
    def display_image_method5_direct_fb(self, image_path, duration):
        """
        Method 5: Direct framebuffer writing with ImageMagick
        """
        print(f"Method 5: Direct framebuffer with convert for {duration}s")
        
        try:
            # Check if ImageMagick convert is available
            if subprocess.run(['which', 'convert'], capture_output=True).returncode != 0:
                print("  ImageMagick convert not available, skipping")
                return False
            
            start_time = time.time()
            
            # Convert and display to framebuffer
            result = subprocess.run([
                'sudo', 'convert',
                image_path,
                '-resize', '1920x1080',   # Adjust to your screen resolution
                '-gravity', 'center',
                '-background', 'black',
                '-extent', '1920x1080',
                'rgb:/dev/fb0'
            ], capture_output=True, text=True)
            
            if result.returncode == 0:
                print("  Image written to framebuffer successfully")
                time.sleep(duration)  # Just wait
                
                # Clear framebuffer
                subprocess.run(['sudo', 'dd', 'if=/dev/zero', 'of=/dev/fb0', 'bs=1M', 'count=1'],
                              capture_output=True, check=False)
                
                elapsed = time.time() - start_time
                print(f"  Direct FB completed in {elapsed:.1f}s")
                return True
            else:
                print(f"  Convert failed: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"  Direct FB error: {e}")
            return False
    
    def display_image_robust(self, image_path, duration):
        """
        Try multiple methods in order until one works reliably
        """
        if not os.path.exists(image_path):
            print(f"ERROR: Image file not found: {image_path}")
            return False
        
        print(f"Displaying {image_path} for {duration} seconds")
        print("-" * 60)
        
        # Method priority order
        methods = [
            self.display_image_method2_manual_control,  # Usually most reliable
            self.display_image_method3_enhanced_env,    # Better environment handling
            self.display_image_method1_timeout,         # Original method
            self.display_image_method4_fim_fallback,    # Alternative tool
            self.display_image_method5_direct_fb        # Last resort
        ]
        
        for i, method in enumerate(methods, 1):
            try:
                print(f"\nTrying method {i}...")
                if method(image_path, duration):
                    print(f"✓ Method {i} succeeded")
                    return True
                else:
                    print(f"✗ Method {i} failed")
            except Exception as e:
                print(f"✗ Method {i} exception: {e}")
            
            # Small pause between methods
            time.sleep(0.5)
        
        print("\n❌ All methods failed!")
        return False
    
    def cleanup(self):
        """Clean up any running processes"""
        if self.current_process:
            try:
                self.current_process.terminate()
                self.current_process.wait(timeout=3)
            except:
                try:
                    self.current_process.kill()
                    self.current_process.wait()
                except:
                    pass
        
        # Kill any remaining FBI/FIM processes
        subprocess.run(['sudo', 'pkill', '-f', 'fbi'], capture_output=True, check=False)
        subprocess.run(['sudo', 'pkill', '-f', 'fim'], capture_output=True, check=False)

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 improved-fbi.py <image_file> [duration]")
        print("Example: python3 improved-fbi.py /tmp/test.jpg 30")
        sys.exit(1)
    
    image_path = sys.argv[1]
    duration = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    
    manager = FBIDisplayManager()
    
    # Set up signal handlers for cleanup
    def signal_handler(signum, frame):
        print("\nReceived signal, cleaning up...")
        manager.cleanup()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        success = manager.display_image_robust(image_path, duration)
        if success:
            print("\n✅ Image display completed successfully")
        else:
            print("\n❌ Image display failed")
            sys.exit(1)
    finally:
        manager.cleanup()

if __name__ == "__main__":
    main()