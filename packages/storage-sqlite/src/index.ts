/**
 * `@zonease/aiworker-storage-sqlite` stores Host-local worker, workspace,
 * session, artifact and Soul App metadata in worker.db.
 * Business files remain in workspace folders; the DB stores indexes and
 * provenance.
 */
export * as worker from './worker'
