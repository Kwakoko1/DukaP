import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SyncOperation } from '../db/dexie';
import { mapProductToLocal, recoverUnsyncedProducts } from '../services/productService';
import { createSyncEvent } from '../services/syncEventGenerator';
import { productionSyncEngine } from '../services/productionSyncEngine';
import { stockLedgerSyncEngine } from '../services/stockLedgerSyncEngine';
import { isLeaderTab } from '../services/tabLeaderElectionService';
import { getActiveSessionRaw } from '../utils/sessionStorage';
import { syncTelemetryService } from '../services/syncTelemetryService';

export interface SyncProgress {
  current: number;
  total: number;
  percentage: number;
}

const ONLINE_MODE_KEY = 'dukapos_online_mode';

export function useSync() {
  // Restore online mode from localStorage — default Online unless user explicitly went Offline
  const storedMode = typeof localStorage !== 'undefined' ? localStorage.getItem(ONLINE_MODE_KEY) : null;
  const [isOnline, setIsOnline] = useState<boolean>(storedMode !== null ? storedMode === 'true' : (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [isSimulated, setIsSimulated] = useState<boolean>(storedMode !== null ? storedMode === 'false' : false);

  // Use refs so interval callbacks always see the latest values without stale closures
  const isSyncingRef = useRef(false);
  const isSimulatedRef = useRef(false);
  const isOnlineRef = useRef(isOnline);
  const lastSyncTimeRef = useRef<number>(0);
  const syncTimeoutRef = useRef<any>(null);

  useEffect(() => { isSyncingRef.current = isSyncing; }, [isSyncing]);
  useEffect(() => { isSimulatedRef.current = isSimulated; }, [isSimulated]);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);

  // Live query to track pending sync count across both syncQueue and outbox
  const pendingCount = useLiveQuery(async () => {
    try {
      const qCount = await db.syncQueue.where('status').anyOf(['Pending', 'PENDING', 'Processing', 'PROCESSING']).count().catch(() => 0);
      const obCount = await db.syncOutbox.where('status').anyOf(['PENDING', 'Pending', 'PROCESSING', 'Processing']).count().catch(() => 0);
      return Math.max(qCount, obCount);
    } catch (e) {
      console.error('[useSync] Error counting pending items:', e);
      return 0;
    }
  }) || 0;

  // Logger helper
  const addLog = (message: string) => {
    setSyncLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev.slice(0, 49)]);
  };

  // ── FIXED: use GET /api/ping instead of HEAD /api/products ─────────────────
  // The Vite dev server only handles GET/POST on /api/products, so HEAD always
  // failed → isOnline was permanently false → nothing ever synced.
  const checkRealConnectivity = async (): Promise<boolean> => {
    if (!navigator.onLine) return false;
    if (typeof document !== 'undefined' && document.hidden) return isOnlineRef.current;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('/api/ping', {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch (e) {
      return false;
    }
  };

  const handleSyncNow = async () => {
    if (isSyncingRef.current) return;
    setIsSyncing(true);
    addLog('Manual sync initiated...');

    try {
      const tenantId = getActiveSessionRaw() ? JSON.parse(getActiveSessionRaw()!).user?.tenant_id : undefined;
      const res = await productionSyncEngine.processQueue(tenantId);
      addLog(`Sync complete: ${res.syncedItems} synced, ${res.failedItems} failed`);
    } catch (err: any) {
      addLog(`Sync error: ${err?.message || 'Unknown'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Network event listeners
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      console.log('[useSync] Network came online');
      setIsOnline(true);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ONLINE_MODE_KEY, 'true');
      }
      handleSyncNow();
    };

    const handleOffline = () => {
      console.log('[useSync] Network went offline');
      setIsOnline(false);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ONLINE_MODE_KEY, 'false');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Periodic connectivity check and sync
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const runPeriodicCheck = async () => {
      try {
        const isConnected = await checkRealConnectivity();
        if (isConnected && !isSyncingRef.current && isOnlineRef.current) {
          await handleSyncNow();
        }
      } catch (e) {
        console.error('[useSync] Periodic check error:', e);
      }
    };

    if (typeof window !== 'undefined' && navigator.onLine) {
      interval = setInterval(runPeriodicCheck, 30000); // Every 30 seconds
      runPeriodicCheck(); // Immediate first check
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  return {
    isOnline,
    isSyncing,
    syncProgress,
    syncLogs,
    pendingCount,
    isSimulated,
    handleSyncNow,
    setIsOnline: (mode: boolean) => {
      setIsOnline(mode);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ONLINE_MODE_KEY, mode ? 'true' : 'false');
      }
    }
  };
}
