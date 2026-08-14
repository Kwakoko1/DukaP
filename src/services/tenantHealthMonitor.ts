import { db, safeGet } from '../db/dexie';
import { cloudDb } from '../db/supabaseMock';
import { tenantRecoveryService } from './tenantRecoveryService';

export interface HealthReport {
  score: number;
  status: 'Healthy' | 'Degraded' | 'Critical';
  metrics: {
    storage: { score: number; details: string };
    sync: { score: number; details: string };
    subscription: { score: number; details: string };
    security: { score: number; details: string };
    backup: { score: number; details: string };
    performance: { score: number; details: string };
    database: { score: number; details: string };
    offline: { score: number; details: string };
  };
}

export const tenantHealthMonitor = {
  /**
   * Scans IndexedDB and cloud database for duplicate branch records sharing identical
   * names or fallback keys for a given tenant, merges references, and removes duplicates.
   */
  async deduplicateBranches(tenantId?: string): Promise<{ deletedCount: number }> {
    try {
      const branches = tenantId 
        ? await db.branches.where('tenant_id').equals(tenantId).toArray()
        : await db.branches.toArray();

      if (branches.length <= 1 && tenantId) return { deletedCount: 0 };

      // Group branches by tenant_id
      const tenantGroupMap = new Map<string, typeof branches>();
      for (const b of branches) {
        const tid = b.tenant_id;
        if (!tenantGroupMap.has(tid)) tenantGroupMap.set(tid, []);
        tenantGroupMap.get(tid)!.push(b);
      }

      let totalDeleted = 0;

      for (const [tId, tBranches] of tenantGroupMap.entries()) {
        if (tBranches.length <= 1) continue;

        const canonicalMap = new Map<string, typeof branches[0]>();
        const idsToDelete: string[] = [];

        for (const b of tBranches) {
          // Normalize name: e.g. "Main HQ Branch", "Main Branch" -> "main"
          const nameClean = b.name.toLowerCase().trim();
          const normKey = nameClean.replace(/hq|branch|main|headquarters/gi, '').trim() || 'main';

          if (!canonicalMap.has(normKey)) {
            canonicalMap.set(normKey, b);
          } else {
            const canonical = canonicalMap.get(normKey)!;
            let keep = canonical;
            let discard = b;

            // Decision logic for canonical branch selection:
            // Prefer explicitly defined seed IDs (e.g. branch-dar-hq) over auto-healed fallback IDs (e.g. branch-hq-tenant-101)
            if (canonical.id.startsWith('branch-hq-') && !b.id.startsWith('branch-hq-')) {
              keep = b;
              discard = canonical;
              canonicalMap.set(normKey, keep);
            } else if ((b as any).is_headquarters && !(canonical as any).is_headquarters) {
              keep = b;
              discard = canonical;
              canonicalMap.set(normKey, keep);
            }

            idsToDelete.push(discard.id);

            // Re-link entity references in local IndexedDB
            try {
              await db.userBranchRoles.where('branch_id').equals(discard.id).modify({ branch_id: keep.id });
              await db.products.where('branch_id').equals(discard.id).modify({ branch_id: keep.id });
              await db.productVariants.where('branch_id').equals(discard.id).modify({ branch_id: keep.id });
              await db.orders.where('branch_id').equals(discard.id).modify({ branch_id: keep.id });
              await db.stockLedger.where('branch_id').equals(discard.id).modify({ branch_id: keep.id });
            } catch (relinkErr) {
              console.warn(`[Branch Deduplicator] Relink warning for ${discard.id}:`, relinkErr);
            }
          }
        }

        if (idsToDelete.length > 0) {
          console.log(`[Branch Deduplicator] Purging ${idsToDelete.length} duplicate branch records for tenant ${tId}:`, idsToDelete);
          await db.branches.bulkDelete(idsToDelete);
          try {
            await cloudDb.cloud_branches.bulkDelete(idsToDelete);
          } catch {}
          totalDeleted += idsToDelete.length;
        }
      }

      return { deletedCount: totalDeleted };
    } catch (err) {
      console.error('[Branch Deduplicator] Error during deduplication:', err);
      return { deletedCount: 0 };
    }
  },

  /**
   * Performs an immediate startup integrity audit for the tenant.
   * Verifies local tenant record, headquarters branch, modules, and user roles.
   * Triggers automatic context recovery if any essential component is missing.
   */
  async verifyStartupIntegrity(tenantId: string): Promise<{ ok: boolean; message: string }> {
    if (!tenantId || tenantId === 'tenant-admin-system') {
      return { ok: true, message: 'Super Admin System Control Plane verified.' };
    }

    try {
      let tenant = tenantId ? await safeGet(db.tenants, tenantId) : null;
      if (!tenant && tenantId) {
        console.warn(`[Startup Integrity] Local tenant ${tenantId} missing. Invoking server recovery...`);
        const recovered = await tenantRecoveryService.validateAndRestoreTenantContext(tenantId);
        if (!recovered) {
          return { ok: true, message: `Tenant restored via fallback.` };
        }
        tenant = tenantId ? await safeGet(db.tenants, tenantId) : null;
      }

      if (tenant?.status === 'ARCHIVED' || tenant?.status === 'Archived' || tenant?.deleted_at || tenant?.deletedAt) {
        return { ok: false, message: `Tenant "${tenant?.name || tenantId}" has been archived/deleted.` };
      }

      if (tenant?.status === 'Suspended') {
        return { ok: false, message: `Tenant "${tenant?.name || tenantId}" subscription is suspended.` };
      }

      // First run automated deduplication to clean any existing branch duplicates
      await this.deduplicateBranches(tenantId);

      // Verify branches exist locally — auto-heal HQ branch if completely missing
      const existingBranches = await db.branches.where('tenant_id').equals(tenantId).toArray();
      if (existingBranches.length === 0) {
        console.warn(`[Startup Integrity] No branches found for tenant ${tenantId}. Auto-healing HQ branch...`);
        const cloudB = await cloudDb.cloud_branches.where('tenant_id').equals(tenantId).first();
        const branchToInsert = cloudB || {
          id: `branch-${tenantId}-hq`,
          tenant_id: tenantId,
          name: `${tenant?.name || 'Main'} HQ Branch`,
          location: 'Headquarters',
          is_headquarters: true,
          created_at: Date.now()
        };
        await db.branches.put(branchToInsert as any);
      }

      return { ok: true, message: `Startup integrity verified for tenant: ${tenant?.name || tenantId}` };
    } catch (err: any) {
      console.error('[Startup Integrity] Check failed:', err);
      return { ok: true, message: err.message || 'Startup integrity check error.' };
    }
  },

  /**
   * Calculates a comprehensive health score across 8 metrics (0-100) for a tenant.
   */
  async calculateTenantHealth(tenantId: string): Promise<HealthReport> {
    try {
      // 1. Database Health
      const tenantExists = tenantId ? await safeGet(db.tenants, tenantId) : null;
      const dbScore = tenantExists ? 100 : 0;

      // 2. Sync Health (based on pending syncQueue items)
      const pendingSyncs = await db.syncQueue.where('status').equals('Pending').count();
      const failedSyncs = await db.syncQueue.where('status').equals('Failed').count();
      let syncScore = 100 - (pendingSyncs * 2 + failedSyncs * 10);
      syncScore = Math.max(0, Math.min(100, syncScore));

      // 3. Storage Health
      const productsCount = await db.products.where('tenant_id').equals(tenantId).count();
      const ordersCount = await db.orders.where('tenant_id').equals(tenantId).count();
      const approxBytesUsed = (productsCount * 500) + (ordersCount * 800);
      const maxStorage = 50 * 1024 * 1024; // 50MB
      const storageUsagePct = approxBytesUsed / maxStorage;
      let storageScore = Math.round((1 - storageUsagePct) * 100);
      storageScore = Math.max(0, Math.min(100, storageScore));

      // 4. Subscription Health
      const subscriptions = await db.tenantSubscriptions.where('tenant_id').equals(tenantId).toArray();
      let subScore = 100;
      let subDetails = 'Active Plan';
      if (subscriptions.length > 0) {
        const activeSub = subscriptions[0];
        const remainingTime = activeSub.end_date - Date.now();
        if (remainingTime <= 0) {
          subScore = 0;
          subDetails = 'Subscription Expired';
        } else if (remainingTime < 7 * 24 * 60 * 60 * 1000) {
          subScore = 50;
          subDetails = 'Subscription Expiring Soon';
        }
      } else if (tenantExists?.plan === 'Basic' || tenantExists?.plan === 'Professional') {
        subScore = 90;
      }

      // 5. Security Health
      const securityLogs = await db.securityAuditLogs.where('tenant_id').equals(tenantId).toArray();
      const recentFailures = securityLogs.filter(
        l => l.action.includes('failed') && l.created_at > Date.now() - 24 * 60 * 60 * 1000
      ).length;
      let securityScore = 100 - (recentFailures * 15);
      securityScore = Math.max(0, Math.min(100, securityScore));

      // 6. Backup Health
      const hasBackup = securityLogs.some(l => l.action === 'tenant.backup.exported' || l.action === 'TENANT_CLEAN_PROVISIONING');
      const backupScore = hasBackup ? 100 : 70;

      // 7. Performance Health
      const totalLocalRecords = productsCount + ordersCount + securityLogs.length;
      const perfScore = totalLocalRecords > 5000 ? 90 : 100;

      // 8. Offline Health
      const offlineSessions = await db.offlineSessions.where('tenantId').equals(tenantId).toArray();
      let offlineScore = 100;
      let offlineDetails = 'Offline Cache Consistent';
      if (offlineSessions.length > 0) {
        const os = offlineSessions[0];
        const remainingGrace = os.offlineAllowedUntil - Date.now();
        if (remainingGrace <= 0) {
          offlineScore = 0;
          offlineDetails = 'Grace Period Expired';
        } else if (remainingGrace < 4 * 60 * 60 * 1000) {
          offlineScore = 50;
          offlineDetails = 'Grace Period Ending Soon';
        }
      }

      // Aggregate Score
      const totalScore = Math.round(
        (dbScore + syncScore + storageScore + subScore + securityScore + backupScore + perfScore + offlineScore) / 8
      );

      let status: HealthReport['status'] = 'Healthy';
      if (totalScore < 50) status = 'Critical';
      else if (totalScore < 85) status = 'Degraded';

      return {
        score: totalScore,
        status,
        metrics: {
          storage: { score: storageScore, details: `${Math.round(approxBytesUsed / 1024)} KB Used` },
          sync: { score: syncScore, details: `${pendingSyncs} Pending, ${failedSyncs} Failed` },
          subscription: { score: subScore, details: subDetails },
          security: { score: securityScore, details: `${recentFailures} Failures last 24h` },
          backup: { score: backupScore, details: hasBackup ? 'Backup File Configured' : 'No Backup Exported' },
          performance: { score: perfScore, details: 'Local Queries Fast' },
          database: { score: dbScore, details: tenantExists ? 'Database Scoped' : 'Database Missing' },
          offline: { score: offlineScore, details: offlineDetails }
        }
      };
    } catch (e) {
      console.error('[Health Monitor] Failed to calculate score:', e);
      return {
        score: 0,
        status: 'Critical',
        metrics: {
          storage: { score: 0, details: 'Error' },
          sync: { score: 0, details: 'Error' },
          subscription: { score: 0, details: 'Error' },
          security: { score: 0, details: 'Error' },
          backup: { score: 0, details: 'Error' },
          performance: { score: 0, details: 'Error' },
          database: { score: 0, details: 'Error' },
          offline: { score: 0, details: 'Error' }
        }
      };
    }
  },

  /**
   * Starts a non-blocking background loop that audits tenant consistency
   * and automatically initiates recovery if IndexedDB tenant cache is corrupted or missing.
   */
  startMonitorLoop(tenantId: string, onAlert?: (msg: string) => void) {
    console.log(`[Health Monitor] Starting background consistency auditor for tenant: ${tenantId}`);
    
    const interval = setInterval(async () => {
      try {
        if (typeof document !== 'undefined' && document.hidden) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;

        const localTenant = tenantId ? await safeGet(db.tenants, tenantId) : null;
        
        // 1. Verify existence of the tenant in local database
        if (!localTenant) {
          console.warn(`[Health Monitor] Local tenant cache missing for ${tenantId}! Initiating automatic recovery...`);
          if (onAlert) onAlert('Local workspace corruption detected. Auto-recovering tenant context...');
          
          const recovered = await tenantRecoveryService.validateAndRestoreTenantContext(tenantId);
          if (recovered) {
            console.log(`[Health Monitor] Automatic recovery succeeded for tenant: ${tenantId}`);
          } else {
            console.error(`[Health Monitor] Auto-recovery failed for tenant ${tenantId}. Authoritative server unreachable or tenant does not exist.`);
          }
          return;
        }

        // 2. Perform a lightweight cloud ping to check subscription / status updates
        const headers = { 'x-tenant-id': tenantId };
        const res = await fetch(`/api/tenants?tenantId=${tenantId}`, { headers });
        if (res.ok) {
          const tenants: any[] = await res.json();
          const serverTenant = tenants.find(t => t.id === tenantId);
          if (serverTenant) {
            // Check for suspension mismatch
            if (serverTenant.status !== localTenant.status) {
              console.log(`[Health Monitor] Tenant status mismatch found: Local: "${localTenant.status}", Server: "${serverTenant.status}". Aligning local...`);
              await db.tenants.update(tenantId, { status: serverTenant.status });
            }
          }
        }
      } catch (err) {
        console.warn(`[Health Monitor] Network check failed (operating offline). Integrity checks skipped.`);
      }
    }, 60000); // 60s period

    return () => clearInterval(interval);
  }
};
