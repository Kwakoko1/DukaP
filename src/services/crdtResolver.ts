/**
 * KwakoPos SaaS — Conflict-Free Replicated Data Type (CRDT) Resolver
 * 
 * Provides deterministic merge algorithms:
 * 1. PN-Counter (Positive-Negative Counter for concurrent stock movements)
 * 2. LWW-Register (Last-Write-Wins with Hybrid Logical Clock resolution)
 * 3. Delta-State Entity Merger (combining partial field mutations without data loss)
 */
import { hlcEngine } from './hlcEngine';

export interface LwwField<T = any> {
  value: T;
  hlc: string; // Hybrid Logical Clock timestamp
}

export type LwwRecord<T = Record<string, any>> = {
  [K in keyof T]: LwwField<T[K]>;
};

export interface PNCounter {
  increments: Record<string, number>; // nodeId -> sum of positive adjustments
  decrements: Record<string, number>; // nodeId -> sum of negative adjustments
}

export class CrdtResolver {
  private static instance: CrdtResolver;

  private constructor() {}

  public static getInstance(): CrdtResolver {
    if (!CrdtResolver.instance) {
      CrdtResolver.instance = new CrdtResolver();
    }
    return CrdtResolver.instance;
  }

  /**
   * Merges two PN-Counters deterministically across offline nodes
   */
  public mergePNCounter(a: PNCounter, b: PNCounter): PNCounter {
    const increments: Record<string, number> = {};
    const decrements: Record<string, number> = {};

    const allIncNodes = new Set([...Object.keys(a.increments || {}), ...Object.keys(b.increments || {})]);
    allIncNodes.forEach(node => {
      increments[node] = Math.max(a.increments?.[node] || 0, b.increments?.[node] || 0);
    });

    const allDecNodes = new Set([...Object.keys(a.decrements || {}), ...Object.keys(b.decrements || {})]);
    allDecNodes.forEach(node => {
      decrements[node] = Math.max(a.decrements?.[node] || 0, b.decrements?.[node] || 0);
    });

    return { increments, decrements };
  }

  /**
   * Computes the scalar value of a PN-Counter
   */
  public readPNCounter(counter: PNCounter): number {
    const totalInc = Object.values(counter.increments || {}).reduce((acc, v) => acc + v, 0);
    const totalDec = Object.values(counter.decrements || {}).reduce((acc, v) => acc + v, 0);
    return totalInc - totalDec;
  }

  /**
   * Merges two field-level LWW records deterministically using HLC timestamps
   */
  public mergeLwwRecords<T extends Record<string, any>>(local: LwwRecord<T>, incoming: LwwRecord<T>): LwwRecord<T> {
    const merged: Partial<LwwRecord<T>> = { ...local };
    const allKeys = new Set([...Object.keys(local || {}), ...Object.keys(incoming || {})]) as Set<keyof T>;

    allKeys.forEach((key) => {
      const localField = local?.[key];
      const incomingField = incoming?.[key];

      if (!localField && incomingField) {
        merged[key] = incomingField;
      } else if (localField && incomingField) {
        const cmp = hlcEngine.compare(localField.hlc, incomingField.hlc);
        if (cmp < 0) {
          // Incoming field is strictly newer
          merged[key] = incomingField;
        } else {
          // Local field is newer or equal
          merged[key] = localField;
        }
      }
    });

    return merged as LwwRecord<T>;
  }

  /**
   * Resolves plain object entity conflict using HLC metadata or updated_at timestamps
   */
  public resolveEntityConflict<T extends { id: string; updated_at?: number; updatedAt?: number; hlc?: string }>(
    localEntity: T,
    remoteEntity: T
  ): { resolved: T; winningSource: 'LOCAL' | 'REMOTE' } {
    if (localEntity.hlc && remoteEntity.hlc) {
      const cmp = hlcEngine.compare(localEntity.hlc, remoteEntity.hlc);
      if (cmp < 0) return { resolved: remoteEntity, winningSource: 'REMOTE' };
      return { resolved: localEntity, winningSource: 'LOCAL' };
    }

    const localTime = localEntity.updated_at || localEntity.updatedAt || 0;
    const remoteTime = remoteEntity.updated_at || remoteEntity.updatedAt || 0;

    if (remoteTime > localTime) {
      return { resolved: remoteEntity, winningSource: 'REMOTE' };
    }
    return { resolved: localEntity, winningSource: 'LOCAL' };
  }
}

export const crdtResolver = CrdtResolver.getInstance();
