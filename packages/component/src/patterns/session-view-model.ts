export type SessionComposerMaterialEncoding = 'base64' | 'utf8'

export interface SessionComposerMaterial {
  content: string
  encoding: SessionComposerMaterialEncoding
  mimeType: string
  name: string
  size: number
}

export interface SessionTimelineEventInput {
  createdAt?: string
  id: number | string
  payloadJson?: unknown
  seq?: number
  turnId?: null | string
  type: string
}

interface SessionTimelineEventBase {
  id: string
  turnId?: null | string
}

export type SessionTimelineEvent
  = | (SessionTimelineEventBase & { detail?: string, kind: 'status', label: string })
    | (SessionTimelineEventBase & { kind: 'text', text: string })
    | (SessionTimelineEventBase & { kind: 'thinking', text: string })
    | (SessionTimelineEventBase & { input: unknown, kind: 'tool_use', name: string, toolUseId: string })
    | (SessionTimelineEventBase & { content: string, isError?: boolean, kind: 'tool_result', name?: string, toolUseId: string })
    | (SessionTimelineEventBase & { costUsd?: number, inputTokens?: number, kind: 'usage', outputTokens?: number })
    | (SessionTimelineEventBase & { chunk: string, kind: 'log', stream: 'stderr' | 'stdout' })
    | (SessionTimelineEventBase & { kind: 'raw', line: string })
    | (SessionTimelineEventBase & { detail: string, kind: 'artifact' | 'lesson' | 'review' })
    | (SessionTimelineEventBase & { kind: 'error', message: string })

export interface SessionTimelineTurnInput {
  createdAt?: string
  error?: null | string
  id: string
  input: string
  response?: null | string
  seq: number
  status: string
  updatedAt?: string
}

export interface SessionTimelineTurnViewModel {
  events: SessionTimelineEvent[]
  turn: SessionTimelineTurnInput
}

export async function createComposerAttachment(file: File): Promise<SessionComposerMaterial> {
  const encoding: SessionComposerMaterialEncoding = isTextLikeFile(file) ? 'utf8' : 'base64'
  const content = encoding === 'utf8'
    ? await file.text()
    : arrayBufferToBase64(await file.arrayBuffer())

  return {
    content,
    encoding,
    mimeType: file.type || 'application/octet-stream',
    name: file.name,
    size: file.size,
  }
}

export function formatSessionAttachmentKind(file: Pick<File, 'name' | 'type'>): string {
  const extension = file.name.includes('.') ? file.name.split('.').pop() : ''
  return (extension || file.type.split('/').pop() || 'file').slice(0, 5).toUpperCase()
}

export function formatSessionAttachmentSize(size: number): string {
  if (size < 1024)
    return `${size} B`
  if (size < 1024 * 1024)
    return `${Math.round(size / 102.4) / 10} KB`
  return `${Math.round(size / 1024 / 102.4) / 10} MB`
}

export function normalizeSessionEvents(events: SessionTimelineEventInput[]): SessionTimelineEvent[] {
  return events
    .slice()
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .map(coerceTimelineEvent)
}

export function createSessionTimelineViewModel(input: {
  events: SessionTimelineEvent[]
  turns: SessionTimelineTurnInput[]
}): { turns: SessionTimelineTurnViewModel[] } {
  const eventsByTurn = new Map<string, SessionTimelineEvent[]>()
  for (const event of input.events) {
    if (!event.turnId)
      continue
    const current = eventsByTurn.get(event.turnId) ?? []
    current.push(event)
    eventsByTurn.set(event.turnId, current)
  }

  return {
    turns: input.turns
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map(turn => ({
        events: compactTimelineEvents(eventsByTurn.get(turn.id) ?? fallbackResponseEvents(turn)),
        turn,
      })),
  }
}

function coerceTimelineEvent(event: SessionTimelineEventInput): SessionTimelineEvent {
  const id = String(event.id)
  const payload = isRecord(event.payloadJson) ? event.payloadJson : {}
  const agentEvent = isRecord(payload.agentEvent) ? payload.agentEvent : null
  const base = { id, turnId: event.turnId }

  if (agentEvent && typeof agentEvent.kind === 'string') {
    const kind = agentEvent.kind
    if (kind === 'status')
      return { ...base, detail: readString(agentEvent.detail), kind, label: readString(agentEvent.label, event.type) }
    if (kind === 'text')
      return { ...base, kind, text: readString(agentEvent.text) }
    if (kind === 'thinking')
      return { ...base, kind, text: readString(agentEvent.text) }
    if (kind === 'log')
      return { ...base, chunk: readString(agentEvent.chunk), kind, stream: agentEvent.stream === 'stderr' ? 'stderr' : 'stdout' }
    if (kind === 'tool_use')
      return { ...base, input: agentEvent.input, kind, name: readString(agentEvent.name, 'Tool'), toolUseId: readString(agentEvent.id, id) }
    if (kind === 'tool_result') {
      return {
        ...base,
        content: readString(agentEvent.content),
        isError: agentEvent.isError === true,
        kind,
        name: readString(agentEvent.name),
        toolUseId: readString(agentEvent.id ?? agentEvent.toolUseId, id),
      }
    }
    if (kind === 'usage') {
      return {
        ...base,
        costUsd: readNumber(agentEvent.costUsd),
        inputTokens: readNumber(agentEvent.inputTokens),
        kind,
        outputTokens: readNumber(agentEvent.outputTokens),
      }
    }
    if (kind === 'raw')
      return { ...base, kind, line: readString(agentEvent.line) }
  }

  if (event.type === 'assistant_delta')
    return { ...base, kind: 'text', text: readString(payload.text ?? payload.delta) }
  if (event.type === 'artifact')
    return { ...base, detail: readString(payload.path ?? payload.artifactId, 'artifact'), kind: 'artifact' }
  if (event.type === 'review')
    return { ...base, detail: readString(payload.verdict ?? payload.reviewId, 'review'), kind: 'review' }
  if (event.type === 'lesson')
    return { ...base, detail: readString(payload.lessonId, 'memory candidate'), kind: 'lesson' }
  if (event.type === 'error')
    return { ...base, kind: 'error', message: readString(payload.message, 'Session turn failed.') }
  if (event.type === 'log')
    return { ...base, chunk: JSON.stringify(payload, null, 2), kind: 'log', stream: 'stdout' }
  return { ...base, detail: readString(payload.status, event.type), kind: 'status', label: event.type }
}

function compactTimelineEvents(events: SessionTimelineEvent[]): SessionTimelineEvent[] {
  const compacted: SessionTimelineEvent[] = []
  for (const event of events) {
    const last = compacted.at(-1)
    if (event.kind === 'text' && last?.kind === 'text') {
      last.text = `${last.text}${event.text}`
      continue
    }
    if (event.kind === 'thinking' && last?.kind === 'thinking') {
      last.text = truncateLog(`${last.text}${event.text}`)
      continue
    }
    if (event.kind === 'log' && last?.kind === 'log' && last.stream === event.stream) {
      last.chunk = truncateLog(`${last.chunk}${event.chunk}`)
      continue
    }
    compacted.push(event.kind === 'log' ? { ...event, chunk: truncateLog(event.chunk) } : event)
  }
  return compacted
}

function fallbackResponseEvents(turn: SessionTimelineTurnInput): SessionTimelineEvent[] {
  if (turn.response) {
    return [{
      id: `response-${turn.id}`,
      kind: 'text',
      text: turn.response,
      turnId: turn.id,
    }]
  }
  return []
}

function isTextLikeFile(file: File): boolean {
  if (file.type.startsWith('text/'))
    return true
  if (['application/csv', 'application/json', 'application/xml', 'application/yaml'].includes(file.type))
    return true
  return /\.(?:csv|json|log|md|txt|ya?ml)$/i.test(file.name)
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  return btoa(binary)
}

function truncateLog(value: string): string {
  const max = 12_000
  if (value.length <= max)
    return value
  return `${value.slice(0, max)}\n...[truncated]`
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
