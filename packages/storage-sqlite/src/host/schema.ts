import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const nowIso = () => new Date().toISOString()

export const hostAssignments = sqliteTable('host_assignments', {
  assignmentId: text('assignment_id').primaryKey(),
  assignedEmail: text('assigned_email').notNull(),
  serverRef: text('server_ref').notNull(),
  soulReleaseRef: text('soul_release_ref').notNull(),
  workerId: text('worker_id'),
  workerVersion: text('worker_version'),
  workbenchUrl: text('workbench_url'),
  status: text('status', {
    enum: ['draft', 'provisioning', 'checked_in', 'access_ready', 'ready', 'needs_attention', 'revoked', 'archived'],
  }).notNull().default('provisioning'),
  provisionTokenHash: text('provision_token_hash').notNull(),
  provisionTokenExpiresAt: text('provision_token_expires_at').notNull(),
  provisionTokenConsumedAt: text('provision_token_consumed_at'),
  metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
  createdAt: text('created_at').notNull().$defaultFn(nowIso),
  updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  checkedInAt: text('checked_in_at'),
  accessReadyAt: text('access_ready_at'),
  revokedAt: text('revoked_at'),
  revokedBy: text('revoked_by'),
}, table => ({
  assignedEmailIdx: index('host_assignments_assigned_email_idx').on(table.assignedEmail),
  statusUpdatedAtIdx: index('host_assignments_status_updated_at_idx').on(table.status, table.updatedAt),
  workerIdUniqueIdx: uniqueIndex('host_assignments_worker_id_unique_idx').on(table.workerId),
}))
