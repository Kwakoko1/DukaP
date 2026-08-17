/**
 * KwakoPOS SaaS — Hybrid Logical Clock (HLC) & Hardware Clock Skew Engine
 * 
 * Implements Kulkarni et al. Hybrid Logical Clock specification with
 * Server-Time Offset Calibration, Forward/Backward Skew Clamping, and Monotonic Causality.
 * 
 * Timestamp format: `<millis>:<4-digit-counter>:<nodeId>`
 * Example: `1786940000000:0001:dev-3f9b2a`
 */
import { deviceManager } from './session/deviceManager';

export interface HlcTimestamp {
  millis: number;
  counter: number;
  nodeId: string;
}

const CLOCK_OFFSET_STORAGE_KEY = 'kwakopos_server_clock_offset_ms';
const MAX_ALLOWED_FORWARD_DRIFT_MS = 60 * 1000; // 60 seconds max forward physical jump

export class HlcEngine {
  private static instance: HlcEngine;
  private latestMillis: number = 0;
  private counter: number = 0;
  private nodeId: string = 'node-default';
  private clockOffsetMs: number = 0;

  private constructor() {
    this.nodeId = deviceManager.getDeviceId();
    
    // Restore persisted clock offset if available
    if (typeof localStorage !== 'undefined') {
      const savedOffset = localStorage.getItem(CLOCK_OFFSET_STORAGE_KEY);
      if (savedOffset) {
        const parsed = Number(savedOffset);
        if (!isNaN(parsed)) {
          this.clockOffsetMs = parsed;
        }
      }
    }

    this.latestMillis = this.getCalibratedPhysicalTime();
  }

  public static getInstance(): HlcEngine {
    if (!HlcEngine.instance) {
      HlcEngine.instance = new HlcEngine();
    }
    return HlcEngine.instance;
  }

  /**
   * Calibrates client clock offset against authoritative server timestamp (NTP-lite).
   * @param serverTimeMs Server epoch timestamp in milliseconds
   * @param roundTripMs Estimated network round-trip time (latency)
   */
  public calibrateOffset(serverTimeMs: number, roundTripMs: number = 0): void {
    if (!serverTimeMs || typeof serverTimeMs !== 'number' || isNaN(serverTimeMs)) return;
    
    const clientPhysicalNow = Date.now();
    const estimatedServerArrival = serverTimeMs + Math.floor(roundTripMs / 2);
    const newOffset = estimatedServerArrival - clientPhysicalNow;

    // Apply exponential smoothing / update offset if divergence is significant (> 50ms)
    if (Math.abs(newOffset - this.clockOffsetMs) > 50) {
      this.clockOffsetMs = newOffset;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CLOCK_OFFSET_STORAGE_KEY, String(this.clockOffsetMs));
      }
      console.log(`[HLC Engine] Clock offset calibrated: ${this.clockOffsetMs > 0 ? '+' : ''}${this.clockOffsetMs}ms`);
    }
  }

  /**
   * Returns current physical time calibrated with server offset
   */
  public getCalibratedPhysicalTime(): number {
    return Date.now() + this.clockOffsetMs;
  }

  /**
   * Returns the current estimated clock offset in milliseconds
   */
  public getClockOffsetMs(): number {
    return this.clockOffsetMs;
  }

  /**
   * Generates a new local monotonic HLC timestamp for a local mutation.
   * Protects against clock rollback, future time jumping, and ensures absolute causality.
   */
  public now(): string {
    const calibratedPhysicalNow = this.getCalibratedPhysicalTime();

    if (calibratedPhysicalNow > this.latestMillis) {
      // Guard against extreme future physical clock jump (> 60s)
      if (calibratedPhysicalNow - this.latestMillis > MAX_ALLOWED_FORWARD_DRIFT_MS && this.latestMillis > 0) {
        // Clamp progression smoothly to prevent permanently jumping decades into the future
        this.latestMillis = this.latestMillis + 1000;
        this.counter = 0;
      } else {
        this.latestMillis = calibratedPhysicalNow;
        this.counter = 0;
      }
    } else {
      // Clock moved backwards or is in same millisecond -> advance logical counter
      this.counter += 1;
    }

    return this.format({
      millis: this.latestMillis,
      counter: this.counter,
      nodeId: this.nodeId,
    });
  }

  /**
   * Updates local HLC clock based on an incoming remote timestamp (e.g. from Cloud or Peer Sync)
   */
  public update(remoteTimestampStr: string): string {
    const remote = this.parse(remoteTimestampStr);
    if (!remote) return this.now();

    const calibratedPhysicalNow = this.getCalibratedPhysicalTime();
    const maxMillis = Math.max(calibratedPhysicalNow, this.latestMillis, remote.millis);

    if (maxMillis === this.latestMillis && maxMillis === remote.millis) {
      this.counter = Math.max(this.counter, remote.counter) + 1;
    } else if (maxMillis === this.latestMillis) {
      this.counter += 1;
    } else if (maxMillis === remote.millis) {
      this.counter = remote.counter + 1;
    } else {
      this.counter = 0;
    }

    this.latestMillis = maxMillis;

    return this.format({
      millis: this.latestMillis,
      counter: this.counter,
      nodeId: this.nodeId,
    });
  }

  /**
   * Deterministic comparison for Last-Write-Wins (LWW) resolution
   */
  public compare(aStr: string, bStr: string): number {
    const a = this.parse(aStr);
    const b = this.parse(bStr);

    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;

    if (a.millis !== b.millis) {
      return a.millis - b.millis;
    }

    if (a.counter !== b.counter) {
      return a.counter - b.counter;
    }

    return a.nodeId.localeCompare(b.nodeId);
  }

  public format(hlc: HlcTimestamp): string {
    const counterPad = String(hlc.counter).padStart(4, '0');
    return `${hlc.millis}:${counterPad}:${hlc.nodeId}`;
  }

  public parse(str: string): HlcTimestamp | null {
    if (!str || typeof str !== 'string') return null;
    const parts = str.split(':');
    if (parts.length < 3) return null;

    const millis = Number(parts[0]);
    const counter = Number(parts[1]);
    const nodeId = parts.slice(2).join(':');

    if (isNaN(millis) || isNaN(counter)) return null;

    return { millis, counter, nodeId };
  }
}

export const hlcEngine = HlcEngine.getInstance();
