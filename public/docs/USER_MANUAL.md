# KwakoPos User Operational Manual

This operational guide outlines the user role capabilities (RBAC), checkout workflows, offline features, and inventory transfer protocols in KwakoPos.

---

## 1. Role-Based Access Control (RBAC) Matrix

KwakoPos enforces strict functional permission boundaries per seat:

| Role | Target Users | Master Catalog Edit | POS Checkout | Branch Allocations | Financial Audit Logs | Org settings |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Owner** | Business Owners | Yes | Yes | Yes | Yes | Yes |
| **Manager** | Branch Managers | Yes | Yes | Yes | No | No |
| **Accountant** | Tanzanian *Mhasibu* | No | No | No | Yes | No |
| **Cashier** | Store Operators | No | Yes | No | No | No |

### Special Role Constraints

#### 🇹🇿 Tanzanian "Mhasibu" (Accountant) Role
To prevent internal fraud, the accountant role has a specialized write barrier:
* They **cannot** perform manual stock increases or inventory reductions.
* They **can** view all general ledgers, download sales charts, run tax compliance reviews, and inspect audit logs.

#### Cashier Restrictions
Cashier accounts are locked out of general configuration areas:
* They cannot alter product prices or edit SKU codes.
* If a cashier attempts to access the settings panel, they are blocked with a permission exception screen.

---

## 2. Core Operational Workflows

### 🛒 POS Checkout Workflow

1. Navigate to the **POS** tab.
2. Search for items or scan barcodes:
   * Scan barcode to immediately add the item to the cart.
   * If a product has multiple branch stocks, the POS automatically filters the catalog matching the user's active branch.
3. Select the customer from the dropdown:
   * Select a registered customer to award **Loyalty Points** (1 point per 1,000 TZS spent).
   * Leave as "Walk-in Customer" if anonymous.
4. Select the payment method (Cash, Card, or Mobile Money like M-Pesa, Tigo Pesa).
5. Click **Checkout**:
   * The sale is logged.
   * Stock levels are decremented dynamically via the `StockLedger`.
   * A receipt index is generated for printing.

---

### 📶 Offline-First Operations

DukaPos runs completely offline inside your browser:
* **Offline Execution:** If the internet goes down, you can keep checking out customers, marking attendance, and adding new customers. All changes are stored locally in the partitioned IndexedDB cache.
* **Synchronization:** A sync indicator appears in the navigation sidebar:
  - 🟢 **Connected:** All records are fully updated in the cloud.
  - 🟡 **Syncing:** Pushing local outbox transactions to the server.
  - 🔴 **Offline:** Changes are queued locally. They will automatically upload when network connectivity is restored.

---

### 📦 Cross-Branch Stock Requisitions

For multi-branch stores, stock cannot simply be deleted from one place and added to another. It must go through the Ledger Requisition pipeline:

1. **Request:** A Branch Manager requests stock from another branch (under **Stock Requisition**).
2. **Approval:** A Manager or Owner at the source branch reviews the request.
3. **Transaction:** Once approved:
   - Source branch stock is decremented (logged in `StockLedger` as `TRANSFER-OUT`).
   - Target branch stock is incremented (logged in `StockLedger` as `TRANSFER-IN`).
   - The transfer history updates instantly across both locations.

---

### 💳 Subscriptions & Lockout Policies

* **Free Trial:** 14-day trial (limited to 2 branches and 2 users).
* **Lockout Policy:** Overdue subscriptions are locked immediately upon expiration. Once expired, DukaPos activates a read-only lock. Registers are locked, POS checkouts are disabled, and staff members are blocked from making changes until a renewal payment is registered.
