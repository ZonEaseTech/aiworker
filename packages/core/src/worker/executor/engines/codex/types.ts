/**
 * Wire types for `@openai/codex app-server` — JSON-RPC 2.0 over stdio (ndjson).
 * Engine-internal; only `AgentEvent` crosses the orchestrator boundary.
 *
 * Lifecycle owned by the host:
 *   - legacy Codex app-server:
 *     `initialize` → `thread_start` (or `thread_fork`) → `newTurn` → events…
 *   - current Codex app-server:
 *     `initialize` → (`thread/start` | `thread/resume`) → `turn/start` → events…
 *
 * The Codex app-server emits progress as JSON-RPC notifications on methods
 * prefixed `codex/event/*`. FEAT-016 only normalises the events listed below;
 * unknown event methods are no-ops so CLI version drift doesn't crash the
 * pipeline.
 */

export type CodexEventMethod
  = | 'codex/event/assistant_message'
    | 'codex/event/thinking'
    | 'codex/event/token_usage'
    | 'codex/event/tool_call'
    | 'codex/event/tool_result'
    | 'codex/event/stop'
    | 'codex/event/error'

/** Codex approval policy passthrough when operators explicitly set one via native args/profile support. */
export type CodexApprovalPolicy = 'never' | 'on-request' | 'on-failure' | 'untrusted'

/** Params sent with `thread_start`. Only `model` is populated by FEAT-016. */
export interface CodexThreadStartParams {
  model?: string
  approval_policy?: CodexApprovalPolicy
  sandbox?: 'never' | 'read-only' | 'workspace-write' | 'danger-full-access'
  model_reasoning_effort?: 'none' | 'low' | 'medium' | 'high'
}

/** Result envelope of `thread_start` / `thread_fork`. */
export interface CodexThreadStartResult {
  threadId: string
}

/** Result envelope of current `thread/start`. */
export interface CodexCurrentThreadStartResult {
  thread: {
    id: string
    path?: string | null
  }
}

/** Params sent with current `thread/start`. */
export interface CodexCurrentThreadStartParams {
  model?: string
  cwd?: string
  approvalPolicy?: CodexApprovalPolicy
  persistExtendedHistory?: boolean
  experimentalRawEvents?: boolean
}

/** Params sent with current `thread/resume`. */
export interface CodexCurrentThreadResumeParams {
  threadId: string
  model?: string
  cwd?: string
  approvalPolicy?: CodexApprovalPolicy
  persistExtendedHistory?: boolean
}

/** Result of current `thread/resume`. */
export interface CodexCurrentThreadResumeResult {
  thread: {
    id: string
    path?: string | null
  }
}

/** Params sent with `newTurn`. Prompt text is sent verbatim from the user message. */
export interface CodexNewTurnParams {
  threadId: string
  prompt: string
}

/** Result of `newTurn` — arrives after `codex/event/stop` has been emitted. */
export interface CodexNewTurnResult {
  stopReason?: CodexStopReason
}

/** Params sent with current `turn/start`. */
export interface CodexCurrentTurnStartParams {
  threadId: string
  input: Array<{
    type: 'text'
    text: string
  }>
}

export interface CodexCurrentTurnStartResult {
  turn: {
    id: string
    status: 'inProgress' | 'completed' | 'failed' | string
  }
}

/** Codex turn stop reasons surfaced to the harness. */
export type CodexStopReason
  = | 'stop'
    | 'max_tokens'
    | 'cancelled'
    | 'error'

export interface CodexAssistantMessageEvent {
  /** Incremental text delta when the CLI streams; full when it buffers. */
  delta?: string
  /** Aggregate text when the CLI only emits the final message. */
  text?: string
}

export interface CodexThinkingEvent {
  delta?: string
  text?: string
}

export interface CodexTokenUsageEvent {
  usage: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }
}

export interface CodexToolCallEvent {
  id: string
  name: string
  arguments?: Record<string, unknown>
  /** Optional status tracker (pending → in_progress → completed/failed). */
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
}

export interface CodexToolResultEvent {
  id: string
  /** Free-form string payload (CLI flattens structured results to text). */
  content?: string
  isError?: boolean
}

export interface CodexCurrentRawResponseItemEvent {
  item?: CodexCurrentRawFunctionCallItem | CodexCurrentRawFunctionCallOutputItem | Record<string, unknown>
}

export interface CodexCurrentItemEvent {
  item?: CodexCurrentCommandExecutionItem | Record<string, unknown>
}

export interface CodexCurrentRawFunctionCallItem {
  type: 'function_call'
  name?: string
  arguments?: string | Record<string, unknown>
  call_id?: string
  id?: string
}

export interface CodexCurrentRawFunctionCallOutputItem {
  type: 'function_call_output'
  call_id?: string
  id?: string
  output?: string
}

export interface CodexCurrentCommandExecutionItem {
  type: 'commandExecution'
  id?: string
  command?: string
  cwd?: string
  source?: string
  status?: 'inProgress' | 'completed' | 'failed' | 'cancelled' | string
  exitCode?: number | null
  durationMs?: number | null
  aggregatedOutput?: string | null
}

export interface CodexStopEvent {
  reason?: CodexStopReason
  /** Optional trailing usage tally mirrored from `token_usage`. */
  usage?: CodexTokenUsageEvent['usage']
}

export interface CodexErrorEvent {
  message: string
}

/** Discriminated union of known Codex notifications, keyed by JSON-RPC method. */
export type CodexKnownEvent
  = | { method: 'codex/event/assistant_message', params: CodexAssistantMessageEvent }
    | { method: 'codex/event/thinking', params: CodexThinkingEvent }
    | { method: 'codex/event/token_usage', params: CodexTokenUsageEvent }
    | { method: 'codex/event/tool_call', params: CodexToolCallEvent }
    | { method: 'codex/event/tool_result', params: CodexToolResultEvent }
    | { method: 'codex/event/stop', params: CodexStopEvent }
    | { method: 'codex/event/error', params: CodexErrorEvent }
    | { method: 'rawResponseItem/completed', params: CodexCurrentRawResponseItemEvent }
    | { method: 'item/started', params: CodexCurrentItemEvent }
    | { method: 'item/completed', params: CodexCurrentItemEvent }
