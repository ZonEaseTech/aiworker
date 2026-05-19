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

export type SessionTimelineParser = 'codex-cli'

export type SessionTimelineActivityKind
  = | 'build'
    | 'command'
    | 'create'
    | 'delete'
    | 'edit'
    | 'explore'
    | 'file'
    | 'lint'
    | 'list'
    | 'read'
    | 'search'
    | 'test'
    | 'tool'

export type SessionTimelineActivityStatus = 'failed' | 'running' | 'succeeded'

export interface SessionTimelineActivityDetail {
  label: string
  value: string
}

export type SessionTimelineSignalKind = 'output' | 'status'

export interface SessionTimelineUsageSummary {
  costUsd?: number
  inputTokens?: number
  outputTokens?: number
}

export interface SessionTimelineActivityEvent extends SessionTimelineEventBase {
  activityKind: SessionTimelineActivityKind
  command?: string
  detail?: string
  details?: SessionTimelineActivityDetail[]
  kind: 'activity'
  label: string
  status: SessionTimelineActivityStatus
  toolName?: string
  toolUseId?: string
}

export interface SessionTimelineActivityGroupEvent extends SessionTimelineEventBase {
  activities: SessionTimelineActivityEvent[]
  activityKind: 'explore'
  detail?: string
  kind: 'activity_group'
  label: string
  status: SessionTimelineActivityStatus
}

export interface SessionTimelineSignalEvent extends SessionTimelineEventBase {
  detail?: string
  details?: SessionTimelineActivityDetail[]
  kind: 'signal'
  label: string
  signalKind: SessionTimelineSignalKind
  status?: SessionTimelineActivityStatus
}

export type SessionTimelineEvent
  = | (SessionTimelineEventBase & { detail?: string, kind: 'status', label: string })
    | (SessionTimelineEventBase & { kind: 'text', text: string })
    | (SessionTimelineEventBase & { kind: 'thinking', text: string })
    | (SessionTimelineEventBase & { input: unknown, kind: 'tool_use', name: string, toolUseId: string })
    | (SessionTimelineEventBase & { content: string, isError?: boolean, kind: 'tool_result', name?: string, toolUseId: string })
    | SessionTimelineActivityEvent
    | SessionTimelineActivityGroupEvent
    | SessionTimelineSignalEvent
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

export interface NormalizeSessionEventsOptions {
  parser?: SessionTimelineParser
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

export function isSessionAttachmentImage(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type.startsWith('image/') || /\.(?:avif|gif|jpe?g|png|webp)$/i.test(file.name)
}

export function normalizeSessionEvents(events: SessionTimelineEventInput[], options: NormalizeSessionEventsOptions = {}): SessionTimelineEvent[] {
  return events
    .slice()
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .map(event => coerceTimelineEvent(event, options))
}

export function summarizeSessionUsage(events: SessionTimelineEvent[]): SessionTimelineUsageSummary | null {
  let usage: Extract<SessionTimelineEvent, { kind: 'usage' }> | null = null
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.kind === 'usage') {
      usage = event
      break
    }
  }
  if (!usage)
    return null

  return {
    costUsd: usage.costUsd,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  }
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

function coerceTimelineEvent(event: SessionTimelineEventInput, options: NormalizeSessionEventsOptions): SessionTimelineEvent {
  const id = String(event.id)
  const payload = isRecord(event.payloadJson) ? event.payloadJson : {}
  const agentEvent = isRecord(payload.agentEvent) ? payload.agentEvent : null
  const base = { id, turnId: event.turnId }

  if (agentEvent && typeof agentEvent.kind === 'string') {
    const kind = agentEvent.kind
    if (kind === 'status') {
      if (options.parser === 'codex-cli' && readString(agentEvent.label) === 'file_change')
        return createFileActivity(base, readString(agentEvent.detail), readString(agentEvent.status))
      if (options.parser === 'codex-cli')
        return createCodexStatusSignal(base, agentEvent, event.type)
      return { ...base, detail: readString(agentEvent.detail), kind, label: readString(agentEvent.label, event.type) }
    }
    if (kind === 'text')
      return { ...base, kind, text: readString(agentEvent.text) }
    if (kind === 'thinking')
      return { ...base, kind, text: readString(agentEvent.text) }
    if (kind === 'log')
      return { ...base, chunk: readString(agentEvent.chunk), kind, stream: agentEvent.stream === 'stderr' ? 'stderr' : 'stdout' }
    if (kind === 'tool_use') {
      if (options.parser === 'codex-cli')
        return createCodexToolActivity(base, agentEvent)
      return { ...base, input: agentEvent.input, kind, name: readString(agentEvent.name, 'Tool'), toolUseId: readString(agentEvent.id, id) }
    }
    if (kind === 'tool_result') {
      if (options.parser === 'codex-cli')
        return createCodexToolResultActivity(base, agentEvent)
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
  if (event.type === 'artifact') {
    if (options.parser === 'codex-cli')
      return createOutputSignal(base, 'Artifact ready', readString(payload.path ?? payload.artifactId, 'artifact'), 'artifact')
    return { ...base, detail: readString(payload.path ?? payload.artifactId, 'artifact'), kind: 'artifact' }
  }
  if (event.type === 'review') {
    if (options.parser === 'codex-cli')
      return createOutputSignal(base, 'Review ready', readString(payload.verdict ?? payload.reviewId, 'review'), 'review')
    return { ...base, detail: readString(payload.verdict ?? payload.reviewId, 'review'), kind: 'review' }
  }
  if (event.type === 'lesson') {
    if (options.parser === 'codex-cli')
      return createOutputSignal(base, 'Lesson candidate', readString(payload.lessonId, 'memory candidate'), 'lesson')
    return { ...base, detail: readString(payload.lessonId, 'memory candidate'), kind: 'lesson' }
  }
  if (event.type === 'error')
    return { ...base, kind: 'error', message: readString(payload.message, 'Session turn failed.') }
  if (event.type === 'log')
    return { ...base, chunk: JSON.stringify(payload, null, 2), kind: 'log', stream: 'stdout' }
  if (event.type === 'status' && options.parser === 'codex-cli') {
    return createCodexStatusSignal(base, {
      detail: payload.detail ?? payload.status,
      label: payload.label ?? event.type,
      status: payload.status,
    }, event.type)
  }
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
    if (event.kind === 'activity' && last?.kind === 'activity' && event.toolUseId && last.toolUseId === event.toolUseId) {
      const mergedStatus = normalizeMergedActivityStatus(last, event)
      last.status = mergedStatus
      last.label = activityLabel(last.activityKind, mergedStatus)
      last.detail = last.detail || event.detail
      last.details = mergeActivityDetails(last.details, event.details)
      continue
    }
    if (event.kind === 'activity' && last?.kind === 'activity' && !event.toolUseId && !last.toolUseId && event.activityKind === last.activityKind && event.detail === last.detail) {
      const mergedStatus = normalizeMergedActivityStatus(last, event)
      last.status = mergedStatus
      last.label = activityLabel(last.activityKind, mergedStatus)
      last.details = mergeActivityDetails(last.details, event.details)
      continue
    }
    if (event.kind !== 'usage')
      compacted.push(event.kind === 'log' ? { ...event, chunk: truncateLog(event.chunk) } : event)
  }
  return groupExplorationActivity(compactSessionSignals(compacted))
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

function createCodexStatusSignal(base: SessionTimelineEventBase, event: Record<string, unknown>, fallbackLabel: string): SessionTimelineSignalEvent {
  const label = readString(event.label, fallbackLabel)
  const detail = readString(event.detail ?? event.status)
  const rawStatus = readString(event.status ?? event.detail ?? label)
  const normalizedStatus = normalizeSignalStatus(rawStatus)
  const lowerLabel = label.toLowerCase()
  const lowerDetail = detail.toLowerCase()

  if (lowerLabel === 'completed' || /\b(?:artifact|review|lesson|memory)\b/u.test(lowerDetail)) {
    return {
      ...base,
      detail,
      details: buildActivityDetails([
        ['Signal', label],
        ['Detail', detail],
      ]),
      kind: 'signal',
      label: detail ? 'Session output' : 'Session updated',
      signalKind: 'output',
      status: normalizedStatus ?? 'succeeded',
    }
  }

  return {
    ...base,
    detail: statusDetail(label, detail),
    details: buildActivityDetails([
      ['Signal', label],
      ['Detail', detail],
      ['Status', rawStatus === detail || rawStatus === label ? undefined : rawStatus],
    ]),
    kind: 'signal',
    label: statusSignalLabel(label, detail, normalizedStatus),
    signalKind: 'status',
    status: normalizedStatus,
  }
}

function createOutputSignal(base: SessionTimelineEventBase, label: string, detail: string, source: string): SessionTimelineSignalEvent {
  return {
    ...base,
    detail,
    details: buildActivityDetails([
      ['Source', source],
      ['Detail', detail],
    ]),
    kind: 'signal',
    label,
    signalKind: 'output',
    status: 'succeeded',
  }
}

function createCodexToolActivity(base: SessionTimelineEventBase, event: Record<string, unknown>): SessionTimelineActivityEvent {
  const input = isRecord(event.input) ? event.input : {}
  const command = unwrapShellCommand(readString(input.command))
  const classified = classifyCodexCommand(command)
  const toolName = readString(event.name, 'Tool')
  return {
    ...base,
    activityKind: classified.kind,
    command,
    detail: classified.detail,
    details: buildActivityDetails([
      ['Tool', toolName],
      ['Command', command],
      ['Input', command ? '' : stringifyDetail(input)],
    ]),
    kind: 'activity',
    label: activityLabel(classified.kind, 'running'),
    status: 'running',
    toolName,
    toolUseId: readString(event.id, base.id),
  }
}

function createCodexToolResultActivity(base: SessionTimelineEventBase, event: Record<string, unknown>): SessionTimelineActivityEvent {
  const isError = event.isError === true
  return {
    ...base,
    activityKind: 'command',
    details: buildActivityDetails([
      ['Output', truncateLog(readString(event.content))],
      ['Tool', readString(event.name)],
    ]),
    kind: 'activity',
    label: activityLabel('command', isError ? 'failed' : 'succeeded'),
    status: isError ? 'failed' : 'succeeded',
    toolName: readString(event.name),
    toolUseId: readString(event.id ?? event.toolUseId, base.id),
  }
}

function createFileActivity(base: SessionTimelineEventBase, detail: string, status: string): SessionTimelineActivityEvent {
  const normalizedStatus: SessionTimelineActivityStatus = status === 'failed' ? 'failed' : status === 'completed' ? 'succeeded' : 'running'
  const kind = classifyFileChange(detail)
  return {
    ...base,
    activityKind: kind,
    detail: detail.replace(/\s+\((?:completed|in_progress|failed)\)$/u, ''),
    kind: 'activity',
    label: activityLabel(kind, normalizedStatus),
    status: normalizedStatus,
  }
}

function classifyCodexCommand(command: string): { detail?: string, kind: SessionTimelineActivityKind } {
  const normalized = command.trim()
  const lower = normalized.toLowerCase()
  if (!normalized)
    return { kind: 'tool' }
  if (startsWithCommand(lower, ['rg', 'grep', 'ag']))
    return { detail: extractSearchQuery(normalized), kind: 'search' }
  if (startsWithCommand(lower, ['cat', 'head', 'nl', 'sed', 'tail']))
    return { detail: extractLastPath(normalized), kind: 'read' }
  if (startsWithCommand(lower, ['find', 'ls', 'tree']))
    return { detail: extractLastPath(normalized), kind: 'list' }
  if (startsWithCommand(lower, ['mkdir', 'touch']))
    return { detail: extractLastPath(normalized), kind: 'create' }
  if (startsWithCommand(lower, ['rm', 'rmdir']))
    return { detail: extractLastPath(normalized), kind: 'delete' }
  if (lower.includes('apply_patch') || startsWithCommand(lower, ['perl', 'ruby']))
    return { kind: 'edit' }
  if (/\b(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?(?:test|vitest|jest)\b/u.test(lower) || startsWithCommand(lower, ['pytest', 'vitest', 'jest']))
    return { kind: 'test' }
  if (/\b(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?lint\b/u.test(lower) || startsWithCommand(lower, ['eslint']))
    return { kind: 'lint' }
  if (/\b(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?(?:build|typecheck)\b/u.test(lower) || startsWithCommand(lower, ['tsc']))
    return { kind: 'build' }
  return { kind: 'command' }
}

function classifyFileChange(detail: string): SessionTimelineActivityKind {
  const lower = detail.toLowerCase()
  if (lower.startsWith('add ') || lower.startsWith('create '))
    return 'create'
  if (lower.startsWith('delete ') || lower.startsWith('remove '))
    return 'delete'
  return 'edit'
}

function activityLabel(kind: SessionTimelineActivityKind, status: SessionTimelineActivityStatus): string {
  const failed = status === 'failed'
  const running = status === 'running'
  if (kind === 'search')
    return failed ? 'Search failed' : running ? 'Searching files' : 'Searched files'
  if (kind === 'read')
    return failed ? 'Read failed' : running ? 'Reading file' : 'Read file'
  if (kind === 'list')
    return failed ? 'List failed' : running ? 'Listing files' : 'Listed files'
  if (kind === 'create')
    return failed ? 'Create failed' : running ? 'Creating file' : 'Created file'
  if (kind === 'delete')
    return failed ? 'Delete failed' : running ? 'Deleting file' : 'Deleted file'
  if (kind === 'edit')
    return failed ? 'Edit failed' : running ? 'Editing file' : 'Edited file'
  if (kind === 'test')
    return failed ? 'Tests failed' : running ? 'Running tests' : 'Ran tests'
  if (kind === 'lint')
    return failed ? 'Lint failed' : running ? 'Running lint' : 'Ran lint'
  if (kind === 'build')
    return failed ? 'Build failed' : running ? 'Building' : 'Built project'
  if (kind === 'file')
    return failed ? 'File update failed' : running ? 'Updating file' : 'Updated file'
  if (kind === 'tool')
    return failed ? 'Tool failed' : running ? 'Calling tool' : 'Called tool'
  if (kind === 'explore')
    return failed ? 'Exploration failed' : running ? 'Exploring files' : 'Explored files'
  return failed ? 'Command failed' : running ? 'Running command' : 'Ran command'
}

function groupExplorationActivity(events: SessionTimelineEvent[]): SessionTimelineEvent[] {
  const grouped: SessionTimelineEvent[] = []
  let buffer: SessionTimelineActivityEvent[] = []

  const flush = () => {
    if (buffer.length >= 3) {
      grouped.push({
        activities: buffer,
        activityKind: 'explore',
        detail: summarizeExploration(buffer),
        id: `activity-group-${buffer[0]?.id}`,
        kind: 'activity_group',
        label: 'Explored files',
        status: buffer.some(event => event.status === 'failed') ? 'failed' : 'succeeded',
        turnId: buffer[0]?.turnId,
      })
    }
    else {
      grouped.push(...buffer)
    }
    buffer = []
  }

  for (const event of events) {
    if (event.kind === 'activity' && event.status === 'succeeded' && ['list', 'read', 'search'].includes(event.activityKind)) {
      buffer.push(event)
      continue
    }
    flush()
    grouped.push(event)
  }
  flush()
  return grouped
}

function compactSessionSignals(events: SessionTimelineEvent[]): SessionTimelineEvent[] {
  const compacted: SessionTimelineEvent[] = []
  let statusBuffer: SessionTimelineSignalEvent[] = []
  let outputBuffer: SessionTimelineSignalEvent[] = []

  const flushStatus = () => {
    if (statusBuffer.length === 0)
      return
    const outputAlreadyVisible = compacted.some(event => event.kind === 'signal' && event.signalKind === 'output')
    const nextOutputPending = outputBuffer.length > 0
    const summary = summarizeStatusSignals(statusBuffer)
    statusBuffer = []
    if (summary.status === 'succeeded' && (outputAlreadyVisible || nextOutputPending))
      return
    compacted.push(summary)
  }

  const flushOutput = () => {
    if (outputBuffer.length === 0)
      return
    compacted.push(summarizeOutputSignals(outputBuffer))
    outputBuffer = []
  }

  for (const event of events) {
    if (event.kind === 'signal' && event.signalKind === 'status') {
      statusBuffer.push(event)
      continue
    }
    if (event.kind === 'signal' && event.signalKind === 'output') {
      flushStatus()
      outputBuffer.push(event)
      continue
    }
    flushStatus()
    flushOutput()
    compacted.push(event)
  }

  flushStatus()
  flushOutput()
  return compacted
}

function summarizeStatusSignals(events: SessionTimelineSignalEvent[]): SessionTimelineSignalEvent {
  const latest = events.at(-1)
  const status = latest?.status ?? findLast(events, event => Boolean(event.status))?.status
  const rawDetail = findLast(events, event => Boolean(event.detail))?.detail
  const detail = rawDetail && rawDetail.toLowerCase() !== status ? rawDetail : undefined
  return {
    detail,
    details: mergeSignalDetails(events),
    id: `signal-status-${events[0]?.id}`,
    kind: 'signal',
    label: status === 'failed' ? 'Session needs attention' : status === 'succeeded' ? 'Session succeeded' : 'Session running',
    signalKind: 'status',
    status,
    turnId: events[0]?.turnId,
  }
}

function summarizeOutputSignals(events: SessionTimelineSignalEvent[]): SessionTimelineSignalEvent {
  const artifactCount = events.filter(event => /artifact/i.test(`${event.label} ${event.detail ?? ''}`)).length
  const reviewCount = events.filter(event => /review/i.test(`${event.label} ${event.detail ?? ''}`)).length
  const lessonCount = events.filter(event => /lesson|memory/i.test(`${event.label} ${event.detail ?? ''}`)).length
  const detail = [
    artifactCount ? `${artifactCount} ${artifactCount === 1 ? 'artifact' : 'artifacts'}` : '',
    reviewCount ? `${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}` : '',
    lessonCount ? `${lessonCount} ${lessonCount === 1 ? 'lesson' : 'lessons'}` : '',
  ].filter(Boolean).join(', ')
  return {
    detail: detail || findLast(events, event => Boolean(event.detail))?.detail,
    details: mergeSignalDetails(events),
    id: `signal-output-${events[0]?.id}`,
    kind: 'signal',
    label: 'Session output',
    signalKind: 'output',
    status: events.some(event => event.status === 'failed') ? 'failed' : 'succeeded',
    turnId: events[0]?.turnId,
  }
}

function mergeSignalDetails(events: SessionTimelineSignalEvent[]): SessionTimelineActivityDetail[] | undefined {
  const details = events.flatMap((event) => {
    const own = event.details ?? []
    if (own.length > 0)
      return own.map(detail => ({ label: `${event.label} · ${detail.label}`, value: detail.value }))
    return event.detail ? [{ label: event.label, value: event.detail }] : []
  })
  return details.length > 0 ? details : undefined
}

function summarizeExploration(events: SessionTimelineActivityEvent[]): string {
  const reads = events.filter(event => event.activityKind === 'read').length
  const searches = events.filter(event => event.activityKind === 'search').length
  const lists = events.filter(event => event.activityKind === 'list').length
  return [
    reads ? `${reads} ${reads === 1 ? 'file read' : 'file reads'}` : '',
    searches ? `${searches} ${searches === 1 ? 'search' : 'searches'}` : '',
    lists ? `${lists} ${lists === 1 ? 'list' : 'lists'}` : '',
  ].filter(Boolean).join(', ')
}

function normalizeSignalStatus(value: string): SessionTimelineActivityStatus | undefined {
  const lower = value.toLowerCase()
  if (/\b(?:fail|failed|error)\b/u.test(lower))
    return 'failed'
  if (/\b(?:complete|completed|done|pass|succeed|succeeded|success)\b/u.test(lower))
    return 'succeeded'
  if (/\b(?:initializing|running|pending|start|starting|streaming)\b/u.test(lower))
    return 'running'
  return undefined
}

function statusSignalLabel(label: string, detail: string, status?: SessionTimelineActivityStatus): string {
  const lowerLabel = label.toLowerCase()
  const lowerDetail = detail.toLowerCase()
  if (status === 'failed')
    return 'Session needs attention'
  if (status === 'succeeded')
    return 'Session succeeded'
  if (lowerLabel.includes('initializing') || lowerDetail.includes('initializing'))
    return 'Starting engine'
  if (status === 'running')
    return 'Session running'
  return 'Session status'
}

function statusDetail(label: string, detail: string): string | undefined {
  const lowerLabel = label.toLowerCase()
  const lowerDetail = detail.toLowerCase()
  if (!detail)
    return lowerLabel === 'status' ? undefined : label
  if (lowerLabel === 'status' || lowerLabel === lowerDetail)
    return detail
  return `${label} · ${detail}`
}

function startsWithCommand(command: string, names: string[]): boolean {
  return names.some(name => command === name || command.startsWith(`${name} `) || command.startsWith(`${name}\t`))
}

function extractSearchQuery(command: string): string | undefined {
  const quoted = command.match(/["']([^"']{1,80})["']/u)
  if (quoted?.[1])
    return quoted[1]
  const parts = command.split(/\s+/u).filter(part => part && !part.startsWith('-'))
  return parts[1]?.slice(0, 80)
}

function extractLastPath(command: string): string | undefined {
  const parts = command.split(/\s+/u).filter(part => part && !part.startsWith('-'))
  return parts.at(-1)?.replace(/^["']|["']$/gu, '').slice(0, 120)
}

function unwrapShellCommand(command: string): string {
  const match = command.match(/^(?:\/bin\/)?(?:zsh|bash|sh)\s+-lc\s+(['"])([\s\S]*)\1$/u)
  return (match?.[2] ?? command).trim()
}

function buildActivityDetails(entries: Array<[string, string | undefined]>): SessionTimelineActivityDetail[] | undefined {
  const details = entries
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([label, value]) => ({ label, value }))
  return details.length > 0 ? details : undefined
}

function mergeActivityDetails(
  current?: SessionTimelineActivityDetail[],
  next?: SessionTimelineActivityDetail[],
): SessionTimelineActivityDetail[] | undefined {
  const merged = [...(current ?? []), ...(next ?? [])]
  return merged.length > 0 ? merged : undefined
}

function normalizeMergedActivityStatus(
  current: SessionTimelineActivityEvent,
  next: SessionTimelineActivityEvent,
): SessionTimelineActivityStatus {
  if (current.activityKind === 'search' && next.status === 'failed' && !next.details?.some(detail => detail.label === 'Output' && detail.value.trim()))
    return 'succeeded'
  return next.status
}

function stringifyDetail(value: unknown): string {
  if (typeof value === 'string')
    return truncateLog(value)
  if (value == null)
    return ''
  try {
    return truncateLog(JSON.stringify(value, null, 2))
  }
  catch {
    return String(value)
  }
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

function findLast<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]!
    if (predicate(item))
      return item
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
