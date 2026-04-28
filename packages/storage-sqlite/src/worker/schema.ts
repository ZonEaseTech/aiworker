import type { ChannelType, SkillBindingSource, SkillDraftSource, SkillDraftStatus, ToolCall, WorkerConfig } from '@zonease/aiworker-shared'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * worker.db — owned by a single worker container. Every row belongs to the
 * same worker, so no `workerId` column is needed: the whole file is scoped.
 */

export const agentTasks = sqliteTable(
  'agent_tasks',
  {
    id: text('id').primaryKey(),
    prompt: text('prompt').notNull(),
    status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'] }).notNull(),
    conversationId: text('conversation_id'),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    finishedAt: text('finished_at'),
    result: text('result', { mode: 'json' }).$type<Record<string, unknown>>(),
    error: text('error'),
  },
  table => ({
    createdAtIdx: index('agent_tasks_created_at_idx').on(table.createdAt),
  }),
)

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').references(() => agentTasks.id),
    channel: text('channel').$type<ChannelType>().notNull(),
    chatId: text('chat_id').notNull(),
    threadId: text('thread_id'),
    status: text('status', { enum: ['open', 'closed'] }).notNull().default('open'),
    summary: text('summary'),
    startedAt: text('started_at').notNull().$defaultFn(() => new Date().toISOString()),
    lastActiveAt: text('last_active_at').notNull().$defaultFn(() => new Date().toISOString()),
    closedAt: text('closed_at'),
  },
  table => ({
    // findOpenConversation: WHERE channel=? AND chatId=? [AND threadId=?] AND status=?
    lookupIdx: index('conversations_lookup_idx').on(table.channel, table.chatId, table.threadId, table.status),
    // ORDER BY last_active_at DESC LIMIT 200（SQLite 可反向扫普通索引）
    lastActiveAtIdx: index('conversations_last_active_at_idx').on(table.lastActiveAt),
  }),
)

export const sessionEntries = sqliteTable(
  'session_entries',
  {
    sessionKey: text('session_key').primaryKey(),
    currentConversationId: text('current_conversation_id').notNull().references(() => conversations.id),
    channel: text('channel').$type<ChannelType>().notNull(),
    chatId: text('chat_id').notNull(),
    threadId: text('thread_id'),
    accountId: text('account_id'),
    status: text('status', { enum: ['active', 'closed'] }).notNull().default('active'),
    sessionStartedAt: text('session_started_at').notNull().$defaultFn(() => new Date().toISOString()),
    lastInteractionAt: text('last_interaction_at').notNull().$defaultFn(() => new Date().toISOString()),
    resetAt: text('reset_at'),
    resetReason: text('reset_reason'),
    contextTokens: integer('context_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    totalTokensFresh: integer('total_tokens_fresh').notNull().default(0),
    compactionCount: integer('compaction_count').notNull().default(0),
    memoryFlushAt: text('memory_flush_at'),
    memoryFlushCompactionCount: integer('memory_flush_compaction_count').notNull().default(0),
    engineBindings: text('engine_bindings', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => ({
    currentConversationIdIdx: index('session_entries_current_conversation_id_idx').on(table.currentConversationId),
    lastInteractionAtIdx: index('session_entries_last_interaction_at_idx').on(table.lastInteractionAt),
  }),
)

export const messages = sqliteTable(
  'messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['system', 'user', 'assistant', 'tool'] }).notNull(),
    content: text('content').notNull(),
    toolCalls: text('tool_calls', { mode: 'json' }).$type<ToolCall[]>(),
    toolCallId: text('tool_call_id'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    // JSON 字符串：envelope 附带的 reply / edit / delete / reactions 等元信息。
    richMetadata: text('rich_metadata'),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => ({
    conversationIdIdx: index('messages_conversation_id_idx').on(table.conversationId),
  }),
)

export const executionLogs = sqliteTable(
  'execution_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: text('conversation_id'),
    toolName: text('tool_name').notNull(),
    params: text('params', { mode: 'json' }).$type<Record<string, unknown>>(),
    result: text('result', { mode: 'json' }).$type<Record<string, unknown>>(),
    duration: integer('duration'),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => ({
    conversationIdIdx: index('execution_logs_conversation_id_idx').on(table.conversationId),
  }),
)

export const skillBindings = sqliteTable(
  'skill_bindings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    source: text('source').$type<SkillBindingSource>().notNull(),
    brainName: text('brain_name'),
    skillName: text('skill_name').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    priority: integer('priority').notNull().default(0),
    config: text('config', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => ({
    uniqueBinding: uniqueIndex('skill_bindings_source_brain_name_idx').on(table.source, table.brainName, table.skillName),
  }),
)

export const skillDrafts = sqliteTable('skill_drafts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  proposedName: text('proposed_name').notNull(),
  source: text('source').$type<SkillDraftSource>().notNull(),
  bodyMarkdown: text('body_markdown').notNull(),
  rationale: text('rationale').notNull().default(''),
  status: text('status').$type<SkillDraftStatus>().notNull().default('pending'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  decidedAt: text('decided_at'),
  decidedBy: text('decided_by'),
})

export const evolutionObservations = sqliteTable(
  'evolution_observations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: text('conversation_id'),
    kind: text('kind').notNull(),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    noticedAt: text('noticed_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => ({
    noticedAtIdx: index('evolution_observations_noticed_at_idx').on(table.noticedAt),
  }),
)

// Singleton table: `pk` is always the literal 'default'. Enforced at app layer.
export const workerIdentity = sqliteTable('worker_identity', {
  pk: text('pk').primaryKey().default('default'),
  workerId: text('worker_id').notNull().unique(),
  apiTokenEnc: text('api_token_enc').notNull(),
  nonce: text('nonce').notNull(),
  authTag: text('auth_tag').notNull(),
  bootstrapShownAt: text('bootstrap_shown_at').notNull().$defaultFn(() => new Date().toISOString()),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  rotatedAt: text('rotated_at'),
})

// Singleton table: `pk` is always the literal 'default'. Enforced at app layer.
export const workerConfig = sqliteTable('worker_config', {
  pk: text('pk').primaryKey().default('default'),
  configJson: text('config_json', { mode: 'json' }).$type<WorkerConfig>().notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedBy: text('updated_by', { enum: ['bootstrap', 'api', 'cli'] }),
})

/**
 * `cron_jobs` 是 worker 自驱调度的存储位（PLAN-014 §F4）。
 * tick loop 每分钟扫描一次：所有 `enabled=true` 且 `nextRunAt <= now()` 的 row
 * 都会被合成 envelope 喂给 orchestrator.ingest，然后用 cron-parser 算出新的
 * nextRunAt。`accountId` 在 PLAN-014 S1 后随 envelope 必填，cron 默认填
 * `sys:cron`，operator 也可以显式填自定义值（与 web binding.id 形成命名空间隔离）。
 */
export const cronJobs = sqliteTable(
  'cron_jobs',
  {
    id: text('id').primaryKey(),
    expression: text('expression').notNull(),
    prompt: text('prompt').notNull(),
    channel: text('channel').$type<ChannelType>().notNull(),
    chatId: text('chat_id').notNull(),
    accountId: text('account_id').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    lastRunAt: text('last_run_at'),
    nextRunAt: text('next_run_at'),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => ({
    // tick: WHERE enabled=true AND next_run_at <= now —— 复合索引让 planner 走 range scan
    dueIdx: index('cron_jobs_due_idx').on(table.enabled, table.nextRunAt),
  }),
)

export const workerSecrets = sqliteTable('worker_secrets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  valueEnc: text('value_enc').notNull(),
  nonce: text('nonce').notNull(),
  authTag: text('auth_tag').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})
