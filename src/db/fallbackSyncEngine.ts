/**
 * fallbackSyncEngine.ts
 * Low-Bandwidth Edge Connectivity & Minified Payload Sync Engine for KwakoPos.
 * 
 * Activated automatically when network throughput drops to critical edge frequencies.
 * Compresses outbox events into minified single-letter key tuples (i, b, p, v, m, q, c, k, t, r, u, d)
 * to minimize cellular transit bytes.
 */

import { db } from './dexie';

export async function executeExtremeConnectivityFallback(tenantId: string, branchId: string): Promise<{ success: boolean; pushed: number }> {
  console.warn('[FallbackSync] Low-bandwidth edge connection identified. Compressing payloads...');
  
  // 1. Isolate target structural ledger entries pending sync
  const pendingEvents = await db.stockLedger
    .where('tenant_id').equals(tenantId)
    .and(e => e.branch_id === branchId && e.sync_status === 'PENDING')
    .toArray();

  if (pendingEvents.length === 0) return { success: true, pushed: 0 };

  // 2. Heavy-duty compression: Strip to bare metadata matching thermal layout structural needs
  const ultraCompressedPayload = pendingEvents.map(event => ({
    i: event.id,                       // Minified ID key
    b: event.branch_id,                // Minified Branch key
    p: event.product_id,               // Minified Product key
    v: event.variant_id || 'no-variant', // Minified Variant marker
    m: event.movement_type,            // Event flag (SALE, DAMAGE)
    q: Number(event.quantity_change),  // Numerical delta
    c: Number(event.unit_cost) || 0,   // Base line pricing
    k: event.idempotency_key,          // Protection token
    t: Number(event.created_at) || Date.now(), // 13-digit Unix signature
    r: event.reference_id || '',       // Thermal receipt trace
    u: event.user_id || '',            // Cashier tracking
    d: event.device_id || ''           // Terminal layout tracking
  }));

  try {
    // 3. Dispatch to dedicated lightweight network handler route
    const response = await fetch('/api/sync/fallback-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenantId,
        'X-Bandwidth-State': 'CRITICAL',
        'X-Bypass-Replica': 'true'
      },
      body: JSON.stringify({ ops: ultraCompressedPayload })
    });

    if (response.status === 200) {
      const responseData = await response.json();
      
      // Update state markers sequentially in local Dexie engine to clear queue indexes
      const completedIds = pendingEvents.map(e => e.id);
      await db.transaction('rw', db.stockLedger, async () => {
        for (const id of completedIds) {
          await db.stockLedger.update(id, { sync_status: 'SYNCED', synced: true });
        }
      });
      
      return { success: true, pushed: responseData.processed || completedIds.length };
    }
    
    return { success: false, pushed: 0 };
  } catch (networkError) {
    console.error('[FallbackSync Engine Network Execution Failed]:', networkError);
    return { success: false, pushed: 0 };
  }
}
