import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const syncEvents = sqliteTable('sync_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  source: text('source').notNull(),
  target: text('target').notNull(),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed'] }).notNull().default('pending'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const executionLogs = sqliteTable('execution_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  issueId: text('issue_id').notNull(),
  toolName: text('tool_name').notNull(),
  params: text('params', { mode: 'json' }).$type<Record<string, unknown>>(),
  result: text('result', { mode: 'json' }).$type<Record<string, unknown>>(),
  duration: integer('duration'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const skillConflicts = sqliteTable('skill_conflicts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  skillName: text('skill_name').notNull(),
  hermesHash: text('hermes_hash').notNull(),
  openclawHash: text('openclaw_hash').notNull(),
  resolution: text('resolution', { enum: ['pending', 'hermes', 'openclaw', 'manual'] }).notNull().default('pending'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})
