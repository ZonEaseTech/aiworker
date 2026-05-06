import type { ChatMessage, ConversationDecision, Envelope, ExecutorProvider } from '@zonease/aiworker-shared'
import type { conversations as conversationsTable } from '@zonease/aiworker-storage-sqlite/worker'
import { redactBodySecrets } from '@zonease/aiworker-shared'
import { conversations, getSessionEntry, getWorkerDb, messages, sessionEntries } from '@zonease/aiworker-storage-sqlite/worker'

import consola from 'consola'
import { and, desc, eq, isNull } from 'drizzle-orm'

const MAX_RECENT_MESSAGES = 4
const CONVERSATION_CLASSIFIER_TEMPLATE_ID = 'conversation-classifier-v1'
const RAW_OUTPUT_LIMIT = 2048
type ConversationRow = typeof conversationsTable.$inferSelect

function truncateRedactedRawOutput(raw: string): string {
  const redacted = redactBodySecrets(raw).body
  return redacted.length > RAW_OUTPUT_LIMIT ? `${redacted.slice(0, RAW_OUTPUT_LIMIT)}…[truncated]` : redacted
}

export function resolveSessionKey(envelope: Envelope): string {
  const parts = [envelope.channel, envelope.accountId, envelope.chatId]
  if (envelope.threadId !== undefined)
    parts.push(envelope.threadId)
  return parts.map(encodeURIComponent).join(':')
}

export async function findSessionConversation(sessionKey: string): Promise<ConversationRow | null> {
  const entry = getSessionEntry(sessionKey)
  if (!entry || entry.status !== 'active')
    return null

  const db = getWorkerDb()
  return db.select()
    .from(conversations)
    .where(and(eq(conversations.id, entry.currentConversationId), eq(conversations.status, 'open')))
    .get() ?? null
}

export async function hasSessionEntryForRoute(envelope: Envelope): Promise<boolean> {
  const db = getWorkerDb()
  const where = envelope.threadId
    ? and(eq(sessionEntries.channel, envelope.channel), eq(sessionEntries.chatId, envelope.chatId), eq(sessionEntries.threadId, envelope.threadId))
    : and(eq(sessionEntries.channel, envelope.channel), eq(sessionEntries.chatId, envelope.chatId), isNull(sessionEntries.threadId))
  return db.select({ sessionKey: sessionEntries.sessionKey }).from(sessionEntries).where(where).limit(1).get() !== undefined
}

export async function findOpenConversation(envelope: Envelope): Promise<ConversationRow | null> {
  const db = getWorkerDb()
  const where = envelope.threadId
    ? and(eq(conversations.channel, envelope.channel), eq(conversations.chatId, envelope.chatId), eq(conversations.threadId, envelope.threadId), eq(conversations.status, 'open'))
    : and(eq(conversations.channel, envelope.channel), eq(conversations.chatId, envelope.chatId), isNull(conversations.threadId), eq(conversations.status, 'open'))
  return db.select().from(conversations).where(where).orderBy(desc(conversations.lastActiveAt)).get() ?? null
}

function systemPrompt(): string {
  return [
    'You classify whether a new inbound message continues the previous conversation or opens a new topic.',
    'Consider topic continuity, referent continuity, time and channel context.',
    'Respond with a single JSON object: {"continue": boolean, "reason": string (<=80 chars)}',
    'Do not include any other text.',
  ].join('\n')
}

function buildPrompt(priorSummary: string | null, recent: Array<{ role: string, content: string }>, incoming: string): ChatMessage[] {
  const lines: string[] = []
  if (priorSummary)
    lines.push(`Prior summary: ${priorSummary}`)
  if (recent.length > 0) {
    lines.push('Recent messages:')
    for (const r of recent)
      lines.push(`- ${r.role}: ${r.content.slice(0, 400)}`)
  }
  lines.push(`New incoming message: ${incoming}`)
  return [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: lines.join('\n') },
  ]
}

/**
 * Agent-driven conversation boundary: let the worker's own executor decide
 * whether the new message continues the prior conversation or starts fresh.
 */
export async function classifyContinuation(
  executor: ExecutorProvider,
  model: string | undefined,
  priorSummary: string | null,
  recent: Array<{ role: string, content: string }>,
  incoming: string,
  workspacePath?: string,
  engine?: string,
): Promise<ConversationDecision> {
  const input = {
    messages: buildPrompt(priorSummary, recent, incoming),
    ...(model ? { model } : {}),
    ...(workspacePath ? { workspacePath } : {}),
    temperature: 0,
    tools: [],
  }
  const provenance = {
    ...(engine === undefined ? {} : { engine }),
    ...(model === undefined ? {} : { model }),
    templateId: CONVERSATION_CLASSIFIER_TEMPLATE_ID,
    attempt: 1,
  }
  let text = ''
  try {
    for await (const event of executor.run(input)) {
      if (event.type === 'assistant_message_delta')
        text += event.delta
      else if (event.type === 'error')
        throw new Error(event.error)
    }
  }
  catch (err) {
    const error = String(err)
    consola.warn(`[conversation] classifier error, defaulting to continue: ${error}`)
    const rawOutput = text.length > 0 ? truncateRedactedRawOutput(text) : undefined
    return {
      continue: true,
      reason: 'classifier-error-default-continue',
      source: 'classifier-fallback',
      evaluator: 'none',
      ...provenance,
      ...(rawOutput === undefined ? {} : { rawOutput }),
      parseError: error,
    }
  }
  let parsed: { continue?: unknown, reason?: unknown } | null = null
  try {
    parsed = JSON.parse(text.trim())
  }
  catch (err) {
    return {
      continue: true,
      reason: 'non-json-classifier-output',
      source: 'classifier-fallback',
      evaluator: 'heuristic',
      ...provenance,
      rawOutput: truncateRedactedRawOutput(text),
      parseError: String(err),
    }
  }
  if (parsed && typeof parsed.continue === 'boolean') {
    return {
      continue: parsed.continue,
      reason: String(parsed.reason ?? ''),
      source: 'classifier-llm',
      evaluator: 'llm',
      ...provenance,
    }
  }
  return {
    continue: true,
    reason: 'malformed-response',
    source: 'classifier-fallback',
    evaluator: 'heuristic',
    ...provenance,
    rawOutput: truncateRedactedRawOutput(text),
    parseError: 'classifier output missing boolean `continue` field',
  }
}

export async function loadRecentMessages(conversationId: string, limit = MAX_RECENT_MESSAGES) {
  const db = getWorkerDb()
  const rows = db.select({
    role: messages.role,
    content: messages.content,
    richMetadata: messages.richMetadata,
  })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.id))
    .limit(limit * 3)
    .all()
    .filter(row => !isTranscriptAuditEntry(row))
    .slice(0, limit)
  return rows.reverse().map(row => ({ role: row.role, content: row.content }))
}

function isTranscriptAuditEntry(row: { role: string, richMetadata: string | null }): boolean {
  if (row.role !== 'system' || row.richMetadata === null)
    return false
  try {
    const metadata = JSON.parse(row.richMetadata) as { kind?: unknown }
    return metadata.kind === 'compaction' || metadata.kind === 'memory-flush'
  }
  catch {
    return false
  }
}
