/**
 * Token Manager — In-Memory Short-Lived Access Token & Rotation Engine
 * 
 * Rules:
 * 1. Access tokens are stored ONLY in memory.
 * 2. Never saved in localStorage, sessionStorage, or IndexedDB.
 * 3. Auto-refreshes 2 minutes before the 20-minute expiration.
 */
import type { DecodedAccessToken } from './sessionTypes';
import { deviceManager } from './deviceManager';

const REFRESH_TOKEN_COOKIE_FALLBACK_KEY = 'KWAKOPOS_SECURE_RT_V1';

export class TokenManager {
  private static instance: TokenManager;
  private memoryAccessToken: string | null = null;
  private decodedClaims: DecodedAccessToken | null = null;
  private refreshTimer: any = null;
  private isRefreshing: boolean = false;
  private refreshPromise: Promise<string | null> | null = null;

  private constructor() {}

  public static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  public setAccessToken(token: string): DecodedAccessToken | null {
    this.memoryAccessToken = token;
    this.decodedClaims = this.decodeToken(token);
    this.scheduleAutoRefresh();
    return this.decodedClaims;
  }

  public getAccessToken(): string | null {
    if (this.isTokenExpired()) {
      return null;
    }
    return this.memoryAccessToken;
  }

  public getDecodedClaims(): DecodedAccessToken | null {
    return this.decodedClaims;
  }

  public isTokenExpired(): boolean {
    if (!this.decodedClaims || !this.decodedClaims.exp) return true;
    const now = Math.floor(Date.now() / 1000);
    return this.decodedClaims.exp <= now;
  }

  public getExpiryDate(): Date | null {
    if (!this.decodedClaims?.exp) return null;
    return new Date(this.decodedClaims.exp * 1000);
  }

  public clearTokens(): void {
    this.memoryAccessToken = null;
    this.decodedClaims = null;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    try {
      localStorage.removeItem(REFRESH_TOKEN_COOKIE_FALLBACK_KEY);
    } catch (_) {}
  }

  public setStoredRefreshToken(refreshToken: string): void {
    try {
      localStorage.setItem(REFRESH_TOKEN_COOKIE_FALLBACK_KEY, refreshToken);
    } catch (_) {}
  }

  public getStoredRefreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_TOKEN_COOKIE_FALLBACK_KEY);
    } catch (_) {
      return null;
    }
  }

  public decodeToken(token: string): DecodedAccessToken | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.warn('[TokenManager] Failed to decode token claims:', e);
      return null;
    }
  }

  public async refresh(): Promise<{ accessToken: string; refreshToken: string; permissionsVersion?: number; tenantVersion?: number } | null> {
    if (this.isRefreshing && this.refreshPromise) {
      const token = await this.refreshPromise;
      if (token) return { accessToken: token, refreshToken: this.getStoredRefreshToken() || '' };
      return null;
    }

    const currentRefreshToken = this.getStoredRefreshToken();
    if (!currentRefreshToken) {
      return null;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const deviceId = deviceManager.getDeviceId();
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: currentRefreshToken, deviceId })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.accessToken && data.refreshToken) {
            this.setStoredRefreshToken(data.refreshToken);
            this.setAccessToken(data.accessToken);
            return data.accessToken;
          }
        }
        return null;
      } catch (err) {
        console.warn('[TokenManager] Token refresh network/server error:', err);
        return null;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    const token = await this.refreshPromise;
    if (token) {
      return { accessToken: token, refreshToken: this.getStoredRefreshToken() || '' };
    }
    return null;
  }

  private scheduleAutoRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (!this.decodedClaims || !this.decodedClaims.exp) return;

    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = this.decodedClaims.exp - now;
    // Refresh 2 minutes (120s) before expiry, or immediately if expiring soon
    const refreshDelaySeconds = Math.max(10, timeUntilExpiry - 120);

    this.refreshTimer = setTimeout(async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        console.log('[TokenManager] Triggering background access token rotation...');
        await this.refresh();
      }
    }, refreshDelaySeconds * 1000);
  }
}

export const tokenManager = TokenManager.getInstance();
