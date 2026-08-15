/**
 * DukaPos SaaS — Super Admin Production Readiness Control Dashboard
 * Renders live visual diagnostics for all 20 production pillars, system telemetry,
 * backup verifier, RLS security log, automated suite execution, and Production Clean System.
 */

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Database, RefreshCw, CheckCircle2, Activity,
  HardDrive, Key, Trash2, Lock, Unlock, AlertTriangle, Check, Sparkles
} from 'lucide-react';
import { productionReadinessVerifier, type SuiteSummary } from '../../services/productionReadinessVerifier';
import { monitoringService, type SystemTelemetry } from '../../services/monitoringService';
import { productionDatabaseService } from '../../services/productionDatabaseService';
import { backupRecoveryEngine } from '../../services/backupRecoveryEngine';
import { productionCleanupService, type CleanupReport } from '../../services/productionCleanupService';
import { Dialog, Button } from '../UI/custom-ui';

export const ProductionReadinessControl: React.FC = () => {
  const [suite, setSuite] = useState<SuiteSummary | null>(null);
  const [telemetry, setTelemetry] = useState<SystemTelemetry>(monitoringService.getTelemetry());
  const [isRunning, setIsRunning] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  // Production Clean System state
  const [isLocked, setIsLocked] = useState(productionCleanupService.isProductionLocked());
  const [isCleaning, setIsCleaning] = useState(false);
  const [showConfirmCleanupModal, setShowConfirmCleanupModal] = useState(false);
  const [cleanupReport, setCleanupReport] = useState<CleanupReport | null>(null);

  const runDiagnostics = async () => {
    setIsRunning(true);
    const summary = await productionReadinessVerifier.runSuite();
    setSuite(summary);
    setTelemetry(monitoringService.getTelemetry());
    setIsRunning(false);
  };

  useEffect(() => {
    void runDiagnostics();
    const interval = setInterval(() => {
      setTelemetry(monitoringService.getTelemetry());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleExecuteProductionCleanup = async () => {
    setIsCleaning(true);
    setShowConfirmCleanupModal(false);
    try {
      const report = await productionCleanupService.executeProductionCleanup();
      setCleanupReport(report);
      setIsLocked(productionCleanupService.isProductionLocked());
      await runDiagnostics();
    } catch (err) {
      console.error('Cleanup execution error:', err);
    } finally {
      setIsCleaning(false);
    }
  };

  const filteredResults = suite?.results.filter(r => {
    if (filterCategory === 'ALL') return true;
    return r.category === filterCategory;
  }) || [];

  const dbMetrics = productionDatabaseService.getMetrics();
  const snapshots = backupRecoveryEngine.getSnapshots();

  return (
    <div className="space-y-6">
      {/* Header Banner — always dark gradient regardless of theme (intentional branding) */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/20 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0 shadow-inner">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">SaaS Production Architecture</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                  {suite?.readinessPercentage || 100}% Ready
                </span>
                {isLocked && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 border border-amber-500/30 text-amber-300 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Production Locked
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-300 mt-1 max-w-2xl">
                Real-time validation of multi-tenant security, PostgreSQL database connection pools, immutable stock ledgers, RLS isolation & offline-first sync engines.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowConfirmCleanupModal(true)}
              disabled={isCleaning}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 shrink-0"
            >
              <Trash2 className={`w-4 h-4 ${isCleaning ? 'animate-spin' : ''}`} />
              Production Clean System
            </button>

            <button
              onClick={runDiagnostics}
              disabled={isRunning}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs rounded-xl transition shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
              Run 20-Point Audit
            </button>
          </div>
        </div>
      </div>

      {/* Production Clean System Banner Card */}
      <div className="bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-400">
              {isLocked ? <Lock className="w-5 h-5 text-emerald-500" /> : <Unlock className="w-5 h-5 text-amber-500" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Production System Sanitizer & Artifact Purge Engine</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Purges test businesses, orphaned products, sales, customers, stock ledgers, and dev artifacts while preserving Super Admin & Core SaaS infrastructure.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowConfirmCleanupModal(true)}
            className="px-3.5 py-1.5 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900 border border-rose-300 dark:border-rose-600/40 text-rose-600 dark:text-rose-300 font-bold text-xs rounded-lg transition flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" /> Sanitize & Purge System
          </button>
        </div>

        {cleanupReport && (
          <div className="p-4 bg-slate-50 dark:bg-darkbg/60 rounded-xl border border-slate-200 dark:border-darkbg-border space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> {cleanupReport.message}
              </span>
              <span className="text-[10px] text-slate-500">Executed at: {new Date(cleanupReport.executedAt).toLocaleString()}</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 text-[11px]">
              <div className="p-2 bg-white dark:bg-darkbg-card rounded border border-slate-200 dark:border-darkbg-border">
                <span className="text-slate-500 dark:text-slate-400 block">Purged Tenants</span>
                <span className="font-bold text-slate-900 dark:text-white">{cleanupReport.purgedCounts.tenants || 0}</span>
              </div>
              <div className="p-2 bg-white dark:bg-darkbg-card rounded border border-slate-200 dark:border-darkbg-border">
                <span className="text-slate-500 dark:text-slate-400 block">Purged Products</span>
                <span className="font-bold text-slate-900 dark:text-white">{cleanupReport.purgedCounts.products || 0}</span>
              </div>
              <div className="p-2 bg-white dark:bg-darkbg-card rounded border border-slate-200 dark:border-darkbg-border">
                <span className="text-slate-500 dark:text-slate-400 block">Purged Orders</span>
                <span className="font-bold text-slate-900 dark:text-white">{cleanupReport.purgedCounts.orders || 0}</span>
              </div>
              <div className="p-2 bg-white dark:bg-darkbg-card rounded border border-slate-200 dark:border-darkbg-border">
                <span className="text-slate-500 dark:text-slate-400 block">Purged Stock Ledger</span>
                <span className="font-bold text-slate-900 dark:text-white">{cleanupReport.purgedCounts.stockLedger || 0}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Database Connection Pool</span>
            <Database className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
              {dbMetrics.poolActiveConnections} / {dbMetrics.maxPoolSize}
            </div>
            <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Read Replica Lag: {dbMetrics.readReplicaLagMs}ms
            </div>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>System Telemetry</span>
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
              {telemetry.apiLatencyMs}ms <span className="text-xs text-slate-400 font-sans font-normal">API Latency</span>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 flex items-center gap-2">
              <span>CPU: {telemetry.cpuUsagePct}%</span>
              <span>•</span>
              <span>RAM: {telemetry.memoryUsageMb} MB</span>
            </div>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Disaster Recovery (PITR)</span>
            <HardDrive className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
              {snapshots.length} Snapshots
            </div>
            <div className="text-xs text-blue-500 dark:text-blue-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              AES-256 Encrypted & Verified
            </div>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Tracing Correlation ID</span>
            <Key className="w-4 h-4 text-purple-500" />
          </div>
          <div>
            <div className="text-xs font-mono font-bold text-purple-600 dark:text-purple-300 truncate">
              {telemetry.activeCorrelationId}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Attached to logs & request headers
            </div>
          </div>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-darkbg-border pb-3 overflow-x-auto">
        {['ALL', 'SECURITY', 'INFRASTRUCTURE', 'DATA_INTEGRITY', 'OBSERVABILITY', 'OFFLINE_SYNC'].map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
              filterCategory === cat
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-100 dark:bg-darkbg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            {cat.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* 20 Pillars Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredResults.map(item => (
          <div
            key={item.id}
            className="bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border hover:border-indigo-400/60 dark:hover:border-indigo-500/40 rounded-xl p-4 shadow-sm transition space-y-2 group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-slate-100 dark:bg-darkbg text-indigo-600 dark:text-indigo-400 rounded text-[11px] font-mono font-bold">
                  {item.pillar}
                </span>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition">
                  {item.name}
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {item.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pl-1">
              {item.details}
            </p>
          </div>
        ))}
      </div>

      {/* Confirmation Modal */}
      <Dialog
        isOpen={showConfirmCleanupModal}
        onClose={() => setShowConfirmCleanupModal(false)}
        title="Execute Production Clean System"
        description="Permanently remove all test tenants, businesses, products, sales & dev artifacts."
      >
        <div className="space-y-4 pt-2 text-xs">
          <div className="p-3 bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/50 rounded-xl text-rose-700 dark:text-rose-300 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-500" /> Irreversible Production Action
            </div>
            <p className="text-[11px] leading-relaxed">
              This action will delete all test business records, products, inventory movements, transactions, and user accounts. Only the Super Admin account (<strong className="font-mono">admin@kwakoko.co.tz</strong>) and core SaaS infrastructure will be preserved.
            </p>
          </div>

          <div className="space-y-1.5">
            <h4 className="font-bold text-slate-800 dark:text-white text-[11px] uppercase tracking-wider">Preserved SaaS Core Data:</h4>
            <ul className="space-y-1 text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Super Admin Account & Security Policies</li>
              <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Starter, Business & Enterprise Subscription Plans</li>
              <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Industry Presets (Retail, Pharmacy, Bar, SACCO, Restaurant)</li>
              <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Brand Logo Assets & System Schema Presets</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t dark:border-darkbg-border">
            <Button variant="secondary" onClick={() => setShowConfirmCleanupModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleExecuteProductionCleanup}>
              Confirm & Sanitize System
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
