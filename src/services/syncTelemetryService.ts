/**
 * KwakoPos SaaS — Real-Time Sync Telemetry & Health Monitoring Service
 */
import { db } from '../db/dexie';
import { hlcEngine } from './hlcEngine';

export interface SyncTelemetryMetrics {
  pendingOutboxCount: number;
  syncStatus: 'IDLE' | 'SYNCING' | 'ERROR' | 'OFFLINE';
  lastSyncDurationMs: number;
  lastSuccessfulSyncAt: number;
  healthScore: number; // 0 - 100%
  currentHlc: string;
  networkLatencyMs: number;
  isOnline: boolean;
}

export type TelemetryListener = (metrics: SyncTelemetryMetrics) => void;

export class SyncTelemetryService {
  private static instance: SyncTelemetryService;
  private metrics: SyncTelemetryMetrics = {
    pendingOutboxCount: 0,
    syncStatus: 'IDLE',
    lastSyncDurationMs: 0,
    lastSuccessfulSyncAt: Date.now(),
    healthScore: 100,
    currentHlc: hlcEngine.now(),
    networkLatencyMs: 45,
    isOnline: true
  };
  private listeners: Set<TelemetryListener> = new Set();
  private pollTimer: any = null;

  private constructor() {
    this.startPolling();
  }

  public static getInstance(): SyncTelemetryService {
    if (!SyncTelemetryService.instance) {
      SyncTelemetryService.instance = new SyncTelemetryService();
    }
    return SyncTelemetryService.instance;
  }

  public getMetrics(): SyncTelemetryMetrics {
    return { ...this.metrics };
  }

  public subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    listener(this.metrics);
    return () => this.listeners.delete(listener);
  }

  public setNetworkStatus(isOnline: boolean): void {
    if (this.metrics.isOnline !== isOnline) {
      this.metrics.isOnline = isOnline;
      if (!isOnline) {
        this.metrics.syncStatus = 'OFFLINE';
      } else if (this.metrics.syncStatus === 'OFFLINE') {
        this.metrics.syncStatus = 'IDLE';
      }
      this.recalculateHealthScore();
      this.notify();
    }
  }

  public recordSyncStart(): void {
    this.metrics.syncStatus = 'SYNCING';
    this.notify();
  }

  public recordSyncComplete(durationMs: number, success: boolean): void {
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    this.metrics.isOnline = isOnline;
    this.metrics.syncStatus = isOnline ? (success ? 'IDLE' : 'ERROR') : 'OFFLINE';
    this.metrics.lastSyncDurationMs = durationMs;
    if (success) {
      this.metrics.lastSuccessfulSyncAt = Date.now();
    }
    this.metrics.currentHlc = hlcEngine.now();
    this.recalculateHealthScore();
    this.notify();
  }

  public async refreshOutboxCount(): Promise<number> {
    try {
      const qCount = await db.syncQueue.where('status').anyOf(['Pending', 'PENDING', 'Processing', 'PROCESSING']).count().catch(() => 0);
      const obCount = await db.syncOutbox.where('status').anyOf(['PENDING', 'Pending', 'PROCESSING', 'Processing']).count().catch(() => 0);
      const count = Math.max(qCount, obCount);
      this.metrics.pendingOutboxCount = count;
      this.metrics.currentHlc = hlcEngine.now();
      this.metrics.isOnline = typeof navigator !== 'undefined' && navigator.onLine;
      this.recalculateHealthScore();
      this.notify();
      return count;
    } catch (_) {
      return 0;
    }
  }

  private recalculateHealthScore(): void {
    let score = 100;
    if (!this.metrics.isOnline) score -= 20;
    if (this.metrics.pendingOutboxCount > 50) score -= 30;
    else if (this.metrics.pendingOutboxCount > 10) score -= 15;
    if (this.metrics.syncStatus === 'ERROR') score -= 25;
    this.metrics.healthScore = Math.max(0, Math.min(100, score));
  }

  private notify(): void {
    this.listeners.forEach((l) => {
      try {
        l(this.metrics);
      } catch (_) {}
    });
  }

  public stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private startPolling(): void {
    if (typeof window === 'undefined') return;
    this.pollTimer = setInterval(() => {
      this.refreshOutboxCount();
    }, 10000);
  }
}

export const syncTelemetryService = SyncTelemetryService.getInstance();
