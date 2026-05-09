import type { ChannelType } from './channel'

/** Open = still accepting new entries; closed = sealed, next inbound starts a new thread. */
export type ConversationStatus = 'open' | 'closed'

/** Persisted state of a conversation on a worker. */
export interface ConversationState {
  id: string
  taskId?: string
  channel: ChannelType
  chatId: string
  threadId?: string
  status: ConversationStatus
  summary?: string
  startedAt: string
  lastActiveAt: string
  closedAt?: string
}

/** Path that produced the conversation classifier decision. */
export type ConversationClassifierSource
  = | 'classifier-llm'
    | 'classifier-fallback'
    | 'classifier-disabled'

/** Whether the classifier actually ran an LLM, ran a heuristic, or did nothing. */
export type ConversationClassifierEvaluator = 'llm' | 'heuristic' | 'none'

/**
 * Decision returned by the Agent-driven conversation classifier (PLAN-116).
 *
 * Truthfulness contract: every decision carries enough provenance for an
 * operator to tell whether the LLM ran, whether it produced valid JSON, and
 * which fallback path triggered if it did not. Diagnostic fields (`rawOutput`,
 * `parseError`) are only populated on the fallback path; the happy path stays
 * lightweight.
 */
export interface ConversationDecision {
  /** If true, attach the incoming message to the existing conversation. */
  continue: boolean
  /** Short natural-language rationale (≤80 chars) summarising the choice. */
  reason: string
  /** Which decision path was taken. */
  source: ConversationClassifierSource
  /** What actually computed the decision (LLM, heuristic fallback, or skipped). */
  evaluator: ConversationClassifierEvaluator
  /** Engine identifier when the classifier invoked an executor. */
  engine?: string
  /** Model identifier when the classifier invoked an executor. */
  model?: string
  /** Stable prompt template id; see `conversation/router.ts`. */
  templateId?: string
  /** 1-based attempt counter (currently always 1; reserved for retry support). */
  attempt?: number
  /** Raw classifier output (≤2KB, redacted). Only populated on fallback paths. */
  rawOutput?: string
  /** Parse / schema / executor error message. Only populated on fallback paths. */
  parseError?: string
}

/** Input fed into the classifier before each inbound message is routed. */
export interface ConversationClassificationInput {
  priorSummary?: string
  recentMessages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool', content: string }>
  incoming: string
}
