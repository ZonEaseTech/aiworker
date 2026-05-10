import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const nowIso = () => new Date().toISOString()

export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    rootPath: text('root_path').notNull(),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
    updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    rootPathIdx: uniqueIndex('workspaces_root_path_idx').on(table.rootPath),
    updatedAtIdx: index('workspaces_updated_at_idx').on(table.updatedAt),
  }),
)

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    selectedSoulId: text('selected_soul_id').notNull().default('hr'),
    selectedSkillId: text('selected_skill_id').notNull().default('candidate-screen'),
    status: text('status', { enum: ['draft', 'queued', 'running', 'completed', 'failed', 'cancelled'] }).notNull().default('draft'),
    metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
    updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    soulUpdatedAtIdx: index('projects_soul_updated_at_idx').on(table.selectedSoulId, table.updatedAt),
    statusUpdatedAtIdx: index('projects_status_updated_at_idx').on(table.status, table.updatedAt),
    workspaceUpdatedAtIdx: index('projects_workspace_updated_at_idx').on(table.workspaceId, table.updatedAt),
  }),
)

export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'] }).notNull().default('queued'),
    executor: text('executor').notNull(),
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
    projectUpdatedAtIdx: index('runs_project_updated_at_idx').on(table.projectId, table.updatedAt),
    statusUpdatedAtIdx: index('runs_status_updated_at_idx').on(table.status, table.updatedAt),
    workspaceUpdatedAtIdx: index('runs_workspace_updated_at_idx').on(table.workspaceId, table.updatedAt),
  }),
)

export const runEvents = sqliteTable(
  'run_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    type: text('type', {
      enum: ['status', 'assistant_delta', 'tool', 'file_change', 'artifact', 'review', 'lesson', 'error', 'log'],
    }).notNull(),
    payloadJson: text('payload_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    runSeqIdx: index('run_events_run_seq_idx').on(table.runId, table.seq),
    runSeqUniqueIdx: uniqueIndex('run_events_run_seq_unique_idx').on(table.runId, table.seq),
    runCreatedAtIdx: index('run_events_run_created_at_idx').on(table.runId, table.createdAt),
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
    source: text('source', { enum: ['user', 'run', 'system'] }).notNull().default('user'),
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
    runId: text('run_id').references(() => runs.id, { onDelete: 'set null' }),
    path: text('path').notNull(),
    kind: text('kind').notNull().default('file'),
    title: text('title').notNull(),
    status: text('status', { enum: ['available', 'missing', 'archived'] }).notNull().default('available'),
    metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
    updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    runUpdatedAtIdx: index('artifacts_run_updated_at_idx').on(table.runId, table.updatedAt),
    statusUpdatedAtIdx: index('artifacts_status_updated_at_idx').on(table.status, table.updatedAt),
    workspaceUpdatedAtIdx: index('artifacts_workspace_updated_at_idx').on(table.workspaceId, table.updatedAt),
  }),
)

export const reviews = sqliteTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    runId: text('run_id').references(() => runs.id, { onDelete: 'set null' }),
    artifactId: text('artifact_id').references(() => artifacts.id, { onDelete: 'set null' }),
    verdict: text('verdict', { enum: ['pass', 'warn', 'fail', 'needs_review'] }).notNull().default('needs_review'),
    findingsJson: text('findings_json', { mode: 'json' }).$type<Record<string, unknown>[]>().notNull().$defaultFn(() => []),
    risksJson: text('risks_json', { mode: 'json' }).$type<Record<string, unknown>[]>().notNull().$defaultFn(() => []),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    artifactCreatedAtIdx: index('reviews_artifact_created_at_idx').on(table.artifactId, table.createdAt),
    runCreatedAtIdx: index('reviews_run_created_at_idx').on(table.runId, table.createdAt),
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
