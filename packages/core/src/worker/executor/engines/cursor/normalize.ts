import type { AgentEvent, AgentFinishReason, ToolAction } from '@zonease/aiworker-shared'
import type {
  CursorAssistantMessageLine,
  CursorStdoutLine,
  CursorStopLine,
  CursorStopReason,
  CursorThinkingLine,
  CursorTokenUsageLine,
  CursorToolResultLine,
  CursorToolUseLine,
} from './types'

// Re-export the NDJSON splitter from claude-code so we don't maintain two
// copies of identical logic. The parse step is cursor-specific (different
// type discriminators), so it lives locally below.
export { splitNdjson } from '../claude-code/normalize'

/** Parse one NDJSON line; returns `null` on malformed JSON so callers can skip. */
export function parseCursorLine(line: string): CursorStdoutLine | null {
  try {
    const parsed = JSON.parse(line) as unknown
    if (parsed && typeof parsed === 'object' && 'type' in parsed && typeof (parsed as { type: unknown }).type === 'string')
      return parsed as CursorStdoutLine
    return null
  }
  catch {
    return null
  }
}

/**
 * Translate one `cursor-agent` stream-json line into zero or more AgentEvents.
 * Unknown `type` values return `[]` so forward-compatible streams don't crash
 * the harness.
 *
 * Session-id extraction is delegated to the harness — callers inspect the
 * raw `type: "system"` / `type: "stop"` lines to capture `session_id`
 * for `--resume` on follow-up turns.
 */
export function normalizeCursorLine(line: CursorStdoutLine): AgentEvent[] {
  switch (line.type) {
    case 'system':
      return []
    case 'assistant_message':
      return normalizeAssistantMessage(line as CursorAssistantMessageLine)
    case 'thinking':
      return normalizeThinking(line as CursorThinkingLine)
    case 'tool_use':
      return normalizeToolUse(line as CursorToolUseLine)
    case 'tool_result':
      return normalizeToolResult(line as CursorToolResultLine)
    case 'token_usage':
      return normalizeTokenUsage(line as CursorTokenUsageLine)
    case 'stop':
    case 'end':
      return normalizeStop(line as CursorStopLine)
    case 'error':
      return [{ type: 'error', error: typeof (line as { message?: unknown }).message === 'string' ? (line as { message: string }).message : 'cursor error' }]
    default:
      return []
  }
}

/** Pull `session_id` out of a raw stdout line. Returns empty string if absent. */
export function extractSessionId(line: CursorStdoutLine): string {
  const raw = (line as { session_id?: unknown }).session_id
  if (typeof raw === 'string' && raw.length > 0)
    return raw
  return ''
}

function normalizeAssistantMessage(line: CursorAssistantMessageLine): AgentEvent[] {
  const text = pickText(line.delta, line.text)
  if (!text)
    return []
  return [{ type: 'assistant_message_delta', delta: text }]
}

function normalizeThinking(line: CursorThinkingLine): AgentEvent[] {
  const text = pickText(line.delta, line.text)
  if (!text)
    return []
  return [{ type: 'thinking_delta', delta: text }]
}

function normalizeToolUse(line: CursorToolUseLine): AgentEvent[] {
  if (!line.id || !line.name)
    return []
  const input = (line.input ?? {}) as Record<string, unknown>
  return [{
    type: 'tool_use',
    id: line.id,
    name: line.name,
    arguments: input,
    action: inferToolAction(line.name, input),
    ...(line.status ? { status: mapToolStatus(line.status) } : {}),
  }]
}

function normalizeToolResult(line: CursorToolResultLine): AgentEvent[] {
  if (!line.id)
    return []
  const isError = line.isError === true || line.is_error === true
  return [{
    type: 'tool_result',
    id: line.id,
    name: typeof line.name === 'string' ? line.name : '',
    content: typeof line.content === 'string' ? line.content : '',
    ...(isError ? { isError: true } : {}),
  }]
}

function normalizeTokenUsage(line: CursorTokenUsageLine): AgentEvent[] {
  const usage = line.usage ?? {}
  return [{
    type: 'token_usage',
    usage: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
    },
  }]
}

function normalizeStop(line: CursorStopLine): AgentEvent[] {
  const out: AgentEvent[] = []
  if (line.usage) {
    out.push({
      type: 'token_usage',
      usage: {
        inputTokens: line.usage.input_tokens ?? 0,
        outputTokens: line.usage.output_tokens ?? 0,
      },
    })
  }
  out.push({ type: 'finish', reason: mapStopReason(line.reason) })
  return out
}

export function mapStopReason(reason: CursorStopReason | string | undefined): AgentFinishReason {
  switch (reason) {
    case 'length':
      return 'length'
    case 'cancelled':
      return 'cancelled'
    case 'error':
      return 'error'
    case 'stop':
    case 'end_turn':
    default:
      return 'stop'
  }
}

function mapToolStatus(status: string): 'pending' | 'running' | 'success' | 'failed' | 'pending_approval' | 'denied' {
  switch (status) {
    case 'pending':
      return 'pending'
    case 'running':
      return 'running'
    case 'completed':
      return 'success'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'denied'
    default:
      return 'pending'
  }
}

/**
 * Map Cursor tool names onto the shared `ToolAction` discriminator. Cursor
 * doesn't publish a canonical tool list, so we do best-effort heuristic
 * matching on common names; unrecognised tools fall back to `kind: 'tool'`.
 */
export function inferToolAction(name: string, input: Record<string, unknown>): ToolAction {
  const lower = name.toLowerCase()
  if (lower === 'read_file' || lower === 'read' || lower === 'view' || lower === 'open') {
    const rawPath = pickString(input, ['path', 'file_path', 'filePath'])
    return { kind: 'file_read', path: rawPath }
  }
  if (lower === 'edit_file' || lower === 'edit' || lower === 'write' || lower === 'write_file' || lower === 'apply_patch') {
    const rawPath = pickString(input, ['path', 'file_path', 'filePath'])
    const diff = buildEditDiff(input)
    return { kind: 'file_edit', path: rawPath, ...(diff ? { diff } : {}) }
  }
  if (lower === 'run_terminal' || lower === 'run_terminal_cmd' || lower === 'bash' || lower === 'shell' || lower === 'exec') {
    const command = pickString(input, ['command', 'cmd', 'script'])
    return { kind: 'command_run', command }
  }
  if (lower === 'grep' || lower === 'grep_search' || lower === 'codebase_search' || lower === 'search' || lower === 'find') {
    const query = pickString(input, ['query', 'pattern'])
    return { kind: 'search', query }
  }
  if (lower === 'web_fetch' || lower === 'fetch' || lower === 'web_search') {
    const url = pickString(input, ['url', 'uri'])
    return { kind: 'web_fetch', url }
  }
  return {
    kind: 'tool',
    toolName: name,
    ...(Object.keys(input).length > 0 ? { arguments: input } : {}),
  }
}

function pickText(...values: Array<string | undefined>): string {
  for (const v of values) {
    if (typeof v === 'string' && v.length > 0)
      return v
  }
  return ''
}

function pickString(input: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const v = input[key]
    if (typeof v === 'string' && v.length > 0)
      return v
  }
  return ''
}

function buildEditDiff(input: Record<string, unknown>): string | undefined {
  if (typeof input.old_string === 'string' && typeof input.new_string === 'string')
    return `- ${input.old_string}\n+ ${input.new_string}`
  if (typeof input.oldText === 'string' && typeof input.newText === 'string')
    return `- ${input.oldText}\n+ ${input.newText}`
  if (typeof input.diff === 'string')
    return input.diff
  if (typeof input.content === 'string')
    return input.content
  return undefined
}
