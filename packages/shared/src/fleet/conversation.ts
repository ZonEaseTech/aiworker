import type { ChannelType } from './channel'

/** Open = still accepting new messages; closed = sealed, next inbound starts a new conversation. */
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

/** Decision returned by the Agent-driven conversation classifier. */
export interface ConversationDecision {
  /** If true, attach the incoming message to the existing conversation. */
  continue: boolean
  /** Short natural-language rationale emitted by the classifier. */
  reason: string
}

/** Input fed into the classifier before each inbound message is routed. */
export interface ConversationClassificationInput {
  priorSummary?: string
  recentMessages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool', content: string }>
  incoming: string
}
