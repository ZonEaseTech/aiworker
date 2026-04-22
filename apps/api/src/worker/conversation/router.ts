import type { ChatMessage, ConversationDecision, Envelope, ExecutorProvider } from '@aiworker/shared'
import type { conversations as conversationsTable } from '../../db/worker/schema'
import consola from 'consola'
import { and, desc, eq } from 'drizzle-orm'

import { getWorkerDb } from '../../db/worker'
import { conversations, messages } from '../../db/worker/schema'

const MAX_RECENT_MESSAGES = 4

export async function findOpenConversation(envelope: Envelope): Promise<typeof conversationsTable.$inferSelect | null> {
  const db = getWorkerDb()
  const where = envelope.threadId
    ? and(eq(conversations.channel, envelope.channel), eq(conversations.chatId, envelope.chatId), eq(conversations.threadId, envelope.threadId), eq(conversations.status, 'open'))
    : and(eq(conversations.channel, envelope.channel), eq(conversations.chatId, envelope.chatId), eq(conversations.status, 'open'))
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
): Promise<ConversationDecision> {
  const input = {
    messages: buildPrompt(priorSummary, recent, incoming),
    ...(model ? { model } : {}),
    ...(workspacePath ? { workspacePath } : {}),
    temperature: 0,
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
    consola.warn(`[conversation] classifier error, defaulting to continue: ${String(err)}`)
    return { continue: true, reason: 'classifier-error-default-continue' }
  }
  try {
    const parsed = JSON.parse(text.trim()) as ConversationDecision
    if (typeof parsed.continue === 'boolean')
      return { continue: parsed.continue, reason: String(parsed.reason ?? '') }
    return { continue: true, reason: 'malformed-response' }
  }
  catch {
    return { continue: true, reason: 'non-json-classifier-output' }
  }
}

export async function loadRecentMessages(conversationId: string, limit = MAX_RECENT_MESSAGES) {
  const db = getWorkerDb()
  const rows = db.select({
    role: messages.role,
    content: messages.content,
  })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.id))
    .limit(limit)
    .all()
  return rows.reverse()
}
