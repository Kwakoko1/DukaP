# KwakoPos SaaS Changelog

## [1.3.3] - 2026-08-18

### 🐛 Bug Fixes
- fix(release-metadata): unify versioning to v1.3.1 and update branding to KwakoPos SaaS (77e6a87) - @Kwakoko


## [1.3.2] - 2026-08-18

### 📦 Maintenance & Other Changes
- docs(rules): update core architecture, data sync pillars, deployment oversight, and production standards to KwakoPos (0baae58) - @Kwakoko


## [1.3.1] - 2026-08-18

### 🐛 Bug Fixes
- fix(production-sync): atomic catalog + inventory synchronization and production certification (1def33d) - @Kwakoko


## [1.3.0] - 2026-08-18

### 🚀 New Features
- feat(release): KwakoPos Production Certification Gate v2 - Passed 6 Quality Gates, RLS Isolation, TS Fixes & Certified Release Candidate (8d667e9) - @Kwakoko
- feat(release): Implement KwakoPos Production Release Certification Gate v2 (Fail-Closed CI/CD, GET /api/version, Immutable Image Digests, Build-Once Provenance, and Release Finalizer) (715b041) - @Kwakoko
- feat(release): KwakoPos Release Candidate Validation & Production Certification Gate Pipeline with PWA Installation Progress UI (4342079) - @Kwakoko
- feat(hardening): KwakoPos Hardening & Certification v2 - Real browser & architectural static guard validation (559a0d6) - @Kwakoko
- feat: implement real Playwright E2E browser tests and production certification suite (4591db5) - @Kwakoko
- feat(reliability): implement complete production runtime validation and reliability certification suite (75df92c) - @Kwakoko
- feat(consistency): implement derivedProjectionRepository and atomic delta-checkpoint transaction (3450e0f) - @Kwakoko
- feat(integrity): implement content-based deterministic SHA-256 replica checksum (82959a3) - @Kwakoko
- feat(reliability): enforce production reliability spec, CI gate & implementation matrix (e4adf86) - @Kwakoko
- feat(reliability): enterprise production hardening, replica management & zero-data-loss verification (ba9909c) - @Kwakoko
- feat(data-reliability): establish canonical repository layer, atomic outbox persistence, delta sync repositories, and regression tests (5d5ec46) - @Kwakoko
- feat(persistence): implement production-grade PWA upgrade data persistence, Web-Lock migration engine, startup data integrity manager, and bootstrap recovery (d7fc878) - @Kwakoko
- feat(pwa): add persistent storage locking and automatic brand/category reconciliation across PWA upgrades (7ce49ba) - @Kwakoko
- feat(ui): add peek-behind transparency mode and reset-to-center button to draggable Dialog (0897fa7) - @Kwakoko
- feat(core): refine inventory, POS sync, reports and Dexie schema integrations (cca126f) - @Kwakoko
- feat(arch): integrate HLC sync headers, session vault key derivation, and reactive ABAC evaluation (9e365e0) - @Kwakoko
- feat(arch): implement 5-pillar enterprise offline-first multi-tenant architecture with HLC, CRDT, ABAC, WebCrypto Vault, and Sync Telemetry HUD (4eece0b) - @Kwakoko
- feat(security): add configurable offline grace period options (24h, 36h, 72h) for owners and managers (92ad614) - @Kwakoko
- feat(auth): implement production-grade hybrid online/offline session management system (7d012d8) - @Kwakoko
- feat(security): enhance authentication pipeline with direct cloud login endpoint, seed script, and secret manager configuration (a6e3158) - @Kwakoko
- feat(cpanel): format user IDs using Business Name and render all date/timestamp fields in DD/MM/YYYY format (b8be4ad) - @Kwakoko
- feat(onboarding): capture preferred username during tenant onboarding across merchant wizard and super admin cpanel (290ea76) - @Kwakoko

### 🐛 Bug Fixes
- fix(quality): Resolve architectural, type safety, and data integrity issues (65a5bb6) - @Kwakoko
- fix(ci): Remove all  (230e4af) - @
- fix(pwa): Clean up unused imports and state spreading in PWA update service (7aa660a) - @Kwakoko
- fix(sync-hud): bind dynamic versionMetadata, enable true two-way sync probe and prohibit simulated runtime validation tests (168aa7a) - @Kwakoko
- fix(build): remove unused LocalDataSnapshot imports to resolve tsc -b strict compiler errors in cloud build pipeline (df310cc) - @Kwakoko
- fix(ui): upgrade Dialog modal window drag-and-drop using HTML5 Pointer Events, setPointerCapture, and touch-none for smooth modal dragging (b4e92d2) - @Kwakoko
- fix(brands): complete brand module wiring to inventory toolbar, POS search, reports, and fix instant brand disappearance on creation (82b82d4) - @Kwakoko
- fix(sync): fully synchronize isOnline, isSyncing, and outboxCount between TopBar and SyncTelemetryHUD (3b431c4) - @Kwakoko
- fix(server): safely extract tenantId in PATCH tenant modules endpoint (8ac98d3) - @Kwakoko
- fix(sync): unify TopBar, SyncContext and SyncTelemetryHUD reactive network and queue state (82f07de) - @Kwakoko
- fix(ui): mount SyncTelemetryHUD globally and ensure visibility on all authenticated screens (c362193) - @Kwakoko
- fix(server): resolve duplicate JWT_SECRET declarations and syntax in server.js (30576cd) - @Kwakoko
- fix(catalog): auto-reconcile product brands and resolve brand disappearance in CatalogManager (7919261) - @Kwakoko
- fix(inventory): preserve parent product variant flag, auto-load variants in editor, and refine dashboard stats (f22c86b) - @Kwakoko
- fix(auth): ensure valid business workspace auto-healing and seamless login hydration (680b886) - @Kwakoko
- fix(users-roles): correctly render Super Admin role badge instead of defaulting to Cashier (b9ce90d) - @Kwakoko
- fix(cpanel): enforce Business Name in id column across users and tenants tables (084a726) - @Kwakoko
- fix(db): ensure production cloud host connects to live Neon PostgreSQL cluster and prevents local fallback ECONNREFUSED (1dc269b) - @Kwakoko
- fix(users-roles): restrict Platform Central HQ strictly to Super Admins and resolve regional/district location for tenant owners and staff (a1797d9) - @Kwakoko

### ⚡ Performance Improvements
- perf(persistence): optimize outbox queries with compound indexes and bulk transaction batching (3631cce) - @Kwakoko
- perf(persistence): optimize table count queries using concurrent Promise.all execution in migration and integrity engines (578f88a) - @Kwakoko
- perf(auth): optimize multi-tenant login with parallel query execution and complete transactional cache rehydration (a600810) - @Kwakoko
- perf(core): optimize connection pooling, add rate limiting, security headers, and granular vendor chunking (af444e3) - @Kwakoko

### 🛠️ Refactoring & Architectural Updates
- refactor(data-persistence): integrate data persistence test suite into readiness verifier & optimize batch atomic mutations (ab0e461) - @Kwakoko

### 📦 Maintenance & Other Changes
- docs: add KwakoPos Production Data Reliability & Distributed Consistency Engineering Specification (5220cee) - @Kwakoko
- style(ui): add visual drag grip indicator to Dialog component header (86332ca) - @Kwakoko
- style(ui): optimize SyncTelemetryHUD bottom offset for mobile & desktop navigation (3c4b2e6) - @Kwakoko
- chore(build): adopt optimized vite configuration with clean api proxy and dynamic build metadata (1c4c88f) - @Kwakoko


## [1.2.0] - 2026-08-11

### 🚀 New Features
- feat(offline-sync): implement 5 Strategic Pillars — SW BackgroundSync, DLQ Remediation Console, Delta Compression, Storage Quota Pruner, and BroadcastChannel Realtime Push (e232c06) - @Kwakoko
- feat(core): Enterprise production architecture upgrade across Inventory, Categories, POS, Reports, Expenses, CashDrawer, and SuperAdmin Tenant Management (9184301) - @Kwakoko
- feat(ux): production-grade UX optimization - Toast system, Skeleton loaders, EmptyState, Dialog upgrades, page transitions, replace all alert/confirm (a2a08a6) - @Kwakoko
- feat: enforce production-grade quality rules & optimize system control tools (f3ff89b) - @Kwakoko
- feat(cleanup): implement production-ready Tenant Store Cleanup Tools with 2s hold UX and PostgreSQL sync (ecdfade) - @Kwakoko
- feat(sync): implement Production-Grade Fast Bootstrap & Synchronization Engine (26389c5) - @Kwakoko
- feat(dev): wire Vite dev server proxy to local PostgreSQL backend server (d419e75) - @Kwakoko
- feat(database): implement local PostgreSQL connection engine, setup script, and health probes (c0bfc19) - @Kwakoko
- feat(inventory): add /api/sync/categories and /api/sync/brands version endpoints (4ea01fc) - @Kwakoko
- feat(inventory): implement production-grade Categories & Brands Persistence Engine (892a8b2) - @Kwakoko
- feat(navigation): persist active tab and active module in localStorage across page reloads (4962c6f) - @Kwakoko
- feat(inventory): allow both Archive and Permanent Delete modes with dependency scanner stats in Deletion Engine (256db43) - @Kwakoko
- feat(inventory): add single variant deletion engine with stock recalculation and backend sync (79e0012) - @Kwakoko
- feat(inventory): implement production-grade transactional product deletion engine with sales history detection and multi-device sync (4445a47) - @Kwakoko
- feat(inventory): refine product module with variant-first architecture, dedicated UI tabs, search/filter & bulk operations (f85b5a9) - @Kwakoko
- feat(neon): auto-initialize Neon PostgreSQL schema, complete server.js API handlers, and optimize background pings (cf87caa) - @Kwakoko
- feat(products): Variant-First Architecture refinements - 10-tab editor, bulk ops, role-based deletion, KPI summary, images gallery, suppliers tab (f8bc32e) - @Kwakoko
- feat(inventory): Replace native browser spin arrows with custom - / + stepper controls for Stock Adjustment quantity input (2730763) - @Kwakoko
- feat(stock-sync): Fully wire Transactional Outbox into recordStockMovement and initialize background offlineSyncWorker in App.tsx (e176181) - @Kwakoko
- feat(stock-sync): Implement Enterprise Production-Grade Event-Driven Stock Sync Engine with Hexagonal Architecture, Transactional Outbox, Materialized Snapshots & Drift Diagnostics (d1699cf) - @Kwakoko
- feat(stock-sync-engine): Integrate Stock Sync Engine into top tabs, add real-time telemetry diagnostics and manual event flushing (27e854c) - @Kwakoko
- feat(tenant-management): Add explicit Action button bar to Hierarchy View node cards in Super Admin (09ab14a) - @Kwakoko
- feat(sidebar): Refine Receipts icon and add sub-items with actions for Receipts sub-menu (0cb299c) - @Kwakoko
- feat(receipts): Production-Grade Receipt Management Engine & UI Module (9330814) - @Kwakoko
- feat: mobile/tablet UI, logout fix, dev tenant isolation, production-grade footer (cb0ba8d) - @Kwakoko
- feat: Firebase App Hosting backend integration with Neon PostgreSQL database (8a65061) - @Kwakoko
- feat: production-grade multi-browser sync engine with incremental master sync, device registration, and sync control dashboard (806e89e) - @Kwakoko

### 🐛 Bug Fixes
- fix(layout): unify version footer into a single full-bleed end-to-end status bar across the bottom of the viewport (3054f19) - @Kwakoko
- fix(layout): render AppVersionFooter inside main application views and desktop sidebar so version metadata is visible across all screens (8ef8ace) - @Kwakoko
- fix(mobile-layout): expand BottomNav active tab mappings across all 27+ sub-modules, add safe-area insets, and add SemVer engine research report (552db89) - @Kwakoko
- fix(receipts): eliminate receipt duplication and cancellation resurrection via DB collision checks, sync queue event enqueues, order status alignment, and UI deduplication (862b740) - @Kwakoko
- fix(users-roles): add email tombstoning and multi-layer cloud cleanup to individual employee deletion (d76101d) - @Kwakoko
- fix(tenant-lifecycle): enforce cascading employee deletion on tenant purge, persistent email tombstones, and clear tombstones on re-registration (d053d67) - @Kwakoko
- fix(auth): block deleted tenants and deleted users from logging in or restoring sessions (c97d229) - @Kwakoko
- fix(tenant-management): fix tenant resurrection from dead after purge by persisting deleted tombstone set and guarding session auto-sync (7b7a4b3) - @Kwakoko
- fix(super-admin): add Super Admin Logout button, fix sidebar layout width, filter deleted tenant users, and separate platform staff from tenant users (58d78e9) - @Kwakoko
- fix(super-admin): decouple SuperAdmin CPanel completely from tenant topNav and sidebar scaffolding (35a64fe) - @Kwakoko
- fix(super-admin): resolve tenant deletion UI refresh and in-memory filter state (9b233fb) - @Kwakoko
- fix(tenant-management): capture online-registered tenants from PostgreSQL (93ccc17) - @Kwakoko
- fix(dashboard): remove stale ternary tags hiding KPI cards and charts (adf273e) - @Kwakoko
- fix(persistence): use live HTTP server response in Supabase client SELECT queries (b3afaba) - @Kwakoko
- fix(persistence): fix Permanent Server Persistence Test with direct cloud write await and ID filtering (226df2b) - @Kwakoko
- fix(sync): resolve TypeScript parameter type and lint check (6e5e5e1) - @Kwakoko
- fix(vite): fix bracket scope in vite.config.ts (32a95ff) - @Kwakoko
- fix(vite): resolve syntax formatting in vite.config.ts proxy handler (061cf41) - @Kwakoko
- fix(inventory): restore resolvedSellingPrice in mapProductToLocal (104a6b7) - @Kwakoko
- fix(inventory): fix stock string concatenation bug and add automatic database stock reconciliation (bd35bb3) - @Kwakoko
- fix(ui): guarantee desktop TopBar controls render unconditionally on desktop views (45c1dff) - @Kwakoko
- fix(ui): ensure desktop TopBar controls work properly with correct types and signatures (0bb643f) - @Kwakoko
- fix(ui): preserve desktop TopBar controls while keeping mobile TopBar streamlined (e0057f7) - @Kwakoko
- fix(ui): remove unused imports in TopBar.tsx and ensure clean build (f0aab9d) - @Kwakoko
- fix(ui): clean up unused modal code in TopBar.tsx (c5481a7) - @Kwakoko
- fix(ui): remove unused TopBar variables and fix tenant logo property access (d1464d6) - @Kwakoko
- fix(ui): refine mobile layout, topbar, 2-3 col POS product grid, and non-overlapping floating cart (777050d) - @Kwakoko
- fix(inventory): resolve brand tenant_id loss during sync push and add REST API pull to syncFromCloudOnLogin (96dd7df) - @Kwakoko
- fix(inventory): ensure boolean return type for filter in createCategory and createBrand (91bec99) - @Kwakoko
- fix(inventory): resolve missing brands ingestion in useSync and add auto-seeding to product creation (046e1ad) - @Kwakoko
- fix(inventory): add tenant ID resolution fallback to prevent categories and brands loss across logouts (7ac4046) - @Kwakoko
- fix(inventory): ensure categories and brands sync to cloud and auto-reconcile across login/logout (631f928) - @Kwakoko
- fix(inventory): resolve duplicate handleDeleteVariant and finalize Production-Grade Deletion Engine (d1cec28) - @Kwakoko
- fix(inventory): resolve TS comparison in checkSalesHistory (3f6bff6) - @Kwakoko
- fix(inventory): resolve build error by importing Truck and cleaning state variables (cb87a36) - @Kwakoko
- fix(inventory): resolve variant disappearance, buying price loss, false variants & logout stock loss (5fa520f) - @Kwakoko
- fix(receipts): Wire all Receipts sidebar sub-items (History, Templates, Analytics, Verification, Archive) to active tab routing (912fdf0) - @Kwakoko
- fix(layout): Refine top-left mobile hamburger menu button for mobile sidebar navigation access (9ddc2e7) - @Kwakoko
- fix(stock-sync): Purge orphan stock balances and variants during stock ledger rebuild and filter live variant queries to active products (5ea28a6) - @Kwakoko
- fix(layout): Refine login page full-bleed footer strip for login page view specifically (4918094) - @Kwakoko
- fix(layout): Restore A B C D avatars and 2,400+ businesses social proof to left sidebar column in AuthGateway.tsx (5fa6a6d) - @Kwakoko
- fix(layout): Remove ABCD avatars and social proof text from footer, leaving clean centered copyright and version metadata (3517b29) - @Kwakoko
- fix(layout): Refine mobile footer and landing page footer to extend end-to-end full width with production styling (432f158) - @Kwakoko
- fix(sync): Persist online/offline mode to localStorage so app defaults to Online on startup (ec105a8) - @Kwakoko
- fix(tenant-sync, mobile-layout): Auto-sync local dev currentTenant into Tenant Management and convert mobile footer to floating glassmorphic dock (0d1632c) - @Kwakoko
- fix(vite): dedupe React & dexie-react-hooks in vendor bundle to prevent resolveDispatcher runtime error (c241d03) - @Kwakoko
- fix: stale stock alerts after product deletion + suppliers not persisting after refresh (4479e82) - @Kwakoko
- fix: resolve Firebase App Hosting build failures caused by missing cloud_db.json (ec5d41a) - @Kwakoko
- fix: remove Quick Super Admin sign-in shortcut button from login screen (c58a6be) - @Kwakoko
- fix: comprehensive safeGet sweep across POS and inventory background engines (766690d) - @Kwakoko
- fix: resolve Dexie TypeError Invalid argument to table.get with safeGet key validator (54a8bd8) - @Kwakoko
- fix: permit pre-auth SELECT on cloud_users and user tables to enable cross-browser & clean cache logins (7e957a9) - @Kwakoko
- fix: resolve blank white screen after login with global ErrorBoundary and null-safe tenant context hooks (05d91a9) - @Kwakoko
- fix: automatic client master cloud database hydration and fail-safe static host API fallbacks (ebc86e0) - @Kwakoko
- fix: comprehensive multi-device identifier resolution for email, username, phone, and user code (60541e9) - @Kwakoko
- fix: multi-device authentication and cloud user resolution with query parameter propagation and table mapping (e25cba1) - @Kwakoko
- fix: auto-generate missing SKUs and set SKU input fields to read-only (774b137) - @Kwakoko
- fix: workflow configuration & database updates (ea4ff15) - @Kwakoko
- fix: varaints (e36638f) - @Kwakoko

### ⚡ Performance Improvements
- perf(sync-engine): unify multi-queue offline sync worker, add DeadLetter circuit breaker, and wrap incremental ingestion in Dexie transactions (b19e3d9) - @Kwakoko
- perf(bootstrap): optimize Bootstrap Engine with ETag 304 re-validation and parallel Dexie writes (beb56ed) - @Kwakoko

### 🛠️ Refactoring & Architectural Updates
- refactor: production-grade inventory, tenant dashboard & zero-demo data engine cleanup (60c1986) - @Kwakoko
- refactor(sidebar): Consolidate Suppliers and Purchasing into unified Purchasing module with sub-items (03f8a32) - @Kwakoko

### 📦 Maintenance & Other Changes
- chore(release): bump version to v1.1.0 with automated SemVer changelog generation (c2e8c09) - @Kwakoko
- test(persistence): verify 10-test Production Persistence Suite wiring and schema migrations (664ab46) - @Kwakoko
- style(inventory): fit all 10 product editor tabs in a single row without horizontal scrolling (54f4122) - @Kwakoko
- style: upgrade offline alert banner to sleek executive dark obsidian status bar (8aee3a5) - @Kwakoko
- style: refine simulation labels to production-grade network status controls (dcb6d83) - @Kwakoko
- Fix:variants (dc36d0d) - @Kwakoko


## [1.1.0] - 2026-08-10

### 🚀 New Features
- feat(offline-sync): implement 5 Strategic Pillars — SW BackgroundSync, DLQ Remediation Console, Delta Compression, Storage Quota Pruner, and BroadcastChannel Realtime Push (e232c06) - @Kwakoko
- feat(core): Enterprise production architecture upgrade across Inventory, Categories, POS, Reports, Expenses, CashDrawer, and SuperAdmin Tenant Management (9184301) - @Kwakoko
- feat(ux): production-grade UX optimization - Toast system, Skeleton loaders, EmptyState, Dialog upgrades, page transitions, replace all alert/confirm (a2a08a6) - @Kwakoko
- feat: enforce production-grade quality rules & optimize system control tools (f3ff89b) - @Kwakoko
- feat(cleanup): implement production-ready Tenant Store Cleanup Tools with 2s hold UX and PostgreSQL sync (ecdfade) - @Kwakoko
- feat(sync): implement Production-Grade Fast Bootstrap & Synchronization Engine (26389c5) - @Kwakoko
- feat(dev): wire Vite dev server proxy to local PostgreSQL backend server (d419e75) - @Kwakoko
- feat(database): implement local PostgreSQL connection engine, setup script, and health probes (c0bfc19) - @Kwakoko
- feat(inventory): add /api/sync/categories and /api/sync/brands version endpoints (4ea01fc) - @Kwakoko
- feat(inventory): implement production-grade Categories & Brands Persistence Engine (892a8b2) - @Kwakoko
- feat(navigation): persist active tab and active module in localStorage across page reloads (4962c6f) - @Kwakoko
- feat(inventory): allow both Archive and Permanent Delete modes with dependency scanner stats in Deletion Engine (256db43) - @Kwakoko
- feat(inventory): add single variant deletion engine with stock recalculation and backend sync (79e0012) - @Kwakoko
- feat(inventory): implement production-grade transactional product deletion engine with sales history detection and multi-device sync (4445a47) - @Kwakoko
- feat(inventory): refine product module with variant-first architecture, dedicated UI tabs, search/filter & bulk operations (f85b5a9) - @Kwakoko
- feat(neon): auto-initialize Neon PostgreSQL schema, complete server.js API handlers, and optimize background pings (cf87caa) - @Kwakoko
- feat(products): Variant-First Architecture refinements - 10-tab editor, bulk ops, role-based deletion, KPI summary, images gallery, suppliers tab (f8bc32e) - @Kwakoko
- feat(inventory): Replace native browser spin arrows with custom - / + stepper controls for Stock Adjustment quantity input (2730763) - @Kwakoko
- feat(stock-sync): Fully wire Transactional Outbox into recordStockMovement and initialize background offlineSyncWorker in App.tsx (e176181) - @Kwakoko
- feat(stock-sync): Implement Enterprise Production-Grade Event-Driven Stock Sync Engine with Hexagonal Architecture, Transactional Outbox, Materialized Snapshots & Drift Diagnostics (d1699cf) - @Kwakoko
- feat(stock-sync-engine): Integrate Stock Sync Engine into top tabs, add real-time telemetry diagnostics and manual event flushing (27e854c) - @Kwakoko
- feat(tenant-management): Add explicit Action button bar to Hierarchy View node cards in Super Admin (09ab14a) - @Kwakoko
- feat(sidebar): Refine Receipts icon and add sub-items with actions for Receipts sub-menu (0cb299c) - @Kwakoko
- feat(receipts): Production-Grade Receipt Management Engine & UI Module (9330814) - @Kwakoko
- feat: mobile/tablet UI, logout fix, dev tenant isolation, production-grade footer (cb0ba8d) - @Kwakoko
- feat: Firebase App Hosting backend integration with Neon PostgreSQL database (8a65061) - @Kwakoko
- feat: production-grade multi-browser sync engine with incremental master sync, device registration, and sync control dashboard (806e89e) - @Kwakoko

### 🐛 Bug Fixes
- fix(mobile-layout): expand BottomNav active tab mappings across all 27+ sub-modules, add safe-area insets, and add SemVer engine research report (552db89) - @Kwakoko
- fix(receipts): eliminate receipt duplication and cancellation resurrection via DB collision checks, sync queue event enqueues, order status alignment, and UI deduplication (862b740) - @Kwakoko
- fix(users-roles): add email tombstoning and multi-layer cloud cleanup to individual employee deletion (d76101d) - @Kwakoko
- fix(tenant-lifecycle): enforce cascading employee deletion on tenant purge, persistent email tombstones, and clear tombstones on re-registration (d053d67) - @Kwakoko
- fix(auth): block deleted tenants and deleted users from logging in or restoring sessions (c97d229) - @Kwakoko
- fix(tenant-management): fix tenant resurrection from dead after purge by persisting deleted tombstone set and guarding session auto-sync (7b7a4b3) - @Kwakoko
- fix(super-admin): add Super Admin Logout button, fix sidebar layout width, filter deleted tenant users, and separate platform staff from tenant users (58d78e9) - @Kwakoko
- fix(super-admin): decouple SuperAdmin CPanel completely from tenant topNav and sidebar scaffolding (35a64fe) - @Kwakoko
- fix(super-admin): resolve tenant deletion UI refresh and in-memory filter state (9b233fb) - @Kwakoko
- fix(tenant-management): capture online-registered tenants from PostgreSQL (93ccc17) - @Kwakoko
- fix(dashboard): remove stale ternary tags hiding KPI cards and charts (adf273e) - @Kwakoko
- fix(persistence): use live HTTP server response in Supabase client SELECT queries (b3afaba) - @Kwakoko
- fix(persistence): fix Permanent Server Persistence Test with direct cloud write await and ID filtering (226df2b) - @Kwakoko
- fix(sync): resolve TypeScript parameter type and lint check (6e5e5e1) - @Kwakoko
- fix(vite): fix bracket scope in vite.config.ts (32a95ff) - @Kwakoko
- fix(vite): resolve syntax formatting in vite.config.ts proxy handler (061cf41) - @Kwakoko
- fix(inventory): restore resolvedSellingPrice in mapProductToLocal (104a6b7) - @Kwakoko
- fix(inventory): fix stock string concatenation bug and add automatic database stock reconciliation (bd35bb3) - @Kwakoko
- fix(ui): guarantee desktop TopBar controls render unconditionally on desktop views (45c1dff) - @Kwakoko
- fix(ui): ensure desktop TopBar controls work properly with correct types and signatures (0bb643f) - @Kwakoko
- fix(ui): preserve desktop TopBar controls while keeping mobile TopBar streamlined (e0057f7) - @Kwakoko
- fix(ui): remove unused imports in TopBar.tsx and ensure clean build (f0aab9d) - @Kwakoko
- fix(ui): clean up unused modal code in TopBar.tsx (c5481a7) - @Kwakoko
- fix(ui): remove unused TopBar variables and fix tenant logo property access (d1464d6) - @Kwakoko
- fix(ui): refine mobile layout, topbar, 2-3 col POS product grid, and non-overlapping floating cart (777050d) - @Kwakoko
- fix(inventory): resolve brand tenant_id loss during sync push and add REST API pull to syncFromCloudOnLogin (96dd7df) - @Kwakoko
- fix(inventory): ensure boolean return type for filter in createCategory and createBrand (91bec99) - @Kwakoko
- fix(inventory): resolve missing brands ingestion in useSync and add auto-seeding to product creation (046e1ad) - @Kwakoko
- fix(inventory): add tenant ID resolution fallback to prevent categories and brands loss across logouts (7ac4046) - @Kwakoko
- fix(inventory): ensure categories and brands sync to cloud and auto-reconcile across login/logout (631f928) - @Kwakoko
- fix(inventory): resolve duplicate handleDeleteVariant and finalize Production-Grade Deletion Engine (d1cec28) - @Kwakoko
- fix(inventory): resolve TS comparison in checkSalesHistory (3f6bff6) - @Kwakoko
- fix(inventory): resolve build error by importing Truck and cleaning state variables (cb87a36) - @Kwakoko
- fix(inventory): resolve variant disappearance, buying price loss, false variants & logout stock loss (5fa520f) - @Kwakoko
- fix(receipts): Wire all Receipts sidebar sub-items (History, Templates, Analytics, Verification, Archive) to active tab routing (912fdf0) - @Kwakoko
- fix(layout): Refine top-left mobile hamburger menu button for mobile sidebar navigation access (9ddc2e7) - @Kwakoko
- fix(stock-sync): Purge orphan stock balances and variants during stock ledger rebuild and filter live variant queries to active products (5ea28a6) - @Kwakoko
- fix(layout): Refine login page full-bleed footer strip for login page view specifically (4918094) - @Kwakoko
- fix(layout): Restore A B C D avatars and 2,400+ businesses social proof to left sidebar column in AuthGateway.tsx (5fa6a6d) - @Kwakoko
- fix(layout): Remove ABCD avatars and social proof text from footer, leaving clean centered copyright and version metadata (3517b29) - @Kwakoko
- fix(layout): Refine mobile footer and landing page footer to extend end-to-end full width with production styling (432f158) - @Kwakoko
- fix(sync): Persist online/offline mode to localStorage so app defaults to Online on startup (ec105a8) - @Kwakoko
- fix(tenant-sync, mobile-layout): Auto-sync local dev currentTenant into Tenant Management and convert mobile footer to floating glassmorphic dock (0d1632c) - @Kwakoko
- fix(vite): dedupe React & dexie-react-hooks in vendor bundle to prevent resolveDispatcher runtime error (c241d03) - @Kwakoko
- fix: stale stock alerts after product deletion + suppliers not persisting after refresh (4479e82) - @Kwakoko
- fix: resolve Firebase App Hosting build failures caused by missing cloud_db.json (ec5d41a) - @Kwakoko
- fix: remove Quick Super Admin sign-in shortcut button from login screen (c58a6be) - @Kwakoko
- fix: comprehensive safeGet sweep across POS and inventory background engines (766690d) - @Kwakoko
- fix: resolve Dexie TypeError Invalid argument to table.get with safeGet key validator (54a8bd8) - @Kwakoko
- fix: permit pre-auth SELECT on cloud_users and user tables to enable cross-browser & clean cache logins (7e957a9) - @Kwakoko
- fix: resolve blank white screen after login with global ErrorBoundary and null-safe tenant context hooks (05d91a9) - @Kwakoko
- fix: automatic client master cloud database hydration and fail-safe static host API fallbacks (ebc86e0) - @Kwakoko
- fix: comprehensive multi-device identifier resolution for email, username, phone, and user code (60541e9) - @Kwakoko
- fix: multi-device authentication and cloud user resolution with query parameter propagation and table mapping (e25cba1) - @Kwakoko
- fix: auto-generate missing SKUs and set SKU input fields to read-only (774b137) - @Kwakoko
- fix: workflow configuration & database updates (ea4ff15) - @Kwakoko
- fix: varaints (e36638f) - @Kwakoko

### ⚡ Performance Improvements
- perf(sync-engine): unify multi-queue offline sync worker, add DeadLetter circuit breaker, and wrap incremental ingestion in Dexie transactions (b19e3d9) - @Kwakoko
- perf(bootstrap): optimize Bootstrap Engine with ETag 304 re-validation and parallel Dexie writes (beb56ed) - @Kwakoko

### 🛠️ Refactoring & Architectural Updates
- refactor: production-grade inventory, tenant dashboard & zero-demo data engine cleanup (60c1986) - @Kwakoko
- refactor(sidebar): Consolidate Suppliers and Purchasing into unified Purchasing module with sub-items (03f8a32) - @Kwakoko

### 📦 Maintenance & Other Changes
- test(persistence): verify 10-test Production Persistence Suite wiring and schema migrations (664ab46) - @Kwakoko
- style(inventory): fit all 10 product editor tabs in a single row without horizontal scrolling (54f4122) - @Kwakoko
- style: upgrade offline alert banner to sleek executive dark obsidian status bar (8aee3a5) - @Kwakoko
- style: refine simulation labels to production-grade network status controls (dcb6d83) - @Kwakoko
- Fix:variants (dc36d0d) - @Kwakoko


# KwakoPos SaaS Changelog

## [1.0.1] - 2026-08-02

### 🐛 Bug Fixes
- fix:Parent-Variant Price Inheritance (d5a4513) - @Kwakoko
- fix: resolve AuthContext default fallbacks for localhost and add node server.js for AppHosting container (506ab4e) - @Kwakoko
- fix: add start script and apphosting.yaml for Firebase AppHosting runtime (f7bfde7) - @Kwakoko
- fix: TypeScript build errors for Firebase AppHosting deployment (e5cc735) - @Kwakoko
- fix apphosting deploy (7b442b2) - @Kwakoko

### 📦 Maintenance & Other Changes
- Firebase App Hosting Build Failure Resolution_1 (512a354) - @Kwakoko
- remove: Prefill Demo Portals, Testing RBAC Roles switcher, Super Admin Control Plane banner (22f3838) - @Kwakoko
- oxlint install (43795a4) - @Kwakoko
- initial commit (355de52) - @Kwakoko
- initial commit (e7e70c6) - @Kwakoko


