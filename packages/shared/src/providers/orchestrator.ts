/** A single message in a chat exchange between user, assistant, and tools. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /** Optional author label (e.g. tool name when role is `tool`). */
  name?: string
  /** Identifier of the tool call this message is responding to, when role is `tool`. */
  toolCallId?: string
}

/** Lifecycle state of an orchestrated agent task. */
export type AgentTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

/** A unit of work scheduled by the orchestrator and executed via a provider. */
export interface AgentTask {
  id: string
  status: AgentTaskStatus
  /** Conversation transcript driving this task. */
  messages: ChatMessage[]
  /** ISO 8601 timestamp when the task was accepted. */
  createdAt: string
  /** ISO 8601 timestamp of the last status change. */
  updatedAt: string
  /** Free-form result payload produced on success. */
  result?: Record<string, unknown>
  /** Error message set when `status === 'failed'`. */
  error?: string
}
