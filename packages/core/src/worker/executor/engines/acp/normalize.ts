import type { AgentEvent, AgentFinishReason, ToolAction } from '@aiworker/shared'
import type {
  AcpContentBlock,
  AcpKnownSessionUpdate,
  AcpPlanEntry,
  AcpSessionUpdate,
  AcpStopReason,
  AcpToolCallContent,
  AcpToolKind,
} from './types'

/**
 * Translate one ACP `session/update` payload into a sequence of `AgentEvent`s.
 *
 * Design notes:
 * - Only the `update` body is passed in; the enclosing `sessionId` is the
 *   harness's concern.
 * - `tool_call` with no terminal status is treated as a tool_use start.
 *   Terminal statuses (`completed` / `failed` / `cancelled`) are translated
 *   into `tool_result` so downstream listeners can pair request/response.
 *   `tool_call_update` carrying `content` without a terminal status becomes
 *   an in-flight progress update — we emit nothing for those to avoid
 *   flooding the bus with per-chunk noise (the completion event is enough).
 * - ACP "plan" updates are mapped onto the generic `task_plan` tool action
 *   so the orchestrator can surface them via the existing SSE tool_call
 *   channel without a new event kind.
 * - Unknown `sessionUpdate` kinds return `[]` rather than throwing — the
 *   harness is defensive against future ACP versions.
 */
export function normalizeSessionUpdate(update: AcpSessionUpdate): AgentEvent[] {
  const kind = update.sessionUpdate
  // Widen once so each `case` body can narrow against the known-union.
  const known = update as AcpKnownSessionUpdate
  switch (kind) {
    case 'agent_message_chunk': {
      const text = extractText((known as Extract<AcpKnownSessionUpdate, { sessionUpdate: 'agent_message_chunk' }>).content)
      if (!text)
        return []
      return [{ type: 'assistant_message_delta', delta: text }]
    }
    case 'agent_thinking_chunk': {
      const text = extractText((known as Extract<AcpKnownSessionUpdate, { sessionUpdate: 'agent_thinking_chunk' }>).content)
      if (!text)
        return []
      return [{ type: 'thinking_delta', delta: text }]
    }
    case 'user_message_chunk':
      // Agent-echoed user text — host already owns the original input; drop.
      return []
    case 'tool_call':
      return normalizeToolCall(known as Extract<AcpKnownSessionUpdate, { sessionUpdate: 'tool_call' }>)
    case 'tool_call_update':
      return normalizeToolCallUpdate(known as Extract<AcpKnownSessionUpdate, { sessionUpdate: 'tool_call_update' }>)
    case 'plan':
      return normalizePlan((known as Extract<AcpKnownSessionUpdate, { sessionUpdate: 'plan' }>).entries)
    case 'available_commands_update':
    case 'current_mode_update':
      return []
    default:
      return []
  }
}

/** Map an ACP ToolKind + rawInput to the shared `ToolAction` discriminator. */
export function inferToolAction(
  kind: AcpToolKind | undefined,
  title: string | undefined,
  rawInput: Record<string, unknown> | undefined,
): ToolAction {
  const input = rawInput ?? {}
  switch (kind) {
    case 'read': {
      const path = pickString(input, ['file_path', 'path', 'absolute_path', 'filePath'])
      return { kind: 'file_read', path }
    }
    case 'edit':
    case 'delete':
    case 'move': {
      const path = pickString(input, ['file_path', 'path', 'absolute_path', 'filePath'])
      const diff = buildEditDiff(input)
      return { kind: 'file_edit', path, ...(diff ? { diff } : {}) }
    }
    case 'execute': {
      const command = pickString(input, ['command', 'cmd', 'shell_command', 'script'])
      return { kind: 'command_run', command }
    }
    case 'search': {
      const query = pickString(input, ['query', 'pattern', 'q', 'search'])
      return { kind: 'search', query }
    }
    case 'fetch': {
      const url = pickString(input, ['url', 'uri', 'href'])
      return { kind: 'web_fetch', url }
    }
    case 'think':
      return { kind: 'task_plan', summary: title ?? 'thinking' }
    case 'other':
    case undefined:
    default:
      return {
        kind: 'tool',
        toolName: title ?? 'acp.tool',
        ...(Object.keys(input).length > 0 ? { arguments: input } : {}),
      }
  }
}

/** Map an ACP stop reason onto our agent finish reason union. */
export function mapStopReason(reason: AcpStopReason | string | undefined): AgentFinishReason {
  switch (reason) {
    case 'end_turn':
      return 'stop'
    case 'max_tokens':
    case 'max_turn_requests':
      return 'length'
    case 'refusal':
      return 'error'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'stop'
  }
}

function normalizeToolCall(update: Extract<AcpKnownSessionUpdate, { sessionUpdate: 'tool_call' }>): AgentEvent[] {
  const out: AgentEvent[] = []
  const id = update.toolCallId
  if (!id)
    return out
  const rawInput = update.rawInput ?? {}
  const action = inferToolAction(update.kind, update.title, rawInput)
  const name = update.title ?? update.kind ?? 'acp.tool'
  out.push({
    type: 'tool_use',
    id,
    name,
    arguments: rawInput,
    action,
    ...(update.status ? { status: mapToolStatus(update.status) } : {}),
  })
  // When the agent emits tool_call with a terminal status in one shot,
  // also surface the content as tool_result so downstream consumers can
  // pair request/response without depending on a later update arriving.
  if (isTerminalStatus(update.status)) {
    const contentText = flattenToolCallContent(update.content)
    out.push({
      type: 'tool_result',
      id,
      name,
      content: contentText,
      ...(update.status === 'failed' || update.status === 'cancelled' ? { isError: true } : {}),
    })
  }
  return out
}

function normalizeToolCallUpdate(
  update: Extract<AcpKnownSessionUpdate, { sessionUpdate: 'tool_call_update' }>,
): AgentEvent[] {
  const id = update.toolCallId
  if (!id || !isTerminalStatus(update.status))
    return []
  const contentText = flattenToolCallContent(update.content)
  const name = update.title ?? update.kind ?? ''
  return [{
    type: 'tool_result',
    id,
    name,
    content: contentText,
    ...(update.status === 'failed' || update.status === 'cancelled' ? { isError: true } : {}),
  }]
}

function normalizePlan(entries: AcpPlanEntry[]): AgentEvent[] {
  if (!Array.isArray(entries) || entries.length === 0)
    return []
  const summary = entries
    .map((e, i) => `${i + 1}. [${e.status ?? 'pending'}] ${e.content}`)
    .join('\n')
  return [{
    type: 'tool_use',
    id: `plan-${hashString(summary)}`,
    name: 'plan',
    arguments: { entries },
    action: { kind: 'task_plan', summary },
  }]
}

/** Extract a string body from an ACP content block (text-only). */
function extractText(block: AcpContentBlock | undefined): string {
  if (!block)
    return ''
  if (block.type === 'text' && typeof (block as { text?: unknown }).text === 'string')
    return (block as { text: string }).text
  return ''
}

/** Fold the heterogeneous tool-call content list into a single string payload. */
function flattenToolCallContent(content: AcpToolCallContent[] | undefined): string {
  if (!content || content.length === 0)
    return ''
  const parts: string[] = []
  for (const item of content) {
    if (!item || typeof item !== 'object')
      continue
    if (item.type === 'content') {
      const inner = (item as { content?: AcpContentBlock }).content
      const text = extractText(inner)
      if (text)
        parts.push(text)
    }
    else if (item.type === 'diff') {
      const diff = item as { path?: string, oldText?: string | null, newText?: string }
      const oldText = diff.oldText ?? ''
      const newText = diff.newText ?? ''
      parts.push(`--- ${diff.path ?? ''}\n- ${oldText}\n+ ${newText}`)
    }
    else if (item.type === 'terminal') {
      const t = item as { terminalId?: string }
      parts.push(`[terminal:${t.terminalId ?? ''}]`)
    }
  }
  return parts.join('\n')
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

function isTerminalStatus(status: string | undefined): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function pickString(input: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0)
      return value
  }
  return ''
}

function buildEditDiff(input: Record<string, unknown>): string | undefined {
  const oldText = typeof input.old_string === 'string'
    ? input.old_string
    : typeof input.oldText === 'string' ? input.oldText : undefined
  const newText = typeof input.new_string === 'string'
    ? input.new_string
    : typeof input.newText === 'string'
      ? input.newText
      : typeof input.content === 'string'
        ? input.content
        : undefined
  if (oldText !== undefined && newText !== undefined)
    return `- ${oldText}\n+ ${newText}`
  if (newText !== undefined)
    return newText
  return undefined
}

/** Stable short hash used only to disambiguate synthetic plan tool-use ids. */
function hashString(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++)
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0
  return h.toString(36)
}
