import type { SoulAppHealthStatus, SoulAppInstallSourceKind, SoulAppManifestValidationIssue, SoulAppRegistryStatus, SoulDescriptorV1 } from '@zonease/aiworker-soul-protocol'

import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const nowIso = () => new Date().toISOString()

export const workers = sqliteTable(
  'workers',
  {
    id: text('id').primaryKey(),
    soulId: text('soul_id').notNull(),
    name: text('name').notNull(),
    status: text('status', { enum: ['active', 'paused', 'disabled'] }).notNull().default('active'),
    defaultEngineId: text('default_engine_id'),
    metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
    updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    soulIdx: index('workers_soul_idx').on(table.soulId),
    statusUpdatedAtIdx: index('workers_status_updated_at_idx').on(table.status, table.updatedAt),
  }),
)

export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    workerId: text('worker_id').notNull().references(() => workers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rootPath: text('root_path').notNull(),
    type: text('type').notNull().default('workspace'),
    status: text('status', { enum: ['active', 'archived'] }).notNull().default('active'),
    sourcePointersJson: text('source_pointers_json', { mode: 'json' }).$type<Record<string, unknown>[]>().notNull().$defaultFn(() => []),
    metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
    updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    rootPathIdx: uniqueIndex('workspaces_root_path_idx').on(table.rootPath),
    statusUpdatedAtIdx: index('workspaces_status_updated_at_idx').on(table.status, table.updatedAt),
    workerUpdatedAtIdx: index('workspaces_worker_updated_at_idx').on(table.workerId, table.updatedAt),
  }),
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    workerId: text('worker_id').notNull().references(() => workers.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    capabilityTemplateId: text('capability_template_id').notNull(),
    title: text('title').notNull(),
    context: text('context').notNull().default(''),
    status: text('status', { enum: ['active', 'archived', 'deleted'] }).notNull().default('active'),
    metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
    startedAt: text('started_at'),
    endedAt: text('ended_at'),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
    updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    capabilityUpdatedAtIdx: index('sessions_capability_updated_at_idx').on(table.capabilityTemplateId, table.updatedAt),
    statusUpdatedAtIdx: index('sessions_status_updated_at_idx').on(table.status, table.updatedAt),
    workerUpdatedAtIdx: index('sessions_worker_updated_at_idx').on(table.workerId, table.updatedAt),
    workspaceUpdatedAtIdx: index('sessions_workspace_updated_at_idx').on(table.workspaceId, table.updatedAt),
  }),
)

export const engineInvocations = sqliteTable(
  'engine_invocations',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    engineId: text('engine_id').notNull(),
    engineCommand: text('engine_command'),
    status: text('invocation_status', { enum: ['queued', 'starting', 'running', 'succeeded', 'failed', 'cancelled', 'lost'] }).notNull().default('queued'),
    processState: text('process_state', { enum: ['not_spawned', 'spawned', 'exited', 'killed', 'lost'] }).notNull().default('not_spawned'),
    projectionReceiptId: text('projection_receipt_id'),
    externalSessionRef: text('external_session_ref'),
    rawLogRef: text('raw_log_ref'),
    eventLogRef: text('event_log_ref'),
    failureCode: text('failure_code'),
    inputRef: text('input_ref').notNull(),
    summary: text('summary'),
    error: text('error'),
    metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
    updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    engineUpdatedAtIdx: index('engine_invocations_engine_updated_at_idx').on(table.engineId, table.updatedAt),
    sessionSeqIdx: index('engine_invocations_session_seq_idx').on(table.sessionId, table.seq),
    statusUpdatedAtIdx: index('engine_invocations_status_updated_at_idx').on(table.status, table.updatedAt),
  }),
)

export const bridgeEvents = sqliteTable(
  'bridge_events',
  {
    id: integer('event_id').primaryKey({ autoIncrement: true }),
    invocationId: text('invocation_id').notNull().references(() => engineInvocations.id, { onDelete: 'cascade' }),
    eventType: text('event_type', {
      enum: ['invocation.status', 'engine.output', 'engine.tool', 'process.event', 'diagnostic', 'error'],
    }).notNull(),
    eventJson: text('event_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    invocationCreatedAtIdx: index('bridge_events_invocation_created_at_idx').on(table.invocationId, table.createdAt),
  }),
)

export const files = sqliteTable(
  'files',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    kind: text('kind', { enum: ['file', 'directory', 'generated', 'uploaded'] }).notNull().default('file'),
    size: integer('size'),
    mtime: integer('mtime'),
    hash: text('hash'),
    source: text('source', { enum: ['user', 'session', 'system'] }).notNull().default('user'),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
    updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    kindIdx: index('files_kind_idx').on(table.kind),
    pathUniqueIdx: uniqueIndex('files_workspace_path_idx').on(table.workspaceId, table.path),
    workspaceUpdatedAtIdx: index('files_workspace_updated_at_idx').on(table.workspaceId, table.updatedAt),
  }),
)

export const soulApps = sqliteTable(
  'soul_apps',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    version: text('version').notNull(),
    protocol: text('protocol').notNull(),
    soulId: text('soul_id').notNull(),
    status: text('status', { enum: ['installed', 'enabled', 'disabled', 'error'] }).$type<SoulAppRegistryStatus>().notNull().default('installed'),
    sourceKind: text('source_kind', { enum: ['descriptor-path', 'inline'] }).$type<SoulAppInstallSourceKind>().notNull(),
    sourceRef: text('source_ref').notNull(),
    manifestDigest: text('manifest_digest').notNull(),
    manifestJson: text('manifest_json', { mode: 'json' }).$type<SoulDescriptorV1>().notNull(),
    validationIssuesJson: text('validation_issues_json', { mode: 'json' }).$type<SoulAppManifestValidationIssue[]>().notNull().$defaultFn(() => []),
    healthStatus: text('health_status', { enum: ['unknown', 'pass', 'warn', 'fail'] }).$type<SoulAppHealthStatus>().notNull().default('unknown'),
    healthMessage: text('health_message'),
    installedAt: text('installed_at').notNull().$defaultFn(nowIso),
    enabledAt: text('enabled_at'),
    disabledAt: text('disabled_at'),
    lastHealthcheckAt: text('last_healthcheck_at'),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
    updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    digestIdx: index('soul_apps_manifest_digest_idx').on(table.manifestDigest),
    soulIdx: index('soul_apps_soul_idx').on(table.soulId),
    statusUpdatedAtIdx: index('soul_apps_status_updated_at_idx').on(table.status, table.updatedAt),
  }),
)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
})

export const workerIdentity = sqliteTable('worker_identity', {
  pk: text('pk').primaryKey().default('default'),
  workerId: text('worker_id').notNull().unique(),
  apiTokenEnc: text('api_token_enc').notNull(),
  nonce: text('nonce').notNull(),
  authTag: text('auth_tag').notNull(),
  bootstrapShownAt: text('bootstrap_shown_at').notNull().$defaultFn(nowIso),
  createdAt: text('created_at').notNull().$defaultFn(nowIso),
  rotatedAt: text('rotated_at'),
})

export const workerConfig = sqliteTable('worker_config', {
  workerId: text('worker_id').notNull().references(() => workers.id, { onDelete: 'cascade' }),
  configKey: text('config_key').notNull(),
  configValueJson: text('config_value_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  source: text('source', { enum: ['app-owned-api', 'bootstrap', 'cli', 'descriptor', 'migration', 'web'] }).notNull().default('cli'),
  createdAt: text('created_at').notNull().$defaultFn(nowIso),
  updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
}, table => ({
  workerConfigUniqueIdx: uniqueIndex('worker_config_worker_key_idx').on(table.workerId, table.configKey),
}))
