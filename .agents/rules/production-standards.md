# Production Standards & Quality Assurance Guidelines

> Mandatory rule for all current and future implementations in KwakoPos.

## Core Rules

1. **Production-Grade Only**:
   - Never inject mock demo data, demo seeders, or artificial test fallbacks into production views.
   - All data operations must target local IndexedDB (`db`) or central PostgreSQL (`server.js` / Neon PostgreSQL).

2. **Persistence & Data Integrity**:
   - Every creation, modification, or deletion must persist to local storage (Dexie) and sync to central PostgreSQL via the sync engines (`bootstrapEngine.applyInboundSync`, `productionSyncEngine`, `stockLedgerSyncEngine`, `offlineSyncWorker`).
   - Deletions must emit tombstones (`deleted_at`/`deletedAt`) and broadcast cross-tab events via `BroadcastChannel('kwakopos_tab_sync')`.
   - Parent stocks must always be derived from child variants via `reconcileParentVariantStock`. Orphan variants must be quarantined with warnings (`[VariantIntegrity] Parent temporarily unavailable`), never destructively deleted.

3. **Performance & Memoization**:
   - Array lookups inside render paths must use `useMemo` map caches (`Map<id, Item>`) for O(1) constant-time lookups rather than `.find()` loops over large arrays.
   - Heavy data filtering, KPI calculations, and alert lists must be memoized at component level.

4. **Production Developer & Release Candidate Certification**:
   - System controls (Release Center, Persistence Auditor, Production Readiness, Sync Dashboard) must run real automated diagnostics against live database tables and health probes.
   - Release certification must pass all 6 validation gates in `production-certification-runner.js` (`01_release_manifest_and_artifact`, `02_architecture_guard_audit`, `03_production_preflight_identity`, `04_production_smoke_suite`, `05_rollback_recovery_drill`, `06_production_browser_e2e_playwright`) with deterministic release certificates generated (`kwakopos-release-certificate.json`).
