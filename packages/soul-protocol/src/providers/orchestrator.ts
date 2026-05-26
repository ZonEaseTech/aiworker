/** A tool invocation requested by the model during a chat run. */
export interface ToolCall {
  /** Provider-assigned identifier, used to correlate the tool response. */
  id: string
  name: string
  arguments: Record<string, unknown>
}

/** A single message in a chat exchange between user, assistant, and tools. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /** Optional author label (e.g. tool name when role is `tool`). */
  name?: string
  /** Tool calls emitted by an assistant turn. */
  toolCalls?: ToolCall[]
  /** Identifier of the tool call this message is responding to, when role is `tool`. */
  toolCallId?: string
}

/** Lifecycle state of an orchestrated agent task. */
export type AgentTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

/** A unit of work scheduled by the orchestrator and executed via a provider. */
export interface AgentTask {
  id: string
  /** Initial user prompt that seeded this task. */
  prompt: string
  status: AgentTaskStatus
  /** Conversation that owns this task's transcript. */
  conversationId?: string
  /** ISO 8601 timestamp when the task was accepted. */
  createdAt: string
  /** ISO 8601 timestamp when the task entered a terminal state. */
  finishedAt?: string
  /** Free-form result payload produced on success. */
  result?: Record<string, unknown>
  /** Error message set when `status === 'failed'`. */
  error?: string
}
