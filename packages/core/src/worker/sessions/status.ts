import type { WorkerConfig } from '@zonease/aiworker-shared'
import type { SessionEntryRow } from '@zonease/aiworker-storage-sqlite/worker'
import { conversations, getSessionEntry, getWorkerDb, messages, sessionEntries } from '@zonease/aiworker-storage-sqlite/worker'
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm'

const DEFAULT_SESSION_LIST_LIMIT = 50
const MAX_SESSION_LIST_LIMIT = 200
const DEFAULT_MAINTENANCE_LIMIT = 50
const MAX_MAINTENANCE_LIMIT = 200
const DEFAULT_CLOSED_TRANSCRIPT_RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export type SessionEntryStatus = 'active' | 'closed'
export type BindingValueType = 'array' | 'boolean' | 'null' | 'number' | 'object' | 'string' | 'unknown'
export type MemoryFlushStatus = 'current' | 'never' | 'not-needed' | 'stale'

export interface EngineBindingSummary {
  engine: string
  present: boolean
  valueType: BindingValueType
  fieldCount: number
  fields: string[]
  redacted: true
}

export interface SessionStatusDto {
  sessionKey: string
  sessionId: string
  currentConversationId: string
  route: {
    channel: string
    chatId: string
    threadId: string | null
    accountId: string | null
  }
  lifecycle: {
    status: SessionEntryStatus
    sessionStartedAt: string
    lastInteractionAt: string
    resetAt: string | null
    resetReason: string | null
    createdAt: string
    updatedAt: string
  }
  context: {
    contextTokens: number
    totalTokens: number
    totalTokensFresh: number
    compactionCount: number
  }
  memoryFlush: {
    status: MemoryFlushStatus
    at: string | null
    compactionCount: number
    memoryFlushCompactionCount: number
  }
  engineBindings: {
    configuredEngine: string
    configured: EngineBindingSummary
    all: EngineBindingSummary[]
  }
}

export interface SessionStatusPage {
  sessions: SessionStatusDto[]
  page: {
    limit: number
    offset: number
    hasMore: boolean
  }
}

export interface ListSessionStatusOptions {
  config?: WorkerConfig
  limit?: number
  offset?: number
  status?: SessionEntryStatus
}

export interface ClosedTranscriptMaintenanceOptions {
  now?: Date | string
  olderThanDays?: number
  limit?: number
  apply?: boolean
}

export interface ClosedTranscriptMaintenanceItem {
  conversationId: string
  channel: string
  chatId: string
  threadId: string | null
  closedAt: string
  lastActiveAt: string
  messageCount: number
}

export interface ClosedTranscriptMaintenanceResult {
  action: 'prune-closed-transcripts'
  mode: 'apply' | 'dry-run'
  cutoff: string
  olderThanDays: number
  limit: number
  planned: {
    conversations: number
    messages: number
    transcripts: ClosedTranscriptMaintenanceItem[]
  }
  applied: {
    conversationsDeleted: number
    messagesDeleted: number
  }
}

export function listSessionStatuses(options: ListSessionStatusOptions = {}): SessionStatusPage {
  const limit = boundedInteger(options.limit, DEFAULT_SESSION_LIST_LIMIT, 1, MAX_SESSION_LIST_LIMIT)
  const offset = boundedInteger(options.offset, 0, 0, Number.MAX_SAFE_INTEGER)
  const db = getWorkerDb()

  const rows = options.status === undefined
    ? db
        .select()
        .from(sessionEntries)
        .orderBy(desc(sessionEntries.lastInteractionAt))
        .limit(limit + 1)
        .offset(offset)
        .all()
    : db
        .select()
        .from(sessionEntries)
        .where(eq(sessionEntries.status, options.status))
        .orderBy(desc(sessionEntries.lastInteractionAt))
        .limit(limit + 1)
        .offset(offset)
        .all()
  const pageRows = rows.slice(0, limit)

  return {
    sessions: pageRows.map(row => toSessionStatusDto(row, options.config)),
    page: {
      limit,
      offset,
      hasMore: rows.length > limit,
    },
  }
}

export function getSessionStatus(sessionKey: string, config?: WorkerConfig): SessionStatusDto | null {
  const row = getSessionEntry(sessionKey)
  return row === null ? null : toSessionStatusDto(row, config)
}

export function runClosedTranscriptMaintenance(options: ClosedTranscriptMaintenanceOptions = {}): ClosedTranscriptMaintenanceResult {
  const apply = options.apply === true
  const plan = planClosedTranscriptMaintenance(options)
  if (!apply || plan.planned.transcripts.length === 0) {
    return {
      ...plan,
      mode: apply ? 'apply' : 'dry-run',
      applied: {
        conversationsDeleted: 0,
        messagesDeleted: 0,
      },
    }
  }

  const db = getWorkerDb()
  const plannedIds = plan.planned.transcripts.map(t => t.conversationId)
  db
    .delete(conversations)
    .where(and(
      inArray(conversations.id, plannedIds),
      sql`${conversations.status} = 'closed'
        AND ${conversations.closedAt} IS NOT NULL
        AND ${conversations.closedAt} <= ${plan.cutoff}
        AND ${conversations.id} NOT IN (SELECT ${sessionEntries.currentConversationId} FROM ${sessionEntries})`,
    ))
    .run()

  const remaining = db
    .select({ id: conversations.id })
    .from(conversations)
    .where(inArray(conversations.id, plannedIds))
    .all()
  const remainingIds = new Set(remaining.map(row => row.id))
  const appliedTranscripts = plan.planned.transcripts.filter(item => !remainingIds.has(item.conversationId))

  return {
    ...plan,
    mode: 'apply',
    applied: {
      conversationsDeleted: appliedTranscripts.length,
      messagesDeleted: appliedTranscripts.reduce((sum, item) => sum + item.messageCount, 0),
    },
  }
}

export function planClosedTranscriptMaintenance(options: ClosedTranscriptMaintenanceOptions = {}): ClosedTranscriptMaintenanceResult {
  const olderThanDays = boundedInteger(options.olderThanDays, DEFAULT_CLOSED_TRANSCRIPT_RETENTION_DAYS, 0, 3650)
  const limit = boundedInteger(options.limit, DEFAULT_MAINTENANCE_LIMIT, 1, MAX_MAINTENANCE_LIMIT)
  const cutoff = resolveCutoff(options.now, olderThanDays)
  const db = getWorkerDb()

  const candidates = db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      chatId: conversations.chatId,
      threadId: conversations.threadId,
      closedAt: conversations.closedAt,
      lastActiveAt: conversations.lastActiveAt,
    })
    .from(conversations)
    .where(sql`${conversations.status} = 'closed'
      AND ${conversations.closedAt} IS NOT NULL
      AND ${conversations.closedAt} <= ${cutoff}
      AND ${conversations.id} NOT IN (SELECT ${sessionEntries.currentConversationId} FROM ${sessionEntries})`)
    .orderBy(asc(conversations.closedAt), asc(conversations.id))
    .limit(limit)
    .all()

  const countsByConversation = countMessages(candidates.map(c => c.id))
  const transcripts = candidates.map(row => ({
    conversationId: row.id,
    channel: row.channel,
    chatId: row.chatId,
    threadId: row.threadId,
    closedAt: row.closedAt ?? '',
    lastActiveAt: row.lastActiveAt,
    messageCount: countsByConversation.get(row.id) ?? 0,
  }))
  const messagesPlanned = transcripts.reduce((sum, item) => sum + item.messageCount, 0)

  return {
    action: 'prune-closed-transcripts',
    mode: 'dry-run',
    cutoff,
    olderThanDays,
    limit,
    planned: {
      conversations: transcripts.length,
      messages: messagesPlanned,
      transcripts,
    },
    applied: {
      conversationsDeleted: 0,
      messagesDeleted: 0,
    },
  }
}

function toSessionStatusDto(row: SessionEntryRow, config: WorkerConfig | undefined): SessionStatusDto {
  const configuredEngine = resolveConfiguredEngine(config)
  const bindings = isRecord(row.engineBindings) ? row.engineBindings : {}
  const configured = summarizeBinding(configuredEngine, bindings[configuredEngine], hasOwn(bindings, configuredEngine))
  const all = Object.keys(bindings)
    .sort()
    .map(engine => summarizeBinding(engine, bindings[engine], true))

  return {
    sessionKey: row.sessionKey,
    sessionId: row.currentConversationId,
    currentConversationId: row.currentConversationId,
    route: {
      channel: row.channel,
      chatId: row.chatId,
      threadId: row.threadId,
      accountId: row.accountId,
    },
    lifecycle: {
      status: row.status,
      sessionStartedAt: row.sessionStartedAt,
      lastInteractionAt: row.lastInteractionAt,
      resetAt: row.resetAt,
      resetReason: row.resetReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    context: {
      contextTokens: row.contextTokens,
      totalTokens: row.totalTokens,
      totalTokensFresh: row.totalTokensFresh,
      compactionCount: row.compactionCount,
    },
    memoryFlush: {
      status: summarizeMemoryFlush(row),
      at: row.memoryFlushAt,
      compactionCount: row.compactionCount,
      memoryFlushCompactionCount: row.memoryFlushCompactionCount,
    },
    engineBindings: {
      configuredEngine,
      configured,
      all,
    },
  }
}

function summarizeBinding(engine: string, value: unknown, present: boolean): EngineBindingSummary {
  const fields = isRecord(value) ? Object.keys(value).sort() : []
  return {
    engine,
    present,
    valueType: present ? valueType(value) : 'unknown',
    fieldCount: fields.length,
    fields,
    redacted: true,
  }
}

function summarizeMemoryFlush(row: SessionEntryRow): MemoryFlushStatus {
  if (row.compactionCount === 0)
    return 'not-needed'
  if (row.memoryFlushAt === null)
    return 'never'
  return row.memoryFlushCompactionCount >= row.compactionCount ? 'current' : 'stale'
}

function resolveConfiguredEngine(config: WorkerConfig | undefined): string {
  const maybe = config as { executor?: { engine?: unknown } } | undefined
  const engine = maybe?.executor?.engine
  return typeof engine === 'string' && engine.length > 0 ? engine : 'unknown'
}

function countMessages(conversationIds: string[]): Map<string, number> {
  if (conversationIds.length === 0)
    return new Map()

  const rows = getWorkerDb()
    .select({
      conversationId: messages.conversationId,
      value: count(),
    })
    .from(messages)
    .where(inArray(messages.conversationId, conversationIds))
    .groupBy(messages.conversationId)
    .all()

  return new Map(rows.map(row => [row.conversationId, row.value]))
}

function resolveCutoff(now: Date | string | undefined, olderThanDays: number): string {
  const base = now === undefined ? new Date() : new Date(now)
  return new Date(base.getTime() - olderThanDays * DAY_MS).toISOString()
}

function valueType(value: unknown): BindingValueType {
  if (value === null)
    return 'null'
  if (Array.isArray(value))
    return 'array'
  const type = typeof value
  if (type === 'boolean' || type === 'number' || type === 'object' || type === 'string')
    return type
  return 'unknown'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isInteger(value))
    return fallback
  return Math.max(min, Math.min(max, value))
}
