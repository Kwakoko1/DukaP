/**
 * DukaPOS Enterprise Single-Leader Web Locks Election Engine
 * Guarantees that across N open tabs, exactly ONE Leader Tab executes background sync HTTP workers.
 * If the leader tab closes or crashes, another tab automatically inherits leadership immediately.
 */

import { getCurrentTabId } from './crossTabSyncService';

const LOCK_NAME = 'dukapos_sync_leader_lock';
let isLeader = false;
const leaderChangeCallbacks = new Set<(isLeader: boolean) => void>();

function notifyCallbacks() {
  leaderChangeCallbacks.forEach(fn => {
    try {
      fn(isLeader);
    } catch (e) {
      console.warn('[LeaderElection] Callback error:', e);
    }
  });
}

/**
 * Initialize Web Locks Single-Leader Election.
 */
export function initializeLeaderElection() {
  if (typeof window === 'undefined') return;

  if ('locks' in navigator && typeof navigator.locks.request === 'function') {
    navigator.locks.request(LOCK_NAME, async (_lock) => {
      isLeader = true;
      console.log(`[LeaderElection] 👑 Tab ${getCurrentTabId()} acquired Single-Leader Sync Lock!`);
      notifyCallbacks();

      // Keep holding lock as long as this tab stays alive
      return new Promise<void>(() => {
        // Held indefinitely until window unload / close
      });
    }).catch(err => {
      console.warn('[LeaderElection] Web lock request error:', err);
      fallbackLeaderElection();
    });
  } else {
    // Fallback for legacy browsers lacking Web Locks API
    fallbackLeaderElection();
  }
}

/**
 * Fallback Leader Election using localStorage heartbeat timestamping
 */
function fallbackLeaderElection() {
  const tabId = getCurrentTabId();
  const heartbeat = () => {
    const now = Date.now();
    const raw = localStorage.getItem('dukapos_fallback_leader');
    if (raw) {
      try {
        const lock = JSON.parse(raw);
        if (now - lock.ts < 10000 && lock.tabId !== tabId) {
          if (isLeader) {
            isLeader = false;
            notifyCallbacks();
          }
          return;
        }
      } catch (e) {}
    }
    localStorage.setItem('dukapos_fallback_leader', JSON.stringify({ ts: now, tabId }));
    if (!isLeader) {
      isLeader = true;
      notifyCallbacks();
    }
  };

  heartbeat();
  setInterval(heartbeat, 4000);
}

/**
 * Returns whether the current tab is the elected Single Leader.
 */
export function isLeaderTab(): boolean {
  return isLeader;
}

/**
 * Subscribe to Leader State Changes.
 */
export function onLeaderStateChange(callback: (isLeader: boolean) => void): () => void {
  leaderChangeCallbacks.add(callback);
  callback(isLeader);
  return () => {
    leaderChangeCallbacks.delete(callback);
  };
}

// Auto-initialize on module import
initializeLeaderElection();
