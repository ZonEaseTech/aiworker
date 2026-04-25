import type { AgentEvent, AgentFinishReason, ToolAction } from '@aiworker/shared'
import type {
  ClaudeAssistantLine,
  ClaudeContentBlock,
  ClaudeMessageEnvelope,
  ClaudeResultLine,
  ClaudeStdoutLine,
  ClaudeStreamEventLine,
  ClaudeUserLine,
} from './types'

/**
 * Translate one stream-json line from the Claude Code CLI into a sequence of
 * `AgentEvent`s. Consumers must flatten the returned arrays; a single wire
 * line may expand into multiple events (e.g. an assistant `message` with
 * both a text block and a tool_use block).
 */
export function normalizeLine(line: ClaudeStdoutLine): AgentEvent[] {
  switch (line.type) {
    case 'assistant':
      return normalizeAssistantLine(line as ClaudeAssistantLine)
    case 'user':
      return normalizeUserLine(line as ClaudeUserLine)
    case 'result':
      return normalizeResultLine(line as ClaudeResultLine)
    case 'stream_event':
      return normalizeStreamEvent(line as ClaudeStreamEventLine)
    default:
      return []
  }
}

function normalizeAssistantLine(line: ClaudeAssistantLine): AgentEvent[] {
  const out: AgentEvent[] = []
  const message = line.message ?? {}
  for (const block of message.content ?? []) {
    const event = normalizeAssistantBlock(block)
    if (event)
      out.push(event)
  }
  pushUsage(out, message)
  return out
}

function normalizeUserLine(line: ClaudeUserLine): AgentEvent[] {
  const out: AgentEvent[] = []
  const message = line.message ?? {}
  for (const block of message.content ?? []) {
    if (block.type === 'tool_result')
      out.push(toolResultEvent(block as { type: 'tool_result' } & Record<string, unknown>))
  }
  return out
}

function normalizeResultLine(line: ClaudeResultLine): AgentEvent[] {
  const out: AgentEvent[] = []
  if (line.usage) {
    const input = line.usage.input_tokens ?? 0
    const output = line.usage.output_tokens ?? 0
    out.push({ type: 'token_usage', usage: { inputTokens: input, outputTokens: output } })
  }
  if (line.is_error || line.subtype === 'error') {
    const msg = typeof line.error === 'string' && line.error.length > 0
      ? line.error
      : (line.result ?? 'Claude Code run failed')
    out.push({ type: 'error', error: msg })
    out.push({ type: 'finish', reason: 'error' })
    return out
  }
  const reason = mapFinishReason(line.subtype)
  const usage = line.usage
    ? {
        inputTokens: line.usage.input_tokens ?? 0,
        outputTokens: line.usage.output_tokens ?? 0,
      }
    : undefined
  out.push({
    type: 'finish',
    reason,
    ...(usage ? { usage } : {}),
  })
  return out
}

function normalizeStreamEvent(line: ClaudeStreamEventLine): AgentEvent[] {
  const delta = line.event?.delta
  if (!delta)
    return []
  if (delta.type === 'text_delta' && typeof delta.text === 'string' && delta.text.length > 0)
    return [{ type: 'assistant_message_delta', delta: delta.text }]
  if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string' && delta.thinking.length > 0)
    return [{ type: 'thinking_delta', delta: delta.thinking }]
  return []
}

function normalizeAssistantBlock(block: ClaudeContentBlock): AgentEvent | null {
  switch (block.type) {
    case 'text':
      if (typeof (block as { text?: unknown }).text === 'string' && (block as { text: string }).text.length > 0)
        return { type: 'assistant_message_delta', delta: (block as { text: string }).text }
      return null
    case 'thinking': {
      const text = typeof (block as { thinking?: unknown }).thinking === 'string'
        ? (block as { thinking: string }).thinking
        : typeof (block as { text?: unknown }).text === 'string'
          ? (block as { text: string }).text
          : ''
      if (text.length === 0)
        return null
      return { type: 'thinking_delta', delta: text }
    }
    case 'tool_use': {
      const id = typeof (block as { id?: unknown }).id === 'string' ? (block as { id: string }).id : ''
      const name = typeof (block as { name?: unknown }).name === 'string' ? (block as { name: string }).name : ''
      const input = ((block as { input?: unknown }).input ?? {}) as Record<string, unknown>
      if (!id || !name)
        return null
      return {
        type: 'tool_use',
        id,
        name,
        arguments: input,
        action: inferToolAction(name, input),
      }
    }
    case 'tool_result':
      return toolResultEvent(block as { type: 'tool_result' } & Record<string, unknown>)
    default:
      return null
  }
}

function toolResultEvent(block: { type: 'tool_result' } & Record<string, unknown>): AgentEvent {
  const toolUseId = typeof block.tool_use_id === 'string' ? block.tool_use_id : ''
  const isError = block.is_error === true
  const content = flattenResultContent(block.content)
  return {
    type: 'tool_result',
    id: toolUseId,
    name: '',
    content,
    ...(isError ? { isError: true } : {}),
  }
}

function flattenResultContent(raw: unknown): string {
  if (typeof raw === 'string')
    return raw
  if (Array.isArray(raw)) {
    const parts: string[] = []
    for (const item of raw) {
      if (item && typeof item === 'object') {
        const entry = item as Record<string, unknown>
        if (entry.type === 'text' && typeof entry.text === 'string')
          parts.push(entry.text)
        else
          parts.push(JSON.stringify(entry))
      }
    }
    return parts.join('\n')
  }
  if (raw === undefined || raw === null)
    return ''
  return JSON.stringify(raw)
}

function pushUsage(out: AgentEvent[], message: ClaudeMessageEnvelope): void {
  if (!message.usage)
    return
  const input = message.usage.input_tokens
  const output = message.usage.output_tokens
  if (typeof input !== 'number' && typeof output !== 'number')
    return
  out.push({
    type: 'token_usage',
    usage: { inputTokens: input ?? 0, outputTokens: output ?? 0 },
  })
}

/**
 * Map Claude Code tool names onto the `ToolAction` discriminator. Only the
 * canonical tools are enumerated; anything unrecognized falls back to the
 * generic `tool` kind so normalize can't lose data.
 */
export function inferToolAction(name: string, input: Record<string, unknown>): ToolAction {
  switch (name) {
    case 'Read':
    case 'View':
    case 'NotebookRead': {
      const rawPath = typeof input.file_path === 'string' ? input.file_path : typeof input.path === 'string' ? input.path : ''
      return { kind: 'file_read', path: rawPath }
    }
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit': {
      const rawPath = typeof input.file_path === 'string' ? input.file_path : typeof input.path === 'string' ? input.path : ''
      const diff = buildEditDiff(input)
      return { kind: 'file_edit', path: rawPath, ...(diff ? { diff } : {}) }
    }
    case 'Bash':
    case 'Shell': {
      const command = typeof input.command === 'string' ? input.command : ''
      return { kind: 'command_run', command }
    }
    case 'Grep':
    case 'Glob':
    case 'WebSearch': {
      const query = typeof input.query === 'string'
        ? input.query
        : typeof input.pattern === 'string'
          ? input.pattern
          : ''
      return { kind: 'search', query }
    }
    case 'WebFetch': {
      const url = typeof input.url === 'string' ? input.url : ''
      return { kind: 'web_fetch', url }
    }
    case 'TodoWrite': {
      const todos = input.todos
      const summary = Array.isArray(todos) ? `${todos.length} todos` : 'todo update'
      return { kind: 'task_plan', summary }
    }
    default:
      return { kind: 'tool', toolName: name, arguments: input }
  }
}

function buildEditDiff(input: Record<string, unknown>): string | undefined {
  if (typeof input.old_string === 'string' && typeof input.new_string === 'string')
    return `- ${input.old_string}\n+ ${input.new_string}`
  if (typeof input.content === 'string')
    return input.content
  return undefined
}

function mapFinishReason(subtype: string | undefined): AgentFinishReason {
  switch (subtype) {
    case 'success':
    case 'completion':
      return 'stop'
    case 'error':
      return 'error'
    default:
      return 'stop'
  }
}

/**
 * Split an incoming chunk of stdout into whole NDJSON lines plus a remainder
 * buffer. Consumers pass the returned `remainder` back in with the next
 * chunk so an event that straddles a chunk boundary isn't dropped.
 */
export function splitNdjson(buffer: string, chunk: string): { lines: string[], remainder: string } {
  const combined = buffer + chunk
  const parts = combined.split(/\r?\n/)
  const remainder = parts.pop() ?? ''
  return { lines: parts.filter(l => l.trim().length > 0), remainder }
}

/** Parse one NDJSON line; returns `null` on malformed JSON so callers can skip. */
export function parseLine(line: string): ClaudeStdoutLine | null {
  try {
    const parsed = JSON.parse(line) as unknown
    if (parsed && typeof parsed === 'object' && 'type' in parsed)
      return parsed as ClaudeStdoutLine
    return null
  }
  catch {
    return null
  }
}
