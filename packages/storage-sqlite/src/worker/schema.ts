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

export const sessionEvents = sqliteTable(
  'session_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    turnId: text('turn_id').references(() => turns.id, { onDelete: 'set null' }),
    invocationId: text('invocation_id').references(() => engineInvocations.id, { onDelete: 'set null' }),
    seq: integer('seq').notNull(),
    type: text('type', {
      enum: ['status', 'assistant_delta', 'tool', 'file_change', 'artifact', 'review', 'lesson', 'error', 'log'],
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

export const artifacts = sqliteTable(
  'artifacts',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    turnId: text('turn_id').references(() => turns.id, { onDelete: 'set null' }),
    invocationId: text('invocation_id').references(() => engineInvocations.id, { onDelete: 'set null' }),
    path: text('path').notNull(),
    kind: text('kind').notNull().default('file'),
    title: text('title').notNull(),
    status: text('status', { enum: ['available', 'missing', 'archived'] }).notNull().default('available'),
    metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
    updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    sessionUpdatedAtIdx: index('artifacts_session_updated_at_idx').on(table.sessionId, table.updatedAt),
    statusUpdatedAtIdx: index('artifacts_status_updated_at_idx').on(table.status, table.updatedAt),
    workspaceUpdatedAtIdx: index('artifacts_workspace_updated_at_idx').on(table.workspaceId, table.updatedAt),
  }),
)

export const reviews = sqliteTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    turnId: text('turn_id').references(() => turns.id, { onDelete: 'set null' }),
    artifactId: text('artifact_id').references(() => artifacts.id, { onDelete: 'set null' }),
    verdict: text('verdict', { enum: ['pass', 'warn', 'fail', 'needs_review'] }).notNull().default('needs_review'),
    findingsJson: text('findings_json', { mode: 'json' }).$type<Record<string, unknown>[]>().notNull().$defaultFn(() => []),
    risksJson: text('risks_json', { mode: 'json' }).$type<Record<string, unknown>[]>().notNull().$defaultFn(() => []),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    artifactCreatedAtIdx: index('reviews_artifact_created_at_idx').on(table.artifactId, table.createdAt),
    sessionCreatedAtIdx: index('reviews_session_created_at_idx').on(table.sessionId, table.createdAt),
    workspaceCreatedAtIdx: index('reviews_workspace_created_at_idx').on(table.workspaceId, table.createdAt),
  }),
)

export const lessons = sqliteTable(
  'lessons',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    sourceReviewId: text('source_review_id').references(() => reviews.id, { onDelete: 'set null' }),
    statement: text('statement').notNull(),
    evidenceJson: text('evidence_json', { mode: 'json' }).$type<Record<string, unknown>[]>().notNull().$defaultFn(() => []),
    status: text('status', { enum: ['proposed', 'accepted', 'rejected'] }).notNull().default('proposed'),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
    updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    statusUpdatedAtIdx: index('lessons_status_updated_at_idx').on(table.status, table.updatedAt),
    workspaceUpdatedAtIdx: index('lessons_workspace_updated_at_idx').on(table.workspaceId, table.updatedAt),
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

export const workerSecrets = sqliteTable('worker_secrets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  valueEnc: text('value_enc').notNull(),
  nonce: text('nonce').notNull(),
  authTag: text('auth_tag').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(nowIso),
  updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
})
