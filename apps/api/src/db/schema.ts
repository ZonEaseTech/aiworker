import type { ToolCall } from '@aiworker/shared'
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
  conversationId: text('conversation_id'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const skillConflicts = sqliteTable('skill_conflicts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  skillName: text('skill_name').notNull(),
  brainHash: text('brain_hash').notNull(),
  executorHash: text('executor_hash').notNull(),
  resolution: text('resolution', { enum: ['pending', 'brain', 'executor', 'manual'] }).notNull().default('pending'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const agentTasks = sqliteTable('agent_tasks', {
  id: text('id').primaryKey(),
  prompt: text('prompt').notNull(),
  status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'] }).notNull(),
  conversationId: text('conversation_id'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  finishedAt: text('finished_at'),
  result: text('result', { mode: 'json' }).$type<Record<string, unknown>>(),
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => agentTasks.id),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: text('conversation_id').notNull().references(() => conversations.id),
  role: text('role', { enum: ['system', 'user', 'assistant', 'tool'] }).notNull(),
  content: text('content').notNull(),
  toolCalls: text('tool_calls', { mode: 'json' }).$type<ToolCall[]>(),
  toolCallId: text('tool_call_id'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})
