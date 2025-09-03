/**
 * Device utility functions for device type detection and naming
 */

export type DeviceType = 'android_tv' | 'raspberry_pi' | 'unknown'

/**
 * Detect device type based on device information
 */
export function detectDeviceType(deviceInfo: any): DeviceType {
  if (!deviceInfo || typeof deviceInfo !== 'object') {
    return 'unknown'
  }

  // Check for Android TV indicators
  const platform = (deviceInfo.platform || '').toLowerCase()
  const model = (deviceInfo.model || '').toLowerCase()
  const userAgent = (deviceInfo.userAgent || '').toLowerCase()
  const brand = (deviceInfo.brand || '').toLowerCase()
  const manufacturer = (deviceInfo.manufacturer || '').toLowerCase()
  const os = (deviceInfo.os || '').toLowerCase()

  if (
    platform.includes('android') ||
    model.includes('android') ||
    userAgent.includes('android') ||
    brand.includes('android') ||
    manufacturer.includes('android') ||
    userAgent.includes('tv') ||
    model.includes('tv') ||
    os.includes('android')
  ) {
    return 'android_tv'
  }

  // Check for Raspberry Pi indicators  
  if (
    platform.includes('linux') ||
    platform.includes('raspberry') ||
    model.includes('pi') ||
    model.includes('raspberry') ||
    userAgent.includes('raspberry') ||
    os.includes('raspberry') ||
    os.includes('linux')
  ) {
    return 'raspberry_pi'
  }

  return 'unknown'
}

/**
 * Get device prefix for device ID generation
 */
export function getDevicePrefix(deviceType: DeviceType): string {
  switch (deviceType) {
    case 'android_tv':
      return 'atv'
    case 'raspberry_pi':
      return 'pi'
    default:
      return 'dev' // Generic device prefix
  }
}

/**
 * Get human-readable device type label
 */
export function getDeviceTypeLabel(deviceType: DeviceType): string {
  switch (deviceType) {
    case 'android_tv':
      return 'Android TV'
    case 'raspberry_pi':
      return 'Raspberry Pi'
    default:
      return 'Unknown Device'
  }
}

/**
 * Generate a unique device ID based on device type and pairing info
 */
export function generateDeviceId(deviceType: DeviceType, pairingId: string): string {
  const prefix = getDevicePrefix(deviceType)
  const shortId = pairingId.split('-')[0]
  const timestamp = Date.now().toString(36)
  
  return `${prefix}-${shortId}-${timestamp}`
}