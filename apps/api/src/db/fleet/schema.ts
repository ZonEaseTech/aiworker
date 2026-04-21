import type { RegisteredWorkerLivenessState, RegisteredWorkerOrigin } from '@aiworker/shared'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * fleet.db — owned by the manager container. Under PLAN-004 the manager is a
 * registry: worker identity, config and secrets all live in the worker's own
 * worker.db. This schema therefore only tracks pointers + audit.
 */

export const registeredWorkers = sqliteTable('registered_workers', {
  id: text('id').primaryKey(),
  baseUrl: text('base_url').notNull(),
  displayName: text('display_name').notNull(),
  apiTokenEnc: text('api_token_enc').notNull(),
  nonce: text('nonce').notNull(),
  authTag: text('auth_tag').notNull(),
  addedAt: text('added_at').notNull().$defaultFn(() => new Date().toISOString()),
  addedBy: text('added_by').$type<RegisteredWorkerOrigin>().notNull(),
  lastSeenAt: text('last_seen_at'),
  lastSeenState: text('last_seen_state').$type<RegisteredWorkerLivenessState>(),
  lastConfigVersion: integer('last_config_version'),
})

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    at: text('at').notNull().$defaultFn(() => new Date().toISOString()),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    workerId: text('worker_id'),
    detail: text('detail', { mode: 'json' }).$type<Record<string, unknown>>(),
  },
  table => ({
    workerIdIdx: index('audit_events_worker_id_idx').on(table.workerId),
  }),
)
