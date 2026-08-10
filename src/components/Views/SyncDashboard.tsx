import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/dexie';
import { useAuth } from '../../context/AuthContext';
import { useSyncState } from '../../context/SyncContext';
import { productionSyncEngine } from '../../services/productionSyncEngine';
import { stockLedgerSyncEngine } from '../../services/stockLedgerSyncEngine';
import { getDeviceDetails } from '../../services/deviceService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '../UI/custom-ui';
import {
  RefreshCw, Activity, Database, Smartphone, Globe, Shield,
  AlertTriangle, CheckCircle2, Zap, HardDrive, Layers,
  RotateCcw, Trash2
} from 'lucide-react';

export const SyncDashboard: React.FC = () => {
  const { currentTenant, currentBranch } = useAuth();
  const { isOnline, isSyncing, syncData, toggleOfflineSimulation, syncFromServer } = useSyncState();

  const [engineStatus, setEngineStatus] = useState<any>(null);
  const [ledgerDiag, setLedgerDiag] = useState<any>(null);
  const [dbSizeMb, setDbSizeMb] = useState<string>('0.00');
  const [devicesList, setDevicesList] = useState<any[]>([]);
  const [isRebuilding, setIsRebuilding] = useState<boolean>(false);
  const [isFlushing, setIsFlushing] = useState<boolean>(false);
  const [isClearingQueue, setIsClearingQueue] = useState<boolean>(false);
  const [isDetectingDrift, setIsDetectingDrift] = useState<boolean>(false);
  const [driftResult, setDriftResult] = useState<any>(null);

  // Live queries for real-time queue & outbox items
  const queueItems = useLiveQuery(async () => {
    return await db.syncQueue.toArray();
  }) || [];

  const outboxItems = useLiveQuery(async () => {
    if (!currentTenant?.id) return [];
    return await db.syncOutbox.where('tenant_id').equals(currentTenant.id).reverse().sortBy('created_at');
  }, [currentTenant?.id]) || [];

  const stockLedgerEvents = useLiveQuery(async () => {
    if (!currentTenant?.id) return [];
    return await db.stockLedger.where('tenant_id').equals(currentTenant.id).reverse().sortBy('created_at');
  }, [currentTenant?.id]) || [];

  // Update status metrics
  useEffect(() => {
    const fetchStatus = async () => {
      const status = await productionSyncEngine.getStatus();
      setEngineStatus(status);

      if (currentTenant?.id && currentBranch?.id) {
        const diag = await stockLedgerSyncEngine.getSyncEngineDiagnostics(currentTenant.id, currentBranch.id);
        setLedgerDiag(diag);
      }

      // Estimate IndexedDB size if Storage API is supported
      if (typeof navigator !== 'undefined' && 'storage' in navigator && navigator.storage.estimate) {
        try {
          const estimate = await navigator.storage.estimate();
          const usedMb = ((estimate.usage || 0) / (1024 * 1024)).toFixed(2);
          setDbSizeMb(usedMb);
        } catch (_) {}
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [currentTenant?.id, currentBranch?.id]);

  // Fetch connected devices
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await fetch(`/api/sync?tenantId=${currentTenant?.id || ''}&since=0`);
        if (res.ok) {
          const data = await res.json();
          if (data.changes?.userDevices) {
            setDevicesList(data.changes.userDevices);
          } else {
            const currentDev = getDeviceDetails();
            setDevicesList([currentDev]);
          }
        }
      } catch (_) {
        setDevicesList([getDeviceDetails()]);
      }
    };
    fetchDevices();
  }, [currentTenant?.id]);

  const pendingQueue = queueItems.filter(i => i.status === 'Pending' || i.status === 'Processing');
  const failedQueue = queueItems.filter(i => i.status === 'Failed');
  const completedQueue = queueItems.filter(i => i.status === 'Completed');
  const deadLetterQueue = queueItems.filter(i => i.status === 'DeadLetter' || (i.retry_count || 0) >= 10);

  const [selectedDLQItem, setSelectedDLQItem] = useState<any>(null);
  const [editPayloadJson, setEditPayloadJson] = useState<string>('');
  const [showDLQModal, setShowDLQModal] = useState<boolean>(false);

  const handleRetryDLQItem = async (item: any) => {
    if (!item?.id) return;
    try {
      await db.syncQueue.update(item.id, {
        status: 'Pending' as any,
        retry_count: 0,
        last_attempt: null,
        error: null
      });
      alert(`✅ Item #${item.id} (${item.entity}) reset to Pending. Triggering sync...`);
      await syncData(true);
    } catch (err: any) {
      alert(`Error retrying item: ${err.message}`);
    }
  };

  const handleSaveAndRetryDLQ = async () => {
    if (!selectedDLQItem?.id) return;
    try {
      const parsedPayload = JSON.parse(editPayloadJson);
      await db.syncQueue.update(selectedDLQItem.id, {
        payload: parsedPayload,
        status: 'Pending' as any,
        retry_count: 0,
        last_attempt: null,
        error: null
      });
      setShowDLQModal(false);
      setSelectedDLQItem(null);
      alert(`✅ Payload updated for Item #${selectedDLQItem.id} and reset to Pending. Triggering sync...`);
      await syncData(true);
    } catch (err: any) {
      alert(`Invalid JSON payload: ${err.message}`);
    }
  };

  const handlePurgeAllDLQQueue = async () => {
    if (!confirm('Are you sure you want to purge all Dead-Letter / Failed operations from the sync queue?')) return;
    try {
      const dlqIds = deadLetterQueue.map(i => i.id).filter(Boolean) as number[];
      for (const id of dlqIds) {
        await db.syncQueue.delete(id);
      }
      alert(`✅ Purged ${dlqIds.length} Dead-Letter queue operation(s).`);
    } catch (err: any) {
      alert(`Error purging DLQ: ${err.message}`);
    }
  };

  const handleRunStoragePrune = async () => {
    try {
      const res = await productionSyncEngine.enforceStorageQuotaGuard();
      alert(`✅ Storage Quota Monitor:\nUsage: ${res.usageMb} MB / Quota: ${res.quotaMb} MB\nPruned ${res.prunedCount} old completed queue records.`);
    } catch (err: any) {
      alert(`Storage prune error: ${err.message}`);
    }
  };

  const handleManualSync = async () => {
    await syncData(true);
    if (currentTenant?.id) {
      await syncFromServer(currentTenant.id);
    }
  };

  const handleFlushEvents = async () => {
    if (!currentTenant?.id || !currentBranch?.id) return;
    setIsFlushing(true);
    try {
      const res = await stockLedgerSyncEngine.syncPendingEvents(currentTenant.id, currentBranch.id);
      alert(`✅ Flushed ${res.syncedCount} pending stock ledger event(s) into local sync queue.`);
    } catch (err: any) {
      alert(`Error flushing events: ${err.message}`);
    } finally {
      setIsFlushing(false);
    }
  };

  const handleRetryFailedOutbox = async () => {
    if (!currentTenant?.id || !currentBranch?.id) return;
    try {
      const processed = await stockLedgerSyncEngine.retryFailedOutbox(currentTenant.id, currentBranch.id);
      alert(`✅ Outbox retry triggered: Successfully processed ${processed} item(s).`);
    } catch (err: any) {
      alert(`Outbox retry error: ${err.message}`);
    }
  };

  const handlePurgeDLQ = async () => {
    if (!currentTenant?.id || !currentBranch?.id) return;
    if (!confirm('Are you sure you want to purge all Dead-Letter Queue items?')) return;
    try {
      const purged = await stockLedgerSyncEngine.purgeDeadLetterQueue(currentTenant.id, currentBranch.id);
      alert(`✅ Purged ${purged} Dead-Letter Queue item(s).`);
    } catch (err: any) {
      alert(`DLQ purge error: ${err.message}`);
    }
  };

  const handleDetectDrift = async () => {
    if (!currentTenant?.id || !currentBranch?.id) return;
    setIsDetectingDrift(true);
    try {
      const { stockSnapshotManager } = await import('../../services/stockSnapshotManager');
      const res = await stockSnapshotManager.detectDrift(currentTenant.id, currentBranch.id);
      setDriftResult(res);
      if (res.driftCount === 0) {
        alert(`✅ Stock Ledger Audit Passed!\nChecked ${res.totalChecked} product(s). Zero balance drift detected.`);
      } else {
        alert(`⚠️ Drift Detected in ${res.driftCount} product(s)!\nProducts: ${res.driftedProducts.join(', ')}`);
      }
    } catch (err: any) {
      alert(`Drift audit error: ${err.message}`);
    } finally {
      setIsDetectingDrift(false);
    }
  };

  const handleRebuildBalances = async () => {
    if (!currentTenant?.id || !currentBranch?.id) return;
    setIsRebuilding(true);
    try {
      const res = await stockLedgerSyncEngine.rebuildAllBranchBalances(currentTenant.id, currentBranch.id);
      alert(`✅ Stock Ledger Replay Complete!\nRecalculated ${res.productsRecalculated} products from ${res.totalEventsReplayed} Ledger events.`);
    } catch (err: any) {
      alert(`Error rebuilding stock: ${err.message}`);
    } finally {
      setIsRebuilding(false);
    }
  };

  const handlePurgeCache = async () => {
    if (!confirm('Are you sure you want to clear local offline cache and re-sync from server? Business data on server will remain intact.')) return;
    setIsClearingQueue(true);
    try {
      await db.products.clear();
      await db.productVariants.clear();
      await db.stockBalance.clear();
      await db.categories.clear();
      if (currentTenant?.id) {
        await syncFromServer(currentTenant.id);
      }
      alert('Local offline cache purged and re-synchronized from authoritative server!');
    } catch (err: any) {
      alert(`Cache purge error: ${err.message}`);
    } finally {
      setIsClearingQueue(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-darkbg-card p-6 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
              <RefreshCw className={`h-5 w-5 text-indigo-500 ${isSyncing ? 'animate-spin' : ''}`} />
              Production Sync Control Dashboard
            </h2>
            <Badge variant={isOnline ? 'success' : 'danger'} className="font-bold text-xs uppercase">
              {isOnline ? 'ONLINE (Sync Active)' : 'OFFLINE (Queue Mode)'}
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time telemetry monitoring for offline-first queue operations, multi-device sync, and Stock Ledger replay.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            onClick={toggleOfflineSimulation}
            variant="outline"
            className="text-xs font-bold flex items-center gap-1.5"
          >
            <Globe className="h-4 w-4 text-emerald-500" />
            {isOnline ? 'Switch to Offline' : 'Switch to Online'}
          </Button>

          <Button
            onClick={handleManualSync}
            disabled={isSyncing}
            variant="primary"
            className="text-xs font-bold flex items-center gap-1.5"
          >
            <RotateCcw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Force Sync Now'}
          </Button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-gradient-to-br from-indigo-50/50 to-white dark:from-darkbg/40 dark:to-darkbg-card border border-indigo-100 dark:border-darkbg-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Pending Operations</span>
            <div className="p-1.5 bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 rounded-lg">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-800 dark:text-white">{pendingQueue.length}</span>
            <span className="text-[11px] font-semibold text-slate-400">items in queue</span>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-emerald-50/50 to-white dark:from-darkbg/40 dark:to-darkbg-card border border-emerald-100 dark:border-darkbg-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Successful Syncs</span>
            <div className="p-1.5 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 rounded-lg">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {engineStatus?.completedSyncCount || completedQueue.length}
            </span>
            <span className="text-[11px] font-semibold text-slate-400">operations</span>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-rose-50/50 to-white dark:from-darkbg/40 dark:to-darkbg-card border border-rose-100 dark:border-darkbg-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Failed / Retrying</span>
            <div className="p-1.5 bg-rose-100 dark:bg-rose-950/50 text-rose-600 rounded-lg">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400">{failedQueue.length}</span>
            <span className="text-[11px] font-semibold text-slate-400">exponential backoff</span>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-amber-50/50 to-white dark:from-darkbg/40 dark:to-darkbg-card border border-amber-100 dark:border-darkbg-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">API Latency / Speed</span>
            <div className="p-1.5 bg-amber-100 dark:bg-amber-950/50 text-amber-600 rounded-lg">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-800 dark:text-white">
              {engineStatus?.apiLatencyMs || 24} ms
            </span>
            <span className="text-[11px] font-semibold text-slate-400">storage: {dbSizeMb} MB</span>
          </div>
        </Card>
      </div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2-Cols: Sync Queue Operations */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-darkbg-border/30">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Activity className="h-4.5 w-4.5 text-indigo-500" />
                    Offline Sync Queue Operations (`sync_queue`)
                  </CardTitle>
                  <CardDescription>Live operations queued in client IndexedDB awaiting server confirmation.</CardDescription>
                </div>
                <Badge variant="info" className="font-mono text-[10px]">
                  Total: {queueItems.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {queueItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 italic">
                  No pending operations in sync queue. All local mutations are fully synchronized with server source of truth.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/20 text-slate-400 font-bold uppercase text-[10px]">
                      <th className="p-3">Operation</th>
                      <th className="p-3">Entity</th>
                      <th className="p-3">Entity ID</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Retries</th>
                      <th className="p-3">Queued At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20 font-mono text-[11px]">
                    {queueItems.slice(0, 15).map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10">
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            item.operation === 'DELETE' ? 'bg-red-100 text-red-700' :
                            item.operation === 'CREATE' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {item.operation || item.actionType || 'UPDATE'}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">
                          {item.entity || item.entityName || 'products'}
                        </td>
                        <td className="p-3 text-slate-500 truncate max-w-[120px]">
                          {item.entity_id || item.payload?.id || '—'}
                        </td>
                        <td className="p-3">
                          <Badge variant={
                            item.status === 'Completed' ? 'success' :
                            item.status === 'Failed' ? 'danger' :
                            item.status === 'Processing' ? 'warning' : 'info'
                          } className="text-[9px] py-0 font-bold">
                            {item.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-slate-500">{item.retry_count || 0}</td>
                        <td className="p-3 text-slate-400 text-[10px]">
                          {new Date(item.created_at || item.timestamp || Date.now()).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Drift Result Banner */}
          {driftResult && (
            <div className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
              driftResult.driftCount === 0
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            }`}>
              <div>
                <strong>Stock Ledger Audit Status:</strong> {driftResult.driftCount === 0 ? `Zero drift across ${driftResult.totalChecked} product balances.` : `Drift detected in ${driftResult.driftCount} product(s)! (${driftResult.driftedProducts.join(', ')})`}
              </div>
              <Button size="sm" onClick={() => setDriftResult(null)} variant="outline" className="text-[10px] h-6 px-2">Dismiss</Button>
            </div>
          )}

          {/* Dead-Letter Queue (DLQ) Remediation Console */}
          {deadLetterQueue.length > 0 && (
            <Card className="border border-rose-200 dark:border-rose-950/40 bg-rose-50/20 dark:bg-rose-950/10">
              <CardHeader className="pb-3 border-b border-rose-100 dark:border-rose-950/30">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-rose-500 animate-pulse" />
                    <div>
                      <CardTitle className="text-sm font-bold text-rose-700 dark:text-rose-400">
                        Dead-Letter Queue (DLQ) Remediation Console
                      </CardTitle>
                      <CardDescription className="text-rose-600/80 dark:text-rose-400/70">
                        {deadLetterQueue.length} operation(s) exceeded 10 max retries and require manual inspection or remediation.
                      </CardDescription>
                    </div>
                  </div>
                  <Button onClick={handlePurgeAllDLQQueue} size="sm" variant="outline" className="text-xs font-bold text-rose-600 border-rose-300 hover:bg-rose-100">
                    Purge All DLQ Items
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-rose-100 dark:border-rose-950/30 bg-rose-100/40 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 font-bold uppercase text-[10px]">
                      <th className="p-3">ID</th>
                      <th className="p-3">Entity</th>
                      <th className="p-3">Operation</th>
                      <th className="p-3">Error Cause</th>
                      <th className="p-3">Retries</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100 dark:divide-rose-950/20 font-mono text-[11px]">
                    {deadLetterQueue.map((dlqItem) => (
                      <tr key={dlqItem.id} className="hover:bg-rose-100/30 dark:hover:bg-rose-900/10">
                        <td className="p-3 font-bold text-slate-800 dark:text-slate-200">#{dlqItem.id}</td>
                        <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">{dlqItem.entity}</td>
                        <td className="p-3"><Badge variant="warning" className="text-[9px] py-0">{dlqItem.operation}</Badge></td>
                        <td className="p-3 text-rose-600 dark:text-rose-400 max-w-[200px] truncate" title={dlqItem.error || 'Schema validation error'}>
                          {dlqItem.error || 'Schema validation failure'}
                        </td>
                        <td className="p-3 font-bold text-rose-600">{dlqItem.retry_count || 10}/10</td>
                        <td className="p-3 text-right flex justify-end gap-1.5">
                          <button
                            onClick={() => handleRetryDLQItem(dlqItem)}
                            className="px-2 py-1 text-[10px] font-bold bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
                            title="Reset retry count and force immediate sync"
                          >
                            Retry
                          </button>
                          <button
                            onClick={() => {
                              setSelectedDLQItem(dlqItem);
                              setEditPayloadJson(JSON.stringify(dlqItem.payload || {}, null, 2));
                              setShowDLQModal(true);
                            }}
                            className="px-2 py-1 text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded hover:bg-slate-300 transition"
                            title="Inspect & edit payload JSON"
                          >
                            Edit Payload
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Transactional Outbox Queue Card */}
          <Card>
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-darkbg-border/30">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Zap className="h-4.5 w-4.5 text-amber-500" />
                    Transactional Outbox Queue (`sync_outbox`)
                  </CardTitle>
                  <CardDescription>Resilient outbox items with exponential retry backoff & DLQ isolation.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={handleRetryFailedOutbox} size="sm" variant="outline" className="text-[11px] font-bold h-7">Retry Failed</Button>
                  <Button onClick={handlePurgeDLQ} size="sm" variant="outline" className="text-[11px] font-bold text-rose-600 border-rose-200 h-7">Purge DLQ</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {outboxItems.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 italic">
                  Outbox queue is clear. Zero pending background events.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/20 text-slate-400 font-bold uppercase text-[10px]">
                      <th className="p-3">Action</th>
                      <th className="p-3">Idempotency Key</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Retries</th>
                      <th className="p-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20 font-mono text-[11px]">
                    {outboxItems.slice(0, 5).map((ob) => (
                      <tr key={ob.outbox_id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10">
                        <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">{ob.action}</td>
                        <td className="p-3 text-slate-500 truncate max-w-[120px]">{ob.idempotency_key}</td>
                        <td className="p-3">
                          <Badge variant={ob.status === 'COMPLETED' ? 'success' : ob.status === 'DEAD_LETTER' ? 'danger' : ob.status === 'FAILED' ? 'warning' : 'info'} className="text-[9px] py-0 font-bold">
                            {ob.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-slate-500">{ob.retry_count}/{ob.max_retries}</td>
                        <td className="p-3 text-slate-400 text-[10px]">{new Date(ob.created_at).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Stock Ledger Events Replay Section */}
          <Card>
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-darkbg-border/30">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Database className="h-4.5 w-4.5 text-emerald-500" />
                      Stock Ledger Movement Replay Stream
                    </CardTitle>
                    {ledgerDiag && (
                      <Badge variant={ledgerDiag.healthStatus === 'OPTIMAL' ? 'success' : ledgerDiag.healthStatus === 'DEGRADED' ? 'danger' : 'warning'} className="text-[9px] font-bold uppercase">
                        {ledgerDiag.healthStatus} (v{ledgerDiag.lastSyncedVersion || 1})
                      </Badge>
                    )}
                  </div>
                  <CardDescription>Immutable stock movement events. Stock balance is derived by replaying these entries.</CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    onClick={handleDetectDrift}
                    disabled={isDetectingDrift}
                    variant="outline"
                    className="text-xs font-bold flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                  >
                    <Shield className={`h-3.5 w-3.5 ${isDetectingDrift ? 'animate-spin' : ''}`} />
                    Audit Drift
                  </Button>
                  <Button
                    onClick={handleFlushEvents}
                    disabled={isFlushing}
                    variant="outline"
                    className="text-xs font-bold flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800"
                  >
                    <Zap className={`h-3.5 w-3.5 ${isFlushing ? 'animate-spin' : ''}`} />
                    Flush Pending Events
                  </Button>
                  <Button
                    onClick={handleRebuildBalances}
                    disabled={isRebuilding}
                    variant="outline"
                    className="text-xs font-bold flex items-center gap-1.5"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRebuilding ? 'animate-spin' : ''}`} />
                    Rebuild Stock from Events
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {stockLedgerEvents.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 italic">
                  No stock ledger events recorded yet.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/20 text-slate-400 font-bold uppercase text-[10px]">
                      <th className="p-3">Movement</th>
                      <th className="p-3">Product ID</th>
                      <th className="p-3">Qty Change</th>
                      <th className="p-3">Unit Cost</th>
                      <th className="p-3">Sync Status</th>
                      <th className="p-3">Version</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20 font-mono text-[11px]">
                    {stockLedgerEvents.slice(0, 10).map((evt) => (
                      <tr key={evt.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10">
                        <td className="p-3 font-semibold text-slate-800 dark:text-white">
                          {evt.movement_type}
                        </td>
                        <td className="p-3 text-slate-500 truncate max-w-[120px]">
                          {evt.product_id}
                        </td>
                        <td className={`p-3 font-bold ${evt.quantity_change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {evt.quantity_change >= 0 ? `+${evt.quantity_change}` : evt.quantity_change}
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-300">
                          {evt.unit_cost?.toLocaleString()} TZS
                        </td>
                        <td className="p-3">
                          <Badge variant={evt.synced ? 'success' : 'warning'} className="text-[9px] py-0 font-bold">
                            {evt.sync_status || (evt.synced ? 'SYNCED' : 'PENDING')}
                          </Badge>
                        </td>
                        <td className="p-3 text-slate-400">v{evt.event_version || 1}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Devices & Troubleshooting Tools */}
        <div className="space-y-6">
          {/* Connected Devices Card */}
          <Card>
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-darkbg-border/30">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Smartphone className="h-4.5 w-4.5 text-indigo-500" />
                Registered Connected Devices
              </CardTitle>
              <CardDescription>Devices and browser profiles connected to tenant workspace.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {devicesList.map((dev, idx) => (
                <div key={dev.device_id || idx} className="p-3 border border-slate-200 dark:border-darkbg-border rounded-xl bg-slate-50/40 dark:bg-darkbg/10 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                      <HardDrive className="h-3.5 w-3.5 text-indigo-500" />
                      {dev.name || 'Current Device'}
                    </span>
                    <Badge variant="success" className="text-[8px] py-0">ACTIVE</Badge>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 flex flex-wrap gap-2 mt-1">
                    <span>ID: {dev.device_id}</span>
                    <span>OS: {dev.os}</span>
                    <span>Browser: {dev.browser}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Maintenance & Troubleshooting Actions */}
          <Card>
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-darkbg-border/30">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Shield className="h-4.5 w-4.5 text-amber-500" />
                Production Maintenance Tools
              </CardTitle>
              <CardDescription>Disaster recovery & offline storage options.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <Button
                onClick={handleRunStoragePrune}
                variant="outline"
                className="w-full text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 flex items-center justify-center gap-2"
              >
                <HardDrive className="h-4 w-4" />
                Run Storage Quota Auto-Pruning
              </Button>

              <Button
                onClick={handlePurgeCache}
                disabled={isClearingQueue}
                variant="outline"
                className="w-full text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 flex items-center justify-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Purge Local Offline Cache & Resync
              </Button>

              <p className="text-[11px] text-slate-400 leading-relaxed italic">
                Clearing local cache removes temporary IndexedDB stores only. All business data permanently lives on server database source of truth.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dead-Letter Queue JSON Editor Modal */}
      {showDLQModal && selectedDLQItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-darkbg-card rounded-2xl p-6 max-w-2xl w-full border border-slate-200 dark:border-darkbg-border shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 dark:border-darkbg-border">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-500" />
                DLQ Payload Inspector & Remediation (#{selectedDLQItem.id})
              </h3>
              <button onClick={() => setShowDLQModal(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex gap-4 font-mono text-[11px] text-slate-500">
                <span><strong>Entity:</strong> {selectedDLQItem.entity}</span>
                <span><strong>Operation:</strong> {selectedDLQItem.operation}</span>
                <span><strong>Retries:</strong> {selectedDLQItem.retry_count || 10}</span>
              </div>
              <p className="text-rose-600 font-medium"><strong>Error Cause:</strong> {selectedDLQItem.error || 'Schema validation failure'}</p>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Edit Payload JSON:</label>
                <textarea
                  value={editPayloadJson}
                  onChange={e => setEditPayloadJson(e.target.value)}
                  rows={10}
                  className="w-full font-mono text-xs p-3 rounded-xl border border-slate-300 dark:border-darkbg-border bg-slate-900 text-emerald-400 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t dark:border-darkbg-border">
              <Button onClick={() => setShowDLQModal(false)} variant="outline" size="sm">Cancel</Button>
              <Button onClick={handleSaveAndRetryDLQ} variant="primary" size="sm" className="font-bold">Save Payload & Force Retry</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
