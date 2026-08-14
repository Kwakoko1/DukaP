# 🌐 DukaPOS Enterprise Production Pillars

Whenever designing, implementing, modifying, optimizing, or debugging any aspect of DukaPOS SaaS, the following **6 Production-Grade Enterprise Pillars** MUST be strictly enforced:

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

---

## 6. 📚 Role-Based Manual Generation & Access Control (`HelpManualConsole`)

This pillar MUST be automatically enforced on every change, implementation, optimization, or refinement across the entire DukaPOS codebase:

- **Role Security Guard**: Every manual topic in `helpManualService.ts` MUST be gated by role via `getAccessibleManualTopics(role)`. No manual topic may be rendered without role validation.
- **Strict Role Hierarchy**:
  - `Cashier` → CASHIER topics only (`pos_counter_sale`, `cash_drawer_shifts`, `receipt_returns`).
  - `Store Manager` → CASHIER + MANAGER topics (includes `inventory_stock_intake`, `shift_audits`).
  - `Financial Accountant` → CASHIER + FINANCE topics (includes `tax_vat_reporting`, `expenses_tracking`).
  - `Lawyer` → CASHIER + LAWYER topics (includes `law_firm_matters`, `lawyer_time_retainers`).
  - `Business Owner / Tenant Admin` → ALL tenant topics (CASHIER + MANAGER + FINANCE + LAWYER + ADMIN_OWNER).
  - `Super Admin` → ALL topics including SUPER_ADMIN (`super_admin_cpanel_ops`).
- **Auto-Update Rule**: Whenever a new module, feature, workflow, or business-category is implemented in DukaPOS, corresponding manual topics MUST be added to `helpManualService.ts` under the appropriate role tier(s). The `HelpManualConsole` updates automatically via reactive state.
- **Sidebar Access**: `Help & Manuals` sub-item in Settings MUST be visible to ALL authenticated roles (no admin-only gate). The content inside is role-filtered, not the entry point.
- **UI Requirements**: `HelpManualConsole` MUST display: role security badge, topic count per category, step-by-step workflow cards, search/filter, and 1-click print functionality.

---

## 7. 🚀 Continuous Cloud Run & Firebase App Hosting Deployment Oversight Engine
Whenever changes are pushed to `origin/main` or Firebase App Hosting builds are triggered, the system and agent MUST oversee the cloud deployment lifecycle:

- **Automated Build & Health Monitoring**: Monitor Cloud Run revision statuses and container startup probes (`dkp` service under `dukapos-62425` / Firebase App Hosting).
- **Failure Telemetry Extraction**: On any deployment build or startup container failure, immediately retrieve exact log output using:
  ```bash
  gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=dkp AND severity>=ERROR" --project=dukapos-62425 --billing-project=dukapos-62425 --limit=20 --format="json"
  ```
- **Diagnostic Root Cause Analysis**: Trace full stack traces (e.g., Node ESM compiler errors, port binding mismatches, unhandled syntax errors, missing dependencies).
- **Surgical Codebase Remediation**: Apply clean code fixes directly, verify locally via `npm run build`, and push the fix commit immediately to `origin/main` to trigger clean automated re-deployment.
- **Zero Unresolved Container Crashes**: Every deployment push MUST be monitored until Cloud Run revision readiness achieves `Ready: True`.

