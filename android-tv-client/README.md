# Mesophy Android TV Digital Signage Client

Professional digital signage client for Android TV boxes and streaming devices.

## Overview

This Android TV application provides the same digital signage functionality as the Raspberry Pi client, but optimized for Android TV boxes, streaming devices, and commercial displays. It offers easier deployment, better performance, and professional-grade media playback.

## Features

- **Professional Media Playback**: Hardware-accelerated video with ExoPlayer
- **Remote Device Management**: Same API compatibility as Pi client
- **Enterprise Kiosk Mode**: Unattended 24/7 operation
- **Multi-threaded Architecture**: <2 second command response times
- **Content Caching**: Offline capability with intelligent cache management
- **Device Pairing**: Secure registration with web portal
- **Command Execution**: Restart, reboot, sync, health check support

## Target Devices

### Minimum Requirements
- **OS**: Android TV 9.0+ (API level 28+)
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 32GB minimum, 64GB recommended
- **Processor**: Quad-core ARM Cortex-A53 1.2GHz+
- **Network**: Ethernet or 802.11ac WiFi

### Tested Hardware
- Google Chromecast with Google TV (4K)
- NVIDIA Shield TV and Shield TV Pro
- Xiaomi Mi Box S
- Amazon Fire TV Stick 4K Max
- Commercial Android TV boxes with Amlogic S905/S922X

## Architecture

```
┌─────────────────────────────────────────────────┐
│                MainActivity                     │
│  (TV Launcher Activity + Kiosk Management)     │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────┼───────────────────────────────┐
│                 │           Services            │
├─────────────────┼───────────────────────────────┤
│ SignageService  │ ContentService │ CommandService│
│ (Foreground)    │ (Background)   │ (Background)  │
│                 │                │               │
│ • API Client    │ • Media Cache  │ • Remote Cmds │
│ • Device Pairing│ • Download Mgr │ • Health Check│
│ • Heartbeat     │ • Playlist Mgr │ • Status Sync │
└─────────────────┴────────────────┴───────────────┘
                  │
┌─────────────────┼───────────────────────────────┐
│                 │          Components           │
├─────────────────┼───────────────────────────────┤
│ MediaPlayer     │ ConfigManager  │ CacheManager  │
│ (ExoPlayer)     │ (SharedPrefs)  │ (Local DB)    │
│                 │                │               │
│ • Video/Audio   │ • Device State │ • Media Assets│
│ • Smooth Trans  │ • API Config   │ • Offline Data│
│ • Error Handlng │ • Pairing Info │ • Cache Policy│
└─────────────────┴────────────────┴───────────────┘
```

## Development Setup

### Prerequisites
- Android Studio Arctic Fox or newer
- Android SDK with Android TV add-ons
- Java 17+ or Kotlin 1.8+
- Git for version control

### Project Structure
```
android-tv-client/
├── app/
│   ├── src/main/
│   │   ├── java/com/mesophy/signage/
│   │   │   ├── MainActivity.kt
│   │   │   ├── services/
│   │   │   │   ├── SignageService.kt
│   │   │   │   ├── ContentService.kt
│   │   │   │   └── CommandService.kt
│   │   │   ├── api/
│   │   │   │   ├── MesophyApiClient.kt
│   │   │   │   └── models/
│   │   │   ├── media/
│   │   │   │   ├── MediaPlayerManager.kt
│   │   │   │   └── ContentManager.kt
│   │   │   ├── config/
│   │   │   │   └── ConfigManager.kt
│   │   │   └── utils/
│   │   │       └── KioskModeManager.kt
│   │   ├── res/
│   │   │   ├── layout/
│   │   │   ├── values/
│   │   │   └── drawable/
│   │   └── AndroidManifest.xml
│   ├── build.gradle.kts
│   └── proguard-rules.pro
├── gradle/
├── build.gradle.kts
├── settings.gradle.kts
└── README.md
```

## API Compatibility

This Android TV client uses the same API endpoints as the Raspberry Pi client:

- `POST /api/devices/register` - Device registration
- `GET /api/devices/{deviceId}/commands` - Command polling
- `PUT /api/devices/{deviceId}/commands` - Command status updates
- `POST /api/devices/{deviceId}/heartbeat` - Status reporting
- `GET /api/screens/{screenId}/current-content` - Content retrieval

## Deployment Options

### Consumer/Small Business
- Google Play Store private listing
- APK sideloading with manual installation
- QR code installation for easy setup

### Enterprise
- Mobile Device Management (MDM) deployment
- Android Enterprise zero-touch enrollment  
- Custom OEM pre-installation
- Kiosk mode with device policy management

## Performance

### Expected Performance (vs Raspberry Pi)
- **Command Response**: <2 seconds (same as enhanced Pi)
- **Media Loading**: 2-3x faster (hardware acceleration)
- **Memory Usage**: 200-400MB (vs 100-200MB Pi)
- **CPU Usage**: 10-20% during video playback
- **Startup Time**: 5-10 seconds (vs 30-60s Pi)

### Optimization Features
- Hardware-accelerated video decoding
- Adaptive bitrate for network conditions
- Progressive media loading
- Intelligent cache management
- Background processing optimization

## Advantages over Pi Client

| Feature | Raspberry Pi | Android TV |
|---------|--------------|------------|
| **Setup Complexity** | High (SD card, SSH, config) | Low (install APK) |
| **Hardware Cost** | $50-100 + accessories | $30-150 (existing devices) |
| **Video Performance** | Limited (omxplayer) | Excellent (hardware decode) |
| **User Interface** | Command line only | Native Android UI |
| **Updates** | Manual git pull | Automatic via Play Store |
| **Debugging** | SSH required | On-device logging |
| **Enterprise Mgmt** | Custom scripts | Native MDM support |
| **Market Reach** | Technical users | Mainstream market |

## Build Instructions

```bash
# Clone the repository
git clone https://github.com/your-org/mesophy-digital-signage.git
cd mesophy-digital-signage/android-tv-client

# Open in Android Studio
# or build from command line:
./gradlew assembleRelease

# Install on Android TV device
adb install app/build/outputs/apk/release/app-release.apk
```

## Configuration

Device configuration is managed through SharedPreferences with the following key settings:

```kotlin
// Core Configuration
val apiBaseUrl = "https://mesophy.vercel.app"
val deviceId = "android-${generateDeviceId()}"
val threadingMode = "enabled"
val commandPollingInterval = 2 // seconds
val heartbeatInterval = 10 // seconds

// Media Configuration  
val cacheMaxSize = 4096 // MB
val videoBufferSize = 15000 // ms
val enableHardwareAcceleration = true

// Kiosk Configuration
val kioskModeEnabled = true
val showSystemUI = false
val allowUserInteraction = false
```

## Contributing

1. Follow Android coding standards and Kotlin style guide
2. Use conventional commit messages
3. Add unit tests for business logic
4. Test on multiple Android TV hardware configurations
5. Update documentation for new features

## License

Copyright © 2025 Mesophy Digital Signage Platform. All rights reserved.

## Support

- Technical Documentation: See `/docs` folder
- Hardware Compatibility: See `/docs/hardware-compatibility.md`
- Troubleshooting: See `/docs/troubleshooting.md`
- API Reference: See main project API documentation