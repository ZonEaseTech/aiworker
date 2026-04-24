/**
 * `@aiworker/storage-sqlite` — single-file SQLite storage for both fleet.db
 * (manager registry) and worker.db (per-worker runtime state). Physical
 * isolation between the two is enforced by the `fleet` / `worker` subpaths;
 * consumers should import from the subpath that matches their data domain.
 *
 * This barrel re-exports both surfaces so CLI tooling and migrations can
 * reach everything from one place, but route handlers should prefer the
 * subpath import to keep their blast radius narrow.
 */
export * as fleet from './fleet'
export * as worker from './worker'
