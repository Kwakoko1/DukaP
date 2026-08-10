# DukaPos SaaS Changelog

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


# DukaPos SaaS Changelog

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


