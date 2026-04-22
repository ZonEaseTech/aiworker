import type { ServiceStatus } from '../types'
import type { AgentEvent } from './agent-event'
import type { ChatMessage } from './orchestrator'

/** Tool advertised by an executor provider for the orchestrator to invoke. */
export interface ExecutorTool {
  name: string
  description: string
  /** JSON Schema describing the tool's accepted arguments. */
  inputSchema: Record<string, unknown>
}

/** Input payload for a streamed agent run. */
export interface AgentRunInput {
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
  /** Optional abort signal to cancel the run. */
  signal?: AbortSignal
  /**
   * Per-conversation workspace directory to run agentic-CLI executors in.
   * Engines that don't spawn a CLI (e.g. OpenAI-compat chat) ignore this
   * field. Orchestrator owns the lifecycle; path-escape guard lives in
   * `workspace.ts`. See PLAN-007 architectural commitment #4.
   */
  workspacePath?: string
}

/** Abstract executor provider responsible for running agent workloads. */
export interface ExecutorProvider {
  /** Stable provider identifier, e.g. `openai-compatible`. */
  readonly name: string
  health: () => Promise<ServiceStatus>
  listTools: () => Promise<ExecutorTool[]>
  /**
   * Stream a single agent turn. Implementations emit `AgentEvent` entries
   * regardless of the underlying wire format (OpenAI chat completions, Claude
   * Code control protocol, ACP, JSON-RPC, ...).
   */
  run: (input: AgentRunInput) => AsyncIterable<AgentEvent>
}
