#!/usr/bin/env python3
"""
FBI Debug Tool - Diagnose why FBI exits immediately in subprocess vs manual execution
"""
import subprocess
import time
import os
import sys
import signal

def test_fbi_execution(image_path, duration=30):
    """Test various FBI execution methods to find the working combination"""
    
    print(f"Testing FBI with image: {image_path}")
    print(f"Expected duration: {duration} seconds\n")
    
    if not os.path.exists(image_path):
        print(f"ERROR: Test image not found: {image_path}")
        return
    
    # Test 1: Basic FBI command with timing
    print("=" * 60)
    print("TEST 1: Basic FBI subprocess with timing")
    print("=" * 60)
    
    start_time = time.time()
    try:
        result = subprocess.run([
            'sudo', 'fbi', 
            '-a',           # Autoscale
            '--noverbose',  # Quiet
            '-T', '1',      # Console 1
            '-t', str(duration),  # Timeout
            image_path
        ], capture_output=True, text=True, timeout=duration + 5)
        
        elapsed = time.time() - start_time
        print(f"FBI completed in {elapsed:.1f}s")
        print(f"Return code: {result.returncode}")
        if result.stdout:
            print(f"STDOUT: {result.stdout}")
        if result.stderr:
            print(f"STDERR: {result.stderr}")
            
    except subprocess.TimeoutExpired as e:
        elapsed = time.time() - start_time
        print(f"FBI timeout after {elapsed:.1f}s (expected)")
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"FBI error after {elapsed:.1f}s: {e}")
    
    # Test 2: FBI with different TTY settings
    print("\n" + "=" * 60)
    print("TEST 2: FBI with explicit environment")
    print("=" * 60)
    
    # Kill any existing FBI processes
    subprocess.run(['sudo', 'pkill', '-f', 'fbi'], capture_output=True)
    time.sleep(1)
    
    env = os.environ.copy()
    env['TERM'] = 'linux'
    env['DISPLAY'] = ''  # Clear display to force framebuffer mode
    
    start_time = time.time()
    try:
        result = subprocess.run([
            'sudo', 'fbi', 
            '-a',           # Autoscale
            '--noverbose',  # Quiet
            '-T', '1',      # Console 1
            '-t', str(duration),  # Timeout
            image_path
        ], capture_output=True, text=True, timeout=duration + 5, env=env)
        
        elapsed = time.time() - start_time
        print(f"FBI completed in {elapsed:.1f}s")
        print(f"Return code: {result.returncode}")
        if result.stdout:
            print(f"STDOUT: {result.stdout}")
        if result.stderr:
            print(f"STDERR: {result.stderr}")
            
    except subprocess.TimeoutExpired:
        elapsed = time.time() - start_time
        print(f"FBI timeout after {elapsed:.1f}s (expected)")
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"FBI error after {elapsed:.1f}s: {e}")
    
    # Test 3: FBI without timeout, manual timing
    print("\n" + "=" * 60)
    print("TEST 3: FBI without timeout, manual process control")
    print("=" * 60)
    
    # Kill any existing FBI processes
    subprocess.run(['sudo', 'pkill', '-f', 'fbi'], capture_output=True)
    time.sleep(1)
    
    start_time = time.time()
    try:
        # Start FBI without timeout parameter
        process = subprocess.Popen([
            'sudo', 'fbi', 
            '-a',           # Autoscale
            '--noverbose',  # Quiet
            '-T', '1',      # Console 1
            image_path      # No -t timeout
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # Wait for specified duration
        time.sleep(duration)
        
        # Terminate FBI
        process.terminate()
        try:
            stdout, stderr = process.communicate(timeout=5)
            elapsed = time.time() - start_time
            print(f"FBI manually controlled for {elapsed:.1f}s")
            print(f"Return code: {process.returncode}")
            if stdout:
                print(f"STDOUT: {stdout.decode()}")
            if stderr:
                print(f"STDERR: {stderr.decode()}")
        except subprocess.TimeoutExpired:
            print("FBI didn't terminate gracefully, killing...")
            process.kill()
            process.wait()
            
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"FBI error after {elapsed:.1f}s: {e}")
    
    # Test 4: Check system state
    print("\n" + "=" * 60)
    print("TEST 4: System State Diagnosis")
    print("=" * 60)
    
    # Check framebuffer device
    try:
        result = subprocess.run(['ls', '-la', '/dev/fb0'], capture_output=True, text=True)
        print(f"Framebuffer device: {result.stdout.strip()}")
    except:
        print("Framebuffer device check failed")
    
    # Check current TTY
    try:
        result = subprocess.run(['tty'], capture_output=True, text=True)
        print(f"Current TTY: {result.stdout.strip()}")
    except:
        print("TTY check failed")
    
    # Check who owns console 1
    try:
        result = subprocess.run(['sudo', 'fuser', '/dev/tty1'], capture_output=True, text=True)
        print(f"Console 1 users: {result.stdout.strip()}")
    except:
        print("Console 1 check failed")
    
    # Check environment variables that might affect FBI
    print("Relevant environment variables:")
    for var in ['TERM', 'DISPLAY', 'XDG_VTNR', 'XDG_SESSION_TYPE']:
        print(f"  {var}: {os.environ.get(var, 'unset')}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 debug-fbi.py <image_file> [duration]")
        print("Example: python3 debug-fbi.py /tmp/test.jpg 10")
        sys.exit(1)
    
    image_path = sys.argv[1]
    duration = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    
    test_fbi_execution(image_path, duration)

if __name__ == "__main__":
    main()