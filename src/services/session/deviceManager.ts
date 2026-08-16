/**
 * Device Manager — Permanent Device Identity & Fingerprint Service for KwakoPos
 */
import type { DeviceInfo } from './sessionTypes';

const DEVICE_STORAGE_KEY = 'KWAKOPOS_DEVICE_IDENTITY_V1';

export class DeviceManager {
  private static instance: DeviceManager;
  private currentDevice: DeviceInfo | null = null;

  private constructor() {
    this.initDevice();
  }

  public static getInstance(): DeviceManager {
    if (!DeviceManager.instance) {
      DeviceManager.instance = new DeviceManager();
    }
    return DeviceManager.instance;
  }

  private generateUUID(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `dev-${crypto.randomUUID()}`;
    }
    return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private detectPlatform(): string {
    if (typeof navigator === 'undefined') return 'Server';
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return 'Android POS';
    if (/iPad|iPhone|iPod/.test(ua)) return 'iOS';
    if (/Windows/i.test(ua)) return 'Windows Desktop';
    if (/Mac/i.test(ua)) return 'macOS';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Web Client';
  }

  private detectBrowser(): string {
    if (typeof navigator === 'undefined') return 'Unknown';
    const ua = navigator.userAgent;
    if (/chrome|chromium|crios/i.test(ua) && !/edg/i.test(ua)) return 'Chrome';
    if (/edg/i.test(ua)) return 'Edge';
    if (/firefox|fxios/i.test(ua)) return 'Firefox';
    if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
    return 'Browser';
  }

  private initDevice(): DeviceInfo {
    try {
      const stored = localStorage.getItem(DEVICE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.deviceId) {
          parsed.lastSeenAt = Date.now();
          this.currentDevice = parsed;
          localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(parsed));
          return parsed;
        }
      }
    } catch (_) {}

    const newDevice: DeviceInfo = {
      deviceId: this.generateUUID(),
      name: `${this.detectPlatform()} Register (${this.detectBrowser()})`,
      platform: this.detectPlatform(),
      browser: this.detectBrowser(),
      trusted: true,
      registeredAt: Date.now(),
      lastSeenAt: Date.now()
    };

    try {
      localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(newDevice));
    } catch (_) {}

    this.currentDevice = newDevice;
    return newDevice;
  }

  public getDeviceInfo(): DeviceInfo {
    if (!this.currentDevice) {
      return this.initDevice();
    }
    this.currentDevice.lastSeenAt = Date.now();
    return this.currentDevice;
  }

  public getDeviceId(): string {
    return this.getDeviceInfo().deviceId;
  }

  public updateDeviceName(customName: string): void {
    if (!this.currentDevice) this.initDevice();
    if (this.currentDevice && customName.trim()) {
      this.currentDevice.name = customName.trim();
      try {
        localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(this.currentDevice));
      } catch (_) {}
    }
  }
}

export const deviceManager = DeviceManager.getInstance();
