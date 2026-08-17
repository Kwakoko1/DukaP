# KwakoPos — Production Data Reliability & Distributed Consistency Engineering Specification

**Document**: `KWAKOPOS_PRODUCTION_DATA_RELIABILITY_SPEC.md`  
**Status**: **Final Engineering Specification & Governing Contract**  
**Target**: Production SaaS  
**Architecture**: Offline-First PWA + PostgreSQL Authoritative Source of Truth  
**Primary Objective**: Zero data loss, deterministic multi-device synchronization, tenant isolation, and non-destructive PWA upgrades  

---

## 1. Mission

Implement and enforce a production-grade data reliability architecture for KwakoPos such that:

> **No committed business data may be silently lost, overwritten, duplicated, orphaned, or assigned to the wrong tenant because of browser refreshes, logout, browser closure, PWA upgrades, offline operation, network failure, concurrent devices, retries, server failures, clock skew, migrations, or synchronization conflicts.**

This specification is the single source of truth for the persistence, replication, synchronization, migration, session/device, and data-integrity architecture across all modules (Retail, Pharmacy, Inventory, Fleet, Law Firm, Agriculture, Restaurant, Technical, etc.).

---

## 2. Non-Negotiable Architecture

```text
                         ┌─────────────────────────┐
                         │       PostgreSQL        │
                         │ AUTHORITATIVE DATABASE  │
                         └────────────┬────────────┘
                                      │
                         Server Delta / Events
                                      │
                                      ▼
┌───────────────┐             ┌──────────────────┐
│   KwakoPos    │             │    SyncEngine    │
│      UI       │────────────▶│ ONLY SYNC OWNER  │
└───────┬───────┘             └────────┬─────────┘
        │                              │
        ▼                              ▼
┌──────────────────┐           ┌──────────────────┐
│ Canonical        │           │ Durable Outbox   │
│ Repository Layer │──────────▶│ / Inbox          │
└────────┬─────────┘           └──────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│               IndexedDB                  │
│                                          │
│ Local Offline Replica                   │
│ Products                                 │
│ Categories                              │
│ Brands                                  │
│ Customers                               │
│ Suppliers                               │
│ Sales                                   │
│ Stock Projections                       │
│ Settings                                │
│ etc.                                    │
└──────────────────────────────────────────┘
```

### Component Ownership & Responsibilities

| Component | Strict Responsibility |
| :--- | :--- |
| **PostgreSQL** | Authoritative single source of truth for all committed tenant data. |
| **IndexedDB (Dexie)** | Local operational offline replica; never treated as permanent master. |
| **Repository Layer** | Sole business-data write gateway executing atomic local transactions. |
| **SyncEngine** | Sole synchronization authority owning outbox queue draining & delta pulling. |
| **Outbox Queue** | Durable pending mutation queue surviving crashes and restarts. |
| **Inbox Queue** | Durable received changes waiting for transactional application. |
| **ReplicaManager** | Governs local replica lifecycle, trustworthiness, and safety assertions. |
| **ReplicaManifest** | Authoritative descriptor of local replica version, state, and checksum. |
| **HLC Engine** | Hybrid Logical Clocks for causal ordering and hardware clock skew calibration. |
| **Idempotency Engine**| Prevents duplicate transaction processing across network retries. |
| **Stock Ledger** | Authoritative, immutable event source for all inventory movements. |
| **Financial Events** | Authoritative, immutable transactions (Sales, Payments, Refunds). |
| **Migration Engine** | Deterministic versioned SQL schema migrations (`schema_migrations`). |
| **Integrity Engine** | Fail-closed validation, state classification, and quarantine protocol. |

---

## 3. Golden Rule

> **Never delete local data merely because it is missing.**

The application must never interpret:
$$\text{IndexedDB has } 0 \text{ records} \implies \text{Tenant has } 0 \text{ records}$$

### Decision Flow: Empty Local Replica State
```text
EMPTY LOCAL REPLICA
        │
        ▼
Identify Authenticated Tenant
        │
        ▼
Check ReplicaManifest & Outbox
        │
        ▼
Check Server Tenant Existence
        │
        ├── Existing Tenant ──▶ DO NOT SEED ──▶ RESTORE / DELTA SYNC
        │
        └── New Tenant      ──▶ INITIALIZE CLEAN WORKSPACE
```

---

## 4. PostgreSQL Source of Truth

* Once a mutation is successfully committed to PostgreSQL, that record belongs to the tenant permanently unless an explicit authorized business operation deletes/voids it.
* IndexedDB records are temporary operational projections (`PENDING` or `PROCESSING`), but PostgreSQL determines canonical server state and monotonic sequence versions (`sync_version`).

---

## 5. Canonical Repository Rule

Every business write MUST flow through:

$$\text{UI} \longrightarrow \text{Repository} \longrightarrow \text{Atomic IndexedDB Transaction} \longrightarrow \text{Entity Write} + \text{Outbox Mutation}$$

### Prohibited Actions:
* Direct `db.products.add()`, `db.products.put()`, or `db.products.delete()` from React components, pages, dialogs, hooks, POS views, or dashboards.
* All UI modules must invoke canonical repositories (e.g. `productRepository`, `inventoryRepository`, `orderRepository`).

---

## 6. Atomic Local Write Requirement

Every business mutation must write atomically within a Dexie transaction:

```text
IndexedDB Transaction (rw)
 ├── Entity Table Write (e.g., db.products.put)
 ├── Outbox Queue Write (e.g., db.syncQueue.put)
 └── Replica Metadata Update
```

* If any part of the transaction fails, the entire transaction rolls back.
* The state where an entity exists locally without an outbox mutation, or an outbox mutation exists without the local record, is architecturally prohibited.

---

## 7. Canonical Mutation Envelope

Every mutation must strictly use the standard envelope structure:

```typescript
export interface MutationEnvelope {
  mutationId: string;        // Cryptographically secure UUID
  operationId: string;       // Stable idempotency identifier
  tenantId: string;          // Authoritative tenant scope
  branchId?: string;         // Authoritative branch scope
  deviceId: string;          // Persistent device identity
  userId?: string;           // Authenticated user ID

  entity: string;            // Target table / domain entity
  entityId: string;          // Primary key of target entity

  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: unknown;          // Strongly-typed domain payload

  clientVersion?: number;
  serverVersion?: number;

  hlc: string;               // Hybrid Logical Clock timestamp
  schemaVersion: number;     // Active schema version

  createdAt: string | number;
  idempotencyKey: string;    // Composite `${deviceId}:${operationId}`
  correlationId: string;
  causationId?: string;
}
```

* `operationId` is mandatory and MUST remain constant across all network retries.

---

## 8. Idempotency Standard

* Every mutation submitted from any device contains a unique `operation_id` and `idempotency_key`.
* PostgreSQL enforces a strict unique constraint:
  $$\text{UNIQUE}(\text{tenant\_id}, \text{operation\_id})$$
* Submitting the exact same mutation 5 times results in **exactly ONE committed business transaction**. Subsequent requests return the previously committed response with zero duplicate ledger entries.

---

## 9. Outbox State Machine

All sync queue items use standardized enum states:

```text
PENDING
   │
   ▼
PROCESSING
   │
   ├── Success             ──▶ SYNCED
   ├── Temporary Failure   ──▶ FAILED (Exponential Backoff: 1s, 5s, 15s, 30s, 60s...)
   ├── Conflict Detected   ──▶ CONFLICT
   └── Permanent Failure   ──▶ DEAD_LETTER
```

* `DEAD_LETTER` records are preserved permanently with error diagnostic logs and must never silently disappear.

---

## 10. Delete Semantics & Tombstones

* Synchronized business records are **never physically erased immediately** on the client.
* Deletions generate a soft tombstone (`deleted_at = timestamp`) with `operation = 'DELETE'`.
* Tombstones replicate to all devices via delta sync. Physical database purges only execute through authorized administrative retention workflows.

---

## 11. UUID & Identity Strategy

* Entities and mutations generate 128-bit cryptographically secure UUIDs (`crypto.randomUUID()` / `generateSecureUUID()`).
* Client-generated UUIDs remain the permanent authoritative database primary keys across PostgreSQL and IndexedDB, eliminating ID re-mapping collisions.

---

## 12. Replica Manifest Specification

Every local database instance maintains a `ReplicaManifest`:

```typescript
export interface ReplicaManifest {
  tenantId: string;
  deviceId: string;
  databaseVersion: number;
  schemaVersion: number;
  replicaVersion: number;

  lastServerVersion: number;
  lastAppliedVersion: number;

  lastSuccessfulSyncAt?: string | number;
  lastBootstrapAt?: string | number;

  status: 'NEW' | 'INITIALIZING' | 'READY' | 'SYNCING' | 'STALE' | 'RECOVERING' | 'QUARANTINED';
  checksum?: string;

  createdAt: string | number;
  updatedAt: string | number;
}
```

---

## 13. Replica State Machine & Quarantine Protocol

```text
NEW ──▶ INITIALIZING ──▶ READY ──▶ SYNCING ──▶ READY
                           │          │
                           │          └── Temporary Error ──▶ STALE
                           │
                           └───────────── Integrity Error ──▶ QUARANTINED
```

### Quarantine Protocol:
If local foreign keys or checksum validations fail:
1. **STOP** destructive operations and migrations.
2. **DO NOT** delete or reset IndexedDB.
3. **PRESERVE** the durable outbox queue.
4. Mark replica status `QUARANTINED`.
5. Restore authoritative state safely from PostgreSQL via Server Bootstrap Recovery.

---

## 14. SyncEngine As Sole Synchronization Authority

`SyncEngine` is the single authority owning:
* Outbox queue processing & exponential backoff retry.
* Monotonic delta sync pulling (`sinceVersion` watermark).
* Idempotency verification and token family propagation.
* Checkpoint advancement and tab broadcast signaling.

Domain-specific modules (POS, Inventory, Customers) must never implement competing sync protocols; all background synchronization delegates to `SyncEngine`.

---

## 15. Checkpoint Safety Rule

> **Never advance a sync watermark before data is successfully committed to local IndexedDB.**

### Mandatory Sequence:
$$\text{Fetch Delta} \longrightarrow \text{Dexie Transaction Commit} \longrightarrow \text{Advance Checkpoint Watermark}$$

If the device powers off or crashes mid-sync, uncommitted records are re-requested on the next synchronization pass without gap loss.

---

## 16. Conflict Resolution Hierarchy

1. **Master Metadata (Products, Categories, Brands)**:
   - Resolved via Version Number + HLC Timestamp + Server Precedence.
2. **Inventory Stock Movements**:
   - Resolved strictly via **Immutable Stock Ledger Movement Summation**. Overwriting stock directly with Last-Write-Wins is strictly prohibited.
3. **Financial Transactions (Sales, Payments, Refunds)**:
   - Resolved strictly via **Immutable Financial Ledger Entries** + Server-Side Idempotency.

---

## 17. Stock Ledger Authority & Variant-First Architecture

* `stock_ledger` is the authoritative source of truth for all inventory movements (`OPENING_STOCK`, `PURCHASE_RECEIVE`, `SALE`, `CUSTOMER_RETURN`, `TRANSFER_IN`, `TRANSFER_OUT`, `ADJUSTMENT_GAIN`, `ADJUSTMENT_LOSS`).
* Product variant stock is calculated directly from ledger entries.
* Parent product stock is derived as the sum of child variant stock:
  $$\text{Parent Stock} = \sum \text{Variant Stocks}$$

---

## 18. POS Sale Transaction Atomicity

A POS sale represents a single atomic business transaction:

```text
BEGIN TRANSACTION
 ├── orders.put(saleRecord)
 ├── order_items.bulkPut(saleItems)
 ├── stock_ledger.bulkPut(stockMovements)
 ├── receipts.put(receiptRecord)
 ├── syncQueue.put(outboxMutation)
 └── audit_logs.put(auditEntry)
COMMIT
```

If any sub-operation fails, the entire sale rolls back. Partial sales (sale recorded but inventory not reduced, or inventory reduced without a sale) are impossible.

---

## 19. Multi-Tenant & Branch Security

1. **Server Authorization**: Tenant ID claims originate from cryptographically verified JWT session claims. Client-submitted tenant IDs are strictly verified against authenticated credentials.
2. **Tenant Scoping**: All database queries strictly enforce `WHERE tenant_id = $1`. Cross-tenant reads return 0 records; cross-tenant write tampering returns `403 Forbidden`.
3. **Branch Isolation**: Branch boundaries are validated server-side. Users cannot access unauthorized branches by manipulating parameters.

---

## 20. Session Security & Device Identity

1. **In-Memory JWT Access Tokens**: Short-lived (15-minute TTL).
2. **Rotating Refresh Tokens**: With PostgreSQL token family tracking (`sessions` and `security_audit_logs`).
3. **Token Reuse Detection**: Replaying an expired or rotated refresh token triggers immediate compromise protocol, revoking all active sessions in the family.
4. **Persistent Device Identity**: Cryptographic 128-bit device IDs survive PWA upgrades, cache clearing, and browser restarts.

---

## 21. Distributed Multi-Node Rate Limiting

* PostgreSQL-backed `rate_limits` table coordinates rate limit buckets atomically across multi-instance cluster nodes (Google Cloud Run, Kubernetes, AWS ECS) using atomic `INSERT ... ON CONFLICT (key) DO UPDATE` queries.
* Automatic in-memory fallback ensures high availability during transient database reconnection.

---

## 22. Hardware Clock Skew Tolerance (NTP-Lite)

* **Server-Time Offset Calibration**: HLC automatically calculates and applies server offset (`serverTime - localClientTime`) on every API interaction.
* **Physical Forward-Drift Clamping**: Manual device time jumps (> 60s into future) are smoothly clamped to monotonic logical ticks.
* **Authoritative Server Sequencing**: Server assigns canonical `server_timestamp` and `sync_version` to all pushed mutations.

---

## 23. PWA Upgrade & Migration Protocol

Before applying a PWA upgrade or IndexedDB schema version bump:
1. Acquire migration lock.
2. Inspect local replica health and snapshot pending outbox queue.
3. Apply non-destructive Dexie / SQL migrations.
4. Verify record count checksums post-migration.
5. Release lock and resume synchronization.
6. **Under no circumstances may a failed migration wipe or reset the local database.**

---

## 24. Read-Only Production Diagnostics

* Production readiness probes and health checks (`/health`, `productionReadinessVerifier.ts`) are **strictly read-only**.
* Diagnostics inspect table counts, schema status, replica manifest, and watermark cursors without writing, modifying, or deleting test records.

---

## 25. Definition of Done & Quality Gates

The KwakoPOS platform satisfies the production data reliability standard only when all acceptance criteria are verified:

- [x] **Canonical Repository Layer Enforced**: Direct UI IndexedDB writes eliminated.
- [x] **Atomic Local Mutations**: Entity write + outbox mutation committed within single transaction.
- [x] **Canonical MutationEnvelope**: Standardized structure with mandatory `operationId`.
- [x] **Server-Side Idempotency**: Processed operations tracked in `idempotency_keys` table.
- [x] **Outbox State Enum Standardized**: `PENDING`, `PROCESSING`, `SYNCED`, `FAILED`, `CONFLICT`, `DEAD_LETTER`.
- [x] **Tombstone Soft Deletions**: Deletions propagate via `deleted_at` timestamps without resurrection.
- [x] **Cryptographic 128-bit UUIDs**: Client-generated IDs remain authoritative primary keys.
- [x] **ReplicaManifest & ReplicaManager**: Local state coordination, pre-bootstrap outbox checks, and quarantine protocol operational.
- [x] **SyncEngine as Sole Authority**: Centralized outbox flushing and delta replication.
- [x] **Monotonic Checkpoint Advancement**: Watermarks only advance after local transactional commits.
- [x] **Stock Ledger Authority**: Variant-first inventory derivation from immutable movements.
- [x] **POS Sale Atomicity**: Atomic local transaction committing sale, stock movements, and outbox item.
- [x] **Tenant & Branch Isolation**: Server-side claim validation and strict tenant boundary enforcement.
- [x] **Hybrid Session Management**: In-memory JWTs, rotating refresh tokens, and reuse revocation.
- [x] **Distributed Rate Limiting**: PostgreSQL-backed atomic multi-node rate limits with in-memory fallback.
- [x] **Hardware Clock Skew Tolerance**: HLC server-time offset calibration and physical forward-drift clamping.
- [x] **Read-Only Diagnostics**: Production diagnostics execute non-destructively.
- [x] **Versioned SQL Migrations**: Monotonic migration ledger in `schema_migrations` (`001` through `009`).
- [x] **Automated Test Matrix**: 100% passing across Session, Isolation, Concurrency, Zero Data Loss, and Chaos suites.

---

## 26. Final Engineering Contract

$$\forall \text{ committed business mutation } M, \quad M \in \text{PostgreSQL} \cup \text{LocalReplica} \cup \text{SyncOutbox}$$

At every point in time, committed business records are guaranteed to exist in at least one durable store or pending outbox queue capable of reconstructing it. **No normal operation, network partition, hardware clock skew, logout, browser restart, or PWA upgrade may cause permanent business data loss.**
