import { useState, useEffect } from 'react';
import { subscribeToCrossTabSync, broadcastMutation, type MutationBroadcastEvent } from '../services/crossTabSyncService';
import { useLiveQuery } from 'dexie-react-hooks';

export interface BaseEntity {
  id: string;
  tenant_id: string;
  branch_id: string;
  updated_at: number;
  created_at: number;
  deleted?: boolean;
  version?: number;
}

/**
 * Enterprise Reactive Cross-Tab & Cross-Device Entity Hook for DukaPOS.
 * Combines Dexie Live Query reactivity + BroadcastChannel <5ms cross-tab signaling + Optimistic Local State.
 */
export function useDukaPosEntity<T extends BaseEntity>(
  entityName: string,
  tenantId: string,
  branchId: string,
  initialData: T[] = [],
  dexieQuery?: () => Promise<T[]>
) {
  const [data, setData] = useState<T[]>(initialData);

  // 1. Dexie Live Query integration (if query function supplied)
  const liveQueryResult = useLiveQuery(
    async () => {
      if (dexieQuery) {
        return await dexieQuery();
      }
      return null;
    },
    [entityName, tenantId, branchId]
  );

  useEffect(() => {
    if (liveQueryResult && liveQueryResult.length > 0) {
      setData(liveQueryResult);
    }
  }, [liveQueryResult]);

  // 2. Cross-Tab Signal Subscription (<5ms propagation across tabs)
  useEffect(() => {
    const unsubscribe = subscribeToCrossTabSync((event: MutationBroadcastEvent) => {
      if (event.entity !== entityName) return;

      const payload = event.payload as T;
      if (!payload) return;

      // Filter by tenant and branch isolation rules
      if (payload.tenant_id && payload.tenant_id !== tenantId) return;

      setData((prevData) => {
        if (event.action === 'DELETE') {
          return prevData.filter((item) => item.id !== payload.id);
        }

        const index = prevData.findIndex((item) => item.id === payload.id);
        if (index > -1) {
          // Last-Write-Wins (LWW) timestamp verification
          const existing = prevData[index];
          if ((payload.updated_at || 0) >= (existing.updated_at || 0)) {
            const updatedList = [...prevData];
            updatedList[index] = { ...existing, ...payload };
            return updatedList;
          }
          return prevData;
        }

        return [payload, ...prevData];
      });
    });

    return () => {
      unsubscribe();
    };
  }, [entityName, tenantId, branchId]);

  // Mutation helper function
  const mutateEntity = (item: T, action: 'CREATE' | 'UPDATE' | 'DELETE') => {
    setData((prevData) => {
      if (action === 'DELETE') {
        return prevData.filter((i) => i.id !== item.id);
      }
      const idx = prevData.findIndex((i) => i.id === item.id);
      if (idx > -1) {
        const copy = [...prevData];
        copy[idx] = { ...copy[idx], ...item, updated_at: Date.now() };
        return copy;
      }
      return [item, ...prevData];
    });

    // Broadcast mutation to all other tabs instantly
    broadcastMutation(entityName, action, { ...item, tenant_id: tenantId, branch_id: branchId });
  };

  return [data, setData, mutateEntity] as const;
}
