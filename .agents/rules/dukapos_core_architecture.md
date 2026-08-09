# DukaPOS Core Architecture Directives

Whenever building, optimizing, debugging, or implementing ANY module, component, database table, service, function, or feature in DukaPOS Business Operating System, the following three core architectural pillars MUST be strictly evaluated, enforced, and respected:

---

## 1. 🏢 Multi-Tenant Isolation & Security (`tenant_id`)
- **Strict Data Scope**: All database tables, Dexie schema indices, API payloads, sync queues, and queries MUST include and filter by `tenant_id`.
- **Zero Cross-Tenant Leakage**: No component or query may fetch, display, or aggregate data across tenants.
- **Tenant Context**: Always pull `currentTenant.id` from `useAuth()` context.

---

## 2. 🌿 Multi-Branch Hierarchy & HQ Scope (`branch_id`)
- **Branch-Level Scoping**: Every operational record (Sales, Receipts, Inventory, Expenses, Customers, Shifts, Stock Movement) MUST be tagged with `branch_id`.
- **Branch Context**: Pull `currentBranch.id` from `useAuth()` context for single-branch staff (Cashier, Waiter, Technician).
- **Consolidated HQ / Owner View**: For authorized multi-branch roles (`Tenant Owner`, `Super Admin`, `Accountant`, `Auditor`), components MUST provide a branch filter toggle (`Current Branch` vs `🌐 All Branches Consolidated` vs `🏢 Corporate HQ Overhead`).

---

## 3. 🏭 Multi-Industry Taxonomy & Module Adaptability (`activeModule`)
- **30 Industry Modules**: DukaPOS supports 30 distinct industry verticals (`Retail`, `Restaurant`, `Pharmacy`, `Hardware`, `Construction`, `Law`, `SACCO`, `RealEstate`, `Bar`, `Hotel`, `Poultry`, `Garage`, `FuelStation`, `TechnicalCompany`, `BusinessConsulting`, etc.).
- **Dynamic Module Presets**: Never hardcode single-industry assumptions. Components, form dropdowns, KPIs, receipt templates, and terminology MUST adapt dynamically based on `activeModule` from `useModule()`.
- **Future-Proof Extensibility**: Always provide a generic fallback / fuzzy matcher and allow custom user entries (e.g. custom categories, custom units, custom attributes) so future or unlisted industry modules work seamlessly out-of-the-box.

---

## 🛡️ Execution Checklist for Every New Feature / Optimization
Before declaring any task, feature, or optimization complete:
1. [ ] Is the data strictly scoped by `tenant_id`?
2. [ ] Is the data correctly scoped by `branch_id` (with HQ / All Branches option for owners)?
3. [ ] Does the UI & logic dynamically adapt across all present & future industry modules?
4. [ ] Are types strictly typed with zero demo fallback placeholders?
5. [ ] Does `npm run build` pass cleanly with exit code 0?
