# 🌐 KwakoPos Enterprise Production Pillars

Whenever designing, implementing, modifying, optimizing, or debugging any aspect of KwakoPos SaaS, the following **8 Production-Grade Enterprise Pillars** MUST be strictly enforced:

---

## 1. 📡 Cross-Tab Real-Time Reactivity (`BroadcastChannel` + Dexie `useLiveQuery`)
- **Instant Synchronization**: Every database mutation (create, update, delete) MUST notify open browser tabs via `BroadcastChannel('kwakopos_tab_sync')` (supporting `dukapos_tab_sync` for legacy channels).
- **Zero Page Refresh**: All views MUST reactively re-render active states via Dexie `useLiveQuery` without requiring manual F5 page reloads.

---

## 2. 👑 Single-Leader Web Locks Election (`navigator.locks`)
- **Single Sync Worker**: When multiple browser tabs are open, only **1 Single Leader Tab** (elected via `navigator.locks.request('kwakopos_sync_leader')`) executes background HTTP push/pull sync loops.
- **Zero Race Conditions**: Non-leader tabs delegate background network requests to the leader tab, preventing stampeding HTTP queries and database lock contention.

---

## 3. 🪦 Persistent Tombstone Storage & LWW Vector Clocks
- **No Hard-Delete Resurrections**: Deleting a record MUST write a persistent tombstone (`deleted_at: Date.now()`) and register record IDs / receipt numbers in persistent tombstone storage (`kwakopos_deleted_receipt_numbers`).
- **Conflict Resolution**: Auto-healing engines (`ensureReceiptsForOrders`, `useSync`) MUST verify tombstone registries before re-creating or ingesting records. Persistent tombstones **always win** over older create/update deltas.

---

## 4. 🔑 Deterministic Idempotency Key & Immutable Stock Ledger Pipeline
- **Duplicate Prevention**: Every POS checkout, receipt generation, layby payment, stock adjustment, and expense entry MUST generate a deterministic `idempotency_key` (UUID v4) prior to writing to IndexedDB or `syncQueue`.
- **Retry Safety**: Network retries MUST transmit identical idempotency keys to ensure backend APIs process transactions exactly once via `recordEventIdempotent`.

---

## 5. 🔄 Canonical Inbound Pipeline & Atomic Reconciliation (`applyInboundSync`)
- **Atomic Dexie Commit**: All inbound synchronization (bootstrap restore & delta updates for categories, brands, products, productVariants, stockLedger) executes within a single Dexie transaction inside `bootstrapEngine.applyInboundSync`.
- **Watermark Guarantee**: `lastSyncVersion` watermark is updated inside the transaction block as the final step.
- **Derived Parent Stock Invariant**: Parent product stock is strictly derived from child variants (`derivedProjectionRepository.reconcileParentVariantStock`).
- **Variant Quarantine**: Missing parent items for variants trigger non-destructive quarantine warnings (`[VariantIntegrity] Parent temporarily unavailable`), preventing destructive variant deletions on client replicas.

---

## 6. ⚡ Real-Time Incremental Delta Stream & PostgreSQL Synchronization
- **Sub-Second Multi-Device Sync**: Cross-device updates between registers and mobile devices use Server-Sent Events (`/api/sync/stream`) and master incremental sync (`/api/sync/pull`, `/api/sync/delta`).
- **PostgreSQL Table Mapping**: Master backend in `server.js` maps order records cleanly to the `sales` table, stock ledger to `stock_ledger`, and product variants to `product_variants`.

---

## 7. 📚 Role-Based Manual Generation & Access Control (`HelpManualConsole`)
- **Role Security Guard**: Every manual topic in `helpManualService.ts` MUST be gated by role via `getAccessibleManualTopics(role)`.
- **Strict Role Hierarchy**:
  - `Cashier` → CASHIER topics only (`pos_counter_sale`, `cash_drawer_shifts`, `receipt_returns`).
  - `Store Manager` → CASHIER + MANAGER topics (`inventory_stock_intake`, `shift_audits`).
  - `Financial Accountant` → CASHIER + FINANCE topics (`tax_vat_reporting`, `expenses_tracking`).
  - `Lawyer` → CASHIER + LAWYER topics (`law_firm_matters`, `lawyer_time_retainers`).
  - `Business Owner / Tenant Admin` → ALL tenant topics.
  - `Super Admin` → ALL topics including SUPER_ADMIN (`super_admin_cpanel_ops`).
- **Auto-Update Rule**: Whenever a new module, feature, or workflow is implemented in KwakoPos, corresponding manual topics MUST be added to `helpManualService.ts`.

---

## 8. 🚀 Continuous Cloud Run & Firebase App Hosting Deployment Oversight Engine
Whenever changes are pushed to `origin/main` or Firebase App Hosting builds are triggered, the system and agent MUST oversee the cloud deployment lifecycle:

- **Automated Build & Health Monitoring**: Monitor Cloud Run revision statuses and container startup probes (`kwakopos` / `dkp` service under `kwakopos-62425` / Firebase App Hosting).
- **Failure Telemetry Extraction**: On any deployment build or startup container failure, retrieve exact log output using `gcloud logging read`.
- **Diagnostic Root Cause Analysis**: Trace full stack traces (e.g., Node ESM compiler errors, port binding mismatches, unhandled syntax errors, missing dependencies).
- **Surgical Codebase Remediation**: Apply clean code fixes directly, verify locally via `npm run build`, and push the fix commit immediately to `origin/main` to trigger clean automated re-deployment.
- **Zero Unresolved Container Crashes**: Every deployment push MUST be monitored until Cloud Run revision readiness achieves `Ready: True`.
