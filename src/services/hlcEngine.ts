/**
 * KwakoPos SaaS — Hybrid Logical Clock (HLC) Engine
 * 
 * Implements Kulkarni et al. Hybrid Logical Clock specification.
 * Solves clock-skew, clock rollback, and causal ordering across distributed offline registers.
 * 
 * Timestamp format: `<ISO8601>-<4-digit-counter>-<nodeId>`
 * Example: `1723820400000:0005:dev-3f9b2a`
 */
import { deviceManager } from './session/deviceManager';

export interface HlcTimestamp {
  millis: number;
  counter: number;
  nodeId: string;
}

export class HlcEngine {
  private static instance: HlcEngine;
  private latestMillis: number = 0;
  private counter: number = 0;
  private nodeId: string = 'node-default';

  private constructor() {
    this.nodeId = deviceManager.getDeviceId();
    this.latestMillis = Date.now();
  }

  public static getInstance(): HlcEngine {
    if (!HlcEngine.instance) {
      HlcEngine.instance = new HlcEngine();
    }
    return HlcEngine.instance;
  }

  /**
   * Generates a new local monotonic HLC timestamp for a local mutation
   */
  public now(): string {
    const physicalNow = Date.now();

    if (physicalNow > this.latestMillis) {
      this.latestMillis = physicalNow;
      this.counter = 0;
    } else {
      this.counter += 1;
    }

    return this.format({
      millis: this.latestMillis,
      counter: this.counter,
      nodeId: this.nodeId
    });
  }

  /**
   * Updates local HLC clock based on an incoming remote timestamp (e.g. from Cloud or Peer Sync)
   */
  public update(remoteTimestampStr: string): string {
    const remote = this.parse(remoteTimestampStr);
    if (!remote) return this.now();

    const physicalNow = Date.now();
    const maxMillis = Math.max(physicalNow, this.latestMillis, remote.millis);

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
      nodeId: this.nodeId
    });
  }

  /**
   * Deterministic comparison for Last-Write-Wins (LWW) resolution
   * Returns:
   *  < 0 if a < b (b is newer)
   *  > 0 if a > b (a is newer)
   *  = 0 if identical
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
