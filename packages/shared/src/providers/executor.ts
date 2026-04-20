import type { ServiceStatus } from '../types'
import type { ChatMessage, ToolCall } from './orchestrator'

/** Tool advertised by an executor provider for the orchestrator to invoke. */
export interface ExecutorTool {
  name: string
  description: string
  /** JSON Schema describing the tool's accepted arguments. */
  inputSchema: Record<string, unknown>
}

/** Input payload for a streamed chat run. */
export interface ChatRunInput {
  messages: ChatMessage[]
  /** Model identifier, provider-specific. */
  model?: string
  /** Names of tools (from `listTools()`) to expose for this run. */
  tools?: string[]
  /**
   * Full tool definitions to expose inline for this run. Executors that accept
   * per-call schemas (rather than only pre-registered tool names) should send
   * these as the tool list to the underlying model.
   */
  toolDefinitions?: ExecutorTool[]
  /** Sampling temperature, when supported by the underlying model. */
  temperature?: number
  /** Optional abort signal to cancel the stream. */
  signal?: AbortSignal
}

/** Reason a chat run finished. */
export type ChatFinishReason = 'stop' | 'tool' | 'length' | 'error'

/** Token usage reported by the executor for a chat run. */
export interface ChatUsage {
  inputTokens: number
  outputTokens: number
}

/** A single chunk yielded by a streamed chat run. */
export type ChatStreamChunk
  = | { type: 'text', delta: string }
    | { type: 'tool_call', call: ToolCall }
    | { type: 'finish', reason: ChatFinishReason, usage?: ChatUsage }
    | { type: 'error', error: string }

/** Abstract executor provider responsible for running chat/tool workloads. */
export interface ExecutorProvider {
  /** Stable provider identifier, e.g. `openclaw`. */
  readonly name: string
  health: () => Promise<ServiceStatus>
  listTools: () => Promise<ExecutorTool[]>
  runChat: (input: ChatRunInput) => AsyncIterable<ChatStreamChunk>
}
