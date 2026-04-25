/**
 * Wire types for `cursor-agent -p --output-format=stream-json`. The output is
 * NDJSON where each line has a top-level `type` discriminator, similar in
 * spirit to the Claude Code stream-json format. Engine-internal; only
 * `AgentEvent` crosses the orchestrator boundary.
 *
 * FEAT-016 normalises the kinds below; unknown `type` values are no-ops so
 * CLI version drift doesn't crash the pipeline.
 */

/** Cursor finish reasons surfaced to the harness. */
export type CursorStopReason
  = | 'stop'
    | 'end_turn'
    | 'length'
    | 'cancelled'
    | 'error'

/** `type: "system"` lines — emitted once on session init. */
export interface CursorSystemLine {
  type: 'system'
  subtype?: string
  session_id?: string
  model?: string
}

/** Incremental or full assistant text. */
export interface CursorAssistantMessageLine {
  type: 'assistant_message'
  delta?: string
  text?: string
}

/** Optional thinking/reasoning trace. */
export interface CursorThinkingLine {
  type: 'thinking'
  delta?: string
  text?: string
}

/** Tool invocation start. */
export interface CursorToolUseLine {
  type: 'tool_use'
  id: string
  name: string
  input?: Record<string, unknown>
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
}

/** Tool invocation result. */
export interface CursorToolResultLine {
  type: 'tool_result'
  id: string
  name?: string
  content?: string
  isError?: boolean
  is_error?: boolean
}

/** Token usage snapshot. */
export interface CursorTokenUsageLine {
  type: 'token_usage'
  usage: {
    input_tokens?: number
    output_tokens?: number
  }
}

/** Final line of the turn — `stop` and `end` are treated identically. */
export interface CursorStopLine {
  type: 'stop' | 'end'
  reason?: CursorStopReason
  session_id?: string
  usage?: CursorTokenUsageLine['usage']
}

/** Free-form error line. */
export interface CursorErrorLine {
  type: 'error'
  message: string
}

/** Any recognised stdout line. Unknown `type` values fall through to `default`. */
export type CursorStdoutLine
  = | CursorSystemLine
    | CursorAssistantMessageLine
    | CursorThinkingLine
    | CursorToolUseLine
    | CursorToolResultLine
    | CursorTokenUsageLine
    | CursorStopLine
    | CursorErrorLine
    | { type: string, [key: string]: unknown }
