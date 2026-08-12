/**
 * DukaPOS SaaS — Monotonic Version Clock & Tombstone Conflict Resolution Engine
 * Guarantees Last-Write-Wins with Tombstone Priority to eliminate ghosting / resurrection bugs.
 */

export interface SyncableRecord {
  id: string;
  tenant_id?: string;
  branch_id?: string;
  updated_at: number; // Milliseconds timestamp
  version: number;     // Monotonically increasing counter
  deleted: boolean;    // Must be TRUE when item is deleted, never remove row
  [key: string]: any;
}

/**
 * Deterministic Conflict Resolution Engine: Last-Write-Wins with Tombstone Priority
 */
export function resolveEntityConflict<T extends SyncableRecord>(
  local: T | undefined,
  remote: T
): { record: T; shouldPersist: boolean } {
  // If no local record exists, accept remote
  if (!local) {
    return { record: remote, shouldPersist: true };
  }

  const localVer = Number(local.version) || 0;
  const remoteVer = Number(remote.version) || 0;
  const localTs = Number(local.updated_at || (local as any).updatedAt) || 0;
  const remoteTs = Number(remote.updated_at || (remote as any).updatedAt) || 0;

  const isLocalDeleted = Boolean(local.deleted);
  const isRemoteDeleted = Boolean(remote.deleted);

  // RULE 1: If local is already deleted, protect the tombstone unless remote is explicitly newer
  if (isLocalDeleted && !isRemoteDeleted) {
    if (remoteVer > localVer || remoteTs > localTs) {
      // Remote is genuinely newer than our deletion (e.g., re-created item)
      return { record: remote, shouldPersist: true };
    }
    // Otherwise, discard remote update—the local deletion tombstone wins!
    return { record: local, shouldPersist: false };
  }

  // RULE 2: If remote is deleted, it overrides local active record if version/timestamp is equal or newer
  if (isRemoteDeleted) {
    if (remoteVer >= localVer || remoteTs >= localTs) {
      return { record: remote, shouldPersist: true };
    }
    // Outdated deletion event—ignore it
    return { record: local, shouldPersist: false };
  }

  // RULE 3: Monotonic Version Clock / Last-Write-Wins for normal updates
  if (remoteVer > localVer || (remoteVer === localVer && remoteTs > localTs)) {
    return { record: remote, shouldPersist: true };
  }

  return { record: local, shouldPersist: false };
}
