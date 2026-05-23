import type { SoulAppHealthStatus, SoulAppInstallSourceKind, SoulAppManifest, SoulAppManifestValidationIssue, SoulAppRegistryStatus } from '@zonease/aiworker-shared'

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

export const workerOverlayAssets = sqliteTable(
  'worker_overlay_assets',
  {
    workerId: text('worker_id').notNull().references(() => workers.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    kind: text('kind', { enum: ['entry-file', 'mcp-client', 'skill'] }).notNull(),
    target: text('target').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    content: text('content').notNull(),
    metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
    updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    workerAssetUniqueIdx: uniqueIndex('worker_overlay_assets_worker_kind_target_id_idx').on(table.workerId, table.kind, table.target, table.id),
    workerKindIdx: index('worker_overlay_assets_worker_kind_idx').on(table.workerId, table.kind),
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
    status: text('status', { enum: ['active', 'completed', 'failed', 'cancelled'] }).notNull().default('active'),
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

export const turns = sqliteTable(
  'turns',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    input: text('input').notNull(),
    response: text('response'),
    status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'] }).notNull().default('queued'),
    error: text('error'),
    metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
    updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    sessionSeqIdx: index('turns_session_seq_idx').on(table.sessionId, table.seq),
    sessionSeqUniqueIdx: uniqueIndex('turns_session_seq_unique_idx').on(table.sessionId, table.seq),
    statusUpdatedAtIdx: index('turns_status_updated_at_idx').on(table.status, table.updatedAt),
  }),
)

export const engineInvocations = sqliteTable(
  'engine_invocations',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    turnId: text('turn_id').notNull().references(() => turns.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    engineId: text('engine_id').notNull(),
    engineCommand: text('engine_command'),
    status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'] }).notNull().default('queued'),
    prompt: text('prompt').notNull(),
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
    turnIdx: index('engine_invocations_turn_idx').on(table.turnId),
  }),
)

export const workerEngineInvocations = sqliteTable(
  'worker_engine_invocations',
  {
    id: text('id').primaryKey(),
    workerId: text('worker_id').notNull().references(() => workers.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    engineId: text('engine_id').notNull(),
    engineCommand: text('engine_command'),
    status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'] }).notNull().default('queued'),
    cwd: text('cwd').notNull(),
    inputRef: text('input_ref'),
    stdoutRef: text('stdout_ref'),
    stderrRef: text('stderr_ref'),
    exitCode: integer('exit_code'),
    signal: text('signal'),
    metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
    updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    engineUpdatedAtIdx: index('worker_engine_invocations_engine_updated_at_idx').on(table.engineId, table.updatedAt),
    statusUpdatedAtIdx: index('worker_engine_invocations_status_updated_at_idx').on(table.status, table.updatedAt),
    workerSeqUniqueIdx: uniqueIndex('worker_engine_invocations_worker_seq_unique_idx').on(table.workerId, table.seq),
    workerUpdatedAtIdx: index('worker_engine_invocations_worker_updated_at_idx').on(table.workerId, table.updatedAt),
  }),
)

export const sessionEvents = sqliteTable(
  'session_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    turnId: text('turn_id').references(() => turns.id, { onDelete: 'set null' }),
    invocationId: text('invocation_id').references(() => engineInvocations.id, { onDelete: 'set null' }),
    seq: integer('seq').notNull(),
    type: text('type', {
      enum: ['status', 'assistant_delta', 'tool', 'file_change', 'artifact', 'error', 'log'],
    }).notNull(),
    payloadJson: text('payload_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    sessionCreatedAtIdx: index('session_events_session_created_at_idx').on(table.sessionId, table.createdAt),
    sessionSeqIdx: index('session_events_session_seq_idx').on(table.sessionId, table.seq),
    sessionSeqUniqueIdx: uniqueIndex('session_events_session_seq_unique_idx').on(table.sessionId, table.seq),
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
    sourceKind: text('source_kind', { enum: ['manifest-path', 'inline'] }).$type<SoulAppInstallSourceKind>().notNull(),
    sourceRef: text('source_ref').notNull(),
    manifestDigest: text('manifest_digest').notNull(),
    manifestJson: text('manifest_json', { mode: 'json' }).$type<SoulAppManifest>().notNull(),
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
  pk: text('pk').primaryKey().default('default'),
  configJson: text('config_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  updatedBy: text('updated_by', { enum: ['bootstrap', 'api', 'cli'] }),
})
