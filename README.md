# KwakoPos

**KwakoPos** is an offline-first, multi-tenant SaaS business operating platform built for Point of Sale, inventory, payments, business management, and industry-specific modules.

The platform is designed for environments where connectivity can be intermittent while business operations must continue safely. Local browser storage provides an operational offline replica, while PostgreSQL remains the authoritative source of committed tenant data.

> **Architecture principle:** Offline does not mean local data is the permanent master. PostgreSQL is authoritative; IndexedDB is the local operational replica.

---

## Table of Contents

- [Platform Overview](#platform-overview)
- [Core Technology](#core-technology)
- [Architecture](#architecture)
  - [High-Level Architecture](#high-level-architecture)
  - [Architectural Ownership](#architectural-ownership)
- [Data Ownership Model](#data-ownership-model)
  - [Golden Rule](#golden-rule)
- [Offline-First Persistence](#offline-first-persistence)
  - [Atomic Local Writes](#atomic-local-writes)
- [Canonical Repository Layer](#canonical-repository-layer)
- [Outbox and Synchronization](#outbox-and-synchronization)
  - [Outbox State Machine](#outbox-state-machine)
- [Mutation Envelope](#mutation-envelope)
  - [Idempotency](#idempotency)
- [Delta Sync and Checkpoints](#delta-sync-and-checkpoints)
  - [Two-Way Synchronization](#two-way-synchronization)
- [Replica Integrity and Recovery](#replica-integrity-and-recovery)
  - [Replica Lifecycle](#replica-lifecycle)
  - [Quarantine Rules](#quarantine-rules)
- [Replica Checksums](#replica-checksums)
- [Products, Variants, and Stock Ledger](#products-variants-and-stock-ledger)
  - [Authority](#authority)
  - [Stock Calculation](#stock-calculation)
- [POS Transaction Atomicity](#pos-transaction-atomicity)
- [Deletes and Tombstones](#deletes-and-tombstones)
- [Multi-Tenant and Branch Isolation](#multi-tenant-and-branch-isolation)
  - [Required Scope](#required-scope)
- [Session and Device Security](#session-and-device-security)
- [PWA and Upgrade Safety](#pwa-and-upgrade-safety)
  - [Upgrade Acceptance Test](#upgrade-acceptance-test)
- [Database and Migrations](#database-and-migrations)
  - [Migration Requirements](#migration-requirements)
- [Project Structure](#project-structure)
- [Environment Configuration](#environment-configuration)
  - [Production Secrets](#production-secrets)
- [Local Development](#local-development)
- [Database Commands](#database-commands)
- [Testing and Reliability Certification](#testing-and-reliability-certification)
  - [Core Tests](#core-tests)
  - [Reliability Test Categories](#reliability-test-categories)
- [Real-Browser Certification](#real-browser-certification)
- [CI/CD](#cicd)
- [Production Deployment](#production-deployment)
  - [Production Prerequisites](#production-prerequisites)
  - [Example Container Flow](#example-container-flow)
- [Production Release Strategy](#production-release-strategy)
- [Operational Safety](#operational-safety)
  - [Backups](#backups)
  - [Rollbacks](#rollbacks)
- [Observability](#observability)
- [Security Rules](#security-rules)
- [Development Rules](#development-rules)
- [AI Coding-Agent Rules](#ai-coding-agent-rules)
- [Production Readiness](#production-readiness)
- [Contributing](#contributing)
- [Versioning](#versioning)
- [Reference Documents](#reference-documents)
- [License](#license)

---

## Platform Overview

KwakoPos is composed of:

- A React + TypeScript PWA frontend.
- Dexie/IndexedDB for the browser's local operational replica.
- A Node.js server/API layer.
- PostgreSQL as the authoritative data store.
- A durable local outbox for offline mutations.
- A centralized synchronization engine.
- Replica integrity, checksum, quarantine, and recovery mechanisms.
- Multi-tenant and branch-aware authorization.
- Session/device management.
- Immutable inventory and financial event patterns.
- Industry modules that extend the core business platform.

The architecture is intentionally designed around **data correctness, offline continuity, multi-device convergence, and non-destructive upgrades**.

---

## Core Technology

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript |
| Build | Vite |
| Routing | React Router |
| Local database | IndexedDB via Dexie |
| Server database | PostgreSQL |
| Database driver | `pg` / Neon serverless support |
| Data fetching | TanStack React Query |
| UI | Tailwind CSS + Vanilla CSS |
| Charts | Recharts |
| Icons | Lucide React |
| PDF/printing helpers | jsPDF, html2canvas |
| Barcode/QR scanning | html5-qrcode |
| Motion | Framer Motion |
| Linting | Oxlint |
| Runtime | Node.js |
| Browser Automation | Playwright (Chromium) |
| Hosting target | Google Cloud Run / compatible container platform |
| CI/CD | GitHub Actions |

See `package.json` for the authoritative dependency and command list.

---

# Architecture

## High-Level Architecture

```text
                         ┌──────────────────────────┐
                         │       PostgreSQL         │
                         │  AUTHORITATIVE SOURCE    │
                         │      OF TRUTH            │
                         └────────────┬─────────────┘
                                      │
                            Server Delta / Events
                                      │
                                      ▼
┌────────────────┐          ┌──────────────────────┐
│  KwakoPos UI   │─────────▶│      SyncEngine      │
│ React / PWA    │          │ Sole Sync Authority  │
└───────┬────────┘          └──────────┬───────────┘
        │                              │
        ▼                              ▼
┌────────────────────┐       ┌────────────────────┐
│ Canonical          │       │ Durable Outbox     │
│ Repository Layer   │──────▶│ + Inbox / Retry    │
└─────────┬──────────┘       └────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│                  IndexedDB / Dexie              │
│                                                 │
│ Local Operational Replica                       │
│ Products / Categories / Brands                   │
│ Variants / Customers / Suppliers                 │
│ Sales / Orders / Receipts                        │
│ Stock Projections / Stock Ledger                 │
│ Settings / Sessions / Replica Metadata           │
└─────────────────────────────────────────────────┘
```

## Architectural Ownership

| Component | Responsibility |
|---|---|
| PostgreSQL | Canonical committed business state |
| API/server | Authentication, authorization, validation, transactions and server-side consistency |
| Repository layer | Only supported business-data write gateway |
| IndexedDB/Dexie | Offline operational replica |
| Outbox | Durable pending client mutations |
| Inbox | Durable incoming changes awaiting application |
| SyncEngine | Push, pull, retry, checkpoint and sync coordination |
| ReplicaManager | Local replica lifecycle and recovery |
| ReplicaManifest | Replica version, status, watermarks and checksum metadata |
| Integrity Engine | Checksum verification and fail-closed integrity handling |
| Stock Ledger | Authoritative inventory movement history |
| Migration Engine | Deterministic schema upgrades |

---

# Data Ownership Model

KwakoPos follows one fundamental rule:

> **PostgreSQL is authoritative. IndexedDB is a local replica.**

A successful server commit becomes canonical tenant state.

IndexedDB may contain:

- `PENDING` local mutations
- `PROCESSING` mutations
- locally committed replicas
- derived projections
- cached settings
- sync metadata
- pending offline operations

Local state must never be interpreted as proof that a tenant has no server data.

## Golden Rule

```text
IndexedDB has 0 records
        ≠
Tenant has 0 records
```

When the local replica is empty, the application must determine whether:

1. The authenticated tenant already exists on the server.
2. The local replica is new.
3. A previous replica was lost or invalidated.
4. Pending outbox operations exist.
5. The replica requires recovery.

Never seed a tenant merely because IndexedDB is empty.

---

# Offline-First Persistence

KwakoPos must remain operational during network interruptions.

The intended write flow is:

```text
User Action
   ↓
Domain Service / Repository
   ↓
Atomic IndexedDB Transaction
   ├── Entity Write
   ├── Outbox Mutation
   └── Replica Metadata
   ↓
UI immediately reflects local state
   ↓
SyncEngine sends mutation when connectivity is available
   ↓
PostgreSQL commits
   ↓
Server acknowledgement
   ↓
Outbox becomes SYNCED
```

## Atomic Local Writes

Business writes must be atomic.

For example:

```text
Dexie Transaction
 ├── products.put(product)
 ├── syncQueue.put(mutation)
 └── replicaManifest update
COMMIT
```

If one component fails, the transaction must roll back.

The following state is prohibited:

```text
Entity exists locally
BUT
No outbox mutation exists
```

and:

```text
Outbox mutation exists
BUT
Local entity does not exist
```

---

# Canonical Repository Layer

All business writes must pass through canonical repositories.

Preferred pattern:

```text
UI
 ↓
Domain Service
 ↓
Repository
 ↓
Atomic Local Transaction
 ↓
IndexedDB + Outbox
```

Examples:

```text
productRepository
inventoryRepository
orderRepository
customerRepository
supplierRepository
settingsRepository
```

## Prohibited

React components, pages, dialogs, dashboards, hooks, and UI modules must not directly perform business writes such as:

```ts
db.products.add(...)
db.products.put(...)
db.products.delete(...)
```

Instead:

```ts
await productRepository.create(...)
```

The repository layer is responsible for:

- authorization context
- tenant scope
- branch scope
- validation
- entity persistence
- mutation envelope creation
- outbox persistence
- replica metadata
- transaction boundaries

---

# Outbox and Synchronization

KwakoPos uses a durable outbox for offline mutations.

## Outbox State Machine

```text
PENDING
   │
   ▼
PROCESSING
   │
   ├── success ───────────────▶ SYNCED
   │
   ├── temporary failure ─────▶ FAILED
   │                              │
   │                              └── retry with backoff
   │
   ├── conflict ──────────────▶ CONFLICT
   │
   └── permanent failure ─────▶ DEAD_LETTER
```

The following states are standardized:

```text
PENDING
PROCESSING
SYNCED
FAILED
CONFLICT
DEAD_LETTER
```

Dead-letter records must not silently disappear.

They should preserve enough information to diagnose:

- mutation ID
- operation ID
- tenant
- branch
- device
- entity
- operation
- error
- attempt count
- timestamps
- correlation ID

---

# Mutation Envelope

Mutations should use a common shape:

```ts
interface MutationEnvelope {
  mutationId: string;
  operationId: string;

  tenantId: string;
  branchId?: string;
  deviceId: string;
  userId?: string;

  entity: string;
  entityId: string;

  operation: 'CREATE' | 'UPDATE' | 'DELETE';

  payload: unknown;

  clientVersion?: number;
  serverVersion?: number;

  hlc: string;
  schemaVersion: number;

  createdAt: string | number;

  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
}
```

## Idempotency

The `operationId` must remain stable across retries.

A request sent five times because of:

- network instability
- browser retry
- server timeout
- reconnect
- user retry

must not create five business transactions.

The server must enforce idempotency.

Conceptually:

```text
UNIQUE(tenant_id, operation_id)
```

Duplicate submissions should return the result of the original committed operation.

---

# Delta Sync and Checkpoints

Synchronization uses monotonic server versions/checkpoints.

Correct order:

```text
Fetch Delta
    ↓
Apply Delta in IndexedDB Transaction
    ↓
Transaction COMMIT
    ↓
Advance Checkpoint
```

Never:

```text
Fetch Delta
    ↓
Advance Checkpoint
    ↓
Write Records
```

If the browser crashes before the local transaction commits, the checkpoint must not move forward.

The next sync can therefore safely request the same delta again.

## Two-Way Synchronization

SyncEngine is responsible for both:

```text
Local → Server
```

and:

```text
Server → Local
```

Domain modules must not create competing sync implementations.

---

# Replica Integrity and Recovery

Every local replica maintains replica metadata.

Example:

```ts
interface ReplicaManifest {
  tenantId: string;
  deviceId: string;

  databaseVersion: number;
  schemaVersion: number;
  replicaVersion: number;

  lastServerVersion: number;
  lastAppliedVersion: number;

  lastSuccessfulSyncAt?: string | number;
  lastBootstrapAt?: string | number;

  status:
    | 'NEW'
    | 'INITIALIZING'
    | 'READY'
    | 'SYNCING'
    | 'STALE'
    | 'RECOVERING'
    | 'QUARANTINED';

  checksum?: string;

  createdAt: string | number;
  updatedAt: string | number;
}
```

## Replica Lifecycle

```text
NEW
 ↓
INITIALIZING
 ↓
READY
 ↓
SYNCING
 ↓
READY
```

Integrity failures should move the replica toward:

```text
QUARANTINED
```

## Quarantine Rules

When integrity validation fails:

1. Stop destructive recovery behavior.
2. Do not blindly delete IndexedDB.
3. Preserve pending outbox mutations.
4. Record the integrity failure.
5. Mark the replica `QUARANTINED`.
6. Recover canonical state from PostgreSQL.
7. Reconcile pending local mutations safely.
8. Recalculate the checksum.
9. Return the replica to `READY` only after verification.

---

# Replica Checksums

KwakoPos uses deterministic content-based checksums for important local business data.

Conceptually:

```text
Server Canonical Data
        ↓
Canonicalization
        ↓
SHA-256
        ↓
Server Checksum
                 compare
Local Data   ────────────────▶ Local Checksum
```

A checksum mismatch is an integrity event, not a reason to immediately erase local data.

The system should prefer:

```text
detect
 ↓
quarantine
 ↓
preserve
 ↓
recover
 ↓
verify
```

over:

```text
mismatch
 ↓
delete everything
```

---

# Products, Variants, and Stock Ledger

Inventory follows a variant-first model.

## Authority

`stock_ledger` is the authoritative source for inventory movements.

Typical movement types include:

```text
OPENING_STOCK
PURCHASE_RECEIVE
SALE
CUSTOMER_RETURN
TRANSFER_IN
TRANSFER_OUT
ADJUSTMENT_GAIN
ADJUSTMENT_LOSS
```

## Stock Calculation

Variant stock is derived from ledger events.

Parent product stock is derived from variants:

```text
Parent Stock
    =
Sum of Variant Stock
```

Derived projections must not themselves become new business mutations.

For example, this is correct:

```text
Sale
 ↓
Stock Ledger
 ↓
Variant Projection
 ↓
Parent Projection
```

This is dangerous:

```text
Sale
 ↓
Update Stock
 ↓
Projection
 ↓
Emit another stock mutation
```

The second approach can create feedback loops and duplicated movements.

---

# POS Transaction Atomicity

A POS sale is a business transaction, not a collection of independent writes.

The intended local transaction is conceptually:

```text
BEGIN TRANSACTION

  orders.put(sale)
  order_items.bulkPut(items)
  stock_ledger.bulkPut(stockMovements)
  receipts.put(receipt)
  syncQueue.put(outboxMutation)
  audit_logs.put(auditEntry)

COMMIT
```

A sale must not result in:

```text
Sale exists
BUT
Inventory movement missing
```

or:

```text
Inventory reduced
BUT
Sale missing
```

The same consistency principle should apply to:

- purchases
- returns
- transfers
- payments
- refunds
- inventory adjustments
- other financial events

---

# Deletes and Tombstones

Synchronized business data should not be immediately physically deleted from clients.

Instead, use a tombstone:

```text
deleted_at = timestamp
operation = DELETE
```

The deletion then propagates through synchronization.

Conceptually:

```text
Device A
  ↓
DELETE mutation
  ↓
PostgreSQL tombstone
  ↓
Delta sync
  ↓
Device B
```

Physical purge should be handled only by controlled retention/administrative processes.

This helps prevent deleted records from being resurrected by stale replicas.

---

# Multi-Tenant and Branch Isolation

KwakoPos is multi-tenant.

Tenant context must be derived from authenticated server-side authorization.

Never trust a raw client field such as:

```text
request.body.tenantId
```

without verifying that the authenticated user/session is allowed to operate on that tenant.

## Required Scope

Every business query must enforce appropriate:

```text
tenant_id
branch_id
```

boundaries.

Server authorization must protect:

- reads
- creates
- updates
- deletes
- synchronization
- bootstrap
- reports
- exports
- checksums
- settings
- file access

Changing a tenant ID in a request must never grant access to another tenant.

---

# Session and Device Security

KwakoPos uses a short-lived access token plus refresh-session model.

Recommended lifecycle:

```text
Login
 ↓
Short-Lived Access Token
 ↓
Authenticated Requests
 ↓
Refresh Token Rotation
 ↓
New Access Token
```

Important properties:

- access tokens are short-lived
- refresh tokens rotate
- refresh token families are tracked server-side
- refresh token reuse should trigger compromise handling
- sessions can be revoked
- devices have persistent identities
- tenant context is server-authorized

Device identity should remain stable across ordinary:

- browser restarts
- page reloads
- PWA upgrades

Device identity must not be treated as an authentication credential.

---

# PWA and Upgrade Safety

PWA upgrades are considered a data integrity event.

A deployment must never assume that a new frontend build may safely replace the local database.

Before schema/data changes:

```text
Acquire migration lock
        ↓
Inspect replica state
        ↓
Preserve pending outbox
        ↓
Apply non-destructive migration
        ↓
Verify local integrity
        ↓
Release lock
        ↓
Resume synchronization
```

## Never

Do not use an upgrade path that blindly does:

```text
delete IndexedDB
recreate IndexedDB
seed defaults
```

That is incompatible with an offline-first production system.

## Upgrade Acceptance Test

Every important PWA release should prove:

```text
Build N
 ↓
Install
 ↓
Create product/category/brand
 ↓
Create offline mutation
 ↓
Leave outbox pending
 ↓
Upgrade to Build N+1
 ↓
Reload
 ↓
Verify data still exists
 ↓
Verify outbox still exists
 ↓
Reconnect
 ↓
Verify server
 ↓
Verify another device
```

---

# Database and Migrations

The repository uses versioned SQL migrations.

Current migration sequence includes:

```text
001_core_schema.sql
002_indexes_and_constraints.sql
003_modules_and_audit.sql
004_session_and_device_columns.sql
005_session_audit_columns.sql
006_fix_session_audit_id.sql
007_relax_taxonomy_fkeys.sql
008_stock_ledger_columns.sql
009_distributed_rate_limits.sql
```

Migrations are part of the production persistence contract.

## Migration Requirements

Production migrations should be:

- deterministic
- ordered
- auditable
- repeat-safe
- transactional where practical
- validated before application startup
- recorded in a schema migration table

A failed migration must fail closed rather than silently allowing an application to run against an unexpected schema.

---

# Project Structure

The project is organized around application UI, persistence, repositories, services, hooks, types, tests, and utilities:

```text
Project/
├── artifacts/                  # Certification output artifacts (JSON & Markdown)
├── migrations/                 # PostgreSQL SQL migration files (001_core_schema.sql ...)
├── public/                     # Static assets, icons, manifest.json, sw.js
├── scripts/                    # Maintenance, migration, and verification scripts
│   ├── db-health-check.js
│   ├── test-session-suite.js
│   ├── test-tenant-isolation.js
│   ├── test-concurrency-suite.js
│   └── production-runtime-validation/
│       └── test-full-production-certification.js
├── src/
│   ├── components/             # React UI components
│   ├── db/                     # Dexie database definitions, repositories & checksum core
│   │   ├── persistence/
│   │   └── repositories/
│   ├── pages/                  # Top-level application pages & router
│   ├── services/               # Frontend API clients & business services
│   ├── types/                  # TypeScript domain type declarations
│   └── utils/                  # Helper utilities (formatting, calculations)
├── tests/
│   └── browser-runtime/        # Playwright E2E real browser test suite
│       ├── 01-persistence.spec.ts
│       ├── 02-offline-sync.spec.ts
│       ├── 03-multidevice.spec.ts
│       ├── 04-pos-stock.spec.ts
│       ├── 04-service-worker.spec.ts
│       ├── 05-pwa-upgrade.spec.ts
│       ├── 06-checksum-convergence.spec.ts
│       ├── 06-recovery-checksum.spec.ts
│       └── 07-security-isolation.spec.ts
├── package.json
├── playwright.config.ts
├── server.js                   # Authoritative Node.js REST API & Sync Server
└── vite.config.ts
```

---

# Environment Configuration

Use `.env.example` as the template for local configuration.

Typical server values include:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/kwakopos

JWT_SECRET=replace-with-a-strong-secret
SESSION_SECRET=replace-with-a-strong-secret

ACCESS_TOKEN_TTL=900
REFRESH_TOKEN_TTL=1209600

APP_ENV=development
NODE_ENV=development

PORT=8080

VITE_API_URL=http://localhost:8080
```

## Production Secrets

Never commit production credentials.

Secrets such as:

- database passwords
- JWT signing secrets
- session secrets
- cloud credentials
- webhook secrets

must be supplied through the deployment platform's secret-management system.

---

# Local Development

## Requirements

Use a current supported Node.js version compatible with the repository CI configuration.

Install dependencies:

```bash
npm ci
```

Install Playwright Chromium browser dependencies:

```bash
npx playwright install --with-deps chromium
```

Start the local backend server:

```bash
npm start
```

Start the Vite development server:

```bash
npm run dev
```

Create/build the application:

```bash
npm run build
```

Preview the production frontend:

```bash
npm run preview
```

---

# Database Commands

Set up local PostgreSQL:

```bash
npm run db:setup
```

Run migrations:

```bash
npm run db:migrate
```

Check database health:

```bash
npm run db:check
```

Database connectivity and schema configuration should be verified before functional testing.

---

# Testing and Reliability Certification

KwakoPos places unusually high emphasis on persistence and synchronization correctness.

## Core Tests

Run individual verification suites:

```bash
npm run test:session
npm run test:data-loss
npm run test:concurrency
npm run test:isolation
npm run test:chaos
npm run test:checksum
npm run test:projection
npm run test:atomic-delta
npm run test:audit-persistence
```

Run the primary reliability suite:

```bash
npm run test:all
```

Production verification:

```bash
npm run production:verify
```

Runtime certification:

```bash
npm run test:runtime
```

Critical runtime certification:

```bash
npm run test:runtime:critical
```

Full production certification:

```bash
npm run production:certify
```

## Reliability Test Categories

The test suite is expected to cover areas such as:

- local persistence
- logout retention
- browser restart persistence
- offline/online transitions
- retry storms
- duplicate request idempotency
- multi-device convergence
- tombstone propagation
- variant stock projection
- POS atomicity
- Stock Ledger reconstruction
- PWA upgrade safety
- schema migrations
- replica checksum verification
- quarantine/recovery
- tenant isolation
- clock skew
- checkpoint regression protection
- atomic delta/checkpoint transactions
- multi-tab coordination
- performance thresholds

---

# Real-Browser Certification

Server and Node-based tests are necessary but not sufficient.

KwakoPos is fully certified in a real browser environment using Playwright:

```text
Playwright
+
Chromium
+
Real IndexedDB
+
Real Service Worker
+
Real Cache Storage
+
Network offline mode
+
Production PostgreSQL / Node API
```

At minimum, a browser certification scenario tests:

```text
Browser A
  ↓
Login
  ↓
Create Product
  ↓
Create Category
  ↓
Create Brand
  ↓
Create Variant
  ↓
Create Sale
  ↓
Go Offline
  ↓
Create offline mutation
  ↓
Close browser
  ↓
Reopen
  ↓
Reconnect
  ↓
Verify server

Browser B
  ↓
Login
  ↓
Sync
  ↓
Verify the same state
```

PWA upgrade certification is also performed against real browser storage and service workers.

---

# CI/CD

GitHub Actions are used for validation and deployment workflows.

The CI pipeline:

1. Checks out source code.
2. Installs dependencies with `npm ci`.
3. Starts local PostgreSQL database.
4. Executes code linting (`npm run lint`).
5. Builds the production bundle (`npm run build`).
6. Runs real Playwright browser tests (`npm run test:browser-runtime`).
7. Validates master production certification gates (`npm run production:certify`).

---

# Production Deployment

KwakoPos is designed to run behind a production API and PostgreSQL database, with Google Cloud Run being a supported deployment target.

A typical deployment model is:

```text
                  ┌─────────────────────┐
                  │   PWA / Browser     │
                  └──────────┬──────────┘
                             │ HTTPS
                             ▼
                  ┌─────────────────────┐
                  │ Cloud Run / API     │
                  │ KwakoPos Server     │
                  └──────────┬──────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │     PostgreSQL      │
                  │ Canonical Database  │
                  └─────────────────────┘
```

## Production Prerequisites

Before deployment, verify:

- database is reachable
- migrations are current
- environment secrets exist
- application health checks pass
- tenant isolation tests pass
- synchronization tests pass
- integrity tests pass
- runtime certification passes
- rollback procedure is available
- backups are current

## Example Container Flow

```text
Source
  ↓
npm ci
  ↓
npm run build
  ↓
Container image
  ↓
Deploy immutable revision
  ↓
Health checks
  ↓
Smoke tests
  ↓
Production traffic
```

---

# Production Release Strategy

A production release should follow:

```text
Code Change
    ↓
Lint / Type Check / Build
    ↓
Unit Tests
    ↓
Persistence Tests
    ↓
Integration Tests
    ↓
Tenant Isolation
    ↓
Concurrency / Chaos
    ↓
Checksum / Integrity
    ↓
Runtime Certification
    ↓
Build Container
    ↓
Deploy Immutable Revision
    ↓
Health Check
    ↓
Smoke Test
    ↓
Release
```

Never bypass critical reliability gates merely to ship a feature.

---

# Operational Safety

## Backups

PostgreSQL backups are the primary recovery mechanism for committed business data.

Production operations maintain:

- automated backups
- retention policy
- restore procedures
- restore verification
- point-in-time recovery where supported
- documented disaster recovery ownership

## Rollbacks

Application rollback prefers:

```text
Previous immutable application revision
```

while protecting the database from incompatible application/schema combinations.

Never assume an application rollback can safely undo an irreversible database migration.

Backward-compatible database migrations are strongly preferred.

---

# Observability

Production diagnostics are read-only unless explicitly designed as controlled administrative operations.

Operational telemetry exposes:

- application version
- build number
- database schema version
- replica schema version
- replica status
- last sync time
- outbox count
- failed mutation count
- dead-letter count
- current server checkpoint
- local checkpoint
- synchronization latency
- integrity/checksum status
- active session/device information
- API error rates

---

# Security Rules

KwakoPos is a multi-tenant business platform and uses fail-closed security principles.

## Mandatory Rules

### Tenant isolation

Every server operation must enforce tenant authorization.

### Branch isolation

Users must only access branches for which they are authorized.

### Authentication

Authentication state must come from server-validated credentials/session context.

### Authorization

UI visibility is not authorization. Every sensitive operation must be authorized server-side.

### Idempotency

Financial and business mutations must be protected from duplicate retries.

### Secrets

Production secrets must never be committed.

### Auditability

Sensitive administrative and business operations should create durable audit entries.

### Rate limiting

Production API rate limits are enforced at the server level.

---

# Development Rules

## Rule 1 — Never bypass repositories

Do not introduce direct IndexedDB business writes from UI code.

## Rule 2 — Never create a second sync engine

All synchronization must delegate to the central SyncEngine.

## Rule 3 — Do not treat local data as canonical

IndexedDB is a replica.

## Rule 4 — Never silently erase data after integrity failure

Use quarantine and controlled recovery.

## Rule 5 — Never advance checkpoints before commit

Checkpoint advancement follows successful local transaction commit.

## Rule 6 — Do not overwrite inventory blindly

Stock must be reconstructed from authoritative ledger movements.

## Rule 7 — Preserve idempotency across retries

Do not generate a new operation ID for every network retry of the same business operation.

## Rule 8 — Prefer immutable events for financial/inventory history

Do not rewrite history when a correction event is more appropriate.

## Rule 9 — Avoid destructive PWA migrations

A new frontend version must not clear customer data.

## Rule 10 — Keep business logic out of infrastructure code

Platform services should provide infrastructure guarantees; domains should implement business behavior.

---

# AI Coding-Agent Rules

AI coding agents working in this repository must preserve the platform's architectural invariants.

Before changing persistence or synchronization code, inspect:

```text
KWAKOPOS_PRODUCTION_DATA_RELIABILITY_SPEC.md
docs/KWAKOPOS_RELIABILITY_IMPLEMENTATION_MATRIX.md
```

AI-generated changes must not:

- introduce direct UI IndexedDB writes
- create parallel synchronization paths
- weaken tenant authorization
- remove idempotency
- bypass the outbox
- advance sync checkpoints early
- delete local databases on startup
- seed production tenants with demo data
- convert immutable ledger events into mutable stock totals
- silently swallow migration failures
- remove auditability
- disable critical CI reliability gates without explicit authorization

---

# Production Readiness

KwakoPos is certified production-ready across all critical operational paths:

```text
                 ┌──────────────────────┐
                 │ Authentication       │
                 ├──────────────────────┤
                 │ Tenant isolation     │
                 ├──────────────────────┤
                 │ Branch isolation     │
                 ├──────────────────────┤
                 │ Local persistence     │
                 ├──────────────────────┤
                 │ Outbox durability     │
                 ├──────────────────────┤
                 │ Two-way sync          │
                 ├──────────────────────┤
                 │ Idempotency           │
                 ├──────────────────────┤
                 │ Stock Ledger          │
                 ├──────────────────────┤
                 │ Financial atomicity   │
                 ├──────────────────────┤
                 │ PWA upgrade safety    │
                 ├──────────────────────┤
                 │ Migrations             │
                 ├──────────────────────┤
                 │ Replica integrity     │
                 ├──────────────────────┤
                 │ Disaster recovery     │
                 ├──────────────────────┤
                 │ Real browser E2E      │
                 └──────────────────────┘
```

- **Certification Status**: 🏆 **CERTIFIED (PASS)**
- **Test Pass Rate**: 30/30 (100%)
- **Real Browser Gates**: 13/13 Pass

---

# Contributing

Before opening a pull request:

```bash
npm ci
npm run build
npm run lint
npm run production:verify
npm run production:certify
```

Pull requests should clearly explain:

- what changed
- why it changed
- affected data flows
- affected synchronization behavior
- migration implications
- security implications
- tests performed
- rollback considerations

---

# Versioning

KwakoPos uses application version/build metadata to identify deployed software revisions:

```text
KwakoPos
Version: 1.2.0
Build: production-release
Schema Version: 41 / Migrations 001-009
```

---

# Reference Documents

Important repository documents include:

- `KWAKOPOS_PRODUCTION_DATA_RELIABILITY_SPEC.md`
- `docs/KWAKOPOS_RELIABILITY_IMPLEMENTATION_MATRIX.md`
- `artifacts/kwakopos-production-certification.json`
- `artifacts/kwakopos-production-certification.md`
- `.env.example`
- `package.json`
- `migrations/`

---

# License

Copyright © 2026 Kwakoko Business Platforms. All rights reserved.
