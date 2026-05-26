export type EngineEventParserKind = 'claude' | 'codex' | 'cursor-agent' | 'gemini' | 'opencode'

export type ParsedEngineEvent
  = | { type: 'status', label: string, detail?: string }
    | { type: 'text_delta', delta: string }
    | { type: 'thinking_delta', delta: string }
    | { type: 'thinking_start' }
    | { type: 'file_change', action: string, path: string, status?: string }
    | { type: 'tool_use', id: string, input: unknown, name: string }
    | { type: 'tool_result', content: string, isError: boolean, toolUseId: string }
    | { type: 'usage', costUsd?: number, durationMs?: number, inputTokens?: number, outputTokens?: number }
    | { type: 'raw', line: string }

export interface EngineStreamHandler {
  feed: (chunk: string) => void
  flush: () => void
}

export function createEngineStreamHandler(kind: EngineEventParserKind, onEvent: (event: ParsedEngineEvent) => void): EngineStreamHandler {
  if (kind === 'claude')
    return createClaudeStreamHandler(onEvent)
  return createJsonEventStreamHandler(kind, onEvent)
}

function createJsonEventStreamHandler(kind: Exclude<EngineEventParserKind, 'claude'>, onEvent: (event: ParsedEngineEvent) => void): EngineStreamHandler {
  let buffer = ''
  const state = {
    codexToolUses: new Set<string>(),
    cursorTextSoFar: '',
    openCodeToolUses: new Set<string>(),
  }

  const handleLine = (line: string) => {
    let obj: unknown
    try {
      obj = JSON.parse(line)
    }
    catch {
      onEvent({ line, type: 'raw' })
      return
    }

    if (kind === 'codex' && handleCodexEvent(obj, onEvent, state))
      return
    if (kind === 'cursor-agent' && handleCursorEvent(obj, onEvent, state))
      return
    if (kind === 'gemini' && handleGeminiEvent(obj, onEvent))
      return
    if (kind === 'opencode' && handleOpenCodeEvent(obj, onEvent, state))
      return

    onEvent({ line, type: 'raw' })
  }

  return {
    feed(chunk) {
      buffer += chunk
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line)
          handleLine(line)
        newline = buffer.indexOf('\n')
      }
    },
    flush() {
      const line = buffer.trim()
      buffer = ''
      if (line)
        handleLine(line)
    },
  }
}

function handleOpenCodeEvent(
  value: unknown,
  onEvent: (event: ParsedEngineEvent) => void,
  state: { openCodeToolUses: Set<string> },
): boolean {
  const obj = asRecord(value)
  if (!obj)
    return false
  const part = asRecord(obj.part)

  if (obj.type === 'step_start') {
    onEvent({ label: 'running', type: 'status' })
    return true
  }

  if (obj.type === 'text') {
    const text = readString(part?.text)
    if (text) {
      onEvent({ delta: text, type: 'text_delta' })
      return true
    }
  }

  if (obj.type === 'tool_use') {
    const tool = readString(part?.tool)
    const callId = readString(part?.callID)
    if (!tool || !callId)
      return false
    const statePart = asRecord(part?.state)
    const key = `${readString(obj.sessionID, 'session')}:${callId}`
    if (!state.openCodeToolUses.has(key)) {
      state.openCodeToolUses.add(key)
      onEvent({
        id: callId,
        input: safeParseJson(statePart?.input) ?? statePart?.input ?? null,
        name: tool,
        type: 'tool_use',
      })
    }
    if (statePart?.status === 'completed') {
      onEvent({
        content: stringifyContent(statePart.output),
        isError: false,
        toolUseId: callId,
        type: 'tool_result',
      })
    }
    return true
  }

  if (obj.type === 'step_finish') {
    const tokens = asRecord(part?.tokens)
    if (tokens) {
      onEvent({
        costUsd: readNumber(part?.cost),
        inputTokens: readNumber(tokens.input),
        outputTokens: readNumber(tokens.output),
        type: 'usage',
      })
      return true
    }
  }

  return false
}

function handleCodexEvent(
  value: unknown,
  onEvent: (event: ParsedEngineEvent) => void,
  state: { codexToolUses: Set<string> },
): boolean {
  const obj = asRecord(value)
  if (!obj)
    return false
  const type = readString(obj.type)

  if (type === 'thread.started') {
    onEvent({ label: 'initializing', type: 'status' })
    return true
  }
  if (type === 'turn.started') {
    onEvent({ label: 'running', type: 'status' })
    return true
  }

  const item = asRecord(obj.item)
  if (type === 'item.started' && item?.type === 'command_execution') {
    const id = readString(item.id)
    if (!id)
      return false
    emitCodexToolUse(item, onEvent, state)
    return true
  }

  if (type === 'item.completed' && item?.type === 'command_execution') {
    const id = readString(item.id)
    if (!id)
      return false
    emitCodexToolUse(item, onEvent, state)
    onEvent({
      content: stringifyContent(item.aggregated_output ?? item.output ?? ''),
      isError: typeof item.exit_code === 'number' ? item.exit_code !== 0 : item.status === 'failed',
      toolUseId: id,
      type: 'tool_result',
    })
    return true
  }

  if ((type === 'item.started' || type === 'item.completed') && item?.type === 'file_change') {
    const changes = Array.isArray(item.changes) ? item.changes : []
    for (const change of changes) {
      const row = asRecord(change)
      const filePath = readString(row?.path)
      if (!filePath)
        continue
      onEvent({
        action: readString(row?.kind, 'change'),
        path: filePath,
        status: readString(item.status) || (type === 'item.started' ? 'in_progress' : 'completed'),
        type: 'file_change',
      })
    }
    return changes.length > 0
  }

  if (type === 'item.completed' && item?.type === 'agent_message') {
    const text = readString(item.text ?? item.content)
    if (text) {
      onEvent({ delta: text, type: 'text_delta' })
      return true
    }
  }

  if (type === 'turn.completed') {
    const usage = asRecord(obj.usage)
    if (usage) {
      onEvent({
        inputTokens: readNumber(usage.input_tokens),
        outputTokens: readNumber(usage.output_tokens),
        type: 'usage',
      })
      return true
    }
  }

  return false
}

function emitCodexToolUse(
  item: Record<string, unknown>,
  onEvent: (event: ParsedEngineEvent) => void,
  state: { codexToolUses: Set<string> },
): void {
  const id = readString(item.id)
  if (!id || state.codexToolUses.has(id))
    return
  state.codexToolUses.add(id)
  onEvent({
    id,
    input: { command: readString(item.command) },
    name: 'Bash',
    type: 'tool_use',
  })
}

function handleGeminiEvent(value: unknown, onEvent: (event: ParsedEngineEvent) => void): boolean {
  const obj = asRecord(value)
  if (!obj)
    return false
  if (obj.type === 'init') {
    onEvent({ detail: readString(obj.model) || undefined, label: 'initializing', type: 'status' })
    return true
  }
  if (obj.type === 'message' && obj.role === 'assistant') {
    const content = readString(obj.content)
    if (content) {
      onEvent({ delta: content, type: 'text_delta' })
      return true
    }
  }
  if (obj.type === 'result') {
    const stats = asRecord(obj.stats)
    if (stats) {
      onEvent({
        durationMs: readNumber(stats.duration_ms),
        inputTokens: readNumber(stats.input_tokens),
        outputTokens: readNumber(stats.output_tokens),
        type: 'usage',
      })
      return true
    }
  }
  return false
}

function handleCursorEvent(
  value: unknown,
  onEvent: (event: ParsedEngineEvent) => void,
  state: { cursorTextSoFar: string },
): boolean {
  const obj = asRecord(value)
  if (!obj)
    return false
  if (obj.type === 'system') {
    const subtype = readString(obj.subtype)
    if (subtype === 'init') {
      onEvent({ detail: readString(obj.model) || undefined, label: 'initializing', type: 'status' })
      return true
    }
  }
  if (obj.type === 'assistant') {
    const text = extractCursorText(asRecord(obj.message))
    if (!text)
      return false
    emitCursorTextDelta(text, onEvent, state)
    return true
  }
  if (obj.type === 'result') {
    const usage = asRecord(obj.usage)
    if (usage) {
      onEvent({
        durationMs: readNumber(obj.duration_ms),
        inputTokens: readNumber(usage.inputTokens),
        outputTokens: readNumber(usage.outputTokens),
        type: 'usage',
      })
      return true
    }
  }
  return false
}

function extractCursorText(message: Record<string, unknown> | null): string {
  const content = Array.isArray(message?.content) ? message.content : []
  return content
    .map(block => asRecord(block))
    .filter(block => block?.type === 'text')
    .map(block => readString(block?.text))
    .join('')
}

function emitCursorTextDelta(
  text: string,
  onEvent: (event: ParsedEngineEvent) => void,
  state: { cursorTextSoFar: string },
): void {
  if (!state.cursorTextSoFar) {
    state.cursorTextSoFar = text
    onEvent({ delta: text, type: 'text_delta' })
    return
  }
  if (text === state.cursorTextSoFar)
    return
  if (text.startsWith(state.cursorTextSoFar)) {
    const delta = text.slice(state.cursorTextSoFar.length)
    state.cursorTextSoFar = text
    if (delta)
      onEvent({ delta, type: 'text_delta' })
    return
  }
  state.cursorTextSoFar += text
  onEvent({ delta: text, type: 'text_delta' })
}

function createClaudeStreamHandler(onEvent: (event: ParsedEngineEvent) => void): EngineStreamHandler {
  let buffer = ''
  const blocks = new Map<string, { id?: string, input: string, name?: string, type?: string }>()
  const textStreamed = new Set<string>()
  let currentMessageId: string | null = null

  const blockKey = (index: unknown) => `${currentMessageId ?? 'anon'}:${String(index)}`

  const handleObject = (value: unknown) => {
    const obj = asRecord(value)
    if (!obj)
      return
    if (obj.type === 'system' && obj.subtype === 'init') {
      onEvent({
        detail: readString(obj.model) || undefined,
        label: 'initializing',
        type: 'status',
      })
      return
    }
    if (obj.type === 'system' && obj.subtype === 'status') {
      onEvent({ label: readString(obj.status, 'working'), type: 'status' })
      return
    }
    if (obj.type === 'stream_event') {
      handleClaudeStreamEvent(asRecord(obj.event), {
        blockKey,
        blocks,
        currentMessageId: () => currentMessageId,
        onEvent,
        setCurrentMessageId: id => currentMessageId = id,
        textStreamed,
      })
      return
    }
    if (obj.type === 'assistant') {
      const message = asRecord(obj.message)
      const content = Array.isArray(message?.content) ? message.content : []
      const messageId = readString(message?.id)
      if (messageId)
        currentMessageId = messageId
      const alreadyStreamed = messageId ? textStreamed.has(messageId) : false
      for (const item of content) {
        const block = asRecord(item)
        if (!block)
          continue
        if (block.type === 'tool_use') {
          onEvent({
            id: readString(block.id),
            input: block.input ?? null,
            name: readString(block.name, 'Tool'),
            type: 'tool_use',
          })
        }
        else if (!alreadyStreamed && block.type === 'text') {
          const text = readString(block.text)
          if (text)
            onEvent({ delta: text, type: 'text_delta' })
        }
        else if (!alreadyStreamed && block.type === 'thinking') {
          const thinking = readString(block.thinking)
          if (thinking)
            onEvent({ delta: thinking, type: 'thinking_delta' })
        }
      }
      return
    }
    if (obj.type === 'user') {
      const message = asRecord(obj.message)
      const content = Array.isArray(message?.content) ? message.content : []
      for (const item of content) {
        const block = asRecord(item)
        if (block?.type === 'tool_result') {
          onEvent({
            content: stringifyContent(block.content),
            isError: block.is_error === true,
            toolUseId: readString(block.tool_use_id),
            type: 'tool_result',
          })
        }
      }
      return
    }
    if (obj.type === 'result') {
      const usage = asRecord(obj.usage)
      onEvent({
        costUsd: readNumber(obj.total_cost_usd),
        durationMs: readNumber(obj.duration_ms),
        inputTokens: readNumber(usage?.input_tokens),
        outputTokens: readNumber(usage?.output_tokens),
        type: 'usage',
      })
    }
  }

  const handleLine = (line: string) => {
    try {
      handleObject(JSON.parse(line))
    }
    catch {
      onEvent({ line, type: 'raw' })
    }
  }

  return {
    feed(chunk) {
      buffer += chunk
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line)
          handleLine(line)
        newline = buffer.indexOf('\n')
      }
    },
    flush() {
      const line = buffer.trim()
      buffer = ''
      if (line)
        handleLine(line)
    },
  }
}

function handleClaudeStreamEvent(
  event: Record<string, unknown> | null,
  state: {
    blockKey: (index: unknown) => string
    blocks: Map<string, { id?: string, input: string, name?: string, type?: string }>
    currentMessageId: () => string | null
    onEvent: (event: ParsedEngineEvent) => void
    setCurrentMessageId: (id: string | null) => void
    textStreamed: Set<string>
  },
): void {
  if (!event)
    return
  if (event.type === 'message_start') {
    const message = asRecord(event.message)
    state.setCurrentMessageId(readString(message?.id) || null)
    if (typeof event.ttft_ms === 'number')
      state.onEvent({ detail: `first token in ${Math.round(event.ttft_ms / 100) / 10}s`, label: 'streaming', type: 'status' })
    return
  }
  if (event.type === 'content_block_start') {
    const block = asRecord(event.content_block)
    const key = state.blockKey(event.index)
    state.blocks.set(key, {
      id: readString(block?.id) || undefined,
      input: '',
      name: readString(block?.name) || undefined,
      type: readString(block?.type) || undefined,
    })
    if (block?.type === 'thinking')
      state.onEvent({ type: 'thinking_start' })
    return
  }
  if (event.type === 'content_block_delta') {
    const delta = asRecord(event.delta)
    if (delta?.type === 'text_delta') {
      const id = state.currentMessageId()
      if (id)
        state.textStreamed.add(id)
      state.onEvent({ delta: readString(delta.text), type: 'text_delta' })
      return
    }
    if (delta?.type === 'thinking_delta') {
      const id = state.currentMessageId()
      if (id)
        state.textStreamed.add(id)
      state.onEvent({ delta: readString(delta.thinking), type: 'thinking_delta' })
      return
    }
    if (delta?.type === 'input_json_delta') {
      const block = state.blocks.get(state.blockKey(event.index))
      if (block)
        block.input += readString(delta.partial_json)
    }
  }
  if (event.type === 'content_block_stop')
    state.blocks.delete(state.blockKey(event.index))
}

function stringifyContent(value: unknown): string {
  if (typeof value === 'string')
    return value
  if (Array.isArray(value)) {
    return value.map((item) => {
      const block = asRecord(item)
      return block?.type === 'text' ? readString(block.text) : JSON.stringify(item)
    }).join('\n')
  }
  if (value == null)
    return ''
  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}

function safeParseJson(value: unknown): unknown | null {
  if (value == null)
    return null
  if (typeof value === 'object')
    return value
  if (typeof value !== 'string')
    return null
  try {
    return JSON.parse(value)
  }
  catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
