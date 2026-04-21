import type { WorkerConfig, WorkerStatus } from '@aiworker/shared'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * fleet.db — owned by the dashboard container. Workers' operational data lives
 * in their own worker.db; this file only tracks the registry + secrets + audit.
 */

export const workers = sqliteTable('workers', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status', { enum: ['active', 'paused', 'archived'] }).$type<WorkerStatus>().notNull().default('active'),
  containerId: text('container_id'),
  containerImage: text('container_image').notNull(),
  configVersion: integer('config_version').notNull().default(1),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const workerConfigs = sqliteTable('worker_configs', {
  workerId: text('worker_id').primaryKey().references(() => workers.id, { onDelete: 'cascade' }),
  configJson: text('config_json', { mode: 'json' }).$type<WorkerConfig>().notNull(),
  version: integer('version').notNull(),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const workerSecrets = sqliteTable(
  'worker_secrets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workerId: text('worker_id').notNull().references(() => workers.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    valueEnc: text('value_enc').notNull(),
    nonce: text('nonce').notNull(),
    authTag: text('auth_tag').notNull(),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => ({
    workerKeyIdx: uniqueIndex('worker_secrets_worker_key_idx').on(table.workerId, table.key),
  }),
)

export const auditEvents = sqliteTable('audit_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  at: text('at').notNull().$defaultFn(() => new Date().toISOString()),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  workerId: text('worker_id'),
  detail: text('detail', { mode: 'json' }).$type<Record<string, unknown>>(),
})
