# Running integration tests

These integration tests exercise DB-level behaviors and require a running Postgres instance pointed to by the DATABASE_URL environment variable.

Examples:

Run a single test:

  DATABASE_URL=postgres://user:pass@localhost:5432/mydb node test/upsertProduct.integration.test.js

Run the outbox smoke test:

  DATABASE_URL=postgres://user:pass@localhost:5432/mydb node test/outbox.smoke.test.js

Notes:
- Tests will skip if required tables (products, outbox) are missing. Run migrations in migrations/ before running tests.
