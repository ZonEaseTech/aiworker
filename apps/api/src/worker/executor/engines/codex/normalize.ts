import type { AgentEvent, AgentFinishReason, ToolAction } from '@aiworker/shared'
import type { JsonRpcNotification } from '../acp/types'
import type {
  CodexAssistantMessageEvent,
  CodexStopEvent,
  CodexStopReason,
  CodexThinkingEvent,
  CodexTokenUsageEvent,
  CodexToolCallEvent,
  CodexToolResultEvent,
} from './types'

/**
 * Translate one Codex JSON-RPC notification into zero or more AgentEvents.
 * Unknown methods return `[]` so forward-compatible event streams don't crash
 * the harness.
 *
 * Finish semantics: `codex/event/stop` emits exactly one `finish` event; the
 * harness pairs that with the `newTurn` response so callers see the terminal
 * finish either way.
 */
export function normalizeCodexNotification(notification: JsonRpcNotification): AgentEvent[] {
  const params = (notification.params ?? {}) as Record<string, unknown>
  switch (notification.method) {
    case 'codex/event/assistant_message':
      return normalizeAssistantMessage(params as unknown as CodexAssistantMessageEvent)
    case 'codex/event/thinking':
      return normalizeThinking(params as unknown as CodexThinkingEvent)
    case 'codex/event/token_usage':
      return normalizeTokenUsage(params as unknown as CodexTokenUsageEvent)
    case 'codex/event/tool_call':
      return normalizeToolCall(params as unknown as CodexToolCallEvent)
    case 'codex/event/tool_result':
      return normalizeToolResult(params as unknown as CodexToolResultEvent)
    case 'codex/event/stop':
      return normalizeStop(params as unknown as CodexStopEvent)
    case 'codex/event/error':
      return [{ type: 'error', error: typeof params.message === 'string' ? params.message : 'codex error' }]
    default:
      return []
  }
}

function normalizeAssistantMessage(event: CodexAssistantMessageEvent): AgentEvent[] {
  const text = pickText(event.delta, event.text)
  if (!text)
    return []
  return [{ type: 'assistant_message_delta', delta: text }]
}

function normalizeThinking(event: CodexThinkingEvent): AgentEvent[] {
  const text = pickText(event.delta, event.text)
  if (!text)
    return []
  return [{ type: 'thinking_delta', delta: text }]
}

function normalizeTokenUsage(event: CodexTokenUsageEvent): AgentEvent[] {
  const usage = event.usage ?? {}
  return [{
    type: 'token_usage',
    usage: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
    },
  }]
}

function normalizeToolCall(event: CodexToolCallEvent): AgentEvent[] {
  if (!event.id || !event.name)
    return []
  const args = (event.arguments ?? {}) as Record<string, unknown>
  return [{
    type: 'tool_use',
    id: event.id,
    name: event.name,
    arguments: args,
    action: inferToolAction(event.name, args),
    ...(event.status ? { status: mapToolStatus(event.status) } : {}),
  }]
}

function normalizeToolResult(event: CodexToolResultEvent): AgentEvent[] {
  if (!event.id)
    return []
  return [{
    type: 'tool_result',
    id: event.id,
    name: '',
    content: typeof event.content === 'string' ? event.content : '',
    ...(event.isError === true ? { isError: true } : {}),
  }]
}

function normalizeStop(event: CodexStopEvent): AgentEvent[] {
  const out: AgentEvent[] = []
  if (event.usage) {
    out.push({
      type: 'token_usage',
      usage: {
        inputTokens: event.usage.input_tokens ?? 0,
        outputTokens: event.usage.output_tokens ?? 0,
      },
    })
  }
  out.push({ type: 'finish', reason: mapStopReason(event.reason) })
  return out
}

/**
 * Map Codex tool names onto the shared `ToolAction` discriminator. Only the
 * canonical built-in tools are recognised; anything unknown falls back to
 * `kind: 'tool'` so downstream consumers never lose data.
 */
export function inferToolAction(name: string, input: Record<string, unknown>): ToolAction {
  const lower = name.toLowerCase()
  if (lower === 'read' || lower === 'view' || lower === 'open_file') {
    const rawPath = pickString(input, ['path', 'file_path', 'filePath'])
    return { kind: 'file_read', path: rawPath }
  }
  if (lower === 'edit' || lower === 'write' || lower === 'apply_patch' || lower === 'patch') {
    const rawPath = pickString(input, ['path', 'file_path', 'filePath'])
    const diff = buildEditDiff(input)
    return { kind: 'file_edit', path: rawPath, ...(diff ? { diff } : {}) }
  }
  if (lower === 'bash' || lower === 'run_shell' || lower === 'shell' || lower === 'exec') {
    const command = pickString(input, ['command', 'cmd', 'script'])
    return { kind: 'command_run', command }
  }
  if (lower === 'grep' || lower === 'search' || lower === 'find') {
    const query = pickString(input, ['query', 'pattern'])
    return { kind: 'search', query }
  }
  if (lower === 'web_fetch' || lower === 'fetch' || lower === 'http_get') {
    const url = pickString(input, ['url', 'uri'])
    return { kind: 'web_fetch', url }
  }
  return {
    kind: 'tool',
    toolName: name,
    ...(Object.keys(input).length > 0 ? { arguments: input } : {}),
  }
}

export function mapStopReason(reason: CodexStopReason | string | undefined): AgentFinishReason {
  switch (reason) {
    case 'max_tokens':
      return 'length'
    case 'cancelled':
      return 'cancelled'
    case 'error':
      return 'error'
    case 'stop':
    default:
      return 'stop'
  }
}

function mapToolStatus(status: string): 'pending' | 'running' | 'success' | 'failed' | 'pending_approval' | 'denied' {
  switch (status) {
    case 'pending':
      return 'pending'
    case 'in_progress':
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
