# 🌐 DukaPOS Enterprise Data Sync & Loss Prevention Pillars

Whenever designing, implementing, modifying, or debugging data sync, offline persistence, multi-tab communication, or deletion logic in DukaPOS, the following **5 Production-Grade Enterprise Data Sync Pillars** MUST be strictly enforced:

---

## 1. 📡 Cross-Tab Real-Time Reactivity (`BroadcastChannel` + Dexie `useLiveQuery`)
- **Instant Synchronization**: Every database mutation (create, update, delete) MUST notify open browser tabs via `BroadcastChannel('dukapos_tab_sync')`.
- **Zero Page Refresh**: All views MUST reactively re-render active states via Dexie `useLiveQuery` without requiring manual F5 page reloads.

---

## 2. 👑 Single-Leader Web Locks Election (`navigator.locks`)
- **Single Sync Worker**: When multiple browser tabs are open, only **1 Single Leader Tab** (elected via `navigator.locks.request('dukapos_sync_leader')`) executes background HTTP push/pull sync loops.
- **Zero Race Conditions**: Non-leader tabs delegate background network requests to the leader tab, preventing stampeding HTTP queries and database lock contention.

---

## 3. 🪦 Persistent Tombstone Storage & LWW Vector Clocks
- **No Hard-Delete Resurrections**: Deleting a record MUST write a persistent tombstone (`is_deleted: true, deletedAt: Date.now()`) and register the record ID / receipt number in persistent tombstone storage (`dukapos_deleted_receipt_numbers`).
- **Conflict Resolution**: Auto-healing engines (`ensureReceiptsForOrders`, `useSync`) MUST verify tombstone registries before re-creating or ingesting records. Persistent tombstones **always win** over older create/update deltas.

---

## 4. 🔑 Deterministic Idempotency Key Pipeline
- **Duplicate Prevention**: Every POS checkout, receipt generation, layby payment, and expense entry MUST generate a deterministic `idempotency_key` (UUID v4) prior to writing to IndexedDB or `syncQueue`.
- **Retry Safety**: Network retries MUST transmit identical idempotency keys to ensure backend APIs process transactions exactly once.

---

## 5. ⚡ Real-Time SSE Delta Stream Ingestion
- **Sub-Second Multi-Device Sync**: Cross-device updates between registers and mobile devices use Server-Sent Events (`/api/sync/stream`) to stream incremental deltas.
- **Order & Receipt Matching**: Orders and receipts MUST be purged together across primary keys, transaction IDs, **and total amount + creation timestamp matching**, ensuring zero ghost orders appear on the Dashboard.
