/**
 * Thin executor adapter contract.
 *
 * AIWorker integrates external agent runtimes (Codex CLI, Claude Code CLI,
 * ACP, Cursor, MCP, OpenAI-compatible HTTP, Hermes/OpenClaw spike, ...) via
 * narrow adapters. The contract is intentionally small:
 *
 * 1. **Health / readiness**: `health()` returns a `ServiceStatus` snapshot;
 *    no deep capability inventory.
 * 2. **Run**: `run(input)` streams `AgentEvent` items so the orchestrator stays
 *    transport-agnostic regardless of the underlying wire format.
 * 3. **Cancel**: cooperative — orchestrator passes `AgentRunInput.signal`; the
 *    adapter stops generating events when the signal aborts.
 * 4. **Resume (optional)**: when the engine exposes a native session/thread
 *    binding, adapters honour `AgentRunInput.engineBinding`. Engines without
 *    native resume ignore the field; orchestrator falls back to in-prompt
 *    history.
 * 5. **Error classification**: thrown errors should carry `kind` so
 *    fallback / retry layers can branch deterministically (see
 *    `FallbackExecutor.onErrorKinds`).
 *
 * Explicit non-promises:
 *
 * - **No isolation**: the adapter does not sandbox the engine, scrub
 *   environment variables, or hide user/host-level MCP servers, skills,
 *   plugins, auth state, or native sessions. Operators run engines in their
 *   own user/host environment.
 * - **No effective capability source of truth**: `.aiworker/executor-capabilities.json`
 *   is at most a project overlay / bootstrap hint that some engines accept
 *   via best-effort projection; AIWorker does not enumerate or guarantee the
 *   effective capability set the engine actually loads.
 * - **No tool loop ownership**: tool invocation, approval policy, sandbox
 *   profile, model fallback inside a single turn — those belong to the
 *   engine. AIWorker only normalises the events that come out.
 */
import type { ServiceStatus } from '../types'
import type { AgentEvent, EngineSessionBinding } from './agent-event'
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
  /**
   * Cached provider-native session/thread binding for this logical worker
   * session. Executors that do not support native resume ignore this field.
   */
  engineBinding?: EngineSessionBinding
}

/**
 * Thin adapter for an external agent runtime. See the file header for the
 * full contract; this interface enforces the minimum surface AIWorker depends
 * on to schedule a turn against any engine. Adapters MAY extend their concrete
 * class with engine-specific helpers, but those must not leak into the
 * orchestrator.
 */
export interface ExecutorProvider {
  /** Stable provider identifier, e.g. `openai-compatible`. */
  readonly name: string
  /**
   * Cheap readiness probe. Returns a `ServiceStatus` snapshot — adapters
   * SHOULD NOT make multi-second probes here; deeper checks belong in
   * dedicated diagnostics commands.
   */
  health: () => Promise<ServiceStatus>
  /**
   * Tools the adapter is willing to advertise to the orchestrator. Engines
   * that own their own tool registry (Codex, Claude Code) usually return an
   * empty list and let the engine drive tools internally.
   */
  listTools: () => Promise<ExecutorTool[]>
  /**
   * Stream a single agent turn. Implementations emit `AgentEvent` entries
   * regardless of the underlying wire format (OpenAI chat completions, Claude
   * Code control protocol, ACP, JSON-RPC, ...). Cancellation is cooperative
   * via `input.signal`. Engine-native session resume is opt-in via
   * `input.engineBinding`.
   */
  run: (input: AgentRunInput) => AsyncIterable<AgentEvent>
}
