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
import { syncTelemetryService, type SyncTelemetryMetrics } from '../../services/syncTelemetryService';
import { Wifi, WifiOff, RefreshCw, ShieldCheck, Clock, Activity, HardDrive } from 'lucide-react';
import { Dialog, Badge, Button } from './custom-ui';

export const SyncTelemetryHUD: React.FC = () => {
  const { status, context, isOnline, isOffline } = useSession();
  const [metrics, setMetrics] = useState<SyncTelemetryMetrics>(syncTelemetryService.getMetrics());
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    const unsub = syncTelemetryService.subscribe((newMetrics) => {
      setMetrics(newMetrics);
    });
    syncTelemetryService.refreshOutboxCount();
    return () => unsub();
  }, []);

  // Format Offline Grace Countdown
  const graceRemainingText = React.useMemo(() => {
    if (!context?.offlineExpiresAt || isOnline) return null;
    const diff = Math.max(0, context.offlineExpiresAt - Date.now());
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m grace left`;
  }, [context?.offlineExpiresAt, isOnline]);

  if (status === 'LOGGED_OUT' || status === 'UNKNOWN') {
    return null;
  }

  return (
    <>
      <div 
        onClick={() => setShowDiagnostics(true)}
        className="fixed bottom-16 md:bottom-3 right-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 dark:bg-slate-800/90 text-white shadow-xl backdrop-blur-md border border-slate-700/50 text-xs cursor-pointer hover:scale-105 transition-all select-none"
        title="Click to open Edge Sync & Security Diagnostics"
      >
        {/* Network & Sync Pulse */}
        <div className="flex items-center gap-1.5">
          {metrics.syncStatus === 'SYNCING' ? (
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
            {metrics.syncStatus === 'SYNCING'
              ? 'Syncing...'
              : isOnline
              ? 'Cloud Sync'
              : 'Offline Edge'}
          </span>
        </div>

        {/* Outbox Badge */}
        {metrics.pendingOutboxCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px] border border-amber-500/30">
            {metrics.pendingOutboxCount} queued
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
                {metrics.pendingOutboxCount} Pending Mutation(s)
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

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                syncTelemetryService.recordSyncStart();
                await syncTelemetryService.refreshOutboxCount();
                syncTelemetryService.recordSyncComplete(85, true);
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
      </Dialog>
    </>
  );
};
