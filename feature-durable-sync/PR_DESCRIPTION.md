This branch contains the refactor for durable sync and canonical product write helpers.

Summary of changes:
- Added server-helpers/db-writes.js: canonical upsertProduct/deleteProduct/applyProductFromSync helpers.
- Planned endpoint refactors to use these helpers and transactional sync-batch processing.

Next steps (not committed here):
- Replace endpoint inline SQL with helper calls
- Add transactional handling for /api/products/sync-batch and /api/sync/push
- Add unit/integration tests and migration notes

If you want me to apply the endpoint changes and tests, grant write access or provide file paths.
