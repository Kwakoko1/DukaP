/**
 * DukaPos SaaS — Device Registration & Management Service
 * Generates and tracks unique device IDs, browser user-agents, OS, IP, and last-seen timestamps.
 */

import { versionMetadata } from '../config/versionMetadata';

export interface DeviceInfo {
  device_id: string;
  name: string;
  browser: string;
  os: string;
  app_version: string;
  ip_address?: string;
  last_seen: number;
  tenant_id?: string;
  user_id?: string;
}

export function getOrCreateDeviceId(): string {
  if (typeof localStorage === 'undefined') return 'device-server-node';
  let deviceId = localStorage.getItem('dukapos_device_id');
  if (!deviceId) {
    deviceId = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('dukapos_device_id', deviceId);
  }
  return deviceId;
}

export function getDeviceDetails(): DeviceInfo {
  const deviceId = getOrCreateDeviceId();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
  
  let browser = 'Chrome/Web';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edg')) browser = 'Edge';

  let os = 'Windows';
  if (ua.includes('Macintosh')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return {
    device_id: deviceId,
    name: `${os} POS Device (${browser})`,
    browser,
    os,
    app_version: versionMetadata.version,
    last_seen: Date.now()
  };
}

export async function registerDeviceOnServer(tenantId?: string, userId?: string): Promise<void> {
  try {
    const info = getDeviceDetails();
    info.tenant_id = tenantId;
    info.user_id = userId;

    // Cache locally in IndexedDB if userDevices store exists or send to server API
    await fetch('/api/userDevices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenantId || '',
        'X-Device-ID': info.device_id
      },
      body: JSON.stringify(info)
    }).catch(() => {});
  } catch (e) {
    // Non-blocking device registration
  }
}
