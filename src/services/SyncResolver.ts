/**
 * Kwakoko / KwakoPos SaaS — Monotonic Version Clock & 13-Digit Epoch Tombstone Resolution Engine
 * Guarantees Last-Write-Wins with Absolute Tombstone Protection to eliminate resurrection bugs.
 */

export interface SyncableRecord {
  id: string;
  tenant_id?: string;
  branch_id?: string;
  updated_at: number; // 13-digit Millisecond Unix timestamp
  version: number;    // Monotonically increasing counter
  deleted_at?: number; // 13-digit Millisecond timestamp (0 = active, >0 = deleted)
  deleted?: boolean;  // Legacy boolean flag fallback
  [key: string]: any;
}

/**
 * Deterministic Conflict Resolution Engine: Monotonic Clock + 13-digit Epoch Tombstone Lock
 */
export function resolveEntityConflict<T extends SyncableRecord>(
  local: T | undefined,
  remote: T
): { record: T; shouldPersist: boolean } {
  // If no local record exists, accept remote
  if (!local) return { record: remote, shouldPersist: true };

  const localVer = Number(local.version) || 0;
  const remoteVer = Number(remote.version) || 0;
  const localTs = Number(local.updated_at || (local as any).updatedAt) || 0;
  const remoteTs = Number(remote.updated_at || (remote as any).updatedAt) || 0;

  // Strict 13-digit timestamp evaluation (0 means not deleted, >0 means deleted)
  const localDeletedAt = Number(local.deleted_at || (local as any).deletedAt) || (local.deleted ? localTs || 1 : 0);
  const remoteDeletedAt = Number(remote.deleted_at || (remote as any).deletedAt) || (remote.deleted ? remoteTs || 1 : 0);

  const isLocalDeleted = localDeletedAt > 0;
  const isRemoteDeleted = remoteDeletedAt > 0;

  // Standardize values on instances to avoid mutation anomalies downstream
  local.deleted_at = localDeletedAt;
  remote.deleted_at = remoteDeletedAt;

  // RULE 1: Deletion Tombstone Protection (Prevent Resurrections)
  // If local is deleted, preserve local tombstone UNLESS remote has an explicitly higher 
  // version & timestamp than the local deletion (meaning an intentional re-creation occurred)
  if (isLocalDeleted && !isRemoteDeleted) {
    if (remoteVer > localVer && remoteTs > localDeletedAt) {
      return { record: remote, shouldPersist: true }; // Authorized Remote re-creation wins
    }
    // Block client resurrection attempts; force local tombstone to win
    return { record: local, shouldPersist: false };   
  }

  // RULE 2: Remote Deletion Override
  if (isRemoteDeleted) {
    if (remoteVer >= localVer || remoteTs >= localTs || remoteDeletedAt >= localTs) {
      return { record: remote, shouldPersist: true }; // Remote deletion applied
    }
    return { record: local, shouldPersist: false };   // Outdated state ignored
  }

  // RULE 3: Monotonic Version Clock / Last-Write-Wins (LWW)
  if (remoteVer > localVer || (remoteVer === localVer && remoteTs > localTs)) {
    return { record: remote, shouldPersist: true };   // Remote wins
  }
  
  return { record: local, shouldPersist: false };     // Local wins
}
