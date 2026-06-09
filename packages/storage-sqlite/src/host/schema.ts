import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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
  accessTokenHash: text('access_token_hash'),
  accessTokenIssuedAt: text('access_token_issued_at'),
  accessTokenExpiresAt: text('access_token_expires_at'),
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

export const hostSoulReleases = sqliteTable('host_soul_releases', {
  releaseRef: text('release_ref').primaryKey(),
  soulId: text('soul_id').notNull(),
  name: text('name').notNull(),
  version: integer('version').notNull(),
  descriptorJson: text('descriptor_json').notNull(),
  source: text('source', { enum: ['official', 'custom'] }).notNull().default('custom'),
  publishedBy: text('published_by').notNull(),
  publishedAt: text('published_at').notNull().$defaultFn(nowIso),
}, table => ({
  soulIdIdx: index('host_soul_releases_soul_id_idx').on(table.soulId),
  soulIdVersionUniqueIdx: uniqueIndex('host_soul_releases_soul_id_version_unique_idx').on(table.soulId, table.version),
}))

export const hostUserAuthorizations = sqliteTable('host_user_authorizations', {
  email: text('email').notNull(),
  permission: text('permission', { enum: ['host:admin'] }).notNull(),
  source: text('source', { enum: ['bootstrap', 'manual'] }).notNull(),
  createdAt: text('created_at').notNull().$defaultFn(nowIso),
  updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
}, table => ({
  emailPermissionUniqueIdx: uniqueIndex('host_user_authorizations_email_permission_unique_idx').on(table.email, table.permission),
  permissionEmailIdx: index('host_user_authorizations_permission_email_idx').on(table.permission, table.email),
}))
