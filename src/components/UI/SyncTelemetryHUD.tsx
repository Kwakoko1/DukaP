/**
 * KwakoPos SaaS — Real-Time Sync Telemetry & Security HUD
 * 
 * Provides an unobtrusive, dynamic status capsule with:
 * - Online/Offline/Syncing status
 * - Pending outbox counter
 * - HLC Monotonic Clock display
 * - Offline Grace window countdown
 * - Hardware WebCrypto vault status
 * - Diagnostics inspector dialog
 */
import React, { useState, useEffect } from 'react';
import { useSession } from '../../contexts/SessionContext';
import { useAuth } from '../../context/AuthContext';
import { useSyncState } from '../../context/SyncContext';
import { syncTelemetryService, type SyncTelemetryMetrics } from '../../services/syncTelemetryService';
import { Wifi, WifiOff, RefreshCw, ShieldCheck, Clock, Activity, HardDrive } from 'lucide-react';
import { Dialog, Badge, Button } from './custom-ui';

export const SyncTelemetryHUD: React.FC = () => {
  const { status, context } = useSession();
  const { user, isSuperAdminView } = useAuth();
  const { isOnline, isSyncing: syncIsSyncing, pendingCount: syncPendingCount, toggleOfflineSimulation, syncData } = useSyncState();
  const [metrics, setMetrics] = useState<SyncTelemetryMetrics>(syncTelemetryService.getMetrics());
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    const unsub = syncTelemetryService.subscribe((newMetrics) => {
      setMetrics(newMetrics);
    });
    syncTelemetryService.refreshOutboxCount();
    return () => unsub();
  }, []);

  // Synchronize network state with telemetry service
  useEffect(() => {
    syncTelemetryService.setNetworkStatus(isOnline);
  }, [isOnline]);

  const isOffline = !isOnline;
  const isSyncing = syncIsSyncing || metrics.syncStatus === 'SYNCING';
  const outboxCount = Math.max(metrics.pendingOutboxCount || 0, syncPendingCount || 0);

  // Format Offline Grace Countdown
  const graceRemainingText = React.useMemo(() => {
    if (!context?.offlineExpiresAt || isOnline) return null;
    const diff = Math.max(0, context.offlineExpiresAt - Date.now());
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m grace left`;
  }, [context?.offlineExpiresAt, isOnline]);

  // Hide only on login screen when there is definitely no active user
  if (!user && !isSuperAdminView && status === 'LOGGED_OUT') {
    return null;
  }

  return (
    <>
      <div 
        onClick={() => setShowDiagnostics(true)}
        className="fixed bottom-16 md:bottom-3 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 dark:bg-slate-800/90 text-white shadow-2xl backdrop-blur-md border border-slate-700/50 text-xs cursor-pointer hover:scale-105 transition-all select-none"
        title="Click to open Edge Sync & Security Diagnostics"
      >
        {/* Network & Sync Pulse */}
        <div className="flex items-center gap-1.5">
          {isSyncing ? (
            <RefreshCw size={13} className="text-blue-400 animate-spin" />
          ) : isOnline ? (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          ) : (
            <WifiOff size={13} className="text-amber-400" />
          )}

          <span className="font-semibold">
            {isSyncing
              ? 'Syncing...'
              : isOnline
              ? 'Cloud Sync'
              : 'Offline Edge'}
          </span>
        </div>

        {/* Outbox Badge */}
        {outboxCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px] border border-amber-500/30">
            {outboxCount} queued
          </span>
        )}

        {/* Offline Grace Badge */}
        {isOffline && graceRemainingText && (
          <span className="px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-medium text-[10px]">
            {graceRemainingText}
          </span>
        )}

        {/* Security Shield Icon */}
        <ShieldCheck size={13} className="text-emerald-400" />
      </div>

      {/* Diagnostics Dialog */}
      <Dialog
        isOpen={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
        title="Edge Storage, Sync & Zero-Trust Diagnostics"
      >
        <div className="space-y-4 p-4 text-xs dark:text-slate-200">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Wifi size={14} />
                <span className="font-semibold">Connection State</span>
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-white">
                {isOnline ? '🟢 Connected (Online)' : '🟠 Edge Mode (Offline)'}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <HardDrive size={14} />
                <span className="font-semibold">Outbox Queue</span>
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-white">
                {outboxCount} Pending Mutation(s)
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Clock size={14} />
                <span className="font-semibold">Hybrid Logical Clock (HLC)</span>
              </div>
              <p className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate" title={metrics.currentHlc}>
                {metrics.currentHlc}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Activity size={14} />
                <span className="font-semibold">Health Score</span>
              </div>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {metrics.healthScore}% Operational
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-600 dark:text-slate-400">Database Schema Version</span>
              <Badge variant="info">KwakoPosDB v27 (Schema IDB)</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-600 dark:text-slate-400">PWA Build & Release</span>
              <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">v1.2.5 (Build 20260816.01)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-600 dark:text-slate-400">Hardware Data Vault</span>
              <Badge variant="success">AES-GCM-256 WebCrypto</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-600 dark:text-slate-400">Conflict Engine</span>
              <Badge variant="info">CRDT + Monotonic HLC</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-600 dark:text-slate-400">Access Control Model</span>
              <Badge variant="default">ABAC + Versioned RBAC</Badge>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleOfflineSimulation}
            >
              {isOnline ? <WifiOff size={13} className="mr-1" /> : <Wifi size={13} className="mr-1 text-emerald-500" />}
              <span>{isOnline ? 'Simulate Offline' : 'Go Online'}</span>
            </Button>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await syncData(true);
                  await syncTelemetryService.refreshOutboxCount();
                }}
              >
                <RefreshCw size={13} className="mr-1" />
                Force Edge Sync Probe
              </Button>
              <Button size="sm" onClick={() => setShowDiagnostics(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
};
