import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SyncOperation } from '../db/dexie';
import { mapProductToLocal, recoverUnsyncedProducts } from '../services/productService';
import { createSyncEvent } from '../services/syncEventGenerator';
import { productionSyncEngine } from '../services/productionSyncEngine';
import { stockLedgerSyncEngine } from '../services/stockLedgerSyncEngine';
import { isLeaderTab } from '../services/tabLeaderElectionService';
import { getActiveSessionRaw } from '../utils/sessionStorage';

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

  // Live query to track pending sync count
  const pendingCount = useLiveQuery(async () => {
    return await db.syncQueue.where('status').equals('Pending').count();
  }) || 0;

  // Logger helper
  const addLog = (message: string) => {
    setSyncLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev.slice(0, 49)]);
  };

  // ── FIXED: use GET /api/ping instead of HEAD /api/products ─────────────────
  // The Vite dev server only handled GET/POST on /api/products, so HEAD always
  // failed → isOnline was permanently false → nothing ever synced.
  const checkRealConnectivity = async (): Promise<boolean> => {
    if (!navigator.onLine) return false;
    if (typeof document !== 'undefined' && document.hidden) return isOnlineRef.current;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('/api/ping', { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    }
  };

  // Enterprise Web Locks Single-Leader Lock Check
  const acquireSyncLock = (): boolean => {
    return isLeaderTab();
  };

  const releaseSyncLock = () => {
    // Held automatically by the elected leader tab via navigator.locks
  };

  // ── STARTUP CHECKPOINT RECOVERY ──────────────────────────────────────────
  // Resumes interrupted processing items by reverting them back to Pending status on load.
  useEffect(() => {
    const recoverInterruptedSyncs = async () => {
      try {
        const restored = await db.syncQueue.where('status').equals('Processing').modify({ status: 'Pending' });
        if (restored > 0) {
          addLog(`Checkpoint Recovery: Restored ${restored} interrupted sync queue items to Pending.`);
        }
      } catch (err) {
        console.error('Failed to recover interrupted syncs:', err);
      }
    };
    recoverInterruptedSyncs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── CORE FIX: Pull server products, variants, customers, and orders ──────────
  // This function is the missing piece. Every device MUST call this on login
  // to hydrate its empty IndexedDB from the shared server (cloud_db.json).
  // Without this, Device B starts with an empty DB and sees no products.
  const syncFromServer = async (tenantId?: string): Promise<number> => {
    try {
      const session = getActiveSessionRaw();
      let currentTenantId = tenantId;
      let currentUserId = 'usr-sync-engine';
      if (session) {
        try {
          const parsed = JSON.parse(session);
          if (!currentTenantId) {
            currentTenantId = parsed?.user?.tenant_id || parsed?.user?.tenantId;
          }
          currentUserId = parsed?.user?.id || 'usr-sync-engine';
        } catch {}
      }

      // Step 1: Push pending local changes to the server first to ensure consistency
      await productionSyncEngine.processQueue(currentTenantId).catch(() => {});
      if (currentTenantId) {
        await recoverUnsyncedProducts(currentTenantId).catch(() => {});
      }

      const syncKey = `dukapos_last_sync_${currentTenantId || 'global'}`;
      const lastSyncTs = localStorage.getItem(syncKey) || '0';

      const headers: Record<string, string> = {
        'x-tenant-id': currentTenantId || '',
        'x-user-id': currentUserId,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      };

      const cacheBust = `_t=${Date.now()}`;
      const syncUrl = currentTenantId
        ? `/api/sync?tenantId=${encodeURIComponent(currentTenantId)}&since=${lastSyncTs}&${cacheBust}`
        : `/api/sync?since=${lastSyncTs}&${cacheBust}`;

      const res = await fetch(syncUrl, { method: 'GET', headers });
      if (!res.ok) return 0;

      const data: any = await res.json();
      const changes = data.changes || {};
      let totalDownloaded = 0;

      // Wrap all entity ingestions inside a single Dexie transaction for maximum performance
      await db.transaction('rw', [
        db.products, db.productVariants, db.categories, db.brands,
        db.customers, db.suppliers, db.orders, db.stockLedger
      ], async () => {
        // 1. Ingest Products (handling soft deletes and pending locks)
        if (Array.isArray(changes.products)) {
          for (const sp of changes.products) {
            if (sp.deletedAt || sp.deleted_at || sp.is_deleted) {
              await db.products.delete(sp.id);
              continue;
            }
            const existing = await db.products.get(sp.id);
            if (existing && existing.syncStatus === 'PENDING') continue;
            const localProd = mapProductToLocal({ ...sp, syncStatus: 'SYNCED' });
            if (existing) {
              localProd.stock = existing.stock;
            }
            await db.products.put(localProd);
            totalDownloaded++;
          }
        }

        // 2. Ingest Variants
        const incomingVariants = changes.productVariants || changes.variants;
        if (Array.isArray(incomingVariants)) {
          for (const sv of incomingVariants) {
            if (sv.deletedAt || sv.deleted_at || sv.is_deleted) {
              await db.productVariants.delete(sv.id);
              continue;
            }
            const existing = await db.productVariants.get(sv.id);
            if (!existing || existing.syncStatus !== 'PENDING') {
              const localVariant = { ...sv, syncStatus: 'SYNCED', isSynced: 1 };
              if (existing) {
                localVariant.stock = existing.stock;
              }
              await db.productVariants.put(localVariant);
            }
          }
        }

        // 3. Ingest Categories
        if (Array.isArray(changes.categories)) {
          for (const cat of changes.categories) {
            if (cat.deletedAt || cat.deleted_at || cat.is_deleted) {
              await db.categories.delete(cat.id);
              continue;
            }
            await db.categories.put({ ...cat, syncStatus: 'SYNCED' } as any);
          }
        }

        // 3.5. Ingest Brands
        if (Array.isArray(changes.brands)) {
          for (const brand of changes.brands) {
            if (brand.deletedAt || brand.deleted_at || brand.is_deleted) {
              await db.brands.delete(brand.id);
              continue;
            }
            await db.brands.put({ ...brand, syncStatus: 'SYNCED' } as any);
          }
        }

        // 4. Ingest Customers
        if (Array.isArray(changes.customers)) {
          for (const sc of changes.customers) {
            if (sc.deletedAt || sc.deleted_at || sc.is_deleted) {
              await db.customers.delete(sc.id);
              continue;
            }
            const existing = await db.customers.get(sc.id) as any;
            if (!existing || existing.syncStatus !== 'PENDING') {
              await db.customers.put({ ...sc, syncStatus: 'SYNCED' } as any);
            }
          }
        }

        // 5. Ingest Suppliers
        if (Array.isArray(changes.suppliers)) {
          for (const sup of changes.suppliers) {
            if (sup.deletedAt || sup.deleted_at || sup.is_deleted) {
              await db.suppliers.delete(sup.id);
              continue;
            }
            const existing = await db.suppliers.get(sup.id);
            if (!existing || (existing as any).syncStatus !== 'PENDING') {
              await db.suppliers.put({ ...sup, syncStatus: 'SYNCED' } as any);
            }
          }
        }

        // 6. Ingest Orders
        if (Array.isArray(changes.orders)) {
          for (const so of changes.orders) {
            if (so.deletedAt || so.deleted_at || so.is_deleted) {
              await db.orders.delete(so.id);
              continue;
            }
            const existing = await db.orders.get(so.id);
            if (!existing || existing.syncStatus !== 'Pending') {
              await db.orders.put({ ...so, syncStatus: 'Synced' });
            }
          }
        }

        // 7. Ingest Stock Ledger
        if (Array.isArray(changes.stockLedger) && changes.stockLedger.length > 0) {
          for (const sle of changes.stockLedger) {
            await db.stockLedger.put({ ...sle, synced: true, sync_status: 'SYNCED' });
          }
        }
      });

      // Recalculate affected stock balances outside write transaction if stock events were updated
      if (Array.isArray(changes.stockLedger) && changes.stockLedger.length > 0 && currentTenantId) {
        const affectedItems = new Map<string, Set<string>>();
        for (const sle of changes.stockLedger) {
          if (sle.product_id) {
            if (!affectedItems.has(sle.product_id)) {
              affectedItems.set(sle.product_id, new Set<string>());
            }
            affectedItems.get(sle.product_id)!.add(sle.variant_id || 'no-variant');
          }
        }
        for (const [prodId, variantIds] of affectedItems.entries()) {
          const p = await db.products.get(prodId);
          if (p) {
            const branchId = p.branchId || p.branch_id || 'main-branch';
            for (const varId of variantIds) {
              const actualVarId = varId === 'no-variant' ? undefined : varId;
              await stockLedgerSyncEngine.recalculateStockFromEvents(
                currentTenantId,
                branchId,
                prodId,
                actualVarId
              ).catch(() => {});
            }
          }
        }
      }

      if (data.serverTime) {
        localStorage.setItem(syncKey, String(data.serverTime));
      }

      if (totalDownloaded > 0) {
        addLog(`↓ Master Incremental Sync: Downloaded ${totalDownloaded} record(s) from server.`);
      }
      return totalDownloaded;
    } catch (err: any) {
      addLog(`Server pull failed: ${err.message}`);
      return 0;
    }
  };

  // Monitor real-world browser offline status and run verified pings
  useEffect(() => {
    const handleOnline = async () => {
      setIsSimulated(false);
      isSimulatedRef.current = false;
      const reallyConnected = await checkRealConnectivity();
      setIsOnline(reallyConnected);
      localStorage.setItem(ONLINE_MODE_KEY, String(reallyConnected));
      if (reallyConnected) {
        addLog('Connection restored. Running auto-sync...');
      }
    };

    const handleOffline = () => {
      setIsSimulated(false);
      isSimulatedRef.current = false;
      setIsOnline(false);
      localStorage.setItem(ONLINE_MODE_KEY, 'false');
      addLog('Connection offline.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic connectivity + delta-sync (every 30s)
    const intervalId = setInterval(async () => {
      if (isSimulatedRef.current) return;
      const reallyConnected = await checkRealConnectivity();
      setIsOnline(reallyConnected);

      if (reallyConnected && !isSyncingRef.current) {
        // Pull latest from server (catches changes made on other devices)
        const session = getActiveSessionRaw();
        if (session) {
          try {
            const parsed = JSON.parse(session);
            const tid = parsed?.user?.tenant_id || parsed?.user?.tenantId;
            if (tid) await syncFromServer(tid);
          } catch {}
        }
      }
    }, 30000);

    // Initial check
    if (!isSimulated) {
      checkRealConnectivity().then(res => setIsOnline(res));
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(intervalId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trigger autoSync whenever browser is online and there are pending items (Debounced)
  useEffect(() => {
    if (!isOnline || pendingCount === 0) return;
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      if (!isSyncingRef.current) {
        syncData(false);
      }
    }, 1500);
    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCount, isOnline]);

  // Main synchronization engine — delegates queue processing to productionSyncEngine
  const syncData = async (isManual = false) => {
    if (isSyncingRef.current) return;

    // Minimum 3-second spacing between automatic sync executions
    const now = Date.now();
    if (!isManual && now - lastSyncTimeRef.current < 3000) {
      return;
    }
    lastSyncTimeRef.current = now;

    let isReallyOnline: boolean;
    if (isOnlineRef.current) {
      isReallyOnline = true;
    } else {
      isReallyOnline = isSimulatedRef.current ? false : await checkRealConnectivity();
    }

    if (!isReallyOnline) {
      addLog('Offline: Sync postponed.');
      return;
    }

    const pendingCount = await db.syncQueue.where('status').equals('Pending').count();
    const failedCount = await db.syncQueue.where('status').equals('Failed').count();
    const totalCount = pendingCount + failedCount;

    if (totalCount === 0) return;

    if (!acquireSyncLock()) {
      addLog('Sync postponed: Another browser tab is syncing.');
      return;
    }

    setIsSyncing(true);
    isSyncingRef.current = true;
    setSyncProgress({ current: 0, total: totalCount, percentage: 0 });
    addLog(`↑ Production Sync Engine processing ${totalCount} operation(s)...`);

    let currentTenantId: string | undefined;
    const session = getActiveSessionRaw();
    if (session) {
      try {
        const parsed = JSON.parse(session);
        currentTenantId = parsed?.user?.tenant_id || parsed?.user?.tenantId;
      } catch {}
    }

    try {
      const result = await productionSyncEngine.processQueue(currentTenantId);
      if (result.syncedItems > 0) {
        addLog(`✓ Production Sync Engine synced ${result.syncedItems} item(s).`);
      }
      if (result.failedItems > 0) {
        addLog(`✗ ${result.failedItems} item(s) failed. Will retry with exponential backoff.`);
      }
    } catch (err: any) {
      addLog(`Sync processing error: ${err.message || 'Unknown error'}`);
    } finally {
      releaseSyncLock();
      setIsSyncing(false);
      isSyncingRef.current = false;
      setSyncProgress(null);
      addLog('Sync cycle complete.');
    }
  };

  // Queue an operation to local DB and sync queue
  const queueOperation = async (
    actionType: 'INSERT' | 'UPDATE' | 'DELETE',
    entityName: 'products' | 'customers' | 'orders' | 'productVariants' | string,
    payload: any,
    operationOverride?: SyncOperation
  ) => {
    if (entityName === 'products') {
      if (actionType === 'DELETE') await db.products.delete(payload.id);
      else await db.products.put(mapProductToLocal(payload));
    } else if (entityName === 'customers') {
      if (actionType === 'DELETE') await db.customers.delete(payload.id);
      else await db.customers.put({ ...payload, syncStatus: 'PENDING' });
    } else if (entityName === 'orders') {
      if (actionType === 'DELETE') await db.orders.delete(payload.id);
      else await db.orders.put({ ...payload, syncStatus: 'PENDING' });
    } else if (entityName === 'productVariants') {
      if (actionType === 'DELETE') await db.productVariants.delete(payload.id);
      else await db.productVariants.put({ ...payload, syncStatus: 'PENDING' });
    }

    const tenantId = payload.tenantId || payload.tenant_id || 'tenant-001';
    const branchId = payload.branchId || payload.branch_id || 'main-branch';
    const operation: SyncOperation = operationOverride || (actionType === 'DELETE' ? 'DELETE' : actionType === 'UPDATE' ? 'UPDATE' : 'CREATE');

    await createSyncEvent({
      tenant_id: tenantId,
      branch_id: branchId,
      entity: entityName,
      entity_id: payload.id || `ent-${Date.now()}`,
      operation,
      payload,
    });

    if (isOnlineRef.current) {
      addLog(`Queued [${operation}] on ${entityName}. Auto-syncing...`);
      setTimeout(() => syncData(false), 300);

      // Broadcast real-time sync signal to sibling browser tabs/devices
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const bc = new BroadcastChannel('dukapos_sync_events');
          bc.postMessage({ type: 'SYNC_PUSH_SIGNAL', tenantId, entityName, operation, timestamp: Date.now() });
          bc.close();
        }
      } catch (_) {}
    } else {
      addLog(`Offline: Queued [${operation}] on ${entityName}.`);
    }
  };

  // Toggle online/offline mode manually for simulation/testing
  const toggleOfflineSimulation = () => {
    const nextState = !isOnlineRef.current;
    setIsOnline(nextState);
    setIsSimulated(true);
    isSimulatedRef.current = true;
    // Persist chosen mode so it survives page refresh
    localStorage.setItem(ONLINE_MODE_KEY, String(nextState));

    if (nextState) {
      addLog('NETWORK: Online mode manually activated.');
      setTimeout(() => syncData(true), 200);
    } else {
      addLog('NETWORK: Offline mode manually activated.');
    }
  };

  return {
    isOnline,
    isSyncing,
    syncProgress,
    pendingCount,
    syncLogs,
    syncData: (isManual = true) => syncData(isManual),
    syncFromServer,
    queueOperation,
    toggleOfflineSimulation,
  };
}
